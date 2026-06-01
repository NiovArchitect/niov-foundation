# B4 — Internal Entitlement / Seat Ledger Design Substrate

> Static design substrate that consumes the B2 static entitlement catalog at `docs/entitlement-catalog/` + the 8 conceptual entitlement objects from ADR-0083 Amendment 1 §9.7 and produces worked-example seed instances for each of the 4 plan archetypes. **No runtime billing enforcement at this slice.**

> Per ADR-0083 §B4 row: *"Separate Founder authorization at slice + Founder pricing decision"* required before the runtime Prisma `Entitlement` model lands. This design substrate prepares the canonical shape so the future B5 runtime slice has worked examples to consume.

## Canonical doctrine (preserved verbatim)

- *"Billing entitles availability; Foundation governance authorizes activation."*
- *"Customers should not pay extra just to have memory be safe."*
- *"Downgrades may disable new premium actions but must never delete audit history, violate retention, or break evidence integrity."*

## Files

| File | Plan archetype |
|---|---|
| `ledger.schema.json` | JSON Schema for `EntitlementLedgerSeed` instances |
| `starter-pilot-ledger.json` | Starter / Pilot ($250 base + 1 admin + 2 standard) |
| `team-ledger.json` | Team ($250 + per-seat; Collaboration Pack candidate) |
| `business-ledger.json` | Business (5 packs + workflow Stages 3 + advanced audit + Agent Playground) |
| `enterprise-ledger.json` | Enterprise (all 9 packs + SSO + custom retention + SLA) |

## The 8 conceptual entitlement objects (per ADR-0083 Amendment 1 §9.7)

Each seed ledger instantiates the 8 conceptual objects:

1. `BillingAccount` — billing_status + contract_type + grace_period_status
2. `Plan` — plan_id + plan_name + base_price_anchor
3. `SeatEntitlement` — array of per-seat-tier included_count + overage_strategy
4. `CapabilityPackEntitlement` — array of per-pack entitled + activation_state (always `ENTITLED_NOT_ACTIVATED` — billing entitles availability; governance authorizes activation)
5. `FeatureEntitlement` — array of per-feature entitled flags
6. `UsageMeter` — array of per-meter included_allowance (enforcement_mode `DEFERRED_TO_RUNTIME` until B5)
7. `EntitlementCheck` — worked examples showing the 4 expected outcomes (`ENTITLED_AND_GOVERNANCE_AUTHORIZED` / `ENTITLED_BUT_GOVERNANCE_GATED` / `NOT_ENTITLED` / `FORBIDDEN_BY_GOVERNANCE`)
8. `DowngradePolicy` — references the B2 downgrade policy with the absolute preservation flags

## Universal seed-ledger shape

Every ledger carries:

- `consumes_plan_id` — cross-reference to the B2 PlanTemplate ID
- `billing_account` / `plan` / `seat_entitlements` / `capability_pack_entitlements` / `feature_entitlements` / `usage_meters` / `entitlement_check_examples` / `downgrade_policy`
- `DMW_baseline_included: true` + `safety_baseline_included: true` + `audit_baseline_included: true` (enforced by validator at every plan tier)
- `governance_review_points` + `audit_expectations`
- `runtime_state: DESIGN_SUBSTRATE_ONLY` (enforced by validator)

## Validation

```sh
node scripts/validate-entitlement-ledger.mjs
```

Enforces:

- JSON parses + 6 required files exist (README + schema + 4 plan-archetype ledgers)
- Required wrappers exist
- Every ledger's `consumes_plan_id` resolves to a real B2 plan at `docs/entitlement-catalog/plans.json`
- Every `seat_entitlements[].seat_tier_id` resolves to a real B2 seat tier
- Every `capability_pack_entitlements[].pack_id` resolves to a real B2 capability pack
- Every `usage_meters[].meter_id` resolves to a real B2 usage meter
- Every ledger has `DMW_baseline_included` + `safety_baseline_included` + `audit_baseline_included` all true (machine-checked invariant)
- Every `capability_pack_entitlements[].activation_state` equals `ENTITLED_NOT_ACTIVATED` (separation of entitlement from activation)
- Every `usage_meters[].enforcement_mode` equals `DEFERRED_TO_RUNTIME`
- Every ledger has `runtime_state: DESIGN_SUBSTRATE_ONLY`
- All 4 plan archetypes covered exactly once
- 11 forbidden phrases scanned with sentence-level negation + subtree skip
- Canonical phrase present in README (whitespace-normalized)

## Cross-B2 catalog references

Each seed ledger explicitly references the B2 catalog IDs it consumes:

- Plan IDs from `docs/entitlement-catalog/plans.json`
- Seat tier IDs from `docs/entitlement-catalog/seats.json`
- Capability pack IDs from `docs/entitlement-catalog/capability-packs.json`
- Usage meter IDs from `docs/entitlement-catalog/usage-meters.json`

The validator enforces every cross-reference resolves — this is how B4 stays in sync with B2 as the catalog evolves.

## How B5 / B6 / B7 / B8 consume this

- **B5 internal entitlement runtime** — Prisma `Entitlement` model + service-tier `entitlementCheckForCaller` helper instantiates from these seed shapes; separate Founder authorization + pricing decision per ADR-0083 §B4
- **B6 usage meter runtime** — instantiates `UsageMeter` runtime from `usage_meters[].meter_id` + `included_allowance` shapes
- **B7 Billing Admin route surface** — admin-facing routes consume the runtime Entitlement model + the canonical `governance_review_points`
- **B8 governed downgrade/upgrade** — references the `downgrade_policy.policy_id` + the absolute preservation flags

## Graduation tracker

- Section 8 Billing: B1 doctrine LIVE (ADR-0083) + B2 static catalog LIVE + B3 CT preview LIVE + **B4 design substrate LIVE (this slice)** + B5-B8 forward-substrate
- Per Founder pricing-decision gate: per-seat / per-pack final USD pricing is locked in by the Founder at a future B5 slice; this design substrate uses suggested internal anchors only

## Status

ACCEPTED 2026-06-01 per `[FOUNDATION-B4-ENTITLEMENT-LEDGER-DESIGN-SUBSTRATE]`. Static design substrate only. No runtime billing enforcement. Future B5 runtime Prisma model requires separate Founder authorization per ADR-0083 §B4.
