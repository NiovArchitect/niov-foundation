# Parallel Sessions

Operational guidance for running multiple AI agents (Claude
Code, Codex, Cursor, ChatGPT) concurrently against the same
working tree. This file is for the human operator coordinating
sessions; it is not about distributed-team git workflow.
Section 12B and 12C.0 hit several of the failure modes below
during the build cycle — the discipline here keeps the working
tree predictable when more than one agent has hands on it.

## The Failure Modes

When two agents edit the same working tree concurrently, five
failure modes show up:

- **Working-tree collision.** Both agents edit file `X`
  between checkpoints; the second-to-write wins, the first
  agent's edit is silently lost.
- **Stale-context collision.** Agent A reads `X` at T1.
  Agent B writes `X` at T2. Agent A writes `X` at T3
  based on its T1 read — Agent B's edit is overwritten.
- **Test-cycle collision.** Both agents run `vitest`
  against the shared Supabase test schema. Fixture rows
  collide; neither run produces a trustworthy signal. With
  ADR-0010's 90-110 minute reality, one re-run is a
  90-minute tax on the wrong agent.
- **Lockfile collision.** Concurrent `npm install` corrupts
  `package-lock.json` into a state neither agent expected.
- **Branch-state collision.** Agent B switches branches or
  rewrites HEAD while Agent A is mid-edit; A's next commit
  lands somewhere unpredictable.

## Pre-Flight Discipline

Before starting any agent session:

```bash
git status            # working tree clean? what's uncommitted?
git branch            # on the expected branch?
git log --oneline -5  # is HEAD where I expect it?
ls .claude .codex .cursor 2>/dev/null  # which agent-state dirs exist?
```

Same pre-flight regardless of which agent is starting. It
establishes a known-good baseline so any divergence after the
session is attributable to the session.

There is **no automated guard rail** for this in the repo
today. `.git/hooks/` contains only the git-default `*.sample`
files (no active hooks); there is no husky setup. Pre-flight
discipline is human-enforced.

## Session-State Hygiene

Each agent maintains its own state directory at the repo root:

- `.claude/` — Claude Code session state. Today contains
  `settings.local.json` and `scheduled_tasks.lock` (a
  scheduled-task lock; another agent must not touch it).
- `.codex/` — Codex session state. Does not exist today;
  created when Codex first runs against this repo.
- `.cursor/` — Cursor session state + `.cursorrules`. Does
  not exist today; created when Cursor is first configured.

These directories are **not yet listed in `.gitignore`**. The
current `.gitignore` covers `.env`, `node_modules/`, `.next/`,
`dist/`, `.DS_Store`, `docs/*.pdf`. Section 12C.0.5 Phase 4
adds the agent-state patterns; until then, do not commit
anything from `.claude/`.

Hygiene rules:

- Do not move files between agent-state directories.
- When switching agents, commit-or-stash uncommitted work
  first.
- Treat `.claude/scheduled_tasks.lock` as Claude-only.

## Concurrent Session Patterns

Three patterns work; one does not.

**5.1 Sequential single-agent (safe default).** One agent
at a time, the others idle. Use this whenever disjoint scope
cannot be guaranteed.

**5.2 Disjoint-scope concurrent.** Two agents on
non-overlapping scopes (e.g., Claude Code in
`apps/api/src/services/`, Codex in
`packages/database/src/queries/`). Safe in theory but hard
to maintain — the disjoint scope must hold for both *files
written* AND *files read*. If Claude Code reads
`packages/database/src/queries/audit.ts` while Codex
rewrites it, Claude Code's understanding goes stale
immediately.

**5.3 Read-only concurrent.** One agent edits; others read.
Read-only agents must not write to the working tree,
including agent-state directories.

**5.4 ANTI-PATTERN — concurrent edits on overlapping scope.**
Do not do this. Two agents writing the same files (or files
in the same module) produces every failure mode in §2
simultaneously. Recovery cost exceeds parallelism benefit.
Partition the scope (5.2) or sequence (5.1) instead.

## Test-Cycle Discipline

Per ADR-0010, full-suite runtime is **90-110 minutes**. Two
agents running `vitest` against the shared Supabase test
schema produces fixture collision: `TEST_PREFIX` rows from
one run collide with the other's `cleanupTestData()`
boundaries.

- **One test cycle at a time.** While Agent A's `vitest`
  runs, Agent B can edit / lint / typecheck — no tests.
- **Batch edits before re-running.** A 90-minute cycle
  followed by an immediate re-run is a 3-hour tax.
- **Track A future state.** ADR-0010's Track A introduces
  containerized Postgres for unit tests, removing the
  shared-schema constraint. Until then, single-cycle
  discipline holds.

## Branch and Commit Discipline

Foundation uses a **single-branch convention.** All work
lands on `main`. No feature branches, no per-section
branches, no PR-style workflow today. Every agent is on
`main`; the only branch-state question is "where is HEAD?"

Commit messages follow the pattern observed in `git log`:

```
[SECTION-XX-DESCRIPTOR] One-line subject (test count or item count)
```

Real examples:

```
[SECTION-12C.0] Foundation compliance hardening: crypto-config + retention posture + system actors + structured logging + compliance state endpoint (5 items)
[SECTION-12B-FOUNDATION] AI Teammate detail read endpoint with cross-tenant fail-closed (443 tests passing + 1 skipped)
[SECTION-9-TOUCHPOINTS] Align audit action naming + null-safety on /org/analytics
```

The `[SECTION-XX]` prefix is the section identifier; the
parenthetical trailer is the test/item count when relevant.

Discipline rules:

- **No rebasing another agent's uncommitted work.** Rebases
  happen at checkpoint boundaries, never during active
  editing.
- **No force-push without explicit operator authorization.**
  When authorized, use `--force-with-lease` with a backup
  branch (per CLAUDE.md operational rules).
- **`package-lock.json` is single-writer.** Concurrent
  `npm install` corrupts it.

## When Things Go Wrong

- **Working-tree corruption (uncommitted edits lost).**
  Try `git stash list` and `git reflog` — recent work may
  be recoverable from reflog. If not, re-do; don't chase.
- **Branch-state ambiguity.** Commit-or-stash on every
  open session, then `git checkout main && git pull` on
  each.
- **Test-cycle collision (two `vitest` runs in flight).**
  Kill the older PID; the newer run reflects current edits.
  Do not pkill both — see ADR-0010.
- **Lockfile corruption.** `git checkout package-lock.json`
  to revert, then re-run `npm install` from one session only.

## See Also

- ADR-0010 (test runtime reality — central to §6)
- `docs/contributing/code-style.md` (prerequisite)
- `docs/contributing/testing.md` (prerequisite for §6)
- `docs/contributing/codex-vs-claude-code.md` (Phase 2d,
  coming) — this file covers *how* to run agents
  concurrently; that file covers *when* to reach for which.
