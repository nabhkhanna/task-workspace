import { Result, Task } from '../entities';
import { getJobForTaskType } from '../jobs';
import { logger } from '../logger';
import { repositories } from '../repositories';
import { WorkflowService } from '../services';

export class TaskRunner {
  private readonly workflowService = new WorkflowService();

  /**
   * Executes the job for a task, persists the result, and triggers
   * a workflow status reconciliation.
   */
  async run(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.taskId, taskType: task.taskType });

    task.status = 'in_progress';
    task.progress = 'starting job...';
    await repositories.taskRepository.save(task);
    const job = getJobForTaskType(task.taskType);

    try {
      taskLogger.info('task.started');
      const taskResult = await job.run(task);
      taskLogger.info('task.completed');
      const result = new Result();
      result.taskId = task.taskId ?? '';
      result.data = JSON.stringify(taskResult ?? {});
      await repositories.resultRepository.save(result);
      task.resultId = result.resultId ?? '';
      task.status = 'completed';
      task.progress = null;
      await repositories.taskRepository.save(task);
    } catch (error: unknown) {
      taskLogger.error({ err: error }, 'task.failed');

      task.status = 'failed';
      task.progress = null;
      await repositories.taskRepository.save(task);

      throw error;
    }

    await this.workflowService.reconcileStatus(task.workflow.workflowId);
  }
}
