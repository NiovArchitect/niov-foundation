# Otzar Semantic Reconciliation (structural integrity pass)

Phase 1 inventory + canonical model spec. NOT a feature task. Audited
2026-06-16 across `niov-foundation` (backend) and `otzar-control-tower` (CT).

## Phase 1 — inventory of identity inconsistencies

### A. Identity resolution is fragmented (multiple independent paths)

Backend — each service rolls its own `entity_id → display_name` map; **no shared
helper**:
- `internal-message.service.ts` — `nameOf` map (getDirectMessageThread) +
  single `findUnique` (deliverHumanInternalMessage).
- `work-ledger.service.ts` — `nameOf` map (getTeamWork enrichment, 1285-G).
- `target-resolver.service.ts` — `resolveCollaborationTarget` (UUID + name).
- `authority-context.service.ts` — `resolveTargetInOrg`.
- `collaboration-workspace.service.ts` — `entityById` map.
- `collaboration-assignment-resolver.ts` — pure resolver over snapshots.

CT — independent identity paths:
- `target-resolution.ts` `resolveTarget` / `matchRoster` (roster match).
- `api.workOs.authorityContext` (server resolve).
- Server-provided fields rendered as-is.
- Inline `?? "fallback"` chains scattered per surface.

### B. Divergent fallback strings for the same "unresolved" state

`"(unknown)"` (backend nameOf), `"a teammate"` (TeamWork), `"Unknown sender"` /
`"teammate"` (InboxThread), `"your teammate"` (AmbientOtzarBar), `"(unresolved)"`
/ `"(needs selection)"` (collaboration), `"you"` / `"(you)"` (self), **raw UUID**
(WorkLedgerItem View/Why) — the same logical state renders 8+ different ways.

### C. The one real UUID leak in normal UI

`WorkLedgerItem.tsx:173-175` — `entry.owner_display_name ?? entry.owner_entity_id`
(and requester/target). When the server didn't enrich names (My Work / Blind
Spots do not enrich; only Team Work does), the View/Why drawer shows a raw UUID.
This is the single concrete "UUID in the UI" defect. (Other `entity_id` uses are
React keys / `data-*` attributes — not user-visible labels.)

### D. Field-name drift for the same concept

`ledger_type` vs `type` · `thread_key` vs `thread_id` · `notification_id` vs
`message_id` · `display_name` vs `{role}_display_name` (sender_/owner_/
requester_/target_/member_/recipient_). Same concept, different keys per surface.

### E. No shared work-state event spine

There is **no** cross-surface event for work-state changes. Refresh is
module-local: `onChanged`/`onTracked` callbacks → per-component `reload()` /
`reloadThread()` / `loadAll()`. Shared mechanisms that DO exist: Zustand
(`presence`, `conversation`, `auth`), TanStack Query polling (analytics/health),
and `setInterval` polling (notifications 30s, approvals 60s, calendar 90s). So if
a ledger entry completes in My Work, Team Work does not auto-refresh.

### F. View/Why field coverage is scattered across 7 projection types

WorkLedgerView, ThreadMessageView, WaitingOnItem, ExecutionAttemptView,
SafeNotificationView, SafeActionView, SafeAuditEventView — each exposes a
different subset of {entity, work, communication, reasoning, provenance, proof}.
No single shared View/Why shape.

## Phase 2-3 — canonical model spec (target)

```
CanonicalEntity { entity_id; display_name; role; provenance; org_context; lifecycle_context }
UnifiedViewWhy  { entity; work{ledger_entry_id,status,type,priority};
                  communication{thread_id,message_id,direction};
                  reasoning{signal_type,extraction_source,confidence};
                  provenance{source_system,source_id} }
```

These become the single identity + diagnostic shapes all surfaces render from.

## Conflicts that require a Founder decision (RULE 1 + safety)

Two requested phases instruct **deletion/restructuring of already-working code**,
which RULE 1 ("Build forward only — ask before touching any prior section")
requires surfacing first, and one has a safety implication:

