#!/usr/bin/env bash
# FILE: scripts/prisma-db-push-test.sh
# PURPOSE: Schema-push wrapper for the localhost:5433 test DB
#          (foundation_test container per ADR-0013). Loads .env.test,
#          validates DATABASE_URL (and DIRECT_URL if set) point to
#          localhost, then invokes `prisma db push --schema=… --skip-generate`
#          with the validated env. Fail-closed: any validation failure
#          exits non-zero WITHOUT invoking Prisma.
# CONNECTS TO: ADR-0025 (Schema-Push-Target Discipline; canonical spec —
#                this script is Forward Queue item 1 of the [SEC-DBPUSH] mini-arc),
#              ADR-0013 (containerized localhost:5433 Postgres test DB),
#              ADR-0024 (forward-queue [SEC-DBPUSH-HOOK-CI] db-push guard
#                will reject a bare `npx prisma db push` in favour of this),
#              .env.test (the canonical test-DB env file),
#              packages/database/prisma/schema.prisma (the schema pushed).
# WHY: Prevents recurrence of the [D-2D-D10-4] production schema-push
#      target drift — a bare `npx prisma db push` auto-loads .env from
#      the repo root (the operator's production credentials per ADR-0018);
#      this wrapper pins the test-DB env target with fail-closed validation
#      so an intended test-DB push can never silently hit production.
#      Production schema changes go through the deploy pipeline, never here.
# USAGE: bash scripts/prisma-db-push-test.sh   (or: npm run db:push:test)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_TEST_PATH="$REPO_ROOT/.env.test"

# Fail-closed check (a): .env.test absent.
if [[ ! -f "$ENV_TEST_PATH" ]]; then
  echo "ERROR: .env.test not found at $ENV_TEST_PATH." >&2
  echo "       The test-DB wrapper requires .env.test (per ADR-0013 / ADR-0025)." >&2
  echo "       Cannot determine the schema-push target; aborting without invoking Prisma." >&2
  exit 1
fi

# Load .env.test into the environment (pins BOTH DATABASE_URL and DIRECT_URL to
# the local test DB — the canonical pin that survived the 1297-B incident).
set -a
# shellcheck disable=SC1091
source "$ENV_TEST_PATH"
set +a

# Phase 1297-B: delegate the actual BOTH-URL validation + push to the shared
# fail-closed guard (single source of truth). The guard requires BOTH
# DATABASE_URL and DIRECT_URL set + localhost, rejects cloud/production hosts and
# destructive flags, and prints only redacted host summaries. After sourcing
# .env.test above, the ambient env it validates is exactly the pinned test DB.
echo "✓ .env.test loaded; delegating to the db-push guard (BOTH-URL validation)."
exec bash "$REPO_ROOT/scripts/prisma-db-push-guard.sh" --skip-generate
