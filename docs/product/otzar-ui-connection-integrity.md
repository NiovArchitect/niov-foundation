# Otzar UI Connection Integrity (Phase 1285-D)

Every visible affordance is a promise. This audit maps each Otzar Control Tower
control to its full chain: affordance → intent → actor → target → component →
backend → policy → durable state → proof → UI update → answerability →
correction. Companion to `otzar-1to1-loop-integrity.md`. Audited 2026-06-14.

Status legend: CONNECTED · PARTIAL · BROKEN · DEAD · MOCK · WRONG-DEST ·
NEEDS-GUI (manual validation only).

## Surface tables

### 1. AmbientOtzarBar / Talk to Otzar (`AmbientOtzarBar.tsx`)

| Affordance | Expect | Component → API | Durable state | UI updates | Otzar answers | Status | Fix / note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Direct-address "David, please …" | internal note to David | `parseDirectAddress` → `executeMessageAction` → `internalMessage` | NOTIFICATION row | draft → Delivered | yes (thread) | CONNECTED | shipped 1285-B |
| "Tell David …" | internal note | tell block → same path | NOTIFICATION row | same | yes | CONNECTED | — |
| "what am I waiting from David" (+10 variants) | durable waiting-on | `classifyThreadQuery` WAITING_ON → `waitingOn` | read ledger | answer | yes | CONNECTED | shipped 1285-C (#1) |
| waiting-on empty | honest empty | `composeWaitingOnAnswer` | read | answer | yes | CONNECTED | never LLM (#2) |
| thread Qs (received/latest) | durable thread | `thread` | read | answer | yes | CONNECTED | — |
| Confirm / I confirm | deliver draft | `confirmArtifact` → `internalMessage` | NOTIFICATION | Delivered + proof | — | CONNECTED | — |
| Include Others / pick recipient | attach recipient | resolveTarget picker | — | — | — | PARTIAL | backend resolves name on Confirm even if client roster unreadable; primary path is direct-address |
| Cancel / Ignore | dismiss draft/chip | local state | — | yes | — | CONNECTED | — |
| generic chat fallback | LLM answer | `intent.send` | memory/COE | answer | — | CONNECTED | only when no deterministic handler; waiting-on no longer leaks here |

### 2. NotificationBell (`NotificationBell.tsx`, `notification-routing.ts`)

| Affordance | Status | Note |
| --- | --- | --- |
| direct-message notif → `/app/inbox/:id` | CONNECTED | correct destination |
| approval notif → `/app/action-center?focus=` | CONNECTED | — |
| mark read | CONNECTED | `notifications.markRead` |
| reply from bell | CONNECTED | human-authority path back to sender |

### 3. InboxThread (`InboxThread.tsx`)

| Affordance | Status | Fix / note |
| --- | --- | --- |
| thread load (both directions) | CONNECTED | `workOs.thread` |
| reply | CONNECTED | `internalMessage`; `reloadThread` after |
| signal chip | CONNECTED | per-message |
| Add to Work Ledger | CONNECTED | `trackSignal`; idempotent |
| already-tracked persistence | CONNECTED | `signal.tracked` from server (#5) |
| refresh after Add | CONNECTED | `onTracked` → `reloadThread` (#6) |
| Not work | PARTIAL | scoped correction; chip terminal state (mutually exclusive with Add) |
| View / Why proof | CONNECTED | message id, authority, channel |
| complete/resolve | DEAD | no control yet (#9 deferred) |

### 4. People & Collaboration / PersonCockpit (`PersonCockpit.tsx`, `PeopleDirectory.tsx`)

| Affordance | Status | Fix / note |
| --- | --- | --- |
| person card → cockpit | CONNECTED | — |
| Message composer | CONNECTED | `internalMessage`; reloads thread + waiting-on |
| Waiting on / is waiting on you | CONNECTED | `waitingOn`; refreshes after Add (#6) |
| signal chip Add | CONNECTED | tracked flag + refresh |
| Request help | PARTIAL | callback wired; downstream collaboration request is minimal |
| Ask Twin | DISABLED-HONEST | "Ask-Twin coming next" copy (not fake) |
| shared/recent badges | MOCK | counts are placeholders (display only) |

### 5. My Work (`MyWork.tsx`)

| Affordance | Status | Fix / note |
| --- | --- | --- |
| owned/pending tasks | CONNECTED | `myWork` |
| owner/requester/due | CONNECTED | — |
| source proof link | PARTIAL | source_message_id in details, not yet linked (#10) |
| complete/resolve | DEAD | needs control + owner-guard (#9) |

### 6. Team Work (`TeamWork.tsx`)

| Affordance | Status | Fix / note |
| --- | --- | --- |
| team active work (manager) | CONNECTED | `teamWork` |
| "who's waiting on whom" | MISSING | description promises it; no waiting-on matrix (#8 deferred) |

### 7. Blind Spots

| Affordance | Status | Note |
| --- | --- | --- |
| stale blockers / no-next-action | PARTIAL | surface exists; no governed watcher feed yet (#12) |

### 8. Comms

| Affordance | Status | Note |
| --- | --- | --- |
| capture / import / extract | CONNECTED | conversation-to-work |
| not direct messaging | CONNECTED | direct notes route to InboxThread, not Comms (fixed earlier) |

### 9. Action Center / Approvals

| Affordance | Status | Note |
| --- | --- | --- |
| approval cards | CONNECTED | human notes never routed here (human-authority path) |
| approve/reject executes | CONNECTED | policy pipeline |
| stale DUAL_CONTROL artifacts | PARTIAL | low-risk human notes no longer create them; legacy cleanup tracked |

### 10. Work Ledger

| Affordance | Status | Note |
| --- | --- | --- |
| entry detail / status / parties | CONNECTED | — |
| execution attempts (proof) | CONNECTED | BEAM/Python attempts |
| source thread/message proof | PARTIAL | in details, surfacing pending (#10) |

### 11. My Twin / AI Twin

| Affordance | Status | Note |
| --- | --- | --- |
| Ask Twin | DISABLED-HONEST | "coming next"; not fake |
| scoped answer / no impersonation | N/A | not yet wired |

### 12. Corrections

| Affordance | Status | Note |
| --- | --- | --- |
| Correct Otzar / Not work | PARTIAL | writes scoped CORRECTION capsule; chip terminal state; retroactive ledger removal not yet (mutually exclusive UI mitigates) |

## Broken chains fixed this phase (top, ranked by loop impact)

1. WAITING_ON variants → durable answer (was wrong LLM answer). CT.
2. track-signal idempotency (was duplicate work). FND.
3. deterministic signal fallback (chip appeared only with Python). FND.
4. chip already-tracked persistence + cockpit/inbox refresh (dead UI). CT/FND.
5. tracked_by audit on the ledger entry. FND.

## Deferred (documented, additive, non-blocking)

Team Work waiting-on panel · completion control + PATCH owner-guard · source-
message link in My Work / Work Ledger · async Python enrichment · governed
due-date/stale watchers · Ask Twin wiring · legacy Action Center cleanup.

## Manual GUI validation checklist

A "David, please send me the proof-layer notes." → resolves David, body stripped.
B Confirm → Delivered. C David thread shows it. D chip "Possible task".
E David clicks Add → My Work shows task. F chip shows "Tracked" (persists on reload).
G Sadeil cockpit → "Waiting on David". H "what am I waiting from David" → grounded.
I "what work am I waiting from David" → same grounded answer. J no generic context.
K Add clicked twice → no duplicate. L Not work → chip non-actionable.
M no external send / no Action Center / no dual-control / no chat bleed.
