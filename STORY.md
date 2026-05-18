# HF-009 — /history page

## Story

As a firefighter or officer reviewing past calls, I want a filterable list of past incidents with the map view, so that I can re-open any incident's hydrant set.

## Acceptance criteria

- `/history` is gated by `requireFirefighter()`.
- Top half: `MapView` centred on the average incident lat/lng, with incidents only (no hydrants).
- Filter pill bar above the list: time (7D / 30D / ALL) — single-select, default 7D; type (STRUCTURE / VEHICLE / BRUSH / MEDICAL / HAZMAT / OTHER) — multi-select, with a `+N` chip when more than 3 are selected. Active = yellow, inactive = smoke.
- Toggling filters re-queries `GET /api/incidents?since=…&type=…` and re-renders both the map and the list.
- Bottom list: each row shows time-ago label (mono, e.g. `"6 HRS AGO"`), address (display), type + alarm-level chips, chevron right.
- Tapping a row navigates to `/map/incident/[id]` and re-opens that incident's stored hydrant payload.
- Playwright spec: lands on `/history`, sees 6 rows, applies `STRUCTURE` filter, asserts the row count drops appropriately, taps a row, asserts navigation to that incident's page.

## Out of scope

- Editing or deleting incidents.
- Exporting / CSV.
- Tablet layout (HF-010).
- Sorting beyond `createdAt DESC`.
- Per-incident detail beyond list-row fields — full incident detail lives at `/map/incident/[id]`.
- Refactoring or extending any existing HF-005 / HF-008 component.
- Back-navigation header — the screen is a standalone route, not a drill-down.

## Visual reference

- `index.html` Screen 5 (canonical layout mock)
- `prompt.html` §07 spec card 5 — "HISTORY" at `/history`

### Key spec details

| Element | Spec |
|---|---|
| Layout | Map (incidents only) upper half + filter pill bar + scrollable incident list lower half |
| Map | Centred on average incident lat/lng. `incident` markers only. No hydrant/chosen/oos. |
| Filter pill bar | Time rail (7D/30D/ALL) — single-select, default 7D, yellow active / smoke inactive. Type rail (6 categories) — multi-select; `+N` indicator when > 3 selected. |
| List rows | Mono time-ago + display address + type chip + alarm chip + chevron-right |
| Row tap | `router.push("/map/incident/[id]")` |
| Unauthenticated | Redirect to `/login` |

Time-ago: `N HRS AGO` for < 48h (`1 HR AGO` singular), `N DAYS AGO` for ≥ 48h.

## Files in scope

| Path | Status | Notes |
|---|---|---|
| `src/app/history/layout.tsx` | NEW | Auth gate — mirrors `src/app/map/layout.tsx` exactly |
| `src/app/history/page.tsx` | NEW | Server component. `force-dynamic`. Calls `requireFirefighter()` + Prisma query, serialises, passes to `HistoryView`. |
| `src/app/history/history-view.tsx` | NEW | `"use client"`. Filter state (`since` + `selectedTypes`). Re-fetches on `since` change (first-mount ref pattern). Type filter via `useMemo` (Path B). |
| `src/components/IncidentRow.tsx` | NEW | Pure display. Renders time-ago + address + type chip + alarm chip + chevron. `data-incident-row` and `data-incident-id` on root. |
| `src/components/TimeFilterChips.tsx` | NEW | Single-select rail (7D/30D/ALL) with `aria-pressed`. |
| `src/components/TypeFilterChips.tsx` | NEW | Multi-select for 6 categories, 2×3 grid, supplementary `+N` count when > 3 selected. |
| `tests/e2e/hf-009-history.spec.ts` | NEW | Failing-first spec, 9 tests. |
| `STORY.md` | NEW | This file. |
| `.claude-resume.md` | NEW | Live session state (gitignored). |

