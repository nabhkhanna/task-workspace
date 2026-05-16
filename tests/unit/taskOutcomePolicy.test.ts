import { describe, expect, it } from 'vitest';
import {
  applyTaskOutcome,
  BACKOFF_BASE_DELAY_MS,
  BACKOFF_CAP_DELAY_MS,
  computeNextAttemptAt,
  type TaskOutcome,
} from '../../src/workers/taskOutcomePolicy';
import { makeTask } from '../_helpers';

const FIXED_NOW = new Date('2026-05-16T12:00:00.000Z');
const SUCCESS_OUTPUT = { type: 'analysis', country: 'Germany' } as const;
const SUCCESS: TaskOutcome = { kind: 'success', output: SUCCESS_OUTPUT };
const FAILURE: TaskOutcome = { kind: 'failure', error: new Error('boom') };

describe('applyTaskOutcome — success', () => {
  it('marks task completed, stores output, and clears nextAttemptAt', () => {
    const task = makeTask({
      status: 'in_progress',
      attemptCount: 1,
      nextAttemptAt: new Date('2026-05-16T11:59:00.000Z'),
    });

    const { exhausted } = applyTaskOutcome({
      task,
      outcome: SUCCESS,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(exhausted).toBe(false);
    expect(task.status).toBe('completed');
    expect(task.output).toEqual(SUCCESS_OUTPUT);
    expect(task.nextAttemptAt).toBeNull();
  });

  it('preserves existing errorHistory from prior failed attempts', () => {
    const previousErrors = [
      { attemptedAt: '2026-05-16T11:59:00.000Z', error: 'first try failed' },
      { attemptedAt: '2026-05-16T11:59:30.000Z', error: 'second try failed' },
    ];
    const task = makeTask({ attemptCount: 3, errorHistory: previousErrors });

    applyTaskOutcome({
      task,
      outcome: SUCCESS,
      now: FIXED_NOW,
      maxRetries: 5,
      randomFraction: 0.5,
    });

    expect(task.errorHistory).toEqual(previousErrors);
  });
});

describe('applyTaskOutcome — retryable failure', () => {
  it('marks task queued and reports not exhausted', () => {
    const task = makeTask({ status: 'in_progress', attemptCount: 1 });

    const { exhausted } = applyTaskOutcome({
      task,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(exhausted).toBe(false);
    expect(task.status).toBe('queued');
  });

  it('appends an errorHistory entry with now.toISOString() and error.message', () => {
    const task = makeTask({ attemptCount: 1 });

    applyTaskOutcome({
      task,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(task.errorHistory).toEqual([
      { attemptedAt: FIXED_NOW.toISOString(), error: 'boom' },
    ]);
  });

  it('preserves previous errorHistory entries and appends in order', () => {
    const firstEntry = { attemptedAt: '2026-05-16T11:59:00.000Z', error: 'first' };
    const task = makeTask({ attemptCount: 2, errorHistory: [firstEntry] });

    applyTaskOutcome({
      task,
      outcome: { kind: 'failure', error: new Error('second') },
      now: FIXED_NOW,
      maxRetries: 5,
      randomFraction: 0.5,
    });

    expect(task.errorHistory).toEqual([
      firstEntry,
      { attemptedAt: FIXED_NOW.toISOString(), error: 'second' },
    ]);
  });

  it('sets nextAttemptAt to a time at or after now', () => {
    const task = makeTask({ attemptCount: 1 });

    applyTaskOutcome({
      task,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(task.nextAttemptAt).not.toBeNull();
    expect(task.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(FIXED_NOW.getTime());
  });
});

describe('applyTaskOutcome — exhausted failure', () => {
  it('marks task failed when attemptCount reaches the retry budget', () => {
    const task = makeTask({ status: 'in_progress', attemptCount: 3 });

    const { exhausted } = applyTaskOutcome({
      task,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(exhausted).toBe(true);
    expect(task.status).toBe('failed');
  });

  it('appends the final errorHistory entry', () => {
    const task = makeTask({ attemptCount: 3 });

    applyTaskOutcome({
      task,
      outcome: { kind: 'failure', error: new Error('final') },
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(task.errorHistory).toEqual([
      { attemptedAt: FIXED_NOW.toISOString(), error: 'final' },
    ]);
  });

  it('clears nextAttemptAt', () => {
    const task = makeTask({
      attemptCount: 3,
      nextAttemptAt: new Date('2026-05-16T11:59:00.000Z'),
    });

    applyTaskOutcome({
      task,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });

    expect(task.nextAttemptAt).toBeNull();
  });

  it('off-by-one: maxRetries=2 permits 3 total attempts before exhaustion', () => {
    const onLastAllowedAttempt = makeTask({ attemptCount: 2 });
    const stillRetryable = applyTaskOutcome({
      task: onLastAllowedAttempt,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });
    expect(stillRetryable.exhausted).toBe(false);
    expect(onLastAllowedAttempt.status).toBe('queued');

    const onAttemptOverBudget = makeTask({ attemptCount: 3 });
    const exhaustsNow = applyTaskOutcome({
      task: onAttemptOverBudget,
      outcome: FAILURE,
      now: FIXED_NOW,
      maxRetries: 2,
      randomFraction: 0.5,
    });
    expect(exhaustsNow.exhausted).toBe(true);
    expect(onAttemptOverBudget.status).toBe('failed');
  });
});

describe('computeNextAttemptAt', () => {
  it('returns now when randomFraction is 0 (no jitter)', () => {
    const result = computeNextAttemptAt(1, FIXED_NOW, 0);
    expect(result.getTime()).toBe(FIXED_NOW.getTime());
  });

  it('grows the upper bound exponentially with attemptCount', () => {
    const atAttempt1 = computeNextAttemptAt(1, FIXED_NOW, 1).getTime() - FIXED_NOW.getTime();
    const atAttempt2 = computeNextAttemptAt(2, FIXED_NOW, 1).getTime() - FIXED_NOW.getTime();
    const atAttempt3 = computeNextAttemptAt(3, FIXED_NOW, 1).getTime() - FIXED_NOW.getTime();

    expect(atAttempt1).toBe(BACKOFF_BASE_DELAY_MS);
    expect(atAttempt2).toBe(BACKOFF_BASE_DELAY_MS * 2);
    expect(atAttempt3).toBe(BACKOFF_BASE_DELAY_MS * 4);
  });

  it('caps the delay at BACKOFF_CAP_DELAY_MS regardless of attemptCount', () => {
    const farFutureAttempt = 20;
    const delay = computeNextAttemptAt(farFutureAttempt, FIXED_NOW, 1).getTime() - FIXED_NOW.getTime();
    expect(delay).toBe(BACKOFF_CAP_DELAY_MS);
  });
});
