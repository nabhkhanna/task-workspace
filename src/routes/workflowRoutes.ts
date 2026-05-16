import { Router } from 'express';
import { z } from 'zod';
import { deriveWorkflowStatus } from '../entities';
import { repositories } from '../repositories';

const router = Router();

const WorkflowIdParamsSchema = z.object({
  id: z.string().uuid(),
});

router.get('/:id/status', async (req, res) => {
  const parsedParams = WorkflowIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: 'Invalid workflow id' });
    return;
  }

  try {
    const workflow = await repositories.workflowRepository.findByIdWithTasks(parsedParams.data.id);
    if (!workflow) {
      res.status(404).json({ message: 'Workflow not found' });
      return;
    }
    res.json({
      workflowId: workflow.id,
      status: deriveWorkflowStatus(workflow.tasks),
      completedTasks: workflow.tasks.filter((task) => task.status === 'completed').length,
      totalTasks: workflow.tasks.length,
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, 'workflow.status_lookup_failed');
    res.status(500).json({ message: 'Failed to load workflow status' });
  }
});

router.get('/:id/results', async (req, res) => {
  const parsedParams = WorkflowIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: 'Invalid workflow id' });
    return;
  }

  try {
    const workflow = await repositories.workflowRepository.findByIdWithTasks(parsedParams.data.id);
    if (!workflow) {
      res.status(404).json({ message: 'Workflow not found' });
      return;
    }
    if (workflow.finalResult === null) {
      res.status(400).json({ message: 'Workflow is not yet completed' });
      return;
    }
    res.json({
      workflowId: workflow.id,
      status: deriveWorkflowStatus(workflow.tasks),
      finalResult: workflow.finalResult,
    });
  } catch (error: unknown) {
    req.log.error({ err: error }, 'workflow.results_lookup_failed');
    res.status(500).json({ message: 'Failed to load workflow results' });
  }
});

export default router;
