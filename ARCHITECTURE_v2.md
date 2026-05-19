# Architecture v2 — Roadmap

What the workflow engine would look like to run in production at meaningful scale. Deliberately **written-only** — none of this is implemented in v1. Each section names a v1 boundary, sketches the production shape, and outlines a migration path that lets the work land incrementally rather than as a single big-bang rewrite.

---

## 1. Multi-worker with leases

**Gap.** A single worker is a single point of failure and a hard ceiling on throughput. Two workers polling the same DB today would race for the same task — the `findNextRunnable` read and the `status = 'in_progress'` write are not atomic.

**Shape.** Add `claimedBy: string | null` and `claimedUntil: Date | null` columns on `Task`. Replace the read-then-update pickup with an atomic claim that uses Postgres's `FOR UPDATE SKIP LOCKED` so concurrent workers see disjoint candidate rows:

```sql
UPDATE tasks SET status = 'in_progress', claimed_by = $worker, claimed_until = NOW() + INTERVAL '30s'
 WHERE id = (
   SELECT id FROM tasks WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     AND NOT EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks d ON d.id = td.depends_on_task_id
                      WHERE td.task_id = tasks.id AND d.status NOT IN ('completed','failed'))
   ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
 ) RETURNING *;
```

Workers heartbeat the lease every ~10s. A janitor sweeps `claimed_until < now() AND status = 'in_progress'` back to `queued` to recover from crashed workers. The existing `requeueInterrupted` boot step becomes the special case for "a single worker just restarted."

**Migration path.** Add columns nullable → switch the worker to the `SKIP LOCKED` form behind a `singleton: true` flag → add the janitor → load-test → flip the flag.

---

## 2. Outbox pattern for at-least-once side effects

**Gap.** `notification` is a no-op today. In production it sends an email or hits a webhook. Doing that inline in the handler is broken either way: send-then-save can drop the save and re-deliver; save-then-send can drop the send and never deliver.

**Shape.** An `outbox_events` table written in the same transaction as the task state change. A separate publisher loop reads pending rows with `SKIP LOCKED`, performs the side effect, marks them `published` (or escalates to `failed` after N attempts).

```ts
await dataSource.transaction(async (tx) => {
  await tx.save(task);
  if (outcome.kind === 'success') {
    await tx.save(OutboxEvent, { eventType: 'task.completed', payload: { taskId: task.id, output: task.output } });
  }
});
```

**Migration path.** Add the table and a no-op publisher first (it just marks rows `published`). Move side effects into the publisher one event type at a time. `runNotification` is already a separate handler with no current side effects — exactly to make this drop-in.

---

## 3. Postgres migration

**Gap.** SQLite supports a single writer at a time and lacks the concurrency primitives (`FOR UPDATE SKIP LOCKED`, advisory locks) that the multi-worker design in §1 depends on. It also lacks indexable JSON, so `Task.output->>'country'` style queries would require a separate column. Postgres unlocks all three plus operational tooling (PITR, streaming replication, connection pooling).

**What changes.** Driver swap in `data-source.ts`; TypeORM regenerates migrations with native `ALTER TABLE` instead of the SQLite temp-table pattern; `simple-json` columns become `jsonb` so payload queries become indexable; the SQLite text-datetime normalisation in the data-migration runner goes away.

**Migration path.** Cutover via `pg_dump` / `pg_restore` during a low-traffic window. Dual-write is more engineering than it's worth unless zero-downtime is mandatory.

---

## 4. Authentication & multi-tenant authorization

**Gap.** The API is currently unauthenticated. Any caller can create or read any workflow, and there is no tenant boundary on lookups despite `Workflow.clientId` existing on the entity.

**Shape.** JWT bearer tokens validated by middleware that populates `req.auth = { userId, clientId }`. Authorization at the boundary of each endpoint: `if (workflow.clientId !== req.auth.clientId) return 404`. **404 not 403** — a 403 leaks that the resource exists.

