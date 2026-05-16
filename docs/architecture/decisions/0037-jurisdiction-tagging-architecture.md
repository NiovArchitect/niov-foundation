# ADR-0037: Jurisdiction Tagging Architecture for Entity / MemoryCapsule / AuditEvent / OrgSettings

## Status

Accepted 2026-05-15

CAR Sub-box 2 mini-arc CLOSED at sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]`. The substrate landed across the 6-sub-phase mini-arc per §Post-Closure Implementation Lineage below; all 9 sub-decisions RESOLVED at substrate-state ground truth canonical at substantive register substantively.

## Date

2026-05-15

## Trigger

`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` §1.6 (Regional / Sovereignty Boundaries) + §2.4 (Jurisdictional Scope) + Bucket B Sub-box 2 — Jurisdiction Tagging. CAR §1.6 Recommended Remediation enumerates the substrate verbatim: "Add `jurisdiction: String?` (or `jurisdiction_codes: String[]`) to `Entity`, `MemoryCapsule`, and `AuditEvent`. Default at create-time from `OrgSettings` (which needs a `default_jurisdiction` field added) or from `EntityComplianceProfile`. Wire the field into permission / share / read flows so cross-jurisdictional access surfaces a flag the caller can act on (block, log, prompt). Add a runtime `assertJurisdictionalScope()` check that prevents cross-region reads where lawful basis is not declared."

ADR-0036 §Substrate-Honest Distinctions explicitly preserved CAR Sub-box 2 as QUEUED at Sub-box 3 closure: "CAR Sub-box 2 substrate (Entity / MemoryCapsule / AuditEvent / OrgSettings jurisdiction fields + `assertJurisdictionalScope()` runtime check) is **NOT YET LANDED** ... Sub-box 3 ships its own self-contained `LawfulBasis.jurisdiction_invoked` field per Sub-box 3 pre-flight Q1 LOCKED Option A; the full CAR Sub-box 2 substrate ... remains explicitly QUEUED. ADR-0036 must not claim CAR Sub-box 2 is landed."

CAR Bucket B Sub-box 2 Downstream Consumers: Sub-box 4 (data subject jurisdiction); Sub-box 5 (jurisdiction-aware deletion variants); Sub-box 8 (meta-jurisdiction aggregates / cross-tenant compliance benchmarking); Sub-box 9 (capsule jurisdiction in compliance attestation). All four downstream sub-boxes are **dependency-blocked** until CAR Sub-box 2 lands.

ADR-0037 is sub-phase 1 of the 6-sub-phase CAR Sub-box 2 mini-arc per Q-NEW-7 LOCKED operator-tier authorization at canonical decision register substantively. The implementation sub-phases (2-6) extend the schema, services, COSMP enforcement, REGULATOR integration, and closure cascade; this sub-phase 1 documents the substrate-architectural decisions before implementation.

## Context

**Foundation gap (CAR §1.6 verbatim)**: `packages/database/prisma/schema.prisma` Entity (line 22-57) + MemoryCapsule (line 86-168) + AuditEvent (line 269-302) + OrgSettings (line 780-797) carry NO jurisdiction field. The existing `LawfulBasis.jurisdiction_invoked` (sub-phase 2 of Sub-box 3) is REGULATOR-tier-only — it represents the jurisdiction a regulator is invoking authority under, NOT the jurisdiction the data is anchored at. Cross-tenant + cross-region access cannot be scoped to jurisdictional boundaries without data-tier jurisdiction substrate.

**Foundation gap (CAR §2.4 verbatim)**: there is no `assertJurisdictionalScope()` runtime check at permission / share / read flows. Cross-jurisdictional access surfaces with no flag the caller can act on. Compliance officers cannot SQL-filter capsules / audit events / entities by jurisdictional anchor for compliance reporting or jurisdiction-scoped audit reconstruction.

**Patent-implementation evidence dimension**: per CAR §1.6 verbatim "Patent Relevance: None directly — region tagging is conventional. However, the *intersection* of jurisdictional tagging with COSMP capsule provenance + cross-tenant hive intelligence is potentially patent-relevant (deferred to Section 3.5 cross-tenant compliance benchmarking)." ADR-0037 substrate is **NOT direct patent-implementation evidence** at substantive register substantively per Q-NEW-8 LOCKED Option α (no Patent-Implementation Evidence section; no ADR-0020 cite). Cross-Tenant Compliance Benchmarking patent-relevance analysis is forward-queued for future ADR if substrate justifies.

**Substrate constraints**:
- ADR-0036 §Substrate-Honest Distinctions canonical at substantive register substantively — CAR Sub-box 2 was preserved as QUEUED at Sub-box 3 closure; sub-phase 5 of Sub-box 2 augments (does NOT replace) the existing REGULATOR enforcement substrate from sub-phase 6 of Sub-box 3.
- ADR-0026 §5 6 BEAM-compatibility patterns canonical at substantive register substantively — `assertJurisdictionalScope` pure-function discriminated outcome inherits the pattern set so a future Elixir/BEAM port per ADR-0028 forward-substrate is a port, not a rewrite.
- ADR-0033 §Decision 4a canonical_record/1 14-field byte-equivalence canonical at substantive register substantively per sub-phase 4 of Sub-box 3 — Sub-box 2 explicitly does NOT extend canonical_record/1 per Q-NEW-3 LOCKED Option β (preserves TS↔Elixir byte-equivalence; preserves 12 fixture pairs; preserves cosmp_router default tier 137/0).
- Sub-phase 6 of Sub-box 3 §18 Whole-COSMP scalability and orchestration alignment canonical at substantive register substantively — Sub-box 2 enforcement design must remain COMPATIBLE with whole-COSMP high-concurrency architecture without overclaiming implementation.

**External legal context** (citations only; NO compliance certification claim):
- GDPR Articles 44-50 (international data transfers)
- Schrems II decision (CJEU C-311/18, July 2020)
- FedRAMP boundary requirements
- CMMC 2.0 Level 2 SC.L2-3.13 (system / communications boundary)

## Decision

Foundation will introduce single-String jurisdiction tagging at four schema models (`Entity` + `MemoryCapsule` + `AuditEvent` + `OrgSettings`), a service-tier defaulting cascade, a pure-function `assertJurisdictionalScope()` enforcement helper, COSMP enforcement at four entry points, and REGULATOR LawfulBasis-jurisdiction ↔ MemoryCapsule-jurisdiction integration. Decisions break into 9 sub-decisions, enumerated in §Sub-decisions below.

The implementation lands across a 6-sub-phase mini-arc per Q-NEW-7 LOCKED Option α: (1) ADR-0037 (this commit) → (2) Schema substrate → (3) Service-tier helpers + defaulting → (4) COSMP enforcement → (5) REGULATOR integration → (6) Closure cascade.

## Sub-decision 1: Single-String jurisdiction representation

Foundation will use single `String` jurisdiction representation at all four schema fields. Entity / MemoryCapsule / AuditEvent rows each carry one primary jurisdictional anchor; OrgSettings carries one organization-wide default jurisdiction.

Multi-jurisdiction authority remains the REGULATOR-actor case at the existing `TokenAttributeRepository.regulator_jurisdiction: String[]` field (sub-phase 2 of Sub-box 3 substrate). Data-tier rows (Entity / Capsule / Audit) are NOT multi-jurisdictional at sub-phase 2 of Sub-box 2 substrate; multi-jurisdiction capsule support is forward-queued per §Forward Queue.

This matches the existing `LawfulBasis.jurisdiction_invoked: String` precedent (sub-phase 2 of Sub-box 3) — substrate-coherent at single-anchor register substantively.

Per Q-NEW-1 LOCKED Option α canonical at substantive register substantively.

## Sub-decision 2: Field placement

Foundation will add four jurisdiction-related fields:

- `Entity.jurisdiction: String?` (nullable; defaulted via service-tier per Sub-decision 5)
- `MemoryCapsule.jurisdiction: String?` (nullable; defaulted via service-tier per Sub-decision 5; immutable after creation per Sub-decision 4)
- `AuditEvent.jurisdiction: String?` (nullable; row metadata only per Sub-decision 3)
- `OrgSettings.default_jurisdiction: String?` (nullable; operator-set explicit input only per Sub-decision 5)

All four fields land at sub-phase 2 [CAR-SUB-BOX-2-SCHEMA]. B-tree indexes `@@index([jurisdiction])` land on `entities`, `memory_capsules`, and `audit_events` tables; `org_settings` table uses single-row-per-org PK lookup (no jurisdiction index).

## Sub-decision 3: AuditEvent.jurisdiction is row metadata only

Foundation will add `AuditEvent.jurisdiction: String?` as a Prisma + Postgres row column. AuditEvent.jurisdiction is **NOT** included in `canonical_record/1`. The 14-field canonical_record/1 substrate from sub-phase 4 of Sub-box 3 (canonical_record/1 positions 13 + 14 = lawful_basis_id + lawful_basis_chain_hash) is **PRESERVED unchanged** at TS + Elixir registers.

Rationale at substantive register substantively per Q-NEW-3 LOCKED Option β:
- CAR §1.6 requires AuditEvent jurisdiction tagging for compliance reporting and jurisdiction-scoped audit queries — substrate-state ground truth canonical at substantive register substantively
- Cryptographic binding of jurisdiction at canonical_record/1 (Q-NEW-3 Option α) would trigger TS↔Elixir audit-chain extension + 12 fixture pair regeneration + Elixir AuditEvent schema MOD + audit_event_test.exs assertion update — substantively wider scope than CAR Sub-box 2 requires
- Row-metadata-only AuditEvent.jurisdiction is queryable + filterable via `@@index([jurisdiction])` for compliance reports without cryptographic-binding overhead
- Future canonical_record/1 jurisdiction binding remains forward-queued per §Forward Queue if substrate justifies

**Substrate-state precondition canonical at substantive register substantively**: Sub-box 3 sub-phase 4 substrate ([SUB-BOX-3-AUDIT-CHAIN] commit `f9d0694`) lands canonical_record/1 14-field shape + TS↔Elixir byte-equivalence + 12 fixture pairs + AuditEvent ROW schema columns lawful_basis_id + lawful_basis_chain_hash. CAR Sub-box 2 row-metadata-only AuditEvent.jurisdiction PRESERVES this substrate at substrate-state ground truth canonical at substantive register substantively. cosmp_router default tier 137/0 PRESERVED.

## Sub-decision 4: MemoryCapsule.jurisdiction immutable after creation

Foundation will treat `MemoryCapsule.jurisdiction` as immutable after `createCapsule`. The `updateCapsule` flow at `apps/api/src/services/cosmp/write.service.ts` does NOT permit jurisdiction mutation at sub-phase 4 of Sub-box 2 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT].

Rationale at substantive register substantively per Q-NEW-4 LOCKED Option α:
- Silent jurisdictional drift hazard: a capsule that started in US-FEDERAL jurisdiction silently mutating to EU-DE without explicit cross-region transfer workflow would invalidate compliance reports + jurisdiction-scoped audit reconstruction
- Cross-region transfer or jurisdiction reassignment is a separate explicit workflow with its own audit semantics canonical at substantive register substantively (forward-queued per §Forward Queue)
- Substrate-coherent at audit-chain immutability register substantively (audit_events_immutable trigger from ADR-0002 + LawfulBasis row append-only register from sub-phase 5 of Sub-box 3)

The Sub-decision 5 service-tier defaulting cascade applies ONLY at create-time. Post-create mutation attempts will be rejected at sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] register substantively.

## Sub-decision 5: Service-tier defaulting cascade

Foundation will implement a service-tier defaulting cascade at create-time. Prisma schema `@default(...)` cannot perform cross-row defaults (e.g., capsule defaulting from owner Entity OR from OrgSettings); defaulting MUST live in service-tier helpers.

**Defaulting cascade canonical at substantive register substantively**:

```
Entity.jurisdiction default cascade (at createEntity helper):
  explicit input  →  OrgSettings.default_jurisdiction (if org context resolvable)  →  null

