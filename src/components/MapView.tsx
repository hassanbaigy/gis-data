"use client";

/**
 * MapView — reusable dark-themed Mapbox GL map with four marker types and an
 * optional route polyline. Consumed by HF-005 (home), HF-008 (results +
 * route), and HF-009 (history).
 *
 * V1 visual fidelity is deliberately loose; HF-008 polishes the marker
 * geometry and the route's dashed double-stack styling. This component
 * focuses on correctness, lifecycle, and the testable state surface.
 *
 * The map renders on a WebGL canvas — DOM queries don't see the markers.
 * We expose a hidden <div data-hf-map-state> with sync'd attributes
 * (marker-count, marker-types, has-route, status) so the Playwright spec
 * has a stable seam.
 */
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

// Stable Mapbox source + layer IDs. We currently assume at most one MapView
// per page — if a future story renders two simultaneously (split view, etc.)
// the second mount will collide on these IDs and Mapbox will throw. At that
// point, suffix the IDs with an instance counter passed via props.
const MARKER_SOURCE = "hf-markers";
const ROUTE_SOURCE = "hf-route";
const LAYER_INCIDENT = "hf-incident-circle";
const LAYER_HYDRANT = "hf-hydrant-circle";
const LAYER_HYDRANT_RING = "hf-hydrant-ring";
const LAYER_CHOSEN = "hf-chosen-circle";
const LAYER_OOS = "hf-oos-circle";
const LAYER_ROUTE = "hf-route-line";

export type MapMarkerType = "incident" | "hydrant" | "chosen" | "oos";

export type MapMarker = {
  id: string;
  type: MapMarkerType;
  lng: number;
  lat: number;
  label?: string;
};

export type MapViewProps = {
  center: [lng: number, lat: number];
  zoom: number;
  markers: MapMarker[];
  routeGeometry?: GeoJSON.LineString;
  /**
   * Optional override classes. The component fills its parent by default
   * via inline width/height: 100%. If you pass `className`, you are
   * responsible for ensuring the resolved size is non-zero BEFORE
   * mount — Mapbox reads container.clientWidth/Height on init and a
   * 0-height container renders an invisible map. See
   * `.claude/agent-context/mapbox-integration.md` for the flexbox fix.
   */
  className?: string;
};

type MapStatus = "loading" | "ready" | "error" | "no-token";

function markersToFeatureCollection(
  markers: MapMarker[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: markers.map((m) => ({
      type: "Feature",
      properties: { id: m.id, type: m.type, label: m.label ?? null },
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
    })),
  };
}

