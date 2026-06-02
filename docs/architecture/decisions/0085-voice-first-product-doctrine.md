# ADR-0085 — Otzar Voice-First Product Doctrine

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]` per RULE 20.

## Context

The original Otzar canonical doctrine (ADR-0052) framed Otzar as the governed enterprise intelligence layer where users interact with their AI Twin, AI Teammates, Admin Twin, and team/Hive intelligence. The interaction modality was assumed to be primarily textual (chat / dashboards / forms / API).

The Founder has corrected this framing: **voice is not decoration, not future-optional, not a gimmick. Voice is one of the primary ways users should communicate with their AI Twin and AI Teammates.** Otzar is intended to be voice-first because work should move through natural communication, not endless clicking.

This ADR canonicalizes the voice-first product doctrine and locks the governance + architecture posture so all future Otzar product surface work evaluates the voice path alongside the visual path. The runtime timing of live Sesame integration depends on substrate safety (vendor docs / authentication model / data handling / consent / retention / enterprise controls / security/privacy posture / tenant-scoped usage / audit posture); the voice-first **product and architecture posture is required now**.

## Decision

### 1. Voice-first is canonical Otzar product doctrine

The following lines are canonical and must not be paraphrased into "future-optional" framing in any subsequent ADR / RAA / doctrine doc / business surface:

- "Otzar is voice-first because work should move through natural communication, not endless clicking."
- "Users should be able to talk to their AI Twin the way they would talk to a trusted teammate."
- "Voice reduces friction, increases adoption, and makes governed intelligence feel alive."
- "Voice is an interface layer over Foundation governance, not a bypass around it."

### 2. Voice obeys Foundation governance — no bypass

Every voice-triggered interaction must pass through the same Foundation governance pipeline as the visual interaction. Voice obeys:

- tenant isolation (same-org boundary absolute per ADR-0049 / GOVSEC.7)
- DMW scope (per ADR-0001 + RULE 0)
- user identity (entity_id resolved before policy decision)
- role scope (per ADR-0080 RoleTemplate)
- permission bundles (per ADR-0080 PermissionBundle)
- delegated authority (per ADR-0080 DelegatedAuthorityProfile)
- approval chains (per ADR-0057 Section 2 Action runtime)
- dual-control where required (per ADR-0026)
- audit (per RULE 4 — every voice interaction emits an audit event before delivery)
- retention rules (per ADR-0079 transcript policy + per-tenant retention class)
- no-leak rules (per the canonical CT no-leak guards extended to voice transcript surfaces)
- work-relevance filtering (non-work / private speech suppression)

Voice must never enable:

- unapproved connector writes
- hidden external actions
- private memory exposure
- manager surveillance
- employee scoring
- psychological profiling
- protected attribute inference
- raw prompt exposure
- chain-of-thought exposure
- policy bypass
- approval bypass

### 3. Risk-tiered voice action model

Voice actions are classified into three risk tiers; the tier determines what governance gate fires before delivery.

**LOW RISK** — no confirmation required (the voice intent is the confirmation):
- ask my Twin a question
- summarize approved context
- explain my day
- draft a message (draft only — not send)
- find a document (metadata search; subject to DMW scope)
- read a safe brief

**MEDIUM RISK** — explicit confirmation required (text or voice "yes" before the proposed action enters the Section 2 Action runtime):
- propose a workflow
- draft a Slack / Email response (draft only)
- prepare a meeting follow-up
- suggest a task
- create a proposed action

**HIGH RISK** — explicit confirmation + the standard Section 2 governance gate (policy decision + dual-control where applicable + audit):
- send a message
- update an external system
- modify permissions
- approve spending
- disclose compliance material
- change connector settings
- activate workflows

Voice can draft freely within scope. Voice cannot execute risky actions without governance. This mirrors the canonical text-tier path — there is no separate "voice bypass" risk tier.

### 4. VoiceProviderAdapter seam — Sesame is the intended path, NOT hard-coded

Otzar will use a `VoiceProviderAdapter` seam analogous to `ConnectorProvider` (apps/api/src/services/connector/connector.service.ts) and `EmbeddingProvider` (apps/api/src/services/embedding/embedding.service.ts):

```
interface VoiceProviderAdapter {
  // STT (speech-to-text): caller-bound utterance → transcript + intent
  transcribe(audio_ref): Promise<TranscribeResult>;
  // TTS (text-to-speech): governed message → audio_ref
  synthesize(text, voice_id): Promise<SynthesizeResult>;
}
```

Concrete adapters (in implementation order):

1. **TextOnlyVoiceProvider** — fallback. Accepts typed input and emits typed output; verifies the entire voice-intent pipeline without any audio dependency. Always available; used in CI + tests + dev.
2. **LocalMockVoiceProvider** — deterministic mock that returns fixture-controlled transcripts + synthesized audio refs. Used in unit + integration tests.
3. **SesameVoiceProvider** — the intended production voice partner. Activates ONLY when the readiness assessment (see §6) is complete + Founder-authorized.
4. **FutureVoiceProvider** — adapter seam for any vendor that emerges (e.g., on-prem voice for air-gapped deployments per ADR-0018).

The `VoiceProviderAdapter` is the architectural decoupling that keeps Otzar from being irreversibly bound to Sesame at the runtime layer even though Sesame is the intended primary voice partner at the product layer.

### 5. Voice-intent envelope is a governed substrate object

Voice transcripts are NOT raw chat logs. A voice utterance is encoded as a **voice-intent envelope** that flows through Foundation governance the same way a `ConnectorInvocation` flows:

```
VoiceIntentEnvelope {
  intent_id: UUID
  caller_entity_id: UUID                  -- RULE 0 sovereignty
  tenant_org_entity_id: UUID              -- tenant isolation
  source_surface: enum(see §7)            -- which Otzar surface emitted the utterance
  transcript_text: string                 -- STT output; subject to no-leak rules
  transcript_redacted: boolean            -- true if work-relevance filter triggered redaction
  intent_class: enum(LOW|MEDIUM|HIGH risk tier per §3)
  proposed_action: ActionDescriptor?      -- if intent_class >= MEDIUM
  confirmation_state: enum(NOT_NEEDED|PENDING|CONFIRMED|REJECTED|EXPIRED)
  approval_chain_state: enum(NONE|PENDING|APPROVED|REJECTED) -- if intent_class == HIGH
  policy_decision: ActionDecision         -- Section 2 outcome
  audit_event_id: UUID                    -- RULE 4 witness
  retention_class: enum(per ADR-0079)
}
```

The envelope is the audit-honest substrate that proves voice interactions are governed exactly like visual interactions. No voice runtime ships without this envelope.

### 6. Sesame readiness assessment — 10 gates

Before any live Sesame integration, the following readiness gates must be verified and documented in `docs/voice-first/sesame-readiness-assessment.md`:

1. Official Sesame docs / SDK / API availability verified
2. Authentication model verified (OAuth / API key / mTLS / etc.)
3. Data handling posture documented (what Sesame retains; what's deleted; jurisdiction)
4. Audio retention posture documented (per-utterance retention class enforceable)
5. Transcript retention posture documented (transcripts deleted with same lifecycle as voice memory capsules)
6. Enterprise consent implications documented (per-tenant consent boundary; per-user opt-in)
7. Self-hosting or enterprise-control posture verified (sovereign-cloud / on-premise / air-gapped per ADR-0018)
8. Security / privacy posture verified (encryption-in-transit + at-rest; key management)
9. Tenant-scoped usage verified (cross-tenant leakage structurally impossible)
10. Output auditability verified (every Sesame call surfaces in `audit_events`)

The current readiness state (2026-06-02) is **PENDING** across all 10 gates. The implementation sequence in §7 lands all 10 verifications before any live Sesame call.

### 7. Voice interaction map across 13 Otzar surfaces

Voice is evaluated at every product surface. The map (in `docs/voice-first/interaction-map.md`) enumerates each surface, the canonical voice intents, the risk tier per intent, and the governance gate per tier:

| # | Surface | Canonical voice intents | Default risk tier |
|---|---|---|---|
| 1 | Onboarding / Dandelion | "Tell me about my company's connectors" / "Recommend my starter envelope" | LOW |
| 2 | Admin Twin | "Show me pending approvals" / "Summarize last week's audit chain" | LOW |
| 3 | AI Twin interaction | "Draft a reply to this Slack thread" / "What did I commit to in yesterday's meeting?" | LOW–MEDIUM |
| 4 | AI Teammate interaction | "Help me review this PR" / "Summarize this Jira project's risk" | LOW–MEDIUM |
| 5 | Workflow recommendations | "What workflows can I run this week?" / "Propose a sprint risk summary workflow" | MEDIUM |
| 6 | Proposed Actions | "Create a proposed action to send the standup follow-up" | MEDIUM |
| 7 | Approval requests | "Approve the workflow execution that's pending my review" | HIGH |
| 8 | Connector questions | "Is my Linear binding healthy?" / "Show me the last failed connector invocation" | LOW |
| 9 | Meeting follow-ups | "Draft action items from today's meeting" | MEDIUM |
| 10 | Hives | "What's the team's current focus?" / "Coordinate the design review across the hive" | LOW–MEDIUM |
| 11 | Agent Playground | "Run a simulation of the sprint-risk-summary workflow" | LOW |
| 12 | Audit explanations | "Why did the policy deny that action?" / "Explain the chain link for event X" | LOW |
| 13 | Executive briefings | "Brief me on the compliance posture this quarter" | LOW–MEDIUM |

No surface is voice-only. Every voice intent has a typed equivalent. Voice expands modality; it does not gate modality.

### 8. Implementation sequence — Gate ladder

Implementation proceeds through 7 gates. No gate skips ahead.

- **VF.1 (this PR)** — Voice-first product doctrine + ADR-0085 + interaction map + Sesame readiness assessment template + VoiceProviderAdapter proposed architecture + governance requirements + risk-tiered action model + implementation sequence. Classification A docs-only. **NO runtime; NO Sesame API call; NO secrets; NO audio processing.**
- **VF.2** — `VoiceProviderAdapter` interface + `VoiceIntentEnvelope` type + `TextOnlyVoiceProvider` implementation. Classification C backend runtime. Unit tests prove the envelope flows through Foundation governance exactly like a `ConnectorInvocation`. **NO Sesame; NO audio processing.**
- **VF.3** — `LocalMockVoiceProvider` + fixture catalog. Classification C backend runtime. Integration tests assert the envelope-to-Action-runtime path end-to-end with mock STT + mock TTS. **NO Sesame; NO audio.**
- **VF.4** — CT voice surface scaffolding (talk button on AI Twin page). Classification D frontend. Uses `TextOnlyVoiceProvider` only — typed input emits voice-intent envelopes. **NO microphone access; NO audio capture.**
- **VF.5** — Sesame readiness assessment completion across the 10 gates in §6. Classification A docs. Founder-gated unlock for VF.6.
- **VF.6** — `SesameVoiceProvider` adapter implementation. Classification J BEAM/Python/LLM/Voice runtime. Sesame API integration with secret_ref env-var-NAME per ADR-0019 + ADR-0024. **Requires explicit Founder authorization per the readiness assessment closeout.**
- **VF.7** — Production voice runtime activation. Founder-authorized per-tenant flip mirroring the `*_USE_REAL=1` connector pattern.

VF.1 + VF.2 + VF.3 + VF.4 are bounded enough to proceed under the autonomous-continuation authorization. VF.5 + VF.6 + VF.7 require explicit Founder authorization per the Sesame readiness assessment closeout.

### 9. Doctrine retroactive reconciliation

ADR-0052 (Otzar Domain General Intelligence and Governed Synchronicity) is **amended by reference** — the canonical doctrine lines in §1 of this ADR are now part of Otzar's product doctrine. ADR-0052 §15-step build order is extended: voice-first product evaluation is now required at every step. No ADR-0052 text is modified in-place; this ADR is the authoritative reconciliation surface.

ADR-0049 GOVSEC umbrella + ADR-0079 transcript-substrate policy + ADR-0050 break-glass + ADR-0036 LawfulBasis remain canonical governance primitives that voice consumes verbatim.

## Consequences

### Positive

- Voice-first product framing is canonical. Future Otzar product surface work cannot drift back into "future-optional" voice framing without violating this ADR.
- `VoiceProviderAdapter` seam keeps Otzar from being irreversibly bound to Sesame even though Sesame is the intended primary voice partner.
- `VoiceIntentEnvelope` is the audit-honest substrate that proves voice interactions are governed exactly like visual interactions.
- 13-surface interaction map gives the product team a concrete checklist; voice is not added ad-hoc per surface.
- Risk-tiered action model prevents "voice bypass" of governance — high-risk voice actions ride the same Section 2 governance pipeline as high-risk text actions.

### Negative

- Adding voice substrate increases the surface area Foundation governance must cover. Every voice-tier change must update the envelope + the audit hook + the no-leak guards.
- Sesame readiness assessment delays live voice integration until the 10 gates are verified. The product cannot ship live voice the day after the doctrine ADR lands.
- Multi-adapter pattern adds modest complexity to the voice substrate (4 adapters: TextOnly + LocalMock + Sesame + Future).

### Alternatives considered

- **Hard-code Sesame as the voice runtime layer.** Rejected because vendor lock-in violates ADR-0018 deployment-target agnosticism + ADR-0019 cryptographic-suite portability. The adapter seam is the substrate-honest path.
- **Defer voice to a later major release.** Rejected by the Founder correction — voice is core, not optional.
- **Treat voice as a thin UI layer over existing text-tier endpoints.** Rejected because that elides the audit / consent / retention boundary that voice raises (audio retention; transcript no-leak; work-relevance filtering).

### What this ADR explicitly does NOT decide

- Whether Sesame is the production voice partner. The readiness assessment in §6 decides this; this ADR locks the architecture posture.
- Whether voice is available on every plan tier. Section 8 (ADR-0083) entitlements decide this; this ADR locks the doctrine + technical substrate.
- Whether voice supports multilingual / accent-tier features. Forward-substrate per Sesame capability + tenant policy.
- Whether voice integrates with Microsoft Teams / Slack call audio / Google Meet / Zoom. Forward-substrate per connector + governance + consent posture per integration.

## References

- RULE 0 (humans sovereign) — voice does not exempt users from sovereignty
- RULE 4 (audit chain integrity) — every voice intent emits a witnessing audit event
- RULE 10 (soft-delete only) — voice transcripts respect `deleted_at`
- RULE 13 (substrate-honest discipline) — Sesame readiness PENDING is recorded honestly
- RULE 20 (RULE/ADR-modification authority) — this ADR's Accepted status fires under Founder authorization
- ADR-0001 three-wallet architecture — voice respects DMW scope
- ADR-0018 deployment-target agnosticism — voice adapter seam preserves portability
- ADR-0019 cryptographic-suite posture — voice secret handling per env-var-NAME
- ADR-0026 dual-control middleware — HIGH-risk voice actions ride dual-control
- ADR-0036 REGULATOR + LawfulBasis — regulator-grade voice audit
- ADR-0049 GOVSEC umbrella — voice composes with GOVSEC.7 tenant isolation
- ADR-0050 break-glass + time-boxed audit — emergency voice access fires break-glass per the same pattern
- ADR-0052 Otzar Domain General Intelligence doctrine — voice is the natural-communication interface to DGI
- ADR-0057 Section 2 Action runtime — MEDIUM + HIGH voice intents materialize as Actions
- ADR-0078 ConversationContextSignals + ADR-0079 transcript substrate policy — voice transcripts compose with these
- ADR-0080 OOTB Dandelion ontology — voice-first evaluation per RoleTemplate
- ADR-0083 Section 8 billing entitlements — voice tier decisions
