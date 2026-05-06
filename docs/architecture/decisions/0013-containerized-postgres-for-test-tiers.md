# ADR-0013: Containerized Postgres for unit and integration tiers

## Status

Proposed 2026-05-06 (Track A architectural lock; will move to
Accepted when the Track A architectural-lock commit lands)

## Context

Tests run against real Supabase via `DATABASE_URL` +
`DIRECT_URL` per `schema.prisma`'s datasource. Per ADR-0010,
real-Supabase round-trips contribute to the 90-110 minute
full-suite runtime; ADR-0011 targets <60s for unit and <10min
for integration. Real Supabase is too slow for those targets.

Local Postgres in a container removes network latency without
losing real-database semantics. SQLite (rejected below) can't
host the JSONB columns, ENUM types, and PL/pgSQL triggers
Foundation depends on; running real Postgres locally is the
only credible path.

The audit chain has a `BEFORE DELETE` trigger per ADR-0002,
installed by the **runtime function** `applyAuditEventTriggers`
at `packages/database/src/queries/audit.ts:312-338` — idempotent
(DROP IF EXISTS before CREATE). Foundation does not maintain a
Prisma migrations history (per Track A recon Drift T-2), so the
trigger ships via this runtime function, not via a migration
file. The container bring-up must invoke it.

This ADR locks: runtime choice, image+version, three-step
bring-up, teardown discipline, env-var wiring, per-tier
integration with ADR-0011, and CI shape.

## Decision

**Container runtime: OrbStack on macOS.** Drop-in `docker` CLI,
native ARM64, ~2s Postgres startup. Docker Desktop is the
fallback for non-OrbStack environments and CI. Install via
`brew install orbstack`; Track A Gate 2 covers this before any
infrastructure code lands.

**Container image: `postgres:16-alpine`.** Postgres 16 matches
Supabase's default major; alpine is lightweight (~120MB).
Pinned to a specific minor+patch in `docker-compose.test.yml`
(e.g., `postgres:16.4-alpine`); version bumps are deliberate.

**Bring-up sequence (3 ordered steps):**

1. **`docker compose -f docker-compose.test.yml up -d`** with
   a `pg_isready` healthcheck — readiness gate for steps 2-3.
2. **`prisma db push --skip-generate`** reflects `schema.prisma`
   into the container (no migration replay; Foundation has no
   migration history per Drift T-2).
3. **`tsx scripts/apply-audit-triggers.ts`** invokes
   `applyAuditEventTriggers` (`audit.ts:312`); idempotent.
   Installs `audit_events_immutable` + `no_update` / `no_delete`
   triggers per ADR-0002.

**Teardown discipline:** between full-suite runs, `docker
compose down -v` removes container + volumes for clean state;
between tests within a run, the existing `cleanupTestData`
pattern from `tests/helpers.ts:78-116` (preserves the
trigger-disable-for-cleanup at helpers.ts:94-110).

**Env-var wiring:** `.env.test` (committed) names the
variables; `.env.test.local` (gitignored) is operator-
overridable. For local Postgres, `DATABASE_URL` = `DIRECT_URL`
= `postgresql://postgres:postgres@localhost:5433/foundation_test`
(port 5433 avoids collision with any system Postgres on 5432).

**Per-tier integration (per ADR-0011):**

- **Unit + integration tiers:** containerized Postgres + mock
  LLM (per ADR-0012). Container persists across the run;
  `cleanupTestData()` between tests.
- **Real-LLM tier:** real Supabase via existing `DATABASE_URL`
  / `DIRECT_URL`. Not affected by this ADR.

**CI integration:** GitHub Actions `services: postgres` for
unit + integration jobs. Real-LLM nightly job uses the same
container image on a `schedule` trigger. Per ADR-0011 gating,
unit + integration block PR/push; real-LLM blocks pre-release
tag promotion.

## Consequences

### Easier

