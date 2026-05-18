import { z } from 'zod';

/**
 * Shared GeoJSON shape schemas. Built once here so the route's input
 * validator, the bundled-dataset wrapper, and any verification tooling
 * agree on what a "polygonal" GeoJSON value looks like. The polygonal
 * universe (Polygon and MultiPolygon, bare or Feature-wrapped) matches
 * what `world_data.json` contains and what callers reasonably send.
 *
 * Composers (route, dataset wrapper) layer their own `properties` schema
 * on top of `GeoJsonInputSchema` / the geometry schemas — the route
 * accepts any properties bag, the dataset wrapper requires `{ name }`.
 */
export const PositionSchema = z.tuple([z.number(), z.number()]).rest(z.number());

export const PolygonCoordsSchema = z.array(z.array(PositionSchema));
export const MultiPolygonCoordsSchema = z.array(z.array(z.array(PositionSchema)));

export const PolygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: PolygonCoordsSchema,
});

export const MultiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: MultiPolygonCoordsSchema,
});

const PolygonInputFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: PolygonGeometrySchema,
  properties: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * Anything the analysis endpoint will accept as a `geoJson` field — bare
 * Polygon or a Feature wrapping a Polygon. MultiPolygon is intentionally
 * out of scope: the challenge spec asks for a polygon-area job and
 * polygon-containment analysis, so we narrow the input contract to match.
 * The `MultiPolygonGeometrySchema` export above is for the read-only
 * country dataset only — that's data we *consume*, not data we *accept*.
 */
export const GeoJsonInputSchema = z.discriminatedUnion('type', [
  PolygonInputFeatureSchema,
  PolygonGeometrySchema,
]);
