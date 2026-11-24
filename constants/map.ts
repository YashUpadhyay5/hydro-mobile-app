/**
 * What a map shows while it has nothing to centre on yet (no geofence, no footprints, no live
 * locations). It is a whole-world view on purpose: it carries no assumption about where the
 * organisation operates. Maps re-centre as soon as real data arrives.
 */
export const WORLD_REGION = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 100,
  longitudeDelta: 100,
};

/** Leaflet zoom level for a region's latitude span. */
export const zoomForLatitudeDelta = (latitudeDelta?: number): number => {
  if (latitudeDelta && latitudeDelta >= 5) return 2;
  if (latitudeDelta && latitudeDelta < 0.05) return 15;
  return 13;
};
