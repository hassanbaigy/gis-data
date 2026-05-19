# HF-010 — Tablet breakpoint pass

## Story

As a firefighter using the truck-mounted tablet, I want the marquee screens to re-flow into a split dispatch-rail layout when the viewport is ≥900px wide, so that the map gets more real estate and the bottom-sheet info is always visible on the side.

## Acceptance criteria

- A single Tailwind `lg:` breakpoint at `min-width: 900px` triggers a 440px left rail + remaining width map split on `/map`, `/map/incident/[id]`, and `/history`.
- No component is forked — every change is a Tailwind utility class on existing markup. If a component cannot be re-flowed without forking, the PR notes that and proposes the smallest possible structural change.
- The bottom sheet on each of those three screens becomes the static left rail at the breakpoint (no drag handle, no overlay).
- Top bar elements (badge plate, SOS) stay in the same absolute corners.
- Phone layout (< 900px) is byte-identical to before this story — i.e. existing Playwright specs at phone viewport still pass without any modification.
- A new Playwright spec at the tablet viewport (1024×768) drives the same flows as the HF-005 / HF-008 / HF-009 specs and asserts the rail layout via screenshot diff.

## Out of scope

- `/login` — single column on all sizes per design.
- `/map/new` — form is single-column on tablet too.
- `src/components/MapView.tsx` — must not be edited; any flex-row container-sizing fix must be handled at the consumer level (see AD2).
- Drag-to-collapse behaviour on the rail (already deferred from HF-008/HF-009).
- Tablet portrait orientation — the new spec and visual target are 1024×768 landscape only.
- Any existing component: `BadgePlate`, `SosButton`, `FilterChips`, `HintCard`, `BottomSheet`, `ActiveTimerPill`, `HydrantCard`, `HydrantsModal`, `_hydrant-format.ts`, `TimeFilterChips`, `TypeFilterChips`, `IncidentRow`.

## Visual reference

Source: `.claude/agent-context/prompt.html` — spec card titled "TABLET (LANDSCAPE)" at `@media (min-width:900px)`.

Key details from the spec card:
- **Layout**: 440px-wide dispatch rail on the left, map fills the remaining width on the right.
- Same components as phone — only re-flowed via a single Tailwind `lg:` breakpoint; no screen forks.
- Top-bar elements (BadgePlate top-left, SOS top-right) remain in the same absolute corners at 16px inset.
- The bottom sheet on each screen becomes the static left rail (no overlay, no drag handle visible).

## Architectural decisions

### AD1 — Breakpoint mechanism

The AC specifies the split layout must trigger at `min-width: 900px`. Tailwind v4's default `--breakpoint-lg` is 1024px.

- **Option A (recommended)**: override `--breakpoint-lg: 900px` in `globals.css @theme inline`. Planner ran `grep -r "lg:" src/` and confirmed **zero existing usages** — the override is collateral-free. The `lg:` prefix is idiomatic Tailwind and self-documenting.
- **Option B**: add `--breakpoint-tablet: 900px` and use a `tablet:` prefix. Explicit separation, but a new convention to remember; sets a precedent for story-specific tokens.

**Recommendation: Option A.** Lead re-verifies the grep result at the start of Step B before committing the override.

### AD2 — Mapbox container row-flex `minWidth: 0`

When `<main>` changes from `flex-col` to `lg:flex-row`, MapView's flex item needs `minWidth: 0` to prevent the horizontal container-sizing race (analogue of the existing `minHeight: 0` fix for column-flex). `MapView.tsx` line 491 sets `style={className ? undefined : { width: "100%", height: "100%", minHeight: 0 }}` — **no `minWidth: 0`**, and touching the shared file is out of scope.

- **Option A (recommended)**: wrap each MapView consumer in `<div className="relative flex-1" style={{ minWidth: 0, minHeight: 0 }}>`. Adds the `minWidth: 0` at the consumer level; keeps `MapView.tsx` untouched.
- **Option B**: add `minWidth: 0` to MapView's inline style. Out of scope — do not choose.

**Recommendation: Option A.** One extra `<div>` wrapper per consumer is cheap and respects the file-ownership boundary.

### AD3 — Playwright default viewport

The existing 59 tests run at `devices["Desktop Chrome"]` (1280×720). With `lg:` at 900px (AD1 Option A), those tests would run AT the breakpoint and see the rail layout — breaking phone-layout structural assertions throughout HF-005/HF-008/HF-009.

