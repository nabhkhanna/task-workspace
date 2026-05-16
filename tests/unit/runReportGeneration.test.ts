import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/workers/jobs';
import { makeTask, makeWorkflow } from '../_helpers';

const ATTEMPTED_AT = '2026-05-16T12:00:00.000Z';

describe('buildReport', () => {
  it('includes one entry per terminal sibling task with taskId, type, and output', () => {
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
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [analysis, polygon, reportTask];

    const report = buildReport(reportTask, workflow);

    expect(report.workflowId).toBe('wf-1');
    expect(report.tasks).toEqual([
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

  it('excludes the current report task from its own report', () => {
    const workflow = makeWorkflow({ id: 'wf-2' });
    const analysis = makeTask({
      id: 'task-analysis',
      workflow,
      type: 'analysis',
      status: 'completed',
    });
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [analysis, reportTask];

    const report = buildReport(reportTask, workflow);

    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].taskId).toBe('task-analysis');
  });

  it('excludes still-queued or in-progress sibling tasks', () => {
    const workflow = makeWorkflow({ id: 'wf-3' });
    const analysis = makeTask({
      id: 'task-analysis',
      workflow,
      type: 'analysis',
      status: 'completed',
    });
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    const trailing = makeTask({
      id: 'task-trailing',
      workflow,
      type: 'notification',
      status: 'queued',
    });
    workflow.tasks = [analysis, reportTask, trailing];

    const report = buildReport(reportTask, workflow);

    expect(report.tasks.map((t) => t.taskId)).toEqual(['task-analysis']);
  });

  it('includes the last errorHistory entry as `error` on a failed task', () => {
    const workflow = makeWorkflow({ id: 'wf-4' });
    const failedTask = makeTask({
      id: 'task-failed',
      workflow,
      type: 'analysis',
      status: 'failed',
      output: null,
      errorHistory: [
        { attemptedAt: ATTEMPTED_AT, error: 'first attempt' },
        { attemptedAt: ATTEMPTED_AT, error: 'final attempt' },
      ],
    });
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [failedTask, reportTask];

    const report = buildReport(reportTask, workflow);

    expect(report.tasks[0]).toEqual({
      taskId: 'task-failed',
      type: 'analysis',
      output: null,
      error: 'final attempt',
    });
  });

  it('omits the `error` field on completed tasks', () => {
    const workflow = makeWorkflow({ id: 'wf-5' });
    const completedTask = makeTask({
      id: 'task-ok',
      workflow,
      type: 'analysis',
      status: 'completed',
      output: { type: 'analysis', country: 'France' },
    });
    const reportTask = makeTask({
      id: 'task-report',
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [completedTask, reportTask];

    const report = buildReport(reportTask, workflow);

    expect('error' in report.tasks[0]).toBe(false);
  });

  it('uses the brief-specified finalReport string verbatim', () => {
    const workflow = makeWorkflow({ id: 'wf-6' });
    const a = makeTask({
      workflow,
      type: 'analysis',
      status: 'completed',
    });
    const reportTask = makeTask({
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [a, reportTask];

    const report = buildReport(reportTask, workflow);

    expect(report.finalReport).toBe('Aggregated data and results');
  });

  it('handles the degenerate case of zero preceding tasks', () => {
    const workflow = makeWorkflow({ id: 'wf-8' });
    const reportTask = makeTask({
      workflow,
      type: 'report_generation',
      status: 'in_progress',
    });
    workflow.tasks = [reportTask];

    const report = buildReport(reportTask, workflow);

    expect(report.tasks).toEqual([]);
    expect(report.finalReport).toBe('Aggregated data and results');
  });
});