MemoryCapsule.jurisdiction default cascade (at createCapsule helper):
  explicit input  →  owner Entity.jurisdiction  →  OrgSettings.default_jurisdiction (if resolvable)  →  null

AuditEvent.jurisdiction default cascade (at writeAuditEvent helper):
  explicit input  →  operation context (capsule.jurisdiction OR actor.entity.jurisdiction OR LawfulBasis.jurisdiction_invoked at REGULATOR flows)  →  null

OrgSettings.default_jurisdiction default:
  explicit operator input only  →  null (no cascade)
```

**Substrate-state ground truth canonical at substantive register substantively** per Q-NEW-6 LOCKED Option α: defaulting is service-tier-only. NO Prisma @default for cross-row defaults. NO middleware-tier defaulting. createEntity / createCapsule / writeAuditEvent helpers at `packages/database/src/queries/{entity,capsule,audit}.ts` are extended at sub-phase 3 [CAR-SUB-BOX-2-SERVICES] register substantively.

## Sub-decision 6: assertJurisdictionalScope pure-function design

Foundation will introduce NEW `apps/api/src/services/cosmp/jurisdiction-enforcement.ts` with `assertJurisdictionalScope` pure-function helper at sub-phase 3 [CAR-SUB-BOX-2-SERVICES] register substantively. Mirrors the sub-phase 6 of Sub-box 3 `enforceRegulatorCOSMPAccess` pattern at substantive register substantively.

**Design canonical at substantive register substantively**:
- **Location**: `apps/api/src/services/cosmp/jurisdiction-enforcement.ts` (sibling to `regulator-enforcement.ts`) per Q-NEW-2 LOCKED Option α
- **Purity**: pure function over already-fetched inputs (caller pre-fetches actor + target rows; enforcement does NOT issue its own DB reads)
- **Side effects**: NONE (no audit emission; no DB write; no logger.* call; no cache write)
- **Discriminated outcome** (mirrors sub-phase 6 of Sub-box 3 substrate):

```typescript
export type JurisdictionScopeResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "JURISDICTION_NOT_AUTHORIZED"
        | "ACTOR_JURISDICTION_MISSING"
        | "TARGET_JURISDICTION_MISSING"
        | "CROSS_JURISDICTION_ACCESS_DENIED";
      status: 403;
      actor_jurisdiction?: string | null;
      target_jurisdiction?: string | null;
    };
