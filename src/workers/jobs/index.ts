import type { Task, TaskOutput, TaskType } from '../../entities';
import { runAnalysis } from './runAnalysis';
import { runNotification } from './runNotification';

export type JobFn = (task: Task) => Promise<TaskOutput>;

const jobs = {
  analysis: runAnalysis,
  notification: runNotification,
} satisfies Record<TaskType, JobFn>;

export function getJob(taskType: TaskType): JobFn {
  return jobs[taskType];
}
