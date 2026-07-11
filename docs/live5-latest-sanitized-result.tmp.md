# OTZAR LIVE-5 — Sanitized Result (working, uncommitted)

_OTZAR-LIVE-DEPLOY-1 LIVE-5. No secrets, no tokens._

## Infrastructure / deploy — PASS
- api.otzar.ai/api/v1/health → 200 (database connected); app.otzar.ai → 200 (TLS, Otzar)
- DNS both CNAMEs → Render edge; root/www untouched
- Frontend bundle → https://api.otzar.ai/api/v1; CORS allows app.otzar.ai

## Accounts / data repair — PASS
- 8 humans provisioned; logins work (Sadeil + David)
- TWIN_NOT_FOUND repaired: default-enterprise Hive + 8/8 AI_AGENT twins + TwinConfig (scripts/repair-live-demo-twins.ts; idempotent, no encryption)

## Runtime route checks (in-process live5-inproc) 
- Login: 200, ops=[read,write,share] (the earlier ops=[] was a /tmp sandbox artifact) — PASS
- My-Twin Sadeil: 200, twin present, is_admin_twin=true — PASS
- My-Twin David: 200, twin present, is_admin_twin=false (standard), org NIOV Labs — PASS
- TWIN_NOT_FOUND / OPERATION_NOT_PERMITTED: GONE — PASS
- ElevenLabs /otzar/voice/transcribe: 200, provider=ELEVENLABS, empty transcript for silence — PASS
- Anthropic conduct: was 503 LLM_UNAVAILABLE — ROOT CAUSE: default model claude-sonnet-4-6 returning persistent 529 overloaded; OpenAI fallback not viable (429 insufficient_quota, no billing). FIX: set ANTHROPIC_MODEL=claude-sonnet-4-5 (tested 200) on Render + redeploy (live). Conduct now unblocked — to be confirmed empirically by the browser smoke.

## Browser STT (Rule G) — LIVE-6 gap identified
- Desktop (Tauri) shell: MediaRecorder → /voice/transcribe (ElevenLabs server STT) — works.
- Browser (app.otzar.ai): uses ONLY Web Speech API; on its "network" error there is NO fallback to server STT. AmbientOtzarBar.tsx handleMicToggle gates desktopCap on detectShellMode()==='tauri_webview'.
- Impact: browser voice can fail with "Browser STT requires network access"; text input still works and routes through conduct. NOT a blocker for the text smoke.
- Proposed fix (separate LIVE-6 patch): wire browser MediaRecorder→/voice/transcribe as primary or fallback when Web Speech errors; rebuild + redeploy otzar-app; verify in a real browser.

## Two-computer smoke (Sadeil <-> David)
- READY via text (core loop unblocked). Browser voice optional pending the LIVE-6 STT-fallback patch; desktop app voice works today.

## Open manual items (founder)
- Flip otzar-api to Starter instance type (Render API 500s on plan change)
- Rotate the exposed Render API key
- ANTHROPIC_MODEL=claude-sonnet-4-5 is a temporary pin; revert (delete the env var) when claude-sonnet-4-6 capacity recovers, if desired.
