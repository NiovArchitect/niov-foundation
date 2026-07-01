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

---

## Admin Center IA reorg — eight production sections (CT)
- **Goal:** turn the admin sprawl (7 nav groups / 31 flat entries) into a production enterprise control center — powerful underneath, calm on the surface. Eight approved sections; every visible control on a real rail; stubs hidden; the two connector surfaces folded into one destination; employee shell untouched and isolated.
- **Sections (NAV_GROUP_ORDER):** Overview · People & Roles · Tools & Connections · Work Graph & Memory · Policies & Approvals · Workflows & Automation · Audit & Activity · Diagnostics.
- **Approved placements:** Billing & Entitlements → Overview · Organization Seeding + Onboarding → People & Roles · Reports → Audit & Activity · Data retention → Diagnostics · Marketplace/Cohorts/Access&Grants/Access Control → Work Graph & Memory · Review Center + Pending Approvals → Policies & Approvals.
- **Connector fold:** new `pages/ToolsConnections.tsx` — ONE "Tools & Connections" landing (`/tools-connections`) that COMPOSES the two existing surfaces as tabs: "Connected Tools" (`ConnectorsAdminPage`) + "Integrations & MCP" (`ConnectorRailsAdmin`). The two underlying routes (`/connectors`, `/connector-rails`) stay registered (deep-link safe) but are no longer nav entries. CommandCenterPanel quick-links repointed to `/tools-connections`.
- **Stubs:** the 7 placeholder screens (Analytics, Conversations, Workflows, Playground, Settings, Documentation, Intelligence) keep `comingSoon:true` → hidden from the sidebar, routes preserved. AdminSidebar now skips any section with zero visible items (no bare headers).
- **Vocabulary:** human-readable descriptions; no raw IDs, no "connector binding"/"MCP rail"/"TAR"/"schema" as primary labels (advanced detail lives inside the Tools tabs).
- **Employee isolation:** `nav-employee.ts` untouched this slice; a test locks the wall (disjoint routes, all employee routes under `/app/`, no Organization Seeding, no diagnostics, no implementation jargon). Employee copy polish + minimal-nav curation is the dedicated next slice (#29).
- **Tests (CT):** `admin-nav-sections` (8 sections + per-section membership + fold + stub-hide + sidebar render), `admin-route-safety` (every nav route + folded connector routes + 7 stub routes resolve in App.tsx), `admin-employee-isolation`, `tools-connections` (landing render + tab switch). Updated stale group/label asserts in admin-command-center-panel, review-center, marketplace-discovery, billing-preview, connectors-admin, admin-nav-coming-soon. Full suite green; typecheck 0; lint 0 errors; build ok.
- **DO NOT BREAK:** 8 sections in order; stubs hidden but routed; `/connectors` + `/connector-rails` routes preserved; employee shell isolated; Organization Seeding under People & Roles; Reports under Audit & Activity; Billing under Overview; Onboarding under People & Roles.
- **Credential-gated (sanctioned):** the 4 live smokes (comms-governance, conversation-memory, response-reconciliation, response-roundtrip) and admin/employee nav screenshots need login (`DEMO_SHARED_PASSWORD`) — pending, same gate as the seed slice. HTTP-layer live checks (bundle flip, `/tools-connections` 200, `/organization-seeding` 200) are the ceiling without it.

---

## Employee IA tightening — minimal ambient nav, human copy (CT)
- **Goal:** the employee shell must feel ambient and work-oriented, never admin/diagnostic/developer. Minimal primary, curated More, human language, no admin/Dandelion internals — without removing any route.
- **Real surface = `AmbientNav`** (EmployeeLayout renders it; the dense `EmployeeNav` is legacy/unused). AmbientNav holds a tiny hardcoded primary rail + a "More" sheet that reuses `EMPLOYEE_NAV`.
- **Primary rail (approved minimal):** Today (`/app`) · Needs me (`/app/action-center`) · **Comms** (`/app/comms`, added) · People (`/app/collaboration`) · Memory (`/app/my-memory`) + More. The ambient orb is the "Ask Otzar" assistant entry, so it isn't duplicated in the rail.
- **Curated More:** AmbientNav's `more` filter now excludes `hidden` items (and adminOnly-gates). `nav-employee.ts` gained a `hidden?: boolean` flag (mirrors the admin `comingSoon` hide-but-route pattern) marking redundant/niche surfaces **route-only**: Chat (↔ Talk to Otzar), Getting started, Observe, Voice captures (↔ Comms/Meeting captures), Conversations (↔ Comms). Their App.tsx routes stay registered — reachable by URL, never in nav.
- **Copy:** removed the last Dandelion internal from employee copy — `Collaboration.tsx` page header now reads "Otzar helps the right people stay connected to the right work — without the noise." Employee "Operational Health" nav label → **"Work health"** with plain-language copy. People & Collaboration nav copy de-jargoned.
- **nav-employee.ts grouping (legacy EmployeeNav):** primary trimmed to the everyday loop (My Day, Talk to Otzar, Action Center, My Work, Team Work[admin], Comms, People & Collaboration, My Digital Work Wallet); Blind Spots + Work health + Workspaces moved to More.
- **Tests:** `ambient-nav` (minimal primary incl. Comms; dense labels off the primary surface; More curated with hidden ones absent), `employee-nav` (new primary/more lists, hidden route-only set, no-Dandelion copy ban), `admin-employee-isolation` (Dandelion re-added to the employee jargon ban). Full suite green; typecheck 0; lint 0 errors; build ok.
- **DO NOT BREAK:** AmbientNav is the live employee surface; hidden items stay routed (deep-link safe); employees never see admin sections / Organization Seeding / diagnostics; no Dandelion/implementation jargon in employee copy; Comms + Action Center + People + Memory reachable on the primary rail.
- **Credential-gated (sanctioned):** employee-nav screenshot + the 4 live smokes need `DEMO_SHARED_PASSWORD` — pending. HTTP-layer checks (bundle flip, `/app` 200) are the ceiling without it.

---

## Deep Work OS live smoke suite — product-behaviour acceptance (CT)
Generic smokes prove the app is alive; these prove **Otzar is actually Otzar**. All assert product behaviour on the REAL default extraction path (no forced LOCAL_FALLBACK), so they catch the regressions production would hit. Env-gated; skip is explicit ("SKIPPED: DEMO_SHARED_PASSWORD missing"), never a pass.

### Files
- `tests/e2e/workos-helpers.ts` — API login, real-path `ingest`, `getMyWork`, `listSeeds`, `seedAction` (always sends a body — avoids FST_ERR_CTP_EMPTY_JSON_BODY), `semanticQuery`, `mask`, `ev`, `runMarker`. UI_BASE (app.otzar.ai) vs API_BASE (api.otzar.ai) decoupled.
- `tests/e2e/workos-fixtures.ts` — canonical transcripts (primary: David/Pratham/Shiney + noisy tail + GitHub gap + grant_tool_access seed; follow-up: memory compounding; private: isolation marker) + invariant matchers.
- `tests/e2e/workos-smoke-reporter.ts` — compact table (test · PASS/FAIL/SKIP · duration · masked evidence).
- `tests/e2e/otzar-live-workos-loop.spec.ts` — transcript → governed work (5 tests).
- `tests/e2e/otzar-live-workos-memory.spec.ts` — recall/compounding/isolation (4 tests).
- `tests/e2e/otzar-live-workos-admin.spec.ts` — governed seed lifecycle, safe mutation (4 tests).
- `tests/e2e/otzar-live-workos-ia.spec.ts` — employee minimal + admin 8-section IA (4 tests).
- `tests/unit/workos-smoke-contract.test.ts` — deterministic offline contract guard (9 tests; runs in `npm run test`).

### package scripts
`test:e2e:live:workos` · `:workos:memory` · `:workos:admin` · `:workos:ia` · `:workos:full` (4 deep + 4 baseline).

### What each proves (live-verified green)
- **loop**: conversation persisted (source of truth) · noisy tail quarantined + creates no work · David resolves as owner · every item has a typed execution plan · GitHub gap surfaces as a visible blocker (not silent drop) · tool gap → approval-required org seed (no auto-grant) · noisy tail → no seed · work-graph events written · survives reload.
- **memory**: org work is recallable + grounded (id+provenance, not hallucination) · compounds across conversations (one recallable record) · per-user isolated (a private marker does NOT leak to another user) · BOUNDARY test documents that org-wide cross-employee memory query is NOT built (Phase 6).
- **admin**: admin sees the governed queue · non-admin → 403 · approve = setup action, access NOT granted · hold/reject persist. SAFE: only mutates seeds THIS run created (matched by `source_conversation_id === ingest meeting_capture_id`), never a pre-existing prod seed; no grant, no send, no invite.
- **ia**: employee ambient rail = Today·Needs me·Comms·People·Memory; zero admin surfaces; More curated (route-only hidden absent) · admin nav.ts has the 8 sections + placements + connector fold · folded/moved/stub routes all resolve (deep-link safe).

### Env vars & safe-mutation rules
- `DEMO_SHARED_PASSWORD` (required; skip if missing). `OTZAR_SMOKE_EMAIL` (default vishesh), `OTZAR_SMOKE_ADMIN_EMAIL` (default sadeil, API-only), `OTZAR_SMOKE_NONADMIN_EMAIL` (default david). `OTZAR_API_BASE_URL` (default api.otzar.ai), `OTZAR_SMOKE_BASE_URL` (UI, default app.otzar.ai).
- Mutation is scoped to this-run seeds via `source_conversation_id`. Non-destructive residue: each admin run leaves a few test seeds + one setup TASK in prod (no delete endpoint). Never grants access / sends / invites / auto-applies.

### Fails loudly when
transcript doesn't persist · owner mapping regresses (David lost) · noisy tail creates work/seeds · execution plan missing · GitHub gap silently ready/dropped · Dandelion seed missing when expected · approve auto-grants · non-admin not blocked · employee nav leaks an admin surface · admin route safety lost · recall not grounded / leaks cross-user.

### Skips (honest) when
`DEMO_SHARED_PASSWORD` missing; admin/non-admin demo user unavailable. Skip text says SKIPPED + reason.

### Run before/after deploy
`npm run test` (unit incl. contract) always; `npm run test:e2e:live:workos:full` after a deploy to app.otzar.ai/api.otzar.ai. A red here means a real product regression, not a flaky 200.

## Capability truth (audits — the roadmap spec)
WHOLE + governed: WorkLedger source-of-truth · transcript transform · per-transcript identity resolution · teammate awareness · twin collab (governed, no auto-send) · gap-filling · self-scoped grounded recall · execution planning + approval gate.
SILOED / MISSING (ranked, the real "complete & whole" work): (A) single-source manual intake → generalize transform + multi-source ETL into the ONE ledger; (B) no unified query layer → org-wide data-grounded retrieval; (C) per-source identity → cross-source reconciliation; (D) no Goal model → goal/objective + work↔goal + progress; (E) no org-wide recall (Phase 6); (F) dormant connector/MCP write-back → governed execution (Agentforce parity), no auto-send. The smoke suite asserts what EXISTS and pins each gap as a boundary check so future ETL slices land against a suite that proves them.

---

## Slice A — source-agnostic multi-source ETL into the ONE WorkLedger (FND)
Un-silos intake WITHOUT a new data model. Transcript ingestion becomes ONE source through a shared source-agnostic core; every source normalizes to a `WorkSourceEvent` and flows through the SAME chain into the SAME `WorkLedgerEntry`. No second ledger, no per-app silo.

### Files
- `apps/api/src/services/otzar/source-event.ts` (NEW) — `WorkSourceEvent` contract (sourceType/sourceSystem/sourceId/sourceUrl/actor/participants/timestamp/org/content/evidence/sensitivity/dedupeKey/ingestionRunId/…), `sourceDedupeKey`, `sourceEvidenceDetails`, `normalizeSourceContent` (generic quality — noise quarantined so it can't mint work), `slackMessageToSourceEvent` (adapter).
- `apps/api/src/services/otzar/comms-ingest.service.ts` — `ingestTranscript` is now a THIN ADAPTER over the new `ingestSourceEvent(event, deps)` core. Transcript path is byte-identical (MANUAL_UPLOAD capture, no external id, per-paste unique id → never deduped, `source_type:"TRANSCRIPT"`, `details.source:"transcript_ingest"`). Non-transcript sources: generic quality, `API_INGEST` capture + external id, `source_type:"CONNECTOR"` + full source-evidence details, dedupe.
- `apps/api/src/services/otzar/meeting-capture.service.ts` — `findCaptureByExternalId(org, externalId)` dedupe lookup.
- `apps/api/src/services/otzar/otzar.service.ts` — `ingestSourceEvent` service method (validateSession "read"; refuses TRANSCRIPT — transcripts stay on /comms/ingest).
- `apps/api/src/routes/otzar.routes.ts` — `POST /api/v1/otzar/ingest/source-event` (409 ALREADY_INGESTED on dedupe).
- Barrel exports added (`ingestSourceEvent`, `WorkSourceEvent`, adapters).

### The one path
`WorkSourceEvent → quality/normalize → identity resolution → comms-extract → work-item-planner → execution-planner → connector-capability → createLedgerEntry(source_type + source evidence) → Work-Graph/memory events → Dandelion seeds → audit`. Transcript and connector sources traverse identical code; only the source-descriptor fields differ.

### Dedupe / idempotency (honest bound)
Connector events carry a stable external id (`sourceDedupeKey` = explicit or `system:id`), stored as `MeetingCapture.provider_meeting_id`. Re-ingesting the same event → `409 ALREADY_INGESTED`, zero duplicate work. `provider_meeting_id` has NO DB unique constraint, so this is a sequential (check-then-insert) guard — it dedupes re-POSTs but does not harden against concurrent duplicates. Transcripts never set an external id → never matched.

### Connector reality (no fake)
- Slack `conversations.history` is the one read rail returning real text → `slackMessageToSourceEvent` adapter ships. **Automated Slack PULL requires a connected Slack binding; until then the source is connector_missing/setup_required** and events are PUSHED to `/ingest/source-event`. Documented, not claimed.
- Gmail/Drive/Jira/Linear/GitHub/M365 read providers return metadata/counts only (no content) — not wired as content sources.
- MCP has registration but NO invoke handler — not claimed as live ingestion.
- No scheduler/poller/queue for source ingestion — all intake is request/push-driven (cron exists only for Action execution).
- **Actor handle→entity resolution is follow-on**: a real Slack handle (`@david`, `U0123`) won't resolve on the display-name roster, so real Slack actors land NEEDS_OWNER unless the owner is named in the message text. The generic-endpoint path proves intake; handle resolution is the next increment.

### Tests (all green)
- `tests/unit/source-event.test.ts` (10) — dedupe stability/idempotency, source-evidence preservation, generic noise quarantine, Slack adapter.
- `tests/integration/source-event-ingest.test.ts` (5, DB) — non-transcript intake through the SAME path (owner resolved, source_type+evidence, GitHub gap, work-graph, seeds, scoping); idempotent re-ingest (no dup work); different id re-ingests; noisy-only → no owned work; no cross-tenant leak.
- `tests/integration/comms-ingest.test.ts` (6, DB) — transcript parity preserved.
- Foundation typecheck 0.

### Acceptance mapping
non-transcript source → normalized event ✓ · same WorkLedger path ✓ · sourceType/source evidence on rows ✓ · execution planner runs ✓ · connector capability runs ✓ · work-graph events ✓ · Dandelion seeds ✓ · dedupe ✓ · identity resolution no leak ✓ · noise → no high-confidence work ✓ · transcript ingestion preserved ✓ · new non-transcript intake smoke added.

### Deploy + live verification
FND `8cfed73` (PR #502, merged, otzar-api live `dep-d9281guq1p3s73ep1g60`). Route `/otzar/ingest/source-event` live + gated (401). CT smoke `89ad571`. **Live: 25 passed · 0 failed · 0 skipped** — transcript parity (loop/memory/admin) preserved through the refactor + 4 new ETL tests (Slack-shaped event → governed work + source evidence; entered same my-work ledger; re-post → 409 ALREADY_INGESTED no dup; transcript refused). Run before/after deploy: `npm run test:e2e:live:workos:full`.

### DO NOT BREAK
one path (transcript delegates to ingestSourceEvent); transcript capture stays MANUAL_UPLOAD/no external id; dedupe only for connector sources; `source_type:"CONNECTOR"` + source_system in details for connector rows; no new ledger; org-scoped (no cross-tenant leak). Next: automated connector pull (Slack binding) + handle→entity resolution + Gmail/Docs content sources.

---

## Slice B — Unified Org Query Layer (governed, scoped, agent-grounding) (FND)
Now that many source types feed the ONE WorkLedger (Slice A), Slice B is the governed query LAYER that retrieves the whole org picture from that canonical source of truth. NO new data model, NO second memory, NO separate graph — it reads the same `WorkLedgerEntry` every source now feeds.

### Files
- `apps/api/src/services/work-os/org-query.service.ts` (NEW):
  - `queryOrgWork(args)` — scopes `self | project | team | org | admin`; optional lexical `query` (stopword-filtered, deterministic, matches title+summary+evidence quote), `project_id`, `filter` (all|blockers|connector_gaps|seeds), `sort` (relevance|recent), `limit`. Rich `OrgQueryResult`: id, type, title, summary, source_type, **source_system** (lowercased), **source_evidence**, source_conversation_id, owner, requester, project_id, project/team hints, status, confidence, sensitivity, scope_label, created/updated, **execution** plan, **connector_gap**, **dandelion_seed**, **audit_pointer**.
  - `groundContextForAgent({org, caller, is_manager, query, intent})` — what Otzar calls BEFORE answering/acting: retrieves governed, evidence-bearing rows for the caller; returns `sufficient` + `reason`; on no match `sufficient:false` with "do not fabricate…". Never invents — only real ledger rows the caller may see.
- `apps/api/src/routes/work-os-ledger.routes.ts` — `POST /work-os/org-query` (one flexible surface; scope enforced in-service via the `auth` helper's `manager`=can_admin_org) + `POST /work-os/org-query/ground`.

### Governance / no-leak (enforced BEFORE the read)
- self = own rows (OR owner/target/requester), excludes ORG_SEEDING + closed. project = **active membership** (`isActiveProjectMember`) else `NOT_PROJECT_MEMBER`. team/org/admin = **manager** (can_admin_org) else `SCOPE_NOT_PERMITTED`. admin scope = ORG_SEEDING only (the Dandelion queue). Cross-tenant scoped by `org_entity_id`. Rows are post-quarantine (noise never became a row → never returned); only scoped summary + evidence quote returned, never raw transcript.
- One query surface answers all the required questions (what work/mine/project/team/org, commitments-by-source, decisions, blockers via `filter=blockers`, connector gaps via `filter=connector_gaps`, pending seeds via admin scope, source evidence on every result, recent via `sort=recent`).

### Cross-source unification
Transcript rows (`source_system=transcript`) and Slice-A connector rows (`source_system=slack`) come back through ONE query — the un-siloed picture, live-proven.

### Tests (all green)
- `tests/integration/org-query.test.ts` (8, DB): self cross-source+evidence; uninvolved no-leak; team/org manager gate; project membership (member vs `NOT_PROJECT_MEMBER`); connector_gaps GitHub; admin-only seeds (+ non-admin `SCOPE_NOT_PERMITTED`, seeds excluded from self/org); no cross-tenant leak; agent grounding sufficient vs insufficient (honest refusal). Deterministic (no LLM).
- Foundation typecheck 0; unit + integration suites green.
- Live: new `otzar-live-workos-orgquery.spec.ts` (+ `test:e2e:live:workos:orgquery`, folded into `:full`).

### Agent grounding = data-grounded behaviour
`POST /work-os/org-query/ground` is the seam that moves Otzar from static prompt context to data-grounded: it returns real, scoped, evidence-bearing rows or an explicit `sufficient:false`. NOTE (boundary): wiring this into `conductSession`'s 8-layer context assembly (COEService.assembleContext seam) is the next increment — the grounding service is callable today; the live conductSession path is unchanged to avoid destabilizing it.

### Deploy + live verification
FND `284a2f6` (PR #504, merged, otzar-api live `dep-d9298l741pts73ceofqg`). Routes `POST /work-os/org-query` + `/work-os/org-query/ground` live + gated (401 unauthenticated). CT smoke `0261570`. **Live: org-query 5/5** (self both-sources+evidence+no-noise; connector_gaps GitHub; admin-only seeds; non-admin 403 admin/org; grounding sufficient + honest insufficient) and **full suite 30 passed · 0 failed · 0 skipped** — all prior parity (loop/etl/memory/admin/ia + 4 baseline) preserved. Local gate: typecheck 0 · unit 2805 · integration 1857 · org-query integration 8/8. Run before/after deploy: `npm run test:e2e:live:workos:full`.

### DO NOT BREAK
one query layer over the one ledger (no new model/memory/graph); scope enforced before read; admin seeds admin-only; project needs membership; team/org needs manager; no cross-tenant/raw-transcript/noise leak; grounding never fabricates (sufficient=false when empty).

## Capability roadmap update
Slice A (multi-source ETL) + Slice B (unified query + grounding) close gaps **A** and **B** of the "make Otzar whole" roadmap. Remaining: **C** cross-source identity reconciliation · **D** Goal layer · **E** wire grounding into conductSession (data-grounded answering) · **F** governed connector/MCP write-back (Agentforce-parity execution). The deep smoke suite (now loop + etl + orgquery + memory + admin + ia + 4 baseline) is the acceptance layer for each.

---

## Slice C — cross-source identity reconciliation (FND)
The same person shows up differently per source (display name in a transcript, email in Gmail, handle in Slack). Slice C resolves any of those to ONE canonical org entity so their work UNIFIES under a single identity in the one WorkLedger instead of fragmenting. Closes the Slice-A boundary ("real Slack handle → NEEDS_OWNER").

### Files
- `apps/api/src/services/otzar/identity-reconciliation.service.ts` (NEW): `reconcileIdentity(orgEntityId, {name?,email?,handle?})` + `reconcileParticipants` (batch) + pure `reconcileAgainst(members, hint)` + `loadOrgMembers`. Deterministic precedence **email → username → name**; org-scoped (only ACTIVE members of THIS org); ambiguous name held (candidates, no auto-pick); unknown → none.
- `source-event.ts`: `WorkSourceEvent` actor + participants now carry optional `email` / `handle`.
- `comms-ingest.service.ts` (`ingestSourceEvent`): reconciles the event's actor + participants, and adds each resolved person's SOURCE-LOCAL name as a roster alias (only when it doesn't already resolve to that entity), so the content owner-resolver unifies the same person across sources. **Transcript path unchanged** (reconciliation is skipped for transcripts — no external identifiers).
- `otzar.service.ts` + route: `/otzar/ingest/source-event` accepts participant/actor email+handle.
- Barrel exports added.

### Reuses (no new model, no migration)
`Entity.email` (unique) · `EntityProfile.username` (unique, the handle) · `display_name` · `resolveTokenToEntities` (strict name rules) · `EntityMembership` (org roster / tenant boundary). No new table, no fuzzy matching.

### Governance / honest behaviour
Org-scoped (a member of another org never matches — cross-tenant blocked). Deterministic: exact email / exact username / strict display-name; **ambiguous is held, unknown resolves to nothing** (the caller keeps NEEDS_OWNER, never a wrong attribution).

### Tests (all green)
- Unit `identity-reconciliation.test.ts` (6): email/username/name precedence, ambiguous held, unknown none, email disambiguates an ambiguous name.
- Integration `identity-reconciliation.test.ts` (4): resolve by email/handle/name org-scoped; NO cross-tenant match; **UNIFIES transcript "David" + Slack "Dave"+email → one owner (work from both sources under one entity)**; unknown participant → NEEDS_OWNER.
- Parity preserved: comms-ingest 6/6 (transcript), source-event 5/5 (Slice A). Fixed a wiring bug where aliasing an already-matching name created a duplicate roster row → false ambiguous; now aliases only when the name doesn't already resolve to that entity.
- Foundation typecheck 0; unit + integration suites green.
- Live: new `otzar-live-workos-identity.spec.ts` (+ `test:e2e:live:workos:identity`, folded into `:full`).

### Deploy + live verification
FND `37a7994` (PR #506, merged, otzar-api live). Slice C enhances the existing `/otzar/ingest/source-event` (accepts participant/actor email+handle) — no new route. CT smoke `af5aa7a`. **Live: identity smoke 3/3** — (1) a source-local name "Davey" + a real member's email → reconciled to the canonical owner (owned work); (2) the same event WITHOUT the email → NEEDS_OWNER (email is what unified it); (3) a stranger email/name → no match. Full-suite parity (`test:e2e:live:workos:full`, now 33 checks incl. loop/etl/identity/orgquery/memory/admin/ia + 4 baseline) confirming; transcript path unchanged, local parity green (comms-ingest 6/6, source-event 5/5). Local gate: typecheck 0 · unit 2811 · integration 1861 · reconciliation unit 6/6 + integration 4/4.

### DO NOT BREAK
one canonical entity per person across sources; transcript path unchanged; deterministic (no fuzzy); ambiguous held / unknown NEEDS_OWNER (never wrong match); org-scoped (no cross-tenant identity match); alias added only when the source-local name doesn't already resolve.

## Capability roadmap update
Slices A (multi-source ETL) + B (unified query + grounding) + C (cross-source identity) close gaps A/B/C. Remaining: **D** Goal layer (user + org objectives, work↔goal, progress) · **E** wire org-query grounding into conductSession (data-grounded answering) · **F** governed connector/MCP write-back (Agentforce-parity execution). The deep smoke suite (loop · etl · identity · orgquery · memory · admin · ia · 4 baseline) is the acceptance layer for D–F.
