/**
 * Diagnostic route — reports DB row counts and a few invariants for the
 * HF-Foundation Playwright spec. Not part of the public API surface; a
 * future story may remove it once dedicated query routes exist.
 *
 * NOTE: This folder must NOT start with an underscore. In the Next.js
 * App Router, underscore-prefixed folders are treated as private and
 * excluded from routing entirely (you'd get a 404).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [firefighterCount, hydrantCount, hydrantGeocodedCount, incidentCount] =
      await Promise.all([
        prisma.firefighter.count(),
        prisma.hydrant.count(),
        prisma.hydrant.count({ where: { lat: { not: null }, lng: { not: null } } }),
        prisma.incident.count(),
      ]);

    const incidentsByType = await prisma.incident.groupBy({
      by: ["type"],
      _count: { _all: true },
    });

    // For the spec to verify that every incident links to a single seeded
    // firefighter, expose the distinct firefighter badges that own incidents.
    // If exactly one distinct badge owns all incidents AND that badge is
    // "0418", the relation is correctly wired.
    const incidentOwnerBadges = await prisma.incident
      .findMany({
        distinct: ["firefighterId"],
        select: { firefighter: { select: { badge: true } } },
      })
      .then((rows) => rows.map((r) => r.firefighter.badge).sort());

    return NextResponse.json({
      firefighterCount,
      hydrantCount,
      hydrantGeocodedCount,
      incidentCount,
      incidentsByType: Object.fromEntries(
        incidentsByType.map((row) => [row.type, row._count._all]),
      ),
      incidentOwnerBadges,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
