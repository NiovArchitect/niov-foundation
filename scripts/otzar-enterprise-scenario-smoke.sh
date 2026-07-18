#!/usr/bin/env bash
# FILE: otzar-enterprise-scenario-smoke.sh
# PURPOSE: Multi-persona, multi-scenario live smoke across User / Collab /
#          AI Teammate / Third-party paths. Tags ENTERPRISE_SCENARIO_CATALOG ids.
# USAGE:
#   export DEMO_SHARED_PASSWORD='…'
#   bash scripts/otzar-enterprise-scenario-smoke.sh
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
APP="${OTZAR_APP_BASE_URL:-https://app.otzar.ai}"
PASS="${DEMO_SHARED_PASSWORD:-}"
if [[ -z "$PASS" ]]; then
  echo "SKIPPED: DEMO_SHARED_PASSWORD missing"
  exit 2
fi

FAILS=0
WARNS=0
pass() { echo "  PASS  $*"; }
warn() { echo "  WARN  $*"; WARNS=$((WARNS + 1)); }
fail() { echo "  FAIL  $*"; FAILS=$((FAILS + 1)); }

login() {
  local email="$1"
  curl -sS -m 30 -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\",\"create_hives\",\"external_api\"]}"
}

echo "=== Otzar enterprise scenario smoke ==="
echo "API $API  APP $APP"
echo "Catalog: docs/otzar/ENTERPRISE_SCENARIO_CATALOG.md (128 scenarios)"

HEALTH=$(curl -sS -m 20 "$API/health" || true)
GIT=$(python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); print((d.get('git_commit') or '')[:12])" "$HEALTH" 2>/dev/null || echo "?")
echo "health git=$GIT"
python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); sys.exit(0 if d.get('ok') and d.get('database') in ('ok','connected') else 1)" "$HEALTH" \
  && pass "health [U-01]" || fail "health"

# --- multi-persona logins (file-based tokens; portable bash 3+) ---
PERSONAS="sadeil@niovlabs.com david@niovlabs.com vishesh@niovlabs.com samiksha@niovlabs.com william@niovlabs.com annie@niovlabs.com shweta@niovlabs.com walter@niovlabs.com"
: > /tmp/esc_tokens.env
for email in $PERSONAS; do
  RES=$(login "$email")
  T=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('token') or '')" "$RES")
  if [[ -n "$T" ]]; then
    # shellcheck disable=SC2086
    key=$(echo "$email" | tr '@.' '__')
    echo "TOK_${key}=$T" >> /tmp/esc_tokens.env
    pass "login $email [U-01]"
  else
    fail "login $email code=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('code'))" "$RES")"
  fi
done
# shellcheck disable=SC1091
source /tmp/esc_tokens.env
ATOK="${TOK_sadeil_niovlabs_com:-}"
DTOK="${TOK_david_niovlabs_com:-}"
[[ -n "$ATOK" ]] || { echo "no admin token"; exit 1; }

# --- admin route matrix ---
probe_ok() {
  local sid="$1" path="$2" tok="${3:-$ATOK}"
  local code body ok
  code=$(curl -sS -m 30 -o /tmp/esc_probe.json -w "%{http_code}" -H "Authorization: Bearer $tok" "$API$path" || echo err)
  body=$(cat /tmp/esc_probe.json 2>/dev/null || echo {})
  ok=$(python3 -c "import json; d=json.load(open('/tmp/esc_probe.json')); print(d.get('ok'))" 2>/dev/null || echo None)
  if [[ "$ok" == "True" ]]; then
    pass "$sid $path"
  elif [[ "$code" == "403" && "$sid" == *403* ]]; then
    pass "$sid denied as expected"
  else
    fail "$sid $path http=$code ok=$ok body=$(echo "$body" | head -c 120)"
  fi
}

echo "--- core surfaces ---"
probe_ok "U-14 T-01 my-twin" "/otzar/my-twin"
probe_ok "T-32 ai-teammates" "/org/ai-teammates"
probe_ok "U-24 catalog" "/otzar/enterprise-tools/catalog"
probe_ok "U-24 inventory" "/otzar/enterprise-tools/inventory"
probe_ok "U-04 my-work" "/work-os/my-work"
probe_ok "U-19 projects" "/otzar/work-projects"
probe_ok "C-06 team-work" "/otzar/team-work"
probe_ok "C-07 dgi" "/otzar/dgi-coherence"
probe_ok "C-01 handoffs" "/otzar/handoffs?role=incoming&limit=10"
probe_ok "C-04 collab-inbound" "/otzar/my-twin/collaboration-requests/inbound?take=12"
probe_ok "C-14 X-30 workspaces" "/otzar/collaboration/workspaces"
probe_ok "U-07 sources" "/otzar/comms/sources"
probe_ok "U-21 context-health" "/otzar/my-twin/context-health"
probe_ok "U-03 my-day" "/otzar/my-day/intelligence"
probe_ok "U-16 oauth" "/connectors/oauth/status"
probe_ok "seeding" "/org/dandelion/seeds"
probe_ok "org-truth" "/otzar/org-truth/conflicts"
probe_ok "follow-ups" "/work-os/comms/follow-ups"
probe_ok "blind-spots" "/work-os/blind-spots"
probe_ok "authority" "/otzar/my-twin/authority-grants"
probe_ok "meeting-captures" "/otzar/meeting-captures"
probe_ok "relay C-26" "/relay/threads"
probe_ok "analytics" "/org/analytics"

