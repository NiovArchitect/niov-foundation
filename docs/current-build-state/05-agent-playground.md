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

## Current status

**Substrate not started.** Section 5 is forward-substrate after
Section 4 (connectors) lands at least one reference handler,
because the playground's value is real handler exploration.

## What is live

Nothing playground-side. Existing developer surfaces
(`apps/api/src/routes/developer.routes.ts`, the swagger UI at
`/api/v1/docs`) provide raw API access; they are not yet a
governed-agent playground.

## What is not live

- Agent playground UI / route surface.
- Dry-run Action proposal mode.
- Policy-evaluator scenario tester.
- Governed-working-set inspector.
- Connector-handler boundary validator.

## RULE 13 disclosures specific to Section 5

- Playground actions MUST be marked as dry-run at the substrate
  tier — they MUST NOT write capsules, grant permissions, or
  hit real connectors. Any audit emission MUST distinguish
  dry-run from real with a clear marker (e.g. `dry_run = true`
  in details).
- Playground operators see governed working-set construction
  but only for entities they are authorized to read.

## Next slices

Forward-substrate beyond Section 4. No immediate slice queued.

## Risks / forward-substrate

- Playground "dry-run" must never leak forbidden fields when
  inspecting decisions or working sets.
- Avoid building the playground UI on the Foundation surface;
  it belongs in the Control Tower frontend (Section 9).

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
