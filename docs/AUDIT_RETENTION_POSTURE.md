# Audit Retention Posture

This document is the authoritative reference for Foundation's
audit-event retention behavior. SSP authors, FedRAMP 3PAOs, SOC 2
auditors, and procurement reviewers should cite this document
together with `packages/database/src/queries/audit.ts` (the
canonical audit chain implementation) as the retention evidence
package.

12C.0 Item 6 closes Compliance Architecture Review finding 1.3
YELLOW. The substrate already exceeds every commercial and
government retention requirement; this document captures the
posture so it is a citable evidence artifact rather than a
reading-the-code exercise.

## 1. Statement of Posture

**Foundation's `audit_events` table is append-only and is never
deleted.** No automated retention rotation, no scheduled archival,
no row-level expiration. Audit events accumulate indefinitely from
the moment of creation through the lifetime of the deployment.

This posture **exceeds** every retention requirement Foundation's
target compliance frameworks specify. It is the strongest possible
retention guarantee a system can offer for tamper-evident audit
records.

## 2. Mechanism

Three substrate properties make the posture cryptographically and
operationally robust:

### 2.1 Append-only Postgres trigger

`packages/database/src/queries/audit.ts:228-235` installs a
`BEFORE DELETE` trigger via the `audit_events_immutable()` plpgsql
function: any DELETE attempt against the `audit_events` table
raises an exception (`'audit_events is append-only; UPDATE and
DELETE are not permitted'`). The trigger applies to every row
regardless of role; only DDL-level privileges (DROP TRIGGER) can
disable it, and that requires Postgres superuser access.

A parallel `BEFORE UPDATE` trigger at the same location prevents
in-place modification: rows are insertable but not mutable.

### 2.2 SHA-256 hash chain

`packages/database/prisma/schema.prisma:249-271` (the AuditEvent
model) stores `event_hash` and `previous_event_hash` columns on
every row. The hash is computed via the canonical-form pattern at
`packages/database/src/queries/audit.ts:217-244`: every row's
hash incorporates the previous event's hash, forming a chain. Any
mutation (even bypassing the trigger) invalidates the chain and
is detectable via `verifyAuditChain()`
(`packages/database/src/queries/audit.ts:443-487`).

The hash function is SHA-256 (FIPS 180-4 approved) per
`packages/auth/src/crypto-config.ts` `HASH_ALGORITHM` constant.
Cross-reference `docs/FIPS_DEPLOYMENT_POSTURE.md` for the full
algorithm posture.

### 2.3 No retention column by design

`packages/database/prisma/schema.prisma:249-271` deliberately
omits any retention-related columns: no `expires_at`, no
`retain_until`, no `archival_status`. The schema is structurally
incapable of expressing "this row should be deleted at time T."
This is the architectural property that makes the posture
absolute rather than configurable.

## 3. Compliance Mapping

| Framework / Standard | Requirement | Foundation status |
|---|---|---|
| **SOC 2 Type II CC4.1** | Monitoring activities; entity must demonstrate ongoing monitoring of controls. | **EXCEEDS** -- audit events accumulate indefinitely, providing complete monitoring history. |
| **SOC 2 Type II CC7.2** | System monitoring; entity must monitor system components for anomalies. | **EXCEEDS** -- the `ANOMALY_DETECTED` event type is hash-chained alongside the rest of the audit-of-record. |
| **FedRAMP Moderate AU-11** | 1 year online retention; 3 years total retention. | **EXCEEDS** -- indefinite retention; no rotation. |
| **FedRAMP High AU-11** | 3 years online retention; 12 years total retention. | **EXCEEDS** -- indefinite retention; no rotation. |
| **NIST 800-53 Rev 5 AU-9** | Protection of audit information. | **EXCEEDS** -- append-only trigger + hash chain provide both database-level and cryptographic protection. |
| **NIST 800-53 Rev 5 AU-9(2)** (FedRAMP High) | Audit records on separate physical systems. | **NOT YET** -- single-database posture. External Merkle anchoring is deferred to Section-level future work per `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Bucket C. |
| **NIST 800-53 Rev 5 AU-10** | Non-repudiation of audit events. | **EXCEEDS** for FedRAMP Moderate -- hash chain anchors non-repudiation cryptographically. |
| **HIPAA 164.316(b)(2)(i)** | 6-year retention of policies + audit records. | **EXCEEDS** -- indefinite retention. |
| **SOX Section 802** | 7-year retention of financial audit trails. | **EXCEEDS** -- indefinite retention; the audit chain covers all PERMISSION_CREATED / PERMISSION_REVOKED / DATA_MONETIZED events relevant to SOX scope. |
| **GDPR Article 5(1)(e)** | Storage limitation principle: personal data kept no longer than necessary. | **REQUIRES PSEUDONYMIZATION** -- see Section 4 below. |
| **CCPA / CPRA § 1798.105** | California right to delete. | **REQUIRES PSEUDONYMIZATION** -- see Section 4 below. |
| **LGPD Article 18 / UK GDPR Article 17** | Brazil / UK right to erasure. | **REQUIRES PSEUDONYMIZATION** -- see Section 4 below. |
| **ISO 27001:2022 Annex A.5.33** | Protection of records. | **EXCEEDS** -- triggers + hash chain meet protection-of-records control fully. |

## 4. GDPR Article 17 Tension and Resolution

GDPR Article 17 right-to-be-forgotten requires removing personal
data of EU data subjects on request. **This requirement directly
conflicts with the indefinite-retention + append-only posture**
described above.

The resolution is documented in detail in
`docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Cross-Cutting Tension 1
and Patent-Relevance Catalog Family 4: **pseudonymization-with-
verifiable-attestation**. The structural moves are:

