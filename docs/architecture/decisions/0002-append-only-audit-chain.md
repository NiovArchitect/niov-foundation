# ADR-0002: Append-only audit chain with BEFORE DELETE trigger

## Status

Accepted Q1 2026 (foundational)

## Context

SOC 2 CC4.1 / CC7.2, FedRAMP Moderate/High AU-11, NIST 800-53
AU-9 / AU-9(2) / AU-10, HIPAA 164.316(b)(2), SOX Section 802 all
require tamper-evident audit logs. Application-layer "do not
delete" enforcement is insufficient because a privileged DB user
(or a compromised one) can bypass it.

Two failure modes need protection:

- **Direct deletion**: an attacker DELETEs audit rows to hide
  their activity.
- **Modification**: an attacker UPDATEs audit rows to falsify a
  timeline.

Tamper evidence must be cryptographic (so modification surfaces
even when the attacker also forges the deletion log) and
structural (so deletion is prevented at the database layer, not
the application layer).

The Foundation `audit_events` table is the single source of
truth for who did what to which entity at what time. Section
12.5 Compliance Architecture Review Dimension 1.3 (audit log
retention) flagged this dimension as YELLOW remediation, closed
by Section 12C.0 Item 6 (`docs/AUDIT_RETENTION_POSTURE.md`).

## Decision

Foundation enforces audit chain integrity via two coordinated
mechanisms:

- **Postgres BEFORE DELETE trigger** on the `audit_events` table
  that raises an exception unconditionally. See
  `packages/database/src/queries/audit.ts:228-235` (the trigger
  installation path; the trigger itself is created via
  migration).
- **SHA-256 hash chain** where each row's hash incorporates the
  previous row's hash. Implemented in
  `packages/database/src/queries/audit.ts`. Chain reconstruction
  via `verifyAuditChain` detects modification.

`writeAuditEvent` (`audit.ts:251`) is the only legal write path;
direct `prisma.auditEvent.create` is forbidden by convention.
The `chainKey` priority (`actor_entity_id` → `system_principal`
→ legacy `SYSTEM_CHAIN_KEY`) is a separate decision documented
in ADR-0006.

## Consequences

### Easier

- Tamper attempts are both prevented (deletion) AND detectable
  (modification), satisfying SOC 2 / FedRAMP / HIPAA / SOX
  retention posture
- Indefinite retention by default; storage scaling becomes a
  future operational concern not a compliance concern
- `audit_events` is greppable as the single source of truth for
  forensic investigation

### Harder

- Indefinite retention means storage scales with audit volume;
  hot/cold tier migration deferred to future Section-level work
- Per-tenant retention configuration cannot be added without
  amending or superseding this ADR (data deletion is a separate
  concern from audit retention; Sub-box 5 / Family 4 handles
  GDPR Article 17 via pseudonymization-with-attestation, not
  deletion)
- Schema migrations on `audit_events` require careful
  consideration of the trigger and chain semantics

## Alternatives Considered

### Application-level "do not delete" enforcement

Rejected. A privileged DB user (or compromised credential)
bypasses it. Insufficient for FedRAMP AU-11 posture.

### Soft-delete with retention policy

Rejected. Weakens FedRAMP AU-11 posture (audit logs become
deletion-eligible after retention window). Also incompatible
with SOX Section 802's 7-year requirement combined with HIPAA's
6-year requirement on intersecting data.

### Hash chain without BEFORE DELETE trigger

Rejected. Hash chain detects modification but not deletion of
the chain's terminal entries; the trigger prevents the deletion
attack vector entirely. Defense in depth requires both.

## References

- `packages/database/src/queries/audit.ts:228-235` (BEFORE
  DELETE trigger location)
- `packages/database/src/queries/audit.ts:251` (`writeAuditEvent`
  chainKey priority)
- `docs/AUDIT_RETENTION_POSTURE.md` (committed substrate;
  compliance mapping table)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Dimension 1.3 (the
  YELLOW remediation that this ADR closes)
- ADR-0006 (chainKey priority)
- `f3359fb` (Section 12C.0 Commit 2; closes compliance review
  Dimension 1.3 via Item 6)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Audit Chain", "Audit Event",
  "Hash Chain", "writeAuditEvent"
- `docs/reference/architectural-anchors.md` → DRIFT 12 entry
  (`writeAuditEvent` backwards-compat fallback) references this
  ADR
- ADR-0006 (cross-org leak prevention; cites this ADR for the
  audit-substrate context that chainKey priority builds on)
- ADR-0026 (dual-control middleware pattern; landed at sub-phase H
  `[SEC-DUAL-CONTROL-ADR]`) — the `requireDualControl` Fastify
  preHandler writes its Zone U1 audit-event sequence
  (`DUAL_CONTROL_VERIFICATION_PRE` → `DUAL_CONTROL_ESCALATION_LOOKUP`
  → `DUAL_CONTROL_APPROVAL_VERIFIED` → `DUAL_CONTROL_HANDLER_DELEGATED`
  | `DUAL_CONTROL_HANDLER_DENIED`, plus the §4-adjacent
  `DUAL_CONTROL_TRANSIENT_FAILURE` failure-mode marker) into this
  append-only chain; the BEFORE DELETE trigger here is the
  immutability the event-sourced-audit BEAM-compatibility pattern
  (ADR-0026 §Decision pattern 4) relies on.
- ADR-0051 (Otzar Chat Transparency and COE-Governed Retrieval
  Surfacing) — cites this ADR for the append-only audit chain;
  ADR-0051 surfaces COE-governed context metadata additively and
  adds **no new audit literal** (RULE 4 is satisfied by the existing
  `CAPSULE_CONTENT_READ` + `CONVERSATION_STARTED` events; no
  ADR-0002 amendment).
- ADR-0052 (Otzar Domain General Intelligence and Governed
  Synchronicity) — the doctrine ADR cites this append-only audit
  chain as the governance / proof / RULE 4 backbone for governed,
  auditable enterprise intelligence.
