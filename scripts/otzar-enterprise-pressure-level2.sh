#!/usr/bin/env bash
# FILE: otzar-enterprise-pressure-level2.sh
# PURPOSE: Level-2 pressure — hierarchy authority, isolation, provider honesty.
# Philosophy: expose what Otzar cannot yet do under organizational pressure.
# Failures are the product. Exit non-zero on hard failures.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"
API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
APP="${OTZAR_APP_BASE_URL:-https://app.otzar.ai}"
PASS="${DEMO_SHARED_PASSWORD:-}"
[[ -n "$PASS" ]] || { echo "SKIPPED: DEMO_SHARED_PASSWORD missing"; exit 2; }

FAILS=0
HARD=0
WARNS=0
fail() { echo "  FAIL  $*"; FAILS=$((FAILS + 1)); }
hard() { echo "  HARD  $*"; HARD=$((HARD + 1)); FAILS=$((FAILS + 1)); }
warn() { echo "  WARN  $*"; WARNS=$((WARNS + 1)); }
pass() { echo "  PASS  $*"; }

login() {
  curl -sS -m 25 -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\",\"external_api\"]}"
}

echo "=== Otzar Enterprise Pressure — Level 2 ==="
echo "philosophy: hierarchy authority + isolation + provider honesty"
HEALTH=$(curl -sS -m 15 "$API/health" || echo '{}')
SHA=$(python3 -c "import json,sys; print((json.loads(sys.argv[1] or '{}').get('git_commit') or '')[:12])" "$HEALTH")
echo "live_api_sha=$SHA"

