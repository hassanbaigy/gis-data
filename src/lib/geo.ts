/**
 * Geographic helpers. Pure functions, no I/O. Unit-tested in
 * tests/unit/geo.test.ts.
 */

export type Coord = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in metres (haversine
 * formula). Treats Earth as a sphere — sub-percent error is acceptable
 * for routing prefilters at the city scale.
 */
export function haversineM(a: Coord, b: Coord): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Validate that a value is a finite number in the canonical lat or lng
 * range. Used by the API route's input validation.
 */
export function isValidLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isValidLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}
