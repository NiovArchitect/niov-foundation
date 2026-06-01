# ADR-0078: Conversation Substrate — Source-of-Truth Transcripts + `conversation_context_signals[]` Safe-Projection Layer for Agent Playground (Design-Only)

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-CONVERSATION-CONTEXT-SIGNALS-SUBSTRATE-ADR-AUTH]`
2026-05-31 (with explicit Founder correction at the same
authorization preserving raw-transcript-as-source-of-truth
under governance + Agent-Playground-may-consult-exact-
transcripts-for-accuracy-through-scoped-retrieval).

This ADR is **design-only**. NO code, NO schema migration,
NO new routes, NO new audit literal, NO listener ingestion,
NO raw transcript capture or storage at this commit, NO LLM
autonomy, NO model calls, NO Python services, NO BEAM, NO
Control Tower implementation, NO Foundation API change, NO
Wave 7 / Wave 9 / Wave 10 response shape change, NO
hierarchy substrate, NO organizational graph, NO personal-
life automation, NO trust-level delegation, NO Action
creation, NO connector invocation. ADR-0078 defines the
**substrate contract** — what the four layers are, what each
MAY contain, what each MUST never contain, and which
prerequisites gate each implementation stage.

Sits ABOVE the Otzar conversation substrate (ADR-0054 +
ADR-0055 + ADR-0058) and BELOW the Agent Playground vision
ADRs (ADR-0065 / ADR-0076 / ADR-0077) at the **conversation-
substrate contract register**. ADR-0078 locks the contract
so future implementation slices — at each of the four layers
— can land safely without inventing substrate, collapsing
layers, or eroding the no-leak / no-surveillance boundary.

## Context

### Why the conversation substrate needs its own design ADR

The Agent Playground intelligence pipeline is LIVE
end-to-end at the v1 scope per ADR-0065 §7 + ADR-0072 /
ADR-0073 / ADR-0074 / ADR-0075 / ADR-0076 (Amendment 1 vNext
runtime) / ADR-0077 (Wave 10 cockpit). Wave 10's Section 2
Action read-surface integration (CT PR #8 `ade4981`) closed
ADR-0077 §8.4 three-state-lifecycle honesty.

The remaining substrate gap is **conversation context** —
the human collaboration records the enterprise depends on
for accuracy, compliance, decision reconstruction,
regulator-ready evidence, project timeline proof, and the
"what did they actually commit to / object to / approve /
defer" record that makes Agent Playground feel like a real
enterprise brain.

Two things are simultaneously true:

1. **Conversations are source-of-truth for the enterprise.**
   Exact transcripts, speaker attribution, timestamps,
   meeting metadata, and source provenance are critical for
   accuracy, compliance recall, regulator-ready evidence,
   audit reconstruction, project timeline proof, and
   correctness. Otzar Enterprise MUST be able to retain and
   use them under governance.

2. **Conversations are NOT default-render-safe material.**
   Raw transcripts MUST NEVER appear by default in Agent
   Playground recommendations / simulations / cockpit
   surfaces / Control Tower projections. The default layer
   that flows into reasoning + UI + audit is
   `conversation_context_signals[]` — a closed-vocab
   safe-projection layer.

ADR-0077 §8.2 conversation-context honesty currently
directs the Wave 10 cockpit to surface *"Conversation
context signals not available in this version"* because
neither layer is yet implemented. ADR-0078 canonicalizes
the **whole substrate** — both layers, plus the scoped
reasoning bridge and the permissioned evidence drilldown
that connects them — so future implementation slices land
on stable architecture.

### Canonical doctrine sentences

**(Primary):** Conversation context signals let the
enterprise use exact human collaboration records safely:
transcripts remain the governed source of truth, while
signals provide no-leak decision context for Agent
Playground.

**(Companion 1; Founder 2026-05-31):** Exact transcripts
are the evidentiary source of truth;
`conversation_context_signals[]` are the governed
intelligence interface.

**(Companion 2; Founder 2026-05-31 work-relevance
clarification):** Otzar Enterprise should remember work,
not surveil life.

**(Companion 3; Founder 2026-05-31 work-relevance
clarification):** The transcript layer preserves authorized
business evidence; the relevance layer prevents personal
life from becoming enterprise intelligence.

The four sentences together lock the substrate posture:
transcripts (Layer 1) carry evidentiary weight; signals
(Layer 3) carry intelligence-interface weight; Layer 2
scoped reasoning + Layer 4 permissioned drilldown connect
them under governance; **and the capture-eligibility +
work-relevance filtering layer (§6C) gates every layer so
personal life never becomes enterprise intelligence**.

### Substrate-honest pre-flight (RULE 12 / RULE 13)

Verified on-main state at HEAD `87bff72`:

- **No raw transcript storage exists in Foundation today.**
  `packages/database/prisma/schema.prisma` confirmed: no
  `Transcript` / `Message` / `raw_text` / `transcript_text`
  / `message_body` columns. `OtzarConversation` (LIVE)
  holds session metadata only.
- **`MemoryCapsule.conversation_id`** (nullable) LIVE per
  ADR-0055; **`OtzarConversation.summary_capsule_id`** LIVE
  per ADR-0054; **`DriftSignalService`** LIVE per ADR-0058
  produces closed-vocab signals from CORRECTION capsules.
- **ADR-0052 build-order step 4** canonical: *"transcript
  ownership/retention/scope policy before raw transcripts."*
  This step is **NOT yet landed**; ADR-0078 explicitly
  gates Layer 1 (Raw Transcript Source-of-Truth) and Layer
  3 governed-listener ingest on its landing.
- **No Foundation surface today exposes raw conversation
  content.** ADR-0078 preserves that invariant by default
  and defines the governed exception explicitly.

### Patent + doctrine alignment

- **US 12,517,919 (COSMP)** — every layer scope-bounded
  by COSMP permission; no substrate bypasses governed
  access.
- **US 12,164,537 (DMW)** — wallet-bound continuity
  preserved; transcripts + signals live inside scope.
- **US 12,399,904 (Foundation primitives)** — both layers
  are governed substrate, NEVER autonomous evidence.
- **ADR-0052 (Otzar DGI doctrine)** — *"Otzar does not
  watch employees to judge them"* + *"permissioned work
  observation, NOT surveillance"* + *"reports generated
  from permissioned operational signals and routed
  according to hierarchy, scope, and relevance (not raw
  access)"* — preserved across all four layers.

## Decision

Foundation canonicalizes a **four-layer conversation
substrate** where exact transcripts are a governed source-
of-truth, scoped reasoning bridges transcripts into Agent
Playground accuracy-critical paths, `conversation_context_signals[]`
is the safe-default closed-vocab projection layer for UI
and audit, and permissioned evidence drilldown lets
authorized users traverse signal → transcript excerpt under
policy. All four layers are governed; none is forbidden by
doctrine.

### 1. The four canonical layers

#### Layer 1 — Raw Transcript Source-of-Truth

Exact human collaboration records — transcripts, speaker
attribution where authorized, timestamps, meeting / session
metadata, retention / legal-hold state, access scope,
consent / notice state, source-system metadata, and
provenance / immutability metadata where available.

Layer 1 is the **accuracy and compliance substrate**. It
exists so the enterprise can:

- recall what humans actually said
- reconstruct decisions for audit
- satisfy regulator / lawful-basis evidence requirements
- support legal hold + retention obligations
- prove project timelines
- preserve speaker attribution under authorization
- export approved evidence packages

Layer 1 MAY be implemented **only after** the prerequisites
in §6 land. Layer 1 records are **never** rendered into
default Agent Playground / Control Tower surfaces; they
are reached only via Layer 4 permissioned evidence
drilldown.

#### Layer 2 — Scoped Reasoning (Governed Retrieval)

Agent Playground (Wave 7 recommendation / Wave 9
simulation) and other Otzar intelligence surfaces MAY
consult Layer 1 exact transcripts **internally** for
accuracy when:

- the caller has authority over the requested transcript
  scope (per §6 / Layer 1 access scope)
- the retrieval is purpose-bound (recommendation /
  simulation / governed action proposal — never freeform)
- the retrieval is policy-checked at the service tier
  (TAR-authoritative same-org / project / hive / action
  scope per ADR-0057 + existing same-org gates)
- the retrieval is audited (Layer 1 access events recorded
  in the audit chain per RULE 4)
- the retrieval does NOT produce a default-render-safe
  surface — Layer 2 output flows into Layer 3 signal
  projection, NEVER directly into a default Wave 7 / Wave
  9 / Wave 10 response body

Layer 2 is the architectural bridge: *the model / reasoning
layer may use exact transcripts under scope; the response
layer emits signals by default.* The Stage 3 implementation
ADR (§7) decides whether Layer 2 retrieval happens inside a
Foundation service, a Foundation Elixir/BEAM coordination
process, or an isolated Python intelligence service per
ADR-0069 §6 8-question check.

#### Layer 3 — Safe Projection (`conversation_context_signals[]`)

The closed-vocab, safe-default, no-leak projection layer
that flows into:

- Wave 7 `RecommendBestPathSuccess` response body (future
  additive sidecar per §4)
- Wave 9 `SimulationBranch` / `EnterpriseDecisionPosture`
  response body (future additive sidecar per §4)
- Wave 10 Control Tower cockpit panels (Recommendation /
  Simulation / Governed Transition) per §5
- Audit chain metadata via the existing
  `ADMIN_ACTION + details.action` discriminator

Layer 3 is the **default UI + reasoning-output substrate**.
Every Layer 3 signal is closed-vocab + safe-summary +
honest_note + scope-bounded; raw transcript content NEVER
appears at this layer. See §2 for the canonical
`ConversationContextSignal` shape + closed-vocab
vocabularies.

#### Layer 4 — Permissioned Evidence Drilldown

Authorized users MAY click through from a Layer 3 signal
to the underlying Layer 1 transcript excerpt, timestamp,
speaker (when authorized), or source-record reference when
policy allows.

Layer 4 drilldown is:

- **explicit user gesture only** (NEVER automatic, NEVER
  default-rendered)
- **permission-checked at the service tier** against the
  Layer 1 access-scope policy
- **purpose-bound** (recommendation / simulation /
  governed action / compliance review / regulator
  evidence — never freeform)
- **audited** (drilldown read events recorded via the
  existing audit-chain discriminator pattern)
- **redaction-respecting** (any redactions applied at
  Layer 1 stay applied at Layer 4 display)
- **scope-narrowing** (drilldown to one excerpt does NOT
  unlock the full transcript unless policy explicitly
  authorizes it)

Layer 4 is what makes Agent Playground feel real for
regulated enterprises: the signal says *"approval
dependency identified;"* the authorized user clicks
through and sees the exact governed excerpt where it was
said.

### 2. Canonical `ConversationContextSignal` shape (Layer 3)

```text
ConversationContextSignal:
  signal_type: ConversationContextSignalType (§3.1 closed-vocab; 17 values)
  signal_confidence_label: SignalConfidenceLabel (§3.2; 4 values)
  signal_source_type: SignalSourceType (§3.3; 8 values)
  signal_scope: SignalScope (§3.4; 6 values)
  related_scenario_id?: string
  related_candidate_key?: string
  related_branch_id?: string
  related_action_id?: string
  related_transcript_ref?: TranscriptRef    // §3.5 — for Layer 4 drilldown
  detected_at: string (ISO 8601)
  evidence_label: EvidenceLabel (§3.6; 13 values)
  safe_summary: string (≤300 chars; closed-style; NEVER raw quotes by default)
  requires_human_review: boolean
  retention_class: RetentionClass (§3.7; 5 values)
  honest_note: string
