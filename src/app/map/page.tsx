/**
 * /map — Home screen (HF-005).
 *
 * Server component. The /map/* layout already calls `requireFirefighter()`,
 * so by the time we render the cookie + DB row are validated. We re-call
 * `requireFirefighter()` here only to get the row data (badge + unitId) for
 * the initial render. The cost is one extra Prisma query per navigation,
 * acceptable for a prototype.
 *
 * Initial data is fetched server-side via Prisma directly (no HTTP round
 * trip). The client component (`map-home.tsx`) takes over for filter-driven
 * re-fetches against `GET /api/incidents`.
 */

import { requireFirefighter } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { MapHome, type IncidentRow } from "./map-home";

// `cookies()` is read indirectly via `requireFirefighter()`, so the page
// MUST be dynamic — no caching.
export const dynamic = "force-dynamic";

const INITIAL_SINCE_DAYS = 7;

export default async function MapHomePage() {
  const firefighter = await requireFirefighter();

  // D1 — first-load filters match the chip-rail defaults: `since=7d` AND
  // `unitId=<firefighter's unitId>`. The client component re-renders the
  // chip rail with these as the initial state.
  const cutoff = new Date(
    Date.now() - INITIAL_SINCE_DAYS * 24 * 60 * 60 * 1000,
  );
  const rows = await prisma.incident.findMany({
    where: {
      createdAt: { gte: cutoff },
      unitId: firefighter.unitId,
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

  // Server → client: serialise Date objects so the props payload is safe to
  // pass across the Server/Client boundary.
  const initialIncidents: IncidentRow[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  // Initial map centre is derived client-side from `initialIncidents` (the
  // memoised `center` in MapHome handles the empty-list fallback to
  // GORHAM_FALLBACK per D3). No need to compute or pass it separately.
  return (
    <MapHome
      badge={firefighter.badge}
      unitId={firefighter.unitId}
      initialIncidents={initialIncidents}
    />
  );
}
