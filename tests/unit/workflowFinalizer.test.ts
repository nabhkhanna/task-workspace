import { describe, expect, it } from 'vitest';
import { buildFinalResult } from '../../src/services/workflow-service';
import { makeTask, makeWorkflow } from '../_helpers';

const ATTEMPTED_AT = '2026-05-16T12:00:00.000Z';

describe('buildFinalResult', () => {
  it('includes every task in the workflow with taskId, type, and output', () => {
    const workflow = makeWorkflow({ id: 'wf-1' });
    const analysis = makeTask({
      id: 'task-analysis',
      workflow,
      type: 'analysis',
      status: 'completed',
      output: { type: 'analysis', country: 'Germany' },
    });
    const polygon = makeTask({
      id: 'task-polygon',
      workflow,
      type: 'polygon_area',
      status: 'completed',
      output: { type: 'polygon_area', areaM2: 12345 },
    });
    workflow.tasks = [analysis, polygon];

    const result = buildFinalResult(workflow);

    expect(result.workflowId).toBe('wf-1');
    expect(result.tasks).toEqual([
      {
        taskId: 'task-analysis',
        type: 'analysis',
        output: { type: 'analysis', country: 'Germany' },
      },
      {
        taskId: 'task-polygon',
        type: 'polygon_area',
        output: { type: 'polygon_area', areaM2: 12345 },
      },
    ]);
  });

  it('uses the brief-specified finalReport string verbatim', () => {
    const workflow = makeWorkflow({ id: 'wf-2' });
    workflow.tasks = [
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
    ];

    expect(buildFinalResult(workflow).finalReport).toBe(
      'Aggregated workflow results go here',
    );
  });

  it('includes the last errorHistory entry as `error` on a failed task', () => {
    const workflow = makeWorkflow({ id: 'wf-3' });
    const failedTask = makeTask({
      id: 'task-failed',
      workflow,
      type: 'polygon_area',
      status: 'failed',
      output: null,
      errorHistory: [
        { attemptedAt: ATTEMPTED_AT, error: 'first attempt' },
        { attemptedAt: ATTEMPTED_AT, error: 'final attempt' },
      ],
    });
    const completedTask = makeTask({
      id: 'task-ok',
      workflow,
      type: 'analysis',
      status: 'completed',
      output: { type: 'analysis', country: 'Germany' },
    });
    workflow.tasks = [failedTask, completedTask];

    const result = buildFinalResult(workflow);

    expect(result.tasks[0]).toEqual({
      taskId: 'task-failed',
      type: 'polygon_area',
      output: null,
      error: 'final attempt',
    });
    expect('error' in result.tasks[1]).toBe(false);
  });

  it('includes the report_generation task itself (nested report payload)', () => {
    const workflow = makeWorkflow({ id: 'wf-4' });
    const analysis = makeTask({
      id: 'task-analysis',
      workflow,
      type: 'analysis',
      status: 'completed',
      output: { type: 'analysis', country: 'Germany' },
    });
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'completed',
      output: {
        type: 'report_generation',
        report: {
          workflowId: 'wf-4',
          tasks: [
            {
              taskId: 'task-analysis',
              type: 'analysis',
              output: { type: 'analysis', country: 'Germany' },
            },
          ],
          finalReport: 'Aggregated data and results',
        },
      },
    });
    workflow.tasks = [analysis, reportTask];

    const result = buildFinalResult(workflow);

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[1].taskId).toBe('task-report');
    expect(result.tasks[1].output?.type).toBe('report_generation');
    if (result.tasks[1].output?.type === 'report_generation') {
      expect(result.tasks[1].output.report.tasks).toHaveLength(1);
    }
  });

  it('handles an empty workflow (no tasks)', () => {
    const workflow = makeWorkflow({ id: 'wf-empty' });
    workflow.tasks = [];

    const result = buildFinalResult(workflow);

    expect(result).toEqual({
      workflowId: 'wf-empty',
      tasks: [],
      finalReport: 'Aggregated workflow results go here',
    });
  });
});
