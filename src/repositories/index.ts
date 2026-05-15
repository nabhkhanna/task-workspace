import type { DataSource } from 'typeorm';
import { createTaskRepository, type TaskRepository } from './TaskRepository';
import { createWorkflowRepository, type WorkflowRepository } from './WorkflowRepository';

export { createTaskRepository, type TaskRepository } from './TaskRepository';
export { createWorkflowRepository, type WorkflowRepository } from './WorkflowRepository';

export interface Repositories {
  taskRepository: TaskRepository;
  workflowRepository: WorkflowRepository;
}

export const repositories = {} as Repositories;

export function initRepositories(dataSource: DataSource): void {
  Object.assign(repositories, {
    taskRepository: createTaskRepository(dataSource),
    workflowRepository: createWorkflowRepository(dataSource),
  });
}
