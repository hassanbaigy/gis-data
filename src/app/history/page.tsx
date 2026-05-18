/**
 * /history — Filterable incident list (HF-009).
 *
 * Server component. The `/history/layout.tsx` gate calls
 * `requireFirefighter()` BEFORE this page renders — we do NOT repeat the
 * call here (reviewer BLOCKER-2). The layout's gate is the single
 * checkpoint per the project's auth pattern; calling it twice would burn
 * an extra Prisma `findUnique` per page render with no benefit.
 *
 * Initial Prisma query is `since=7d` (D3 default) WITHOUT a `unitId`
 * filter — `/history` is a multi-unit review screen, not the per-unit
 * `/map` home. The client component (`history-view.tsx`) handles all
 * subsequent re-fetches against `GET /api/incidents` when the time chip
 * changes. Type filter (D1) is applied client-side via `useMemo` — no
 * extra round trips.
 *
 * `force-dynamic` is set because the layout's `requireFirefighter()` call
 * reads `cookies()` indirectly, and Next.js requires explicit opt-in to
 * dynamic rendering when child pages don't read request-time APIs
 * themselves.
 */

import { prisma } from "@/lib/db";

import { HistoryView, type IncidentRow } from "./history-view";

export const dynamic = "force-dynamic";

const INITIAL_SINCE_DAYS = 7;

export default async function HistoryPage() {
  // No `requireFirefighter()` here — `/history/layout.tsx` already gated
  // every child route. See file header for rationale.

  const cutoff = new Date(
    Date.now() - INITIAL_SINCE_DAYS * 24 * 60 * 60 * 1000,
  );
  const rows = await prisma.incident.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
    // Reviewer HIGH-1 — only project the fields `IncidentRow` actually
    // renders. firefighterId + notes were already excluded as PII (HF-005);
    // unitId and chosenHydrantId are dropped here too because they cost
    // bytes across the network and aren't used by the list view.
    select: {
      id: true,
      createdAt: true,
      address: true,
      lat: true,
      lng: true,
      type: true,
      alarmLevel: true,
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
