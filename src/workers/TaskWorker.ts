import { setTimeout as sleep } from 'node:timers/promises';
import type { Task, TaskType } from '../entities';
import { logger } from '../logger';
import type { TaskRepository } from '../repositories';
import type { JobFn } from './jobs';
import { applyTaskOutcome, type TaskOutcome } from './taskOutcomePolicy';

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export interface TaskWorkerOptions {
  taskRepository: TaskRepository;
  handlers: Record<TaskType, JobFn>;
  maxRetries: number;
  pollIntervalMs?: number;
}

/**
 * Background worker that polls for queued tasks and runs them. Owns the loop
 * lifecycle (start/stop), handler dispatch, persistence, and delegates the
 * retry/result state transition to `applyTaskOutcome`.
 */
export class TaskWorker {
  private readonly taskRepository: TaskRepository;
  private readonly handlers: Record<TaskType, JobFn>;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly abortController = new AbortController();
  private loopPromise: Promise<void> | null = null;

  constructor(options: TaskWorkerOptions) {
    this.taskRepository = options.taskRepository;
    this.handlers = options.handlers;
    this.maxRetries = options.maxRetries;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  start(): Promise<void> {
    if (this.loopPromise) {
      return this.loopPromise;
    }
    this.loopPromise = this.runLoop();
    return this.loopPromise;
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  async processNext(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.id, taskType: task.type });

    task.attemptCount += 1;
    task.status = 'in_progress';
    await this.taskRepository.save(task);

    taskLogger.info({ attempt: task.attemptCount }, 'task.started');
    const outcome = await this.runJob(task, this.handlers[task.type]);
    const { exhausted } = applyTaskOutcome({
      task,
      outcome,
      now: new Date(),
      maxRetries: this.maxRetries,
      randomFraction: Math.random(),
    });

    if (outcome.kind === 'success') {
      taskLogger.info({ attempt: task.attemptCount }, 'task.completed');
      await this.taskRepository.save(task);
      return;
    }

    if (exhausted) {
      taskLogger.error(
        {
          err: outcome.error,
          attempt: task.attemptCount,
          maxAttempts: this.maxRetries + 1,
        },
        'task.retries_exhausted',
      );
      await this.taskRepository.save(task);
      throw outcome.error;
    }

    taskLogger.warn(
      {
        err: outcome.error,
        attempt: task.attemptCount,
        nextAttemptAt: task.nextAttemptAt,
      },
      'task.retry_scheduled',
    );
    await this.taskRepository.save(task);
  }

  private async runJob(task: Task, job: JobFn): Promise<TaskOutcome> {
    try {
      const output = await job(task);
      return { kind: 'success', output };
    } catch (error: unknown) {
      return {
        kind: 'failure',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async runLoop(): Promise<void> {
    const { signal } = this.abortController;
    while (!signal.aborted) {
      const task = await this.taskRepository.findNextRunnableTask();
      if (task) {
        try {
          await this.processNext(task);
        } catch (error) {
          logger.error(
            { err: error, taskId: task.id },
            'worker.task_execution_failed_already_marked',
          );
        }
      }

      if (signal.aborted) {
        break;
      }

      try {
        await sleep(this.pollIntervalMs, undefined, { signal });
      } catch {
        // AbortError on shutdown — loop condition handles exit.
      }
    }
  }
}
