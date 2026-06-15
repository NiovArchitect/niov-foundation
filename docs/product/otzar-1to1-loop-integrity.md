# Otzar 1-to-1 Collaboration Loop Integrity (Phase 1285-C)

Audit + repair of the Sadeil ↔ David human collaboration loop. The goal is
not "each piece works" — it is that the **visible loop connects end to end**:
message → signal → Work Ledger → My Work → waiting-on → People cockpit →
answerable by Otzar chat → correction/learning.

Cross-repo: backend is `niov-foundation` (Fastify/Prisma/Python/BEAM); UI is
`otzar-control-tower` (Vite/React/Tauri). Audited 2026-06-14.

## 1. The intended loop (canonical)

1. Sadeil: "David, please send me the proof-layer notes."
2. Otzar resolves David (roster / backend resolver).
3. Address stripped from body → "Please send me the proof-layer notes."
4. Delivered via the human-authority internal path (no dual-control).
5. Appears in the persistent Sadeil ↔ David thread (both directions).
6. Signal extraction → TASK_REQUEST (Python advisory, deterministic fallback).
7. Thread + People cockpit show "Otzar detected: Possible task".
8. Either participant clicks Add to Work Ledger.
9. Direction is derived from the SOURCE message, not the clicker:
   requester = Sadeil, owner/target = David, tracked_by = clicker.
10. Work Ledger entry created with proof (source_message_id, requester, owner,
    tracker, signal type, body excerpt, status).
11. David sees it in My Work.
12. Sadeil sees "Waiting on David".
13. David cockpit: "Sadeil is waiting on you".
14. Sadeil cockpit: "Waiting on David".
15. Sadeil asks (any natural phrasing): "what am I waiting from David".
16. Otzar answers from durable records: "You're waiting on David for: …".
17. Never from vague memory / priming / LLM fallback.
18-21. Completion, correction, participant-scope, RBAC/ABAC.

## 2. Working connections (verified)

| Connection | Evidence |
| --- | --- |
| One durable row anchors message→thread→signal→track | `internal-message.service.ts` — message_id == WorkLedgerEntry.ledger_entry_id (NOTIFICATION); thread + track-signal read the same row |
| Directionality is actor-independent | `trackThreadSignalAsWork` derives requester from `src.requester_entity_id`, owner from recipient; `callerEntityId` only gates participation |
| Waiting-on both directions | `getWaitingOnWith` → waiting_on_them / pending_from_them, active statuses, tenant+participant scoped, accepts name or UUID |
| My Work / Team Work scoping | `getMyWork` (owner/target/requester), `getTeamWork` (manager) |
| Human-authority delivery | `deliverHumanInternalMessage` → `createInternalNotification` (no dual-control) |
| Direct-address + sanitizer | `parseDirectAddress`, `stripLeadingRecipient`, `stripCommandWrapper` |
| Signal persistence | stored in `details.python_enrichment`; re-read, not recomputed |
| Notification → InboxThread routing | `notification-routing.ts` DIRECT_MESSAGE → `/app/inbox/:id` |

## 3. Broken / missing connections (found) and disposition

| # | Break | Repo | Severity | Status |
| --- | --- | --- | --- | --- |
| 1 | WAITING_ON classifier missed "waiting **from**", "need from", "owe me", "pending/outstanding from", "supposed to", "ask … for" → fell to LLM | CT | P0 (wrong answer) | FIXED — `thread-query.ts` 11 patterns |
| 2 | WAITING_ON answer could miss durable records when client roster unreadable | CT | P0 | FIXED — dispatch falls back to backend name resolver; durable-only, never LLM |
| 3 | track-signal created DUPLICATE entries on double-click / both chips | FND | P1 (confusing work) | FIXED — idempotent findFirst on `source_message_id` |
| 4 | No deterministic signal when Python unavailable → chip never appears → whole loop dead | FND | P1 | FIXED — conservative LOW-confidence fallback (TASK/BLOCKER/DECISION/APPROVAL); respects Python when present |
| 5 | Chip had no persistent "already tracked" state (re-offered Add after reload) | CT/FND | P1 (dead UI) | FIXED — `signal.tracked` from server; chip initial state honors it |
| 6 | PersonCockpit / InboxThread did not refresh waiting-on after Add (needed app restart) | CT | P1 (dead UI) | FIXED — `onTracked` callback reloads thread + waiting-on |
| 7 | `tracked_by` not recorded on the ledger entry | FND | P2 (audit) | FIXED — `details.tracked_by = caller` (does not flip direction) |
| 8 | No centralized Sadeil-side waiting-on surface (only PersonCockpit) | CT | P2 | DEFERRED — Team Work waiting-on panel (next patch) |
| 9 | No completion/resolve UI for David's task | CT | P2 | DEFERRED — PATCH `/work-os/ledger/:id` exists; needs a "Mark done" control + owner-guard |
| 10 | My Work / Work Ledger item doesn't link back to source message | CT | P3 | DEFERRED — `details.source_message_id` available |
| 11 | Python enrichment awaited on the send path (up to 2s latency; never fails delivery — `extractWorkSignals` catches) | FND | P3 | DEFERRED — async/fire-and-forget refactor (governed) |
| 12 | No due-date / stale / unanswered-ask watcher beyond BEAM fanout-on-create | FND | P3 | DEFERRED — needs governed scheduler (no ungoverned workers) |

## 4. Data ownership map

| Object | Owner of truth | Key fields |
| --- | --- | --- |
| message | `WorkLedgerEntry` (ledger_type NOTIFICATION) | requester=sender, target=recipient, source_command=body, details.python_enrichment |
| thread | derived from NOTIFICATION rows (both directions) | participant + tenant scoped |
| signal | `details.python_enrichment` + deterministic fallback | signal_type, confidence, evidence_phrase, tracked |
| ledger task | `WorkLedgerEntry` (TASK/FOLLOW_UP/APPROVAL/BLOCKER/DECISION) | requester, owner, target, status, details.source_message_id, details.tracked_by |
| waiting-on | derived view over ledger tasks | waiting_on_them / pending_from_them |
| My Work | derived (`getMyWork`) | owner/target/requester, status |
| Team Work | derived (`getTeamWork`, manager) | org-wide active |
| People cockpit | composes thread + waiting-on | display only |
| correction | CORRECTION memory capsule (caller-scoped) | incorrect_description, correct_behavior |
| proof | execution attempts + ledger details | BEAM_FANOUT, PYTHON_ENRICHMENT, source_message_id |

## 5. Ranked fix list — shipped this phase

P0/P1 (loop-breaking, shipped): #1, #2, #3, #4, #5, #6, #7.

## 6. Deferred (documented, not shipped)

#8 Team Work waiting-on panel · #9 completion control + owner-guard on PATCH ·
#10 source-message link in My Work · #11 async Python enrichment · #12 governed
due-date/stale watchers. None block the validated 1-to-1 loop; each is additive.

## 7. Fixable now vs needs deeper model

- Fixable now (done): classifier, durable answer, dedup, deterministic signal,
  tracked flag, cockpit refresh, tracked_by.
- Needs schema/scheduler: durable watcher escalation (#12), a first-class
  `source_message_id` column + unique index for DB-level dedup (currently
  enforced in service code), async enrichment job (#11).
