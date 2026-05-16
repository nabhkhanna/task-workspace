import {
  type ErrorHistoryEntry,
  Task,
  type TaskOutput,
  type TaskStatus,
  type TaskType,
  type Workflow,
} from '../../src/entities';
import { makeWorkflow } from './makeWorkflow';

interface MakeTaskOverrides {
  id?: string;
  type?: TaskType;
  status?: TaskStatus;
  output?: TaskOutput | null;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
  errorHistory?: ErrorHistoryEntry[];
  workflow?: Workflow;
  dependencies?: Task[];
}

export function makeTask(overrides: MakeTaskOverrides = {}): Task {
  const task = new Task({
    type: overrides.type ?? 'analysis',
    workflow: overrides.workflow ?? makeWorkflow(),
    dependencies: overrides.dependencies,
  });
  if (overrides.status !== undefined) {
    task.status = overrides.status;
  }
  if (overrides.output !== undefined) {
    task.output = overrides.output;
  }
  if (overrides.attemptCount !== undefined) {
    task.attemptCount = overrides.attemptCount;
  }
  if (overrides.nextAttemptAt !== undefined) {
    task.nextAttemptAt = overrides.nextAttemptAt;
  }
  if (overrides.errorHistory !== undefined) {
    task.errorHistory = overrides.errorHistory;
  }
  if (overrides.id !== undefined) {
    Object.assign(task, { id: overrides.id });
  }
  return task;
}
