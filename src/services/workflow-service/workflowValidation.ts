import { z } from 'zod';
import { TASK_TYPES } from '../../entities';

const WorkflowStepSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  dependsOn: z.array(z.enum(TASK_TYPES)).optional(),
});

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  steps: z.array(WorkflowStepSchema),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Validates the workflow's task graph after the schema has already enforced
 * shape and taskType-enum constraints. Catches semantic problems the schema
 * can't express:
 *   - taskTypes are unique within the workflow (used as the dependency identifier)
 *   - every dependsOn ref resolves to a step in this workflow
 *   - no task depends on itself
 *   - the dependency graph has no cycles
 * Throws a clear Error on the first problem found. Pure — no I/O.
 */
export function validateWorkflowDefinition(definition: WorkflowDefinition): void {
  const seenTypes = new Set<string>();
  for (const step of definition.steps) {
    if (seenTypes.has(step.taskType)) {
      throw new Error(
        `Duplicate task type '${step.taskType}'. Each task type must appear at most once per workflow (used as the dependency identifier).`,
      );
    }
    seenTypes.add(step.taskType);
  }

  for (const step of definition.steps) {
    for (const ref of step.dependsOn ?? []) {
      if (!seenTypes.has(ref)) {
        throw new Error(
          `Task '${step.taskType}' has dependsOn '${ref}' which is not defined in this workflow.`,
        );
      }
    }
  }

  for (const step of definition.steps) {
    if ((step.dependsOn ?? []).includes(step.taskType)) {
      throw new Error(`Task '${step.taskType}' cannot depend on itself.`);
    }
  }

  const cycle = findCycle(definition.steps);
  if (cycle !== null) {
    throw new Error(`Cyclic dependency detected: ${cycle.join(' -> ')}`);
  }
}

const COLOR_WHITE = 0;
const COLOR_GRAY = 1;
const COLOR_BLACK = 2;

/**
 * Detects a cycle in the dependency graph via DFS with three-coloring.
 * Returns the cycle's node sequence (closing the loop with the repeated
 * node) when found, or null when the graph is acyclic.
 */
export function findCycle(steps: WorkflowStep[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const step of steps) {
    adjacency.set(step.taskType, step.dependsOn ?? []);
  }

  const color = new Map<string, number>();
  for (const node of adjacency.keys()) {
    color.set(node, COLOR_WHITE);
  }

  function visit(node: string, path: string[]): string[] | null {
    color.set(node, COLOR_GRAY);
    path.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const neighborColor = color.get(neighbor);
      if (neighborColor === COLOR_GRAY) {
        const cycleStart = path.indexOf(neighbor);
        return [...path.slice(cycleStart), neighbor];
      }
      if (neighborColor === COLOR_WHITE) {
        const found = visit(neighbor, path);
        if (found !== null) {
          return found;
        }
      }
    }
    color.set(node, COLOR_BLACK);
    path.pop();
    return null;
  }

  for (const node of adjacency.keys()) {
    if (color.get(node) === COLOR_WHITE) {
      const found = visit(node, []);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}
