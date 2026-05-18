# HF-005 — /map home screen

## Story

As a firefighter on shift, I want to land on a dark map showing the last 7 days of incidents with one tap-away access to creating a new incident, so that I have situational awareness and can dispatch fast.

## Acceptance criteria

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

## Out of scope

- The new-incident form itself (HF-006 — already shipped).
- The history page (HF-009 — not yet built; `/history` will 404 until then).
- Tablet split-rail layout (HF-010).
- Marker style polish — `MapView.tsx` circle layers are v1 placeholders; HF-008 replaces them with symbol layers.
- Real SOS behaviour — the SOS button is rendered as a visible stub only (48×48, yellow border, yellow glyph). No `onClick` handler beyond a `console.log`. Defer SOS dispatch logic to a future story.
- Filter logic for `"UNIT E-12"` chip beyond what the GET API supports — the chip is rendered and wired to re-fetch, but the chip label is derived from the authenticated firefighter's `unitId` and passes `unitId=E-12` as a query param; no per-unit aggregation UI is required.

## Visual reference

Screen reference: `.claude/agent-context/index.html` Screen 2, `.claude/agent-context/prompt.html` §07 spec card 2.

Key spec details (verbatim from `prompt.html` §07 card 2):

- **Layout** — Full-bleed Mapbox map (dark style: `mapbox://styles/mapbox/dark-v11`). Top: badge plate (left) + SOS button (right, yellow-bordered 48×48). Below: filter chip rail (`"ALL · 6"`, `"7 DAYS"`, `"UNIT E-12"`). Bottom: glassless dark hint card (`"LAST INCIDENT · 6 HRS AGO"` + address + hydrant count).
- **CTA** — Persistent footer: full-width red `+ NEW INCIDENT` (24px display) + 64px-wide list icon button → `/history`.
- **Pins** — Past incidents shown as red dots w/ 14px translucent halo. Hydrants _not_ shown on this screen — they appear once an incident is in context.
- **Top bar inset** — 16px from top (safe area inset).
- **Filter chips** — Yellow fill + black text for active state; smoke (`#6b7280` or similar) for inactive state.
- **Hint card** — No glass blur; dark background; mono label, display address, chip count (`"N hydrants"` derived from `chosenHydrantId` presence across incidents).

## Files in scope

### New files

| File | Role |
|---|---|
| `src/app/map/page.tsx` | Server component shell: calls `GET /api/incidents?since=7d`, computes map centre, passes data to the client layer |
| `src/app/map/map-home.tsx` | `"use client"` interactive layer: holds filter state, triggers re-fetches on chip tap, renders MapView + overlay UI |
| `src/components/HintCard.tsx` | Dark bottom hint card: most-recent incident address, time-ago label, hydrant count chip |
| `src/components/FilterChips.tsx` | Filter chip rail: ALL · N, 7 DAYS / 30 DAYS / ALL (time), UNIT E-12. Yellow active, smoke inactive |
| `src/components/BadgePlate.tsx` | Top-left mono badge plate (`"BADGE 0418"`) |
| `src/components/SosButton.tsx` | Top-right 48×48 yellow-bordered stub button (no real handler) |
| `tests/e2e/hf-005-home.spec.ts` | Failing-first Playwright spec (committed before implementation) |
| `STORY.md` | This file |
| `.claude-resume.md` | Session-resume state file (gitignored) |

### Modified files

| File | Change |
|---|---|
| `src/app/api/incidents/route.ts` | Add `GET` handler (POST stays untouched) |
| `src/app/globals.css` | Add `--color-smoke: #6b7280` token to `@theme inline` block if not already present (needed for inactive chip state) |

## Files NOT in scope (DO NOT TOUCH)

- `prisma/**` — schema and seed are frozen
- `src/lib/auth.ts` — shared auth helpers
- `src/lib/db.ts` — Prisma singleton
- `src/lib/geo.ts` — coordinate validators
- `src/lib/hydrants.ts` — nearest-hydrant logic
- `src/lib/mapbox.ts` — Mapbox REST helpers
- `src/app/api/auth/**` — sign-in / sign-out routes
- `src/app/api/health/**` — health check route
- `src/app/api/geocode/**` — geocode route
- `src/app/api/hydrants/**` — hydrant nearest route
- `src/app/api/incidents/route.ts` POST handler — Dev A owns it; add only the `GET` export
- `src/app/api/incidents/[id]/**` — per-incident GET (Dev A)
- `src/app/login/**` — login page
- `src/app/page.tsx` — root redirect
- `src/app/dev/**` — dev fixtures
- `src/app/map/layout.tsx` — auth gate (already in place)
- `src/components/MapView.tsx` — consume only; HF-008 polishes marker style
- `src/app/map/new/**` — new-incident form (HF-006, already shipped)
- `src/app/map/incident/**` — incident results page (HF-008 polishes)

## API contract — `GET /api/incidents`

### Endpoint

`GET /api/incidents` — POST handler in the same file is unchanged.

### Authentication

- Call `readBadge()` (returns `null` when the cookie is absent or invalid).
- On null: respond `401 { "error": "unauthenticated" }`. Do NOT redirect.

