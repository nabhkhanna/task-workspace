import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../src/entities';
import type { TaskRepository } from '../../src/repositories';
import { TaskWorker } from '../../src/workers';
import type { JobFn } from '../../src/workers/jobs';
import { makeTask } from '../_helpers';

class InMemoryTaskRepository {
  saved: Task[] = [];
  save = vi.fn((task: Task): Promise<Task> => {
    this.saved.push(structuredClone(task));
    return Promise.resolve(task);
  });
  findNextQueued = vi.fn((): Promise<Task | null> => Promise.resolve(null));
  requeueInProgress = vi.fn((): Promise<number> => Promise.resolve(0));
}

const succeedAsAnalysis: JobFn = () =>
  Promise.resolve({ type: 'analysis', country: 'Germany' });

describe('TaskWorker.processNext', () => {
  let repo: InMemoryTaskRepository;

  beforeEach(() => {
    repo = new InMemoryTaskRepository();
  });

  it('marks the task completed and persists in_progress then completed in order', async () => {
    const worker = new TaskWorker({
      taskRepository: repo as unknown as TaskRepository,
      handlers: { analysis: succeedAsAnalysis, notification: succeedAsAnalysis },
      maxRetries: 2,
    });
    const task = makeTask();

    await worker.processNext(task);

    expect(task.status).toBe('completed');
    expect(task.attemptCount).toBe(1);
    expect(task.output).toEqual({ type: 'analysis', country: 'Germany' });
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(repo.saved[0].status).toBe('in_progress');
    expect(repo.saved[1].status).toBe('completed');
  });

  it('schedules a retry with nextAttemptAt set when the budget still permits one', async () => {
    const failing: JobFn = () => Promise.reject(new Error('boom'));
    const worker = new TaskWorker({
      taskRepository: repo as unknown as TaskRepository,
      handlers: { analysis: failing, notification: failing },
      maxRetries: 2,
    });
    const task = makeTask();

    await worker.processNext(task);

    expect(task.status).toBe('queued');
    expect(task.attemptCount).toBe(1);
    expect(task.nextAttemptAt).not.toBeNull();
    expect(task.errorHistory).toHaveLength(1);
    expect(task.errorHistory[0].error).toBe('boom');
  });

  it('marks the task failed and rethrows once retries are exhausted', async () => {
    const failing: JobFn = () => Promise.reject(new Error('still boom'));
    const worker = new TaskWorker({
      taskRepository: repo as unknown as TaskRepository,
      handlers: { analysis: failing, notification: failing },
      maxRetries: 2,
    });
    const task = makeTask();

    await worker.processNext(task);
    expect(task.status).toBe('queued');
    await worker.processNext(task);
    expect(task.status).toBe('queued');

    await expect(worker.processNext(task)).rejects.toThrow('still boom');

    expect(task.status).toBe('failed');
    expect(task.attemptCount).toBe(3);
    expect(task.errorHistory).toHaveLength(3);
    expect(task.nextAttemptAt).toBeNull();
  });
});

describe('TaskWorker.start/stop', () => {
  it('picks up a queued task in the loop and exits cleanly on stop', async () => {
    const repo = new InMemoryTaskRepository();
    const task = makeTask();
    let returnedOnce = false;
    repo.findNextQueued.mockImplementation((): Promise<Task | null> => {
      if (returnedOnce) {
        return Promise.resolve(null);
      }
      returnedOnce = true;
      return Promise.resolve(task);
    });

    const worker = new TaskWorker({
      taskRepository: repo as unknown as TaskRepository,
      handlers: { analysis: succeedAsAnalysis, notification: succeedAsAnalysis },
      maxRetries: 2,
      pollIntervalMs: 5,
    });

    const loop = worker.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await worker.stop();
    await loop;

    expect(task.status).toBe('completed');
    expect(repo.findNextQueued).toHaveBeenCalled();
  });
});
