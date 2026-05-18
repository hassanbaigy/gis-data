"use client";

/**
 * MapView — reusable dark-themed Mapbox GL map with four marker types and an
 * optional route polyline. Consumed by HF-005 (home), HF-008 (results +
 * route), and HF-009 (history).
 *
 * HF-008 polished the marker geometry + route styling. Specifically:
 *   - Incident marker: symbol layer with a canvas-drawn red teardrop and a
 *     white `!` glyph (was a plain red circle). D2 Plan A — image is drawn
 *     once during `style.load` via `ctx.getImageData` and registered with
 *     `map.addImage`.
 *   - Chosen (#1) marker: yellow halo via a wider low-opacity stroke (visual
 *     emphasis on the routed-to hydrant).
 *   - Hydrant ring (#2, #3): paint stays a yellow ring, slightly thicker
 *     stroke for legibility at zoom 12.
 *   - OOS marker: symbol layer with a grey `✕` text glyph (was a grey
 *     circle). Uses Mapbox's default glyph set — no addImage needed.
 *   - Route polyline: double-stack. `LAYER_ROUTE_BASE` is a wide 10px
 *     35%-opacity underlay; `LAYER_ROUTE` on top is the original 5px line
 *     now with `line-dasharray: [2, 2]` for the dashed look.
 *
 * Everything else is unchanged: `MapViewProps` interface, layer ID
 * constants (LAYER_OOS and LAYER_INCIDENT keep their names even though
 * their type switched from `circle` to `symbol`), and the
 * `data-hf-map-state` test seam (the four attributes Playwright reads).
 *
 * The map renders on a WebGL canvas — DOM queries don't see the markers.
 * `<div data-hf-map-state>` is the testable seam.
 */
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

// Stable Mapbox source + layer IDs. Layer IDs are unchanged from HF-004 even
// though HF-008 switched some types from `circle` to `symbol` — preserving
// the names keeps any external `setPaintProperty` / `setLayoutProperty`
// references working (none currently, but future stories may add them).
const MARKER_SOURCE = "hf-markers";
const ROUTE_SOURCE = "hf-route";
const LAYER_INCIDENT = "hf-incident-circle"; // now a symbol layer
const LAYER_HYDRANT = "hf-hydrant-circle";
const LAYER_HYDRANT_RING = "hf-hydrant-ring";
const LAYER_CHOSEN = "hf-chosen-circle";
const LAYER_OOS = "hf-oos-circle"; // now a symbol layer
const LAYER_ROUTE_BASE = "hf-route-line-base"; // NEW (HF-008) — wide underlay
const LAYER_ROUTE = "hf-route-line"; // dashed top layer

// Image ID for the canvas-drawn incident teardrop.
const IMAGE_INCIDENT = "hf-incident-teardrop";

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

/**
 * Draw the incident teardrop icon to an offscreen canvas and return the
 * resulting ImageData for `map.addImage`. Called once inside the
 * `style.load` callback (HF-008 D2 Plan A).
 *
 * The icon is 48×48 with `pixelRatio: 2` registration, so it renders at
 * ~24px on a standard-DPI screen and crisp on retina. White outline +
 * red interior + white `!` glyph centred in the head.
 *
 * Falls back to returning null if the browser can't get a 2D context
 * (extremely rare; the caller checks).
 */
