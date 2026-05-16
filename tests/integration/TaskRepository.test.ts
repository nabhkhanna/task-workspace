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

describe('TaskRepository.findNextRunnableTask', () => {
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

  it('returns the lowest-stepNumber runnable task when no earlier step blocks', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'A' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1, status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
      makeTask({ workflow, type: 'notification', stepNumber: 3 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next?.stepNumber).toBe(2);
    expect(next?.type).toBe('polygon_area');
  });

  it('skips a task whose nextAttemptAt is still in the future', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'B' }));
    await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        stepNumber: 1,
        nextAttemptAt: new Date(Date.now() + FUTURE_OFFSET_MS),
      }),
    );

    const next = await taskRepository.findNextRunnableTask();

    expect(next).toBeNull();
  });

  it('returns a task once its nextAttemptAt has passed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'C' }));
    await taskRepository.save(
      makeTask({
        workflow,
        type: 'analysis',
        stepNumber: 1,
        nextAttemptAt: new Date(Date.now() - PAST_OFFSET_MS),
      }),
    );

    const next = await taskRepository.findNextRunnableTask();

    expect(next?.stepNumber).toBe(1);
  });

  it('does not return a later step while an earlier step is still queued', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'D' }));
    await taskRepository.save([
      makeTask({
        workflow,
        type: 'analysis',
        stepNumber: 1,
        nextAttemptAt: new Date(Date.now() + FUTURE_OFFSET_MS),
      }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next).toBeNull();
  });

  it('does not return a later step while an earlier step is in_progress', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'E' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1, status: 'in_progress' }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next).toBeNull();
  });

  it('releases the later step once the earlier step is completed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'F' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1, status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next?.stepNumber).toBe(2);
  });

  it('releases the later step when the earlier step is failed (failure is terminal)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'G' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', stepNumber: 1, status: 'failed' }),
      makeTask({ workflow, type: 'polygon_area', stepNumber: 2 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next?.stepNumber).toBe(2);
  });

  it('scopes the sequencing block per workflow', async () => {
    const blocked = await workflowRepository.save(makeWorkflow({ clientId: 'blocked' }));
    const unblocked = await workflowRepository.save(makeWorkflow({ clientId: 'unblocked' }));
    await taskRepository.save([
      makeTask({ workflow: blocked, type: 'analysis', stepNumber: 1, status: 'in_progress' }),
      makeTask({ workflow: blocked, type: 'polygon_area', stepNumber: 2 }),
      makeTask({ workflow: unblocked, type: 'analysis', stepNumber: 1 }),
    ]);

    const next = await taskRepository.findNextRunnableTask();

    expect(next?.workflow.id).toBe(unblocked.id);
    expect(next?.stepNumber).toBe(1);
  });
});
