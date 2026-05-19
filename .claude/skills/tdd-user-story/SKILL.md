---
name: tdd-user-story
description: Building a user story end-to-end with test-driven development, Playwright click-through validation, screenshot diffing, and a confidence-score gate before opening a PR. Activate for any task framed as a user story, acceptance criterion, or "build feature X". This is the default delivery workflow for the Hydrant Finder app.
---

# TDD user-story skill

The contract for shipping a user story in this repo. **Every story follows this loop.** No exceptions for "small" stories — the loop is what makes the small ones cheap.

## Inputs the story must have before you start

Refuse to start work if any of these are missing — ask the user first.

1. **Story statement** — "As a `<persona>`, I want `<capability>` so that `<outcome>`."
2. **Acceptance criteria** — bullet list, testable, no ambiguity. If "looks good" appears, push back.
3. **Visual reference** — a screenshot, Figma frame, or HTML mock the result must match. For Hydrant Finder, the canonical references live in `.claude/agent-context/index.html` and `.claude/agent-context/prompt.html`.
4. **Scope boundary** — explicit list of files/modules in scope, and what's OUT of scope.

If the user hands you a vague story, **the planner agent's first deliverable is to extract these four into a `STORY.md` at the story's worktree root.** Get the user to sign off on `STORY.md` before code is written.

## The loop

```
0. Bootstrap (once per repo)
1. Plan        → planner agent produces STORY.md + a 3-7 step task list
2. Worktree    → Lead creates an isolated worktree off `develop`
3. Test first  → test-writer writes failing Playwright spec(s) from the AC
4. Implement   → frontend-designer / claude builds until the spec passes
5. Click-through → Playwright headed run captures screenshots per AC
6. Score       → self-rate against the rubric (see § Confidence rubric)
7. Iterate     → if score < 0.85, return to step 4 with the gaps logged
8. Review      → reviewer (+ security-auditor if auth/PII) on the diff
9. PR          → open against `develop` with screenshots embedded
10. Cleanup    → remove the worktree once the PR is merged
```

Every step has a Lead checkpoint. Lead does NOT skip steps because "this story is small."

## Step 0 — Bootstrap (do once, then never again)

Run these only on the very first story. After that they're already in place.

**Bootstrap exception**: the FIRST bootstrap story (HF-000 in this repo) is the one story that runs directly on `develop` without a feature worktree, because the workflow tooling it sets up is what every subsequent story depends on. From HF-001 onward, the worktree-mandatory rule applies without exception. If you're reviewing a diff that touched `develop` directly, verify it's the bootstrap story; if not, the worktree rule was violated.

```bash
# develop branch — PR target for every story
git fetch origin
if ! git show-ref --verify --quiet refs/heads/develop; then
  git checkout -b develop main
  git push -u origin develop
  git checkout main
fi

# Playwright — install + initial config
npm i -D @playwright/test
npx playwright install --with-deps chromium
mkdir -p tests/e2e tests/screenshots tests/screenshots/baseline
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:headed": "playwright test --headed",
    "e2e:ui": "playwright test --ui"
  }
}
```

Add `tests/screenshots/<story-id>/` to `.gitignore` for run artifacts; keep `tests/screenshots/baseline/` in git.

Default Playwright config (`playwright.config.ts`) lives at repo root:

```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,           // worktrees give us parallelism; tests inside a story run serial
  retries: 0,
  reporter: [["html", { outputFolder: "tests/playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## Step 1 — Plan

Spawn `planner`. The planner reads the visual reference + AC and emits:

- `STORY.md` at the eventual worktree root, containing: story statement, AC, scope boundary, visual reference link, task list.
- A 3-7 step task list, each step ≤ 1 hour of agent work.
- A list of acceptance criteria mapped to Playwright tests (one AC → one or more `test(...)` blocks).

**Lead does not approve the plan.** The user does. Show the user `STORY.md` before moving on.

## Step 2 — Worktree

See `.claude/skills/worktree-parallel/SKILL.md`. The TL;DR:

```bash
STORY=hf-001-search-by-zip
git worktree add ../gis-data-$STORY -b feat/$STORY origin/develop
cd ../gis-data-$STORY
```

All subsequent steps for this story happen **inside the worktree**. Lead tracks the worktree path in `.claude/state/active-stories.json` (see § Resume protocol).

## Step 3 — Test first (failing spec)

Spawn `test-writer`. Input: `STORY.md` + AC list.

Output: one Playwright spec file per AC group at `tests/e2e/<story-id>.spec.ts`. Each spec:

1. Drives the UI exactly as a user would (no peeking at component internals).
2. Asserts on visible text, ARIA roles, and screenshot diffs — not on CSS class names.
3. Captures a screenshot after each meaningful interaction:

```ts
await page.goto("/search");
await page.getByRole("textbox", { name: /zip code/i }).fill("94110");
await page.getByRole("button", { name: /search/i }).click();
await expect(page.getByText(/hydrants nearby/i)).toBeVisible();
await page.screenshot({
  path: `tests/screenshots/${STORY}/02-results-loaded.png`,
  fullPage: true,
});
```

Run the spec — it MUST fail at this point. If it passes against an unimplemented feature, the test is wrong. Commit the failing test:

```bash
git add tests/e2e/$STORY.spec.ts STORY.md
git commit -m "test(e2e): add failing spec for $STORY"
```

## Step 4 — Implement

Lead implements directly OR spawns `frontend-designer`. Constraints:

- **Read the AGENTS.md note**: this is Next.js 16.2.6 — do NOT rely on your training data for Next.js APIs. Read `node_modules/next/dist/docs/` before using any non-trivial Next.js feature.
- Reuse existing primitives (see `.claude/skills/frontend-design/SKILL.md`).
- The implementation is done when `npm run e2e` passes locally for the new spec.

Commit in small atomic steps as features come online. Don't squash until merge.

## Step 5 — Click-through + screenshots

Run the spec in headed mode so the human (and the agent reading screenshots) can see the result:

```bash
npm run e2e:headed -- tests/e2e/$STORY.spec.ts
```

This produces screenshots at `tests/screenshots/$STORY/`. The agent then **reads each screenshot via the Read tool** and writes observations to `tests/screenshots/$STORY/REVIEW.md`:

- What's correct
- What deviates from the visual reference
- Any console errors (capture via `page.on("console", ...)` in the spec)

## Step 6 — Confidence score

Self-rate the implementation against this rubric. **Each dimension is 0-1.0**, weighted, summed.

| Dimension | Weight | What 1.0 looks like |
|---|---|---|
| **Functional** — every AC test passes | 0.30 | All `test(...)` blocks pass; no `.skip`, no `.only` |
| **Visual** — matches the reference within tolerance | 0.25 | Side-by-side screenshot vs. reference: layout, spacing, typography, colour all match |
| **Interaction** — keyboard, focus, hover all work | 0.15 | Tab order is sensible; focus rings visible; no dead clicks |
| **Robustness** — empty, loading, error states handled | 0.15 | Empty result, network failure, slow-load all render correctly |
| **A11y** — basic accessibility passes | 0.10 | `@axe-core/playwright` reports zero serious/critical violations |
| **Console hygiene** — no errors in browser console | 0.05 | Spec captures `page.on("console")` and asserts no errors/warnings |

Score = Σ(dimension × weight). **The gate is 0.85.**

Write the score to `tests/screenshots/$STORY/REVIEW.md`:

```markdown
## Confidence: 0.78  (below gate, iterating)

