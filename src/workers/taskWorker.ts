import { setTimeout as sleep } from 'node:timers/promises';
import { AppDataSource } from '../data-source';
import { Task } from '../entities';
import { logger } from '../logger';
import { TaskRunner } from './taskRunner';

const POLL_INTERVAL_MS = 5_000;

export async function taskWorker(signal: AbortSignal): Promise<void> {
  const taskRepository = AppDataSource.getRepository(Task);
  const taskRunner = new TaskRunner(taskRepository);

  while (!signal.aborted) {
    const task = await taskRepository.findOne({
      where: { status: 'queued' },
      relations: ['workflow'],
    });

    if (task) {
      try {
        await taskRunner.run(task);
      } catch (error) {
        logger.error(
          { err: error, taskId: task.taskId },
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