- **Option A (recommended)**: change `playwright.config.ts` `projects[0].use` to `{ viewport: { width: 390, height: 844 } }` (phone dimensions without the `iPhone 13` device preset, to avoid `isMobile` / mobile-UA side effects). New HF-010 spec sets `test.use({ viewport: { width: 1024, height: 768 } })` at the file level.
- **Option B**: leave the config alone; add `test.use(...)` to every existing spec. Many file changes, higher diff noise.

**Recommendation: Option A.** One-line change to `playwright.config.ts`; zero changes to existing specs.

## Files in scope

| File | Change | Summary |
|---|---|---|
| `src/app/globals.css` | MODIFY | Add `--breakpoint-lg: 900px` to `@theme inline` (one line; AD1 A) |
| `src/app/map/map-home.tsx` | MODIFY | `<main>` gains `lg:flex-row`; rail `<aside>` (`hidden lg:flex`) carries hint card + filter chips at lg; MapView consumer wrapper gets `minWidth: 0, minHeight: 0` (AD2) |
| `src/app/map/incident/[id]/incident-view.tsx` | MODIFY | `<main>` gains `lg:flex-row`; pass `className="lg:relative lg:inset-auto lg:w-[440px] lg:flex-shrink-0 lg:rounded-none lg:shadow-none"` to `<BottomSheet>`; MapView consumer wrapper gets `minWidth: 0, minHeight: 0` |
| `src/app/history/history-view.tsx` | MODIFY | `<main>` gains `lg:flex-row`; list `<section>` gains `lg:w-[440px] lg:flex-shrink-0 lg:border-t-0 lg:border-r`; map section gets consumer wrapper with `minWidth: 0, minHeight: 0` |
| `playwright.config.ts` | MODIFY | Default viewport → `{ width: 390, height: 844 }` (AD3 A) |
| `tests/e2e/hf-010-tablet.spec.ts` | NEW | Failing-first; `test.use({ viewport: { width: 1024, height: 768 } })` at file level |
| `STORY.md` | NEW | This file |
| `.claude-resume.md` | NEW | Live state tracker (gitignored) |

## Files NOT in scope (DO NOT TOUCH)

- `prisma/**`
- `src/lib/**` (auth, db, geo, hydrants, mapbox)
- `src/app/api/**`
- `src/app/login/**`, `src/app/page.tsx`
- `src/app/dev/**`
- `src/app/map/layout.tsx`, `src/app/history/layout.tsx` (auth gates)
- `src/app/map/page.tsx`, `src/app/history/page.tsx` (server components)
- `src/app/map/new/**` (out of scope per AC)
- `src/app/map/incident/[id]/page.tsx` (server passthrough)
- `src/components/MapView.tsx` — handle `minWidth: 0` at consumer level (AD2)
- `src/components/BottomSheet.tsx` — override via `className` prop, no fork
- All other existing components (full list in handoff L266-275)

## AC → Playwright test map

Spec at `tests/e2e/hf-010-tablet.spec.ts` with `test.use({ viewport: { width: 1024, height: 768 } })` at file level. `loginInContext(context)` in `beforeEach`.

| ID | AC bullet | Assertion |
|---|---|---|
| T01 | `/map` rail split | Rail `boundingBox().width` ≈ 440px (±8); map section `boundingBox().x` ≈ 440 |
| T02 | `/map/incident/[id]` bottom-sheet → rail | `section[aria-label="Nearest hydrants results"]` `boundingBox().width` ≈ 440px, `x` === 0 |
| T03 | `/history` list → rail | `section[aria-label="Incident history"]` `boundingBox().width` ≈ 440px, `x` === 0 |
| T04 | Phone layout unchanged | `test.use({ viewport: { width: 390, height: 844 } })` local override; assert map full width, hint card visible, no rail |
| T05 | Top-bar corners preserved | `BadgePlate` `x` ≤ 24; `SosButton` `x + width` ≥ 1000 |
| T06 | Map markers render at tablet | `data-status="ready"` + `data-marker-count` ≥ 6 on `/map`, ≥ 2 on incident view (confirms AD2 fix) |
| T07 | Flows still work at tablet | (a) `/map` tap `+ New Incident` → `/map/new`. (b) `/history` tap first row → `/map/incident/...` |

Note for T04: do NOT pixel-diff against HF-005 baseline screenshots (taken at 1280×720). Use structural assertions instead.

## Task list

### Step A — Failing-first spec
- Agent: test-writer
- Touches: `tests/e2e/hf-010-tablet.spec.ts`
- Commit: `test(e2e): add failing spec for hf-010-tablet`

