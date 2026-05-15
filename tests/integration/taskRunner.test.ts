import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TaskType } from '../../src/entities';
import type { TaskRepository } from '../../src/repositories/TaskRepository';
import { TaskRunner } from '../../src/workers/taskRunner';

class InMemoryTaskRepository {
  saved: Task[] = [];
  save = vi.fn(async (task: Task): Promise<Task> => {
    this.saved.push(structuredClone(task));
    return task;
  });
}

function makeTask(): Task {
  return {
    id: 'task-1',
    type: 'analysis',
    status: 'queued',
    stepNumber: 1,
    output: null,
    attemptCount: 0,
    nextAttemptAt: null,
    errorHistory: [],
    workflow: { id: 'workflow-1' },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Task;
}

describe('TaskRunner retry/backoff', () => {
  let repo: InMemoryTaskRepository;
  const fixedNext = new Date('2026-05-15T12:00:01Z');

  beforeEach(() => {
    repo = new InMemoryTaskRepository();
  });

  it('marks completed and records attemptCount on first success', async () => {
    const runner = new TaskRunner({
      taskRepository: repo as unknown as TaskRepository,
      getJob: () => async () => ({ type: 'analysis', country: 'Germany' }),
      computeNextAttemptAt: () => fixedNext,
      maxRetries: 2,
    });
    const task = makeTask();

    await runner.run(task);

    expect(task.status).toBe('completed');
    expect(task.attemptCount).toBe(1);
    expect(task.output).toEqual({ type: 'analysis', country: 'Germany' });
    expect(task.errorHistory).toEqual([]);
    expect(task.nextAttemptAt).toBeNull();
  });

  it('schedules a retry on failure when budget remains', async () => {
    const runner = new TaskRunner({
      taskRepository: repo as unknown as TaskRepository,
      getJob: () => async () => {
        throw new Error('boom');
      },
      computeNextAttemptAt: () => fixedNext,
      maxRetries: 2,
    });
    const task = makeTask();

    await runner.run(task);

    expect(task.status).toBe('queued');
    expect(task.attemptCount).toBe(1);
    expect(task.nextAttemptAt).toEqual(fixedNext);
    expect(task.errorHistory).toHaveLength(1);
    expect(task.errorHistory[0].error).toBe('boom');
    expect(task.output).toBeNull();
  });

  it('marks failed and throws when retries are exhausted', async () => {
    const runner = new TaskRunner({
      taskRepository: repo as unknown as TaskRepository,
      getJob: () => async () => {
        throw new Error('still boom');
      },
      computeNextAttemptAt: () => fixedNext,
      maxRetries: 2,
    });
    const task = makeTask();

    // maxRetries=2 means 1 initial + 2 retries = 3 total attempts allowed.
    await runner.run(task);
    expect(task.status).toBe('queued');
    await runner.run(task);
    expect(task.status).toBe('queued');

    await expect(runner.run(task)).rejects.toThrow('still boom');

    expect(task.status).toBe('failed');
    expect(task.attemptCount).toBe(3);
    expect(task.errorHistory).toHaveLength(3);
    expect(task.nextAttemptAt).toBeNull();
  });
});
