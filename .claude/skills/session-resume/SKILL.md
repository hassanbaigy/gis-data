---
name: session-resume
description: Resuming a story when an agent ran out of context, the session was interrupted, or a new Lead session inherits in-flight work. Covers the handoff state file, the resume protocol, and how subagents emit their final state before they hit context limits. Activate at the start of every Lead session, and whenever a subagent returns near its context limit.
---

# Session resume skill

Agents run out of context. Sessions get closed. The user comes back the next day. **None of this should cost you a story.** This skill defines the handoff state file every agent writes and the protocol Lead uses to pick up.

The principle: **state lives on disk, not in any agent's head.** If a meteor wiped every running session, a fresh Lead should be able to read three files and continue.

## The three state files

| File | Owner | Purpose |
|---|---|---|
| `.claude/state/active-stories.json` | Lead | Registry of every in-flight story (see `worktree-parallel` skill) |
| `<worktree>/STORY.md` | Lead (initial), planner (filled) | The frozen scope: story statement, AC, visual ref, task list |
| `<worktree>/.claude-resume.md` | The agent currently working the story | Live working state, updated frequently |

`.claude/state/` and `<worktree>/.claude-resume.md` are gitignored — they're per-machine working memory, not artifacts. `STORY.md` IS committed because it's the contract.

Add these to `.gitignore` once:

```
.claude/state/
.claude-resume.md
```

## What goes in `.claude-resume.md`

A single markdown file at the worktree root. Updated by whichever agent is doing work right now. **Append-only during a session, overwritten at session start.** Format:

```markdown
# Resume state — hf-001-search-by-zip

## Stage
implementing  (planning | implementing | iterating | reviewing | pr-open)

## Last update
2026-05-17T15:42:00Z by frontend-designer (iteration 2)

## What's done
- STORY.md approved by user 2026-05-17T14:05Z
- tests/e2e/hf-001.spec.ts written and failing (commit abcd123)
- Search page scaffolded at src/app/search/page.tsx (commit efgh456)
- ZIP input + validation working (commit ijkl789)

## What's in progress
- Wiring the search button to the results panel
- File: src/app/search/page.tsx, line ~80, the onSubmit handler is a TODO

## What's next (in order)
1. Implement onSubmit → fetch /api/hydrants?zip=
2. Render results list with empty / loading / error states
3. Re-run npm run e2e:headed -- tests/e2e/hf-001.spec.ts
4. Score against the rubric, log to tests/screenshots/hf-001/REVIEW.md
5. If < 0.85, iterate; else open PR against develop

## Confidence (latest)
0.62 — failing on visual (header padding) and robustness (empty state missing)

## Open questions for the user
- (none right now)

## Files touched this session
- src/app/search/page.tsx
- src/components/ZipInput.tsx (new)
- tests/e2e/hf-001.spec.ts

## How to resume
1. cd /Users/hassan/Development/gis-data-hf-001-search-by-zip
2. npm ci  (if a fresh machine)
3. PORT=3001 npm run dev   (separate terminal)
4. Read STORY.md and this file
5. Continue from "What's next" step 1
```

## When agents write to this file

| Trigger | Action |
|---|---|
| Subagent starts work | Create or overwrite `.claude-resume.md` with current state |
| Subagent finishes a meaningful chunk (commit, test pass, score update) | Append to "What's done", update "What's in progress" + "Last update" |
| Subagent is about to return to Lead | Make sure the file is current — this is the handoff |
| Subagent feels context pressure (long file reads, many tool calls) | Flush state to the file IMMEDIATELY and return to Lead with a "context pressure — handing off" note |
| Lead receives a subagent result | Read `.claude-resume.md`, reconcile with `active-stories.json`, never trust the agent's message alone |

**Lead's rule:** never close a session with stale resume files. Before responding "task complete" to the user, verify `.claude-resume.md` reflects the actual state.

## Detecting context pressure

A subagent should treat any of these as a signal to flush state and hand off:

- It has read more than ~30 files
- It is more than ~50 tool calls deep
- It is iterating on the same file for the 3rd+ time
- It notices its responses getting shorter / less detailed

Every subagent prompt Lead sends MUST include this paragraph:

```
## Context pressure protocol
If at any point you feel you're running low on context (many files read, many
tool calls, repeated edits on the same file), STOP and:
1. Update <worktree>/.claude-resume.md with current state — what's done, what's
   in progress, exactly what to do next, file paths and line numbers.
2. Return to Lead with the message "context pressure — handing off, see
   .claude-resume.md".
Do not try to finish the task if you can't finish it well. Hand off cleanly.
```

## Lead's resume protocol (run at the start of EVERY session)

```bash
# 1. Inventory in-flight work
cat .claude/state/active-stories.json

# 2. For each story not in `merged` or `abandoned`:
for STORY in $(jq -r '.stories[] | select(.status != "merged" and .status != "abandoned") | .id' .claude/state/active-stories.json); do
  WORKTREE=$(jq -r ".stories[] | select(.id == \"$STORY\") | .worktree" .claude/state/active-stories.json)
  echo "=== $STORY ==="
  cat "$WORKTREE/STORY.md"        # the contract
  cat "$WORKTREE/.claude-resume.md" # the working state
  cd "$WORKTREE" && git status && git log --oneline -10
done
```

Then surface to the user:

```
Active stories on resume:
- hf-001-search-by-zip — iteration 2, confidence 0.62, frontend-designer was implementing onSubmit handler
- hf-002-map-clustering — planning, awaiting your sign-off on STORY.md

Which do you want to continue?
```

Do not assume which one. Ask.

## When a subagent dies mid-task

The agent's session ended (context exhaustion, crash, user cancel). The worktree exists, code is half-written, `.claude-resume.md` may be stale.

Lead's recovery:

1. `cd` into the worktree.
2. `git status` — what's uncommitted? If it's coherent, commit it as `wip: <story-id> snapshot before resume` so it's safe.
3. `git log --oneline origin/develop..HEAD` — what commits did we get?
4. Read `STORY.md` (contract) and `.claude-resume.md` (last known live state).
5. If `.claude-resume.md` is older than the latest commit, the agent died after committing without updating the file. Reconstruct: read the commit messages + diffs since the last `.claude-resume.md` update and update the file yourself.
6. Decide: continue with the same agent type, or escalate to user.

## Bootstrap (do once)

```bash
mkdir -p .claude/state
echo '{"stories": []}' > .claude/state/active-stories.json

# Ensure gitignore
grep -qxF '.claude/state/' .gitignore || echo '.claude/state/' >> .gitignore
grep -qxF '.claude-resume.md' .gitignore || echo '.claude-resume.md' >> .gitignore
```

## Anti-patterns

- Lead "remembering" what a subagent was doing instead of reading `.claude-resume.md` — the file is the truth
- Subagents holding state in their working memory and not flushing — they always die before they expect to
- Updating `.claude-resume.md` only at the end of a task — by then the agent may not have context budget left to write a full update
- Committing `.claude-resume.md` to git — it's per-machine working state, not a deliverable
- Letting `active-stories.json` accumulate stale entries — stale state is worse than no state
- Resuming without reading STORY.md — you'll drift from the agreed scope

## See also

- `.claude/skills/tdd-user-story/SKILL.md` — the loop these state files support
- `.claude/skills/worktree-parallel/SKILL.md` — where the worktrees referenced here come from
