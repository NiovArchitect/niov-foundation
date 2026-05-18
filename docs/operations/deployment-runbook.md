# Foundation Deployment Runbook

## 1. FILE / PURPOSE / CONNECTS TO

**FILE**: `docs/operations/deployment-runbook.md`

**PURPOSE**: Canonical production-readiness deployment runbook for
NIOV Foundation per ADR-0047 Sub-decision 8 (Q-PR-ι Option α LOCK) +
ADR-0047 Sub-decision 10 pre-launch mandatory gate (Q-PR-λ Option β
LOCK). Documents the safe deploy / rollback / parity / observability
posture for Gap 3 pgvector embedding substrate + adjacent Foundation
surfaces. This is the operational substrate the PR.2 vitest config
hardening + PR.3 local refresh + production parity verifier
substantively support.

**CONNECTS TO**:

- ADR-0002 (append-only audit chain; BEFORE DELETE trigger discipline)
- ADR-0013 (containerized localhost:5433 Postgres test DB)
- ADR-0015 (CI workflow architecture; Decision E pgvector image pin)
- ADR-0018 (deployment-target agnosticism posture; Supabase + RDS +
  self-hosted parity)
- ADR-0019 (cryptographic-suite posture; secret-handling discipline)
- ADR-0020 (two-register IP discipline; patent-implementation evidence
  lineage)
- ADR-0025 (Schema-Push-Target Discipline; production schema changes
  go through deploy pipeline, never via local db push)
- ADR-0033 §Decision 7 + §Q-5BII-EXEC-5 (Prisma/Ecto cross-language
  data ownership boundary)
- ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-
  PRODUCTION-SUPABASE (closed at PR.2 commit `57edb3b`)
- ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
  OWNERSHIP-DRIFT (closed at PR.3 commit `bb26126`)
- ADR-0037 (jurisdiction tagging substrate; columns checked by parity
  verifier)
- ADR-0042 (capsule mutation discrimination; mutation_type column
  checked by parity verifier)
- ADR-0043 (pgvector embedding + HNSW substrate; Gap 3 CLOSED at G3.10
  commit `08b10ef`)
- ADR-0047 (Post-Gap-3 Production-Readiness Hardening Mini-Arc; this
  runbook closes PR.4 at canonical-execution register substantively)
- `vitest.config.ts` (PR.2 hardened fail-closed default; commit
  `57edb3b`)
- `tests/unit/test-env-config-safety.test.ts` (PR.2 guard test)
- `scripts/local-test-db-refresh.sh` (PR.3 canonical local refresh;
  commit `bb26126`)
- `scripts/verify-production-parity.ts` (PR.3 read-only parity
  verifier; commit `bb26126`)
- `scripts/apply-pgvector-extension.ts` (G3.3 substrate)
- `scripts/apply-audit-triggers.ts` (ADR-0002 substrate)
- `scripts/apply-hnsw-index.ts` (G3.3 substrate)
- `scripts/prisma-db-push-test.sh` (ADR-0025 wrapper)
- `apps/cosmp_router/priv/repo/migrations/*` (Ecto-owned migrations
  per ADR-0033 §Q-5BII-EXEC-5)
- Patent **US 12,517,919** (COSMP)
- Patent **US 12,164,537** (DMW)
- Patent **US 12,399,904** (Foundation primitives)

## 2. Scope and Non-Goals

### What this runbook IS

- Operational reference for **local test DB refresh**, **production /
  staging schema parity verification**, **Gap 3 deploy order**, and
  **rollback posture** at canonical-prose register substantively
- Pre-launch mandatory substrate per ADR-0047 Sub-decision 10 (Q-PR-λ
  Option β LOCK)
- Source-of-truth for the no-production-write test discipline + the
  no-vector-leakage privacy discipline at canonical-rule register
  substantively per RULE 0

### What this runbook IS NOT

- NOT a production deploy automation script — production schema changes
  go through the deploy pipeline per ADR-0025; this runbook documents
  the discipline, NOT the automation
- NOT a substitute for explicit Founder authorization for production-
  affecting actions per RULE 20
- NOT a Sub-arc 2 closure document — Sub-arc 2 remains IN FLIGHT after
  PR.4 lands; Gap 4 / Gap 5 / Gap 6 closure cascades are separate
- NOT a customer-facing operations guide — this is internal substrate
  for the patent-holder operator + authorized contributors

