# Otzar Agent Continuity Memory

> **Purpose:** Survive context compaction. Any agent continuing Otzar work MUST
> read this file + `HOLISTIC_EXECUTION_LEDGER.md` before building or smoking.
> Updated: 2026-07-18 (autonomous loop — membership repair, tool readiness OAuth,
> wallet portability posture; PR #697 merged `d5d37cc`).

---

## Founder mandate (binding product doctrine)

Otzar is a **whole system**, not a collection of features. Every slice must be
proven **end-to-end** so enterprises can run on Otzar as the Work OS of the future.

### What Otzar is

| Pillar | Meaning |
|--------|---------|
| **Communication is the OS** | Verbal or text, any medium → extract clarity → choose artifact → Twin executes → notify human. Not blank-doc-first. |
| **AI Teammate per employee** | Every person is pegged to a role-aware Twin that does real work on their behalf (docs, forms, follow-ups, collab). |
| **Memory wallet portability** | Employee skills, flows, preferences, corrections travel with the person from Org A → Org B **like a phone number between carriers**. Org data, secrets, and peer wallets **never leave** with them. No harm to the org on exit. |
| **Source of truth + ETL** | Optimal pipelines to/from SoT. Any app can connect; connectors are click-and-play; MCP is advanced-only. |
| **Hierarchy + projects + decision rights** | Structure, work context, and authority are separate layers. Missions can be dynamic by project/company goals. |
| **Ambient non-blocking UX** | Users do not live in Otzar. Desktop feels like a kernel harness (permissions, voice-first, ambient notifications/alerts). Web + slightly different desktop. Futurized design (colors, 3D, cleanup) without blocking daily tools. |
| **Autonomous enterprise** | When users clock out, Twins collaborate, research, playground best scenarios against company goals + org data — gated writes, dual-control for regulated work. |
| **Third parties in the graph** | Employees work with clients, consultants, partners. They need an honest place in SoT without leaking cross-tenant data. |
| **Trust end-to-end** | Permissions, dual-control, audit, honest empty states, no invented clinical/financial facts. Trust is the product. |
| **Multi-tenant enterprises** | Orgs may be tenants of others or standalone. Smoke must cover enterprise use cases across industries (tech, healthcare, finance, insurance, services). |

### Competitive bar (enterprise agentic Work OS, 2026)

Market is moving to **agentic governance**, secure agent identity, connected
intelligence (human↔human, human↔AI, AI↔AI), and systems of **execution** not
just copilots. Otzar wins by being:

1. **Role- and hierarchy-native** (not generic chat).
2. **Communication-native OS** (not app-silo).
3. **Wallet-portable person identity** without org data exfiltration.
4. **Governed execution** (claim → verify → complete; no silent tool mutation).
5. **Ambient harness** (kernel-like control, non-blocking).

---

## Live environment

| Surface | Value |
|---------|-------|
| API | `https://api.otzar.ai/api/v1` |
| App | `https://app.otzar.ai` |
| Render services | `otzar-api` (Docker, autoDeploy), `otzar-app` (static, autoDeploy) |
| Health fingerprint field | `git_commit` on `GET /api/v1/health` |
| Demo org | NIOV Labs (`org_entity_id` a4ddc200-…) |
| Smoke login | `sadeil@niovlabs.com`, `david@niovlabs.com`, `vishesh@…` with **production** shared password (not local `LocalTest-…`) |
| **Critical:** | Login **must** send `requested_operations: ["read","write","share","admin_org"]` (CT default). Empty ops → all routes `OPERATION_NOT_PERMITTED` (not a product bug; CLI mistake). |

### Render deploy notes

- Blueprint: autoDeploy on `main` after merge.
- `scripts/render-deploy-check.sh` probes health + routes.
- As of 2026-07-18: shell `RENDER_API_KEY` returned **401 Unauthorized** — cannot API-trigger deploy until key rotated. Rely on dashboard Auto-Deploy or new key.

---

## Phase status (program order)

| Phase | Name | Status |
|-------|------|--------|
| A | Org discovery + Dandelion operational path | **closed · deployed** |
| B | Hierarchy propose + admin confirm | **closed · deployed** |
| C | Comms → project → Twin claim → notify → complete/collab | **closed · live-proven** |
| D | Role-templated AI Teammate + industry accuracy packs | **D.1 deployed**; smoke-repair PR in flight |
| E | Enterprise tools catalog / inventory / decide / accuracy KPIs | **closed · deployed E.1–E.3** |
| F | Full UI consolidation / overhaul | **partial · next major UX arc** |
| G | Relay | partial |
| H | Scale | deferred |

### Recently shipped (main)

- D.1 FND `#694` / CT `#163` — accuracy packs + My Twin panel.
- Smoke repair FND `#697` `d5d37cc` — role templates, repair endpoint, TECH packs, human role_title.
- Whole-system FND `#698` `da9c008` — OAuth tool readiness + wallet portability.
- CT `#164` continuity pointer · `#165` wallet portability panel `137b66a`.
- Live smoke post-`d5d37cc`: FOUNDER role_title, CEO template, 5 packs, repair ok; employees 5 projects.

### Merged (awaiting Render if git_commit lags)

| PR | Notes |
|----|-------|
| FND **#697** `d5d37cc` | Role-template repair endpoint, createTwin human role, TECH packs, continuity memory |
| CT **#164** `b47a93a` | Continuity pointer |

### In flight (autonomous)

- **Tool readiness** matches OAuth (Google connected) + AgentTemplate seed path via `import.meta.url`
- **Wallet portability** posture on getMyTwin + CT panel
- Live: demo team added as MEMBERs on smoke projects (david/vishesh **5 projects**)

**Live data repair already applied (prod, via admin API, 2026-07-18):**

| Action | Result |
|--------|--------|
| `PATCH /org/settings` industry | **TECH** |
| All 8 AI teammates `role_template` | CEO, software-engineer ×4, product-manager, marketing-manager ×2, finance-analyst |
| Project memberships | Team on pilot/insurance/slides smoke projects |

---

## Deep smoke findings (2026-07-18) — must re-verify after every deploy

### Working

- Health 200, DB connected, features flags present.
- Auth with correct `requested_operations`.
- Admin: my-twin, enterprise-tools catalog/inventory, my-work, work-projects, ai-teammates, dandelion seeds, dgi-coherence.
- Employee (david/vishesh): my-twin, catalog, my-work, projects (employee inventory/seeds correctly 403).
- Conversation message path returns Twin response (CEO context known).
- Accuracy dual-control KPIs on inventory (regulated claims, await verify).
- D.1 `accuracy_pack_posture` on my-twin (after industry set).

### Broken / weak (whole-system gaps)

| Gap | Impact | Fix direction |
|-----|--------|---------------|
| Twins provisioned as `"Digital Twin"` → **null role_template** | Role packs / LLM Layer-2 template empty | PR #697 + live patch |
| Org industry null until patched | Packs not industry-primary | Admin settings + onboarding |
| TECH packs list empty before filter fix | Bad My Twin posture | PR #697 pack scoring |
| `required_tools_count: 0` on all templates | Tool readiness always `not_configured` | Seed path + re-seed AgentTemplate on boot |
| Employee my-work / projects **n=0** for david/vishesh | Empty employee flow | Membership/seed data + product path |
| CLI smoke without ops | False product red | Always mirror CT login body |
| RENDER_API_KEY invalid | Can't force deploy from agent | Rotate key / rely on autodeploy |
| Whole-org multi-tenant use cases | Not systematically smoked | Use-case matrix below |
| Memory wallet portability Org A→B | Doctrine not fully productized | Phase: wallet portability spine |
| UI overhaul (futurized, voice-first, ambient) | Partial | Phase F arc |
| Third-party / client in SoT | Partial external collaborator substrate | E2E smoke + product spine |
| Clock-out autonomous collab / playground | Partial | Playground + twin collab governance |

---

## Whole-system smoke matrix (continuous)

Run **after every coherent deploy**. Fail closed on red product paths.

### Use cases (organizations)

1. **Tech SaaS** (NIOV Labs live) — roles eng/product/GTM/CEO; Google connected.
2. **Healthcare clinic** — REGULATED_HEALTH, care plan, dual-control.
3. **Finance / KYC** — REGULATED_FINANCE packs, verification gates.
4. **Insurance** — INSURANCE accuracy, prior-auth forms.
5. **Professional services** — client/third-party collaboration in SoT.
6. **Multi-tenant / nested org** — tenant of parent enterprise (when substrate ready).

### Actor paths (must all pass)

| Actor | Must prove |
|-------|------------|
| **Employee** | Login → Today/My Work → Talk to Twin → role template live → accuracy posture → tools connect → ambient notifications |
| **Manager** | Hierarchy placement, team work visibility, approvals |
| **Admin** | Dandelion/seeds, AI teammates repair, tools inventory approve/deny/revoke, org industry |
| **Twin (system)** | Claim work from comms, no silent writes, dual-control regulated, collab request |
| **Third party / external** | Scoped collaboration without org-data leak |
| **Employee leaving org** | Portable wallet (skills/preferences) exits; org data retained; no residual access |

### Coherence invariants

1. Communication → artifact → claim → notify (one spine).
2. Role template matches human role (never stuck on Digital Twin shell).
3. Industry packs match org industry.
4. Tools readiness reflects real bindings + template required_tools.
5. No cross-tenant data in twin context or export.
6. Wallet portability never includes other employees' or org-only capsules.
7. UI never forces user to "live in Otzar" for daily work.

### How to smoke (API)

```bash
API=https://api.otzar.ai/api/v1
# password from operator secret DEMO_SHARED_PASSWORD / prod demo password
curl -sS -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"sadeil@niovlabs.com","password":"…","requested_operations":["read","write","share","admin_org","create_hives","external_api"]}'
# then Bearer probe: /otzar/my-twin, /org/ai-teammates, /otzar/enterprise-tools/*, /work-os/my-work, /otzar/work-projects
# conversation: POST /otzar/conversation/message
```

CT also: `npm run test:e2e:live:workos:full` with `DEMO_SHARED_PASSWORD` set.

---

## Substrate map (do not invent parallel systems)

| Spine | Role |
|-------|------|
| WorkProject + Member | Canonical project |
| WorkLedgerEntry.project_id | Universal join |
| Twin work claim | AI execution + human awareness |
| Tools & Connections | Human connector IA |
| TwinConfig.role_template + AgentTemplate | Role-aware Twin behavior |
| OrgSettings.industry | Accuracy pack priors |
| Memory wallet / capsules | Person-portable learning (not org dump) |
| External collaborator identity | Third parties in SoT |
| CollaborationWorkspace | Optional collab room |

---

## Next executable order (alignment)

1. **Merge + deploy PR #697** (role-template repair + seed path + pack catalog).
2. **Post-deploy whole smoke** (matrix above; verify templates + TECH packs + repair endpoint).
3. **AgentTemplate required_tools re-seed verification** on live (tool readiness honest).
4. **Employee empty work** diagnosis (david/vishesh projects = 0).
5. **Phase F UI** — ambient, voice-first, design system overhaul (non-blocking).
6. **Memory wallet portability** Org A→B explicit product + tests.
7. **Third-party / client SoT** end-to-end path.
8. **Clock-out autonomy + playground** governed scenarios.
9. Document nuance pass (docs/otzar/* + OOTB catalog) for end-to-end trust.

---

## Agent operating rules (from founder)

- Prefer **whole-system smoke** after every ship; not only unit green.
- Fix → ship → Render autodeploy → re-smoke → continue autonomously.
- Do **not** start Jira-first or broad MCP marketplace.
- Never invent clinical/financial facts.
- Users do not live in Otzar; ambient + exception admin paths only.
- Multi-industry enterprises are the test of "world class," not a single demo org.

---

## File pointers

| Path | Why |
|------|-----|
| `docs/otzar/HOLISTIC_EXECUTION_LEDGER.md` | Phase/status fingerprint |
| `docs/otzar/AGENT_CONTINUITY_MEMORY.md` | **This file** — full continuity |
| `docs/otzar/DOMAIN_GENERAL_INTELLIGENCE_DOCTRINE.md` | DGI doctrine |
| `docs/otzar/WORK_OS_PHASE_HANDOFF.md` | Live smoke suite notes |
| `apps/api/src/services/otzar/industry-accuracy-packs.ts` | D.1 packs |
| `apps/api/src/services/governance/role-template-repair.service.ts` | Repair rail |
| `apps/api/src/services/governance/role-template-resolver.ts` | Title → slug |
| `apps/api/templates/roles/*.md` | 13 OOTB role templates |
| `otzar-control-tower` My Twin / AccuracyPackPanel | Employee accuracy UI |

---

*End of continuity memory. Update on every coherent merge/deploy and after every deep smoke.*
