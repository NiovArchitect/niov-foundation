# Work OS — Phase Handoff (continuity artifact)

Purpose: each phase records what it changed so the NEXT phase does not guess. Read this before starting any phase. Not a marketing report.

The connected loop: transcript → persisted conversation → work item (per-owner, proof-gated) → **execution plan** → **connector capability** → Work-Graph/memory → Dandelion/admin seeding → UI → live.

---

## Slice 1 — Phases 1–3 (LIVE + verified)
- **Goal:** transcript → persisted conversation → per-owner Work Ledger rows under proof; noisy tail quarantined; reload-persists; per-user scoped.
- **Live:** backend `be840e7` (otzar-api), CT bundle `index-CQdDXt86.js` (otzar-app). 4/4 live smokes pass.
- **Files:** `otzar/{transcript-quality,work-item-planner,comms-ingest.service}.ts` + `otzarService.ingestComms` + `POST /otzar/comms/ingest`; CT `api.otzar.commsIngest` + `Comms.tsx`.
- **DO NOT BREAK:** transcript persistence, recent-conversation persistence, noisy-tail quarantine, David/Pratham/Shiney owned PROPOSED, unproven→NEEDS_OWNER, reload persistence, per-user scoping, comms-governance, response-roundtrip, conversation-memory, response-reconciliation, no-auto-send.

---

## Phase 4 — Execution planning layer (DONE, branch `otzar-workos-slice2-execution-connectors`, not yet deployed)
- **Goal:** every commitment → a TYPED executable plan (not an internal note): executionType, executionMode, requiredConnector, capabilityState, approvalRequired, blockerReason, nextBestAction.
- **Files added:** `apps/api/src/services/otzar/execution-planner.ts` (pure). Wired in `comms-ingest.service.ts`.
- **Contracts added:** `ExecutionType` (12), `ExecutionMode` (7), `ExecutionPlan`, `planExecution()`, `classifyExecutionType()`, `connectorForExecutionType()`. Exported from `@niov/api`.
- **Rails reused (NO duplicates):** persists the plan in `WorkLedgerEntry.details.execution_plan` (no new model, schema unchanged). Reuses `NextBestAction` (decision-recommendation). Each `IngestedWorkItem.execution` carries the plan.
- **Governance:** strongest live mode = `otzar_can_execute_with_approval` (connector writes founder-gated → never auto-execute). Missing/unauthorized tool → `connector_required`/`permission_required` (visible blocker, never dropped).
- **Tests:** `tests/unit/execution-planner.test.ts` (15) + integration assertion in `comms-ingest.test.ts`. typecheck 0.
- **Runtime/language:** `keep_in_typescript_now` — execution-mode is governance/authorization (ADR-0090 §3 forbids Python for policy). ML priority/urgency ranking = future PYTHON_ENRICHED boundary over the plans (not built).
- **Continuity:** plans attach to Slice-1 work items + preserve source evidence; consumed by Phase 5 capability state.

## Phase 5 — Connector/MCP capability registry (DONE, same branch)
- **Goal:** the planner must KNOW (not guess) whether the tool is available/authorized/blocked/missing/needs-setup — the 7 governed states.
- **Files added:** `apps/api/src/services/otzar/connector-capability.ts` (pure `computeCapabilityState` + DB `resolveConnectorCapability`).
- **Contracts added:** `ConnectorCapabilityState` (7), `RequiredConnector`, `ConnectorOperation`, `CapabilityFacts`, `computeCapabilityState()`, `resolveConnectorCapability()`, `needsSetup()`, `isReachable()`. Exported from `@niov/api`.
- **Rails reused (NO duplicates):** `connector-rails/provider-registry.getConnectorProvider`, `@niov/database listConnectorBindingsForOrg`, `connector-rails/scope-grant.{listConnectorScopeGrants,findMatchingGrant}`. Bridges the two connector subsystems (connector/ `GITHUB_READ` bindings ↔ connector-rails `GITHUB` providers) by provider-name match.
- **Governance:** read-only; never grants/auto-authorizes. Connector-write policy stays enforced downstream (INVOKE_CONNECTOR handler + policy evaluator). No cross-org/user leak (binding+grant lookups are org/actor-scoped).
- **Tests:** `tests/unit/connector-capability.test.ts` (10) + the comms-ingest integration test (connector-backed work with no connector → `connector_required`). typecheck 0.
- **Runtime/language:** `keep_in_typescript_now` (authorization = Foundation authority tier).
- **Continuity:** capability state attaches to each execution plan; missing connector → setup-required blocker on the item; consumed by the execution planner mode.
- **CHECKPOINT RESULT (Phase 4+5):** connected to Slice-1 rails ✓ · no duplicate model ✓ · schema unchanged ✓ · no-auto-send preserved ✓ · 30 unit + 5 integration green · typecheck 0.

## Phase 6 — Work Graph + memory compounding + Dandelion (NEXT — not started)
- Read this doc + grep: `work-graph-evidence`, `work-graph-learning`, `MemoryCapsule`, `OtzarProposedPattern`, `ADR-0082` (Dandelion), `OtzarConversation`, audit. Reuse: persist `transcriptGraphToEvidence`→`reconcileEvidence` edges + learning events (MemoryCapsule), extend `OtzarProposedPattern` for Dandelion seeds. Noisy tail must seed nothing. No cross-user leak. Approval-gated seeds.
- **Dependency:** consumes the execution plans + capability gaps from Phase 4/5 (connector gap → Dandelion connector-setup seed).
