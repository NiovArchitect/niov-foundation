# ADR-0079 — Transcript Substrate Policy for Conversation Context Signals

## Status

Accepted 2026-05-31

Decider: Founder. Authorized at
`[FOUNDER-ADR-0079-TRANSCRIPT-SUBSTRATE-POLICY-ADR-AUTH]`
2026-05-31.

This ADR is **design-only**. **Policy ADR.** NO code, NO
schema migration, NO new routes, NO listener ingestion, NO
raw transcript capture or storage, NO transcript-search
endpoint, NO Control Tower implementation, NO LLM / model
calls, NO Python, NO BEAM, NO connector invocation, NO
Action mutation or creation, NO organizational graph, NO
hierarchy substrate implementation, NO personal-life
automation, NO trust-level delegation, NO new audit literal,
NO raw transcript exposure by default at this commit.
ADR-0079 converts ADR-0078's conversation architecture into
**enforceable policy + service-tier contracts** that future
Stage 1+ implementation MUST satisfy before any transcript
ingest or signal-generation slice may fire.

Sits ABOVE ADR-0078 (which holds the conversation substrate
architecture) and BELOW the Otzar DGI doctrine ADR-0052 +
ADR-0070 regulator-ready doctrine at the **policy register**.

## 1. Context

ADR-0078 landed 2026-05-31 (PR #155, Foundation main HEAD
`44cf12c`) as the design-only four-layer conversation
substrate (Layer 1 Raw Transcript Source-of-Truth + Layer 2
Scoped Reasoning + Layer 3 `conversation_context_signals[]`
Safe Projection + Layer 4 Permissioned Evidence Drilldown).
ADR-0078 §6 named 12 implementation prerequisites; ADR-0078
§6A named 19 transcript-governance capabilities; ADR-0078
§6B canonicalized 4 access tiers; ADR-0078 §6C locked the
capture-eligibility + work-relevance filtering layer that
sits architecturally BEFORE Layer 1 ingest.

ADR-0078 §6C.13 made ADR-0079 (or equivalent Transcript
Substrate Policy ADR) a **load-bearing prerequisite**:
without ADR-0079 covering §6 + §6A + §6B + §6C as
enforceable policy, **Stage 1+ implementation cannot fire**.

Why ADR-0079 must exist before any implementation:

- Exact transcripts matter for enterprise accuracy,
  compliance, recall, project history, decision
  reconstruction, and regulator-ready evidence.
- Exact transcript infrastructure can become surveillance
  infrastructure unless capture eligibility, work-relevance
  filtering, access tiers, redaction, retention, and
  drilldown policy are locked first.
- ADR-0079 is the policy boundary between **enterprise
  evidence** and **workplace surveillance**.

### 1.1 Doctrine sentences preserved verbatim

ADR-0079 inherits and operationally enforces ADR-0078's
canonical doctrines verbatim:

1. *Exact transcripts are the evidentiary source of truth;
   `conversation_context_signals[]` are the governed
   intelligence interface.*
2. *Otzar Enterprise should remember work, not surveil
   life.*
3. *The transcript layer preserves authorized business
   evidence; the relevance layer prevents personal life
   from becoming enterprise intelligence.*
4. *Signals do not replace transcripts; signals are the
   safe projection layer.*
5. *Raw transcripts are forbidden in default projection
   surfaces, not forbidden entirely.*
6. *Authorized enterprise users may have permissioned
   evidence drilldown to exact transcript excerpts only
   when scoped, purpose-bound, redaction-compliant, and
   audited.*
7. *Work-relevance filtering sits architecturally before
   Layer 1 transcript ingest.*
8. *Not every conversation at work is work context.*
9. *Not every casual comment becomes memory.*
10. *Personal / sensitive content must not become Agent
    Playground intelligence.*

### 1.2 Out of scope

- ADR-0079 is **not** a consumer / personal-life automation
  ADR. The four-layer substrate's future application beyond
  Otzar Enterprise (personal Otzar, life-decision support,
  consumer assistant surfaces) is **future strategic
  context only** per ADR-0052 §17 and ADR-0074 §22 and is
  **not authorized here**. ADR-0079 governs Otzar
  Enterprise transcript substrate only.
- ADR-0079 does not implement the four-layer substrate;
  every Stage 1 / 2 / 3 / 4 / 5 implementation slice
  requires separate Founder authorization per ADR-0078 §7.
- ADR-0079 does not extend ADR-0078's closed vocabularies.
  Every vocabulary referenced in this ADR is inherited
  from ADR-0078 verbatim.

## 2. Decision

Foundation adopts ADR-0079 as the **required Transcript
Substrate Policy** before any ADR-0078 Stage 1+
implementation may fire.

ADR-0079 defines enforceable policy gates for:

- transcript capture
- transcript retention
- transcript use (Layer 2 scoped reasoning + Layer 3 signal
  generation)
- transcript search / retrieval
- transcript quote / excerpt (Layer 4 drilldown)
- transcript redaction
- transcript audit
- transcript export / eDiscovery
- regulator disclosure
- transcript deletion / pseudonymization
- Agent Playground use
- permissioned evidence drilldown
- correction / amendment trail
- conflicting-source resolution
- meeting-to-Action / meeting-to-Decision / meeting-to-
  Project-timeline linkage

Every gate is policy-only at this ADR; the Stage 1
implementation ADR (separate Founder authorization)
translates each gate into a concrete service-tier function +
audit emission + UI guard.

## 3. Non-goals

ADR-0079 explicitly EXCLUDES at this commit:

- NO code in this commit
- NO schema migration
- NO new routes
- NO transcript capture
- NO listener integration
- NO transcript storage
- NO transcript search endpoint
- NO Control Tower implementation
- NO LLM / model calls
- NO Python
- NO BEAM
- NO connector invocation
- NO Action mutation
- NO Action creation
- NO organizational graph
- NO hierarchy substrate implementation
- NO personal-life automation
- NO trust-level delegation
- NO new audit literal (existing `ADMIN_ACTION +
  details.action` discriminator pattern reused verbatim
  per ADR-0051 / ADR-0054 / ADR-0055 / ADR-0058 / ADR-0072
  / ADR-0073 / ADR-0074 / ADR-0075 / ADR-0076 / ADR-0077 /
  ADR-0078 precedent)
