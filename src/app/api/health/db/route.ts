/**
 * Diagnostic route — reports DB row counts. Used by HF-Foundation's
 * Playwright spec to verify the seed shipped.
 *
 * NOT a stable public API. The leading underscore in `_health` marks it
 * as internal-only — future stories MAY remove this if they introduce a
 * proper observability surface.
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

    return NextResponse.json({
      firefighterCount,
      hydrantCount,
      hydrantGeocodedCount,
      incidentCount,
      incidentsByType: Object.fromEntries(
        incidentsByType.map((row) => [row.type, row._count._all]),
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
