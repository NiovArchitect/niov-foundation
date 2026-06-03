// FILE: twin-voice-readiness.ts
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Surfaces what
//          voice-related capabilities the Foundation tier actually
//          supports today, so the Control Tower UI can render the
//          right buttons/panels without false promises about live
//          mic/audio.
//
//          Constant projection (no DB hit). The envelope-
//          construction surface (`POST /api/v1/voice/intents`) is
//          LIVE per VF.4 + always-allow base-tier per
//          ADR-0093 §10. Live microphone input and live audio
//          output remain forward-substrate Founder-gated per
//          ADR-0085 + ADR-0089 — explicit "NOT_AVAILABLE_AT_
//          FOUNDATION_TIER" closed-vocab values so the UI never
//          renders a "press to talk" button that wouldn't work.
//
// PRIVACY INVARIANT:
//   - Returns closed-vocab string values only.
//   - NEVER returns provider IDs / API keys / secret refs /
//     model names / vendor identifiers / endpoint URLs.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by getMyTwin as an optional sidecar field)

// WHAT: Closed-vocab readiness state per voice surface.
//        LIVE: the surface is implemented and operator-usable now.
//        NOT_AVAILABLE_AT_FOUNDATION_TIER: the surface is forward-
//        substrate and Founder-gated; UI should NOT render an
//        affordance that implies it works.
export type VoiceReadinessValue =
  | "LIVE"
  | "NOT_AVAILABLE_AT_FOUNDATION_TIER";

// WHAT: SAFE projection of voice readiness state for the caller.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Lets the employee-facing UI render the right voice panel
//      affordances. envelope_construction = LIVE means the
//      caller can submit `POST /api/v1/voice/intents`;
//      live_audio_input / live_audio_output are
//      NOT_AVAILABLE_AT_FOUNDATION_TIER until live mic capture +
//      audio synthesis are explicitly authorized by Founder per
//      ADR-0085 + ADR-0089 + the
//      [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//      INTELLIGENCE EXPERIENCE] directive's voice rules.
export interface TwinVoiceReadinessState {
  envelope_construction: VoiceReadinessValue;
  live_audio_input: VoiceReadinessValue;
  live_audio_output: VoiceReadinessValue;
}

// WHAT: Compute the caller's voice readiness state.
// INPUT: None (constant projection — no DB hit, no caller-
//        specific gating at the Foundation tier).
// OUTPUT: TwinVoiceReadinessState with the canonical values.
// WHY: The Foundation backend's voice substrate is uniform across
//      callers — envelope construction is base-tier always-allow
//      per ADR-0093 §10; live mic / live audio output remain
//      forward-substrate Founder-gated regardless of caller. A
//      future per-caller variant can take the caller's entity_id
//      once entitlement-tier voice surfaces are introduced.
export function computeVoiceReadinessState(): TwinVoiceReadinessState {
  return {
    envelope_construction: "LIVE",
    live_audio_input: "NOT_AVAILABLE_AT_FOUNDATION_TIER",
    live_audio_output: "NOT_AVAILABLE_AT_FOUNDATION_TIER",
  };
}
