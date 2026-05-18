import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

const FUTURE_OFFSET_MS = 60_000;
const PAST_OFFSET_MS = 60_000;

describe('TaskRepository.findNextRunnable', () => {
  let dataSource: DataSource;
  let taskRepository: TaskRepository;
  let workflowRepository: WorkflowRepository;

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

  it('returns null when no queued tasks exist', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'empty' }));
    await taskRepository.save(
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
    );

    expect(await taskRepository.findNextRunnable()).toBeNull();
  });

  it('returns a task that has no dependencies', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'no-deps' }));
    await taskRepository.save(makeTask({ workflow, type: 'analysis' }));

    const next = await taskRepository.findNextRunnable();

    expect(next?.type).toBe('analysis');
  });

  it('skips a task whose nextAttemptAt is still in the future', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'backoff' }));
    await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        nextAttemptAt: new Date(Date.now() + FUTURE_OFFSET_MS),
      }),
    );

    expect(await taskRepository.findNextRunnable()).toBeNull();
  });

  it('returns a task once its nextAttemptAt has passed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'past-backoff' }));
    await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        nextAttemptAt: new Date(Date.now() - PAST_OFFSET_MS),
      }),
    );

    const next = await taskRepository.findNextRunnable();
    expect(next?.type).toBe('analysis');
  });

  it('does not return a task while a dependency is still queued', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'dep-queued' }));
    const dependency = makeTask({ workflow, type: 'analysis' });
    const dependent = makeTask({ workflow, type: 'polygon_area' });
    await taskRepository.save([dependency, dependent]);
    dependent.dependencies = [dependency];
    await taskRepository.save([dependent]);

    expect(await taskRepository.findNextRunnable()).not.toBeNull();
    const next = await taskRepository.findNextRunnable();
    expect(next?.id).toBe(dependency.id);
  });

  it('does not return a task while a dependency is in_progress', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'dep-running' }));
    const dependency = makeTask({ workflow, type: 'analysis', status: 'in_progress' });
    const dependent = makeTask({ workflow, type: 'polygon_area' });
    await taskRepository.save([dependency, dependent]);
    dependent.dependencies = [dependency];
    await taskRepository.save([dependent]);

    const next = await taskRepository.findNextRunnable();
    expect(next).toBeNull();
  });

  it('returns a task once its dependency is completed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'dep-done' }));
    const dependency = makeTask({ workflow, type: 'analysis', status: 'completed' });
    const dependent = makeTask({ workflow, type: 'polygon_area' });
    await taskRepository.save([dependency, dependent]);
    dependent.dependencies = [dependency];
    await taskRepository.save([dependent]);

    const next = await taskRepository.findNextRunnable();
    expect(next?.id).toBe(dependent.id);
  });

  it('returns a task even when its dependency failed (failure is terminal)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'dep-failed' }));
    const dependency = makeTask({ workflow, type: 'analysis', status: 'failed' });
    const dependent = makeTask({ workflow, type: 'polygon_area' });
    await taskRepository.save([dependency, dependent]);
    dependent.dependencies = [dependency];
    await taskRepository.save([dependent]);

    const next = await taskRepository.findNextRunnable();
    expect(next?.id).toBe(dependent.id);
  });

  it('requires ALL dependencies to be terminal (one queued blocks the dependent)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'multi-deps' }));
    const doneDep = makeTask({ workflow, type: 'analysis', status: 'completed' });
    const stillRunningDep = makeTask({ workflow, type: 'polygon_area' });
    const dependent = makeTask({ workflow, type: 'report_generation' });
    await taskRepository.save([doneDep, stillRunningDep, dependent]);
    dependent.dependencies = [doneDep, stillRunningDep];
    await taskRepository.save([dependent]);

    const next = await taskRepository.findNextRunnable();
    expect(next?.id).toBe(stillRunningDep.id);
  });
});