STOK=$(login sadeil@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token') or '')")
DTOK=$(login david@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token') or '')")
WTOK=$(login walter@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token') or '')")
[[ -n "$STOK" ]] && pass "login founder" || hard "login founder"
[[ -n "$DTOK" ]] && pass "login david" || fail "login david"
[[ -n "$WTOK" ]] && pass "login walter" || fail "login walter"
export API APP STOK DTOK WTOK PASS

# ── Hierarchy structure + assign pressure ────────────────────────────────
echo "--- hierarchy assign authority ---"
H=$(curl -sS -m 20 -H "Authorization: Bearer $STOK" "$API/org/hierarchy")
python3 -c "
import json,sys,os,urllib.request
api=os.environ['API']
stok=os.environ['STOK']
wtok=os.environ.get('WTOK','')
h=json.loads(sys.argv[1])
ms=h.get('memberships') or []
org=h.get('org_entity_id') or ''
print(f'  org={org[:8]}… members={len(ms)}')
by={}
for m in ms:
  by.setdefault(m.get('role_title') or '?', []).append(m)
founder=(by.get('FOUNDER') or [None])[0]
tech=(by.get('TECH LEAD') or [None])[0]
prod=(by.get('PRODUCT LEAD') or [None])[0]
if not founder or not tech:
  print('  FAIL need FOUNDER and TECH LEAD in demo hierarchy'); open('/tmp/l2_hier','w').write('1'); sys.exit(1)

def post(tok, body):
  req=urllib.request.Request(api+'/org/hierarchy/assign', data=json.dumps(body).encode(),
    headers={'Authorization':'Bearer '+tok,'Content-Type':'application/json'}, method='POST')
  try:
    with urllib.request.urlopen(req, timeout=25) as r:
      return r.status, json.loads(r.read())
  except Exception as e:
    code=getattr(e,'code',None)
    raw=b'{}'
    try: raw=e.read() if hasattr(e,'read') else e.fp.read()
    except: pass
    try: d=json.loads(raw.decode() or '{}')
    except: d={}
    return code, d

# 1) Admin assign: tech reports to founder (person→person edge)
code,d=post(stok, {
  'person_entity_id': tech['child_id'],
  'manager_entity_id': founder['child_id'],
  'role_title': tech.get('role_title') or 'TECH LEAD',
})
if code==200 and d.get('ok'):
  print('  PASS admin hierarchy assign tech→founder')
else:
  print('  FAIL admin assign', code, d); open('/tmp/l2_hier','w').write('1')

# 2) Cycle refuse: founder reports to tech (would cycle if edge above active)
code,d=post(stok, {
  'person_entity_id': founder['child_id'],
  'manager_entity_id': tech['child_id'],
})
if code in (422,409) and d.get('code')=='CYCLE':
  print('  PASS cycle assignment refused')
elif d.get('code')=='CYCLE':
  print('  PASS cycle assignment refused code=CYCLE http', code)
else:
  # Some orgs already have person edges; still must not 200 into a cycle
  if code==200 and d.get('ok'):
    print('  FAIL cycle assignment accepted', d); open('/tmp/l2_hier','w').write('1')
  else:
    print('  PASS cycle-safe refusal shape', code, d.get('code'))

# 3) Foreign / unknown person → NOT_FOUND (no leak)
code,d=post(stok, {
  'person_entity_id': '00000000-0000-4000-8000-000000000099',
  'manager_entity_id': founder['child_id'],
})
if d.get('code') in ('PERSON_NOT_FOUND','MANAGER_NOT_FOUND') or code in (404,422):
  print('  PASS foreign person id refused', d.get('code') or code)
else:
  print('  FAIL foreign person accepted or odd', code, d); open('/tmp/l2_hier','w').write('1')

# 4) Non-admin cannot assign
if wtok:
  code,d=post(wtok, {
    'person_entity_id': tech['child_id'],
    'manager_entity_id': founder['child_id'],
  })
  if code in (401,403):
    print('  PASS non-admin hierarchy assign denied http', code)
  else:
    print('  FAIL non-admin hierarchy assign http', code, d); open('/tmp/l2_hier','w').write('1')

# 5) Re-read hierarchy still coherent
req=urllib.request.Request(api+'/org/hierarchy', headers={'Authorization':'Bearer '+stok})
with urllib.request.urlopen(req, timeout=20) as r:
  h2=json.loads(r.read())
n2=len(h2.get('memberships') or [])
print(f'  hierarchy re-read members={n2}')
if n2 < 1:
  print('  FAIL hierarchy empty after assign'); open('/tmp/l2_hier','w').write('1')
else:
  print('  PASS hierarchy remains readable after assign pressure')
" "$H" || true
[[ -f /tmp/l2_hier ]] && { fail "hierarchy assign pressure"; rm -f /tmp/l2_hier; } || pass "hierarchy assign pressure block"

# ── Isolation (same-tenant roles + optional smoke org) ───────────────────
echo "--- isolation pressure ---"
python3 - <<'PY'
import json, os, urllib.request
api=os.environ["API"]
stok=os.environ["STOK"]
dtok=os.environ.get("DTOK","")
passw=os.environ["PASS"]

def get(tok, path):
  req=urllib.request.Request(api+path, headers={"Authorization":"Bearer "+tok})
  with urllib.request.urlopen(req, timeout=25) as r:
    return json.loads(r.read())

def login(email):
  req=urllib.request.Request(api+"/auth/login", data=json.dumps({
    "email":email,"password":passw,
    "requested_operations":["read","write","share","admin_org"]
  }).encode(), headers={"Content-Type":"application/json"}, method="POST")
  try:
    with urllib.request.urlopen(req, timeout=20) as r:
      return json.loads(r.read()).get("token") or ""
  except Exception:
    return ""

fails=0
# Founder prefs must not appear in david prefs
fp=get(stok, "/otzar/work-style/preferences")
fids={p.get("correction_id") for p in (fp.get("preferences") or [])}
if dtok:
  dp=get(dtok, "/otzar/work-style/preferences")
  dids={p.get("correction_id") for p in (dp.get("preferences") or [])}
  leak=fids & dids - {None}
  if leak:
    print("  FAIL cross-user preference leak", list(leak)[:2]); fails=1
  else:
    print("  PASS cross-user work-style prefs isolated")
  # twin ids must differ
  ft=get(stok, "/otzar/my-twin")
  dt=get(dtok, "/otzar/my-twin")
  fid=(ft.get("twin") or {}).get("twin_id")
  did=(dt.get("twin") or {}).get("twin_id")
  if fid and did and fid==did:
    print("  FAIL founder and david share twin_id", fid); fails=1
  else:
    print("  PASS twin_id distinct across users", (fid or "")[:8], (did or "")[:8])
  # my-work id overlap
  def ids(x):
    s=set()
    for it in (x.get("items") or x.get("entries") or []):
      s.add(it.get("id") or it.get("work_item_id") or it.get("entry_id"))
    return s-{None}
  fw, dw = get(stok, "/work-os/my-work?take=30"), get(dtok, "/work-os/my-work?take=30")
  ov=ids(fw)&ids(dw)
  if ov:
    print("  FAIL my-work id overlap", list(ov)[:3]); fails=1
  else:
    print(f"  PASS my-work ids isolated founder={len(ids(fw))} david={len(ids(dw))}")

# Cross-org: smoke-admin if available
smoke=login("smoke-admin@niovlabs.com")
if smoke:
  sh=get(smoke, "/org/hierarchy")
  fh=get(stok, "/org/hierarchy")
  so, fo = sh.get("org_entity_id"), fh.get("org_entity_id")
  print(f"  smoke_org={str(so)[:8]} demo_org={str(fo)[:8]}")
  if so and fo and so==fo:
    print("  WARN smoke-admin resolves to same org as demo (no second tenant)")
  elif so and fo and so!=fo:
    print("  PASS distinct smoke vs demo org entities")
    # smoke must not list demo hierarchy memberships by id
    sm={m.get("membership_id") for m in (sh.get("memberships") or [])}
    dm={m.get("membership_id") for m in (fh.get("memberships") or [])}
    if sm & dm - {None}:
      print("  FAIL cross-org membership_id leak"); fails=1
    else:
      print("  PASS cross-org hierarchy memberships isolated")
    # smoke cannot enable policy for demo? own org only — just ensure prefs don't share ids
    try:
      sp=get(smoke, "/otzar/work-style/preferences")
      sids={p.get("correction_id") for p in (sp.get("preferences") or [])}
      if sids & fids - {None}:
        print("  FAIL cross-org preference id leak"); fails=1
      else:
        print("  PASS cross-org work-style preference ids isolated")
    except Exception as e:
      print("  WARN smoke work-style prefs", type(e).__name__)
else:
  print("  WARN smoke-admin login unavailable with DEMO_SHARED_PASSWORD — true cross-tenant not fully exercised")

open("/tmp/l2_iso","w").write(str(fails))
PY
[[ "$(cat /tmp/l2_iso 2>/dev/null || echo 1)" == "0" ]] && pass "isolation pressure" || fail "isolation pressure"

# ── Provider honesty (Meet + Docs) ───────────────────────────────────────
echo "--- provider honesty ---"
python3 - <<'PY'
import json, os, urllib.request
api=os.environ["API"]
stok=os.environ["STOK"]
H={"Authorization":"Bearer "+stok,"Content-Type":"application/json"}
fails=0

def post(path, body):
  req=urllib.request.Request(api+path, data=json.dumps(body).encode(), headers=H, method="POST")
  try:
    with urllib.request.urlopen(req, timeout=40) as r:
      return r.status, json.loads(r.read())
  except Exception as e:
    code=getattr(e,"code",None)
    raw=b"{}"
    try: raw=e.read() if hasattr(e,"read") else e.fp.read()
    except: pass
    try: d=json.loads(raw.decode() or "{}")
    except: d={"err":str(e)[:120]}
    return code, d

code,d=post("/otzar/comms/ambient-sync", {})
if d.get("code") in ("SCOPE_REAUTH_REQUIRED","GOOGLE_NOT_CONNECTED","GOOGLE_RECONNECT_REQUIRED") or d.get("ok"):
  print("  PASS Meet ambient honest", d.get("code") or "ok")
else:
  print("  FAIL Meet ambient unexpected", code, str(d)[:160]); fails=1

# Docs gates
for label, body, expect in [
  ("no_confirm", {"document_id":"x","body_text":"hi"}, {"NEEDS_CALLER_CONFIRMATION"}),
  ("no_body", {"document_id":"x","caller_confirmed":True}, {"BODY_REQUIRED"}),
  ("no_doc", {"body_text":"hi","caller_confirmed":True}, {"NEEDS_DOCUMENT_ID"}),
  ("confirmed_probe", {"document_id":"1invalidPressureProbeDocIdxxxxxxxxxxxx","body_text":"pressure line","caller_confirmed":True},
   {"DOC_WRITE_SCOPE_MISSING","GOOGLE_RECONNECT_REQUIRED","APPEND_FAILED","PROVIDER_ERROR","NOT_FOUND"}),
]:
  code,d=post("/google/docs/append", body)
  c=d.get("code")
  if c in expect:
    print(f"  PASS docs {label} → {c}")
  else:
    print(f"  FAIL docs {label} got {c} expected one of {expect}"); fails=1

# Soft note: APPEND_FAILED on invalid id after scopes pass is acceptable pressure;
# DOC_WRITE_SCOPE_MISSING is preferred when scopes are the real blocker.
if fails==0:
  print("  note: prefer DOC_WRITE_SCOPE_MISSING/GOOGLE_RECONNECT over opaque APPEND_FAILED when scopes are missing")
open("/tmp/l2_prov","w").write(str(fails))
PY
[[ "$(cat /tmp/l2_prov 2>/dev/null || echo 1)" == "0" ]] && pass "provider honesty" || fail "provider honesty"

# ── CT hierarchy authoring surface (assign UI, not silent absence) ───────
echo "--- CT hierarchy authoring markers ---"
HTML=$(curl -sS -m 15 "$APP/?cb=$(date +%s)")
JS=$(echo "$HTML" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
curl -sS -m 40 "$APP/assets/$JS" -o /tmp/ctl2.js
python3 - <<'PY'
d=open('/tmp/ctl2.js',errors='ignore').read()
need=[
  ('reporting-assign', 'assign control'),
  ('reporting-manager-select', 'manager picker'),
  ('hierarchy', 'hierarchy string'),
]
fail=0
for n,label in need:
  ok=n in d
  print(('  PASS' if ok else '  FAIL'), 'CT', label, n, ok)
  if not ok: fail=1
# DnD is not required if assign form is the product; surface honesty
dnd = any(x in d for x in ['DndContext','onDragEnd','drag-handle','useDraggable'])
if dnd:
  print('  PASS CT has drag/reorder machinery')
else:
  print('  WARN CT has no DnD hierarchy reorder — product uses assign form (document, do not claim DnD)')
open('/tmp/l2_ct','w').write(str(fail))
PY
[[ "$(cat /tmp/l2_ct 2>/dev/null || echo 1)" == "0" ]] && pass "CT hierarchy markers" || fail "CT hierarchy markers"

echo "=== PRESSURE LEVEL-2 RESULT ==="
echo "fails=$FAILS hard=$HARD warns=$WARNS live_sha=$SHA"
echo "classification: $([[ $HARD -eq 0 && $FAILS -eq 0 ]] && echo functionally_pressure_green || echo defects_exposed)"
exit "$FAILS"
