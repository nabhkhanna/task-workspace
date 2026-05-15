import type { DataSource } from 'typeorm';
import { Workflow } from '../entities';

export function createWorkflowRepository(dataSource: DataSource) {
  return dataSource.getRepository(Workflow).extend({
    /**
     * Loads a workflow with all its tasks eager-populated.
     */
    findByIdWithTasks(id: string): Promise<Workflow | null> {
      return this.findOne({
        where: { id },
        relations: ['tasks'],
      });
    },
  });
}

export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;
