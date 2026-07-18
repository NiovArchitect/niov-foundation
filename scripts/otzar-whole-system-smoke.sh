#!/usr/bin/env bash
# FILE: otzar-whole-system-smoke.sh
# PURPOSE: Continuous whole-system live smoke for Otzar Work OS (admin +
#          employee). Communication OS, role templates, accuracy packs,
#          tools, projects, twin, wallet portability. Fail closed on red.
# USAGE:
#   export DEMO_SHARED_PASSWORD='…'   # prod demo password
#   bash scripts/otzar-whole-system-smoke.sh
# ENV:
#   OTZAR_API_BASE_URL (default https://api.otzar.ai/api/v1)
#   OTZAR_SMOKE_ADMIN_EMAIL (default sadeil@niovlabs.com)
#   OTZAR_SMOKE_EMPLOYEE_EMAIL (default david@niovlabs.com)
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
ADMIN_EMAIL="${OTZAR_SMOKE_ADMIN_EMAIL:-sadeil@niovlabs.com}"
EMP_EMAIL="${OTZAR_SMOKE_EMPLOYEE_EMAIL:-david@niovlabs.com}"
PASS="${DEMO_SHARED_PASSWORD:-}"
if [[ -z "$PASS" ]]; then
  echo "SKIPPED: DEMO_SHARED_PASSWORD missing"
  exit 2
fi

FAILS=0
pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; FAILS=$((FAILS + 1)); }

login() {
  local email="$1"
  curl -sS -m 30 -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\",\"create_hives\",\"external_api\"]}"
}

echo "=== Otzar whole-system smoke ==="
echo "API $API"

HEALTH=$(curl -sS -m 20 "$API/health" || true)
GIT=$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); print((d.get('git_commit') or '')[:12], d.get('ok'), d.get('database'))" "$HEALTH" 2>/dev/null || echo "?")
echo "health: $GIT"
python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); sys.exit(0 if d.get('ok') and d.get('database') in ('ok','connected') else 1)" "$HEALTH" \
  && pass "health" || fail "health"

ADMIN=$(login "$ADMIN_EMAIL")
ATOK=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('token') or '')" "$ADMIN")
AOPS=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('allowed_operations') or []))" "$ADMIN")
[[ -n "$ATOK" && "$AOPS" -gt 0 ]] && pass "admin login ops=$AOPS" || fail "admin login"

EMP=$(login "$EMP_EMAIL")
ETOK=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('token') or '')" "$EMP")
[[ -n "$ETOK" ]] && pass "employee login" || fail "employee login"

probe() {
  local label="$1" tok="$2" path="$3" expect_ok="${4:-true}"
  local code body
  code=$(curl -sS -m 25 -o /tmp/ws_smoke.json -w "%{http_code}" -H "Authorization: Bearer $tok" "$API$path" || echo err)
  body=$(cat /tmp/ws_smoke.json 2>/dev/null || echo {})
  local ok
  ok=$(python3 -c "import json,sys; d=json.loads(open('/tmp/ws_smoke.json').read() or '{}'); print(d.get('ok'))" 2>/dev/null || echo None)
  if [[ "$expect_ok" == "true" && "$ok" == "True" ]]; then
    pass "$label $path"
  elif [[ "$expect_ok" == "false" && "$code" =~ ^(401|403)$ ]]; then
    pass "$label $path denied as expected ($code)"
  else
    fail "$label $path http=$code ok=$ok"
  fi
}

echo "--- admin ---"
probe admin "$ATOK" "/otzar/my-twin"
probe admin "$ATOK" "/org/ai-teammates"
probe admin "$ATOK" "/otzar/enterprise-tools/catalog"
probe admin "$ATOK" "/otzar/enterprise-tools/inventory"
probe admin "$ATOK" "/work-os/my-work"
probe admin "$ATOK" "/otzar/work-projects"
probe admin "$ATOK" "/org/settings"

python3 <<'PY'
import json
d=json.load(open("/tmp/ws_smoke.json"))
# last probe was settings; re-fetch twin for detail
print("  (see prior probes)")
PY

# Twin detail
curl -sS -m 25 -H "Authorization: Bearer $ATOK" "$API/otzar/my-twin" > /tmp/ws_twin.json
python3 <<'PY'
import json
d=json.load(open("/tmp/ws_twin.json"))
t=d.get("twin") or {}
ap=t.get("accuracy_pack_posture") or {}
wp=t.get("wallet_portability")
rt=t.get("role_template")
packs=len(ap.get("packs") or [])
print(f"  twin role_title={t.get('role_title')!r} template={rt!r} packs={packs} wallet={bool(wp)}")
if not rt:
    print("  FAIL  role_template missing")
    raise SystemExit(3)
if packs < 1:
    print("  FAIL  accuracy packs empty")
    raise SystemExit(3)
print("  PASS  twin role template + packs")
if wp:
    print("  PASS  wallet_portability present")
else:
    print("  WARN  wallet_portability not on this deploy yet")
PY

echo "--- employee ---"
probe emp "$ETOK" "/otzar/my-twin"
probe emp "$ETOK" "/otzar/work-projects"
probe emp "$ETOK" "/work-os/my-work"
probe emp "$ETOK" "/otzar/enterprise-tools/inventory" false

curl -sS -m 25 -H "Authorization: Bearer $ETOK" "$API/otzar/work-projects" > /tmp/ws_proj.json
python3 <<'PY'
import json
d=json.load(open("/tmp/ws_proj.json"))
n=len(d.get("projects") or [])
print(f"  employee projects={n}")
if n < 1:
    print("  FAIL  employee has zero projects (placement gap)")
    raise SystemExit(3)
print("  PASS  employee has projects")
PY

echo "--- third-party / collab SoT ---"
probe admin "$ATOK" "/otzar/collaboration/workspaces"
curl -sS -m 25 -H "Authorization: Bearer $ATOK" "$API/otzar/collaboration/workspaces" > /tmp/ws_collab.json
python3 <<'PY'
import json
d=json.load(open("/tmp/ws_collab.json"))
n=len(d.get("workspaces") or [])
print(f"  collab workspaces={n}")
if n < 1:
    print("  WARN  no collab workspaces (seed [SMOKE] Client pilot collab if empty)")
else:
    print("  PASS  collab workspace present for third-party path")
PY

echo "=== RESULT fails=$FAILS ==="
exit "$FAILS"
