# Dev B onboarding — HF-001 (mock auth + /login screen)

Copy everything below this line into Dev B's first Claude Code message in his clone of the repo. He should be in the project root at `/Users/hassan/Development/gis-data` (or wherever he's cloned it), on the `develop` branch, with HF-Foundation merged.

---

You are Dev B's coordinating agent. Your task is **HF-001 — mock auth + /login screen**. Two devs are working in parallel: I'm on a different worktree, so you must work in your own isolated worktree and never touch `develop` directly. Everything you produce ships as one PR against `develop`.

## Before you write a line of code

Read these in order. They are not suggestions:

1. **Workflow rules** — `.claude/agent-context/hydrant-finder-workflow.md` (full file). The 10-step loop every story follows.
2. **Story contract** — `.claude/agent-context/user-stories.md` lines 92-105 (the HF-001 section). This is your acceptance criteria. Do not deviate without asking the user.
3. **Scaffold gotchas** — `.claude/agent-context/scaffold-state.md` (full file). Tailwind v4 (`@theme` directive, NO `tailwind.config.ts`), Next 16 `next/font/google` patterns, the underscore-folder routing rule, Prisma + pnpm conventions.
4. **Data layer** — `.claude/agent-context/data-layer.md` (full file). The `Firefighter` model already exists. You upsert into it on login; you do NOT create the table.
5. **TDD loop** — `.claude/skills/tdd-user-story/SKILL.md` (full file). Steps 1-9 apply to you; the bootstrap exception in Step 0 does NOT — you go through the full loop including a worktree.
6. **Worktree mechanics** — `.claude/skills/worktree-parallel/SKILL.md` (full file).
7. **Resume protocol** — `.claude/skills/session-resume/SKILL.md` (full file). Read this even if you don't think you'll need it.
8. **Visual reference** — `.claude/agent-context/index.html` (full file). Find the "LOGIN" screen mock (Screen 1). Match it exactly: brand block top, 4-digit badge input mono 22px, 4-cell PIN pad with yellow border on active cell, red SIGN IN CTA with the spec'd shadow, "FDNY · v0.1 PROTO" subtitle in mono fog. Also read `.claude/agent-context/prompt.html` §07 spec card 1 for the field-level details.

## Setup

```bash
git fetch origin
git checkout develop && git pull origin develop

# Create your worktree (port 3001 — port 3000 is mine)
git worktree add ../gis-data-hf-001-login -b feat/hf-001-login origin/develop
cd ../gis-data-hf-001-login

# Install + DB
PATH=/opt/homebrew/opt/node@25/bin:$PATH
cp ../gis-data/.env.local .env.local    # bring your Mapbox tokens
pnpm install
pnpm prisma generate
pnpm prisma migrate dev                  # applies HF-Foundation migration to your local dev.db
pnpm prisma db seed                       # 456 hydrants + badge 0418 firefighter + 6 incidents

# Sanity-check the seed before you start
PORT=3001 pnpm dev &
sleep 5
curl -s http://localhost:3001/api/health/db
# Expect: {"firefighterCount":1,"hydrantCount":456,...,"incidentOwnerBadges":["0418"]}
# If you don't see this, STOP and tell the user — your data layer isn't right.
```

## Write STORY.md before you write code

Create `STORY.md` at your worktree root with the story statement, acceptance criteria (paste from `user-stories.md`), scope boundary, visual reference link, and task list. Show it to the user and get sign-off before writing any production code.

## Build order (the 10-step loop, with story-specific notes)

1. **Plan** — your STORY.md plus a 3-7 step task list. Sign-off from user.
2. **Worktree** — already done above.
3. **Test first** — write `tests/e2e/hf-001-login.spec.ts` covering every AC. The spec should run against `http://localhost:3001` (set `PW_BASE_URL=http://localhost:3001` when running). It MUST fail at this point. Commit the failing spec.
4. **Implement** —
   - `src/app/login/page.tsx` — the login screen. Server component if possible; client component only for the PIN-cell-focus state machine. Match the visual reference.
   - `src/lib/auth.ts` — `requireFirefighter()` (reads `hf_badge` cookie, calls `prisma.firefighter.findUnique`, redirects to `/login` if missing). Also `signIn(badge, pin)` helper that upserts the `Firefighter` row and sets the cookie.
   - `src/app/api/auth/sign-in/route.ts` — POST handler accepting `{ badge, pin }`. Validates both are 4 digits, upserts the Firefighter, sets `hf_badge` http-only cookie, returns success.
   - `src/app/page.tsx` — gate it with `requireFirefighter()`: redirect to `/login` if no cookie, `/map` if present. **Replace the HF-000 wordmark placeholder** — that's its purpose, it was a placeholder. (Keep a brief wordmark on `/login` itself in the brand block per the visual ref.)
