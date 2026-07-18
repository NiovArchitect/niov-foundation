# Otzar Holistic Execution Ledger

> Durable program compass. Update on every coherent slice merge/deploy.
> Proof levels: designed · implemented · unit-proven · PostgreSQL-integration-proven ·
> browser-proven · provider-proven · multi-user-proven · AI-collaboration-proven ·
> live-authenticated · scale-proven · production-ready · externally-blocked.

## Product north star

Otzar understands organizational structure and how work flows, provisions every person
with a role-aware AI Teammate, connects tools already in use, turns communication into
execution, and remains ambient without obstructing daily work.

**Experience first.** Hierarchy describes structure. Permissions control access.
Decision rights control authority. Projects control work context. AI Teammates execute
within those boundaries. Foundation keeps it coherent.

**Whole system, not parts.** Every ship must re-smoke Otzar end-to-end across enterprise
use cases (tech, healthcare, finance, insurance, services; multi-tenant when live).
Communication is the OS. AI Teammates execute work. Memory wallet is portable person→person
across orgs (skills/flows only — never org data). Third parties belong in SoT. Desktop is a
non-blocking ambient harness (voice-first capable). Goal: autonomous enterprises with trust.

> Full continuity (smoke matrix, live repairs, open PRs, gaps):  
> **`docs/otzar/AGENT_CONTINUITY_MEMORY.md`** — read before continuing any agent session.  
> **`docs/otzar/ENTERPRISE_SCENARIO_CATALOG.md`** — 128 binding scenarios (U/C/T/X × 32).  
> **`docs/otzar/HOLISTIC_ACCEPTANCE_GATE.md`** — founder completion gate (CT deploy, investor journey, consolidation).

### Communication is the OS

Otzar does **not** default every ask to a blank Google Doc because a button exists.
**Communication context chooses the work product**: project brief, slides, form,
care plan, insurance form, financial pack, meeting notes, decision memo, handoff
package, etc. Provider materialization follows when a real rail exists; otherwise
the Twin still **claims** the work honestly (e.g. slides until Slides create lands).

```
connected tools (auto primary) → WorkSourceEvent → extract clarity → choose artifact → Twin claims → notify
manual paste / live capture (fallback only) ↗
```

**Doctrine:** Ingestion of comms is **not** manual. Paste/demo is offline fallback.
Rails: `GET /otzar/comms/sources` · `POST /otzar/comms/ambient-sync` · fallback `POST /otzar/comms/ingest`.

### AI Teammate work model

Documents, slides, forms, and follow-ups extracted from communications are often
**human work executed by the AI Teammate** after clarity is extracted:

1. Extract clarity from communications (all forms: meetings, chat, email, notes).
2. **Choose artifact** from that context (OS decision).
3. Twin **claims** the work (EXECUTING) and **notifies the human** — no dual effort.
4. Twin may ask a **light clarity** question (not a burden storm).
5. On finish: Twin **completes** and notifies, and/or **requests collaboration**.
6. External tool writes remain **gated** — Twin may claim `CONNECTOR_UPDATE`; never silent mutation.

Routes: `/api/v1/otzar/twin-work/*` · kickoff auto-claims when `claim_twin_work ≠ false`.

### Regulated & high-accuracy documents (healthcare, finance, insurance)

“Document” is not only a Google Doc. In a **medical clinic**, caretakers complete
forms for insurance and clinical accuracy. In a **financial institution**, staff
complete sensitive documentation requiring verification and evidence.

Therefore Twin-handled document work must eventually support:

| Requirement | Status |
|-------------|--------|
| Accuracy-critical flag on claimed work | **designed → implementing** (`accuracy_class`) |
| Source communication lineage | partial (extract + project stamp) |
| Human notification while Twin works | **live-authenticated** |
| Collaboration before finalization | **live-authenticated** (request-collab) |
| Verification / dual-control for high sensitivity | **implementing** (C.3c human verify gate on complete) |
| Industry form templates (care plan, claim form, KYC pack) | **deployed D.1** (structural packs + dual-control) |
| Never invent clinical/financial facts | **enforced** in deterministic extract |

### Enterprise tools connection model (no Jira-first complexity)

Otzar is an **enterprise** product. Connectors must feel **click-and-play**, not MCP homework.

| Actor | Experience |
|-------|------------|
| **Employee** | Pick a capability → connect their tool of choice in a few clicks; use it for their role |
| **Admin** | See **which tools each employee uses**; accuracy/health **KPIs**; **approve / deny / revoke** any app |
| **Org** | Domain-wide connection where provider allows; policy sets read/draft/write classes |
| **Advanced** | MCP / custom servers stay behind “Advanced integration” — never primary IA |

**Unlocked trust with boundaries:** employees move fast; enterprise retains power.

| Layer | Rule |
|-------|------|
| Capability catalog | Human language: calendars, documents, email, projects, clinical forms, finance packs… |
| Employee connect | Self-serve when org policy allows that capability |
| Admin visibility | Per-employee / per-team tool inventory + last success + risk |
| Admin control | Approve pending tools · deny · force-revoke · set autonomy ceilings |
| KPI / accuracy | Completion with verification, error rates, Twin claim vs human override |
| MCP | Transport for custom tools — **not** the product vocabulary |

**Phase E status:** designed (this ledger) · partial substrate (Tools & Connections IA, OAuth Google, MCP mock invoke) · **not** production-ready multi-app marketplace.

**No Jira-specific work this sprint.** When project tools land, they use the same catalog + policy + Twin-claim pattern.

