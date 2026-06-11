# Voice Provider Recommendation — verified 2026-06-11

**Status:** Research-verified recommendation per the Founder voice-first
addendum ("Do not claim a provider is best without verifying current
docs/capabilities"). Sources retrieved 2026-06-11 via live web research;
re-verify before any provider contract.

**Posture:** Provider-agnostic adapter stays canonical
(`apps/api/src/services/voice/stt-provider.ts` 4-provider pattern +
`docs/voice-first/voice-provider-adapter.md`). This doc names the
recommended activation order, not a lock-in.

## Verified June 2026 landscape

- **TTS latency tier (time-to-first-byte):** Cartesia Sonic Turbo ~40ms,
  ElevenLabs Flash v2.5 ~75ms, Cartesia Sonic-3 ~90ms, Rime Coda
  sub-100ms, Deepgram Aura-2 ~200ms. Latency is no longer the top-tier
  differentiator — prosody/emotional control and cost are.
- **Streaming STT:** AssemblyAI Universal-3 Pro Streaming ~150ms P50
  with the lowest missed-entity rate among majors; AssemblyAI also
  sells a full STT→LLM→TTS Voice Agent WebSocket at ~$4.50/hr.
  Deepgram remains the canonical low-latency streaming STT choice.
- **Speech-to-speech:** OpenAI launched Realtime-2 /
  Realtime-Translate / Realtime-Whisper (May 7, 2026) — native
  speech-to-speech with GPT-5-class reasoning; collapses the
  STT/LLM/TTS pipeline for conversational agents.
- **Sesame CSM-1B:** production-available via hosted APIs (OpenRouter
  ~$7/M input tokens, DeepInfra, fal.ai) or self-hosted on a single
  RTX 4090/L40S. Strength: context-aware prosody (conditions on audio
  history). It is a voice-output model — it still needs a separate
  STT + LLM; best as the premium-natural TTS seat, not end-to-end.
- **Barge-in reality check:** real interruption support requires
  stopping playback + cancelling in-flight TTS + cancelling LLM
  generation + resetting stream state. Turn-based stacks fake it;
  realtime stacks (OpenAI Realtime-2, Retell-style turn-taking
  models ~600ms end-to-end) do it properly.

## Recommended activation order for Otzar

| Seat | Recommendation | Why | Status |
|---|---|---|---|
| Immediate demo (today) | `DEMO_FIXTURE` + `LOCAL_BROWSER` STT + browser TTS | Already PROD-READY; zero credentials | LIVE in substrate |
| First paid STT seat | **Deepgram streaming** (existing `DEEPGRAM` adapter) | Lowest-friction activation — adapter already merged (Phase 1223); canonical low-latency streaming STT | `BLOCKED_BY_CREDENTIALS` (`DEEPGRAM_API_KEY`) |
| First paid TTS seat | **ElevenLabs Flash v2.5** (or Cartesia if cost wins at volume) | ~75ms TTFB, strong prosody; adapter to be added behind the existing voice-provider interface | NOT_IMPLEMENTED (adapter slot reserved) |
| Premium natural-conversation seat | **Sesame CSM-1B via fal.ai or self-hosted** | Context-aware prosody is the closest match to the Founder's Sesame-quality bar; production-hostable | NOT_IMPLEMENTED (assessment: `sesame-readiness-assessment.md`) |
| True barge-in / speech-to-speech seat | **OpenAI Realtime-2** | Native S2S + reasoning; the only verified path to real interruption handling without building a custom turn-taking model | NOT_IMPLEMENTED; evaluate cost before adapter |
| Meeting diarization seat | **AssemblyAI Universal-3 Pro** | Best verified entity accuracy + diarization for meeting intelligence | NOT_IMPLEMENTED; pairs with MeetingCapture |
| Offline/dev fallback | local Whisper | Credential-free fallback | Forward-substrate |

## Rules that stay true regardless of provider

1. Voice never executes governed actions without approval — all intents
   route through the Phase 1208 Action path.
2. No raw audio crosses the HTTP boundary unless a provider seat
   explicitly requires it AND policy allows; transcripts are the unit.
3. Quiet mode (CT Phase 1235b) suppresses speak+listen; automatic
   meeting quiet-mode activates with the calendar connector.
4. Every provider gets: adapter + status + setup docs + honest
   BLOCKED_BY_CREDENTIALS / NEEDS_PROVIDER_INSTALL state + fallback.

## Sources (retrieved 2026-06-11)

- https://www.assemblyai.com/blog/top-text-to-speech-apis
- https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks
- https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription
- https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture
- https://www.retellai.com/blog/best-ai-voice-assistants
- https://github.com/SesameAILabs/csm
- https://openrouter.ai/sesame/csm-1b
- https://fal.ai/models/fal-ai/csm-1b/api
- https://www.spheron.network/blog/speech-to-speech-gpu-cloud-moshi-sesame-csm-hertz-dev/
