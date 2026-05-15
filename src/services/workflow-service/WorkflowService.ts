import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
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

const GeoJsonPolygonSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))),
  }),
  properties: z.record(z.string(), z.unknown()).nullable(),
});

export class WorkflowService {
  /**
   * Creates a workflow from a YAML definition, persists it, and queues
   * the associated tasks.
   */
  async createFromYaml(filePath: string, clientId: string, geoJson: unknown): Promise<Workflow> {
    const parseResult = GeoJsonPolygonSchema.safeParse(geoJson);
    if (!parseResult.success) {
      throw new Error(`Invalid geoJson input: ${parseResult.error.message}`);
    }
    const validatedGeoJson = parseResult.data;

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const workflowDef = yaml.load(fileContent) as WorkflowDefinition;

    const unknownTaskTypes = workflowDef.steps
      .map((step) => step.taskType)
      .filter((taskType) => !isTaskType(taskType));
    if (unknownTaskTypes.length > 0) {
      throw new Error(`Unknown task type(s) in workflow: ${unknownTaskTypes.join(', ')}`);
    }

    const workflow = new Workflow({ clientId, geoJson: validatedGeoJson });
    const savedWorkflow = await repositories.workflowRepository.save(workflow);

    const tasks: Task[] = workflowDef.steps.map(
      (step) =>
        new Task({
          type: step.taskType as TaskType,
          stepNumber: step.stepNumber,
          workflow: savedWorkflow,
        }),
    );

    await repositories.taskRepository.save(tasks);

    return savedWorkflow;
  }
}
