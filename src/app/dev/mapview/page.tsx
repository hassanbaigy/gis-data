/**
 * Dev fixture for the MapView component. Renders one of each marker type
 * around the Gorham, ME centroid plus a sample route from the incident to
 * the chosen hydrant.
 *
 * 404s in production builds — this is a developer sanity-check page, not
 * a user-facing route. Same approach as Next.js's own /__nextjs_original-stack-frame
 * pattern: dev-only.
 */
import { notFound } from "next/navigation";
import { MapView, type MapMarker } from "@/components/MapView";

const GORHAM: [number, number] = [-70.4444, 43.6791];

const SAMPLE_MARKERS: MapMarker[] = [
  { id: "fixture-incident", type: "incident", lng: -70.4444, lat: 43.6791, label: "Sample incident" },
  { id: "fixture-chosen", type: "chosen", lng: -70.4400, lat: 43.6820, label: "Chosen hydrant" },
  { id: "fixture-hydrant", type: "hydrant", lng: -70.4490, lat: 43.6760, label: "Backup hydrant" },
  { id: "fixture-oos", type: "oos", lng: -70.4380, lat: 43.6760, label: "Out-of-service" },
];

const SAMPLE_ROUTE: GeoJSON.LineString = {
  type: "LineString",
  coordinates: [
    [-70.4444, 43.6791], // incident
    [-70.4430, 43.6802],
    [-70.4415, 43.6814],
    [-70.4400, 43.6820], // chosen hydrant
  ],
};

export default function MapViewDevFixture() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="flex h-screen flex-col bg-black text-paper">
      <header className="border-b border-paper/10 px-6 py-3">
        <h1 className="font-display text-2xl tracking-tight">
          MAPVIEW · DEV FIXTURE
        </h1>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/40">
          4 marker types · sample route · Gorham, ME
        </p>
      </header>
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <MapView
          center={GORHAM}
          zoom={14}
          markers={SAMPLE_MARKERS}
          routeGeometry={SAMPLE_ROUTE}
        />
      </div>
    </main>
  );
}