- **Container startup ~2s; schema bring-up <15s.** Total
  infrastructure setup before tests start is under 20s vs.
  hundreds of ms per test against remote Supabase.
- **Tests no longer depend on Supabase availability.** Local
  development works offline; CI network flakiness goes away.
- **CI cost goes down.** No Supabase test-tier billing.
- **Per-test schema isolation becomes mechanically possible**
  if later needed (drop+recreate per test), though ADR-0011
  chose per-suite isolation as default.
- **Bring-up is reproducible** across developer machines + CI
  via `docker-compose.test.yml` + the bring-up script.

### Harder

- **Container runtime is a new prerequisite.** ADR-0011 names
  this; ADR-0013 specifies the install path (OrbStack via
  `brew install orbstack`).
- **Postgres major-version drift from Supabase is now a bug
  class.** If Supabase upgrades to 17, the local pin should
  follow; drift surfaces as 17-only feature failures (none
  used today; periodic verification needed).
- **Trigger SQL drift between local and production is a bug
  class.** If `applyAuditEventTriggers` SQL drifts from what
  Supabase expects, tests pass locally and fail in production.
  Mitigation: ADR-0002 is the spec of record; the function is
  the implementation reference; both version-controlled together.
- **No Prisma migration history means no schema-evolution
  audit trail.** Changes ship as `schema.prisma` diffs +
  `db push` output. Pre-dates Track A; ADR-0013 inherits the
  constraint, does not change it.
- **`docker-compose.test.yml` is now substrate.** Maintenance
  covers Postgres updates, image-vulnerability patches,
  healthcheck tuning.
- **CI bring-up can drift from local docker-compose.**
  Mitigation: a single `scripts/test-db-up.sh` used by both
  local and CI, with environment differences pushed to env vars.

## Alternatives Considered

### Embedded SQLite for tests

Reject. SQL dialect differs from Postgres (no JSONB, different
ENUM handling, no PL/pgSQL triggers). Tests would pass on
SQLite, fail in production. The whole point is realistic
database behavior.

### Continued real-Supabase test schema (status quo)

Reject. ADR-0010 documented the 90-110 minute cost; Track A
exists to fix it.

### Per-test containers (ephemeral DB per test)

Reject. 200-500ms × 482 tests = 1.6-4 minutes pure startup
overhead. ADR-0011 §Alternatives already addressed this;
revisit if intra-tier parallelization becomes desirable.

### Testcontainers (programmatic container management)

Reject. Adds a Java-flavored dependency that doesn't fit
Foundation's TypeScript-only substrate. docker-compose with a
health-checked service start has less surface area.

## References

- ADR-0002 (append-only audit chain) — defines the BEFORE
  DELETE trigger that bring-up step 3 applies
- ADR-0010 (tests are legitimately slow) — Track A motivation
- ADR-0011 (three-tier test stratification) — tiers consumed
  here
- ADR-0012 (test-mode LLM provider hardening) — companion
  ADR; mock + containerized Postgres define the tier
  infrastructure
- `packages/database/src/queries/audit.ts:312-338` —
  `applyAuditEventTriggers` (runtime function, NOT a
  migration)
- `packages/database/prisma/schema.prisma` — datasource block
- `tests/helpers.ts:78-116` — `cleanupTestData` /
  `ensureAuditTriggers` patterns preserved
- Track A Gate 4 introduces: `docker-compose.test.yml`,
  `scripts/test-db-up.sh`, `scripts/test-db-down.sh`,
  `scripts/apply-audit-triggers.ts`, `.env.test`,
  `.env.test.local`

Bidirectional citations (cited from):

- ADR-0011, ADR-0012 (forward-cite)
- `docs/contributing/testing.md`,
  `docs/contributing/parallel-sessions.md` (back-citations in
  Track A Gate 8)
- `docs/reference/architectural-anchors.md` — no anchor;
  containerization is infrastructure, not runtime invariant
