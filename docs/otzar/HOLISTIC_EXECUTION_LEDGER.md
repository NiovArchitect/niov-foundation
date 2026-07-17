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

### AI Teammate work model

Documents and follow-ups extracted from communications are often **human work
executed by the AI Teammate** after clarity is extracted:

1. Extract clarity from communications (all forms: meetings, chat, email, notes).
2. Twin **claims** the work (EXECUTING) and **notifies the human** — no dual effort.
3. Twin may ask a **light clarity** question (not a burden storm).
4. On finish: Twin **completes** and notifies, and/or **requests collaboration**.
5. External tool writes (Jira, EHR forms, banking systems, etc.) remain **gated** —
   Twin may claim `CONNECTOR_UPDATE` work; never silent mutation.

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
| Verification / dual-control for high sensitivity | deferred (reuse GOVSEC / dual-control) |
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
| Foundation live SHA | **`1da22dbc0e76`** | 2026-07-17 |
| Foundation main tip | `1da22dbc0e76` | 2026-07-17 |
| Control Tower main tip | `f0741a6b02fb` | 2026-07-17 |
| Control Tower live bundle | **not fingerprinted** — gap | |
| Live providers | Calendar write · non-empty project Google Doc · share · resolve · transcript extract kickoff · **Twin claim/clarity/complete** | |

## Active coherent phase

**Phase C — Project-centered collaboration + Twin work claim** (active)

| Phase | Name | Status |
|-------|------|--------|
| A | Organizational discovery + Dandelion operational path | deferred (after C.3) |
| B | Hierarchy propose + admin confirmation | deferred |
| **C** | **Comms → project → doc/calendar → Twin claim → notify → complete/collab** | **ACTIVE** |
| D | Role-templated AI Teammate + industry accuracy packs | deferred |
| E | Enterprise tools: click-and-play + admin inventory/KPI/approve | designed · deferred implementation |
| F | Full UI consolidation | partial |
| G | Relay | partial |
| H | Scale and pressure proof | deferred |

## Active slice

**C.3 — Accuracy-critical Twin document work + stay the course**

C.1–C.2b + Twin-work **live-proven**. Next: accuracy_class on claims, Today “Twin is on it” UI signal, edit detection.

### Completed proof (honest)

| Item | Level |
|------|--------|
| Non-empty project Google Doc from structured sections | live-authenticated |
| Transcript → extract → kickoff doc + calendar + share | live-authenticated |
| Twin claim → clarity → complete + notify | live-authenticated (`1da22db`) |
| Kickoff auto twin_claims (doc + next actions) | live-authenticated |
| Empty body rejection (`BODY_REQUIRED`) | live-authenticated |

### Incomplete proof

| Item | Level | Notes |
|------|-------|-------|
| accuracy_class on document claims (clinical/financial) | designed → next code | |
| Today / Needs me “Twin is working on this” | incomplete | notifications exist; surface not composed |
| Edit detection on created docs | incomplete | |
| Dual-control verification for high sensitivity | incomplete | |
| Employee click-and-play multi-tool catalog | incomplete | Phase E |
| Admin tool inventory + approve/deny KPI | incomplete | Phase E |
| Dandelion operational discovery | incomplete | Phase A |
| Hierarchy confirm UX | incomplete | Phase B |

### Exact blocker (now)

Stay on **Phase C**: accuracy-critical document claims + human-visible Twin activity.
Do **not** start Jira or broad MCP marketplace. Phase E remains designed only until C.3 closes.

### Next executable step

1. Add `accuracy_class` (STANDARD \| REGULATED_HEALTH \| REGULATED_FINANCE \| INSURANCE) on twin claims + kickoff docs.
2. Surface Twin-working notifications in Today/Needs me (CT).
3. C.3b edit detection; then Phase A Dandelion.

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
