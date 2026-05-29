# Section 6 — Enterprise Analytics

> Detailed canonical record for production Section 6. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Governed analytics surface — aggregate insights derived from
permissioned operational signals + audit chain. Per ADR-0052
doctrine: reports are summary projections, NEVER raw unpermitted
data; executives get summaries without crossing the per-entity
RULE 0 boundary.

## Current status

**Substrate not started.** Section 6 follows hive intelligence
(Section 3) because hive-aggregate signals are the natural
analytics input.

## What is live

- Feedback loops (Loops 1–7) produce per-entity / per-hive
  aggregate scores; not yet surfaced as enterprise analytics.
- Compliance posture per `EntityComplianceProfile`
  (foundational substrate; no analytics surface).

## What is not live

- Enterprise analytics service tier.
- Permissioned-aggregate query layer.
- Analytics routes (`/api/v1/analytics/*`).
- Analytics Control Tower UX.
- Per-org / per-hive dashboards.

## RULE 13 disclosures specific to Section 6

- Analytics MUST NOT bypass RULE 0 sovereignty. Aggregates are
  permissioned; aggregations over unpermitted source data MUST
  NOT be possible at the query tier.
- Reports MUST be derived from permissioned operational signals
  per ADR-0052; raw employee data NEVER surfaces in executive
  dashboards.
- Aggregates MUST be projected through the same safe-view /
  no-leak discipline as the rest of the substrate.

## Next slices

Forward-substrate beyond Section 3. No immediate slice queued.

## Risks / forward-substrate

- Aggregates from too-small populations can re-identify
  individuals — analytics MUST enforce minimum-population
  thresholds.
- Cross-org analytics (NIOV-tier benchmarking) is forward-
  substrate and requires explicit cross-tenant compliance
  controls per CAR Sub-box 8.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
