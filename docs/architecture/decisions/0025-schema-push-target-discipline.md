# ADR-0025: Schema-Push-Target Discipline

**Status**: Active
**Date**: 2026-05-12
**Trigger**: Production schema-push target drift caught at [D-2D-D10-4]
(`33a25c6`) per RULE 13 substrate-state observation — a bare
`npx prisma db push` auto-loaded `.env` from the repo root, whose
`DATABASE_URL` points at the production Supabase pooler, so an
intended test-DB schema change targeted **production** instead.
Forward-queue item 1 from the Sub-box 1 CLOSED narrative (Section 12.5).

## Context

Prisma's `prisma db push` is the development-tier schema-sync command —
it reconciles the database to `schema.prisma` without a migration
history (appropriate for the iterative test-tier workflow per ADR-0011
three-tier stratification + ADR-0013 containerized Postgres). Its
datasource block reads `env("DATABASE_URL")` (+ `env("DIRECT_URL")`),
and the Prisma CLI auto-loads `.env` from the repo root when no
explicit env is supplied.

Foundation's `.env` carries the **operator's working deployment**
credentials (production Supabase, per ADR-0018 deployment-target
agnosticism — the current operator deployment is Supabase-hosted);
`.env.test` carries the **containerized test DB** (`localhost:5433`,
per ADR-0013). The npm script chain is bare: `package.json`'s
`"db:push"` → `npm --workspace @niov/database run db:push` →
`packages/database/package.json`'s `"db:push": "prisma db push"` —
no env-target qualifier.

In **CI** this is safe: the workflow's `env:` block + the
`services: postgres` container set `DATABASE_URL` to the ephemeral
container *before* the `npm run db:push` step runs (verified at
`.github/workflows/ci.yml:92` + `:156` and
`.github/workflows/nightly-real-llm.yml:69`; CI workflow architecture
per ADR-0015). The trap is **local** invocation: running `npx prisma
db push` (or `npm run db:push`) from a developer's machine auto-loads
`.env` → production.

At [D-2D-D10-4] this drift fired: EDIT 1's first
`npx prisma db push --schema=packages/database/prisma/schema.prisma`
auto-loaded `.env` and applied the additive `requires_validation`
column to the **production** `memory_capsules` table before the
intended test-DB push. It was caught at the file-write tier per
RULE 13; the resolution (per the operator) was Option A — leave the
additive change (a new `NOT NULL DEFAULT false` column; no destructive
surgery; no runtime referrer until the commit deployed, at which point
production was already consistent with the deploying code; reverting
would itself have been a higher-risk `DROP COLUMN`). The test DB was
then synced with an explicit override:
`DATABASE_URL='postgresql://…localhost:5433/foundation_test' DIRECT_URL='…' npx prisma db push --schema=… --skip-generate`.
The same `npm run db:push` workflow had been used for [D-2D-D10-1]'s
EscalationRequest-tables push — near-certain that push also hit
production (same auto-load behavior); the production-state
confirmation query was skipped per the operator (the inference
sufficed for the resolution-path decision; skipping reduced
production-credential surface for zero substantive gain). Both landed
production schema changes are additive / default-valued / unreferenced
/ forward-compatible.

This ADR canonicalizes the discipline that prevents recurrence.

## Decision

Schema-push commands MUST use an explicit env-target qualifier.

1. **Wrapper script (canonical, once landed):**
   `scripts/prisma-db-push-test.sh` — loads `.env.test`, validates
   that `DATABASE_URL` points to `localhost` (fail-closed: if the
   resolved `DATABASE_URL` is anything other than a localhost target,
   the script exits non-zero without invoking Prisma), then runs
   `prisma db push --schema=packages/database/prisma/schema.prisma
   --skip-generate` with the validated env. The `--skip-generate` keeps
   client-regeneration a separate, explicit step. Forward-queue:
   [SEC-DBPUSH-WRAPPER].

2. **Explicit env override (interim, until the wrapper lands; also the
   permanent escape hatch for non-standard test targets):**
   `DATABASE_URL='<test-DB-url>' DIRECT_URL='<same>' npx prisma db push
   --schema=… --skip-generate` — the [D-2D-D10-4] Option A resolution
   pattern.

3. **CI (already safe; no change):** `npm run db:push` runs against the
   ephemeral container with the workflow-set `DATABASE_URL`. The CI
   substrate is verified safe (ADR-0015); this ADR does not change it.

4. **Production schema changes:** happen ONLY via the deploy pipeline.
   Never via a local `db:push`, even with an explicit env override.

A bare `npx prisma db push` (or `npm run db:push`) invoked locally —
with no env-target qualifier — is a discipline violation; the
forward-queued pre-commit hook check + CI guard ([SEC-DBPUSH-HOOK-CI])
mechanize the rejection.

## Rationale

- **Defense-in-depth.** The discipline is in force from this ADR;
  sessions follow it manually (as the [D-2D-D10-4] resolution already
  did, with the explicit `DATABASE_URL=` override). The automated
  enforcement (wrapper script + pre-commit hook check + CI guard)
  follows in [SEC-DBPUSH-WRAPPER] + [SEC-DBPUSH-HOOK-CI] — manual
  discipline and automated belt-and-suspenders together close the
  substrate gap.
- **Substrate-honest discipline per RULE 13.** The [D-2D-D10-4] drift
  was caught at the file-write tier via a substrate-state observation,
  not at runtime. This ADR canonicalizes the lesson at the
  canonical-record register so the catch is preserved as
  patent-implementation-record evidence of substrate-honest operation.
- **Future-session-loading per RULE 17.** A future Claude Code session
  (or contributor) reads this ADR before invoking any schema-push
  command; "use the wrapper, not bare `prisma db push`" is loadable
  substrate at the canonical-record register.
