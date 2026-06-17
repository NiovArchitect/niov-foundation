# Otzar UI Exposure Gate: Intentional Visibility, Ambient by Default

Otzar is an ambient Work OS. It must stay **calm, minimal, and powerful** —
reduce visible clutter while ensuring every important capability is reachable at
the right moment, by the right person, in the right context.

**The rule is NOT "make every backend capability visible."** The rule is: every
backend route/service/state/action has an **intentional exposure decision**, and
no user-facing work surface is **accidentally** unreachable. (That second half is
the defect Phase 1285-I fixed: My Work / Team Work were user-facing validation
surfaces whose routes existed but had no nav entry.)

## Exposure modes

1. **PRIMARY_NAV** — main sidebar/tab; users access it directly + repeatedly.
2. **CONTEXTUAL_SURFACE** — not in nav; appears inside the relevant object/flow.
3. **AMBIENT_ONLY** — runs in the background; surfaces only when it matters.
4. **CHAT_ACCESSIBLE** — not a tab; Otzar answers/acts when asked.
5. **ADMIN_ONLY** — visible only with authority (`can_admin_org`).
6. **PROOF_ONLY** — visible via View/Why, audit, or evidence panels.
7. **SYSTEM_INTERNAL_ONLY** — never directly exposed (diagnostics aside).
8. **COMING_NEXT_DISABLED** — visible but clearly disabled; never fake.
9. **DEPRECATED_OR_REMOVE** — remove/hide; no dead buttons.

## Rules

- A. Do not expose everything — stay ambient.
- B. Do not hide user-facing work by accident — if it's needed to complete or
  validate a loop, it must be reachable.
- C. Navigation is reserved for durable work surfaces, not a backend dump.
- D. Contextual actions appear where they're useful (thread actions in threads,
  work actions in My Work, relationship actions in the cockpit).
- E. Ambient systems don't become tabs unless users need control.
- F. Every visible affordance must advance work — no dead buttons, no fake AI.
- G. Every hidden capability must be intentionally classified (AMBIENT_ONLY /
  SYSTEM_INTERNAL_ONLY / PROOF_ONLY / CHAT_ACCESSIBLE / …).
- H. Every capability has at least one path: visible / contextual / chat / proof
  / admin / ambient — or a documented internal-only reason.
- I. No accidental hidden routes: a user-intended route in `App.tsx` needs a nav,
  contextual, or chat entry — or a documented reason why not.
- J. No accidental UI-only affordances: a button has a real action or is clearly
  disabled.

## Classification (current surfaces + capabilities)

