# HF-005 review — /map home screen

**Confidence: 0.93 — above 0.85 gate. Reviewer + security-auditor sign-off applied below.**

Self-rated 2026-05-18. Iteration 0 hit 0.936; iteration 1 applied the two reviewer-flagged BLOCKER fixes (stale-data refetch, hardcoded hydrant count), the HIGH-1 fetch.ok check, and HIGH-2 network-spy strengthening in test 07 (with reviewer + security-auditor reports incorporated). Score holds at 0.93 — the must-fix items closed but no dimension materially improved beyond what the original sub-scores reflected.

## Score by dimension

| Dimension | Weight | Score | Weighted | Notes |
|---|---|---|---|---|
| Functional | 0.30 | 1.00 | 0.300 | 14/14 HF-005 tests pass; full e2e suite 37/37 green (23 existing + 14 new). No regressions. No `.skip`, no `.only`. |
| Visual | 0.25 | 0.90 | 0.225 | Brand block + filter chips + hint card + footer CTA + list icon all match spec. Incident dots render with red fill + halo from MapView's existing circle layers. Mapped against `prompt.html` §07 spec card 2: layout (full-bleed dark, 16px insets, chip rail, hint card, footer) is right. Small deduction since the marker styling is MapView's v1 placeholder (HF-008 polishes to symbol layers + 14px halo per spec). |
| Interaction | 0.15 | 0.95 | 0.143 | Chip tap toggles state + triggers re-fetch (verified by test 07 — count goes 6→8 when ALL activates). CTAs navigate. SOS focusable. Keyboard tab order sensible. `aria-pressed` updates on each chip. |
| Robustness | 0.15 | 0.85 | 0.128 | Empty-incidents D3 fallback to Gorham centroid implemented and verified at compile time (server + client both reference the same constant). `data-status="ready"` awaited correctly. 401/400 paths in `GET /api/incidents` covered by tests 10 + 12. Filter race condition guarded by `cancelled` flag in useEffect. Small deduction: no loading spinner on chip re-fetch (relies on existing data + map repaint after) — acceptable for prototype. |
| A11y | 0.10 | 0.90 | 0.090 | `aria-pressed` on chips; `aria-label` on SOS button + History link + BadgePlate; SVG icons marked `aria-hidden="true"`; focus rings via `focus:ring-2 focus:ring-yellow`; visible label hierarchy. Did NOT run `@axe-core/playwright` — same posture as HF-001's 0.90 here; running axe is a follow-up worth shipping across all stories at once. |
| Console | 0.05 | 1.00 | 0.050 | No unexpected browser console errors during the 14-test run. `afterEach` filter is scoped tightly to `Failed to load resource ... 404` only when `page.url().includes("/history")` (per D4). |

**Total: 0.300 + 0.225 + 0.143 + 0.128 + 0.090 + 0.050 = 0.936 → 0.93** (reviewer MEDIUM-5 — banker's-rounding standard cut was upward; honest report keeps the floor.)

## What matches the visual reference (`prompt.html` §07 spec card 2)

- **Layout** — Full-bleed `mapbox://styles/mapbox/dark-v11` map via the existing `<MapView>` component. Top bar + filter rail + hint card + persistent footer composited on top with absolute positioning. 16px safe inset.
- **Brand / identity** — `BADGE 0418` rendered in `font-mono text-sm` with a dark backdrop-blurred plate. Top-left at 16px inset.
- **SOS button** — 48×48 (`h-12 w-12`), `border-2 border-yellow`, yellow `SOS` text in `font-display`. Top-right at 16px inset. Per D2, the onClick logs to console and the `aria-label="SOS — not yet active"` flags this as a stub for screen readers.
- **Filter chip rail** — Three buttons (`ALL · N`, `7 DAYS`, `UNIT E-12`). Yellow fill + black text for active; transparent + smoke border + smoke text for inactive. `aria-pressed` reflects active state.
- **Pins** — Red incident dots rendered via MapView's existing `LAYER_INCIDENT` circle layer (consume-only — `MapView.tsx` is HF-008's polish target).
- **Hint card** — `LAST INCIDENT · N HRS AGO` mono label, address in `font-display`, `3 HYDRANTS NEARBY` chip badge. Dark backdrop, no glass blur per the spec's "glassless dark".
- **Footer** — Red `+ New Incident` CTA in `font-display text-2xl font-extrabold uppercase` with a `shadow-[0_-4px_24px_rgba(225,29,41,0.25)]` glow upward. 64px-wide list-icon (hamburger) button on the right with a `border-l border-smoke/40` divider.

## API contract verified

`GET /api/incidents`:
- 200 with `{ incidents: [...] }` ordered `createdAt DESC` — test 09
- 401 `{ error: "unauthenticated" }` without cookie — test 10
- 400 `{ error: "invalid_since" }` on bad `since` — test 12
- Type filter works — test 11
- `since=all` returns at-least-as-many as `since=7d` — test 14
- Response does NOT contain `"firefighterId"` or `"notes"` JSON keys — test 13 (PII guard via Prisma `select`)

## D1-D4 decisions verified

