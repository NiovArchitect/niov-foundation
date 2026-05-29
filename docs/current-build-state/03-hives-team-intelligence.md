# Section 3 — Hives / Team Intelligence

> Detailed canonical record for production Section 3. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Team / hive intelligence — scoped Twin-to-Twin coordination,
permissioned best-practice learning, governed group memory,
collective alignment surfaces. Per ADR-0052 doctrine: Twins
operate inside RBAC / ABAC parity, never above the humans they
extend; Twin-to-Twin coordination exchanges only the minimum
relevant information; no cross-tenant leakage; no hidden autonomy.

## Current status

**Substrate not yet started.** Section 3 follows Section 2 in the
production-section sequence. Existing Foundation primitives
(EntityMembership, OrgSettings, COE, COSMP) provide the
governance seam; the hive-coordination service tier + routes
are forward-substrate.

## What is live

- EntityMembership parent/child relationships (for org hierarchy).
- Existing per-DMW BEAM substrate per ADR-0038 / ADR-0039 /
  ADR-0040 (DMWWorker + Horde + DEVICE cold-shard) handles
  per-entity isolation but does NOT yet implement hive
  coordination.
- Phoenix.PubSub hive fanout substrate is forward-substrate per
  ADR-0039 §Forward Queue entry #28 (sub-phase c+ register).

## What is not live

- Hive entity type / hive membership model.
- Hive intelligence service tier.
- Hive-scoped permission boundary enforcement.
- Twin-to-Twin coordination protocols.
- Hive routes (`/api/v1/hives/*`).
- Hive Control Tower UX.

## RULE 13 disclosures specific to Section 3

- Hive boundaries must enforce the same RULE 0 sovereignty
  rules as individual DMWs — no cross-hive leakage; no
  cross-tenant data fusion.
- Twin-to-Twin coordination is scoped per ADR-0052; raw memory
  capsules NEVER cross between Twins. Only minimum-relevant
  derived signals.

## Next slices (priority order)

1. Hive-architecture research arc (RULE 21 — crosses Identity ↔
   Hive ↔ Permission ↔ Audit boundaries).
2. Hive schema substrate (entity type, membership table,
   per-hive permission model).
3. Hive coordination service tier.
4. Hive routes + audit literals.

## Risks / forward-substrate

- Section 3 is a substantial design surface. Don't start
  implementation without an authorized research arc.
- Hive intelligence must not become a workaround for the
  per-entity RULE 0 boundary; the hive is a coordination
  surface, not a permission-expansion vehicle.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
