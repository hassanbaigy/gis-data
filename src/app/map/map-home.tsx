"use client";

/**
 * MapHome — the interactive client layer of `/map` (HF-005).
 *
 * The server component (`page.tsx`) does the initial DB query, computes the
 * initial map centre, and hands the data here. This component:
 *   - Holds filter state (`since` + `unitActive`)
 *   - Re-fetches `GET /api/incidents` on filter change
 *   - Renders MapView (full-bleed) + overlays (top bar, chip rail, hint card)
 *   - Renders the persistent footer (NEW INCIDENT CTA + history icon)
 *
 * Layout: a flex column. The map area is `flex-1` with `minHeight: 0` inline
 * to break the Mapbox container-sizing race documented in
 * `.claude/agent-context/mapbox-integration.md`. The footer is a static
 * full-width row.
 *
 * Per D1 first-load state: `since="7d"`, `unitActive=true`. Initial data is
 * what the server fetched with those filters — no client re-fetch on mount.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { MapView, type MapMarker } from "@/components/MapView";
import { BadgePlate } from "@/components/BadgePlate";
import { SosButton } from "@/components/SosButton";
import { FilterChips, type SinceFilter } from "@/components/FilterChips";
import { HintCard } from "@/components/HintCard";

// D3 fallback when filtered incidents come back empty.
const GORHAM_FALLBACK: [number, number] = [-70.444, 43.679]; // [lng, lat]
const ZOOM = 12;

export type IncidentRow = {
  id: string;
  createdAt: string; // ISO string (server-serialised)
  address: string;
  lat: number;
  lng: number;
  type: string;
  alarmLevel: number;
  unitId: string;
  chosenHydrantId: string | null;
};

type Props = {
  badge: string;
  unitId: string;
  initialIncidents: IncidentRow[];
};

export function MapHome({ badge, unitId, initialIncidents }: Props) {
  const [since, setSince] = useState<SinceFilter>("7d");
  const [unitActive, setUnitActive] = useState(true);
  const [incidents, setIncidents] = useState<IncidentRow[]>(initialIncidents);

  // First-mount ref: skip the initial fetch (server data is fresh and already
  // in state). Every subsequent filter change triggers a real fetch. Reviewer
  // BLOCKER-1: the previous `isInitialState` short-circuit overwrote live
  // fetched data with the SSR snapshot when filters round-tripped back to
  // defaults (UNIT off → on). A useRef guard eliminates that path entirely.
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("since", since);
    if (unitActive) params.set("unitId", unitId);

    fetch(`/api/incidents?${params.toString()}`, { credentials: "same-origin" })
      .then((r) => {
        // Reviewer HIGH-1: explicitly check r.ok so non-2xx responses (401
        // mid-session, 400 on a bad filter value) raise instead of silently
        // clearing the map. Caught by the catch block below.
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((body: { incidents?: IncidentRow[] }) => {
        if (cancelled) return;
        setIncidents(body.incidents ?? []);
      })
      .catch((err) => {
        // Surface in console; keep showing the previous state so the user
        // doesn't see an empty map flash. The afterEach console-error guard
        // in the spec only filters the known /history 404, so a real failure
        // here will still flag in CI.
        console.error(
          "[hf-005] failed to refetch /api/incidents:",
          err instanceof Error ? err.message : "unknown",
        );
      });

    return () => {
      cancelled = true;
    };
    // initialIncidents intentionally NOT in deps — captured once at mount.
    // initialCenter likewise — only used pre-mount via the `incidents`
    // initialState.
  }, [since, unitActive, unitId]);

  // Map centre tracks filtered incidents; falls back to Gorham on empty (D3).
  // With the first-mount fetch skipped, `incidents` on first render equals
  // `initialIncidents` so `center` here computes the same value as the
  // server's `initialCenter` — no `effectiveCenter` branch needed.
  const center: [number, number] = useMemo(() => {
    if (incidents.length === 0) return GORHAM_FALLBACK;
    const lngSum = incidents.reduce((s, i) => s + i.lng, 0);
    const latSum = incidents.reduce((s, i) => s + i.lat, 0);
    return [lngSum / incidents.length, latSum / incidents.length];
  }, [incidents]);

  const markers: MapMarker[] = useMemo(
    () =>
      incidents.map((i) => ({
        id: i.id,
        type: "incident" as const,
        lng: i.lng,
        lat: i.lat,
      })),
    [incidents],
  );

  // Reviewer BLOCKER-2: hydrant count is derived from chosenHydrantId presence
  // across the visible incident list (per STORY.md AC line "N hydrants derived
  // from chosenHydrantId presence"). Passed into HintCard so the chip
  // reflects the actual data — not a hardcoded "3".
  const hydrantCount = useMemo(
    () => incidents.filter((i) => i.chosenHydrantId !== null).length,
    [incidents],
  );

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      {/* Map area. flex-1 + inline minHeight:0 fixes the Mapbox container
          race — `h-full` on a flex child can resolve to 0 before Mapbox
          reads container.clientHeight. See mapbox-integration.md. */}
      <div
        className="relative flex-1"
        style={{ minHeight: 0 }}
      >
        <MapView center={center} zoom={ZOOM} markers={markers} />

        {/* Top bar — 16px safe inset, both sides. `pointer-events-none` on
            the absolute wrapper so taps fall through to the map; children
            re-enable pointer-events to remain interactive. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
          <div className="pointer-events-auto">
            <BadgePlate badge={badge} />
          </div>
          <div className="pointer-events-auto">
            <SosButton />
          </div>
        </div>

        {/* Filter chip rail — below the top bar. */}
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
          <div className="pointer-events-auto">
            <FilterChips
              since={since}
              unitActive={unitActive}
              count={incidents.length}
              unitId={unitId}
              onSinceChange={setSince}
              onUnitToggle={() => setUnitActive((v) => !v)}
            />
          </div>
        </div>

        {/* Hint card — anchored above the footer. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4">
          <div className="pointer-events-auto">
            <HintCard
              incident={incidents[0] ?? null}
              hydrantCount={hydrantCount}
            />
          </div>
        </div>
      </div>

      {/* Persistent footer — red CTA + 64px-wide list-icon button. */}
      <footer className="flex w-full flex-shrink-0">
        <Link
          href="/map/new"
          className="flex flex-1 items-center justify-center bg-red px-6 py-5 text-center font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-paper shadow-[0_-4px_24px_rgba(225,29,41,0.25)] transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-yellow"
        >
          + New Incident
        </Link>
        <Link
          href="/history"
          aria-label="History"
          className="flex w-16 flex-shrink-0 items-center justify-center border-l border-smoke/40 bg-black text-paper transition-colors hover:bg-paper/5 focus:outline-none focus:ring-2 focus:ring-yellow"
        >
          {/* Hamburger / list icon. Decorative — accessible name comes from aria-label. */}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </Link>
      </footer>
    </main>
  );
}
