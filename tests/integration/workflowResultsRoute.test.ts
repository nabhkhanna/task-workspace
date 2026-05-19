import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { WorkflowFinalResult } from '../../src/entities';
import {
  createTaskRepository,
  createWorkflowRepository,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import {
  createAnalysisRoutes,
  createWorkflowRoutes,
  healthRoute,
  homeRoute,
} from '../../src/routes';
import { createWorkflowService } from '../../src/services';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

describe('GET /workflow/:id/results', () => {
  let dataSource: DataSource;
  let taskRepository: TaskRepository;
  let workflowRepository: WorkflowRepository;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    taskRepository = createTaskRepository(dataSource);
    workflowRepository = createWorkflowRepository(dataSource);
    const workflowService = createWorkflowService({ workflowRepository, taskRepository });
    app = createApp({
      homeRoute,
      healthRoute,
      analysisRoutes: createAnalysisRoutes(workflowService),
      workflowRoutes: createWorkflowRoutes(workflowRepository),
    });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await taskRepository.clear();
    await workflowRepository.clear();
  });

  it('returns 404 when the workflow id is unknown', async () => {
    const response = await request(app).get('/workflow/00000000-0000-0000-0000-000000000000/results');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Workflow not found' });
  });

  it('returns 400 when the workflow id is not a valid UUID', async () => {
    const response = await request(app).get('/workflow/not-a-uuid/results');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid workflow id' });
  });

  it('returns the finalResult for a completed workflow', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'done' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'completed' }),
    ]);
    const finalResult: WorkflowFinalResult = {
      workflowId: workflow.id,
      tasks: [
        { taskId: 'task-1', type: 'analysis', output: { type: 'analysis', country: 'Germany' } },
        { taskId: 'task-2', type: 'polygon_area', output: { type: 'polygon_area', areaM2: 999 } },
      ],
      finalReport: 'Aggregated workflow results go here',
    };
    workflow.finalResult = finalResult;
    await workflowRepository.save(workflow);

    const response = await request(app).get(`/workflow/${workflow.id}/results`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'completed',
      finalResult,
    });
  });

  it('returns the finalResult for a failed workflow (failure is terminal)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'failed' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'failed' }),
    ]);
    const finalResult: WorkflowFinalResult = {
      workflowId: workflow.id,
      tasks: [
        { taskId: 'task-1', type: 'analysis', output: null, error: 'boom' },
      ],
      finalReport: 'Aggregated workflow results go here',
    };
    workflow.finalResult = finalResult;
    await workflowRepository.save(workflow);

    const response = await request(app).get(`/workflow/${workflow.id}/results`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'failed',
      finalResult,
    });
  });

  it('returns 400 when the workflow is still in progress (finalResult is null)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'in-progress' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'in_progress' }),
    ]);

    const response = await request(app).get(`/workflow/${workflow.id}/results`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Workflow is not yet completed' });
  });

  it('returns 400 when a terminal workflow has no finalResult yet (finalizer corner case)', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'orphan' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
    ]);

    const response = await request(app).get(`/workflow/${workflow.id}/results`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Workflow is not yet completed' });
  });
});