| Capability / affordance | Backend | UI path | Exposure mode | Who | Status |
| --- | --- | --- | --- | --- | --- |
| My Work | `/work-os/my-work` | `/app/my-work` (sidebar) | PRIMARY_NAV | all | INTENTIONALLY_VISIBLE (1285-I, GUI_VALIDATED) |
| Team Work waiting-on | `/work-os/team-work` | `/app/team-work` (sidebar, adminOnly) | ADMIN_ONLY (primary) | manager/admin | INTENTIONALLY_ADMIN_ONLY (1285-I, GUI_VALIDATED) |
| People & Collaboration | org/collab | `/app/collaboration` | PRIMARY_NAV | all | INTENTIONALLY_VISIBLE |
| Action Center | actions | `/app/action-center` | PRIMARY_NAV | all | INTENTIONALLY_VISIBLE |
| Add to Work Ledger | `/work-os/threads/messages/:id/track-signal` | ThreadSignalChip | CONTEXTUAL_SURFACE | participants | INTENTIONALLY_CONTEXTUAL |
| Mark complete | `PATCH /work-os/ledger/:id` | WorkLedgerItem (owner) | CONTEXTUAL_SURFACE | owner/manager | INTENTIONALLY_CONTEXTUAL |
| Reply / send internal note | `/work-os/internal-messages` | InboxThread / PersonCockpit | CONTEXTUAL_SURFACE | participants | INTENTIONALLY_CONTEXTUAL |
| View / Why (work + message proof) | projections + execution-attempts | WorkLedgerItem drawer, thread message | PROOF_ONLY / CONTEXTUAL_SURFACE | participants | INTENTIONALLY_CONTEXTUAL (1285-J unifies) |
| View / Why (notification) | SafeNotificationView + route | NotificationBell "Why" disclosure | CONTEXTUAL_SURFACE / PROOF_ONLY | recipient | INTENTIONALLY_CONTEXTUAL (1285-L) |
| View / Why (governed action) | SafeActionView (safe fields only) | Action Center "View / Why" disclosure | CONTEXTUAL_SURFACE / PROOF_ONLY (approver-visible) | approver | INTENTIONALLY_CONTEXTUAL (1285-L; requester/target/policy-envelope stay governed) |
| View / Why (Comms follow-up) | CommsSuggestedAction (source/confidence/extraction) | Comms FollowUpCard "Why" disclosure | CONTEXTUAL_SURFACE / PROOF_ONLY | operator | INTENTIONALLY_CONTEXTUAL (1285-L) |
| Waiting-on / thread queries | `/work-os/waiting-on`, `/threads/with` | Otzar chat (AmbientOtzarBar) | CHAT_ACCESSIBLE | participants | INTENTIONALLY_VISIBLE (chat) |
| Signal extraction | Python `/jobs/extract-work-signals` + deterministic | surfaces as the chip | AMBIENT_ONLY (+ CONTEXTUAL via chip) | n/a | INTENTIONALLY_AMBIENT |
| Python enrichment | `python-enrichment.service` | View/Why only | AMBIENT_ONLY / PROOF_ONLY | n/a | INTENTIONALLY_AMBIENT |
| BEAM watcher evaluation | coordination/watchers | View/Why only (today) | AMBIENT_ONLY | n/a | INTENTIONALLY_AMBIENT |
| WorkStateChanged events | CT `work-state.ts` | none (drives refresh) | AMBIENT_ONLY | n/a | INTENTIONALLY_AMBIENT |
| resolveEntityNames | `identity/resolve-entities` | none | SYSTEM_INTERNAL_ONLY | n/a | INTENTIONALLY_INTERNAL |
| identity resolution / canonical labels | resolver + CT canonical-entity | renders names everywhere | SYSTEM_INTERNAL_ONLY (mechanism) | n/a | INTENTIONALLY_INTERNAL |
| source_message_id / extraction_source / policy reason / execution attempts / correction history | projections + audit | View/Why panels | PROOF_ONLY | participants/admin | INTENTIONALLY_CONTEXTUAL (1285-J) |
| Ask your Twin (self) | governed conductSession + COE | My Twin "Ask your Twin" box | CONTEXTUAL_SURFACE | all (self-scoped) | LIVE (1285-R; Work-OS questions route deterministically; governed self answer) |
| Ask another person's Twin | (no cross-entity contract) | disabled-honest → Collaboration | COMING_NEXT_DISABLED | all | INTENTIONALLY_DISABLED (not fake; no impersonation) |
| org diagnostics / audit verify | audit/verify-chain | admin surfaces | ADMIN_ONLY / PROOF_ONLY | admin/regulator | INTENTIONALLY_ADMIN_ONLY |
| internal event bus / raw BEAM / raw Python jobs / token-session mechanics | various | none | SYSTEM_INTERNAL_ONLY | n/a | INTENTIONALLY_INTERNAL |
| Blind Spots watcher feed | `/work-os/blind-spots` (+ watcher routes TBD) | `/app/blind-spots` | PRIMARY_NAV (feed) / AMBIENT (watchers) | all (own) / admin | NEEDS decision (backlog #5/#6) |
| BEAM watcher routes (GET/PATCH) | (not built) | none | AMBIENT_ONLY + ADMIN_ONLY control | admin | COMING_NEXT (backlog #6) |
| async Python enrichment | (sync today) | none | AMBIENT_ONLY | n/a | backlog #9 |

## Doctrine summary

Otzar should feel **simple on the surface and powerful underneath**. The goal is
the *right visibility at the right moment* — not more UI. If the backend can do
something the user needs but cannot find, it is not done. If the user does not
need direct control, keep it ambient/contextual. If the UI shows something that
doesn't advance work, remove it, disable it clearly, or wire it properly.
