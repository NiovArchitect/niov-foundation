# Glossary

Foundation-specific terminology, alphabetized. Every entry has a
1-2 sentence definition and a citation to the canonical source
(ADR, code path, or spec). When in doubt about what a term means
in the Foundation context, this file is the source of truth.

This glossary is **committed substrate**. Future engineers (human
or LLM) read this on first contact with the codebase to align
on terminology before making architectural decisions. Drifting
from these definitions in code comments, ADRs, or docs is a
red flag worth flagging in alignment review.

---

## A

**ABT (Asset Bound Token).** A token whose lifecycle is bound to
the lifecycle of a specific asset (typically a Memory Capsule or
DMW). When the underlying asset's permission state changes, the
ABT is invalidated cryptographically. See US patent 12,517,919
and the COSMP specification.

**ACCESS_BASED (DecayType).** A `DecayType` enum value indicating
the Capsule's relevance decays as a function of access frequency
— frequently retrieved Capsules retain weight; rarely retrieved
ones decay over time. See `packages/database/prisma/schema.prisma`
DecayType enum.

**Account-of-Record Discipline.** The compliance principle that
every audit event maps to a real authenticated entity --
shared service accounts, anonymous actions, and system principals
masquerading as humans are non-compliant. Where system actions
are unavoidable (scheduled jobs, periodic checks), they must be
enumerable as distinct system actor identities. Foundation's
implementation: `SYSTEM_PRINCIPALS` enum + the legacy
`SYSTEM_CHAIN_KEY` backwards-compat fallback. See
`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Section 1 Dimension 1.4
and ADR-0006.

**AI Access Block (`ai_access_blocked`).** A read-side gate flag
on the `MemoryCapsule` model. When `true`, a restricted-class
entity (AI_AGENT / DEVICE class) requesting NEGOTIATE access is
denied with `denial_reason: "AI_ACCESS_BLOCKED"`; PERSON-class
requesters are unaffected, and the capsule's owner is unaffected
(the owner shortcut precedes the check). Owner-controlled via
`CapsuleCreateInput` / `CapsuleUpdateInput`. Enforced at
`apps/api/src/services/cosmp/negotiate.service.ts`. Sibling of
the `requires_validation` Validation Gate Flag.

**Architectural Anchor.** A runtime-enforced invariant test that
locks an architectural property future engineers (or LLMs)
cannot break without a red test. Six anchors are active as of
Section 12C.0: DRIFT 9 cross-org leak prevention (audit +
permissions), DRIFT 2 Option C no-console-in-apps/api/src,
DRIFT 12 writeAuditEvent backwards-compat fallback, frozen
CRYPTO_CONFIG, frozen SYSTEM_PRINCIPALS. See
`docs/reference/architectural-anchors.md`.

**Audit Chain.** The append-only, hash-chained sequence of
`AuditEvent` rows in Foundation's database. Each row's
`event_hash` is SHA-256 over a canonical record that includes
the previous row's `event_hash`, forming a tamper-evident chain.
A Postgres `BEFORE DELETE` trigger prevents deletion. See
`packages/database/src/queries/audit.ts:217-244` and ADR-0002.

**Audit Event.** Capitalized when referring to the formal
`AuditEvent` Prisma model / database row; lowercase ("audit
event") in running prose when discussing events in general. See
`packages/database/prisma/schema.prisma:249-271` and ADR-0002.

## B

**BEHAVIORAL_PATTERN Capsule.** A Capsule type carrying observed
Entity behavior intelligence — recurring patterns, habitual
responses, and inferred tendencies extracted from interaction
history. Distinct from PREFERENCE Capsule (declared) by being
observed. See `packages/database/prisma/schema.prisma`
CapsuleType enum.

**BLOCKER Capsule.** A Capsule type carrying intelligence about
obstacles preventing Entity progress — blocking issues,
dependency gaps, resource constraints, and resolution attempts.
Created by observation pipeline when execution surfaces friction;
resolved by subsequent CORRECTION or HANDOFF Capsules. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**BOOT_VALIDATOR.** One of the four `SYSTEM_PRINCIPALS` enum
values. Tags audit emissions originating from boot-time
validation paths (e.g., production-mode crypto gate failures).
See `packages/database/src/queries/audit.ts` and ADR-0006.

**Bridge.** A grouping primitive for multiple Permission rows
that share a common grant lifecycle. The COSMP `SHARE` operation
mints a bridge_id; the `REVOKE` operation revokes every
Permission tied to that bridge_id atomically. See
`packages/database/prisma/schema.prisma` Permission model and
the COSMP specification.

## C

**Capsule.** Short for Memory Capsule. Use "Memory Capsule" on
first mention in any document; "capsule" in subsequent uses
within the same document.

**Capsule Type.** One of 20 enumerated values categorizing what
kind of intelligence a Memory Capsule contains. See per-type
entries in this glossary (entries ending in "Capsule"). See also
`packages/database/prisma/schema.prisma` CapsuleType enum.

**COE (Contextual Orchestration Engine).** The runtime engine
that fulfills COSMP's contextual-orchestration responsibility,
sometimes referred to as the Scoped Context Builder (SCB). For
each Memory Capsule access request, COE evaluates context tags
and scope policies to determine which capsules are eligible for
disclosure to the requesting AI agent. Implementation:
`assembleContext`, `explicitRecall`, `recordOutcome`, and
parallel-negotiate paths in
`apps/api/src/services/coe/coe.service.ts`. The "Contextual
Orchestration" phrase is shared with COSMP by design — COE is
the engine that implements COSMP's contextual-orchestration
contract. See COSMP entry and patent US 12,517,919.

**combined_score.** The substrate's central retrieval scoring
formula computed by COE during convergence:
`tagOverlap * 0.45 + baseRelevance * 0.35 + recencyScore * 0.2`.
Per RAA 12.7 §3.3, the weights are architectural decisions, not
arbitrary numbers; ADR-tier canonicalization queued for ADR-0022.
Future Weighting Architecture work (RAA 12.8 queued) may extend
this formula with additional weight components. See
`apps/api/src/services/coe/keywords.ts` and RAA 12.7 §3.3.

**COMMITMENT Capsule.** A Capsule type carrying intelligence
about Entity commitments — promises made, deadlines accepted,
obligations entered, and follow-through context. Carries a
dedicated `commitment_date` schema field for due-date queries;
surfaced via `priming.getCommitmentsDueSoon` within a 48-hour
window. Time-layer attributes track commitment lifecycle from
creation through fulfillment or revocation. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**COMMUNICATION_PREF Capsule.** A Capsule type carrying
intelligence about an Entity's communication style — preferred
channels, response cadence, formality calibration, and stylistic
attributes. Inferred from observation; refined by explicit
feedback signals. See `packages/database/prisma/schema.prisma`
CapsuleType enum.

**Compliance Framework.** A regulatory regime Foundation can
attach to an entity via `EntityComplianceProfile`. Seven
frameworks ship by default: HIPAA, GDPR, CCPA, FedRAMP_Moderate,
FERPA, SOC2_Type2, CMMC_Level2. See
`apps/api/src/services/compliance/compliance.service.ts:80-145`.

**COMPLIANCE_RECORD Capsule.** A Capsule type carrying
compliance-relevant intelligence — audit attestations, regulatory
acknowledgments, framework-specific records (FedRAMP, IL4, IL5,
IL6, CMMC), and clearance-tier evidence. Append-only by
compliance posture; cross-cutting with the audit chain. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**COMPLIANCE_SEEDER.** One of the four `SYSTEM_PRINCIPALS` enum
values. Tags audit emissions from compliance-framework seeding
paths. See `apps/api/src/services/compliance/compliance.service.ts`
and ADR-0006.

**CONVERSATION_LEARNING Capsule.** A Capsule type carrying
intelligence extracted from a specific conversation — topics
discussed, decisions reached, relevance signals, and
conversational outcomes. Written by the closeConversation
operation; retrieved by COE alongside other Capsule types during
convergence. See `packages/database/prisma/schema.prisma`
CapsuleType enum and RAA 12.7 §4.1
(`docs/architecture/dynamic-flow-architecture.md`).

**CORRECTION Capsule.** A Capsule type carrying intelligence
about course-corrections — what was wrong, what changed, what
the Entity learned from being corrected. Generated by
human-validation-loop signals and self-correction events;
informs subsequent BEHAVIORAL_PATTERN and DECISION_STYLE
refinement. See `packages/database/prisma/schema.prisma`
CapsuleType enum. Creating one via
`ObservationService.processCorrection` triggers
`propagateCorrection` best-effort (see the Correction
Propagation entry).

**Correction Propagation (`propagateCorrection`).** The RAA 12.8
§5.2 correction propagation chain, fired by
`ObservationService.processCorrection` after a CORRECTION
capsule lands. Effects: (a) Loop 1 informativeness signal —
snap `relevance_score` to `RELEVANCE_MAX` (1.0) on the
correction capsule and (if named) the target capsule, via raw
SQL UPDATE (per-id, mirroring `runLoop1Once`); (b) Zone U1
audit event `CORRECTION_PROPAGATED` with `correction_capsule_id`
+ `target_capsule_id` in `details`; (c) Hive coordination
influences the aggregate via the next scheduled Loop 4
`buildHiveAggregate` cron (documented-implicit — no synchronous
Hive code). Per RAA 12.8 §5.5 INT-3, a human correction is the
"maximum bump coefficient" signal — the rarest and strongest —
so it snaps to the ceiling rather than incrementally bumping
like Loop 1's `RELEVANCE_USED_BUMP`. Module-level export at
`apps/api/src/services/feedback/feedback.service.ts`; wired
best-effort into `processCorrection` per RULE 4 (the CORRECTION
capsule + its `CAPSULE_CREATED` audit are the authoritative
record; propagation is a downstream signal). Substantiates
ADDENDUM-DMW-SLM §3 ("confidence accumulation" +
"personalization confidence") at runtime register. The INT-6
informativeness-coefficient frozen-anchors parameterization
(ADR-0022 amendment territory) is forward-queue, not landed
here. Landed in D-2D-D10-6.

**Cortex Router.** The component-level dispatch layer inside the
COE that selects which retrieval path (cache hit / DMW lookup /
hive-aggregate read) services a given context-assembly request.

**COSMP (Contextual Orchestration and Scoped Memory Protocol).**
The protocol layer governing all interactions with Memory
Capsules. Defines the seven operations (AUTHENTICATE, NEGOTIATE,
READ, WRITE, SHARE, REVOKE, AUDIT — see ADR-0009) and the
cryptographic access-control discipline applied to each.
Canonical expansion locked by patent US 12,517,919 (filed Jul 6,
2025; see patent title and specification). The protocol's
contextual-orchestration responsibility is fulfilled at runtime
by the Contextual Orchestration Engine (COE); the shared
"Contextual Orchestration" phrase reflects this kinship and is
not a collision. See ADR-0009 for the operation enumeration.

**Cross-Org Leak Prevention.** The architectural property that
endpoint query filters narrow within the caller's existing
org-scope and never broaden it. Enforced by anchor tests at
`tests/integration/admin-routes.test.ts`. See ADR-0006 and the
DRIFT 9 entry in `docs/reference/architectural-anchors.md`.

## D

**Decentralized Memory Wallet (DMW).** The container that holds
an entity's Memory Capsules. Three types exist: Enterprise
(org-owned, stays with company), Personal (employee-owned,
portable), Device (device-bound). "Decentralized" refers to
**sovereignty** (no central authority owns or controls entity
intelligence) -- not blockchain infrastructure. See ADR-0001
and the COSMP specification.

**DECISION Capsule.** A Capsule type carrying intelligence about
a specific decision an Entity made — decision content, options
considered, rationale, and downstream commitments. Distinct from
DECISION_STYLE Capsule (pattern-aggregated) by being a single
decision instance. See `packages/database/prisma/schema.prisma`
CapsuleType enum.

**DECISION_STYLE Capsule.** A Capsule type carrying intelligence
about how an Entity makes decisions — risk tolerance,
deliberation depth, evidence weighting, and decision-pattern
attributes. Distinct from BEHAVIORAL_PATTERN Capsule by being
decision-domain-specific. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**Device DMW.** The wallet type bound to a specific device
(`WalletType.DEVICE`). Device-generated capsules live here.
See ADR-0001.

**DEVICE_DATA Capsule.** A Capsule type carrying device-context
intelligence owned by a Device DMW — device telemetry,
device-specific configuration, sensor readings, and device-bound
observation data. The substrate primitive for device and robot
intelligence. See `packages/database/prisma/schema.prisma`
CapsuleType enum.

**Digital Twin.** An `AI_AGENT` entity that represents an
employee's AI counterpart. Each digital twin has its own
Personal DMW (called the Digital Twin Wallet in some
documentation). Twins are "fused" with their owning employee
via EntityMembership.

**Digital Twin Wallet.** Synonym for the Personal DMW belonging
to an AI_AGENT entity (a digital twin).

**DOMAIN_KNOWLEDGE Capsule.** A Capsule type carrying
subject-matter intelligence within a defined knowledge domain —
facts, concepts, and structured information an Entity has
accumulated about a specific area of work, study, or interest.
See `packages/database/prisma/schema.prisma` CapsuleType enum.

**Drift.** A discrepancy between a primer's assumed state and
the actual codebase state, surfaced via pre-flight grep before
plan-build begins. Numbered drifts (e.g., DRIFT 9, DRIFT 12)
become the basis of architectural anchors when they identify
properties worth locking. See ADRs 0005, 0006, 0007, 0008.

## E

**EntityComplianceProfile.** A Prisma model attaching one or
more compliance frameworks to an entity. Foundation uses this
at the **org level** (one row per organization, not aggregated
across members). See ADR-0008 for the org-level vs aggregated
decision and the rationale for deriving per-member views from
audit events rather than storing per-member profiles. See also
DRIFT 15.

**EntityMembership.** A Prisma model representing the parent /
child relationship between two entities (e.g., org → employee,
employee → digital twin). The graph is one-level by default;
multi-hop traversal is explicit. See
`packages/database/prisma/schema.prisma` EntityMembership model.

**Enterprise DMW.** The wallet type owned by a company
(`WalletType.ENTERPRISE`). Org-level memory capsules live here
and stay with the company on employee departure. See ADR-0001.

**Escalation Routes (`registerEscalationRoutes`).** The HTTP
surface for EscalationRequest resolution: `POST
/api/v1/escalations/:id/approve`, `POST
/api/v1/escalations/:id/reject`, `GET /api/v1/escalations/:id`,
`GET /api/v1/escalations/pending` (`?limit=`, default 50). The
source ≠ resolver dual-control gate is enforced SERVICE-TIER at
`transitionPendingForCaller`'s skeleton gate (a source-only
caller fails per D-2D-D10-2); the routes map the domain-string
throws to HTTP codes (`ESCALATION_FORBIDDEN` → 403;
`ESCALATION_NOT_FOUND` → 404; `ESCALATION_INVALID_TRANSITION` →
409). The canonical `ESCALATION_APPROVED` / `ESCALATION_REJECTED`
audit events (`event_type: "ADMIN_ACTION"` + `details.action`)
fire from the service tier — these routes write nothing
additional. `POST /api/v1/escalations` (general create) is
deliberately not exposed: the only escalation-creation path is
the gate-fail coupling at `negotiate.service.ts` per D-2D-D10-5
(`createGateEscalationForCaller`). Module at
`apps/api/src/routes/escalation.routes.ts`. Per RAA 12.8 §5.2
approval workflow primitives + Section 12.5 Sub-box 1 dual-control
framing — the generalized `requireDualControl` preHandler (the
Sub-box 2 enumerated-set consumer) is forward-queue per the
"enumerated dual-control set, not a general primitive" framing in
`COMPLIANCE_ARCHITECTURE_REVIEW.md` (two-person rule; Patent
Relevance: None — conventional). Substantiates ADDENDUM-DMW-SLM
§5 "Audit lineage per operation (Zone U1-U4)" + "Permission-
governed composition" at the route tier. Landed in D-2D-D10-7.

## F

**FEEDBACK_LOOP.** One of the four `SYSTEM_PRINCIPALS` enum
values. Tags audit emissions from the seven Foundation feedback
loops (Loops 2, 3, 4, 6, 7 are scheduler-driven; Loops 1, 5 are
event-driven). See `apps/api/src/services/feedback/` and
ADR-0006.

**feedback_loop_score.** A `Float` field on the `MemoryCapsule`
schema (default 0.0) accumulating feedback signals across Loop 1
bilateral feedback events. Distinct from `relevance_score` by
being signal-accumulation rather than current-relevance-state.
See `packages/database/prisma/schema.prisma` MemoryCapsule model
and `apps/api/src/services/feedback/feedback.service.ts`.

**Foundation.** The repository and runtime layer this glossary
describes (niov-foundation). Implements COSMP, DMW, COE, Hive
Intelligence, Compliance Router, and Authentication services.
Built on Node.js + TypeScript + Fastify + Supabase Postgres +
Upstash Redis.

**FOUNDATIONAL Capsule.** A Capsule type carrying core
identity-anchoring intelligence about an Entity — durable
attributes, root-level context, and substrate-defining facts
that other Capsules reference. Always included in COE retrieval
regardless of `relevance_score`; bypasses
`RELEVANCE_FORGET_FLOOR`; bypasses token budget allocation.
Typically created at Entity registration and updated rarely.
See `packages/database/prisma/schema.prisma` CapsuleType enum
and RAA 12.7 §3.3.

**FOUNDATIONAL (DecayType).** A `DecayType` enum value matching
CapsuleType FOUNDATIONAL — indicates the Capsule belongs to the
retrieval-privilege class. Capsules with this DecayType are
always included in COE retrieval regardless of `relevance_score`;
bypass `RELEVANCE_FORGET_FLOOR`; bypass token budget allocation.
See `packages/database/prisma/schema.prisma` DecayType enum and
RAA 12.7 §3.3.

**Frozen Config.** A configuration constant exported as
`Object.freeze()` and tested at runtime with `Object.isFrozen()`
assertions. Tamper anchors. Two such anchors as of Section 12C.0:
`CRYPTO_CONFIG` (algorithm choices) and `SYSTEM_PRINCIPALS`
(system-actor enumeration). See ADR-0003.

## H

**HANDOFF Capsule.** A Capsule type carrying intelligence about
work transitions — what was delegated, to whom, with what
context, with what acceptance criteria. The substrate primitive
for digital twin to human or human to digital twin transitions.
See `packages/database/prisma/schema.prisma` CapsuleType enum.

**Hash Chain.** See Audit Chain. The hash-chain mechanism is one
property of the broader audit chain.

**HIVE_AGGREGATE_BUILT.** An `AuditEventType` literal emitted
when the Hive Intelligence aggregator computes a new aggregate
capsule. See `packages/database/src/queries/audit.ts`
AuditEventType enum.

**Hive Intelligence.** The Section 5 service that composes
aggregate capsules across multiple entities while preserving
per-entity privacy. The privacy-preserving aggregation pattern
is protected by patent US 12,517,919. See
`apps/api/src/services/hive/hive.service.ts`.

## I

**IDENTITY Capsule.** A Capsule type carrying Entity
identity-verification and identity-asserting intelligence —
credentials, identity proofs, and authentication-relevant
attributes. Government clearance tier assignments and
compliance-framework identity attestations attach here. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

## M

**Memory Capsule.** The fundamental unit of persistent
intelligence in COSMP. The implementation
(`packages/database/prisma/schema.prisma:81-156`, the
`MemoryCapsule` model) carries flat columns: `capsule_id`,
`wallet_id`, `entity_id`, `version`, `capsule_type`, `topic_tags`,
`relevance_score`, `decay_type`, `decay_rate`,
`feedback_loop_score`, `payload_summary`, `payload_size_tokens`,
`tokens`, `tokens_tokenizer`, `commitment_date`,
`storage_location`, `storage_tier`, `clearance_required`,
`access_count`, `content_hash`, `ai_access_blocked`,
`requires_validation`, `connected_capsule_ids`, `connected_entity_ids`,
`monetization_enabled`, `monetization_category`, write-attribution
columns (`created_by`, `created_session_id`, `write_reason`,
`updated_by`, `updated_session_id`, `previous_version`), and
lifecycle timestamps. The conceptual 7-layer structure (Payload,
Metadata, Rules, Relations, Time, Permissions, Audit) is
documented in the COSMP specification and in patent
US 12,517,919 -- both external to this repo. The implementation
flattens the layers into typed columns + foreign-key relations
(Wallet, Entity, Permission). See ADR-0009 for the COSMP
operation enumeration that references the layer structure
indirectly via the seven operations (AUTHENTICATE, NEGOTIATE,
READ, WRITE, SHARE, REVOKE, AUDIT).

## N

**NIOV Labs.** The company that owns niov-foundation, Otzar,
and the three patents covering the protocol substrate. Sole
owner: Sadeil Lewis (Founder and CEO).

## O

**Org Memory Wallet.** Synonym for Enterprise DMW.

**Otzar.** NIOV Labs' Autonomous Enterprise Platform built on
Foundation. The Otzar Control Tower is the admin console
(separate repository: `otzar-control-tower`).

**Otzar Control Tower.** The customer-facing admin console for
Otzar tenants. Lives in a separate repository
(`otzar-control-tower`). Section 12B closed at
otzar-control-tower @ `0a28f90`.

## P

**PERMANENT (DecayType).** A `DecayType` enum value indicating
the Capsule's `relevance_score` is stable regardless of time
elapsed or access patterns — does not decay. Used for Capsules
carrying intelligence whose value does not erode. See
`packages/database/prisma/schema.prisma` DecayType enum.

**Personal DMW.** The wallet type owned by an individual
(`WalletType.PERSONAL`). Employee personal capsules live here
and port to the next employer on departure. See ADR-0001.

**PREFERENCE Capsule.** A Capsule type carrying explicit Entity
preferences — stated choices, configured options, and declared
inclinations that govern how applications and AI agents interact
with the Entity. Distinct from BEHAVIORAL_PATTERN Capsule
(observed) by being declared. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

## R

**recencyScore.** A computed `Float` value (range [0.0, 1.0])
representing the Capsule's recency weight at retrieval time:
1.0 if `last_accessed_at` is within 7 days; linear decay between
day 7 and day 90; 0.0 after day 90. Component of `combined_score`
(recencyScore × 0.2). See
`apps/api/src/services/coe/keywords.ts` and RAA 12.7 §3.3.

**RELATIONSHIP Capsule.** A Capsule type carrying intelligence
about an Entity's relationship to another Entity — connection
type, relationship history, shared context, and bilateral
attributes. Cardinality is encoded in Capsule metadata per the
substrate's parallel relationship-resolution model. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**RELEVANCE_FORGET_FLOOR.** A substrate constant (0.2) below
which Capsules are excluded from COE retrieval — the substrate's
intentional-forgetting threshold. Below-floor Capsules persist
in storage but do not surface in retrieval results until
reinforced above the floor by Loop 1 bilateral feedback.
FOUNDATIONAL Capsules bypass this floor. See
`apps/api/src/services/coe/coe.service.ts`.

**relevance_score.** A `Float` field on the `MemoryCapsule`
schema (range [0.0, 1.0]; default 1.0) representing the
Capsule's per-capsule relevance weight. Adjusted by Loop 1
bilateral feedback via `RELEVANCE_USED_BUMP` and
`RELEVANCE_UNUSED_DECAY` constants. Capsules below
`RELEVANCE_FORGET_FLOOR` are excluded from retrieval (intentional
forgetting). FOUNDATIONAL Capsules bypass this filtering. See
`packages/database/prisma/schema.prisma` MemoryCapsule model,
`apps/api/src/services/feedback/feedback.service.ts`,
`apps/api/src/services/coe/coe.service.ts`, and RAA 12.7 §3.3 +
Zone B1.

**RELEVANCE_UNUSED_DECAY.** A substrate constant (-0.02) applied
to `relevance_score` by Loop 1 bilateral feedback when a Capsule
is retrieved-but-unused. Inverse partner of RELEVANCE_USED_BUMP.
Implements the substrate's natural-forgetting semantic for
low-relevance intelligence. See
`apps/api/src/services/feedback/feedback.service.ts` and
RAA 12.7 Zone B1.

**RELEVANCE_USED_BUMP.** A substrate constant (+0.05) applied to
`relevance_score` by Loop 1 bilateral feedback when a Capsule
is retrieved-and-used. Inverse partner of
RELEVANCE_UNUSED_DECAY. Implements the substrate's reinforcement
semantic for high-relevance intelligence. See
`apps/api/src/services/feedback/feedback.service.ts` and
RAA 12.7 Zone B1.

**RISK Capsule.** A Capsule type carrying intelligence about
identified risks — exposure descriptions, probability and
impact attributes, mitigation context, and risk-related
decisions. Distinct from BLOCKER Capsule by being prospective
rather than current-friction. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

## S

**Sample Failure Count.** A field in the
`GET /api/v1/compliance/state` response shape:
`sample_failure_count_24h` is the count of
`COMPLIANCE_CHECK_FAILED` audit events per applicable framework
in the last 24 hours. See
`apps/api/src/services/compliance/compliance.service.ts`
`getComplianceState`.

**SCHEDULER.** One of the four `SYSTEM_PRINCIPALS` enum values.
Tags audit emissions originating from cron-driven feedback-loop
runs. See `apps/api/src/services/feedback/scheduler.ts` and
ADR-0006.

**Section.** A unit of Foundation build progress. Sections are
numbered (Section 1 through Section 17 are defined). Each
Section closes on a tagged commit and a green test suite. The
canonical progress tracker is
`docs/reference/section-12-progress.md`.

**Sentinel Site.** A code location holding a placeholder value
that an architectural anchor will eventually replace with real
content. Example: pre-12C.0 Item 2, three frontend sites in
otzar-control-tower set `audit_event_id:
"pending-foundation-extension"` because the Foundation contract
hadn't yet surfaced real audit_event_ids. Foundation closed
the sentinel via Item 2; frontend cleanup remains 12C.1
territory.

**Service-Owned Auth Gate.** The pattern where a service exposes
a public `${operation}ForCaller(token, ...args)` method that
handles authentication + delegation in one call, rather than
routes reaching into private service fields for session
validation. See ADR-0004.

**SESSION_LEARNING Capsule.** A Capsule type carrying
intelligence extracted from a single bounded interaction
session — what was discussed, what changed, what an Entity
learned during a defined session window. Coarser-grained than
CONVERSATION_LEARNING Capsule, broader than a single
conversational turn. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**SESSION_ONLY (DecayType).** A `DecayType` enum value indicating
the Capsule's relevance is bounded to a single session —
relevant during the session, decays sharply at session close.
Used for ephemeral session-scoped intelligence. See
`packages/database/prisma/schema.prisma` DecayType enum.

**SYSTEM_PRINCIPALS.** The frozen enumeration of system actors
that emit audit events outside of human-initiated sessions.
Four values: SCHEDULER, BOOT_VALIDATOR, COMPLIANCE_SEEDER,
FEEDBACK_LOOP. See
`packages/database/src/queries/audit.ts` SYSTEM_PRINCIPALS,
ADR-0006, and the DRIFT 12 backwards-compat anchor.

## T

**TAR (Token Attribute Repository).** A Prisma model holding the
attributes (clearance ceiling, allowed operations, compliance
frameworks, capability flags) attached to an entity's session
JWT. See `packages/database/prisma/schema.prisma` TAR model.

**TASK_LEARNING Capsule.** A Capsule type carrying intelligence
extracted from task execution — what worked, what failed, what
context applied, what an Entity learned about a specific kind
of work. Distinct from WORK_PATTERN Capsule by being
task-bounded rather than pattern-aggregated. See
`packages/database/prisma/schema.prisma` CapsuleType enum.

**Three-Wallet Architecture.** Foundation's memory-ownership
model with three distinct DMW types: Enterprise (company),
Personal (employee, portable), Device (device-bound). The
architecture is the patent claim covered by US 12,517,919.
See ADR-0001.

**TIME_BASED (DecayType).** A `DecayType` enum value indicating
the Capsule's relevance decays as a function of time elapsed
since last access — older Capsules decay unless reinforced.
Operationally typical for CONVERSATION_LEARNING, TASK_LEARNING,
WORK_PATTERN, and SESSION_LEARNING Capsule types. See
`packages/database/prisma/schema.prisma` DecayType enum.

## V

**Validation Gate Flag (`requires_validation`).** A read-side
gate flag on the `MemoryCapsule` model (`@default(false)`). When
`true`, a restricted-class entity (AI_AGENT / DEVICE class)
requesting NEGOTIATE access is denied with `denial_reason:
"VALIDATION_REQUIRED"` until a human clears the gate; PERSON-class
requesters and the capsule's owner are unaffected. Owner-controlled
via `CapsuleCreateInput` / `CapsuleUpdateInput`. Enforced at
`apps/api/src/services/cosmp/negotiate.service.ts` (the check sits
directly after the `ai_access_blocked` AI Access Block check). The
read-side primitive landed in D-2D-D10-4 per RAA 12.8 §5.2
("validation gate flags"); the gate-fail → COMPLIANCE_GATE
EscalationRequest coupling landed in D-2D-D10-5 via
`createGateEscalationForCaller` (get-or-create dedup at the
`negotiate.service.ts` gate-fail block; resolver pathway via
`approveEscalationForCaller` / `rejectEscalationForCaller` from
D-2D-D10-2). Sibling of the `ai_access_blocked` AI Access Block.

## W

**WORK_PATTERN Capsule.** A Capsule type carrying intelligence
about how an Entity approaches recurring work — sequencing,
sequencing exceptions, tooling preferences, and aggregated
work-style attributes inferred across multiple task instances.
Distinct from TASK_LEARNING Capsule by being aggregated rather
than task-bounded. See `packages/database/prisma/schema.prisma`
CapsuleType enum.

**writeAuditEvent.** The Foundation function that emits a
hash-chained audit row. Takes `WriteAuditEventInput`
(`event_type`, `outcome`, `actor_entity_id`, `target_entity_id`,
`target_capsule_id`, `session_id`, `denial_reason`, `details`,
`ip_address`, `system_principal`). The function is the only
legal path for adding a row to `audit_events` -- direct
`prisma.auditEvent.create` is forbidden by convention. The
`chainKey` for hash chain reconstruction follows priority:
`actor_entity_id` → `system_principal` → legacy
`SYSTEM_CHAIN_KEY` (the legacy fallback is the DRIFT 12
backwards-compat anchor; pre-Section-12C.0 emissions without
either modern parameter remain verifiable). See
`packages/database/src/queries/audit.ts:251`, ADR-0002 (audit
chain integrity), and ADR-0006 (chainKey priority).

---

## Maintenance

When you add a new Foundation-specific term to the codebase or
a documentation file, add the term here in alphabetical order
with a 1-2 sentence definition and a citation to the canonical
source. Drifting from these definitions in code comments, ADRs,
or other docs is a red flag for alignment review.

When you remove or rename a term, update this file in the same
commit as the rename. The cross-references in
`docs/reference/architectural-anchors.md`, `CLAUDE.md`, and
ADRs all expect the names here to be authoritative.
