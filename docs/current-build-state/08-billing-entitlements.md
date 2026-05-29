# Section 8 — Billing / Entitlements

> Detailed canonical record for production Section 8. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Per-org / per-entity entitlement model: which capabilities the
organization is paying for, which feature gates are enabled,
billing event emission (sealed-rate / metered / usage-based),
revenue routing (70/30 split per the monetization substrate),
plan upgrade / downgrade workflows, invoice generation, dunning.

## Current status

**Foundation monetization substrate partial.** The
`apps/api/src/services/monetization/monetization.service.ts`
substrate has the canonical `PRICING_TABLE`, the 70/30 split
math, and the per-capsule-type monetization decisions; a
production-grade billing + entitlements layer is forward-
substrate.

## What is live

- Monetization service substrate per ADR-0021 (Capsule Type
  Extension Protocol).
- `PRICING_TABLE` constant (deliberate-blocker per ADR-0021;
  adding a new capsule type requires updating the table).
- 70/30 revenue split math (canonical).
- Per-monetization-role attribution
  (`monetization_role` field on TAR).

## What is not live

- Org-level entitlement table.
- Feature gate enforcement at route preHandlers.
- Billing event emission to a payment provider.
- Plan upgrade / downgrade workflows.
- Invoice generation.
- Dunning / payment failure handling.
- Billing Control Tower UX.

## RULE 13 disclosures specific to Section 8

- Billing MUST NOT silently degrade service when payment fails;
  any degradation MUST surface clearly through Action policy
  decisions and audit emissions.
- Entitlement checks MUST run BEFORE policy evaluation per
  RULE 5 (auth → clearance → permission → conditions). A
  caller-without-entitlement MUST get a clear `403
  ENTITLEMENT_INSUFFICIENT` envelope, not a confusing
  `FORBIDDEN` from the policy evaluator.

## Next slices

Forward-substrate. No immediate slice queued; depends on
business decision about pricing model.

## Risks / forward-substrate

- Entitlement model interacts with TAR `monetization_role` and
  with `ActionPolicy` per-org rules. Coordinated changes will
  require a cross-section research arc.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