**Future-chore opportunity (DO NOT act on in HF-009):** unify `HintCard`'s `hoursSince()` helper with `IncidentRow`'s into a shared `src/lib/time.ts` utility. Leave HintCard alone for now.

## Files NOT in scope (DO NOT TOUCH)

- `prisma/**`
- `src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/geo.ts`, `src/lib/hydrants.ts`, `src/lib/mapbox.ts`
- `src/app/api/auth/**`, `src/app/api/health/**`, `src/app/api/geocode/**`, `src/app/api/hydrants/**`
- `src/app/api/incidents/route.ts` (Path B — no API changes)
- `src/app/api/incidents/[id]/**`
- `src/app/login/**`, `src/app/page.tsx`, `src/app/dev/**`
- `src/app/map/**` (HF-005/006/008 territory)
- `src/components/MapView.tsx` — consume only
- Existing components (`BadgePlate`, `SosButton`, `FilterChips`, `HintCard`, `BottomSheet`, `ActiveTimerPill`, `HydrantCard`, `HydrantsModal`, `_hydrant-format.ts`) — consume only, DO NOT refactor

## Decisions (signed off by user 2026-05-18)

**D1 — Path B: client-side type filter** (Q1=B)
`src/app/api/incidents/route.ts` GET handler stays unchanged. `history-view.tsx` fetches with `since` only and applies a `useMemo` type filter on the client. Acceptable for ≤ 50 rows. No API surface change → `security-auditor` SKIPPED for this story. If the dataset grows beyond ~1000 rows in the future, revisit and switch to Path A (extend GET with `searchParams.getAll("type")` + Prisma `{ type: { in: typeList } }`).

**D2 — Always show all 6 type chips in 2×3 grid + supplementary `+N`** (Q2=B)
`TypeFilterChips` renders all 6 categories in a 2-row × 3-col grid on phone, regardless of selection count. When > 3 are selected, a non-interactive `+N` summary chip appears next to the group as an informational count (e.g. "+2 more"). The individual chips never hide; they remain tap-targets in their fixed positions. This keeps muscle memory predictable for repeat use.

**D3 — `ALL` time filter means no date cutoff** (Q3=confirm)
Tapping `ALL` sends `since=all` to the GET handler — the existing handler interprets this as "no `createdAt` filter" and returns every historical row. Default state on first load is `7D` active (matches the AC default).

**D4 — Time-ago format mirrors HintCard** (Q4=confirm)
`hoursSince()` helper local to `IncidentRow` (do NOT extract from HintCard; future-chore opportunity to unify). Output:
- `1 HR AGO` for exactly 1 hour
- `N HRS AGO` for < 48 hours (N is the floor of elapsed hours)
- `N DAYS AGO` for ≥ 48 hours (N is the floor of elapsed days)
Always uppercase, mono font.

