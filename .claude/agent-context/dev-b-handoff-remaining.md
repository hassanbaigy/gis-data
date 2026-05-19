# Dev B onboarding — HF-005 → HF-008 → HF-009 → HF-010

Copy everything below the `---` line into Dev B's first Claude Code message in his clone of the repo. He should be on `develop` after PR #7 (auth wiring) is merged.

This document is meant to be **picked up cold tomorrow**. The agent reading it should be able to ship HF-005 without asking the user a single question that isn't already answered here.

---

You are Dev B's coordinating agent. Welcome back. Today you're going to ship the **four remaining stories** end to end. They share a workflow; you'll learn it once and apply it four times.

## What's already on `develop`

Everything below is merged and live:

| Story | What it shipped |
|---|---|
| HF-000 | Bootstrap (Next 16 + Tailwind v4 + Playwright + fonts + design tokens) |
| HF-Foundation | Prisma schema, 456 geocoded hydrants, badge-0418 firefighter, 6 sample incidents |
| HF-004 | `<MapView>` component (dark Mapbox map, 4 marker types, route polyline) |
| HF-007 | `POST /api/hydrants/nearest` (haversine → Mapbox Matrix → top 3 + 2 flagged OOS) |
| HF-006 | `/map/new` form, `/api/geocode`, `POST /api/incidents`, minimal `/map/incident/[id]` placeholder |
| HF-001 | Mock auth + `/login` (your previous PR) |
| chore #7 | `requireFirefighter()` wired into `/map/*` layout and all gated API routes; `tests/e2e/helpers/auth.ts` |

**The clickable flow that exists right now**: `/` → `/login` → submit badge `0418` + any 4-digit PIN → cookie → `/map` (404 — your job is HF-005) → `/map/new` → form → submit → `/map/incident/<id>` (minimal placeholder — polish is HF-008).

## What's left for you

Four stories, **in this order** (each depends on the previous):

| # | Story | What | Files you own |
|---|---|---|---|
| 1 | **HF-005** | `/map` home: dark map of past incidents + filter chips + "+ NEW INCIDENT" CTA | `src/app/map/page.tsx`, `src/app/api/incidents/route.ts` (GET handler), maybe `src/components/HintCard.tsx` |
| 2 | **HF-008** | Polish `/map/incident/[id]`: bottom-sheet, drag handle, active timer pill, `HydrantCard`, NAVIGATE CTA | `src/app/map/incident/[id]/incident-view.tsx`, new components under `src/components/` |
| 3 | **HF-009** | `/history`: filterable past incidents, time + type chips, list view | `src/app/history/page.tsx`, `src/app/history/history-view.tsx` |
| 4 | **HF-010** | Tablet breakpoint pass: split layout on `lg:` (≥900px) | small Tailwind utility additions on HF-005 / HF-008 / HF-009 pages |

You ship them as four separate PRs, each via the same loop.

## Before you write a line of code (read in order)

These are not suggestions:

1. **Workflow rules** — `.claude/agent-context/hydrant-finder-workflow.md` (full file). The 10-step loop every story follows.
2. **Visual references** —
   - `.claude/agent-context/index.html` — Screen 2 (HF-005), Screen 4 (HF-008), Screen 5 (HF-009)
   - `.claude/agent-context/prompt.html` §07 spec cards 2/4/5 + the tablet layout card
3. **Story AC** — `.claude/agent-context/user-stories.md`:
   - HF-005 lines 161-179
   - HF-008 lines 237-260
   - HF-009 lines 263-279
   - HF-010 lines 281-296
