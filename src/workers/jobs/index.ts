import { type TaskType } from '../../entities';
import { DataAnalysisJob } from './DataAnalysisJob';
import { EmailNotificationJob } from './EmailNotificationJob';
import type { Job } from './Job';

const jobs: Record<TaskType, () => Job> = {
  analysis: () => new DataAnalysisJob(),
  notification: () => new EmailNotificationJob(),
};

export function getJob(taskType: TaskType): Job {
  return jobs[taskType]();
}

export type { Job };
