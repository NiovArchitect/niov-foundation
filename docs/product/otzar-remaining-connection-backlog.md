# Otzar Remaining Connection Backlog (active product contract)

This is a **durable, active contract**, not notes. Every item below is required
to make Otzar coherent as an ambient Work OS / domain-general organizational
intelligence layer. Do not drop any item. Companion to
`otzar-1to1-loop-integrity.md` + `otzar-ui-connection-integrity.md`.

Status vocabulary: NOT_STARTED · IN_PROGRESS · MERGED · LIVE · GUI_VALIDATED.
("LIVE" = merged + app rebuilt/relaunched on it; "GUI_VALIDATED" = the Founder
confirmed it in the running app.)

Priority order (by loop impact): P0 = 10, 11, 1, 2 · P1 = 3, 4, 8 · P2 = 5, 6, 7, 9.

| # | Item | Priority | Status |
| --- | --- | --- | --- |
| 10 | Short confirmation phrases for active drafts | P0 | GUI_VALIDATED (1285-F, 2026-06-16) |
| 11 | Case-insensitive email login | P0 | GUI_VALIDATED (1285-F, 2026-06-16) |
| 1 | Team Work waiting-on panel | P0 | GUI_VALIDATED (1285-G + 1285-I nav, 2026-06-16) |
| 2 | Cross-surface View/Why consistency | P0 | LIVE expanded (1285-J + 1285-L: My Work/Team Work/Thread/Cockpit/Blind Spots/NotificationBell/Action Center/Comms — all on the shared ViewWhyPanel) |
| 3 | Action Center stale-artifact cleanup | P1 | NOT_STARTED |
| 4 | Comms final cleanup | P1 | NOT_STARTED |
| 8 | Richer thread/work queries | P1 | PARTIAL (WAITING_ON live; rest NOT_STARTED) |
| 5 | Blind Spots watcher feed | P2 | NOT_STARTED |
| 6 | BEAM watcher routes | P2 | NOT_STARTED |
| 7 | Ask Twin wiring | P2 | NOT_STARTED (disabled-honest today) |
| 9 | Async Python enrichment | P2 | NOT_STARTED (deterministic fallback live) |

---

## 10. Short confirmation phrases for active drafts — GUI_VALIDATED (1285-F, 2026-06-16)

- Current state: FIXED. Root cause was NOT the confirm-phrase list — it was
  that gratitude/social utterances ("Thank Sadeil …") were stopworded in the CT
  classifier and fell to the backend LLM, which only *described* a draft (no CT
  `pendingArtifact`), so "yes" had nothing to bind to.
- Why it matters: users say "yes/ok/send it", not "I confirm". A draft the user
  can't confirm is a dead promise.
- System of record: CT `pendingArtifact` (in-session) → on confirm, durable
  NOTIFICATION WorkLedgerEntry via `POST /work-os/internal-messages`.
- UI surfaces: AmbientOtzarBar (classify + pending-confirm intercept).
- Backend: `deliverHumanInternalMessage` (unchanged).
- Proof/audit: delivery returns notification_id + ledger_entry_id.
- RBAC/ABAC: human-authority path; per-session pending draft; tenant-scoped.
- Tests: CT classify gratitude → internal draft; "yes/ok/send it/go ahead"
  confirm; cleared after success (no duplicate); cross-session isolation.
- GUI: David "Thank Sadeil for being an amazing boss" → "yes" → delivered.

## 11. Case-insensitive email login — GUI_VALIDATED (1285-F, 2026-06-16)

- Current state: FIXED. Email trimmed + lowercased at the backend auth lookup
  and normalized in the CT login form before submit.
- Why it matters: David@niovlabs.com vs david@niovlabs.com must resolve the
  same entity; casing should never gate access.
- System of record: Entity.email (stored lowercased on create per existing
  normalization) ; auth login lookup.
- UI surfaces: CT Login page.
- Backend: `AuthService.login` (email normalize).
- Proof/audit: login audit unchanged.
- RBAC/ABAC: unchanged; invalid email still fails.
- Tests: backend login with mixed/upper case resolves; invalid still 401.
- GUI: David logs in with any casing.

## 1. Team Work waiting-on panel — IN_PROGRESS (1285-G; pending GUI validation)

- Goal: managers/admins see relationship-level waiting-on across the team, not
  only inside one PersonCockpit.
- Shipped (1285-G): `getTeamWork` now enriches each entry with owner/requester/
  target display names (one batched, tenant-scoped lookup). TeamWork.tsx adds a
  "Waiting on team" panel that filters the manager's team-work to ACTIVE
  directional asks (TASK/FOLLOW_UP/APPROVAL/BLOCKER/DECISION, requester≠owner,
  status not done), groups them by owner with names + requested-by + status +
  age + due + source-message proof + View/Why; completion (owner marks EXECUTED)
  drops the item on reload. Reuses the existing `/work-os/team-work` route per
  the reuse-first directive (no new endpoint).