## 3. Absolute Safety Boundaries

The following boundaries are enforced at canonical-rule register
substantively per RULE 0 + RULE 11 + RULE 13 + RULE 20:

1. **NO production deploy / migration without explicit Founder
   authorization.** All production-affecting actions require Founder
   authorization separate from any in-repo or in-runbook reference.
   The runbook documents the discipline; it does NOT authorize action.

2. **NO secrets printed in any operational output.** Full
   `DATABASE_URL` / `PARITY_DATABASE_URL` / `OPENAI_API_KEY` /
   `JWT_SECRET` values NEVER appear in logs, error messages, commit
   bodies, or audit details. Only hostnames / database names / ports
   are loggable per the PR.2 hardened `vitest.config.ts` + PR.3
   parity verifier privacy discipline.

3. **NO test writes against production targets.** The PR.2 hardened
   `vitest.config.ts` fail-closes against non-local DATABASE_URL by
   default (per ADR-0035 §9 37th observation closure). Tests run
   against containerized localhost:5433 Postgres only unless
   `ALLOW_PROD_TEST_ENV=1` is set explicitly + the call site is an
   authorized Founder-directed production-target verification.

4. **Parity verification is read-only only.** The PR.3 parity verifier
   uses PrismaClient `datasourceUrl` override + `$queryRawUnsafe`
   SELECT-only queries against `information_schema` / `pg_*` system
   tables. ZERO `$executeRaw` invocations; ZERO Prisma mutation verbs
   (`create` / `update` / `delete` / `upsert`).

5. **NO production data exfiltration via parity verifier.** Parity
   verifier queries only schema introspection metadata (column
   presence, extension presence, index presence, trigger presence,
   table presence). It does NOT query row data, payload content,
   vectors, embeddings, or any user-entity-owned substance.

6. **NO ad-hoc psql connections to production.** Production substrate
   is reachable ONLY through:
   - `scripts/verify-production-parity.ts` (read-only, schema metadata
     only, per PR.3)
   - The deploy pipeline (per ADR-0025)
   - Explicit Founder-authorized one-off operator-tier interventions
     (separate authorization per RULE 20)

## 4. Environment Classes

Foundation operates across multiple deployment-target classes per
ADR-0018 deployment-target agnosticism posture:

### 4.1 Local Test (containerized)

- Substrate: `docker-compose.test.yml` + `localhost:5433` +
  `foundation_test` database + `postgres:postgres` credentials (local-
  only stubs per ADR-0013)
- Env file: `.env.test` (committed substrate; not production)
- Bring-up: `bash scripts/test-db-up.sh` (initial; idempotent)
- Refresh: `bash scripts/local-test-db-refresh.sh` (re-entry after
  Ecto state contamination; canonical 8-step sequence per PR.3)

### 4.2 Staging / Production (Supabase pooler)

- Substrate: managed Supabase pooler endpoint at
  `<region>.pooler.supabase.com` (operator-deployed)
- Env file: `.env` (operator-private; production credentials)
- Schema changes: deploy pipeline ONLY per ADR-0025; NEVER via local
  `prisma db push` (the [D-2D-D10-4] trap)
- Parity verification: PR.3 `scripts/verify-production-parity.ts`
  with `PARITY_DATABASE_URL` explicit (read-only; no mutations)

### 4.3 AWS RDS for PostgreSQL (sovereign-cloud target)

- Substrate per ADR-0018 §Sub-decision 1: AWS RDS for PostgreSQL with
  pgvector 0.8.0+ available; KMS for secret management; IAM for
  authentication
- Status at canonical-state register substantively: untested at PR.4
  landing (no production deployment yet); deploy procedures forward-
  substrate when customer requirement surfaces

### 4.4 Self-Hosted (air-gapped + on-premise target)

- Substrate per ADR-0018 §Sub-decision 2: customer-provided Postgres
  16+ with pgvector manually installed; customer-provided KMS / IDP
- Status at canonical-state register substantively: untested at PR.4
  landing; deploy procedures forward-substrate when customer
  requirement surfaces

### Cross-environment parity statement

Foundation substrate is **deployment-target agnostic** per ADR-0018.
The Prisma schema + audit triggers + HNSW index substrate is portable
across all 4 environment classes. The PR.3 production parity verifier
checks schema parity at any target reachable via `PARITY_DATABASE_URL`
without requiring deployment-target-specific code paths.

