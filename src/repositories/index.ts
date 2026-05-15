import type { DataSource } from 'typeorm';
import { TaskRepository } from './TaskRepository';
import { WorkflowRepository } from './WorkflowRepository';

export { TaskRepository } from './TaskRepository';
export { WorkflowRepository } from './WorkflowRepository';

export interface Repositories {
  taskRepository: TaskRepository;
  workflowRepository: WorkflowRepository;
}

export const repositories = {} as Repositories;

export function initRepositories(dataSource: DataSource): void {
  Object.assign(repositories, {
    taskRepository: new TaskRepository(dataSource),
    workflowRepository: new WorkflowRepository(dataSource),
  });
}
