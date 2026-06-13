#!/usr/bin/env bash
# FILE: scripts/start-demo-full-runtime.sh
# PURPOSE: Phase 1281 — one command to bring up the FULL local Otzar Work
#          OS runtime fabric: Python intelligence worker (:8000), BEAM
#          coordination supervisor (:4001), and the Foundation API (:3000)
#          with the (non-secret, localhost) runtime URLs exported so
#          Python=HEALTHY and BEAM=HEALTHY in the registry — restart-
#          friendly activation without editing any env file.
#
# USAGE:
#   bash scripts/start-demo-full-runtime.sh
#
# SAFETY POSTURE:
#   - Runtime URLs are non-secret localhost values only; nothing is
#     printed beyond ports/PIDs and masked prefixes (the API launcher
#     already masks LLM/OAuth keys).
#   - Fails closed if a required port is already busy.
#   - DATABASE_URL safety is enforced by scripts/start-demo-api.sh
#     (localhost-forced); this wrapper never reads/prints it.
#   - Python/BEAM never execute external writes and are governed by
#     Foundation per ADR-0028/0030 — coordination + intelligence only.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PYTHON_PORT="${PYTHON_PORT:-8000}"
BEAM_PORT="${COLLAB_SUPERVISOR_PORT:-4001}"
API_PORT="${PORT:-3000}"

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

# 1) Python intelligence worker ------------------------------------------
if port_busy "$PYTHON_PORT"; then
  echo "Python worker already listening on :$PYTHON_PORT (reusing)."
else
  if [ ! -x "services/python-intelligence/.venv/bin/uvicorn" ]; then
    echo "ERROR: services/python-intelligence/.venv is missing. Create it:" >&2
    echo "  cd services/python-intelligence && python3.11 -m venv .venv && ./.venv/bin/pip install -r requirements.txt" >&2
    exit 1
  fi
  ( cd services/python-intelligence && \
    nohup ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PYTHON_PORT" \
      >/tmp/otzar-python-worker.log 2>&1 & )
  echo "Started Python worker on :$PYTHON_PORT"
fi

# 2) BEAM coordination supervisor ----------------------------------------
if port_busy "$BEAM_PORT"; then
  echo "BEAM supervisor already listening on :$BEAM_PORT (reusing)."
else
  ( cd apps/collaboration_supervisor && \
    COLLAB_SUPERVISOR_PORT="$BEAM_PORT" MIX_ENV=test \
      nohup mix run --no-halt >/tmp/otzar-beam-supervisor.log 2>&1 & )
  echo "Started BEAM supervisor on :$BEAM_PORT"
fi

# 3) Wait for runtimes to answer /health ---------------------------------
wait_health() {
  local url="$1" name="$2"
  for _ in $(seq 1 40); do
    if curl -s -m 2 "$url" >/dev/null 2>&1; then echo "  $name healthy"; return 0; fi
    sleep 1
  done
  echo "  WARNING: $name did not pass /health in time" >&2
}
echo "Waiting for runtimes…"
wait_health "http://localhost:$PYTHON_PORT/health" "Python"
wait_health "http://localhost:$BEAM_PORT/health" "BEAM"

# 4) Foundation API with runtime URLs exported ---------------------------
if port_busy "$API_PORT"; then
  echo "ERROR: API port :$API_PORT is busy. Stop the existing API first." >&2
  exit 1
fi
echo "Starting Foundation API on :$API_PORT with runtime fabric enabled…"
export PYTHON_INTELLIGENCE_RUNTIME_URL="http://localhost:$PYTHON_PORT"
export BEAM_RUNTIME_ENABLED="true"
export BEAM_RUNTIME_URL="http://localhost:$BEAM_PORT"

echo "════ Runtime fabric ════"
echo "  Python worker : http://localhost:$PYTHON_PORT  (PID $(lsof -nP -iTCP:$PYTHON_PORT -sTCP:LISTEN -t 2>/dev/null | head -1))"
echo "  BEAM fabric   : http://localhost:$BEAM_PORT  (PID $(lsof -nP -iTCP:$BEAM_PORT -sTCP:LISTEN -t 2>/dev/null | head -1))"
echo "  API           : http://localhost:$API_PORT (starting…)"
echo "════════════════════════"

exec bash scripts/start-demo-api.sh