## 5. Pre-Deploy Verification

Before any production deploy / migration, verify the following gates
at canonical-execution register substantively:

### 5.1 CI green on the deployment candidate commit

```
gh run list --limit 1
```

Expected: latest CI run for the deployment-candidate commit reports
4/4 success (Typecheck + Unit + Integration + Elixir).

### 5.2 TypeScript baseline preserved

```
npx tsc --noEmit 2>&1 | grep -E "^[^ ]+\.ts" | wc -l
```

Expected: `12` (preserved baseline per ADR-0015 Decision B). Any
increase above 12 is a TS-baseline regression and blocks deploy.

### 5.3 Full unit tier passes

```
npm run test:unit
```

Expected: `557/557 PASS` (552 baseline + 5 PR.2 guard tests).

### 5.4 Full integration tier passes

```
npm run test:integration
```

Expected: `211 passed + 1 skipped` (G3.6 baseline 4 + G3.9 NEW 4 =
8 similarity tests + other integration tests).

### 5.5 Elixir umbrella passes

```
MIX_ENV=test mix compile --force
MIX_ENV=test mix test
```

Expected: `219 tests, 0 failures, 1 skipped` (cosmp_router default
tier 219 + dbgi_supervisor 67/0 with 19 excluded).

### 5.6 PR.2 test safety boundary

The PR.2 hardened `vitest.config.ts` MUST fail-close against
non-local DATABASE_URL by default. Manually verify with the canonical
fake-credential probe:

```
ALLOW_PROD_TEST_ENV=0 \
  DATABASE_URL='postgresql://fake-user:fake-pass@fake-host.example.com:5432/fake-db' \
  npx vitest run --config vitest.config.ts \
    tests/unit/test-env-config-safety.test.ts
```

Expected: vitest throws at config-load time with hostname-only error;
fake credentials NEVER appear in output.

### 5.7 PR.3 parity dry-run

Before a production parity check, ALWAYS run `--dry-run` first to
verify the target host / database / port without DB connection:

```
PARITY_DATABASE_URL='postgresql://[redacted]@<target-host>:<port>/<db>' \
  npx tsx scripts/verify-production-parity.ts --dry-run
```

Expected: prints `host=<target-host> database=<db> port=<port>` +
11-check enumeration; ZERO DB connection; ZERO credential exposure.

## 6. Local Test DB Refresh

The PR.3 canonical local refresh wrapper at
`scripts/local-test-db-refresh.sh` encodes the canonical 8-step
sequence per ADR-0035 §9 38th observation closure + ADR-0033
§Decision 7 + §Q-5BII-EXEC-5 cross-language data ownership boundary
discipline.

### When to invoke

- After local Postgres container reset / volume wipe
- After `mix ecto.migrate` leaves Ecto-owned `schema_migrations` +
  `idempotency_keys` tables that block subsequent
  `npm run db:push:test` invocations (per ADR-0035 §9 38th
  observation recurrence pattern)
- After substrate-build cycles that mutate the local test DB state

### Always run `--dry-run` first

```
bash scripts/local-test-db-refresh.sh --dry-run
```

Expected output: target validation (`host=localhost db=foundation_test
port=5433`) + 8-step planned sequence printed; ZERO DB-touching
commands executed.

### Then run the full refresh

```
bash scripts/local-test-db-refresh.sh
```

The script will:

1. `docker compose up -d postgres` (idempotent)
2. Validate `host ∈ {localhost, 127.0.0.1}` + `database = foundation_test`
   + `port = 5433` (fail-closed per Q-PR-β β-4 LOCK)
3. Drop ONLY Ecto-owned tables (`schema_migrations` +
   `idempotency_keys` per ADR-0033 §Q-5BII-EXEC-5); Prisma-owned
   shared tables NEVER touched (RULE 11 boundary)
4. `npx tsx scripts/apply-pgvector-extension.ts`
5. `npm run db:push:test` (ADR-0025 wrapper)
6. `npx tsx scripts/apply-audit-triggers.ts`
7. `npx tsx scripts/apply-hnsw-index.ts`
8. `MIX_ENV=test mix ecto.migrate` (restores Ecto-owned tables)

### Prisma/Ecto ownership boundary

Per ADR-0033 §Decision 7 + §Q-5BII-EXEC-5 canonical at canonical-state
register substantively:

