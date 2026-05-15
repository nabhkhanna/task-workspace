export type TaskOutput =
  | { type: 'analysis'; country: string }
  | { type: 'notification' }
  | { type: 'polygon_area'; areaM2: number };
