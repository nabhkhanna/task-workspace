import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { z } from 'zod';
import { MultiPolygonGeometrySchema, PolygonGeometrySchema } from './geojsonSchemas';
import countryMappingRaw from './world_data.json';

const CountryFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.discriminatedUnion('type', [PolygonGeometrySchema, MultiPolygonGeometrySchema]),
  properties: z.object({ name: z.string() }).passthrough(),
});

const CountryMappingSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(CountryFeatureSchema),
});

const parsed = CountryMappingSchema.safeParse(countryMappingRaw);
if (!parsed.success) {
  throw new Error(`world_data.json failed shape validation: ${parsed.error.message}`);
}

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

export const countryFeatures: readonly CountryFeature[] = parsed.data.features;