### Step B — Breakpoint + viewport baseline
- Agent: Lead
- Touches: `src/app/globals.css` (`--breakpoint-lg: 900px`), `playwright.config.ts` (default viewport → `{ width: 390, height: 844 }`)
- Before committing: Lead re-runs `grep -r "lg:" src/` to confirm Option A is still safe.
- Verify: full 59-test suite still passes at the new phone-default viewport. If any fail, those tests have hardcoded viewport assumptions — fix those test bugs.
- Commit: `chore(playwright): default to phone viewport; add lg: 900px breakpoint`

### Step C — `/map` rail layout
- Agent: Lead
- Touches: `src/app/map/map-home.tsx`
- Verify: T01, T05 pass

### Step D — `/map/incident/[id]` rail layout
- Agent: Lead
- Touches: `src/app/map/incident/[id]/incident-view.tsx`
- Verify: T02, T06 (incident variant) pass

### Step E — `/history` rail layout
- Agent: Lead
- Touches: `src/app/history/history-view.tsx`
- Verify: T03, T07 (history variant) pass

### Step F — Click-through + REVIEW.md
- Agent: Lead
- Touches: `tests/screenshots/hf-010-tablet/*.png` + `tests/screenshots/hf-010-tablet/REVIEW.md`
- Commit: `chore(hf-010): click-through screenshots + REVIEW.md (confidence X.XX)`

### Step G — Reviewer + PR
- Agent: `reviewer` (mandatory); `security-auditor` SKIPPED (pure layout pass)
- PR: `gh pr create --base develop --title "feat(hf-010): tablet breakpoint split-rail layout"`

## Confidence rubric

| Dimension | Weight | Notes |
|---|---|---|
| Functional | 0.30 | All T01–T07 pass; full 59 + N HF-010 tests green at both viewports |
| Visual | 0.25 | Rail 440px; map fills remainder; top-bar corners preserved; matches `prompt.html` tablet card |
| Interaction | 0.15 | Footer CTAs tappable; filter chips work in rail; navigation flows intact |
| Robustness | 0.15 | Phone viewport unchanged; no Mapbox sizing regression at row-flex |
| A11y | 0.10 | Rail `aria-label`; no new a11y regressions |
| Console | 0.05 | No new errors at either viewport |

**Gate: 0.85. Max 5 iterations.** Visual is the dominant dimension — iterate if the rail looks wrong before scoring.

## Definition of done

- All HF-010 tests pass at 1024×768.
- All 59 pre-existing tests still pass at the new 390×844 phone-default viewport.
- `REVIEW.md` confidence ≥ 0.85.
- `reviewer` signed off.
- PR opened against `develop` with embedded screenshots + REVIEW.md.
- `STORY.md` + `.claude-resume.md` at worktree root.

## Decisions (signed off by user 2026-05-19)

**D1 — Breakpoint mechanism** (Q1=A)
Override `--breakpoint-lg: 900px` in `src/app/globals.css @theme inline`. Planner confirmed zero existing `lg:` usages via `grep -r "lg:" src/` — no collateral. The standard `lg:` Tailwind prefix is used throughout HF-010; any future stories' `lg:` classes also trigger at 900px (consistent project-wide breakpoint). If someone later adds a real desktop breakpoint (e.g. ≥ 1280px), they should add a new token (`--breakpoint-xl` or similar) rather than redefining `lg:`.

**D2 — Mapbox row-flex `minWidth: 0` handling** (Q2=A)
Each MapView consumer (`map-home.tsx`, `incident-view.tsx`, `history-view.tsx`) wraps the existing map slot in `<div className="relative flex-1" style={{ minWidth: 0, minHeight: 0 }}>`. `MapView.tsx` is NOT touched. This is the smallest possible change that respects the shared-file boundary. If a future story needs `minWidth: 0` more broadly, that's a chore PR against `MapView.tsx` (would propagate to all consumers cleanly without breaking anything).

**D3 — Playwright default viewport** (Q3=A)
`playwright.config.ts` `projects[0].use` changes from `{ ...devices["Desktop Chrome"] }` to `{ viewport: { width: 390, height: 844 } }` — phone dimensions without the `iPhone 13` device preset (avoids `isMobile: true` and mobile user-agent side effects that some existing assertions might trip on). The new `tests/e2e/hf-010-tablet.spec.ts` sets `test.use({ viewport: { width: 1024, height: 768 } })` at the file level to override for tablet tests. Existing 59 tests continue to run at the phone viewport unchanged.

### Rollback / risk note

If Step B reveals an existing test that breaks at the phone viewport (e.g. one that hardcodes 1280-wide layout assumptions), the right fix is to update THAT test's assertions — not to revert D3. The "phone-byte-identical" AC means the rendered UI is the same; if a test was over-specified to a desktop-only layout, that was a test bug masked by the previous default.
