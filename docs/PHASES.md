# Implementation Phases

A phased plan executed across PRs against `main`, in five sequenced phases. The commit-by-commit history is in `git log`; this document gives the strategic view.

---

## Phase A — Foundation

Foundation work before any of the brief's six tasks, so feature work could land with minimal review friction:

- CI pipeline running lint, typecheck (across `src/` + `tests/` + `migrations/`), schema-migration drift check, and tests on every PR.
- Vitest + swc test infrastructure with reusable factories: `makeTask`, `makeWorkflow`, `createTestDataSource`.
- Pino structured logging with per-request child loggers via `pino-http`.
- Entity model: `AbstractBaseEntity` (id, createdAt, updatedAt), `Workflow` (clientId, geoJson), `Task` (type, status, output discriminated union, attemptCount, nextAttemptAt, errorHistory).
- Workflow status derived from task statuses via `deriveWorkflowStatus` — not stored.
- Repository layer via TypeORM's `Repository.extend()` factory pattern.
- Jobs as plain functions injected into the worker constructor; no class hierarchy.
- `TaskWorker` class encapsulating the loop with explicit `start` / `stop` / `processNext` API.
- Retry/backoff with full-jitter, exponential growth, 5-minute cap; per-attempt `errorHistory`; boot-time `requeueInterrupted` for crash recovery.
- Zod validation at the YAML and HTTP boundaries.

---

## Phase B — The six brief tasks

Numbered per the original brief in [`CHALLENGE.md`](../CHALLENGE.md). Each landed as its own PR with tests:

1. **`PolygonAreaJob`** — `@turf/area` on `task.workflow.geoJson`. Plain function in `src/workers/jobs/`; new `polygon_area` variant on the `TaskType` and `TaskOutput` discriminated unions.
2. **`ReportGenerationJob`** — aggregates outputs of declared dependencies into a structured report; failures are carried alongside successes.
3. **Interdependent tasks** — `dependsOn` in YAML, many-to-many `dependencies: Task[]` on the entity backed by a `task_dependencies` join table. The worker query is gated on every dependency being in a terminal state.
4. **`Workflow.finalResult`** — aggregate of all task outputs, computed by an idempotent finalizer callback the worker invokes after every terminal task save.
5. **`GET /workflow/:id/status`** — derived status plus task counts. 404 on unknown id, 400 on non-UUID id.
6. **`GET /workflow/:id/results`** — gated on `finalResult` being populated. 400 if not yet finalized.

Brief numbering kept canonical so the PR history reads as a clean #1 → #6 narrative.

---

## Phase C — Production-shape items, deferred to v2

Items deliberately outside v1's scope; full v2 design in [`ARCHITECTURE_v2.md`](../ARCHITECTURE_v2.md):

- Central error-handler middleware translating `ZodError → 400` and domain errors to typed responses.
- Multi-worker with `claimedBy` / `claimedUntil` lease columns and atomic `FOR UPDATE SKIP LOCKED` pickup.
- Outbox pattern for at-least-once side effects.
- Postgres migration for the concurrency primitives the multi-worker design depends on, plus indexable `jsonb`.
- JWT authentication with multi-tenant authorization via `clientId`.
- Selective `Result<T, E>` at service boundaries.
- Idempotency-Key header on `POST /analysis`.
- DLQ rescue endpoint for retry-exhausted tasks.

---

## Phase D — Test strategy

Coverage strategy: test behaviour worth verifying, not every layer. Final count: **94 tests.**

- **Unit tests** for pure logic — retry/backoff state machine, report builder, finalResult builder, workflow status derivation, cycle detection, job logic. No DB, no fakes.
- **Integration tests** against in-memory SQLite with the real repositories and the real worker loop. Routes are exercised through `supertest`.
- **No domain entity is mocked anywhere.** A small number of integration tests inject test handlers in place of real job functions to isolate worker-loop concerns from the jobs' geo logic.

---

## Phase E — Submission documentation

- Project README with quickstart, API table, design decisions, and the v2 roadmap pointer.
- Original brief preserved verbatim at [`CHALLENGE.md`](../CHALLENGE.md).
- Production roadmap at [`ARCHITECTURE_v2.md`](../ARCHITECTURE_v2.md).
- Reusable engineering principles and AI-collaboration practices in [`.claude/skills/principal-developer/`](../.claude/skills/principal-developer/) — surfaced so a reviewer can see the standards that informed every PR.