```

**6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction** so a future Elixir/BEAM port per ADR-0028 forward-substrate is a port, not a rewrite. Active checks are read-only operations on already-fetched row data; many parallel callers can invoke the helper concurrently without contention.

## Sub-decision 7: COSMP enforcement placement

Foundation will wire `assertJurisdictionalScope` into the four COSMP entry points at sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] register substantively, mirroring the sub-phase 6 of Sub-box 3 enforcement matrix at substantive register substantively:

| COSMP entry point | Enforcement |
|---|---|
| NEGOTIATE | start-check (gate before declaration_token issuance) |
| readContent | TOCTOU re-check (catches mid-stream jurisdiction changes; mirrors sub-phase 6 of Sub-box 3) |
| readMetadata | NOT enforced (per sub-phase 6 of Sub-box 3 Q4 LOCKED Option α precedent — readMetadata stays light) |
| SHARE | start-check (cross-jurisdiction grantee check) |
| REVOKE share | start-check |
| WRITE createCapsule | jurisdiction defaulting + immutability invariant established |
| WRITE updateCapsule | jurisdiction immutability enforced (Sub-decision 4 invariant) |

**Per-request indexed point-lookups; no global lock; no unbounded scans; no capsule-content authorization reads; no cross-request cache; revocation/jurisdiction-change fail-closed for new checks** per sub-phase 6 of Sub-box 3 §18 Whole-COSMP scalability and orchestration alignment canonical at substantive register substantively.

## Sub-decision 8: REGULATOR integration (LawfulBasis.jurisdiction_invoked ↔ MemoryCapsule.jurisdiction)

Foundation will augment the sub-phase 6 of Sub-box 3 REGULATOR enforcement substrate at sub-phase 5 [CAR-SUB-BOX-2-REGULATOR-INTEGRATION] register substantively. REGULATOR access requires THREE jurisdiction-tier matches:

1. **TAR.regulator_jurisdiction[] includes LawfulBasis.jurisdiction_invoked** (existing sub-phase 6 of Sub-box 3 check; PRESERVED unchanged)
2. **NEW: LawfulBasis.jurisdiction_invoked === MemoryCapsule.jurisdiction** (sub-phase 5 of Sub-box 2 NEW)
3. (implicit) actor entity.entity_type === "REGULATOR" (existing sub-phase 6 of Sub-box 3 check)

Substrate-state interpretation at substantive register substantively per Q-NEW-5 LOCKED Option α: regulator authority is jurisdiction-scoped at BOTH the authority-source register substantively (regulator's TAR-tier authorization in jurisdiction X) AND the data-target register substantively (the capsule whose data the regulator accesses must be ANCHORED in jurisdiction X). A US-FEDERAL SEC examiner cannot use a US-FEDERAL subpoena to access an EU-DE-anchored capsule.

**No weakening of existing Sub-box 3 LawfulBasis enforcement at substrate-state ground truth register substantively**: sub-phase 5 of Sub-box 2 ADDS a third jurisdiction-tier check; sub-phase 6 of Sub-box 3 substrate (TAR + LawfulBasis lifecycle + chain_hash + revocation/expiry) PRESERVED unchanged.

**No REGULATOR/GOVERNMENT conflation** per Sub-box 3 Sub-decision 1 canonical at substantive register substantively (CAR §2.1 correctness-hazard guard PRESERVED).

## Sub-decision 9: Dependency relationships (CAR Sub-box 2 ENABLES)

CAR Sub-box 2 jurisdiction tagging substrate is upstream-dependency-substrate for four downstream CAR Sub-boxes per CAR Bucket B canonical at substantive register substantively:

- **Enables Sub-box 4** (DecisionRecord + DataSubjectReference + Agent Attestation per CAR §2.5 + §2.7 + §3.6): data subject jurisdiction is required for DataSubjectReference attribution
- **Enables Sub-box 5** (jurisdiction-aware deletion variants + GDPR Article 17 right-to-erasure pseudonymization per CAR §2.6 + §3.4): deletion must respect jurisdictional retention requirements
- **Enables Sub-box 8** (Cross-Tenant Compliance Benchmarking per CAR §3.5 + meta-jurisdiction aggregates): cross-tenant benchmarking requires jurisdiction-scoped aggregation
- **Enables Sub-box 9** (Capsule Compliance Provenance per CAR §3.7): compliance attestation must include capsule jurisdictional anchor

Until Sub-box 2 lands, Sub-boxes 4 / 5 / 8 / 9 are dependency-blocked at substrate-state ground truth canonical at substantive register substantively per CAR Bucket B Sub-box 2 Downstream Consumers enumeration.

## Patent Relevance

**None directly** per CAR §1.6 verbatim: "Patent Relevance: None directly — region tagging is conventional. However, the *intersection* of jurisdictional tagging with COSMP capsule provenance + cross-tenant hive intelligence is potentially patent-relevant (deferred to Section 3.5 cross-tenant compliance benchmarking)."

ADR-0037 substrate is **NOT direct patent-implementation evidence** at substantive register substantively per Q-NEW-8 LOCKED Option α canonical at canonical decision register substantively:
- NO Patent-Implementation Evidence section
- NO ADR-0020 cite (two-register IP discipline + Register-2 patent-implementation evidence)
- Cross-Tenant Compliance Benchmarking patent-relevance analysis is forward-queued per §Forward Queue if substrate justifies

This is **compliance / privacy / access-control substrate**, NOT a new patent-claim substrate.

## Implementation Detail

**CAR Sub-box 2 mini-arc shape** (6 sub-phases per Q-NEW-7 LOCKED Option α canonical at substantive register substantively):

1. **Sub-phase 1** `[CAR-SUB-BOX-2-ADR]` (this commit) — ADR-0037 + section-12-progress.md CAR Sub-box 2 IN FLIGHT row update + architecture/README + CLAUDE.md ADR catalog entries + ADR-0036 RULE 14 back-cite. Docs-only.
2. **Sub-phase 2** `[CAR-SUB-BOX-2-SCHEMA]` — Prisma schema +4 columns (Entity.jurisdiction + MemoryCapsule.jurisdiction + AuditEvent.jurisdiction + OrgSettings.default_jurisdiction) + 3 indexes (entities + memory_capsules + audit_events). NO Elixir changes. NO canonical_record/1 changes. NO fixture regeneration.
3. **Sub-phase 3** `[CAR-SUB-BOX-2-SERVICES]` — NEW `apps/api/src/services/cosmp/jurisdiction-enforcement.ts` (`assertJurisdictionalScope` pure-function helper) + service-tier defaulting cascade at createEntity + createCapsule + writeAuditEvent helpers + NEW `tests/unit/jurisdiction.test.ts`.
4. **Sub-phase 4** `[CAR-SUB-BOX-2-COSMP-ENFORCEMENT]` — wire `assertJurisdictionalScope` into NEGOTIATE start-check + readContent TOCTOU re-check + SHARE start-check + REVOKE share start-check + WRITE create-time defaulting + WRITE update-time immutability enforcement + NEW `tests/integration/jurisdiction-cosmp-enforcement.test.ts`.
5. **Sub-phase 5** `[CAR-SUB-BOX-2-REGULATOR-INTEGRATION]` — augment `apps/api/src/services/cosmp/regulator-enforcement.ts` to add the third jurisdiction-tier check (LawfulBasis.jurisdiction_invoked === MemoryCapsule.jurisdiction); MOD `tests/integration/regulator-cosmp-enforcement.test.ts` to extend coverage; preserves existing 18 sub-phase 6 tests + Sub-box 3 substrate.
6. **Sub-phase 6** `[CAR-SUB-BOX-2-CLOSURE]` — closure cascade: ADR-0037 Status: Proposed → Accepted + NEW `## Post-Closure Implementation Lineage` block + section-12-progress.md CAR Sub-box 2 row CLOSED + architecture/README + CLAUDE.md ADR catalog entry refresh + CURRENT_BUILD_STATE.md minimum-touch entry. Docs-only.