### Query parameters

| Param | Type | Values | Default | Invalid → |
|---|---|---|---|---|
| `since` | string | `"7d"`, `"30d"`, `"all"` | `"7d"` | `400 { "error": "invalid_since" }` |
| `type` | string | `STRUCTURE` / `VEHICLE` / `BRUSH` / `MEDICAL` / `HAZMAT` / `OTHER` | (omit = no filter) | `400 { "error": "invalid_type" }` |
| `unitId` | string | any, max 32 chars | (omit = no filter) | `400 { "error": "invalid_unitId" }` |

`since` resolution: `"7d"` → `createdAt >= now - 7 days`; `"30d"` → 30 days; `"all"` → no `createdAt` filter.

### Response — 200

```json
{
  "incidents": [
    {
      "id": "...",
      "createdAt": "2026-05-10T14:22:00.000Z",
      "address": "23 Main St, Gorham, ME",
      "lat": 43.6791,
      "lng": -70.4444,
      "type": "STRUCTURE",
      "alarmLevel": 3,
      "unitId": "E-12",
      "chosenHydrantId": "GOD-HYD00340"
    }
  ]
}
```

Fields intentionally **omitted**: `firefighterId`, `notes`. Use a Prisma `select` to avoid leaking them. Ordered `createdAt DESC`.

### Error responses

| Status | Body |
|---|---|
| 401 | `{ "error": "unauthenticated" }` |
| 400 | `{ "error": "invalid_since" }` / `{ "error": "invalid_type" }` / `{ "error": "invalid_unitId" }` |

## AC → Playwright test map

All tests live in `tests/e2e/hf-005-home.spec.ts`. Screenshots → `tests/screenshots/hf-005-home/`.

### Browser tests — `describe("HF-005 /map home screen")`

`beforeEach`: `await loginInContext(context)`.

| # | `test(...)` block name | AC covered | Screenshot |
|---|---|---|---|
| 01 | `"renders dark map top bar filter chips hint card and footer on /map after login"` | Full-bleed MapView, top bar, filter rail, hint card, footer | `01-home-loaded.png` |
| 02 | `"shows 6 incident markers on the map"` | Past incidents render; count correct | `02-marker-count.png` |
| 03 | `"filter chips display ALL count 7 DAYS chip and UNIT E-12 chip"` | Filter rail labels | `03-filter-chips.png` |
| 04 | `"tapping + NEW INCIDENT navigates to /map/new"` | Footer CTA routes | `04-nav-new-incident.png` |
| 05 | `"tapping the list icon navigates to /history"` | List icon routes (404 until HF-009) | `05-nav-history.png` |
| 06 | `"hint card shows most-recent incident address"` | Hint card content | `06-hint-card.png` |
| 07 | `"tapping 7 DAYS chip re-fetches and map state updates"` | Chip toggle re-fetches | `07-chip-toggle.png` |
| 08 | `"unauthenticated GET /map redirects to /login"` | Auth gate (fresh `browser.newContext()`) | `08-unauthed-redirect.png` |

**Test 02**: assert `await expect(page.locator('[data-hf-map-state]')).toHaveAttribute('data-marker-count', '6')` after `data-status === "ready"`.

### API tests — `describe("HF-005 GET /api/incidents")`

Use `authedRequestContext(playwright)`.

| # | `test(...)` block name | AC covered |
|---|---|---|
| 09 | `"GET /api/incidents?since=7d returns 6 seeded incidents ordered createdAt DESC"` | List + ordering |
| 10 | `"GET /api/incidents without cookie returns 401"` | API auth gate |
| 11 | `"GET /api/incidents?type=STRUCTURE filters to only STRUCTURE incidents"` | `type` filter |
| 12 | `"GET /api/incidents?since=invalid returns 400 with error invalid_since"` | `since` validation |
| 13 | `"GET /api/incidents response does not include firefighterId or notes"` | PII not leaked |
| 14 | `"GET /api/incidents?since=all returns all incidents regardless of date"` | `"all"` since value |

## Task list

Each step maps to the 10-step loop in `.claude/skills/tdd-user-story/SKILL.md`.

### Step A — Failing spec (loop step 3)
- Agent: test-writer
- Touches: `tests/e2e/hf-005-home.spec.ts` (new)
- Commit: `test(e2e): add failing spec for hf-005-home`
- Verify: all 14 tests fail (page 404, API 404)

### Step B — `GET /api/incidents` handler (loop step 4a)
- Agent: Lead (backend)
- Touches: `src/app/api/incidents/route.ts` (add `GET` export)
- Commit: `feat(hf-005): add GET /api/incidents with since/type/unitId filters`
- Verify: tests 09-14 green

### Step C — Add `--color-smoke` design token (loop step 4b)
- Agent: Lead (frontend)
- Touches: `src/app/globals.css`
- Commit: `chore(tokens): add --color-smoke to @theme`
- Verify: `class="text-smoke"` resolves in Tailwind v4 build

