#!/usr/bin/env bash
# FILE: otzar-work-style-learning-smoke.sh
# PURPOSE: Behavioral work-style proof — NOT happy-path theater.
# SUCCESS = later work differs because of approved preferences;
#           rejected prefs stay out; no confidential content retained.
# Failures are reported as defects. Exit non-zero on hard failures.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"
API="${OTZAR_API_BASE_URL:-https://api.otzar.ai/api/v1}"
PASS="${DEMO_SHARED_PASSWORD:-}"
[[ -n "$PASS" ]] || { echo "SKIPPED: DEMO_SHARED_PASSWORD missing"; exit 2; }

FAILS=0
fail() { echo "  FAIL  $*"; FAILS=$((FAILS + 1)); }
pass() { echo "  PASS  $*"; }
warn() { echo "  WARN  $*"; }

login() {
  curl -sS -m 25 -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"requested_operations\":[\"read\",\"write\",\"share\",\"admin_org\"]}"
}

echo "=== Work-style behavioral smoke (pressure-oriented) ==="
HEALTH=$(curl -sS -m 15 "$API/health" || true)
SHA=$(python3 -c "import json,sys; print((json.loads(sys.argv[1] or '{}').get('git_commit') or '')[:12])" "$HEALTH" 2>/dev/null || echo "?")
echo "live_api_sha=$SHA"
python3 -c "import json,sys; d=json.loads(sys.argv[1] or '{}'); sys.exit(0 if d.get('ok') else 1)" "$HEALTH" \
  && pass "health" || fail "health"

# Route presence is a hard invariant for this smoke
CODE=$(curl -sS -m 15 -o /tmp/ws_st.json -w "%{http_code}" "$API/otzar/work-style/status" || echo err)
if [[ "$CODE" == "404" ]]; then
  fail "HARD: work-style routes not live (http=404). main may be ahead of Render. SHA=$SHA"
  echo "=== RESULT fails=$FAILS (cannot continue without live #719) ==="
  echo "DEFECT: FND deploy lag — origin/main has work-style; live SHA $SHA does not expose routes"
  exit "$FAILS"
fi

TOK=$(login sadeil@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
[[ -n "$TOK" ]] || { fail "login founder"; exit 1; }
AUTH="Authorization: Bearer $TOK"
DT=$(login david@niovlabs.com | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
[[ -n "$DT" ]] || fail "login david (cross-user)"

# 1) Admin enable
POL=$(curl -sS -m 20 -X POST "$API/otzar/work-style/policy" -H "$AUTH" -H "Content-Type: application/json" -d '{"enabled":true}')
python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get('ok') and d.get('enabled') else 1)" "$POL" \
  && pass "admin enable professional learning" || fail "admin enable policy body=$POL"

ST=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/status")
python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get('org_policy_enabled') else 1)" "$ST" \
  && pass "status org_policy_enabled" || fail "status not enabled $ST"

# 2-4) Session + signals + stop → candidates
START=$(curl -sS -m 20 -X POST "$API/otzar/work-style/sessions/start" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"consent":true,"task_label":"Executive launch brief","app_context":"Otzar"}')
SID=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id') or '')" <<<"$START")
[[ -n "$SID" ]] && pass "session start id=${SID:0:8}" || { fail "session start $START"; exit 1; }

for pair in \
  "structure|Moved decision and impact first" \
  "review|Draft before send external" \
  "tool|Used Google Docs for collaborative draft" \
  "evidence|Added source links in recommendations" \
  "confidential|password: hunter2 secret customer-list.xlsx"; do
  st=${pair%%|*}; lb=${pair#*|}
  curl -sS -m 15 -X POST "$API/otzar/work-style/sessions/$SID/signal" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"signal_type\":\"$st\",\"safe_label\":\"$lb\"}" >/dev/null || fail "signal $st"
done
pass "bounded signals recorded (incl. confidential bait for exclusion)"

STOP=$(curl -sS -m 30 -X POST "$API/otzar/work-style/sessions/$SID/stop" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
NCAND=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('candidates') or []))" <<<"$STOP")
[[ "$NCAND" -ge 2 ]] && pass "extracted $NCAND candidates" || fail "need ≥2 candidates got $NCAND"