4. **Scaffold gotchas** — `.claude/agent-context/scaffold-state.md` (full file). Tailwind v4 `@theme`, Next 16 routing (underscore-prefix is private), Prisma + pnpm conventions, async `cookies()`, `redirect()` outside try/catch.
5. **Data layer** — `.claude/agent-context/data-layer.md` (full file). The DB you read from, the `incidentOwnerBadges` health endpoint, the geocoded snapshot file location.
6. **Mapbox patterns** — `.claude/agent-context/mapbox-server.md` (full file). Token rules, lng/lat order, Matrix vs Directions, `scrubTokens` pattern, **Mapbox REST APIs reject bearer auth** (use `access_token` query param).
7. **Mapbox client** — `.claude/agent-context/mapbox-integration.md` (full file). Native GL layers over HTML markers, container-sizing race fix (`minHeight: 0` + inline style), `style.load` vs `load` timing, attribute-surface test seam.
8. **TDD loop + worktree mechanics + resume protocol** — `.claude/skills/tdd-user-story/SKILL.md`, `worktree-parallel/SKILL.md`, `session-resume/SKILL.md` (full files each).
9. **Auth helper for tests** — `tests/e2e/helpers/auth.ts` (full file). `loginInContext(context)` for browser tests, `authedRequestContext(playwright)` for API tests. Use these instead of driving `/login` in every spec.

## Per-story loop (do this four times)

This is the same loop the workflow doc describes. Internalise it.

### Step 1 — Plan (always)

Create `STORY.md` at your worktree root with:
- Story statement
- AC bullets (paste verbatim from `user-stories.md`)
- Scope boundary (what you will NOT touch — paste from the table above)
- Visual reference link
- Task list (3-7 steps, each ≤ 1 hour of agent work)

**Show STORY.md to the user. Get a nod before writing production code.** A one-message "approve" reply is enough.

### Step 2 — Worktree

```bash
git fetch origin
STORY=hf-005-home   # or hf-008-results, hf-009-history, hf-010-tablet
git worktree add ../gis-data-$STORY -b feat/$STORY origin/develop
cd ../gis-data-$STORY

# Install + DB
nvm use            # or fnm/asdf — .nvmrc pins 20.18.1
pnpm install
cp .env.example .env.local     # paste your Mapbox tokens
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db seed             # 456 hydrants + badge 0418 firefighter + 6 incidents

# Port — 3000 on your machine is fine. Use 3001 only if Dev A is sharing.
pnpm dev
```

### Step 3 — Failing-first Playwright spec

Write `tests/e2e/hf-NNN-<slug>.spec.ts` that covers every AC. The spec MUST fail right now because the implementation doesn't exist. Run it once to prove failure. **Commit the failing spec.**

For browser tests: `beforeEach(async ({ context }) => { await loginInContext(context); })` — every `/map/*` route is gated, the cookie is non-optional.
For API tests: `const ctx = await authedRequestContext(playwright);` — saves dealing with `extraHTTPHeaders` boilerplate.
For the "is gated" assertion: do at least one test that creates a fresh `browser.newContext()` (no cookie) and asserts the redirect / 401.

Pattern reference: `tests/e2e/hf-006-new-incident.spec.ts` after the chore PR — copy its `beforeEach` + the two "all gated endpoints return 401" tests.

### Step 4 — Implement

Write the code. Stay within "files you own" from the table above. If you find yourself touching `src/lib/auth.ts`, `prisma/schema.prisma`, `src/lib/hydrants.ts`, or `src/lib/mapbox.ts`, **stop and ask the user** — those are shared and a chore PR usually exists to handle changes.

Always check the gotchas:
- **No `tailwind.config.ts`.** Tokens live in `src/app/globals.css` `@theme inline { ... }`. Existing tokens: `bg-black bg-red bg-yellow bg-paper font-display font-ui font-mono`. Add new tokens to `@theme` if you need them.
- **`next/font` variable pattern** is already set up in `src/app/layout.tsx`. Don't add more fonts.
- **Underscore-prefix folders** are private (not routable). Use `health/db`, not `_health/db`.
- **Mapbox container** needs explicit `style={{ width: "100%", height: "100%", minHeight: 0 }}` on the parent — `h-full` on a flex child races the Mapbox init. See `mapbox-integration.md`.
- **`requireFirefighter()` is your auth gate** for any new `/map/*` page or API route that hits Mapbox. For API routes that should return 401 (not redirect), use `readBadge()` instead.

### Step 5 — Click-through + screenshots

```bash
pnpm e2e:headed -- tests/e2e/hf-NNN-<slug>.spec.ts
```

Captures screenshots at key states. The spec should call `await page.screenshot({ path: "tests/screenshots/hf-NNN-<slug>/<step>.png" })` at every meaningful interaction (empty, loading, success, error). Save the most important ones to `tests/screenshots/baseline/` for future visual-regression.