1. **Phase 4 "remove ALL fallbacks; throw explicit error if missing entity; no
   silent fallbacks."** The product's honest-degradation posture deliberately
   renders a graceful label (e.g. soft-deleted/cross-boundary entity → a neutral
   name) instead of crashing a thread/Work-Ledger render. Throwing on a missing
   entity would let one unresolved id break an entire surface — a regression in a
   governed product where entities are soft-deleted (RULE 10) and permission-
   scoped (RULE 0). **Recommended:** eliminate the *divergence* and the *UUID
   leak* — collapse to ONE canonical, clearly-labelled fallback + a single
   resolver — rather than throwing. (Unifies the model; stays safe.)

2. **Phase 5 "single WorkStateChanged event; remove ad-hoc refresh / local UI
   update / module-specific sync."** Replacing every validated module-local
   refresh (1285-E/G) with an event bus is a large restructure of working code.
   Note some "refresh" is legitimate polling (notifications/approvals) that is
   not a work-state event and should stay. **Recommended:** ADD a shared
   work-state event channel (additive) and migrate surfaces onto it incrementally
   behind the existing callbacks, rather than ripping out working refresh in one
   pass.

## Recommended execution (build-forward; no big-bang)

- **Safe now (no decision needed):** (a) ONE shared backend resolver
  `resolveEntityNames(ids) → Map` replacing the duplicated `nameOf` maps; (b) ONE
  canonical CT fallback label replacing the 8 divergent strings; (c) fix the
  WorkLedgerItem UUID leak (render the canonical label, never a UUID); (d) enrich
  My Work / Blind Spots projections with names like Team Work so all surfaces
  carry the same identity fields. Tests: identity consistency + no-UUID-leak.
- **Gated on decision #1:** graceful canonical fallback (recommended) vs throw.
- **Gated on decision #2:** additive `WorkStateChanged` channel + incremental
  migration (recommended) vs big-bang event-spine replacement.

## Decisions (Founder, 2026-06-16)

- **Phase 4 → Option 3 (canonical label + explicit `unresolved` flag), enforced
  as ONE global identity contract:** never render a raw UUID; never crash a
  surface on missing identity; never silently drop; ALWAYS return a
  CanonicalEntity (unresolved → `display_name: "Unknown entity"`, `role: system`,
  `unresolved: true`, `provenance: ui_inferred`, `entity_id` for traceability
  only). Missing entity is a first-class state, not an exception.
- **Phase 5 → Option 1 (additive `WorkStateChanged` channel, incremental
  migration):** add the channel now; keep existing callbacks/reload/polling;
  migrate surfaces one at a time behind the working path; remove a local path
  only after its event path is proven. Event vocabulary: MESSAGE_CREATED,
  THREAD_UPDATED, LEDGER_UPDATED, TASK_COMPLETED, NOTIFICATION_CREATED,
  SIGNAL_TRACKED, WAITING_ON_CHANGED.

## Status

Phase 1 audit: COMPLETE. Slice **1285-H** LANDED the contract foundation:
- Backend single resolver `resolveEntityNames` (canonical "Unknown entity" +
  `unresolved`); adopted in `getTeamWork` + `getMyWork` (both surfaces now carry
  identical identity fields).
- CT `canonical-entity.ts` (`toCanonicalEntity` / `entityLabel` / UNRESOLVED_LABEL)
  + WorkLedgerItem UUID-leak FIXED + divergent fallbacks unified (TeamWork,
  InboxThread, team-waiting-on) to the canonical label.
- CT `work-state.ts` additive `WorkStateChanged` channel + `useWorkStateChanged`;
  emit on track-signal (SIGNAL_TRACKED/WAITING_ON_CHANGED) + mark-complete
  (TASK_COMPLETED/LEDGER_UPDATED/WAITING_ON_CHANGED); subscribed in My Work +
  Team Work (auto cross-surface refresh). Existing callbacks/polling untouched.

Remaining (next slices, build-forward): adopt the resolver in the remaining
backend services (internal-message thread, collaboration-workspace, target/
authority resolvers) + remaining CT fallbacks (AmbientOtzarBar "your teammate",
CollaborationWorkspaceDetail "(unresolved)"); migrate more surfaces onto
WorkStateChanged (message send/reply, People cockpit) and retire local paths
once proven; converge the 7 projection types onto UnifiedViewWhy.
