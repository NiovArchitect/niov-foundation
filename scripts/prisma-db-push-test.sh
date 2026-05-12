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

# Load .env.test into the environment.
set -a
# shellcheck disable=SC1091
source "$ENV_TEST_PATH"
set +a

# Fail-closed check (b): DATABASE_URL unset or empty after sourcing .env.test.
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set in .env.test." >&2
  echo "       Cannot determine the schema-push target." >&2
  echo "       Per ADR-0025: schema-push commands require an explicit env-target qualifier." >&2
  exit 1
fi

# WHAT: Extract the host segment from a postgresql:// connection URL.
# INPUT: a URL like postgresql://user:pass@host:port/db?params.
# OUTPUT: the host (echoed); e.g. "localhost".
# WHY: the fail-closed check needs the host to verify it is localhost;
#      parsing is pure parameter-expansion (no external deps).
extract_host() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  # Strip a user:pass@ prefix if present.
  if [[ "$url" == *"@"* ]]; then
    url="${url##*@}"
  fi
  # Trim at the first ':' (port) or '/' (db path), whichever comes first.
  url="${url%%:*}"
  url="${url%%/*}"
  printf '%s' "$url"
}

DATABASE_URL_HOST="$(extract_host "$DATABASE_URL")"

# Fail-closed check (c): DATABASE_URL host must be localhost / 127.0.0.1.
if [[ "$DATABASE_URL_HOST" != "localhost" && "$DATABASE_URL_HOST" != "127.0.0.1" ]]; then
  echo "ERROR: DATABASE_URL host is '$DATABASE_URL_HOST', not localhost." >&2
  echo "       The test-DB wrapper refuses to push schema to a non-localhost target." >&2
  echo "       Per ADR-0025: production schema changes go through the deploy pipeline, never via db push." >&2
  echo "       If this is meant to be the test DB (foundation_test), check that .env.test DATABASE_URL points to localhost:5433." >&2
  exit 1
fi

# Fail-closed check (d): DIRECT_URL host (if set) must also be localhost.
if [[ -n "${DIRECT_URL:-}" ]]; then
  DIRECT_URL_HOST="$(extract_host "$DIRECT_URL")"
  if [[ "$DIRECT_URL_HOST" != "localhost" && "$DIRECT_URL_HOST" != "127.0.0.1" ]]; then
    echo "ERROR: DIRECT_URL host is '$DIRECT_URL_HOST', not localhost." >&2
    echo "       The test-DB wrapper refuses to use a non-localhost DIRECT_URL." >&2
    echo "       Per ADR-0025: production schema changes go through the deploy pipeline, never via db push." >&2
    exit 1
  fi
fi

# All fail-closed validation passed; invoke Prisma with the validated env.
echo "✓ Schema-push target validated: ${DATABASE_URL_HOST} (test DB)"
echo "  Invoking: prisma db push --schema=packages/database/prisma/schema.prisma --skip-generate"

npx prisma db push \
  --schema=packages/database/prisma/schema.prisma \
  --skip-generate

echo "✓ Schema-push complete (test DB)."
