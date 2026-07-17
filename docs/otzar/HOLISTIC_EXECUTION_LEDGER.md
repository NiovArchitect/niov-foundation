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
| Foundation live SHA | `ee641c59d37c` | 2026-07-17 |
| Foundation main tip | track with `git rev-parse origin/main` | |
| Control Tower main tip | `f0741a6b02fb` | 2026-07-17 |
| Control Tower live bundle | **not fingerprinted** — gap | |
| Live providers | Google Calendar create/delete **provider-proven**; Google Doc shell create **provider-proven**; body insert **incomplete**; sharing **incomplete** | |

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
| Ambient Today one-tap empty doc | implemented | **misleading until body+project** |

### Incomplete proof (do not mark complete)

| Item | Level | Blocker |
|------|-------|---------|
| Non-empty useful Google Doc body | incomplete → implementing | batchUpdate soft-fail; no structured generation |
| Document ↔ WorkProject linkage | incomplete | ledger optional project_id not set on create |
| Document ↔ source conversation | incomplete | not wired |
| Sharing / permissions | incomplete | not implemented |
| Edit detection → obligation update | incomplete | not implemented |
| Comms ingest → project resolution | incomplete | partial extract only |
| Dandelion operational discovery | incomplete | mostly static/catalog + service Phase 0 |
| Hierarchy propose+confirm UX | incomplete | graph models partial; no admin editor |
| Role-templated Twin first session | incomplete | not closed |
| Auto-deploy after CI | incomplete | manual Render; RENDER_API_KEY invalid |
| CT live bundle fingerprint | incomplete | no health equivalent |

### Exact blocker (now)

**C.1 + C.2 live-proven** on `a44806d` (non-empty doc, kickoff, share, resolve).  
**C.2b in flight:** deterministic transcript→sections + oracle score +
kickoff-from-transcript — merge/deploy for live proof. Edit detection still open.

### Next executable step

1. Merge/deploy C.2b; live extract-from-transcript + kickoff with transcript body only.
2. Edit detection for created docs (C.3).
3. Phase A Dandelion operational path (ledger preserved).

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
| Meeting/calendar ↔ project | **extend** (C.2 stamps MEETING.project_id) |
| Share Google Doc | **extend** (C.2 gated permissions.create) |
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
