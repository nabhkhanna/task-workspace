import path from 'node:path';
import { Router } from 'express';
import { AppDataSource } from '../data-source';
import { WorkflowFactory } from '../workflows/WorkflowFactory'; // Create a folder for factories if you prefer

const router = Router();
const workflowFactory = new WorkflowFactory(AppDataSource);

router.post('/', async (req, res) => {
  const { clientId, geoJson } = req.body;
  const workflowFile = path.join(__dirname, '../workflows/example_workflow.yml');

  try {
    const workflow = await workflowFactory.createWorkflowFromYAML(
      workflowFile,
      clientId,
      JSON.stringify(geoJson),
    );

    res.status(202).json({
      workflowId: workflow.workflowId,
      message: 'Workflow created and tasks queued from YAML definition.',
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, 'workflow.creation_failed');
    res.status(500).json({ message: 'Failed to create workflow' });
  }
});

export default router;
