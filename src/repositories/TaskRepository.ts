import { type DataSource, IsNull, LessThanOrEqual, Or } from 'typeorm';
import { Task, type TaskStatus } from '../entities';

const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed'];

export function createTaskRepository(dataSource: DataSource) {
  return dataSource.getRepository(Task).extend({
    /**
     * Finds the next runnable queued task. A task is runnable when its
     * backoff has elapsed and every dependency is in a terminal state
     * (completed or failed). Empty-deps tasks are runnable as soon as
     * their backoff elapses, since `[].every(...)` is vacuously true.
     * Eager-loads workflow + sibling tasks + dependencies so jobs that
     * need to inspect siblings (e.g. report_generation) can do so in
     * memory without making their own DB calls.
     * FIFO ordering (createdAt ASC) is the tiebreaker among ready candidates.
     */
    async findNextRunnable(): Promise<Task | null> {
      const candidates = await this.find({
        where: {
          status: 'queued',
          nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
        },
        relations: ['workflow', 'workflow.tasks', 'dependencies'],
        order: { createdAt: 'ASC' },
      });

      const next = candidates.find((candidate) =>
        candidate.dependencies.every((dep) => TERMINAL_TASK_STATUSES.includes(dep.status)),
      );
      return next ?? null;
    },

    /**
     * Resets any task left in 'in_progress' back to 'queued'. Called at boot
     * to recover from tasks interrupted by a crash. Returns the count for
     * logging.
     */
    async requeueInterrupted(): Promise<number> {
      const result = await this.update({ status: 'in_progress' }, { status: 'queued' });
      return result.affected ?? 0;
    },
  });
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
