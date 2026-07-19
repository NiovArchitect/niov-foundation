#!/usr/bin/env bash
# FILE: otzar-enterprise-pressure-level1.sh
# PURPOSE: Level-1 real-work pressure harness — expose what Otzar cannot yet do.
# Philosophy: failures are the product. Do not sanitize for green.
# Synthetic NIOV smoke personas only. No customer data.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"
API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
APP="${OTZAR_APP_BASE_URL:-https://app.otzar.ai}"
PASS="${DEMO_SHARED_PASSWORD:-}"
[[ -n "$PASS" ]] || { echo "SKIPPED: DEMO_SHARED_PASSWORD missing"; exit 2; }

FAILS=0
WARNS=0
HARD=0
fail() { echo "  FAIL  $*"; FAILS=$((FAILS+1)); }
hard() { echo "  HARD  $*"; HARD=$((HARD+1)); FAILS=$((FAILS+1)); }
warn() { echo "  WARN  $*"; WARNS=$((WARNS+1)); }
pass() { echo "  PASS  $*"; }

login() {
  curl -sS -m 25 -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\",\"external_api\"]}"
}

echo "=== Otzar Enterprise Pressure — Level 1 ==="
echo "philosophy: expose defects under organizational pressure"
HEALTH=$(curl -sS -m 15 "$API/health" || echo '{}')
SHA=$(python3 -c "import json,sys; print((json.loads(sys.argv[1] or '{}').get('git_commit') or '')[:12])" "$HEALTH")
echo "live_api_sha=$SHA database=$(python3 -c "import json,sys; print(json.loads(sys.argv[1] or '{}').get('database'))" "$HEALTH")"

# --- Deploy coherence ---
echo "--- deploy coherence ---"
MAIN=$(git -C "$(dirname "$0")/.." rev-parse --short origin/main 2>/dev/null || echo "?")
echo "  origin/main≈$MAIN live=$SHA"
if [[ "$MAIN" != "?" && "$MAIN" != "$SHA"* && "$SHA" != "$MAIN"* ]]; then
  # compare full prefixes
  :
fi
# Work-style routes must exist if main contains them
WS=$(curl -sS -m 10 -o /tmp/ws.json -w "%{http_code}" "$API/otzar/work-style/status" || echo err)
if [[ "$WS" == "404" ]]; then
  hard "work-style API missing on live (deploy lag or not merged). UI may promise Teach Otzar while API 404s — trust break"
else
  pass "work-style API present http=$WS"
fi

