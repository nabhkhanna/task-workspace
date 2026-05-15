import type { Feature, Polygon } from 'geojson';
import { Workflow } from '../../src/entities';

const defaultGeoJson: Feature<Polygon> = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  properties: {},
};

interface MakeWorkflowOverrides {
  id?: string;
  clientId?: string;
  geoJson?: Feature<Polygon>;
}

export function makeWorkflow(overrides: MakeWorkflowOverrides = {}): Workflow {
  const workflow = new Workflow({
    clientId: overrides.clientId ?? 'test-client',
    geoJson: overrides.geoJson ?? defaultGeoJson,
  });
  if (overrides.id !== undefined) {
    Object.assign(workflow, { id: overrides.id });
  }
  return workflow;
}
