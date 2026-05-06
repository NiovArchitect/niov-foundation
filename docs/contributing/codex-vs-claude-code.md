# Codex vs. Claude Code

Operational guidance for the human operator deciding which
agent to invoke for a given task. Strictly about the two
agents this project uses, rooted in observed behavior from
the Section 11, 12B, and 12C.0 build cycles. This file
answers *when*, not *how*; configuration is covered elsewhere.

**Foundation's commit history does not record which agent
authored which commit** (no `Co-Authored-By` trailers, no
attribution prefix). Examples below cite commits when the
*task pattern* is visible in the diff; they do not claim
attribution.

## When to Reach for Claude Code

Four task patterns where Claude Code is the right call:

- **Multi-file refactors that need cross-file consistency.**
  Section 12C.0's structured-logging migration (commit
  `f3359fb`) replaced `console.*` calls across multiple
  files in `apps/api/src/` with the shared logger and
  added a runtime invariant test
  (`tests/unit/no-console-in-api-src.test.ts`, ADR-0005).
  Uniform replacement plus the matching anchor test is the
  shape that benefits from Claude Code's planning depth.

- **ADR drafting and bidirectional citation discipline.**
  Phase 1E of Section 12C.0.5 drafted 10 ADRs with a
  bidirectional citation chain (every ADR reachable from
  the architecture README; every cited ADR amended in
  the same commit to add the back-citation). Tracking the
  citation graph across many turns is load-bearing.

- **Substrate-honest verification work.** The Phase 2
  drafting model (pre-flight grep against substrate before
  drafting; surface drifts inline) requires reading the
  actual codebase before writing about it. Claude Code's
  pre-flight discipline catches divergences between spec
  and substrate.

- **Long-running architectural decisions.** When a single
  decision spans many turns — Compliance Architecture Review
  (24 dimensions across 3 sections, commit `9671776`),
  Section 12B layout planning, ADR sequencing — context
  persistence across the conversation matters more than
  per-turn iteration speed.

## When to Reach for Codex

Four task patterns where Codex is the right call:

- **Fast iteration loops on a single file or small scope.**
  When the task is "edit this function, run the test, fix,
  re-run," Claude Code's planning preamble is overhead. A
  tight write-run-fix loop on one file fits Codex.

- **Test-driven loops on a known failure.** When a single
  test is red and the fix is local, Codex's per-turn
  iteration speed compounds across the loop.

- **Focused single-function or single-method edits.** A
  signature change, a return-type narrowing, a missing
  null-check — surgical edits where the surrounding
  architecture is not in question.

- **Mechanical refactors with the decision already made.**
  Renaming a symbol across N files, migrating a deprecated
  API call, fixing a uniform lint pattern. The decision is
  already made; execution speed is what matters.

## Honest Failure Modes

This section is the most operationally useful part of the
file. Both agents have real failure modes; the failure modes
are roughly equal in weight.

### 4.1 Claude Code failure modes

- **Long planning preambles when the task is simple.** A
  five-line bug fix gets a multi-paragraph plan first.
  Context-window cost without proportional benefit.
- **Inflated diffs on small edits.** Over-thoroughness
  produces secondary cleanups (fixing nearby comments,
  re-ordering imports) that weren't asked for and lengthen
  review time.
- **Drift from spec when pre-flight grep finds ambiguity.**
  Resolved by surfacing the drift, but the discipline costs
  a turn or two each time it fires.
- **Sycophantic recap on approval.** "Phase 1A approved"
  gets acknowledgment before the next phase starts. The
  "no recap, proceed" discipline is enforced by correction.

### 4.2 Codex failure modes

- **Loses architectural context on multi-file tasks.**
  When the task spans more than 2-3 files, Codex tends to
  fix the local symptom in each file independently rather
  than recognize the cross-cutting pattern.
- **Cannot self-correct from substrate misreads as
  reliably.** Codex does not pre-flight grep by default.
  When the spec assumes a convention that the substrate
  doesn't actually follow, Codex tends to follow the spec
  and produce divergent code rather than surface the drift.
- **Re-litigates already-decided patterns.** When the
  prompt doesn't pin a decision explicitly, Codex may
  propose alternatives to a pattern that's already locked
  by an ADR. Pin the decision in the prompt, or it will
  re-emerge.
- **Smaller blast radius per error, but more errors per
  task.** Each Codex turn is faster, but the per-turn
  error rate on architectural questions is higher.

## Decision Heuristics

Five operational rules of thumb:

- "Will this need an ADR or substrate change?" → **Claude
  Code.**
- "Is this fewer than ~30 lines of code in one file?"
  → **Codex.**
- "Does this require reading 5+ files before writing 1?"
  → **Claude Code.**
- "Is this a green/red test loop on a known bug?"
  → **Codex.**
- "Will I need to roll this back if it doesn't work?"
  → Whichever has cheaper rollback (usually Codex for
  surgical edits; Claude Code for architectural edits
  with documentation trail to revert alongside the code).

## Mixed-Agent Workflows

When both are useful in sequence on the same task:

- **Architectural plan, then execute, then review.**
  Claude Code drafts the plan + ADR. Codex executes the
  surgical edits the plan calls for. Claude Code reviews
  the diff against the plan and writes the verification
  report.
- **Iterate, then document.** Codex iterates fast on a
  failing test. Once the fix is green, Claude Code writes
  the ADR or amendment explaining why the fix is the right
  fix.

The shared discipline: each agent's output is committed
before the other starts. Single-agent-at-a-time per
`docs/contributing/parallel-sessions.md` §5.1 — the mixed
workflow is sequential, not concurrent.

## Cross-Repo Note

The sibling `otzar-control-tower` repo runs the same agent
fleet against frontend substrate. Each repo maintains its own
`AGENTS.md` and `CLAUDE.md`. The heuristics here apply across
both repos; the substrate is what differs.

## What This File Does Not Cover

- **Configuration of either agent.** Claude Code and Codex
  are configured externally (`.claude/settings.local.json`
  is agent-internal state, not contributor-facing config).
  Cursor and ChatGPT have their own bootstrap files (Phase
  2e, 2f).
- **Multi-agent concurrency.** See `parallel-sessions.md`.
- **Multi-LLM router semantics.** See `AGENTS.md` (Phase 3b
  replaces the current pre-Section-12 file).

## See Also

- `docs/contributing/parallel-sessions.md` — *how* to run
  agents concurrently or in sequence
- `docs/contributing/cursor-bootstrap.md` (Phase 2e,
  coming) — Cursor-specific setup
- `docs/contributing/chatgpt-bootstrap.md` (Phase 2f,
  coming) — ChatGPT-specific setup
- `AGENTS.md` (Phase 3b will replace the existing
  pre-Section-12 file) — multi-LLM router defining each
  agent's authoritative scope
