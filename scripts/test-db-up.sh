#!/usr/bin/env bash
# Foundation test database bring-up.
# Implements the 3-step bring-up from ADR-0013 §Decision.
# Idempotent: safe to run repeatedly.
# Step 2 (schema push) goes through scripts/prisma-db-push-test.sh per
# ADR-0025 (Schema-Push-Target Discipline) -- fail-closed localhost
# validation, never a bare `npx prisma db push` (the [D-2D-D10-4] trap).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/5] Starting Postgres container..."
docker compose -f docker-compose.test.yml --env-file .env.test up -d

echo "==> [1/5] Waiting for healthcheck..."
TIMEOUT=60
ELAPSED=0
until docker compose -f docker-compose.test.yml --env-file .env.test \
      ps postgres --format json | grep -q '"Health":"healthy"'; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Postgres container did not become healthy within ${TIMEOUT}s"
    exit 1
  fi
done
echo "==> [1/5] Postgres healthy."

# Load .env.test for DATABASE_URL + DIRECT_URL
set -a
# shellcheck disable=SC1091
source .env.test
set +a

echo "==> [2/5] Applying pgvector extension (CREATE EXTENSION vector; MUST run before db push so the vector type is registered for the embedding Unsupported(\"vector(1536)\")? column per ADR-0043 G3.3 Q-G3.3-θ ordering)..."
npx tsx scripts/apply-pgvector-extension.ts

echo "==> [3/5] Pushing schema (via scripts/prisma-db-push-test.sh -- fail-closed localhost validation per ADR-0025)..."
bash scripts/prisma-db-push-test.sh

echo "==> [4/5] Applying audit triggers..."
npx tsx scripts/apply-audit-triggers.ts

echo "==> [5/5] Applying HNSW index (CREATE INDEX ... USING hnsw; MUST run after db push so the embedding column exists per ADR-0043 G3.3 Q-G3.3-θ ordering)..."
npx tsx scripts/apply-hnsw-index.ts

echo "==> Done. Test database ready at $DATABASE_URL with pgvector extension + HNSW index."
