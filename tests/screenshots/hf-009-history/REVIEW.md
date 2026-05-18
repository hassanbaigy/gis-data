# HF-009 review — /history filterable incident list

**Confidence: 0.94 — well above 0.85 gate. Ready for reviewer + PR.**

Self-rated 2026-05-18. Iteration 0 — all 9 HF-009 tests passed on first complete implementation pass after Step D. No iteration needed. Full suite 59/59 green.

## Score by dimension

| Dimension | Weight | Score | Weighted | Notes |
|---|---|---|---|---|
| Functional | 0.30 | 1.00 | 0.300 | 9/9 HF-009 tests pass on first attempt. Full e2e suite 59/59 green (50 baseline + 9 new). Zero regressions in HF-005, HF-006, HF-008. No `.skip`, no `.only`. |
| Visual | 0.25 | 0.90 | 0.225 | Matches `prompt.html` §07 spec card 5: dark map upper half + filter pill bar + scrollable incident list. Time chips and 6-chip 2×3 type grid with yellow/smoke states match HF-005's established palette. The `+N` summary chip uses yellow-tinted styling to read as a count badge, distinct from interactive chips. IncidentRow shows mono time-ago + display address + type/alarm chips + chevron — clean, scannable hierarchy. Small deduction: the address strings from Mapbox can be long ("Main Street, Gorham, Maine 04638, United States") and truncate with `truncate` — acceptable but could wrap to two lines for readability on phone. |
| Interaction | 0.15 | 0.95 | 0.143 | Chip taps update `aria-pressed` instantly. Time chip toggle re-fetches `/api/incidents` (network-spy verified in T05). Type chip toggle filters list via `useMemo` with no network call. Row taps use `<Link>` so middle-click / cmd-click open in new tabs. Focus rings via `focus:ring`. |
| Robustness | 0.15 | 0.85 | 0.128 | Empty-filter result renders a terse "No incidents match the current filters" message. Map falls back to Gorham centroid (D5) when filtered set is empty. First-mount ref guard prevents stale-data refetch on initial render. `cancelled` flag in the fetch promise chain avoids race conditions on rapid filter changes. No automatic retry on network error — keeps the previous state visible (parity with HF-005's posture). |
| A11y | 0.10 | 0.90 | 0.090 | `aria-pressed="true"/"false"` on every chip. `aria-label` on each IncidentRow row spelling out address + type + alarm + time. `aria-hidden="true"` on the chevron SVG so the row's accessible name comes from `aria-label`, not the icon. `role="group"` + `aria-label="Time filter"` / `"Incident type filter"` on each chip group. `aria-label="Plus N more selected"` on the supplementary `+N` chip for screen readers. No `@axe-core/playwright` scan run — same posture as HF-005/HF-008. |
| Console | 0.05 | 1.00 | 0.050 | Zero unexpected browser console errors during the 9-test run. |

**Total: 0.300 + 0.225 + 0.143 + 0.128 + 0.090 + 0.050 = 0.936 → 0.94**

## What matches the visual reference (`prompt.html` §07 spec card 5)

- **Layout**: split flex column. Map upper section (`flex-1` + `minHeight:0`) renders MapView with `incident`-type markers only (no hydrants / chosen / oos). Lower section (`flex-1`, `overflow-y-auto`) holds filter rail + scrollable list.
- **Time chip rail**: `7D` / `30D` / `ALL` single-select. Yellow active, smoke inactive. Default `7D`.
- **Type chip group**: 6 categories in a 2×3 grid. Multi-select. `+N` summary chip (yellow-tinted, non-interactive) appears when > 3 selected — per D2 it NEVER hides chips, just adds a count.
- **Incident rows**: mono `N HRS AGO` / `N DAYS AGO` label, display-font address, `STRUCTURE`/`VEHICLE`/etc. type chip, `ALARM 3` alarm chip, chevron-right icon. Wrapped in `<Link href="/map/incident/[id]">` for semantic navigation.
- **Auth**: `requireFirefighter()` gate on `/history/layout.tsx` — unauthenticated requests redirect to `/login`.

## D1-D5 decisions verified

- **D1 — Client-side type filter**: `history-view.tsx` `useMemo`s a `Set`-based filter over `incidents`. `GET /api/incidents` is fetched with `since` only; `type` param is never sent. Confirmed by T05's network spy (only `since=30d` request, no `type=` param).
- **D2 — Always show 6 chips + supplementary +N**: T07 verifies all 6 chips remain visible after 4 are selected; the `+1` (= 4 selected − 3 threshold) chip appears next to the group. Screenshot 07 confirms.
- **D3 — ALL = no date cutoff**: Tapping `ALL` sends `since=all` to the API. Default load is `7D`. T03 verifies `aria-pressed="true"` initial state on `7D`.
- **D4 — Time-ago format**: `formatTimeAgo` helper in `IncidentRow.tsx` produces `"1 HR AGO"` / `"N HRS AGO"` < 48h, `"N DAYS AGO"` ≥ 48h, uppercase mono. T08's regex `/\d+\s*(HR|HRS|DAY|DAYS)\s*AGO/i` matches.
- **D5 — Gorham centroid fallback**: `GORHAM_FALLBACK = [-70.444, 43.679]` (lng-first) in `history-view.tsx`. Triggered when `filteredIncidents.length === 0`. Same constant HF-005 uses.

## API contract — NO CHANGE

Per D1, this PR does NOT modify `src/app/api/incidents/route.ts`. The existing GET handler (single `type` param) remains as-is. HF-009 fetches with `since` only and applies the type filter client-side.

**security-auditor: SKIPPED** — no new API surface, no auth changes. Confirmed.

## What deviates (acceptable / out of scope)

- **No drag-to-collapse / peek state on the bottom section**: this isn't an overlay sheet (no `BottomSheet`). The section is a static flex child. If a future story wants the lower half to expand/collapse, that's a layout rework — out of scope.
- **`<IncidentRow>` not shared with HintCard**: handoff suggested aspirationally that `IncidentRow` could replace HintCard's inline rendering. Deferred — would require touching HF-005 code. Captured in STORY.md as a future-chore opportunity.
- **`30D` chip uses `since=30d` literal**: existing GET handler already supports it. No new query-param value to register.
- **No row-level actions** (delete, share, archive) — explicitly out of scope.
- **`@axe-core/playwright`** deferred — same posture as HF-001/HF-005/HF-008.

## Tests not regressed

Pre-HF-009: 50 e2e + 18 unit passed.

Post-HF-009: **59 e2e (50 + 9 new) + 18 unit** all pass. Zero regressions across HF-000, HF-Foundation, HF-001, HF-004, HF-005, HF-006, HF-007, HF-008.

```bash
pnpm tsc --noEmit              # ✓ clean
pnpm test:unit                 # ✓ 18 / 18
pnpm e2e                       # ✓ 59 / 59 in ~23s
```

## Ready for

- **`reviewer`** agent — full diff review against the contract (correctness, architecture, readability, test coverage, scope boundary)
- **`security-auditor` SKIPPED** per D1 — no new API surface, no auth changes. Verified by Lead.
- After reviewer sign-off: `gh pr create --base develop --title "feat(hf-009): /history filterable incident list"`
