import type { Task } from '../task';
import type { WorkflowStatus } from './WorkflowStatus';

export function deriveWorkflowStatus(tasks: Task[]): WorkflowStatus {
  if (tasks.length === 0) {
    return 'initial';
  }
  // A workflow only resolves to a terminal status once every task is itself
  // terminal — otherwise an early failure on one branch would lock the
  // workflow as 'failed' while sibling tasks are still running, and the
  // finalizer would persist a partial result that can never be revised.
  const allTerminal = tasks.every(
    (task) => task.status === 'completed' || task.status === 'failed',
  );
  if (!allTerminal) {
    return 'in_progress';
  }
  if (tasks.some((task) => task.status === 'failed')) {
    return 'failed';
  }
  return 'completed';
}
