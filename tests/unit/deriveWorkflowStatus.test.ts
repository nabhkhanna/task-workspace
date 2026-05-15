import { describe, expect, it } from 'vitest';
import { deriveWorkflowStatus } from '../../src/entities';
import { makeTask } from '../_helpers';

describe('deriveWorkflowStatus', () => {
  it('reports initial when the workflow has no tasks yet', () => {
    expect(deriveWorkflowStatus([])).toBe('initial');
  });

  it('reports failed as soon as any task has failed', () => {
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'failed' }),
      makeTask({ status: 'queued' }),
    ];
    expect(deriveWorkflowStatus(tasks)).toBe('failed');
  });

  it('reports completed only when every task is completed', () => {
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'completed' }),
    ];
    expect(deriveWorkflowStatus(tasks)).toBe('completed');
  });

  it('reports in_progress when tasks are a mix of queued and completed', () => {
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'queued' }),
    ];
    expect(deriveWorkflowStatus(tasks)).toBe('in_progress');
  });

  it('reports in_progress while a single task is running', () => {
    expect(deriveWorkflowStatus([makeTask({ status: 'in_progress' })])).toBe('in_progress');
  });
});
