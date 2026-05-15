import type { Feature, Polygon } from 'geojson';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { TaskWorker } from '../../src/workers';
import { runAnalysis, runNotification } from '../../src/workers/jobs';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

const germanyPolygon: Feature<Polygon> = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [10.4, 51.1],
        [10.5, 51.1],
        [10.5, 51.2],
        [10.4, 51.2],
        [10.4, 51.1],
      ],
    ],
  },
  properties: {},
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

describe('TaskWorker end-to-end with real handlers and real DB', () => {
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

  it('runs a multi-task workflow through to completion in step order', async () => {
    const workflow = await workflowRepository.save(
      makeWorkflow({ clientId: 'e2e', geoJson: germanyPolygon }),
    );
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1 }),
      makeTask({ workflow, type: 'notification', stepNumber: 2 }),
    ]);

    worker = new TaskWorker({
      taskRepository,
      handlers: { analysis: runAnalysis, notification: runNotification },
      maxRetries: 0,
      pollIntervalMs: 10,
    });
    worker.start();

    await waitForCondition(
      async () => (await taskRepository.count({ where: { status: 'completed' } })) === 2,
      { timeoutMs: 5_000, intervalMs: 25 },
    );

    const persisted = await workflowRepository.findByIdWithTasks(workflow.id);
    const tasks = persisted?.tasks.sort((a, b) => a.stepNumber - b.stepNumber) ?? [];

    expect(tasks).toHaveLength(2);
    expect(tasks[0].type).toBe('analysis');
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].output).toEqual({ type: 'analysis', country: 'Germany' });
    expect(tasks[0].attemptCount).toBe(1);

    expect(tasks[1].type).toBe('notification');
    expect(tasks[1].status).toBe('completed');
    expect(tasks[1].output).toEqual({ type: 'notification' });
    expect(tasks[1].attemptCount).toBe(1);

    expect(tasks[0].updatedAt.getTime()).toBeLessThanOrEqual(tasks[1].updatedAt.getTime());
  });

  it('does not pick up a task whose nextAttemptAt is still in the future', async () => {
    const workflow = await workflowRepository.save(
      makeWorkflow({ clientId: 'backoff', geoJson: germanyPolygon }),
    );
    const futureTask = await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        stepNumber: 1,
        nextAttemptAt: new Date(Date.now() + 60_000),
      }),
    );

    worker = new TaskWorker({
      taskRepository,
      handlers: { analysis: runAnalysis, notification: runNotification },
      maxRetries: 0,
      pollIntervalMs: 10,
    });
    worker.start();

    await new Promise((resolve) => setTimeout(resolve, 200));

    const reloaded = await taskRepository.findOneByOrFail({ id: futureTask.id });
    expect(reloaded.status).toBe('queued');
    expect(reloaded.attemptCount).toBe(0);
  });
});
