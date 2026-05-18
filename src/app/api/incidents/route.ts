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
import { readBadge } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidLat, isValidLng } from "@/lib/geo";
import { MapboxError } from "@/lib/mapbox";
import {
  findNearestHydrants,
  NoHydrantsError,
} from "@/lib/hydrants";

export const dynamic = "force-dynamic";

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
  // ---------------------------- auth --------------------------------------
  // Use readBadge() (returns null) rather than requireFirefighter() (which
  // redirects) because route handlers shouldn't 307 — they should 401.
  const badge = await readBadge();
  if (!badge) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const firefighter = await prisma.firefighter.findUnique({ where: { badge } });
  if (!firefighter) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

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
      : firefighter.unitId;

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

/**
 * GET /api/incidents
 *
 * Lists incidents (HF-005 — /map home consumes this). Read-only.
 *
 * Query params:
 *   since:  "7d" (default) | "30d" | "all"
 *   type:   STRUCTURE|VEHICLE|BRUSH|MEDICAL|HAZMAT|OTHER (optional, no filter if omitted)
 *   unitId: any non-empty string, max 32 chars (optional)
 *
 * Response (200): { incidents: [...] } ordered createdAt DESC.
 *   Fields per row: id, createdAt, address, lat, lng, type, alarmLevel,
 *   unitId, chosenHydrantId. `firefighterId` and `notes` are intentionally
 *   omitted via Prisma `select` — `firefighterId` reveals the operator's DB
 *   id; `notes` may contain free-form text the firefighter wrote at scene.
 *
 * Errors:
 *   401 { error: "unauthenticated" }   — missing or invalid hf_badge cookie
 *   400 { error: "invalid_since"   }   — `since` not one of 7d/30d/all
 *   400 { error: "invalid_type"    }   — `type` not in VALID_TYPES
 *   400 { error: "invalid_unitId"  }   — `unitId` empty or > 32 chars
 *
 * Note on error-code casing: this handler uses snake_case (e.g.
 * `invalid_since`) to match HF-001's existing convention. POST above uses
 * kebab-case (`invalid-coords`). The inconsistency is a known follow-up
 * (reviewer HIGH-002 in develop's last audit); fixing it here would
 * balloon HF-005's scope, so the GET handler is internally consistent
 * (`invalid_*` + `unauthenticated`) and POST stays as-is.
 */
export async function GET(req: Request) {
  // ---------------------------- auth --------------------------------------
  // readBadge() returns null on missing/invalid cookie → 401 (NOT redirect).
  // Then verify the badge actually maps to a real Firefighter row, same as
  // POST. Defends against a stale cookie whose row was deleted out of band.
  const badge = await readBadge();
  if (!badge) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const firefighter = await prisma.firefighter.findUnique({ where: { badge } });
  if (!firefighter) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // ------------------------- parse + validate query -----------------------
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since") ?? "7d";
  const typeParam = url.searchParams.get("type"); // null | string
  const unitIdParam = url.searchParams.get("unitId"); // null | string

  // since: only the three sentinels are accepted.
  let cutoff: Date | null;
  if (sinceParam === "7d") {
    cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (sinceParam === "30d") {
    cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (sinceParam === "all") {
    cutoff = null;
  } else {
    return NextResponse.json({ error: "invalid_since" }, { status: 400 });
  }

  // type: if provided, must match the canonical set.
  if (typeParam !== null && !VALID_TYPES.has(typeParam)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  // unitId: if provided, must be non-empty and ≤ 32 chars. Empty string
  // (`?unitId=`) is rejected — the caller meant the absence of a filter,
  // they should omit the param entirely.
  if (
    unitIdParam !== null &&
    (unitIdParam.length === 0 || unitIdParam.length > 32)
  ) {
    return NextResponse.json({ error: "invalid_unitId" }, { status: 400 });
  }

  // ------------------------- query Prisma ---------------------------------
  // Conditional-spread the where clauses so omitted params don't constrain
  // the query. Use `select` to project ONLY the fields the home page needs;
  // this is the PII guard for firefighterId + notes.
  const incidents = await prisma.incident.findMany({
    where: {
      ...(cutoff !== null ? { createdAt: { gte: cutoff } } : {}),
      ...(typeParam !== null ? { type: typeParam } : {}),
      ...(unitIdParam !== null ? { unitId: unitIdParam } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      address: true,
      lat: true,
      lng: true,
      type: true,
      alarmLevel: true,
      unitId: true,
      chosenHydrantId: true,
    },
  });

  return NextResponse.json({ incidents });
}
