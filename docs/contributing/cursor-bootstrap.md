# Cursor Bootstrap

Cursor IDE setup for niov-foundation. Audience: a contributor
opening Cursor against this repo for the first time, or after a
long absence. This file answers *what to configure* and *what
to verify* — agent-selection logic (when to reach for Cursor
vs. another agent) lives in
`docs/contributing/codex-vs-claude-code.md`.

## Initial Setup

Five verifications when opening the repo in Cursor:

1. **Open the repo at the workspace root**
   (`niov-foundation/`), not a sub-package.
2. **TypeScript server picks up the strict config.** The
   strict settings (`strict`, `noUncheckedIndexedAccess`,
   `target: ES2022`, `module: ESNext`) live in
   `tsconfig.base.json`. Root and per-package tsconfigs
   (`apps/api/`, `packages/database/`, `packages/auth/`)
   all extend it. Cursor's TS server should report no
   spurious errors against any of them.
3. **`.cursorrules` is loaded.** The 50-line file at the
   repo root is read on every interaction; see
   §`.cursorrules` Configuration below.
4. **Scripts panel shows the 5 npm scripts.** `package.json`
   exposes only `test`, `test:watch`, `db:generate`,
   `db:migrate`, `db:push`. There is no `typecheck`,
   `lint`, `build`, or `format` script today. Section
   12C.0.5 Phase 4 adds `docs:gen` and `docs:check`; lint
   and format are not yet in scope.
5. **No ESLint or Prettier integration.** Foundation has
   no `.eslintrc*`, no `eslint.config.js`, no `.prettierrc`
   today (confirmed by ADR-0005 — that's why DRIFT 2
   resolved Option C, runtime invariant test, rather than
   ESLint rule). Cursor's lint will have nothing to apply;
   format-on-save uses Cursor's built-in TypeScript
   formatter, not project-pinned Prettier rules.

## .cursorrules Configuration

`.cursorrules` exists at the repo root as a 50-line
pre-Section-12 file. Its core framing:

```
Claude Code builds sections. Cursor understands and reviews them.
```

The file enumerates: what Cursor owns (explaining code,
reviewing completed sections, surgical single-file fixes
when a repair agent is stuck 3+ attempts, checking 4-line
comments, catching missing audit-trail writes); what Cursor
stays out of (building sections, running tests, installing
packages, migrations, any change spanning more than 2
files); eight behavior rules C1-C8 (explain-before-change,
one-file-at-a-time, never modify test files, never add
packages without permission, mandatory `WHAT/INPUT/OUTPUT/WHY`
4-line comment format, never hard-delete, audit-trail check,
report format after any change); and a tech stack list.

The file is **pre-Section-12 vintage with known gaps** vs.
current substrate (see §Substrate Drift). Phase 3 replaces
`CLAUDE.md` and `AGENTS.md` with current substrate;
`.cursorrules` is in scope for the same alignment in a
future amendment but is not part of Phase 3 today.

## Project Context Loading

For Cursor to be productive, the following files should be
in its loaded context (open tabs or pinned-context, depending
on Cursor version):

1. **Authoritative root files** — `CLAUDE.md` (Phase 3a will
   replace the current pre-Section-12 `claude.md`),
   `AGENTS.md` (Phase 3b will replace the current
   pre-Section-12 file), `.cursorrules` (current state
   above)
2. **Reference layer** — `docs/reference/glossary.md`,
   `docs/reference/architectural-anchors.md`,
   `docs/reference/section-12-progress.md`
3. **Architecture layer** — `docs/architecture/README.md`
   plus any specific ADRs relevant to the current task
   (`docs/architecture/decisions/0001-0010`)
4. **Contributing layer** — `docs/contributing/code-style.md`,
   `docs/contributing/testing.md`,
   `docs/contributing/parallel-sessions.md`,
   `docs/contributing/codex-vs-claude-code.md`

Load order matters: `CLAUDE.md` first so the project's
operational rules are in context for every prompt before
anything else.

## Cursor Anti-Patterns

Concrete things NOT to do:

- **Do not let Cursor auto-format files outside the scope
  of the current edit.** Cursor's "format on save" can
  re-flow imports or whitespace in files you didn't
  intend to touch, producing inflated diffs that obscure
  the real change.
- **Do not let Cursor's "fix everything" mode run
  unsupervised.** It ignores ADR constraints (e.g., the
  no-`console.*` invariant from ADR-0005, the
  service-owned auth gate from ADR-0004) and proposes
  patterns that violate locked decisions.
- **Do not let Cursor commit on your behalf without
  reviewing the message.** The
  `[SECTION-XX-DESCRIPTOR] subject (count)` convention
  from `docs/contributing/parallel-sessions.md` §Branch
  and Commit Discipline must be followed.
- **Do not let Cursor run tests without single-cycle
  discipline.** Per `docs/contributing/parallel-sessions.md`
  §Test-Cycle Discipline, two `vitest` runs against the
  shared Supabase test schema produces fixture collision.
  Cursor's "run test on save" must be off if any other
  agent is running tests.

## When Cursor Loses Context

1. **Reload window** — Cmd+Shift+P → "Reload Window".
2. **Re-open authoritative files** in the order from
   §Project Context Loading.
3. **Verify `.cursorrules` is active** in Cursor's status
   bar (indicator location varies by version).
4. **If a specific ADR is load-bearing,** paste it into
   the chat as pinned context — automatic context loading
   does not always reach individual ADR files.

## Substrate Drift

Known gaps in the pre-Section-12 `.cursorrules` until a
future amendment aligns it with current substrate:

- **Rule C3 — "NEVER MODIFY TEST FILES."** Contradicts
  current practice. Section 12C.0 added anchor tests
  (`tests/unit/no-console-in-api-src.test.ts`,
  `tests/unit/audit-system-principals.test.ts`) and
  amended existing ones; this work is legitimate.
- **"Frontend: Next.js" tech-stack claim.** Misplaced.
  Foundation is backend-only; the frontend lives in the
  sibling `otzar-control-tower` repo (Vite + React).
- **No references to the docs/ structure.** No mention of
  ADRs, the architectural-anchors catalog, the glossary,
  or the contributing-guides layer — Section 12C.0.5
  substrate is invisible to a Cursor session reading only
  `.cursorrules`. Until amended, override gaps from the
  chat (e.g., "C3 doesn't apply to this anchor test").

## See Also

- `docs/contributing/codex-vs-claude-code.md` — when to
  reach for Cursor vs. another agent
- `docs/contributing/parallel-sessions.md` — concurrency
  and test-cycle discipline
- `CLAUDE.md` (Phase 3a replaces the current `claude.md`)
  — authoritative operational rules
- `AGENTS.md` (Phase 3b replaces the current file) —
  multi-LLM router
