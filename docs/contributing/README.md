# Contributing Guide

Operational guidance for contributors and the human operator
running the agent fleet against niov-foundation. This directory
covers TypeScript conventions, test infrastructure, multi-agent
session discipline, and per-agent bootstrap setup. It does not
cover architectural decisions (those live in
`docs/architecture/`) or reference material such as the glossary
and anchors catalog (`docs/reference/`).

## Reading Order

For a first-time reader, read in this order:

1. **`onboarding.md`** first — load-on-open per RULE 17; the
   architectural framing every AI session loads at start.
2. **`onboarding-for-engineers.md`** second — contributor
   onboarding (the human-engineer entry point; complements
   `onboarding.md`).
3. **`code-style.md`** third — TypeScript conventions are
   prerequisite for everything else.
4. **`testing.md`** fourth — depends on `code-style.md` for
   conventions in test files.
5. **`parallel-sessions.md`** fifth — depends on `testing.md`
   §Test-Cycle Discipline for the 90-110 minute reality.
6. **`codex-vs-claude-code.md`**, **`cursor-bootstrap.md`**,
   **`chatgpt-bootstrap.md`** as needed by which agent you
   are configuring or invoking.
7. **`templates/`** as a reference during commit drafting —
   the commit-class scaffolds for new ADRs, new RULES, and
   post-commit-hash cascades (per ADR-0029).

## Files in This Directory

- **`onboarding.md`** — Load-on-open architectural framing
  per RULE 17; the session-start ritual every AI agent
  performs; canonical RAA references.
- **`onboarding-for-engineers.md`** — Human-engineer
  contributor onboarding: repo orientation, key disciplines,
  first-PR walkthrough.
- **`code-style.md`** — TypeScript conventions: file headers,
  JSDoc/TSDoc blocks, naming, imports, service classes, error
  handling, logging.
- **`testing.md`** — Test infrastructure, the 90-110 minute
  runtime reality, test tiers (unit, integration, Track A
  real-LLM future state), anchor test discipline.
- **`parallel-sessions.md`** — Multi-agent concurrency:
  failure modes, pre-flight discipline, session-state
  hygiene, branch + commit conventions, recovery.
- **`codex-vs-claude-code.md`** — When to reach for which
  repo-running agent: task patterns, honest failure modes,
  decision heuristics, mixed-agent workflows.
- **`cursor-bootstrap.md`** — Cursor IDE setup:
  `.cursorrules` review, project context loading,
  anti-patterns, pre-Section-12 substrate drift.
- **`chatgpt-bootstrap.md`** — ChatGPT consultative usage:
  anti-hallucination discipline, copy-paste templates,
  scope boundaries.
- **`templates/`** — Commit-class scaffolds (NEW-ADR,
  NEW-RULE, POST-COMMIT-HASH-CASCADE) per ADR-0029
  Optimization 2; used during commit drafting to enumerate
  the standard cascade scope.

## Operational Disciplines

Four cross-cutting disciplines apply to every file in this
directory and are observable in their structure.

- **Substrate-honesty.** Every file in `docs/contributing/`
  was drafted by pre-flight grep against actual repo state,
  with drifts surfaced inline as a labeled "SUBSTRATE-HONESTY
  DRIFTS" section in the verification report. Citations
  resolve to real files, real line numbers, real config
  values. Where the spec assumed something the substrate
  contradicted (e.g., `tests/helpers/` is actually
  `tests/helpers.ts`; `.cursorrules` already exists with
  pre-Section-12 gaps), the file documents the actual state.
- **Bidirectional citation.** Files cross-reference each
  other and forward-reference unfinished files (Phase 3a
  `CLAUDE.md`, Phase 3b `AGENTS.md`) by name and phase. The
  citation graph is closed within the contributing layer —
  every prerequisite is named, every dependent is named,
  every pending replacement is acknowledged.
- **Single-cycle test discipline.** Per `parallel-sessions.md`
  §Test-Cycle Discipline and ADR-0010, Foundation tests run
  90-110 minutes and one cycle at a time. Contributors
  budget around this constraint, not against it.
- **Substrate drift over silent fix.** When a contributor
  finds a gap in committed substrate (the `.cursorrules`
  example in `cursor-bootstrap.md` §Substrate Drift; the
  agent-state `.gitignore` patterns flagged in
  `parallel-sessions.md` §Session-State Hygiene), surface
  the gap inline rather than silently patching it in an
  unrelated commit.

## What This Directory Does Not Cover

- **Architectural Decision Records** → `docs/architecture/`
  (`README.md` and the 29 ADRs `0001-…` through `0029-…`).
- **Glossary, anchors catalog, build-cycle progress** →
  `docs/reference/glossary.md`,
  `docs/reference/architectural-anchors.md`,
  `docs/reference/section-12-progress.md`.
- **Authoritative agent rules** → `CLAUDE.md` (Phase 3a
  replaces the current pre-Section-12 `claude.md`) +
  `AGENTS.md` (Phase 3b replaces the current pre-Section-12
  file).
- **Schema, migrations, runtime infrastructure** →
  `packages/database/` and `apps/api/` source.

## Cross-References

- `docs/architecture/README.md` — architecture directory
  index + ADR catalog
- `docs/reference/glossary.md` — term definitions and
  capitalization conventions
- `docs/reference/architectural-anchors.md` — runtime-enforced
  architectural properties (DRIFT 9 audit/permissions, DRIFT
  2 Option C no-console, DRIFT 12 chainKey priority, frozen
  CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS)
- `docs/reference/section-12-progress.md` — Section 12
  build-cycle live tracker
