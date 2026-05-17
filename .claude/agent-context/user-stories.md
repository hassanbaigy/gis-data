# Hydrant Finder — User Story Map

Source of truth for what each story includes, what it depends on, and what's pickable in parallel. **Two developers**: pick one each from the same "pickable" column.

Visual reference for every story is `.claude/agent-context/prompt.html` (the brief) and `.claude/agent-context/index.html` (the mock screens). Story-specific section refs are listed inside each story.

Every story follows `.claude/skills/tdd-user-story/SKILL.md` — failing Playwright spec first, confidence ≥ 0.85, PR to `develop`, worktree at `../gis-data-<story-id>`.

---

## Dependency map at a glance

```
HF-000  Bootstrap + design system          (BLOCKING — one dev, day 1)
  │
  ├──> HF-001  Mock auth + /login
  │      │
  │      └──> HF-005  /map home  ────────┐
  │      │                                │
  │      └──> HF-006  /map/new + geocode  │
  │                                       │
  ├──> HF-002  Hydrant dataset + loader   │
  │      │                                │
  │      └──> HF-007  /api/hydrants/nearest
  │                                       │
  ├──> HF-003  Prisma schema + seed ──────┤
  │                                       │
  └──> HF-004  MapView component  ────────┤
                                          │
                          HF-008  /map/incident/[id]  (needs HF-004 + HF-007)
                                          │
                          HF-009  /history  (needs HF-005)
                                          │
                          HF-010  Tablet breakpoint pass  (needs HF-005, HF-008, HF-009)
```

## What's pickable when

| Phase | Pickable in parallel by two devs |
|---|---|
| **Day 1** | One dev does HF-000. The other is blocked until HF-000 ships. |
| **After HF-000 merges** | **Dev A**: HF-001 (login) · **Dev B**: any of HF-002 / HF-003 / HF-004 |
| **After HF-001 + HF-003 + HF-004 merged** | **Dev A**: HF-005 (home map) · **Dev B**: HF-006 (new-incident form) |
| **After HF-002 merged** | A backend-leaning dev can take HF-007 anytime in parallel with the screen work |
| **After HF-004 + HF-007 merged** | HF-008 (results + route) — single dev, this is the marquee story |
| **After HF-005 merged** | HF-009 (history) — picks up cleanly while someone else builds HF-008 |
| **Last** | HF-010 (tablet pass) — single dev, polishes across screens |

---

## HF-000 — Project bootstrap & design system

**Story** — As a developer on this project, I want a scaffolded Next.js app with the design tokens registered and the delivery-workflow tooling in place, so that every later story starts on the same foundation and can be tested + reviewed uniformly.

**Acceptance criteria**
- `pnpm dev` boots the app on `:3000`, the index page renders the "HYDRANT FINDER" wordmark on a `#0a0a0a` background, displayed in Barlow Condensed 800.
- `src/app/globals.css` `@theme inline` block registers the four named colours (`--color-black`/`-red`/`-yellow`/`-paper`) and three font-family tokens (`--font-display`/`-ui`/`-mono`). Tailwind v4 utilities `bg-black`, `bg-red`, `bg-yellow`, `bg-paper`, `font-display`, `font-ui`, `font-mono` all resolve correctly. **No `tailwind.config.ts` file** — that's v3 syntax; this repo is v4.
- `next/font/google` loads Barlow Condensed (700, 800), Inter (400-800), JetBrains Mono (400, 500, 700) and exposes them as CSS vars on `<html>`.
- `develop` branch exists locally and on `origin`. Future stories branch off `develop`; only HF-000 commits directly on `develop`.
- Repo is on `pnpm` (not npm). `pnpm-lock.yaml` committed; `package-lock.json` removed. `engines` block in `package.json` pins Node `>=20.9.0` and pnpm `>=10`. `.nvmrc` pins a specific Node LTS patch.
- `@playwright/test` installed, `playwright.config.ts` at repo root, `tests/e2e/` and `tests/screenshots/baseline/` exist. Per-run screenshot folders (`tests/screenshots/<story-id>/`) and `tests/playwright-report/` are gitignored; only `baseline/` is kept.
- `package.json` has `e2e`, `e2e:headed`, `e2e:ui` scripts.
- `.claude/state/active-stories.json` initialised to `{"stories": []}`; `.gitignore` includes `.claude/state/` and `.claude-resume.md`.
- `.env.example` committed with `NEXT_PUBLIC_MAPBOX_TOKEN` and `MAPBOX_SECRET_TOKEN` keys (no values). `.env.local` is gitignored (real tokens never reach the repo).
- A smoke Playwright spec at `tests/e2e/hf-000-smoke.spec.ts` opens `/` and asserts the wordmark is visible in the correct font + colour, design tokens are reachable, and Tailwind utilities resolve to the palette. Spec passes locally.

