import type { Feature, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { runPolygonArea } from '../../src/workers/jobs';
import { makeTask, makeWorkflow } from '../_helpers';

function squarePolygon(centerLon: number, centerLat: number, halfSide: number): Feature<Polygon> {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [centerLon - halfSide, centerLat - halfSide],
          [centerLon + halfSide, centerLat - halfSide],
          [centerLon + halfSide, centerLat + halfSide],
          [centerLon - halfSide, centerLat + halfSide],
          [centerLon - halfSide, centerLat - halfSide],
        ],
      ],
    },
    properties: {},
  };
}

function taskFor(geoJson: Feature<Polygon>) {
  return makeTask({ workflow: makeWorkflow({ geoJson }) });
}

describe('runPolygonArea', () => {
  it('returns the area in square meters for a small polygon near the equator', async () => {
    const result = await runPolygonArea(taskFor(squarePolygon(0, 0, 0.01)));

    expect(result.type).toBe('polygon_area');
    expect(result.areaM2).toBeGreaterThan(4_900_000);
    expect(result.areaM2).toBeLessThan(5_000_000);
  });

  it('returns a smaller area for the same-degree polygon at higher latitude', async () => {
    const equator = await runPolygonArea(taskFor(squarePolygon(0, 0, 0.01)));
    const highLatitude = await runPolygonArea(taskFor(squarePolygon(0, 60, 0.01)));

    expect(highLatitude.areaM2).toBeLessThan(equator.areaM2);
  });

  it('returns zero for a degenerate (collinear) polygon', async () => {
    const degenerate: Feature<Polygon> = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      },
      properties: {},
    };

    const result = await runPolygonArea(taskFor(degenerate));

    expect(result).toEqual({ type: 'polygon_area', areaM2: 0 });
  });
});
