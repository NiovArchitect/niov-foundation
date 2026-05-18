#!/usr/bin/env bash
# FILE: scripts/local-test-db-refresh.sh
# PURPOSE: Canonical local test DB refresh wrapper per ADR-0047
#          Sub-decision 4 (Q-PR-δ Option α) + ADR-0035 §9 38th
#          observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-OWNERSHIP-DRIFT.
#          Encodes the canonical 7-step refresh sequence at substrate-
#          build register substantively to recover the local test DB
#          when Ecto-owned tables block Prisma's data-loss safety
#          (cross-language data ownership boundary collision per
#          ADR-0033 §Decision 7 + Q-5BII-EXEC-5).
#
# CONNECTS TO:
#   - scripts/test-db-up.sh (canonical first-time bring-up; this
#     refresh script complements it for re-entry after Ecto state)
#   - scripts/prisma-db-push-test.sh (ADR-0025 schema-push-target
#     wrapper; invoked via `npm run db:push:test`)
#   - scripts/apply-pgvector-extension.ts (G3.3 substrate)
#   - scripts/apply-audit-triggers.ts (ADR-0002 substrate)
#   - scripts/apply-hnsw-index.ts (G3.3 substrate)
#   - apps/cosmp_router/priv/repo/migrations/* (Ecto-owned tables:
#     schema_migrations + idempotency_keys per ADR-0033 §Q-5BII-EXEC-5)
#   - docker-compose.test.yml (container niov-foundation-test-db on
#     localhost:5433 per ADR-0013)
#
# USAGE:
#   bash scripts/local-test-db-refresh.sh [--dry-run|--help]
#   --help     Print usage + safety boundaries + ADR citations.
#   --dry-run  Print planned 8-step sequence; do NOT execute any
#              DB-touching command.
#
# GOVERNANCE:
#   - RULE 0  — no production Supabase writes during local refresh;
#               localhost/127.0.0.1 + foundation_test + 5433 only;
#               hostname/db/port-only output; never log full URL.
#   - RULE 11 — Prisma/Ecto cross-language data ownership boundary
#               preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5.
#               Drops ONLY Ecto-owned local tables (schema_migrations +
#               idempotency_keys); NEVER drops Prisma-owned shared
#               tables (Entity / MemoryCapsule / AuditEvent /
#               OrgSettings / etc.).
#   - RULE 13 — substrate-honest fail-closed validation at host + db
#               + port (β-4); error messages cite ADRs.
#   - RULE 20 — Founder-authorized via PR.3
#               [PR-HARDENING-LOCAL-DB-AND-PARITY-PR.3-EXECUTE-VERIFY-AUTH];
#               no production-affecting actions.
#
# SAFETY BOUNDARY:
#   This script targets the LOCAL test DB ONLY. Production schema
#   changes go through the deploy pipeline, never via this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_TEST_PATH="$REPO_ROOT/.env.test"
DRY_RUN=0

# WHAT: Print usage + safety boundaries.
# WHY: --help is non-destructive; safe to invoke without DB access.
print_help() {
  cat <<'EOF'
scripts/local-test-db-refresh.sh — canonical local test DB refresh.

USAGE:
  bash scripts/local-test-db-refresh.sh [--dry-run|--help]

FLAGS:
  --help     Print this usage block + ADR citations.
  --dry-run  Print planned 8-step sequence; skip all DB-touching
             commands. Safe to invoke at any time.

CANONICAL 8-STEP SEQUENCE (per ADR-0047 Sub-decision 4 / Q-PR-δ α):
  1. docker compose -f docker-compose.test.yml up -d postgres
     (gated; idempotent re-entry)
  2. Validate target = localhost / foundation_test / 5433 (β-4
     fail-closed)
  3. DROP TABLE IF EXISTS schema_migrations CASCADE; DROP TABLE
     IF EXISTS idempotency_keys CASCADE  (Ecto-owned ONLY; Prisma-
     owned shared tables UNTOUCHED)
  4. npx tsx scripts/apply-pgvector-extension.ts  (G3.3 substrate)
  5. npm run db:push:test  (ADR-0025 wrapper; restores Prisma-owned
     shared schema)
  6. npx tsx scripts/apply-audit-triggers.ts  (ADR-0002 substrate)
  7. npx tsx scripts/apply-hnsw-index.ts  (G3.3 substrate)
  8. MIX_ENV=test mix ecto.migrate  (restores Ecto-owned
     schema_migrations + idempotency_keys tables per ADR-0033
     §Q-5BII-EXEC-5)

SAFETY BOUNDARIES (per RULE 0 + RULE 11 + RULE 13 + RULE 20):
  - Fail-closed if DATABASE_URL host is not localhost/127.0.0.1
  - Fail-closed if database name is not 'foundation_test'
  - Fail-closed if port is not 5433
  - Drops ONLY Ecto-owned tables: schema_migrations + idempotency_keys
  - Never prints full DATABASE_URL or credentials; only host/db/port
  - No production Supabase writes
  - No mutation of Prisma-owned shared tables

CITATIONS:
  ADR-0035 §9 38th observation D-LOCAL-DEV-ENV-CROSS-LANGUAGE-
    OWNERSHIP-DRIFT (this script closes this observation at
    canonical-execution register substantively)
  ADR-0047 Sub-decision 4 (Q-PR-δ LOCK Option α)
  ADR-0033 §Decision 7 + §Q-5BII-EXEC-5 (cross-language data
    ownership boundary)
  ADR-0025 (Schema-Push-Target Discipline; canonical wrapper at
    scripts/prisma-db-push-test.sh)
  ADR-0013 (containerized localhost:5433 Postgres test DB)
EOF
}