**Out of scope** — Mapbox setup, Prisma, any other screen. This story is plumbing only.

**Visual reference** — `prompt.html` §02 (Stack), §03 (Visual System — palette + type rules).

**Pickable** — Day 1. Blocking. One dev. **Estimated**: half day.

---

## HF-001 — Mock auth + /login screen

**Story** — As a firefighter, I want to log in with my 4-digit badge and 4-digit PIN, so that the rest of the app knows my unit and badge for incident records.

**Acceptance criteria**
- Visiting `/login` renders: brand block (56px red square with flame glyph + "HYDRANT FINDER" in display), subtitle `"FDNY · v0.1 PROTO"` in mono fog colour, a 4-digit badge input (mono 22px) and a 4-cell PIN pad (yellow border on active cell), and a red `SIGN IN →` CTA with the spec'd shadow.
- Submitting any 4-digit badge + 4-digit PIN sets an http-only cookie `hf_badge=<badge>` and redirects to `/map`.
- Submitting fewer than 4 digits in either field disables the CTA (visibly: opacity 0.5, `aria-disabled="true"`).
- Visiting `/` with no cookie redirects to `/login`. Visiting `/` with the cookie redirects to `/map`.
- `lib/auth.ts` exports `requireBadge()` that reads the cookie in server components / route handlers and redirects to `/login` if missing.
- Playwright spec covers: empty state, partial entry (CTA disabled), valid 4+4 entry (redirect + cookie present), `/` redirect both directions.

**Out of scope** — Any real authentication, password hashing, brute-force protection, account creation. This is a mock.

**Visual reference** — `index.html` Screen 1, `prompt.html` §07 spec card 1.

**Pickable** — After HF-000. Parallel-safe with HF-002 / HF-003 / HF-004.

---

## HF-002 — Hydrant dataset + loader

**Story** — As a developer building hydrant features, I want a bundled GeoJSON dataset and a typed loader, so that any feature that consumes hydrants reads from a single canonical source.

