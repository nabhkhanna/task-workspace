import path from 'node:path';
import { Router } from 'express';
import type { Feature, Polygon } from 'geojson';
import { z } from 'zod';
import { GeoJsonInputSchema } from '../data/geojsonSchemas';
import type { WorkflowService } from '../services';

const WORKFLOW_YAML_PATH = path.join(__dirname, '../workflows/example_workflow.yml');

const AnalysisRequestSchema = z.object({
  clientId: z.string().min(1),
  geoJson: GeoJsonInputSchema,
});

type GeoJsonInput = z.infer<typeof GeoJsonInputSchema>;

function toFeature(input: GeoJsonInput): Feature<Polygon> {
  if (input.type === 'Feature') {
    return input;
  }
  return { type: 'Feature', geometry: input, properties: null };
}

export function createAnalysisRoutes(workflowService: WorkflowService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = AnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid request', issues: parsed.error.issues });
      return;
    }
    const { clientId, geoJson } = parsed.data;
    const normalized = toFeature(geoJson);

    try {
      const workflow = await workflowService.createFromYaml(
        WORKFLOW_YAML_PATH,
        clientId,
        normalized,
      );

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
