"use client";

/**
 * HistoryView — `/history` interactive layer (HF-009).
 *
 * Holds the filter state (`since` for the time rail, `selectedTypes` for
 * the multi-select type rail) and the current incident list. Re-fetches
 * `GET /api/incidents` on `since` change via a first-mount-ref-guarded
 * `useEffect` (same pattern HF-005's `map-home.tsx` established). The
 * type filter is applied **client-side via `useMemo`** per D1 — no
 * additional network round trips.
 *
 * Layout: split flex column at phone (HF-009). Top section (`flex-1` +
 * `minHeight: 0`) is the `MapView`. Bottom section (`flex-1`,
 * `overflow-y-auto`) holds the filter rail + scrollable incident list.
 * `BottomSheet` is deliberately NOT used here — it's an overlay
 * component designed for full-bleed map screens, not split layouts.
 *
 * HF-010 — at the `lg:` breakpoint (900px per globals.css
 * `--breakpoint-lg`) the layout flips to row. The incident-history
 * section becomes a 440px left rail (`lg:order-1 lg:w-[440px]
 * lg:flex-none`); the map section takes the remaining width
 * (`lg:order-2`). The map wrapper gets `minWidth: 0` (in addition to
 * `minHeight: 0`) to break the Mapbox container-sizing race in row-flex.
 * Pure CSS — no conditional rendering needed here because
 * `aria-label="Incident history"` is a single element regardless of
 * viewport, so there is no DOM-duplication risk for HF-009's strict-mode
 * Playwright assertions.
 *
 * Map markers are `type: "incident"` ONLY (per AC and T02 assertion).
 * Hydrants, chosen, and OOS markers are not surfaced on this screen.
 *
 * Step-B note: this skeleton renders Map + placeholder stubs in the
 * bottom section. Step C wires up real filter chip components; Step D
 * replaces the list stub with `IncidentRow` components.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { MapView, type MapMarker } from "@/components/MapView";
import { TimeFilterChips } from "@/components/TimeFilterChips";
import { TypeFilterChips } from "@/components/TypeFilterChips";
import { IncidentRow as IncidentRowUI } from "@/components/IncidentRow";

// Re-export the time-filter sentinel type so callers that import this
// module can use it without reaching into the chip component.
export type { SinceFilter } from "@/components/TimeFilterChips";

// D5 — fallback when the filtered result is empty. Gorham, ME centroid
// (lng-first per MapView's `center` prop convention). Same constant
// HF-005 uses; not extracted yet — future shared-lib chore.
const GORHAM_FALLBACK: [number, number] = [-70.444, 43.679];
// Slightly wider than `/map`'s 12 — `/history` is a regional review view.
const ZOOM = 11;

export type IncidentRow = {
  id: string;
  createdAt: string; // ISO string (server-serialised)
  address: string;
  lat: number;
  lng: number;
  type: string;
  alarmLevel: number;
  // unitId + chosenHydrantId removed (reviewer HIGH-1) — not rendered by
  // IncidentRow and not used for map markers or filters.
};

type Props = {
  initialIncidents: IncidentRow[];
};

export function HistoryView({ initialIncidents }: Props) {
  const [since, setSince] = useState<"7d" | "30d" | "all">("7d");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [incidents, setIncidents] =
    useState<IncidentRow[]>(initialIncidents);

  // First-mount ref guard — server data is fresh on initial render, no
  // need to refetch. Subsequent `since` changes trigger a real GET. See
  // HF-005's reviewer BLOCKER-1 for context on why `useRef` + this pattern
  // is correct vs the original `isInitialState` short-circuit.
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("since", since);
    // Type filter is client-side per D1 — never sent to the API.

    fetch(`/api/incidents?${params.toString()}`, {
      credentials: "same-origin",
    })
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
          "[hf-009] failed to refetch /api/incidents:",
          err instanceof Error ? err.message : "unknown",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [since]);

  // D1 — client-side type filter. Empty `selectedTypes` = show all types.
  const filteredIncidents = useMemo(() => {
    if (selectedTypes.length === 0) return incidents;
    const sel = new Set(selectedTypes);
    return incidents.filter((i) => sel.has(i.type));
  }, [incidents, selectedTypes]);

  // D5 — centre on the average of FILTERED incidents; fallback to Gorham
  // when the filter result is empty.
  const center: [number, number] = useMemo(() => {
    if (filteredIncidents.length === 0) return GORHAM_FALLBACK;
    const lngSum = filteredIncidents.reduce((s, i) => s + i.lng, 0);
    const latSum = filteredIncidents.reduce((s, i) => s + i.lat, 0);
    return [
      lngSum / filteredIncidents.length,
      latSum / filteredIncidents.length,
    ];
  }, [filteredIncidents]);

  // Incident-only markers (T02 assertion: data-marker-types must NOT
  // include hydrant/chosen/oos).
  const markers: MapMarker[] = useMemo(
    () =>
      filteredIncidents.map((i) => ({
        id: i.id,
        type: "incident" as const,
        lng: i.lng,
        lat: i.lat,
      })),
    [filteredIncidents],
  );

  return (
    // HF-010: column at phone (map top / history bottom — HF-009
    // byte-identical). Row at tablet (history rail left / map right).
    <main className="flex h-screen flex-col bg-black text-paper lg:flex-row">
      {/* Map area — flex-1 fills remaining space at both viewports. Inline
          minHeight:0 breaks the Mapbox column-flex container race
          (HF-005); minWidth:0 covers the row-flex case at tablet
          (HF-010 D2). lg:order-2 places it to the RIGHT of the history
          rail at tablet. */}
      <section
        aria-label="History map"
        className="relative flex-1 lg:order-2"
        style={{ minHeight: 0, minWidth: 0 }}
      >
        <MapView center={center} zoom={ZOOM} markers={markers} />
      </section>

      {/* Filter rail + list section. Phone: full-width below the map, flex-1
          mirrors the map height with `border-t`. Tablet: fixed-width 440px
          rail on the LEFT (lg:order-1 + lg:w-[440px] + lg:flex-none),
          border switches from top to right. T03 asserts width 432-448 and
          x ≤ 4 at 1024×768. */}
      <section
        aria-label="Incident history"
        className="flex flex-1 flex-col border-t border-paper/10 bg-black lg:order-1 lg:w-[440px] lg:flex-none lg:flex-shrink-0 lg:border-t-0 lg:border-r"
        style={{ minHeight: 0 }}
      >
        {/* Filter rail — time (single-select 7D/30D/ALL) + type
            (multi-select 6 categories with +N summary chip per D2). */}
        <div
          className="flex flex-col gap-3 border-b border-paper/10 px-4 py-3"
          aria-label="Filters"
        >
          <TimeFilterChips value={since} onChange={setSince} />
          <TypeFilterChips
            selected={selectedTypes}
            onChange={setSelectedTypes}
          />
        </div>

        {/* Scrollable incident list. Each row is an IncidentRow `<Link>`
            that navigates to /map/incident/[id]. Empty state shows a
            terse mono message. */}
        <div
          className="flex-1 overflow-y-auto"
          aria-label="Incident list"
        >
          {filteredIncidents.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
                No incidents match the current filters
              </p>
            </div>
          ) : (
            filteredIncidents.map((incident) => (
              <IncidentRowUI
                key={incident.id}
                id={incident.id}
                createdAt={incident.createdAt}
                address={incident.address}
                type={incident.type}
                alarmLevel={incident.alarmLevel}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