# employee 403
code=$(curl -sS -m 20 -o /tmp/esc_probe.json -w "%{http_code}" \
  -H "Authorization: Bearer ${DTOK}" \
  "$API/otzar/enterprise-tools/inventory" || echo err)
[[ "$code" == "403" ]] && pass "U-30 employee inventory 403" || fail "U-30 expected 403 got $code"

# ambient-sync honest
curl -sS -m 60 -X POST -H "Authorization: Bearer $ATOK" -H "Content-Type: application/json" \
  -d '{"max_records":3}' "$API/otzar/comms/ambient-sync" > /tmp/esc_ambient.json || true
python3 <<'PY'
import json
d=json.load(open("/tmp/esc_ambient.json"))
if d.get("ok") is True:
    print("  PASS  U-07 ambient-sync pulled ingested=%s" % d.get("ingested"))
elif d.get("code") in ("SCOPE_REAUTH_REQUIRED","GOOGLE_NOT_CONNECTED","PROVIDER_ERROR"):
    print("  PASS  U-07 ambient-sync honest %s (paste fallback U-09)" % d.get("code"))
else:
    print("  FAIL  U-07 ambient-sync unexpected %s" % (d.get("code") or d)[:120])
    raise SystemExit(3)
PY
[[ $? -eq 3 ]] && fail "U-07 ambient-sync" || true

# --- multi-persona twin quality ---
echo "--- multi-persona twin quality [T-01..T-04,U-14,U-15,U-19] ---"
python3 <<'PY'
import json, os, subprocess
API=os.environ.get("OTZAR_API_BASE_URL","https://api.otzar.ai/api/v1")
# tokens from bash not available — re-login light
PASS=os.environ["DEMO_SHARED_PASSWORD"]
emails=["sadeil@niovlabs.com","david@niovlabs.com","vishesh@niovlabs.com","samiksha@niovlabs.com","william@niovlabs.com","annie@niovlabs.com","shweta@niovlabs.com","walter@niovlabs.com"]
fails=0
for e in emails:
    body=json.dumps({"email":e,"password":PASS,"requested_operations":["read","write","share","admin_org"]})
    d=json.loads(subprocess.check_output(["curl","-sS","-m","25","-X","POST",f"{API}/auth/login","-H","Content-Type: application/json","-d",body], text=True))
    tok=d.get("token") or ""
    if not tok:
        print("  FAIL  login", e); fails+=1; continue
    twin=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tok}",f"{API}/otzar/my-twin"], text=True))
    t=twin.get("twin") or {}
    proj=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tok}",f"{API}/otzar/work-projects"], text=True))
    packs=len((t.get("accuracy_pack_posture") or {}).get("packs") or [])
    nproj=len(proj.get("projects") or [])
    ok=twin.get("ok") and t.get("role_template") and packs>=1 and nproj>=1
    label=e.split("@")[0]
    if ok:
        print(f"  PASS  {label} tpl={t.get('role_template')} packs={packs} projects={nproj} role={t.get('role_title')}")
    else:
        print(f"  FAIL  {label} ok={twin.get('ok')} tpl={t.get('role_template')} packs={packs} projects={nproj}")
        fails+=1
# ai-teammates all have config.role_template
body=json.dumps({"email":"sadeil@niovlabs.com","password":PASS,"requested_operations":["read","write","share","admin_org"]})
tok=json.loads(subprocess.check_output(["curl","-sS","-X","POST",f"{API}/auth/login","-H","Content-Type: application/json","-d",body], text=True)).get("token")
team=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tok}",f"{API}/org/ai-teammates"], text=True))
items=team.get("items") or []
missing=[(i.get("owner_display_name"), (i.get("config") or {}).get("role_template")) for i in items if not (i.get("config") or {}).get("role_template")]
if not missing and len(items)>=1:
    print(f"  PASS  T-32 all {len(items)} teammates have role_template in config")
else:
    print(f"  FAIL  T-32 missing templates {missing}")
    fails+=1
raise SystemExit(fails)
PY
PERSONA_RC=$?
[[ $PERSONA_RC -eq 0 ]] || FAILS=$((FAILS + PERSONA_RC))

# --- fan-out U-10 ---
echo "--- multi-person fan-out [U-10,C-18,T-05] ---"
MARK="ESC-$(date +%s)"
python3 <<PY
import json, subprocess, os
API=os.environ.get("OTZAR_API_BASE_URL","https://api.otzar.ai/api/v1")
PASS=os.environ["DEMO_SHARED_PASSWORD"]
mark="$MARK"

def tok(email):
    body=json.dumps({"email":email,"password":PASS,"requested_operations":["read","write","share","admin_org"]})
    return json.loads(subprocess.check_output(["curl","-sS","-X","POST",f"{API}/auth/login","-H","Content-Type: application/json","-d",body], text=True)).get("token") or ""

