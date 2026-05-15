import area from '@turf/area';
import type { Task } from '../../entities';
import { logger } from '../../logger';

export function runPolygonArea(task: Task): Promise<{ type: 'polygon_area'; areaM2: number }> {
  const areaM2 = area(task.workflow.geoJson);
  logger.info({ taskId: task.id, areaM2 }, 'job.polygon_area.computed');
  return Promise.resolve({ type: 'polygon_area', areaM2 });
}
