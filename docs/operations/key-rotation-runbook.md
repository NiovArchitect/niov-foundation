# Key Rotation Runbook — Chat-Exposed Provider Keys

**Status:** Phase 1261 deliverable (2026-06-12). Founder-assisted —
rotation happens ONLY with the Founder logged into each provider
console. Keys are never typed into chat, never printed, never
committed; old and new values exist only in the provider console and
the deployment `.env` (gitignored — confirm with
`git check-ignore .env` before any commit).

**Why:** four keys were pasted into a chat session during Phase 1258
setup (OpenAI, Deepgram, ElevenLabs, AssemblyAI). Chat transcripts
are an exposure surface; rotate at the next convenient moment.

## Per-provider rotation (≈3 minutes each)

| # | Provider | Console | Steps |
|---|---|---|---|
| 1 | OpenAI | https://platform.openai.com/api-keys | Create new secret key → replace `OPENAI_API_KEY` in foundation `.env` → delete the old key in the console |
| 2 | Deepgram | https://console.deepgram.com → API Keys | Create new key → replace `DEEPGRAM_API_KEY` → delete old key |
| 3 | ElevenLabs | https://elevenlabs.io → Profile → API Keys | Regenerate/create key → replace `ELEVENLABS_API_KEY` (leave `ELEVENLABS_VOICE_ID` unchanged — Sarah `EXAVITQu4vr4xnSDxMaL`) → remove old key |
| 4 | AssemblyAI | https://www.assemblyai.com/app → API Keys | Rotate key → replace `ASSEMBLYAI_API_KEY` → invalidate old |

## After each rotation

1. Restart the API (the demo launcher `scripts/start-demo-api.sh`
   already allowlists all four names).
2. Re-verify readiness honestly:
   - ElevenLabs: Voice Providers → "Hear it" must play the premium
     voice (NOT the device fallback) — or POST
     `/api/v1/otzar/voice/tts-preview` returns `audio/mpeg`.
   - OpenAI/Deepgram/AssemblyAI: `GET /api/v1/connectors/adapters`
     rows flip to "Configured" (env presence); deeper runtime checks
     arrive with their respective runtime slices.
3. If anything reads "Needs credentials" after rotation, the new
   value didn't load — check `.env` quoting (strip quotes in shell)
   and restart again. Never paste the key into chat to debug.

## Discipline

- One provider at a time; verify before moving to the next.
- If a rotation breaks voice mid-demo, ElevenLabs is the only
  user-audible dependency — rotate it last or off-hours.
- Anthropic (`ANTHROPIC_API_KEY`) was NOT chat-exposed; no rotation
  required. Supabase credentials were already rotated in Phase 1258.
