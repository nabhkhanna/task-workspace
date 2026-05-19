# Workflow Engine — osapiens Backend Coding Challenge

A TypeScript backend that runs YAML-defined workflows of tasks (geo-analysis, polygon area, notification, report generation) against GeoJSON input. Tasks form a DAG: independent steps run in any order, dependent steps wait for their dependencies to reach a terminal state.

The original challenge brief is preserved at [`CHALLENGE.md`](./CHALLENGE.md). The production roadmap (multi-worker leases, outbox, Postgres, auth) lives at [`ARCHITECTURE_v2.md`](./ARCHITECTURE_v2.md).

**Stack:** Node 22, TypeScript (strict), Express 4, TypeORM 0.3, SQLite, `@turf/turf`, `js-yaml`, zod, pino, Vitest, Biome.

> ### A note on "we"
>
> "We" throughout this document is me (Nabh) pair-programming with Claude (Anthropic). I authored every commit and made every judgment call — the DAG-over-singular-dependency choice, the schema-vs-data-migration separation, the type-ownership-per-entity rule, what to push back on, what to ship. Claude contributed design exploration, draft code, and test scaffolding, all surfaced as proposals and reshaped through conversation before landing.

---

## Quickstart

```bash
npm install
npm start                    # runs migrations, then http://localhost:3000

# create a workflow
curl -X POST http://localhost:3000/analysis \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"demo","geoJson":{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[10.4,51.1],[10.5,51.1],[10.5,51.2],[10.4,51.2],[10.4,51.1]]]},"properties":{}}}'

# poll then fetch results
curl http://localhost:3000/workflow/<id>/status
curl http://localhost:3000/workflow/<id>/results
```

`npm test` runs the suite (94 tests). `npm run lint` and `npm run format:fix` use Biome.

---

## API

| Endpoint | Success | Failure |
|---|---|---|
| `POST /analysis` | `202 { workflowId, message }` | `400 { message, issues }` (invalid request body) · `500 { message }` (server-side failure during workflow creation: YAML, DB) |
| `GET /workflow/:id/status` | `200 { workflowId, status, completedTasks, totalTasks }` where `status ∈ {initial, in_progress, completed, failed}` | `404` unknown id · `400` non-UUID id |
| `GET /workflow/:id/results` | `200 { workflowId, status, finalResult }` where `finalResult = { workflowId, tasks: [{taskId, type, output, error?}], finalReport }` | `404` unknown id · `400` not yet finalized OR non-UUID id |
| `GET /health` | `200 { status: "ok" }` (DB ping passed) | `503 { status: "unavailable" }` |

---

## How it works

HTTP routes (Express 4) accept a request, validate it with zod, and hand a `WorkflowService` the parsed input. The service reads `src/workflows/example_workflow.yml`, validates the definition (zod schema + cycle/duplicate/unknown-dep checks), and persists one `Workflow` row plus N `Task` rows wired via a `task_dependencies` join table.

A background `TaskWorker` (same process, started in `src/index.ts`) polls for the next runnable task — `queued` with backoff elapsed and every dependency in a terminal state — runs the handler, applies the retry/backoff state transition via the pure `applyTaskOutcome`, persists, and invokes `onTaskCompleted` after every terminal save. The composition root wires `finalizeWorkflow` into that callback; the finalizer writes `Workflow.finalResult` exactly once, when every task is terminal.

The example workflow exercises a fan-in DAG:

```yaml
- taskType: "analysis"
- taskType: "polygon_area"
- taskType: "report_generation"
  dependsOn: ["analysis", "polygon_area"]
- taskType: "notification"
  dependsOn: ["report_generation"]
```

`analysis` and `polygon_area` are independent. `report_generation` waits for both. `notification` waits for the report.

### Entities

- **`Workflow`** — `clientId`, `geoJson`, `finalResult` (nullable structured aggregate). Status is **derived**, not stored.
- **`Task`** — `type`, `status`, `output` (discriminated union per type), `attemptCount`, `nextAttemptAt`, `errorHistory`, `workflow` (ManyToOne), `dependencies` (ManyToMany self-relation via `task_dependencies`).
- **`AbstractBaseEntity`** — `id` (uuid), `createdAt`, `updatedAt`. Both entities extend.

---

## Design decisions

Eight calls worth explaining. Most are deviations from the brief's literal wording; each is documented so a reviewer can see the reasoning.

### Jobs are functions, not classes

The brief asks for a `Job` interface implemented per class. With four jobs and no shared lifecycle, a class hierarchy is ceremony. The contract is `type JobFn = (task: Task) => Promise<TaskOutput>` and lives in `src/workers/jobs/`. Same idea, less indirection.

### `Result` is merged into `Task.output`; `Workflow.status` is derived

The brief implies separate `Result` and `WorkflowStatus` columns. We made `Task.output` a `simple-json` column holding a discriminated union by task type, and derive workflow status from task statuses via `deriveWorkflowStatus(tasks)`. Single source of truth in both cases. Eliminates a whole class of "status column says completed but tasks say in_progress" reconciliation bugs.

### Dependencies are many-to-many, not a single field; `stepNumber` removed

The brief says "a `dependency` field that references another task" (singular). `report_generation` legitimately depends on BOTH `analysis` AND `polygon_area`, which a singular dependency can't express. Implemented as a `Task[]` self-relation with a `task_dependencies` join table. `stepNumber` was dropped in the same migration — once `dependsOn` is the source of truth, a second ordering system can only disagree. FIFO `createdAt` is the tiebreaker among ready tasks.