The exact sub-phase decomposition is fixed at canonical register substantively per Q-NEW-7 LOCKED Option α; sub-phase pre-flights may surface refinements per substrate-honest discipline canonical at substantive register substantively.

## Substrate-Honest Distinctions (what lands in CAR Sub-box 2 vs what stays queued)

**Lands in CAR Sub-box 2 mini-arc (sub-phases 1-6)** at canonical register substantively:
- 4 single-String jurisdiction columns (Entity + MemoryCapsule + AuditEvent + OrgSettings)
- 3 B-tree indexes (entities + memory_capsules + audit_events)
- service-tier defaulting cascade (createEntity + createCapsule + writeAuditEvent helpers)
- `assertJurisdictionalScope` pure-function enforcement helper
- COSMP enforcement at NEGOTIATE / readContent / SHARE / REVOKE / WRITE entry points
- MemoryCapsule.jurisdiction immutability after creation
- REGULATOR LawfulBasis.jurisdiction_invoked ↔ MemoryCapsule.jurisdiction match enforcement

**Stays QUEUED at canonical register substantively** (per §Forward Queue):
- Physical data residency enforcement (multi-region storage placement)
- Legal transfer determination engine (Schrems II / GDPR Article 44-50 runtime evaluation)
- Real-time country/legal rules engine
- Cross-region capsule transfer workflow
- Multi-jurisdiction capsule support (one capsule with multiple jurisdictional anchors)
- canonical_record/1 jurisdiction binding (cryptographic) — only if future evidence requires
- Cross-Tenant Compliance Benchmarking patent-relevance analysis per CAR §1.6 forward path
- AuditEvent.jurisdiction automatic operation-context propagation if not fully landed in services phase