```

`related_transcript_ref` is the Layer 4 attachment point —
NOT raw transcript content. See §3.5 for its shape.

### 3. Closed vocabularies (v1)

Adding new values at any closed vocab requires future
Founder-authorized ADR amendment.

#### 3.1 `signal_type` (17 values)

- `PRIOR_COMMITMENT_IDENTIFIED`
- `STAKEHOLDER_CONCERN_IDENTIFIED`
- `APPROVAL_DEPENDENCY_IDENTIFIED`
- `CONFLICTING_DIRECTION_IDENTIFIED`
- `MISSING_STAKEHOLDER_INPUT`
- `MEETING_CONTEXT_SUPPORTS_PATH`
- `HUMAN_OBJECTION_REQUIRES_REVIEW`
- `DECISION_OWNER_UNCLEAR`
- `ACTION_ITEM_DEPENDENCY_IDENTIFIED`
- `RISK_RAISED_BY_STAKEHOLDER`
- `DEADLINE_OR_TIMING_CONSTRAINT_IDENTIFIED`
- `CUSTOMER_OR_CLIENT_IMPACT_RAISED`
- `POLICY_OR_COMPLIANCE_CONCERN_RAISED`
- `SECURITY_OR_DATA_SCOPE_CONCERN_RAISED`
- `PRIOR_DECISION_REFERENCED`
- `UNRESOLVED_QUESTION_IDENTIFIED`
- `CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION`

#### 3.2 `signal_confidence_label` (4 values)

- `LOW`
- `MEDIUM`
- `HIGH`
- `INSUFFICIENT_DATA`

#### 3.3 `signal_source_type` (8 values)

- `MEETING_SUMMARY` — derived from an approved meeting
  summary; Layer 1 transcript MAY back it via Layer 4
  drilldown
- `APPROVED_NOTE` — derived from an explicitly approved
  note recorded by the caller or a same-org member
- `GOVERNED_LISTENER_OUTPUT` — derived from a governed
  listener that emitted Layer 1 transcript + Layer 3
  signals; Layer 1 reachable via Layer 4 drilldown when
  authorized
- `CORRECTION_SIGNAL` — derived from a `CORRECTION`
  `MemoryCapsule` per ADR-0055 + ADR-0058 (LIVE)
- `ACTION_HISTORY` — derived from past Section 2 Action
  metadata per ADR-0057 (LIVE)
- `HIVE_CONTEXT` — derived from a same-org Hive's
  governance_terms / audit-derived signal per ADR-0059 +
  ADR-0063 (LIVE)
- `MANUAL_USER_INPUT` — explicit user-entered context
  inside the cockpit
- `IMPORTED_APPROVED_RECORD` — derived from an explicitly
  imported record under governance

#### 3.4 `signal_scope` (6 values)

- `SELF_ONLY` — caller's own wallet scope only
- `SAME_ORG` — same-org Section 2 / Hive scope
- `HIVE_SCOPED` — bounded to a Hive per ADR-0059
- `PROJECT_SCOPED` — bounded to a project / matter
  (reserved for future project-substrate ADR)
- `ACTION_SCOPED` — bounded to a Section 2 Action per
  ADR-0057
- `COMPLIANCE_REVIEW_SCOPED` — bounded to a regulator-tier
  review per ADR-0036 / ADR-0070 LawfulBasis

#### 3.5 `related_transcript_ref` (Layer 4 attachment point)

Optional. When present, this field anchors the Layer 3
signal to a Layer 1 transcript record for permissioned
drilldown. **The ref MUST NEVER carry raw transcript
content in this field at any layer.**

```text
TranscriptRef:
  transcript_id: string                  // Layer 1 record identifier
  excerpt_id?: string                    // optional specific excerpt within the transcript
  source_type: SignalSourceType (§3.3)
  drilldown_audit_required: boolean      // when true, drilldown read MUST emit an audit row
  redaction_status: RedactionStatus      // §3.8 closed-vocab
  policy_purpose: PolicyPurpose          // §3.9 closed-vocab