`Workflow.clientId` is already on the entity — we just don't enforce it. The query layer would gain `where: { id, clientId }` everywhere.

**Migration path.** Add the middleware behind a feature flag that allows `req.auth = null` through. Backfill login/refresh endpoints. Flip the flag once clients are migrated.

---

## 5. Central error-handler middleware

**Gap.** Every route has its own `try/catch` returning 500 with a string message. Three concrete bugs:

1. `POST /analysis` returns 500 on a `WorkflowService` throw whose root cause might be a 400 (zod, validation). The route can't tell the difference.
2. Error body shapes are inconsistent (`{ message }` vs `{ message, issues }`).
3. No request ID in responses — operators looking at a customer's 500 grep timestamps.

**Shape.** A 4-arg Express error-handler middleware that translates `ZodError → 400`, `DomainError → typed status + code + requestId`, anything else → 500 with `{ code: 'internal_error', requestId }`. Routes drop their `try/catch` and use an async wrapper so thrown errors reach the middleware.

**Migration path.** Land the middleware and async wrapper alongside the existing `try/catch`. Convert routes one at a time, deleting their `try/catch`. Existing 500 tests become 400 tests as `ZodError` is translated.

---

## 6. `Result<T, E>` at selected domain boundaries

**Gap.** Per the engineering principles, expected failures should be data, not exceptions. The codebase currently throws for zod failures, unknown deps, and missing workflows. Applying `Result` everywhere is invasive; applying it selectively at the service boundary is the high-value move.

**Shape.** `WorkflowService.createFromYaml` returns `Result<Workflow, ZodError | YamlParseError | DependencyValidationError>`. The route pattern-matches and maps to the right HTTP status. Pure functions (`buildReport`, `applyTaskOutcome`) already operate on values and don't need wrapping. Route handlers stay throw-based and rely on §5's middleware.

**Migration path.** Bottom-up, one method at a time, starting with `WorkflowService`.

---

## 7. Idempotency-Key header on `POST /analysis`

**Gap.** A retried POST (LB retry, client retry, double-click) currently creates a duplicate workflow.

**Shape.** Client sends `Idempotency-Key: <uuid>` with each request. Server stores `(key, workflow_id, response_body, expires_at)` in a small table with a 24h TTL. A duplicate key within the TTL returns the cached response without re-running `createFromYaml`.

**Migration path.** Behind a header presence check — clients that don't send the header keep current behaviour. Background job GCs expired records.

---

## 8. DLQ rescue endpoint

**Gap.** Tasks whose retries are exhausted (`status = 'failed'`, `attemptCount > MAX_TASK_RETRIES`) sit in the DB forever with no operational tool to list, inspect, or retry them once the root cause is fixed.

**Shape.** State-only DLQ — no separate table. `GET /admin/dead-tasks` paginates exhausted-failed tasks with their `errorHistory` inline. `POST /admin/dead-tasks/:id/retry` resets `status = 'queued'`, clears `nextAttemptAt` and `errorHistory`, keeps `attemptCount` for audit. Behind admin auth (§4); dependency-readiness checks apply on retry.

**Migration path.** One PR after auth is in place.

---

## 9. Rollout order

| Order | Item | Why this order |
|---|---|---|
| 1 | Central error-handler middleware (§5) | Unblocks correct 400s and unifies error bodies; cheap |
| 2 | Postgres migration (§3) | Unblocks `SKIP LOCKED` and `jsonb`; cutover during a low-traffic window |
| 3 | Multi-worker with leases (§1) | The throughput unlock; needs Postgres |
| 4 | Outbox pattern (§2) | The correctness unlock for side effects; needs Postgres for the publisher's `SKIP LOCKED` |
| 5 | Auth (§4) | Required before admin endpoints |
| 6 | Idempotency (§7), DLQ (§8) | Quality-of-life; ship as time permits |
| 7 | `Result<T, E>` (§6) | Selective; revisit per-module as you touch them |

§3 + §1 + §2 together are roughly a quarter of focused work. §5 and §7 are days each.
