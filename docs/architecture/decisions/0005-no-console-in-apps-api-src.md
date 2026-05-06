# ADR-0005: No `console.*` in `apps/api/src` (DRIFT 2 Option C)

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 2 @ `f3359fb`)

## Context

`console.{log,error,warn,info,debug}` output bypasses Pino's
structured logging and its redact paths. Two failure modes that
matter:

- **PII leakage.** Structured logger redact paths cover
  credentials (authorization, cookie, token), user PII (email),
  cryptographic material (public_key), and Otzar conversation
  content (message). `console.*` calls bypass these redactions,
  leaking sensitive data to stdout/stderr.
- **SIEM ingestion breaks.** Pino emits JSON-line output that
  SIEM systems (Splunk, Datadog Cloud SIEM, Sentinel, Chronicle)
  consume directly. `console.*` output is unstructured text;
  ingestion either drops it or treats it as a single opaque
  string field.

Section 12C.0 Item 8 introduced the structured logger
(`apps/api/src/logger.ts`) and migrated 9 `console.*` call sites
in `apps/api/src` to either the module logger or request-scoped
`request.log.*` / `fastify.log.*`. The migration was successful
but the architectural property — "zero `console.*` in
apps/api/src" — needed runtime enforcement to prevent
regression.

ESLint's no-console rule was considered (DRIFT 2 Option A) but
deferred: introducing ESLint to the repo for one rule was
disproportionate. A custom Vitest invariant (DRIFT 2 Option C)
provides the same enforcement at lower setup cost.

## Decision

Foundation enforces zero
`console.{log,error,warn,info,debug}` CALL sites in
`apps/api/src` via the runtime invariant test
`tests/unit/no-console-in-api-src.test.ts`. The test:

- Walks `apps/api/src/` recursively
- Greps each `.ts` file for the call pattern
  `console\.(log|error|warn|info|debug)\(` (with trailing paren
  to distinguish call sites from JSDoc literal mentions)
- Asserts zero matches; on failure, reports every offending
  `path:line` in the failure message

All operational logging in `apps/api/src` goes through:

- `apps/api/src/logger.ts` module-level export (for boot-time
  and service-class contexts), or
- `request.log.*` / `fastify.log.*` (for request-scoped
  contexts)

## Consequences

### Easier

- Structured logging discipline is enforced at the test gate;
  regression caught on next CI run
- PII leakage via `console.*` output is structurally prevented
- SIEM ingestion remains uniform across all of `apps/api/src`

### Harder

- Adding a new module to `apps/api/src` requires either using
  the structured logger from line one OR breaking the invariant
  (forced choice; the test won't let you ship a module with
  `console.*` calls)
- Test fixtures and unit tests in `apps/api/tests` can still
  use `console.*` for test-debug purposes (the invariant scopes
  to `apps/api/src` only)
- The grep pattern requires maintenance if Pino's emission
  surface changes (e.g., a future logger refactor)

## Alternatives Considered

### ESLint no-console rule (DRIFT 2 Option A)

Deferred. Cost of introducing ESLint to the repo for a single
rule was disproportionate. ESLint can land later as part of a
broader linting batch without removing this anchor.

### Manual code review

Rejected. Not enforceable at scale; relies on reviewer
attention.

### Pre-commit hook

Rejected. Bypassed by `--no-verify`; runs outside the test gate.

## References

- `tests/unit/no-console-in-api-src.test.ts` (the runtime
  invariant)
- `apps/api/src/logger.ts` (the module-level structured logger)
- `docs/STRUCTURED_LOGGING_SCHEMA.md` (committed substrate;
  documents field schema and SIEM consumption recipe)
- `f3359fb` (Section 12C.0 Commit 2; introduces the anchor via
  Item 8)
- Section 12C.0 architectural lesson 3 (Call-vs-doc-literal
  grep discipline)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Architectural Anchor" (cites
  this ADR as a canonical example)
- `docs/reference/architectural-anchors.md` → entry 3 (DRIFT 2
  Option C)
