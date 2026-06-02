# Voice-First Doctrine (Canonical)

Per `[FOUNDER-CORRECTION — OTZAR IS VOICE-FIRST / SESAME IS CORE PRODUCT REQUIREMENT]` (2026-06-02). Canonicalized by ADR-0085.

## The 4 doctrine lines (canonical — do not paraphrase)

1. **Otzar is voice-first because work should move through natural communication, not endless clicking.**
2. **Users should be able to talk to their AI Twin the way they would talk to a trusted teammate.**
3. **Voice reduces friction, increases adoption, and makes governed intelligence feel alive.**
4. **Voice is an interface layer over Foundation governance, not a bypass around it.**

## What voice is

- A first-class interaction modality alongside typed text and clicked-through forms
- A reduction in clicks — users say what they want; Foundation governance enforces what can happen
- An adoption multiplier — voice makes Otzar feel like a living teammate rather than a dashboard
- An interface layer over Foundation — voice expands modality; it does not gate modality

## What voice is NOT

- NOT a future-optional gimmick
- NOT a marketing feature
- NOT a governance bypass
- NOT a way to skip Section 2 Action runtime policy decisions
- NOT a way to skip Section 9 Workflows approval chains
- NOT a way to skip dual-control where required (per ADR-0026)
- NOT a way to skip audit (RULE 4)
- NOT a way to skip tenant isolation (per ADR-0049 GOVSEC.7)
- NOT a way to skip DMW scope (per ADR-0001 + RULE 0)
- NOT a manager-surveillance / employee-scoring / psychological-profiling vehicle
- NOT a way to expose private memory across tenants

## Governance scope inherited from text-tier

Voice inherits the entire Foundation governance posture from the equivalent typed-text interaction:

- Tenant isolation (same-org boundary absolute)
- DMW scope
- User identity (entity_id resolved before policy decision)
- Role scope (per RoleTemplate)
- Permission bundles
- Delegated authority
- Approval chains
- Dual-control where required
- Audit (RULE 4 — every voice intent emits a witnessing audit event before delivery)
- Retention rules (per ADR-0079 transcript policy)
- No-leak rules (no raw connector payload / no Bearer / no secret values / no cross-tenant data)
- Work-relevance filtering (non-work / private speech suppression)

## Forbidden voice behaviors

Voice must never enable:

- Unapproved connector writes
- Hidden external actions
- Private memory exposure
- Manager surveillance
- Employee scoring
- Psychological profiling
- Protected-attribute inference
- Raw prompt exposure
- Chain-of-thought exposure
- Policy bypass
- Approval bypass
- Cross-tenant learning from identifiable data
- Regulator disclosure without LawfulBasis (per ADR-0036)
- Legal/compliance certainty claims

## Reading

- [ADR-0085 — Voice-First Product Doctrine](../architecture/decisions/0085-voice-first-product-doctrine.md) (canonical decision substrate)
- [interaction-map.md](./interaction-map.md) (13-surface catalog)
- [risk-tiered-action-model.md](./risk-tiered-action-model.md) (LOW / MEDIUM / HIGH gates)
- [sesame-readiness-assessment.md](./sesame-readiness-assessment.md) (10-gate readiness)
- [voice-provider-adapter.md](./voice-provider-adapter.md) (adapter seam architecture)
- [voice-intent-envelope.md](./voice-intent-envelope.md) (substrate object)
- [implementation-sequence.md](./implementation-sequence.md) (VF.1 → VF.7 ladder)
