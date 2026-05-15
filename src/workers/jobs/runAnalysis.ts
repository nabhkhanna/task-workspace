import booleanWithin from '@turf/boolean-within';
import type { Feature, Polygon } from 'geojson';
import countryMapping from '../../data/world_data.json';
import type { Task } from '../../entities';
import { logger } from '../../logger';

const NO_COUNTRY_MATCH = 'No country found';

export function runAnalysis(task: Task): Promise<{ type: 'analysis'; country: string }> {
  const inputGeometry = task.workflow.geoJson;

  for (const countryFeature of countryMapping.features) {
    if (
      countryFeature.geometry.type === 'Polygon' ||
      countryFeature.geometry.type === 'MultiPolygon'
    ) {
      const isWithin = booleanWithin(inputGeometry, countryFeature as Feature<Polygon>);
      if (isWithin) {
        const country = countryFeature.properties?.name ?? NO_COUNTRY_MATCH;
        logger.info({ taskId: task.id, country }, 'job.analysis.country_matched');
        return Promise.resolve({ type: 'analysis', country });
      }
    }
  }
  return Promise.resolve({ type: 'analysis', country: NO_COUNTRY_MATCH });
}
