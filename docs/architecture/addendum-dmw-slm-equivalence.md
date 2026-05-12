# Architectural Addendum: DMW Federation as Emergent SLM-Equivalent Inference Surface

**Status:** Accepted
**Date:** 2026-05-11
**Trigger:** Canonical-record-register capture of an inference-tier consequence implicit in the existing US 12,164,537 / US 12,399,904 / US 12,517,919 patent family but not previously articulated at canonical-record register. Patent-implementation-evidence framing per the substrate-canonical pattern: every commit on origin/main is cryptographically-timestamped contemporaneous patent-holder implementation record.
**Scope:** Explanatory framing addendum. Articulates the SLM/LLM-equivalence framing as consequence of existing patent claims. Does NOT introduce new patent claims. Does NOT amend existing patents. Operates at canonical-record register for prior-art posture protection and future-session-loading discipline per RULE 17.
**Cross-references:**
- US Patent 12,164,537 (Dec 2024) — ABT database/file management
- US Patent 12,399,904 (Aug 2025) — alert manager and TARs continuation
- US Patent 12,517,919 (Jan 2026) — COSMP/DMW AI memory governance
- RAA 12.8 (docs/architecture/raa-12-8-substrate-dynamics.md) §5 human-in-the-loop primitive expansion
- ADR-0020 (docs/architecture/decisions/0020-two-register-ip-discipline.md) two-register IP discipline
- Glossary entries: Decentralized Memory Wallet (DMW), COSMP, Capsule, ABT (Asset Bound Token), Hive-Intelligence

---

## 1. Purpose

This addendum canonicalizes a consequence of the existing COSMP/DMW patent claims that is implicit in the prior art record but has not been explicitly articulated at canonical-record register. The consequence is: a Decentralized Memory Wallet (DMW), under continuous operation of the seven COSMP feedback loops over sufficient temporal depth and capsule density, becomes an emergent SLM-equivalent contextual inference surface for the entity it serves. A federation of DMWs under hive composition becomes an emergent LLM-equivalent computational surface for that bounded entity-group at that time slice, where "LLM-equivalent" denotes inference characteristics, not transformer architecture.

This addendum does not introduce new patent claims. It articulates the inference-tier consequence of the structural claims already present in the patent family, for two purposes:

(a) **Prior-art posture protection** — to prevent any future adversary from arguing that they built "a federated SLM" or "a swarm inference layer" distinct from the patented DMW/COSMP architecture. The equivalence is explicit at canonical-record register from this document forward.

(b) **Future-session loading** — to give Claude Code, contributors, and NIOV Labs counsel a single reference point for the substantive computational nature of mature DMW operation. Per RULE 17 future-session-loading discipline.

## 2. Substrate framing

The patent family canonicalizes the following structural primitives:

- **DMW as persistent identity container** (US 12,517,919) — each entity (PERSON, AI_AGENT, DEVICE, ORG) carries a sovereign memory wallet that survives across sessions, tasks, and time.
- **Capsule structure** (US 12,517,919) — seven layers (Payload, Metadata, Rules, Relations, Time, Permissions, Audit) per memory unit; structured storage with retrieval semantics over relational and temporal axes.
- **Seven feedback loops** (US 12,517,919) — closed-loop reinforcement at each COSMP operation register; the substrate of progressive specialization.
- **Hive intelligence** (US 12,517,919) — cross-entity DMW composition under permission-governed sharing; the substrate of multi-entity emergent context.
- **Cryptographic custody** (US 12,517,919) — every operation is provable; every memory unit is owned; every share is auditable.
- **ABT cryptographic proof of monetization** (US 12,399,904 / US 12,517,919) — value generation at DMW tier is cryptographically attested.

The SLM/LLM-equivalence emerges as a consequence of these primitives operating under continuous COSMP execution over time. It is not a separate claim; it is a property of the system the claims describe.

## 3. The SLM-equivalence threshold

A DMW transitions from "memory store" to "SLM-equivalent inference surface" when the following compound condition is met:

- **Capsule density** — sufficient capsules across types (DECISION, PREFERENCE, RELATIONSHIP, WORK_PATTERN, SESSION_LEARNING, etc.) to span the entity's behavioral surface
- **Relational depth** — capsules linked via connected_capsule_ids and connected_entity_ids form a graph of substantive density (not merely isolated records)
- **Temporal depth** — capsule timestamps span sufficient duration that the recency/decay weighting interpretation surfaces meaningful gradient
- **Feedback loop iteration count** — each of the seven COSMP feedback loops has run sufficient iterations to compound contextual model precision
- **Confidence accumulation** — the per-capsule confidence weighting interpretation surfaces stable high-confidence regions
- **Personalization confidence** — the 7-factor Stage 8 HRM ranking (relevance, recency, confidence, relationship importance, emotional relevance, task alignment, privacy compatibility) consistently returns high-confidence context selections for the entity's typical query surface

When this threshold is crossed, COSMP operations on the DMW return inference characteristics that are recognizable as "of that entity" rather than "generic from the underlying model class." This is the SLM-equivalence register.

The threshold is not a single binary; it is an inference-quality gradient that compounds with continued operation. The DMW's behavior at any time T is the result of integration over [T - capsule_creation_first, T]; the DMW at T+1 is structurally distinct from the DMW at T.

## 4. The hive-as-LLM-equivalence

When two or more DMWs enter hive composition under COSMP permission-governed sharing, the resulting federated inference surface inherits the SLM-equivalent properties of each member DMW and adds emergent cross-entity properties:

