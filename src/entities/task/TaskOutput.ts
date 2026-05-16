import type { TaskType } from './TaskType';

export interface ReportTaskEntry {
  taskId: string;
  type: TaskType;
  output: TaskOutput | null;
  error?: string;
}

export interface ReportPayload {
  workflowId: string;
  tasks: ReportTaskEntry[];
  finalReport: string;
}

export type TaskOutput =
  | { type: 'analysis'; country: string }
  | { type: 'notification' }
  | { type: 'polygon_area'; areaM2: number }
  | { type: 'report_generation'; report: ReportPayload };