### Step D — Page + components (loop step 4c)
- Agent: Lead (frontend)
- Touches: `src/app/map/page.tsx`, `src/app/map/map-home.tsx`, `src/components/{BadgePlate,SosButton,FilterChips,HintCard}.tsx` (all new)
- Commit: `feat(hf-005): implement /map home page with MapView + overlay UI`
- Verify: tests 01-08 green; manual click-through `/login` → `/map`
- **Mapbox container reminder**: parent flex item of `<MapView>` MUST have inline `style={{ minHeight: 0 }}`

### Step E — Click-through + score (loop steps 5-7)
- Agent: Lead
- Touches: `tests/screenshots/hf-005-home/*.png` + `tests/screenshots/hf-005-home/REVIEW.md`
- Commit (after gate ≥ 0.85): `chore(hf-005): click-through screenshots + REVIEW.md (confidence X.XX)`
- Cap at 5 iterations

### Step F — Review + PR (loop steps 8-9)
- Agents: `reviewer` (mandatory), `security-auditor` (optional but recommended — new public API surface)
- PR: `gh pr create --base develop --title "feat(hf-005): /map home screen — dark map, incident markers, filter chips, GET /api/incidents"`
- Body includes AC paste, REVIEW.md, embedded screenshots, test plan, reviewer + security-auditor outputs

## Confidence rubric

| Dimension | Weight | What 1.0 looks like |
|---|---|---|
| **Functional** | 0.30 | All 14 new tests pass; existing 23 still green; no `.skip`, no `.only` |
| **Visual** | 0.25 | Full-bleed dark map; badge plate + SOS at 16px inset; filter chips with correct colours; hint card matches spec card 2; footer CTA + list icon visible |
| **Interaction** | 0.15 | Chip tap toggles + re-fetches; CTAs navigate; SOS focusable; keyboard tab order sensible |
| **Robustness** | 0.15 | Zero-incidents fallback (Gorham centroid); `data-status="ready"` awaited; 401/400 surfaced gracefully |
| **A11y** | 0.10 | axe reports zero serious/critical violations; buttons have accessible labels |
| **Console** | 0.05 | No browser console errors during spec runs |

**Gate: 0.85. Max 5 iterations.**

## Definition of done

- [ ] All 14 new tests in `tests/e2e/hf-005-home.spec.ts` pass
- [ ] All 23 existing e2e tests still pass (HF-000 / HF-Foundation / HF-001 / HF-004 / HF-006 / HF-007)
- [ ] `tests/screenshots/hf-005-home/REVIEW.md` filled with weighted score ≥ 0.85
- [ ] `reviewer` signed off
- [ ] (Optional) `security-auditor` reviewed the new GET endpoint
- [ ] PR opened against `develop` (NOT `main`) with embedded screenshots + REVIEW.md
- [ ] `STORY.md` + `.claude-resume.md` present at worktree root

## Decisions (signed off by user 2026-05-18)

**D1 — Filter chip rail behaviour** (Q1=A)
`[ALL · N]` and `[7 DAYS]` are a pair of mutually-exclusive time filters (radio-like). Exactly one is active (yellow) at a time. On first load, `[7 DAYS]` is active and `[ALL · N]` is smoke. Tapping `[ALL · N]` activates it (yellow), deactivates `[7 DAYS]` (smoke), and re-fetches with `since=all`. Tapping `[7 DAYS]` does the reverse with `since=7d`. The `· N` suffix on `[ALL · N]` is the total-incidents count (server-derived; updates after re-fetch). `[UNIT E-12]` is an independent on/off toggle (yellow when active, smoke when inactive); on toggle the page re-fetches with or without `unitId=E-12`. On first load `[UNIT E-12]` is active (yellow) and `unitId=E-12` is sent.

Implementation note: this means three filter states for the chip rail (time + unit), each driving a query param on `GET /api/incidents`. The server's `since=7d` default is used only as a safety fallback if the client somehow omits the param; the page always sends an explicit `since`.

**D2 — SOS button** (Q2=OK)
Visible stub. 48×48 button with yellow border and yellow glyph, positioned top-right at 16px inset. `onClick = () => console.log("[SOS] pressed — not yet implemented")`. `aria-label="SOS — not yet active"`. No modal, no API call. Real SOS dispatch is a future story.

**D3 — Map centre when zero incidents** (Q3=OK)
Compute `[avgLng, avgLat]` from the `incidents` array returned by the API. If `incidents.length === 0`, fall back to the hardcoded Gorham, ME centroid `[-70.444, 43.679]` (lng-first to match `MapView`'s `center` prop). The fallback is a `const` at the top of the server component for clarity; both server and client paths agree on the value.

**D4 — List icon → `/history` while HF-009 hasn't shipped** (Q4=OK)
The list icon (64px-wide button on the right side of the persistent footer) routes unconditionally to `/history`. `/history` will 404 until HF-009 ships — that is expected. The Playwright spec for the list icon (test 05) asserts only that `page.url()` contains `/history` after the tap, NOT that the page renders any content. Same pattern HF-001 used for `/map` before this story shipped. The button is not disabled or hidden.
