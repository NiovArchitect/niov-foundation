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

## Current status (PRODUCTION-GRADE COMPLETE for Foundation backend scope — Waves 1+2+3+4+5 + Hardening Wave A + ADR-0071 cross-scope verify-chain LIVE)

**Read substrate + unified self / org-admin / niov-admin viewer
+ NDJSON export + CSV export + regulator-tier access +
cross-scope verify-chain LIVE per PRs #60 + #62 + #64 + #66 +
#68 + #76 (CSV) + #79 (REGULATOR_ACCESS_EXPIRED emitter) +
#132 (ADR-0071 cross-scope verify-chain).** **Section 7
Foundation backend is production-grade complete across all 4
read shapes (list / single-event / export / verify-chain) ×
4 scopes (self / org-admin / niov-admin / regulator).** The
canonical 4-scope matrix is now uniform — verify-chain joins
list/single/export at the cross-scope register per ADR-0071
+ Founder Option A clean break QLOCK 2026-05-31. Control
Tower UX remains forward-substrate (out of Foundation scope;
lives in `otzar-control-tower`).

## What is live

### ADR-0071 (PR #132 `ffc0548`; 2026-05-31) — cross-scope verify-chain (Option A clean break)

- `GET /api/v1/audit/verify-chain?scope=self|org|platform|regulator&subject_entity_id=…&lawful_basis_id=…&from=…&to=…&max_events=…`
  — bearer + `read`. Default `scope=self`. **Option A clean
  break** per Founder QLOCK 2026-05-31 (consumer-mapping
  evidence: zero external HTTP consumers + only the route's
  own integration test consumed prior `valid` / `total_events`
  / `broken_at` / `actor_entity_id` fields + aliases would
  have been semantically misleading because
  `total_events` / `checked_event_count` are not synonyms
  under windowed multi-chain scope).
- **NEW canonical response shape** (16 fields; no aliases):
  `ok` + `scope` + `verified` + `checked_event_count` +
  `chain_algorithm` (`"SHA-256/14-field-canonical-record"`) +
  `window_start` + `window_end` + `first_event_id` +
  `last_event_id` + `first_event_hash` + `last_event_hash` +
  `broken_at_event_id` + `failure_reason` (closed-vocab:
  `HASH_MISMATCH` / `PREVIOUS_LINK_MISMATCH` /
  `MISSING_PREVIOUS_EVENT` / `CANONICAL_RECORD_DRIFT`) +
  `lawful_basis_id` + `evidence_note` + `honest_note`. Old
  HTTP fields removed; **NOT aliased**.
- **Scope gates** (TAR-authoritative): `self` bearer +
  `read`; `org` requires `can_admin_org`; `platform` requires
  `can_admin_niov`; `regulator` requires ADR-0036 9-condition
  LawfulBasis enforcement via
  `getActiveLawfulBasisForRegulator` + REGULATOR target
  identity binding.
- **Window controls**: default 30-day window for `org` /
  `platform` when both `from`+`to` omitted; `regulator` window
  bounded by `LawfulBasis.valid_from`→`LawfulBasis.valid_until`;
  optional `subject_entity_id` narrows org/platform to a
  single chain (cross-org subject → enumeration-safe 404
  `SUBJECT_NOT_FOUND`); regulator scope FORBIDS
  `subject_entity_id` (the basis selects the events).
- **Perf cap**: `VERIFY_CHAIN_MAX_EVENTS = 10_000` mirroring
  `EXPORT_AUDIT_EVENTS_MAX_ROWS` precedent. Pre-flight
  `prisma.auditEvent.count` over scoped predicate enforces
  the cap before any chain walk; `WINDOW_TOO_LARGE` 400 on
  oversized window/missing narrowing.
- **Regulator §7.3 continuity verification**: reads prior
  row's `event_hash` only (one column projection) without
  surfacing data fields. `MISSING_PREVIOUS_EVENT` covers the
  invisible-predecessor case.
- **Closed-vocab failure codes**: `UNAUTHORIZED` 401 /
  `FORBIDDEN` 403 / `INVALID_SCOPE` 400 / `INVALID_FIELD` 400
  / `LAWFUL_BASIS_REQUIRED` 400 / `LAWFUL_BASIS_NOT_FOUND` 404
  / `LAWFUL_BASIS_EXPIRED` 403 / `LAWFUL_BASIS_NOT_YET_VALID`
  403 / `LAWFUL_BASIS_REVOKED` 403 /
  `LAWFUL_BASIS_HASH_MISMATCH` 403 / `REGULATOR_TARGET_MISMATCH`
  403 / `SCOPE_NOT_ALLOWED` 403 / `SUBJECT_NOT_FOUND` 404
  enumeration-safe / `WINDOW_TOO_LARGE` 400 /
  `CHAIN_VERIFICATION_FAILED`-as-200-with-`verified=false` /
  `INSUFFICIENT_DATA`-as-200-vacuous-success / `INTERNAL_ERROR`
  500.
