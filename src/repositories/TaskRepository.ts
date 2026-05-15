import { type DataSource, IsNull, LessThanOrEqual, Or, type Repository } from 'typeorm';
import { Task } from '../entities';

export class TaskRepository {
  private readonly repo: Repository<Task>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Task);
  }

  /**
   * Finds the next queued task whose backoff (if any) has elapsed. Eager-loads
   * the workflow relation so the runner can access workflow.geoJson.
   */
  findNextQueued(): Promise<Task | null> {
    return this.repo.findOne({
      where: {
        status: 'queued',
        nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
      },
      relations: ['workflow'],
      order: { stepNumber: 'ASC' },
    });
  }

  /**
   * Resets any task left in 'in_progress' back to 'queued'. Called at boot
   * to recover from crashes mid-execution. Returns the count for logging.
   */
  async requeueInProgress(): Promise<number> {
    const result = await this.repo.update({ status: 'in_progress' }, { status: 'queued' });
    return result.affected ?? 0;
  }

  save(task: Task): Promise<Task> {
    return this.repo.save(task);
  }

  saveAll(tasks: Task[]): Promise<Task[]> {
    return this.repo.save(tasks);
  }
}
