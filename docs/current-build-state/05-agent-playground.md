# Section 5 — Agent Playground

> Detailed canonical record for production Section 5. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Operator-facing surface for exploring, configuring, and validating
governed agent behavior before deployment. Sandbox for crafting
TwinConfig role+autonomy settings, testing policy evaluator
decisions against hypothetical envelopes, dry-running Action
proposals without execution, inspecting governed working-set
construction, validating connector handler boundaries.

## Current status (PARTIAL — Wave 1 ADR LANDED; design-only)

**Wave 1 ADR LANDED at ADR-0060** (2026-05-30; Founder Sleep
Directive next-section preference #3). The Section 4
prerequisite ("at least one reference handler") is satisfied
by Wave 4 `OutboundWebhookProvider` (PR #73). ADR-0060 locks
the v1 scope as a read-only sandbox-only self-scoped operator
inspector surface — 3 inspector contracts (policy-evaluator
tester + connector dry-run + working-set inspector) that
preview Otzar's governed decision-making against synthetic
inputs WITHOUT persistence/audit/side-effect.

Wave 2 implementation requires separate Founder Authorization
(4 checkpoints per ADR-0060 §7).

## What is live

Nothing playground-side. Existing developer surfaces
(`apps/api/src/routes/developer.routes.ts`, the swagger UI at
`/api/v1/docs`) provide raw API access; they are not yet a
governed-agent playground.

## What is not live

Per ADR-0060 v1 non-goals:

- Agent playground UI surfaces (frontend; lives in
  `otzar-control-tower`).
- Wave 2 implementation of the 3 v1 inspectors (forward-
  substrate; requires Founder Authorization checkpoints
  per ADR-0060 §7).
- Persistent dry-run history (no Prisma model; every
  dry-run is ephemeral at v1).
- Real connector invocation in dry-run (v1 hard-wires
  `FixtureBasedConnectorProvider` only).
- Real Action creation in dry-run (v1 policy tester is
  pure `evaluateActionPolicy` dispatch).
- Cross-entity scope (caller's own RULE 0 scope only).
- AI-generated test scenarios (Founder product decision;
  not in v1).
- Audit emission on playground reads (intentional v1
  non-goal per ADR-0060 §2 — pure-function / fixture /
  read-only substrate justifies zero side effects).

## RULE 13 disclosures specific to Section 5

- Playground actions MUST be marked as dry-run at the substrate
  tier — they MUST NOT write capsules, grant permissions, or
  hit real connectors. Any audit emission MUST distinguish
  dry-run from real with a clear marker (e.g. `dry_run = true`
  in details).
- Playground operators see governed working-set construction
  but only for entities they are authorized to read.

## Next slices (per ADR-0060 §Forward queue)

1. **Wave 2 — service-tier implementation** of the 3 v1
   inspectors: NEW `apps/api/src/services/playground/playground.service.ts`
   + NEW `apps/api/src/routes/playground.routes.ts` (3 routes
   under `/api/v1/playground/*`); requires Founder
   Authorization checkpoints per ADR-0060 §7.
2. **Wave 3 — optional Control Tower frontend consumer**
   (frontend; out of Foundation scope).
3. **Wave 4+** — persistent named scenarios (separate ADR +
   schema); AI-suggested test scenarios (Founder product
   decision); real-provider dry-run (Founder product decision;
   major safety review).

## Risks / forward-substrate

- Playground "dry-run" must never leak forbidden fields when
  inspecting decisions or working sets.
- Avoid building the playground UI on the Foundation surface;
  it belongs in the Control Tower frontend (Section 9).

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