1. The audit chain hash covers UUIDs only (already true today --
   `actor_entity_id`, `target_entity_id`, `target_capsule_id` are
   `String? @db.Uuid`). PII (email, display_name, profile fields)
   lives on `Entity` / `EntityProfile` rows referenced by UUID,
   not embedded in audit rows.
2. Section 12.5 Sub-box 5 moves PII columns to a separate
   `EntityIdentity` table with FK to `Entity.entity_id`. Erasure
   = hard-deletion of the `EntityIdentity` row; the `Entity` row
   remains (with `status = DELETED`) so audit references resolve
   to a UUID with `[redacted under GDPR Article 17]` display.
3. Sub-box 5 also constrains `AuditEvent.details` to typed
   schemas (one TypeScript discriminated union per
   `AuditEventType`) so the free-Json escape hatch cannot leak
   PII into the audit chain.
4. A new `ERASURE_EXECUTED` `AuditEventType` chained in audit-
   of-record records that erasure happened -- itself a
   verifiable attestation in the chain.

Until Sub-box 5 lands, the audit chain integrity property
prevails; data-subject erasure requests for EU tenants are
operationally tracked outside the platform. Sub-box 5 is the
priority Section 12.5 sub-box that unblocks EU enterprise tenant
onboarding.

## 5. Operational Concerns

The posture has two operational consequences worth surfacing in
the runbook:

### 5.1 Storage scaling

Indefinite retention means `audit_events` grows unbounded over
the lifetime of a deployment. At Foundation's current event
volume profile (rough estimate: ~10-100 events per
member-active-hour), a 1000-member tenant active 8 hours/day, 250
days/year produces ~20-200M events/year, ~2-20GB/year of audit
storage.

For deployments running 5+ years, hot/cold tier migration to S3
Glacier / GovCloud archive class becomes operationally relevant.
This is **Section-level future work** (per Compliance
Architecture Review Bucket C); not blocking for current commercial
+ government Moderate deployments.

### 5.2 Per-tenant retention configuration

Some enterprise customers may wish to configure their OWN
retention policy (e.g., "delete our audit events after 7 years
for SOX compliance posture documentation purposes"). Foundation
does not currently support per-tenant configurable retention.

This is a **Section 12.5 sub-box candidate** (`OrgRetentionPolicy`
model with a per-tenant retention-window config). Not in the
12C.0 batch. The OrgRetentionPolicy would NOT actually delete
underlying rows -- it would surface "displayed retention window"
metadata in compliance reports for tenants who need to cite a
specific retention figure to their auditors. The append-only
posture remains absolute.

## 6. Cross-Reference

- `packages/database/src/queries/audit.ts` -- the canonical audit
  chain implementation (append-only triggers, SHA-256 hash
  chain, advisory-lock serialization, verifyAuditChain)
- `packages/database/prisma/schema.prisma` lines 249-271 -- the
  AuditEvent model schema
- `docs/FIPS_DEPLOYMENT_POSTURE.md` -- cryptographic algorithm
  posture for the SHA-256 hash chain
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Section 1 Dimension
  1.2 -- original review finding GREEN that 12C.0 Item 6 captures
  as a citable evidence artifact
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Section 1 Dimension
  1.3 -- original review finding YELLOW (retention posture
  documentation) that 12C.0 Item 6 closes
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Cross-Cutting Tension 1
  -- the GDPR Article 17 resolution pattern (Section 12.5
  Sub-box 5)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Patent-Relevance
  Catalog Family 4 -- the pseudonymization-with-verifiable-
  attestation patent territory
