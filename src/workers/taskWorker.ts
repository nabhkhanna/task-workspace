import { setTimeout as sleep } from 'node:timers/promises';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner, TaskStatus } from './taskRunner';

const POLL_INTERVAL_MS = 5_000;

export async function taskWorker(signal: AbortSignal): Promise<void> {
  const taskRepository = AppDataSource.getRepository(Task);
  const taskRunner = new TaskRunner(taskRepository);

  while (!signal.aborted) {
    const task = await taskRepository.findOne({
      where: { status: TaskStatus.Queued },
      relations: ['workflow'],
    });

    if (task) {
      try {
        await taskRunner.run(task);
      } catch (error) {
        console.error('Task execution failed. Task status has already been updated by TaskRunner.');
        console.error(error);
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