### `failed` is terminal for dependency purposes

A dependent task runs even if its dependency failed; it can inspect `dependency.output` (null) and `dependency.errorHistory`. So `report_generation` still produces a report — including the failure information — when `polygon_area` failed. This matches the brief's task #2 requirement to "include error information in the report." In production I would propagate failure as an explicit `skipped` state on dependents (see ARCHITECTURE_v2).

### Workflow finalization waits for *every* task to be terminal

Earlier `deriveWorkflowStatus` returned `failed` the moment any task failed. That signal then locked in `finalResult` with `output: null` for siblings still running, with the `finalResult !== null` short-circuit blocking any later correction. The fix tightens the status derivation to require every task in a terminal state before returning a terminal status. `GET /status` reports `in_progress` while a failed task coexists with non-terminal siblings; counters keep progress visible.

### Invalid GeoJSON is rejected at the HTTP boundary, not at the worker

Structurally malformed geoJson (missing geometry, wrong type, non-Feature) is rejected by zod in `analysisRoutes.ts` and the request returns 400 with the zod issues. No workflow row is created — bad input is workflow garbage, not a "task that failed." Structurally valid but geometrically degenerate input passes the boundary; if `@turf/area` throws, the worker's retry/backoff path marks the task `failed` with the error in `errorHistory`, which is the DB-level audit trail the brief implies.

### `/results` gates on `finalResult !== null`, not on derived status

The brief says "400 if the workflow is not yet completed." We interpret "completed" via the data: `finalResult` is the signal the finalizer uses to mark "aggregate results available." Gating on the column directly means failed workflows return 200 (their finalResult includes failure info — useful to clients), and a terminal-but-not-yet-finalized workflow honestly returns 400 instead of returning `finalResult: null`.

### Schema migrations and data migrations are strictly separated

**Why use migrations at all on a greenfield take-home?** Even greenfield code lands somewhere shared — CI, a teammate's laptop, eventually production. The moment that "somewhere" exists, schema changes need to be reproducible and ordered, and `synchronize: true` becomes a footgun (works for one dev, breaks the moment two engineers touch entities in parallel or the DB has data anyone cares about). Migrations are the contract; the CI drift check (`.github/workflows/ci.yml`) enforces it on every PR.

**On the "table rebuild" pattern:** several SQLite migrations look destructive because SQLite doesn't support `ALTER TABLE DROP COLUMN`. TypeORM's emitted pattern — create temp table, copy rows, drop, rename — is the standard SQLite workaround. Postgres would emit plain `ALTER`.

**Why include a data-migration backfill script when there's no production data?** To demonstrate the pattern. Schema migrations live in `migrations/` (idempotent, run on every deploy). Data migrations live in `scripts/migrations/<date>-<name>.ts` (one-shot, interactive via `npm run script:migrate-db`). The included backfill is **time-bounded** (only touches rows created before its schema migration) and **inlines its aggregation logic** rather than importing from `src/services/` — so a future change to `buildFinalResult` won't silently mutate what the backfill produces. The script is frozen at authorship time.

---

## Environment

Parsed once at boot in `src/config/index.ts` via zod. `process.env` is forbidden elsewhere (Biome).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` · `production` · `test` |
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` · `fatal` |
| `DB_PATH` | `data/database.sqlite` | SQLite file path |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Hard timeout for graceful shutdown |
| `MAX_TASK_RETRIES` | `3` | Total attempts permitted per task = `MAX_TASK_RETRIES + 1` |

---

## Testing

```bash
npm test              # 94 tests
npm run test:coverage # vitest with v8 coverage
```

- `tests/unit/` — pure logic (retry/backoff state machine, report builder, finalResult builder, workflow status derivation, cycle detection, job logic). No DB, no fakes.
- `tests/integration/` — real in-memory SQLite, real repositories, real worker loop. Routes are exercised through `supertest`.

No domain entity is mocked anywhere. A small number of integration tests inject test handlers in place of real job functions to isolate worker-loop concerns from the jobs' geo logic.

---

## v1 boundaries and v2 roadmap

Items outside v1's scope, with the v2 design in [`ARCHITECTURE_v2.md`](./ARCHITECTURE_v2.md):

- **Authentication** — the API is currently unauthenticated; multi-tenant JWT with `clientId`-scoped lookups is the v2 design.
- **Multi-worker** — v1 runs a single worker. v2 adds lease columns (`claimedBy`, `claimedUntil`) and atomic pickup via `FOR UPDATE SKIP LOCKED`.
- **Central error-handler middleware** — v1 uses per-handler try/catch. v2 routes throw and a single middleware translates `ZodError → 400`, domain errors to typed responses, and attaches a request ID.
- **Postgres** — for the concurrency primitives (`FOR UPDATE SKIP LOCKED`, advisory locks) the multi-worker design depends on, and indexable `jsonb` for payload queries.
- **Idempotency-Key header on `POST /analysis`** — for at-least-once HTTP retry semantics.
- **DLQ rescue endpoint** — list and re-queue tasks whose retries are exhausted.

---

## Repo conventions

Conventional Commits. One branch per logical change. CI must pass before merge. Biome enforces format and lint, including the no-`process.env`-outside-config rule. Pre-commit hook runs `lint-staged`.
