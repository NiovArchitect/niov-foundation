# OTZAR — Actual Architecture (Code + Deploy Verified)

**Audit date:** 2026-07-27  
**Foundation HEAD / live API git_commit:** `afe1491d882cbca4b0ce95db6f85ec0ad85dd16f`  
**Control Tower HEAD:** `96eb95489639ec665fac803592728c4c0f423bc3`  
**Live CT bundle (app.otzar.ai):** `assets/index-DmQQIMEk.js`  
**Live API health:** `https://api.otzar.ai/api/v1/health` → `ok:true`, `database:connected`, `render_service:otzar-api`

This document reconstructs **what exists now**, not what historical completion reports claim.

---

## 1. Product layering (verified multi-repo)

| Layer | Absolute path | Role | Deploy |
|-------|---------------|------|--------|
| **Foundation (API + protocol substrate)** | `/Users/genghishameha/dev/NIOV Labs/github/niov-foundation` | Backend-only: COSMP, DMW, Otzar services, work-os, actions, audit, connectors, BEAM apps | `api.otzar.ai` (Render `otzar-api`) |
| **Control Tower (primary product UX)** | `/Users/genghishameha/dev/NIOV Labs/github/otzar-control-tower` | Employee Work OS + admin Control Tower SPA; optional Tauri desktop | `app.otzar.ai` (Render static `otzar-app`) |
| **Otzar Relay** | `/Users/genghishameha/dev/NIOV Labs/github/otzar-relay` | Provisional messaging shell; calls Foundation relay routes | Not primary public product |
| **AVP²** | `/Users/genghishameha/dev/NIOV Labs/github/niov-avp` | Machine-facing quote→access→proof edge client of Foundation | Protocol/bootstrap |
| **Federation Cloud** | `/Users/genghishameha/dev/NIOV Labs/github/niov-federation-cloud` | Governed exchange UI over Foundation (not Otzar Work OS) | Separate surface |
| **foundation-command** | `/Users/genghishameha/dev/NIOV Labs/github/foundation-command` | Separate Lovable/Vite app; **not** current Otzar CT | Legacy/adjacent |
| **otzar-control-tower 2** | `/Users/genghishameha/dev/NIOV Labs/github/otzar-control-tower 2` | Older Lovable clone of same remote; **stale SHA** `2b4c349` | **Do not use** |
| **AGENT-ZERO** | `/Users/genghishameha/dev/NIOV Labs/github/AGENT-ZERO` | Process framework | N/A |
| **Caretaker Relay*** | FORBIDDEN paths | Unrelated product | **Do not enter** |

\* Explicit campaign exclusion.

---

## 2. Clients

| Client | Tech | Path evidence |
|--------|------|---------------|
| Web employee shell | Vite 5 + React 18 + TS strict | `otzar-control-tower/src/pages/app/*`, `App.tsx` |
| Web admin Control Tower | Same SPA, admin routes | `src/pages/*` (Users, Governance, ActionCenterAdmin, …) |
| Desktop / Tauri | `src-tauri/` present | Optional shell; web coherence primary per doctrine |
| Mobile-responsive | Tailwind SPA | No native mobile app in-repo |
| Relay shell | Minimal Vite | `otzar-relay` |

**Auth UX:** JWT in memory only (CT README + AGENTS.md); hard refresh → re-login (known P2).

---

## 3. Frontend architecture (otzar-control-tower)

| Concern | Implementation |
|---------|----------------|
| Framework | Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Routing | react-router-dom v6 (`src/App.tsx`) |
| Server state | TanStack Query |
| Client state | zustand (auth + UI; not localStorage for JWT) |
| UI | shadcn/ui + Radix + Tailwind |
| HTTP | **Only** `src/lib/api.ts` (~4124 lines) |
| Types | `src/lib/types/foundation.ts` |
| Nav inventory | `src/lib/nav/route-inventory.ts` — primary Today, Action Center hubs, redirects |
| Tests | Vitest unit + Playwright e2e (extensive `test:e2e:live:*` scripts) |
| Deploy | `render.yaml` → static `otzar-app`, `VITE_FOUNDATION_API_URL=https://api.otzar.ai/api/v1` |

### Employee surface clusters (code-present)

