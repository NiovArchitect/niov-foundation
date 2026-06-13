#!/usr/bin/env bash
# FILE: scripts/start-demo-api.sh
# PURPOSE: Start the Foundation API for the local visual desktop run
#          with the real LLM keys loaded from .env, but with all other
#          env vars (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.) pinned
#          to the local-dev values in .env.demo.local.
#
#          This is the talking-AI-Twin path: NODE_ENV is flipped from
#          "test" to "development" so the OtzarService uses the REAL
#          AnthropicProvider (or OpenAIProvider) instead of the
#          MockLLMProvider that NODE_ENV=test forces.
#
# USAGE:
#   bash scripts/start-demo-api.sh
#
# SAFETY POSTURE:
#   - The LLM keys are read from .env at runtime ONLY. They are never
#     printed, never echoed to stdout, never written to a new file.
#     The script verifies presence and reports a redacted prefix
#     (e.g., "sk-an...") so the operator can confirm the right key
#     is loaded without exposing the value.
#   - DATABASE_URL is FORCED to localhost (we ignore any .env value
#     that doesn't contain "localhost") so this script can NEVER
#     accidentally talk to production Supabase.
#   - REDIS_URL is FORCED to the demo Redis container.
#   - JWT_SECRET / ENCRYPTION_KEY stay as the local-dev demo values.
#
# Per [FOUNDER-AUTH — VERIFY LLM ENV KEY + ACTIVATE TALKING AI TWIN
# BRAIN SAFELY]:
#   - Do NOT print the full API key.
#   - Do NOT commit the key.
#   - Do NOT expose the key in logs, docs, PRs, browser UI.
#   - Only verify presence + provider type + model name.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f .env.demo.local ]; then
  echo "ERROR: .env.demo.local not found at repo root. Source the demo seed README." >&2
  exit 1
fi

# Load the local-dev base (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.).
set -a
# shellcheck disable=SC1091
. ./.env.demo.local
set +a

# Strict localhost guard — never let .env's production DATABASE_URL
# leak through even if a future merge edits .env.demo.local.
if [[ "${DATABASE_URL:-}" != *"localhost"* ]]; then
  echo "ERROR: .env.demo.local DATABASE_URL must point at localhost. Got prefix: ${DATABASE_URL:0:20}" >&2
  exit 1
fi

# Flip from NODE_ENV=test to NODE_ENV=development so OtzarService
# does NOT short-circuit to MockLLMProvider. The unit + integration
# tiers still set NODE_ENV=test via vitest config; only this manual
# launch flips it.
export NODE_ENV=development

# Pull real LLM keys from .env (already on disk) WITHOUT exposing
# their values. The keys overwrite the test-stub values from
# .env.demo.local in this process only.
if [ -f .env ]; then
  while IFS='=' read -r key rest; do
    case "$key" in
      ANTHROPIC_API_KEY|OPENAI_API_KEY|LLM_PROVIDER|PREFERRED_LLM|OPENAI_MODEL|ANTHROPIC_MODEL|MODEL_ROUTER_DEFAULT_MODEL|DEEPGRAM_API_KEY|ELEVENLABS_API_KEY|ELEVENLABS_VOICE_ID|ELEVENLABS_MODEL_ID|ASSEMBLYAI_API_KEY|GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|SLACK_CLIENT_ID|SLACK_CLIENT_SECRET|SLACK_SIGNING_SECRET|MICROSOFT_GRAPH_CLIENT_ID|MICROSOFT_GRAPH_CLIENT_SECRET|MICROSOFT_GRAPH_TENANT_ID|ZOOM_OAUTH_CLIENT_ID|ZOOM_OAUTH_CLIENT_SECRET|OAUTH_REDIRECT_BASE_URL)
        # Strip surrounding quotes if present.
        value="${rest%\"}"
        value="${value#\"}"
        export "$key=$value"
        ;;
    esac
  done < .env
fi

# Founder directive [FOUNDER-AUTH — USE OPENAI AS THE LLM PROVIDER]
# pins the default provider for the visual desktop run to OpenAI.
# An operator who wants Anthropic can set LLM_PROVIDER=anthropic in
# their .env.demo.local before invoking this wrapper.
export LLM_PROVIDER="${LLM_PROVIDER:-openai}"

# Redacted-presence report. We print a short prefix only so the
# operator can sanity-check which provider key is loaded; we never
# print the full value.
mask() {
  local v="${1:-}"
  local len="${#v}"
  if [ "$len" -eq 0 ]; then echo "<unset>"; return; fi
  # Show first 6 chars + length only.
  echo "${v:0:6}…(${len} chars)"
}

echo "═══ Demo API startup ═══"
echo "  NODE_ENV             = $NODE_ENV"
echo "  DATABASE_URL prefix  = ${DATABASE_URL:0:30}…"
echo "  REDIS_URL            = ${REDIS_URL:-<unset>}"
echo "  LLM_PROVIDER         = ${LLM_PROVIDER}"
echo "  OPENAI_MODEL         = ${OPENAI_MODEL:-<unset; OpenAIProvider falls back to MODEL_ROUTER_DEFAULT_MODEL or gpt-4o>}"
echo "  ANTHROPIC_MODEL      = ${ANTHROPIC_MODEL:-<unset; AnthropicProvider falls back to MODEL_ROUTER_DEFAULT_MODEL or claude-sonnet-4-6>}"
echo "  MODEL_ROUTER_DEFAULT_MODEL = ${MODEL_ROUTER_DEFAULT_MODEL:-<unset>}"
echo "  ANTHROPIC_API_KEY    = $(mask "${ANTHROPIC_API_KEY:-}")"
echo "  OPENAI_API_KEY       = $(mask "${OPENAI_API_KEY:-}")"
echo "  PORT                 = ${PORT:-3000}"
echo "════════════════════════"

# Hand off to the API.
cd apps/api
exec npx tsx src/server.ts
