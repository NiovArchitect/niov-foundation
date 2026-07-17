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

## Live fingerprint (update after each deploy)

| Surface | Value | As of (UTC) |
|---------|-------|-------------|
| Foundation live SHA | `4c5e0e8cf8e1` | 2026-07-17 |
| Foundation main tip | `4c5e0e8cf8e1` | 2026-07-17 |
| Control Tower main tip | `f0741a6b02fb` | 2026-07-17 |
| Control Tower live bundle | **not fingerprinted** — gap | |
| Live providers | Calendar write **provider-proven**; project Google Doc **non-empty body_inserted** **provider-proven** (1720 chars, 13 sections); sharing **incomplete** | |

## Active coherent phase

**Phase C — Project-centered collaboration loop** (active)

Prior phases remain on the ledger even when not active.

| Phase | Name | Status |
|-------|------|--------|
| A | Organizational discovery + Dandelion operational path | deferred (next after C minimum) |
| B | Hierarchy propose + admin confirmation | deferred |
| **C** | **Project coherence: conversation → people → docs/calendar → obligations → UI** | **ACTIVE** |
| D | Role-templated AI Teammate provisioning | deferred |
| E | Connections at scale (org/team/user; MCP advanced-only) | deferred |
| F | Full UI consolidation (fewer routes, ambient) | partial (Wave-1 nav live; not closed) |
| G | Relay prerequisites + repository | partial (substrate live; app not production-complete) |
| H | Scale and pressure proof | deferred |

## Active slice

**C.1 — Non-empty project document + WorkProject linkage + honest body proof**

### Completed proof (this program)

| Item | Level | Notes |
|------|-------|-------|
| Google OAuth + calendar write | provider-proven / live-authenticated | event create+delete |
| Google Doc **shell** create (Drive) | provider-proven | empty body does **not** count as E2E |
| Relay messages / twin-draft / extract | provider-proven / live-authenticated | not full project loop |
| WorkProject + members substrate | implemented / unit-proven | OWNER/MEMBER/REVIEWER |
| Wave-1 employee nav | browser-proven partial | CT main still has red history fixed in #148 |
| Ambient Today one-tap empty doc | implemented | still misleading UI if used without require_body |
| Non-empty project Google Doc | **provider-proven / live-authenticated** | 2026-07-17: project `3bf917f1-…` doc `1FrLBai2…` body_inserted true, 1720 chars, 13 sections |
| Document ↔ WorkProject on create | **provider-proven** | `project_id` on create response + ledger stamp |
| Empty require_body rejection | **live-authenticated** | 409 `BODY_REQUIRED` |

### Incomplete proof (do not mark complete)

| Item | Level | Blocker |
|------|-------|---------|
| Document ↔ source conversation | incomplete | not wired on conversation model |
| Sharing / permissions | incomplete | not implemented |
| Edit detection → obligation update | incomplete | not implemented |
| Comms ingest → project resolution | incomplete | partial extract only |
| Oracle transcript full loop | incomplete | C.2 |
| Calendar event ↔ project stamp | incomplete | C.2 |
| Dandelion operational discovery | incomplete | Phase A |
| Hierarchy propose+confirm UX | incomplete | Phase B |
| Role-templated Twin first session | incomplete | Phase D |
| Auto-deploy after CI | incomplete | manual Render; RENDER_API_KEY invalid |
| CT live bundle fingerprint | incomplete | no health equivalent |

### Exact blocker (now)

**C.1 closed on live** for non-empty project-linked Google Doc path.
**C.2 open:** conversation/oracle ingest → project resolution → calendar stamp →
sharing → edit detection. Do not start Phase A until C.2 minimum is designed
against WorkLedger.project_id stamps.

### Next executable step

1. C.2 smoke transcript + hidden oracle (precision/recall).
2. Stamp conversation/calendar/obligation project_id where columns exist.
3. Gated Google share API (smallest connector write).
4. Then Phase A Dandelion operational path (ledger preserved).

## Substrate map (do not invent a third project system)

| Spine | Role |
|--------|------|
| **WorkProject + WorkProjectMember** | Canonical project id, membership (OWNER/MEMBER/REVIEWER) |
| **WorkLedgerEntry.project_id** | Universal join for DOCUMENT / MEETING / DECISION / work |
| **CollaborationWorkspace** | Parallel collab room (conversation-sourced) — optional later link, not replacement |

| Capability | Verdict |
|------------|---------|
| Project id/name/status/owner | reuse (+ expose owner on safe view) |
| Membership human | reuse; twin role discriminator = extend |
| Conversation → project | **gap** (no project_id on OtzarConversation) |
| Document artifact + project/convo | **extend** (stamps — C.1 does project_id on create) |
| Obligation ↔ project | **gap** (workspace only) |
| Meeting/calendar ↔ project | **gap** (stamp MEETING ledger) |
| Share Google Doc | **gap** |
| Edit detection for created docs | **gap** (import revalidate exists) |

## Deferred work and dependency

| Deferred | Depends on |
|----------|------------|
| Full hierarchy drag-editor | B + graph projections |
| Connections at 1k employees | E + org OAuth policy |
| Relay production app | G + F presence |
| 100k scale | H + infra |
| Obligation/calendar project FK | after C.1 live stamps proven |

## UI consolidation status

- Employee primary: Today / Talk / Needs me / People / Memory (+ Team admin) — partial production.
- Admin: Tools & Connections human IA — partial.
- Project surface as single composition — **not closed**.
- Misleading empty-doc success UX — **active debt**.

## Multi-user / scale / AI collab smoke

| Smoke | Status |
|-------|--------|
| Multi-user handoff/collab | previously live-proven (close-partials) |
| AI-to-AI governed collab | incomplete |
| Scale 10–100–1000 | incomplete |

## Update rule

On every slice close: update live SHA, move items between completed/incomplete,
set exact blocker + next step. Never claim production-ready without the proof level row.
