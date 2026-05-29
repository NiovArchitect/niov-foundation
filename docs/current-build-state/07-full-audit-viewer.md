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

## Current status (PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 LIVE)

**Read substrate + unified self / org-admin / niov-admin viewer
+ NDJSON export + regulator-tier access LIVE per PRs #60 + #62 +
#64 + #66 + #68.** Foundation primitives LIVE. Wave 1 added the
per-caller unified read surface at `/api/v1/audit/*`; Wave 2
added the `scope=org` admin path; Wave 3 added the
`scope=platform` niov-admin path; Wave 4 added the NDJSON export
at `/api/v1/audit/events/export`; Wave 5 added the regulator-
tier audit access at `/api/v1/audit/events/regulator-view` via
the ADR-0036 LawfulBasis attestation pattern. **Section 7
Foundation backend is production-grade complete for the
canonical self / org-admin / niov-admin / regulator scope
matrix.** Control Tower UX + cross-chain verify-chain + CSV
export remain forward-substrate (out of Foundation scope or
optional follow-on).

## What is live

### Wave 5 (PR #68) — regulator-tier audit access via ADR-0036

- `GET /api/v1/audit/events/regulator-view?lawful_basis_id=...&...`
  — bearer + `read`. `lawful_basis_id` is a REQUIRED UUID.
  Service calls into the LIVE `getActiveLawfulBasisForRegulator`
  primitive at `packages/database/src/queries/lawful-basis.ts`
  for the 9-condition enforcement check (basis exists + linked
  to grant audit + time window valid + grant audit valid + hash
  chain matches + target_entity_id matches the caller +
  not revoked). On success queries `audit_events` rows narrowed
  to `lawful_basis_id = :basis_id` with SAFE projection +
  filter AND-narrow + pagination cap.
- 8 distinct LawfulBasis enforcement failure codes mapped to
  HTTP:
    - `LAWFUL_BASIS_NOT_FOUND` → 404
    - `LAWFUL_BASIS_NOT_YET_VALID` / `LAWFUL_BASIS_EXPIRED` /
      `LAWFUL_BASIS_REVOKED` / `LAWFUL_BASIS_HASH_MISMATCH` /
      `REGULATOR_TARGET_MISMATCH` → 403
    - `LAWFUL_BASIS_NOT_LINKED_TO_AUDIT` /
      `INTERNAL_ENFORCEMENT_ERROR` → 500 (integrity)
- Read-audit emission via `details.action = "AUDIT_VIEW_REGULATOR"`
  with `lawful_basis_id` + `result_count` + `filter_keys`.
  **No new audit literal**; still on the canonical
  `ADMIN_ACTION`.
- Cross-basis isolation invariant: regulator A's view never
  surfaces regulator B's rows; tested directly.
- No new ADR / no new RULE / no new schema / no new audit
  literal. Wave 5 is a pure read-only consumer of the LIVE
  ADR-0036 LawfulBasis attestation substrate.

### Wave 4 (PR #66) — NDJSON audit export surface

- `GET /api/v1/audit/events/export?scope=self|org|platform&format=ndjson&max_rows=...&...`
  — bearer + `read`. Reuses the same `scope=self|org|platform`
  gate as the list route via the NEW shared
  `resolveAuditScopePredicate` helper. Hard cap
  `EXPORT_AUDIT_EVENTS_MAX_ROWS=10000` + optional smaller
  operator-controlled `max_rows`. format only accepts `"ndjson"`
  at sub-phase 1 (CSV is forward-substrate). Returns
  `application/x-ndjson; charset=utf-8` with one
  `SafeAuditEventView` JSON value per line + `\n` terminator;
  no trailing newline. Response headers `x-audit-row-count`,
  `x-audit-truncated`, `x-audit-scope` so streaming clients
  can detect truncation + scope without parsing the body.
- Read-audit emission via `details.action = "AUDIT_VIEW_EXPORT"`
  with `row_count` + `format` + `scope` + `max_rows` +
  `truncated` + `filter_keys` (+ `org_entity_id` when
  `scope=org`). **No new audit literal**.