## Live fingerprint (update after each deploy)

| Surface | Value | As of (UTC) |
|---------|-------|-------------|
| Foundation live SHA | **`86746d3a25c0`** (enterprise smoke harness on main) | 2026-07-18 |
| Foundation main tip | **`86746d3`** + acceptance gate doc in flight | 2026-07-18 |
| Control Tower main tip | **`d959c30`** Phase F wave-2 `#170` | 2026-07-18 |
| Control Tower **live** bundle | **`index-4BPnPgW8.js`** + **`index-DzNUeESq.css`** (last-modified 18:22:57Z) Phase F markers **present** | 2026-07-18 |
| Live providers | Google Doc **CREATED** + Calendar event **CREATED**; Meet ambient-sync **SCOPE_REAUTH_REQUIRED** (not operational) | 2026-07-18 |
| Acceptance gate | **OPEN** — see `HOLISTIC_ACCEPTANCE_GATE.md` | 2026-07-18 |

## Active coherent phase

**Comms ambient primary + Phase D/E closed.** Manual paste is fallback only.

| Phase | Name | Status |
|-------|------|--------|
| A | Organizational discovery + Dandelion operational path | **closed · deployed** |
| B | Hierarchy propose + admin confirmation | **closed · deployed** |
| C | Comms → project → doc/calendar → Twin claim → notify → complete/collab | **closed · live-proven** |
| D | Role-templated AI Teammate + industry accuracy packs | **D.1 closed · deployed** |
| E | Enterprise tools: click-and-play + inventory/KPI/approve/accuracy | **closed · deployed (E.1–E.3)** |
| F | Full UI consolidation | partial |
| G | Relay | partial |
| H | Scale and pressure proof | deferred |

## Active slice

**D.1 complete (deployed).** Industry accuracy packs + role-template posture live.

- Pure catalog: care plan, insurance claim/prior-auth, KYC/financial pack,
  compliance/audit pack — structural shells only (**never invent facts**).
- `resolveAccuracyPackPosture(industry, role_template)` → default accuracy_class,
  dual-control default, ranked pack suggestions.
- Soft-bias `chooseArtifactFromCommunication` (text keywords still win).
- Kickoff extract passes org industry + twin role_template.
- `GET /my-twin` sidecar `accuracy_pack_posture` + CT Accuracy packs panel.
- FND PR #694 · CT PR #163 · live `29d664b` / `5998f23`.

### Completed proof (honest)

| Item | Level |
|------|--------|
| Non-empty project Google Doc from structured sections | live-authenticated |
| Transcript → extract → kickoff doc + calendar + share | live-authenticated |
| Twin claim → clarity → complete + notify | live-authenticated (`1da22db`) |
| Kickoff auto twin_claims (doc + next actions) | live-authenticated |
| Empty body rejection (`BODY_REQUIRED`) | live-authenticated |
| accuracy_class on twin claims (clinical/finance/insurance) | live-authenticated (`65345ed`+) |
| Communication chooses artifact (doc vs slides vs form) | live-authenticated (`73ac793`) |
| Twin claims non-materialized artifacts (e.g. slides) | live-authenticated (`53cee14`) |
| Safe `twin_work` projection on WorkLedgerView | live-authenticated (`c14147c`→`111335b`) |
| Today “Twin is working on this” (CT) | live-authenticated |
| Edit detection on created docs | live-authenticated (`111335b`) |
| Dual-control verification (C.3c) | live-authenticated (`013b5d6`) |

### Incomplete proof

| Item | Level | Notes |
|------|-------|-------|
| Ambient structure placement (A.3) | deployed | managers + admin exception |
| Hierarchy propose + confirm (B.1) | deployed | set_manager seeds |
| Employee click-and-play multi-tool catalog (E.1) | deployed | `100ece78` + CT Your tools |
| Admin tool inventory + KPI (E.1) | deployed | Inventory & KPIs tab |
| Per-person inventory + approve/deny/revoke (E.2) | deployed | people + decide/revoke |
| Twin accuracy KPI rollups (E.3) | deployed | API `caa0fbb` + inventory.accuracy |
| Industry accuracy packs + role posture (D.1) | deployed | FND `29d664b` + CT `5998f23` My Twin panel |

### Exact blocker (now)

**None on D.1.** Accuracy packs + role posture live. Do **not** start Jira or
broad MCP marketplace.

### Next executable step

1. Land **PR #697** (role-template repair + seed path + TECH packs) → Render autodeploy.
2. **Whole-system re-smoke** per `AGENT_CONTINUITY_MEMORY.md` (not partial).
3. Then: employee empty-work fix · wallet portability · Phase F UI overhaul · third-party SoT.

## Substrate map (do not invent a third project system)

| Spine | Role |
|--------|------|
| **WorkProject + WorkProjectMember** | Canonical project |
| **WorkLedgerEntry.project_id** | Universal join |
| **Twin work claim (TASK + twin_work details)** | AI Teammate execution + human awareness |
| **Tools & Connections** | Human connector IA; MCP advanced-only |
| **CollaborationWorkspace** | Parallel collab room — optional later link |

## Deferred work and dependency

| Deferred | Depends on |
|----------|------------|
| Click-and-play multi-tool (Phase E) | Capability catalog + org policy + admin inventory |
| Clinical/insurance form packs | Phase D accuracy + dual-control |
| Hierarchy drag-editor | Phase B |
| 100k scale | Phase H |
