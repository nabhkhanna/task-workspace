import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { Task, Workflow } from '../entities';
import type { Repositories } from '../repositories';

interface WorkflowStep {
  taskType: string;
  stepNumber: number;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export class WorkflowFactory {
  constructor(private readonly repositories: Repositories) {}

  /**
   * Creates a workflow from a YAML definition, persists it, and queues
   * the associated tasks.
   */
  async createWorkflowFromYAML(
    filePath: string,
    clientId: string,
    geoJson: string,
  ): Promise<Workflow> {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const workflowDef = yaml.load(fileContent) as WorkflowDefinition;
    const workflow = new Workflow();

    workflow.clientId = clientId;
    workflow.status = 'initial';

    const savedWorkflow = await this.repositories.workflowRepository.save(workflow);

    const tasks: Task[] = workflowDef.steps.map((step) => {
      const task = new Task();
      task.clientId = clientId;
      task.geoJson = geoJson;
      task.status = 'queued';
      task.taskType = step.taskType;
      task.stepNumber = step.stepNumber;
      task.workflow = savedWorkflow;
      return task;
    });

    await this.repositories.taskRepository.saveAll(tasks);

    return savedWorkflow;
  }
}
