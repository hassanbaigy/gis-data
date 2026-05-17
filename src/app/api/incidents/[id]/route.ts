/**
 * GET /api/incidents/[id]
 *
 * Returns an incident by id with its current best hydrants. Used by
 * /map/incident/[id] (currently a placeholder; HF-008 polishes it).
 *
 * Re-computes findNearestHydrants on every read rather than caching a
 * snapshot — Mapbox traffic/distance can change between incident creation
 * and read time. The Incident table only persists chosenHydrantId (the
 * snapshot of "which one was #1 at creation"); live ranking comes from
 * this endpoint.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MapboxError } from "@/lib/mapbox";
import { findNearestHydrants, NoHydrantsError } from "@/lib/hydrants";

export const dynamic = "force-dynamic";

// TODO(HF-001-merge): gate with requireFirefighter() once auth lands.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Defensive — Incident.lat/lng are NOT NULL in the schema, but POST
  // validation is the only thing enforcing that. A row corrupted via raw
  // SQL or a future migration would still satisfy `findUnique` but blow
  // up haversine. Return a 500 with a clear message instead.
  if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) {
    return NextResponse.json(
      { error: "incident-coords-invalid", id: incident.id },
      { status: 500 },
    );
  }

  try {
    const nearestResult = await findNearestHydrants(prisma, {
      lat: incident.lat,
      lng: incident.lng,
    });
    return NextResponse.json({ incident, ...nearestResult });
  } catch (err) {
    if (err instanceof NoHydrantsError) {
      return NextResponse.json(
        {
          incident,
          nearest: [],
          flaggedOos: [],
          error: "no-hydrants",
        },
        { status: 200 },
      );
    }
    if (err instanceof MapboxError) {
      return NextResponse.json(
        {
          incident,
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
