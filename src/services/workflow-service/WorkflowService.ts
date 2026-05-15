import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { isTaskType, Task, type TaskType, Workflow } from '../../entities';
import { repositories } from '../../repositories';

interface WorkflowStep {
  taskType: string;
  stepNumber: number;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export class WorkflowService {
  /**
   * Creates a workflow from a YAML definition, persists it, and queues
   * the associated tasks.
   */
  async createFromYaml(filePath: string, clientId: string, geoJson: string): Promise<Workflow> {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const workflowDef = yaml.load(fileContent) as WorkflowDefinition;

    const unknownTaskTypes = workflowDef.steps
      .map((step) => step.taskType)
      .filter((taskType) => !isTaskType(taskType));
    if (unknownTaskTypes.length > 0) {
      throw new Error(`Unknown task type(s) in workflow: ${unknownTaskTypes.join(', ')}`);
    }

    const workflow = new Workflow();

    workflow.clientId = clientId;
    workflow.status = 'initial';

    const savedWorkflow = await repositories.workflowRepository.save(workflow);

    const tasks: Task[] = workflowDef.steps.map((step) => {
      const task = new Task();
      task.clientId = clientId;
      task.geoJson = geoJson;
      task.status = 'queued';
      task.taskType = step.taskType as TaskType;
      task.stepNumber = step.stepNumber;
      task.workflow = savedWorkflow;
      return task;
    });

    await repositories.taskRepository.saveAll(tasks);

    return savedWorkflow;
  }

  /**
   * Recomputes a workflow's status based on the states of its tasks
   * and persists the result if it changed.
   *
   * Called by the task runner after each task finishes.
   */
  async reconcileStatus(workflowId: string): Promise<void> {
    const workflow = await repositories.workflowRepository.findByIdWithTasks(workflowId);
    if (!workflow) {
      return;
    }

    const allCompleted = workflow.tasks.every((task) => task.status === 'completed');
    const anyFailed = workflow.tasks.some((task) => task.status === 'failed');

    if (anyFailed) {
      workflow.status = 'failed';
    } else if (allCompleted) {
      workflow.status = 'completed';
    } else {
      workflow.status = 'in_progress';
    }

    await repositories.workflowRepository.save(workflow);
  }
}
