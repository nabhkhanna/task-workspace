export const TASK_TYPES = ['analysis', 'notification', 'polygon_area'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
