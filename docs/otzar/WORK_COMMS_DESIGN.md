# Otzar Work Comms — Design (Phase 1254)

**Status:** Design + provider/readiness slice (2026-06-11). No
schema or runtime call paths land in this slice; models below are
PENDING_SCHEMA design. Spelled Otzar; pronounced "OatZar" (voice
guidance only).

## 1. What it is — and is not

Otzar Work Comms is employer-scoped, **consented** work
communication — WhatsApp-simple, enterprise-governed: work chats,
work calls, transcripts, decisions/commitments extraction, governed
memory candidates, audit, retention, regulator share packages.

**Personal WhatsApp monitoring is NOT supported and will not be
built.** Personal WhatsApp is end-to-end encrypted; silent monitoring
is both impossible and unacceptable. The three honest paths:
(A) official Meta **WhatsApp Business API** for org business numbers
where Meta permits; (B) **Otzar Work Comms** — the first-party
governed layer (strategic path); (C) consented manual import of
business call/chat notes. Never: spyware, interception, scraping,
silent capture.

## 2. Phone-number linking (employee-controlled)

Employee enters their number → OTP verification (Twilio) → chooses
the employer profile → Otzar explains in plain language: personal
calls are never monitored; only Work Comms channels are captured;
the employer owns work transcripts; capture requires consent →
employee approves → audit event → DMW work identity updated. Admins
see link STATUS, never personal content.

## 3. Multi-org isolation (critical)

One phone number may link to MULTIPLE employers. Each link is a
separate org work profile with separate DMW authority, COSMP
permissions, retention, transcripts, and threads. No cross-org
leakage, ever — the active work context is always visible. A person
outside the org participates as an external collaborator with
scoped access and consent notices.

## 4. Governance pipeline

Communication → work record under org retention policy → extraction
(decisions, commitments, follow-ups, risks) → memory candidates
require COSMP approval (never silent) → follow-ups become governed
Actions (external sends need approval) → audit at every step.
Consent states: NOT_REQUESTED / REQUESTED / CONSENTED / DECLINED /
REVOKED / POLICY_EXEMPT_INTERNAL / UNKNOWN_EXTERNAL. Declined or
missing consent blocks transcript processing.

## 5. BEAM-first realtime substrate

Foundation (TS) stays the governance authority (identity, DMW/COSMP,
policy, Actions, audit, compliance, readiness). The BEAM/Elixir
service owns realtime: per-thread and per-call supervision trees,
presence, delivery/read receipts, transcript event streams, consent
state tracking, AI-worker fanout, backpressure, fault tolerance.
Planned OTP shape (consistent with cosmp_router/dbgi_supervisor
patterns): WorkCommsSupervisor → ThreadSupervisor /
CallSessionSupervisor / TranscriptStreamSupervisor + PresenceTracker
+ ConsentStateTracker + MessageFanout + AuditEventPublisher +
ExtractionJobPublisher. Python intelligence handles summarization,
diarization post-processing, and commitment/decision extraction.

## 6. Models (PENDING_SCHEMA design — additive, Founder-gated)

WorkCommsIdentity (entity + org + phone hash + encrypted ref/secret
ref + verified_at + consent_status), WorkCommsOrgProfile,
WorkCommsThread (DIRECT/GROUP/EXTERNAL/CALL/WORKSPACE),
WorkCommsParticipant (consent_state, role incl. AI_TWIN/AI_EMPLOYEE),
WorkCommsMessage (content ref + safe summary; source APP/SMS/
VOICE_TRANSCRIPT/WHATSAPP_BUSINESS/IMPORT), WorkCommsCallSession,
WorkCommsTranscriptSegment, WorkCommsExtraction,
WorkCommsConsentEvent, WorkCommsRetentionPolicy (incl. legal hold).
Existing substrate reused where it fits: MeetingCapture/AudioCapture/
TranscriptSegment (capture), ExternalCollaborator, ComplianceShare-
Package, the Action runtime, COSMP memory candidates.

## 7. Providers (registry-backed, credential-gated)

TWILIO_VOICE (work voice/SMS/OTP), LIVEKIT (app-native WebRTC
calls), WHATSAPP_BUSINESS (official Meta API only; app review),
plus the existing DEEPGRAM/ASSEMBLYAI/OPENAI_REALTIME/ELEVENLABS
voice seats. All BLOCKED_BY_CREDENTIALS until the org provides keys;
no provider is hardcoded; external effects ride governed Actions.

## 8. Surface language

Always: work communication, consented transcript, work-owned record,
governed capture, employee-controlled linking. Never: monitor, spy,
surveillance, intercept, scrape, personal WhatsApp capture.

## 9. What exists now vs what remains

Now: this design, the three provider registry entries with honest
blockers, the capability-truth row, the founder credential checklist,
desktop access via the ambient command layer ("work comms" routes to
the Comms surface). Remaining: Founder-authorized additive schema
(the 10 models), BEAM work_comms OTP app, provider wiring per
credential, consent UI, mobile apps (iOS/Android future: push, org
switcher, work calls — designed for, not built).
