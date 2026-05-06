# ADR-0008: `EntityComplianceProfile` is org-level, not aggregated

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 2 @ `f3359fb`; DRIFT 15
resolution)

## Context

`EntityComplianceProfile` attaches compliance-framework
eligibility to entities. Two structural options exist:

- **Per-member.** Each org member has their own profile listing
  the frameworks they're individually subject to. Org posture
  is computed by aggregation across members.
- **Org-level.** The org entity has one profile listing the
  frameworks it's subject to. Member posture is derived from
  org posture + member-specific audit events.

The per-member option is misleading because compliance
frameworks attach to organizations, not individual employees.
SOC 2 attests to an org's controls; FedRAMP authorizes an org's
system; HIPAA's covered-entity status is org-level; ISO 27001
certifies an org's ISMS. Per-member profiles would create a
fiction of per-employee compliance posture that doesn't exist
in any framework's actual governance model.

The decision surfaced as DRIFT 15 during Section 12C.0 Item 9
(GET /api/v1/compliance/state). Initial implementation
considered querying per-member profiles and aggregating.
Pre-flight grep caught the structural mismatch with how
compliance frameworks actually work. The resolution makes
`EntityComplianceProfile` attach to the org entity and derives
per-member views from the combination of org posture + member-
specific audit events.

## Decision

Foundation enforces
`EntityComplianceProfile.entity_id == orgEntityId`. The profile
model has one row per org, listing the frameworks that org is
subject to (SOC 2, FedRAMP Moderate/High, ISO 27001, HIPAA,
etc.).

`getComplianceState(orgEntityId)` and
`getComplianceStateForCaller(sessionToken)` (the service-owned
auth gate variant from ADR-0004) both look up the org's single
profile and compute per-framework verdicts based on recent
`COMPLIANCE_CHECK_PASSED` / `COMPLIANCE_CHECK_FAILED` audit
events within a configurable window (default 24 hours).

Per-member views are derived at query time, not stored. SOC 2
user-access reviews query org posture + member-specific audit
events; the derivation is the source of truth.

## Consequences

### Easier

- Compliance posture matches how frameworks actually attest
  (org-level, not per-employee fiction)
- One row per org per profile — storage scales with org count,
  not member count
- Framework changes (adding SOC 2 Type II to an org's posture)
  require one row update, not per-member updates
- SOC 2 user-access reviews query org posture + member-specific
  audit events; derivation provides the per-member view without
  duplicating storage

### Harder

- Per-member views are computed, not stored — read-side cost
  scales with audit event volume per member per framework
- Adding a framework that DOES attach to individuals (a future
  hypothetical) would require a separate model, not extending
  `EntityComplianceProfile`
- The 24-hour evaluation window default is tunable per call
  but creates a denormalized cache opportunity later (Section
  12.5 Sub-box 7's periodic re-evaluation loop is the right
  place for that)

## Alternatives Considered

### Per-member `EntityComplianceProfile` aggregated to org

Rejected. Storage overhead scales with member count; sync
complexity when members join/leave; doesn't match how frameworks
actually attest.

### Org-only with no per-member visibility

Rejected. SOC 2 user-access reviews need per-member views for
least-privilege attestation. Per-member derivation from audit
events satisfies this without per-member profile storage.

### Hybrid (org profile + per-member exception list)

Rejected. Adds complexity for a use case that doesn't exist (no
current framework requires per-member exception flagging within
an org's posture).

## References

- `apps/api/src/services/compliance/compliance.service.ts:483-578`
  (`getComplianceState` and `getComplianceStateForCaller`)
- `packages/database/prisma/schema.prisma`
  (`EntityComplianceProfile` model with `entity_id` foreign key
  to Entity)
- `f3359fb` (Section 12C.0 Commit 2; DRIFT 15 resolution)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Dimension 3.3
  (continuous compliance state; Item 9 closure)
- ADR-0004 (service-owned auth gate;
  `getComplianceStateForCaller` follows that pattern)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "EntityComplianceProfile"
  (glossary amendment lands in same commit as this ADR)