- **Prisma owns shared-table DDL**: Entity, MemoryCapsule, AuditEvent,
  OrgSettings, EntityProfile, EntityMembership, ExternalEntities,
  EntityComplianceProfile, and all other models in
  `packages/database/prisma/schema.prisma`. Schema push via
  `scripts/prisma-db-push-test.sh` (ADR-0025 wrapper).
- **Ecto owns Elixir-internal DDL**: `schema_migrations` (Ecto
  framework auto-created) + `idempotency_keys` (Ecto migration
  `apps/cosmp_router/priv/repo/migrations/20260514040407_create_idempotency_keys.exs`).
  Migration via `MIX_ENV=test mix ecto.migrate`.

NEVER mix these boundaries. The local refresh script enforces the
boundary at canonical-execution register substantively: `DROP TABLE`
statements target ONLY the two Ecto-owned tables; Prisma-owned shared
tables are refreshed via `npm run db:push:test`.

## 7. Production / Staging Parity Verification

The PR.3 read-only parity verifier at
`scripts/verify-production-parity.ts` provides a safe path to verify
production / staging schema parity against the repo source-of-truth
canonical at canonical-state register substantively per ADR-0037 +
ADR-0042 + ADR-0043 + ADR-0002 substrate.

### Required environment

```
export PARITY_DATABASE_URL='postgresql://<user>:<pass>@<host>:<port>/<db>'
```

`PARITY_DATABASE_URL` MUST be set explicitly per Q-PR-ε α LOCK. The
verifier NEVER falls back to `DATABASE_URL` or loads `.env`.

### Always run `--dry-run` first

```
npx tsx scripts/verify-production-parity.ts --dry-run
```

Expected: WARNING banner + target metadata (`host=<host>
database=<db> port=<port>`) + 11-check enumeration; ZERO DB
connection.

### Then run the full parity check

```
npx tsx scripts/verify-production-parity.ts
```

The verifier connects via PrismaClient with `datasourceUrl` override
(read-only) and runs 11 SELECT-only checks against
`information_schema` / `pg_extension` / `pg_indexes` / `pg_trigger` /
`pg_tables` system tables.

### 11-check inventory

**REQUIRED checks (10)**:

1. `entities.jurisdiction` column (ADR-0037)
2. `memory_capsules.jurisdiction` column (ADR-0037)
3. `audit_events.jurisdiction` column (ADR-0037)
4. `org_settings.default_jurisdiction` column (ADR-0037)
5. `memory_capsules.mutation_type` column (ADR-0042)
6. `memory_capsules.embedding` column type `vector(1536)` (ADR-0043)
7. `pgvector` extension installed (ADR-0043)
8. `memory_capsules_embedding_hnsw_idx` index exists (ADR-0043)
9. `audit_events_no_delete` trigger present (ADR-0002)
10. `audit_events_no_update` trigger present (ADR-0002)

**INFORMATIONAL check (1)**:

11. `idempotency_keys` table presence — Ecto-owned per ADR-0033
    §Q-5BII-EXEC-5; production target may or may not have Elixir/BEAM
    deployed yet; absence is NOT a drift

### Exit codes (machine-readable per Q-PR-η LOCK)

- `0` — no drift; all REQUIRED checks PASS; target is at repo source-
  of-truth parity
- `1` — usage / runtime / auth / config error (missing
  `PARITY_DATABASE_URL`; localhost without `ALLOW_LOCAL_PARITY_CHECK=1`;
  connection failure; invalid env)
- `2` — drift found; one or more REQUIRED checks FAILED; production
  schema is behind the repo source-of-truth

### Localhost targeting (defense-in-depth)

The parity verifier refuses localhost targets unless
`ALLOW_LOCAL_PARITY_CHECK=1` is set explicitly. For local test DB
verification, use `scripts/local-test-db-refresh.sh` instead — it is
the canonical local-DB path.

### What parity verification IS NOT

- NOT a production migration tool — drift detection only
- NOT a substitute for the deploy pipeline per ADR-0025 — production
  schema changes go through deploy automation, NEVER via this script
- NOT a tool to query row data — only schema introspection metadata

## 8. Gap 3 Deploy Order

For a Gap 3 pgvector embedding substrate deployment to a fresh
production / staging target (canonical 6-step sequence; mirrors CI
provisioning per `.github/workflows/ci.yml` Decision E):

