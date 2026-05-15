import type { DataSource, Repository } from 'typeorm';
import { Workflow } from '../entities';

export class WorkflowRepository {
  private readonly repo: Repository<Workflow>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Workflow);
  }

  /**
   * Loads a workflow with all its tasks eager-populated. Used during
   * status reconciliation after a task completes.
   */
  findByIdWithTasks(id: string): Promise<Workflow | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['tasks'],
    });
  }

  save(workflow: Workflow): Promise<Workflow> {
    return this.repo.save(workflow);
  }
}
