import { Task } from '../entities';
import { logger } from '../logger';
import { Job } from './Job';

const SIMULATED_SEND_DELAY_MS = 500;

export class EmailNotificationJob implements Job {
  async run(task: Task): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_SEND_DELAY_MS));
    logger.info({ taskId: task.taskId }, 'job.email.sent');
  }
}