### 8.1 pgvector extension

```
CREATE EXTENSION IF NOT EXISTS vector;
```

MUST run BEFORE Prisma schema push so the `vector(1536)` type is
registered when `prisma db push` tries to create the `embedding`
column on `memory_capsules` per ADR-0043 §G3.3.

### 8.2 Prisma schema push / migration discipline

For production targets, MUST go through the deploy pipeline per
ADR-0025. NEVER via local `prisma db push` (the [D-2D-D10-4] trap).
The deploy pipeline uses Prisma migrations with version control + a
production-target authorization gate; the in-repo
`scripts/prisma-db-push-test.sh` wrapper is for the test DB ONLY and
will refuse any non-localhost target.

### 8.3 Audit triggers

Per ADR-0002 append-only audit chain:

```sql
CREATE OR REPLACE FUNCTION reject_audit_delete() ...;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events ...;
CREATE OR REPLACE FUNCTION reject_audit_update() ...;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events ...;
```

Both triggers MUST exist for RULE 10 (nothing is ever deleted) to be
enforced at the database level. The PR.3 parity verifier checks both
trigger presence (checks 9 + 10).

### 8.4 HNSW index

Per ADR-0043 §G3.3 + Q-G3.3-α/β/ε LOCKS:

```sql
CREATE INDEX IF NOT EXISTS memory_capsules_embedding_hnsw_idx
ON memory_capsules
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL AND deleted_at IS NULL;
```

Default parameters: m = 16, ef_construction = 64. MUST run AFTER
Prisma schema push (the `embedding` column must exist first). The
PR.3 parity verifier checks index presence (check 8).

### 8.5 Ecto migrations (Elixir/BEAM deployment only)

Per ADR-0033 §Decision Q-5BII-EXEC-5: Ecto owns Elixir-internal DDL.
On targets that deploy the Elixir/BEAM substrate (cosmp_router +
dbgi_supervisor), run:

```
MIX_ENV=prod mix ecto.migrate
```

This restores Ecto-owned `schema_migrations` + `idempotency_keys`
tables. Targets that do NOT deploy Elixir/BEAM substrate (TypeScript-
only deployments) skip this step; the parity verifier check 11 is
INFORMATIONAL and absence is not a drift.

### 8.6 Verification gates

After deploy completes, run the PR.3 parity verifier against the
deployed target:

```
PARITY_DATABASE_URL='postgresql://...' \
  npx tsx scripts/verify-production-parity.ts
```

Expected exit code: `0` (no drift). Any non-zero exit code BLOCKS
launch and requires investigation + remediation per RULE 13.

## 9. OpenAI Embedding Provider

### 9.1 Required environment variables

- `OPENAI_API_KEY` — required for `OpenAIEmbeddingProvider` (G3.4
  substrate per ADR-0043 §Sub-decision 3 + Q-G3-γ LOCK)
- `EMBEDDING_PROVIDER` — `openai` for production; `fixture` for tests
  (defaults to `fixture` when `NODE_ENV=test` per G3.6 server.ts
  injection point)

### 9.2 No vector leakage

Per RULE 0 + ADR-0043 §Sub-decision 7 (Q-G3-ζ LOCK):

- Raw vectors are NEVER returned in HTTP responses to users / AI
  agents / external clients
- Raw vectors are NEVER written to audit details
- `SimilarityService.searchBySimilarity` response shape contains
  `matches[].{capsule_id, capsule_type, payload_summary}` only — NO
  `vector`, `embedding`, or `distance` fields
- `CAPSULE_SIMILARITY_SEARCH` audit metadata contains allowed fields
  only: `query_length`, `topK`, `minSimilarity`, `result_count`,
  `filters_applied`, `embedding_generated` (+ degrade fields). NEVER
  raw query text, query keywords, vector hashes, embedding samples,
  or distance distributions

### 9.3 Degrade-on-failure expectations

Per ADR-0043 §Sub-decision 5 + Q-G3.5-α LOCK + G3.5 substrate:

- OpenAI provider failure (RATE_LIMIT / AUTH / PROVIDER_ERROR /
  DIMENSION_MISMATCH / VALIDATION) MUST NOT block capsule writes
- WriteService degrades gracefully: capsule persisted with `embedding
  = NULL`; audit metadata records `embedding_generated: false +
  embedding_failure_class + embedding_failure_message`
