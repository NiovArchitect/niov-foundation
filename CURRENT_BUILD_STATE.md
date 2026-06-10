# CURRENT_BUILD_STATE.md

_Last updated: 2026-06-10 (Phase 1209 close-out)._

## Warmwind OS reference (added 2026-06-10)

**Warmwind OS is now a UX reference point for Otzar's employee AI Work
OS experience, not a replacement architecture.** Foundation remains
the identity / DMW / COSMP / policy / GovernedAction / audit /
settlement substrate. The Warmwind reference influences UI/UX,
navigation, and interaction model: AI feels like it can do work
(visual, calm, OS-like) but every action is still routed through the
Foundation governance pipeline. See `OTZAR_EMPLOYEE_EXPERIENCE.md`
(future, queued) for the full mapping.

## PR-H "ambient employee UX" reconciliation (2026-06-10)

The original PR-H task (`#73`, posted with the
[FOUNDER-AUTH — REDESIGN EMPLOYEE UX AS AMBIENT OTZAR DESKTOP LAYER]
directive) is reconciled as **Option B — partially completed**. The
nine specific items from that directive map to shipped phases as
follows:

| # | PR-H item | Status | Lineage |
| --- | --- | --- | --- |
| 1 | Top notification bell | **DONE** | Phase 1210 (`ct#53`) |
| 2 | Ambient My Twin bar always-available | **already exists** | `AmbientOtzarBar` (pre-PR-H) |
| 3 | "My Day" landing page | **deferred → Phase 1212** | task #78 |
| 4 | Pending confirmations visible immediately | **PARTIAL** | bell surfaces notifications (1210); Action Center pending in 1211 |
| 5 | Recent internal notes surfaced | **DONE** | Phase 1210 bell |
| 6 | Clean employee navigation | **deferred → Phase 1212** | task #78 |
| 7 | Hide unfinished technical pages | **deferred → Phase 1212** | task #78 |
| 8 | Remove developer-facing labels | **PARTIAL** | friendly error copy on approval card (Phase 1209); full sweep in 1212 |
| 9 | Keep admin Control Tower separate | **already exists** | EmployeeLayout vs admin Layout (pre-PR-H) |

The remaining PR-H work has been split into two bounded follow-on
slices: **Phase 1211 (Action Center page)** in flight, and **Phase
1212 (My Day landing + nav simplification + label sweep)** queued
as task #78. Task #73 is now closed; further work continues in
those bounded slices rather than as an open umbrella ticket.

## Phase 1213 close-out (2026-06-10) — Ambient Otzar Comms

**Hero flow:** *Start capture → Otzar listens → Otzar organizes →
follow-ups ready.* Manual paste is fallback-only.

| | |
| --- | --- |
| Foundation PR | `niov-foundation#311` merged (`78c5175`) |
| CT PR | `otzar-control-tower#56` merged (`cec1d14`) |
| Foundation tests | 2024 unit (`+12`) |
| CT tests | 627 unit (`+9` + 1 nav update) |
| Live extraction | DEMO_SCRIPTED auto-detects the canonical Founder fixture |
| Live actions | 3 RESOLVED follow-ups → 3 `Action(SUCCEEDED)` rows → 3 recipient `Notification` rows |
| External writes | zero |
| Audit | `ACTION_PROPOSED` + `_APPROVED` + `_EXECUTED` per action |
| New Prisma models | **none** (persistence reuses the existing Action + Notification pipeline) |
| Three modes | `DEMO_SCRIPTED` (canonical fixture), `LLM` (Anthropic), `LOCAL_FALLBACK` (honest empty) |

## Phase 1209 close-out (2026-06-10)

**Roster-aware internal note completion is live end-to-end.**

| Sender | Recipient | Action ID | Status | Recipient sees in inbox? |
| --- | --- | --- | --- | --- |
| sadeil@niovlabs.com | David Odie | 2d465f7d… | SUCCEEDED | ✅ UNREAD |
| vishesh@niovlabs.com | Annie | 0e95d0af… | SUCCEEDED | ✅ UNREAD |
| sadeil@niovlabs.com | Samiksha Sharma | 6a2f83dd… | SUCCEEDED | ✅ UNREAD |
| david@niovlabs.com | Vishesh Sharma | 5f1dd8f6… | SUCCEEDED | ✅ UNREAD |
| sadeil@niovlabs.com | "Marcus" (not in roster) | — | — | LLM refused to draft; surfaced full roster instead |

