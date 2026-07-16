#!/usr/bin/env bash
# FILE: render-deploy-check.sh
# PURPOSE: Diagnose why api.otzar.ai may be stuck on an old container.
#          Verifies health, route surface, and (if RENDER_API_KEY works)
#          lists Render services + latest deploys + triggers a deploy.
#
# Usage:
#   export RENDER_API_KEY=rnd_...   # from https://dashboard.render.com/u/settings#api-keys
#   bash scripts/render-deploy-check.sh
#   bash scripts/render-deploy-check.sh --trigger   # trigger deploy of latest main
#
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"

API_PUBLIC="${API_PUBLIC:-https://api.otzar.ai/api/v1}"
API_RENDER="${API_RENDER:-https://otzar-api.onrender.com/api/v1}"
TRIGGER=0
[[ "${1:-}" == "--trigger" ]] && TRIGGER=1

echo "=== 1. Live health fingerprints ==="
for BASE in "$API_PUBLIC" "$API_RENDER"; do
  echo "--- $BASE/health ---"
  curl -sS -m 15 "$BASE/health" | python3 -m json.tool 2>/dev/null || curl -sS -m 15 "$BASE/health"
  echo
done

echo "=== 2. Route surface (401=registered, 404=not on this container) ==="
probe() {
  local method=$1 path=$2
  local code
  if [[ "$method" == "GET" ]]; then
    code=$(curl -sS -m 12 -o /tmp/rdc.json -w "%{http_code}" -H "Authorization: Bearer x" "$API_PUBLIC$path")
  else
    code=$(curl -sS -m 12 -o /tmp/rdc.json -w "%{http_code}" -X POST "$API_PUBLIC$path" \
      -H "Content-Type: application/json" -d '{}')
  fi
  local body
  body=$(python3 -c "print(open('/tmp/rdc.json').read()[:90].replace(chr(10),' '))" 2>/dev/null || true)
  printf "  %-6s %-50s -> %s  %s\n" "$method" "$path" "$code" "$body"
}
probe GET  "/otzar/dgi-coherence"
probe POST "/otzar/handoffs/x/acknowledge"
probe POST "/otzar/handoffs/x/complete-ambient"
probe GET  "/relay/threads"
probe POST "/relay/messages"
probe POST "/calendar/events/propose"

echo
echo "=== 3. Expected git on origin/main ==="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch origin main -q 2>/dev/null || true
  echo "  origin/main = $(git rev-parse --short origin/main 2>/dev/null || echo unknown)"
  echo "  expected features on main: complete-ambient, relay/*"
else
  echo "  (not in a git repo — skip)"
fi

echo
echo "=== 4. Render API (requires valid RENDER_API_KEY) ==="
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "  RENDER_API_KEY is unset."
  echo "  Create one: https://dashboard.render.com/u/settings#api-keys"
  echo "  export RENDER_API_KEY=rnd_..."
  exit 2
fi

OWNERS=$(curl -sS -m 20 -w "\n%{http_code}" -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" "https://api.render.com/v1/owners")
HTTP=$(echo "$OWNERS" | tail -1)
BODY=$(echo "$OWNERS" | sed '$d')
if [[ "$HTTP" != "200" ]]; then
  echo "  Render API Unauthorized/failed (HTTP $HTTP)."
  echo "  Body: $BODY"
  echo
  echo "  FIX: Your RENDER_API_KEY is invalid or revoked."
  echo "  1. Open https://dashboard.render.com/u/settings#api-keys"
  echo "  2. Create a new API key"
  echo "  3. export RENDER_API_KEY=rnd_..."
  echo "  4. Re-run: bash scripts/render-deploy-check.sh --trigger"
  echo
  echo "  MANUAL DEPLOY (no API key needed if you are logged into the browser):"
  echo "  1. https://dashboard.render.com → otzar-api"
  echo "  2. Settings → Build & Deploy → Auto-Deploy = Yes, Branch = main"
  echo "  3. Manual Deploy → Deploy latest commit"
  echo "  4. Confirm Events shows a successful deploy for the latest main SHA"
  exit 3
fi

echo "  Render API auth OK"
echo "$BODY" | python3 -c "
import json,sys
owners=json.load(sys.stdin)
for o in owners if isinstance(owners,list) else []:
  x=o.get('owner',o)
  print('  owner', x.get('id'), x.get('name'), x.get('email'))
"

SERVICES=$(curl -sS -m 30 -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Accept: application/json" "https://api.render.com/v1/services?limit=50")
echo "$SERVICES" | python3 -c "
import json,sys
items=json.load(sys.stdin)
if not isinstance(items, list):
  print('  unexpected', items); sys.exit(0)
print('  services:', len(items))
for it in items:
  s=it.get('service', it)
  name=s.get('name')
  sid=s.get('id')
  sd=s.get('serviceDetails') or {}
  print(f\"  - {name} id={sid} branch={sd.get('branch')} autoDeploy={sd.get('autoDeploy')} suspended={s.get('suspended')}\")
  repo=sd.get('repo') or sd.get('repoUrl') or ''
  if repo: print(f'      repo={repo}')
"

# Find otzar-api service id
SERVICE_ID=$(echo "$SERVICES" | python3 -c "
import json,sys
items=json.load(sys.stdin)
for it in items if isinstance(items,list) else []:
  s=it.get('service', it)
  name=(s.get('name') or '').lower()
  if name in ('otzar-api','niov-foundation','foundation-api') or 'otzar' in name and 'api' in name:
    print(s.get('id','')); break
")

if [[ -z "$SERVICE_ID" ]]; then
  echo "  Could not auto-detect otzar-api service id. List above; set RENDER_SERVICE_ID=srv-..."
  SERVICE_ID="${RENDER_SERVICE_ID:-}"
fi

if [[ -z "$SERVICE_ID" ]]; then
  echo "  No service id — cannot list deploys or trigger."
  exit 4
fi

echo
echo "=== 5. Recent deploys for $SERVICE_ID ==="
curl -sS -m 30 -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=8" | python3 -c "
import json,sys
items=json.load(sys.stdin)
for it in items if isinstance(items,list) else []:
  d=it.get('deploy', it)
  print(' ', d.get('id'), d.get('status'), d.get('commit',{}).get('id','')[:8] if isinstance(d.get('commit'),dict) else d.get('commitId','')[:12], d.get('finishedAt') or d.get('createdAt'))
"

if [[ "$TRIGGER" -eq 1 ]]; then
  echo
  echo "=== 6. Triggering deploy (clearCache=true) ==="
  curl -sS -m 30 -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
    -d '{"clearCache":"clear"}' | python3 -m json.tool
  echo "  Deploy requested. Re-run this script in 3–8 minutes and expect:"
  echo "    POST /relay/messages -> 401 (not 404)"
  echo "    health.git_commit matches origin/main"
fi

echo
echo "DONE"
