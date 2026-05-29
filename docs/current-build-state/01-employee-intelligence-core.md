# Section 1 — Employee Intelligence Core

> Detailed canonical record for production Section 1. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

The substrate that lets the Foundation hold, govern, and surface
per-employee intelligence safely. Employee Twin role-scope profile,
correction signals, conversation continuity / look-back, drift
prevention foundations, scoped memory (DMW + Memory Capsules),
COSMP 7 operations, audit chain, compliance routing — all gated
through COSMP and DMW per the COSMP patent (US 12,517,919) and
DMW patents (US 12,164,537 + US 12,399,904).

## Current status

**Foundational substrate landed pre-Section-12** (Sections 1–11
closed). The Otzar Wave 1 (ADR-0051), Wave 2A (ADR-0053), Wave 2B
(ADR-0054), and Wave 2C (ADR-0055) employee-twin-context contracts
are Accepted at the doctrine register; design is locked, code is
forward-substrate.

## What is live

- COSMP 7 operations + audit chain + RULE 0 sovereignty enforcement.
- DMW substrate (wallet types: PERSONAL, ENTERPRISE, DEVICE per
  ADR-0001 with ADR-0046 dual-context AI_AGENT routing).
- COE governed-retrieval substrate (`assembleContext`).
- Otzar `conductSession` + `processCorrection` + `closeConversation`
  + `getMyTwin` employee twin surface.
- ADR-0048 personalization-orchestration substrate (Foundation-owned
  governed working-set construction; the LLM never decides what
  context it sees).
- Embedding substrate per ADR-0043 (pgvector + text-embedding-3-small
  + HNSW + cosine) with G3.9 J5–J8 privacy proofs.
- Capsule-level staleness substrate per ADR-0045 (embedding_lag
  detection).

## What is not live

- Otzar Wave 2A self-scoped twin role-scope profile route
  (ADR-0053 design accepted; code forward-substrate).
- Otzar Wave 2B conversation look-back detail endpoint
  (ADR-0054 design accepted; code forward-substrate).
- Otzar Wave 2C correction-conversation linkage + per-conversation
  correction-signal sub-resource (ADR-0055 design accepted; code
  forward-substrate).
- Wave 3 drift detection / drift score / stale-context warnings /
  proactive suggestions / `IntelligencePattern` auto-write.

## Landed lineage (high-level, not exhaustive)

Section 1–11 close pre-Section-12. The Otzar wave canon
established 2026-05-26 → 2026-05-27 across ADR-0051 (Wave 1
transparency) + ADR-0052 (Domain General Intelligence doctrine) +
ADR-0053 (Wave 2A employee twin profile) + ADR-0054 (Wave 2B
conversation look-back) + ADR-0055 (Wave 2C correction linkage).
See the ADR catalog in
[`../../architecture/decisions/`](../../architecture/decisions/)
for the full design lineage.

## RULE 13 disclosures specific to Section 1

- Twin scope parity: Twin-of-employee operates inside the same
  RBAC / ABAC boundary as the employee, never above. Per
  ADR-0052 doctrine.
- Permissioned work observation is NOT surveillance per ADR-0052;
  raw unpermitted data is never exposed.
- AI_AGENT entity-type-discriminated capsule routing canonical per
  ADR-0046; Personal AI Agent → PERSONAL wallet (twin / digital
  twin context); Enterprise AI Agent → ENTERPRISE wallet
  (organization context).

## Next slices (priority order)

1. Wave 2A employee twin role-scope profile route — code
   implementing the ADR-0053 design.
2. Wave 2B conversation look-back detail endpoint — code
   implementing the ADR-0054 design.
3. Wave 2C correction-conversation linkage — code implementing
   the ADR-0055 design.
4. Wave 3 drift detection foundations (per ADR-0053 §5 +
   ADR-0055 forward-substrate).

## Risks / forward-substrate

- All Wave 2A/B/C waves are accepted at doctrine register but
  not implemented. Implementation lands one slice at a time.
- Wave 3 drift detection is intentionally NOT yet designed at
  the ADR register; it requires its own Founder-authorized ADR
  + research arc.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
