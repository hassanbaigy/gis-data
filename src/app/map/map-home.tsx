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
import { useEffect, useMemo, useState } from "react";

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
  initialCenter: [number, number];
};

export function MapHome({
  badge,
  unitId,
  initialIncidents,
  initialCenter,
}: Props) {
  const [since, setSince] = useState<SinceFilter>("7d");
  const [unitActive, setUnitActive] = useState(true);
  const [incidents, setIncidents] = useState<IncidentRow[]>(initialIncidents);

  // Re-fetch on filter change. Initial render uses the server's data so we
  // skip the round-trip for the default `since=7d` + UNIT-active state.
  const isInitialState = since === "7d" && unitActive;
  useEffect(() => {
    if (isInitialState) {
      // Filters match server defaults — keep initialIncidents.
      setIncidents(initialIncidents);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("since", since);
    if (unitActive) params.set("unitId", unitId);

    fetch(`/api/incidents?${params.toString()}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((body: { incidents?: IncidentRow[] }) => {
        if (cancelled) return;
        setIncidents(body.incidents ?? []);
      })
      .catch(() => {
        // Surface in console; keep showing the previous state. The
        // afterEach console-error guard in the spec is scoped, so a real
        // network blip won't be silenced.
        console.error("[hf-005] failed to refetch /api/incidents");
      });

    return () => {
      cancelled = true;
    };
  }, [since, unitActive, unitId, initialIncidents, isInitialState]);

  // Map centre tracks filtered incidents; falls back to Gorham on empty (D3).
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

  // Initial centre prop for the first paint — after that, `center` drives.
  const effectiveCenter = isInitialState ? initialCenter : center;

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      {/* Map area. flex-1 + inline minHeight:0 fixes the Mapbox container
          race — `h-full` on a flex child can resolve to 0 before Mapbox
          reads container.clientHeight. See mapbox-integration.md. */}
      <div
        className="relative flex-1"
        style={{ minHeight: 0 }}
      >
        <MapView center={effectiveCenter} zoom={ZOOM} markers={markers} />

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
            <HintCard incident={incidents[0] ?? null} />
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
