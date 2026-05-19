# Hydrant Finder — delivery workflow (Lead must read first)

Every user story in this repo ships through a fixed loop. **Lead injects this file at the start of every story-related task.**

## The fixed loop (TDD + Playwright + confidence gate)

1. **Plan** (`planner`) → `STORY.md` with story statement, AC, scope, visual ref. User signs off before code.
2. **Worktree** (Lead) → `git worktree add ../gis-data-<id> -b feat/<id> origin/develop`.
3. **Test first** (`test-writer`) → failing Playwright spec at `tests/e2e/<id>.spec.ts`, one per AC.
4. **Implement** (Lead or `frontend-designer`) → make the spec pass. Read `node_modules/next/dist/docs/` before any non-trivial Next.js code (this is Next 16.2.6, not your training data).
5. **Click-through** → `npm run e2e:headed` produces screenshots at `tests/screenshots/<id>/`.
6. **Score** → self-rate against the rubric (Functional 0.30 / Visual 0.25 / Interaction 0.15 / Robustness 0.15 / A11y 0.10 / Console 0.05). Gate is **0.85**.
7. **Iterate** if < 0.85, max 5 rounds, then escalate.
8. **Review** (`reviewer`, + `security-auditor` if auth/PII).
9. **PR** against `develop` (NOT `main`). Body includes STORY.md, REVIEW.md, embedded screenshots, test plan.
10. **Cleanup** — `git worktree remove`, delete branch, update `active-stories.json`.

Full spec: `.claude/skills/tdd-user-story/SKILL.md`.

## Worktrees are mandatory

- Every story gets its own worktree at `../gis-data-<id>`. No exceptions.
- Lead tracks all in-flight stories in `.claude/state/active-stories.json`.
- Subagents that edit code work IN their story's worktree. Read-only agents (scout, reviewer reading a diff) can stay in main.
- Port convention for parallel `npm run dev`: `3000 + last-2-digits-of-story-id`.

Full spec: `.claude/skills/worktree-parallel/SKILL.md`.

## Resume protocol (every session)

At the start of every Lead session, BEFORE responding to the user:

1. Read `.claude/state/active-stories.json`.
2. For each non-merged story, read `<worktree>/STORY.md` (contract) and `<worktree>/.claude-resume.md` (live state).
3. Surface in-flight stories to the user and ask which to continue.

Every subagent prompt MUST include the context-pressure paragraph so dying agents flush state to `.claude-resume.md` before returning.

Full spec: `.claude/skills/session-resume/SKILL.md`.

## Bootstrap state (run once, then check off)

- [ ] `develop` branch exists locally and on origin
- [ ] `@playwright/test` installed, `npx playwright install` run
- [ ] `playwright.config.ts` at repo root
- [ ] `tests/e2e/`, `tests/screenshots/baseline/` exist
- [ ] `.claude/state/active-stories.json` initialised to `{"stories": []}`
- [ ] `.gitignore` includes `.claude/state/` and `.claude-resume.md`
- [ ] `npm run e2e` / `e2e:headed` / `e2e:ui` scripts present

Until bootstrap is complete, the first story's plan MUST include these as setup tasks.

## Visual references

The product mocks live in `.claude/agent-context/`:

- `index.html` — the prototype shell (home + tile layout)
- `prompt.html` — the build prompt and visual reference for the whole app

When a story has a visual AC, the canonical source of truth is one of these two files — not screenshots in chat, not "what looks good".

## Hard rules (no exceptions)

- No PR without a passing Playwright spec.
- No PR with confidence < 0.85.
- No PR targeting `main` — always `develop`.
- No code changes outside a worktree.
- No subagent prompt without the context-pressure paragraph.
- No session start without running the resume protocol.

## Common gotchas across stories

### Playwright strict-mode + CSS-hidden DOM duplicates (HF-010)

When a screen has both a phone and a tablet variant that share the same text/aria-label, **prefer conditional rendering (`{isTablet ? <X> : null}`) over CSS-hidden duplicates (`hidden lg:flex`)**.

CSS-hidden elements stay in DOM. Playwright's `expect(getByText(/foo/i)).toBeVisible()` matches BOTH copies (strict-mode rule), and the assertion fails with "resolved to 2 elements". `.first()` / `.filter({ visible: true })` are bandaids — the real fix is to keep only one copy in DOM per viewport.

Trade-off: a brief phone→rail re-render flash on initial hydration at tablet (server renders the "phone" default `false`, `useEffect` resolves true after mount). Acceptable for a single-device prototype. Bigger apps would defer via `next/dynamic` + `ssr: false`.

When the screen has NO duplication risk (e.g. `/history` has a single `aria-label="Incident history"`), CSS-only flips (`lg:flex-row` + `lg:w-[440px]`) are still the cleaner choice — no hydration flash.

### Playwright default viewport when adding a Tailwind breakpoint (HF-010)

Adding ANY `lg:` (or new breakpoint) class to existing screens will silently change what existing specs see at the **default** Playwright viewport. Tailwind v4's `Desktop Chrome` default (1280×720) is above 1024px and 900px. The 59 HF-001/005/006/008/009 specs were written assuming phone-layout DOM.

Fix: switch `playwright.config.ts` `projects[0].use.viewport` to `{ width: 390, height: 844 }` (plain — NOT `devices["iPhone 13"]` which adds `isMobile: true` and mobile UA side effects). Per-spec tablet tests use `test.use({ viewport: { width: 1024, height: 768 } })` at file level. Zero changes to existing specs.

### Tailwind v4 `--breakpoint-*` overrides are token-level, not file-level (HF-010)

Tailwind v4 has no `tailwind.config.ts`. Breakpoints live in `globals.css` `@theme inline { --breakpoint-lg: 900px; }`. Override is collateral-free **only if there are zero existing usages of the prefix** — verify with `grep -r "lg:" src/` before overriding. If you need a true desktop step later, add `--breakpoint-xl` rather than shifting `lg` again.

## Why this exists

Frontend stories regress visually all the time when you trust "I tested it manually." Worktrees prevent parallel agents from clobbering each other. The resume protocol means a context-exhausted agent costs you minutes, not a story. The confidence rubric forces the agent to be honest about what's actually done before asking for a review.