- SimilarityService excludes NULL-embedding capsules from results
  (per G3.6 §similarity.service.ts:308 `WHERE embedding IS NOT NULL`)
- Provider outage = degraded retrieval (fewer matches; some capsules
  invisible until embedding regeneration); CAPSULE_SIMILARITY_SEARCH
  audit emits SUCCESS with `result_count: 0` (NEVER DENIED per Q-G3.6-θ
  LOCK)

### 9.4 Provider outage behavior

If OpenAI is degraded for an extended period:

- New capsule writes continue to succeed; embedding column remains
  NULL on the new rows
- SimilaritySearch returns degraded results (NULL-embedding capsules
  excluded)
- When OpenAI recovers, NEW writes regenerate embeddings; legacy
  NULL-embedding capsules remain NULL until explicit backfill is
  Founder-authorized (per ADR-0043 §G3.7 SKIP record at commit
  `ee0b01b`; bulk-backfill remains forward-substrate)

## 10. Runtime Verification

After deploy + parity check PASS, verify runtime substrate at the
application boundary:

### 10.1 write → embedding

Issue a `POST /api/v1/cosmp/capsule` request with sample content.
Verify:
- Response `200 OK` with `capsule_id` + `version` + `content_hash` +
  `write_type`
- Response body contains NO `vector` / `embedding` / `distance`
  substring (RULE 0 privacy invariant per G3.5 + G3.9 J5 substrate)
- Audit row `CAPSULE_MUTATION_ADD` records `embedding_generated:
  true` + `model` + `dimensions: 1536` + `tokens_used` (production)
  OR `embedding_failure_class` (degrade path)

### 10.2 similarity search

Issue a `POST /api/v1/cosmp/search` request with sample query.
Verify:
- Response `200 OK` with `matches[]` containing
  `{capsule_id, capsule_type, payload_summary}` only
- Response body contains NO `vector` / `embedding` / `distance` /
  `cosine_distance` substring
- Audit row `CAPSULE_SIMILARITY_SEARCH` records allowed fields only

### 10.3 Privacy filters

Verify 6 RULE 0 SQL-tier filters are enforced via integration tests
at production scale:
- `wallet_id` (cross-wallet isolation)
- `deleted_at IS NULL` (soft-deleted exclusion)
- `ai_access_blocked = false` (AI-agent denial)
- `requires_validation = false` (pending-validation exclusion)
- `clearance_required <= caller.session.clearance_ceiling`
- `embedding IS NOT NULL` (NULL graceful exclusion)

Reference: G3.9 production-contract integration tests J5-J8 prove
this at substrate-build register substantively per ADR-0043 §G3.9
substrate.

### 10.4 Audit metadata safety

Sample 10-20 `CAPSULE_SIMILARITY_SEARCH` audit rows and verify
allowed fields only. Forbidden field names in `details` JSON:
- `query_text` (raw)
- `query_keywords` / `query_keywords_redacted`
- `vector_hash`
- `embedding_sample`
- `distances` / `cosine_distance`

### 10.5 No vector / embedding / distance response leakage

Sample 100+ HTTP responses across `/api/v1/cosmp/capsule` (POST +
PATCH) + `/api/v1/cosmp/search` + `/api/v1/cosmp/capsule/:id/content`.
Verify NONE contain `vector` / `embedding` / `distance` /
`cosine_distance` substrings in response body.

## 11. Rollback Posture

### 11.1 Code rollback

Foundation backend is stateless at the application layer.
Code-only rollback is safe via:

```
git revert <commit>
git push origin main
```

OR redeploy the previous deployment-target image. Rollback does NOT
require DB rollback if the database schema is forward-compatible.

### 11.2 DB rollback constraints

Per RULE 10 (nothing is ever deleted) + ADR-0002 (append-only audit
chain):

- The `audit_events` table has BEFORE DELETE + BEFORE UPDATE triggers
  enforced at DB level. Rollback CANNOT drop / truncate / delete
  audit rows.
- The `deleted_at` soft-delete pattern applies to all other rows.
  Rollback CAN restore soft-deleted rows by setting `deleted_at =
  NULL`.

### 11.3 Index / extension handling

- HNSW index drop is safe (loses retrieval performance; embeddings
  remain):
  ```sql
  DROP INDEX IF EXISTS memory_capsules_embedding_hnsw_idx;
  ```