- System of record: Work Ledger directional entries (never memory/counts).
- UI: TeamWork.tsx "Waiting on team" + WorkLedgerItem View/Why (now name-aware).
- Backend: `getTeamWork` enrichment (manager-gated, can_admin_org).
- Proof: source_message_id per row; View/Why shows owner/requester/source.
- RBAC/ABAC: manager/admin only; tenant-scoped; non-manager → 403.
- Tests: backend integration (manager sees ask w/ names + source proof;
  completion → EXECUTED; non-manager denied); CT pure-logic unit (filter/group/
  age). Empty state: "Nothing tracked as waiting on the team right now."
- GUI (pending): Team Work shows "Waiting on David: …"; completion clears it.

## 2. Cross-surface View/Why consistency — NOT_STARTED (P0)

- Goal: every artifact explains itself the same way everywhere.
- Surfaces: thread message, signal chip, Work Ledger item, My Work, Team Work,
  PersonCockpit, Blind Spot, Action Center, notification.
- View/Why must show: source message, source thread, requester, owner, target,
  status, signal type, confidence, extraction source, policy reason, proof/
  audit, execution attempts, correction history.
- System of record: WorkLedgerEntry + execution attempts + corrections.
- UI: a shared `<ViewWhy>` presenter consumed by all item components.
- Backend: ensure each surface's projection carries the proof fields.
- RBAC/ABAC: never expose another tenant's or unpermitted teammate's data.
- Tests: no raw id without human-readable meaning + source proof.

## 3. Action Center stale-artifact cleanup — NOT_STARTED (P1)

- Goal: no raw `DUAL_CONTROL:ACTION_CREATE_SEND_INTERNAL_NOTIFICATION` copy.
- Fix: human-readable titles (requester/target/action/risk/reason/source);
  hide/label stale test artifacts; clickable detail; approve/reject executes or
  explains; low-risk human notes never route here.
- System of record: ProposedAction / dual-control records.
- UI: ActionCenter + ProposedActionCard.
- RBAC/ABAC: approver authority enforced.
- Tests: card renders human-readable; approve executes; human notes absent.

## 4. Comms final cleanup — NOT_STARTED (P1)

- Goal: Comms = conversation capture/intelligence only (capture, import,
  transcript, extracted follow-ups/decisions/blockers/commitments, conversion
  to Work Ledger, proof/corrections). NOT a DM inbox or default destination.
- UI: Comms page; notification-routing (DM never → Comms — already true).
- Tests: DM notification never opens Comms; extracted work links to ledger.

## 5. Blind Spots watcher feed — NOT_STARTED (P2)

- Goal: surface risk from real work state: stale waiting-on, overdue
  commitments, unresolved blockers, unanswered asks, no-next-action, repeated
  ignored corrections, blocked projects.
- System of record: Work Ledger + watchers (see #6).
- UI: BlindSpots.tsx feed with source/owner/requester/age/reason/next-action.
- Tests: stale David→Sadeil ask appears with proof; no fake blind spots.

## 6. BEAM watcher routes — NOT_STARTED (P2)

- Goal: make BEAM watchers visible + governable.
- Needed: GET watchers, GET detail, PATCH status, next_check_at,
  escalation_level, source work/thread, owner/requester, reason, resolution.
- Constraint: BEAM never sends external / bypasses policy / mutates work without
  a governed action.
- Tests: watcher create/read/resolve; Blind Spots consumes watcher data.

## 7. Ask Twin wiring — NOT_STARTED (P2; disabled-honest today)

- Goal: Ask Twin is real or clearly disabled — never fake.
- When wired: authorized thread/work/project context only; owner boundary; no
  impersonation; answer labeled Twin/system-generated; proof; no private/
  unscoped memory; can propose next action, never silently execute.
- Tests: Ask Twin from David cockpit answers from scoped context or says
  unavailable.

## 8. Richer thread/work queries — PARTIAL (P1)

- LIVE: WAITING_ON variants (what am I waiting from/for, what does X owe me,
  what is pending/outstanding from X, what did I ask X for).
- NOT_STARTED: what did David complete · what blockers involve David · what
  decisions did David and I make · what is David waiting on me for · what tasks
  are overdue from David · what changed since yesterday with David · show my
  work with David.
- System of record: thread + Work Ledger (active + completed) + waiting-on.
- UI: thread-query classifier + AmbientOtzarBar dispatch.
- Backend: may need a completed/relationship work query endpoint.
- Tests: each query resolves person → durable records → proof-backed answer;
  honest empty ("I don't see anything tracked from David right now"); never
  vague memory unless durable unavailable and the answer says so.

## 9. Async Python enrichment — NOT_STARTED (P2; deterministic fallback live)

- Goal: message delivery never blocks on Python.
- Expected: fast delivery; enrichment async/bounded; deterministic fallback when
  Python down (LIVE); later refresh can enrich; never fake PYTHON_ENRICHED.
- Backend: `createLedgerEntry` enrichment path → fire-and-forget governed job +
  later update; no ungoverned workers.
- Tests: Python down → delivery + signal still work; recovered → future
  messages enrich; UI reflects true extraction source.
