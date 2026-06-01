# Section 10 — Deployment / Security / Go-Live Operations

> Tier 3 build-state for Section 10. Section 10 is the launch-readiness control center: deployment + security + observability + operational substrate that enables first-customer go-live.

## Current status

**READ-ONLY production-readiness audit landed 2026-06-01** per `[FOUNDER-SECTION-10-PRODUCTION-READINESS-AUDIT-AUTH]`. No code changes; no schema; no new routes; no runtime behavior. Audit identifies what is production-grade today, what is launch-critical and missing, what is forward-substrate, and what requires Founder product decision.

**ADR-0080 LANDED design-only 2026-06-01** per `[FOUNDER-ADR-0080-OOTB-DANDELION-ONTOLOGY-DESIGN-ONLY-AUTH]` (PR #TBD). Architecture + product-ontology ADR closes one of the three hard launch blockers at the architecture register — `docs/architecture/decisions/0080-out-of-the-box-role-tool-workflow-connector-dandelion-ontology.md`. 16 design objects defined (RoleTemplate / DepartmentTemplate / CompanyTemplate / ToolProfile / WorkflowTemplate / ConnectorPreset / DelegatedAuthorityProfile / PermissionBundle / OnboardingQuestionSet / AhaMomentPack / SafeFallbackMode / OrgChartRelationshipTemplate / IndustryVariant / CompanySizeVariant / DandelionFlowTemplate / DigitalTwinStarterProfile). NO schema, NO code, NO seed data, NO runtime behavior, NO mutation to existing `dandelion.service.ts`. Recommended next slice = Wave 2 static seed catalog with Executive Assistant deepest worked example — **do NOT implement Wave 2 without separate Founder authorization**.

**Foundation main HEAD:** `5b0b607` (post PR #164; ADR-0080 in flight) · **CT main HEAD:** `f4c24dd`

## Repository heads audited

| Repo | Path | Main HEAD | Branch | Working tree |
|------|------|-----------|--------|--------------|
| Foundation | `/Users/genghishameha/Desktop/NIOV Labs/github/niov-foundation` | `fc54839` | `main` | clean |
| Control Tower | `/Users/genghishameha/Desktop/NIOV Labs/github/otzar-control-tower` | `f4c24dd` | `main` | clean (untracked AGENTS.md/CONTEXT.md allowed) |

Both repos `git pull --rebase origin main` clean. No dirty state.

## Launch readiness summary

| Category | Status | Notes |
|----------|--------|-------|
| Auth / session | ✓ READY | JWT HS256, TAR-based, dual-control + break-glass LIVE |
| Audit chain | ✓ READY | SHA-256 14-field canonical record + BEFORE DELETE trigger + append-only |
| COSMP read/write/share | ✓ READY | LIVE end-to-end with permission + clearance + audit |
| Section 7 Audit Viewer | ✓ READY | Foundation + CT both complete for current scope |
| Section 9 Approvals + Policies | ✓ READY | Dual-control + two-person rule + compliance posture live |
| Section 5 Agent Playground | ✓ READY | Waves 1-10 + ADR-0078 Stage 2 + Hive C1 LIVE |
| Boot-time env validation | ✓ READY | REQUIRED + production-mode crypto gates enforced |
| HMAC outbound + inbound substrate | ✓ READY | OutboundWebhook live; verifyInboundHmac reusable |
| Rate limiting | ✓ READY | Redis-backed atomic INCR; fails open on Redis down |
| CORS + Helmet | ✓ READY | Exact-origin allowlist, hardened headers |
| No-leak guard / no-console anchor | ✓ READY | RULE 16 test live; comprehensive forbidden-token coverage |
| **Section 8 Billing** | **✗ NOT STARTED** | No Subscription/Plan/Seat/Stripe substrate; LAUNCH BLOCKER if commercial launch |
| **Section 4 first real connector** | **⚠ DECISION-BLOCKED** | OutboundWebhook is the only LIVE adapter; needs Founder decision on Slack vs Gmail vs Salesforce etc. |
| **Section 9 Workflows page** | **⚠ DECISION-BLOCKED** | Foundation has `Workflow` model stub; no service/routes/ADR yet; CT page still Placeholder |
| **Section 10 operational substrate** | **⚠ FOUNDATIONS LAID** | Deployment runbook + GOVSEC.5 break-glass LIVE; metrics/observability/rollback runbook deferred |
| **OOTB role/tool/workflow templates** | **✗ MISSING** | New launch-readiness gap surfaced by Founder; see §OOTB section below |

## Section-by-section product dashboard

| § | Section | Status | Launch-critical | Last completed | Remaining |
|---|---------|--------|-----------------|---------------|-----------|
| 1 | Employee Intelligence Core | COMPLETE v1 | NO | Wave 6B (#124) | advanced drift signals (forward) |
| 2 | Autonomous Execution Core | COMPLETE internal scope | DEPENDS | Wave 12 notifications | external delivery adapters (Section 4 dep) |
| 3 | Hives / Team Intelligence | COMPLETE v1 + C1 | NO | C1 HIVE_CONTEXT (#159) | C2 expanded signals (forward) |
| 4 | MCP / Connectors | Waves 1-7 + Hardening B LIVE | YES | Hardening Wave B | first real external adapter — DECISION POINT |
| 5 | Agent Playground | COMPLETE end-to-end | NO for basic cockpit | Stage 2 closeout (#161) | ADR-0078 Stage 1/3 (forward) |
| 6 | Enterprise Analytics | COMPLETE (6 aggregates) | NO | Wave 7 (#119) | persistent caching (forward) |
| 7 | Full Audit Viewer | COMPLETE for current scope ✓ | YES — done ✓ | D4+D5 closeout (#162) | regulator scope + Layer 4 (forward) |
| 8 | Billing / Entitlements | NOT STARTED | YES if SaaS | n/a | All — DECISION POINT |
| 9 | Admin / Governance CT | Approvals ✓ + Policies ✓ | YES | Section 9 closeout (#163) | Workflows ADR — DECISION POINT |
| 10 | Deployment / Security / Go-Live | **THIS AUDIT (READ-ONLY)** | YES | this PR (#TBD) | Founder decision on next slice + OOTB ontology |

## Security readiness

| Surface | Status | Evidence |
|---------|--------|----------|
| Bearer auth | ✓ | `apps/api/src/middleware/auth.middleware.ts` enforces every non-public route |
| TAR capabilities (8 flags) | ✓ | `packages/database/prisma/schema.prisma:230-266` defaults safe; `can_admin_niov` is highest privilege |
| Same-org gate | ✓ for governance | `apps/api/src/services/governance/org.ts:getOrgSettingsOrDefaults`; per-route discipline relies on service-tier `getOrgEntityId` checks |
| Self-scope (wallet) | ✓ | COSMP + Hive + Playground + Otzar conversations all wallet-scoped at session.entity_id |
| Secret discipline | ✓ | `secret_ref` env-var-name pattern per ADR-0024; no plaintext in DB |
| HMAC outbound | ✓ | `OutboundWebhookProvider` SHA-256 + replay-resistant timestamp |
| HMAC inbound substrate | ✓ but unused | `verifyInboundHmac` reusable receiver; no inbound webhook routes consume it yet |
| Rate limiting | ✓ | `apps/api/src/rate-limit.ts` Redis Lua INCR atomic; fails open |
| RULE 16 no-console | ✓ | `tests/unit/no-console-in-api-src.test.ts` enforced in CI |
| RULE 4 audit-before-response | ✓ | `writeAuditEvent` discipline + BEFORE DELETE trigger via `scripts/apply-audit-triggers.ts` |
| ADR-0026 dual-control | ✓ LIVE | `requireDualControl` middleware; 8 audit literals on Zone U1 chain |
| ADR-0050 break-glass | ✓ LIVE | `BreakGlassGrant` model + single-use TOCTOU-safe consumption + audit |
| Audit chain integrity | ✓ | SHA-256 14-field canonical record per ADR-0071; previous_event_hash chain; cross-scope verify endpoint |
| CT auth posture | ✓ MVP | In-memory bearer (Zustand); 401 → logout; httpOnly refresh deferred to Section 16 |
| CT XSS surface | ✓ | Zero `dangerouslySetInnerHTML`; Radix + shadcn primitives only |
| CT forbidden-copy + no-leak guards | ✓ | All 4 launch-critical pages (Security, Agent Playground, Approvals, Policies) tested |

**Known security gaps (non-launch-blocking but tracked):**
- Same-org gate is per-route discipline, not centralized middleware — requires periodic audit review.
- httpOnly refresh-token flow deferred to Section 16 (current MVP accepts page-refresh = re-login).
- No automated security scanning in CI beyond no-leak token guards.

## Deployment readiness

| Item | Status | Evidence |
|------|--------|----------|
| Env var inventory documented | ✓ this doc | See §Env vars below |
| Boot-time env validation | ✓ | `apps/api/src/boot-validation.ts:33-120` REQUIRED + production crypto gates |
| Production crypto enforcement | ✓ | ENCRYPTION_KEY ≥32 bytes, JWT_SECRET ≥32 bytes, BCRYPT_ROUNDS ≥12 when `NODE_ENV=production` |
| Database connection strategy | ✓ | Pooler (DATABASE_URL) for runtime; DIRECT_URL for migrations per Supabase best-practice |
| pgvector + HNSW index | ✓ | `scripts/apply-pgvector-extension.ts` + `scripts/apply-hnsw-index.ts` in CI |
| Audit trigger | ✓ | `scripts/apply-audit-triggers.ts` in CI applies BEFORE DELETE trigger |
| CORS allowlist | ✓ | Exact-origin only, helmet headers registered first (`apps/api/src/server.ts:165-189`) |
| Build commands | ✓ | `package.json` scripts standard |
| CI workflow | ✓ | `.github/workflows/ci.yml` 4 required checks: typecheck / unit / integration / Elixir (Foundation); verify (CT) |
| Deployment runbook | ✓ partial | `docs/operations/deployment-runbook.md` exists (created at ADR-0047 PR.4); not exercised against a real deploy yet |
| Rollback runbook | ✗ MISSING | db:push has no rollback; assumes Supabase PITR + manual restore |
| Admin bootstrap runbook | ✗ MISSING | First `can_admin_niov` grant is direct DB edit; not documented |
| Smoke test suite | ✗ MISSING | No formal smoke tests; CI relies on unit + integration |

### Env vars (REQUIRED vs OPTIONAL)

**REQUIRED (server boot fails):**
- `JWT_SECRET` (HS256 signing key; ≥32 bytes in production)
- `DATABASE_URL` (Supabase pooler at port 6543 with pgbouncer)
- `REDIS_URL` (Upstash or local Redis for rate limiting)
- `ENCRYPTION_KEY` (≥32 bytes; **production only** — dev falls back to SHA-256(JWT_SECRET))

**OPTIONAL (have safe defaults or warn-only):**
- `DIRECT_URL` (Postgres direct for Prisma migrations)
- `BCRYPT_ROUNDS` (≥12 production min)
- `NODE_ENV` (`production` triggers crypto gates)
- `PORT` (default 3000; HOST `0.0.0.0`)
- `LOG_LEVEL` (Pino level; default `info`)
- `CONTROL_TOWER_URL` + `FOUNDATION_COMMAND_URL` (CORS allowed origins)
- `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` (LLM/embeddings; mocked in tests)
- `OTZAR_ENTITY_ID` (auto-seeds if missing)

**CT env vars:**
- `VITE_FOUNDATION_API_URL` (default `http://localhost:3000/api/v1`)

## Observability readiness

| Item | Status | Notes |
|------|--------|-------|
| Pino structured logging | ✓ | `apps/api/src/logger.ts` JSON output; ISO timestamps; PII redaction (authorization, cookie, password, token, email, public_key) |
| Health endpoint | ✓ | `GET /api/v1/health` returns `{ok, version, timestamp, database}`; pings DB with SELECT 1 |
| Request IDs | ✓ partial | Fastify `req.id` auto-assigned; not yet systematically propagated as trace ID |
| Audit events as observability signal | ✓ | 40+ closed-vocab literals + safe metadata; queryable via `/api/v1/audit/events` |
| Metrics (Prometheus/OTel) | ✗ MISSING | No metrics endpoint; forward-substrate per GOVSEC.2 |
| Operational dashboards | ✗ MISSING | No Grafana/Datadog/CloudWatch integration documented |
| Alerting policies | ✗ MISSING | No alerting config; relies on operator polling |
| Error rate tracking | ✗ MISSING | No central error aggregator (Sentry/Rollbar/etc.) |
| Retry / circuit breaker | ✓ partial | Action executor uses retry budget + AbortController; connector dispatch is single-shot (Action runtime owns retry) |

## Data / persistence readiness

| Item | Status | Notes |
|------|--------|-------|
| Prisma schema maturity | ✓ | ~30 models + ~20 enums in `packages/database/prisma/schema.prisma` |
| Soft-delete coverage | ✓ | 24+ models with `deleted_at` column; RULE 10 enforced |
| Audit chain append-only | ✓ | BEFORE DELETE trigger per ADR-0002 |
| Audit chain integrity | ✓ | SHA-256 14-field canonical record per ADR-0071 |
| Tenant/org isolation | ✓ | wallet_id + org_entity_id + jurisdiction (per CAR Sub-box 2) on key models |
| NDJSON / CSV audit export | ✓ LIVE | Foundation route + CT D3 export both LIVE |
| Migration discipline | ✓ partial | `db:push` workflow per ADR-0025; no rollback runbook |
| Backup / restore | ✓ assumed | Supabase managed backups; no in-repo restore testing |
| Retention / legal hold | ✓ design | ADR-0079 §14 + §15 policy LIVE design-only; substrate enforcement deferred to Stage 1+ |
| Regulator evidence substrate | ✓ partial | LawfulBasis model + ADR-0036 9-condition gate LIVE; regulator-view route LIVE; CT consumer deferred |

## Control Tower page inventory

| Path | Component | Status | Substrate | Launch-critical |
|------|-----------|--------|-----------|-----------------|
| `/login` | LoginPage | Real | `api.auth.signIn` | YES |
| `/` (Home) | HomePage | Real | `api.org.analytics` + `api.org.audit.list` | YES |
| `/users` | UsersPage | Real | `api.org.entities.*` + onboarding wizard | YES |
| `/ai-teammates` | AITeammatesPage | Real | `api.org.aiTeammates.*` + skill packages | YES |
| `/access-control` | AccessControlPage | Real | `api.org.permissions.*` + `api.cosmp.{share,revoke}` | YES |
| `/data-knowledge` | DataKnowledgePage | **Placeholder** | (none) | NO |
| `/security-audit` | SecurityPage | **Real** ✓ | `api.audit.*` (list/detail/verifyChain/export) | YES |
| `/analytics` | AnalyticsPage | **Placeholder** | (none yet) | NO |
| `/conversations` | ConversationsPage | **Placeholder** | (Otzar conversation list deferred) | NO |
| `/workflows` | WorkflowsPage | **Placeholder** | **NONE** — needs ADR | **DECISION POINT** |
| `/playground` | PlaygroundPage | **Placeholder** | (NEGOTIATE UI harness deferred) | NO |
| `/agent-playground` | AgentPlaygroundPage | **Real** ✓ | `api.playground.*` (10 methods) + `api.actions.getAction` | YES |
| `/policies` | PoliciesPage | **Real** ✓ | `api.compliance.{listFrameworks,getState}` | YES |
| `/system-health` | SystemHealthPage | **Placeholder** | (`/health` exists; CT consumer deferred) | NO |
| `/settings` | SettingsPage | **Placeholder** | (settings substrate scattered) | NO |
| `/onboarding` | OnboardingPage | **Placeholder** | `api.org.onboarding.*` LIVE; UI consumer deferred | YES if launch-onboarding-flow needed |
| `/documentation` | DocumentationPage | **Placeholder** | (in-product docs deferred) | NO |
| `/intelligence` | IntelligencePage | **Placeholder** | (COE intelligence aggregation deferred) | NO |
| `/approvals` | ApprovalsPage | **Real** ✓ | `api.escalations.*` | YES |
| `/app/*` | Employee Otzar shell | Real | full employee substrate | YES (employee surface) |

**Placeholder breakdown:** 10 of 19 routes still Placeholder. Launch-critical Placeholders: **Workflows (decision point)** + **Onboarding (decision point if first launch uses it)**. Others are post-launch or substrate-not-ready.

## Connector readiness

| Item | Status | Evidence |
|------|--------|----------|
| ConnectorBinding model | ✓ | `packages/database/prisma/schema.prisma:1688-1725`; secret_ref env-var-name discipline |
| OutboundWebhook real adapter | ✓ LIVE | `apps/api/src/services/connector/outbound-webhook.provider.ts` HMAC-SHA-256 signed |
| Inbound HMAC verifier | ✓ substrate | `apps/api/src/services/connector/inbound-hmac.ts` reusable; no inbound routes consume yet |
| INVOKE_CONNECTOR ActionType handler | ✓ LIVE | Routes through Action runtime per ADR-0057 |
| Connector dispatcher | ✓ | Action runtime owns retry / cancel / audit chain |
| OAuth substrate | ✗ MISSING | No OAuth provider implementation; first OAuth connector will be substantial slice |
| Real SDK-bound adapters | ✗ MISSING | None beyond OutboundWebhook |
| CT connector management UI | ✗ MISSING | No `/connectors` page in CT |

### First-adapter analysis (Founder decision point)

| Adapter | API surface | Auth complexity | Enterprise demand | Est. slice size | Recommendation |
|---------|-------------|-----------------|-------------------|----------------|-----------------|
| **Slack** | POST chat.postMessage (token) | LOW (Bot token) | VERY HIGH | Medium (1-2 weeks) | **TOP CANDIDATE** — token auth, mature API, ubiquitous |
| Gmail | Google API | HIGH (OAuth2 + refresh) | HIGH | Large (3-4 weeks) | Defer until OAuth substrate exists |
| Microsoft Teams | Graph API | HIGH (OAuth2) | HIGH | Large | Defer (OAuth) |
| Google Workspace | Admin API | HIGH (OAuth2 + admin consent) | MEDIUM | Large | Defer (OAuth) |
| Salesforce | REST + OAuth2 | VERY HIGH | VERY HIGH | XL (4-6 weeks) | Defer (OAuth + complex schema) |
| Linear | GraphQL (API key) | LOW | MEDIUM | Small (1 week) | Lower priority (smaller market) |
| Jira | REST + OAuth2 | HIGH | HIGH | Large | Defer (OAuth) |
| SAP Concur | REST + OAuth2 | HIGH | HIGH (for EA/finance roles) | Large | High value if EA role template lands; defer until OAuth |

**Recommendation (substrate-honest):** Slack first. Token auth = no OAuth blocker. High enterprise ubiquity. Then build OAuth substrate as its own slice, which unlocks Gmail/Google Workspace/Jira/Salesforce/Concur.

**But see OOTB section below** — the Founder's preferred approach is to derive connector priority from the role/tool ontology first, not from founder intuition.

## Billing / entitlement readiness

| Item | Status | Evidence |
|------|--------|----------|
| Subscription / Plan models | ✗ MISSING | grep finds no Subscription, Plan, Seat, Entitlement, Billing, Stripe, Chargebee, Paddle in `packages/database/prisma/schema.prisma` |
| Entitlement enforcement points | ✗ MISSING | No `hasFeature(...)` style guards |
| Usage counters | ✗ partial | `MemoryCapsule.access_count` exists as a proxy; no service-level metering |
| Admin billing surfaces | ✗ MISSING | No `/billing/*` routes |
| Billing provider integration | ✗ MISSING | No Stripe/Chargebee/Paddle integration |

**Status:** **STUB-ONLY.** This is the cleanest LAUNCH BLOCKER if Otzar ships as commercial SaaS.

**Founder decisions needed before ADR drafting:** pricing tiers, billing provider, seat vs usage model, grace-period policy, trial flow.

## Workflow readiness

| Item | Status | Evidence |
|------|--------|----------|
| `Workflow` Prisma model | ✓ EXISTS | `packages/database/prisma/schema.prisma:1792-1806` (workflow_id, org_entity_id, name, trigger_type, actions[], status) |
| `WorkflowService` | ✗ MISSING | No service in `apps/api/src/services/` |
| Workflow routes | ✗ MISSING | No `/workflows/*` routes |
| Workflow ADR | ✗ MISSING | No ADR defines what a "workflow" means as substrate |
| CT `/workflows` page | ✗ Placeholder | `src/pages/Workflows.tsx` is 18-line Placeholder |
| Workflow overlap with ActionPolicy | partial | ActionType + ActionPolicy cover per-action governance; Workflow would be the multi-step orchestration container |

**Founder decision needed:** Draft Workflows ADR now (substantial substrate work; multi-slice arc) OR mark Placeholder deferred to post-launch and remove from nav OR keep as-is until first customer surfaces a clear workflow need.

## Out-of-the-box role/tool/workflow template readiness

> **NEW DIMENSION** added per `[FOUNDER-SECTION-10-AUDIT-ADDENDUM-OUT-OF-THE-BOX-ROLE-TOOL-WORKFLOW-TEMPLATES]` + `[FOUNDER-SECTION-10-AUDIT-ADDENDUM-DELEGATED-AUTHORITY-PERMISSION-BUNDLES-ONBOARDING]`. Founder doctrine: Otzar must feel useful on day one. The customer should not have to hand-tune every Digital Twin from zero. Every Digital Twin should start with a role-aware operating model that knows what the role commonly does, what tools it commonly uses, what workflows it commonly runs, what it's commonly allowed to do, what requires approval, what should never be enabled by default, and what onboarding questions to ask.

### Current state (substrate-honest grep findings)

| OOTB substrate | Exists? | Evidence |
|----------------|---------|----------|
| `RoleTemplate` model | ✗ MISSING | Only a `role_template: String?` field on TwinConfig at `schema.prisma:881` — a free-text label, not a structured template |
| `ToolProfile` model | ✗ MISSING | grep zero hits |
| `WorkflowTemplate` model | ✗ MISSING | grep zero hits (distinct from the bare `Workflow` model stub) |
| `ConnectorPreset` model | ✗ MISSING | grep zero hits; `ConnectorBinding` is per-org config, not a preset catalog |
| `DelegatedAuthorityProfile` | ✗ MISSING | TAR capabilities are individual boolean flags; no role-level bundle |
| `PermissionBundle` | ✗ MISSING | Permission model is per-grant scalar; no bundle/template substrate |
| `OnboardingQuestionSet` | ✗ MISSING | `api.org.onboarding.*` substrate exists but is about org-admin invite flow, not role-question discovery |
| `AhaMomentPack` | ✗ MISSING | grep zero hits |
| `SafeFallbackMode` | ✗ MISSING | No "what the Twin can do without connectors" substrate |
| `OrgChartRelationshipTemplate` | ✗ MISSING | EntityMembership captures parent/child; no reporting-line / dotted-line / executive-support / OOO-delegation substrate |
| `IndustryVariant` | ✗ MISSING | Entity has `sector` but no industry-variant rule substrate |
| `CompanySizeVariant` | ✗ MISSING | grep zero hits |
| Role-to-tool mapping | ✗ MISSING | No table or static catalog |
| Role-to-workflow mapping | ✗ MISSING | No table or static catalog |
| Twin starts with role-based starter profile | ✗ partial | TwinConfig.role_template is a free-text hint consumed by Otzar service at `apps/api/src/services/otzar/otzar.service.ts:556-558` to look up an `AgentTemplate` by role_name — but `seedAgentTemplates` is a STUB per `apps/api/src/services/governance/seeds.ts` (no real catalog seeded) |
| CT template configuration surface | ✗ MISSING | No `/role-templates`, `/tool-profiles`, `/workflow-templates`, `/connector-presets` CT page |

### Answers to the required audit questions

1. **Does Foundation currently have role templates?** ✗ NO. Only a `role_template: String?` free-text label on TwinConfig + a `seedAgentTemplates` stub that doesn't seed real templates.
2. **Does Foundation currently have tool profiles?** ✗ NO.
3. **Does Foundation currently have workflow templates?** ✗ NO (the bare `Workflow` model stub is per-org config, not a starter catalog).
4. **Does Foundation currently have connector presets?** ✗ NO (only `ConnectorBinding` per-org config exists).
5. **Does Foundation currently map roles to tools?** ✗ NO.
6. **Does Foundation currently map roles to workflows?** ✗ NO.
7. **Does Control Tower currently expose template configuration?** ✗ NO.
8. **Does onboarding currently ask role/tool/workflow questions?** ✗ NO. Org-admin onboarding (`api.org.onboarding.*`) handles bulk invites + role-title assignment but does NOT ask role-specific questions to bootstrap a Twin's operating model.
9. **Does any Digital Twin start with a role-based starter profile?** ✗ NO meaningfully — twins use a free-text `role_template` hint with no backing catalog.
10. **Does Otzar currently have delegated authority templates?** ✗ NO.
11. **Does Otzar currently have permission bundles by role?** ✗ NO.
12. **Does Otzar currently have onboarding question sets by role?** ✗ NO.
13. **Does Otzar currently have safe fallback modes when tools are not connected?** ✗ NO formal substrate (Otzar will still respond to prompts but has no role-aware fallback playbook).
14. **Does Otzar currently have role-specific aha moment packs?** ✗ NO.
15. **Does Otzar currently understand executive support relationships?** ✗ NO (EntityMembership has parent/child but no "EA → executive" semantic).
16. **Does Otzar currently understand reporting lines / direct reports / dotted-line relationships?** ✗ partial — EntityMembership captures basic hierarchy; no dotted-line / executive-support / OOO-delegation / temporary-delegation substrate.
17. **Does Otzar currently have industry/company-size variants?** ✗ NO.
18. **What is missing for Otzar to feel useful on day one?** EVERYTHING above. Otzar today is substrate-complete but role-naive. A customer onboarding a CFO Twin or an EA Twin or a Sales Rep Twin gets a blank intelligent surface, not a role-aware operating partner.

### Worked example: Executive Assistant Twin (per Founder context)

An EA Twin should know out of the box that EAs typically:
- manage executive calendars (Google Calendar / Outlook)
- triage email (Gmail / Outlook)
- book travel + manage expense (SAP Concur / Expensify / Ramp / Brex / Navan / TravelPerk)
- coordinate with Finance / HR / Legal / Board / Investors
- have delegated calendar + draft-email authority, often delegated send authority, sometimes delegated travel/expense approval under policy threshold
- MUST NOT default to: board materials access, compensation docs, M&A docs, customer-confidential, financial forecasts, full inbox access (unless explicitly delegated)
- "aha moment" automations: tomorrow's executive day brief, travel + expense shell, commitment follow-up draft, board meeting prep, focus-time protection

**Current Otzar substrate to support this:** None. The EA Twin's role_template field could be set to "Executive Assistant" but `seedAgentTemplates` is a stub — no AgentTemplate row exists with EA defaults, no tool profile catalog, no permission bundle, no onboarding question set ("Which executive(s) do you support?", "Which travel/expense system do you use?", "What spend threshold requires approval?"), no aha moment pack, no safe fallback ("Even without Concur connected, EA can draft itinerary checklist, identify needed booking details, prepare expense shell").

### Dandelion onboarding readiness (per Founder addendum)

> **Dandelion** is named as the activation layer that turns the OOTB ontology into a customer-facing onboarding + discovery + Twin-starter-profile experience. Section 10 must answer whether Dandelion exists today and what's missing.

**Substrate-honest grep findings:**
- `apps/api/src/services/governance/dandelion.service.ts` — EXISTS. Foundation backend service for org-admin Phase 0 (org creation atomic transaction) + Phase 2 (analyze invites) + Phase 3 (propagate) + Phase 4 (status). Consumed by `apps/api/src/routes/org.routes.ts`.
- `packages/database/prisma/schema.prisma:605` + `:798` + `:845` — Dandelion-aware seed substrate (frameworks, industry hints, gateway).
- CT consumer: `/onboarding` is Placeholder; `src/lib/api.ts api.org.onboarding.{start, invite, reorder, status}` consumes the existing org-admin onboarding flow.

**Critical distinction (substrate-honest):**
- Today's "Dandelion" = **org-admin Phase 2/3/4 invite/propagate substrate** (bulk invite wizard for an org admin to seat employees).
- Founder's Dandelion = **employee + company + department + user onboarding / role discovery / tool discovery / workflow discovery / Twin starter-profile generation / connector-priority calculation** — a fundamentally broader activation layer that does NOT exist today.

**Answers to the required Dandelion audit questions:**

1. **Does Dandelion exist in the repo today?** ✓ PARTIAL — Foundation `dandelion.service.ts` handles org-admin invite Phase 2/3/4, NOT the role/tool/workflow/Twin activation flow.
2. **Is there a Dandelion route/page/service today?** ✓ partial — Foundation routes `api.org.onboarding.*`; CT `/onboarding` Placeholder.
3. **Does onboarding currently assign RoleTemplates?** ✗ NO. Invite wizard captures `role_title` as free text; no RoleTemplate substrate (see OOTB section above).
4. **Does onboarding currently ask tool/workflow questions?** ✗ NO. Org-admin flow is "who do you want to invite + what's their email + what role-title string"; no tool / workflow / preference discovery.
5. **Does onboarding currently ask delegated-authority questions?** ✗ NO. TAR capabilities default at signup; no per-role authority-bundle discovery.
6. **Does onboarding currently ask reporting-line questions?** ✗ NO (EntityMembership has parent/child but invite wizard doesn't capture this).
7. **Does onboarding currently generate DigitalTwinStarterProfiles?** ✗ NO. TwinConfig.role_template is a free-text hint; no profile-generation pipeline.
8. **Does onboarding currently recommend connector presets?** ✗ NO (and ConnectorPreset substrate doesn't exist).
9. **Does onboarding currently produce safe fallback modes?** ✗ NO.
10. **Does onboarding currently produce aha moment packs?** ✗ NO.
11. **What would Dandelion need to be launch-ready?** Three-tier flow (company-level → department-level → user-level onboarding question sets), DigitalTwinStarterProfile generation pipeline, connector-priority calculation engine, safe-fallback-mode resolver, aha-moment-pack assignment, governance-aware delegated-authority recommendation — all ADR-0080-dependent.
12. **Should Dandelion be required before Section 4 connector prioritization?** **YES per Founder doctrine.** Dandelion's company + department + user onboarding collects the role/tool demand data that feeds the connector-priority matrix. Founder addendum is explicit: "Instead of asking the Founder to guess whether Slack, Gmail, Google Workspace, Salesforce, Jira, or Concur should ship first, Dandelion can collect role/tool demand and produce connector priority."

**Critical governance note (per Founder addendum):** Dandelion **suggests**; Foundation governance **authorizes**. "Dandelion recommends the starter shape of the Digital Twin; Foundation governance authorizes what the Twin may actually do." Dandelion must never become an unsafe permission wizard — it must preserve read-only-first, write-disabled-by-default for risky systems, dual-control where needed, auditability, same-org scope, no sensitive/protected-attribute inference, no employee scoring, no manager surveillance, user correction/override, admin review, policy-driven activation.

**Dandelion + ADR-0080 fold-in:** The recommended ADR-0080 must define not only the template types listed in the prior addendum but ALSO:
- `DepartmentTemplate` (Dandelion department-level onboarding output)
- `CompanyTemplate` (Dandelion company-level onboarding output)
- `DandelionFlowTemplate` (the three-tier flow specification: company-level + department-level + user-level question sets, decision tree, output mapping)
- `DigitalTwinStarterProfile` (the activation output that bundles selected RoleTemplate + PermissionBundle + ToolProfiles + WorkflowTemplates + AhaMomentPack + SafeFallbackMode + delegated-authority defaults)

### Connector-selection implication for Section 4

Per the Founder addendum: **Before picking the first real Section 4 connector, Otzar should derive connector priority from the role/tool/workflow ontology AND Dandelion-collected company/department/user demand, not from founder intuition.** Connector priority should be ranked by:
- how many common roles use the tool
- centrality to daily work
- whether it enables an immediate aha moment
- read-value vs write-risk
- API + OAuth + security maturity
- enterprise adoption breadth
- auditability + approval-gating safety
- cross-department reach

Likely high-value connector categories (must include travel/expense for EA + Finance + COO + execs): Calendar, Email, Chat, Documents/Drive, Project management, CRM, HRIS/ATS, Travel/Expense (SAP Concur, Expensify, Ramp, Brex, Navan, TravelPerk), Finance/ERP, Support, Code repo, Security/compliance.

This means **Section 4 first-adapter decision should follow ADR-0080 (the OOTB ontology ADR)**, not precede it.

### Recommended follow-up — ADR-0080

**ADR-0080 — Out-of-the-Box Role / Tool / Workflow / Connector + Dandelion Onboarding Ontology for Digital Twins** (design-only ADR; no schema; no code; renamed per Dandelion addendum).

ADR-0080 must define:
- `RoleTemplate` (role_name, department, seniority, common reporting relationships)
- `ToolProfile` (tool_name, category, typical_roles, OAuth/auth requirements, write-risk classification)
- `WorkflowTemplate` (workflow_name, role, trigger, tools needed, approval-gating, audit posture)
- `ConnectorPreset` (preset_name, tool_name, default config, secret_ref pattern, write-risk class)
- `DelegatedAuthorityProfile` (common_proxy_actions, common_read_permissions, common_write_permissions, default_read_only_tools, default_write_disabled_tools, approval_required_actions, dual_control_required_actions, spend_limit_default, scheduling_authority, communication_authority, document_access_authority, financial_access_authority, HR_access_authority, legal_access_authority, customer_data_access_authority, board_material_access_authority, emergency_override_allowed, emergency_override_forbidden, audit_required_actions)
- `PermissionBundle` (starter permission sets keyed by role + seniority; EA / CFO / HRBP / PM / Sales / Engineer / Compliance / Board worked examples)
- `OnboardingQuestionSet` (minimum questions to bootstrap a role's operating model — see Founder addendum for per-role question lists)
- `AhaMomentPack` (3–5 default automations per role with name, trigger, tools needed, data needed, output, approval requirement, safe fallback, demo value, launch value)
- `SafeFallbackMode` (what the Twin can do with no connectors / what improves after each connector category lands / what stays disabled until governance approves)
- `OrgChartRelationshipTemplate` (likely_reports_to, possible_reports_to, likely_direct_reports, possible_direct_reports, likely_cross_functional_partners, common_confidential_relationships, common_delegate_relationships, common_proxy_authority, common_escalation_paths, common_approval_paths, common_meeting_cadence, common_document_access, common_tool_admin_relationships, dotted-line + executive-support + OOO-delegation semantics)
- `IndustryVariant` (startup / SMB / mid-market / enterprise / regulated enterprise / healthcare / finance / education / government / legal / SaaS / manufacturing — variants modify defaults; an EA in a 20-person startup ≠ an EA in a regulated public company)
- `CompanySizeVariant` (analogous to IndustryVariant by headcount)

After ADR-0080 lands design-only: **static seed catalog** (RoleTemplate + DepartmentTemplate + CompanyTemplate + ToolProfile + WorkflowTemplate + ConnectorPreset + DelegatedAuthorityProfile + PermissionBundle + OnboardingQuestionSet + AhaMomentPack + SafeFallbackMode + DandelionFlowTemplate for the top 10-15 roles); then **Control Tower / Dandelion preview** (company setup + department setup + user role setup + connector recommendation + aha moment activation); then **derive Section 4 first-connector priority from the resulting connector-priority matrix calculated by Dandelion against role/tool demand**.

**Founder's preferred sequence:** ADR-0080 design-only → static seed catalog → CT/Dandelion preview → Dandelion-driven connector priority matrix → first real Section 4 connector.

## Launch blockers (hard)

1. **Section 8 Billing/Entitlements — STUB-ONLY** if Otzar ships as commercial SaaS. Needs Founder product decision on pricing model + billing provider before any ADR can be drafted.
2. **Section 4 first real external adapter** — OutboundWebhook is the only LIVE adapter. Per the OOTB + Dandelion addendums: should be selected via ADR-0080 ontology + Dandelion-collected role/tool demand, NOT founder intuition.
3. **OOTB role/tool/workflow templates + Dandelion activation layer missing** — Otzar today is substrate-complete but role-naive AND has no role-discovery / Twin-starter-profile / connector-priority-calculation onboarding. Foundation's existing `dandelion.service.ts` handles only org-admin Phase 2/3/4 invites, NOT the company/department/user activation flow the Founder describes. ADR-0080 + seed catalog + CT Dandelion preview needed for day-one customer value.

## Launch blockers (soft / launch-target-dependent)

4. **Section 9 Workflows page** — CT Placeholder; needs ADR or removal. Not launch-critical for first customer who doesn't need workflow orchestration.
5. **Section 10 operational gaps**:
   - No rollback runbook for db:push.
   - No admin bootstrap runbook (first `can_admin_niov` grant is direct DB edit).
   - No formal smoke-test suite.
   - No metrics / operational dashboards / alerting.
   - No documented backup-restore procedure or RTO/RPO.
6. **CT Onboarding page** — Placeholder; Foundation `api.org.onboarding.*` is LIVE. Launch-critical only if first customer onboarding uses self-serve invite flow.

## Non-blocking forward-substrate (defer)

- Section 3 Hive C2 expanded signal types
- Section 5 ADR-0078 Stage 1 transcript substrate + Stage 3 governed listener + Layer 4 drilldown
- Section 6 persistent analytics caching (ADR-0061 amendment)
- Section 7 regulator scope flow (lawful_basis_id selection)
- Section 7 proactive REGULATOR_ACCESS_EXPIRED emitter via SCHEDULER
- Section 9 Workflows ADR (if not chosen as next slice)
- httpOnly refresh-token flow (Section 16)
- Prometheus / OpenTelemetry integration
- Real SDK-bound connectors beyond OutboundWebhook + the chosen first adapter

## Recommended next 3–5 slices

Ranked by launch-leverage:

1. **ADR-0080 design-only — OOTB Role/Tool/Workflow/Connector + DelegatedAuthority/PermissionBundle/OnboardingQuestionSet/AhaMomentPack/SafeFallbackMode/OrgChartRelationshipTemplate/IndustryVariant/CompanySizeVariant + Dandelion Onboarding ontology** (per all 3 Founder addendums; no schema; no code; ADR draft only). Unlocks Dandelion activation layer + Section 4 connector priority matrix + day-one customer value.
2. **Static seed catalog** — top 10-15 RoleTemplate + DepartmentTemplate + CompanyTemplate + ToolProfile + WorkflowTemplate + ConnectorPreset + DelegatedAuthorityProfile + PermissionBundle + OnboardingQuestionSet + AhaMomentPack + SafeFallbackMode + DandelionFlowTemplate (substrate work; bounded once ADR-0080 lands). Worked examples: Executive Assistant (with SAP Concur + travel/expense + delegated authority), CEO/Founder, COO, CFO, CHRO/People, Product Manager, Project Manager, Sales Rep, Customer Success, Engineer, Legal/Compliance, Board Member.
3. **CT Dandelion preview** — company setup + department setup + user role setup + connector recommendation + aha moment activation surfaces. Bounded after seed catalog.
4. **Use Dandelion-driven connector-priority matrix to pick first real Section 4 connector** (matrix = role/tool demand × API maturity × write-risk × cross-department reach; likely candidates after analysis: Slack for token-auth ubiquity OR SAP Concur if EA/finance roles drive first launch). Bounded once Dandelion runs.
5. **Section 10 operational hardening pass** — rollback runbook + admin bootstrap runbook + formal smoke-test suite + metrics endpoint stub. Bounded; ~1 PR per artifact. Can land in parallel with ADR-0080 work.
6. **Section 8 Billing/Entitlements ADR draft** — only after Founder confirms pricing model + billing provider + seat vs usage model. Blocked until Founder input.

## Founder decisions required

| # | Decision | Blocks |
|---|----------|--------|
| 1 | Authorize ADR-0080 (design-only OOTB ontology) | Static seed catalog + connector priority matrix + day-one customer value |
| 2 | Pricing tiers + billing provider + seat/usage model | Section 8 ADR + commercial launch |
| 3 | Workflows ADR scope (draft now / defer / drop) | CT Workflows Placeholder disposition |
| 4 | Production-readiness target deployment profile (Supabase / sovereign cloud / on-prem / air-gapped per ADR-0018) + target launch timeline | Section 10 hardening scope |
| 5 | First-customer launch profile (does it need self-serve onboarding? external execution? regulator scope?) | Whether CT Onboarding / Section 4 first adapter / Section 7 regulator scope are launch-critical |

## Go-live checklist (proposed minimum)

### Preflight
- [ ] All 4 required env vars set: JWT_SECRET, DATABASE_URL, REDIS_URL, ENCRYPTION_KEY (production)
- [ ] BCRYPT_ROUNDS ≥ 12 in production
- [ ] NODE_ENV=production
- [ ] CONTROL_TOWER_URL + FOUNDATION_COMMAND_URL set for CORS allowlist
- [ ] Supabase project provisioned (pooler + direct URL)
- [ ] Upstash Redis provisioned
- [ ] Optional: OPENAI_API_KEY + ANTHROPIC_API_KEY for embeddings + LLM

### Database
- [ ] `npm run db:generate`
- [ ] `npm run db:push` (uses DIRECT_URL)
- [ ] `npx tsx scripts/apply-pgvector-extension.ts`
- [ ] `npx tsx scripts/apply-audit-triggers.ts`
- [ ] `npx tsx scripts/apply-hnsw-index.ts`
- [ ] Verify BEFORE DELETE trigger present on `audit_events`

### Secrets
- [ ] All connector `secret_ref` env vars set (per ConnectorBinding rows; e.g., SLACK_BOT_TOKEN if Slack adapter live)
- [ ] No plaintext secrets in code or seeds (pre-commit no-leak guard enforces)
- [ ] OPENAI_API_KEY / ANTHROPIC_API_KEY rotated post-deploy

### Admin bootstrap
- [ ] First admin user signs up via `POST /api/v1/auth/sign-up`
- [ ] Manually grant `can_admin_niov = true` on that entity's TAR (direct DB edit — runbook TBD)
- [ ] First admin signs in, validates session, accesses Control Tower

### Smoke tests
- [ ] `GET /api/v1/health` returns ok + database connected
- [ ] `POST /api/v1/auth/sign-up` + `POST /api/v1/auth/sign-in` round-trip
- [ ] CT loads `/login` + signs in + lands on `/`
- [ ] CT loads `/security-audit` + shows pending list (zero events fine)
- [ ] CT loads `/approvals` + shows empty queue
- [ ] CT loads `/policies` + shows compliance frameworks catalog
- [ ] CT loads `/agent-playground` + creates a scenario
- [ ] CT loads `/users` + admin invite wizard works
- [ ] CT loads `/ai-teammates` + creates a Twin

### Security checks
- [ ] CORS allowlist matches deployed CT URL exactly
- [ ] Helmet headers present in API responses
- [ ] No console.* output from API in production logs
- [ ] Audit chain integrity check passes (`GET /api/v1/audit/verify-chain?scope=self`)
- [ ] Rate limiter active (test by burst — should 429 after limit)

### Monitoring + rollback
- [ ] `/health` endpoint polled by uptime monitor
- [ ] Postgres connection-pool metrics visible (Supabase dashboard)
- [ ] Audit event emission rate baseline established
- [ ] Rollback procedure documented (currently MISSING — see launch blockers)
- [ ] Backup-restore procedure tested (currently relies on Supabase managed backups)

### Launch acceptance criteria
- [ ] All required CI checks green on production deploy commit
- [ ] All 5 launch-critical CT pages render without errors for admin user
- [ ] Twin creation + chat round-trip succeeds for one demo user
- [ ] Audit chain shows the expected events from above smoke flow
- [ ] No 5xx errors during smoke flow in API logs

## Stop conditions before customer launch

1. Section 8 Billing decision unresolved + customer commercial expectations require billing.
2. ADR-0080 not drafted + customer expects day-one role-aware Twin.
3. No rollback runbook + customer expects DR/BC posture.
4. No admin bootstrap runbook + customer expects self-serve admin promotion.
5. No metrics/alerting + customer expects SLA-grade observability.
6. CORS allowlist misconfigured (any deployment must verify exact-origin match).
7. Any required env var missing (boot-validation will catch but warns operator).
8. Audit chain integrity check fails on first verify-chain call.
9. Any Placeholder still in nav that customer expects functional (Workflows / Onboarding / Settings / Documentation).
10. Pre-commit guards bypassed (no-console, no-leak) — production code should never have console.* or plaintext secrets.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
