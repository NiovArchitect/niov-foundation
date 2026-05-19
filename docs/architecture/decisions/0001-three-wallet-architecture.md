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

## Amendment 1 (2026-05-19) — Dual-context AI_AGENT routing per ADR-0046

Per ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
Sub-arc 2 Gap 6), the canonical AI_AGENT-to-wallet mapping is
**dual-context, not single-default**. This Amendment 1 preserves
this ADR's original Personal DMW / digital twin claim and narrows
it to the **Personal AI Agent context**, with a companion
**Enterprise AI Agent context** added at canonical-prose register
substantively. The §Decision body above is preserved verbatim;
this Amendment 1 augments it.

**Canonical dual-context AI_AGENT routing (per ADR-0046):**

- **Personal AI Agent context** — EntityType = `AI_AGENT`,
  WalletType = `PERSONAL`, EntityMembership(parent=`PERSON` owner,
  child=`AI_AGENT` twin). `niov_can_access_contents = true` per
  `defaultNiovAccessFor(PERSONAL)`. This is the canonical digital
  twin pattern described in this ADR's §Decision body. LIVE in
  production at `apps/api/src/services/governance/twin.service.ts:
  189-191` (explicit `wallet_type: "PERSONAL"` override). Matches
  the GDPR Article 20 portability discipline canonical at this
  ADR's §Consequences §Easier substantively.

- **Enterprise AI Agent context** — EntityType = `AI_AGENT`,
  WalletType = `ENTERPRISE`, EntityMembership(parent=`COMPANY` /
  organization / agency, child=`AI_AGENT`).
  `niov_can_access_contents = false` per
  `defaultNiovAccessFor(ENTERPRISE)`. Forward-substrate product
  surface for autonomous AI agents owned by an enterprise /
  organization / agency; defensive infrastructure live via
  `packages/database/src/queries/wallet.ts:39-58`
  `defaultWalletTypeFor(AI_AGENT) = ENTERPRISE` RULE 0 safe
  default. No current product code path creates Enterprise AI
  Agent entities at HEAD register substantively (defensive
  fallback only).

- **Defensive fallback** — `defaultWalletTypeFor(AI_AGENT) =
  ENTERPRISE` is the canonical RULE 0 safe default for bare
  `createEntity({entity_type: "AI_AGENT"})` calls without explicit
  `wallet_type` override. Preserves RULE 0 by avoiding accidental
  PERSONAL/human-authority assumptions for AI agent entities
  created outside the canonical twin onboarding flow.

- **Canonical context-resolution signals** — (a) explicit
  `wallet_type` override in `CreateEntityInput` (twin path); (b)
  `EntityMembership` parent/child relationship (`parent=PERSON` →
  Personal AI Agent; `parent=COMPANY` → Enterprise AI Agent); (c)
  defensive fallback when context is ambiguous.

**Substrate-honest preservation discipline**: this ADR's original
"Digital twins are `AI_AGENT` entities with their own Personal
DMW" claim at §Decision and §Alternatives Considered is preserved
verbatim. The claim is **correct for the Personal AI Agent
context**; ADR-0046 narrows the universe of claims about
AI_AGENT-wallet mapping to the dual-context model without
erasing this ADR's original design intent.

## References

- User memory #20 (Otzar architecture: AGI for Work)
- User memory #22 (three-wallet architecture details)
- COSMP specification (external; defines the seven operations
  that mediate cross-wallet interaction)
- Patent US 12,517,919 (claim coverage of wallet enumeration)
- ADR-0009 (COSMP 7-operation enumeration; relates the seven
  operations to wallet boundaries)
- ADR-0046 (AI_AGENT EntityType-Discriminated Capsule Routing;
  Amendment 1 of this ADR per RULE 14 bidirectional citation
  discipline; canonicalizes dual-context AI_AGENT routing model
  that preserves + narrows this ADR's Personal DMW / digital
  twin claim to the Personal AI Agent context + adds the
  Enterprise AI Agent context)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Decentralized Memory Wallet
  (DMW)", "Enterprise DMW", "Personal DMW", "Device DMW",
  "Digital Twin Wallet", "Three-Wallet Architecture",
  "Personal AI Agent", "Enterprise AI Agent"
- `docs/architecture/decisions/0046-ai-agent-entity-type-discriminated-capsule-routing.md`
  → preserves + narrows this ADR's Personal DMW / digital twin
  claim to Personal AI Agent context + adds Enterprise AI Agent
  context companion (RULE 14)