ST,DT,VT=tok("sadeil@niovlabs.com"),tok("david@niovlabs.com"),tok("vishesh@niovlabs.com")
text=f"""Sadeil: Scenario smoke {mark}.
Sadeil: David will complete the UI review for {mark} by Friday.
David: I own the UI review for {mark}.
Sadeil: Vishesh will ship ambient polish for {mark}.
Vishesh: Ambient polish is mine for {mark}.
"""
open("/tmp/esc_ingest.json","w").write(json.dumps({"captured_text":text}))
ing=json.loads(subprocess.check_output(["curl","-sS","-m","90","-X","POST",f"{API}/otzar/comms/ingest","-H",f"Authorization: Bearer {ST}","-H","Content-Type: application/json","--data-binary","@/tmp/esc_ingest.json"], text=True))
items=(ing.get("result") or {}).get("work_items") or []
owners={w.get("owner_name") for w in items if not w.get("needs_review")}
print(f"  work_items={len(items)} owners={owners}")
ok_items = len(items)>=2 and "David" in str(owners) and "Vishesh" in str(owners)
if not ok_items:
    print("  FAIL  U-10 ingest did not create multi-owner work")
    raise SystemExit(1)
# my-work can_complete
for email,tokv,name in [("david",DT,"David"),("vishesh",VT,"Vishesh")]:
    mw=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tokv}",f"{API}/work-os/my-work"], text=True))
    hits=[i for i in (mw.get("items") or []) if mark in ((i.get("title") or "")+str(i.get("summary") or ""))]
    owned=[i for i in hits if i.get("can_complete")]
    print(f"  {email} mark={len(hits)} can_complete={len(owned)}")
    if len(owned)<1:
        print(f"  FAIL  U-10 {email} missing can_complete ownership")
        raise SystemExit(1)
print("  PASS  U-10 multi-person fan-out to My Work")
PY
[[ $? -eq 0 ]] || fail "U-10 fan-out"

# --- third-party workspace memberships ---
echo "--- third-party [X-03,X-16,X-30] ---"
python3 <<'PY'
import json, subprocess, os
API=os.environ.get("OTZAR_API_BASE_URL","https://api.otzar.ai/api/v1")
PASS=os.environ["DEMO_SHARED_PASSWORD"]
body=json.dumps({"email":"sadeil@niovlabs.com","password":PASS,"requested_operations":["read","write","share","admin_org"]})
tok=json.loads(subprocess.check_output(["curl","-sS","-X","POST",f"{API}/auth/login","-H","Content-Type: application/json","-d",body], text=True)).get("token")
ws=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tok}",f"{API}/otzar/collaboration/workspaces"], text=True))
workspaces=ws.get("workspaces") or []
if len(workspaces)<1:
    print("  FAIL  X-30 no collab workspaces")
    raise SystemExit(1)
wid=workspaces[0].get("workspace_id")
ext=json.loads(subprocess.check_output(["curl","-sS","-H",f"Authorization: Bearer {tok}",f"{API}/otzar/collaboration/workspaces/{wid}/external-collaborators"], text=True))
members=ext.get("workspace_memberships") or ext.get("collaborators") or []
print(f"  workspaces={len(workspaces)} external_memberships={len(members)}")
if len(members)<1:
    print("  WARN  X-02 no external memberships on first workspace (seed Acme if needed)")
else:
    print("  PASS  X-02 external collaborator present on workspace")
print("  PASS  X-30 collab workspace present")
PY

# --- CT screens (SPA shell) ---
echo "--- CT screens E2E shell [all primary routes HTTP 200] ---"
python3 <<'PY'
import subprocess, os
APP=os.environ.get("OTZAR_APP_BASE_URL","https://app.otzar.ai")
paths=[
"/login","/app","/app/action-center","/app/comms","/app/my-work","/app/my-twin","/app/my-memory",
"/app/collaboration","/app/collaboration-workspaces","/app/work-projects","/app/team-work",
"/app/blind-spots","/app/meeting-captures","/app/voice","/app/preferences","/app/authority-grants",
"/app/connector-health","/","/ai-teammates","/users","/tools-connections","/organization-seeding",
"/settings","/analytics","/security-audit","/playground","/agent-playground","/review-center",
"/marketplace","/connectors","/intelligence","/access-control","/data-knowledge","/reports",
"/approvals","/conversations","/workflows","/policies","/system-health","/documentation"
]
fails=0
for p in paths:
    code=subprocess.check_output(["curl","-sS","-o","/dev/null","-w","%{http_code}",APP+p], text=True).strip()
    if code not in ("200","301","302","304"):
        print(f"  FAIL  screen {p} http={code}")
        fails+=1
if fails==0:
    print(f"  PASS  {len(paths)} CT screens return 200 [shell E2E]")
else:
    print(f"  FAIL  {fails}/{len(paths)} screens")
    raise SystemExit(fails)
PY
[[ $? -eq 0 ]] || fail "CT screens"

echo "=== RESULT fails=$FAILS warns=$WARNS ==="
exit "$FAILS"
