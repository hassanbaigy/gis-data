# HF-001 — Mock auth + /login screen

## Story

As a firefighter, I want to log in with my 4-digit badge and 4-digit PIN, so that the rest of the app knows my unit and badge for incident records.

## Acceptance criteria

- Visiting `/login` renders: brand block (56px red square with flame glyph + "HYDRANT FINDER" in display), subtitle `"FDNY · v0.1 PROTO"` in mono fog colour, a 4-digit badge input (mono 22px) and a 4-cell PIN pad (yellow border on active cell), and a red `SIGN IN →` CTA with the spec'd shadow.
- Submitting any 4-digit badge + 4-digit PIN sets an http-only cookie `hf_badge=<badge>` and redirects to `/map`.
- Submitting fewer than 4 digits in either field disables the CTA (visibly: opacity 0.5, `aria-disabled="true"`).
- Visiting `/` with no cookie redirects to `/login`. Visiting `/` with the cookie redirects to `/map`.
- `lib/auth.ts` exports `requireBadge()` that reads the cookie in server components / route handlers and redirects to `/login` if missing.
- Playwright spec covers: empty state, partial entry (CTA disabled), valid 4+4 entry (redirect + cookie present), `/` redirect both directions.

## Out of scope

- Any real authentication (no password hashing, no bcrypt, no JWT, no NextAuth).
- Brute-force protection or rate limiting.
- Account creation or registration flow.
- Session expiry or token rotation.
- The `/map` screen itself — that is HF-005. Tests assert the URL changes to `/map`; they do NOT assert page content at `/map` (which 404s until HF-005 lands).
- The sign-out flow beyond an optional `/api/auth/sign-out` stub needed only if a Playwright test requires it.
- CSRF protection (prototype scope; noted in security-auditor output).
- Any UI beyond `/login` (the badge input and PIN pad). The "HYDRANT FINDER" brand block appears on `/login` per the visual reference; `src/app/page.tsx` becomes a pure redirect gate with no rendered UI.

**This is a mock. Any 4-digit badge + any 4-digit PIN is accepted. No validation against a pre-existing credential list.**

## Visual reference

- Canonical mock: `.claude/agent-context/index.html`, artboard `id="login"` — "1 · Login" (Screen 1 of the end-to-end flow section).
- Field-level spec: `.claude/agent-context/prompt.html` §07, spec card 1 (LOGIN, `/login`).

### Key spec details from §07 card 1

| Element | Spec |
|---|---|
| Layout | Centered single column, 24px gutters. |
| Brand block | 56px red (`#E11D29`) square with flame glyph. "HYDRANT FINDER" in `font-display` (Barlow Condensed 800). |
| Subtitle | `"FDNY · v0.1 PROTO"` in `font-mono` (JetBrains Mono), fog colour (`text-paper/40` or equivalent). |
| Badge input | Mono 22px (`font-mono text-[22px]`), 4 digits, single text input. |
| PIN pad | 4 individual cells. Active cell: yellow border (`border-yellow`, `#FCD34D`). Inactive cells: muted border. |
| CTA | "SIGN IN →" in red (`bg-red`, `#E11D29`), box-shadow `0 8px 32px rgba(225,29,41,0.35)`. |
| CTA disabled | `opacity-50`, `aria-disabled="true"` when badge or PIN has fewer than 4 digits. |

Design tokens available from `src/app/globals.css` `@theme` block: `--color-black`, `--color-red`, `--color-yellow`, `--color-paper`, `--font-display`, `--font-ui`, `--font-mono`. Do NOT add `tailwind.config.ts` — this is Tailwind v4; tokens live in the CSS `@theme inline` block only.

## Files in scope

Files Dev B owns for this story:

| File | Status | Notes |
|---|---|---|
| `src/app/login/page.tsx` | New | The `/login` screen. Server component shell + `'use client'` child for PIN focus state machine. |
| `src/app/page.tsx` | Replace | Swap the HF-000 wordmark placeholder for a pure redirect gate: no cookie → `/login`, cookie present → `/map`. |
| `src/lib/auth.ts` | New | Exports `requireBadge()` and `requireFirefighter()` (reads `hf_badge` cookie, Prisma lookup, redirects to `/login` if absent). Also exports `signIn(badge, pin)` helper called by the route handler. |
| `src/app/api/auth/sign-in/route.ts` | New | POST handler: validates badge + PIN are 4 digits each, upserts `Firefighter` row, sets `hf_badge` httpOnly cookie, returns `{ ok: true }` JSON (client navigates to `/map`). |
| `src/app/api/auth/sign-out/route.ts` | Optional | POST handler: deletes `hf_badge` cookie, returns `{ ok: true }`. Include only if a Playwright test needs it to reset state between runs. |
| `tests/e2e/hf-001-login.spec.ts` | New | Failing-first Playwright spec. Committed before any implementation. |
| `STORY.md` | New | This file. |
| `.claude-resume.md` | New | Live working state. Gitignored. Update after every meaningful commit. |

## Files NOT in scope (DO NOT TOUCH)

| File / Path | Owner | Reason |
|---|---|---|
| `src/app/api/health/db/route.ts` | HF-Foundation | Diagnostic route. Must not be altered. |
| `prisma/**` | Dev A / HF-Foundation | Schema and migrations are frozen for this story. No new tables, no new columns. |
| `src/app/api/hydrants/**` | Dev A | HF-007 territory. |
| `src/components/MapView.tsx` | Dev A | HF-004 territory. |
| `src/app/(map)/**` or `src/app/map/**` | Dev A / HF-005 | `/map` does not exist yet. Do not create it. |
| `src/app/layout.tsx` | HF-Foundation | Fonts and global CSS wiring are correct; no changes needed. |
| `src/app/globals.css` | HF-Foundation | All needed tokens already registered. Do not add `tailwind.config.ts`. |

## AC → Playwright test map

All tests live in `tests/e2e/hf-001-login.spec.ts`. Screenshots land under `tests/screenshots/hf-001-login/`.

### `test.describe("HF-001 /login screen")`

| AC | `test(...)` block name | Screenshot artefact(s) |
|---|---|---|
| Brand block, subtitle, inputs, CTA all render on `/login` | `"renders brand block, badge input, PIN pad, and SIGN IN CTA"` | `01-login-empty-state.png` |
| CTA disabled when badge < 4 digits (opacity 0.5, aria-disabled) | `"disables CTA when badge has fewer than 4 digits"` | `02-partial-badge-cta-disabled.png` |
| CTA disabled when PIN < 4 cells filled (opacity 0.5, aria-disabled) | `"disables CTA when PIN has fewer than 4 cells filled"` | `03-partial-pin-cta-disabled.png` |
| Valid 4+4 → POST → `hf_badge` cookie set → redirect to `/map` | `"valid 4+4 submission sets hf_badge cookie and navigates to /map"` | `04-post-redirect-to-map.png` |
| `/` with no cookie → redirect to `/login` | `"/ with no cookie redirects to /login"` | `05-root-no-cookie-redirect.png` |
| `/` with `hf_badge` cookie → redirect to `/map` | `"/ with hf_badge cookie redirects to /map"` | `06-root-with-cookie-redirect.png` |
| `lib/auth.ts` `requireBadge()` redirects to `/login` when cookie absent | Covered by the `/` no-cookie test — `requireBadge()` is the mechanism producing that redirect. No separate test block needed unless a stub protected route is added. | — |

### Test implementation notes

- Collect `page.on("console", msg => ...)` errors in every test block; assert `consoleErrors` is empty at the end (mirrors `hf-000-smoke.spec.ts` pattern).
- The valid-submission test (`04`) must assert `expect(page.url()).toContain("/map")` — NOT assert page content, because `/map` 404s until HF-005. It must also assert the `hf_badge` cookie is present in the browser context after navigation.
- Tests `05` and `06` must clear all cookies before each run (`await context.clearCookies()` in a `beforeEach`) to avoid state bleed between CI runs.
- The PIN pad test (`03`) should fill all 4 badge digits first (so badge is valid), then assert CTA is disabled until the 4th PIN cell is filled — tests the PIN-side disable logic in isolation.
- Use ARIA roles and visible text for all assertions (`getByRole`, `getByText`, `getByLabel`) — no CSS class name assertions.
- Do NOT use `page.waitForNavigation()` (deprecated); use `await page.waitForURL(...)` instead.

### Sign-out helper (if needed)

