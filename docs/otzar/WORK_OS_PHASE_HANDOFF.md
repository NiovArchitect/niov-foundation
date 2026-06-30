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

## Phase 7 — UI tightening (DONE — Comms execution surfacing; CT branch `otzar-workos-slice2-execution-ui`)
- **Goal:** Comms shows each work item's execution mode + connector/setup blocker — backend truth, human language, no jargon/raw-IDs/button-soup.
- **Files:** CT `src/lib/types/foundation.ts` (mirror `CommsIngestWorkItem.execution` + `CommsDandelionSeed` + result fields) + `src/pages/app/Comms.tsx` (per-item execution line + `execModeLabel` map) + `tests/unit/comms-page.test.tsx`.
- **Rails reused (NO duplicates):** extends the existing "Work Otzar created" card + `CommsIngestResult` type; no new page/store. UI reflects backend truth only (execution plan + capability from the ingest result).
- **Tests:** comms-page 18/18 (incl. exec-line render: "Needs a tool connected · GitHub isn't connected"). CT typecheck 0, lint 0.
- **CHECKPOINT RESULT (Phase 7):** reflects Phase 4/5/6 data ✓ · no fake state ✓ · no raw IDs / no developer language ✓ · no button soup ✓ · committed `69fe036` (CT), pending deploy.
- **DEFINED BOUNDARY:** Action Center page (`/app/action-center`, `MyWork`) showing execution mode + waiting-on-tools is the next CT increment; admin "Organization Seeding" (dandelion_seeds) is the Admin-IA slice. Employee Comms surfacing shipped here.

## DEPLOY LOG
- Slice 1: FND `be840e7`, CT `index-CQdDXt86.js` (live).
- Phase 4–6: FND `ada6727` (PR #496, live `dep-d9221qr7`). Live-verified: execution plans (repo_access→connector_required/GitHub/not_connected), Dandelion seed (grant_tool_access, approval-gated), 11 work-graph events, reload-persists.
- Phase 7 CT: branch `otzar-workos-slice2-execution-ui` `69fe036` — deploying.

---

## Dandelion Seed Lifecycle — admin approve/reject/hold (LIVE)
- **Goal:** Dandelion seeds become individually actionable, admin-governed items. Admin sees a governed queue, can approve / hold / reject each one; **approve advances to a setup action and NEVER grants access**; nothing auto-applies; non-admins are denied; no cross-tenant leak.
- **Rail (no migration, no duplicate system):** seeds persist as `WorkLedgerEntry` rows with `ledger_type="ORG_SEEDING"` and `SEED_*` statuses (`SEED_PROPOSED|NEEDS_REVIEW|APPROVED|REJECTED|HELD|APPLIED|BLOCKED|EXPIRED`) — TS consts only, the column already exists in prod. ORG_SEEDING is **excluded** from `getTeamWork`/`getMyWork` (line ~592) so seeds never appear as employee work.
- **Backend (FND `ba671fb`, PR #497, live `dep-d9221qr7`→api.otzar.ai):**
  - `services/otzar/dandelion-seed.service.ts` — `listOrgSeeds` (tenant-scoped), `loadSeed` (org+type guard → null cross-tenant), `transition` (updates details + writes `ADMIN_ACTION` audit), `approveSeed` (for grant_tool_access/connector_setup creates a `TASK`/`NEEDS_APPROVAL` setup action with `from_seed_id`; `resulting_action` = "setup action created … not granted automatically" — NO grant), `rejectSeed`, `holdSeed`.
  - `comms-ingest.service.ts` — after the MEETING entry, persists each `wgMemory.seeds` as an ORG_SEEDING row (status from `approvalRequired`).
  - `routes/otzar-dandelion.routes.ts` — `adminOrg()` helper (`validateSession(token,"admin_org")` → 403/404); `GET /org/dandelion/seeds`; `POST /org/dandelion/seeds/:id/{approve,reject,hold}` (optional `reason` body).
- **Frontend (CT `566b351`, deploy `dep-d922sh6q1p3s73eq9me0`, live bundle `index-fmHC2c5g.js`):** `pages/OrganizationSeeding.tsx` + nav "Organization Seeding" + route; `api.otzar.dandelionSeeds.{list,approve,reject,hold}` + `OrgSeed` types. Human labels (`SEED_TYPE_LABEL`/`STATUS_LABEL`), source evidence shown as "Why: …", confidence/risk/approval, no raw IDs, calm empty + admin-denied states. "Approve setup" copy is honest (server enforces no auto-grant).
- **Tests:** FND integration `dandelion-seed.test.ts` 4/4 (tenant isolation; approve→setup TASK + **no** connectorBinding + ADMIN_ACTION audit; reject/hold persist; cross-tenant write → NOT_FOUND). CT unit `organization-seeding.test.tsx` 4/4 (render, approve calls endpoint, admin-denied 403, empty). Full gates green both repos.
- **Live (HTTP layer):** `/org/dandelion/seeds` flips 404→**401** (route live + gated); `/organization-seeding` → 200; bundle flipped `oe3uZKCc→fmHC2c5g`. Behavioral live-verify script `scratchpad/live-seed-lifecycle.mjs` (ingest-as-admin → list → approve/hold/reject → non-admin 403 → no employee-work leak) is ready; pending `DEMO_SHARED_PASSWORD` (sanctioned credential gate).
- **DO NOT BREAK:** no-migration ORG_SEEDING rail; approve never grants (setup action only); ORG_SEEDING excluded from employee/team work; admin_org gate on all seed routes; tenant isolation in `loadSeed`; every transition writes ADMIN_ACTION audit; honest "not granted automatically" copy.

### DEPLOY LOG (append)
- Dandelion seed lifecycle: FND `ba671fb` (PR #497, api.otzar.ai live, seeds route 401-gated). CT `566b351` (deploy `dep-d922sh6q1p3s73eq9me0`, live bundle `index-fmHC2c5g.js`, /organization-seeding 200).
