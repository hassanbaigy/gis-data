# HF-008 — Polish /map/incident/[id] results screen

## Story

As a firefighter who just submitted an incident, I want to see the three nearest hydrants ranked by driving time with a drawn route to #1, so that I can dispatch a hose line in seconds.

## Acceptance criteria

- `/map/incident/[id]` is gated by `requireBadge()`. 404 if the id doesn't exist.
- On mount, the page calls the existing incident's stored `hydrants` payload (set at create time by HF-006). Map centres on the incident location.
- Renders on the map: 1 incident pin (red teardrop with `!`), top-3 hydrants (yellow halo + yellow fill on #1, blue with yellow ring on #2 and #3), the yellow dashed route polyline from #1 to the incident (base layer 10px @ 35% opacity, dashed top 5px solid yellow), all `flaggedOos` hydrants as grey X markers.
- Top bar: pulsing red `ACTIVE · MM:SS` pill (timer counts up from `incident.createdAt`), SOS button top-right.
- Bottom sheet with drag handle. Header: `"NEAREST HYDRANTS · 3 of N"` where N is total hydrants the API considered. Three `HydrantCard`s rendered:
  - Big rank digit (1, 2, 3) in display
  - Hydrant id in mono
  - Address
  - Distance in display
  - ETA in yellow mono
  - #1 has 1.5px yellow border and a warmer background
  - Any card whose hydrant is flagged OOS shows a red `OUT` chip (defensive — by API contract OOS never enter the top-3, but the chip logic must exist for the `flaggedOos` list)
- Footer: red `NAVIGATE` CTA — opens `maps:?daddr=<lat>,<lng>` for the #1 hydrant — plus a list-icon button on the right that opens a modal showing the full hydrant list including OOS entries.
- Playwright spec drives the full flow: starts from `/map/new`, submits an incident, lands on this page, asserts the route polyline is present, the three cards render in order, the timer is counting, and the NAVIGATE link points to `maps:?daddr=...` with the #1 hydrant's coordinates.
- Confidence rubric pays special attention to **Visual** (this is the marquee screen) — side-by-side against `index.html` Screen 4.

## Out of scope

- In-app navigation (we hand off to the OS maps app).
- Editing or deleting the incident from this screen.
- Tablet layout (HF-010).
- `/history` page (HF-009).
- Expanded hydrant modal interior detail beyond a simple list view. The modal opens and shows the full hydrant list (top-3 + OOS rows: mono id + address + distance + ETA). No filters, no sort controls.
- Touch-drag-to-collapse on the bottom sheet. The drag handle is a visual affordance only in v1; actual drag-to-collapse is deferred to a future story. The sheet is always fully open.

## Visual reference

- `index.html` Screen 4 — marquee results screen
- `prompt.html` §07 spec card 4 (RESULTS · ROUTE at `/map/incident/[id]`)

### Key spec details

**Map:** Centred on incident. Renders: incident pin (red teardrop, "!" glyph), top-3 hydrants (yellow halo on #1), route polyline from #1 to incident — base layer 10px @ 35% opacity, dashed top 5px solid yellow. OOS hydrants in radius rendered with grey X marker.

**Top bar:** Red pulsing `ACTIVE · MM:SS` pill (timer counts up from `incident.createdAt`). SOS top-right.

**Bottom sheet:** Drag handle at the top. Header: `"NEAREST HYDRANTS · 3 of N"`. Three `HydrantCard`s. Card #1 has 1.5px yellow border + warmer bg. OOS cards: red `OUT` chip.

**Actions:** Red `NAVIGATE` CTA (`maps:?daddr=lat,lng` for #1). Secondary list-icon button opens modal.

**Marker conventions (spec card 3):**
- Incident: red teardrop with `!` glyph
- Chosen (#1): yellow halo + yellow fill
- Hydrants (#2, #3): blue dot with yellow ring
- OOS: grey X

## Files in scope

| File | Action | Notes |
|---|---|---|
| `src/app/map/incident/[id]/incident-view.tsx` | REPLACE | Placeholder side-panel → polished bottom-sheet results screen. Reuse existing `ApiResponse` type and marker-building logic. |
| `src/app/map/incident/[id]/page.tsx` | NO CHANGE expected | Bare pass-through; `IncidentView` loads its own data client-side. Verify on read — no edits planned. |
| `src/components/HydrantCard.tsx` | NEW | Rank digit (display), id (mono), address, distance (display), ETA (yellow mono). `data-rank` attribute for Playwright targeting. #1 variant: yellow border + warmer bg. OOS variant: red `OUT` chip. |
| `src/components/BottomSheet.tsx` | NEW | Drag handle (visual only). Fixed bottom, z-10 over map. HF-009 may reuse. |
| `src/components/ActiveTimerPill.tsx` | NEW | Pulsing red pill. `setInterval(1000)` computing `Date.now() - new Date(createdAt).getTime()`. Cleanup on unmount. |
| `src/components/HydrantsModal.tsx` | NEW | `role="dialog"` + `aria-modal="true"`. Full hydrant list rows (top-3 + flagged OOS): mono id + address + distance + ETA. Close button. |
| `src/components/MapView.tsx` | MODIFY | **Intentional shared-file edit — see § Marker polish.** Authorised by handoff brief L276. |
| `tests/e2e/hf-008-results.spec.ts` | NEW | Failing-first spec. |
| `STORY.md` | NEW | This file. |
| `.claude-resume.md` | NEW | Session resume — gitignored. |

## Files NOT in scope (DO NOT TOUCH)

- `prisma/**`
- `src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/geo.ts`, `src/lib/hydrants.ts`, `src/lib/mapbox.ts`
- `src/app/api/auth/**`, `src/app/api/health/**`, `src/app/api/geocode/**`, `src/app/api/hydrants/**`
- `src/app/api/incidents/route.ts` (POST + GET handlers)
- `src/app/api/incidents/[id]/route.ts` (read-only — the GET endpoint this page consumes)
- `src/app/login/**`, `src/app/page.tsx`
- `src/app/dev/**`
- `src/app/map/layout.tsx` (auth gate)
- `src/app/map/page.tsx` + `src/app/map/map-home.tsx` (HF-005)
- `src/app/map/new/**`
- Existing HF-005 components: `BadgePlate`, `SosButton`, `FilterChips`, `HintCard` — do not refactor

## Marker polish — MapView.tsx changes

**One shared file** Dev B is explicitly authorised to edit for HF-008 (handoff prompt L276). The change is isolated to paint properties + one new layer. `MapViewProps`, `data-hf-map-state` test seam, and layer IDs are unchanged.

### What changes

**Route polyline — second base layer added:**
- `LAYER_ROUTE_BASE` (new): `line`, `line-width: 10`, `line-color: "#FCD34D"`, `line-opacity: 0.35`
- `LAYER_ROUTE` (existing): `line`, `line-width: 5`, `line-color: "#FCD34D"`, `line-dasharray: [2, 2]`, `line-opacity: 0.9`
- Both consume `ROUTE_SOURCE`. Both hidden together via `setLayoutProperty` when `routeGeometry` absent.

**Incident marker — red teardrop + `!` glyph:**
Prefer: symbol layer with in-memory canvas-drawn icon (no fetch/CORS). Fallback: keep circle + sibling symbol layer with `text-field: "!"`. Pick fallback if image registration proves fragile in Mapbox GL v3 / Next 16.

Circle paint: `circle-radius: 12`, `circle-color: "#E11D29"`, `circle-stroke-width: 2`, `circle-stroke-color: "#ffffff"`.

**Chosen (#1) — yellow halo + yellow fill:**
`LAYER_CHOSEN`: `circle-radius: 10`, `circle-color: "#FCD34D"`, `circle-stroke-width: 5`, `circle-stroke-color: "#FCD34D"`, `circle-stroke-opacity: 0.35`.

**Hydrant ring (#2, #3) — blue dot + yellow ring:**
`LAYER_HYDRANT_RING`: `circle-radius: 11`, `circle-color: "transparent"`, `circle-stroke-width: 2`, `circle-stroke-color: "#FCD34D"`. (`ringHydrants` toggle logic unchanged.)
`LAYER_HYDRANT`: `circle-radius: 6`, `circle-color: "#3b82f6"`, `circle-stroke-width: 1`, `circle-stroke-color: "#0a0a0a"`.

**OOS — grey X:**
Replace circle with symbol layer: `text-field: "✕"`, `text-color: "#6b7280"`, `text-size: 14`, filter `type === "oos"`. Default glyph set — no `addImage` needed.

### What does NOT change

- `MARKER_SOURCE`, `ROUTE_SOURCE` IDs
- All 5 layer ID constants (`LAYER_INCIDENT`, `LAYER_HYDRANT`, `LAYER_HYDRANT_RING`, `LAYER_CHOSEN`, `LAYER_OOS`)
- `MapViewProps` interface
- `data-hf-map-state` div + its 4 attributes
- `ringHydrants` logic
- `markersToFeatureCollection`
- `mapboxgl.accessToken` assignment

### PR body note (required)

> **Note for reviewers:** `src/components/MapView.tsx` is shared with HF-005's `/map` home. Edits here are limited to paint property values and one new route underlay layer. `MapViewProps`, the `data-hf-map-state` test seam, and all layer IDs are unchanged. HF-005's `/map` only passes `type: "incident"` markers, so the chosen/hydrant/oos paint changes have no effect on the home screen. Shared-file edit explicitly authorised in handoff brief L276.

## AC → Playwright test map

Tests in `tests/e2e/hf-008-results.spec.ts`. Screenshots → `tests/screenshots/hf-008-results/`.

### Test data strategy (Option A — recommended)

In `test.beforeAll`, call `POST /api/incidents` via `authedRequestContext` with a deterministic Gorham coordinate (`lat: 43.6791, lng: -70.4444`) to create a fresh incident, capture `body.id` + chosen hydrant `lat`/`lng`. Real Mapbox calls happen with Lead's tokens. Mirrors HF-006 spec pattern. Option B (picking a seeded incident with `chosenHydrantId`) skipped — non-deterministic.

### Browser tests — `describe("HF-008 /map/incident/[id]")`

`beforeEach`: `await loginInContext(context)` (except test 13 which uses fresh context).

| # | Test name | AC covered | Screenshot |
|---|---|---|---|
| 01 | `renders incident page with map active timer bottom sheet and footer` | Full layout | `01-full-layout.png` |
| 02 | `map reaches ready state with correct marker count` | Map markers | `02-map-ready.png` |
| 03 | `data-hf-map-state reports has-route true` | Route polyline | `03-route.png` |
| 04 | `active timer pill matches ACTIVE · MM:SS format` | Pill format | `04-active-pill.png` |
| 05 | `active timer pill text changes after 1 second` | Pill ticking | `05-timer-ticking.png` |
| 06 | `bottom sheet header reads NEAREST HYDRANTS · 3 of N` | Sheet header | `06-sheet-header.png` |
| 07 | `three hydrant cards render in rank order with id address distance ETA` | Three cards | `07-hydrant-cards.png` |
| 08 | `card with data-rank 1 has visible yellow border` | #1 styling | `08-rank1-card.png` |
| 09 | `flagged OOS card shows red OUT chip` | OOS chip | `09-oos-chip.png` |
| 10 | `NAVIGATE link href starts with maps: and contains chosen hydrant coordinates` | Navigate CTA | `10-navigate-cta.png` |
| 11 | `tapping list icon opens dialog with full hydrant list` | Modal open | `11-modal-open.png` |
| 12 | `modal closes when close button is tapped` | Modal close | `12-modal-closed.png` |
| 13 | `unauthenticated GET /map/incident/:id redirects to /login` | Auth gate (fresh `browser.newContext()`) | `13-unauthed-redirect.png` |

### Key assertion patterns

- **Pill format (04)**: `expect(text).toMatch(/ACTIVE\s*·\s*\d{2}:\d{2}/)`
- **Pill ticks (05)**: Capture text at T=0, `waitForTimeout(1100)`, capture at T=1, assert they differ
- **Sheet header (06)**: `getByText(/NEAREST HYDRANTS\s*·\s*3 of \d+/)`
- **Cards (07)**: locate by `[data-rank='1']`, `[data-rank='2']`, `[data-rank='3']`; assert each contains a mono id + address + distance + ETA
- **#1 border (08)**: assert `data-rank="1"` element is visible. Visual confirmation via screenshot/rubric.
- **OOS chip (09)**: `page.getByText(/OUT/).first()` visible inside `[data-oos='true']`
- **Navigate href (10)**: `expect(href).toMatch(/^maps:\?daddr=/)`, `expect(href).toContain(String(chosenHydrantLat))`, `expect(href).toContain(String(chosenHydrantLng))`
- **Modal (11)**: `getByRole('button', { name: /list|hydrants/i }).click()` → `getByRole('dialog')` visible → dialog contains #1 hydrant id

### Console error guard (HF-005 pattern, no `/history` filter needed here)
```ts
test.afterEach(async () => {
  expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
});
```

## Task list

### Step A — Failing-first spec (loop step 3)
- Touches: `tests/e2e/hf-008-results.spec.ts`
- Agent: test-writer
- Commit: `test(e2e): failing spec for hf-008 results screen`
- Verify: all N new tests fail (placeholder UI doesn't match bottom-sheet structure)

### Step B — Four new components (loop step 4, part 1)
- Touches: `src/components/{BottomSheet,ActiveTimerPill,HydrantCard,HydrantsModal}.tsx`
- Agent: Lead (frontend)
- Commit: `feat(hf-008): add BottomSheet ActiveTimerPill HydrantCard HydrantsModal components`

### Step C — MapView marker polish (loop step 4, part 2)
- Touches: `src/components/MapView.tsx`
- Agent: Lead
- Commit: `feat(hf-008): polish MapView marker styles and add route double-stack layer`
- Isolated from Step B so reviewers can inspect the shared-file edit independently

### Step D — Rewire incident-view.tsx (loop step 4, part 3)
- Touches: `src/app/map/incident/[id]/incident-view.tsx`
- Agent: Lead
- Commit: `feat(hf-008): replace placeholder side-panel with polished bottom-sheet results screen`
- Verify: HF-006 spec still passes (the word `/incident/i` still appears in visible text — ACTIVE pill, incident type chip, etc.)

### Step E — Click-through + REVIEW.md (loop steps 5-7)
- Touches: `tests/screenshots/hf-008-results/*.png`, `tests/screenshots/hf-008-results/REVIEW.md`
- Agent: Lead
- Commit: `chore(hf-008): click-through screenshots + REVIEW.md (confidence X.XX)`
- Cap at 5 iterations

### Step F — Review + PR (loop steps 8-9)
- Agent: `reviewer` (mandatory); `security-auditor` SKIPPED (no new API surface, no auth changes)
- PR: `gh pr create --base develop --title "feat(hf-008): polish /map/incident/[id] results screen"`
- Body includes story+AC, REVIEW.md rubric, 3-5 embedded screenshots, test plan, reviewer output, MapView shared-file note

## Confidence rubric

| Dimension | Weight | What 1.0 looks like |
|---|---|---|
| **Functional** | 0.30 | All N HF-008 tests pass; existing 37 still green; HF-006 doesn't regress; no `.skip`, no `.only` |
| **Visual** | 0.25 | **MARQUEE SCREEN — highest-stakes.** Side-by-side vs `index.html` Screen 4: bottom sheet, cards, pill, markers, route polyline |
| **Interaction** | 0.15 | Tab order, focus rings, NAVIGATE link tappable, modal open/close, timer counts |
| **Robustness** | 0.15 | Loading state, degraded (no route geometry), 404 for bad id, OOS list empty, edge timer drift |
| **A11y** | 0.10 | `role="dialog"` + `aria-modal="true"` on modal, close button labelled, SOS labelled, cards have semantic structure |
| **Console** | 0.05 | Zero browser console errors |

**Gate: 0.85. Max 5 iterations.** Visual dimension carries extra moral weight — this is the marquee polish pass. If Visual < 0.7, fix it before considering any other dimension.

## Definition of done

- [ ] `tests/e2e/hf-008-results.spec.ts` passes (all N new tests)
- [ ] Full existing suite green: 37 baseline + N new HF-008 tests
- [ ] HF-006 spec does NOT regress
- [ ] `tests/screenshots/hf-008-results/REVIEW.md` filled with weighted score ≥ 0.85
- [ ] `reviewer` signed off
- [ ] PR opened against `develop` (NOT `main`) with embedded screenshots + MapView shared-file note in body
- [ ] `STORY.md` + `.claude-resume.md` present at worktree root

## Decisions (signed off by user 2026-05-18)

**D1 — Drag handle is a visual affordance only** (Q1=OK)
The bottom sheet renders a drag-handle pill at the top to match the spec mock visually, but tapping/dragging it has no effect in v1 — the sheet is always fully open. No touch handlers, no collapsed state, no peek mode. Real drag-to-collapse interaction is deferred to a future story (likely after HF-010 when tablet behaviour is settled).

**D2 — Incident teardrop uses canvas-drawn symbol layer first** (Q2=A)
The incident marker is rendered as a Mapbox symbol layer with an in-memory `HTMLCanvasElement`-drawn icon (a red teardrop with a white `!` glyph) registered via `map.addImage('hf-incident', canvas)`. The icon is generated once during the `style.load` handler. Fallback path (kept implementable but not committed first): if `addImage` proves fragile on the Mapbox GL v3 / Next 16 stack (image fails to register, late hydration race, etc.), swap `LAYER_INCIDENT` back to a circle paint layer and add a sibling symbol layer with `text-field: "!"`. Either path keeps the `data-hf-map-state` test seam unchanged.

**D3 — NAVIGATE link uses `maps:?daddr=<lat>,<lng>` literally** (Q3=OK)
Per the brief. This is the iOS Maps URL scheme — taps on iPhone open Maps.app to driving directions; on Android/desktop the link is a no-op (or browser-prompt). Acceptable for the prototype (FDNY-inspired field tool aimed at iPhones). If Android tablet support is required later (potentially HF-010 fallout), swap the helper to a UA-detected `geo:` / `https://maps.google.com/?daddr=` variant.

**D4 — List-icon modal shows the same data, longer list format** (Q4=OK)
Tapping the list-icon footer button opens a `role="dialog"` modal with `aria-modal="true"`. The modal lists the top-3 nearest hydrants AND the `flaggedOos` entries — one row per hydrant: mono id + address + distance (display) + ETA (yellow mono). No filters, no sort controls, no per-row actions. Close button (visible top-right) restores focus to the list-icon trigger.
