import type { Task } from '../entities';
import { logger } from '../logger';
import { repositories } from '../repositories';
import { getJob } from './jobs';

export class TaskRunner {
  /**
   * Executes the job for a task and persists the output. Workflow status is
   * derived from task statuses at read-time (see deriveWorkflowStatus), so no
   * reconciliation write is needed here.
   */
  async run(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.id, taskType: task.type });

    task.status = 'in_progress';
    await repositories.taskRepository.save(task);
    const job = getJob(task.type);

    try {
      taskLogger.info('task.started');
      const output = await job.run(task);
      taskLogger.info('task.completed');
      task.output = output;
      task.status = 'completed';
      await repositories.taskRepository.save(task);
    } catch (error: unknown) {
      taskLogger.error({ err: error }, 'task.failed');
      task.status = 'failed';
      await repositories.taskRepository.save(task);
      throw error;
    }
  }
}
