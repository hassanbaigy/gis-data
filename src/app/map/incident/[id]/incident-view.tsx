"use client";

/**
 * /map/incident/[id] — polished results + route screen (HF-008).
 *
 * Replaces the HF-006 placeholder side-panel with the spec-card-4 layout:
 *   - Top bar: pulsing red ACTIVE timer pill (left), SOS button (right).
 *     Below the pill, a small mono "INCIDENT · <TYPE> · ALARM <N>" label
 *     that doubles as the page identity AND keeps HF-006's spec assertion
 *     `getByText(/incident/i).first()` green.
 *   - Full-bleed dark MapView underneath, with the polished marker styles
 *     (teardrop incident, yellow-halo chosen, blue ringed hydrants, grey X
 *     for OOS) and double-stack route polyline (10px @ 0.35 base + 5px
 *     dashed top).
 *   - BottomSheet on top of the map: header "NEAREST HYDRANTS · 3 of N",
 *     three HydrantCards (1, 2, 3). #1 carries the yellow-border emphasis.
 *   - Persistent footer: red NAVIGATE CTA opening `maps:?daddr=<lat>,<lng>`
 *     for the chosen hydrant, plus a 64px list-icon button that opens the
 *     HydrantsModal with the full hydrant set (top-3 + flagged OOS).
 *
 * Data flow: identical to the HF-006 placeholder — single client-side
 * fetch to GET /api/incidents/[id] on mount; the existing ApiResponse
 * type is reused.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { MapView, type MapMarker } from "@/components/MapView";
import { ActiveTimerPill } from "@/components/ActiveTimerPill";
import { SosButton } from "@/components/SosButton";
import { BottomSheet } from "@/components/BottomSheet";
import { HydrantCard } from "@/components/HydrantCard";
import {
  HydrantsModal,
  type HydrantEntry,
} from "@/components/HydrantsModal";

type ApiResponse = {
  incident: {
    id: string;
    createdAt: string;
    address: string;
    lat: number;
    lng: number;
    type: string;
    alarmLevel: number;
    unitId: string;
    notes: string | null;
    chosenHydrantId: string | null;
  };
  nearest: Array<{
    hydrant: { id: string; address: string; lat: number; lng: number };
    distanceM: number;
    durationS: number;
    geometry?: GeoJSON.LineString;
  }>;
  flaggedOos: Array<{
    hydrant: { id: string; address: string; lat: number; lng: number };
    distanceM: number;
  }>;
  degraded?: boolean;
};

export default function IncidentView() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    fetch(`/api/incidents/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json() as Promise<ApiResponse>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "unknown");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Build the marker list once per data update.
  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "incident",
        type: "incident" as const,
        lng: data.incident.lng,
        lat: data.incident.lat,
      },
      ...data.nearest.map((item, i) => ({
        id: item.hydrant.id,
        type: (i === 0 ? "chosen" : "hydrant") as "chosen" | "hydrant",
        lng: item.hydrant.lng,
        lat: item.hydrant.lat,
      })),
      ...data.flaggedOos.map((item) => ({
        id: item.hydrant.id,
        type: "oos" as const,
        lng: item.hydrant.lng,
        lat: item.hydrant.lat,
      })),
    ];
  }, [data]);

  // Flatten nearest + flaggedOos into modal-friendly entries, preserving rank
  // numbering across the boundary so OOS rows show their original index.
  const modalEntries: HydrantEntry[] = useMemo(() => {
    if (!data) return [];
    const top = data.nearest.map((item, i) => ({
      rank: i + 1,
      hydrant: item.hydrant,
      distanceM: item.distanceM,
      durationS: item.durationS,
      isOos: false,
    }));
    const oos = data.flaggedOos.map((item, i) => ({
      rank: data.nearest.length + i + 1,
      hydrant: item.hydrant,
      distanceM: item.distanceM,
      isOos: true,
    }));
    return [...top, ...oos];
  }, [data]);

  // ---------------------------------------------------------------------------
  // Loading / error states. These intentionally hold the "loading…" or error
  // text path only briefly — once data arrives, the polished UI renders.
  // HF-006's regression assertion (`getByText(/incident/i).first()` is
  // visible) waits for the network round-trip to complete, so the steady
  // state is what the test sees.
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-paper">
        <p className="font-mono text-sm text-red">
          incident error · {error}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-paper">
        <p className="font-mono text-sm">loading incident…</p>
      </main>
    );
  }

  // Steady state — data is loaded.
  const totalConsidered = data.nearest.length + data.flaggedOos.length;
  const chosen = data.nearest[0]?.hydrant;
  // Round coords to 3 decimals (~110m precision) in the iOS Maps URL.
  // Raw Mapbox 6-decimal coords work too, but 3 decimals is enough for the
  // tactical "drop the user on the right block" use case. iOS Maps will
  // route to the chosen point regardless of the trailing precision.
  const navigateHref = chosen
    ? `maps:?daddr=${chosen.lat.toFixed(3)},${chosen.lng.toFixed(3)}`
    : undefined;

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      {/* Map area — flex-1 with inline minHeight: 0 so Mapbox container
          resolves height before init (see mapbox-integration.md). */}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <MapView
          center={[data.incident.lng, data.incident.lat]}
          zoom={15}
          markers={markers}
          routeGeometry={data.nearest[0]?.geometry}
        />

        {/* Top bar overlay. `pointer-events-none` on the wrapper so taps fall
            through to the map; interactive children re-enable. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
          <div className="pointer-events-auto flex flex-col items-start gap-1.5">
            <ActiveTimerPill createdAt={data.incident.createdAt} />
            {/* HF-006 regression-safe: visible "INCIDENT" text + handy field
                info (type + alarm level). Renders below the timer pill. */}
            <p className="bg-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/70 backdrop-blur-sm">
              INCIDENT · {data.incident.type} · ALARM {data.incident.alarmLevel}
            </p>
          </div>
          <div className="pointer-events-auto">
            <SosButton />
          </div>
        </div>

        {/* Bottom sheet — polished result list. Drag handle is visual only
            (D1); the sheet is always fully open. */}
        <BottomSheet ariaLabel="Nearest hydrants results">
          <div className="px-4 pb-4 pt-1">
            <header className="mb-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/40">
                NEAREST HYDRANTS · {data.nearest.length} of {totalConsidered}
                {data.degraded ? " · DEGRADED" : ""}
              </p>
              {data.degraded ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-yellow/80">
                  Route geometry unavailable — distances are straight-line.
                </p>
              ) : null}
            </header>
            <div className="space-y-2">
              {data.nearest.map((item, i) => (
                <HydrantCard
                  key={item.hydrant.id}
                  rank={i + 1}
                  hydrant={item.hydrant}
                  distanceM={item.distanceM}
                  durationS={item.durationS}
                />
              ))}
            </div>

            {/* Flagged OOS section — rendered below the top-3 with OUT chips
                so the firefighter sees nearby out-of-service hydrants
                without having to open the modal. AC: "Any card whose
                hydrant is flagged OOS shows a red OUT chip". */}
            {data.flaggedOos.length > 0 ? (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/40">
                  Out of service · {data.flaggedOos.length}
                </p>
                <div className="mt-2 space-y-2">
                  {data.flaggedOos.map((item) => (
                    <HydrantCard
                      key={item.hydrant.id}
                      // `rank` is not used as a sort index here; OOS cards
                      // skip the data-rank attribute internally. The number
                      // is rendered visually as a faint marker.
                      rank={0}
                      hydrant={item.hydrant}
                      distanceM={item.distanceM}
                      isOos
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </BottomSheet>
      </div>

      {/* Persistent footer — NAVIGATE CTA + list-icon button. */}
      <footer className="flex w-full flex-shrink-0">
        {navigateHref ? (
          <a
            href={navigateHref}
            className="flex flex-1 items-center justify-center bg-red px-6 py-5 text-center font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-paper shadow-[0_-4px_24px_rgba(225,29,41,0.25)] transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-yellow"
          >
            Navigate →
          </a>
        ) : (
          <div
            className="flex flex-1 items-center justify-center bg-red/40 px-6 py-5 text-center font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-paper/60"
            aria-disabled="true"
          >
            No route
          </div>
        )}
        <button
          type="button"
          aria-label="Show full hydrant list"
          onClick={() => setModalOpen(true)}
          className="flex w-16 flex-shrink-0 items-center justify-center border-l border-smoke/40 bg-black text-paper transition-colors hover:bg-paper/5 focus:outline-none focus:ring-2 focus:ring-yellow"
        >
          {/* Hamburger list icon — decorative; accessible name from aria-label */}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </button>
      </footer>

      {/* Full hydrant list modal — only mounted when open so it can't
          interfere with focus / pointer events when closed. */}
      {modalOpen ? (
        <HydrantsModal
          entries={modalEntries}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </main>
  );
}
