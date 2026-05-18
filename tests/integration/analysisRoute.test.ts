import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
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
} from '../../src/routes';
import { createWorkflowService } from '../../src/services';
import { createTestDataSource } from '../_helpers';

const validGeoJson = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
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

describe('POST /analysis', () => {
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

  it('creates a workflow and queues the YAML-defined tasks on valid input', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: validGeoJson });

    expect(response.status).toBe(202);
    expect(response.body.workflowId).toEqual(expect.any(String));

    const workflow = await workflowRepository.findByIdWithTasks(response.body.workflowId);
    expect(workflow).not.toBeNull();
    expect(workflow?.clientId).toBe('acme');
    expect(workflow?.geoJson).toEqual(validGeoJson);
    expect(workflow?.tasks).toHaveLength(4);
    expect(workflow?.tasks.map((t) => t.type).sort()).toEqual([
      'analysis',
      'notification',
      'polygon_area',
      'report_generation',
    ]);
    expect(workflow?.tasks.every((t) => t.status === 'queued')).toBe(true);
    expect(workflow?.tasks.every((t) => t.attemptCount === 0)).toBe(true);
  });

  it('rejects geoJson that is not a Polygon Feature', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: { type: 'NotAFeature' } });

    expect(response.status).toBe(500);
    expect(await workflowRepository.count()).toBe(0);
  });

  it('rejects geoJson missing the geometry field', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: { type: 'Feature', properties: {} } });

    expect(response.status).toBe(500);
    expect(await taskRepository.count()).toBe(0);
  });

  it('persists the workflow even before the worker has run any task', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: validGeoJson });

    expect(await taskRepository.count({ where: { status: 'in_progress' } })).toBe(0);

    const workflow = await workflowRepository.findByIdWithTasks(response.body.workflowId);
    expect(workflow?.tasks.every((t) => t.output === null)).toBe(true);
  });
});
