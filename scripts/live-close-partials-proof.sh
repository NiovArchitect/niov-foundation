#!/usr/bin/env bash
# Live multi-persona close-partials proof against api.otzar.ai (and optional render).
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
API="${OTZAR_SMOKE_API_URL:-https://api.otzar.ai/api/v1}"
PW='${DEMO_SHARED_PASSWORD:-\$Oasisme1234}'
# shellcheck disable=SC2016
PW='${Oasisme1234}'

login() {
  curl -sS -m 25 -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"\$Oasisme1234\",\"requested_operations\":[\"read\",\"write\",\"admin_org\"]}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))"
}

STOKEN=$(login sadeil@niovlabs.com)
DTOKEN=$(login david@niovlabs.com)
echo "tokens sadeil=${#STOKEN} david=${#DTOKEN}"
DAVID=b69b25c5-6d6c-4b95-84fa-ae7d78705c08

echo "=== HOST app.otzar.ai ==="
curl -sS -m 15 -o /dev/null -w "app:%{http_code}\n" -L "https://app.otzar.ai/login"

echo "=== HANDOFF ONE-TAP + COMPLETE ==="
CREATE=$(curl -sS -m 25 -X POST "$API/otzar/handoffs" \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"[CLOSE] One-tap lifecycle $(date +%s)\",\"summary\":\"ack+complete\",\"incoming_responsible_entity_id\":\"$DAVID\",\"priority\":\"ELEVATED\",\"origin_key\":\"close-$(date +%s)\"}")
HID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['handoff']['handoff_id'])")
VER=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin)['handoff']['version'])")
for t in ready send; do
  R=$(curl -sS -m 20 -X POST "$API/otzar/handoffs/$HID/transition" \
    -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
    -d "{\"expected_version\":$VER,\"transition\":\"$t\"}")
  VER=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['handoff']['version'])")
done
ACK=$(curl -sS -m 30 -X POST "$API/otzar/handoffs/$HID/acknowledge" \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" -d '{}')
echo "$ACK" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ack', d.get('ok'), (d.get('handoff') or {}).get('state'), d.get('acknowledged_turn_id','')[:8])"
AVER=$(echo "$ACK" | python3 -c "import json,sys; print(json.load(sys.stdin)['handoff']['version'])")
COMP=$(curl -sS -m 30 -X POST "$API/otzar/handoffs/$HID/complete-ambient" \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" \
  -d "{\"expected_version\":$AVER}")
echo "$COMP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('complete', d.get('ok'), (d.get('handoff') or {}).get('state'), d.get('code'))"

echo "=== COLLAB ACCEPT + REJECT ==="
C1=$(curl -sS -m 25 -X POST "$API/otzar/my-twin/collaboration-requests" \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d "{\"target_type\":\"EMPLOYEE\",\"request_type\":\"STATUS_REQUEST\",\"safe_summary\":\"[CLOSE] accept $(date +%s)\",\"target_entity_id\":\"$DAVID\"}")
CID=$(echo "$C1" | python3 -c "import json,sys; print(json.load(sys.stdin)['collaboration']['collaboration_id'])")
curl -sS -m 20 -X POST "$API/otzar/my-twin/collaboration-requests/$CID/accept" \
  -H "Authorization: Bearer $DTOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print('accept', d.get('ok'), (d.get('collaboration') or {}).get('state'), d.get('code'))"
C2=$(curl -sS -m 25 -X POST "$API/otzar/my-twin/collaboration-requests" \
  -H "Authorization: Bearer $STOKEN" -H "Content-Type: application/json" \
  -d "{\"target_type\":\"EMPLOYEE\",\"request_type\":\"FOLLOW_UP\",\"safe_summary\":\"[CLOSE] reject $(date +%s)\",\"target_entity_id\":\"$DAVID\"}")
CID2=$(echo "$C2" | python3 -c "import json,sys; print(json.load(sys.stdin)['collaboration']['collaboration_id'])")
curl -sS -m 20 -X POST "$API/otzar/my-twin/collaboration-requests/$CID2/reject" \
  -H "Authorization: Bearer $DTOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print('reject', d.get('ok'), (d.get('collaboration') or {}).get('state'), d.get('code'))"

echo "=== TWIN ACCURACY (adversarial) ==="
# When zero handoffs, force status question
CHAT=$(curl -sS -m 90 -X POST "$API/otzar/conversation/message" \
  -H "Authorization: Bearer $DTOKEN" -H "Content-Type: application/json" \
  -d '{"message":"What open handoffs need my attention right now? Only durable facts.","source_channel":"CHAT"}')
echo "$CHAT" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read(), strict=False)
print('chat ok', d.get('ok'), 'user_turn', bool(d.get('user_turn_id')))
r=(d.get('response') or '')
print('resp_snip', r[:400].replace(chr(10),' '))
print('claims_open_handoff_need', 'handoff needs' in r.lower() and 'none' not in r.lower()[:200])
"

echo "=== DGI DAVID ==="
curl -sS -m 20 -H "Authorization: Bearer $DTOKEN" "$API/otzar/dgi-coherence" | python3 -c "
import json,sys
c=json.load(sys.stdin, strict=False).get('coherence') or {}
print('handoffs', c.get('open_incoming_handoffs_count'), 'nbs', (c.get('next_best_step') or {}).get('kind'), 'acc', 'ACCURACY' in (c.get('system_block') or ''))
"
echo "DONE"
