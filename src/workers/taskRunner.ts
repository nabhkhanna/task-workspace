import { Repository } from 'typeorm';
import { Result, Task, Workflow } from '../entities';
import { getJobForTaskType } from '../jobs';
import { logger } from '../logger';

export class TaskRunner {
  constructor(private taskRepository: Repository<Task>) {}

  /**
   * Runs the appropriate job based on the task's type, managing the task's status.
   * @param task - The task entity that determines which job to run.
   * @throws If the job fails, it rethrows the error.
   */
  async run(task: Task): Promise<void> {
    const taskLogger = logger.child({ taskId: task.taskId, taskType: task.taskType });

    task.status = 'in_progress';
    task.progress = 'starting job...';
    await this.taskRepository.save(task);
    const job = getJobForTaskType(task.taskType);

    try {
      taskLogger.info('task.started');
      const resultRepository = this.taskRepository.manager.getRepository(Result);
      const taskResult = await job.run(task);
      taskLogger.info('task.completed');
      const result = new Result();
      result.taskId = task.taskId ?? '';
      result.data = JSON.stringify(taskResult ?? {});
      await resultRepository.save(result);
      task.resultId = result.resultId ?? '';
      task.status = 'completed';
      task.progress = null;
      await this.taskRepository.save(task);
    } catch (error: unknown) {
      taskLogger.error({ err: error }, 'task.failed');

      task.status = 'failed';
      task.progress = null;
      await this.taskRepository.save(task);

      throw error;
    }

    const workflowRepository = this.taskRepository.manager.getRepository(Workflow);
    const currentWorkflow = await workflowRepository.findOne({
      where: { workflowId: task.workflow.workflowId },
      relations: ['tasks'],
    });

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

      await workflowRepository.save(currentWorkflow);
    }
  }
}