ADR-0037 must NOT claim:
- Full legal compliance certification
- Data residency infrastructure (physical multi-region storage placement)
- Multi-region physical storage enforcement
- Cross-border transfer legal determination
- Per-country regulatory automation
- Real-time legal rules engine
- Full DMW-to-DMW orchestration
- BEAM/Broadway backpressure implementation
- Federation Cloud monetization
- External PKI / EU eIDAS / national registry integration
- Direct patent relevance (per CAR §1.6 verbatim "None directly — region tagging is conventional")

## Consequences

### Easier

- Compliance officers can SQL-filter capsules / audit events / entities by jurisdictional anchor for compliance reporting
- Sub-box 4 / 5 / 8 / 9 dependency-unblocked
- Regulator access becomes data-jurisdiction-scoped at sub-phase 5 of Sub-box 2 substrate substantively
- GDPR Article 25 privacy-by-design substrate-architectural readiness established (NOT certified — substrate readiness only)
- FedRAMP / CMMC boundary substrate-architectural readiness established (NOT certified — substrate readiness only)
- Audit reconstruction can scope to jurisdictional anchor for jurisdiction-bound investigations

### Harder

- Service-tier defaulting cascade requires consistent application at all 3 create paths (createEntity + createCapsule + writeAuditEvent)
- `assertJurisdictionalScope` must be invoked at every COSMP enforcement entry point (5 entry points at sub-phase 4 register substantively)
- Cross-jurisdiction access denial must be testable + observable without leaking PII (audit details discipline preserved per existing audit-emission convention)
- REGULATOR enforcement now combines THREE jurisdictional matches (TAR.regulator_jurisdiction + LawfulBasis.jurisdiction_invoked + Capsule.jurisdiction); test coverage at sub-phase 5 of Sub-box 2 register substantively expands the Sub-box 3 substrate test surface
- MemoryCapsule.jurisdiction immutability requires explicit cross-region transfer workflow design (forward-queued per §Forward Queue)

## Alternatives Considered

### Alternative A — String[] array (multi-jurisdiction per row) (rejected per Q-NEW-1 LOCKED Option α)

`jurisdiction_codes: String[]` per CAR §1.6 alternative recommendation. Substantively allows one row to claim multiple jurisdictional anchors. REJECTED at operator-tier register substantively because:
- Data-tier rows (Entity / Capsule / Audit) semantically ARE bound to ONE primary jurisdiction at substrate-state ground truth canonical at substantive register substantively
- Multi-jurisdiction support is the REGULATOR-actor case at TAR-tier (existing `TAR.regulator_jurisdiction: String[]` substrate)
- Matches existing `LawfulBasis.jurisdiction_invoked: String` precedent at sub-phase 2 of Sub-box 3 register substantively
- Multi-jurisdiction capsule support remains forward-queued per §Forward Queue if substrate justifies

### Alternative B — canonical_record/1 jurisdiction binding (cryptographic) (rejected per Q-NEW-3 LOCKED Option β)

Add AuditEvent.jurisdiction as canonical_record/1 position 15. Substantively requires audit-chain extension sub-phase MIRRORING sub-phase 4 of Sub-box 3 (TS canonicalRecord 14 → 15 + Elixir canonical_record/1 14 → 15 + 12 fixture pair regeneration + Elixir AuditEvent schema MOD + audit_event_test.exs assertion update + ADR-0033 inline amendment). REJECTED at operator-tier register substantively because:
- CAR §1.6 substrate requirement is jurisdiction tagging for compliance reporting + jurisdiction-scoped audit queries — substrate-state ground truth canonical at substantive register substantively does NOT require cryptographic-binding for these consumer use cases
- Cryptographic binding overhead (Elixir audit-chain churn + fixture regeneration + cosmp_router default tier impact) is substantively larger than CAR Sub-box 2 substrate requirement
- Future cryptographic binding remains forward-queued per §Forward Queue if substrate justifies

### Alternative C — Skip AuditEvent.jurisdiction entirely (rejected)

Skip AuditEvent.jurisdiction; jurisdiction is implicit via `actor_entity_id → Entity.jurisdiction` lookup at audit-query time. REJECTED at substantive register substantively because contradicts CAR §1.6 verbatim "Add `jurisdiction: String?` ... to `Entity`, `MemoryCapsule`, **and `AuditEvent`**" canonical at CAR Bucket B substrate substantively.

### Alternative D — Mutable capsule jurisdiction (rejected per Q-NEW-4 LOCKED Option α)

Allow `MemoryCapsule.jurisdiction` mutation via `updateCapsule`. REJECTED at operator-tier register substantively because:
- Silent jurisdictional drift hazard: a capsule that started in US-FEDERAL silently mutating to EU-DE without explicit cross-region transfer workflow would invalidate compliance reports
- Cross-region transfer or jurisdiction reassignment is a separate explicit workflow with its own audit semantics canonical at substantive register substantively (forward-queued per §Forward Queue)
- Substrate-coherent at audit-chain immutability register substantively (audit_events_immutable trigger from ADR-0002 + LawfulBasis row append-only register from sub-phase 5 of Sub-box 3)

