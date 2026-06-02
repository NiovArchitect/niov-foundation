# `VoiceIntentEnvelope` — Substrate Object

Per ADR-0085 §5. Voice transcripts are NOT raw chat logs. A voice utterance is encoded as a `VoiceIntentEnvelope` that flows through Foundation governance the same way a `ConnectorInvocation` flows.

## Purpose

The envelope is the audit-honest substrate that proves voice interactions are governed exactly like visual interactions. No voice runtime ships without this envelope.

## Shape

```typescript
// Pseudocode — actual TypeScript type lands at VF.2 per ADR-0085 §8.

export interface VoiceIntentEnvelope {
  // Identity + isolation
  intent_id: string;                         // UUID
  caller_entity_id: string;                  // RULE 0 sovereignty
  tenant_org_entity_id: string;              // tenant isolation per GOVSEC.7
  source_surface: VoiceSourceSurface;        // which Otzar surface emitted the utterance

  // Transcript
  transcript_text: string;                   // STT output; subject to no-leak rules
  transcript_redacted: boolean;              // true if work-relevance filter triggered redaction
  transcript_redaction_reason: string | null; // closed-vocab; e.g. "NON_WORK" | "PROTECTED_ATTRIBUTE" | "FORBIDDEN_INTENT" | null

  // Intent classification
  intent_class: "LOW" | "MEDIUM" | "HIGH";   // risk tier per ADR-0085 §3
  proposed_action: ActionDescriptor | null;  // populated if intent_class >= MEDIUM

  // Confirmation + approval
  confirmation_state: "NOT_NEEDED" | "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED";
  approval_chain_state: "NONE" | "PENDING" | "APPROVED" | "REJECTED"; // populated if intent_class === HIGH

  // Foundation governance witness
  policy_decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "NOT_APPLICABLE";
  audit_event_id: string;                    // RULE 4 witness
  retention_class: RetentionClass;           // per ADR-0079

  // Lifecycle metadata
  created_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;              // closed-vocab; e.g. "DELIVERED" | "USER_CANCELED" | "POLICY_DENIED" | "APPROVAL_REJECTED" | "EXPIRED"
}

export type VoiceSourceSurface =
  | "ONBOARDING"           // surface 1
  | "ADMIN_TWIN"           // surface 2
  | "AI_TWIN"              // surface 3
  | "AI_TEAMMATE"          // surface 4
  | "WORKFLOW_RECOMMENDATION" // surface 5
  | "PROPOSED_ACTION"      // surface 6
  | "APPROVAL_REQUEST"     // surface 7
  | "CONNECTOR_QUESTION"   // surface 8
  | "MEETING_FOLLOWUP"     // surface 9
  | "HIVE"                 // surface 10
  | "AGENT_PLAYGROUND"     // surface 11
  | "AUDIT_EXPLANATION"    // surface 12
  | "EXECUTIVE_BRIEFING";  // surface 13
```

## Field semantics

### Identity + isolation

- `caller_entity_id` — RULE 0 sovereignty witness. Resolved before any policy decision fires. Must match the bearer token's entity.
- `tenant_org_entity_id` — Tenant isolation per GOVSEC.7. Cross-tenant envelope construction is structurally forbidden.
- `source_surface` — One of the 13 surfaces in [interaction-map.md](./interaction-map.md). Determines the canonical voice intents allowed at this surface.

### Transcript

- `transcript_text` — STT output. Subject to no-leak rules (no secret values; no cross-tenant data; no bearer prefixes; no raw connector payload).
- `transcript_redacted` — `true` if the work-relevance filter triggered redaction. Closed-vocab `transcript_redaction_reason` records why.
- Transcripts respect ADR-0079 transcript substrate policy retention rules.

### Intent classification

- `intent_class` — `LOW` / `MEDIUM` / `HIGH` per ADR-0085 §3.
- `proposed_action` — Populated for `MEDIUM` and `HIGH` intents. Materializes into a Section 2 Action with `status: PROPOSED`.

