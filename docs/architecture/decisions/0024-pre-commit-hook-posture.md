# ADR-0024: Pre-Commit Hook Posture

**Status**: Active
**Date**: 2026-05-11
**Trigger**: Production-readiness audit pre-flight verification
surfaced git-hook substrate gap; rule enforcement currently only
at CI tier (post-push); rules-propagation concern (external
contributors) requires mechanical enforcement at git-hook tier.

## Context

Foundation pre-flight verification at production-readiness register
surfaced absence of git-hook enforcement: rule violations (TypeScript
errors beyond baseline, RULE 16 console-call leaks into `apps/api/src`)
were only caught at CI tier — *after* a commit lands on origin/main
and CI runs. The push→CI→fail→fix→re-push cycle is slow; external
contributors hit it after their work is already pushed.

Existing substrate has the **RULE 16 no-console invariant** enforced
canonical at TEST tier via `tests/unit/no-console-in-api-src.test.ts`
(the DRIFT 2 Option C anchor — per that test's header comment,
"Foundation does not yet have ESLint configured at the repo level...
DRIFT 2 was resolved with Option C: a runtime invariant test rather
than a static lint rule"). CI typecheck is canonical at
`.github/workflows/ci.yml:45` (`npx tsc --noEmit -p tsconfig.json`).
But neither runs *before* commit at the contributor's local register.

ESLint is substantively NOT canonical at Foundation (zero `.eslintrc.*`
/ `eslint.config.*`; no `lint` npm script; no `eslint` package). The
broader lint/format adoption is deferred to a future Foundation
lint/format/typecheck CI batch per the DRIFT 2 Option C precedent.

## Decision

Adopt **husky 9.x** (`^9.1.7`, caret pin canonical per existing
@fastify/* + 6+ caret-pin pattern); add `"prepare": "husky"` to root
`package.json` scripts (husky 9.x canonical install pattern — `npm
install` invokes `husky` which initializes `.husky/`).

Canonical `.husky/pre-commit` hook runs two checks in sequence,
exiting non-zero on first failure:

1. **typecheck** — `npx tsc --noEmit -p tsconfig.json` (mirrors CI
   canonical at `ci.yml:45`; catches TS errors locally before push;
   strict 12-error baseline per ADR-0015 Decision B applies — hook
   fails only if error count *exceeds* baseline)
2. **RULE 16 no-console invariant** — `npx vitest run
   tests/unit/no-console-in-api-src.test.ts --config
   vitest.unit.config.ts` (the DRIFT 2 Option C anchor; catches
   `console.{log,error,warn,info,debug}` leaks into `apps/api/src`
   before push)

Hook runtime: ~5-10s typical (typecheck + single test) — within
pre-commit patience tolerance.

## Rationale

- **typecheck mirrors CI** — contributor sees the same TS errors
  locally that CI would surface; no push→CI→fail round-trip for
  type errors.
- **RULE 16 test is the canonical no-console enforcement** — running
  it at pre-commit extends the DRIFT 2 Option C anchor from CI tier
  to git-hook tier; same failure-reporting shape (path:line of every
  offending call).
- **5-10s runtime** stays within pre-commit patience tolerance;
  contributors won't be tempted to habitually `--no-verify`.
- **ESLint deliberately excluded** — zero ESLint substrate per DRIFT
  2 Option C; including it here would be substantively-substantial
  scope expansion (config + adoption + CI alignment) outside this
  ADR's scope.

## Consequences

- Rules propagate to git-hook tier; external contributors are blocked
  at commit time (before push) on TS errors beyond baseline + RULE 16
  console leaks.
- Hook bypassable via `git commit --no-verify` — canonical husky
  behavior; intentional (emergency override preserved; CI remains the
  backstop for any `--no-verify` commit).
- `.husky/_/` internal directory is gitignored (husky 9.x convention:
  `.husky/_/.gitignore` contains `*`); only `.husky/pre-commit` is
  committed.
- 5 moderate-severity vulnerabilities surface in `npm install`'s
  default audit — these are PRE-EXISTING in the `vitest` devDependency
  tree (`esbuild <=0.24.2` dev-server leak + `vite <=6.4.1` path
  traversal, transitively via vitest@^2.1.8 → vite → esbuild); NOT
  introduced by husky. `npm audit --omit=dev` remains 0 vulnerabilities
  (dev-only impact; test runner; not shipped to production). Fix
  requires `vitest@4.1.6` breaking upgrade — forward queue candidate
  per ADR-0016 Pin-and-Optimize Framework + Track A test-infrastructure
  ADRs (ADR-0010/0011/0012/0013/0014).
- Future ESLint adoption (if it lands) would extend the hook with
  `eslint --fix` via lint-staged; deferred per DRIFT 2 Option C.

## Alternatives Considered

- **No hook** — rejected; rules-propagation concern (external
  contributors) requires mechanical enforcement; CI-only enforcement
  is too slow (post-push round-trip).
- **Native git hooks (`.git/hooks/pre-commit`)** — rejected; not
  portable across clones (`.git/hooks/` is not version-controlled);
  husky's `.husky/` *is* version-controlled.
- **ESLint inclusion in the hook** — rejected; zero ESLint substrate
  per DRIFT 2 Option C (see `tests/unit/no-console-in-api-src.test.ts`
  header); adding ESLint is substantively-out-of-scope.
- **lint-staged inclusion** — rejected; lint-staged operates per-file
  via configured linters (`eslint --fix`, `prettier --write`);
  Foundation has neither; typecheck is project-wide not per-file —
  substantively-mismatched with lint-staged's purpose. Defer if
  ESLint adoption becomes canonical.
- **Full unit tier at pre-commit** — rejected; ~60-80s runtime
  exceeds patience tolerance; duplicates CI; the RULE 16 single-test
  filter captures the substantive pre-commit-relevant invariant.

## References

- RULE 16 (no `console.*` in `apps/api/src`) at `CLAUDE.md` — this
  ADR adds the git-hook enforcement tier to RULE 16's existing
  TEST-tier enforcement
- `tests/unit/no-console-in-api-src.test.ts` (DRIFT 2 Option C
  anchor; the canonical no-console invariant the hook runs)
- `.github/workflows/ci.yml:45` (CI typecheck canonical the hook
  mirrors)
- ADR-0015 (CI Workflow Architecture; strict 12-error TypeScript
  baseline at Decision B)
- ADR-0016 (Pin-and-Optimize Framework; caret pin discipline; vitest
  4.x upgrade as forward queue candidate for the 5 moderate dev-tree
  vulns)
- ADR-0023 (security-headers-posture; prior posture-tier ADR; same
  production-readiness audit lineage)
- ADR-0005 (no `console.*` in `apps/api/src`; the original DRIFT 2
  Option C decision record)
- RULE 13 substrate-honest discipline (substrate truth surfaced
  before edits chained — the pre-existing-vs-introduced vuln
  distinction surfaced at pre-flight)

Bidirectional citations (cited from):

- ADR-0025 (Schema-Push-Target Discipline; landed in [SEC-DBPUSH-ADR]
  on 2026-05-12) — canonicalizes the schema-push-target discipline that
  will extend this ADR's pre-commit hook substrate with a db-push guard
  (forward-queued at [SEC-DBPUSH-HOOK-CI]). The hook substrate canonical
  here is the load-bearing extension point; ADR-0025's Decision section
  names this ADR as the canonical extension target.

## Forward Queue

- **ESLint adoption** (lint/format/typecheck CI batch per DRIFT 2
  Option C deferral); if it lands, extend `.husky/pre-commit` with
  `lint-staged → eslint --fix`.
- **vitest 4.x upgrade** to clear the 5 moderate dev-tree
  vulnerabilities (`esbuild` dev-server leak + `vite` path
  traversal); breaking change; per ADR-0016 Pin-and-Optimize
  Framework.
- **commit-msg hook** (optional) — enforce the `[SECTION-XX-PREFIX]`
  commit subject convention mechanically.
