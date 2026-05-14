import { Result, Task } from '../entities';
import { getJobForTaskType } from '../jobs';
import { logger } from '../logger';
import type { Repositories } from '../repositories';

export class TaskRunner {
  constructor(private readonly repositories: Repositories) {}

  /**
   * Executes the job for a task, persists the result, and reconciles
   * the parent workflow's status.
   */
  async run(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.taskId, taskType: task.taskType });

    task.status = 'in_progress';
    task.progress = 'starting job...';
    await this.repositories.taskRepository.save(task);
    const job = getJobForTaskType(task.taskType);

    try {
      taskLogger.info('task.started');
      const taskResult = await job.run(task);
      taskLogger.info('task.completed');
      const result = new Result();
      result.taskId = task.taskId ?? '';
      result.data = JSON.stringify(taskResult ?? {});
      await this.repositories.resultRepository.save(result);
      task.resultId = result.resultId ?? '';
      task.status = 'completed';
      task.progress = null;
      await this.repositories.taskRepository.save(task);
    } catch (error: unknown) {
      taskLogger.error({ err: error }, 'task.failed');

      task.status = 'failed';
      task.progress = null;
      await this.repositories.taskRepository.save(task);

      throw error;
    }

    const currentWorkflow = await this.repositories.workflowRepository.findByIdWithTasks(
      task.workflow.workflowId,
    );

    if (currentWorkflow) {
      const allCompleted = currentWorkflow.tasks.every((t) => t.status === 'completed');
      const anyFailed = currentWorkflow.tasks.some((t) => t.status === 'failed');

      if (anyFailed) {
        currentWorkflow.status = 'failed';
      } else if (allCompleted) {
        currentWorkflow.status = 'completed';
      } else {
        currentWorkflow.status = 'in_progress';
      }

      await this.repositories.workflowRepository.save(currentWorkflow);
    }
  }
}