### Alternative E — Land Sub-box 2 BEFORE Sub-box 3 (rejected per Sub-box 3 pre-flight Q1 LOCKED Option A)

Land Entity / MemoryCapsule / AuditEvent / OrgSettings jurisdiction tagging + `assertJurisdictionalScope()` BEFORE Sub-box 3. Cleaner dependency-ordering per CAR §Recommended Sequencing; but pushes Sub-box 3 patent-evidence work back. CAR Sub-box 2 jurisdiction dependency on Sub-box 3 was narrow (only `LawfulBasis.jurisdiction_invoked` field); Sub-box 3 shipped its own self-contained jurisdiction field while broader Entity / Capsule / Audit jurisdiction tagging remained QUEUED. REJECTED at operator-tier register substantively per Sub-box 3 pre-flight Q1 LOCKED Option A canonical at substantive register substantively.

ADR-0037 lands at substrate-state ground truth canonical at substantive register substantively AFTER Sub-box 3 closure.

## Forward Queue

- **CAR Sub-box 2 sub-phases 2-6** (this ADR's implementation arc): schema → service helpers + defaulting → COSMP enforcement → REGULATOR integration → closure cascade
- **Physical data residency enforcement**: multi-region storage placement; multi-cloud-region orchestration substrate; routing-layer enforcement
- **Legal transfer determination engine**: Schrems II / GDPR Article 44-50 runtime evaluation (Standard Contractual Clauses validity; adequacy decisions; Transfer Impact Assessment automation)
- **Real-time country/legal rules engine**: per-country compliance rule database + runtime rule evaluation engine
- **Cross-region capsule transfer workflow**: explicit workflow for jurisdiction reassignment with audit semantics; replaces immutability-after-creation invariant for sanctioned transfers
- **Multi-jurisdiction capsule support**: one capsule with multiple jurisdictional anchors (e.g., dual-residency entities); requires data-model extension
- **canonical_record/1 jurisdiction binding**: cryptographic binding of jurisdiction at canonical_record/1 position 15 per Alternative B if future substrate justifies
- **Cross-Tenant Compliance Benchmarking patent-relevance analysis**: per CAR §1.6 forward path; "intersection of jurisdictional tagging with COSMP capsule provenance + cross-tenant hive intelligence is potentially patent-relevant"; future ADR if substrate justifies
- **AuditEvent.jurisdiction automatic operation-context propagation**: if sub-phase 3 of Sub-box 2 service-tier defaulting does not fully wire propagation from operation context (capsule.jurisdiction OR actor.entity.jurisdiction OR LawfulBasis.jurisdiction_invoked); refinement at sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] register substantively

## Post-Closure Implementation Lineage

