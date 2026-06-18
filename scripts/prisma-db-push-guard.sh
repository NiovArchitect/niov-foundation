#!/usr/bin/env bash
# FILE: scripts/prisma-db-push-guard.sh
# PURPOSE: Phase 1297-B — fail-closed AMBIENT-ENV guard for `prisma db push`.
#          Validates BOTH DATABASE_URL and DIRECT_URL before any push, so a
#          schema push can never reach production — not even when `.env` (the
#          operator's production creds) is the ambient source. This is the
#          generic guard the sanctioned npm entry points route through
#          (`db:push` at the root + the `@niov/database` workspace), and the
#          shared validation core the test wrapper (prisma-db-push-test.sh)
#          delegates to after pinning .env.test.
# CONNECTS TO:
#   - ADR-0025 (Schema-Push-Target Discipline; canonical spec — production
#       schema changes go through the deploy pipeline, NEVER via db push).
#   - scripts/prisma-db-push-test.sh (pins .env.test, then delegates here).
#   - package.json `db:push` + packages/database/package.json `db:push`.
#   - .husky/pre-commit db-push allowlist (this script is allowlisted because it
#       legitimately invokes `prisma db push` AFTER validation).
#   - tests/unit/db-push-guard.test.ts (the CI-enforced guard test).
# WHY: Phase 1297-B incident — a bare `npx prisma db push` with only
#      DATABASE_URL set inline let Prisma read DIRECT_URL from .env and apply an
#      (additive, unauthorized) schema write to PRODUCTION. The pre-commit guard
#      only inspects STAGED files; the wrapper was bypassed. This guard closes
#      the gap on every sanctioned path by validating the ambient env at push
#      time (Prisma's dotenv never overrides already-set vars, so what this
#      guard validates is exactly what Prisma uses).
# USAGE:
#   bash scripts/prisma-db-push-guard.sh                 # validate + push
#   bash scripts/prisma-db-push-guard.sh --check         # validate only (no push)
#   PRISMA_DB_PUSH_CHECK=1 bash scripts/prisma-db-push-guard.sh   # same as --check
# NON-NEGOTIABLES (per Founder Phase 1297-B):
#   - Both DATABASE_URL and DIRECT_URL must be set and point at localhost.
#   - No production escape path. Cloud/pooler hosts are rejected outright.
#   - Destructive flags (--accept-data-loss / --force-reset) are refused.
#   - Only redacted host summaries are printed (never credentials).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SCHEMA="packages/database/prisma/schema.prisma"
CHECK_ONLY=0
PASSTHRU=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    # Destructive flags are NEVER permitted through the guard — this flag was
    # the teeth of the 1297-B incident ("no destructive database action").
    --accept-data-loss|--force-reset)
      echo "ERROR: refusing destructive flag '$arg' — the guard never permits a destructive db push." >&2
      echo "       Destructive schema changes go through the deploy pipeline (ADR-0025), never here." >&2
      exit 1
      ;;
    *) PASSTHRU+=("$arg") ;;
  esac
done
if [[ "${PRISMA_DB_PUSH_CHECK:-}" == "1" ]]; then CHECK_ONLY=1; fi

# WHAT: Extract the host segment from a postgresql:// connection URL.
# INPUT: a URL like postgresql://user:pass@host:port/db?params.
# OUTPUT: the host (echoed); e.g. "localhost".
# WHY: validation needs the host; pure parameter-expansion (no external deps,
#      never echoes credentials).
extract_host() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  if [[ "$url" == *"@"* ]]; then url="${url##*@}"; fi
  url="${url%%:*}"
  url="${url%%/*}"
  printf '%s' "$url"
}

# WHAT: Fail-closed validation of one connection URL.
# INPUT: the env-var NAME + its value.
# OUTPUT: prints a redacted host summary; exits 1 on any violation.
validate_url() {
  local name="$1" url="$2"
  if [[ -z "$url" ]]; then
    echo "ERROR: $name is not set." >&2
    echo "       The db-push guard requires BOTH DATABASE_URL and DIRECT_URL to be set" >&2
    echo "       and to point at the local test DB. An unset $name is the 1297-B trap" >&2
    echo "       (Prisma would read it from .env -> production). Use: npm run db:push:test" >&2
    exit 1
  fi
  local host
  host="$(extract_host "$url")"
  # Belt-and-suspenders denylist scan (the localhost check below already rejects
  # every cloud host; this gives a clearer error and guards typos).
  local lower
  lower="$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')"
  for marker in supabase pooler amazonaws ".rds." neon.tech render.com azure.com cloud.; do
    if [[ "$lower" == *"$marker"* ]]; then
      echo "ERROR: $name host '$host' looks like a cloud/production target (matched '$marker')." >&2
      echo "       The db-push guard refuses non-local targets. Production schema changes go" >&2
      echo "       through the deploy pipeline (ADR-0025), never via db push." >&2
      exit 1
    fi
  done
  if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
    echo "ERROR: $name host is '$host', not localhost/127.0.0.1." >&2
    echo "       The db-push guard only permits the local test DB. Use: npm run db:push:test" >&2
    exit 1
  fi
  echo "  ✓ $name host: $host (local)"
}

echo "→ db-push guard (ADR-0025 / Phase 1297-B): validating ambient DATABASE_URL + DIRECT_URL"
validate_url "DATABASE_URL" "${DATABASE_URL:-}"
validate_url "DIRECT_URL" "${DIRECT_URL:-}"

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "✓ db-push guard: validation passed (--check; no push performed)."
  exit 0
fi

echo "✓ db-push guard: target validated (local). Invoking: prisma db push --schema=$SCHEMA"
# Safe expansion for a possibly-empty array under `set -u` (the no-extra-args
# CI path: `npm run db:push` passes nothing through).
npx prisma db push --schema="$SCHEMA" ${PASSTHRU[@]+"${PASSTHRU[@]}"}
echo "✓ db-push complete (local test DB)."
