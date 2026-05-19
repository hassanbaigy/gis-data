# Mapbox GL JS — integration gotchas

Lessons captured during HF-004. Read before opening any file that touches `src/components/MapView.tsx` or before adding a new Mapbox-using component.

## Use native GL layers, not HTML markers (`new mapboxgl.Marker`)

HTML markers (`new mapboxgl.Marker({ element })`) are tempting because they're easy to style with Tailwind. **Don't use them for collections.** At low zoom levels they don't scale with the map, they're a DOM-reflow hazard if you have more than ~30, and they can't participate in Mapbox's clustering / expressions. Instead:

- One GeoJSON source for all markers (e.g. `hf-markers`)
- Multiple `circle` (or `symbol`) layers, each filtered by a `properties.type` value
- Style purely with paint properties — colour, radius, stroke, opacity

The MapView component in this repo uses 5 layers off one source: `hf-incident-circle`, `hf-hydrant-ring`, `hf-hydrant-circle`, `hf-oos-circle`, `hf-chosen-circle`. Layer order encodes z-index — incidents always on top.

## Container sizing race (flex parent gotcha)

If you mount Mapbox inside a `flex-1` child of a flex column, **the container may have height 0 at init time** and Mapbox quietly renders a 0px tall map. Symptoms: spec passes, screenshot is black.

Fix three places at once:
1. Parent flex item: `style={{ minHeight: 0 }}` (the canonical flexbox-children-resolve-height fix)
2. MapView wrapper: explicit inline `style={{ width: "100%", height: "100%", minHeight: 0 }}` so size is resolved before first paint, not via Tailwind class resolution
3. Container `<div ref={containerRef}>`: explicit inline `style={{ width: "100%", height: "100%" }}`

Inline style beats Tailwind class for this case because the size needs to be **resolved** before Mapbox's `new mapboxgl.Map({ container })` reads `container.clientWidth/Height`.

### Row-flex (`flex-row`) needs `minWidth: 0` too — HF-010

When `<main>` switches from `flex-col` to `flex-row` at a breakpoint (`lg:flex-row`), the column-flex `minHeight: 0` fix above is not enough — the **horizontal** dimension hits the same resolution race. Without `minWidth: 0` on the MapView's flex-row sibling, the map's container can render at `clientWidth === 0` and the canvas paints empty.

`src/components/MapView.tsx` only sets `minHeight: 0` in its inline style (line ~491). Out-of-scope to touch for layout stories. **Fix at the consumer level** instead:

```tsx
<div className="relative flex-1 lg:order-2" style={{ minWidth: 0, minHeight: 0 }}>
  <MapView ... />
</div>
```

Applied in HF-010 to all three MapView consumers (`map-home.tsx`, `incident-view.tsx`, `history-view.tsx`). Keep this in mind whenever a new screen wraps MapView in a flex-row parent.

## Status / ready events

Mapbox events that matter, in order:
- `style.load` — style JSON parsed. **You can add sources and layers now, but tiles haven't rendered yet.**
- `load` — style + initial viewport tiles loaded. **First time the map is visibly rendered.** This is when to flip "ready" status for screenshots and lifecycle gates.
- `idle` — render queue drained. Use for "wait for animations to settle" before screenshotting a transitioning map.

Setting up sources/layers in `style.load` and flipping `ready` in `load` is the correct pattern. If you flip ready in `style.load`, screenshots will be black.

## Testing WebGL maps with Playwright

Playwright cannot query DOM that doesn't exist — and Mapbox renders to a single `<canvas>`. To make a Mapbox component testable:

1. Expose a hidden `<div data-hf-map-state>` with sync'd attributes (`data-status`, `data-marker-count`, `data-marker-types`, `data-has-route`). This is the testable seam.
2. Spec asserts on attributes, not on visible markers. Use `await expect(stateSurface).toHaveAttribute("data-status", "ready")`.
3. For visual verification, take a full-page screenshot and review in the confidence rubric. There's no automated way to assert "the red dot appeared at this lat/lng."
4. For cleanup verification, navigate `→ /` and back twice; assert no console / page errors across the cycle.

## Token handling

- `mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN` — must be set BEFORE `new mapboxgl.Map(...)` is called.
- The component is `"use client"`. Mapbox GL JS does NOT support SSR.
- If the token is empty, render a clear error block instead of attempting to mount. Flip status to `"no-token"`.
- For server-side calls (Geocoding / Directions / Matrix), use `MAPBOX_SECRET_TOKEN` from `.env.local` server-only — never the public one. See `data-layer.md` for the geocoder pattern.

## CSS import is required

```ts
import "mapbox-gl/dist/mapbox-gl.css";
```

Without this, controls render unstyled (broken zoom-in/out buttons, popup arrow misaligned) and certain features silently fail. Always import at the top of the component file.

## Mapbox error handling

`map.on("error", (e) => { ... })` catches GL errors that would otherwise be swallowed by Mapbox's own handler. Re-emit to `console.error` so Playwright catches them via `page.on("console")`. The MapView component does this.

## Don't add `@types/mapbox-gl`

Mapbox GL JS v3 ships its own TypeScript types. The legacy `@types/mapbox-gl` package conflicts with the built-in types — don't install it. (This was already validated during the v3 install path.)