5. **Click-through + screenshots** — `pnpm e2e:headed -- tests/e2e/hf-001-login.spec.ts`. Capture screenshots at: empty state, partial entry (CTA disabled), valid 4+4 entry, post-redirect to `/map` (which will 404 until HF-005 lands — that's fine, just assert the URL changed).
6. **Score** — write `tests/screenshots/hf-001-login/REVIEW.md` with the rubric (Functional / Visual / Interaction / Robustness / A11y / Console, gate at 0.85). Self-rate honestly.
7. **Iterate** — if < 0.85, fix the lowest-scoring dimension first. Max 5 iterations. If you can't reach 0.85, surface to user with REVIEW.md attached.
8. **Review** — spawn `reviewer`. Inject `.claude/agent-context/hydrant-finder-workflow.md`, your `STORY.md`, the relevant `user-stories.md` AC range, and `scaffold-state.md`. Auth diff means you should also spawn `security-auditor` in parallel — cookie flags, CSRF posture, anti-bruteforce posture (we accept any 4+4 PER THE BRIEF, but the audit should confirm we don't accidentally log the PIN or store it).
9. **PR** — `gh pr create --base develop`. Title: `feat(hf-001): mock auth + /login screen`. Body must include the AC paste from STORY.md, the REVIEW.md confidence rubric, embedded screenshots (drag into the PR comment), test plan, and reviewer + security-auditor outputs.

## Critical rules — non-negotiable

- **No PR without a passing Playwright spec.** Every AC must have a corresponding test.
- **No PR with confidence < 0.85.**
- **No PR against `main`.** Always `develop`.
- **No code changes outside your worktree.** If you find yourself editing `/Users/hassan/Development/gis-data/...`, stop.
- **Do not touch `src/app/api/health/db/`** — that's HF-Foundation's diagnostic route, leave it.
- **Do not edit the Prisma schema or migrations** — HF-Foundation owns the data layer. If you genuinely need a schema change, raise it with the user first.

## Files you DO own

- `src/app/login/page.tsx`
- `src/app/page.tsx` (replace HF-000 placeholder with the gating redirect)
- `src/lib/auth.ts`
- `src/app/api/auth/sign-in/route.ts` (and optionally `/api/auth/sign-out/route.ts`)
- `tests/e2e/hf-001-login.spec.ts`
- `STORY.md` at your worktree root
- `.claude-resume.md` at your worktree root (live working state — see Resume protocol)

## Files I (Dev A) own — DO NOT TOUCH

- `src/app/api/hydrants/...` (HF-007 — coming next from me)
- `src/components/MapView.tsx` (HF-004 — coming next from me)
- Any file under `prisma/`

## Memory injection protocol (you are also Lead in this session)

You are running as a Lead agent for Dev B. The Memory Injection Protocol from your system prompt applies. Before spawning any subagent (test-writer, frontend-designer, reviewer, security-auditor):

1. List `.claude/agent-context/` files relevant to the task.
2. Inject by reference (file + line range), not paste.
3. End every subagent prompt with the mandatory acknowledgment block.
4. End every subagent prompt with the context-pressure protocol so they hand off cleanly if they run low.

After every agent result, scan for novel gotchas worth capturing back into `.claude/agent-context/`. Examples for this story: any quirk you discover about Next 16 cookie handling, the App Router redirect semantics, Tailwind v4 + form-state-driven styling, etc.

## When you're done

Open the PR and **stop**. Do not merge. The user reviews and merges. Then I (Dev A) and you both `git pull origin develop` and pick the next pair of stories.

## Resume on session restart

If your session gets interrupted (context exhaustion, crash, user closed Claude), the next session's Lead will:
1. Read `.claude/state/active-stories.json` (root of the main repo)
2. Read your `<worktree>/STORY.md` and `<worktree>/.claude-resume.md`
3. Continue from "What's next" in your resume file

So: keep `.claude-resume.md` current. Update it every meaningful commit / test pass / score change. The file is gitignored — it's per-machine working state.

## First thing to do, RIGHT NOW

1. Read the 8 context files above in order.
2. Echo back a brief acknowledgment listing the files you read and the 3 most important gotchas you found.
3. Run the setup commands.
4. Verify `/api/health/db` returns the expected counts.
5. Write your STORY.md and show it to the user for sign-off.

Don't skip step 1. The whole system depends on context injection actually happening.
