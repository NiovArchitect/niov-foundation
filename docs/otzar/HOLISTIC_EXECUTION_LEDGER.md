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

### Communication is the OS

Otzar does **not** default every ask to a blank Google Doc because a button exists.
**Communication context chooses the work product**: project brief, slides, form,
care plan, insurance form, financial pack, meeting notes, decision memo, handoff
package, etc. Provider materialization follows when a real rail exists; otherwise
the Twin still **claims** the work honestly (e.g. slides until Slides create lands).

```
communication → extract clarity → choose artifact → (materialize if rail) → Twin claims → notify human
```

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
| Industry form templates (care plan, claim form, KYC pack) | deferred Phase D/E |
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
| Foundation live SHA | **`111335bf4b8a`** | 2026-07-17 |
| Foundation main tip | `111335bf4b8a` | 2026-07-17 |
| Control Tower main tip | `2ce849f7fd60` | 2026-07-17 |
| Control Tower live bundle | **`index-BLhYsPgT.js`** (twin-working-panel + detect-edits) | 2026-07-17 |
| Live providers | Calendar write · non-empty project Google Doc · share · resolve · transcript extract kickoff · **Twin claim/clarity/complete** | |

## Active coherent phase

**Phase E — Enterprise tools click-and-play** (active)

| Phase | Name | Status |
|-------|------|--------|
| A | Organizational discovery + Dandelion operational path | **closed · deployed** |
| B | Hierarchy propose + admin confirmation | **closed · deployed** |
| C | Comms → project → doc/calendar → Twin claim → notify → complete/collab | **closed · live-proven** |
| D | Role-templated AI Teammate + industry accuracy packs | deferred |
| **E** | **Enterprise tools: click-and-play + admin inventory/KPI/approve** | **ACTIVE** |
| F | Full UI consolidation | partial |
| G | Relay | partial |
| H | Scale and pressure proof | deferred |

## Active slice

**E.1 — Capability catalog + admin inventory**

Experience: employees pick a **capability** (calendars, documents, chat…) and
connect in a few clicks when org credentials allow; otherwise they request
access. Admins see inventory + KPI strip + pending requests. MCP is advanced
only — never primary vocabulary. Users do not live in Otzar.

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
| Ambient structure placement (A.3) | deployed | FND `f37a5be` + CT admin assign exception |
| Hierarchy propose + confirm (B.1) | implementing | growth NEEDS_MANAGER + set_manager seeds |
| Employee click-and-play multi-tool catalog | incomplete | Phase E |
| Admin tool inventory + approve/deny KPI | incomplete | Phase E |

### Exact blocker (now)

**Phase B.1**: ship hierarchy propose + admin confirm (`set_manager` seeds).
Do **not** start Jira or broad MCP marketplace. Phase E next after B.

### Next executable step

1. Merge + deploy B.1 FND/CT; live smoke: refresh structure → set_manager seed → confirm manager.
2. Phase E click-and-play tools.

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