### Step 6 — Confidence rubric

Write `tests/screenshots/hf-NNN-<slug>/REVIEW.md` with this table filled in:

| Dimension | Weight | Score | Notes |
|---|---|---|---|
| Functional | 0.30 | _ | Every AC bullet has a passing test |
| Visual | 0.25 | _ | Matches `index.html` Screen N within tolerance |
| Interaction | 0.15 | _ | Keyboard, focus, hover, tab order all work |
| Robustness | 0.15 | _ | Empty / loading / error states all handled |
| A11y | 0.10 | _ | Roles, labels, contrast, focus indicators |
| Console | 0.05 | _ | No errors during the spec run |

Weighted total = Σ(weight × score). **Gate is 0.85.** Be honest. If something feels rough, mark it 0.7 and iterate.

### Step 7 — Iterate

If < 0.85, fix the lowest-scoring dimension first. Re-run, re-score. **Cap at 5 iterations.** If you can't reach 0.85 in 5, surface to the user with the latest REVIEW.md attached and explain what's blocking.

### Step 8 — Reviewer (mandatory) + security-auditor (when applicable)

Spawn `reviewer` on the full diff:
```
git diff origin/develop...HEAD
```

Inject:
- `.claude/agent-context/hydrant-finder-workflow.md`
- your `STORY.md`
- the relevant `user-stories.md` AC range
- `scaffold-state.md`
- any other context the diff touches (data-layer.md, mapbox-server.md, etc.)

**Also spawn `security-auditor` if the diff touches**: auth helpers, cookies, secret tokens, any new route handler that hits external APIs. None of HF-005 / HF-008 / HF-009 / HF-010 should need security-auditor — the auth surface is closed by chore #7 — but run it if you add a new API route or modify an existing one.

### Step 9 — PR against `develop`

Title: `feat(hf-NNN): <one-line summary>`. Body must include:
- The story statement + AC paste (from STORY.md)
- The confidence rubric (from REVIEW.md)
- **Embedded screenshots** — drag the 3-5 most important PNGs into the PR comment so reviewers see them inline
- Test plan with `[x]` checkboxes
- Reviewer + security-auditor outputs

### Step 10 — Stop

**Open the PR and stop.** Do not merge. The user reviews and merges. Pull `develop`, remove worktree, start the next story.

```bash
# After merge
cd /Users/hassan/Development/gis-data
git fetch origin
git checkout develop && git pull origin develop
git worktree remove ../gis-data-hf-NNN-<slug>
git branch -D feat/hf-NNN-<slug>
```

## Story specs (the per-story details)

### Story 1: HF-005 — `/map` home

**Story**: As a firefighter on shift, I want to land on a dark map showing the last 7 days of incidents with one tap-away access to creating a new incident, so that I have situational awareness and can dispatch fast.

**Acceptance criteria** (full text: `user-stories.md` lines 161-179):
- `/map` is gated (already done — `src/app/map/layout.tsx` handles it)
- Full-bleed dark MapView, centred on average lat/lng of seeded incidents at zoom 12
- Past incidents (from `GET /api/incidents?since=7d`) render as red dots with translucent halo
- Top bar: badge plate (left, mono `"BADGE 0418"`), SOS button (right, 48×48, yellow border, yellow glyph)
- Filter chip rail: `"ALL · 6"`, `"7 DAYS"`, `"UNIT E-12"` (yellow active, smoke inactive)
- Bottom hint card: `"LAST INCIDENT · N HRS AGO"` mono, the most-recent incident's address (display), `"3 hydrants"` count
- Persistent footer: red `+ NEW INCIDENT` CTA (24px display) → `/map/new`, 64px list-icon button → `/history`
- `GET /api/incidents?since=7d&type=&unitId=` returns `{ incidents: [...] }` ordered `createdAt DESC`
- No console errors

**Visual reference**: `index.html` Screen 2, `prompt.html` §07 spec card 2.

**You will need a new API route**: `GET /api/incidents` (no `[id]`, the list endpoint). Implement it in the same file as `POST` — `src/app/api/incidents/route.ts` already exists, just add the `GET` handler. Gate with `readBadge()`. Filter by `since`, `type`, `unitId` query params. Return only fields the home page needs (use the same `select`-narrow pattern HF-007 established).

