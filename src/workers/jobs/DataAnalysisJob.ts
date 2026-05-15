import booleanWithin from '@turf/boolean-within';
import { Feature, Polygon } from 'geojson';
import countryMapping from '../../data/world_data.json';
import { Task } from '../../entities';
import { logger } from '../../logger';
import { Job } from './Job';

export class DataAnalysisJob implements Job {
  run(task: Task): Promise<string> {
    const inputGeometry: Feature<Polygon> = JSON.parse(task.geoJson);

    for (const countryFeature of countryMapping.features) {
      if (
        countryFeature.geometry.type === 'Polygon' ||
        countryFeature.geometry.type === 'MultiPolygon'
      ) {
        const isWithin = booleanWithin(inputGeometry, countryFeature as Feature<Polygon>);
        if (isWithin) {
          const country = countryFeature.properties?.name ?? 'No country found';
          logger.info({ taskId: task.taskId, country }, 'job.analysis.country_matched');
          return Promise.resolve(country);
        }
      }
    }
    return Promise.resolve('No country found');
  }
}
