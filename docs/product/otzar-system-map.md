# Otzar System Map (Phase 1285-A coherence audit)

Status: Living map. Snapshot of what exists end-to-end so future work
connects systems instead of adding isolated pages. Companion to
`otzar-work-os-collaboration-doctrine.md` and `otzar-flow-map.md`.

## A. Surfaces (Control Tower)

| Surface | Route | Reads (real API) | Advances work? | Gap |
|---|---|---|---|---|
| Ambient bar | (dock) | system.runtimeCapabilities, otzar.calendarContext, workOs.authorityContext/createLedgerEntry/internalMessage | Yes | Not thread-aware (can't answer "did I get a msg from X") |
| Inbox / Thread | /app/inbox/:id | notifications.list, **workOs.thread**, notifications.markRead | Yes | reply uses human-authority path ✓ |
| People & Collaboration | /app/collaboration | otzar.contextHealth (roster), otzar.collaboration.inbound/outbound/create | Partly | person cards NOT clickable; manual target-id form; does NOT use thread substrate |
| Comms | /app/comms | otzar.commsExtract | Yes (Send→Action) | demo capture only; correct as capture cockpit, not a DM destination |
| Action Center | /app/action-center | actions.list, escalations.approve/reject | Yes | decision_reason humanized; no raw DUAL_CONTROL shown |
| My/Team Work, Blind Spots | /app/my-work, team-work, blind-spots | workOs.myWork/teamWork/blindSpots + executionAttempts (lazy) | Yes | renders coordination/watchers/proof/blind_spot_reason ✓ |
| My Twin | /app/my-twin | otzar.myTwin | Read-only | no in-page "Ask Twin"; Twin not thread-grounded |
| Approvals / Corrections | /app/approvals, corrections | escalations.pending, otzar.correction | Yes | — |

All surfaces read durable backend data (no mock); Comms demo-capture is an honest labeled fixture.

## B. Backend systems (Foundation)

| System | Model / Service | Route | System-of-record |
|---|---|---|---|
| Internal messages | `internal-message.service.ts` (deliverHumanInternalMessage) | POST /work-os/internal-messages | `WorkLedgerEntry`(NOTIFICATION) + `Notification` |
| Direct thread | `getDirectMessageThread` (DERIVED, no model) | GET /work-os/threads/with/:entityId | derived from NOTIFICATION ledger rows (requester/target pair) |
| Notifications | `notification.service` / `notification-read` | /notifications (list/read/dismiss/reply) | `Notification` (recipient-scoped; sender projection added 1284) |
| Work Ledger | `work-ledger.service.ts` | /work-os/ledger, my-work, team-work, blind-spots | `WorkLedgerEntry` |
| Execution proof | `execution-verification.service.ts` | /work-os/ledger/:id/execution-proof, /execution-attempts | `ExecutionAttempt` |
| Watchers | details.watchers JSON (no model) + BEAM classify | (via ledger row) | `WorkLedgerEntry.details.watchers` |
| Python enrichment | `python-enrichment.service.ts` + worker | POST /jobs/extract-work-signals | advisory; wired into **ledger create only** |
| BEAM coordination | `beam-fabric-client.ts` + collab supervisor | POST /events/work-os | called on **ledger create only** |
| Action / approval | `action.service` + `policy-evaluator.ts` | /actions, /escalations | `Action`/`ActionPolicy`/`EscalationRequest` |
| DMW / memory / COE | `coe.service.ts`, `similarity.service.ts` | /coe/context | `MemoryCapsule` (wallet/clearance-scoped) |
| Membership/projects | `entityMembership`, `work-project.service`, `twin-collaboration.service` | various | `EntityMembership`/`WorkProject`/`TwinCollaborationRequest` |
| Otzar chat | `otzar.service.ts` conductSession | /otzar/conversation/* | does NOT read thread/inbox records (gap) |

## C. Connected flows (working today)

1. **Human direct message** Sadeil→David→thread→reply→Sadeil — LIVE, GUI-validated (Wave 1–3).
2. **Persistent direct thread** — multiple messages group; notification opens `/app/inbox/:id`; reply appends — LIVE.
3. **Message body cleanup** — command wrapper + speech-glue stripped, no em dashes — LIVE.
4. **Work Ledger proof** — ledger create → execution attempts (WORK_LEDGER_CREATE/PYTHON_ENRICHMENT/BEAM_FANOUT) → My/Team/Blind Spots render proof — LIVE.
5. **Notification routing** — direct message → thread (not Comms); Action → Action Center; capture → Comms — LIVE.

## D. Disconnected / friction (the audit's findings)

1. **Otzar chat is not thread-grounded** — "Did I receive a message from Sadeil?" / "What did David say?" are answered from COE memory/LLM, NOT the real thread. **(next slice)**
2. **People & Collaboration is static** — person cards not clickable; manual target-id form; ignores the thread substrate.
3. **Python enrichment + BEAM only fire on ledger create**, not on direct-message send — so a message that contains a task/blocker is not yet turned into Work Ledger work.
4. **No waiting-on relationships** surfaced from thread content.
5. **COE recordOutcome** accepts capsule_ids without ownership validation (LOW residual risk).
6. **Comms** is correct as capture-only but its copy can still read like a generic destination.

## E. Ownership matrix (system-of-record)

direct message body → `WorkLedgerEntry.source_command` (+ `Notification.body_summary`) ·
direct thread → derived from NOTIFICATION ledger rows ·
work task / blocker / decision / follow-up → `WorkLedgerEntry` ·
watcher → `WorkLedgerEntry.details.watchers` ·
approval → `Action` (+ `EscalationRequest`) ·
relationship summary → derived view (threads + work + projects + hierarchy) — **not yet built** ·
AI memory → `MemoryCapsule` (scoped) · proof → `ExecutionAttempt` + audit.

## F. Recommended next sequence (by impact × dependency)

1. **Thread-aware Otzar answers** (smallest, highest-impact tie-together; thread endpoint already exists) — *in progress this slice*.
2. People & Collaboration cockpit v1 (clickable card → relationship cockpit reusing `workOs.thread`).
3. Message signal extraction v1 (direct message → Python advisory → Work Ledger proposal w/ proof to thread).
4. Waiting-on relationships in My/Team Work + cockpit.
5. Comms copy/scope cleanup.
6. Action Center stale-artifact cleanup + approval copy.
7. Memory/DMW hardening (recordOutcome ownership check).
8. AI Twin thread-grounded answers.

## G. Risks / blind spots

- Thread is derived from ledger rows — fine for direct person threads; project/team/twin threads will need an explicit thread model or a richer derivation key (the key already namespaces `DIRECT_PERSON`).
- Threading scales with NOTIFICATION ledger rows per pair (take:200 cap); fine now, revisit at volume.
- Enrichment/BEAM not on the message path means "message → work" isn't automatic yet (slice 3).
- recordOutcome ownership gap (slice 7).
