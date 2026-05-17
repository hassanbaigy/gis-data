# HF-004 — MapView component (dark Mapbox map + 4 marker types)

## Story
As a developer building any map-based screen, I want a reusable `MapView` component that renders a dark Mapbox base map and the four marker types, so that every screen (home, results, history) draws maps the same way and we stop re-implementing markers.

## Acceptance criteria (from `.claude/agent-context/user-stories.md` lines 138-149)

- `src/components/MapView.tsx` renders a Mapbox GL map using style `mapbox://styles/mapbox/dark-v11`, reading the token from `NEXT_PUBLIC_MAPBOX_TOKEN`.
- The component accepts these props:
  ```ts
  type MapMarker = {
    id: string;
    type: "incident" | "hydrant" | "chosen" | "oos";
    lng: number;
    lat: number;
    label?: string;
  };
  type MapViewProps = {
    center: [lng: number, lat: number];
    zoom: number;
    markers: MapMarker[];
    routeGeometry?: GeoJSON.LineString;
    className?: string;
  };
  ```
- **Marker rendering** — uses native **Mapbox GL layers** (circle layers per type via filter on a single GeoJSON source). NOT HTML markers — they don't scale gracefully when the user zooms out and we'd be re-implementing what GL gives us for free. V1 visual fidelity is intentionally loose; HF-008 (results screen) is where we polish.
- **Marker convention v1** (functional, not pixel-matched to `prompt.html` §03; styling pass deferred):
  - `incident` — red circle, radius 12px
  - `hydrant` — blue circle (`#3b82f6`), radius 8px. If a sibling `chosen` marker is present in the same `markers` array, in-service hydrants get a yellow stroke ring (1.5px) per the brief's "#2/#3 ringed yellow" rule.
  - `chosen` — yellow circle, radius 14px, with a wider semi-transparent yellow halo (stroke 4px @ 40% opacity)
  - `oos` — grey circle (`#6b7280`), radius 8px, 60% opacity
- **Route polyline** (when `routeGeometry` is provided): a single line layer at 5px width, solid yellow. Functional only — the fancy "base 10px at 35% + dashed top 5px" double-stack is deferred to HF-008.
- Demo / fixture route at `src/app/dev/mapview/page.tsx` renders one of each marker type plus a sample route geometry. The route renders only when `NODE_ENV === "development"` (404 in production builds — this is a dev-only fixture, not part of the user-facing app).
- A Playwright spec opens the dev fixture, screenshots the map, and asserts on:
  - **Component state surface** — the component exposes a hidden `<div data-hf-map-state>` with `data-marker-count`, `data-marker-types` (comma-separated sorted list of types present), `data-has-route` (`"true"` / `"false"`), `data-status` (`"loading" | "ready" | "error" | "no-token"`). The spec reads these attributes — native GL layers render on a WebGL canvas which the DOM can't query directly, so this attribute surface is the testable seam.
  - All four marker types appear in `data-marker-types`
  - Route source is registered when `routeGeometry` provided (`data-has-route === "true"`)
  - No console errors during mount or marker updates
  - Mounting + unmounting twice produces no errors (cleanup spec navigates between the dev page and `/` twice)

## Visual reference
- `prompt.html` §03 — palette, pin convention, type rules
- `index.html` map screens (Screen 2 and Screen 4) for general feel
- The marker convention is the source of truth; eyeball the screenshot against §03 in the confidence rubric

## Out of scope
- Wiring real data — no calls to `/api/health/db`, no Prisma reads. The fixture page hardcodes its `markers` array.
- Click handlers on markers (HF-008 adds those)
- Animated transitions (cluster expansion, fly-to). Future story.
- Mobile gesture tuning. The component just needs to mount, render markers, and clean up.
- Anything in `prisma/`, `src/lib/db.ts`, or `src/app/api/health/db/`.

## Files this story owns
- `src/components/MapView.tsx` — the component
- `src/app/dev/mapview/page.tsx` — dev-only fixture
- `tests/e2e/hf-004-mapview.spec.ts` — failing-first spec
- `STORY.md`, `.claude-resume.md` (at worktree root)

## Dependencies added
- `mapbox-gl` v3.x (the official Mapbox GL JS library). Mapbox v3 ships its own TS types, no `@types/mapbox-gl` needed.

## Task list
1. Add `mapbox-gl` to dependencies; verify it loads as a client component (Mapbox GL JS does not support SSR, so the component MUST be `"use client"`).
2. Write the failing Playwright spec at `tests/e2e/hf-004-mapview.spec.ts`. Asserts on marker presence, route source, console, and cleanup. Commit (TDD step 3).
3. Build the dev fixture page at `src/app/dev/mapview/page.tsx` rendering one of each marker type around the Gorham, ME centroid (`43.6791, -70.4444`) plus a sample `LineString` between an incident pin and a chosen hydrant.
4. Implement `MapView.tsx`:
   - `"use client"` at the top
   - Mount the Mapbox instance in `useEffect` with cleanup
   - Read token from `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`; surface a clear error in the DOM if missing
   - Custom HTML markers via `new mapboxgl.Marker({ element })` — each marker type is its own JSX element with a `data-marker-type` attribute so the spec can count them
   - On `routeGeometry` change: add/replace a GeoJSON source named `hf-route` plus two stacked `line` layers
   - Listen for `map.on("error")` and re-emit to `console.error` so the spec catches Mapbox runtime errors too
5. Style the four marker types per §03 — small inline `<div>`s with Tailwind utilities, no external CSS unless absolutely needed.
6. Run the spec, take screenshots, score with the rubric.
7. Iterate until ≥ 0.85.
8. Spawn `reviewer`. No `security-auditor` — no auth/secret-touching surface (the public token is exposed-by-design).
9. PR to `develop`.

## Confidence gate
≥ 0.85. Visual dimension weighted heavily — this is the marquee component every later screen consumes.

## Port
Dev server on `:3000` (Dev A's machine, no parallel HF-001 server here yet).
