import type { Task, TaskOutput } from '../../entities';

export type JobFn = (task: Task) => Promise<TaskOutput>;

export { runAnalysis } from './runAnalysis';
export { runNotification } from './runNotification';
export { runPolygonArea } from './runPolygonArea';