```

When a consumer (Wave 10 cockpit; future regulator
evidence packager) requests drilldown via §3.5's
`transcript_id` + `excerpt_id`, Foundation re-checks Layer
1 access scope + Layer 4 audit / policy / redaction posture
on the request — never relying on the signal's prior
authorization snapshot.

#### 3.6 `evidence_label` (13 values)

- `HUMAN_COMMITMENT`
- `HUMAN_CONCERN`
- `HUMAN_OBJECTION`
- `APPROVAL_NEED`
- `MISSING_CONTEXT`
- `PRIOR_DECISION`
- `TIMING_CONSTRAINT`
- `CUSTOMER_IMPACT`
- `POLICY_CONCERN`
- `SECURITY_CONCERN`
- `DATA_SCOPE_CONCERN`
- `CONFLICTING_CONTEXT`
- `INSUFFICIENT_CONTEXT`

#### 3.7 `retention_class` (5 values)

- `EPHEMERAL_REVIEW_ONLY`
- `SCENARIO_CONTEXT_RETAINED`
- `ACTION_CONTEXT_RETAINED`
- `AUDIT_SAFE_METADATA_ONLY`
- `DEPERSONALIZED_IMPROVEMENT_SIGNAL`

(See §4 for retention discipline against Layer 1 separately.)

#### 3.8 `redaction_status` (4 values)

- `NO_REDACTION_APPLIED`
- `PARTIAL_REDACTION_APPLIED`
- `FULL_REDACTION_APPLIED_NAME_PSEUDONYMIZED`
- `LEGAL_HOLD_PROTECTS_REDACTION_LIFTING`

#### 3.9 `policy_purpose` (closed-vocab 7 values; drives Layer 4 audit + scope)

- `RECOMMENDATION_REVIEW`
- `SIMULATION_REVIEW`
- `GOVERNED_ACTION_REVIEW`
- `COMPLIANCE_REVIEW`
- `LEGAL_REVIEW`
- `REGULATOR_EVIDENCE_PACKAGE`
- `AUDIT_RECONSTRUCTION`

### 4. Layer 1 — Allowed Raw Transcript Source Record fields (canonical at this ADR)

When Stage 1 (§7) lands, the Layer 1 record MAY carry the
following fields. Adding new fields requires future
Founder-authorized ADR amendment.

- `transcript_id`
- `source_type` (closed-vocab; mirrors §3.3 listener types)
- `meeting_id`
- `session_id`
- `participant_entity_ids` (scope-authorized only)
- `speaker_entity_id` (per-utterance speaker; authorized
  only)
- `start_time`
- `end_time`
- `transcript_text_encrypted` (at-rest encryption per
  ADR-0019; never plaintext on disk)
- `transcript_hash` (provenance integrity; SHA-256)
- `retention_class` (closed-vocab; mirrors §3.7 +
  legal-hold extensions)
- `legal_hold_status` (closed-vocab)
- `access_scope` (closed-vocab; mirrors §3.4)
- `consent_notice_status` (closed-vocab — captures whether
  participants were notified per §6 Stage 3 prerequisite)
- `source_system` (closed-vocab listener / ingest origin)
- `created_at`
- `deleted_at` (RULE 10 soft-delete; legal-hold may freeze)

Layer 1 implementation requires the §6 prerequisites
satisfied first.

### 5. Wave 10 Control Tower attachment

When Stage 4 implementation lands, the Wave 10 cockpit at
`/agent-playground` MUST:

- Replace the current ADR-0077 §8.2 *"Conversation context
  signals not available in this version"* placeholder with
  the real Layer 3 signals when Foundation surfaces them.
- Render signals as closed-vocab badges + safe-summary
  paragraphs + honest_note footers — NEVER as quote
  blocks, message bubbles, or transcript surfaces by
  default.
- Add a **permissioned evidence drilldown** affordance per
  signal IF `related_transcript_ref` is present AND the
  caller has Layer 4 authorization. The drilldown reveals
  ONLY the specific authorized excerpt (with redactions),
  attribution where authorized, timestamp, transcript
  reference id, and an audit-event id for the drilldown
  read. Default cockpit state remains signal-only.
- Preserve ADR-0077 §8 four honesty postures (hierarchy /
  conversation-context / evidence-posture / execution-
  boundary).
- Preserve ADR-0077 §4 forbidden-UI-copy + §13 no-leak +
  §10 no-Execute-button guards.
- Apply a CT-tier defense-in-depth allowlist at the render
  tier (per ADR-0077 §9) — even if Foundation accidentally
  returned a forbidden field, the CT cockpit refuses to
  render it.

#### 5.1 Allowed Wave 10 evidence-drilldown surface

When Layer 4 drilldown fires AND the caller is authorized,
the cockpit MAY render:

- the permissioned excerpt text (subject to Layer 1
  redactions)
- the source timestamp
- the speaker attribution (when authorized by Layer 1
  access scope)
- the `transcript_id` / `excerpt_id` reference
- the redaction status badge per §3.8
- the `policy_purpose` badge per §3.9
- the drilldown audit-event id

Every drilldown surface MUST be marked as authorized,
purpose-bound, and audited — never as default render
surface.

#### 5.2 Forbidden default Agent Playground projection fields

Even when Layer 1 + Layer 4 are LIVE, the **default**
Agent Playground projection surface (any response body
field outside an explicit Layer 4 drilldown request) MUST
NEVER include:

- full transcript text (raw, unredacted)
- unredacted private messages
- unrestricted speaker quotes (default-rendered)
- raw audio / raw video / raw screen capture
- unscoped screen capture
- private notes (caller's own private surfaces or third-
  party private surfaces)
- chain-of-thought (LLM internal reasoning)
- embeddings / vectors
- secret refs / connector payloads
- employee scoring
- psychological profiling / emotion / sentiment
  quantification
- manager surveillance fields
- cross-org context
- legal / compliance certainty claims

The Stage 4 implementation slice MUST include a no-leak
guard test enforcing every default-projection forbidden
token against an adversarial fixture set.

### 6. Layer 1 + Layer 3 governed-listener prerequisites

Raw transcript ingestion (Layer 1 + Stage 3 listener
output) requires ALL of the following to land first under
their own Founder-authorized ADRs:

1. **Participant notice / consent policy** — what
   participants are told, when, with what opt-out
   semantics.
2. **Enterprise retention policy** — how long Layer 1
   records persist, where, under whose authority.
3. **Legal hold policy** — when retention is frozen
   against deletion under litigation / regulatory hold.
4. **Role-based raw transcript access policy** — who can
   read Layer 1 records at what scope; TAR-authoritative
   per ADR-0057 + existing same-org gates.
5. **Project / hive / action scope binding** — how Layer 1
   records bind to a project / matter / Section 2 Action
   / Hive context for purpose-bound drilldown.
6. **Transcript redaction policy** — when redactions are
   applied (PII / cross-tenant / non-participants /
   privileged content), who can lift them, under what
   audit posture.
7. **Transcript access audit posture** — Layer 1 read
   events emit audit rows per RULE 4; per-excerpt
   drilldown events audited per §3.5 +
   `drilldown_audit_required` true by default.
8. **Export policy** — who can package Layer 1 excerpts
   into evidence exports; what redactions persist into
   the export; what audit lineage attaches.
9. **Regulator disclosure policy** — lawful-basis-gated
   per ADR-0036 LawfulBasis 9-condition check; never
   ungoverned disclosure; minimum-necessary discipline.
10. **Deletion / forgetting policy where legally allowed**
    — pseudonymization vs hard-delete; aligned with
    ADR-0033 cross-language audit chain + GDPR Article 17.
11. **Source provenance / timestamp policy** — how Layer 1
    timestamps + transcript_hash establish provenance;
    immutability where source provides it.
12. **Quote / excerpt permission policy** — who may quote
    Layer 1 content into evidence packages, citations,
    governed reports, etc.

All 12 prerequisites are covered by the **future ADR-0079
(or equivalent) "Otzar Enterprise Transcript Substrate
Policy"** that ADR-0052 build-order step 4 anticipates.
Stage 1 of this ADR's implementation ladder (§7) requires
that policy ADR to land first.

### 6A. Transcript governance capability set (canonical at this ADR)

The future ADR-0079 Transcript Substrate Policy MUST
define + enforce the following 19 capabilities. The list
is canonical at ADR-0078; adding capabilities requires
future Founder-authorized ADR amendment.

1. **Participant notice + consent where required** —
   notice mechanism, consent capture, consent revocation,
   jurisdiction-aware (two-party-consent vs one-party-
   consent jurisdictions).
2. **Speaker attribution policy** — when speaker identity
   may be attached to a transcript / excerpt; when
   pseudonymization is required; when speaker identity
   may be revealed under Layer 4 drilldown.
3. **Redaction policy** — what gets redacted by default
   (PII, non-participants, privileged content,
   cross-tenant fragments), who can lift redactions, under
   what authorization, with what audit posture.
4. **Privileged conversation handling** — attorney-client
   privilege, work-product doctrine, in-house counsel
   communications, executive-session protections; lock at
   ingest, never default-render.
5. **Client / customer confidential information
   handling** — NDA-bound material, customer-confidential
   data, partner-confidential data; scope-bound; not
   default-rendered.
6. **Legal hold** — when retention is frozen against
   deletion; how holds propagate to derived signals; how
   holds release; who can place + release.
7. **Retention schedules** — per-class retention windows
   (`EPHEMERAL_REVIEW_ONLY` / `SCENARIO_CONTEXT_RETAINED`
   / `ACTION_CONTEXT_RETAINED` / `AUDIT_SAFE_METADATA_ONLY`
   / `DEPERSONALIZED_IMPROVEMENT_SIGNAL` + legal-hold
   overlay) + jurisdiction-aware compliance overlay
   (HIPAA / FERPA / FedRAMP / GDPR / etc.).
8. **Deletion where legally allowed** — pseudonymization
   vs hard-delete; aligned with ADR-0033 cross-language
   audit chain + GDPR Article 17 right-to-erasure.
9. **Export / eDiscovery package generation** — who may
   generate exports, what redactions persist into the
   export, what audit lineage attaches, what custody
   chain is recorded.
10. **Regulator disclosure approval** — explicit lawful-
    basis gate per ADR-0036 LawfulBasis 9-condition
    check + approval workflow (dual-control per ADR-0026
    recommended at slice).
11. **Role-based transcript access** — TAR-authoritative
    same-org / project / hive / action / compliance scope;
    no implicit org-admin override of caller-private
    transcripts.
12. **Project / matter / hive / action scoping** — how
    Layer 1 records bind to a governed container so
    drilldown is purpose-bound.
13. **Transcript access audit** — Layer 1 read events
    audited; per-excerpt drilldown events audited per
    §3.5 `drilldown_audit_required`.
14. **Transcript quote / excerpt audit** — when excerpts
    are quoted into evidence packages, governed reports,
    Wave 8 Action payloads, or Wave 10 cockpit
    drilldowns, the quote event itself emits an audit
    row.
15. **Transcript correction / amendment trail** — when a
    transcript is corrected (typos, mis-attribution,
    formal amendment), the original + every amendment
    preserved with timestamp + reason + author audit
    lineage; never silent rewrite.
16. **Conflicting transcript / source resolution** —
    governance for when two transcripts of the same
    meeting / event disagree (multiple listeners,
    multiple ingest pipelines, multiple jurisdictions);
    resolution surface MUST be auditable and never
    default-rendered.
17. **Meeting-to-Action linkage** — Layer 1 record MAY
    bind to a Section 2 Action per ADR-0057 (action
    `payload_redacted` or `notification_class` reference);
    surfaces as `signal_scope = ACTION_SCOPED` at Layer 3.
18. **Meeting-to-Decision linkage** — Layer 1 record MAY
    bind to a Playground decision (scenario, candidate,
    branch, recommendation, governed-transition) for
    decision reconstruction; surfaces as related-id
    pointers at Layer 3.
19. **Meeting-to-Project timeline linkage** — Layer 1
    record MAY bind to a project / matter timeline so
    "what was decided when" is reconstructable;
    `PROJECT_SCOPED` at Layer 3.

ADR-0079 (or equivalent) MUST implement all 19 capabilities
before Stage 1 of this ADR's §7 ladder can fire.

### 6B. Four-tier access discrimination (canonical at this ADR)

Layer 1 transcript access + Layer 4 permissioned
drilldown MUST distinguish four canonical access tiers.
The future ADR-0079 + Stage 1 implementation MUST enforce
each tier at the service register; the four tiers are
NEVER collapsed into a single permission level.

#### 6B.1 — Internal Enterprise Access

Same-org employees / AI Agents / governed members
accessing transcripts for operational purposes inside
the enterprise boundary.

- Scope: SAME_ORG / HIVE_SCOPED / PROJECT_SCOPED /
  ACTION_SCOPED
- Authorization: TAR-authoritative role-based access
  (per §6A.11) + project / hive / action scope binding
  (per §6A.12)
- Audit: standard Layer 1 read + Layer 4 drilldown
  audit (per §6A.13 / §6A.14)
- Speaker attribution: per §6A.2 speaker attribution
  policy; default attribution may be authorized for
  same-org members; cross-org attribution NEVER
- Redaction: per §6A.3 redaction policy; default
  redactions remain applied unless explicitly lifted
- `policy_purpose` (§3.9): `RECOMMENDATION_REVIEW` /
  `SIMULATION_REVIEW` / `GOVERNED_ACTION_REVIEW` /
  `AUDIT_RECONSTRUCTION`

#### 6B.2 — Compliance / Legal Review Access

Compliance officers, legal counsel, in-house policy
reviewers, internal investigations — accessing
transcripts for compliance review purposes inside the
enterprise boundary, often at elevated scope.

- Scope: `COMPLIANCE_REVIEW_SCOPED` per §3.4
- Authorization: TAR-authoritative role-based access +
  explicit compliance-reviewer role + scope-narrowed to
  the specific review matter
- Audit: enhanced (every Layer 1 read + Layer 4
  drilldown emits an audit row; reason-codes captured)
- Speaker attribution: typically authorized under
  policy-bound scope; never broadcast outside the review
- Redaction: privileged-conversation redactions per
  §6A.4 may be conditionally lifted under attorney-
  client privilege + work-product doctrine review
- `policy_purpose` (§3.9): `COMPLIANCE_REVIEW` /
  `LEGAL_REVIEW` / `AUDIT_RECONSTRUCTION`
- Cross-jurisdiction overlay: jurisdiction-aware per §6A.7
  + §6A.10 + ADR-0037 jurisdiction tagging

#### 6B.3 — Regulator-Facing Evidence Package Access

Government regulators, oversight bodies, sworn auditors
under lawful basis — accessing transcripts as exported
evidence packages, NEVER as live cockpit drilldown.

- Scope: `COMPLIANCE_REVIEW_SCOPED` with explicit
  regulator-tier authorization
- Authorization: ADR-0036 LawfulBasis 9-condition gate
  satisfied; ADR-0070 regulator-ready doctrine compliance;
  `policy_purpose = REGULATOR_EVIDENCE_PACKAGE` (§3.9)
- Audit: full audit lineage per RULE 4 + ADR-0036 +
  ADR-0070; export custody chain recorded per §6A.9
- Access mode: **export-only**, never live drilldown
  inside Foundation surfaces; regulator receives a
  governed evidence package (excerpts + provenance +
  audit lineage + redactions + lawful-basis manifest)
- Speaker attribution: per lawful basis; ADR-0070
  neutral-compliance-vocabulary preserved (never
  Foundation language asserting regulatory determination)
- Redaction: minimum-necessary discipline (export ONLY
  excerpts the lawful basis covers; never full
  transcripts unless basis explicitly authorizes)
- Approval workflow: dual-control per ADR-0026
  recommended at slice; approval audit lineage required

#### 6B.4 — External Third-Party Access

Counterparties, vendors under NDA, partners, opposing
counsel under formal discovery, customers under
contractual right — accessing transcripts as bounded
records under explicit contract or legal process.

- Scope: explicit per-party authorization; NEVER same-
  org default access; NEVER any auto-broadcast
- Authorization: contract-tier or legal-process-tier
  authorization captured at the service register
  (NEVER inferred from same-org TAR alone); per-third-
  party record with audit lineage
- Audit: maximum — every Layer 1 read + Layer 4
  drilldown + every quote / excerpt event audited per
  §6A.13 / §6A.14; custody chain recorded per §6A.9
- Speaker attribution: per the third-party
  authorization contract; typically pseudonymized
  unless attribution explicitly authorized
- Redaction: maximum — privileged conversation
  redactions NEVER lifted for third parties; client-
  confidential redactions NEVER lifted unless
  explicitly authorized by the client entity
- Access mode: governed export OR governed read-only
  drilldown under audit; NEVER write access; NEVER
  signal-generation capability
- ADR-0070 §9 legal-advice boundary inherited;
  Foundation language remains neutral

The four tiers MUST be enforced at the service register
in Stage 1+. The Wave 10 cockpit MUST NEVER allow Layer 4
drilldown across tiers without explicit per-tier
authorization re-check.

### 6C. Capture-Eligibility + Work-Relevance Filtering Layer (canonical at this ADR)

Otzar Enterprise MUST capture and retain exact transcripts
**only when the conversation is work-relevant, policy-
authorized, scoped, and eligible for enterprise retention**.
The capture-eligibility + work-relevance filtering layer
sits **architecturally BEFORE Layer 1 ingest** and gates
every downstream layer (Layer 1 storage, Layer 2 scoped
reasoning, Layer 3 signal projection, Layer 4 drilldown).
Without this layer's approval, the conversation is **not
captured, not stored, not projected, and not exposed to
Agent Playground**.

#### 6C.1 — Pre-Layer-1 gates (eligibility check before capture)

Before Foundation may ingest any transcript or generate
any signal, the conversation context MUST satisfy ALL of:

1. **Approved work meeting / channel / workspace** — the
   conversation originates from an enterprise-approved
   collaboration surface
2. **Participant notice / consent satisfied** — per §6A.1
3. **Enterprise-owned device OR approved-app context** —
   personal devices outside scope unless explicitly
   authorized
4. **Project / matter / client / action / hive scope
   exists** — per §6A.12
5. **Business purpose exists** (per §6C.5 closed vocab) —
   a real enterprise reason to capture
6. **Retention policy permits capture** — per §6A.7
7. **Legal / compliance policy permits OR requires
   capture** — per §6A.6 / §6A.10
8. **Employee privacy policy does not exclude the
   context** — per §6C.3 personal-exclusion rules

Failing any gate → CAPTURE BLOCKED at the source-system
boundary; Foundation never receives the transcript.

#### 6C.2 — Work-Relevance Classifier (per-segment classification)

When a conversation IS captured, the system MUST classify
each captured segment as one of (closed vocab; §6C.6):

- `WORK_RELEVANT`
- `MIXED_WORK_PERSONAL`
- `NON_WORK_PERSONAL`
- `SENSITIVE_PERSONAL`
- `UNKNOWN_REQUIRES_REVIEW`

The classifier MUST be **biased toward privacy**. When the
classifier is uncertain, the default classification is
`UNKNOWN_REQUIRES_REVIEW` (NEVER `WORK_RELEVANT` by
default). `UNKNOWN_REQUIRES_REVIEW` segments are
**excluded from Agent Playground signal generation by
default** unless explicit human / compliance review marks
them safe.

#### 6C.3 — Personal / Non-Work Exclusion (categories blocked by default)

The following categories MUST NOT generate Agent Playground
signals + MUST NOT be retained for Layer 3 projection
unless explicit legal hold per §6A.6 requires retention:

- personal family matters
- medical / health discussion
- romantic / sexual discussion
- private financial hardship
- religious / political personal discussion
- joking / banter unrelated to work
- lunch / social plans unless tied to business purpose
- personal conflict unrelated to work
- casual venting not tied to a work action
- private employee emotional state
- psychological inference of any kind
- union / labor organizing or legally protected
  collective-action activity where applicable
- ANY legally-protected personal category or activity
  (religion, national origin, age, disability, sex,
  pregnancy, sexual orientation, gender identity, etc.
  per applicable jurisdiction's protected-class law)

Foundation MUST suppress these categories at the source-
system boundary OR redact them at Layer 1 ingest.

#### 6C.4 — Mixed Conversation Handling

Real conversations often mix work + personal segments. For
`MIXED_WORK_PERSONAL` classification:

- isolate ONLY the work-relevant segment
- redact OR suppress personal portions per §6A.3
- preserve ONLY minimal safe metadata
- generate signals ONLY from the work-relevant segment
- if segment boundaries are unclear → require human /
  compliance review before retention OR use → classification
  becomes `UNKNOWN_REQUIRES_REVIEW` at the work-relevance
  classifier register

#### 6C.5 — Sensitive Personal Handling

For `SENSITIVE_PERSONAL` classification:

- MUST NOT surface in Agent Playground
- MUST NOT generate `conversation_context_signals[]`
- MUST NOT be exposed to managers
- MUST NOT be used for employee scoring
- MUST NOT be used for recommendations / simulations
- MUST retain ONLY if legally required OR explicitly
  authorized by policy
- otherwise discard OR mark non-indexable per retention
  policy

#### 6C.6 — Business Purpose Binding (every retained record bound to a purpose)

Every Layer 1 record + every Layer 3 signal MUST bind to a
business purpose via the §6C.5 closed-vocab
`business_purpose_label`. Records / signals with
`business_purpose_label = UNKNOWN_BUSINESS_PURPOSE` MUST
NOT flow into Agent Playground until reclassified.

Allowed business-purpose labels (closed vocab; 11 values):

- `PROJECT_CONTEXT`
- `CLIENT_OR_CUSTOMER_WORK`
- `ACTION_RELATED`
- `APPROVAL_RELATED`
- `COMPLIANCE_REVIEW`
- `LEGAL_HOLD`
- `INCIDENT_REVIEW`
- `HIVE_OR_TEAM_COORDINATION`
- `SALES_OR_ACCOUNT_WORK`
- `SUPPORT_CASE`
- `UNKNOWN_BUSINESS_PURPOSE`

#### 6C.7 — Default Agent Playground consumption rule

Agent Playground MAY consume signals ONLY when ALL of:

- `conversation_relevance_class` ∈ {`WORK_RELEVANT`,
  approved `MIXED_WORK_PERSONAL` after personal redaction}
- OR `agent_playground_use` ∈ {`ALLOWED_FOR_SIGNALS`,
  `ALLOWED_AFTER_REDACTION`, `LEGAL_COMPLIANCE_ONLY` (only
  for compliance-tier surfaces per §6B.2)}
- `business_purpose_label` ≠ `UNKNOWN_BUSINESS_PURPOSE`
- `capture_eligibility` ∈ {`CAPTURE_ALLOWED`,
  `CAPTURE_ALLOWED_WITH_REDACTION`,
  `CAPTURE_REQUIRED_BY_LEGAL_HOLD`}

Agent Playground MUST NEVER consume:

- `NON_WORK_PERSONAL`
- `SENSITIVE_PERSONAL`
- `UNKNOWN_REQUIRES_REVIEW` (unless reviewed + approved)

#### 6C.8 — Default Control Tower cockpit rule

Wave 10 cockpit MUST NOT show raw transcript by default.
When Layer 4 drilldown exists per §5.1, it MUST surface:

- ONLY the work-relevant excerpt (personal segments
  redacted)
- the `business_purpose_label` (per §6C.6)
- the `policy_purpose` access purpose (per §3.9)
- the access audit state + audit-event id
- the retention / legal-hold state if applicable (per
  §6A.6 / §6A.7)
- the redaction status per §3.8

#### 6C.9 — Filter-outcome closed vocabularies

Three closed-vocab unions support the filtering layer.
Adding values requires future Founder-authorized ADR
amendment.

##### 6C.9.a `conversation_relevance_class` (5 values)

- `WORK_RELEVANT`
- `MIXED_WORK_PERSONAL`
- `NON_WORK_PERSONAL`
- `SENSITIVE_PERSONAL`
- `UNKNOWN_REQUIRES_REVIEW`

##### 6C.9.b `capture_eligibility` (7 values)

- `CAPTURE_ALLOWED`
- `CAPTURE_ALLOWED_WITH_REDACTION`
- `CAPTURE_BLOCKED_PERSONAL`
- `CAPTURE_BLOCKED_POLICY`
- `CAPTURE_BLOCKED_NO_BUSINESS_PURPOSE`
- `CAPTURE_REQUIRES_REVIEW`
- `CAPTURE_REQUIRED_BY_LEGAL_HOLD`

##### 6C.9.c `agent_playground_use` (5 values)

- `ALLOWED_FOR_SIGNALS`
- `ALLOWED_AFTER_REDACTION`
- `BLOCKED_FROM_AGENT_PLAYGROUND`
- `REQUIRES_HUMAN_REVIEW`
- `LEGAL_COMPLIANCE_ONLY`

#### 6C.10 `scope_binding_type` (9 values; closed vocab)

Every Layer 1 record + Layer 3 signal MUST carry an
explicit scope binding type so the substrate is auditably
purpose-bound:

- `SCENARIO_SCOPED`
- `PROJECT_SCOPED`
- `MATTER_SCOPED`
- `CLIENT_SCOPED`
- `ACTION_SCOPED`
- `HIVE_SCOPED`
- `ORG_SCOPED`
- `LEGAL_HOLD_SCOPED`
- `COMPLIANCE_REVIEW_SCOPED`

#### 6C.11 — Privacy-bias filtering standard

When relevance is unclear, the substrate MUST be biased
toward privacy:

- Clearly work-related → MAY be retained + used per policy
- Mixed → ONLY the work-relevant portion MAY be used
- Personal → MUST NOT be used for Agent Playground
- Sensitive personal → MUST be BLOCKED from Agent
  Playground entirely
- Legal-hold-required retention → MAY be retained under
  legal / compliance scope BUT still BLOCKED from normal
  product surfaces (signal generation, recommendation,
  simulation, cockpit drilldown outside §6B.2 / §6B.3
  authorization)

#### 6C.12 — Signal-shape extension (additive)

The Layer 3 `ConversationContextSignal` shape (§2) MUST
carry the following ADDITIONAL fields at every stage that
emits signals (Stage 2+):

```text
ConversationContextSignal (additive; §6C fields):
  ...existing §2 fields...
  conversation_relevance_class: ConversationRelevanceClass (§6C.9.a)
  capture_eligibility: CaptureEligibility (§6C.9.b)
  agent_playground_use: AgentPlaygroundUse (§6C.9.c)
  redaction_applied: boolean
  business_purpose_label: BusinessPurposeLabel (§6C.6)
  scope_binding_type: ScopeBindingType (§6C.10)
  review_required: boolean
  personal_content_suppressed: boolean
