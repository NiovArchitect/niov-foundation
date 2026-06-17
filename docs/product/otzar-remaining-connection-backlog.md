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
| 3 | Action Center stale-artifact cleanup | P1 | LIVE (1285-S: actionable-only "Needs decision" count + honest class labels — Low-risk internal note / Already handled / Historical / No action needed; non-destructive classification, no dismiss route exists; pending GUI validation) |
| 4 | Comms final cleanup | P1 | LIVE (1285-L2 cockpit + 1285-T recent-artifacts: GET /work-os/comms/recent-artifacts durable Work Ledger projection; cockpit recent list shows real artifacts / honest empty / error; WorkStateChanged refresh; pending GUI validation) |
| 8 | Richer thread/work queries | P1 | LIVE (1285-M: completed / blockers / decisions / inverse-waiting-on / overdue / changed / summary + latest-say — all durable; pending GUI validation) |
| 5 | Blind Spots watcher feed | P2 | LIVE + GUI_VALIDATED (1285-N) → richer governed watcher feed (1285-P: GET /work-os/watchers/feed, WatcherFinding contract, 6 groups, pending GUI validation) |
| 6 | BEAM watcher routes | P2 | IN_PROGRESS (1285-P: Foundation deterministic watcher service + route LIVE; BEAM watcher actor bridge deferred as P2 — no stable BEAM watcher-evaluation route exists; see docs/product/otzar-watcher-routes.md) |
| 7 | Ask Twin wiring | P2 | LIVE self-ask (1285-R: governed conductSession + COE; Work-OS questions route deterministically; another person's Twin stays disabled-honest; pending GUI validation). Cross-entity Ask Twin remains a separate future backend contract. |
| 9 | Async Python enrichment | P2 | LIVE (1285-U: ambient Python intelligence contract — PythonIntelligenceEnvelope + Foundation validation; work-signal enrichment now async/non-blocking, deterministic primary) |
| 12 | Ambient perception intelligence (meeting/transcript) | P2 | LIVE (1285-V: POST /work-os/perception/capture — durable MEETING capture + async MEETING_INTELLIGENCE via Python /jobs/meeting-intelligence; Foundation-validated envelope projected on the Work Ledger; runway for glasses/lenses. Backlog: 1285-W semantic retrieval, 1285-X risk scoring, 1285-Y draft tone, 1285-Z operational analytics, later glasses/lens input adapter) |

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

## 3. Action Center stale-artifact cleanup — LIVE (1285-S; pending GUI validation)

- Human-readable titles + recipient labels + clickable View/Why landed in
  1285-O (BLOCKER 2). Phase 1285-S adds the trust layer:
  - NEW `src/lib/work-os/action-classify.ts` `classifyAction`:
    ACTIONABLE_PENDING (PROPOSED + live escalation) / NEEDS_REVIEW (PROPOSED,
    no escalation) / NEEDS_ATTENTION (FAILED/TIMED_OUT) /
    LOW_RISK_INTERNAL_NOTE / HISTORICAL_EXECUTED / NON_ACTIONABLE.
  - The "Needs decision" badge counts ONLY actionable items; actionable sort
    first; non-actionable proposals stay visible but labeled "No action needed
    right now"; historical / low-risk items show an honest class badge.
  - Refreshes on WorkStateChanged + approve/reject reload.
- Non-destructive: there is NO action dismiss/archive route, so the fix is
  classification + labeling, never deletion, never fake-clear. Real pending
  governed approvals stay prominent and actionable.
- System of record: Action rows (SafeActionView). UI: ActionCenter. RBAC/ABAC:
  approver authority enforced server-side (self-scoped list).
- Tests: classifier 7/7; ActionCenter pending count excludes non-actionable;
  historical low-risk note labeled + not counted; WorkStateChanged refresh;
  approve/reject + View/Why intact. CT PR #117.
- Note: per Phase 1284 doctrine low-risk human notes should deliver directly
  (not as governed Actions); pre-existing historical note Actions are now
  labeled rather than cluttering the actionable view. Stopping their creation
  at the source is a separate Foundation routing concern, not 1285-S.

## 4. Comms final cleanup — LIVE (1285-L2 cockpit + 1285-T recent-artifacts; pending GUI validation)

- Shipped (1285-L2): the default Comms page is a conversation-intelligence
  cockpit: capture controls + "what Otzar turns conversations into" (Follow-ups
  / Decisions / Blockers / Commitments wired; Questions / Tasks "coming next") +
  the capture-to-work flow. Blockers/risks render in the review view. Follow-up
  cards carry the shared View/Why. Direct messages never route to Comms.
- Shipped (1285-T): the documented recent-artifacts backend gap is closed. NEW
  `GET /api/v1/work-os/comms/recent-artifacts` (`getRecentCommsArtifacts`) is a
  durable PROJECTION over the Work Ledger (no new table): the caller's recent
  conversation-derived entries mapped to RecentCommsArtifact (FOLLOW_UP /
  DECISION / BLOCKER / WORK_CAPTURE / NOTIFICATION), self-scoped + tenant-
  isolated, recency-ordered, limit 30 (max 50), `next_cursor: null`. Canonical
  participant labels (never a raw UUID); source proof + a real navigable
  destination. The cockpit "Recent conversation intelligence" section now shows
  real artifacts, an honest empty state, or an honest error; refreshes on
  WorkStateChanged. Foundation PR #411; CT PR (1285-T).
- Forward note: meeting-capture / direct-message / action-proposal artifact
  sources can be merged into the same projection later; v1 sources the Work
  Ledger only (the cleanest self-scoped durable source, no duplication with the
  notification bell).

## 4b. (superseded) Comms final cleanup — original notes

- Goal: Comms = conversation capture/intelligence only (capture, import,
  transcript, extracted follow-ups/decisions/blockers/commitments, conversion
  to Work Ledger, proof/corrections). NOT a DM inbox or default destination.
- UI: Comms page; notification-routing (DM never → Comms — already true).
- Tests: DM notification never opens Comms; extracted work links to ledger.

## 5. Blind Spots watcher feed — LIVE + GUI_VALIDATED (1285-N); richer watcher feed (1285-P, pending GUI validation)

- Phase 1285-P upgrade: detection now lives in a single deterministic detector
  (`watcher.service.ts`). `getWatcherFeed` exposes the richer `WatcherFinding`
  contract at `GET /api/v1/work-os/watchers/feed` (canonical participants +
  source proof + detection metadata + recommended next action + action_kind);
  `getBlindSpotFeed` is now a thin projection of the same scan (no duplication).
  BlindSpots.tsx consumes `watchersFeed` as the primary feed, grouped into 6
  sections (Overdue / Stale waiting-on / Blockers / No next action / Unanswered
  asks / Commitments; empty groups omitted). Voice routing for blind-spot /
  overdue / at-risk / stale / follow-up / unresolved-blocker questions is
  deterministic → /app/blind-spots. Foundation PR #406; CT PR #113. See
  `docs/product/otzar-watcher-routes.md`.

- Goal: surface risk from real work state: stale waiting-on, overdue
  commitments, unresolved blockers, unanswered asks, no-next-action, repeated
  ignored corrections, blocked projects.
- System of record: Work Ledger (durable rows only; no AI guessing, no fake
  risk). BEAM watchers (#6) remain a future enrichment source.
- Backend: `getBlindSpotFeed` (work-ledger.service.ts) +
  `GET /api/v1/work-os/blind-spots/feed` (auth: read). One blind spot per
  ledger entry — the single highest-priority risk, never double-counted:
  `OVERDUE_WORK > UNRESOLVED_BLOCKER > STALE_WAITING_ON > NO_NEXT_ACTION`.
  Each item carries severity, canonical owner/requester names (never a raw
  UUID), age_days, due_at, source_message_id proof, recommended action, and
  the detection_rule string. Terminal statuses excluded by query. Scope:
  employee sees own; manager (can_admin_org) sees team; tenant-isolated.
- UI: BlindSpots.tsx typed feed grouped into Overdue / Stale waiting-on /
  Blockers / No next action; severity badge + owner/requester + age/due +
  recommended action + Why (shared ViewWhyPanel → detection rule + proof);
  honest empty state "No blind spots detected right now."; legacy
  runtime/verification + ledger-status sections preserved below, deduped by
  ledger_entry_id; refreshes on WorkStateChanged.
- v1 detection rules IMPLEMENTED: OVERDUE_WORK, UNRESOLVED_BLOCKER,
  STALE_WAITING_ON, NO_NEXT_ACTION.
- DEFERRED (not safely detectable from durable state in v1, documented not
  faked): UNANSWERED_ASK, STALE_COMMITMENT — and repeated-ignored-correction
  / blocked-project signals, which need #6 watcher state + Wave 3 drift
  detection (ADR-0055).
- Tests: stale David→Sadeil ask appears with proof + canonical names; overdue
  / blocker / no-owner classified with severity; multi-rule entry collapses to
  one; manager vs caller scope; completed excluded; no fake blind spots;
  CT feed renders + empty/error honest + View/Why + no raw UUID.
- Foundation PRs #401 (feed) + #402 (collapse); CT PR #111.

## 6. BEAM watcher routes — IN_PROGRESS (1285-P Foundation; BEAM actor bridge = P2)

- Phase 1285-P landed the Foundation half: the governed watcher service +
  `GET /api/v1/work-os/watchers/feed` (deterministic, BEAM-independent). The
  BEAM watcher *actor* bridge (`POST /beam/watchers/evaluate`) is deferred as
  **Phase 1285-P2** because BEAM exposes dispatch + health only — no stable
  watcher-evaluation route exists. Faking it was explicitly avoided. The feed
  contract is structured as exactly what BEAM will feed; Foundation stays the
  policy authority (re-validates + re-scopes candidates). See
  `docs/product/otzar-watcher-routes.md` §"BEAM bridge — Phase 1285-P2".

- Goal: make BEAM watchers visible + governable.
- Needed: GET watchers, GET detail, PATCH status, next_check_at,
  escalation_level, source work/thread, owner/requester, reason, resolution.
- Constraint: BEAM never sends external / bypasses policy / mutates work without
  a governed action.
- Tests: watcher create/read/resolve; Blind Spots consumes watcher data.

## 7. Ask Twin wiring — LIVE self-ask (1285-R; pending GUI validation)

- Goal: Ask Twin is real or clearly disabled, never fake.
- Phase 1285-R (self-scoped only): a new "Ask your Twin" box on the My Twin
  page. Three deterministic paths via `src/lib/work-os/ask-twin.ts`
  `classifyAskTwin`:
  - Known Work OS question routes to its durable surface (My Work / Blind
    Spots / Team Work), never the LLM (shared `matchWorkOsQuery`).
  - A question aimed at another person's Twin is disabled-honest: Otzar will
    not answer for or impersonate someone else's Twin; it offers a governed
    request in Collaboration. No LLM call, no fake answer.
  - A genuine self question calls the LIVE governed `conductSession` endpoint
    (`POST /otzar/conversation/message`, COE permission-scoped + audited +
    RULE 0). The answer is labeled "Answered by your Twin from your governed
    context" with transparency + provenance (title/scope, never a raw UUID).
    Proposed external writes stay approval-gated (shown as proposals, never
    executed). No new backend; no frontend-only LLM.
- Cross-entity Ask Twin (answering as / for another person's Twin) remains a
  SEPARATE future backend contract: cross-DMW scoping + consent/authority +
  no-impersonation safeguards. Not built in 1285-R.
- Tests: classifier routing (work-os / other-twin / self); My Twin Ask box
  (work-os routes without an LLM call; other-twin disabled-honest with no LLM
  and no fake; self-ask renders governed answer + transparency + provenance
  without a raw UUID; honest error with no fake on failure).

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
