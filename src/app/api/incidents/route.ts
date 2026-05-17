/**
 * POST /api/incidents
 *
 * Creates an Incident row, calls findNearestHydrants for the incident
 * location, stores chosenHydrantId = nearest[0].hydrant.id, and returns
 * the full result so the UI can navigate to /map/incident/[id] with the
 * data already in hand.
 *
 * Body:
 *   { address: string, lat: number, lng: number,
 *     type: "STRUCTURE"|"VEHICLE"|"BRUSH"|"MEDICAL"|"HAZMAT"|"OTHER",
 *     alarmLevel: 1-5, notes?: string, unitId?: string }
 *
 * Response (200): { id, chosenHydrantId, nearest, flaggedOos, degraded? }
 * Errors: 400 on body validation; 502 on Matrix failure or empty hydrant set.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidLat, isValidLng } from "@/lib/geo";
import { MapboxError } from "@/lib/mapbox";
import {
  findNearestHydrants,
  NoHydrantsError,
} from "@/lib/hydrants";

export const dynamic = "force-dynamic";

// TODO(HF-001-merge): gate with requireFirefighter() once auth lands.
// For now we hardcode the badge-0418 firefighter from the seed.
const DEMO_FIREFIGHTER_BADGE = "0418";

const VALID_TYPES = new Set([
  "STRUCTURE",
  "VEHICLE",
  "BRUSH",
  "MEDICAL",
  "HAZMAT",
  "OTHER",
]);

type Body = {
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  type?: unknown;
  alarmLevel?: unknown;
  notes?: unknown;
  unitId?: unknown;
};

export async function POST(req: Request) {
  // -------------------------- validate body --------------------------------
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (typeof body.address !== "string" || body.address.length === 0) {
    return NextResponse.json({ error: "invalid-address" }, { status: 400 });
  }
  if (!isValidLat(body.lat) || !isValidLng(body.lng)) {
    return NextResponse.json({ error: "invalid-coords" }, { status: 400 });
  }
  if (typeof body.type !== "string" || !VALID_TYPES.has(body.type)) {
    return NextResponse.json(
      {
        error: "invalid-type",
        message: `type must be one of ${[...VALID_TYPES].join("|")}`,
      },
      { status: 400 },
    );
  }
  if (
    typeof body.alarmLevel !== "number" ||
    !Number.isInteger(body.alarmLevel) ||
    body.alarmLevel < 1 ||
    body.alarmLevel > 5
  ) {
    return NextResponse.json({ error: "invalid-alarmLevel" }, { status: 400 });
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    return NextResponse.json({ error: "invalid-notes" }, { status: 400 });
  }
  const unitId =
    typeof body.unitId === "string" && body.unitId.length > 0
      ? body.unitId
      : "E-12";

  // ------------- find or create the demo firefighter -----------------------
  // TODO(HF-001-merge): replace with requireFirefighter() once auth lands;
  // the firefighter id will come from the cookie.
  const firefighter = await prisma.firefighter.upsert({
    where: { badge: DEMO_FIREFIGHTER_BADGE },
    create: { badge: DEMO_FIREFIGHTER_BADGE, unitId: "E-12" },
    update: {},
  });

  // ------------- find nearest BEFORE creating so we have chosenHydrantId ---
  let nearestResult;
  try {
    nearestResult = await findNearestHydrants(prisma, {
      lat: body.lat,
      lng: body.lng,
    });
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

  const chosenHydrantId = nearestResult.nearest[0]?.hydrant.id ?? null;

  // ------------- create the incident ---------------------------------------
  const incident = await prisma.incident.create({
    data: {
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      type: body.type,
      alarmLevel: body.alarmLevel,
      notes: typeof body.notes === "string" ? body.notes : null,
      unitId,
      firefighterId: firefighter.id,
      chosenHydrantId,
    },
  });

  return NextResponse.json({
    id: incident.id,
    chosenHydrantId,
    ...nearestResult,
  });
}