**Out of scope**: HF-008 polishes the results page (don't touch that), HF-009 is the history page (don't pre-build it), HF-010 handles tablet layout.

### Story 2: HF-008 — `/map/incident/[id]` polish

**Story**: As a firefighter who just submitted an incident, I want to see the three nearest hydrants ranked by driving time with a drawn route to #1, so that I can dispatch a hose line in seconds.

**Acceptance criteria** (full text: `user-stories.md` lines 237-260): the existing placeholder I built (`incident-view.tsx`) already wires the data. Your job is to polish the UI:
- Map centred on the incident, all 4 marker types rendering (already works)
- Top bar: pulsing red `ACTIVE · MM:SS` pill (timer counts up from `incident.createdAt`), SOS top-right
- **Replace the existing side panel with a bottom sheet** with drag handle, header `"NEAREST HYDRANTS · 3 of N"`
- Three `HydrantCard`s in the sheet: big rank digit, hydrant id (mono), address, distance (display), ETA (yellow mono). #1 has 1.5px yellow border + warmer bg. Cards for OOS hydrants get a red `OUT` chip.
- Polish the marker styling to match `prompt.html` §03: red teardrop with `!` glyph for incident, yellow halo + yellow fill for chosen, blue ring/dot for #2 and #3, grey X for OOS. The current circle-layer version is the v1 placeholder.
- Footer: red `NAVIGATE` CTA → opens `maps:?daddr=<lat>,<lng>` for #1. Secondary list-icon button → expanded hydrant modal (out of scope details for tomorrow — just open a modal showing the full list).
- Active timer keeps counting (`setInterval` 1s).

**Visual reference**: `index.html` Screen 4, `prompt.html` §07 spec card 4.

**Marker polish in MapView**: you'll need to add new layer types or swap circle layers for symbol layers with custom icons. Edit `src/components/MapView.tsx` (this is the one shared file you may touch for this story — note the change in your STORY.md and flag in the reviewer prompt). The native-GL-layers approach is the right one; just swap circle paint for icon-image or styled SVGs.

**Out of scope**: HF-009 (history), HF-010 (tablet).

### Story 3: HF-009 — `/history`

**Story**: As a firefighter or officer reviewing past calls, I want a filterable list of past incidents with the map view, so that I can re-open any incident's hydrant set.

**Acceptance criteria** (full text: `user-stories.md` lines 263-279):
- `/history` gated by `requireFirefighter()` (use the same `src/app/history/layout.tsx` pattern as `/map/layout.tsx`)
- Top half: MapView centred on the average incident lat/lng, incidents only (no hydrants)
- Filter pill bar: time (7D / 30D / ALL, single-select, default 7D); type (multi-select, 6 categories, `+N` chip overflow). Yellow active, smoke inactive.
- Filters re-query `GET /api/incidents?since=…&type=…`
- Bottom sheet lists incidents: time-ago label (mono), address (display), type + alarm chips, chevron right
- Tap a row → navigate to `/map/incident/[id]`

**Visual reference**: `index.html` Screen 5, `prompt.html` §07 spec card 5.

**Reuse**: the `GET /api/incidents` route handler from HF-005. The MapView component for the map. The Tailwind palette tokens. Don't fork a parallel list component — try to share a `<IncidentRow>` between this and the bottom hint card on `/map`.

**Out of scope**: HF-010 (tablet).

### Story 4: HF-010 — Tablet breakpoint pass

**Story**: As a firefighter using the truck-mounted tablet, I want the marquee screens to re-flow into a split dispatch-rail layout when the viewport is ≥900px wide.

**Acceptance criteria** (full text: `user-stories.md` lines 281-296):
- Tailwind `lg:` breakpoint at `min-width: 900px` triggers a **440px left rail + remaining width map** split on `/map`, `/map/incident/[id]`, and `/history`
- No component is forked — every change is utility classes on existing markup
- The bottom sheet on each of those screens becomes the static left rail at the breakpoint (no drag handle, no overlay)
- Top bar elements stay in the same absolute corners
- Phone layout (< 900px) is byte-identical to before
- New Playwright spec at tablet viewport (1024×768) drives the same flows as HF-005 / HF-008 / HF-009 specs and asserts the rail layout (screenshot diff)

