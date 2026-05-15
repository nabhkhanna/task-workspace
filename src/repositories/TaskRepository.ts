import { type DataSource, IsNull, LessThanOrEqual, Or } from 'typeorm';
import { Task } from '../entities';

export function createTaskRepository(dataSource: DataSource) {
  return dataSource.getRepository(Task).extend({
    /**
     * Finds the next queued task whose backoff (if any) has elapsed.
     * Eager-loads the workflow relation so the runner can access workflow.geoJson.
     */
    findNextQueued(): Promise<Task | null> {
      return this.findOne({
        where: {
          status: 'queued',
          nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
        },
        relations: ['workflow'],
        order: { stepNumber: 'ASC' },
      });
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
