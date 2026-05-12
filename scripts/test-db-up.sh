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

echo "==> [1/3] Starting Postgres container..."
docker compose -f docker-compose.test.yml --env-file .env.test up -d

echo "==> [1/3] Waiting for healthcheck..."
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
echo "==> [1/3] Postgres healthy."

# Load .env.test for DATABASE_URL + DIRECT_URL
set -a
# shellcheck disable=SC1091
source .env.test
set +a

echo "==> [2/3] Pushing schema (via scripts/prisma-db-push-test.sh -- fail-closed localhost validation per ADR-0025)..."
bash scripts/prisma-db-push-test.sh

echo "==> [3/3] Applying audit triggers..."
npx tsx scripts/apply-audit-triggers.ts

echo "==> Done. Test database ready at $DATABASE_URL"
