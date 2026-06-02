# ADR-0087 — Hive Intelligence Runtime

**Status:** Accepted 2026-06-02

**Authorization:** `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]` per RULE 20.

## Context

The Founder-direction Living Enterprise Intelligence (LEI) sequence names **Hive Intelligence Runtime** as the next substrate after W5 Action Promotion Runtime (ADR-0086 LIVE PR #222 `7e2e0df`). The doctrine: move enterprise intelligence from individual scope to team/org scope so coordination-tier signals — recurring blockers, approval bottlenecks, cross-team dependency risk, project drift, communication breakdowns, repeated commitments, stalled follow-ups, operational friction, launch risks — surface in a governed read-only way.

Strict bans (Founder direction; reinforced by ADR-0059 §3.e + ADR-0061 §1.a + ADR-0052 §8):

- no employee scoring
- no productivity scoring
- no manager surveillance
- no psychological profiling
- no protected-attribute inference
- no private memory exposure
- no health inference
- no political inference
- no relationship inference

Allowed:

- team-level blockers
- project-level risk
- workflow bottlenecks
- approval bottlenecks
- organizational dependencies
- aggregate coordination intelligence
- governance-safe recommendations
- proposed actions routed through W5 (per ADR-0086)

Substrate already LIVE:

- **Section 3 Hive substrate** (ADR-0059/0062/0063/0064) — Hive + HiveMembership models + `apps/api/src/services/hive/` + 5 HIVE_* audit literals + Wave 4 governance-terms evaluator + Wave 5 producer-only event bus. Same-org boundary absolute per ADR-0059 §3.
- **Section 6 Enterprise Analytics** (ADR-0061) — `apps/api/src/services/analytics/analytics.service.ts` with 6 LIVE aggregates: `CORRECTION_VELOCITY_7D`, `ACTION_RUNTIME_SUCCESS_RATE`, `ACTION_RUNTIME_BY_ACTION_TYPE`, `COMPLIANCE_POSTURE`, `CONNECTOR_ACTIVITY`, `HIVE_PARTICIPATION`. All routes bearer + `can_admin_org`. k=5 minimum-population gate. Closed-vocab labels. SAFE projection. No new audit literal across any wave — `ADMIN_ACTION + details.action = "ANALYTICS_READ"` discriminator pattern.
- **W5 Action Promotion Runtime** (ADR-0086) — the governed bridge that translates a W4 catalog entry into a Section 2 Action; emits `PROPOSED_ACTION_REFERENCED`.
- **W4 `HIVE_COORDINATOR` actor role** — `proposed-action.cross-functional-blocker-escalation.enterprise.v1` already authored (INTERNAL_ONLY + safe_field_set: `blocker_category_label`, `affected_team_count`, `escalation_path_summary`, `due_window_days`; forbidden_field_set explicitly bans `individual_employee_blame_inference`, `manager_surveillance_data`, `team_member_scoring`, `raw_slack_messages`).

**The gap this ADR closes:** the Section 6 substrate canonicalizes the SAFE org-aggregate projection technique, but it was framed at the analytics register (read-only enterprise analytics for admins). The Founder's framing names a distinct register: **Hive Intelligence Runtime** as the team/org-tier coordination-intelligence substrate. The two registers share the same technique (k≥5, closed-vocab, no per-entity attribution, ADMIN_ACTION audit emission) but differ in intent: analytics surfaces enterprise health metrics; Hive Intelligence Runtime surfaces team-coordination signals that the org can act on (via W5 promotion) without surveillance or scoring.

## Decision

### 1. Hive Intelligence Runtime is a SUBSTRATE LAYER, not a new service

Hive Intelligence Runtime composes the existing Section 6 SAFE projection technique (ADR-0061) + Section 3 Hive substrate (ADR-0059) + W5 promotion path (ADR-0086). It does NOT introduce a new service class at this slice. Aggregates that fit the Hive Intelligence Runtime register land as additional methods on `AnalyticsService` (mirrors the established pattern; six aggregates already live there). The slice canonicalizes the *register framing*; the implementation tier reuses Section 6 substrate verbatim.

A future Founder-authorized slice may extract a dedicated `HiveIntelligenceService` if the aggregate count grows beyond ~10 or if Hive Intelligence-specific cross-cutting concerns (Phoenix.PubSub fanout, BEAM coordination via ADR-0028, Twin-to-Twin proactive coordination) warrant an independent surface.

### 2. Allowed signal classes (closed-vocab register)

Hive Intelligence Runtime signals MUST be one of:

- **Coordination-friction signal** — counts of substrate that quantifies whether the org is moving smoothly (approval backlog, stalled proposals, escalation-resolution latency labels, cross-team-dependency flag counts)
- **Team-engagement signal** — counts of substrate that quantifies whether teams are participating in shared intelligence (hive participation — LIVE; cross-functional capsule contribution counts; multi-team meeting follow-up counts)
- **Workflow-health signal** — counts of substrate that quantifies whether workflows complete (success rates — LIVE; per-archetype proposal-to-promotion conversion counts; recurring-blocker-topic counts via PROPOSED_ACTION_REFERENCED catalog frequency)
- **Connector-friction signal** — counts that quantify external-system coordination overhead (connector activity — LIVE; per-vendor failure-rate labels)
- **Project-drift signal** — counts of substrate that quantifies whether commitments are moving (proposal age distribution at PROPOSED state; stalled-action counts at expired state)

Each signal MUST:

- be aggregated at the org tier (NEVER per-person, per-team, per-manager)
- pass the k=5 minimum-population gate from ADR-0061 (redacted projection when below)
- emit `ADMIN_ACTION + details.action = "ANALYTICS_READ"` audit on every read (no new audit literal)
- carry a closed-vocab `signal_label` (never a numeric score the operator could interpret as an employee rank)
- carry an `honest_note` per ADR-0061 §1.a that names what the signal IS and is NOT

### 3. V1 canonical signal: APPROVAL_BACKLOG

The first Hive Intelligence Runtime signal landed by this ADR is **APPROVAL_BACKLOG** — a SAFE projection of `EscalationRequest` rows over a window, scoped same-org by joining `EscalationRequest.source_entity_id` against `EntityMembership.child_id` for the caller's org.

Aggregate fields (closed-vocab, SAFE):

- `aggregate: "APPROVAL_BACKLOG"`
- `window_days: number` (clamped 1..30; default 7)
- `org_entity_id: string`
- `member_count: number`
- `redacted: boolean`
- `pending_count: number | null` (count of EscalationRequest rows with status=PENDING in window)
- `total_count: number | null` (count of EscalationRequest rows in window regardless of status)
- `pending_rate: number | null` (pending_count / total_count when total_count > 0)
- `signal_label: ApprovalBacklogLabel` (one of: `HIGH_BACKLOG` / `MODERATE_BACKLOG` / `LIGHT_BACKLOG` / `NO_BACKLOG` / `NO_ESCALATIONS` / `INSUFFICIENT_POPULATION`)
- `honest_note: string`

Closed-vocab label thresholds (frozen anchor):

- `HIGH_BACKLOG` — `pending_rate >= 0.5`
- `MODERATE_BACKLOG` — `0.2 <= pending_rate < 0.5`
- `LIGHT_BACKLOG` — `0 < pending_rate < 0.2`
- `NO_BACKLOG` — `total_count > 0 AND pending_count == 0`
- `NO_ESCALATIONS` — `total_count == 0`
- `INSUFFICIENT_POPULATION` — `member_count < 5`

**Forbidden response fields** (assertion-locked in tests): `escalation_id`, `source_entity_id`, `target_entity_id`, `resolved_by_entity_id`, `description` text, `severity`, `escalation_type`, `resolution_metadata`, `created_at`, any per-actor attribution, any per-escalation row.

**Forbidden audit details** (assertion-locked): same as above plus raw escalation contents.

### 4. Route binding

NEW `POST /api/v1/analytics/approval-backlog` — bearer + `can_admin_org` preHandler (mirrors the 6 LIVE analytics routes verbatim). Body: `{ window_days?: number }` (clamped at the service tier per ADR-0061 §1.a).

### 5. No new audit literal

`APPROVAL_BACKLOG` audit emission rides the existing `ADMIN_ACTION + details.action = "ANALYTICS_READ"` discriminator pattern that all 6 LIVE Section 6 aggregates use (audit.ts:1467-1488). No `AUDIT_EVENT_TYPE_VALUES` extension. No ADR-0042 §Q-γ.1 clean-transition addition. No ADR-0002 amendment.

### 6. No new schema model

`EscalationRequest` already exists (schema.prisma:1276+). `EntityMembership` already exists. The aggregate is a read-time projection over existing tables.

### 7. RULE 0 sovereignty preserved

Same-org boundary enforced at the query tier (`EntityMembership.parent_id = orgEntityId` + `is_active = true`). No cross-org escalation visibility. Caller's `can_admin_org` capability is the auth tier; cross-org escalations from a platform-tier source would not surface to org admins per the same join.

### 8. No autonomous external execution

The signal is read-only at the org-admin surface. Acting on the signal (e.g., proposing an escalation-clearance plan) flows through W5 Action Promotion Runtime per ADR-0086 — the operator promotes a W4 proposed-action entry; the runtime emits `PROPOSED_ACTION_REFERENCED`; Section 2 governs execution. Hive Intelligence Runtime never bypasses W5, never bypasses Section 2, never invokes a connector write.

### 9. Forward queue

Future signals canonically named (each requires per-slice Founder authorization to implement):

- `STALLED_PROPOSALS_7D` — count of Section 2 Action rows in PROPOSED state with `created_at` older than the window; signal_label = `HIGH_STALL_RATE` / `MODERATE_STALL_RATE` / `LIGHT_STALL_RATE` / `NO_STALLS`
- `RECURRING_BLOCKER_TOPICS_30D` — count of PROPOSED_ACTION_REFERENCED audit emissions grouped by `details.catalog_id` over 30 days; surface top-3 catalog_id labels with their counts (catalog id is intentional, not sensitive); signal_label = `BLOCKER_PATTERN_DETECTED` / `NO_RECURRING_PATTERN`
- `CROSS_TEAM_DEPENDENCY_HIVE_RATIO` — ratio of multi-hive members (members of ≥2 same-org Hives) to total org members; signal_label = `BROAD_CROSS_TEAM_NETWORK` / `MODERATE_CROSS_TEAM_NETWORK` / `LIMITED_CROSS_TEAM_NETWORK`
- `CONNECTOR_FRICTION_BY_VENDOR_7D` — per-connector-type failure-rate label across same-org `INVOKE_CONNECTOR` ActionAttempts; closed-vocab labels mirroring the LIVE connector-activity aggregate
- `PROPOSAL_PROMOTION_CONVERSION_RATE_7D` — ratio of PROPOSED_ACTION_REFERENCED count / `ANALYTICS_READ` count of proposed-action browse reads (when that browse route lands); operational signal for "is the W5 substrate being adopted?"

Each future signal MUST follow the §2 closed-vocab register and the §5 no-new-audit-literal rule unless a separate Founder authorization explicitly amends.

### 10. CT consumer surface NOT in this slice

Per ADR-0077 §8.4 Foundation-first cadence: the W5 backend lands first; the CT consumer surface for Hive Intelligence Runtime signals is forward-substrate to a separate Founder-authorized slice. Today's CT `/analytics` page (LIVE) consumes 5 of 6 Section 6 aggregates; extending it for the APPROVAL_BACKLOG signal + future Hive Intelligence Runtime signals is a CT slice, not this slice.

### 11. Test scenarios (mandatory)

- Happy path: org with 5+ members + ≥1 EscalationRequest in window → emits ANALYTICS_READ + returns SAFE projection with the closed-vocab label
- Threshold boundaries: pending_rate = 0.5 → `HIGH_BACKLOG`; 0.2 → `MODERATE_BACKLOG`; 0.01 → `LIGHT_BACKLOG`; pending=0 total>0 → `NO_BACKLOG`; total=0 → `NO_ESCALATIONS`
- k=5 gate: org with <5 members → INSUFFICIENT_POPULATION + redacted = true + every numeric field null
- Cross-org isolation: EscalationRequest from a different org's source_entity_id is excluded from the count
- Window clamping: window_days = 0 → 422 INVALID_REQUEST; window_days = 31 → 422; window_days = -1 → 422; window_days missing → defaults to 7
- No-leak: response body and audit details never contain raw EscalationRequest fields (escalation_id, source_entity_id, target_entity_id, resolved_by_entity_id, description, severity, escalation_type, resolution_metadata)
- Audit ip_address forwarding: `ip_address` from request.ip surfaces in the audit row

## Consequences

**Positive.**

- The Hive Intelligence Runtime register is named + scoped + bounded at the doctrine tier. Each future coordination-tier signal lands as an additive Section 6-pattern aggregate; the forward queue is enumerated.
- The first Founder-named intelligence type (approval bottlenecks) gets a production-grade governed signal that admins can read without exposing per-actor attribution or surveillance.
- Zero new audit literal; zero new schema model; zero new dependency. Minimum-touch additive slice.
- W5 composition path is canonical: operators read the Hive Intelligence Runtime signal, decide whether to promote a related W4 proposed action, and Section 2 governs execution. No bypass paths.

**Negative.**

- The implementation lives in `AnalyticsService` rather than a dedicated `HiveIntelligenceService`. The class is growing; an extraction is forward-substrate when warranted by aggregate count or cross-cutting concerns.
- The k=5 gate is per-org (members), not per-signal. Some signals (e.g., RECURRING_BLOCKER_TOPICS_30D) may want a per-signal minimum volume threshold; deferred to per-signal QLOCK.

**Forward-substrate (NOT authorized by this ADR).**

- Extracted `HiveIntelligenceService` (when warranted).
- Phoenix.PubSub fanout for live signal updates (ADR-0028 BEAM coordination; ADR-0039 forward queue).
- Twin-to-Twin proactive coordination consuming Hive Intelligence Runtime signals (ADR-0052 §8; Founder-gated).
- Hive-coordinator-initiated W5 promotion bundles (multi-action promotion from a single coordination signal; Founder-gated).
- All Forward queue §9 signals beyond APPROVAL_BACKLOG.
- CT `/analytics` extension for APPROVAL_BACKLOG + future Hive Intelligence Runtime signals.
- BEAM ActorRouter for per-hive signal aggregation (operational-signal gated per ADR-0017).

## Alternatives

**Alternative A: New `HiveIntelligenceService` class at V1.** Rejected because one signal does not warrant a new service class. The Section 6 substrate already canonicalizes the SAFE pattern; extending it is the lowest-cost path. Forward-substrate when the count or cross-cutting concerns warrant.

**Alternative B: New top-level audit literal `HIVE_INTELLIGENCE_READ`.** Rejected because the existing `ADMIN_ACTION + details.action = "ANALYTICS_READ"` discriminator pattern is canonical across all 6 LIVE Section 6 aggregates. Adding a parallel literal would fragment the audit query surface and require an audit.ts amendment. Minimum-touch principle applies.

**Alternative C: Make APPROVAL_BACKLOG a windowed Hive-Membership aggregate (count Hive escalations) rather than EscalationRequest aggregate.** Rejected because EscalationRequest is the canonical approval-flow substrate (dual-control + ADR-0026). Hive escalations are a subset; the org-tier approval bottleneck signal must include all EscalationRequests where the source is an org member regardless of whether a Hive was involved.

**Alternative D: Include severity / escalation_type in the response.** Rejected because both fields could combine to re-identify a specific escalation in a small org. The SAFE projection rule per ADR-0061 §1.a is closed-vocab labels only; including severity or escalation_type would broaden the surface beyond the canonical SAFE invariant.

## Patent-implementation evidence

Per ADR-0020 two-register IP discipline, ADR-0087 advances the patent-implementation evidence trail by canonicalizing the **governed team/org-tier coordination intelligence layer** at the substrate-architectural register. The bridge is what makes the Foundation's claim to "no manager surveillance + no employee scoring + same-org sovereignty + governed-bridge-to-execution" implementable at the team-coordination tier — Hive Intelligence Runtime signals surface aggregate coordination friction the org can act on without identifying any individual contributor. The cryptographically-timestamped W5+W6 commit lineage joins the patent-implementation evidence trail for US 12,517,919 + US 12,164,537 + US 12,399,904.

## RULE references

RULE 0 (humans always sovereign) + RULE 4 (audit chain integrity) + RULE 9 (modular service-tier connections) + RULE 10 (no row deletion; preserved) + RULE 13 (substrate-honest pre-flight; embedded above) + RULE 16 (no console.* in apps/api/src) + RULE 20 (Founder-only RULE/ADR modification; this ADR lands per `[FOUNDER-AUTH — W5 + LIVING ENTERPRISE INTELLIGENCE AUTONOMOUS BUILD]`) + RULE 21 (substrate-architectural research arc; embedded above as the substrate-truth survey).

## Cross-references

ADR-0002 (audit chain; preserved) ·
ADR-0017 (Production Discipline; operational-signal-gated future HiveIntelligenceService extraction) ·
ADR-0020 (two-register IP discipline) ·
ADR-0026 (dual-control; preserved — Hive Intelligence Runtime never escalates without ADR-0026 path) ·
ADR-0042 §Q-γ.1 (clean-transition; not used at V1 because no new audit literal) ·
ADR-0052 §8 (Otzar DGI doctrine; scoped Twin-to-Twin coordination — forward-substrate) ·
ADR-0057 (Section 2 Action runtime; preserved as the execution authority) ·
ADR-0058 (no-manager-surveillance + no-employee-scoring discipline) ·
ADR-0059 (Section 3 Hives v1; preserved; same-org boundary) ·
ADR-0061 (Section 6 Enterprise Analytics SAFE projection pattern; Hive Intelligence Runtime composes this) ·
ADR-0070 (Regulator-Ready doctrine; preserved) ·
ADR-0077 §8.4 (Foundation-first cadence; CT surface forward-substrate) ·
ADR-0081 §2.2 (W4 Proposed Action substrate; Hive Intelligence Runtime signals inform which W4 proposals to promote) ·
ADR-0086 (W5 Action Promotion Runtime; the governed bridge a Hive Intelligence Runtime signal can route through).
