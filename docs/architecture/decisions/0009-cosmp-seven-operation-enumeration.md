# ADR-0009: COSMP 7-operation enumeration (locked)

## Status

Accepted Q4 2025 (locked by patent US 12,517,919)

## Context

COSMP (Contextual Orchestration and Scoped Memory Protocol) is
the protocol layer that mediates all interactions with Memory
Capsules. The protocol's contextual-orchestration responsibility
is fulfilled by the Contextual Orchestration Engine (COE) — see
glossary entry for the protocol/engine kinship.
Capsule lifecycle has a stable, complete operation set that all
applications must use. Patent application for US 12,517,919
required this enumeration to be locked: arbitrary operation
extension would weaken the patent claim's specificity.

Three constraints shaped the enumeration:

- **Completeness.** Every legitimate capsule lifecycle action
  must map to one of the operations.
- **Non-overlap.** Each operation has unambiguous semantics; no
  two operations cover the same state transition.
- **Patent claim coverage.** The enumeration is part of the
  patent's novelty claim and cannot reduce without weakening
  it.

The seven operations satisfy all three constraints. Each
operation has a specific access pattern (who can call it, what
state changes, what audit emissions fire), and the audit chain
distinguishes between operations via the AuditEventType
enumeration.

The 7-layer Memory Capsule structure (Payload, Metadata, Rules,
Relations, Time, Permissions, Audit) referenced in patent
US 12,517,919 maps to the seven operations indirectly: each
operation interacts with a specific layer set as its primary
substrate. See `docs/reference/glossary.md` → "Memory Capsule"
for the schema mapping of these conceptual layers to the
implementation.

## Decision

COSMP defines exactly seven operations:

- **AUTHENTICATE.** Establish entity identity and session.
- **NEGOTIATE.** Agree on access scope and terms before capsule
  access.
- **READ.** Retrieve capsule payload (subject to permissions).
- **WRITE.** Create or update capsule payload.
- **SHARE.** Grant cross-entity capsule access via Permission
  rows.
- **REVOKE.** Remove cross-entity capsule access.
- **AUDIT.** Query audit events (read-only access to the audit
  chain).

Additions to the enumeration require patent counsel review
(Edmond DeFrank) and an ADR superseding this one. Reductions
are forbidden — the enumeration count is part of patent claim
coverage.

The seven operations are documented at the protocol level (in
the COSMP specification) and at the implementation level (the
COSMP service classes in `apps/api/src/services/cosmp/`).

## Consequences

### Easier

- All capsule lifecycle code uses the same seven operations; no
  proliferation of bespoke methods
- Audit chain attribution is unambiguous (each operation maps
  to specific `AuditEventType` values)
- Patent claim coverage is implementable and verifiable
- New applications onboarding to COSMP have a short, fixed
  operation surface to learn

### Harder

- New capsule lifecycle needs that don't fit one of the seven
  operations cannot be added without patent counsel review
- The enumeration cannot be modified by application developers;
  Foundation owns it
- Cross-cutting concerns (e.g., bulk operations) must compose
  the existing operations rather than introducing new ones

## Alternatives Considered

### 5-operation enumeration (combine SHARE + REVOKE into a single PERMIT operation)

Rejected. Insufficient coverage; SHARE and REVOKE have distinct
audit-chain semantics and access-pattern requirements.

### 9-operation enumeration (split READ into READ_PAYLOAD + READ_METADATA, split WRITE into CREATE + UPDATE)

Rejected. Overlap creates semantic ambiguity; payload and
metadata are attributes of the same access, not separate
operations. Implementation can distinguish CREATE vs UPDATE
within WRITE via existing version semantics.

### Open-ended operation registry

Rejected. Defeats the patent claim's specificity; creates audit
chain attribution ambiguity.

## References

- `packages/database/src/queries/audit.ts` (`AuditEventType`
  enumeration)
- `apps/api/src/services/cosmp/` (READ/WRITE/SHARE/REVOKE
  service classes)
- Patent US 12,517,919 (claim coverage of the seven-operation
  enumeration)
- COSMP specification (external; defines protocol-level
  semantics)
- User memory #18 (NIOV v3 substrate; documents the seven
  operations)
- ADR-0001 (three-wallet architecture; the seven operations
  mediate cross-wallet interaction)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "COSMP" (operation enumeration
  reference)
- `docs/reference/glossary.md` → "Memory Capsule" (cites
  ADR-0009 for the seven-operation enumeration relating to the
  7-layer patent claim)
- ADR-0001 (cites ADR-0009 for the COSMP operation enumeration
  that mediates wallet boundaries; back-cites this ADR by
  default per primer)