- `truncated=true` tells the caller they hit the cap so they
  can re-issue with a narrower time-range.

### Wave 3 (PR #64) — niov-admin/platform scope on the unified viewer

- `GET /api/v1/audit/events?scope=platform` — bearer + `read`;
  TAR-authoritative `can_admin_niov` gate (403
  `PLATFORM_SCOPE_FORBIDDEN` on miss); unfenced cross-org
  visibility — every audit_events row matches. Filters still
  AND-narrow.
- `GET /api/v1/audit/events/:id?scope=platform` — bearer +
  `read`; same admin gate; unconstrained row lookup (any
  audit_id viewable); chain refs walk the full timeline.
  Enumeration-safe 404 on unknown UUIDs preserved.
- Read-audit emission for platform-scope reads uses
  `details.action` ∈ `{ AUDIT_VIEW_PLATFORM_LIST,
  AUDIT_VIEW_PLATFORM_EVENT }`. **No new audit literal**;
  still on the canonical `ADMIN_ACTION`.
- `GET /api/v1/audit/verify-chain` — **UNCHANGED**. Self-only
  across all 3 waves (cross-chain verification = leakage / perf
  risk; forward-substrate).

### Wave 2 (PR #62) — org-admin scope on the unified viewer

- `GET /api/v1/audit/events?scope=org` — bearer + `read`;
  TAR-authoritative `can_admin_org` gate (403
  `ORG_SCOPE_FORBIDDEN` on miss); caller's org resolved via
  `getOrgEntityId` (404 `NOT_IN_ANY_ORG` on orgless admin); OR-
  fence (actor OR target IN `[org_entity_id, ...active member
  child_ids]`); cross-org leak guard tested. Filters AND-narrow
  under org-scope (Prisma `AND[]` composition); cannot widen
  past the fence.
- `GET /api/v1/audit/events/:id?scope=org` — bearer + `read`;
  same admin gate + org-scope fence runs BEFORE the row lookup
  so cross-org `audit_id` returns enumeration-safe 404
  `AUDIT_EVENT_NOT_FOUND` (existing row, but not in caller's
  scope; indistinguishable from "doesn't exist"). prev/next
  chain refs scoped to the same fence.
- Read-audit emission for org-scope reads uses
  `details.action` ∈ `{ AUDIT_VIEW_ORG_LIST,
  AUDIT_VIEW_ORG_EVENT }` and carries the resolved
  `org_entity_id` for forensic queries. **No new audit
  literal**; still on the canonical `ADMIN_ACTION`.
- `GET /api/v1/audit/verify-chain` — **UNCHANGED**. Self-only
  at Wave 2 per Founder direction (cross-chain verification =
  leakage / perf risk; forward-substrate).

### Wave 1 (PR #60) — unified self-scope audit viewer

- `GET /api/v1/audit/events` — bearer + `read`; self-scope by
  default (`actor_entity_id == callerEntityId`); pagination
  clamped to `[1, 100]` default 50; filters: `event_type` +
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

## What is NOT live (intentional forward-substrate)

