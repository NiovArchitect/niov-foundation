# Section 7 — Full Audit Viewer

> Detailed canonical record for production Section 7. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Operator + admin + regulator-facing surface to read the
append-only audit chain with hash-chain integrity verification,
per-actor / per-target filtering, scope-respecting projection,
and (in future waves) export. Per ADR-0002 the audit chain is
sacrosanct; this section adds the read surface, never the write
surface.

## Current status (PARTIAL — Wave 1 LIVE)

**Read substrate + unified self-scope viewer LIVE per PR #60.**
Foundation primitives (`queryAuditEvents`, `verifyAuditChain`,
`MAX_AUDIT_EVENTS_PAGE_SIZE = 100`, `writeAuditEvent` with
per-chain advisory locks, BEFORE DELETE trigger, hash chain) are
LIVE in `packages/database/src/queries/audit.ts`. Wave 1 added
the per-caller unified read surface at `/api/v1/audit/*`; admin
+ regulator scopes + export + Control Tower UX are forward-
substrate (Waves 2-6).

## What is live

### Wave 1 (PR #60) — unified self-scope audit viewer

- `GET /api/v1/audit/events` — bearer + `read`; self-scope
  (`actor_entity_id == callerEntityId`); pagination clamped to
  `[1, 100]` default 50; filters: `event_type` +
  `target_entity_id` + `target_capsule_id` + `outcome` +
  `start_time` + `end_time`; SAFE projection.
- `GET /api/v1/audit/events/:id` — bearer + `read`; single-event
  drilldown with `previous_event` + `next_event` chain references
  (audit_id + event_hash + timestamp only; scoped to caller's
  chain). Enumeration-safe 404 collapses cross-actor + unknown id.
- `GET /api/v1/audit/verify-chain` — bearer + `read`; exposes
  the LIVE `verifyAuditChain` primitive at HTTP; returns
  `{ valid, total_events, broken_at }`.
- Read-audit emission: every GET fires `ADMIN_ACTION` audit on
  the caller's chain with `details.action` set to one of
  `AUDIT_VIEW_LIST` / `AUDIT_VIEW_EVENT` / `AUDIT_VIEW_VERIFY_CHAIN`.
  **No new audit literal**; reuses the canonical `ADMIN_ACTION`
  literal + `details.action` discriminator per the `CONSOLE_READ`
  precedent at `console.routes.ts`.

### Pre-Wave-1 primitives (`packages/database/src/queries/audit.ts`)

- Append-only `AuditEvent` table with BEFORE DELETE trigger
  enforcing RULE 10 + ADR-0002.
- Hash-chain integrity (`event_hash` + `previous_event_hash` +
  `verifyAuditChain`); SHA-256 over canonical record.
- Per-chain advisory locks via `pg_advisory_xact_lock` so
  concurrent writers never link to the same previous event.
- 5 system principals (`SCHEDULER`, `BOOT_VALIDATOR`,
  `COMPLIANCE_SEEDER`, `FEEDBACK_LOOP`, `COSMP_ROUTER`).
- `queryAuditEvents` filter / paginate primitive.
- `getLatestEventHash` chain-head peek.

### Pre-existing admin-tier audit routes (kept LIVE)

- `GET /api/v1/org/audit` (`org.routes.ts:1316`) —
  `can_admin_org`-gated; org-scope OR-fence (actor IN scope OR
  target IN scope) with optional `event_type` / `actor_entity_id`
  / `target_entity_id` filters AND-narrow; pagination capped.
  Cross-org leak guard tested at `admin-routes.test.ts:454`.
- `GET /api/v1/platform/audit` (`platform.routes.ts:215`) —
  `can_admin_niov`-gated; all-orgs read; `skip` + `take` only.
- `GET /api/v1/console/audit` (`console.service.ts:listConsoleAudit`)
  — `can_admin_niov`-gated; richer filter surface
  (`event_type` / `actor_entity_id` / `target_entity_id` /
  `outcome` / `from` / `to`); emits the `ADMIN_ACTION`
  `CONSOLE_READ` audit on every read.

## What is NOT live

- **Org-admin scope on the unified `/api/v1/audit/events`**
  surface (Wave 2). The existing `/org/audit` route already
  serves org-admin readers; Wave 2 will surface the same
  capability through the unified Wave 1 entry point so consumers
  can use a single coherent URL family.
- **Niov-admin scope on the unified surface** (Wave 3). Same
  parallel to Wave 2, replacing the older `/platform/audit` +
  `/console/audit` patterns.
- **Export surface** (Wave 4) — CSV / NDJSON streaming for
  regulator-tier review; rate-limited.
- **Regulator-tier audit access** (Wave 5) — through the
  `REGULATOR` principal + `LawfulBasis` attestation per
  ADR-0036.
- **Control Tower audit-viewer UX** (Wave 6) — frontend lives
  in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower); out of Foundation scope.
