/**
 * POST /api/hydrants/nearest
 *
 * Given an incident lat/lng, returns the 3 in-service hydrants nearest by
 * routed driving duration plus the full GeoJSON route geometry for #1.
 * Also returns up to 2 nearest out-of-service hydrants as `flaggedOos`
 * (haversine only, no Matrix call).
 *
 * Algorithm (matches prompt.html §06):
 *   1. Load all in-service + geocoded hydrants from Prisma.
 *   2. Sort by haversine distance to the candidate.
 *   3. Take the closest 10.
 *   4. Call Mapbox Directions Matrix; rank those 10 by routed duration.
 *   5. Take top k (default 3).
 *   6. For #1, fetch the full route geometry via Directions v5.
 *   7. Compute flaggedOos = top 2 OOS hydrants by haversine.
 *
 * Errors:
 *   - 400 — body validation failure
 *   - 502 — Matrix call failed (no silent fallback per the brief)
 *   - 200 with `degraded: true` — Directions v5 failed but Matrix succeeded;
 *     we return the ranked list without #1's geometry rather than failing
 *     the whole request. The UI can render a card-only view in that case.
 *
 * The Mapbox secret token is read inside `getMatrix()` / `getRoute()` —
 * never leaked into the response.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { haversineM, isValidLat, isValidLng, type Coord } from "@/lib/geo";
import { getMatrix, getRoute, MapboxError } from "@/lib/mapbox";

export const dynamic = "force-dynamic";

// TODO(HF-001-merge): gate this route with requireFirefighter() once HF-001
// (mock auth) merges. Currently any caller can trigger 2 Mapbox API calls.

// MAX_K caps both the caller-requested k AND the haversine prefilter window.
// If a future story needs k > 10, raise BOTH PREFILTER_SIZE and MAX_K — the
// algorithm requires the prefilter window be ≥ k.
const PREFILTER_SIZE = 10;
const MAX_K = 10;

// Explicit field list returned in API responses. Keeping this narrow
// prevents future schema additions (e.g. a FK to a `reportedBy` relation)
// from automatically leaking into public response payloads.
const HYDRANT_SELECT = {
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

type Body = { lat?: unknown; lng?: unknown; k?: unknown };

export async function POST(req: Request) {
  // -------------------------- validate body --------------------------------
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!isValidLat(body.lat)) {
    return NextResponse.json(
      { error: "invalid-lat", message: "lat must be a finite number in [-90, 90]" },
      { status: 400 },
    );
  }
  if (!isValidLng(body.lng)) {
    return NextResponse.json(
      { error: "invalid-lng", message: "lng must be a finite number in [-180, 180]" },
      { status: 400 },
    );
  }
  const requestedK = body.k === undefined ? 3 : body.k;
  if (
    typeof requestedK !== "number" ||
    !Number.isInteger(requestedK) ||
    requestedK < 1 ||
    requestedK > MAX_K
  ) {
    return NextResponse.json(
      { error: "invalid-k", message: `k must be an integer in [1, ${MAX_K}]` },
      { status: 400 },
    );
  }

  const candidate: Coord = { lat: body.lat, lng: body.lng };
  const k = requestedK;

  // ----------------- load + haversine prefilter ----------------------------
  // Pull only the rows we need. Future story can paginate / spatial-index
  // if the dataset ever grows past O(thousands). Explicit `select` keeps
  // any future schema fields (relations, sensitive flags) from auto-leaking.
  const inService = await prisma.hydrant.findMany({
    where: { inService: true, lat: { not: null }, lng: { not: null } },
    select: HYDRANT_SELECT,
  });
  const oos = await prisma.hydrant.findMany({
    where: { inService: false, lat: { not: null }, lng: { not: null } },
    select: HYDRANT_SELECT,
  });

  // Score by haversine; non-null assertion is safe because of the where clause.
  const inServiceScored = inService
    .map((h) => ({
      hydrant: h,
      distanceM: haversineM(candidate, { lat: h.lat!, lng: h.lng! }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const top10 = inServiceScored.slice(0, PREFILTER_SIZE);

  if (top10.length === 0) {
    return NextResponse.json(
      {
        error: "no-hydrants",
        message: "no in-service geocoded hydrants in the dataset",
      },
      { status: 502 },
    );
  }

  // ----------------- Matrix call -------------------------------------------
  let matrix;
  try {
    matrix = await getMatrix(
      candidate,
      top10.map(({ hydrant }) => ({ lat: hydrant.lat!, lng: hydrant.lng! })),
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "matrix-failed",
        upstreamStatus: err instanceof MapboxError ? err.upstreamStatus : 0,
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 },
    );
  }

  // Pair candidates with routed metrics; sort by duration. The Matrix
  // wrapper validates array lengths so distances[i] / durations[i] are
  // both guaranteed defined here.
  const ranked = top10
    .map((entry, i) => ({
      hydrant: entry.hydrant,
      haversineM: entry.distanceM,
      distanceM: matrix.distances[i],
      durationS: matrix.durations[i],
    }))
    .sort((a, b) => a.durationS - b.durationS);

  const topK = ranked.slice(0, k);

  // ----------------- Directions v5 for #1 ---------------------------------
  // Fetch geometry ONLY. Distance + duration stay Matrix-derived so the
  // monotonic ranking guarantee holds across the list (the Matrix and
  // Directions v5 pipelines can yield slightly different numbers, which
  // would break monotonicity if we substituted #1's metrics).
  //
  // If this fails, downgrade to `degraded: true` rather than fail the
  // whole request — the UI can still render the ranked list without the
  // polyline. Per the brief's "no silent fallback" rule we surface the
  // degradation explicitly.
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

  // ----------------- flaggedOos --------------------------------------------
  const flaggedOos = oos
    .map((h) => ({
      hydrant: h,
      distanceM: haversineM(candidate, { lat: h.lat!, lng: h.lng! }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2);

  // ----------------- response ----------------------------------------------
  return NextResponse.json({
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
    ...(degraded ? { degraded: true } : {}),
  });
}
