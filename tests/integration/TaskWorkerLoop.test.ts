import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Task, TaskType, Workflow } from '../../src/entities';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { createFinalizeWorkflow } from '../../src/services';
import { TaskWorker } from '../../src/workers';
import type { JobFn } from '../../src/workers/jobs';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

const WORKER_POLL_INTERVAL_MS = 10;
const WAIT_TIMEOUT_MS = 5_000;
const WAIT_POLL_INTERVAL_MS = 25;
const NEXT_ATTEMPT_FAR_FUTURE_MS = 60_000;
const BACKOFF_OBSERVATION_WINDOW_MS = 200;

const TEST_HANDLERS: Record<TaskType, JobFn> = {
  analysis: () => Promise.resolve({ type: 'analysis', country: 'Testlandia' }),
  notification: () => Promise.resolve({ type: 'notification' }),
  polygon_area: () => Promise.resolve({ type: 'polygon_area', areaM2: 999 }),
  report_generation: (task) =>
    Promise.resolve({
      type: 'report_generation',
      report: { workflowId: task.workflow.id, tasks: [], finalReport: 'test stub' },
    }),
};

async function waitForCondition(
  predicate: () => Promise<boolean>,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

interface FanInWorkflowRun {
  worker: TaskWorker;
  workflow: Workflow;
  tasksByType: Map<TaskType, Task>;
}

/**
 * Persists a fan-in workflow (analysis + polygon_area → report → notification),
 * runs it to completion via a real TaskWorker, and returns the reloaded
 * workflow + a type-indexed task map. Used by tests that each assert a
 * single concern (statuses, ordering, finalResult) about the completed run.
 */
async function runFanInWorkflowToCompletion(
  taskRepository: TaskRepository,
  workflowRepository: WorkflowRepository,
): Promise<FanInWorkflowRun> {
  const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'loop' }));
  const analysis = makeTask({ workflow, type: 'analysis' });
  const polygon = makeTask({ workflow, type: 'polygon_area' });
  const report = makeTask({ workflow, type: 'report_generation' });
  const notification = makeTask({ workflow, type: 'notification' });
  await taskRepository.save([analysis, polygon, report, notification]);
  report.dependencies = [analysis, polygon];
  notification.dependencies = [report];
  await taskRepository.save([report, notification]);

  const worker = new TaskWorker({
    taskStore: taskRepository,
    handlers: TEST_HANDLERS,
    maxRetries: 0,
    pollIntervalMs: WORKER_POLL_INTERVAL_MS,
    onTaskCompleted: createFinalizeWorkflow(workflowRepository),
  });
  worker.start();

  await waitForCondition(
    async () => {
      const reloaded = await workflowRepository.findOneByOrFail({ id: workflow.id });
      return reloaded.finalResult !== null;
    },
    { timeoutMs: WAIT_TIMEOUT_MS, intervalMs: WAIT_POLL_INTERVAL_MS },
  );

  const persisted = await workflowRepository.findByIdWithTasks(workflow.id);
  if (!persisted) {
    throw new Error('workflow disappeared after completion');
  }
  const tasksByType = new Map<TaskType, Task>(persisted.tasks.map((t) => [t.type, t]));

  return { worker, workflow: persisted, tasksByType };
}

describe('TaskWorker loop with real repository and test handlers', () => {
  let dataSource: DataSource;
  let taskRepository: TaskRepository;
  let workflowRepository: WorkflowRepository;
  let worker: TaskWorker | null = null;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    taskRepository = createTaskRepository(dataSource);
    workflowRepository = createWorkflowRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await taskRepository.clear();
    await workflowRepository.clear();
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
  });

  it('processes a fan-in DAG to completion with the expected task outputs', async () => {
    const run = await runFanInWorkflowToCompletion(taskRepository, workflowRepository);
    worker = run.worker;

    expect(run.workflow.tasks).toHaveLength(4);
    expect(run.tasksByType.get('analysis')?.status).toBe('completed');
    expect(run.tasksByType.get('analysis')?.output).toEqual({
      type: 'analysis',
      country: 'Testlandia',
    });
    expect(run.tasksByType.get('polygon_area')?.status).toBe('completed');
    expect(run.tasksByType.get('polygon_area')?.output).toEqual({
      type: 'polygon_area',
      areaM2: 999,
    });
    expect(run.tasksByType.get('report_generation')?.status).toBe('completed');
    expect(run.tasksByType.get('report_generation')?.output).toEqual({
      type: 'report_generation',
      report: { workflowId: run.workflow.id, tasks: [], finalReport: 'test stub' },
    });
    expect(run.tasksByType.get('notification')?.status).toBe('completed');
    expect(run.tasksByType.get('notification')?.output).toEqual({ type: 'notification' });
  });

  it('respects DAG ordering — downstream tasks finish after their dependencies', async () => {
    const run = await runFanInWorkflowToCompletion(taskRepository, workflowRepository);
    worker = run.worker;

    const analysisFinished = run.tasksByType.get('analysis')?.updatedAt.getTime() ?? 0;
    const polygonFinished = run.tasksByType.get('polygon_area')?.updatedAt.getTime() ?? 0;
    const reportFinished = run.tasksByType.get('report_generation')?.updatedAt.getTime() ?? 0;
    const notificationFinished = run.tasksByType.get('notification')?.updatedAt.getTime() ?? 0;

    expect(analysisFinished).toBeLessThanOrEqual(reportFinished);
    expect(polygonFinished).toBeLessThanOrEqual(reportFinished);
    expect(reportFinished).toBeLessThanOrEqual(notificationFinished);
  });

  it('writes finalResult to the workflow once the last task completes', async () => {
    const run = await runFanInWorkflowToCompletion(taskRepository, workflowRepository);
    worker = run.worker;

    expect(run.workflow.finalResult).not.toBeNull();
    expect(run.workflow.finalResult?.workflowId).toBe(run.workflow.id);
    expect(run.workflow.finalResult?.finalReport).toBe('Aggregated workflow results go here');
    expect(run.workflow.finalResult?.tasks).toHaveLength(4);
    const finalTaskTypes = run.workflow.finalResult?.tasks.map((t) => t.type).sort() ?? [];
    expect(finalTaskTypes).toEqual([
      'analysis',
      'notification',
      'polygon_area',
      'report_generation',
    ]);
  });

  it('does not pick up a task whose nextAttemptAt is still in the future', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'backoff' }));
    const deferredTask = await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        nextAttemptAt: new Date(Date.now() + NEXT_ATTEMPT_FAR_FUTURE_MS),
      }),
    );

    worker = new TaskWorker({
      taskStore: taskRepository,
      handlers: TEST_HANDLERS,
      maxRetries: 0,
      pollIntervalMs: WORKER_POLL_INTERVAL_MS,
    });
    worker.start();

    await new Promise((resolve) => setTimeout(resolve, BACKOFF_OBSERVATION_WINDOW_MS));

    const reloaded = await taskRepository.findOneByOrFail({ id: deferredTask.id });
    expect(reloaded.status).toBe('queued');
    expect(reloaded.attemptCount).toBe(0);
  });
});