# Argument parsing: support --help and --dry-run.
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      print_help
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      echo "ERROR: unknown argument '$arg'." >&2
      echo "       Use --help for usage." >&2
      exit 1
      ;;
  esac
done

# Fail-closed check (a): .env.test absent.
if [[ ! -f "$ENV_TEST_PATH" ]]; then
  echo "ERROR: .env.test not found at $ENV_TEST_PATH." >&2
  echo "       Per ADR-0013, the local refresh requires .env.test." >&2
  echo "       Aborting without any DB-touching action." >&2
  exit 1
fi

# Load .env.test into the environment (all values are local-only
# stubs per ADR-0013 — postgres/postgres credentials are public
# container defaults).
set -a
# shellcheck disable=SC1091
source "$ENV_TEST_PATH"
set +a

# Fail-closed check (b): DATABASE_URL unset or empty.
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set in .env.test." >&2
  echo "       Cannot determine the local refresh target." >&2
  echo "       Per ADR-0025: schema-push commands require an explicit env-target qualifier." >&2
  exit 1
fi

# WHAT: Extract the host segment from a postgresql:// URL.
# INPUT: A connection URL like postgresql://user:pass@host:port/db?params.
# OUTPUT: The host (echoed); e.g. "localhost". Never echoes the full URL.
# WHY: Per RULE 0, no secret content (username/password/db/full URL) may
#      be printed in error messages. Mirrors scripts/prisma-db-push-test.sh
#      extract_host pattern at canonical-substrate register substantively.
extract_host() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  if [[ "$url" == *"@"* ]]; then
    url="${url##*@}"
  fi
  url="${url%%:*}"
  url="${url%%/*}"
  printf '%s' "$url"
}

# WHAT: Extract the port segment from a postgresql:// URL.
# OUTPUT: The port (echoed); e.g. "5433". Never echoes the full URL.
extract_port() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  if [[ "$url" == *"@"* ]]; then
    url="${url##*@}"
  fi
  # Strip the host segment; expect "host:port/db..." remainder.
  if [[ "$url" == *":"* ]]; then
    local rest="${url#*:}"
    rest="${rest%%/*}"
    rest="${rest%%\?*}"
    printf '%s' "$rest"
  else
    printf '%s' ""
  fi
}

# WHAT: Extract the database name from a postgresql:// URL.
# OUTPUT: The db name (echoed); e.g. "foundation_test".
extract_db() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  if [[ "$url" == *"@"* ]]; then
    url="${url##*@}"
  fi
  # After host[:port], the path starts with /db?params
  if [[ "$url" == *"/"* ]]; then
    local rest="${url#*/}"
    rest="${rest%%\?*}"
    printf '%s' "$rest"
  else
    printf '%s' ""
  fi
}

DATABASE_URL_HOST="$(extract_host "$DATABASE_URL")"
DATABASE_URL_PORT="$(extract_port "$DATABASE_URL")"
DATABASE_URL_DB="$(extract_db "$DATABASE_URL")"

# Fail-closed check (c): host must be localhost / 127.0.0.1 (β-4).
if [[ "$DATABASE_URL_HOST" != "localhost" && "$DATABASE_URL_HOST" != "127.0.0.1" ]]; then
  echo "ERROR: DATABASE_URL host is '$DATABASE_URL_HOST', not localhost." >&2
  echo "       The local refresh wrapper refuses non-local hosts." >&2
  echo "       Per ADR-0025 + ADR-0047 Sub-decision 4 (Q-PR-β β-4): production schema" >&2
  echo "       changes go through the deploy pipeline, never via this script." >&2
  exit 1
fi

# Fail-closed check (d): database must be foundation_test (β-4).
if [[ "$DATABASE_URL_DB" != "foundation_test" ]]; then
  echo "ERROR: DATABASE_URL database is '$DATABASE_URL_DB', not foundation_test." >&2
  echo "       Per ADR-0013 + ADR-0047 Sub-decision 4 (Q-PR-β β-4): the canonical local" >&2
  echo "       test DB name is foundation_test." >&2
  exit 1
fi

