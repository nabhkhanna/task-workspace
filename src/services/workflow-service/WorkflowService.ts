import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { Task, Workflow } from '../../entities';
import type { TaskRepository, WorkflowRepository } from '../../repositories';
import { validateWorkflowDefinition, WorkflowDefinitionSchema } from './workflowValidation';

const GeoJsonPolygonSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]).rest(z.number()))),
  }),
  properties: z.record(z.string(), z.unknown()).nullable(),
});

export interface WorkflowServiceDeps {
  workflowRepository: WorkflowRepository;
  taskRepository: TaskRepository;
}

export interface WorkflowService {
  createFromYaml(filePath: string, clientId: string, geoJson: unknown): Promise<Workflow>;
}

export function createWorkflowService(deps: WorkflowServiceDeps): WorkflowService {
  const { workflowRepository, taskRepository } = deps;

  return {
    async createFromYaml(filePath, clientId, geoJson) {
      const parseResult = GeoJsonPolygonSchema.safeParse(geoJson);
      if (!parseResult.success) {
        throw new Error(`Invalid geoJson input: ${parseResult.error.message}`);
      }
      const validatedGeoJson = parseResult.data;

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const yamlData = yaml.load(fileContent);
      const defResult = WorkflowDefinitionSchema.safeParse(yamlData);
      if (!defResult.success) {
        throw new Error(`Invalid workflow definition: ${defResult.error.message}`);
      }
      const workflowDef = defResult.data;

      validateWorkflowDefinition(workflowDef);

      const workflow = new Workflow({ clientId, geoJson: validatedGeoJson });
      const savedWorkflow = await workflowRepository.save(workflow);

      const tasksByType = new Map<string, Task>();
      for (const step of workflowDef.steps) {
        tasksByType.set(step.taskType, new Task({ type: step.taskType, workflow: savedWorkflow }));
      }
      const tasks = [...tasksByType.values()];
      await taskRepository.save(tasks);

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
      await taskRepository.save(tasks);

      return savedWorkflow;
    },
  };
}
