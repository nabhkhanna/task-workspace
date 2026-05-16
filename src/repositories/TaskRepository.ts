import { type DataSource, IsNull, LessThanOrEqual, Or } from 'typeorm';
import { Task, type TaskStatus } from '../entities';

const NON_TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['queued', 'in_progress'];

export function createTaskRepository(dataSource: DataSource) {
  return dataSource.getRepository(Task).extend({
    /**
     * Finds the next runnable queued task. A task is runnable when its
     * backoff has elapsed and every earlier step (lower stepNumber) in the
     * same workflow is in a terminal state (completed or failed). This
     * enforces the brief's "run only after preceding tasks complete" rule
     * even when an earlier step is in retry-backoff. Eager-loads the
     * workflow + sibling tasks so the sequencing filter can be applied in
     * memory without a correlated subquery.
     */
    async findNextRunnableTask(): Promise<Task | null> {
      const candidates = await this.find({
        where: {
          status: 'queued',
          nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
        },
        relations: ['workflow', 'workflow.tasks'],
        order: { stepNumber: 'ASC' },
      });

      const next = candidates.find((candidate) =>
        candidate.workflow.tasks.every(
          (sibling) =>
            sibling.stepNumber >= candidate.stepNumber ||
            !NON_TERMINAL_TASK_STATUSES.includes(sibling.status),
        ),
      );
      return next ?? null;
    },

    /**
     * Resets any task left in 'in_progress' back to 'queued'. Called at boot
     * to recover from crashes mid-execution. Returns the count for logging.
     */
    async requeueInProgress(): Promise<number> {
      const result = await this.update({ status: 'in_progress' }, { status: 'queued' });
      return result.affected ?? 0;
    },
  });
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