export function MapView({
  center,
  zoom,
  markers,
  routeGeometry,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>(
    MAPBOX_TOKEN ? "loading" : "no-token",
  );

  // Derived testing surface — sorted unique types as a stable string.
  const markerTypesString = useMemo(() => {
    const set = new Set(markers.map((m) => m.type));
    return [...set].sort().join(",");
  }, [markers]);

  // Whether to ring in-service hydrants (rule: ring them when a `chosen`
  // sibling exists in the array).
  const ringHydrants = useMemo(
    () => markers.some((m) => m.type === "chosen"),
    [markers],
  );

  // -------------------------------------------------------------------------
  // Initialise the map once, on mount. Tear down on unmount.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    if (!containerRef.current) return;

    // NOTE: mapboxgl.accessToken is a GLOBAL on the mapbox-gl module. If a
    // future story ever mounts two MapView instances with different tokens
    // (e.g. one signed for admin, one public), the later mount's token will
    // win for both instances. Not a current problem but a known footgun.
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center,
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("error", (e: mapboxgl.ErrorEvent) => {
      // Surface to console so the Playwright spec catches Mapbox runtime
      // errors that would otherwise be swallowed by Mapbox's own handler.
      console.error("[MapView] mapbox error:", e.error?.message ?? e);
      setStatus("error");
    });

    map.on("style.load", () => {
      styleLoadedRef.current = true;
      // Add empty sources up front; data sync effect below will fill them.
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      // Layers, low → high stacking:
      //   route → hydrant-ring → hydrant → oos → chosen-halo → chosen → incident
      // (incidents on top so the firefighter always sees them clearly).
      map.addLayer({
        id: LAYER_ROUTE,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FCD34D",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      map.addLayer({
        id: LAYER_HYDRANT_RING,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "hydrant"],
        paint: {
          "circle-radius": 10,
          "circle-color": "transparent",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#FCD34D",
          "circle-stroke-opacity": 0,
        },
      });

      map.addLayer({
        id: LAYER_HYDRANT,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "hydrant"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#3b82f6",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0a0a0a",
        },
      });

      map.addLayer({
        id: LAYER_OOS,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "oos"],
        paint: {
          "circle-radius": 7,
          "circle-color": "#6b7280",
          "circle-opacity": 0.6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0a0a0a",
        },
      });

      map.addLayer({
        id: LAYER_CHOSEN,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "chosen"],
        paint: {
          "circle-radius": 11,
          "circle-color": "#FCD34D",
          "circle-stroke-width": 4,
          "circle-stroke-color": "#FCD34D",
          "circle-stroke-opacity": 0.4,
        },
      });

      map.addLayer({
        id: LAYER_INCIDENT,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "incident"],
        paint: {
          "circle-radius": 10,
          "circle-color": "#E11D29",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    });

    // `load` fires after style.load + first viewport tiles are visible.
    // Flip "ready" here so the testable surface (and screenshots) signal
    // a truly rendered map, not just a parsed style.
    map.on("load", () => {
      setStatus("ready");
    });

    return () => {
      try {
        map.remove();
      } catch (err) {
        // Mapbox throws on double-remove in some HMR scenarios. Log so a
        // legitimate teardown failure (lost GL context, etc.) is visible
        // instead of silently dropped.
        console.warn("[MapView] map.remove() threw during cleanup:", err);
      }
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // Intentionally only run on mount; centre/zoom updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Sync centre + zoom when props change (cheap; only animates if different).
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.jumpTo({ center, zoom });
  }, [center, zoom]);

  // Derived: only sync data when the map is fully ready. We use this
  // (not `status`) in dep arrays so the effects don't re-fire on an error
  // transition, which would call setPaintProperty on a torn-down map.
  const isReady = status === "ready";

  // -------------------------------------------------------------------------
  // Sync markers data
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady) return;
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const src = map.getSource(MARKER_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(markersToFeatureCollection(markers));

    // Apply / hide the hydrant ring conditionally on the presence of a
    // chosen marker.
    map.setPaintProperty(
      LAYER_HYDRANT_RING,
      "circle-stroke-opacity",
      ringHydrants ? 1 : 0,
    );
  }, [markers, ringHydrants, isReady]);

  // -------------------------------------------------------------------------
  // Sync route geometry
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady) return;
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const src = map.getSource(ROUTE_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(
      routeGeometry
        ? { type: "Feature", properties: {}, geometry: routeGeometry }
        : {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
    );
    // Hide the route layer entirely when there's no geometry.
    map.setLayoutProperty(
      LAYER_ROUTE,
      "visibility",
      routeGeometry ? "visible" : "none",
    );
  }, [routeGeometry, isReady]);

  return (
    <div
      className={`relative ${className ?? ""}`}
      // Default to filling the parent. Inline style (not Tailwind) so the size
      // is resolved before first paint — `h-full` on a flex child depends on
      // the parent flex item's height being resolved, which can race the
      // Mapbox init on first render.
      style={className ? undefined : { width: "100%", height: "100%", minHeight: 0 }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        // Same reason — guarantee non-zero size before Mapbox reads it.
        style={{ width: "100%", height: "100%" }}
      />

      {/* Testable state surface — Playwright reads these attributes. */}
      <div
        data-hf-map-state
        data-status={status}
        data-marker-count={markers.length}
        data-marker-types={markerTypesString}
        data-has-route={routeGeometry ? "true" : "false"}
        className="sr-only"
        aria-hidden="true"
      />

      {/* User-visible error / config states. */}
      {status === "no-token" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-paper">
          <div className="max-w-md p-6 text-center">
            <p className="font-display text-2xl tracking-tight">Map unavailable</p>
            <p className="mt-2 text-sm text-paper/70">
              <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> is not set.
              Add it to <code className="font-mono">.env.local</code> and reload.
            </p>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-paper">
          <p className="font-mono text-sm">Mapbox runtime error. Check the console.</p>
        </div>
      ) : null}
    </div>
  );
}

export default MapView;
