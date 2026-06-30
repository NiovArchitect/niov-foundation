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

## Phase 6 — Work Graph + memory compounding + Dandelion (DONE, same branch)
- **Goal:** a processed ingest produces governed Work-Graph/Organization-Memory events + admin-governed Dandelion org-seeding suggestions from real work evidence — scoped, evidence-backed, approval-gated, no auto-invite, no leak.
- **Files added:** `apps/api/src/services/otzar/work-graph-memory.ts` (pure `buildWorkGraphMemory`). Wired in `comms-ingest.service.ts`.
- **Contracts added:** `GovernedWorkEvent` (8 event types), `DandelionSeed` (7 seed types), `buildWorkGraphMemory()`. Exported from `@niov/api`. Each event/seed carries sourceConversationId, sourceEvidence, sourceType, confidence, scope (MemoryScope), sensitivity, policyStatus, allowedViewers, timestamp.
- **Rails reused (NO duplicates):** reuses `MemoryScope` (work-graph-learning). Persists events + seeds on the durable **MEETING `WorkLedgerEntry.details`** (`work_graph_events`, `dandelion_seeds`) — scoped (org_entity_id), audited (createLedgerEntry), queryable. **No new model, schema unchanged.**
- **Governance:** only TRUSTED-segment work reaches it (noisy tail seeds nothing). An UNPROVEN owner → `confirm_or_activate_person` seed (approvalRequired, needs_review), NEVER a trusted ownership edge. A connector capability gap (Phase 4/5) → `grant_tool_access`/`connector_setup` seed for admin. Support roles → support edges + `confirm_support_role` seed, never owners. allowedViewers scoped to org members (never global). No auto-invite. Every seed has evidence.
- **Tests:** `tests/unit/work-graph-memory.test.ts` (7) + comms-ingest integration (seeds generated + persisted + scoped). typecheck 0. Full unit suite 2788 green (no regression).
- **Runtime/language:** `keep_in_typescript_now` (governs what enters the org source-of-truth + admin approvals = Foundation authority tier; ADR-0090 §3). Future cross-source reconciliation/ranking = PYTHON_ENRICHED boundary.
- **DEFINED BOUNDARY (honest, not faked):** per-seed admin **approve/reject lifecycle via `OtzarProposedPattern`** (additive migration) is the next increment — seeds today are real, persisted, scoped, approval-gated, and NEVER auto-applied; surfacing them as individually-actionable admin rows is the Admin-IA slice.
- **CHECKPOINT RESULT (Phase 6):** connected to Phase 4/5 (execution plans + connector gaps → seeds) ✓ · no duplicate model, schema unchanged ✓ · noisy tail seeds nothing ✓ · no cross-user leak (scoped viewers) ✓ · 7 unit + 6/6 integration green · 2788 unit no-regression · typecheck 0.

## Phase 7 — UI tightening (NEXT — Comms + Action Center)
- Read this doc + grep: `Comms`, `ActionCenter`, `MyWork`, `CommsIngestResult`, `execution`, `dandelion_seeds`. Surface (succinctly, no button soup, no raw IDs): execution mode + next-best-action + connector/setup blockers on each work item; recent conversations; (admin) the dandelion_seeds. Reflect backend truth only.
- **Deploy ordering:** Phase 4+5+6 are backend-only on branch `otzar-workos-slice2-execution-connectors` (no migration) — deploy Foundation first, then CT (Phase 7).