- **Today / Ambient:** `EmployeeHome`, `AmbientWorkSurface`, ambient components
- **Action Center hub:** `ActionCenter` (approvals / my-work / blind-spots redirect in)
- **Talk / Chat / Voice:** `Chat`, `Voice`, voice captures
- **My AI Teammate:** `MyTwin`, calibration, writing style, authority grants
- **Comms / Observe:** ingestion cockpits
- **People / Collaboration / Projects:** collaboration, work projects, team work
- **Memory / Corrections / Preferences**
- **Organization setup / seeding** (admin-adjacent + employee readiness)

### Admin hubs (RC2 recomposition)

Governance, Intelligence, Security, Action Center Admin, Connections, Organization setup — recent commits (PR #217–#223) recompose nav without deleting Dandelion capability.

---

## 4. Backend architecture (niov-foundation)

| Concern | Implementation |
|---------|----------------|
| Language/runtime | Node.js 22.11 + TypeScript; Fastify API (`apps/api`) |
| Secondary runtime | Elixir/BEAM umbrella: `cosmp_router`, `dbgi_supervisor`, `collaboration_supervisor` |
| ORM / DB | Prisma + Postgres 16 (+ pgvector for embeddings) |
| Cache | Redis (Upstash in operator deploy) |
| Auth | Bearer JWT sessions; service-owned auth gates (ADR-0004) |
| Logging | Structured Pino; **no console.*** in `apps/api/src` (RULE 16) |
| Audit | Append-only SHA-256 chain (ADR-0002); BEFORE DELETE trigger |
| LLM | Provider abstraction + fixture provider for tests |
| Embeddings | OpenAI text-embedding-3-small @ 1536 + FixtureBased (ADR-0043) |
| Deploy | Docker + Render (`otzar-api`); CI under `.github/workflows/` |

### Service domains (`apps/api/src/services/`)

`otzar/` (103 modules) · `work-os/` · `action/` · `coe/` · `cosmp/` · `governance/` · `connectors/` · `connector-rails/` · `hive/` · `govsec/` · `voice/` · `playground/` · `personalization/` · `notification/` · `billing/` · `python/` · `llm/` · `embedding/` · `feedback/` · `identity/` · `intelligence/` · `dmw/` · …

### Route surface (69 route modules)

Includes: `otzar*.routes.ts` (26 files), `org.routes.ts`, `work-os-*.routes.ts`, `actions.routes.ts`, `escalation.routes.ts`, `connector*.routes.ts`, `cosmp*.routes.ts`, `auth*.routes.ts`, `break-glass.routes.ts`, `hive*.routes.ts`, `platform.routes.ts`, `working-set.routes.ts`, etc.

**~232** route method registrations across otzar/actions/work-os/proposed/escalation family alone.

---

## 5. Data plane

| Store | Use |
|-------|-----|
| **Postgres (Prisma)** | System of record: Entity, Wallet, MemoryCapsule, AuditEvent, OtzarConversation*, Obligation, Handoff, OrgTruth*, Action*, Twin*, WorkProject, WorkLedgerEntry, ExecutionAttempt, WorkComms*, Connector*, Collaboration*, Meeting*, … (**114 models**, **99 enums**) |
| **pgvector** | Capsule embeddings; similarity search |
| **Redis** | Cache / rate / session support as configured |
| **ETS / BEAM** | Hot wallet cache, COSMP routing, DMW workers, collaboration supervision |
| **Supabase Storage** | Blob storage posture (operator deployment) |

### Domain model cores (verified model names)

- **Identity:** Entity, EntityProfile, EntityMembership, Session, Wallet, TokenAttributeRepository (TAR)
- **Memory:** MemoryCapsule (+ embedding, mutation_type, conversation_id), COEOutcome
- **Otzar chat:** OtzarConversation, OtzarConversationTurn, OtzarConversationRequest
- **Truth:** TruthEvidenceSnapshot, OrgTruthRecord, OrgTruthConflictSet, OrgTruthConflictCandidate
- **Work movement:** Obligation, Handoff, Action/Attempt/Result/Policy, EscalationRequest, WorkLedgerEntry, ExecutionAttempt
- **Twin:** TwinConfig, TwinAuthorityGrant, TwinCorrectionMemory, TwinCollaborationRequest, OtzarProposedPattern
- **Org cartography:** Dandelion services + WorkProject + hierarchy in governance
- **Comms:** WorkComms* models + MeetingCapture + ObserveCapture + AudioCapture
- **Consent / marketplace:** ConsentGrant, MarketplaceDataConsent, MeetingParticipantConsent, WorkCommsConsentEvent
- **Govsec:** BreakGlassGrant, LawfulBasis

---

## 6. AI / Twin pipeline (actual)

```
User message (web/voice)
  → Auth + clearance + permission (RULE 5 order)
  → OtzarService.conductSession (otzar.service.ts ~261KB)
  → 8-layer prompt assembly + priming
  → COE.assembleContext (governed working set; LLM does NOT choose memory)
  → LLM provider
  → Response + optional transparency (ADR-0051 fields)
  → Audit: CAPSULE_CONTENT_READ / CONVERSATION_* etc.
  → Optional correction → TwinCorrectionMemory / CORRECTION capsules
  → Work-style learning candidates (approved prefs only)
```

**Supporting AI paths:** similarity.service (pgvector), personalization working-set, proposed-pattern from drift, proactivity cards, decision-recommendation, execution-planner, python enrichment worker (advisory on ledger create).

---

## 7. Integrations (honest status)

| Integration | Code present | Live posture (from ledger/docs + health) |
|-------------|--------------|------------------------------------------|
| Google OAuth / Workspace connectors | Yes (connector-oauth, google-doc routes) | Partial; Docs append paths repaired recently; Meet often `SCOPE_REAUTH_REQUIRED` / externally blocked |
| Calendar | Yes | LIVE_CALENDAR_PROVIDER_PROVEN claimed in CT status; reauth residual |
| Docs/Drive writeback | Yes | LIVE_DOC_PROVIDER_PROVEN claimed; material write pressure still residual |
| Slack / Gmail native | Connector rails / adapters | Adapter registry; not fully "all sources live" for every org |
| Voice STT/TTS | Routes + services | Partial; Sesame CSM doctrine ADR-0089 readiness |
| MCP servers | Models + policies | Strategy ADR-0084; not full autonomous MCP product |
| Notifications | Notification model + routes | Live for internal messages / action routing |
| Relay messaging | otzar-relay.routes + otzar-relay app | Gate C open — boundary live, full product not |

---

## 8. Infrastructure

| Piece | Evidence |
|-------|----------|
| API domain | `api.otzar.ai` |
| App domain | `app.otzar.ai` |
| Render services | `otzar-api`, `otzar-app` (CT render.yaml name) |
| CI | Foundation: `ci.yml`, deploy-production/staging, nightly-real-llm; CT: verify workflow |
| Secrets | Env-based; never in blueprint values except public API URL |
| Observability | Structured logs; system runtime capabilities endpoints |

---

## 9. Architectural boundaries (must preserve)

1. **Foundation owns truth, permission, audit, memory, execution policy.** Apps compose UX.
2. **LLM never decides what memory it may see** (ADR-0048 / COE).
3. **RULE 0 sovereignty** — lower AI ceilings; human grants only long-term.
4. **Cross-repo:** Foundation contract first, CT second.
5. **Relay is separate product** — do not collapse into CT admin.
6. **Federation Cloud / AVP² are not Otzar Work OS** — adjacent NIOV surfaces.
7. **RC2 principle:** preserve working intelligence; recompose human surfaces (CT master direction).

---

## 10. What is NOT the architecture (anti-drift)

- Not blockchain / token / DLT
- Not generic chatbot
- Not employee surveillance product
- Not Slack clone (Relay doctrine)
- Not "thin frontend only" — CT is thick UX over deep Foundation Work OS
- Not complete Autonomous Enterprise (Gate B open)
- Not complete multi-tenant demo factory on production investor tenant (by design)

---

## 11. Instruction precedence (repo-local)

```
User mandate
→ CLAUDE.md RULES (Foundation)
→ AGENTS.md multi-LLM router
→ otzar-control-tower AGENTS.md / CLAUDE.md (UI)
→ Agent Zero state machine
→ Agency Agents specialists
→ ADRs + DGI doctrine + CT master completion register
→ Living maps / CURRENT_BUILD_STATE (verify before trust)
```
