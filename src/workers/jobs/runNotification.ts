import type { Task } from '../../entities';
import { logger } from '../../logger';

const SIMULATED_SEND_DELAY_MS = 500;

export async function runNotification(task: Task): Promise<{ type: 'notification' }> {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_SEND_DELAY_MS));
  logger.info({ taskId: task.id }, 'job.email.sent');
  return { type: 'notification' };
}
