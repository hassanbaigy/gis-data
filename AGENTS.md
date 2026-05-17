<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:delivery-workflow -->
# Delivery workflow (read at every session start)

Every user story in this repo ships via a fixed TDD + Playwright + screenshot + confidence-gate loop, built in isolated git worktrees, with PRs against `develop` (not `main`).

**Lead — at the start of every session, before responding to the user:**
1. Read `.claude/agent-context/hydrant-finder-workflow.md` (the one-page summary).
2. Run the resume protocol from `.claude/skills/session-resume/SKILL.md`: read `.claude/state/active-stories.json`, then each non-merged story's `STORY.md` + `.claude-resume.md`.
3. Surface in-flight stories to the user and ask which to continue.

**Lead — before delegating any code-editing work:**
1. Inject `.claude/skills/tdd-user-story/SKILL.md` by reference into the subagent prompt.
2. Inject `.claude/skills/worktree-parallel/SKILL.md` so the subagent works in the right worktree.
3. End every prompt with the context-pressure paragraph from `.claude/skills/session-resume/SKILL.md` so the agent flushes state cleanly if it runs low.

**Hard rules** (full list in `.claude/agent-context/hydrant-finder-workflow.md`):
- No PR without a passing Playwright spec.
- No PR with self-rated confidence < 0.85.
- No PR targeting `main` — always `develop`.
- No code changes outside a per-story worktree.
- No session start without running the resume protocol.
<!-- END:delivery-workflow -->
