export const WORKFLOW_STATUSES = ['initial', 'in_progress', 'completed', 'failed'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