### Confirmation + approval

- `confirmation_state` — `NOT_NEEDED` for `LOW`; `PENDING` initially for `MEDIUM` + `HIGH`; transitions to `CONFIRMED` / `REJECTED` / `EXPIRED` based on caller response.
- `approval_chain_state` — `NONE` for `LOW` + `MEDIUM`; `PENDING` initially for `HIGH`; transitions per the Section 2 + ADR-0026 approval flow.

### Foundation governance witness

- `policy_decision` — The Section 2 / Section 9 policy outcome. `NOT_APPLICABLE` for pure-read `LOW` intents that don't materialize Actions.
- `audit_event_id` — RULE 4 witness. Every envelope emits at least one audit event before delivery — typically `VOICE_INTENT_RECEIVED` (closed-vocab future audit literal; forward-substrate at VF.2) + the standard Action audit chain if `proposed_action` materializes.
- `retention_class` — Per ADR-0079 transcript substrate policy. Determines how long the envelope is retained and when `deleted_at` is set.

### Lifecycle

- `created_at` — Envelope construction timestamp.
- `closed_at` — Set when the envelope reaches a terminal state. `null` while in flight.
- `closed_reason` — Closed-vocab terminal state reason. Audit-honest.

## What the envelope is NOT

- NOT a raw audio buffer — audio is held briefly at the `VoiceProviderAdapter` boundary and discarded after STT
- NOT a raw chat log — every transcript is governed
- NOT a free-text intent — `intent_class` is closed-vocab; `proposed_action` is a structured `ActionDescriptor`
- NOT a bypass around Section 2 Action runtime — `proposed_action` always rides Section 2
- NOT a bypass around Section 9 Workflows approval — `approval_chain_state` rides the same flow as typed approvals
- NOT a cross-tenant substrate — `tenant_org_entity_id` is a hard boundary

## Audit hooks

Every envelope construction emits at least one audit event before delivery (RULE 4). The audit event type is closed-vocab (forward-substrate at VF.2):

- `VOICE_INTENT_RECEIVED` — emitted at envelope creation
- `VOICE_INTENT_CONFIRMED` — emitted when `confirmation_state` transitions to `CONFIRMED`
- `VOICE_INTENT_REJECTED` — emitted on user `REJECTED`
- `VOICE_INTENT_EXPIRED` — emitted on `EXPIRED` lifecycle close
- `VOICE_INTENT_REDACTED` — emitted when `transcript_redacted: true`
- `VOICE_INTENT_DELIVERED` — emitted on terminal `DELIVERED` close

These audit literals are forward-substrate at VF.2; they do NOT enter `AUDIT_EVENT_TYPE_VALUES` until VF.2 lands with explicit Founder authorization per the clean-transition discipline (ADR-0042 §Q-γ.1).

## Privacy + governance hooks per surface

| Surface | Required hook |
|---|---|
| AI_TWIN | `proposed_action` for MEDIUM intents must materialize as a Section 2 Action |
| APPROVAL_REQUEST | `approval_chain_state` mandatory; HIGH intent confirmation required |
| MEETING_FOLLOWUP | Transcript retention per ADR-0079; `transcript_redacted` enforced |
| EXECUTIVE_BRIEFING | Aggregate-only — no per-employee identifiers in `transcript_text` |
| CONNECTOR_QUESTION | No secret values; no Bearer prefixes; no raw payload |

## Reading

- [ADR-0085 §5](../architecture/decisions/0085-voice-first-product-doctrine.md) — Voice-intent envelope (canonical decision substrate)
- [ADR-0057](../architecture/decisions/0057-section-2-autonomous-execution-core.md) — Section 2 Action runtime
- [ADR-0079](../architecture/decisions/0079-transcript-substrate-policy-for-conversation-context-signals.md) — Transcript substrate policy
- [voice-provider-adapter.md](./voice-provider-adapter.md) — Adapter seam architecture
- [risk-tiered-action-model.md](./risk-tiered-action-model.md) — Risk tier → governance gate
