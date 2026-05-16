import type { TaskOutput, TaskType } from '../task';

export interface WorkflowFinalResultTaskEntry {
  taskId: string;
  type: TaskType;
  output: TaskOutput | null;
  error?: string;
}

export interface WorkflowFinalResult {
  workflowId: string;
  tasks: WorkflowFinalResultTaskEntry[];
  finalReport: string;
}
