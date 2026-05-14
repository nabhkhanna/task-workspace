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

export function createRepositories(dataSource: DataSource): Repositories {
  return {
    taskRepository: new TaskRepository(dataSource),
    workflowRepository: new WorkflowRepository(dataSource),
    resultRepository: new ResultRepository(dataSource),
  };
}
