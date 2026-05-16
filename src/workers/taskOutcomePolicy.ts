import type { Task, TaskOutput } from '../entities';

export const BACKOFF_BASE_DELAY_MS = 1_000;
export const BACKOFF_CAP_DELAY_MS = 5 * 60 * 1_000;

export type TaskOutcome =
  | { kind: 'success'; output: TaskOutput }
  | { kind: 'failure'; error: Error };

export interface ApplyTaskOutcomeInput {
  readonly task: Task;
  readonly outcome: TaskOutcome;
  readonly now: Date;
  readonly maxRetries: number;
  readonly randomFraction: number;
}

export interface ApplyTaskOutcomeResult {
  readonly exhausted: boolean;
}

/**
 * Pure state transition for the retry/result lifecycle of a task. Mutates the
 * task in place so the caller can persist the same entity instance — creating
 * a new Task would break TypeORM identity tracking.
 */
export function applyTaskOutcome({
  task,
  outcome,
  now,
  maxRetries,
  randomFraction,
}: ApplyTaskOutcomeInput): ApplyTaskOutcomeResult {
  if (outcome.kind === 'success') {
    task.output = outcome.output;
    task.status = 'completed';
    task.nextAttemptAt = null;
    return { exhausted: false };
  }

  task.errorHistory = [
    ...task.errorHistory,
    { attemptedAt: now.toISOString(), error: outcome.error.message },
  ];

  const totalAllowedAttempts = maxRetries + 1;
  if (task.attemptCount >= totalAllowedAttempts) {
    task.status = 'failed';
    task.nextAttemptAt = null;
    return { exhausted: true };
  }

  task.status = 'queued';
  task.nextAttemptAt = computeNextAttemptAt(task.attemptCount, now, randomFraction);
  return { exhausted: false };
}

/**
 * Exponential backoff with full jitter: returns a time uniformly random in
 * [now, now + min(cap, base * 2^(attemptCount - 1))]. Full jitter spreads load
 * when many tasks fail simultaneously. `randomFraction` must be in [0, 1).
 */
export function computeNextAttemptAt(
  attemptCount: number,
  now: Date,
  randomFraction: number,
): Date {
  const exponentialDelay = BACKOFF_BASE_DELAY_MS * 2 ** (attemptCount - 1);
  const cappedDelay = Math.min(exponentialDelay, BACKOFF_CAP_DELAY_MS);
  const jitteredDelay = randomFraction * cappedDelay;
  return new Date(now.getTime() + jitteredDelay);
}
