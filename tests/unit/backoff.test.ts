import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeNextAttemptAt } from '../../src/workers/backoff';

const ONE_SECOND_MS = 1_000;
const FIVE_MINUTES_MS = 5 * 60 * 1_000;

describe('computeNextAttemptAt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always returns a date in the future', () => {
    const now = new Date('2026-05-15T12:00:00Z');
    for (let attempt = 1; attempt <= 10; attempt++) {
      const next = computeNextAttemptAt(attempt, now);
      expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it('bounds the delay to base * 2^(attemptCount - 1) on attempt 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const now = new Date('2026-05-15T12:00:00Z');
    const next = computeNextAttemptAt(1, now);
    // base 1s, attempt 1 -> 1s * 2^0 = 1s. With Math.random()=1, jitter pushes to exactly 1s.
    expect(next.getTime() - now.getTime()).toBe(ONE_SECOND_MS);
  });

  it('grows exponentially up to the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const now = new Date('2026-05-15T12:00:00Z');
    // attempt 1 -> 1s, attempt 2 -> 2s, attempt 3 -> 4s, attempt 10 -> capped to 5min.
    expect(computeNextAttemptAt(2, now).getTime() - now.getTime()).toBe(2 * ONE_SECOND_MS);
    expect(computeNextAttemptAt(3, now).getTime() - now.getTime()).toBe(4 * ONE_SECOND_MS);
    expect(computeNextAttemptAt(20, now).getTime() - now.getTime()).toBe(FIVE_MINUTES_MS);
  });

  it('applies full jitter (delay can be 0 when random returns 0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const now = new Date('2026-05-15T12:00:00Z');
    const next = computeNextAttemptAt(5, now);
    expect(next.getTime()).toBe(now.getTime());
  });
});
