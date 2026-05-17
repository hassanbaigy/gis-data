/**
 * Server-side Mapbox API wrappers. Reads `MAPBOX_SECRET_TOKEN` — NEVER
 * import this module from client code. The absence of `"use client"` at
 * the top of any file that imports this is the boundary contract.
 *
 * Two helpers:
 *  - getMatrix() — Directions Matrix v1, used by /api/hydrants/nearest to
 *    rank the haversine-prefiltered top 10 by routed driving duration.
 *  - getRoute() — Directions v5, used to fetch the full GeoJSON LineString
 *    for the #1 ranked hydrant only.
 *
 * Both throw `MapboxError` on upstream failure so the caller can surface
 * the exact status code in its 502 response.
 */
import type { Coord } from "@/lib/geo";

const MATRIX_BASE = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";
const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";

function token(): string {
  const t = process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!t) {
    throw new MapboxError(0, "MAPBOX_SECRET_TOKEN is not set");
  }
  return t;
}

export class MapboxError extends Error {
  constructor(
    public upstreamStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "MapboxError";
  }
}

function coordsParam(coords: Coord[]): string {
  // Mapbox expects "lng,lat;lng,lat;..." (NOT lat,lng — easy to flip)
  return coords.map((c) => `${c.lng},${c.lat}`).join(";");
}

// ---------------------------------------------------------------------------
// Directions Matrix — duration + distance from one source to N destinations
// ---------------------------------------------------------------------------

export type MatrixResult = {
  /** Driving duration in seconds, source → destinations[i]. */
  durations: number[];
  /** Driving distance in metres, source → destinations[i]. */
  distances: number[];
};

export async function getMatrix(
  source: Coord,
  destinations: Coord[],
): Promise<MatrixResult> {
  if (destinations.length === 0) {
    return { durations: [], distances: [] };
  }
  // Source is the first coord; destinations follow.
  const coords = coordsParam([source, ...destinations]);
  const destinationsParam = destinations
    .map((_, i) => i + 1) // 0 is source, 1..N are destinations
    .join(";");

  const url = new URL(`${MATRIX_BASE}/${coords}`);
  url.searchParams.set("sources", "0");
  url.searchParams.set("destinations", destinationsParam);
  url.searchParams.set("annotations", "duration,distance");
  url.searchParams.set("access_token", token());

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new MapboxError(
      res.status,
      `Matrix call failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    code?: string;
    durations?: number[][];
    distances?: number[][];
    message?: string;
  };
  if (data.code !== "Ok" || !data.durations || !data.distances) {
    throw new MapboxError(
      502,
      `Matrix returned unexpected shape: code=${data.code}, message=${data.message ?? "n/a"}`,
    );
  }
  // durations[i][j] = source i → destination j. We have 1 source and N
  // destinations, so we want durations[0] (length N) and distances[0].
  return {
    durations: data.durations[0],
    distances: data.distances[0],
  };
}

// ---------------------------------------------------------------------------
// Directions v5 — full GeoJSON route geometry for one source → destination
// ---------------------------------------------------------------------------

export type RouteResult = {
  geometry: GeoJSON.LineString;
  /** Total route distance in metres. */
  distanceM: number;
  /** Total route duration in seconds. */
  durationS: number;
};

export async function getRoute(
  source: Coord,
  destination: Coord,
): Promise<RouteResult> {
  const coords = coordsParam([source, destination]);
  const url = new URL(`${DIRECTIONS_BASE}/${coords}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("access_token", token());

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new MapboxError(
      res.status,
      `Directions call failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    code?: string;
    routes?: Array<{
      geometry?: GeoJSON.LineString;
      distance?: number;
      duration?: number;
    }>;
    message?: string;
  };
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new MapboxError(
      502,
      `Directions returned unexpected shape: code=${data.code}, message=${data.message ?? "n/a"}`,
    );
  }
  const top = data.routes[0];
  if (!top.geometry || typeof top.distance !== "number" || typeof top.duration !== "number") {
    throw new MapboxError(
      502,
      "Directions returned route with missing fields",
    );
  }
  return {
    geometry: top.geometry,
    distanceM: top.distance,
    durationS: top.duration,
  };
}