- **CSV export** — NDJSON Wave 4 precedent established
  (PR #66); CSV may follow if a downstream consumer requires
  it. Bounded-size + safe by the same cap discipline.
- **Control Tower audit-viewer UX** — frontend lives
  in [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower);
  **out of Foundation scope** (per Founder direction the
  Foundation owns the read substrate + scopes + projection
  contract; the Control Tower consumes them through a thin
  presentational layer in its own repo).
- **Cross-chain hash verification** beyond `actor_entity_id`
  chains — `verifyAuditChain` currently walks one entity's
  chain; system-principal chains + the legacy `SYSTEM_CHAIN_KEY`
  chain require their own verification surface (future wave).
- **Org-admin / platform / regulator verify-chain** — all 5
  waves deliberately left `verify-chain` self-only per Founder
  direction. Walking every member's (or every entity's, or
  every basis's) chain in one call has perf risk; accepting an
  `entity_id` query param has mild leakage risk (would surface
  whether a given entity has a chain). Separate forward-
  substrate slice with its own QLOCK + design review.
- **REGULATOR_ACCESS_EXPIRED audit-row emitter** — the
  enforcement check denies expired bases at read time; the
  *proactive* emission of an `REGULATOR_ACCESS_EXPIRED` row at
  the moment a basis crosses `valid_until` is reserved per
  ADR-0036 Sub-decision 4 and would be driven by a SCHEDULER
  principal sweep. Forward-substrate.

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
| [#62](https://github.com/NiovArchitect/niov-foundation/pull/62) | `026300f` | **Section 7 Wave 2 org-admin scope on /api/v1/audit/events + /:id** — NEW `AuditViewScope` type + `callerHasAdminCapability` + `resolveOrgScopeVector` helpers; `validateListAuditEventsQuery` accepts `scope` enum; `listAuditEventsForCaller` + `getAuditEventForCaller` branch on scope; `scope=org` pre-flights `can_admin_org` (403 `ORG_SCOPE_FORBIDDEN`) + org resolution (404 `NOT_IN_ANY_ORG`) BEFORE row lookup; OR-fence + AND-narrow Prisma composition; enumeration-safe 404 on cross-org detail. `verify-chain` UNCHANGED (self-only per Founder direction). 14 NEW integration tests + Wave 1 19/19 regression preserved + audit unit 23/23 preserved + 116/116 combined regression across 6 audit-touching files. No schema; no new audit literals; no new RULE / ADR landings. Substrate-coherent extension of Wave 1 surface. |
| [#64](https://github.com/NiovArchitect/niov-foundation/pull/64) | `e914480` | **Section 7 Wave 3 niov-admin/platform scope on unified audit viewer** — `AuditViewScope` extended to `self|org|platform`; NEW `callerHasNiovAdminCapability` TAR-authoritative helper; `listAuditEventsForCaller` + `getAuditEventForCaller` branch on platform scope with empty fence (every audit_events row visible across orgs); filters still AND-narrow; enumeration-safe 404 on unknown UUID preserved. `verify-chain` UNCHANGED (self-only carries over from Wave 2). 10 NEW integration tests + Wave 1+2 regression preserved + 96/96 combined Section 7 + admin-routes + console-routes regression. No schema; no new audit literals; no new RULE / ADR landings. Substrate-coherent extension of Waves 1+2. |
| [#66](https://github.com/NiovArchitect/niov-foundation/pull/66) | `f316a51` | **Section 7 Wave 4 NDJSON audit export surface** — NEW `EXPORT_AUDIT_EVENTS_MAX_ROWS=10_000` hard cap; NEW `resolveAuditScopePredicate` helper (pulled scope gate logic into one shared function consumed by list + export); NEW `validateExportAuditEventsQuery` validator (format=ndjson only at sub-phase 1; CSV forward-substrate); NEW `exportAuditEventsForCaller` function emits `ADMIN_ACTION:AUDIT_VIEW_EXPORT` audit; NEW `GET /api/v1/audit/events/export` route returns `application/x-ndjson` + `x-audit-row-count`/`x-audit-truncated`/`x-audit-scope` headers. Bounded by `max_rows + 1` take pattern for truncation detection. 13 NEW integration tests + 56/56 combined Section 7 regression preserved. No schema; no new audit literals; no new RULE / ADR landings. Substrate-coherent extension of Waves 1+2+3. |
| [#68](https://github.com/NiovArchitect/niov-foundation/pull/68) | `9ec214e` | **Section 7 Wave 5 regulator-tier audit access via ADR-0036** — NEW `validateListRegulatorAuditEventsQuery` validator (`lawful_basis_id` required UUID); NEW `listRegulatorAuditEventsForCaller` function calls into the LIVE `getActiveLawfulBasisForRegulator` 9-condition enforcement check at `packages/database/src/queries/lawful-basis.ts`; maps 8 LawfulBasis enforcement failure codes to HTTP (404 `NOT_FOUND` / 403 `EXPIRED` / `NOT_YET_VALID` / `REVOKED` / `HASH_MISMATCH` / `REGULATOR_TARGET_MISMATCH` / 500 integrity); on success queries `audit_events WHERE lawful_basis_id = :basis_id` + SAFE projection + AND-narrow filters + pagination cap. NEW `GET /api/v1/audit/events/regulator-view` route; emits `ADMIN_ACTION:AUDIT_VIEW_REGULATOR`. 12 NEW integration tests covering full 9-condition gate + cross-basis isolation + filter narrowing + happy path. No schema; no new audit literals; no new RULE / ADR landings. Pure read-only consumer of ADR-0036 LawfulBasis attestation substrate. |

## Production-grade-complete recommendation (Section 7 closeout)

Section 7 Foundation backend is **production-grade complete**
for the canonical 4-scope matrix (self / org-admin / niov-admin
/ regulator) across the 3 read shapes (list / single-event /
export) + self-only chain verification. All gates are TAR-
authoritative; filter composition is AND-narrow under all
scopes (never widens fences); enumeration-safe 404 collapses
cross-scope and unknown-id probes; SAFE projection re-asserts
the no-leak contract at read tier as defense-in-depth; every
read emits its own watching-the-watchers `ADMIN_ACTION` audit
row via existing `details.action` discriminators (no new audit
literals). Regulator access goes through ADR-0036 LawfulBasis
attestation, not the standard admin path.

**Recommended next production section: Section 4 — MCP /
Connectors.**

Rationale: of the 7 remaining sections, Section 4 is the
canonical home for external tool integrations
(Slack / email / SMS / push / Google Workspace / Microsoft /
Linear / Jira / Salesforce) that gate two downstream sections
(Section 2 external delivery + Section 9 Control Tower outbound)
and unblock both demo motion + customer onboarding paths. The
Wave 11 + 12 closeout of Section 2 explicitly left external
adapters as required forward-substrate; Section 7 Wave 5 just
confirmed the regulator-tier external-stakeholder read surface
is live and stable — both substrate ends are ready for the
adapter wave. Each adapter wave needs its own RULE 20 Founder
QLOCK + RULE 21 research arc; this recommendation is for
sequencing only, not autonomous execution.

Alternative next slices (not recommended for autonomous
execution — each is RULE 20-gated):

- **Section 1 Wave 3 — Otzar drift detection ADR.** Unblocks
  the proactive drift-prevention loop of Otzar; smaller scope
  than Section 4 but produces tighter customer-visible value
  per dev-hour.
- **GOVSEC.5 follow-on** — `requireAdminCapability` route-set
  throttle. Hardens the existing dual-control surface; smaller
  scope than Section 4 but security-relevant.
- **Section 9 backend contracts** — keeps the Control Tower
  consumption parity caught up with new Foundation surfaces;
  larger scope but no new product capability.

## Forward-substrate (RULE 20-clean; sequencing only)

1. **Section 7 forward-substrate — CSV export.** NDJSON
   Wave 4 precedent established; CSV may follow if a
   downstream consumer requires it.
2. **Section 7 forward-substrate — Control Tower audit-viewer
   UX** (out of Foundation scope; lives in
   [`otzar-control-tower`](https://github.com/NiovArchitect/otzar-control-tower)).
3. **Section 7 forward-substrate — org-admin / platform /
   regulator verify-chain.** All 5 waves deliberately left
   `verify-chain` self-only. Cross-chain verification has perf
   risk + mild leakage risk. Separate QLOCK + design review
   needed.
4. **Section 7 forward-substrate — proactive
   REGULATOR_ACCESS_EXPIRED emitter** via SCHEDULER sweep at
   `valid_until` crossing per ADR-0036 Sub-decision 4.

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
