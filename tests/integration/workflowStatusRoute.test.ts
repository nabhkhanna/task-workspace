import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import {
  createTaskRepository,
  createWorkflowRepository,
  initRepositories,
  type TaskRepository,
  type WorkflowRepository,
} from '../../src/repositories';
import { createTestDataSource, makeTask, makeWorkflow } from '../_helpers';

describe('GET /workflow/:id/status', () => {
  let dataSource: DataSource;
  let taskRepository: TaskRepository;
  let workflowRepository: WorkflowRepository;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    initRepositories(dataSource);
    taskRepository = createTaskRepository(dataSource);
    workflowRepository = createWorkflowRepository(dataSource);
    app = createApp();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await taskRepository.clear();
    await workflowRepository.clear();
  });

  it('returns 404 when the workflow id is unknown', async () => {
    const response = await request(app).get('/workflow/00000000-0000-0000-0000-000000000000/status');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Workflow not found' });
  });

  it('returns 400 when the workflow id is not a valid UUID', async () => {
    const response = await request(app).get('/workflow/not-a-uuid/status');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid workflow id' });
  });

  it('reports completed status with the right counts for a fully-completed workflow', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'done' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'completed' }),
      makeTask({ workflow, type: 'notification', status: 'completed' }),
    ]);

    const response = await request(app).get(`/workflow/${workflow.id}/status`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'completed',
      completedTasks: 3,
      totalTasks: 3,
    });
  });

  it('reports in_progress with partial completedTasks for a mixed-state workflow', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'mixed' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'completed' }),
      makeTask({ workflow, type: 'notification', status: 'in_progress' }),
      makeTask({ workflow, type: 'report_generation', status: 'queued' }),
    ]);

    const response = await request(app).get(`/workflow/${workflow.id}/status`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'in_progress',
      completedTasks: 2,
      totalTasks: 4,
    });
  });

  it('reports failed when any task has failed', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'failed' }));
    await taskRepository.save([
      makeTask({ workflow, type: 'analysis', status: 'completed' }),
      makeTask({ workflow, type: 'polygon_area', status: 'failed' }),
    ]);

    const response = await request(app).get(`/workflow/${workflow.id}/status`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'failed',
      completedTasks: 1,
      totalTasks: 2,
    });
  });

  it('reports initial status for a workflow with zero tasks', async () => {
    const workflow = await workflowRepository.save(makeWorkflow({ clientId: 'empty' }));

    const response = await request(app).get(`/workflow/${workflow.id}/status`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workflowId: workflow.id,
      status: 'initial',
      completedTasks: 0,
      totalTasks: 0,
    });
  });
});