- pgvector extension drop is destructive (drops all `vector`-typed
  columns + their data):
  ```sql
  DROP EXTENSION IF EXISTS vector;  -- DO NOT DO THIS without Founder authorization
  ```
- Recommendation: NEVER drop pgvector extension in rollback. Drop
  HNSW index only if pgvector subsystem must be temporarily disabled.

### 11.4 Provider disable / degrade path

If OpenAI must be disabled temporarily (e.g., cost spike, vendor
outage):

- Set `EMBEDDING_PROVIDER=fixture` (deterministic fixture-based
  provider; G3.4 substrate)
- Application behavior: capsule writes generate fixture vectors
  (SHA-256-deterministic); similarity search returns deterministic
  but semantically-degraded results
- This is a degraded-service mode; NOT a production-grade fallback
- Founder authorization required before flipping in production

### 11.5 Schema rollback

Schema changes that add columns are forward-compatible (rollback
leaves the column in place; old code ignores it). Schema changes
that remove columns or change types require explicit Founder-
authorized migration + rollback plan per ADR-0025.

## 12. Observability

### 12.1 Safe metrics only

Metrics that can be safely emitted to observability dashboards:

- Request volume (counts) at COSMP operation level
- Latency distributions at HTTP / DB / OpenAI provider level
- Error rates by `error_class` / `failure_class` (provider failures
  per ADR-0043 §G3.4 Q-G3.4-κ enumeration)
- `embedding_generated` rate (success / degrade ratio)
- Similarity search `result_count` distributions
- Audit chain depth (informational)

### 12.2 No raw query / vector logs

Logs MUST NOT contain:
- Raw `query_text` content from similarity searches
- Raw vector values from embedding generation
- Raw payload content from MemoryCapsule rows
- Full `DATABASE_URL` / `OPENAI_API_KEY` / `JWT_SECRET` values

Per ADR-0035 §9 37th observation D-VITEST-NPX-CONFIG-DEFAULT-LOADS-
PRODUCTION-SUPABASE closure (PR.2 commit `57edb3b`): hostname-only
logging discipline applies to ALL operational tooling.

### 12.3 Audit field allowed / forbidden

`CAPSULE_SIMILARITY_SEARCH` audit `details` JSON field policy:

**Allowed fields**:
- `query_length` (numeric character count, never the text)
- `topK` (numeric)
- `minSimilarity` (numeric, if applicable)
- `result_count` (numeric)
- `filters_applied` (array of named filter labels)
- `embedding_generated` (boolean)
- `embedding_failure_class` (one of 5 error_class enums; degrade
  path only)
- `embedding_failure_message` (short text; degrade path only)

**Forbidden fields** (RULE 0; G3.6 + G3.9 substrate):
- raw `query_text` or truncated query
- `query_keywords` or `query_keywords_redacted`
- query vector values (per dimension or summary)
- result vectors
- `vector_hash`
- `embedding_sample`
- `distances` or `cosine_distance` distributions
- per-dimension statistics

Same field discipline applies to `CAPSULE_MUTATION_ADD` /
`CAPSULE_MUTATION_UPDATE` / `CAPSULE_MUTATION_MERGE` /
`CAPSULE_MUTATION_NOOP` audit records (per ADR-0042 §G1.5 substrate).

## 13. Launch Checklist + Post-Launch Monitoring + Known Deferrals

### 13.1 Launch checklist (mandatory before live customers)

- [ ] CI green on the deployment-candidate commit (4/4 jobs)
- [ ] TS baseline at 12 (preserved)
- [ ] Full unit tier `557/557 PASS`
- [ ] Full integration tier `211 + 1 skipped PASS`
- [ ] Elixir umbrella `219 / 0 / 1 skipped`
- [ ] PR.2 vitest config hardening LANDED (commit `57edb3b` on
      origin/main)
- [ ] PR.3 production parity verifier LANDED (commit `bb26126` on
      origin/main)
- [ ] PR.4 deployment runbook LANDED (this commit)
- [ ] ADR-0047 Status `Accepted 2026-05-18`
- [ ] Parity verifier `--dry-run` against production target: target
      metadata validated; no DB connection
- [ ] Parity verifier full run against production target: exit `0`
      (no drift)
- [ ] Gap 3 deploy order followed on production target: pgvector
      extension → schema → audit triggers → HNSW index → (Ecto if
      applicable)
