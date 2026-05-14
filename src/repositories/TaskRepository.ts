import type { DataSource, Repository } from 'typeorm';
import { Task } from '../entities';

export class TaskRepository {
  private readonly repo: Repository<Task>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Task);
  }

  /**
   * Finds the next queued task in step order. Eager-loads the workflow relation
   * so the runner can reconcile workflow status after the task completes.
   */
  findNextQueued(): Promise<Task | null> {
    return this.repo.findOne({
      where: { status: 'queued' },
      relations: ['workflow'],
      order: { stepNumber: 'ASC' },
    });
  }

  save(task: Task): Promise<Task> {
    return this.repo.save(task);
  }

  saveAll(tasks: Task[]): Promise<Task[]> {
    return this.repo.save(tasks);
  }
}