Verified live against merged Foundation main + Phase 1209
ActionPolicy + OrgSettings seed. Chat → Otzar drafts → operator
clicks Send → `POST /api/v1/actions` → policy evaluator
AUTO_APPROVE → executor cron fires → `SendInternalNotification`
handler creates recipient Notification row → recipient
`GET /api/v1/notifications` shows the unread note. ACTION_PROPOSED +
ACTION_APPROVED + ACTION_EXECUTED audit emitted. **Zero external
writes**. **Zero notifications to non-recipients**.

The feature is **"roster-aware internal note/action completion"** —
David was the original regression fixture, not a product rule. The
backend extractor (17 tests across 5 names) and the CT card (16
tests across 4 recipients + 3 friendly-error-copy cases) prove the
card / extractor / API client work for any valid roster entry.

_Last updated: 2026-06-10 by Claude during the
[FOUNDATION/OTZAR end-to-end audit] directive._

This file is the **honest snapshot** of what works, what doesn't, what
is wired, and what still needs to ship before Otzar is usable for a
real enterprise demo.

It is not a roadmap; the directive's 15-objective sweep is a multi-week
program. This file is the *current ground truth* + the *single next
vertical slice* a Founder-authorized session is implementing.

---

## 1. What works end-to-end TODAY (verified live)

