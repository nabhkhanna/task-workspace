import type { Feature, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/workers/jobs';
import { makeTask, makeWorkflow } from '../_helpers';

function squarePolygon(centerLon: number, centerLat: number, halfSide = 0.01): Feature<Polygon> {
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

describe('runAnalysis', () => {
  it('matches a polygon fully inside a Polygon-typed country', async () => {
    const result = await runAnalysis(taskFor(squarePolygon(10.45, 51.15)));

    expect(result).toEqual({ type: 'analysis', country: 'Germany' });
  });

  it('matches a polygon fully inside a MultiPolygon-typed country', async () => {
    const result = await runAnalysis(taskFor(squarePolygon(2.35, 48.85)));

    expect(result).toEqual({ type: 'analysis', country: 'France' });
  });

  it('returns "No country found" when the polygon sits in international waters', async () => {
    const result = await runAnalysis(taskFor(squarePolygon(-30, 30)));

    expect(result).toEqual({ type: 'analysis', country: 'No country found' });
  });

  it('returns "No country found" when the polygon spans a border instead of being fully inside one country', async () => {
    const acrossGermanyFranceBorder: Feature<Polygon> = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7.0, 48.8],
            [8.5, 48.8],
            [8.5, 49.2],
            [7.0, 49.2],
            [7.0, 48.8],
          ],
        ],
      },
      properties: {},
    };

    const result = await runAnalysis(taskFor(acrossGermanyFranceBorder));

    expect(result).toEqual({ type: 'analysis', country: 'No country found' });
  });
});
