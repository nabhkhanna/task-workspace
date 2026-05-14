export const TASK_STATUSES = ['queued', 'in_progress', 'completed', 'failed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