| Dimension | Score | Notes |
|---|---|---|
| Functional | 1.00 | 6/6 tests pass |
| Visual | 0.60 | Header padding too tight vs. reference (16px vs 24px); chip colour off |
| Interaction | 0.80 | Tab skips the filter pills |
| Robustness | 0.70 | Loading state shows raw "undefined" briefly |
| A11y | 1.00 | axe: 0 violations |
| Console | 1.00 | clean |
```

## Step 7 — Iterate

If score < 0.85, the agent does NOT ask the user "is this good enough?" — it iterates. Fix the lowest-scoring dimensions first, re-run step 5, re-score. Cap at 5 iterations; if you can't reach 0.85 in 5, escalate to the user with the latest REVIEW.md attached.

## Step 8 — Review

Spawn `reviewer` on the full diff:

```bash
git diff origin/develop...HEAD
```

If the diff touches auth, tenant boundaries, OAuth, webhooks, payment paths, or public endpoints, spawn `security-auditor` in parallel.

Both reviewers' findings get attached to the PR description as a "Pre-review checklist".

## Step 9 — PR against `develop`

Follow `.claude/skills/git-pr-workflow/SKILL.md`, with these story-specific additions:

- **Base** is `develop`, NEVER `main`.
- **Title**: `feat(<story-id>): <one-line summary>`.
- **Body** must include:
  - `## Story` — paste of `STORY.md`
  - `## Confidence score` — final REVIEW.md contents
  - `## Screenshots` — embed 3-5 key screenshots (drag into the PR comment, or commit a `.github/story-shots/$STORY/` folder)
  - `## Test plan` — list of Playwright specs, with pass status
  - `## Review notes` — reviewer + security-auditor outputs

```bash
gh pr create \
  --base develop \
  --title "feat($STORY): <summary>" \
  --body-file STORY-PR.md
```

## Step 10 — Cleanup

After merge:

```bash
cd /Users/hassan/Development/gis-data       # back to main repo
git worktree remove ../gis-data-$STORY
git branch -D feat/$STORY                    # local only; remote was deleted on merge
```

Update `.claude/state/active-stories.json` to mark this story as `merged`.

## Non-negotiables

- **No PR without a Playwright spec.** Every story ships with the test that proves it works.
- **No PR without screenshots embedded.** Visual evidence in the PR body, not a separate folder reviewers won't open.
- **No PR with confidence < 0.85.** If you cannot reach 0.85 in 5 iterations, escalate to the user, don't lower the bar.
- **No PR against `main`.** Stories always target `develop`. `develop → main` is a separate release PR the user opens.
- **No work outside a worktree.** Even a one-line story uses a worktree, so the resume protocol works uniformly.

## Anti-patterns

- Writing the spec AFTER the implementation ("I'll add tests once it works") — this destroys the value of the loop
- Asserting on CSS class names (`.btn-primary`) instead of user-visible roles/text — brittle and not a real user test
- Skipping the screenshot step on "obvious" stories — those are exactly the ones that ship visual regressions
- Marking confidence as 0.85+ without running the spec
- Pushing directly to `develop` because the change is small
- Letting two stories share a worktree

## See also

- `.claude/skills/worktree-parallel/SKILL.md` — how worktrees keep parallel stories from colliding
- `.claude/skills/session-resume/SKILL.md` — how Lead picks up where a context-exhausted agent left off
- `.claude/skills/git-pr-workflow/SKILL.md` — repo-wide PR conventions
- `.claude/skills/frontend-design/SKILL.md` — design-system reuse rules
- `.claude/skills/unit-tests/SKILL.md` — unit-test discipline (complements the e2e specs)