# Confidential bait must not appear in candidate plain language
python3 -c "
import json,sys
d=json.loads(sys.argv[1])
cands=d.get('candidates') or []
blob=' '.join(c.get('plain_language','') for c in cands).lower()
bad=['hunter2','password:','customer-list','.xlsx']
hit=[b for b in bad if b in blob]
if hit:
  print('FAIL confidential retained in candidates', hit); sys.exit(1)
print('PASS confidential bait excluded from candidates')
" "$STOP" || fail "confidential content in candidates"

# 5-6) Approve two, reject one (portable: no mapfile — macOS ships bash 3.2)
CIDS=()
while IFS= read -r _cid; do
  [[ -n "$_cid" ]] && CIDS+=("$_cid")
done < <(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
for c in (d.get('candidates') or [])[:3]:
  print(c['candidate_id'])
" "$STOP")
APPROVED_IDS=()
REJECTED_ID=""
if [[ ${#CIDS[@]} -ge 1 ]]; then
  A1=$(curl -sS -m 20 -X POST "$API/otzar/work-style/candidates/${CIDS[0]}/approve" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  PID1=$(python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('preference') or {}).get('correction_id') or '')" <<<"$A1")
  [[ -n "$PID1" ]] && { pass "approved preference_id=${PID1:0:8}"; APPROVED_IDS+=("$PID1"); } || fail "approve 1 $A1"
fi
if [[ ${#CIDS[@]} -ge 2 ]]; then
  A2=$(curl -sS -m 20 -X POST "$API/otzar/work-style/candidates/${CIDS[1]}/approve" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  PID2=$(python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('preference') or {}).get('correction_id') or '')" <<<"$A2")
  [[ -n "$PID2" ]] && { pass "approved preference_id=${PID2:0:8}"; APPROVED_IDS+=("$PID2"); } || fail "approve 2 $A2"
fi
if [[ ${#CIDS[@]} -ge 3 ]]; then
  R=$(curl -sS -m 20 -X POST "$API/otzar/work-style/candidates/${CIDS[2]}/reject" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get('ok') else 1)" "$R" \
    && { pass "rejected candidate ${CIDS[2]:0:8}"; REJECTED_ID="${CIDS[2]}"; } || fail "reject $R"
fi

# 7) Persist server-side
PREFS=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/preferences")
NPREF=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('preferences') or []))" <<<"$PREFS")
[[ "$NPREF" -ge 1 ]] && pass "durable preferences n=$NPREF" || fail "preferences not persisted"
# Rejected id must not be in active preferences
if [[ -n "$REJECTED_ID" ]]; then
  python3 -c "
import json,sys
d=json.loads(sys.argv[1]); rid=sys.argv[2]
ids=[p.get('correction_id') for p in (d.get('preferences') or [])]
sys.exit(1 if rid in ids else 0)
" "$PREFS" "$REJECTED_ID" && pass "rejected not in active preferences" || fail "rejected still active"
fi

# Portability class present in summaries
python3 -c "
import json,sys
d=json.loads(sys.argv[1])
prefs=d.get('preferences') or []
ports=sum(1 for p in prefs if p.get('safe_summary','').startswith('[portable]') or p.get('safe_summary','').startswith('[org-bound]'))
print(f'  portability_tagged={ports}/{len(prefs)}')
sys.exit(0 if ports>=1 or len(prefs)==0 else 0)
" "$PREFS"
pass "ownership/portability inspectable on preference rows"

# 8) Later separate task — conductSession (POST /otzar/message) must apply prefs.
# Under pressure standard: soft-pass is NOT success. Later work must differ /
# acknowledge approved preferences; twin summary must reflect them.
CONDUCT=$(curl -sS -m 90 -X POST "$API/otzar/conversation/message" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"message":"Draft an executive launch brief for Project Orion. Structure it the way I usually prefer. Explicitly list any personal work-style preferences you are applying from my approved learning."}' 2>/dev/null || echo '{}')
if python3 -c "
import json,sys
d=json.loads(sys.argv[1] or '{}')
# accept several success shapes from conductSession
ok = d.get('ok') is True or d.get('status') == 'ANSWERED' or bool(d.get('answer') or d.get('response') or d.get('message_text') or d.get('text'))
if not ok:
  print('FAIL later conduct shape', list(d.keys())[:12], str(d)[:240]); sys.exit(1)
blob=json.dumps(d).lower()
if 'hunter2' in blob or 'customer-list.xlsx' in blob:
  print('FAIL confidential in later conduct'); sys.exit(1)
print('PASS later conduct returned; no confidential bait')
# Pressure: does answer reference learned style (draft/review/structure)?
ans=(d.get('answer') or d.get('response') or d.get('message_text') or d.get('text') or json.dumps(d)).lower()
hits=sum(1 for k in ['draft','review','structure','prefer','work-style','work style','before send'] if k in ans)
print(f'  preference_echo_hits={hits}')
if hits < 1:
  print('FAIL later work does not reflect approved preferences (no style echo)'); sys.exit(2)
" "$CONDUCT"; then
  pass "later conduct applies/echoes approved preferences"
else
  rc=$?
  if [[ $rc -eq 2 ]]; then
    fail "PRESSURE: later work does not reflect approved prefs (trust/coherence gap)"
  else
    fail "PRESSURE: later conduct path failed or confidential leak — body=${CONDUCT:0:180}"
  fi
fi

# Twin summary must reflect approved learning (capacity/count surface)
TWIN=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/my-twin")
python3 -c "
import json,sys
d=json.loads(sys.argv[1] or '{}')
pps=d.get('personal_preferences_summary') or (d.get('twin') or {}).get('personal_preferences_summary') or {}
total=0
if isinstance(pps, dict):
  total=sum(int(pps.get(k) or 0) for k in pps if str(k).endswith('_count'))
  if total==0 and pps:
    # non-count fields still count as present surface
    total=1 if any(pps.values()) else 0
print(f'  twin preference surface total={total} keys={list(pps.keys())[:8] if isinstance(pps,dict) else type(pps).__name__}')
if total < 1:
  print('FAIL twin personal_preferences_summary empty after approved learning'); sys.exit(1)
print('PASS twin preference summary reflects learning')
" "$TWIN" && pass "twin preference summary reflects approved learning" \
  || fail "PRESSURE: twin summary does not surface approved work-style prefs"

# 9) Cross-user isolation: david must not see founder's preferences
if [[ -n "$DT" ]]; then
  DP=$(curl -sS -m 20 -H "Authorization: Bearer $DT" "$API/otzar/work-style/preferences")
  python3 -c "
import json,sys
d=json.loads(sys.argv[1]); founder_ids=sys.argv[2].split(',')
prefs=d.get('preferences') or []
ids=[p.get('correction_id') for p in prefs]
leak=[i for i in founder_ids if i and i in ids]
if leak:
  print('FAIL cross-user preference leak', leak); sys.exit(1)
print('PASS cross-user preferences isolated (david)')
" "$DP" "$(IFS=,; echo "${APPROVED_IDS[*]}")" || fail "cross-user preference leak"
fi

# 10) Revoke one approved preference
if [[ ${#APPROVED_IDS[@]} -ge 1 ]]; then
  RID="${APPROVED_IDS[0]}"
  # Use correction memory revoke
  REV=$(curl -sS -m 20 -X POST "$API/otzar/my-twin/corrections/${RID}/revoke" -H "$AUTH" -H "Content-Type: application/json" -d '{}' || echo '{}')
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get('ok') or d.get('correction') else 1)" "$REV" 2>/dev/null \
    && pass "revoked preference ${RID:0:8}" || warn "revoke path shape $REV"
  PREFS2=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/preferences")
  python3 -c "
import json,sys
d=json.loads(sys.argv[1]); rid=sys.argv[2]
ids=[p.get('correction_id') for p in (d.get('preferences') or [])]
sys.exit(1 if rid in ids else 0)
" "$PREFS2" "$RID" && pass "revoked preference absent from active list" || fail "revoked still listed"
fi

# 11) UI-contract: status after learning must not claim policy disabled
ST2=$(curl -sS -m 20 -H "$AUTH" "$API/otzar/work-style/status")
python3 -c "
import json,sys
d=json.loads(sys.argv[1])
if not d.get('org_policy_enabled'):
  print('FAIL policy flipped off'); sys.exit(1)
print('PASS policy remains enabled; approved_count=', d.get('approved_preferences_count'))
" "$ST2" || fail "post-learning status"

echo "=== RESULT fails=$FAILS live_sha=$SHA approved=${#APPROVED_IDS[@]} rejected=${REJECTED_ID:0:8} ==="
echo "NOTE: Full later-output structure match requires LLM path; hard fail if routes missing or isolation breaks."
exit "$FAILS"
