import { DataAnalysisJob } from './DataAnalysisJob';
import { EmailNotificationJob } from './EmailNotificationJob';
import { Job } from './Job';

const jobMap: Record<string, () => Job> = {
  analysis: () => new DataAnalysisJob(),
  notification: () => new EmailNotificationJob(),
};

export function getJobForTaskType(taskType: string): Job {
  const jobFactory = jobMap[taskType];
  if (!jobFactory) {
    throw new Error(`No job found for task type: ${taskType}`);
  }
  return jobFactory();
}
