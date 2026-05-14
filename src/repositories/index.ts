import type { DataSource } from 'typeorm';
import { ResultRepository } from './ResultRepository';
import { TaskRepository } from './TaskRepository';
import { WorkflowRepository } from './WorkflowRepository';

export { ResultRepository } from './ResultRepository';
export { TaskRepository } from './TaskRepository';
export { WorkflowRepository } from './WorkflowRepository';

export interface Repositories {
  taskRepository: TaskRepository;
  workflowRepository: WorkflowRepository;
  resultRepository: ResultRepository;
}

export const repositories = {} as Repositories;

export function initRepositories(dataSource: DataSource): void {
  Object.assign(repositories, {
    taskRepository: new TaskRepository(dataSource),
    workflowRepository: new WorkflowRepository(dataSource),
    resultRepository: new ResultRepository(dataSource),
  });
}
