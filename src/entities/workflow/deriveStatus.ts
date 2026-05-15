import type { Task } from '../task';
import type { WorkflowStatus } from './WorkflowStatus';

export function deriveWorkflowStatus(tasks: Task[]): WorkflowStatus {
  if (tasks.length === 0) {
    return 'initial';
  }
  if (tasks.some((task) => task.status === 'failed')) {
    return 'failed';
  }
  if (tasks.every((task) => task.status === 'completed')) {
    return 'completed';
  }
  return 'in_progress';
}
