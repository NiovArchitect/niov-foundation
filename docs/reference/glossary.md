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
kind of intelligence a Memory Capsule contains (FOUNDATIONAL,
PREFERENCE, RELATIONSHIP, DOMAIN_KNOWLEDGE, BEHAVIORAL_PATTERN,
IDENTITY, DEVICE_DATA, SESSION_LEARNING, COMPLIANCE_RECORD, plus
11 conversation/work-pattern types added in Section 11A). See
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

**COMPLIANCE_SEEDER.** One of the four `SYSTEM_PRINCIPALS` enum
values. Tags audit emissions from compliance-framework seeding
paths. See `apps/api/src/services/compliance/compliance.service.ts`
and ADR-0006.

**Compliance Framework.** A regulatory regime Foundation can
attach to an entity via `EntityComplianceProfile`. Seven
frameworks ship by default: HIPAA, GDPR, CCPA, FedRAMP_Moderate,
FERPA, SOC2_Type2, CMMC_Level2. See
`apps/api/src/services/compliance/compliance.service.ts:80-145`.

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

**Cortex Router.** The component-level dispatch layer inside the
COE that selects which retrieval path (cache hit / DMW lookup /
hive-aggregate read) services a given context-assembly request.

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

**Device DMW.** The wallet type bound to a specific device
(`WalletType.DEVICE`). Device-generated capsules live here.
See ADR-0001.

**Digital Twin.** An `AI_AGENT` entity that represents an
employee's AI counterpart. Each digital twin has its own
Personal DMW (called the Digital Twin Wallet in some
documentation). Twins are "fused" with their owning employee
via EntityMembership.

**Digital Twin Wallet.** Synonym for the Personal DMW belonging
to an AI_AGENT entity (a digital twin).

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

## F

**FEEDBACK_LOOP.** One of the four `SYSTEM_PRINCIPALS` enum
values. Tags audit emissions from the seven Foundation feedback
loops (Loops 2, 3, 4, 6, 7 are scheduler-driven; Loops 1, 5 are
event-driven). See `apps/api/src/services/feedback/` and
ADR-0006.

**Foundation.** The repository and runtime layer this glossary
describes (niov-foundation). Implements COSMP, DMW, COE, Hive
Intelligence, Compliance Router, and Authentication services.
Built on Node.js + TypeScript + Fastify + Supabase Postgres +
Upstash Redis.

**Frozen Config.** A configuration constant exported as
`Object.freeze()` and tested at runtime with `Object.isFrozen()`
assertions. Tamper anchors. Two such anchors as of Section 12C.0:
`CRYPTO_CONFIG` (algorithm choices) and `SYSTEM_PRINCIPALS`
(system-actor enumeration). See ADR-0003.

## H

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
`connected_capsule_ids`, `connected_entity_ids`,
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
Pulse Presence, Glonari Pulse, and the three patents covering
the protocol substrate. Sole owner: Sadeil Lewis (Founder and
CEO).

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

**Personal DMW.** The wallet type owned by an individual
(`WalletType.PERSONAL`). Employee personal capsules live here
and port to the next employer on departure. See ADR-0001.

**Pulse Presence.** A NIOV Labs product. Capitalized as a proper
noun.

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

**Three-Wallet Architecture.** Foundation's memory-ownership
model with three distinct DMW types: Enterprise (company),
Personal (employee, portable), Device (device-bound). The
architecture is the patent claim covered by US 12,517,919.
See ADR-0001.

## W

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