- NO raw transcript exposure on any default surface
- NO manager surveillance framing at any layer
- NO employee scoring framing at any layer
- NO psychological profiling at any layer
- NO legal / compliance certainty claims
- NO regulator approval claims
- NO Wave 8 bypass
- NO Section 2 Action runtime bypass

## 4. Policy scope

ADR-0079 governs:

- Otzar Enterprise transcript substrate only
- governed exact-transcript source-of-truth (Layer 1)
- scoped reasoning access (Layer 2)
- safe-projection governance for
  `conversation_context_signals[]` (Layer 3)
- evidence-drilldown governance (Layer 4)
- compliance / legal / regulator evidence posture
- work-relevance filtering before ingest (the architectural
  pre-Layer-1 gate per ADR-0078 §6C)

ADR-0079 governs **future implementation**. It does not
implement the substrate.

## 5. Capture eligibility policy

Before any transcript MAY be captured or ingested by
Foundation, **ALL** of the following gates MUST pass:

1. **Approved work meeting / channel / workspace.** The
   conversation MUST originate from an enterprise-approved
   collaboration surface. Personal channels, off-platform
   messaging, and unapproved tools are out of scope.
2. **Participant notice / consent satisfied.** Per §13
   notice / consent policy and applicable jurisdiction
   (two-party-consent vs one-party-consent overlay).
3. **Enterprise-owned device OR approved-app context.**
   Personal devices outside scope unless explicitly
   authorized by enterprise BYOD policy aligned with this
   ADR.
4. **Project / matter / client / action / hive scope
   exists.** Per ADR-0078 §6A.12 and §11 below; no scope →
   no capture.
5. **Business purpose exists.** Per §10 business-purpose
   binding policy; `UNKNOWN_BUSINESS_PURPOSE` does NOT
   constitute a valid business purpose for capture.
6. **Retention policy permits capture.** Per §14.
7. **Legal / compliance policy permits OR requires
   capture.** Per §15 + §22.
8. **Employee privacy policy does not exclude the
   context.** Per §7 personal-exclusion rules + applicable
   jurisdiction protected-class overlay.

Failure of any gate:

- capture MUST be blocked at the source-system boundary
- Foundation MUST NOT receive the transcript
- NO Layer 1 storage
- NO Layer 2 scoped reasoning
- NO Layer 3 signal generation
- NO Layer 4 drilldown

The future Stage 1 implementation MUST surface this as a
`canCaptureTranscript` service gate per §25.

## 6. Work-relevance classification policy

Every captured segment MUST receive a closed-vocab
`conversation_relevance_class` per ADR-0078 §6C.9.a (5
values: WORK_RELEVANT / MIXED_WORK_PERSONAL /
NON_WORK_PERSONAL / SENSITIVE_PERSONAL /
UNKNOWN_REQUIRES_REVIEW).

Policy:

- The classifier MUST be **biased toward privacy**.
- Uncertainty MUST default to `UNKNOWN_REQUIRES_REVIEW`.
- The classifier MUST NEVER default uncertain content to
  `WORK_RELEVANT`.
- `UNKNOWN_REQUIRES_REVIEW` MUST NOT flow to Agent
  Playground until reviewed AND approved.
- Classification MAY be per-conversation OR per-segment.
  Segment-level classification is REQUIRED for mixed
  conversations.
- The classifier output MUST be auditable.
- Classification MUST be re-applicable when an existing
  Layer 1 record is amended (correction trail per §23).

The future Stage 1 implementation MUST surface this as a
`classifyConversationRelevance` service gate per §25.

## 7. Personal / non-work exclusion policy

The following categories MUST NOT generate Agent Playground
signals AND MUST NOT be used for recommendations /
simulations / cockpit drilldown (default surfaces):

- personal family matters
- medical / health discussion
- romantic / sexual discussion
- private financial hardship
- religious / political personal discussion
- joking / banter unrelated to work
- lunch / social plans unless tied to a business purpose
- personal conflict unrelated to work
- casual venting not tied to a work action
- private employee emotional state
- psychological inference of any kind
- union / labor organizing OR legally protected
  collective-action activity where applicable