**D5 — Empty-filter map centre fallback** (Q5=confirm)
When the type-filter result is empty (no incidents visible on the map), MapView is centred on the Gorham centroid `[-70.444, 43.679]` (lng-first per MapView's `center` prop convention). Same fallback HF-005 uses (D3 there). Implemented as a `const GORHAM_FALLBACK` in `history-view.tsx`.

## Layout note — `BottomSheet` is NOT used here

HF-008's `BottomSheet` is positioned `absolute inset-x-0 bottom-0` — designed to overlay a full-bleed map. The history screen has a SPLIT layout (map top, list bottom). `history-view.tsx` uses a flex column instead:

```
<main className="flex h-screen flex-col bg-black text-paper">
  <section className="relative flex-1" style={{ minHeight: 0 }}>
    <MapView ... />
  </section>
  <section className="flex flex-col border-t border-paper/10">
    <TimeFilterChips ... />
    <TypeFilterChips ... />
    <div className="flex-1 overflow-y-auto">
      {incidents.map(...)}  {/* IncidentRow stack */}
    </div>
  </section>
</main>
```

Roughly 50/50 split. Implementer may tune the proportions during click-through.

## AC → Playwright test map

All tests in `tests/e2e/hf-009-history.spec.ts`. Screenshots → `tests/screenshots/hf-009-history/`.

### Setup pattern (mirrors `hf-008-results.spec.ts`)

- `test.beforeAll({ playwright })`: POST `/api/incidents` via `authedRequestContext` to create a known incident → capture `incidentId` and the row's `type` for navigation/filter assertions.
- `test.beforeEach({ context })`: `loginInContext(context)` + console-error collector.
- `test.afterEach`: assert `consoleErrors` is empty.

### Test list

| # | Test name | AC covered | Screenshot |
|---|---|---|---|
| T01 | `unauthenticated GET /history redirects to /login` | Auth gate | `01-unauthed-redirect.png` |
| T02 | `map reaches ready state with incident markers only` | Map + types | `02-map-ready.png` |
| T03 | `full layout: header map filter rail and incident list` | Layout | `03-full-layout.png` |
| T04 | `initial list shows all seeded incidents (>= 6 rows)` | Default filter | `04-list-default.png` |
| T05 | `tapping 30D chip re-fetches and updates map and list` | Time filter | `05-time-filter.png` |
| T06 | `tapping STRUCTURE chip filters list rows to STRUCTURE only` | Type filter | `06-type-filter.png` |
| T07 | `selecting 4 type chips shows +N indicator` | +N overflow | `07-plus-n.png` |
| T08 | `IncidentRow renders time-ago address type chip alarm chip and chevron` | Row fields | `08-row-content.png` |
| T09 | `tapping a row navigates to /map/incident/[id]` | Row click | `09-row-tap-nav.png` |

### Key assertion patterns

- **T02 marker types**: `data-marker-types` contains `"incident"` and does NOT contain `"hydrant"`, `"chosen"`, or `"oos"`.
- **T03 initial state**: `7D` chip has `aria-pressed="true"`; `30D` and `ALL` have `aria-pressed="false"`. All 6 type chips have `aria-pressed="false"`.
- **T05 re-fetch (network spy)**: mirror `hf-005-home.spec.ts` test 07 — record `page.on("request")` for GET `/api/incidents`, tap `30D`, assert ≥ 1 call fired with `since=30d`.
- **T06 type filter**: tap STRUCTURE, assert `aria-pressed="true"` on STRUCTURE, count `[data-incident-row]` < original, assert every visible row's type chip text is `STRUCTURE`.
- **T07 +N**: tap 4 type chips, assert element matching `/\+\d+/` visible inside the type filter region.
- **T08 fields**: on first `[data-incident-row]`: text matching `/\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i`, non-empty address, type chip from VALID_TYPES set, alarm chip matching `/(ALARM|LEVEL)\s*\d/i`.
- **T09 navigation**: locate by `[data-incident-id="${incidentId}"]`, click, `waitForURL(/\/map\/incident\//)`, URL contains `incidentId`.

### Test-seam attributes (implementer MUST expose)

- `data-incident-row` on each `IncidentRow` root element (count assertions).
- `data-incident-id="<id>"` on each `IncidentRow` root element (targeted click in T09).

## Task list

### Step A — Failing-first spec
- **Agent**: test-writer
- **Touches**: `tests/e2e/hf-009-history.spec.ts`
- **Commit**: `test(e2e): add failing spec for hf-009-history`
- **Verify**: all 9 tests fail (`/history` 404)

### Step B — Auth gate + server page + client skeleton
- **Agent**: Lead
- **Touches**: `src/app/history/layout.tsx`, `src/app/history/page.tsx`, `src/app/history/history-view.tsx` (skeleton with MapView + unfiltered list stubs)
- **Commit**: `feat(hf-009): auth gate + server page + history-view skeleton`
- **Verify**: T01 + T02 pass

### Step C — Time + type filter chip components
- **Agent**: Lead (frontend)
- **Touches**: `src/components/TimeFilterChips.tsx`, `src/components/TypeFilterChips.tsx`, wire into `history-view.tsx`
- **Commit**: `feat(hf-009): time and type filter chip components`
- **Verify**: T03 + T05 + T06 + T07 pass

### Step D — IncidentRow + navigation
- **Agent**: Lead (frontend)
- **Touches**: `src/components/IncidentRow.tsx`, replace stubs in `history-view.tsx`
- **Commit**: `feat(hf-009): IncidentRow component + row navigation`
- **Verify**: T04 + T08 + T09 pass. Full 9/9 green.

### Step E — Click-through + REVIEW.md
- **Agent**: Lead
- **Touches**: `tests/screenshots/hf-009-history/*.png`, `tests/screenshots/hf-009-history/REVIEW.md`
- **Commit**: `chore(hf-009): click-through screenshots + REVIEW.md (confidence X.XX)`
- **Cap**: 5 iterations

### Step F — Reviewer + PR
- **Agent**: `reviewer` (mandatory); `security-auditor` SKIPPED (Path B — no API surface change)
- **PR**: `gh pr create --base develop --title "feat(hf-009): /history filterable incident list"`

## Confidence rubric

| Dimension | Weight | What 1.0 looks like |
|---|---|---|
| Functional | 0.30 | All 9 tests pass; full suite (50 + 9 = 59) green; no skips |
| Visual | 0.25 | Map + filter rail + list match `index.html` Screen 5; chip colours match |
| Interaction | 0.15 | Tab order sensible, row tap navigates, `aria-pressed` updates, focus rings visible |
| Robustness | 0.15 | Empty filter result → graceful empty state; map fallback works; 401 mid-session handled |
| A11y | 0.10 | All chips + rows have accessible names; chevron `aria-hidden` |
| Console | 0.05 | Zero errors during spec run |

**Gate: 0.85. Max 5 iterations.** This screen is supportive, not marquee — HF-008 carried the headline visual budget. Don't obsess over pixel-perfect on a 1-2h story.

## Definition of done

- [ ] All 9 HF-009 tests pass
- [ ] Full e2e suite (50 baseline + 9 new = 59) all pass
- [ ] `tests/screenshots/hf-009-history/REVIEW.md` weighted score ≥ 0.85
- [ ] `reviewer` signed off
- [ ] Security-auditor SKIPPED (Path B)
- [ ] PR opened against `develop` with embedded screenshots
- [ ] `STORY.md` + `.claude-resume.md` present at worktree root

## Open questions for the user

**Q1 — Path B (client-side type filter) instead of extending GET handler**
Existing GET takes single `?type=X`. Multi-select would need:
- **Path A**: extend `searchParams.getAll("type")` + Prisma `{ in: ... }`. Server-side. Adds API surface → security-auditor needed.
- **Path B (proposed)**: leave handler alone; fetch by `since` only; client-side filter via `useMemo`. ≤ 50 rows so perf is fine. No API change, no security-auditor.

**Proposed: Path B. OK?**

**Q2 — Type filter layout + `+N` overflow**
- **Option A**: hide chips beyond 3 selected; show "+N" in their place
- **Option B (proposed)**: always render all 6 type chips in 2×3 grid; `+N` chip is a supplementary count summary (non-interactive, never hides individual chips)

**Proposed: Option B. OK?**

**Q3 — `ALL` time filter semantics**
`ALL` = `since=all` (no date cutoff, all historical incidents). Default on first load is `7D`.

**Proposed: confirm. OK?**

**Q4 — Time-ago format**
Mirror HintCard: `1 HR AGO` (singular) / `N HRS AGO` for < 48h, `N DAYS AGO` for ≥ 48h. Uppercase mono.

**Proposed: same as HintCard. OK?**

**Q5 — Empty-filter map centre fallback**
Same as HF-005 D3: Gorham centroid `[-70.444, 43.679]` (lng-first).

**Proposed: same fallback. OK?**