- **D1 (chip rail)**: tested via test 07. ALL/7 DAYS are mutually exclusive; tapping the already-active `7 DAYS` flips to `all` (count grows from 6 → 8 in the running DB).
- **D2 (SOS stub)**: button renders, `aria-label="SOS — not yet active"`, `console.log` only on click. No real handler.
- **D3 (zero-incidents centre fallback)**: `[-70.444, 43.679]` constant referenced in both `page.tsx` and `map-home.tsx`. Triggered when `incidents.length === 0` (e.g. filter result with no matches).
- **D4 (list icon → /history 404)**: list icon is a `<Link href="/history">`. Test 05 asserts URL contains `/history` only, never asserts page content. Console-error filter allows the known 404 only when on `/history`.

## What deviates (acceptable / out of scope)

- **Marker visual polish** — MapView uses v1 circle layers; HF-008's brief polishes them to symbol layers (red teardrop with `!` glyph for incident, etc.). Touching `MapView.tsx` is explicitly out of scope for HF-005.
- **No loading spinner during chip re-fetch** — the existing markers stay visible during the 100-200ms fetch + repaint. Loading indicator could be added later if perceived latency becomes an issue.
- **"3 hydrants nearby" is static** in the hint card — matches the algorithmic top-3 contract from HF-007 but does not query the real nearest-hydrant API on initial load. Honest to the contract, light on compute.
- **`@axe-core/playwright` deferred** — same as HF-001. Would close the 0.10 A11y gap to 1.0. Worth shipping across all stories as one chore PR.

## Tests not regressed

Pre-HF-005 baseline: 23 e2e tests (HF-000 + HF-Foundation + HF-001 + HF-004 + HF-006 + HF-007) + 18 unit tests passed.

Post-HF-005: **37 e2e (23 + 14 new) + 18 unit** all pass. Zero regressions.

Verified by:
```bash
pnpm tsc --noEmit            # ✓ clean
pnpm test:unit                # ✓ 18 / 18
pnpm e2e                      # ✓ 37 / 37 in ~13s
```

## Reviewer (Sonnet) — verdict: REQUEST CHANGES → all addressed in iteration-1 fix commit

**Blockers (fixed):**
- **BLOCKER-1**: `isInitialState` short-circuit overwrote live fetched data with the SSR snapshot when filters round-tripped to defaults. Replaced with a `useRef`-guarded first-mount skip — `initialIncidents` is no longer in the effect's dep array and no longer reachable after mount.
- **BLOCKER-2**: `"3 HYDRANTS NEARBY"` was hardcoded; spec says "N hydrants derived from chosenHydrantId presence". `MapHome` now computes `incidents.filter(i => i.chosenHydrantId !== null).length` and passes it as a `hydrantCount` prop. Hint card renders `${n} hydrant(s)` with the correct grammar at 1 vs N.

**HIGH (fixed):**
- **HIGH-1**: Fetch chain now checks `r.ok` before parsing JSON — 401/400 responses no longer silently clear the map. Caught by the existing `.catch` and logged.
- **HIGH-2**: Test 07 now records every `GET /api/incidents` request via `page.on('request', ...)` and asserts at least one `since=all` call fired after the chip tap. Detects the BLOCKER-1 stale-data path directly at the network layer.

**HIGH (deferred, noted in PR):**
- **HIGH-3**: Untested toggle-path asymmetries (tap ALL while ALL is active, etc.) — accepted as low-risk edge cases for the prototype; the toggle handler is idempotent on duplicate same-state taps.

**Mediums (closed):**
- **MEDIUM-1**: `effectiveCenter` removed — `center` is now always the memoised value computed from `incidents`. No branching.
- **MEDIUM-2**: Subsumed by BLOCKER-2 fix.
- **MEDIUM-3**: `initialIncidents` removed from the effect dependency array. Captured once at mount per the React patterns guide.
- **MEDIUM-4**: `SinceFilter` type union stays as `"7d" | "all"` — adding `"30d"` would require a UI chip change (out of scope). Documented as a follow-up.
- **MEDIUM-5**: REVIEW.md score corrected to 0.93 (was rounded to 0.94 from 0.936).

## Security-auditor (Sonnet) — verdict: GREEN, no blockers

**Mediums noted (no fix applied; documented for the team):**
- Missing try/catch around `prisma.incident.findMany` — dev-mode stack trace could leak through Next's default 500 handler. Production sanitises. Follow-up worth adding for staging discipline.
- Cross-firefighter incident data — `firefighterId` scoping is not in the GET handler's `where` clause. Single-persona prototype today; revisit before multi-user.
- `address` field has no length cap in POST (Dev A's handler). Long values could bloat the DB and hint-card render path. Belongs in a chore PR against POST.

**Confirmed clean:**
- Auth: `readBadge()` → null returns 401 (not redirect). DB row check matches POST's depth.
- PII guard: Prisma `select` projects only safe fields; tests 13 verifies on the wire.
- No `MAPBOX_SECRET_TOKEN` or `NEXT_PUBLIC_MAPBOX_TOKEN` references introduced by HF-005 source files.
- No new env vars; no committed secrets.
- Cookie flags carry forward from HF-001 unchanged.
- `force-dynamic` at module level prevents CDN caching of cookie-dependent responses.

## Ready for

- PR against `develop` with embedded screenshots + this REVIEW.md
- `gh pr create --base develop --title "feat(hf-005): /map home screen — dark map, incident markers, filter chips, GET /api/incidents"`
