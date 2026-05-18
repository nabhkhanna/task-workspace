import path from 'node:path';
import { Router } from 'express';
import type { WorkflowService } from '../services';

const WORKFLOW_YAML_PATH = path.join(__dirname, '../workflows/example_workflow.yml');

export function createAnalysisRoutes(workflowService: WorkflowService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { clientId, geoJson } = req.body;

    try {
      const workflow = await workflowService.createFromYaml(WORKFLOW_YAML_PATH, clientId, geoJson);

      res.status(202).json({
        workflowId: workflow.id,
        message: 'Workflow created and tasks queued from YAML definition.',
      });
    } catch (error: unknown) {
      req.log.error({ err: error }, 'workflow.creation_failed');
      res.status(500).json({ message: 'Failed to create workflow' });
    }
  });

  return router;
}
