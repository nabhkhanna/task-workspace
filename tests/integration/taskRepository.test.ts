import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

describe('TaskRepository', () => {
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

  describe('findNextQueued', () => {
    it('returns null when no tasks are queued', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      await taskRepository.save(makeTask({ workflow, status: 'completed' }));

      expect(await taskRepository.findNextQueued()).toBeNull();
    });

    it('returns the queued task with the lowest stepNumber', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      await taskRepository.save(makeTask({ workflow, stepNumber: 2 }));
      const earlier = await taskRepository.save(makeTask({ workflow, stepNumber: 1 }));

      const next = await taskRepository.findNextQueued();

      expect(next?.id).toBe(earlier.id);
      expect(next?.stepNumber).toBe(1);
    });

    it('eager-loads the workflow relation', async () => {
      const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'eager-test' }));
      await taskRepository.save(makeTask({ workflow }));

      const next = await taskRepository.findNextQueued();

      expect(next?.workflow.clientId).toBe('eager-test');
    });

    it('skips queued tasks whose nextAttemptAt is still in the future', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      const futureMs = Date.now() + 60_000;
      await taskRepository.save(makeTask({ workflow, nextAttemptAt: new Date(futureMs) }));

      expect(await taskRepository.findNextQueued()).toBeNull();
    });

    it('returns queued tasks whose nextAttemptAt has elapsed', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      const pastMs = Date.now() - 60_000;
      const ready = await taskRepository.save(
        makeTask({ workflow, nextAttemptAt: new Date(pastMs) }),
      );

      const next = await taskRepository.findNextQueued();

      expect(next?.id).toBe(ready.id);
    });
  });

  describe('requeueInProgress', () => {
    it('resets tasks stuck in in_progress back to queued and returns the count', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      await taskRepository.save(makeTask({ workflow, status: 'in_progress', stepNumber: 1 }));
      await taskRepository.save(makeTask({ workflow, status: 'in_progress', stepNumber: 2 }));
      await taskRepository.save(makeTask({ workflow, status: 'completed', stepNumber: 3 }));

      const requeued = await taskRepository.requeueInProgress();

      expect(requeued).toBe(2);
      const next = await taskRepository.findNextQueued();
      expect(next?.status).toBe('queued');
    });

    it('returns 0 when no tasks are stuck', async () => {
      const workflow = await workflowRepository.save(makeWorkflow());
      await taskRepository.save(makeTask({ workflow, status: 'queued' }));

      expect(await taskRepository.requeueInProgress()).toBe(0);
    });
  });
});
