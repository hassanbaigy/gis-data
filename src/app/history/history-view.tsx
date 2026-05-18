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
 * Layout: split flex column. Top section (`flex-1` + `minHeight: 0`) is
 * the `MapView`. Bottom section (`flex-1`, `overflow-y-auto`) holds the
 * filter rail + scrollable incident list. `BottomSheet` is deliberately
 * NOT used here — it's an overlay component designed for full-bleed map
 * screens, not split layouts.
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
import {
  TimeFilterChips,
  type SinceFilter as _SinceFilter,
} from "@/components/TimeFilterChips";
import { TypeFilterChips } from "@/components/TypeFilterChips";

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
  unitId: string;
  chosenHydrantId: string | null;
};

/**
 * Time-filter sentinel values that map 1:1 to the GET /api/incidents
 * `since` query param. Re-exported from `TimeFilterChips` for callers
 * that need the type.
 */
export type SinceFilter = _SinceFilter;

type Props = {
  initialIncidents: IncidentRow[];
};

export function HistoryView({ initialIncidents }: Props) {
  const [since, setSince] = useState<SinceFilter>("7d");
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
    <main className="flex h-screen flex-col bg-black text-paper">
      {/* Map area — flex-1 with inline minHeight:0 to break Mapbox container
          race (see mapbox-integration.md). */}
      <section
        aria-label="History map"
        className="relative flex-1"
        style={{ minHeight: 0 }}
      >
        <MapView center={center} zoom={ZOOM} markers={markers} />
      </section>

      {/* Filter rail + list section. flex-1 mirrors the map height; the
          inner list area is `overflow-y-auto` so long lists scroll
          internally without expanding the section. */}
      <section
        aria-label="Incident history"
        className="flex flex-1 flex-col border-t border-paper/10 bg-black"
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

        {/* Step D replaces this placeholder with IncidentRow components.
            For Step B verification, this just confirms the data is
            reachable + the layout is structurally sound. */}
        <div
          className="flex-1 overflow-y-auto"
          aria-label="Incident list"
        >
          <p className="px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
            {filteredIncidents.length} incident
            {filteredIncidents.length === 1 ? "" : "s"} — rows coming in step D
          </p>
        </div>
      </section>
    </main>
  );
}
