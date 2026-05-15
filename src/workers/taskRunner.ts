import { config } from '../config';
import type { Task } from '../entities';
import { logger } from '../logger';
import type { TaskRepository } from '../repositories';
import { repositories } from '../repositories';
import { computeNextAttemptAt as defaultComputeNextAttemptAt } from './backoff';
import { getJob as defaultGetJob } from './jobs';

export interface TaskRunnerDeps {
  taskRepository?: TaskRepository;
  getJob?: typeof defaultGetJob;
  computeNextAttemptAt?: typeof defaultComputeNextAttemptAt;
  maxRetries?: number;
}

export class TaskRunner {
  private readonly taskRepository: TaskRepository;
  private readonly getJob: typeof defaultGetJob;
  private readonly computeNextAttemptAt: typeof defaultComputeNextAttemptAt;
  private readonly maxRetries: number;

  constructor(deps: TaskRunnerDeps = {}) {
    this.taskRepository = deps.taskRepository ?? repositories.taskRepository;
    this.getJob = deps.getJob ?? defaultGetJob;
    this.computeNextAttemptAt = deps.computeNextAttemptAt ?? defaultComputeNextAttemptAt;
    this.maxRetries = deps.maxRetries ?? config.MAX_TASK_RETRIES;
  }

  /**
   * Executes the job for a task and persists the output. Workflow status is
   * derived from task statuses at read-time (see deriveWorkflowStatus), so no
   * reconciliation write is needed here.
   *
   * Retry policy: attemptCount is incremented BEFORE the job runs so a mid-task
   * process crash still counts against the budget. On failure, if the task has
   * retries remaining, status returns to 'queued' with nextAttemptAt set via
   * exponential backoff; otherwise it is marked 'failed' permanently and
   * emits task.retries_exhausted at error level.
   */
  async run(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.id, taskType: task.type });

    task.attemptCount += 1;
    task.status = 'in_progress';
    await this.taskRepository.save(task);
    const job = this.getJob(task.type);

    try {
      taskLogger.info({ attempt: task.attemptCount }, 'task.started');
      const output = await job(task);
      taskLogger.info({ attempt: task.attemptCount }, 'task.completed');
      task.output = output;
      task.status = 'completed';
      task.nextAttemptAt = null;
      await this.taskRepository.save(task);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      task.errorHistory = [
        ...task.errorHistory,
        { attemptedAt: new Date().toISOString(), error: errorMessage },
      ];

      const totalAllowedAttempts = this.maxRetries + 1;
      if (task.attemptCount >= totalAllowedAttempts) {
        taskLogger.error(
          { err: error, attempt: task.attemptCount, maxAttempts: totalAllowedAttempts },
          'task.retries_exhausted',
        );
        task.status = 'failed';
        task.nextAttemptAt = null;
        await this.taskRepository.save(task);
        throw error;
      }

      const nextAttemptAt = this.computeNextAttemptAt(task.attemptCount);
      taskLogger.warn(
        { err: error, attempt: task.attemptCount, nextAttemptAt },
        'task.retry_scheduled',
      );
      task.status = 'queued';
      task.nextAttemptAt = nextAttemptAt;
      await this.taskRepository.save(task);
    }
  }
}