- ANY legally protected personal category OR activity
  (religion, national origin, age, disability, sex,
  pregnancy, sexual orientation, gender identity, etc.,
  per applicable jurisdiction's protected-class law)

Policy:

- Foundation MUST suppress these categories at the source-
  system boundary when possible.
- When source suppression is not possible and capture is
  otherwise authorized, Foundation MUST redact at Layer 1
  ingest per §16.
- These categories MUST NOT surface to managers.
- These categories MUST NOT be used for any scoring.
- These categories MUST NOT be summarized into employee
  intelligence.
- These categories MUST NOT be used for Agent Playground
  simulation OR recommendation.

## 8. Mixed conversation policy

For `MIXED_WORK_PERSONAL` classification (per §6):

- Isolate ONLY the work-relevant segment.
- Redact / suppress the personal segment per §16.
- Retain ONLY minimal safe metadata for the excluded
  segment if retention is required (e.g., legal hold).
- Generate signals ONLY from the work-relevant segment.
- If segment boundaries are unclear, reclassify as
  `UNKNOWN_REQUIRES_REVIEW`.
- Human / compliance review MUST occur before retention
  OR Agent Playground use of the reclassified segment.

## 9. Sensitive personal policy

For `SENSITIVE_PERSONAL` classification (per §6):

- MUST NOT surface in Agent Playground.
- MUST NOT generate `conversation_context_signals[]`.
- MUST NOT be exposed to managers.
- MUST NOT be used for scoring.
- MUST NOT be used for recommendations OR simulations.
- MAY be retained ONLY if legally required OR explicitly
  authorized by policy.
- If retained, MUST be legal / compliance scoped, MUST be
  non-indexable for product intelligence, AND MUST be
  blocked from normal product surfaces.
- Otherwise discard OR pseudonymize per retention /
  deletion policy (§14 + §17 + ADR-0033 cross-language
  audit chain + GDPR Article 17 alignment).

## 10. Business purpose binding policy

Every transcript record (Layer 1) AND every
`conversation_context_signal` (Layer 3) MUST bind to
exactly one `business_purpose_label` per ADR-0078 §6C.6 (11
values: PROJECT_CONTEXT / CLIENT_OR_CUSTOMER_WORK /
ACTION_RELATED / APPROVAL_RELATED / COMPLIANCE_REVIEW /
LEGAL_HOLD / INCIDENT_REVIEW / HIVE_OR_TEAM_COORDINATION /
SALES_OR_ACCOUNT_WORK / SUPPORT_CASE /
UNKNOWN_BUSINESS_PURPOSE).

Policy:

- `UNKNOWN_BUSINESS_PURPOSE` MUST block Agent Playground
  use until reclassified per §27.
- Business purpose MUST be auditable.
- Business purpose MUST be reviewable when changed
  (correction / amendment trail per §23).
- Business purpose MUST NOT be inferred from mere
  workplace presence (e.g., proximity to a work meeting
  does not establish business purpose for a personal
  side-conversation).
- Business purpose MUST bind to scope (§11).

## 11. Scope binding policy

Every transcript record AND every signal MUST bind to
exactly one `scope_binding_type` per ADR-0078 §6C.10 (9
values: SCENARIO_SCOPED / PROJECT_SCOPED / MATTER_SCOPED /
CLIENT_SCOPED / ACTION_SCOPED / HIVE_SCOPED / ORG_SCOPED /
LEGAL_HOLD_SCOPED / COMPLIANCE_REVIEW_SCOPED).

Policy:

- Scope binding is mandatory before retention.
- Scope binding is mandatory before signal generation.
- Scope binding MUST be re-checked at Layer 4 drilldown
  time (NEVER reused from a prior authorization snapshot).
- `ORG_SCOPED` MUST NOT become broad default access; it is
  the narrowest org-wide scope and STILL requires per-read
  authorization re-check at the service tier.
- `LEGAL_HOLD_SCOPED` and `COMPLIANCE_REVIEW_SCOPED` do
  NOT automatically make content usable in Agent
  Playground (see §27).

## 12. Four access tiers — never collapse

Per ADR-0078 §6B, ADR-0079 enforces four canonical access
tiers. These tiers MUST NEVER be equivalent.

### 12.1 Internal Enterprise Access

**Who.** Authorized same-org users with TAR / role /
project / hive / action scope authority.

**MAY see.**

- Layer 3 safe signals by default.
- Work-relevant transcript excerpts ONLY via Layer 4
  drilldown when explicitly authorized.

**MUST NOT see.**

- Raw transcript by default.
- Personal / sensitive segments.
- Privileged content unless separately authorized per §17.
- Unrelated project / matter / client content.

**Audit.** Standard access audit for drilldown / read,
purpose-bound, per §19.

**`policy_purpose` (§3.9 / ADR-0078).** `RECOMMENDATION_REVIEW`
/ `SIMULATION_REVIEW` / `GOVERNED_ACTION_REVIEW` /
`AUDIT_RECONSTRUCTION`.

### 12.2 Compliance / Legal Review Access

**Who.** Authorized compliance officers, legal counsel,
in-house policy reviewers, internal investigations under
elevated scope.

**MAY see.**

- Broader compliance / legal scoped transcript material.
- Redacted OR conditionally unredacted material depending
  on policy and privilege per §17.

**MUST NOT.**

- Access does NOT automatically expose content to managers.
- Access does NOT automatically allow Agent Playground use.
- Privileged content remains restricted per §17.

**Audit.** Enhanced (every Layer 1 read + Layer 4 drilldown
emits an audit row; reason-codes captured); jurisdiction-
aware overlay per ADR-0037.

**`policy_purpose`.** `COMPLIANCE_REVIEW` / `LEGAL_REVIEW` /
`AUDIT_RECONSTRUCTION`.

### 12.3 Regulator-Facing Evidence Package Access

**Who.** Regulator-facing package generator / authorized
compliance-legal operator; regulator only through approved
evidence packages.

**Policy.**

- NO live unbounded transcript drilldown for regulators.
- Export-only scoped evidence package.
- Minimum-necessary discipline (export ONLY excerpts the
  lawful basis covers; NEVER full transcripts unless basis
  explicitly authorizes).
- ADR-0036 LawfulBasis 9-condition gate MUST be satisfied.
- Regulator disclosure approval workflow REQUIRED.
- Dual-control per ADR-0026 RECOMMENDED for package
  generation / export at slice.
- NO "regulator approved" claim.
- NO legal certainty claim.

**Audit.** Maximum (package contents, purpose, lawful
basis, approval chain, timestamp, scope metadata); MUST
NEVER place raw transcript text in audit details.

**`policy_purpose`.** `REGULATOR_EVIDENCE_PACKAGE`.

### 12.4 External Third-Party Access

**Who.** Outside counsel, counterparties, auditors,
discovery recipients, contractual third parties where
authorized.

**Policy.**

- Explicit per-party authorization REQUIRED (captured at
  the service register; NEVER inferred from same-org TAR).
- Maximum redaction per §16.
- Maximum audit per §19.
- NO signal-generation capability.
- NO default access to raw transcript.
- NO broader access than the purpose allows.
- Speaker attribution MUST be per third-party
  authorization contract; typically pseudonymized unless
  attribution explicitly authorized.

**Audit.** Maximum — every Layer 1 read + every Layer 4
drilldown + every quote / excerpt event audited per §19 +
§20; custody chain recorded per §21.

## 13. Participant notice / consent policy

Policy:

- Notice / consent MUST be jurisdiction-aware (two-party-
  consent vs one-party-consent overlay per applicable law).
- Enterprise policy configurable per ADR-0037 jurisdiction
  tagging.
- Meeting / channel / workspace-level notice MUST be
  supported.
- Participant identity AND notice / consent state MUST be
  recorded if capture occurs.
- If notice / consent is missing where required, capture
  MUST be blocked per §5 gate 2.
- Notice / consent state is NOT a substitute for business
  purpose (§10).
- Notice / consent state is NOT a substitute for work
  relevance (§6).
- Consent revocation MUST be supported and propagate to
  derived signals per the retention / deletion policy
  (§14 + §17).

## 14. Retention policy

Per ADR-0078 §6C.10 retention classes:

- `EPHEMERAL_REVIEW_ONLY`
- `SCENARIO_CONTEXT_RETAINED`
- `ACTION_CONTEXT_RETAINED`
- `AUDIT_SAFE_METADATA_ONLY`
- `DEPERSONALIZED_IMPROVEMENT_SIGNAL`

Policy:

- Retention MUST bind to business purpose (§10) AND scope
  (§11).
- Legal hold (§15) overrides deletion / pseudonymization.
- Retention does NOT automatically authorize Agent
  Playground use (§27).
- Personal / sensitive content (§9) MAY be retained ONLY
  if legally required OR policy-authorized.
- Non-indexable retention mode MUST exist for
  legal / compliance-only content.
- Deletion OR pseudonymization MUST be supported where
  legally allowed (aligned with ADR-0033 cross-language
  audit chain + GDPR Article 17 right-to-erasure).
- Retention schedules MUST be jurisdiction-aware (HIPAA /
  FERPA / FedRAMP / GDPR / etc.).

## 15. Legal hold policy

Policy:

- Place / release of legal hold REQUIRES explicit
  authority.
- Dual-control per ADR-0026 SHOULD be applied to legal-
  hold place / release at the implementation slice.
- Legal hold MUST lock deletion / pseudonymization until
  released.
- Legal hold MUST NOT automatically expose content to
  Agent Playground.
- Legal hold MUST NOT automatically expose content to
  managers.
- Legal hold scope MUST be explicit (matter / project /
  individual / date range / etc.).
- Legal-hold place / release / scope-change events MUST
  be audited per §19.

## 16. Redaction policy

Policy:

- Personal redaction (§7 categories) MUST apply at ingest.
- Privileged redaction (§17) MUST apply at ingest unless
  privileged-tier access lifted per §17.
- Client / customer confidential redaction (§18) MUST
  apply at ingest unless scope-narrow access authorized.
- Speaker pseudonymization MUST be supported per ADR-0078
  §3.8 `FULL_REDACTION_APPLIED_NAME_PSEUDONYMIZED`.
- Protected-class redaction MUST apply where legally /
  policy-required per applicable jurisdiction.
- Redaction lifting REQUIRES tier-appropriate authority
  (Internal Enterprise: NEVER except via §12.2
  Compliance / Legal tier; Regulator: ADR-0036 LawfulBasis
  gated; External Third-Party: NEVER).
- Redaction lifting MUST be audited per §19.
- Default product / API / UI surfaces MUST show only
  redacted safe signals per §26.
- Raw transcript on default surface is FORBIDDEN.

ADR-0078 §3.8 `redaction_status` (4 values) inherited:
NO_REDACTION_APPLIED / PARTIAL_REDACTION_APPLIED /
FULL_REDACTION_APPLIED_NAME_PSEUDONYMIZED /
LEGAL_HOLD_PROTECTS_REDACTION_LIFTING.

## 17. Privileged conversation handling

Policy:

- Attorney-client / work-product / in-house counsel /
  executive-session material is **privileged**.
- Privileged material MUST NOT be a default product
  surface.
- Privileged material is **compliance / legal tier
  only** (§12.2).
- Agent Playground MUST NOT use privileged content unless
  policy EXPLICITLY allows a safe Layer 3 signal AND the
  purpose is legal-or-compliance scoped.
- Privileged raw content MUST NOT be surfaced to ordinary
  internal-enterprise users.
- Privileged status MUST be auditable AND scope-bound.
- Privilege MUST be set at ingest OR via authoritative
  reclassification (audited per §19).

## 18. Client / customer confidential handling

Policy:

- Client / matter scoping REQUIRED (§11
  `CLIENT_SCOPED` / `MATTER_SCOPED`).
- Minimum-necessary access discipline.
- NO cross-client leakage.
- NO cross-matter leakage.
- External disclosure constraints honored.
- Regulator package constraints honored (§22).
- Quote / excerpt requires purpose AND authority (§20).
- Client / customer confidential content SHOULD favor
  redaction by default outside the narrow scope.

## 19. Transcript access audit

The future Stage 1 implementation MUST emit audit rows
for ALL of:

- read audit (Layer 1 read events)
- search audit (Layer 1 search events)
- quote audit (Layer 4 quote / excerpt events)
- export audit (Layer 1 → eDiscovery package generation)
- drilldown audit (Layer 4 drilldown read events)
- redaction-lift audit (per §16 lifting events)
- legal-hold audit (per §15 place / release / scope change)
- regulator-package audit (per §22 package generation)
- deletion / pseudonymization audit (per §14 + §17)

**Audit pattern.** ADR-0079 uses the existing
`ADMIN_ACTION + details.action` discriminator pattern
verbatim (ADR-0051 / ADR-0054 / ADR-0055 / ADR-0058 /
ADR-0072 / ADR-0073 / ADR-0074 / ADR-0075 / ADR-0076 /
ADR-0077 / ADR-0078 precedent). ADR-0079 introduces NO
new audit literal at the policy register.

Suggested future `details.action` discriminator values
(final at the Stage 1 implementation slice):

- `TRANSCRIPT_CAPTURE_BLOCKED`
- `TRANSCRIPT_CAPTURED`
- `TRANSCRIPT_READ`
- `TRANSCRIPT_SEARCHED`
- `TRANSCRIPT_QUOTED`
- `TRANSCRIPT_EXCERPT_DRILLDOWN_READ`
- `TRANSCRIPT_REDACTION_APPLIED`
- `TRANSCRIPT_REDACTION_LIFTED`
- `TRANSCRIPT_LEGAL_HOLD_PLACED`
- `TRANSCRIPT_LEGAL_HOLD_RELEASED`
- `TRANSCRIPT_EXPORTED`
- `TRANSCRIPT_REGULATOR_PACKAGE_GENERATED`
- `TRANSCRIPT_DELETED_PSEUDONYMIZED`
- `CONVERSATION_CONTEXT_SIGNALS_READ`
- `CONVERSATION_CONTEXT_SIGNAL_GENERATED`

**Audit content discipline.** Raw transcript text MUST
NEVER appear in audit details. Audit metadata MAY include:

- `transcript_id`
- `signal_id`
- `scope_id`
- `business_purpose_label`
- `policy_purpose`
- `actor_entity_id`
- `timestamp`
- `access_tier` (one of §12.1-4)
- `redaction_status`
- `legal_hold_state`
- `approval_chain_reference`
- `package_id` / `export_id`
- `excerpt_length` OR `excerpt_hash` if needed
- `lawful_basis_id` (for §12.3 regulator-tier)
- `jurisdiction` (per ADR-0037)

If the Stage 1 implementation determines an existing
discriminator name is insufficient and a new audit literal
is required, the implementation slice MUST stop and report
before adding. ADR-0079 does NOT pre-authorize any new
audit literal.

## 20. Quote / excerpt permission policy

Policy:

- Exact quotes MUST NOT appear on default surfaces.
- Exact quotes MAY appear ONLY in Layer 4 permissioned
  drilldown OR approved export / evidence package (§21).
- Quote requires explicit `policy_purpose` per ADR-0078
  §3.9.
- Quote requires tier-appropriate authority per §12.
- Quote requires scope re-check at quote time (NEVER
  reused snapshot).
- Quote requires redaction check (§16) at quote time.
- Quote requires audit (§19).
- Quote SHOULD carry source / timestamp metadata.
- Quote SHOULD avoid unnecessary personal content
  (minimum-necessary discipline).

## 21. Export / eDiscovery policy

Policy:

- Export REQUIRES legal / compliance authority.
- Export is scope-limited (per §11).
- Bulk export is FORBIDDEN without explicit authority.
- eDiscovery packages REQUIRE approval.
- Dual-control per ADR-0026 RECOMMENDED for export
  approval at the implementation slice.
- Package MUST preserve provenance (per ADR-0078 §4
  `transcript_hash`).
- Package MUST preserve correction / amendment trail
  (§23).
- Package MUST preserve retention / legal-hold state.
- Package MUST apply redaction policy (§16).
- Package MUST be audited (§19).
- NO default product export of transcripts.

## 22. Regulator disclosure policy

Policy:

- ADR-0036 LawfulBasis 9-condition gate MUST apply.
- Regulator evidence package ONLY (no live unbounded
  drilldown).
- Purpose-bound.
- Minimum-necessary discipline.
- Audited per §19.
- Approval-gated (dual-control per ADR-0026 RECOMMENDED).
- NO "regulator approved" claims at any surface.
- NO legal certainty claims at any surface.
- NO compliance certification claims unless separately
  authorized by lawful process.
- Exact transcripts MAY support evidence posture but do
  NOT themselves equal a legal conclusion.

**Neutral regulated-company framing** (per ADR-0070
regulator-ready doctrine inherited verbatim):

- regulatory exposure
- examination readiness
- enforcement risk
- supervisory evidence
- books-and-records compliance
- proactive disclosure
- regulator-ready transparency

**Avoid** charged terms (e.g., "regulator approved this",
"compliant", "no fine risk", "regulator gave us a pass").

## 23. Correction / amendment trail

Policy:

- Transcript correction (typos, mis-attribution, formal
  amendment) MUST be supported.
- Speaker correction MUST be supported.
- Source conflict (per §24) resolution MUST be supported.
- Amended transcripts MUST be versioned.
- Audit trail per §19 MUST capture every correction /
  amendment event.
- Corrections MUST NOT silently rewrite history;
  originals + every amendment preserved.
- Corrected transcripts MUST preserve original provenance
  (per ADR-0078 §4 `transcript_hash`).
- Amendment MAY update safe Layer 3 signals only through
  a governed reclassification process (§6 +
  classifier audit).

Ties to ADR-0055 (correction signal substrate) +
ADR-0058 (drift detection / coaching alignment) where
relevant.

## 24. Linkage policy

Policy for:

- **Meeting-to-Action linkage** — Layer 1 record MAY bind
  to a Section 2 Action per ADR-0057.
- **Meeting-to-Decision linkage** — Layer 1 record MAY
  bind to a Playground decision (scenario, candidate,
  branch, recommendation, governed transition).
- **Meeting-to-Project timeline linkage** — Layer 1 record
  MAY bind to a project / matter timeline for decision
  reconstruction.
- **Meeting-to-Scenario linkage** — Layer 1 record MAY
  bind to a Playground scenario (`SCENARIO_SCOPED`).
- **Meeting-to-Hive / team context linkage** — Layer 1
  record MAY bind to a Hive context per ADR-0059.
- **Meeting-to-Client / matter linkage** — Layer 1 record
  MAY bind to a client / matter where applicable.

Rules:

- NO linkage without business purpose (§10).
- NO linkage without scope (§11).
- Personal / sensitive excluded segments MUST NOT become
  linkage evidence for Agent Playground.
- Linkage MUST be auditable per §19.
- Linkage MUST NOT create manager surveillance.
- Linkage MUST NOT create employee scoring.
- Linkage MAY support project-timeline provenance AND
  decision reconstruction when authorized.

## 25. Service-tier contract

The future Stage 1 implementation MUST surface AT LEAST
the following service-tier gates. ADR-0079 locks the gate
set; the Stage 1 ADR locks the exact TypeScript / function
signatures.

For each gate, define:

- **Required inputs** (closed list)
- **Allowed outputs** (closed list)
- **Denial reason shape** (closed-vocab reason code)
- **Audit expectations** (which §19 audit event fires)
- **No-leak expectations** (which §26 forbidden-fields list
  applies)

### 25.1 `canCaptureTranscript`

**Inputs.**

- `actor_entity_id`
- `org_id`
- `source_type` (per ADR-0078 §3.3)
- `source_system`
- `meeting_id` / `session_id` / `channel_id`
- `participant_entity_ids`
- `business_purpose_label`
- `scope_binding_type`
- `conversation_relevance_class` (if pre-classified)
- `consent_notice_status`
- `jurisdiction` (per ADR-0037)

**Outputs.**

- `allowed` / `denied` / `requires_review`
- `capture_eligibility` (ADR-0078 §6C.9.b; one of 7)
- `reason_code` (closed-vocab)
- `required_redaction` (per §16)
- `required_approval` (per §15 / §17 / §18)
- `audit_required` (always true for gate evaluation)

**Audit.** Emits `TRANSCRIPT_CAPTURE_BLOCKED` or
`TRANSCRIPT_CAPTURED` (final discriminator at Stage 1).

### 25.2 `classifyConversationRelevance`

**Inputs.**

- Segment metadata (NEVER raw text in this ADR's API
  surface; Stage 1 implementation decides whether
  classification runs inside the listener boundary OR
  inside Foundation with the transcript already at Layer
  1 under §16 ingest redactions)
- `business_purpose_label`
- `scope_binding_type`

**Outputs.**

- `conversation_relevance_class` (ADR-0078 §6C.9.a; one
  of 5)
- `confidence_label` (ADR-0078 §3.2; one of 4)
- `personal_content_suppressed` (boolean)
- `requires_human_review` (boolean)

**Audit.** Optional at classification (the read /
generation events that consume the classification are
the audited surfaces per §19).

### 25.3 `canRetainTranscript`

**Inputs.**

- `transcript_id`
- `retention_class` (ADR-0078 §6C.10 / §14)
- `legal_hold_status`
- `business_purpose_label`
- `scope_binding_type`
- `jurisdiction`

**Outputs.**

- `allowed` / `denied` / `requires_review`
- `retention_expires_at` (when applicable)
- `non_indexable` (boolean; true for sensitive-personal-
  under-legal-hold per §9)

### 25.4 `canUseForAgentPlayground`

**Inputs.**

- `transcript_id` OR `signal_id`
- `conversation_relevance_class`
- `business_purpose_label`
- `agent_playground_use` (ADR-0078 §6C.9.c; one of 5)
- `policy_purpose` (ADR-0078 §3.9; one of 7)
- caller scope + actor

**Outputs.**

- `allowed` / `denied` / `requires_review`
- `reason_code`
- `product_surface_allowed` (`recommendation` /
  `simulation` / `governed_transition` /
  `compliance_review_only` / `blocked`)

### 25.5 `canDrillDownTranscript`

**Inputs.**

- `transcript_id`
- `excerpt_id` (when applicable)
- `actor_entity_id`
- `access_tier` (one of §12.1-4)
- `policy_purpose`
- `scope_binding_type`
- `redaction_status`

**Outputs.**

- `allowed` / `denied`
- `redaction_required` (boolean)
- `audit_required` (always true)
- `excerpt_scope` (the specific excerpt authorized; never
  full transcript by default)

**Audit.** Emits `TRANSCRIPT_EXCERPT_DRILLDOWN_READ`.

### 25.6 `canQuoteTranscript`

**Inputs.** Same as `canDrillDownTranscript` plus:

- `quote_purpose` (closed-vocab; intersects §3.9)
- `target_surface` (`evidence_package` /
  `compliance_report` / `regulator_package` /
  `governed_action_payload`)

**Outputs.**

- `allowed` / `denied`
- `redaction_status_at_quote`
- `audit_required` (always true)

**Audit.** Emits `TRANSCRIPT_QUOTED`.

### 25.7 `canExportTranscript`

**Inputs.**

- `transcript_id` OR `package_scope`
- `actor_entity_id`
- `access_tier`
- `policy_purpose`
- `redaction_policy`
- `approval_chain_reference`

**Outputs.**

- `allowed` / `denied` / `requires_approval`
- `package_id` (when allowed)
- `audit_required` (always true)
- `dual_control_required` (per ADR-0026)

**Audit.** Emits `TRANSCRIPT_EXPORTED`.

### 25.8 `canDiscloseToRegulator`

**Inputs.**

- `transcript_id` OR `package_id`
- `lawful_basis_id` (per ADR-0036)
- `jurisdiction` (per ADR-0037)
- `regulator_authority`
- `approval_chain_reference`

**Outputs.**

- `allowed` / `denied` / `requires_lawful_basis_review`
- `package_scope` (minimum-necessary)
- `audit_required` (always true; maximum-audit per §12.3)
- `dual_control_required` (per ADR-0026)

**Audit.** Emits `TRANSCRIPT_REGULATOR_PACKAGE_GENERATED`.

### 25.9 `canDeleteOrPseudonymizeTranscript`

**Inputs.**

- `transcript_id`
- `actor_entity_id`
- `legal_hold_status`
- `retention_class`
- `jurisdiction`
- `right_to_erasure_request_id` (if applicable; GDPR
  Article 17)

**Outputs.**

- `allowed` / `denied` (denied when legal hold active)
- `mode` (`hard_delete` / `pseudonymize` /
  `non_indexable_only`)
- `audit_required` (always true)

**Audit.** Emits `TRANSCRIPT_DELETED_PSEUDONYMIZED`.

Every gate above is **policy-only** at this ADR. The Stage
1 implementation ADR translates each gate into a concrete
TypeScript function + Prisma transaction boundary + audit
emission. The Stage 1 implementation MUST stop and report
if any gate cannot be satisfied with the existing audit
discriminator pattern.

## 26. Default no-leak doctrine

Default product / API / UI surfaces MUST NEVER expose any
of the following (inherits ADR-0078 §11 + §5.2 + §6C
forbidden-fields catalog verbatim):

- `raw_text`
- `transcript`
- `message_body`
- `speaker_quote`
- `private_note`
- `prompt`
- `chain_of_thought`
- `embedding`
- `vector`
- `content_hash`
- `storage_location`
- `bridge_id`
- `secret_ref`
- `connector_payload`
- `raw_audio`
- `raw_video`
- `raw_screen_capture`
- `emotion_score`
- `sentiment_score`
- `employee_score`
- `manager_score`
- `psychological_profile`
- `compliance_certification`
- `legal_conclusion`
- `regulator_approval`

**Important.** These are forbidden DEFAULT-SURFACE fields.
Layer 1 source records MAY exist under governance per §5
+ §14; authorized Layer 4 drilldown per §12 + §20 MAY
render excerpts / quotes / speaker / timestamps under
permission + purpose + audit + redaction. The forbidden
list applies to **default response surfaces only**, not
to the source-of-truth or governed-drilldown layers
operating under the §25 service gates.

The Stage 1 implementation MUST include a no-leak guard
test asserting every forbidden token against an adversarial
fixture rendered through every non-Layer-4 surface (Wave 7
response, Wave 9 response, Wave 10 cockpit default render,
audit details payload).

## 27. Agent Playground use policy

Agent Playground MAY consume signals ONLY when ALL of:

- `conversation_relevance_class` ∈ {`WORK_RELEVANT`,
  approved `MIXED_WORK_PERSONAL` after redaction per §8}
- `business_purpose_label` ≠ `UNKNOWN_BUSINESS_PURPOSE`
- `agent_playground_use` ∈ {`ALLOWED_FOR_SIGNALS`,
  `ALLOWED_AFTER_REDACTION`, `LEGAL_COMPLIANCE_ONLY`
  (only for compliance-tier surfaces per §12.2)}
- `capture_eligibility` ∈ {`CAPTURE_ALLOWED`,
  `CAPTURE_ALLOWED_WITH_REDACTION`,
  `CAPTURE_REQUIRED_BY_LEGAL_HOLD`}
- `scope_binding_type` is set (NEVER null)

Agent Playground MUST NEVER consume:

- `NON_WORK_PERSONAL`
- `SENSITIVE_PERSONAL`
- `UNKNOWN_REQUIRES_REVIEW` (unless reviewed AND approved)
- Privileged raw material unless explicitly legal /
  compliance scoped AND safely projected
- Personal / sensitive segments retained only for legal
  hold (§9 + §15)
- Manager surveillance signals (FORBIDDEN at every layer)
- Employee scoring signals (FORBIDDEN at every layer)
- Psychological-profile signals (FORBIDDEN at every layer)

The future Stage 4 Wave 7 / Wave 9 / Wave 10 amendments
MUST enforce this policy at the response-tier and CT-tier
guards.

## 28. Control Tower / cockpit policy

Policy:

- Control Tower default cockpit MUST show safe signals,
  NOT raw transcript.
- Layer 4 drilldown REQUIRES explicit user gesture.
- Drilldown MUST re-check access at time of access (per
  §25.5).
- Drilldown MUST show ONLY the work-relevant excerpt
  where authorized.
- Drilldown MUST show redaction state (§16), business
  purpose (§10), policy purpose (§3.9 ADR-0078), audit
  state (§19), AND retention / legal-hold state (§14 +
  §15) where applicable.
- NO raw transcript panel by default.
- NO "manager monitoring" framing.
- NO "employee score" framing.
- NO "AI decided" framing.
- NO legal / compliance certainty framing.
- ADR-0077 §8 four honesty postures (hierarchy /
  conversation-context / evidence-posture / execution-
  boundary) preserved verbatim across the new substrate.
- ADR-0077 §4 forbidden-UI-copy + §13 no-leak +
  §10 no-Execute-button guards preserved verbatim.

## 29. Implementation ladder mapping

ADR-0079 unblocks future ADR-0078 stages as follows.

### Stage 1 — Layer 1 schema + Layer 3 helper + Layer 4 read service

- **Cannot fire until ADR-0079 lands.** ← This ADR.
- Future implementation MUST enforce every §5–§28 policy
  gate at the service tier via the §25 service-tier
  contract.
- Stage 1 ADR translates §25 gates into TypeScript
  function signatures + Prisma transactions + audit
  emissions.
- Stage 1 implementation MUST include no-leak guard tests
  enforcing §26 across every non-Layer-4 surface.

### Stage 2 — Approved-source projection (no listener yet)

- MAY use existing LIVE safe sources (`CORRECTION_SIGNAL`
  per ADR-0055 + ADR-0058; `ACTION_HISTORY` per ADR-0057;
  `HIVE_CONTEXT` per ADR-0059 + ADR-0063;
  `MANUAL_USER_INPUT` per ADR-0065).
- NO raw transcript ingestion required.
- Signal-shape MUST still carry ADR-0078 §6C.12 additive
  fields verbatim.
- May land BEFORE Stage 1 if no Layer 1 / Layer 4 is
  exposed; Stage 1 then layers Layer 1 + Layer 4 on top.
- **Recommended next slice after ADR-0079** (see §31).

### Stage 3 — Governed listener output

- REQUIRES Stage 1 substrate + Stage 2 patterns + this
  ADR's policy + ADR-0078 §6 / §6A / §6B / §6C
  enforcement at the listener-source ingest tier.
- REQUIRES ADR-0069 §6 8-question architecture check
  applied to the listener engine register.
- Source-side transcript ingestion MAY use BEAM supervised
  processes per ADR-0028 if substrate-honest pre-flight
  yields BEAM register.

### Stage 4 — Agent Playground response integration

- Wave 7 + Wave 9 + Wave 10 amendments per ADR-0078
  §8 / §9 / §5.
- Wave 10 cockpit replaces ADR-0077 §8.2 "not available"
  placeholder.

### Stage 5 — Hierarchy + organizational graph integration

- Forward-substrate; each requires its own ADR.

## 30. Stop conditions for future implementation

Future implementation MUST stop and report (NOT silently
proceed) if any of:

- Raw transcripts would be exposed by default at any
  non-Layer-4 surface.
- Personal / sensitive content could flow to Agent
  Playground.
- `UNKNOWN_BUSINESS_PURPOSE` could flow to Agent
  Playground.
- `UNKNOWN_REQUIRES_REVIEW` could flow to Agent
  Playground without explicit review.
- The four access tiers collapse OR become equivalent.
- Regulator access bypasses ADR-0036 LawfulBasis.
- Legal hold bypasses authorization.
- Redaction lifting is unaudited.
- Quote / excerpt appears without permission / audit.
- Manager surveillance framing appears.
- Employee scoring framing appears.
- Psychological profiling appears.
- Legal / compliance certainty framing appears.
- Regulator approval claim framing appears.
- Action execution / autonomy is added.
- Connector invocation is added.
- LLM-generated uncontrolled signal text is added.
- Chain-of-thought / private reasoning is exposed.
- Cross-org / cross-client / cross-matter leakage is
  possible.

## 31. Consequences

### Positive

- Permits exact transcripts as governed enterprise
  evidence.
- Protects enterprise accuracy and recall.
- Supports regulator-ready evidence packages (§22 +
  ADR-0036 + ADR-0070).
- Supports project-timeline and decision reconstruction
  (§24).
- Blocks personal life from becoming enterprise
  intelligence (§5 + §6 + §7 + §9).
- Preserves Agent Playground usefulness without
  surveillance (§27).
- Creates a clear service-tier contract for Stage 1
  implementation (§25).

### Tradeoffs

- Slower than jumping straight to schema / listeners.
- Requires more policy enforcement at the service tier.
- Adds review states (`UNKNOWN_REQUIRES_REVIEW` /
  `CAPTURE_REQUIRES_REVIEW` / etc.).
- MAY block some ambiguous conversations until reviewed
  (intentional privacy bias per §6).
- Requires strong redaction (§16) and audit (§19)
  discipline at every Stage 1+ slice.

## 32. Citations / relationships

- Cites ADR-0078 as the parent conversation substrate ADR
  (load-bearing; ADR-0079 turns ADR-0078 §6 / §6A / §6B /
  §6C into enforceable policy + service-tier gates).
- Cites ADR-0052 for Otzar DGI doctrine + build-order
  step 4 (transcript ownership / retention / scope policy
  prerequisite — now satisfied by ADR-0079).
- Cites ADR-0054 for conversation lookback (existing
  `OtzarConversation` substrate; no transcript text).
- Cites ADR-0055 for correction-conversation linkage
  (LIVE source for Stage 2 `CORRECTION_SIGNAL`).
- Cites ADR-0058 for drift / correction signal substrate
  (LIVE source for Stage 2 + correction trail per §23).
- Cites ADR-0076 for Wave 9 simulation attachment point
  (Stage 4 sidecar landing per ADR-0078 §9).
- Cites ADR-0077 for Wave 10 Control Tower honesty +
  cockpit placeholder (Stage 4 sidecar landing per
  ADR-0078 §5; §28 inherits ADR-0077 §8 four honesty
  postures).
- Cites ADR-0036 for LawfulBasis 9-condition gate
  (§22 regulator disclosure).
- Cites ADR-0037 for jurisdiction tagging (§13 + §14 +
  §16 jurisdiction overlays).
- Cites ADR-0026 for dual-control middleware pattern
  (§15 legal-hold + §21 export + §22 regulator-package
  approval workflows).
- Cites ADR-0070 for regulator-ready posture (§22
  neutral-compliance-vocabulary preserved verbatim).
- Cites ADR-0019 for cryptographic-suite posture (Layer 1
  `transcript_text_encrypted` at rest per ADR-0078 §4).
- Cites ADR-0033 for cross-language audit chain +
  pseudonymization / forgetting semantics (§14 + §17 +
  GDPR Article 17 alignment).
- Cites ADR-0028 for BEAM coordination layer + ADR-0069
  for BEAM substrate-coherence law (Stage 3 governed
  listener engine register).
- Cites RULE 0, RULE 4, RULE 9, RULE 12, RULE 13, RULE
  14, RULE 18, RULE 19, RULE 20, RULE 21.

## 33. Founder authorization

Per RULE 20: this ADR + bidirectional back-citations + the
`architecture/README.md` catalog entry + ADR-0078 forward-
substrate closeout line + Section 5 build-state doc update
+ `NEXT_ACTION.md` baton update land under explicit Founder
authorization at
`[FOUNDER-ADR-0079-TRANSCRIPT-SUBSTRATE-POLICY-ADR-AUTH]`
2026-05-31.

Status: **Accepted 2026-05-31**. ADR-only — every
implementation stage (ADR-0078 §7 Stage 1 through Stage 5)
requires separate Founder authorization at slice. ADR-0079
is the load-bearing policy prerequisite for Stage 1+ that
ADR-0078 §6C.13 anticipated; with ADR-0079 LANDED, Stage 1+
is policy-unblocked but remains implementation-gated by
separate Founder authorization.

## 34. Forward-substrate closeout — Stage 2 conformance

**ADR-0078 Stage 2 approved-source projection LANDED
2026-06-01** at `[ADR-0078-STAGE-2-APPROVED-SOURCE-PROJECTION]`
conforms to this ADR's policy register as follows.

§19 audit posture conformed verbatim: ZERO new audit literal;
existing `ADMIN_ACTION + details.action =
"PLAYGROUND_BEST_PATH_RECOMMENDED"` (Wave 7) +
`"PLAYGROUND_SIMULATION_EXECUTED"` (Wave 9) extended with
safe metadata only (`conversation_context_signals_count` +
de-duped `conversation_context_signal_sources` list); NEVER
raw `safe_summary` text, NEVER raw transcript text, NEVER
unredacted speaker quotes.

§26 forbidden default-surface fields conformed verbatim: no
raw_text / message_body / speaker_quote / private_note /
raw_audio / raw_video / raw_screen_capture / emotion_score /
sentiment_score / employee_score / manager_score /
psychological_profile / compliance_certification /
legal_conclusion / regulator_approval / related_transcript_ref
/ transcript_id / transcript_hash / transcript_text_encrypted
surface on Wave 7 or Wave 9 response bodies — enforced by
the no-leak guard tests added at Stage 2.

§27 Agent Playground use policy conformed verbatim: the
projection service register enforces every blocking rule by
construction. `NON_WORK_PERSONAL` / `SENSITIVE_PERSONAL` /
`UNKNOWN_REQUIRES_REVIEW` (without explicit review) /
`UNKNOWN_BUSINESS_PURPOSE` / `BLOCKED_FROM_AGENT_PLAYGROUND`
/ `REQUIRES_HUMAN_REVIEW` / unset `scope_binding_type` can
never reach the response surface. Tested per-discriminator
on the Wave 7 + Wave 9 sidecar fields.

§29.2 Stage 2 ladder conformed verbatim: Stage 2 uses ONLY
LIVE Foundation sources (CORRECTION_SIGNAL per ADR-0055 +
ADR-0058; ACTION_HISTORY per ADR-0057; HIVE_CONTEXT per
ADR-0059 + ADR-0063 — enum-preserved zero-output; MANUAL_USER_INPUT
per ADR-0065). NO raw transcript ingestion was added.
Signal-shape carries ADR-0078 §6C.12 8 additive fields
verbatim on every emitted signal. Stage 2 landed BEFORE
Stage 1 per §29.2 line 1132.

§28 Control Tower cockpit policy preserved verbatim:
Foundation Stage 2 added NO Control Tower code. The CT
cockpit at `/agent-playground` continues to render the
ADR-0077 §8.2 "Conversation context signals not available
in this version" placeholder until a separate Founder-
authorized CT consumption slice replaces it with safe Layer
3 signals.

Bidirectional back-citation per RULE 14 + RULE 20.
