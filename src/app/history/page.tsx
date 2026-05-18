/**
 * /history — Filterable incident list (HF-009).
 *
 * Server component. The `/history/*` layout already calls
 * `requireFirefighter()`, so by the time we render the cookie + DB row are
 * validated. We re-call it here only to satisfy the gate explicitly and
 * keep the page self-documenting.
 *
 * Initial Prisma query is `since=7d` (D3 default) WITHOUT a `unitId`
 * filter — `/history` is a multi-unit review screen, not the per-unit
 * `/map` home. The client component (`history-view.tsx`) handles all
 * subsequent re-fetches against `GET /api/incidents` when the time chip
 * changes. Type filter (D1) is applied client-side via `useMemo` — no
 * extra round trips.
 */

import { requireFirefighter } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { HistoryView, type IncidentRow } from "./history-view";

// `cookies()` is read indirectly via `requireFirefighter()` — page MUST be
// dynamic (no caching).
export const dynamic = "force-dynamic";

const INITIAL_SINCE_DAYS = 7;

export default async function HistoryPage() {
  await requireFirefighter();

  const cutoff = new Date(
    Date.now() - INITIAL_SINCE_DAYS * 24 * 60 * 60 * 1000,
  );
  const rows = await prisma.incident.findMany({
    where: { createdAt: { gte: cutoff } },
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

  // Server → client: serialise Date so the props payload crosses the
  // Server/Client boundary cleanly.
  const initialIncidents: IncidentRow[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return <HistoryView initialIncidents={initialIncidents} />;
}
