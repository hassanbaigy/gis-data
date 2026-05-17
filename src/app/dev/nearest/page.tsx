"use client";

/**
 * Dev demo — quick way to validate HF-007's nearest-hydrant API against
 * the MapView component without going through the full /map/new form.
 * Two test buttons drop an incident in Gorham; the result panel mirrors
 * what /map/incident/[id] shows.
 *
 * 404s in production builds (NODE_ENV check inside the body — client
 * component so we can't use notFound() at render). HF-006 keeps this
 * page so future stories have a deterministic API+UI fixture.
 */
import { useEffect, useState } from "react";
import { MapView, type MapMarker } from "@/components/MapView";

const GORHAM: [number, number] = [-70.4444, 43.6791];

type ApiResponse = {
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

export default function NearestDevDemo() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-paper font-mono text-sm">
        404 — dev fixture only
      </main>
    );
  }

  return <DevDemoInner />;
}

function DevDemoInner() {
  const [incident, setIncident] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev fixture — driving setState directly here is fine; the rule's
  // concern (derived state) doesn't apply when the effect just surfaces a
  // network response from a user action.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!incident) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetch("/api/hydrants/nearest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(incident),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status}: ${body.slice(0, 200)}`);
        }
        return res.json() as Promise<ApiResponse>;
      })
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : "unknown"))
      .finally(() => setLoading(false));
  }, [incident]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const markers: MapMarker[] = [];
  if (incident) {
    markers.push({
      id: "incident",
      type: "incident",
      lng: incident.lng,
      lat: incident.lat,
    });
  }
  if (result) {
    result.nearest.forEach((item, i) => {
      markers.push({
        id: `nearest-${item.hydrant.id}`,
        type: i === 0 ? "chosen" : "hydrant",
        lng: item.hydrant.lng,
        lat: item.hydrant.lat,
      });
    });
    result.flaggedOos.forEach((item) => {
      markers.push({
        id: `oos-${item.hydrant.id}`,
        type: "oos",
        lng: item.hydrant.lng,
        lat: item.hydrant.lat,
      });
    });
  }

  const center = incident
    ? ([incident.lng, incident.lat] as [number, number])
    : GORHAM;

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      <header className="flex items-center justify-between border-b border-paper/10 px-6 py-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight">NEAREST · DEV DEMO</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/40">
            Hits POST /api/hydrants/nearest with hardcoded Gorham coords
          </p>
        </div>
        <div className="flex gap-2 font-mono text-[11px]">
          <button
            onClick={() => setIncident({ lat: 43.6791, lng: -70.4444 })}
            className="border border-yellow px-2 py-1 text-yellow"
          >
            test: gorham center
          </button>
          <button
            onClick={() => setIncident({ lat: 43.685, lng: -70.435 })}
            className="border border-yellow px-2 py-1 text-yellow"
          >
            test: NE corner
          </button>
          <button
            onClick={() => {
              setIncident(null);
              setResult(null);
              setError(null);
            }}
            className="border border-paper/30 px-2 py-1 text-paper/70"
          >
            clear
          </button>
        </div>
      </header>

      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <MapView
          center={center}
          zoom={14}
          markers={markers}
          routeGeometry={result?.nearest[0]?.geometry}
        />

        <div className="absolute right-4 top-4 max-w-xs bg-black/85 p-4 font-mono text-xs">
          {loading && <p className="text-yellow">finding hydrants…</p>}
          {error && <p className="text-red">error: {error}</p>}
          {result && (
            <div className="space-y-2">
              <p className="text-yellow">
                nearest ({result.nearest.length})
                {result.degraded ? " · degraded" : ""}
              </p>
              {result.nearest.map((item, i) => (
                <div
                  key={item.hydrant.id}
                  className={
                    i === 0
                      ? "border-l-2 border-yellow pl-2"
                      : "border-l border-paper/20 pl-2"
                  }
                >
                  <p>
                    #{i + 1} · {item.hydrant.id}
                  </p>
                  <p className="text-paper/60">{item.hydrant.address}</p>
                  <p className="text-paper/40">
                    {item.distanceM}m · {item.durationS}s
                  </p>
                </div>
              ))}
              {result.flaggedOos.length > 0 && (
                <>
                  <p className="mt-3 text-paper/40">flagged OOS</p>
                  {result.flaggedOos.map((item) => (
                    <div
                      key={item.hydrant.id}
                      className="border-l border-paper/10 pl-2 text-paper/40"
                    >
                      <p>{item.hydrant.id}</p>
                      <p className="text-paper/30">{item.hydrant.address}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {!loading && !error && !result && !incident && (
            <p className="text-paper/50">click a test button above ↑</p>
          )}
        </div>
      </div>
    </main>
  );
}