**Acceptance criteria**
- `public/data/hydrants.geojson` exists as a valid `FeatureCollection` of `Point` features.
- The file has **40 features** clustered around `(40.7128, -74.0060)` (within roughly a 3km radius), with ~10% `in_service=false` and a mix of `category: "pressurized" | "dry"`.
- Every feature has the full property set: `id` (e.g. `"H-1156"`), `address`, `city`, `state`, `zip`, `in_service`, `category`.
- `lib/hydrants.ts` exports `loadHydrants(): Promise<HydrantFeature[]>` (reads the file once and caches), plus a `Hydrant` TypeScript type.
- A Playwright spec OR a Node unit test (whichever idiomatic for this repo — unit test is fine since there's no UI yet) loads the file and asserts: feature count is 40, ~10% have `in_service=false`, every feature validates against the type.

**Out of scope** — Any external hydrant API. Any UI. The nearest-hydrant algorithm (that's HF-007).

**Visual reference** — `prompt.html` §05 (data schema).

**Pickable** — After HF-000. Parallel-safe with HF-001 / HF-003 / HF-004.

---

## HF-003 — Prisma schema + incidents seed

**Story** — As a developer building incident features, I want a Prisma-backed SQLite database with a seeded set of incidents, so that the home screen has data to show and creating new incidents persists correctly.

**Acceptance criteria**
- `prisma/schema.prisma` has the `Incident` model exactly as defined in `prompt.html` §05 (id cuid, createdAt, address, lat, lng, type, alarmLevel, notes?, unitId, badge, chosenHydrantId?).
- `npx prisma db push` succeeds against `file:./dev.db`.
- `prisma/seed.ts` inserts **exactly 6** example incidents around the hydrant dataset's coordinates, with varied `type`, `alarmLevel` (1-5 represented), distinct `createdAt` spread over the last 7 days, all with `badge: "0418"` and `unitId: "E-12"`.
- `package.json` has a `prisma` block with `seed` pointing at `prisma/seed.ts`. `npx prisma db seed` succeeds and produces exactly 6 rows.
- `lib/db.ts` exports a singleton `PrismaClient` (re-used across hot-reloads in dev).
- Unit test or e2e spec asserts post-seed row count is 6 and all required fields populated.

**Out of scope** — Any API routes. Any UI. Real auth. Supabase wiring (leave `lib/supabase.ts` stubbed per §02).

**Visual reference** — `prompt.html` §05 (Prisma schema).

**Pickable** — After HF-000. Parallel-safe with HF-001 / HF-002 / HF-004.

---

## HF-004 — MapView component with dark style

**Story** — As a developer building any map-based screen, I want a reusable `MapView` component that renders a dark Mapbox base map and the four marker types, so that every screen (home, results, history) draws maps the same way.

**Acceptance criteria**
- `components/MapView.tsx` renders a Mapbox GL map using style `mapbox://styles/mapbox/dark-v11`, reading the token from `NEXT_PUBLIC_MAPBOX_TOKEN`.
- The component accepts props: `center: [lng, lat]`, `zoom: number`, `markers: Array<{ type: "incident" | "hydrant" | "chosen" | "oos", lng, lat, label? }>`, `routeGeometry?: GeoJSON.LineString`.
- Each marker type renders per the convention:
  - `incident` — red teardrop with `!` glyph
  - `hydrant` — blue dot `#3b82f6`, optional yellow ring if a sibling chosen marker exists
  - `chosen` — yellow halo + yellow fill (the #1 ranked hydrant)
  - `oos` — grey dot with X through it
- If `routeGeometry` is provided, render as two stacked line layers: base 10px at 35% opacity, top 5px dashed solid yellow.
- A demo route at `/dev/mapview` (gitignored in story-cleanup OR a Playwright fixture page) renders one of each marker type and a sample route. Playwright spec opens this fixture page and screenshots the map; reviewer eyeballs against the marker convention from `prompt.html` §03.
- No console errors on mount or marker updates.
- The component cleans up the Mapbox instance on unmount (no leaks across navigations — verify by mounting/unmounting twice in the spec and asserting no errors).

**Out of scope** — Routing logic, hydrant data fetching, incident persistence. The component is presentational only; it accepts props and renders.

**Visual reference** — `prompt.html` §03 (hydrant pin convention) and `index.html` (the map appearances on screens 2 and 4).

**Pickable** — After HF-000. Parallel-safe with HF-001 / HF-002 / HF-003.

---

## HF-005 — /map home screen

**Story** — As a firefighter on shift, I want to land on a dark map showing the last 7 days of incidents with one tap-away access to creating a new incident, so that I have situational awareness and can dispatch fast.

**Acceptance criteria**
- `/map` is gated by `requireBadge()` — unauthenticated users land on `/login`.
- Full-bleed dark `MapView` covers the screen, centred on the average lat/lng of seeded incidents at zoom 12.
- Past incidents (from `GET /api/incidents?since=7d`) render as red dots with a 14px translucent halo. Hydrants are NOT rendered on this screen.
- Top bar: 48px badge plate on the left (mono `"BADGE 0418"`), SOS button top-right (48×48, yellow border, yellow glyph). Both at safe inset of 16px from top.
- Filter chip rail below the top bar: `"ALL · 6"`, `"7 DAYS"`, `"UNIT E-12"`. Yellow active, smoke inactive. Tapping a chip toggles the filter and re-fetches.
- Bottom hint card (dark, no glass blur): `"LAST INCIDENT · 6 HRS AGO"` (mono), the most-recent incident's address (display), and `"3 hydrants"`-style chip count.
- Persistent footer (sticky bottom, full-width): red `+ NEW INCIDENT` CTA (24px display) on the left, 64px-wide list-icon button on the right that routes to `/history`.
- Tapping `+ NEW INCIDENT` routes to `/map/new`.
- `GET /api/incidents?since=7d&type=&unitId=` is implemented and returns `{ incidents: [...] }` ordered `createdAt DESC`.
- Playwright spec: loads seeded state, sees 6 red dots on map (count via Mapbox marker DOM or via screenshot diff), filter chips render correct counts, footer CTA navigates to `/map/new`, list icon navigates to `/history`.

**Out of scope** — The new-incident form itself (HF-006), the history page (HF-009), tablet layout (HF-010).

**Visual reference** — `index.html` Screen 2, `prompt.html` §07 spec card 2.

**Pickable** — After HF-001, HF-003, HF-004 all merged.

---

## HF-006 — /map/new incident form + geocode proxy

**Story** — As a firefighter at an incident, I want to type the address, pick the geocoded match, select the incident type and alarm level, and submit, so that the app can find me the nearest hydrants.

**Acceptance criteria**
- `/map/new` is gated by `requireBadge()`.
- Header: 40×40 back button (smoke border) on the left, `"NEW INCIDENT"` in display centre-left, `"STEP 1/2"` in mono fog on the right.
- Address search input with yellow border + magnifier icon. As the user types, debounce **250ms**, then call `GET /api/geocode?q=`.
- `GET /api/geocode?q=` is implemented as a server-side proxy to Mapbox Geocoding v6, caps results at **5**, returns `{ results: [{ placeName, lat, lng }] }`. The Mapbox token must never appear in client-side network responses.
- Up to **3** geocode results render below the input as cards: pin icon + primary (place name) + secondary (city/state line). Selected card shows yellow left-border accent + a right-arrow glyph.
- Type selector: 3-column grid of 6 buttons (STRUCTURE / VEHICLE / BRUSH / MEDICAL / HAZMAT / OTHER). Selected = red fill, unselected = transparent with smoke border. Square corners, 14px display label.
- Alarm level: 5-cell row labelled 1-5. Default selection = 2. Selected = yellow fill (black text).
- Meta row: 2 columns — `UNIT` (editable text input, prefilled from the badge cookie's unit, default `"E-12"`) + `TIME` (auto, mono, e.g. `"14:22 · AUTO"`, disabled).
- Footer red CTA `FIND HYDRANTS →`. Disabled until an address is selected. On click: `POST /api/incidents`, then push `/map/incident/[id]` using the returned id.
- `POST /api/incidents` is implemented: validates body, calls `findNearestHydrants(lat,lng)` (importing from HF-007's module — if HF-007 isn't merged yet, this story can stub the call and ship the stub-clearing as part of HF-008), stores the row including `chosenHydrantId`, returns `{ id, chosenHydrantId, hydrants }`.
- Playwright spec: types `"418 Elm"`, waits for results, selects first, picks STRUCTURE + alarm 3, submits, asserts navigation to `/map/incident/[id]` and that an incident row was created in the DB.

**Out of scope** — The results screen (HF-008). The actual nearest-hydrants algorithm (HF-007).

**Visual reference** — `index.html` Screen 3, `prompt.html` §07 spec card 3.

**Pickable** — After HF-001. (Can be picked in parallel with HF-005 by the second dev.)

---

## HF-007 — /api/hydrants/nearest

**Story** — As the incident-results screen, I need an endpoint that, given a lat/lng, returns the 3 in-service hydrants nearest by routed driving duration plus the route geometry for #1, so that I can show the firefighter a ranked list and a drawn route.

**Acceptance criteria**
- `POST /api/hydrants/nearest` accepts `{ lat: number, lng: number, k?: number }` (default `k=3`). Returns 400 on missing/invalid coordinates.
- Algorithm exactly as specified in `prompt.html` §06:
  1. Filter dataset to `in_service === true`.
  2. Sort by haversine distance to the candidate.
  3. Take the closest **10**.
  4. Call Mapbox Directions Matrix (`/directions-matrix/v1/mapbox/driving`) with the candidate as source, those 10 as destinations.
  5. Sort by `duration`. Return top `k`.
  6. Also return the next **2 out-of-service candidates** flagged as `flaggedOos` — these use haversine distance only (no Matrix call).
- Only fetch the **full route geometry** (one extra `/directions/v5` call) for the #1 result. Top 2 and 3 only carry distance + duration, no geometry.
- Response shape exactly matches `prompt.html` §06.
- Mapbox token is read server-side only — never returned in the JSON.
- If the Matrix call fails (network or API error), the endpoint returns a 502 with the error surfaced — no silent fallback.
- Unit tests cover: haversine math, top-10 pre-filter correctness, ordering by duration (not haversine), correct number of items in `flaggedOos`, error surfaced on Matrix failure. Integration test via Playwright spec hitting the API route with the dev server up.

**Out of scope** — The UI that consumes this (HF-008). The incident persistence flow (HF-006 calls this).

**Visual reference** — `prompt.html` §06 (API contract).

**Pickable** — After HF-002. Backend-only story; can run in parallel with any screen story.

---

## HF-008 — /map/incident/[id] results + route screen

**Story** — As a firefighter who just submitted an incident, I want to see the three nearest hydrants ranked by driving time with a drawn route to #1, so that I can dispatch a hose line in seconds.

**Acceptance criteria**
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

**Out of scope** — In-app navigation (we hand off to the OS maps app). Editing or deleting the incident from this screen. Tablet layout (HF-010).

**Visual reference** — `index.html` Screen 4, `prompt.html` §07 spec card 4. This is the most visually demanding story — budget extra iteration cycles.

**Pickable** — After HF-004 and HF-007 are merged. Single dev — this is the highest-stakes story; don't split.

---

## HF-009 — /history screen

**Story** — As a firefighter or officer reviewing past calls, I want a filterable list of past incidents with the map view, so that I can re-open any incident's hydrant set.

**Acceptance criteria**
- `/history` is gated by `requireBadge()`.
- Top half: `MapView` centred on the average incident lat/lng, with incidents only (no hydrants).
- Filter pill bar above the list: time (7D / 30D / ALL) — single-select, default 7D; type (STRUCTURE / VEHICLE / BRUSH / MEDICAL / HAZMAT / OTHER) — multi-select, with a `+N` chip when more than 3 are selected. Active = yellow, inactive = smoke.
- Toggling filters re-queries `GET /api/incidents?since=…&type=…` and re-renders both the map and the list.
- Bottom sheet lists incidents: time-ago label (mono, e.g. `"6 HRS AGO"`), address (display), type + alarm-level chips, chevron right.
- Tapping a row navigates to `/map/incident/[id]` and re-opens that incident's stored hydrant payload.
- Playwright spec: lands on `/history`, sees 6 rows, applies `STRUCTURE` filter, asserts the row count drops appropriately, taps a row, asserts navigation to that incident's page.

**Out of scope** — Editing or deleting incidents (defer to a future story). Exporting / CSV. Tablet layout (HF-010).

**Visual reference** — `index.html` Screen 5, `prompt.html` §07 spec card 5.

**Pickable** — After HF-005 is merged. Can run in parallel with HF-008.

---

## HF-010 — Tablet breakpoint pass

**Story** — As a firefighter using the truck-mounted tablet, I want the marquee screens to re-flow into a split dispatch-rail layout when the viewport is ≥900px wide, so that the map gets more real estate and the bottom-sheet info is always visible on the side.

**Acceptance criteria**
- A single Tailwind `lg:` breakpoint at `min-width: 900px` triggers a 440px left rail + remaining width map split on `/map`, `/map/incident/[id]`, and `/history`.
- No component is forked — every change is a Tailwind utility class on existing markup. If a component cannot be re-flowed without forking, the PR notes that and proposes the smallest possible structural change.
- The bottom sheet on each of those three screens becomes the static left rail at the breakpoint (no drag handle, no overlay).
- Top bar elements (badge plate, SOS) stay in the same absolute corners.
- Phone layout (< 900px) is byte-identical to before this story — i.e. existing Playwright specs at phone viewport still pass without any modification.
- A new Playwright spec at the tablet viewport (1024×768) drives the same flows as the HF-005 / HF-008 / HF-009 specs and asserts the rail layout via screenshot diff.

**Out of scope** — `/login` (single column on all sizes per design). `/map/new` (form is single-column on tablet too).

**Visual reference** — `prompt.html` §07 last spec card ("TABLET (LANDSCAPE)").

**Pickable** — After HF-005, HF-008, HF-009 are all merged. Last story before the prototype is "done" per `prompt.html` §09.

---

## Picking guide for two devs

**Right now (day 1):** one of you picks HF-000. The other reads `prompt.html` end-to-end and reviews this story map for accuracy + scope.

**As soon as HF-000 merges:**
- The dev who shipped HF-000 should pick a *screen* story next (HF-001 is good — fast unlock for the rest of the team).
- The other dev should pick a *data/component* story (HF-002, HF-003, or HF-004) since none of them block on HF-001.

**Rule for parallelism:** never have two stories open against the same file. Stories in this map have been drawn along file seams precisely so the two of you can work without merge conflicts. If you find yourselves both editing the same file, one of you should pause and let the other land first.

**Use worktrees, every time.** See `.claude/skills/worktree-parallel/SKILL.md`. Two stories = two worktrees = no git mishaps.

**Resume protocol applies even on day 1.** See `.claude/skills/session-resume/SKILL.md`. Lead reads `active-stories.json` at every session start.
