/**
 * Pure(ish) algorithm for the nearest-hydrant search. Extracted from
 * /api/hydrants/nearest's route handler so /api/incidents can call it
 * directly without an HTTP round-trip.
 *
 * The route handler stays the thin wrapper that handles request parsing,
 * input validation, and response shaping. This module owns the actual
 * data flow: Prisma query → haversine prefilter → Mapbox Matrix →
 * duration sort → Directions v5 for #1 geometry → flaggedOos.
 *
 * Errors:
 *   - throws `NoHydrantsError` when the in-service+geocoded set is empty
 *   - throws `MapboxError` from getMatrix when the Matrix call fails
 *     (caller maps to 502)
 *   - `degraded: true` in the result when Directions v5 fails but Matrix
 *     succeeded (caller surfaces the flag to the UI)
 */
import type { PrismaClient } from "@prisma/client";
import { haversineM, type Coord } from "@/lib/geo";
import { getMatrix, getRoute } from "@/lib/mapbox";

export const PREFILTER_SIZE = 10;
export const MAX_K = 10;

export const HYDRANT_SELECT = {
  id: true,
  type: true,
  category: true,
  address: true,
  location: true,
  street: true,
  city: true,
  state: true,
  zip: true,
  inService: true,
  lat: true,
  lng: true,
  geocodedAt: true,
} as const;

export type HydrantPublic = {
  id: string;
  type: string;
  category: string;
  address: string;
  location: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  inService: boolean;
  lat: number | null;
  lng: number | null;
  geocodedAt: Date | null;
};

export type NearestResult = {
  nearest: Array<{
    hydrant: HydrantPublic;
    distanceM: number;
    durationS: number;
    geometry?: GeoJSON.LineString;
  }>;
  flaggedOos: Array<{
    hydrant: HydrantPublic;
    distanceM: number;
  }>;
  degraded?: true;
};

export class NoHydrantsError extends Error {
  constructor() {
    super("no in-service geocoded hydrants in the dataset");
    this.name = "NoHydrantsError";
  }
}

export async function findNearestHydrants(
  prisma: PrismaClient,
  candidate: Coord,
  k: number = 3,
): Promise<NearestResult> {
  if (!Number.isInteger(k) || k < 1 || k > MAX_K) {
    throw new RangeError(`k must be an integer in [1, ${MAX_K}], got ${k}`);
  }

  // Load in-service + OOS in parallel
  const [inService, oos] = await Promise.all([
    prisma.hydrant.findMany({
      where: { inService: true, lat: { not: null }, lng: { not: null } },
      select: HYDRANT_SELECT,
    }),
    prisma.hydrant.findMany({
      where: { inService: false, lat: { not: null }, lng: { not: null } },
      select: HYDRANT_SELECT,
    }),
  ]);

  // Haversine prefilter — non-null assertions safe because of the where clauses
  const inServiceScored = inService
    .map((h) => ({
      hydrant: h as HydrantPublic,
      distanceM: haversineM(candidate, { lat: h.lat!, lng: h.lng! }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const top10 = inServiceScored.slice(0, PREFILTER_SIZE);
  if (top10.length === 0) {
    throw new NoHydrantsError();
  }

  // Matrix call — propagates MapboxError on failure for caller to map to 502
  const matrix = await getMatrix(
    candidate,
    top10.map(({ hydrant }) => ({ lat: hydrant.lat!, lng: hydrant.lng! })),
  );

  // Pair candidates with routed metrics; sort by duration
  const ranked = top10
    .map((entry, i) => ({
      hydrant: entry.hydrant,
      distanceM: matrix.distances[i],
      durationS: matrix.durations[i],
    }))
    .sort((a, b) => a.durationS - b.durationS);

  const topK = ranked.slice(0, k);

  // Directions v5 for #1 only. On failure, return degraded list with no geometry.
  let geometry: GeoJSON.LineString | undefined;
  let degraded = false;
  try {
    const first = topK[0];
    const route = await getRoute(candidate, {
      lat: first.hydrant.lat!,
      lng: first.hydrant.lng!,
    });
    geometry = route.geometry;
  } catch {
    degraded = true;
  }

  const flaggedOos = oos
    .map((h) => ({
      hydrant: h as HydrantPublic,
      distanceM: haversineM(candidate, { lat: h.lat!, lng: h.lng! }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2);

  return {
    nearest: topK.map((entry, i) => ({
      hydrant: entry.hydrant,
      distanceM: Math.round(entry.distanceM),
      durationS: Math.round(entry.durationS),
      ...(i === 0 && geometry ? { geometry } : {}),
    })),
    flaggedOos: flaggedOos.map((entry) => ({
      hydrant: entry.hydrant,
      distanceM: Math.round(entry.distanceM),
    })),
    ...(degraded ? { degraded: true as const } : {}),
  };
}
