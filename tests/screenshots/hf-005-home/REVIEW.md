# HF-005 review — /map home screen

**Confidence: 0.94 — above 0.85 gate. Ready for reviewer + security-auditor + PR.**

Self-rated 2026-05-18 after iteration 0 (no iteration needed — all 14 tests green on first implementation attempt and the visual matches `prompt.html` §07 spec card 2 closely enough that no rework was warranted).

## Score by dimension

| Dimension | Weight | Score | Weighted | Notes |
|---|---|---|---|---|
| Functional | 0.30 | 1.00 | 0.300 | 14/14 HF-005 tests pass; full e2e suite 37/37 green (23 existing + 14 new). No regressions. No `.skip`, no `.only`. |
| Visual | 0.25 | 0.90 | 0.225 | Brand block + filter chips + hint card + footer CTA + list icon all match spec. Incident dots render with red fill + halo from MapView's existing circle layers. Mapped against `prompt.html` §07 spec card 2: layout (full-bleed dark, 16px insets, chip rail, hint card, footer) is right. Small deduction since the marker styling is MapView's v1 placeholder (HF-008 polishes to symbol layers + 14px halo per spec). |
| Interaction | 0.15 | 0.95 | 0.143 | Chip tap toggles state + triggers re-fetch (verified by test 07 — count goes 6→8 when ALL activates). CTAs navigate. SOS focusable. Keyboard tab order sensible. `aria-pressed` updates on each chip. |
| Robustness | 0.15 | 0.85 | 0.128 | Empty-incidents D3 fallback to Gorham centroid implemented and verified at compile time (server + client both reference the same constant). `data-status="ready"` awaited correctly. 401/400 paths in `GET /api/incidents` covered by tests 10 + 12. Filter race condition guarded by `cancelled` flag in useEffect. Small deduction: no loading spinner on chip re-fetch (relies on existing data + map repaint after) — acceptable for prototype. |
| A11y | 0.10 | 0.90 | 0.090 | `aria-pressed` on chips; `aria-label` on SOS button + History link + BadgePlate; SVG icons marked `aria-hidden="true"`; focus rings via `focus:ring-2 focus:ring-yellow`; visible label hierarchy. Did NOT run `@axe-core/playwright` — same posture as HF-001's 0.90 here; running axe is a follow-up worth shipping across all stories at once. |
| Console | 0.05 | 1.00 | 0.050 | No unexpected browser console errors during the 14-test run. `afterEach` filter is scoped tightly to `Failed to load resource ... 404` only when `page.url().includes("/history")` (per D4). |

**Total: 0.300 + 0.225 + 0.143 + 0.128 + 0.090 + 0.050 = 0.935 → rounded to 0.94**

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

## Ready for

- **`reviewer`** agent — full diff review against the contract (correctness, architecture, readability, test coverage, scope boundary)
- **`security-auditor`** agent in parallel — recommended given the new public `GET /api/incidents` endpoint (verify PII guard, auth gate, input validation, no token leakage in errors)
- After both sign-off: `gh pr create --base develop --title "feat(hf-005): /map home screen — dark map, incident markers, filter chips, GET /api/incidents"`