```

These fields are REQUIRED on every signal at every layer.
Their presence is a substrate-tier invariant; absence is
a no-leak guard failure at the response surface.

#### 6C.13 — Implementation prerequisite

ADR-0079 (or equivalent Transcript Substrate Policy ADR)
MUST also cover the §6C capture-eligibility + work-
relevance filtering layer **in addition to** the §6 12
prerequisites + §6A 19 governance capabilities + §6B 4
access tiers. Without §6C coverage, the future ADR-0079
fails to satisfy the doctrine *"Otzar Enterprise should
remember work, not surveil life."* and Stage 1 of this
ADR's §7 implementation ladder CANNOT fire.

### 7. Five-stage implementation ladder

Each stage requires its own Founder authorization.

#### Stage 0 — Contract ADR (THIS ADR; LANDED 2026-05-31)

- Locks the four-layer substrate + signal vocab + shape +
  forbidden defaults + prerequisites + future attachment
  points.

#### Stage 1 — Layer 1 schema + Layer 3 projection-helper (pre-listener)

- Requires: ADR-0079 (or equivalent) Transcript Substrate
  Policy ADR landed (§6 prerequisites covered).
- Implements: Layer 1 Prisma model with the §4 allowed
  fields; encryption-at-rest per ADR-0019.
- Implements: pure-function helper that maps Layer 1
  records + Layer 2 retrieval results → `ConversationContextSignal[]`.
- Adds: Layer 4 permissioned-drilldown service surface
  (read-only; bearer + scope-checked; audit emission via
  existing `ADMIN_ACTION + details.action` discriminator).
- Tests: closed-vocab + forbidden-default-projection
  + Layer 4 audit + enumeration-safe scope checks +
  redaction-respect.

#### Stage 2 — Approved-source projection LIVE (no listener yet)

- Implements: Layer 3 signals derived from sources ALREADY
  LIVE in Foundation:
  - `CORRECTION_SIGNAL` per ADR-0055 + ADR-0058
  - `ACTION_HISTORY` per ADR-0057
  - `HIVE_CONTEXT` per ADR-0059 + ADR-0063
  - `MANUAL_USER_INPUT` (Agent Playground scenario fields
    per ADR-0065)
- NEW additive sidecar on Wave 7 / Wave 9 (§8 / §9) OR
  NEW route depending on Stage 2 ADR.
- NO Layer 1 ingestion at this stage; `related_transcript_ref`
  is omitted from all Stage 2 signals.

#### Stage 3 — Governed listener output LIVE

- Requires: Stage 1 substrate + Stage 2 patterns +
  §6 listener prerequisites all landed.
- Implements: governed listener integration emitting
  Layer 1 transcripts + Layer 2 retrieval bridge +
  Layer 3 signals + Layer 4 drilldown audit.
- Source-side transcript ingestion may use BEAM
  supervised processes per ADR-0028 + ADR-0069 §6
  re-verification if substrate-honest pre-flight at the
  Stage 3 ADR yields BEAM register.

#### Stage 4 — Agent Playground response integration

- Wave 7 + Wave 9 + Wave 10 amendments land
  `conversation_context_signals[]` on the existing
  response shapes per §8 / §9 / §5.
- Wave 10 cockpit replaces the ADR-0077 §8.2 "not
  available" placeholder with real signals + Layer 4
  drilldown affordance when authorized.

#### Stage 5 — Hierarchy + graph integration (forward-substrate)

- Each requires its own ADR.

### 8. Future Wave 7 attachment point

The future Wave 7 implementation amendment MAY extend
`RecommendBestPathSuccess` (ADR-0074 §1) with an additive
sidecar:

```text
RecommendBestPathSuccess (future, additive):
  ...existing fields...
  conversation_context_signals?: readonly ConversationContextSignal[]
