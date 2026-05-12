#!/usr/bin/env bash
# FILE: scripts/test-db-push-wrapper.sh
# PURPOSE: Smoke test for scripts/prisma-db-push-test.sh — exercises the
#          canonical fail-closed paths + the happy path. Bash testing Bash;
#          manual invocation surface (NOT invoked by the pre-commit hook —
#          the tamper-restore + the container dependency make this a manual
#          smoke, not a fast hook check).
# CONNECTS TO: scripts/prisma-db-push-test.sh (the canonical wrapper under test),
#              ADR-0025 (Schema-Push-Target Discipline; canonical spec),
#              .env.test (the canonical test-DB env file; tampered + restored
#              under a trap so a mid-run crash cannot leave it tampered).
# CASES:
#   (a) .env.test absent          → wrapper exits 1   (mv away + back; safe)
#   (c) non-localhost DATABASE_URL → wrapper exits 1   (cp-backup + trap + sed-tamper)
#   happy path                    → wrapper exits 0   (container-gated; skips with
#                                                       a clear message if not up)
#   (b) DATABASE_URL unset — degenerate; the host-extraction / unset-var logic was
#       verified via the equivalent parameter-expansion eval at [SEC-DBPUSH-WRAPPER];
#       not exercised here (tampering .env.test's contents twice in one smoke run is
#       more restore-fragility than the degenerate case warrants). Per RULE 17 this
#       comment is the loadable record of why (b) is not in the smoke surface.
# USAGE: bash scripts/test-db-push-wrapper.sh   (or: npm run test:db-push-wrapper)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WRAPPER="scripts/prisma-db-push-test.sh"
ENV_TEST=".env.test"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1" >&2; FAIL=$((FAIL + 1)); }

# WHAT: run the wrapper, swallow its output, return its exit code.
# INPUT: none (the wrapper hard-codes its args).
# OUTPUT: echoes the exit code.
# WHY: the smoke test asserts on the exit code, not the output.
run_wrapper_exit() {
  set +e
  bash "$WRAPPER" >/dev/null 2>&1
  local code=$?
  set -e
  echo "$code"
}

# ── Case (a): .env.test absent → wrapper exits 1 ──────────────────
echo "==> [Smoke 1/3] Case (a): .env.test absent → wrapper exits 1"
if [[ -f "$ENV_TEST" ]]; then
  mv "$ENV_TEST" "${ENV_TEST}.smoke-bak"
  trap 'mv -f "${ENV_TEST}.smoke-bak" "$ENV_TEST" 2>/dev/null || true' EXIT
fi
EXIT_CODE="$(run_wrapper_exit)"
if [[ -f "${ENV_TEST}.smoke-bak" ]]; then
  mv -f "${ENV_TEST}.smoke-bak" "$ENV_TEST"
  trap - EXIT
fi
if [[ "$EXIT_CODE" -eq 1 ]]; then
  pass "Case (a) — wrapper exits 1 when .env.test is absent"
else
  fail "Case (a) — wrapper exit code $EXIT_CODE (expected 1)"
fi
echo ""

# ── Case (c): non-localhost DATABASE_URL → wrapper exits 1 ────────
echo "==> [Smoke 2/3] Case (c): non-localhost DATABASE_URL → wrapper exits 1 (trap-protected tamper)"
cp "$ENV_TEST" "${ENV_TEST}.smoke-bak"
trap 'mv -f "${ENV_TEST}.smoke-bak" "$ENV_TEST" 2>/dev/null || true' EXIT
# Rewrite the localhost host to a deliberately-invalid non-localhost host.
sed 's/localhost/db.example.invalid/g' "${ENV_TEST}.smoke-bak" > "$ENV_TEST"
EXIT_CODE="$(run_wrapper_exit)"
mv -f "${ENV_TEST}.smoke-bak" "$ENV_TEST"
trap - EXIT
if [[ "$EXIT_CODE" -eq 1 ]]; then
  pass "Case (c) — wrapper exits 1 when DATABASE_URL host is non-localhost"
else
  fail "Case (c) — wrapper exit code $EXIT_CODE (expected 1)"
fi
echo ""

# ── Happy path: localhost DATABASE_URL + container up → wrapper exits 0 ──
echo "==> [Smoke 3/3] Happy path: localhost DATABASE_URL → wrapper exits 0 (container-gated)"
CONTAINER_UP=0
if docker compose -f docker-compose.test.yml --env-file "$ENV_TEST" ps postgres --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
  CONTAINER_UP=1
fi
if [[ "$CONTAINER_UP" -eq 0 ]]; then
  echo "  ⊘ Happy path SKIPPED — test-DB container is not up/healthy at localhost:5433."
  echo "    Run 'npm run db:test:up' first, then re-run this smoke test."
else
  EXIT_CODE="$(run_wrapper_exit)"
  if [[ "$EXIT_CODE" -eq 0 ]]; then
    pass "Happy path — wrapper exits 0 when DATABASE_URL is localhost and the container is up"
  else
    fail "Happy path — wrapper exit code $EXIT_CODE (expected 0)"
  fi
fi
echo ""

echo "============================================================"
echo "Smoke test results: $PASS passed, $FAIL failed"
echo "============================================================"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