# CT bundle
echo "--- CT bundle ---"
HTML=$(curl -sS -m 15 "$APP/?cb=$(date +%s)")
JS=$(echo "$HTML" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
CSS=$(echo "$HTML" | grep -oE 'index-[A-Za-z0-9_-]+\.css' | head -1)
LM=$(curl -sI -m 10 "$APP/" | grep -i last-modified | tr -d '\r')
echo "  $LM js=$JS css=$CSS"
curl -sS -m 40 "$APP/assets/$JS" -o /tmp/ctpress.js
python3 - <<'PY'
d=open('/tmp/ctpress.js',errors='ignore').read()
need=['open-work-lane','project-context-panel','work-style-benefit','Teach Otzar','Signing in…":"Sign in','project-context-documents']
for n in need:
  ok = n in d or n.replace('…','') in d
  print(('  PASS' if ok else '  FAIL'), 'marker', n[:40], ok)
  if not ok: open('/tmp/ct_mark_fail','w').write('1')
PY
[[ -f /tmp/ct_mark_fail ]] && { fail "CT missing expected markers"; rm -f /tmp/ct_mark_fail; } || pass "CT markers present"

# --- Multi-persona pressure ---
echo "--- multi-persona concurrent login + work ---"
PERSONAS="sadeil@niovlabs.com david@niovlabs.com vishesh@niovlabs.com samiksha@niovlabs.com william@niovlabs.com annie@niovlabs.com shweta@niovlabs.com walter@niovlabs.com"
: > /tmp/press_tokens.env
for e in $PERSONAS; do
  T=$(login "$e" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token') or '')")
  key=$(echo "$e" | tr '@.' '__')
  if [[ -n "$T" ]]; then
    echo "TOK_$key=$T" >> /tmp/press_tokens.env
    pass "login $e"
  else
    fail "login $e"
  fi
done
# shellcheck disable=SC1091
source /tmp/press_tokens.env
STOK="${TOK_sadeil_niovlabs_com:-}"
[[ -n "$STOK" ]] || { echo "no founder token"; exit 1; }

# Concurrent my-work reads (pressure)
echo "--- concurrent my-work fan-in ---"
python3 - <<'PY'
import os, json, subprocess, concurrent.futures
API=os.environ.get("OTZAR_API_BASE_URL","https://api.otzar.ai/api/v1")
# load tokens from env file
tokens={}
for line in open("/tmp/press_tokens.env"):
  k,v=line.strip().split("=",1)
  tokens[k]=v

def pull(item):
  name, tok = item
  try:
    raw=subprocess.check_output([
      "curl","-sS","-m","25","-H",f"Authorization: Bearer {tok}",
      f"{API}/work-os/my-work?take=20"
    ], text=True)
    d=json.loads(raw)
    n=len(d.get("items") or d.get("entries") or [])
    return name, True, n, d.get("ok")
  except Exception as e:
    return name, False, 0, str(e)

items=[(k,v) for k,v in tokens.items() if k.startswith("TOK_")]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
  res=list(ex.map(pull, items))
for name, ok, n, extra in res:
  print(f"  {'PASS' if ok else 'FAIL'} concurrent my-work {name} n={n} extra={extra}")
fails=sum(1 for _,ok,_,_ in res if not ok)
open("/tmp/press_conc","w").write(str(fails))
PY
CFAIL=$(cat /tmp/press_conc 2>/dev/null || echo 1)
[[ "$CFAIL" == "0" ]] && pass "concurrent my-work 8 personas" || fail "concurrent my-work failures=$CFAIL"

# Messy communication ingest (vague, contradiction, multi-owner hints)
echo "--- messy communication → work ---"
MARK="PRESS-$(date +%s)"
TEXT="Hey team - can we push the thing to next week maybe? Actually wait, let's keep Friday if David is free. Vishesh should own the UI polish. Do NOT put customer SSNs in the doc. Side note: lunch was great. Final-ish: ship the pilot brief by Friday EOD, decision: go with the phased rollout. [$MARK]"
# Write payload to temp file to avoid nested-quote breakage under bash 3.2
export PRESS_TEXT="$TEXT"
python3 -c "
import json, os
open('/tmp/press_ingest.json','w').write(json.dumps({'captured_text': os.environ['PRESS_TEXT']}))
"
ING=$(curl -sS -m 90 -X POST "$API/otzar/comms/ingest" -H "Authorization: Bearer $STOK" -H "Content-Type: application/json" \
  --data-binary @/tmp/press_ingest.json)
python3 -c "
import json,sys
raw=sys.argv[1] if len(sys.argv)>1 else '{}'
try:
  d=json.loads(raw or '{}')
except Exception:
  print('  FAIL messy ingest non-json', raw[:200]); sys.exit(1)
ok=d.get('ok')
items=((d.get('result') or {}).get('work_items') or d.get('work_items') or [])
print(f'  ingest ok={ok} work_items={len(items)} keys={list(d.keys())[:12]}')
blob=json.dumps(items).lower()
if 'ssn' in blob and 'do not' not in blob and 'not put' not in blob:
  print('  WARN possible SSN retention in work items')
if len(items)<1:
  print('  FAIL messy ingest produced no work objects', str(d)[:300]); sys.exit(1)
print('  PASS messy ingest produced work')
owners={w.get('owner_name') or w.get('owner_email') for w in items}
print('  owners', owners)
" "$ING" && pass "messy communication extract" || fail "messy communication extract body=${ING:0:200}"

# Authority / isolation pressure
echo "--- authority isolation ---"
# walter should not admin
WTOK="${TOK_walter_niovlabs_com:-}"
if [[ -n "$WTOK" ]]; then
  code=$(curl -sS -m 15 -o /tmp/wpol.json -w "%{http_code}" -X POST "$API/otzar/work-style/policy" \
    -H "Authorization: Bearer $WTOK" -H "Content-Type: application/json" -d '{"enabled":true}')
  if [[ "$code" == "403" || "$code" == "401" ]]; then
    pass "non-admin cannot enable work-style policy http=$code"
  else
    # 404 if route missing is already hard
    if [[ "$code" == "404" ]]; then hard "policy route 404"; else fail "non-admin policy enable http=$code"; fi
  fi
fi

# Hierarchy + dandelion
echo "--- hierarchy / dandelion ---"
code=$(curl -sS -m 20 -o /tmp/h.json -w "%{http_code}" -H "Authorization: Bearer $STOK" "$API/org/hierarchy")
python3 -c "import json; d=json.load(open('/tmp/h.json')); print('  hierarchy members', len(d.get('memberships') or []))"
[[ "$code" == "200" ]] && pass "hierarchy loads" || fail "hierarchy http=$code"
code=$(curl -sS -m 20 -o /tmp/s.json -w "%{http_code}" -H "Authorization: Bearer $STOK" "$API/org/dandelion/seeds")
python3 -c "import json; d=json.load(open('/tmp/s.json')); print('  seeds', len(d.get('seeds') or []))"
[[ "$code" == "200" ]] && pass "dandelion seeds" || fail "seeds http=$code"

# Provider honesty
echo "--- provider honesty under pressure ---"
AMB=$(curl -sS -m 40 -X POST "$API/otzar/comms/ambient-sync" -H "Authorization: Bearer $STOK" -H "Content-Type: application/json" -d '{}')
python3 -c "
import json,sys
d=json.loads(sys.argv[1])
code=d.get('code'); ok=d.get('ok')
if ok: print('  PASS ambient-sync ok')
elif code in ('SCOPE_REAUTH_REQUIRED','GOOGLE_NOT_CONNECTED'):
  print(f'  PASS Meet externally blocked honestly ({code})')
else:
  print(f'  WARN ambient-sync unexpected {str(d)[:120]}')
" "$AMB"

# Work-style behavioral submodule if live
echo "--- work-style behavioral ---"
if [[ "$WS" != "404" ]]; then
  if DEMO_SHARED_PASSWORD="$PASS" bash "$(dirname "$0")/otzar-work-style-learning-smoke.sh"; then
    pass "work-style behavioral submodule"
  else
    fail "work-style behavioral submodule failed"
  fi
else
  hard "skipped work-style behavioral — API not live (deploy defect)"
fi

# Top defects summary
echo "=== PRESSURE LEVEL-1 RESULT ==="
echo "fails=$FAILS hard=$HARD warns=$WARNS live_sha=$SHA"
echo "classification: $([[ $HARD -eq 0 && $FAILS -eq 0 ]] && echo functionally_pressure_green || echo defects_exposed)"
echo "top_defects:"
[[ $HARD -gt 0 ]] && echo "  - FND deploy lag or missing work-style routes on live"
[[ $FAILS -gt 0 ]] && echo "  - see FAIL lines above for root investigation targets"
exit "$FAILS"