function createIncidentTeardropImageData(): ImageData | null {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // White outer outline (drawn first, slightly larger so it shows through
  // the edges of the red fill below)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(24, 18, 15, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12.5, 24.5); // tail: triangle from left base, right base, point
  ctx.lineTo(35.5, 24.5);
  ctx.lineTo(24, 46);
  ctx.closePath();
  ctx.fill();

  // Red interior (drawn on top, smaller — leaves a 1.5px white outline)
  ctx.fillStyle = "#E11D29";
  ctx.beginPath();
  ctx.arc(24, 18, 13.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14.5, 25);
  ctx.lineTo(33.5, 25);
  ctx.lineTo(24, 43.5);
  ctx.closePath();
  ctx.fill();

  // White `!` glyph centred in the head
  ctx.fillStyle = "#ffffff";
  ctx.font =
    'bold 18px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 24, 19);

  return ctx.getImageData(0, 0, size, size);
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

      // Sources first
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

      // Register the incident teardrop icon BEFORE the symbol layer that
      // references it. The matching `addLayer` for LAYER_INCIDENT below is
      // gated on the SAME boolean — if the canvas 2D context is unavailable
      // (rare, but happens in some headless WASM-GL environments), we fall
      // back to D2's circle-paint variant so the spec's console-error
      // guard doesn't trip on a "Image 'hf-incident-teardrop' not loaded"
      // error from a dangling symbol layer.
      const incidentIcon = createIncidentTeardropImageData();
      const useTeardropSymbol = incidentIcon !== null;
      if (incidentIcon && !map.hasImage(IMAGE_INCIDENT)) {
        map.addImage(IMAGE_INCIDENT, incidentIcon, { pixelRatio: 2 });
      }

      // Layer stack (low → high). Order encodes z-index:
      //   route-base (wide underlay)
      //   route (dashed top)
      //   hydrant-ring
      //   hydrant
      //   oos (symbol X)
      //   chosen (yellow halo + fill)
      //   incident (symbol teardrop) — always on top
      //
      // Both route layers consume ROUTE_SOURCE so a single geometry update
      // flows to both. They're toggled on/off together by the route-sync
      // effect below.

      map.addLayer({
        id: LAYER_ROUTE_BASE,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FCD34D",
          "line-width": 10,
          "line-opacity": 0.35,
        },
      });

      map.addLayer({
        id: LAYER_ROUTE,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FCD34D",
          "line-width": 5,
          "line-opacity": 0.95,
          // HF-008 — dashed top stroke per spec card 4 ("dashed top layer
          // 5px solid yellow"). Dash units are in line-widths.
          "line-dasharray": [2, 2],
        },
      });

      map.addLayer({
        id: LAYER_HYDRANT_RING,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "hydrant"],
        paint: {
          "circle-radius": 11,
          "circle-color": "transparent",
          // Wider stroke than HF-004's 1.5 — reads cleaner at zoom 12.
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FCD34D",
          "circle-stroke-opacity": 0, // toggled by ringHydrants effect
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

      // OOS — symbol layer with a grey `✕` glyph (HF-008). Uses Mapbox's
      // default glyph set so no addImage is required. The default glyph
      // font ("Open Sans Bold") is loaded by `mapbox://styles/mapbox/dark-v11`.
      map.addLayer({
        id: LAYER_OOS,
        type: "symbol",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "oos"],
        layout: {
          "text-field": "✕",
          // Spec card 3 calls for 14px. Mapbox text-size is unitless in
          // style coordinates but maps roughly 1:1 to CSS px at zoom ≥ 10.
          "text-size": 14,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#9ca3af", // gray-400; visible on dark bg
          "text-halo-color": "#0a0a0a",
          "text-halo-width": 2,
        },
      });

      // Chosen (#1) — yellow halo via a wider, low-opacity stroke.
      map.addLayer({
        id: LAYER_CHOSEN,
        type: "circle",
        source: MARKER_SOURCE,
        filter: ["==", ["get", "type"], "chosen"],
        paint: {
          "circle-radius": 10,
          "circle-color": "#FCD34D",
          "circle-stroke-width": 8, // wider halo (was 4)
          "circle-stroke-color": "#FCD34D",
          "circle-stroke-opacity": 0.35, // softer (was 0.4)
        },
      });

      // Incident — symbol layer with the canvas-drawn teardrop icon when
      // available, else D2 fallback to a circle paint layer. The fallback
      // path keeps Mapbox console-clean (the symbol layer would log
      // "Image not loaded" on every paint if the icon wasn't registered).
      if (useTeardropSymbol) {
        map.addLayer({
          id: LAYER_INCIDENT,
          type: "symbol",
          source: MARKER_SOURCE,
          filter: ["==", ["get", "type"], "incident"],
          layout: {
            "icon-image": IMAGE_INCIDENT,
            "icon-size": 0.7,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // Anchor the bottom point of the teardrop on the lat/lng.
            "icon-anchor": "bottom",
          },
        });
      } else {
        // D2 Plan B fallback — red circle + white "!" overlay. Two layers
        // share the LAYER_INCIDENT id only for the circle base; the text
        // layer rides above with a distinct id but is added to the same
        // visual slot in the stack.
        map.addLayer({
          id: LAYER_INCIDENT,
          type: "circle",
          source: MARKER_SOURCE,
          filter: ["==", ["get", "type"], "incident"],
          paint: {
            "circle-radius": 12,
            "circle-color": "#E11D29",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: `${LAYER_INCIDENT}-label`,
          type: "symbol",
          source: MARKER_SOURCE,
          filter: ["==", ["get", "type"], "incident"],
          layout: {
            "text-field": "!",
            "text-size": 14,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#ffffff" },
        });
      }
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
  // Sync route geometry. Both LAYER_ROUTE_BASE (HF-008 underlay) and
  // LAYER_ROUTE (HF-004 top stroke, now dashed) share ROUTE_SOURCE — the
  // setData call below feeds both, and the visibility toggle hides both
  // together when there's no geometry to draw.
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
    const visibility: "visible" | "none" = routeGeometry ? "visible" : "none";
    map.setLayoutProperty(LAYER_ROUTE_BASE, "visibility", visibility);
    map.setLayoutProperty(LAYER_ROUTE, "visibility", visibility);
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
