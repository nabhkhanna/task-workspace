import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { createFinalizeWorkflow } from '../../src/services';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

describe('createFinalizeWorkflow', () => {
  let dataSource: DataSource;
  let taskRepository: TaskRepository;
  let workflowRepository: WorkflowRepository;
  let finalizeWorkflow: (workflowId: string) => Promise<void>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    taskRepository = createTaskRepository(dataSource);
    workflowRepository = createWorkflowRepository(dataSource);
    finalizeWorkflow = createFinalizeWorkflow(workflowRepository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await taskRepository.clear();
    await workflowRepository.clear();
  });

  it('does not finalize while a failed task coexists with an in_progress task', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'race-failed-then-running' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'failed', errorHistory: [
        { attemptedAt: '2026-05-19T10:00:00.000Z', error: 'analysis blew up' },
      ] }),
      makeTask({ workflow, type: 'polygon_area', status: 'in_progress' }),
    ]);

    await finalizeWorkflow(workflow.id);

    const reloaded = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(reloaded?.finalResult).toBeNull();
  });

  it('does not finalize while a failed task coexists with a queued task', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'race-failed-then-queued' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'failed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'queued' }),
    ]);

    await finalizeWorkflow(workflow.id);

    const reloaded = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(reloaded?.finalResult).toBeNull();
  });

  it('finalizes once the remaining tasks reach terminal state, capturing outputs from later-finishing tasks', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'late-finisher' }));
    const failedTask = await taskRepository.save(makeTask({
      workflow,
      type: 'analysis',
      status: 'failed',
      errorHistory: [{ attemptedAt: '2026-05-19T10:00:00.000Z', error: 'first to fail' }],
    }));
    const stillRunning = await taskRepository.save(makeTask({
      workflow,
      type: 'polygon_area',
      status: 'in_progress',
    }));

    // First finalize call while one task is still running — must not lock in.
    await finalizeWorkflow(workflow.id);
    const partial = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(partial?.finalResult).toBeNull();

    // The in-progress task now completes.
    stillRunning.status = 'completed';
    stillRunning.output = { type: 'polygon_area', areaM2: 42 };
    await taskRepository.save(stillRunning);

    await finalizeWorkflow(workflow.id);

    const finalized = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(finalized?.finalResult).not.toBeNull();
    expect(finalized?.finalResult?.workflowId).toBe(workflow.id);
    const tasks = finalized?.finalResult?.tasks ?? [];
    const entriesById = new Map(tasks.map((task) => [task.taskId, task]));
    expect(entriesById.get(failedTask.id)).toEqual({
      taskId: failedTask.id,
      type: 'analysis',
      output: null,
      error: 'first to fail',
    });
    expect(entriesById.get(stillRunning.id)).toEqual({
      taskId: stillRunning.id,
      type: 'polygon_area',
      output: { type: 'polygon_area', areaM2: 42 },
    });
  });

  it('finalizes a workflow whose tasks all completed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'all-good' }));
    await taskRepository.save([
      makeTask({
        workflow,
        type: 'analysis',
        status: 'completed',
        output: { type: 'analysis', country: 'Germany' },
      }),
      makeTask({
        workflow,
        type: 'polygon_area',
        status: 'completed',
        output: { type: 'polygon_area', areaM2: 100 },
      }),
    ]);

    await finalizeWorkflow(workflow.id);

    const reloaded = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(reloaded?.finalResult).not.toBeNull();
    expect(reloaded?.finalResult?.tasks.map((task) => task.type)).toEqual([
      'analysis',
      'polygon_area',
    ]);
  });

  it('is idempotent: a second call does not overwrite an existing finalResult', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'idempotent' }));
    await taskRepository.save([
      makeTask({
        workflow,
        type: 'analysis',
        status: 'completed',
        output: { type: 'analysis', country: 'Germany' },
      }),
    ]);
    await finalizeWorkflow(workflow.id);
    const firstSnapshot = await workflowRepository.findByIdWithTasks(workflow.id);
    const firstResult = firstSnapshot?.finalResult;
    expect(firstResult).not.toBeNull();

    await finalizeWorkflow(workflow.id);

    const secondSnapshot = await workflowRepository.findByIdWithTasks(workflow.id);
    expect(secondSnapshot?.finalResult).toEqual(firstResult);
  });

  it('returns silently when the workflow id is unknown', async () => {
    await expect(
      finalizeWorkflow('00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeUndefined();
  });
});