- **Cross-section dependency.** Extends ADR-0024 (pre-commit-hook
  posture) by adding a db-push guard to `.husky/pre-commit`; consumes
  ADR-0013 (containerized Postgres for the test tiers) as the canonical
  `localhost:5433` target the wrapper validates against.

## Consequences

- **The two landed production schema changes stand.** [D-2D-D10-1]'s
  EscalationRequest tables (+ `EscalationStatus` / `EscalationType`
  enums) and [D-2D-D10-4]'s `requires_validation` column are additive,
  forward-compatible, default-valued where applicable, and unreferenced
  on production until the corresponding code deploys. Per the
  [D-2D-D10-4] Option A resolution: no revert.
- **Future schema changes** use the wrapper (once landed) or the
  explicit env override (interim). Test-DB sync remains the canonical
  development workflow; `prisma generate` against the same env-override
  is the separate client-regeneration step.
- **Production schema changes** sequence ONLY through the deploy
  pipeline. This ADR enforces the separation at the canonical-record
  register; the deploy pipeline's own schema-change mechanism (migration
  history vs `db push`) is out of scope here.
- **Forward-queue work locked** within the [SEC-DBPUSH] mini-arc:
  [SEC-DBPUSH-WRAPPER] (`scripts/prisma-db-push-test.sh`) →
  [SEC-DBPUSH-HOOK-CI] (pre-commit hook db-push guard per ADR-0024 + CI
  workflow guard against bare `npx prisma db push`) → a glossary entry
  for `Schema-Push-Target Discipline` per RULE 17.

## Alternatives Considered

- **`prisma migrate` instead of `db push` for the test tier** —
  Rejected. Migrations are heavier substrate (migration history;
  up/down semantics) appropriate for a production schema-change
  pipeline; the test-tier `db push` is the right tool for the iterative
  development workflow (ADR-0011 three-tier stratification + ADR-0013
  containerized Postgres canonical for the test tier) — it just needs
  the env-target qualifier. Adopting `migrate` would be a substantive
  workflow change out of scope for this discipline ADR.
- **Renaming `.env` / a `prisma.config.ts` `env()` override** —
  Rejected. Foundation conventions use `.env` for the operator's
  working deployment (production credentials per ADR-0018); renaming it
  would break the standard Prisma CLI auto-load that production deploys
  rely on. The wrapper script is the discipline-additive layer that
  leaves `.env` semantics intact.
- **Status "Proposed" until the wrapper / hook / CI guard land** —
  Rejected. The decision is decisive now; the [D-2D-D10-4] resolution
  already followed the discipline manually. The automated enforcement
  follows in subsequent commits; the rule is in force from this ADR
  (mirrors how ADR-0024 framed the pre-commit hook — the RULE 16
  invariant pre-existed at the TEST/CI tiers; the hook added a
  git-hook-tier enforcement layer).

## References

- ADR-0024 (Pre-Commit-Hook Posture) — the canonical pre-commit hook
  substrate the db-push guard will extend in [SEC-DBPUSH-HOOK-CI].
- ADR-0013 (Containerized Postgres for Test Tiers) — the canonical
  `localhost:5433` test-DB target the wrapper script will validate
  against.
- ADR-0011 (Three-Tier Test Stratification) — the test-tier context
  (`db push` is the development-tier sync command for the unit /
  integration tiers).
- ADR-0010 (Foundation Tests Are Legitimately Slow / 90-110 min
  real-Supabase baseline) — the legacy context for why `.env` points at
  a real (now production) deployment.
- ADR-0015 (CI Workflow Architecture) — the CI substrate that is
  already safe (workflow-set `DATABASE_URL` before `npm run db:push`).
- ADR-0018 (Deployment-Target Agnosticism Posture) — `.env` carries the
  operator's current Supabase-hosted deployment; the substrate is
  deployment-target agnostic.
- [D-2D-D10-4] commit `33a25c6` — the production schema-push target
  drift event; Observation 1 is the source-of-substance for this ADR.
- [D-2D-D10-1] commit `8202771` — near-certain analogous exposure (same
  workflow; EscalationRequest tables additive on production).
- Section 12.5 Sub-box 1 CLOSED narrative ([D-2D-D10-8] commit
  `5de8cef`) — forward-queue item 1 source documentation.
- `CLAUDE.md` RULE 13 (substrate-state observation discipline) — the
  substrate-honesty register at which the [D-2D-D10-4] catch occurred.
- `CLAUDE.md` RULE 17 (architectural-framing load-on-open) — the
  canonical-record-register loadability this ADR provides.

Bidirectional citations (cited from):

- `docs/reference/section-12-progress.md` Sub-box 1 CLOSED narrative —
  forward-queue item 1 amended at [SEC-DBPUSH-ADR] to reflect ADR-0025
  landed.

## Forward Queue

Sequenced subsequent commits within the [SEC-DBPUSH] mini-arc:

1. **[SEC-DBPUSH-WRAPPER]** — `scripts/prisma-db-push-test.sh`: loads
   `.env.test`, validates `DATABASE_URL` points to `localhost`
   (fail-closed), invokes `prisma db push --schema=… --skip-generate`
   with the validated env. Engineering substrate; a smoke test if
   substantively warranted.
2. **[SEC-DBPUSH-HOOK-CI]** — a pre-commit hook db-push guard (extends
   `.husky/pre-commit` per ADR-0024) + a CI workflow guard against bare
   `npx prisma db push` (extends `ci.yml` per ADR-0015). Engineering
   substrate; tests if substantively warranted.
3. **Glossary entry** — `Schema-Push-Target Discipline` canonical entry
   per RULE 17; may land with [SEC-DBPUSH-HOOK-CI] or as its own commit
   per substantive scope.
