---
name: worktree-parallel
description: Running multiple agents in parallel on different stories without git conflicts. Covers worktree creation, naming, the active-stories registry, and cleanup. Activate any time more than one story is in flight, or before delegating work to a subagent that will edit files.
---

# Worktree parallel-work skill

How to run multiple agents on multiple stories at once without anyone clobbering anyone else's branch. **A git worktree is a second working directory pointing at the same `.git` repo but checked out to a different branch.** It is the only safe primitive for parallel agent work.

## When to use a worktree

- **Always**, for every user-story implementation (see `tdd-user-story` skill).
- **Always**, when Lead delegates code-editing work to a subagent that will run for more than a few minutes — the subagent gets its own worktree, the main repo stays clean.
- **Never** for read-only work (scout, reviewer reading a diff): they can run in the main checkout.

## Naming convention

```
../gis-data-<story-id>
```

- Prefix `gis-data-` mirrors the repo name (predictable, easy to glob)
- `<story-id>` is `hf-NNN-short-slug` (e.g. `hf-001-search-by-zip`)
- Always sits as a **sibling** of the main checkout, never nested inside it (`git worktree` rejects nested paths)

Branch name inside the worktree is `feat/<story-id>` — keep them in lockstep so the worktree path tells you the branch name and vice versa.

## Create

```bash
STORY=hf-001-search-by-zip

git fetch origin
git worktree add ../gis-data-$STORY -b feat/$STORY origin/develop
cd ../gis-data-$STORY

# Verify
git worktree list
# /Users/hassan/Development/gis-data                  abcd123 [main]
# /Users/hassan/Development/gis-data-hf-001-search-by-zip  efgh456 [feat/hf-001-search-by-zip]
```

The worktree shares the `.git` directory with the main repo — fetches, refs, objects, and stash are all shared. Only the working tree and index are separate.

## What's inherited vs. fresh

| Inherited from main repo | Fresh in worktree |
|---|---|
| `.git/` (all refs, objects, hooks, config) | Working tree (checked out to feat/$STORY) |
| `node_modules/` is NOT inherited — install separately | Index (staged changes) |
| `.env` files (gitignored) — NOT inherited; copy manually | Untracked files |

After `worktree add`:

```bash
cd ../gis-data-$STORY

# Re-install deps (node_modules is per-worktree)
npm ci

# Copy local env if you have one
cp ../gis-data/.env.local . 2>/dev/null || true

# Now you can run dev / tests in isolation
npm run dev          # picks a different port if 3000 is taken
```

## Port collisions

If two worktrees run `npm run dev` at once, Next.js will fight for port 3000. Pin different ports per story:

```bash
PORT=3001 npm run dev
# and in your Playwright config for that story:
PW_BASE_URL=http://localhost:3001 npm run e2e
```

Convention: `3000 + last-2-digits-of-story-id`. Story `hf-007` runs on `:3007`.

## The active-stories registry

Lead maintains `.claude/state/active-stories.json` in the **main checkout** (not in worktrees) so it can see every in-flight story from any session.

```json
{
  "stories": [
    {
      "id": "hf-001-search-by-zip",
      "worktree": "/Users/hassan/Development/gis-data-hf-001-search-by-zip",
      "branch": "feat/hf-001-search-by-zip",
      "port": 3001,
      "status": "implementing",
      "owner_agent": "frontend-designer",
      "last_confidence": 0.62,
      "iteration": 2,
      "created": "2026-05-17T14:00:00Z",
      "updated": "2026-05-17T15:30:00Z"
    }
  ]
}
```

`status` values: `planning | implementing | reviewing | pr-open | merged | abandoned`.

**Lead updates this file at every state transition.** When a subagent reports back, Lead writes the new state before responding to the user. This is the single source of truth for "what's in flight."

## Cleanup

After the PR merges (or the story is abandoned):

```bash
cd /Users/hassan/Development/gis-data

# Remove the worktree (this also unregisters it from .git/worktrees/)
git worktree remove ../gis-data-$STORY

# If the worktree had uncommitted work and you want it gone anyway:
git worktree remove --force ../gis-data-$STORY

# Delete the local branch (remote was deleted on merge by gh)
git branch -D feat/$STORY

# Prune any stale worktree references (paranoia)
git worktree prune
```

Then remove the story entry from `active-stories.json` (or mark it `merged` and let a periodic sweep remove old `merged` entries).

## Common worktree failures and what they mean

| Error | Cause | Fix |
|---|---|---|
| `fatal: '<branch>' is already checked out` | The branch is in use in another worktree | `git worktree list` to find it; reuse or remove it |
| `fatal: '<path>' already exists` | A stale directory at the target path | `rm -rf <path>` then retry — only if you're sure nothing is in there |
| `fatal: not a working tree: '<path>'` | Worktree was deleted with `rm -rf` instead of `git worktree remove` | `git worktree prune` cleans the registry |
| Worktree commands behave oddly inside a worktree | You're in a worktree, not the main repo | `cd` to the main repo before running `git worktree` admin commands |

## Anti-patterns

- Editing files in the main checkout while subagents work in worktrees — you'll commit to `main` by accident
- Sharing one worktree across two stories — the whole point of the isolation is wasted
- Nesting worktrees inside each other (`gis-data/gis-data-hf-001`) — git rejects this anyway
- `rm -rf` on a worktree directory — always `git worktree remove`
- Forgetting to `npm ci` in a new worktree and then debugging "missing module" errors for ten minutes
- Letting `active-stories.json` drift from reality — Lead must keep it current

## Quick reference card

```bash
# Create
git worktree add ../gis-data-<id> -b feat/<id> origin/develop

# List
git worktree list

# Switch
cd ../gis-data-<id>

# Remove (after merge)
cd /Users/hassan/Development/gis-data
git worktree remove ../gis-data-<id>
git branch -D feat/<id>

# Repair after manual deletion
git worktree prune
```
