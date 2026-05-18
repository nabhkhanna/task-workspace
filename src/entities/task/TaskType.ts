export const TASK_TYPES = [
  'analysis',
  'notification',
  'polygon_area',
  'report_generation',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];