- [ ] Runtime verification at production: write → embedding →
      similarity search round-trip + privacy filter joint adversarial
      check + no-vector response leakage
- [ ] Observability metrics dashboard provisioned (safe metrics only)
- [ ] On-call rotation defined; runbook accessible to operators
- [ ] Founder explicit authorization for production launch per RULE 20

### 13.2 Post-launch monitoring

In the 72 hours post-launch:

- Monitor OpenAI embedding provider error rate; alert on >5% over
  any 1-hour window
- Monitor similarity search `result_count: 0` rate; alert if >50%
  over any 1-hour window (could indicate degraded retrieval)
- Monitor `audit_events` table growth rate (informational)
- Monitor HNSW index efficiency (sequential scan fallback alerts)
- Monitor 4xx / 5xx HTTP response rates at COSMP endpoints

### 13.3 Known deferrals (forward-substrate)

Items deliberately deferred at PR.4 closure; ALL require separate
Founder authorization to land:

- **TS baseline reduction**: 12 known TS errors per ADR-0015 Decision B;
  11 of 12 are not production-blocking; 1 of 12 is intentional
  deliberate-blocker per ADR-0021 (PRICING_TABLE incomplete forces
  CapsuleType extension authorization). Future TS-reduction arc may
  reduce baseline.
- **CI label freshness**: CI job labels read "Unit tier (371 tests)" +
  "Integration tier (111 tests + 1 skipped)" but actual baselines are
  `557/557` + `211 + 1 skipped`. LOW severity cosmetic.
- **Package.json aliases**: PR.3 scripts run via explicit `bash` /
  `npx tsx` invocations. Future ergonomics arc may add `db:refresh:test`
  + `verify:parity` aliases.
- **pgvector_ex naming drift**: ADR-0043 §Q-G3-θ references
  `pgvector_ex` (Hex package; old name); canonical name is `pgvector`.
  Cosmetic; reconcile at α-3 future Elixir vector access if/when
  Founder authorizes.
- **Gap 4 / ADR-0044 Decay Execution Formalization**: forward-substrate
  per ADR-0041 §Sub-decision 4 (Q-H LOCK; lazy-at-read default).
- **Gap 5 / ADR-0045 Capsule-Level Staleness Detection**: forward-
  substrate per ADR-0041 §Sub-decision 5 (Q-I LOCK; distinct from
  feedback-loop staleness).
- **Optional Gap 6 / ADR-0046 AI_AGENT EntityType-Discriminated Capsule
  Routing**: forward-substrate per ADR-0041 §Sub-decision 6 (Q-J LOCK;
  AI_AGENT remains EntityType NOT WalletType).
- **AWS RDS for PostgreSQL deployment**: forward-substrate per
  ADR-0018; deploy procedures + parity certification land when customer
  requirement surfaces.
- **Self-hosted deployment**: forward-substrate per ADR-0018; deploy
  procedures + parity certification land when customer requirement
  surfaces.
- **Production circuit breaker for OpenAI**: forward-substrate per
  ADR-0043 §Q-G3.5-θ + §Q-G3.6-θ LOCK explicit deferrals. Degrade-on-
  failure is the current canonical posture.
- **Observability metrics dashboard implementation**: forward-substrate;
  current canonical posture is logs only (Pino structured logger).
- **Secret rotation runbook**: forward-substrate; current canonical
  posture is `.env` / GitHub secrets only.

### 13.4 Sub-arc 2 continuation discipline

Per ADR-0047 Sub-decision 11 (Q-PR-μ LOCK Option α):

- **Gap 4 / ADR-0044 Decay Execution Formalization may start after
  PR.4 lands** (this commit).
- No parallel Gap 4 work during hardening (PR.4 closure satisfies
  the mini-arc gate).
- Sub-arc 2 closure cascade remains forward-substrate pending Gap 4
  + Gap 5 + optional Gap 6 + later Sub-arc 2 closure cascade per
  ADR-0041 CL.1 scope patch register substantively.

---

**This runbook is the canonical operational substrate for Foundation
production-readiness at PR.4 closure register substantively. Any
update to this document requires Founder authorization per RULE 20.
This file is the deploy-time / launch-time / parity-check-time
source of truth at canonical-prose register substantively per
ADR-0047 §Sub-decision 8 (Q-PR-ι Option α LOCK).**