- **Cross-chain hash verification** beyond `actor_entity_id`
  chains — `verifyAuditChain` currently walks one entity's
  chain; system-principal chains + the legacy `SYSTEM_CHAIN_KEY`
  chain require their own verification surface (future wave).

## RULE 13 disclosures specific to Section 7

- The audit chain is the most-privileged read surface; the
  viewer MUST enforce TAR-authoritative scope checks at every
  request. Wave 1 self-scope queries narrow by
  `actor_entity_id == callerEntityId` from `req.auth.entity_id`
  (set by the LIVE `requireAuth` middleware); stale token
  claims cannot widen scope.
- Audit `details` ARE projected raw at read time — relies on
  `writeAuditEvent`'s SAFE-allowlist at write time per the
  no-leak guard (`tests/unit/no-leak-guard.test.ts`). The
  read-tier projection re-asserts the no-leak contract as
  defense-in-depth per ADR-0002 + RULE 13.
- Single-event drilldown's `previous_event` + `next_event`
  refs are scoped to the caller's own `actor_entity_id` chain
  by query construction. A caller cannot use them to walk
  across another entity's chain.
- Enumeration-safe 404: cross-actor + unknown audit_id collapse
  to `AUDIT_EVENT_NOT_FOUND` — a non-owner cannot probe for
  which audit_ids exist.
- Read-audit emission: every GET fires its own `ADMIN_ACTION`
  audit row. Watching the watchers — operators auditing the
  audit chain are themselves auditable.
- Regulator access to the audit chain MUST go through the
  REGULATOR principal substrate per ADR-0036 (Lawful-Basis
  Attestation), not the standard org-admin path. Wave 5 will
  add that route family.

## Landed PRs

| PR | Commit | Description |
|---|---|---|
| [#60](https://github.com/NiovArchitect/niov-foundation/pull/60) | `10155b9` | **Section 7 Wave 1 unified self-scope audit-events viewer** — NEW `apps/api/src/services/audit/audit-view.service.ts` (`listAuditEventsForCaller` + `getAuditEventForCaller` + `verifyAuditChainForCaller` + `validateListAuditEventsQuery` + `SafeAuditEventView` + `SafeAuditEventDetailView` + 9 types) + NEW `apps/api/src/routes/audit.routes.ts` (3 routes). Self-scope only; SAFE projection; enumeration-safe 404; read-audit emission via existing `ADMIN_ACTION:AUDIT_VIEW_*`. 19 NEW integration tests + 23/23 existing audit unit regression preserved + 89/89 admin-routes / console-routes / audit-event-id-surfacing / notification-inbox / action-lifecycle regression preserved. No schema; no new audit literals; no new RULE / ADR landings. Substrate-coherent extension of LIVE audit primitives. |

## Next slices (priority order)

> All RULE 20-clean for autonomous execution (no new ADR / no
> new audit literal). Each remains gated only by operator
> direction on sequencing.

1. **Section 7 Wave 2 — org-admin scope on the unified
   surface.** Add `?scope=org` (or a dedicated route family) so
   `can_admin_org` callers can read every audit row in their
   org via the unified entry point. Mirrors the existing
   `/org/audit` cross-org leak guard pattern (tested at
   `admin-routes.test.ts:454`).
2. **Section 7 Wave 3 — niov-admin scope** on the unified
   surface (replaces `/platform/audit` + `/console/audit`
   patterns; same SAFE projection contract).
3. **Section 7 Wave 4 — export surface** (CSV / NDJSON
   streaming for regulator-tier review). Rate-limited per
   the existing rate-limit middleware precedent; chunked
   response so a 100 K-row export doesn't OOM Fastify.
4. **Section 7 Wave 5 — regulator-tier audit access** via
   ADR-0036 REGULATOR + LawfulBasis attestation. Each
   regulator-tier read requires an ACTIVE LawfulBasis row
   per the existing regulator.routes.ts pattern.
5. **Section 7 Wave 6 — Control Tower audit-viewer UX**
   (out of Foundation scope; tracked here for cross-repo
   awareness).

## Risks / forward-substrate

- The audit chain contains sensitive routing identifiers
  (entity_ids, capsule_ids); every read surface MUST scope
  by the caller's authorized identity surface. Wave 1
  enforces this at the service tier (self-scope only).
- Hash-chain verification is computationally expensive at
  scale; Wave 1's `verify-chain` walks the caller's full
  chain on every call. Future waves SHOULD paginate
  verification windows for chains > 10 K events; current
  Foundation deployments are well below that threshold so
  the simpler implementation is correct for sub-phase 1.
- Read-audit emission means every viewer GET creates an
  audit row. This is intentional (RULE 4 watching-the-
  watchers) but means the audit table grows at 2x the rate
  it would without the viewer surface. Future operational
  retention posture per ADR-0002 `AUDIT_RETENTION_POSTURE.md`.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
