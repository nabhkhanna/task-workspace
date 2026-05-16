import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TaskType } from '../../src/entities';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
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

  it('picks up queued tasks, dispatches by type, and persists completed state', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'loop' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1 }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
      makeTask({ workflow, type: 'notification', stepNumber: 3 }),
      makeTask({ workflow, type: 'report_generation', stepNumber: 4 }),
    ]);

    worker = new TaskWorker({
      taskRepository,
      handlers: TEST_HANDLERS,
      maxRetries: 0,
      pollIntervalMs: WORKER_POLL_INTERVAL_MS,
    });
    worker.start();

    await waitForCondition(
      async () => (await taskRepository.count({ where: { status: 'completed' } })) === 4,
      { timeoutMs: WAIT_TIMEOUT_MS, intervalMs: WAIT_POLL_INTERVAL_MS },
    );

    const persisted = await workflowRepository.findByIdWithTasks(workflow.id);
    const tasksByStep = [...(persisted?.tasks ?? [])].sort(
      (a, b) => a.stepNumber - b.stepNumber,
    );

    expect(tasksByStep).toHaveLength(4);
    expect(tasksByStep[0].status).toBe('completed');
    expect(tasksByStep[0].output).toEqual({ type: 'analysis', country: 'Testlandia' });
    expect(tasksByStep[0].attemptCount).toBe(1);

    expect(tasksByStep[1].status).toBe('completed');
    expect(tasksByStep[1].output).toEqual({ type: 'polygon_area', areaM2: 999 });
    expect(tasksByStep[1].attemptCount).toBe(1);

    expect(tasksByStep[2].status).toBe('completed');
    expect(tasksByStep[2].output).toEqual({ type: 'notification' });
    expect(tasksByStep[2].attemptCount).toBe(1);

    expect(tasksByStep[3].status).toBe('completed');
    expect(tasksByStep[3].output).toEqual({
      type: 'report_generation',
      report: { workflowId: workflow.id, tasks: [], finalReport: 'test stub' },
    });
    expect(tasksByStep[3].attemptCount).toBe(1);
  });

  it('does not pick up a task whose nextAttemptAt is still in the future', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'backoff' }));
    const deferredTask = await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        stepNumber: 1,
        nextAttemptAt: new Date(Date.now() + NEXT_ATTEMPT_FAR_FUTURE_MS),
      }),
    );

    worker = new TaskWorker({
      taskRepository,
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