# Fail-closed check (e): port must be 5433 (β-4).
if [[ "$DATABASE_URL_PORT" != "5433" ]]; then
  echo "ERROR: DATABASE_URL port is '$DATABASE_URL_PORT', not 5433." >&2
  echo "       Per ADR-0013 + ADR-0047 Sub-decision 4 (Q-PR-β β-4): the canonical local" >&2
  echo "       test DB port is 5433." >&2
  exit 1
fi

echo "✓ Local refresh target validated: host=$DATABASE_URL_HOST db=$DATABASE_URL_DB port=$DATABASE_URL_PORT"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  echo "=== DRY-RUN MODE ==="
  echo "The following 8 steps WOULD execute against the validated local target:"
  echo "  1. docker compose -f docker-compose.test.yml --env-file .env.test up -d postgres"
  echo "  2. (validation already complete above)"
  echo "  3. docker exec niov-foundation-test-db psql -U postgres -d foundation_test"
  echo "     -c 'DROP TABLE IF EXISTS schema_migrations CASCADE;"
  echo "         DROP TABLE IF EXISTS idempotency_keys CASCADE;'"
  echo "  4. npx tsx scripts/apply-pgvector-extension.ts"
  echo "  5. npm run db:push:test"
  echo "  6. npx tsx scripts/apply-audit-triggers.ts"
  echo "  7. npx tsx scripts/apply-hnsw-index.ts"
  echo "  8. MIX_ENV=test mix ecto.migrate  (from repo root)"
  echo ""
  echo "Skipping all DB-touching commands (--dry-run). No state mutated."
  exit 0
fi

# Step 1: docker compose up postgres (idempotent re-entry).
echo "==> [1/8] Starting Postgres container (idempotent re-entry)..."
docker compose -f docker-compose.test.yml --env-file .env.test up -d postgres

echo "==> [1/8] Waiting for healthcheck..."
TIMEOUT=60
ELAPSED=0
until docker compose -f docker-compose.test.yml --env-file .env.test \
      ps postgres --format json | grep -q '"Health":"healthy"'; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Postgres container did not become healthy within ${TIMEOUT}s." >&2
    exit 1
  fi
done
echo "==> [1/8] Postgres healthy."

# Step 2: validation complete above (host + db + port).
echo "==> [2/8] Target validated (host=$DATABASE_URL_HOST db=$DATABASE_URL_DB port=$DATABASE_URL_PORT)."

# Step 3: Drop ONLY Ecto-owned local tables.
#   Per ADR-0033 §Decision 7 + Q-5BII-EXEC-5: Prisma owns shared-table
#   DDL; Ecto owns Elixir-internal DDL. The two Ecto-owned tables on
#   the local test DB are:
#     - schema_migrations  (Ecto framework auto-created)
#     - idempotency_keys   (Ecto migration:
#                            apps/cosmp_router/priv/repo/migrations/
#                            20260514040407_create_idempotency_keys.exs)
#   Prisma-owned shared tables (Entity / MemoryCapsule / AuditEvent /
#   OrgSettings / etc.) are NEVER touched by this step per RULE 11
#   cross-language ownership boundary discipline.
echo "==> [3/8] Dropping Ecto-owned local tables (schema_migrations + idempotency_keys)..."
docker exec niov-foundation-test-db psql -U postgres -d foundation_test -c \
  "DROP TABLE IF EXISTS schema_migrations CASCADE; DROP TABLE IF EXISTS idempotency_keys CASCADE;"

# Step 4: Apply pgvector extension.
echo "==> [4/8] Applying pgvector extension (G3.3 per ADR-0043)..."
npx tsx scripts/apply-pgvector-extension.ts

# Step 5: Restore Prisma-owned shared schema.
echo "==> [5/8] Pushing Prisma schema (via npm run db:push:test; ADR-0025 wrapper)..."
npm run db:push:test

# Step 6: Apply audit triggers (ADR-0002 BEFORE DELETE / UPDATE).
echo "==> [6/8] Applying audit triggers (ADR-0002)..."
npx tsx scripts/apply-audit-triggers.ts

# Step 7: Apply HNSW index.
echo "==> [7/8] Applying HNSW index (G3.3 per ADR-0043)..."
npx tsx scripts/apply-hnsw-index.ts

# Step 8: Restore Ecto-owned tables via mix ecto.migrate.
echo "==> [8/8] Running Ecto migrations (restores schema_migrations + idempotency_keys per ADR-0033 §Q-5BII-EXEC-5)..."
MIX_ENV=test mix ecto.migrate

echo ""
echo "✓ Local test DB refreshed canonical at host=$DATABASE_URL_HOST db=$DATABASE_URL_DB port=$DATABASE_URL_PORT"
echo "✓ Prisma-owned shared tables: restored via npm run db:push:test"
echo "✓ Ecto-owned tables (schema_migrations + idempotency_keys): restored via mix ecto.migrate"
echo "✓ pgvector extension + HNSW index + audit triggers: applied"
echo "✓ RULE 11 cross-language ownership boundary preserved per ADR-0033 §Decision 7 + Q-5BII-EXEC-5"
