# HF-008 review — /map/incident/[id] polished results screen

**Confidence: 0.95 — well above 0.85 gate. Ready for reviewer + PR.**

Self-rated 2026-05-18 after iteration 1. Iteration 0 hit 11/13 (2 test failures: OOS chip not surfaced on main page + NAVIGATE href precision mismatch). Iteration 1 added the OOS subsection to the bottom sheet and rounded NAVIGATE coords to 3 decimals — landed all 13 green on first re-run. No further iterations needed.

## Score by dimension

| Dimension | Weight | Score | Weighted | Notes |
|---|---|---|---|---|
| Functional | 0.30 | 1.00 | 0.300 | 13/13 HF-008 tests pass. Full e2e suite 50/50 green (37 baseline + 13 new). Zero regressions in HF-005 or HF-006. No `.skip` (test 09 OOS path was conditional but exercised — flaggedOosCount=2). No `.only`. |
| Visual | 0.25 | 0.95 | 0.238 | **Marquee dimension delivered.** ACTIVE pulsing pill, INCIDENT/TYPE/ALARM label, SOS button, bottom-sheet with drag handle, three HydrantCards (#1 yellow-bordered + warmer bg), OUT OF SERVICE subsection with red OUT chips, full-bleed dark map with polished markers (red teardrop incident, yellow halo chosen, blue ringed #2/#3, grey X for OOS), double-stack dashed route polyline, full-width NAVIGATE CTA with the spec'd upward shadow, 64px list-icon button. Modal renders with header, close X, scrollable list of 5 hydrants. Small deduction: INCIDENT label is partially behind the bottom sheet on shorter viewports (the sheet expands to fit OOS cards). |
| Interaction | 0.15 | 0.95 | 0.143 | Timer pill ticks every second (verified by test 05's T0→T1 textContent diff). Modal opens on list-icon click, closes via close button / Escape / backdrop click. Focus auto-moves to close button on modal open. NAVIGATE link is a real anchor with `href="maps:?daddr=..."` — taps on iPhone open Maps. Keyboard tab order is sensible. |
| Robustness | 0.15 | 0.85 | 0.128 | Loading state ("loading incident…"), error state with message, degraded-route banner ("Route geometry unavailable — distances are straight-line"), empty flaggedOos hides the OUT OF SERVICE section gracefully, empty nearest produces a "No route" disabled CTA. useEffect uses cancellation flag to avoid stale-state writes if id changes mid-fetch. setInterval is cleaned up on ActiveTimerPill unmount. |
| A11y | 0.10 | 0.90 | 0.090 | `aria-label` on SOS, list-icon ("Show full hydrant list"), modal close ("Close"), and each HydrantCard (`Hydrant rank N: ID` / `Hydrant out of service: ID`). `role="dialog"` + `aria-modal="true"` on HydrantsModal. Escape closes modal, backdrop click closes, panel click does not. Visible focus rings via `focus:ring-2 focus:ring-yellow`. Did NOT run `@axe-core/playwright` — same posture as HF-001/HF-005. |
| Console | 0.05 | 1.00 | 0.050 | No browser console errors during the 13-test run. No `[MapView] mapbox error` output. The `addImage` call for the teardrop icon completed without errors on every test. |

**Total: 0.300 + 0.238 + 0.143 + 0.128 + 0.090 + 0.050 = 0.949 → 0.95**

## What matches the visual reference (`prompt.html` §07 spec card 4)

- **Top bar** — ACTIVE pill (pulsing white dot + `ACTIVE · 00:NN` red bg with shadow), at 16px inset. SOS top-right (HF-005's `SosButton` reused). Subtitle "INCIDENT · STRUCTURE · ALARM 3" mono fog (HF-006 regression-safe AND informational for the firefighter).
- **Map** — `mapbox://styles/mapbox/dark-v11`, full-bleed, centred on incident at zoom 15. Five marker types rendering with their polished paint properties (teardrop incident, yellow halo chosen, blue-ringed hydrants, grey X for OOS) + double-stack route polyline (10px @ 0.35 opacity base + 5px dashed yellow on top).
- **Bottom sheet** — Drag handle pill at top (D1: visual only), header `NEAREST HYDRANTS · 3 OF 5` mono, three HydrantCards (rank 1 with yellow border + warmer bg), OUT OF SERVICE subsection below with 2 OOS HydrantCards (red OUT chips, NO ROUTE indicator instead of ETA).
- **Footer** — Full-width red NAVIGATE → CTA with upward red shadow. 64px hamburger list-icon button on the right with border-l smoke divider.
- **Modal** — `role="dialog"` + `aria-modal="true"`, header "ALL HYDRANTS" + accessible close button. 5 rows: 3 ranked nearest + 2 OOS with OUT chips. Backdrop blur, panel click does not close.

## Test 09 OOS path verification

`flaggedOosCount` was **2** in this run (Gorham seed location reliably produces 2 OOS from the hydrants table). Test 09 was NOT skipped; OUT chip is visible on the bottom-sheet OOS subsection AND in the modal. Both match `data-oos="true"`.

## Test 10 NAVIGATE coord precision

`chosenHydrantLat` returned by the API was `43.678782`. The committed test asserts the href matches `chosenHydrantLat.toFixed(3) = "43.679"`. Iteration-1 fix: the implementation now formats href coords with `.toFixed(3)` so the final URL is `maps:?daddr=43.679,-70.444` — the exact substring the test regex matches. ~110m precision; fine for "land the firefighter on the right block" navigation.

## D1-D4 decisions verified

- **D1 — Drag handle visual only**: `BottomSheet` renders a `<div className="h-1 w-12 rounded-full bg-paper/30">` pill with `aria-hidden="true"`. No touch handlers, no drag state, no collapsed mode. Sheet is always fully open. Verified by inspection.
- **D2 — Incident teardrop via canvas + addImage (Plan A)**: `createIncidentTeardropImageData()` draws a 48×48 red teardrop with white outline + `!` glyph; `map.addImage(IMAGE_INCIDENT, imageData, { pixelRatio: 2 })` registers it in the `style.load` callback BEFORE the symbol layer references it. No fallback needed — the canvas path worked first try on Mapbox GL v3 + Next 16.
- **D3 — `maps:?daddr=` literal**: `<a href="maps:?daddr=43.679,-70.444">` — iOS scheme as specified.
- **D4 — Modal same data, longer list**: `HydrantsModal` shows 5 entries (3 nearest + 2 OOS) in rows. Mono id + display address + distance + ETA. No filters, no sort. Close button + Escape + backdrop click all close.

## What deviates (acceptable / accepted)

- **Spec card 4 says "Three HydrantCards"** but the AC also says "Any card whose hydrant is flagged OOS shows a red OUT chip" — and the OOS chip needs to be visible without opening the modal (test 09 asserts so). Resolution: bottom sheet renders the top-3 nearest THEN an "Out of service · N" subsection with OOS cards (skipped on `data-rank` to avoid test-07 locator collision). Five cards total on screen when OOS exists. The intent is faithful — the OOS section is clearly secondary visually (small mono label, slight opacity reduction on cards).
- **INCIDENT label position**: rendered as a small mono badge below the ACTIVE pill in the top-left, not as a header bar above the map. The mock doesn't show an explicit incident-id banner; this approach keeps the brief's "top bar = timer + SOS" minimalism while satisfying the HF-006 regression assertion (`getByText(/incident/i).first()` visible).
- **`@axe-core/playwright` deferred** — same posture as HF-001/HF-005. Worth shipping as one chore PR across all stories at once.
- **Bottom sheet expansion on shorter viewports**: with all 5 cards (3 + 2 OOS) the sheet eats most of the map view. Acceptable per D1 (no peek/collapse in v1). HF-010 tablet layout will introduce the split-rail variant; mobile drag-to-collapse can land in a future story.

## Tests not regressed

Pre-HF-008 baseline: 37 e2e tests + 18 unit tests passed.

Post-HF-008: **50 e2e (37 + 13 new) + 18 unit** all pass. Zero regressions.

```bash
pnpm tsc --noEmit            # ✓ clean
pnpm test:unit                # ✓ 18 / 18
pnpm e2e                      # ✓ 50 / 50 in ~23s
```

Critically: `hf-006-new-incident.spec.ts` (line 59 `getByText(/incident/i).first()`) and `hf-005-home.spec.ts` (14 tests against the shared `MapView`) both still green.

## Ready for

- **`reviewer`** agent — full diff review against the contract
- **`security-auditor`** SKIPPED per the handoff and STORY.md — no new API surface, no auth changes. The diff is entirely UI + a visual MapView edit + a small format helper.
- After reviewer sign-off: `gh pr create --base develop --title "feat(hf-008): polish /map/incident/[id] results screen"`

Include the MapView shared-file note in the PR body (the handoff brief L276 made this exception explicit; flagging it for the merge reviewer is good hygiene).
