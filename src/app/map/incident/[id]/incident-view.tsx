"use client";

/**
 * /map/incident/[id] — minimal placeholder.
 *
 * HF-008 polishes this into the full results + route screen (active timer
 * pill, drag-handle bottom sheet, navigate CTA, etc). For now we render the
 * MapView with markers + route + a simple side panel showing what the
 * nearest API returned. This is intentionally close to /dev/nearest's
 * layout so HF-008 can lift it almost verbatim.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapView, type MapMarker } from "@/components/MapView";

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

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/incidents/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json() as Promise<ApiResponse>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "unknown"));
  }, [params.id]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-paper">
        <p className="font-mono text-sm text-red">incident error · {error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-paper">
        <p className="font-mono text-sm">loading…</p>
      </main>
    );
  }

  const markers: MapMarker[] = [
    {
      id: "incident",
      type: "incident",
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

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      <header className="border-b border-paper/10 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
          INCIDENT · {data.incident.type} · ALARM {data.incident.alarmLevel}
        </p>
        <h1 className="mt-1 font-display text-xl tracking-tight">
          {data.incident.address}
        </h1>
      </header>

      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <MapView
          center={[data.incident.lng, data.incident.lat]}
          zoom={15}
          markers={markers}
          routeGeometry={data.nearest[0]?.geometry}
        />

        {/* Side panel — HF-008 will replace with a proper bottom sheet. */}
        <aside className="absolute right-4 top-4 max-w-xs space-y-3 bg-black/85 p-4 font-mono text-xs">
          <p className="text-yellow">
            NEAREST · {data.nearest.length} of {data.nearest.length + data.flaggedOos.length}
            {data.degraded ? " · degraded" : ""}
          </p>
          {data.nearest.map((item, i) => (
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
          {data.flaggedOos.length > 0 && (
            <>
              <p className="mt-3 text-paper/40">OOS in range</p>
              {data.flaggedOos.map((item) => (
                <div key={item.hydrant.id} className="border-l border-paper/10 pl-2 text-paper/40">
                  <p>{item.hydrant.id}</p>
                  <p>{item.hydrant.address}</p>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
