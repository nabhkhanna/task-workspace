import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { Task, type TaskType, Workflow } from '../../entities';
import { repositories } from '../../repositories';
import { validateWorkflowDefinition, type WorkflowDefinition } from './workflowValidation';

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
   * the associated tasks with their dependsOn relationships wired up.
   */
  async createFromYaml(filePath: string, clientId: string, geoJson: unknown): Promise<Workflow> {
    const parseResult = GeoJsonPolygonSchema.safeParse(geoJson);
    if (!parseResult.success) {
      throw new Error(`Invalid geoJson input: ${parseResult.error.message}`);
    }
    const validatedGeoJson = parseResult.data;

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const workflowDef = yaml.load(fileContent) as WorkflowDefinition;

    validateWorkflowDefinition(workflowDef);

    const workflow = new Workflow({ clientId, geoJson: validatedGeoJson });
    const savedWorkflow = await repositories.workflowRepository.save(workflow);

    const tasksByType = new Map<string, Task>();
    for (const step of workflowDef.steps) {
      tasksByType.set(
        step.taskType,
        new Task({ type: step.taskType as TaskType, workflow: savedWorkflow }),
      );
    }
    const tasks = [...tasksByType.values()];
    await repositories.taskRepository.save(tasks);

    for (const step of workflowDef.steps) {
      const task = tasksByType.get(step.taskType);
      if (!task) {
        continue;
      }
      task.dependencies = (step.dependsOn ?? []).map((depType) => {
        const dep = tasksByType.get(depType);
        if (!dep) {
          throw new Error(`Unknown dependency: ${depType}`);
        }
        return dep;
      });
    }
    await repositories.taskRepository.save(tasks);

    return savedWorkflow;
  }
}
