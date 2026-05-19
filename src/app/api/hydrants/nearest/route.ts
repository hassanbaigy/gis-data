/**
 * POST /api/hydrants/nearest
 *
 * Thin wrapper around `findNearestHydrants()`. Owns input validation and
 * HTTP error mapping; the algorithm lives in `src/lib/hydrants.ts` so other
 * routes (e.g. /api/incidents) can call it directly without HTTP overhead.
 */
import { NextResponse } from "next/server";
import { readBadge } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidLat, isValidLng, type Coord } from "@/lib/geo";
import { MapboxError } from "@/lib/mapbox";
import { findNearestHydrants, MAX_K, NoHydrantsError } from "@/lib/hydrants";

export const dynamic = "force-dynamic";

type Body = { lat?: unknown; lng?: unknown; k?: unknown };

export async function POST(req: Request) {
  // Auth — gate to prevent anonymous Mapbox quota burn.
  const badge = await readBadge();
  if (!badge) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // ------------------------------ validate ---------------------------------
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

  // ------------------------------ execute ----------------------------------
  const candidate: Coord = { lat: body.lat, lng: body.lng };
  try {
    const result = await findNearestHydrants(prisma, candidate, requestedK);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NoHydrantsError) {
      return NextResponse.json(
        { error: "no-hydrants", message: err.message },
        { status: 502 },
      );
    }
    if (err instanceof MapboxError) {
      return NextResponse.json(
        {
          error: "matrix-failed",
          upstreamStatus: err.upstreamStatus,
          message: err.message,
        },
        { status: 502 },
      );
    }
    throw err;
  }
}