**Visual reference**: `prompt.html` §07 last spec card ("TABLET (LANDSCAPE)").

**Out of scope**: `/login` (single column on all sizes per design). `/map/new` (single column on tablet too).

## File-ownership boundaries (every story)

You own:
- `src/app/map/page.tsx` (HF-005), `src/app/history/**`, `src/app/map/incident/[id]/incident-view.tsx`
- Any new `src/components/*.tsx` (HydrantCard, BottomSheet, FilterChips, etc.)
- `src/app/api/incidents/route.ts` GET handler (HF-005 only; POST is Dev A's)
- Your `tests/e2e/hf-NNN-<slug>.spec.ts` files
- Your `STORY.md` + `.claude-resume.md` at worktree root

Dev A's territory (do not touch — open an issue or a chore PR if you genuinely need a change):
- `prisma/**`
- `src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/geo.ts`, `src/lib/hydrants.ts`, `src/lib/mapbox.ts`
- `src/app/api/auth/**`, `src/app/api/health/**`, `src/app/api/geocode/**`, `src/app/api/hydrants/**`
- `src/app/api/incidents/route.ts` POST handler (`GET` is yours)
- `src/app/api/incidents/[id]/**`
- `src/app/login/**`, `src/app/page.tsx`
- `src/app/dev/**` (dev fixtures)
- `src/app/map/layout.tsx` (the auth gate)

**Special case for HF-008**: you may edit `src/components/MapView.tsx` to polish the marker styling. Note it in your STORY.md and the PR body so reviewers know the shared file was touched intentionally.

## Memory injection protocol (you are also Lead in this session)

You're running as a Lead agent. Before spawning any subagent (test-writer, frontend-designer, reviewer, security-auditor):

1. List `.claude/agent-context/` files relevant to the task.
2. Inject by reference (file path + line range), not paste — keep your prompts small.
3. End every subagent prompt with the mandatory acknowledgment block ("list which files you read").
4. End every subagent prompt with the context-pressure protocol so they hand off cleanly if they run low.

After every agent result, scan for novel gotchas worth capturing back into `.claude/agent-context/`. Examples this run: bottom-sheet drag-gesture quirks, `setInterval` cleanup on incident page unmount, Tailwind v4 container queries if you use them, etc.

## How to test the live flow as you build

After each story, the end-to-end clickable demo grows:

1. After HF-005: `/login` → sign in → `/map` (real map of past incidents) → `/map/new` (the form) → `/map/incident/[id]` (the placeholder you'll polish next)
2. After HF-008: same flow, but the results screen now matches the spec
3. After HF-009: add `/history` accessible from the home footer's list icon
4. After HF-010: try `?w=1024` or resize browser — three screens re-flow into rail layout

If at any step the flow breaks, fix it in your CURRENT story's worktree — don't open a chore PR to patch unrelated breakage unless the user asks.

## Resume on session restart

If your session ends mid-story, the next session's Lead will:
1. Read `.claude/state/active-stories.json` (root of the main repo)
2. Read your `<worktree>/STORY.md` and `<worktree>/.claude-resume.md`
3. Continue from "What's next" in your resume file

Keep `.claude-resume.md` current. Update it every meaningful commit / test pass / score change. The file is gitignored (per-machine).

## First thing to do, RIGHT NOW

1. Read the 9 context files above in order.
2. Echo back a brief acknowledgment listing the files you read and the **5 most important gotchas** you found.
3. Confirm chore PR #7 is merged to `develop` (run `git fetch && git log origin/develop --oneline | head -3` — you should see the chore commit).
4. Start HF-005: create the worktree, write `STORY.md`, show to user, get a one-message approval, then proceed.

Don't skip step 1. The whole system depends on context injection actually happening. If anything in this prompt contradicts a file you read, the file wins — flag the contradiction so we can fix this prompt.

You can ship all four stories in roughly the order:
- HF-005: 2-3 hours
- HF-008: 3-4 hours (marquee story; visual fidelity matters most here)
- HF-009: 1-2 hours
- HF-010: 1 hour

If you're moving faster than that and quality holds, great. If a story is fighting you, surface to the user — don't lower the confidence bar.
