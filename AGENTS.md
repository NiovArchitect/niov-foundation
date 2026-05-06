# AGENTS.md

Multi-LLM router for `niov-foundation`. Defines each agent's
authoritative scope and how to route a task to the right one.
Does not duplicate `CLAUDE.md`'s operational rules —
`CLAUDE.md` is operational source of truth; `AGENTS.md` is
agent-selection source of truth.

This file replaces the pre-Section-12 `AGENTS.md` (a near-clone
of the pre-Section-12 `claude.md`) in Section 12C.0.5 Phase 3b.
The prior content was wholesale-replaced with the router
structure below.

## The Agent Fleet

Four agents in scope:

- **Claude Code** — repo-running. Authoritative for
  architectural work, ADR drafting, multi-file refactors,
  substrate-honest verification. Substrate:
  `docs/contributing/codex-vs-claude-code.md`.
- **Codex** — repo-running. Authoritative for fast iteration
  loops, focused single-file edits, mechanical refactors,
  test-driven loops. Substrate:
  `docs/contributing/codex-vs-claude-code.md`.
- **Cursor** — IDE-embedded. Authoritative for reviewing
  completed sections (read-only by default) and surgical
  single-file fixes when a repair agent is stuck 3+ attempts.
  Substrate: `.cursorrules` C1-C8;
  `docs/contributing/cursor-bootstrap.md`.
- **ChatGPT** — consultative (no repo access). Authoritative
  for architectural sounding-board, document drafting,
  patent-claim cross-check, vocabulary translation. Substrate:
  `docs/contributing/chatgpt-bootstrap.md`.

## Routing Heuristics

Pick the right agent in 30 seconds:

- "Architectural decision needing an ADR?" → **Claude Code**
- "Fewer than 30 lines in one file?" → **Codex**
- "Reading 5+ files before writing 1?" → **Claude Code**
- "Green/red test loop on a known bug?" → **Codex**
- "Reviewing already-completed work, not editing?" → **Cursor**
- "Need consultative analysis on pasted-in content?" → **ChatGPT**
- "No repo access available?" → **ChatGPT** (only option)
- "Substrate-honest verification with pre-flight grep?" →
  **Claude Code** (only Claude Code reliably does this)

Full decision-heuristic substrate:
`docs/contributing/codex-vs-claude-code.md` §Decision Heuristics.

## Authoritative Scope Per Agent

What each agent owns and where its authority ends.

### Claude Code

- **Owns:** architectural work, ADR drafting and amendment,
  multi-file refactors, citation-discipline work, pre-flight
  grep against substrate.
- **Does not own:** fast surgical edits on a single file
  (defer to Codex), review-only sessions on completed work
  (defer to Cursor).

### Codex

- **Owns:** fast iteration loops, focused single-function or
  single-method edits, mechanical refactors with the decision
  already made, test-driven write-run-fix loops.
- **Does not own:** architectural decisions (defer to Claude
  Code), substrate verification requiring pre-flight grep
  (defer to Claude Code).

### Cursor

- **Owns:** reviewing completed sections, surgical single-file
  fixes when a repair agent is stuck 3+ attempts, checking
  comment-block compliance, catching missing audit-trail writes.
- **Does not own:** building entire sections, running tests,
  installing packages, migrations, any change spanning more
  than 2 files (per `.cursorrules` C1-C8). Known substrate
  gaps: `docs/contributing/cursor-bootstrap.md` §Substrate Drift.

### ChatGPT

- **Owns:** consultative review of pasted content,
  architectural sounding-board, patent-claim cross-check,
  vocabulary translation, drafting where source fits in a paste.
- **Does not own:** anything needing repo access (no grep,
  no file reads, no citation verification), code/test
  execution, multi-turn editing where context fidelity matters.
  Anti-hallucination discipline:
  `docs/contributing/chatgpt-bootstrap.md` §The
  Anti-Hallucination Discipline.

## Concurrency Rules

Full discipline: `docs/contributing/parallel-sessions.md`.

- Sequential single-agent sessions are the safe default.
- Disjoint-scope concurrent sessions work but are hard to
  maintain (§Concurrent Session Patterns 5.2).
- Read-only concurrent sessions are safe (5.3).
- Concurrent edits on overlapping scope is the anti-pattern
  (5.4).
- Test cycles run one at a time (`CLAUDE.md` RULE 15;
  `parallel-sessions.md` §Test-Cycle Discipline).

## Cross-Repo Awareness

The same agent fleet runs against the sibling
`otzar-control-tower` repo. Each repo maintains its own
`AGENTS.md` and `CLAUDE.md`. The routing heuristics here apply
across both repos; the substrate (Foundation backend
conventions vs. otzar-control-tower frontend conventions) is
what differs. See
`docs/contributing/codex-vs-claude-code.md` §Cross-Repo Note.

## Maintenance

- **Major changes** (new agent, removed agent, scope change)
  require an ADR. ADR + `AGENTS.md` amendment land in the same
  commit with bidirectional citation per `CLAUDE.md` RULE 14.
- **Minor amendments** (clarification, cross-ref update) can
  land in any commit.
- **Conflict with `CLAUDE.md`:** `CLAUDE.md` wins.
  `CLAUDE.md` is operational source of truth; `AGENTS.md` is
  the routing layer. Routing rules never override operational
  rules.
