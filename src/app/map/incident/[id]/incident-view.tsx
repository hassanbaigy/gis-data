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

/**
 * HF-010 — viewport breakpoint hook. Duplicates map-home.tsx's
 * `useIsTablet()`. Future chore: hoist into a shared module. See
 * map-home.tsx for the full rationale (conditional rendering keeps the
 * tablet-only DOM out of phone-viewport tests).
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
  const isTablet = useIsTablet();
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

  // Bottom-sheet inner contents — hoisted so the same JSX renders in both
  // the phone overlay version and the tablet rail version. Only one is
  // ever in DOM at a time (conditional render), so no duplicate-DOM
  // strict-mode issue.
  const sheetContents = (
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

      {data.flaggedOos.length > 0 ? (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/40">
            Out of service · {data.flaggedOos.length}
          </p>
          <div className="mt-2 space-y-2">
            {data.flaggedOos.map((item) => (
              <HydrantCard
                key={item.hydrant.id}
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
  );

  // Footer (NAVIGATE CTA + list-icon button). Same content at both
  // viewports — hoisted for the same reason.
  const footer = (
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
  );

  return (
    // HF-010: phone keeps the column layout (map full-bleed + BottomSheet
    // overlay + footer below). Tablet flips to row: rail (BottomSheet as
    // static 440px column with the footer at its bottom) + map fills the
    // rest. Top-bar overlay is absolute on <main> at both viewports so
    // the badge plate corners stay at the VIEWPORT corners per the AC.
    <main className="relative flex h-screen flex-col bg-black text-paper lg:flex-row">
      {/* Top-bar overlay — absolute, VIEWPORT corners. z-20 above the
          tablet rail (z-10). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
          <ActiveTimerPill createdAt={data.incident.createdAt} />
          {/* HF-006 regression-safe: visible "INCIDENT" text. */}
          <p className="bg-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/70 backdrop-blur-sm">
            INCIDENT · {data.incident.type} · ALARM {data.incident.alarmLevel}
          </p>
        </div>
        <div className="pointer-events-auto">
          <SosButton />
        </div>
      </div>

      {isTablet ? (
        <>
          {/* TABLET layout — rail (BottomSheet + footer) on the left, map
              on the right. The rail BottomSheet passes a className that
              overrides its default `absolute inset-x-0 bottom-0` to a
              static column. Footer sits at the bottom of the rail. */}
          <aside
            data-hf-rail="incident"
            aria-label="Nearest hydrants and navigation controls"
            className="order-1 flex h-full w-[440px] flex-shrink-0 flex-col border-r border-paper/10"
          >
            {/* Top-bar inset spacer so the rail content sits below the
                absolute top-bar overlay. ~64px (4rem) covers the pill
                + INCIDENT label height. */}
            <div className="h-16 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 overflow-y-auto">
              <BottomSheet
                ariaLabel="Nearest hydrants results"
                className="!static !inset-auto !z-auto !rounded-none !shadow-none"
              >
                {sheetContents}
              </BottomSheet>
            </div>
            {footer}
          </aside>

          {/* Map column — order-2 (right). minWidth: 0 breaks the row-flex
              container-sizing race. */}
          <div
            className="relative order-2 flex-1"
            style={{ minWidth: 0, minHeight: 0 }}
          >
            <MapView
              center={[data.incident.lng, data.incident.lat]}
              zoom={15}
              markers={markers}
              routeGeometry={data.nearest[0]?.geometry}
            />
          </div>
        </>
      ) : (
        <>
          {/* PHONE layout — map fills, BottomSheet overlays at the bottom,
              footer sticky below. Byte-identical to HF-008. */}
          <div className="relative flex-1" style={{ minHeight: 0 }}>
            <MapView
              center={[data.incident.lng, data.incident.lat]}
              zoom={15}
              markers={markers}
              routeGeometry={data.nearest[0]?.geometry}
            />
            <BottomSheet ariaLabel="Nearest hydrants results">
              {sheetContents}
            </BottomSheet>
          </div>
          {footer}
        </>
      )}

      {/* Full hydrant list modal — same as before; conditionally mounted. */}
      {modalOpen ? (
        <HydrantsModal
          entries={modalEntries}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </main>
  );
}
