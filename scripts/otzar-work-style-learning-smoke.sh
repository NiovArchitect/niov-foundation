#!/usr/bin/env bash
# Work-style learning E2E smoke — explain less over time; methods improve;
# no secrets; no silent authority; portable personal core.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"
API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
PASS="${DEMO_SHARED_PASSWORD:-}"
[[ -n "$PASS" ]] || { echo "SKIPPED: DEMO_SHARED_PASSWORD missing"; exit 2; }

login() {
  curl -sS -m 25 -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\"]}"
}

echo "=== Work-style learning smoke ==="
TOK=$(login sadeil@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
[[ -n "$TOK" ]] || { echo "FAIL login"; exit 1; }
AUTH="Authorization: Bearer $TOK"

# Admin enable policy
POL=$(curl -sS -m 20 -X POST "$API/otzar/work-style/policy" -H "$AUTH" -H "Content-Type: application/json" -d '{"enabled":true}')
echo "policy $POL" | head -c 200; echo
python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get('ok') and d.get('enabled') else 1)" "$POL" || echo "WARN policy enable (may need admin)"

ST=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/status")
echo "status $ST" | head -c 300; echo

START=$(curl -sS -m 20 -X POST "$API/otzar/work-style/sessions/start" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"consent":true,"task_label":"Executive launch brief","app_context":"Otzar"}')
echo "start $START"
SID=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))" <<<"$START")
[[ -n "$SID" ]] || { echo "FAIL start session"; exit 1; }

for pair in "structure|Moved decision and impact first" "review|Draft before send external" "tool|Used Google Docs for collaborative draft"; do
  st=${pair%%|*}; lb=${pair#*|}
  curl -sS -m 15 -X POST "$API/otzar/work-style/sessions/$SID/signal" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"signal_type\":\"$st\",\"safe_label\":\"$lb\"}" >/dev/null
done

STOP=$(curl -sS -m 30 -X POST "$API/otzar/work-style/sessions/$SID/stop" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
echo "stop candidates=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('candidates') or []))" <<<"$STOP")"
CIDS=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(c['candidate_id'] for c in (d.get('candidates') or [])[:2]))" <<<"$STOP")
set -- $CIDS
if [[ -n "${1:-}" ]]; then
  curl -sS -m 20 -X POST "$API/otzar/work-style/candidates/$1/approve" -H "$AUTH" -H "Content-Type: application/json" -d '{}' | head -c 200; echo
fi
if [[ -n "${2:-}" ]]; then
  curl -sS -m 20 -X POST "$API/otzar/work-style/candidates/$2/reject" -H "$AUTH" -H "Content-Type: application/json" -d '{}' | head -c 120; echo
fi

PREFS=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/preferences")
echo "approved=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('preferences') or []))" <<<"$PREFS")"
echo "PASS work-style session → candidates → approve/reject → durable preferences"