- **Read-audit emission**: reuses existing
  `AUDIT_VIEW_VERIFY_CHAIN` literal with extended SAFE meta
  (`scope` + `verified` + `checked_event_count` + `window` +
  `lawful_basis_id` + `failure_reason`). **ZERO new audit
  literal.**
- **Internal Prisma primitive `verifyAuditChain(entity_id)`
  backward-compat preserved** — camelCase `valid` /
  `totalEvents` / `brokenAt` fields still present; window-
  aware variant additive only; the 7 in-tree call sites
  (session-lifecycle + session-idle + refresh-rotation +
  evidence-export + gateway + dandelion + audit unit tests)
  continue to work unchanged.
- **ZERO schema migration**.
- **Test counts**: 20 new integration tests
  (`tests/integration/audit-verify-chain-cross-scope.test.ts`)
  + 77 audit-viewer integration regression preserved + 40
  audit unit + 32 verify-chain-primitive-consumer regression
  all green.
- Closes **ADR-0070 §Forward queue item 1** at the canonical-
  execution register.

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
- `GET /api/v1/audit/verify-chain` — Wave-3-era stance: self-
  only; cross-chain verification was forward-substrate.
  **Superseded by ADR-0071** (PR #132 `ffc0548`; 2026-05-31)
  which extends verify-chain to the canonical 4-scope matrix
  (self / org / platform / regulator) at the cross-scope
  register. See the ADR-0071 section above for the canonical
  response shape + scope semantics.

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
  the LIVE `verifyAuditChain` primitive at HTTP. Wave-1-era
  response was `{ valid, total_events, broken_at }`;
  **superseded by ADR-0071** (PR #132 `ffc0548`; 2026-05-31)
  which replaces the response shape with the canonical
  `VerifyChainView` per Option A clean break. See the
  ADR-0071 section above for the canonical 4-scope matrix +
  16-field response shape.
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

### Hardening Wave D — proactive REGULATOR_ACCESS_EXPIRED emitter (PR #79; `dcff369`)

- `tickRegulatorAccessExpirySweep` at
  `apps/api/src/services/cosmp/regulator-expiry.service.ts`
  runs on the canonical Action scheduler cron host every 60
  seconds (offset 30s from the executor + expiry-sweep ticks
  per `apps/api/src/services/action/scheduler.ts:217-224`).
- Per tick: finds `LawfulBasis` rows where `valid_until <= now`;
  bounded batch (`REGULATOR_EXPIRY_SWEEP_BATCH = 50`; oldest-first
  by `valid_until ASC` for fairness); idempotent (skips any
  basis with an existing `REGULATOR_ACCESS_EXPIRED` audit row);
  supersession-aware (skips any basis with an existing
  `REGULATOR_ACCESS_REVOKED` row — REVOKED is the canonical
  terminal state).
- Emits one `REGULATOR_ACCESS_EXPIRED` audit row per matching
  basis with `actor_entity_id=null` + `system_principal=
  SYSTEM_PRINCIPALS.SCHEDULER` + `target_entity_id=<the regulator
  the grant was issued to>` + `lawful_basis_id` + `lawful_basis_chain_hash`
  (preserving the CAR Sub-box 3 sub-phase 4 hash-chain binding).
- Safe audit details only: `action=REGULATOR_ACCESS_EXPIRED` +
  `basis_id` + `valid_until` (ISO string). NEVER `basis_reference`
  or `jurisdiction_invoked` (those columns are accessible via
  authorized regulator-tier reads; redundant noise on the
  expiration row).
- Audit literal `REGULATOR_ACCESS_EXPIRED` was canonically
  reserved at CAR Sub-box 3 sub-phase 5 and is consumed here —
  **no new audit literal landed at Wave D**.
- 7 integration tests at
  `tests/integration/regulator-access-expired-sweep.test.ts`
  cover: happy path (SCHEDULER attribution + chain_hash carried +
  target_entity_id resolved); idempotency on re-sweep (no
  duplicate emission); supersession by REVOKED; not-yet-expired
  filter; custom `now` clock override deterministic-test seam;
  bounded batch.

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
- *(closed)* **REGULATOR_ACCESS_EXPIRED audit-row emitter** —
  this was previously listed as forward-substrate but LANDED
  at Hardening Wave D (PR #79 / commit `dcff369`). See
  "What is live" §Hardening Wave D below.

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
| [#79](https://github.com/NiovArchitect/niov-foundation/pull/79) | `dcff369` | **Hardening Wave D — proactive REGULATOR_ACCESS_EXPIRED emitter per ADR-0036 Sub-decision 4** — NEW `apps/api/src/services/cosmp/regulator-expiry.service.ts` with `tickRegulatorAccessExpirySweep` (idempotent + supersession-aware; bounded batch `REGULATOR_EXPIRY_SWEEP_BATCH=50`; oldest-first by `valid_until ASC`); cron-scheduled every 60s on the Action scheduler host (`scheduler.ts:217-224`); emits one `REGULATOR_ACCESS_EXPIRED` audit per matching basis with SCHEDULER attribution + chain_hash carried + safe details only (action + basis_id + valid_until). Closes the previously forward-queued `REGULATOR_ACCESS_EXPIRED audit-row emitter` non-goal from Section 7's "What is NOT live" list. Reuses the canonical `REGULATOR_ACCESS_EXPIRED` audit literal reserved at CAR Sub-box 3 sub-phase 5 — **no new audit literal landed**. No schema migration. 7 NEW integration tests covering happy path + idempotency + REVOKED supersession + not-yet-expired filter + custom `now` clock override deterministic-test seam + bounded batch. |
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

## CT consumer LIVE 2026-06-01 (Section 7 D2)

**Control Tower consumer LANDED 2026-06-01** at
`[CT-SECTION-7-AUDIT-VIEWER-D2]` (otzar-control-tower PR
[#10](https://github.com/NiovArchitect/otzar-control-tower/pull/10)
`ad7cb38`). Replaces the long-standing `/security-audit`
Placeholder with a real customer-facing Security & Audit screen
consuming Foundation Section 7 Wave 1 self-scope reads:

- `GET /api/v1/audit/events` — paginated `SafeAuditEventView[]`
- `GET /api/v1/audit/events/:id` — `SafeAuditEventDetailView`
  with `previous_event` + `next_event` chain refs

CT type-mirror surface: NEW `SafeAuditEventView` (legacy
`AuditEvent` + 5 Section 7 chain / provenance fields:
`previous_event_hash`, `event_hash`, `lawful_basis_id`,
`lawful_basis_chain_hash`, `jurisdiction`) +
`AuditEventChainRef` (compact `audit_id` + `event_hash` +
`timestamp` only — NEVER the full neighbour body) +
`SafeAuditEventDetailView` (extends `SafeAuditEventView` with
chain refs) + `AuditViewScope` + 4 response envelopes.

CT page surface: paginated list card (skeleton loading /
honest empty-state / safe-error block + Retry / `PAGE_SIZE
= 25` / pager with total event count) + side panel that
shows event detail on row click (full safe-metadata surface
+ chain integrity section surfacing `event_hash` +
`previous_event_hash` + prev/next chain refs + conditional
lawful basis section when basis fields present).

NEW `api.audit.*` namespace (list + detail) distinct from
legacy `api.org.audit.list` (kept verbatim for Home Recent
Activity / 12B.2 consumers).

CT test surface: 15 NEW Wave 7-D2 tests (was 129 → 144 CT
total; Wave 10 Agent Playground 129/129 regression
preserved) covering nav + page shell + list view (5) +
detail panel (4) + forbidden-copy + no-leak guards (2).
17 forbidden ADR-0077-family UI copy substrings + 11
raw-payload / secret / chain-of-thought tokens asserted
absent across the full rendered surface.

CT substrate-honest catch at this slice per RULE 13: the
`ChainRefRow` component initially named its prop `ref`,
conflicting with React's reserved ref-forwarding prop —
chain ref data arrived as `undefined` inside the component
despite the API response carrying it correctly. Renamed to
`chainRef` and documented inline before merge. Caught by
the chain-integrity test.

NO Foundation backend change at this CT slice. NO new
Foundation route. NO new schema. NO new audit literal. NO
Layer 4 transcript drilldown UI. NO export (NDJSON / CSV).
NO verify-chain panel. NO org / platform / regulator scope.
NO Action mutation. NO connector invocation. NO LLM. NO
BEAM.

Section 7 forward-substrate remaining at the CT register
(each a bounded follow-on slice consuming already-LIVE
Foundation routes): event-list filtering UI (event_type +
outcome + target_entity_id + target_capsule_id +
start_time + end_time) + NDJSON / CSV export action +
verify-chain panel + org / platform / regulator scope
toggle (gated on TAR.can_admin_org + TAR.can_admin_niov +
LawfulBasis flow). Each requires its own Founder
authorization at slice per RULE 21 production-grade
discipline.

## CT consumer LIVE 2026-06-01 (Section 7 D2.1 filter UI)

**Control Tower filter UI LANDED 2026-06-01** at
`[CT-SECTION-7-AUDIT-VIEWER-D2.1-FILTERS]`
(otzar-control-tower PR
[#11](https://github.com/NiovArchitect/otzar-control-tower/pull/11)
`66e9d41`). Adds the two highest-value filters to the Audit
events list: `event_type` Select dropdown populated from
`AUDIT_EVENT_TYPE_LABELS` (30 closed-vocab labels) +
`outcome` Select dropdown (SUCCESS / DENIED / FAILURE) +
Reset filters button. Foundation route already accepts these
query params; CT D2 already wired `api.audit.list` to
`ListAuditEventsInput`; this slice is UI only.

Filter coherence: changing a filter resets page to 1 + clears
the detail panel selection. Reset is disabled at the default
state. Filters thread through the TanStack Query key so
refetch fires on change.

MSW handler extended to honor `event_type` + `outcome` query
params by filtering the in-memory 3-event fixture chain;
existing D2 list tests preserved.

4 NEW Wave 7-D2.1 tests: controls + reset render / reset
disabled at default / event_type filter narrows list +
serializes via URL / reset restores defaults. CT total:
144 → 148 (Wave 10 Agent Playground 129/129 + Wave 7-D2
list/detail 15/15 regression preserved).

NO Foundation backend change. NO new audit literal. NO
schema. NO new route. NO new type mirror (filter state maps
into existing `ListAuditEventsInput` fields). NO
target_entity_id / target_capsule_id text inputs. NO
start_time / end_time date pickers (both forward-substrate).
NO Layer 4 drilldown / export / verify-chain panel / org+
platform+regulator scope at this slice.

## CT consumer LIVE 2026-06-01 (Section 7 D2.2 verify-chain panel)

**Control Tower chain-integrity verification panel LANDED
2026-06-01** at `[CT-SECTION-7-AUDIT-VIEWER-D2.2-VERIFY-CHAIN]`
(otzar-control-tower PR
[#12](https://github.com/NiovArchitect/otzar-control-tower/pull/12)
`2b79754`). Adds a self-scope chain-integrity verification
surface above the existing events list+detail grid on
`/security-audit`. Foundation route
`GET /api/v1/audit/verify-chain` has been LIVE since ADR-0071
(PR #133); this slice wires the CT type mirror + API client
method + panel + tests. ZERO Foundation change.

Type mirror: NEW `VerifyChainView` (14-field SAFE projection
per ADR-0071 §3 — ok / scope / verified / checked_event_count
/ chain_algorithm / window_start+end / first+last event id +
hash / broken_at_event_id / failure_reason / lawful_basis_id
/ evidence_note / honest_note) + `VerifyChainFailureReason`
(4 closed-vocab failure reasons: CHAIN_HASH_MISMATCH /
PREVIOUS_LINK_MISMATCH / MISSING_PREVIOUS_EVENT /
CANONICAL_RECORD_DRIFT) + `VerifyChainInput`.

API method: NEW `api.audit.verifyChain(input)` →
`VerifyChainView`.

UI: NEW `VerifyChainPanel` component, manual click-to-run
only (never auto-runs). Idle / loading / safe-error /
verified / verification-failed branches all present. Verified
state surfaces boundary detail rows + algorithm badge +
Foundation evidence_note + honest_note. Failed state surfaces
destructive-styled "Chain break" section with
`broken_at_event_id` + closed-vocab `failure_reason`. ZERO
raw event bodies, ZERO raw chain data, ZERO PII, ZERO secret
refs.

MSW handler `auditVerifyChainHandler` returns verified=true
with chain bounds derived from the existing 3-event fixture
chain; honors scope query param (rejects values outside
self|org|platform|regulator with 400 INVALID_SCOPE).

4 NEW Wave 7-D2.2 tests: card + idle Run button render /
Run → verified state + boundary hashes + algorithm label /
verified=false → broken_at + failure_reason in destructive
section / 500 error → safe error block with code. CT total:
148 → 152 (Wave 10 Agent Playground 129/129 + Wave 7-D2 +
D2.1 regression preserved).

NO Foundation backend change. NO new audit literal. NO
schema. NO new route. NO org / platform / regulator scope
toggle UI (Foundation routes already accept the scope param).
NO `lawful_basis_id` flow at UI tier. NO Layer 4 drilldown.
NO NDJSON / CSV export. NO LLM. NO BEAM.

Section 7 forward-substrate remaining at the CT register
after D2.1 + D2.2 (each a bounded follow-on slice consuming
already-LIVE Foundation routes): target_entity_id +
target_capsule_id text-input filters + start_time / end_time
date-range pickers + NDJSON / CSV export action + org /
platform / regulator scope toggle (gated on TAR.can_admin_org
+ TAR.can_admin_niov + LawfulBasis flow). Each requires its
own Founder authorization at slice per RULE 21.

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
