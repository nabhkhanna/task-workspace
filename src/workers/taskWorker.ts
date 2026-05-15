import { setTimeout as sleep } from 'node:timers/promises';
import { logger } from '../logger';
import { repositories } from '../repositories';
import { TaskRunner } from './taskRunner';

const POLL_INTERVAL_MS = 5_000;

export async function taskWorker(signal: AbortSignal): Promise<void> {
  const taskRunner = new TaskRunner();

  while (!signal.aborted) {
    const task = await repositories.taskRepository.findNextQueued();

    if (task) {
      try {
        await taskRunner.run(task);
      } catch (error) {
        logger.error(
          { err: error, taskId: task.id },
          'worker.task_execution_failed_already_marked',
        );
      }
    }

    if (signal.aborted) {
      break;
    }

    try {
      await sleep(POLL_INTERVAL_MS, undefined, { signal });
    } catch {
      // AbortError is expected when shutting down — exit the loop on next check.
    }
  }
}