CAR Sub-box 2 mini-arc closed at sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]` (this commit). All 9 sub-decisions RESOLVED:

- **Sub-decision 1** (single-String jurisdiction representation) — landed at sub-phase 2 `[CAR-SUB-BOX-2-SCHEMA]` `93f96ec`.
- **Sub-decision 2** (4 jurisdiction columns + 3 B-tree indexes at `entities` + `memory_capsules` + `audit_events`) — landed at sub-phase 2 `93f96ec`.
- **Sub-decision 3** (AuditEvent.jurisdiction row metadata only; canonical_record/1 preserved at 14 fields) — landed at sub-phase 2 + sub-phase 3 + verified at sub-phase 4 `[CAR-SUB-BOX-2-COSMP-ENFORCEMENT]` `6efdf44` (Section F.3 test confirms `event_hash` invariance when jurisdiction column differs).
- **Sub-decision 4** (MemoryCapsule.jurisdiction immutable after creation) — landed at sub-phase 3 `[CAR-SUB-BOX-2-SERVICES]` `3fab20d` (`CapsuleUpdateInput` has no jurisdiction field; immutability preserved by absence per RULE 18 substrate-coherence) + verified at sub-phase 4 (Section E.3 test).
- **Sub-decision 5** (service-tier defaulting cascade at `createEntity` + `createCapsule` + `writeAuditEvent` helpers) — landed at sub-phase 3 `3fab20d` (passthrough + owner Entity cascade + row metadata passthrough respectively) + sub-phase 4 (WriteService inline createCapsule cascade per Q2 LOCKED Option α — preserves WriteService audit/control semantics over @niov/database helper refactor).
- **Sub-decision 6** (NEW `assertJurisdictionalScope` pure-function helper at `apps/api/src/services/cosmp/jurisdiction-enforcement.ts`) — landed at sub-phase 3 `3fab20d`. Pure-function discriminated outcome; 6 BEAM-compatibility patterns from ADR-0026 §5 preserved by construction; portable to future Elixir Broadway pipeline per ADR-0028 forward-substrate.
- **Sub-decision 7** (COSMP enforcement matrix: NEGOTIATE start-check + readContent TOCTOU re-check + SHARE start-check + REVOKE start-check + WRITE create-time defaulting + WRITE update-time immutability enforcement) — landed at sub-phase 4 `6efdf44`. NEGOTIATE start-check runs BEFORE owner shortcut per Q8 LOCKED Option α (jurisdiction drift protection); readContent jurisdiction check runs BEFORE `contentStore.read` (no capsule content load before authorization per Sub-phase 6 §18 Whole-COSMP scalability discipline); SHARE per-capsule actor↔capsule only per Q5 LOCKED Option α (grantee jurisdiction checks forward-queued); REVOKE bounded-bridge capsule fetch per Q3 LOCKED Option α; WRITE update enforces actor↔existing jurisdiction per Q6 LOCKED Option α. `readMetadata` explicitly NOT enforced per Sub-decision 7 design (stays light; mirrors Sub-box 3 sub-phase 6 Q4 LOCKED Option α precedent).
- **Sub-decision 8** (REGULATOR LawfulBasis.jurisdiction_invoked ↔ MemoryCapsule.jurisdiction match) — landed at sub-phase 5 `[CAR-SUB-BOX-2-REGULATOR-INTEGRATION]` `7faf2ac` via basis-authoritative substitution at the 4 sub-phase-4 helper call sites (per Q1 LOCKED Option α). Null-capsule guard preserves Sub-phase 3/4 null/null backward compatibility (per Q-RULE-13-REGULATOR-NULL-CAPSULE-POLICY LOCKED Option α): substitution applies only when target capsule jurisdiction is non-null. NO change to `assertJurisdictionalScope` helper; NO change to `regulator-enforcement.ts` (active-basis + TAR-jurisdiction substrate preserved upstream).
- **Sub-decision 9** (dependency relationships — CAR Sub-box 2 ENABLES Sub-boxes 4 / 5 / 8 / 9) — RESOLVED at closure register substantively. Sub-boxes 4 / 5 / 8 / 9 are now dependency-unblocked at substrate-state ground truth canonical at substantive register substantively per CAR Bucket B Sub-box 2 Downstream Consumers enumeration.

**6-sub-phase mini-arc commit lineage**:

- Sub-phase 1 `[CAR-SUB-BOX-2-ADR]` — `c72fabd` — ADR-0037 lands as Proposed; CAR Sub-box 2 row IN FLIGHT; ADR-0036 §References RULE 14 back-cite landed; docs-only.
- Sub-phase 2 `[CAR-SUB-BOX-2-SCHEMA]` — `93f96ec` — Prisma schema +4 nullable jurisdiction columns (Entity / MemoryCapsule / AuditEvent / OrgSettings) + 3 B-tree indexes; `ORG_SETTINGS_DEFAULTS` + `MergedOrgSettings` + `getOrgSettingsOrDefaults` substrate-coherence amendment per Q-RULE-13-ORG-SETTINGS-DEFAULTS LOCKED Option α (path scope expansion 1 → 2).
- Sub-phase 3 `[CAR-SUB-BOX-2-SERVICES]` — `3fab20d` — NEW `apps/api/src/services/cosmp/jurisdiction-enforcement.ts` + `CreateEntityInput.jurisdiction` passthrough + `CreateCapsuleInput.jurisdiction` owner Entity cascade + `WriteAuditEventInput.jurisdiction` row-metadata passthrough + NEW `tests/unit/jurisdiction.test.ts` (17 tests) + narrow `@niov/api` re-export per Q-RULE-13-INTERNAL-HELPER-TEST-IMPORT LOCKED Option α (path scope expansion 5 → 6).
- Sub-phase 4 `[CAR-SUB-BOX-2-COSMP-ENFORCEMENT]` — `6efdf44` — NEGOTIATE start-check + readContent TOCTOU re-check + SHARE per-capsule + REVOKE bounded-bridge fetch + WRITE create cascade + WRITE update enforcement + `getCapsuleMetadata` select extension (jurisdiction only; full projection repair forward-queued per D-COSMP-METADATA-SELECT-CLAUSE-DRIFT) + 4 jurisdiction codes mapped to HTTP 403 at `cosmp.routes.ts` statusForCode + NEW `tests/integration/jurisdiction-cosmp-enforcement.test.ts` (20 tests).
- Sub-phase 5 `[CAR-SUB-BOX-2-REGULATOR-INTEGRATION]` — `7faf2ac` — basis-authoritative actor jurisdiction substitution for REGULATOR actors at 4 helper call sites + null-capsule backward-compat guard + REGULATOR jurisdiction-denial audit enrichment (lawful_basis_id + lawful_basis_chain_hash + lawful_basis_jurisdiction details) + Section I (7 integration tests) appended to `tests/integration/regulator-cosmp-enforcement.test.ts`.
- Sub-phase 6 `[CAR-SUB-BOX-2-CLOSURE]` — this commit — docs-only closure cascade: ADR-0037 Status Proposed → Accepted + this Post-Closure Implementation Lineage section + `docs/reference/section-12-progress.md` CAR Sub-box 2 row CLOSED + `docs/architecture/README.md` + `CLAUDE.md` ADR catalog ADR-0037 entry minimum-touch + `docs/CURRENT_BUILD_STATE.md` minimum-touch closure entry.

**Verification matrix at closure**:

- TypeScript baseline: 12 (preserved at every sub-phase landing; Sub-phase 4 surfaced substrate improvement at `getCapsuleMetadata` missing-fields list — jurisdiction removed from the list — without count drift).
- Unit tier: 508/508 PASS.
- Integration tier: 198 + 1 skipped PASS (171 pre-Sub-box-2 + 20 sub-phase 4 jurisdiction-COSMP-enforcement + 7 sub-phase 5 REGULATOR Section I).
- Elixir `cosmp_router` default tier: 137/0 PASS (canonical_record/1 14-field byte-equivalence + 12 fixture pairs UNCHANGED across all 6 sub-phases).
- CI green at every sub-phase landing (commits `c72fabd` + `93f96ec` + `3fab20d` + `6efdf44` + `7faf2ac` + this commit).

**Substrate-build observations forward-queued (commit-body-only register; NOT promoted to ADR-0035 §9 per Q-NEW-9 sub-phase 1 LOCK + subsequent sub-phase LOCKs)**:

1. **D-SCHEMA-DEFAULT-CONSTANT-COHERENCE-DRIFT** (sub-phase 2) — adding a nullable column to a Prisma model with a `satisfies Omit<Model, ...>` frozen-defaults anchor in service code triggers TS baseline drift unless the defaults constant + interface + row-mapping constructor are all updated together. Surfaced via Q-RULE-13-ORG-SETTINGS-DEFAULTS at sub-phase 2; resolved by 3-site coherence MOD in same file.
2. **D-INTERNAL-HELPER-UNIT-TEST-IMPORT-CONVENTION** (sub-phase 3) — pre-flight source maps for new internal helpers under `apps/api/src/services/cosmp/*` must surface whether the helper will be directly unit-tested. If yes, either export via the workspace package or explicitly lock a deep-import exception. The Sub-box 3 `regulator-enforcement.ts` precedent was indirectly tested only; the Sub-box 2 `jurisdiction-enforcement.ts` helper required direct pure-function tests.
3. **D-COSMP-METADATA-SELECT-CLAUSE-DRIFT** (sub-phase 4) — `getCapsuleMetadata` at `packages/database/src/queries/capsule.ts` has an explicit `select` clause that still omits fields expected by the `CapsuleMetadata = Omit<MemoryCapsule, "storage_location">` type (tokens / tokens_tokenizer / commitment_date / created_by / +5 more). Sub-phase 4 added only `jurisdiction: true` because NEGOTIATE needs it for enforcement. Full metadata projection repair remains forward-queued.
4. **D-REGULATOR-ACTOR-JURISDICTION-POLICY-DECISION** (sub-phase 5) — for REGULATOR actor COSMP access, validated `LawfulBasis.jurisdiction_invoked` acts as the actor's jurisdictional authority for data-tier jurisdiction enforcement. REGULATOR Entity.jurisdiction is not required to match the capsule jurisdiction when a valid lawful basis is present. Surfaced as substrate design decision at sub-phase 5 Q1.
5. **D-REGULATOR-NULL-CAPSULE-BACKWARD-COMPAT-BOUNDARY** (sub-phase 5 RULE 13 refinement) — basis-authoritative REGULATOR jurisdiction substitution must respect the null/null backward-compat boundary established in Sub-phase 3 and Sub-phase 4. Substitution applies when target capsule jurisdiction is non-null; null capsule jurisdiction preserves legacy null/null behavior so existing Sub-box 3 REGULATOR fixtures with null capsule jurisdiction remain green.

**Forward queue restated at closure register** (from §Forward Queue above; preserved verbatim):

- Physical data residency enforcement (multi-region storage placement)
- Legal transfer determination engine (Schrems II / GDPR Article 44-50 runtime evaluation)
- Real-time country/legal rules engine
- Cross-region capsule transfer workflow
- Multi-jurisdiction capsule support (one capsule with multiple jurisdictional anchors)
- canonical_record/1 jurisdiction binding (cryptographic) if future evidence requires
- Cross-Tenant Compliance Benchmarking patent-relevance analysis
- AuditEvent.jurisdiction automatic operation-context propagation refinement
- GLOBAL wildcard / jurisdiction vocabulary lock
- Grantee↔capsule or grantee↔actor jurisdiction checks for SHARE if future policy requires
- Full `getCapsuleMetadata` projection repair (D-COSMP-METADATA-SELECT-CLAUSE-DRIFT)

**What CAR Sub-box 2 substrate does NOT claim** (preserved from §Substrate-Honest Distinctions):

- Legal compliance certification
- Physical data residency enforcement (multi-region storage placement)
- Full FedRAMP / CMMC / GDPR compliance certification
- Legal transfer determination
- Real-time country/legal rules engine
- Multi-jurisdiction capsule support
- Cross-region transfer workflow
- canonical_record/1 jurisdiction binding (cryptographic)
- Per-target LawfulBasis binding
- Grantee jurisdiction checks at SHARE
- GLOBAL wildcard support
- Sub-boxes 4 / 5 / 8 / 9 implementation
- Full DMW-to-DMW orchestration
- BEAM / Broadway high-volume orchestration in this mini-arc
- Federation Cloud monetization
- External PKI / EU eIDAS / national registry integration
- Direct patent relevance

## References

- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` §1.6 (Regional / Sovereignty Boundaries) + §2.4 (Jurisdictional Scope) + Bucket B Sub-box 2 — source-of-substance for the architectural why
- `docs/architecture/decisions/0036-regulator-principal-lawful-basis-attestation-pattern.md` §Substrate-Honest Distinctions — CAR Sub-box 2 was preserved as QUEUED at Sub-box 3 closure; this ADR closes the queued reference
- `docs/architecture/decisions/0026-dual-control-middleware-pattern.md` §5 — 6 BEAM-compatibility patterns inherited at sub-phase 3 of Sub-box 2 `assertJurisdictionalScope` helper
- GDPR Articles 44-50 (international data transfers) — citation only; no compliance claim
- Schrems II decision (CJEU C-311/18, July 2020) — citation only; no compliance claim
- FedRAMP boundary requirements — citation only; no certification claim
- CMMC 2.0 Level 2 SC.L2-3.13 (system / communications boundary) — citation only; no certification claim
- `CLAUDE.md` — RULE 0 (humans are sovereign), RULE 4 (audit trail is sacred), RULE 9 (modular connections), RULE 13 (substrate-honest discipline), RULE 14 (bidirectional citation discipline)

**Bidirectional citations (cited from):**

- ADR-0036 §References "Bidirectional citations (cited from)" block — ADR-0037 cites ADR-0036 §Substrate-Honest Distinctions canonical at substantive register substantively where Sub-box 2 was preserved as QUEUED at Sub-box 3 closure (back-cite landed at this commit per RULE 14)
- `docs/reference/section-12-progress.md` CAR Sub-box 2 row (forward-queued for closure cascade at sub-phase 6)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` §1.6 + §2.4 + Bucket B Sub-box 2 — source-of-substance; HISTORICAL REVIEW ARTIFACT preserved unchanged
