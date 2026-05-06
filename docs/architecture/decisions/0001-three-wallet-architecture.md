# ADR-0001: Three-wallet architecture

## Status

Accepted Q1 2026 (foundational)

## Context

Memory ownership in an enterprise AI system has three distinct
claimants — the org, the employee, and the digital twin.
Collapsing these into one wallet creates the wrong portability
semantics on employee departure. Specifically: if the company
keeps everything, the employee loses portable knowledge they
helped create; if the employee keeps everything, the company
loses institutional learnings that were paid for; if a digital
twin is shared, neither side has clean attribution for what the
twin did or learned.

This tension surfaced during early Otzar architecture
exploration. The three-claimant problem is structural, not
implementation-specific — any AI memory system that handles
work data and personal data has to resolve it. The patent-
relevant claim coverage in US 12,517,919 required an explicit
enumeration of wallet types, not a single opaque storage
primitive.

GDPR Article 20 (right to data portability) and emerging US
state laws on employee-data-portability (e.g., California AB
1023 family) create regulatory pressure on the employee-wallet
portability property. SOC 2 CC6.7 (data classification) creates
regulatory pressure on the org-wallet boundary property.

## Decision

Foundation enforces three distinct DMW (Decentralized Memory
Wallet) types:

- **Enterprise DMW**: org-owned, stays with the company. Zero
  payload by default; stores org-level governance + structural
  learnings + compliance posture.
- **Personal DMW**: individual-owned, portable. Stores employee
  work patterns, preferences, relationships, identity.
- **Device DMW**: device-bound, non-portable. Stores
  device-specific state.

Digital twins are `AI_AGENT` entities with their own Personal
DMW, "fused" with the employee for work but portable with the
employee on departure. The fusion is enforced via permissions
on the Foundation Hive (where digital twins coordinate); REVOKE
removes the fusion instantly on employee departure.

## Consequences

### Easier

- Employee-data-portability complies with GDPR Article 20 by
  construction (Personal DMW is portable)
- Org institutional knowledge persists across employee turnover
  (Enterprise DMW stays)
- Digital twin attribution is unambiguous (each twin has its own
  Personal DMW; outcomes attribute to the owning entity)
- Patent claim coverage in US 12,517,919 is implementable

### Harder

- Three wallet types means three sets of permissions, three sets
  of audit emissions, three sets of capsule-type validation rules
- Cross-wallet capsule reach must be prevented at the Foundation
  layer (no application code crosses wallet boundaries; COSMP
  operations enforce this)
- Onboarding flows must establish all three wallets atomically
  (Dandelion onboarding pattern handles this — see user memory
  #21)

## Alternatives Considered

### Single shared wallet

Rejected. Wrong portability semantics on employee departure
(either company or employee loses data).

### Company-owned only with employee read access

Rejected. Violates GDPR Article 20 and emerging US employee-
data-portability laws.

### Two-wallet (Enterprise + Personal) with twins as Personal-DMW capsules

Rejected. Twins generate attribution that mixes human and AI
accountability; a separate `AI_AGENT` entity with its own
Personal DMW preserves attribution clarity for SOC 2 / audit
purposes.

## References

- User memory #20 (Otzar architecture: AGI for Work)
- User memory #22 (three-wallet architecture details)
- COSMP specification (external; defines the seven operations
  that mediate cross-wallet interaction)
- Patent US 12,517,919 (claim coverage of wallet enumeration)
- ADR-0009 (COSMP 7-operation enumeration; relates the seven
  operations to wallet boundaries)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Decentralized Memory Wallet
  (DMW)", "Enterprise DMW", "Personal DMW", "Device DMW",
  "Digital Twin Wallet", "Three-Wallet Architecture"
