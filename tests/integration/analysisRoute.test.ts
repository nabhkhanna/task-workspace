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
  homeRoute,
} from '../../src/routes';
import { createWorkflowService } from '../../src/services';
import { createTestDataSource } from '../_helpers';

const germanyRingCoords = [
  [10.4, 51.1],
  [10.5, 51.1],
  [10.5, 51.2],
  [10.4, 51.2],
  [10.4, 51.1],
];

const validGeoJson = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [germanyRingCoords],
  },
  properties: {},
};

const validBarePolygon = {
  type: 'Polygon' as const,
  coordinates: [germanyRingCoords],
};

const validBareMultiPolygon = {
  type: 'MultiPolygon' as const,
  coordinates: [[germanyRingCoords]],
};

const validMultiPolygonFeature = {
  type: 'Feature' as const,
  geometry: validBareMultiPolygon,
  properties: { name: 'archipelago' },
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

  it('accepts a bare Polygon and normalizes to Feature for storage', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: validBarePolygon });

    expect(response.status).toBe(202);
    const workflow = await workflowRepository.findByIdWithTasks(response.body.workflowId);
    expect(workflow?.geoJson.type).toBe('Feature');
    expect(workflow?.geoJson.geometry.type).toBe('Polygon');
  });

  it('rejects a bare MultiPolygon — endpoint is polygon-only by design', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: validBareMultiPolygon });

    expect(response.status).toBe(400);
    expect(await workflowRepository.count()).toBe(0);
  });

  it('rejects a Feature wrapping a MultiPolygon', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: validMultiPolygonFeature });

    expect(response.status).toBe(400);
    expect(await workflowRepository.count()).toBe(0);
  });

  it('rejects geoJson that is not any known type', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: { type: 'NotAFeature' } });

    expect(response.status).toBe(400);
    expect(await workflowRepository.count()).toBe(0);
  });

  it('rejects geoJson missing the geometry field', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 'acme', geoJson: { type: 'Feature', properties: {} } });

    expect(response.status).toBe(400);
    expect(await taskRepository.count()).toBe(0);
  });

  it('rejects a missing clientId at the boundary', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ geoJson: validGeoJson });

    expect(response.status).toBe(400);
    expect(await workflowRepository.count()).toBe(0);
  });

  it('rejects a non-string clientId at the boundary', async () => {
    const response = await request(app)
      .post('/analysis')
      .send({ clientId: 42, geoJson: validGeoJson });

    expect(response.status).toBe(400);
    expect(await workflowRepository.count()).toBe(0);
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