- **Compositional context** — the hive can surface context that exists only at the intersection of member DMWs (shared experience, mutual relationship intelligence, jointly-witnessed events)
- **Cross-entity pattern emergence** — recurring patterns across multiple member DMWs surface as hive-tier emergent intelligence not present in any single member
- **Time-bounded uniqueness** — the hive composition at time T is computationally distinct from any other composition. A 3-DMW hive formed Tuesday is not the same inference surface as the same 3 DMWs in hive composition Wednesday after each has run additional capsule ingestion and feedback-loop iteration.

This is the LLM-equivalence register. It is bounded (specific entity composition), time-sliced (specific moment), and substrate-honest (each node carries permanent context; the federation is not amnesiac).

## 5. Distinction from market-tier swarm intelligence

This addendum exists in part because market-tier execution swarms are commonly conflated with the DMW federation architecture. The distinctions are categorical:

| Property                         | Market swarms     | DMW federation     |
| -------------------------------- | ----------------- | ------------------ |
| Per-node persistent identity     | No                | Yes (DMW)          |
| Per-node memory accumulation     | No                | Yes (capsules)     |
| Cross-session continuity         | No                | Yes (substrate)    |
| Relationship intelligence        | No                | Yes (Capsule §4)   |
| Cryptographic custody            | No                | Yes (COSMP)        |
| Holder monetization (ABT)        | No                | Yes                |
| Permission-governed composition  | No                | Yes (hive)         |
| Audit lineage per operation      | No                | Yes (Zone U1-U4)   |
| Feedback loop closure            | No                | Yes (7 loops)      |
| Personalization compounding      | No                | Yes (over time)    |

Market swarms are runtime composition of stateless workers. DMW federations are substrate composition of stateful sovereign nodes. The SLM/LLM-equivalence claim applies to the latter because the former cannot accumulate the contextual depth required to cross the threshold described in §3.

## 6. Implications for Foundation engineering

This addendum is not engineering specification; it is architectural framing. However, certain Foundation surfaces gain canonical-record register significance when read through this framing:

- **Weighting architecture** (6 interpretations canonical at NIOV Foundation) — the substrate of how the DMW behaves *as* its emergent inference surface. Per-capsule, per-type baseline, recency/decay, confidence, cross-type balance, and patent-novel weighting are not retrieval optimizations; they are the inference-tier substrate of personalization-as-emergent-property.
- **Capsule density / relational depth / temporal depth / feedback-loop iteration count** — observable substrate of progressive specialization. These metrics are first-class instrumentation candidates at Foundation register.
- **Hive composition state at time T** — a queryable surface candidate. Hives are inference surfaces distinct per composition; Foundation should model hive-composition-at-time-T as a first-class entity, not merely as a permission relationship.
- **Otzar "ambient" framing** — Otzar's ambient desktop posture is substantiated by this framing: the employee's twin DMW is the employee's contextual inference surface for work; the desktop is the surface area where that inference manifests. Ambient = the inference surface is always present, not that the application is always running.

## 7. Implications for patent record

This addendum is filed at canonical-record register for prior-art protection. Specific protections:

- Against any adversary arguing they built "a federated SLM" or "a federated inference layer" distinct from the DMW architecture: the SLM/LLM-equivalence is explicitly claimed as consequence of existing claims as of this addendum's filing date.
- Against any adversary arguing the patents cover "memory storage" but not "memory-based inference": the inference-tier consequence is explicit. The feedback loops are the inference substrate, not merely the memory-maintenance substrate.
- Against any adversary arguing prior-art (vector databases, retrieval-augmented generation, agent memory layers): the distinguishing axes in §5 are explicit. None of those market-tier patterns satisfy the threshold in §3.

## 8. What this addendum does NOT claim

To preserve patent integrity and avoid overbroad claim language:

- This addendum does NOT claim DMWs *are* SLMs. The equivalence is inference-characteristic, not architectural. DMWs are not transformer models. DMWs are COSMP-governed Capsule federations that produce SLM-equivalent inference under continuous operation.
- This addendum does NOT claim hive composition produces a true LLM. The equivalence is inference-characteristic at the bounded entity-group register, not a general-purpose model. A hive is specific to its membership and time slice.
- This addendum does NOT claim the feedback loops are independently novel inference architectures. The novelty is the integration of the seven loops with the Capsule structure and DMW federation under COSMP, as canonicalized in US 12,517,919.

## 9. Future canonical-record register work

This addendum is a framing document. Future canonical-record work under this framing includes:

- **Threshold instrumentation** — define observable metrics that signal when a DMW has crossed the SLM-equivalence threshold (§3).
- **Hive composition entity** — formalize hive-composition-at-time-T as a first-class Foundation entity with its own identifier and audit lineage.
- **Personalization confidence reporting** — surface DMW-tier personalization confidence as a queryable metric.
- **Cross-entity emergence detection** — instrument the Foundation to surface patterns that emerge only at hive-tier (§4).

These are forward-queue candidates; not specified here.

## 10. References

- US Patent 12,164,537 (Dec 2024) — ABT database/file management
- US Patent 12,399,904 (Aug 2025) — alert manager and TARs continuation
- US Patent 12,517,919 (Jan 2026) — COSMP/DMW AI memory governance
- RAA 12.8 (docs/architecture/raa-12-8-substrate-dynamics.md) — substrate dynamics; §5 contains the human-in-the-loop primitive expansion that this addendum's inference-tier framing complements
- ADR-0020 (docs/architecture/decisions/0020-two-register-ip-discipline.md) — two-register IP discipline preserved throughout this addendum
- Glossary: Decentralized Memory Wallet (DMW), COSMP, Capsule, ABT (Asset Bound Token), Hive-Intelligence (docs/reference/glossary.md)