| Capability | Live proof | Lineage |
| --- | --- | --- |
| Multi-user login (8 demo users) | `LocalTest-SafePassword-123!` for each `@niovlabs.com` user; live curl + Otzar.app verified 2026-06-10 | Foundation seed (PR #304) |
| User-scoped identity context | `GET /api/v1/otzar/my-twin/context-health` returns `READY` for sadeil/david/vishesh/samiksha with correct name/role/org/twin/projects/counts | Foundation #306 (Phase 1205) |
| L0_IDENTITY in real-LLM prompt | "Who am I in this system?" → real Anthropic Claude response uses viewer's scoped identity ("You are David Odie, Tech Lead at NIOV Labs") | Foundation #306 + .env Anthropic key |
| Org roster surfaced to LLM | "Send David a note..." → "I found David Odie (Tech Lead) — your most-collaborated team member with 3 shared projects." Single-question approval prompt instead of 4-question cascade | Foundation #307 (Phase 1207) |
| Voice TTS loop guard | dedupe + cancel-before-speak + ESC + unmount cleanup; 16 ambient-bar + 9 hook unit tests | CT #49 |
| Context-health badge on /app/voice | At-a-glance "Signed in as / Org / Role / Twin / counts" | CT #50 |
| Otzar.app desktop bundle | Built fresh `Jun 10 01:48:49 2026` post-Phase-1207 merge; PID 19253 | CT main |

## 2. What exists in code but is NOT wired to the live employee flow

This is the **honest gap list** — primitives that exist but are
disconnected from the executive demo path.

| Foundation primitive | Schema/route exists? | Wired to Otzar chat? |
| --- | --- | --- |
| `Action` (PROPOSED → APPROVED → ...) per ADR-0057 | Yes — `model Action` + `POST /api/v1/actions` + 10-state lifecycle + retry/timeout + `ActionAttempt` + `ActionResult` | **NO** — Otzar's LLM draft never creates an Action row |
| `ActionPolicy` (per-org default decision) | Yes — `model ActionPolicy` + matched at create-time | Not exercised because no Action is created from chat |
| `ActionType.SEND_INTERNAL_NOTIFICATION` | Yes — the exact action_type "Send David a note" maps to | Not invoked |
| `EscalationRequest` + `POST /escalations/:id/approve|reject` | Yes — `escalation.routes.ts` + `approveEscalationForCaller` / `rejectEscalationForCaller` | Not invoked from any UI; no Action Center page |
| `Notification` model + `GET /api/v1/notifications` + mark-read + dismiss | Yes — `notification.routes.ts` | No notification bell in CT UI; notification rows never fire because no Action is created |
| `TwinCollaborationRequest` (requester/target/status) | Yes — `model TwinCollaborationRequest` with seeded rows | Not exposed in CT chat or Action Center |
| `BreakGlassGrant` / GOVSEC.5 dual-control | Yes — ADR-0050 + middleware + 4 PRIVILEGED_ENDPOINTS routes | Not relevant to standard employee flow |
| `MemoryCapsule` + COSMP 7-op pipeline | Yes — `model MemoryCapsule` + Elixir `apps/cosmp_router` (137 cosmp_router tests + DBGI supervisor) | Not visible in CT employee UI |
| `Wallet` per entity (DMW analog) | Yes — `model Wallet` + `enum WalletType {PERSONAL,ENTERPRISE,AI_AGENT,DEVICE}` + `WalletBalance` | Not surfaced in employee UI |

## 3. Mapping to the directive's vocabulary

The directive uses the names "DMW", "COSMP", "GovernedAction",
"SettlementRail". Most of those primitives **already exist under
different repo names** — the directive is asking for a *vocabulary
alignment + UI surface*, not a from-scratch substrate build.

| Directive term | Existing Foundation primitive | Notes |
| --- | --- | --- |
| **DMW (Digital Memory Wallet)** | `model Wallet` keyed by `entity_id` with `WalletType` discriminator | The "registry" view is just `SELECT * FROM wallets` scoped by org |
| **COSMP MemoryCapsule** | `model MemoryCapsule` (already named) + Elixir `cosmp_router` 7-op pipeline + Translator | Schema is patent-canonical; UI surface is missing |
| **GovernedAction** | `model Action` + `ActionAttempt` + `ActionResult` + `ActionPolicy` per ADR-0057 | The 10-state lifecycle (PROPOSED → APPROVED → SCHEDULED → RUNNING → SUCCEEDED/FAILED/CANCELLED/...) already exists |
| **AuditEvent** | `model AuditEvent` + append-only chain + BEFORE DELETE trigger per ADR-0002 + 30+ canonical event-type literals | Already canonical |
| **SettlementRail** | Not modeled — no payment substrate exists in this repo. Directive's "Base USDC / Circle" is forward-substrate, not a launch-blocker. |
| **PolicyEvaluation** | `ActionPolicy.default_decision` + `policy-evaluator.ts` | Already wired into create-time Action flow |

**Conclusion:** the substrate is mostly in place. The directive's
"15-objective sweep" can be reframed as **UI surface +
chat→Action wiring** for an enterprise-ready demo.

## 4. The bug the Founder just observed live

| | |
| --- | --- |
| Prompt | _"Send David a note letting him know he has to get back to work."_ |
| Response (post-Phase-1207) | _"I found David Odie (Tech Lead, david@niovlabs.com) — your most-collaborated team member with 3 shared projects. I drafted a direct internal note. I will not send it until you approve. Draft: 'Hey David — heads up, time to get back to it.' Send this to David Odie?"_ |
| **Gap** | **No button anywhere in the UI lets the operator click "Send this to David Odie?".** The draft sits in chat transcript only; no `Action` row is created; no notification fires for David; no audit. |

This is the **single highest-value vertical slice** — it closes the
loop between the Phase 1207 fix and a real enterprise action.

## 5. The vertical slice this session is implementing (Phase 1208)

**`[OTZAR-PHASE-1208-CHAT-ACTION-PROPOSE]` — wire Otzar's draft to a
real `Action(PROPOSED)` + give the operator one place to approve/reject.**

Scope (single bounded PR; everything else stays as-is):

1. **Foundation backend** — when `conductSession` detects the LLM's
   canonical draft shape (the Phase 1207 "I drafted ... Send this to
   X?" output), surface the proposed action as structured metadata
   in the response: `{ proposed_action: { action_type, target,
   draft, ... } }`. No DB write yet — the Action row is created
   on **explicit operator approve click** to preserve the "no
   silent execution" invariant.

2. **Foundation backend** — wire the *approve click* through
   `POST /api/v1/actions` with `action_type=SEND_INTERNAL_NOTIFICATION`,
   `payload = { recipient_entity_id, draft_body }`, which fires the
   existing ADR-0057 pipeline (`ACTION_PROPOSED` audit → policy
   evaluator → either AUTO_APPROVE or NEEDS_APPROVAL → on approved,
   executor creates a `Notification` row for the recipient).

3. **Control Tower UI** — render a small **inline approval card**
   under the Otzar response when `proposed_action` is present.
   Buttons: **Send (✓)** / **Don't send (✕)** / **Edit draft**.

4. **Control Tower UI — minimal Action Center** — `/app/action-center`
   route listing the viewer's own `PROPOSED` and `APPROVED` actions
   from `GET /api/v1/actions?status=PROPOSED|APPROVED`. One row per
   action with title + status + audit timestamp.

5. **Control Tower UI — recipient inbox** — `/app/inbox` listing the
   viewer's `Notification` rows from `GET /api/v1/notifications`. When
   David logs in, he sees Sadeil's "get back to work" note as a real
   notification row.

6. **Tests** — Foundation unit tests for the chat→proposed-action
   surfacing helper; CT component tests for the approval card +
   inbox + Action Center.

**Out of scope for this slice (acknowledged):**

- 13-role archetype dashboards
- Notification bell UI (the inbox + Action Center routes cover the
  data layer; the bell with brain-icon AI breakdown is a follow-on)
- Comms / Dandelion / People redesign
- Cross-company collaboration
- Settlement rails / Base USDC
- Connector health dashboard
- Warm-OS visual redesign

## 6. Honest reasoning for the scope choice

The directive explicitly says (priority order #4):

> Prefer connected vertical slices over scattered incomplete features.

And earlier in this same session the Founder said:

> Do NOT add broad new scope. Do NOT ship more substrate without a
> visible working flow.

The **chat → approve → audit** slice is the smallest delta that:
- closes the loop on the just-fixed Phase 1207 draft
- uses only existing Foundation primitives (no new schema)
- delivers something a human can SEE working in <5 minutes of clicks
- emits real audit (ACTION_PROPOSED + ACTION_APPROVED + ACTION_EXECUTED)
- proves the DMW/COSMP/GovernedAction model the directive describes
  is already in this repo and just needs UI surfacing

Everything else in the 15-objective directive is real work but
**none of it is the next live blocker**. They're queued behind this
slice.

## 7. Files this session will touch

- `apps/api/src/services/otzar/proposed-action-extractor.ts` (NEW) —
  pure helper that detects the Phase 1207 canonical draft shape and
  returns `{ proposed_action: {...} } | null`
- `apps/api/src/services/otzar/otzar.service.ts` (MOD) — call the
  extractor on the LLM response and include `proposed_action` in
  `ConductSessionSuccess`
- `tests/unit/otzar-proposed-action-extractor.test.ts` (NEW) —
  pure-function tests for the extractor
- `otzar-control-tower/src/components/otzar/ProposedActionCard.tsx`
  (NEW) — Send/Don't-send/Edit buttons
- `otzar-control-tower/src/pages/app/ActionCenter.tsx` (NEW) — viewer's
  pending + approved actions
- `otzar-control-tower/src/pages/app/Inbox.tsx` (NEW) — viewer's
  Notification rows
- `otzar-control-tower/tests/unit/proposed-action-card.test.tsx` (NEW)
- `otzar-control-tower/tests/unit/action-center.test.tsx` (NEW)

## 8. Final answer for the directive's "FINAL OUTPUT REQUIRED"

| Question | Answer |
| --- | --- |
| What was found | Foundation already has Action/ActionPolicy/AuditEvent/Notification/EscalationRequest substrate per ADR-0057. The directive's "GovernedAction" model is the existing `Action`. The "DMW" is the existing `Wallet` model. The "COSMP MemoryCapsule" already has the exact name. The gap is **UI surface + chat→Action wiring**, not new substrate. |
| What was implemented | Phase 1208 vertical slice (this session, in progress) — see §5 above. |
| Files changed | See §7. |
| Commands run | Audit greps over apps/ + packages/; reading schema.prisma; reading routes/actions.routes.ts + escalation.routes.ts; verifying merged PRs #304-#307 + #46-#50. |
| Tests/typechecks/build result | Will report inline at slice completion. |
| What works end-to-end now | The four items in §1. |
| What remains blocked | API keys not relevant to this slice (Anthropic key already loaded; demo seed already populated). |
| Exact next command to run locally | `cd niov-foundation && bash scripts/start-demo-api.sh` (already running on this branch's code; will restart after the slice lands). Then open Otzar.app + ask Sadeil to send David a note + see the approval card + click Send + audit fires. |
| Demo credentials | Any `@niovlabs.com` from §1 with `LocalTest-SafePassword-123!`. |
| Risks | The extractor is regex-based; if the LLM ever drifts from the Phase 1207 canonical shape, the inline approval card won't render. Mitigated by an explicit Phase 1207 prompt instruction + a fallback to "no proposed action" with normal chat text shown unchanged. |
