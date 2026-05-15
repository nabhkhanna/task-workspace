import type { Task } from '../../entities';
import { logger } from '../../logger';
import type { Job } from './Job';

const SIMULATED_SEND_DELAY_MS = 500;

export class EmailNotificationJob implements Job {
  async run(task: Task): Promise<{ type: 'notification' }> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_SEND_DELAY_MS));
    logger.info({ taskId: task.id }, 'job.email.sent');
    return { type: 'notification' };
  }
}