If tests `05`/`06` cannot use `context.clearCookies()` reliably (e.g. httpOnly cookies are not cleared by Playwright's `clearCookies`), add a minimal `POST /api/auth/sign-out` that calls `(await cookies()).delete('hf_badge')` and include it as an optional file in scope. The Playwright spec can then call `await request.post('/api/auth/sign-out')` as a teardown step.

## Task list

Steps map to the 10-step loop in `.claude/skills/tdd-user-story/SKILL.md`.

### Step 1 — Plan (loop step 1)
- Deliverable: this `STORY.md`. User signs off before any code is written.
- Touches: `STORY.md` (new)
- Agent: planner
- Commit: `docs(hf-001): add STORY.md — mock auth + login screen`

### Step 2 — Test first / failing spec (loop step 3)
- Write `tests/e2e/hf-001-login.spec.ts` covering all 6 test blocks above.
- Run `pnpm e2e` — it MUST fail at this point (routes do not exist yet).
- Agent: test-writer
- Touches: `tests/e2e/hf-001-login.spec.ts` (new), `tests/screenshots/hf-001-login/` directory (create empty)
- Commit: `test(e2e): add failing spec for hf-001-login`
- Note: inject `STORY.md`, `user-stories.md` L75-91, and `scaffold-state.md` into the test-writer prompt. End the prompt with the context-pressure paragraph.

### Step 3 — Implement auth helpers and API routes (loop step 4, part A)
- Write `src/lib/auth.ts`: `requireBadge()` (awaits `cookies()`, reads `hf_badge`, redirects to `/login` if absent), `requireFirefighter()` (calls `prisma.firefighter.findUnique` by badge, upserts if missing), `signIn(badge, pin)` (upserts `Firefighter`, sets cookie).
- Write `src/app/api/auth/sign-in/route.ts`: POST handler calling `signIn(badge, pin)`, returning `{ ok: true }`.
- Replace `src/app/page.tsx`: async server component that awaits `cookies()` and calls `redirect('/login')` or `redirect('/map')` — `redirect()` must be called OUTSIDE any try/catch.
- Agent: Lead (or frontend-designer with auth context injected)
- Touches: `src/lib/auth.ts` (new), `src/app/api/auth/sign-in/route.ts` (new), `src/app/page.tsx` (replace)
- Commit: `feat(hf-001): add auth helpers, sign-in route, and root redirect gate`
- Critical: use `await cookies()` — Next 16 `cookies()` is async. Calling it synchronously returns a Promise, not the cookie store.
- Critical: call `redirect()` outside any `try/catch` block — `redirect()` throws internally; swallowing the throw inside catch silences the redirect.

### Step 4 — Implement /login screen (loop step 4, part B)
- Write `src/app/login/page.tsx`: server component shell with a `'use client'` child component for the PIN cell focus state machine. Match the visual reference exactly: brand block (56px red square, flame glyph, "HYDRANT FINDER" `font-display`), subtitle (`font-mono text-paper/40`), badge input (`font-mono text-[22px]`), 4-cell PIN pad (yellow border on active cell), red "SIGN IN →" CTA (`bg-red`, shadow `0 8px 32px rgba(225,29,41,0.35)`), CTA disabled state (`opacity-50 aria-disabled="true"`).
- Agent: frontend-designer
- Touches: `src/app/login/page.tsx` (new)
- Commit: `feat(hf-001): add /login screen — brand block, PIN pad, SIGN IN CTA`
- Note: inject `STORY.md`, `scaffold-state.md`, `prompt.html` §07 card 1, and the design token list from `globals.css` into the frontend-designer prompt.

### Step 5 — Click-through, score, iterate (loop steps 5-7)
- Run `pnpm e2e:headed -- tests/e2e/hf-001-login.spec.ts` with `PW_BASE_URL=http://localhost:3001`.
- Read each screenshot via the Read tool. Write `tests/screenshots/hf-001-login/REVIEW.md` with the 6-dimension rubric scores.
- If confidence < 0.85, fix lowest-scoring dimension and repeat. Max 5 iterations.
- Agent: Lead (reads screenshots, scores, iterates)
- Touches: `tests/screenshots/hf-001-login/*.png` (generated), `tests/screenshots/hf-001-login/REVIEW.md` (new)
- Commit (after gate passed): `chore(hf-001): add click-through screenshots and REVIEW.md (confidence X.XX)`

### Step 6 — Review and PR (loop steps 8-9)
- Spawn `reviewer` on `git diff origin/develop...HEAD`. Inject `hydrant-finder-workflow.md`, `STORY.md`, `user-stories.md` L75-91, `scaffold-state.md`.
- Spawn `security-auditor` in parallel (diff touches auth + cookies + public POST endpoint). Audit: cookie flags, CSRF posture, PIN not logged or stored.
- Open PR: `gh pr create --base develop --title "feat(hf-001): mock auth + /login screen"`. Body includes AC paste, REVIEW.md confidence rubric, embedded screenshots, test plan, reviewer + security-auditor outputs.
- Agent: reviewer, security-auditor (parallel), Lead (PR)
- Commit: n/a (PR opened, not merged by Dev B)

## Confidence-rubric reminder

Self-rate before requesting review. Score = Σ(dimension × weight). **Gate is 0.85. Max 5 iterations before escalating to user.**

| Dimension | Weight | What 1.0 looks like |
|---|---|---|
| **Functional** | 0.30 | All 6 `test(...)` blocks pass; no `.skip`, no `.only` |
| **Visual** | 0.25 | Side-by-side screenshot vs. `prompt.html` §07 card 1: brand block placement, colours, typography, shadow all match |
| **Interaction** | 0.15 | PIN cell focus advances correctly; badge input accepts only digits; CTA enables exactly at 4+4; keyboard Tab order sensible |
| **Robustness** | 0.15 | Partial entry, empty state, network error on POST all render correctly without crash |
| **A11y** | 0.10 | `@axe-core/playwright` reports zero serious/critical violations; all inputs have visible labels or `aria-label` |
| **Console** | 0.05 | No browser console errors or warnings during any test |

Write scores to `tests/screenshots/hf-001-login/REVIEW.md` in the table format specified in `tdd-user-story/SKILL.md`.

## Definition of done

- `pnpm e2e` passes with all 6 `hf-001-login` test blocks green and no skipped tests.
- Confidence score in `REVIEW.md` is **≥ 0.85**.
- `reviewer` has signed off (no blocking findings).
- `security-auditor` has signed off (cookie flags acceptable for prototype scope; PIN not logged or stored; audit notes are attached to PR).
- PR is open against `develop` (NOT `main`) with title `feat(hf-001): mock auth + /login screen`.
- `.claude-resume.md` is updated to reflect "done — PR open, awaiting user merge".

## Decisions (signed off by user 2026-05-17)

**D1 — Cookie flags** (Q1=Proposed): `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure: process.env.NODE_ENV === 'production'`. In dev (`http://localhost`), `secure` is false so the browser accepts the cookie; in production it flips to true.

**D2 — Cookie lifetime** (Q2=Proposed): 8-hour persistent cookie. `maxAge: 60 * 60 * 8` (28,800 seconds). Firefighters stay signed in across a shift; the cookie survives browser restarts within the 8-hour window.

**D3 — Sign-in response shape** (Q3=A): `POST /api/auth/sign-in` returns `{ ok: true }` JSON with HTTP 200 on success. Client component on `/login` calls `router.push('/map')` (or `router.replace('/map')`) after receiving the OK. Validation errors return `{ ok: false, error: '<message>' }` with HTTP 400. Server errors return `{ ok: false, error: 'server_error' }` with HTTP 500.

**D4 — Authenticated user visits `/login`** (Q4=B): The page renders the form regardless of existing `hf_badge` cookie. Submitting a new 4+4 overwrites the cookie and signs the user in as the new badge (`hf_badge` is replaced via `cookies.set()`). This supports the field-testing case where two firefighters share a device. No special-case redirect on `/login`; only `/` and `requireBadge()`-protected routes gate on the cookie's presence.

### Implementation implications

- The `signIn(badge, pin)` helper must overwrite (not refuse) when a cookie already exists.
- The `/login` page does NOT call `requireBadge()` — it's an unauthenticated route that must always render.
- The Playwright spec for "already-authenticated user hits `/login`" is optional and not in the original AC; skipped unless you say otherwise.
- The `secure: process.env.NODE_ENV === 'production'` flag means the same code path works in dev (NODE_ENV=development) and production builds; no separate config branch.
