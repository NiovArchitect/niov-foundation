# Section 6 — Enterprise Analytics

> Detailed canonical record for production Section 6. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Governed analytics surface — aggregate insights derived from
permissioned operational signals + audit chain. Per ADR-0052
doctrine: reports are summary projections, NEVER raw unpermitted
data; executives get summaries without crossing the per-entity
RULE 0 boundary.

## Current status (PARTIAL — Wave 1 ADR LANDED; design-only)

**Wave 1 ADR LANDED at ADR-0061** (2026-05-30; Founder Sleep
Directive next-section preference #4). Section 3 prerequisite
satisfied (ADR-0059 LANDED 2026-05-30 / PR #85 locked the
same-org hive-aggregate pattern that ADR-0061 mirrors for
enterprise analytics). ADR-0061 locks the SAFE projection
pattern at the substrate-architectural register:
closed-vocabulary counts/labels only; same-org scope
mandatory; minimum-population threshold REQUIRED (default
**k=5 per HIPAA Safe Harbor 45 CFR §164.514(b)(1)** regulatory
precedent); cross-org explicit non-goal (CAR Sub-box 8
forward-substrate); derived-only from existing operational
signals (Feedback Loops 1–7 + queryAuditEvents + MemoryCapsule
metadata + EntityMembership + EntityComplianceProfile + hive
aggregates).

v1 ships ZERO concrete aggregates — each future aggregate is
a Wave 2+ slice requiring separate Founder Authorization
(5 checkpoints per ADR-0061 §8: aggregate selection,
threshold posture, audit detail content, cache posture,
route prefix).

## What is live

- Feedback loops (Loops 1–7) produce per-entity / per-hive
  aggregate scores; not yet surfaced as enterprise analytics.
- Compliance posture per `EntityComplianceProfile`
  (foundational substrate; no analytics surface).

## What is not live

Per ADR-0061 v1 non-goals — each is forward-substrate behind
separate Founder authorization:

- **Specific analytics aggregates** (zero shipped at v1; each
  Wave 2+ slice picks ONE aggregate + requires Founder
  confirmation on 5 checkpoints).
- **Permissioned-aggregate query layer** + analytics service
  tier + analytics routes (`/api/v1/analytics/*`) — Wave 2.
- **Operator-tunable population threshold** (v1 hard-codes
  k=5; per-org override forward-substrate).
- **Cross-org analytics** (CAR Sub-box 8 forward-substrate +
  separate Founder product decision).
- **Differential-privacy guarantees** (k-anonymity at v1;
  stronger guarantees forward-substrate).
- **AI-generated executive summary projections** per ADR-0052
  doctrine (Founder product decision).
- **Persistent analytics projections / caching / streaming**
  — v1 is live-query only per "measure first" (ADR-0016).
- **Compliance-framework-specific aggregates** (HIPAA / GDPR /
  SOC 2 specific projections) — forward-substrate per future
  compliance ADR.
- **Analytics Control Tower UX** — frontend; lives in
  `otzar-control-tower`.

## RULE 13 disclosures specific to Section 6

- Analytics MUST NOT bypass RULE 0 sovereignty. Aggregates are
  permissioned; aggregations over unpermitted source data MUST
  NOT be possible at the query tier.
- Reports MUST be derived from permissioned operational signals
  per ADR-0052; raw employee data NEVER surfaces in executive
  dashboards.
- Aggregates MUST be projected through the same safe-view /
  no-leak discipline as the rest of the substrate.

## Next slices (per ADR-0061 §Forward queue)

Each Wave 2+ analytics aggregate slice requires Founder
authorization at its slice prompt (5 checkpoints per
ADR-0061 §8):

1. **Wave 2 — first concrete v1 aggregate.** Strongest
   substrate-derivable candidate per Phase 0 analysis:
   **org-wide CORRECTION activity over 7d** (consumes
   existing CORRECTION capsules + EntityMembership; mirrors
   Section 1 drift-signal pattern at org tier). Other
   Wave-2-eligible candidates: action-runtime success rate
   per org over 7d; connector-binding activity per org;
   hive participation rate per org.
2. **Wave 3+** — additional aggregates as operator demand
   surfaces.
3. **Wave N** — operator-tunable population threshold per
   org (OrgSettings field; only relevant if k=5 default is
   too restrictive or too permissive for a specific
   customer; would land via separate ADR amendment to
   ADR-0061 §1.c).
4. **Wave M** — cross-org analytics per CAR Sub-box 8 +
   separate Founder product decision.
5. **Wave N+M** — differential-privacy guarantees if a
   specific compliance framework requires it.

## Risks / forward-substrate

- Aggregates from too-small populations can re-identify
  individuals — analytics MUST enforce minimum-population
  thresholds.
- Cross-org analytics (NIOV-tier benchmarking) is forward-
  substrate and requires explicit cross-tenant compliance
  controls per CAR Sub-box 8.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
