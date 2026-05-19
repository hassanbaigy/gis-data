"use client";

/**
 * MapHome — the interactive client layer of `/map` (HF-005 + HF-010).
 *
 * The server component (`page.tsx`) does the initial DB query, computes the
 * initial map centre, and hands the data here. This component:
 *   - Holds filter state (`since` + `unitActive`)
 *   - Re-fetches `GET /api/incidents` on filter change
 *   - Renders MapView (full-bleed on phone, right-side at lg) + overlays
 *   - Renders the persistent footer (NEW INCIDENT CTA + history icon)
 *
 * HF-010 layout — split below the `lg:` breakpoint (900px per globals.css
 * `--breakpoint-lg`):
 *   - **Phone (< 900px)**: full-bleed map with filter chips + hint card as
 *     absolute overlays; sticky footer below. Byte-identical to HF-005.
 *   - **Tablet (≥ 900px)**: 440px left rail (filter chips + hint card +
 *     rail footer) + remaining-width map (with top-bar overlays preserved).
 *     The phone-mode chips/hint/footer hide via `lg:hidden`.
 *
 * Mapbox row-flex container fix (D2): the map slot at lg lives in a
 * `flex-1` cell of a row-flex parent. We add `style={{ minWidth: 0 }}` to
 * the consumer wrapper — MapView's own inline style only sets
 * `minHeight: 0`, and touching MapView is out of HF-010's scope.
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

/**
 * HF-010 — viewport breakpoint hook. Returns `true` when the viewport
 * is ≥ 900px wide (matches the `--breakpoint-lg` token).
 *
 * Server render is always `false` (phone layout) to keep the SSR HTML
 * deterministic and avoid hydration mismatches. After mount, `useEffect`
 * reads `window.matchMedia` and updates state — at tablet viewport this
 * triggers a re-render into the rail layout. The brief phone→rail flash
 * is acceptable for a prototype.
 *
 * This conditional-render approach (vs CSS `hidden`) is required so the
 * rail's components (HintCard, FilterChips, NEW INCIDENT link) are NOT
 * in DOM at phone — that keeps strict-mode Playwright assertions like
 * `expect(getByText(...)).toBeVisible()` unambiguous in HF-005's specs.
 */
function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setIsTablet(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isTablet;
}

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
  const isTablet = useIsTablet();
  const [since, setSince] = useState<SinceFilter>("7d");
  const [unitActive, setUnitActive] = useState(true);
  const [incidents, setIncidents] = useState<IncidentRow[]>(initialIncidents);

  // First-mount ref: skip the initial fetch (server data is fresh).
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
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body: { incidents?: IncidentRow[] }) => {
        if (cancelled) return;
        setIncidents(body.incidents ?? []);
      })
      .catch((err) => {
        console.error(
          "[hf-005] failed to refetch /api/incidents:",
          err instanceof Error ? err.message : "unknown",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [since, unitActive, unitId]);

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

  const hydrantCount = useMemo(
    () => incidents.filter((i) => i.chosenHydrantId !== null).length,
    [incidents],
  );

  // FilterChips props are identical in both render slots (rail + overlay) —
  // hoist the prop bundle into a const so they stay in lockstep.
  const filterChipsProps = {
    since,
    unitActive,
    count: incidents.length,
    unitId,
    onSinceChange: setSince,
    onUnitToggle: () => setUnitActive((v) => !v),
  };

  return (
    // HF-010: column on phone, row on tablet. `relative` makes <main> the
    // containing block for the absolute top-bar overlay below, so the bar
    // pins to the VIEWPORT corners (not the map column's corners) at both
    // viewports per the AC and T05.
    <main className="relative flex h-screen flex-col bg-black text-paper lg:flex-row">
      {/* Top bar — absolute at the VIEWPORT corners (16px inset). At phone
          this overlays the full-bleed map; at tablet it overlays the top
          edge of the rail AND map. z-20 sits above the rail (z-10 for
          overlays) so the corners are always reachable. AC: "top bar
          elements stay in same absolute corners." */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
        <div className="pointer-events-auto">
          <BadgePlate badge={badge} />
        </div>
        <div className="pointer-events-auto">
          <SosButton />
        </div>
      </div>

      {/* Tablet rail — only rendered at ≥ 900px viewport. Conditional render
          (not CSS `hidden`) so the rail's HintCard / FilterChips / NEW
          INCIDENT link don't show up as hidden DOM duplicates at phone —
          that would ambiguous-fail HF-005's strict-mode `.toBeVisible()`
          assertions. `data-hf-rail="map"` is the HF-010 spec seam. */}
      {isTablet ? (
      <aside
        data-hf-rail="map"
        aria-label="Map controls and incident summary"
        className="flex flex-shrink-0 flex-col border-r border-paper/10 bg-black lg:w-[440px] lg:order-1"
      >
        {/* Top-bar inset spacer — the absolute top bar covers y∈[0, 56]px;
            push the rail content below it so the badge plate / SOS don't
            overlap the chip rail. */}
        <div className="h-16 flex-shrink-0" aria-hidden="true" />

        {/* Rail filter chips */}
        <div className="border-b border-paper/10 p-4">
          <FilterChips {...filterChipsProps} />
        </div>

        {/* Rail hint card */}
        <div className="flex-1 overflow-y-auto p-4">
          <HintCard
            incident={incidents[0] ?? null}
            hydrantCount={hydrantCount}
          />
        </div>

        {/* Rail footer — NEW INCIDENT + history icon at the bottom of the
            rail. Duplicates the phone footer's links (below); both point
            at the same routes. T04 uses `.first()` to disambiguate. */}
        <div className="flex w-full flex-shrink-0">
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
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </Link>
        </div>
      </aside>
      ) : null}

      {/* Map column. At phone, this is the only flex child of <main> and
          gets full width via flex-1. At tablet, it's the second flex child
          (order-2) after the rail and takes the remaining width.
          `minWidth: 0` (D2) breaks the Mapbox container-sizing race in
          row-flex; the existing `minHeight: 0` covers column-flex. */}
      <div
        className="relative flex-1 lg:order-2"
        style={{ minWidth: 0, minHeight: 0 }}
      >
        <MapView center={center} zoom={ZOOM} markers={markers} />

        {/* Phone-only filter chip overlay. Replaced by the rail at tablet. */}
        {!isTablet ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
            <div className="pointer-events-auto">
              <FilterChips {...filterChipsProps} />
            </div>
          </div>
        ) : null}

        {/* Phone-only hint card overlay. Replaced by the rail at tablet. */}
        {!isTablet ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4">
            <div className="pointer-events-auto">
              <HintCard
                incident={incidents[0] ?? null}
                hydrantCount={hydrantCount}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Phone-only sticky footer. Tablet has its own footer inside the
          rail (above) — neither is in DOM at the other viewport. */}
      {!isTablet ? (
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
      ) : null}
    </main>
  );
}
