const BASE_DELAY_MS = 1_000;
const CAP_DELAY_MS = 5 * 60 * 1_000;

/**
 * Exponential backoff with full jitter (AWS recommendation): the next attempt
 * is scheduled at a uniformly random point between now and `min(cap, base * 2^(attemptCount - 1))`.
 *
 * Full jitter spreads load when many tasks fail simultaneously, unlike fixed
 * or "equal jitter" which can cause thundering-herd retries.
 *
 * `attemptCount` is the number of attempts already made (>= 1 when this is called,
 * since failure implies at least one attempt happened).
 */
export function computeNextAttemptAt(attemptCount: number, now: Date = new Date()): Date {
  const exponentialDelay = BASE_DELAY_MS * 2 ** (attemptCount - 1);
  const cappedDelay = Math.min(exponentialDelay, CAP_DELAY_MS);
  const jitteredDelay = Math.random() * cappedDelay;
  return new Date(now.getTime() + jitteredDelay);
}