```

Additive (existing fields untouched); forbidden default
fields per §5.2 NEVER appear; bounded count at the
amendment (recommended ≤ 8 signals per recommendation).

### 9. Future Wave 9 attachment point

The future Wave 9 implementation amendment MAY extend
EITHER `SimulationBranch` OR `EnterpriseDecisionPosture`
(ADR-0076 §1 + Amendment 1) with an additive sidecar:

```text
SimulationBranch (future, additive):
  ...existing fields...
  conversation_context_signals?: readonly ConversationContextSignal[]
```

OR

```text
EnterpriseDecisionPosture (future, additive):
  ...existing fields...
  conversation_context_signals?: readonly ConversationContextSignal[]
```

The amendment picks ONE (or both if substrate-honest
pre-flight justifies); Wave 9 §11 bounded counts preserved.

### 10. Future hierarchy + graph attachment

Signals MAY later inform downstream substrate (forward-
substrate; each requires its own ADR):

- **Hierarchy substrate** — `MISSING_STAKEHOLDER_INPUT`
  + `APPROVAL_DEPENDENCY_IDENTIFIED` + `DECISION_OWNER_UNCLEAR`
  MAY inform `stakeholder_to_consult` / `stakeholder_to_inform`
  projections ONLY if scoped + authorized; named-individual
  identity per ADR-0019 register applies.
- **Organizational graph** — signals MAY appear as safe
  evidence-nodes (closed-vocab `evidence_label` +
  `safe_summary`) ONLY; raw transcript edges / message
  nodes are forbidden as default graph surface but MAY
  be reached via Layer 4 drilldown from a graph node when
  authorized.

### 11. `safe_summary` discipline

`safe_summary` is a short, bounded, non-attributive,
non-quoted projection ≤ 300 characters at the **default
response surface**.

ALLOWED at default response surface:

- *"A stakeholder concern was identified and requires
  review."*
- *"A prior commitment appears relevant to this scenario."*
- *"Missing stakeholder input may block transition to
  action."*
- *"Approval dependency identified; policy-owner review
  needed before action."*

ALLOWED only via Layer 4 permissioned drilldown (NEVER at
default surface):

- exact quotes from authorized transcript excerpts
- named speaker attribution (when authorized)
- raw timestamps from Layer 1 records

FORBIDDEN at every layer (no permissioned drilldown
unlocks these):

- emotion / sentiment quantification numeric scores
- employee scoring / manager scoring / psychological
  profiling
- legal / compliance certainty claims
- regulator-approved language
- manager-action prescriptions ("*manager should
  intervene*")
- cross-org context fusion
- raw audio / video / screen capture
- chain-of-thought (LLM internal reasoning)
- embeddings / vectors / content_hash / storage_location
  / bridge_id / secret_ref / connector_payload at the
  response surface

### 12. Audit posture

ADR-0078 introduces **NO new audit literal**. Future
implementation amendments reuse the existing
`ADMIN_ACTION + details.action` discriminator pattern.
Suggested discriminator names (final at slice):

- `details.action = "CONVERSATION_CONTEXT_SIGNALS_READ"`
- `details.action = "CONVERSATION_CONTEXT_SIGNAL_GENERATED"`
- `details.action = "TRANSCRIPT_EXCERPT_DRILLDOWN_READ"`
  (Layer 4)

Audit row metadata MAY include `signal_type` /
`signal_scope` / `signal_source_type` /
`signal_confidence_label` / `transcript_id` /
`excerpt_id` / `policy_purpose` / `count` — but NEVER
raw `safe_summary` content, NEVER raw transcript text,
NEVER unredacted speaker quotes.

Layer 4 drilldown read events MUST emit an audit row when
`drilldown_audit_required` is true (default true).

### 13. Regulator-ready posture

ADR-0070 §9 legal-advice boundary inherited verbatim
across all layers.

Signals MAY support regulator-ready evidence posture ONLY
as safe closed-vocab metadata (*"policy concern raised"*
via `POLICY_CONCERN`; *"approval dependency identified"*
via `APPROVAL_NEED`; etc.).

Signals MUST NEVER claim *"compliant"* / *"legally
sufficient"* / *"regulator approved"* / *"no fine risk"*
/ *"employee violated policy"* / *"manager failed
supervision"* / any regulatory determination.

Exact transcripts MAY be packaged as regulator evidence
ONLY under:

- ADR-0036 LawfulBasis 9-condition gate satisfied
- §3.9 `policy_purpose = REGULATOR_EVIDENCE_PACKAGE`
  authorized
- §6 Stage 3 prerequisites + ADR-0079 (transcript policy
  ADR) requirements all satisfied
- minimum-necessary discipline (export only the excerpts
  the lawful basis covers; never full transcripts unless
  the basis explicitly authorizes)
- audit lineage per RULE 4 + ADR-0070

### 14. RULE 0 + same-org boundary universal

Every layer at every stage MUST:

- be scope-bounded by the caller's COSMP permission per
  RULE 0
- never cross-tenant fuse (Layer 1 transcripts and Layer 3
  signals respect wallet scope verbatim)
- never expose private third-party identity without
  explicit Layer 1 access-scope authorization
- respect TAR-authoritative same-org gates per ADR-0057 +
  ADR-0007
- respect the existing Wave 4 owner-first + same-org
  SCENARIO_NOT_FOUND enumeration-safe 404 pattern when
  signals attach to a scenario / candidate / branch /
  Action

### 15. Substrate-coherence law alignment

Per ADR-0069 §6 8-question architecture check for any
Stage 3+ governed listener implementation:

1. **Concurrency / long-running** — listener integration
   MAY be long-running (continuous ingest); the Stage 3
   ADR re-applies the check fresh.
2. **Supervision / fault isolation** — listener errors
   MUST NOT poison Foundation; isolated supervised
   processes recommended.
3. **Backpressure / streaming** — likely.
4. **Multi-agent coordination** — NOT required for signal
   emission.
5. **Event-driven flow** — yes.
6. **High-throughput** — depends on listener type.
7. **Cross-system coordination** — yes.
8. **Intelligence-heavy computation** — possible (Layer 2
   retrieval + signal extraction); the Stage 3 ADR
   decides register.

ADR-0078 canonicalizes the **output contract + layer
boundaries**, not the listener engine register.

### 16. Wave-map alignment

ADR-0078 explicitly EXCLUDES at every stage:

- Action execution (Section 2 retains all execution
  authority per ADR-0057)
- Action creation (Wave 8 owns governed transitions)
- Wave 8 bypass
- LLM-generated signal text without closed-vocab
  projection
- Caller-supplied raw transcript without Layer 1 + §6
  prerequisites
- Numeric scoring / ranking / probability claims
- Employee scoring / manager surveillance / psychological
  profiling at any layer
- Cross-org context fusion at any layer
- Regulator-tier evidence claims beyond ADR-0070
  neutral-vocabulary posture
- Raw conversation persistence in Foundation outside the
  governed Layer 1 substrate (which requires §6
  prerequisites)
- Default-render of raw transcript content at any
  Foundation API surface (only Layer 4 permissioned
  drilldown explicitly authorized renders authorized
  excerpts)

### 17. Forward queue

- **ADR-0079 (or equivalent) Transcript Substrate Policy
  ADR** — load-bearing prerequisite for Stage 1+;
  separate Founder authorization at slice; covers the §6
  12 prerequisites.
- **Stage 1 ADR / implementation slice** — Layer 1 schema
  + Layer 3 projection helper + Layer 4 drilldown read
  service; separate Founder authorization; requires
  ADR-0079.
- **Stage 2 implementation slice** — approved-source
  projection LIVE; separate Founder authorization;
  requires Stage 1.
- **Stage 3 governed listener slice** — Layer 1 + Layer 2
  + Layer 3 + Layer 4 listener integration LIVE; separate
  Founder authorization; requires Stage 1 + Stage 2 + §6
  prerequisites + ADR-0079.
- **Stage 4 Wave 7 / Wave 9 / Wave 10 amendments** —
  separate Founder authorization; requires Stage 2 (or
  Stage 3 if listener signals in scope).
- **Stage 5 hierarchy + graph integration** — each
  requires its own ADR.

## Consequences

### Easier after this ADR

- Future implementation slices have a single canonical
  four-layer reference (Layer 1 source-of-truth + Layer 2
  scoped reasoning + Layer 3 safe projection + Layer 4
  permissioned drilldown).
- §3 closed-vocab catalogs (signal_type / confidence /
  source / scope / evidence_label / retention_class /
  redaction_status / policy_purpose) protect against
  vocab drift at every future amendment.
- §5 Wave 10 attachment + §5.1 evidence-drilldown surface
  + §5.2 forbidden-default-projection catalog protect the
  CT cockpit from accidentally surfacing raw content.
- §6 12-prerequisite list makes the policy-ADR
  expectations explicit before Layer 1 implementation can
  land.
- §13 regulator-ready posture clarifies what Layer 1 +
  Layer 3 + Layer 4 surfaces CAN and CANNOT claim under
  ADR-0070 neutral compliance vocabulary.

### Harder after this ADR

- Stage 1 implementation cannot land until ADR-0079
  Transcript Substrate Policy ADR lands first.
- §5.2 forbidden-default-projection catalog cannot be
  relaxed; permissioned-drilldown is the only
  authorized path to raw content.
- §3.1 17-value `signal_type` cannot accept new values
  without amendment.
- Layer 2 scoped-reasoning bridge cannot bypass Layer 3
  projection at the response surface — internal reasoning
  may consult transcripts, but the API response body
  emits signals by default.

## Forward queue (summary)

- **ADR-0079 (Transcript Substrate Policy)** — load-
  bearing prerequisite; MUST cover §6 12 prerequisites +
  §6A 19 transcript-governance capabilities + §6B 4
  access tiers + §6C capture-eligibility / work-relevance
  filtering layer (including §6C.1 8 pre-capture gates +
  §6C.2 5-class relevance classifier + §6C.3 personal/
  protected-category exclusions + §6C.4 mixed-conversation
  handling + §6C.5 sensitive-personal handling + §6C.6 11-
  value business-purpose-label vocab + §6C.7 default
  Agent Playground consumption rule + §6C.8 default
  cockpit rule + §6C.9 filter-outcome closed vocabs +
  §6C.10 9-value scope-binding-type vocab + §6C.11
  privacy-bias filtering standard + §6C.12 signal-shape
  additive fields + §6C.13 implementation prerequisite).
- **Stage 1 ADR / impl** — Layer 1 + Layer 3 helper +
  Layer 4 read service; enforces §6B four-tier access
  discrimination at the service register.
- **Stage 2 impl** — approved-source projection LIVE.
- **Stage 3 governed listener slice** — Layer 1+2+3+4
  listener integration LIVE.
- **Stage 4 amendments** — Wave 7 / Wave 9 / Wave 10.
- **Stage 5 hierarchy + graph** — each requires own ADR.

## Bidirectional citations

- Cites RULE 0, RULE 4, RULE 9, RULE 10, RULE 12, RULE 13,
  RULE 14, RULE 18, RULE 19, RULE 20, RULE 21.
- Cites ADR-0001 (foundational entity / wallet scope).
- Cites ADR-0002 (append-only audit chain; signals +
  drilldown reuse the discriminator pattern).
- Cites ADR-0019 (cryptographic-suite posture; Layer 1
  transcript_text_encrypted at rest).
- Cites ADR-0020 (two-register IP discipline).
- Cites ADR-0026 (dual-control middleware pattern;
  recommended for §6B.3 regulator-tier export approval
  workflow + §6A.6 legal-hold place/release dual-control).
- Cites ADR-0033 (cross-language audit chain;
  pseudonymization / forgetting at Stage 3+).
- Cites ADR-0036 (LawfulBasis; Layer 1 regulator
  evidence packaging + `COMPLIANCE_REVIEW_SCOPED` signal
  scope).
- Cites ADR-0037 (jurisdiction tagging; §6B.2 cross-
  jurisdiction overlay for compliance / legal review
  access + §6C.3 jurisdiction-aware protected-class
  enforcement).
- Cites ADR-0048 (governed personalization-orchestration
  substrate).
- Cites ADR-0052 (Otzar DGI doctrine — load-bearing;
  build-order step 4 prerequisite; bidirectional back-
  citation per RULE 14 + RULE 20).
- Cites ADR-0054 (Otzar Conversation Look-back; existing
  conversation metadata substrate; bidirectional back-
  citation per RULE 14 + RULE 20).
- Cites ADR-0055 (Otzar Correction Signals;
  `CORRECTION_SIGNAL` source LIVE; bidirectional back-
  citation per RULE 14 + RULE 20).
- Cites ADR-0057 (Section 2 Action runtime;
  `ACTION_HISTORY` source LIVE; Wave 8 NEVER bypassed).
- Cites ADR-0058 (Otzar Drift Detection; signal-
  projection discipline inherited verbatim; bidirectional
  back-citation per RULE 14 + RULE 20).
- Cites ADR-0059 (Section 3 Hives v1; `HIVE_CONTEXT`
  source LIVE).
- Cites ADR-0061 (Section 6 Analytics;
  `DEPERSONALIZED_IMPROVEMENT_SIGNAL` posture).
- Cites ADR-0063 (Section 3 governance_terms evaluator).
- Cites ADR-0065 (Agent Playground long-term product
  vision; conversation context = one of 13 canonical
  inputs).
- Cites ADR-0069 (BEAM substrate-coherence law; §15
  8-question check for Stage 3).
- Cites ADR-0070 (regulator-ready doctrine; §13
  neutral-compliance-vocabulary preserved).
- Cites ADR-0076 (Wave 9 simulation; §9 future attachment;
  bidirectional back-citation per RULE 14 + RULE 20).
- Cites ADR-0077 (Wave 10 cockpit consumer; §5 future
  attachment + §8.2 honesty placeholder eventually
  replaced; bidirectional back-citation per RULE 14 +
  RULE 20).

## Forward-substrate closeout

**ADR-0079 LANDED 2026-05-31** at
`[FOUNDER-ADR-0079-TRANSCRIPT-SUBSTRATE-POLICY-ADR-AUTH]`
as the Transcript Substrate Policy ADR this ADR's §6 +
§6A + §6B + §6C anticipated. ADR-0079 converts ADR-0078's
four-layer conversation architecture into enforceable
policy + service-tier contracts via 33 canonical sections
covering capture eligibility, work-relevance
classification, personal/non-work exclusion, mixed
conversation handling, sensitive-personal handling,
business-purpose binding, scope binding, four canonical
access tiers (Internal Enterprise / Compliance-Legal /
Regulator Evidence Package / External Third-Party —
NEVER collapsed), notice/consent, retention, legal hold,
redaction, privileged conversation handling,
client-confidential handling, transcript access audit,
quote/excerpt permission, export/eDiscovery, regulator
disclosure (ADR-0036 LawfulBasis-gated + ADR-0070
neutral-vocabulary), correction/amendment trail, linkage
policy, 9 service-tier gates (`canCaptureTranscript` /
`classifyConversationRelevance` / `canRetainTranscript` /
`canUseForAgentPlayground` / `canDrillDownTranscript` /
`canQuoteTranscript` / `canExportTranscript` /
`canDiscloseToRegulator` /
`canDeleteOrPseudonymizeTranscript`), default no-leak
doctrine (ADR-0078 §11 + §5.2 + §6C forbidden-fields
catalog inherited verbatim), Agent Playground use policy,
Control Tower cockpit policy, implementation ladder
mapping, stop conditions for future implementation. With
ADR-0079 LANDED, **§7 Stage 1+ implementation is
policy-unblocked** but remains implementation-gated by
separate Founder authorization at slice. **Bidirectional
back-citation per RULE 14 + RULE 20.**

## Bidirectional citations (continued)

- **Cited by ADR-0079** (Transcript Substrate Policy for
  Conversation Context Signals; design-only Policy ADR;
  Accepted 2026-05-31) — ADR-0079 is the load-bearing
  policy prerequisite for this ADR's §7 Stage 1+
  implementation per §6C.13. ADR-0079 turns this ADR's
  §6 / §6A / §6B / §6C into enforceable policy gates +
  service-tier contracts. The 12-vocabulary closed-vocab
  catalog (§3 + §6C) is inherited verbatim. Bidirectional
  back-citation per RULE 14 + RULE 20 (Founder
  authorization for this back-citation amendment landed
  at
  `[FOUNDER-ADR-0079-TRANSCRIPT-SUBSTRATE-POLICY-ADR-AUTH]`
  2026-05-31).

## Founder authorization

Per RULE 20: this ADR + bidirectional back-citations + the
`architecture/README.md` catalog entry + Section 5
build-state doc update + NEXT_ACTION.md baton update land
under explicit Founder authorization at
`[FOUNDER-CONVERSATION-CONTEXT-SIGNALS-SUBSTRATE-ADR-AUTH]`
2026-05-31 (with the Founder transcript-source-of-truth
correction at the same authorization preserving Layer 1 +
Layer 2 + Layer 4 alongside Layer 3). ADR-only — every
implementation stage (§7 Stage 1 through Stage 5) requires
separate Founder authorization at its slice. ADR-0079
Transcript Substrate Policy ADR (§17) is a separate
forward-substrate authorization.
