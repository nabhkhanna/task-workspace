import { describe, expect, it } from 'vitest';
import {
  findCycle,
  validateWorkflowDefinition,
  type WorkflowDefinition,
  WorkflowDefinitionSchema,
} from '../../src/services/workflow-service/workflowValidation';

describe('WorkflowDefinitionSchema', () => {
  it('accepts a valid definition and returns typed data', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      name: 'ok',
      steps: [{ taskType: 'analysis' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown taskType (caught at parse time, not semantic validation)', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      name: 'unknown',
      steps: [{ taskType: 'not_a_real_type' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing steps field', () => {
    const result = WorkflowDefinitionSchema.safeParse({ name: 'no-steps' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown taskType inside dependsOn', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      name: 'bad-dep',
      steps: [{ taskType: 'analysis', dependsOn: ['not_a_real_type'] }],
    });
    expect(result.success).toBe(false);
  });
});

describe('validateWorkflowDefinition', () => {
  it('accepts a valid linear-chain workflow', () => {
    const def: WorkflowDefinition = {
      name: 'linear',
      steps: [
        { taskType: 'analysis' },
        { taskType: 'polygon_area', dependsOn: ['analysis'] },
      ],
    };
    expect(() => validateWorkflowDefinition(def)).not.toThrow();
  });

  it('accepts a fan-in DAG (multiple deps converging on one task)', () => {
    const def: WorkflowDefinition = {
      name: 'fan-in',
      steps: [
        { taskType: 'analysis' },
        { taskType: 'polygon_area' },
        { taskType: 'report_generation', dependsOn: ['analysis', 'polygon_area'] },
        { taskType: 'notification', dependsOn: ['report_generation'] },
      ],
    };
    expect(() => validateWorkflowDefinition(def)).not.toThrow();
  });

  it('rejects a duplicate task type within the workflow', () => {
    const def: WorkflowDefinition = {
      name: 'dup',
      steps: [{ taskType: 'analysis' }, { taskType: 'analysis' }],
    };
    expect(() => validateWorkflowDefinition(def)).toThrow(/Duplicate task type/);
  });

  it('rejects a dependsOn ref that is not defined in the workflow', () => {
    const def: WorkflowDefinition = {
      name: 'missing-ref',
      steps: [{ taskType: 'analysis', dependsOn: ['polygon_area'] }],
    };
    expect(() => validateWorkflowDefinition(def)).toThrow(
      /dependsOn 'polygon_area' which is not defined/,
    );
  });

  it('rejects a self-dependency', () => {
    const def: WorkflowDefinition = {
      name: 'self',
      steps: [{ taskType: 'analysis', dependsOn: ['analysis'] }],
    };
    expect(() => validateWorkflowDefinition(def)).toThrow(/cannot depend on itself/);
  });

  it('rejects a direct two-task cycle', () => {
    const def: WorkflowDefinition = {
      name: 'cycle-2',
      steps: [
        { taskType: 'analysis', dependsOn: ['polygon_area'] },
        { taskType: 'polygon_area', dependsOn: ['analysis'] },
      ],
    };
    expect(() => validateWorkflowDefinition(def)).toThrow(/Cyclic dependency detected/);
  });

  it('rejects an indirect three-task cycle', () => {
    const def: WorkflowDefinition = {
      name: 'cycle-3',
      steps: [
        { taskType: 'analysis', dependsOn: ['polygon_area'] },
        { taskType: 'polygon_area', dependsOn: ['notification'] },
        { taskType: 'notification', dependsOn: ['analysis'] },
      ],
    };
    expect(() => validateWorkflowDefinition(def)).toThrow(/Cyclic dependency detected/);
  });
});

describe('findCycle', () => {
  it('returns null for an empty workflow', () => {
    expect(findCycle([])).toBeNull();
  });

  it('returns null for a workflow with no dependencies', () => {
    expect(
      findCycle([{ taskType: 'analysis' }, { taskType: 'polygon_area' }]),
    ).toBeNull();
  });

  it('returns null for a DAG (linear chain)', () => {
    expect(
      findCycle([
        { taskType: 'analysis' },
        { taskType: 'polygon_area', dependsOn: ['analysis'] },
        { taskType: 'notification', dependsOn: ['polygon_area'] },
      ]),
    ).toBeNull();
  });

  it('returns the cycle path for a two-task cycle', () => {
    const cycle = findCycle([
      { taskType: 'analysis', dependsOn: ['polygon_area'] },
      { taskType: 'polygon_area', dependsOn: ['analysis'] },
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle?.[0]).toBe(cycle?.[cycle.length - 1]);
  });
});
