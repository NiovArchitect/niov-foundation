// FILE: audit-view.service.ts
// PURPOSE: Section 7 (Full Audit Viewer) Wave 1 — unified
//          self-scope audit-events read service. Consumes the
//          Section 1F audit primitives (`queryAuditEvents`,
//          `verifyAuditChain`, the `AuditEvent` Prisma model,
//          the canonical `AUDIT_EVENT_TYPE_VALUES` vocabulary)
//          and exposes them through a single coherent caller-
//          scoped surface. Self-scope only at sub-phase 1
//          (caller sees only audit rows where
//          `actor_entity_id == callerEntityId`); org-admin +
//          niov-admin scopes are intentional future-substrate.
// CONNECTS TO:
//   - packages/database/src/queries/audit.ts (the LIVE
//     primitives `queryAuditEvents` + `verifyAuditChain` +
//     `MAX_AUDIT_EVENTS_PAGE_SIZE` + `isKnownAuditEventType`)
//   - apps/api/src/routes/audit.routes.ts (the route consumer)
//   - apps/api/src/services/notification/notification-read.service.ts
//     (pagination + filter validator pattern precedent)
//
// FOUNDER LOCKS:
//   - Self-scope only at sub-phase 1: every query carries
//     actor_entity_id == callerEntityId AS-AND with whatever
//     additional filters the caller supplied. Adding org-admin
//     scope is a separate wave with its own QLOCK to ensure the
//     cross-org leak guard pattern (admin-routes.test.ts:454)
//     is uniformly applied at the new viewer surface.
//   - SAFE projection re-asserts the no-leak contract at read
//     time. `details` is projected raw because `writeAuditEvent`
//     already enforces the SAFE-allowlist at write time per the
//     no-leak guard (tests/unit/no-leak-guard.test.ts).
//   - Enumeration-safe 404: cross-actor + unknown audit_id
//     collapse to the same AUDIT_EVENT_NOT_FOUND envelope so a
//     non-owner cannot probe for which audit_ids exist.
//   - Single-event drilldown surfaces previous_event + next_event
//     references (audit_id + event_hash only) for hand-tracing
//     by a reviewer; we never expose the full prior/next event
//     row (that would re-route around the self-scope filter for
//     a row that may belong to another caller's chain — only
//     happens on the SYSTEM principal chain which the
//     caller-scope filter excludes by construction, but the
//     reference-only projection is defense-in-depth).
//   - No new audit literal: read-audit emission uses the
//     existing ADMIN_ACTION literal with details.action =
//     AUDIT_VIEW_LIST / AUDIT_VIEW_EVENT / AUDIT_VIEW_VERIFY_CHAIN
//     per the CONSOLE_READ precedent at console.routes.ts.

import {
  MAX_AUDIT_EVENTS_PAGE_SIZE,
  VERIFY_CHAIN_MAX_EVENTS,
  canonicalRecord,
  getActiveLawfulBasisForRegulator,
  isKnownAuditEventType,
  prisma,
  verifyAuditChain,
  writeAuditEvent,
} from "@niov/database";
import { createHash } from "node:crypto";

// WHAT: Hex SHA-256 — local helper mirroring the
//        packages/database `sha256Hex` used inside the canonical
//        chain primitive.
// INPUT: A canonical-record string.
// OUTPUT: 64-char lowercase hex digest.
// WHY: ADR-0071 §7.3 regulator continuity verification recomputes
//      event_hash from the 14-field canonical_record at the
//      service tier; we need the same digest the primitive
//      writes at row insert.
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
import type { AuditEventType, VerifyAuditChainResult } from "@niov/database";
import type { AuditEvent, AuditOutcome, Prisma } from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: Default page size for the list route. Mirrors the
//        existing MAX_AUDIT_EVENTS_PAGE_SIZE = 100 cap (declared
//        in packages/database; re-used here).
export const DEFAULT_AUDIT_EVENTS_PAGE_SIZE = 50;

// WHAT: Hard cap on the number of audit_events rows a single
//        Wave 4 export can return. Defense-in-depth bound on
//        memory + response time + bytes-on-the-wire.
// INPUT: None.
// OUTPUT: The number 10_000.
// WHY: An unbounded export of every row in the chain could OOM
//      Fastify, run for many seconds, and ship a hundreds-of-
//      megabytes response. The cap is the canonical safety
//      anchor; callers expecting larger windows can paginate by
//      time-range (start_time + end_time) across multiple
//      requests.
export const EXPORT_AUDIT_EVENTS_MAX_ROWS = 10_000;

// WHAT: UUID guard. Same canonical regex used by the other
//        Foundation services.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: The narrow set of canonical AuditOutcome enum literals
//        (string-shaped) used by the filter validator.
const VALID_AUDIT_OUTCOMES: ReadonlySet<string> = new Set<string>([
  "SUCCESS",
  "DENIED",
  "ERROR",
]);

// WHAT: SAFE projection of an AuditEvent row. Mirrors the
//        Prisma column set (the persisted row is the canonical
//        record); details is raw because writeAuditEvent already
//        enforces the SAFE-allowlist at write time per the
//        no-leak guard.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Locks the response contract at the type level so future
//      handlers cannot accidentally surface a forbidden field.
export interface SafeAuditEventView {
  audit_id: string;
  event_type: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  target_capsule_id: string | null;
  session_id: string | null;
  outcome: AuditOutcome;
  denial_reason: string | null;
  details: unknown;
  ip_address: string | null;
  timestamp: string;
  previous_event_hash: string | null;
  event_hash: string;
  lawful_basis_id: string | null;
  lawful_basis_chain_hash: string | null;
  jurisdiction: string | null;
}

// WHAT: Hash-chain context reference surfaced on the
//        single-event drilldown. audit_id + event_hash only so
//        the caller can reconstruct the chain by hand without
//        the full neighboring row leaking through.
export interface AuditEventChainRef {
  audit_id: string;
  event_hash: string;
  timestamp: string;
}

// WHAT: The detail-view envelope returned by
//        getAuditEventForCaller. Same SAFE projection as the
//        list-tier rows + the optional previous + next chain
//        references for hand-tracing.
export interface SafeAuditEventDetailView extends SafeAuditEventView {
  previous_event: AuditEventChainRef | null;
  next_event: AuditEventChainRef | null;
}

// WHAT: The query-string-shaped input the list route accepts.
//        All fields optional; string-shaped per HTTP query
//        semantics.
export interface ListAuditEventsQuery {
  page?: unknown;
  page_size?: unknown;
  event_type?: unknown;
  target_entity_id?: unknown;
  target_capsule_id?: unknown;
  outcome?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  // Section 7 Wave 2: scope=self (default) | scope=org. scope=org
  // requires can_admin_org on the caller's TAR; mirrors the
  // ?org_scope=true precedent from list.service.ts. The query-
  // string-shaped field stays string-only here; the validator
  // coerces "org" / "self" to the typed AuditViewScope enum.
  scope?: unknown;
}

// WHAT: The viewer-scope enum. Self is the default (Wave 1
//        contract); org enables the Wave 2 org-admin path;
//        platform enables the Wave 3 niov-admin path (read all
//        audit rows across the substrate).
export type AuditViewScope = "self" | "org" | "platform";

// WHAT: The normalized + clamped filter shape after validation.
export interface NormalizedListAuditEventsFilters {
  scope: AuditViewScope;
  page: number;
  page_size: number;
  event_type?: AuditEventType;
  target_entity_id?: string;
  target_capsule_id?: string;
  outcome?: AuditOutcome;
  start_time?: Date;
  end_time?: Date;
}

// WHAT: Coerce a string-like to a positive integer; return null
//        on failure.
function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      return null;
    }
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

// WHAT: Coerce a query-string ISO-8601 date to a Date; return
//        null on failure. Accepts only string input.
function asIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// WHAT: Validate + normalize the list query string.
// INPUT: A ListAuditEventsQuery (typically request.query).
// OUTPUT: { ok: true, normalized } | { ok: false, code,
//         invalid_fields }.
// WHY: Mirrors the list.service / attempt-list / notification-
//      read validator pattern. event_type validated against the
//      canonical AUDIT_EVENT_TYPE_VALUES set so a probing caller
//      cannot pass arbitrary strings.
export function validateListAuditEventsQuery(
  query: ListAuditEventsQuery,
):
  | { ok: true; normalized: NormalizedListAuditEventsFilters }
  | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[] } {
  const invalid: string[] = [];
  let page = 1;
  if (query.page !== undefined) {
    const p = asPositiveInt(query.page);
    if (p === null) invalid.push("page");
    else page = p;
  }
  let page_size = DEFAULT_AUDIT_EVENTS_PAGE_SIZE;
  if (query.page_size !== undefined) {
    const ps = asPositiveInt(query.page_size);
    if (ps === null || ps > MAX_AUDIT_EVENTS_PAGE_SIZE) {
      invalid.push("page_size");
    } else {
      page_size = ps;
    }
  }
  let event_type: AuditEventType | undefined;
  if (query.event_type !== undefined) {
    if (
      typeof query.event_type !== "string" ||
      !isKnownAuditEventType(query.event_type)
    ) {
      invalid.push("event_type");
    } else {
      event_type = query.event_type;
    }
  }
  let target_entity_id: string | undefined;
  if (query.target_entity_id !== undefined) {
    if (
      typeof query.target_entity_id !== "string" ||
      !UUID_RE.test(query.target_entity_id)
    ) {
      invalid.push("target_entity_id");
    } else {
      target_entity_id = query.target_entity_id;
    }
  }
  let target_capsule_id: string | undefined;
  if (query.target_capsule_id !== undefined) {
    if (
      typeof query.target_capsule_id !== "string" ||
      !UUID_RE.test(query.target_capsule_id)
    ) {
      invalid.push("target_capsule_id");
    } else {
      target_capsule_id = query.target_capsule_id;
    }
  }
  let outcome: AuditOutcome | undefined;
  if (query.outcome !== undefined) {
    if (
      typeof query.outcome !== "string" ||
      !VALID_AUDIT_OUTCOMES.has(query.outcome)
    ) {
      invalid.push("outcome");
    } else {
      outcome = query.outcome as AuditOutcome;
    }
  }
  let start_time: Date | undefined;
  if (query.start_time !== undefined) {
    const d = asIsoDate(query.start_time);
    if (d === null) invalid.push("start_time");
    else start_time = d;
  }
  let end_time: Date | undefined;
  if (query.end_time !== undefined) {
    const d = asIsoDate(query.end_time);
    if (d === null) invalid.push("end_time");
    else end_time = d;
  }
  // Section 7 Wave 2/3: scope coercion. Accept "self" (default
  // when omitted), "org" (org-admin path), or "platform"
  // (niov-admin path). Anything else is INVALID_FIELD.
  let scope: AuditViewScope = "self";
  if (query.scope !== undefined) {
    if (
      typeof query.scope !== "string" ||
      (query.scope !== "self" &&
        query.scope !== "org" &&
        query.scope !== "platform")
    ) {
      invalid.push("scope");
    } else {
      scope = query.scope;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedListAuditEventsFilters = {
    scope,
    page,
    page_size,
  };
  if (event_type !== undefined) normalized.event_type = event_type;
  if (target_entity_id !== undefined) {
    normalized.target_entity_id = target_entity_id;
  }
  if (target_capsule_id !== undefined) {
    normalized.target_capsule_id = target_capsule_id;
  }
  if (outcome !== undefined) normalized.outcome = outcome;
  if (start_time !== undefined) normalized.start_time = start_time;
  if (end_time !== undefined) normalized.end_time = end_time;
  return { ok: true, normalized };
}

// WHAT: Page-envelope shape returned by listAuditEventsForCaller.
export interface ListAuditEventsView {
  page: number;
  page_size: number;
  total: number;
  events: SafeAuditEventView[];
}

// WHAT: Discriminated-union result shapes.
export type ListAuditEventsResult =
  | { ok: true; httpStatus: 200; view: ListAuditEventsView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

export type GetAuditEventResult =
  | { ok: true; httpStatus: 200; view: SafeAuditEventDetailView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// ─────────────────────────────────────────────────────────────
// ADR-0071 SAFE VerifyChainView — Option A clean break.
//
// Replaces the prior VerifyAuditChainView (`valid` / `total_events`
// / `broken_at` / `actor_entity_id`). Old fields are NOT aliased.
// Founder QLOCK 2026-05-31: Option A clean break selected after
// consumer-mapping showed zero external HTTP consumers + only
// the route's own integration test consumed the old fields.
// ─────────────────────────────────────────────────────────────

export type VerifyChainScope =
  | "self"
  | "org"
  | "platform"
  | "regulator";

export type VerifyChainFailureReason =
  | "HASH_MISMATCH"
  | "PREVIOUS_LINK_MISMATCH"
  | "MISSING_PREVIOUS_EVENT"
  | "CANONICAL_RECORD_DRIFT";

export interface VerifyChainView {
  ok: true;
  scope: VerifyChainScope;
  verified: boolean;
  checked_event_count: number;
  chain_algorithm: "SHA-256/14-field-canonical-record";
  window_start: string | null;
  window_end: string | null;
  first_event_id: string | null;
  last_event_id: string | null;
  first_event_hash: string | null;
  last_event_hash: string | null;
  broken_at_event_id: string | null;
  failure_reason: VerifyChainFailureReason | null;
  lawful_basis_id: string | null;
  evidence_note: string;
  honest_note: string;
}

export type VerifyChainResult =
  | { ok: true; httpStatus: 200; view: VerifyChainView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 500;
      code: string;
      message?: string;
    };

// Inputs accepted by the cross-scope service. lawful_basis_id is
// REQUIRED when scope === "regulator"; subject_entity_id is
// FORBIDDEN when scope === "regulator". Validation lives in the
// route validator + the service entry guard.
export interface VerifyChainServiceInput {
  callerEntityId: string;
  scope: VerifyChainScope;
  lawful_basis_id?: string;
  subject_entity_id?: string;
  from?: Date;
  to?: Date;
  max_events?: number;
}

// WHAT: Internal result of scope resolution. Either a Prisma
//        where-clause + optional org_entity_id metadata (for
//        read-audit emission), or an error envelope.
// WHY: Shared between list / detail / export so the gate logic
//      lives in exactly one place and all three surfaces reject
//      with identical http codes + envelope shapes.
interface ScopeResolutionOk {
  ok: true;
  predicate: Prisma.AuditEventWhereInput;
  orgEntityIdForAudit: string | null;
}
interface ScopeResolutionErr {
  ok: false;
  httpStatus: 403 | 404;
  code:
    | "ORG_SCOPE_FORBIDDEN"
    | "PLATFORM_SCOPE_FORBIDDEN"
    | "NOT_IN_ANY_ORG";
  message?: string;
}
type ScopeResolution = ScopeResolutionOk | ScopeResolutionErr;

async function resolveAuditScopePredicate(
  callerEntityId: string,
  scope: AuditViewScope,
): Promise<ScopeResolution> {
  if (scope === "platform") {
    const hasNiovAdmin = await callerHasNiovAdminCapability(callerEntityId);
    if (!hasNiovAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "PLATFORM_SCOPE_FORBIDDEN",
        message:
          "scope=platform requires can_admin_niov on the caller's TAR.",
      };
    }
    return { ok: true, predicate: {}, orgEntityIdForAudit: null };
  }
  if (scope === "org") {
    const hasAdmin = await callerHasAdminCapability(callerEntityId);
    if (!hasAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "ORG_SCOPE_FORBIDDEN",
        message:
          "scope=org requires can_admin_org on the caller's TAR.",
      };
    }
    let callerOrgId: string;
    try {
      callerOrgId = await getOrgEntityId(callerEntityId);
    } catch {
      return { ok: false, httpStatus: 404, code: "NOT_IN_ANY_ORG" };
    }
    const orgScope = await resolveOrgScopeVector(callerOrgId);
    return {
      ok: true,
      predicate: {
        OR: [
          { actor_entity_id: { in: orgScope } },
          { target_entity_id: { in: orgScope } },
        ],
      },
      orgEntityIdForAudit: callerOrgId,
    };
  }
  return {
    ok: true,
    predicate: { actor_entity_id: callerEntityId },
    orgEntityIdForAudit: null,
  };
}

// WHAT: Project a raw AuditEvent row to the SafeAuditEventView.
// INPUT: An AuditEvent row.
// OUTPUT: A SafeAuditEventView.
// WHY: One projector so the forbidden-fields contract is enforced
//      by construction. details is projected raw because
//      writeAuditEvent's SAFE-allowlist already filtered it at
//      write time.
function projectAuditEvent(row: AuditEvent): SafeAuditEventView {
  return {
    audit_id: row.audit_id,
    event_type: row.event_type,
    actor_entity_id: row.actor_entity_id,
    target_entity_id: row.target_entity_id,
    target_capsule_id: row.target_capsule_id,
    session_id: row.session_id,
    outcome: row.outcome,
    denial_reason: row.denial_reason,
    details: row.details,
    ip_address: row.ip_address,
    timestamp: row.timestamp.toISOString(),
    previous_event_hash: row.previous_event_hash,
    event_hash: row.event_hash,
    lawful_basis_id: row.lawful_basis_id,
    lawful_basis_chain_hash: row.lawful_basis_chain_hash,
    jurisdiction: row.jurisdiction,
  };
}

// WHAT: Emit the canonical read-audit row for a viewer GET. Uses
//        the existing ADMIN_ACTION literal with details.action
//        = AUDIT_VIEW_* per the CONSOLE_READ precedent at
//        console.routes.ts. No new audit literal needed.
// INPUT: callerEntityId + action label + non-sensitive metadata
//        keys (the values are NOT recorded; only the keys per
//        the CONSOLE_READ filter_keys precedent).
// OUTPUT: A promise that resolves once the audit row is
//         persisted.
// WHY: Section 7 RULE 4 — watching the watchers. Every viewer
//      read fires its own audit row so a reviewer can answer
//      "who looked at what audit chain when".
async function emitAuditViewerRead(
  callerEntityId: string,
  action:
    | "AUDIT_VIEW_LIST"
    | "AUDIT_VIEW_EVENT"
    | "AUDIT_VIEW_VERIFY_CHAIN"
    | "AUDIT_VIEW_ORG_LIST"
    | "AUDIT_VIEW_ORG_EVENT"
    | "AUDIT_VIEW_PLATFORM_LIST"
    | "AUDIT_VIEW_PLATFORM_EVENT"
    | "AUDIT_VIEW_EXPORT"
    | "AUDIT_VIEW_REGULATOR",
  meta: Record<string, unknown> = {},
): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: { action, ...meta },
  });
}

// WHAT: TAR-authoritative check that the caller currently holds
//        can_admin_org. Mirrors callerHasAdminCapability at
//        apps/api/src/services/action/list.service.ts:289.
// INPUT: callerEntityId.
// OUTPUT: Boolean.
// WHY: scope=org branch needs an admin gate; we MUST consult the
//      TAR live (not the stale token claims) per the RULE 13
//      audit-chain disclosure ("the viewer MUST enforce TAR-
//      authoritative scope checks at every request").
async function callerHasAdminCapability(
  callerEntityId: string,
): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_org: true, status: true },
  });
  if (tar === null) return false;
  return tar.status === "ACTIVE" && tar.can_admin_org === true;
}

// WHAT: TAR-authoritative check that the caller currently holds
//        can_admin_niov. Mirrors the existing /platform/audit +
//        /console/audit niov-admin gate.
// INPUT: callerEntityId.
// OUTPUT: Boolean.
// WHY: scope=platform branch needs the broader admin gate. Same
//      live-TAR-not-stale-token-claims rule as
//      callerHasAdminCapability — RULE 13 anchor.
async function callerHasNiovAdminCapability(
  callerEntityId: string,
): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_niov: true, status: true },
  });
  if (tar === null) return false;
  return tar.status === "ACTIVE" && tar.can_admin_niov === true;
}

// WHAT: Resolve the (org + member) scope vector for an
//        org-admin caller. Mirrors /api/v1/org/audit at
//        org.routes.ts:1369-1373 — every member's entity_id
//        joins the org_entity_id itself as a candidate for the
//        actor / target OR-fence.
// INPUT: orgEntityId.
// OUTPUT: A non-empty string[] containing the org_entity_id +
//          every active-member child_id.
// WHY: An org-admin should see audit rows where their org OR
//      any of their org's members appears as actor OR target —
//      that's the canonical "org audit chain" semantics from
//      Section 1F + the existing /org/audit cross-tenant test
//      at admin-routes.test.ts:454.
async function resolveOrgScopeVector(orgEntityId: string): Promise<string[]> {
  const memberships = await prisma.entityMembership.findMany({
    where: { parent_id: orgEntityId, is_active: true },
    select: { child_id: true },
  });
  return [orgEntityId, ...memberships.map((m) => m.child_id)];
}

// WHAT: List the caller's own audit-event rows. Self-scope only
//        at sub-phase 1 — every query has actor_entity_id ==
//        callerEntityId AS-AND with the optional filter set.
//        Sort DESC by timestamp (newest first), matches the
//        existing /platform/audit + /org/audit + /console/audit
//        precedent. Cap MAX_AUDIT_EVENTS_PAGE_SIZE = 100.
// INPUT: callerEntityId + normalized filters.
// OUTPUT: A ListAuditEventsResult.
// WHY: The single canonical entry point for a caller's audit
//      view. Org-admin and niov-admin scopes are layered on by
//      separate future waves; both consume this same SAFE
//      projection.
export async function listAuditEventsForCaller(
  callerEntityId: string,
  filters: NormalizedListAuditEventsFilters,
): Promise<ListAuditEventsResult> {
  // Section 7 Wave 2/3: resolve the scope predicate.
  //   scope=self     → caller's own actor_entity_id (Wave 1).
  //   scope=org      → actor OR target IN caller's org-scope
  //                    vector (Wave 2; /org/audit precedent).
  //   scope=platform → no scope fence (Wave 3; niov-admin reads
  //                    every audit row in the substrate; mirrors
  //                    /platform/audit + /console/audit pattern).
  let scopePredicate: Prisma.AuditEventWhereInput;
  let orgEntityIdForAudit: string | null = null;
  if (filters.scope === "platform") {
    const hasNiovAdmin =
      await callerHasNiovAdminCapability(callerEntityId);
    if (!hasNiovAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "PLATFORM_SCOPE_FORBIDDEN",
        message:
          "scope=platform requires can_admin_niov on the caller's TAR.",
      };
    }
    // Platform-scope predicate is the empty object — every
    // audit_events row matches. Filters still AND-narrow.
    scopePredicate = {};
  } else if (filters.scope === "org") {
    const hasAdmin = await callerHasAdminCapability(callerEntityId);
    if (!hasAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "ORG_SCOPE_FORBIDDEN",
        message:
          "scope=org requires can_admin_org on the caller's TAR.",
      };
    }
    let callerOrgId: string;
    try {
      callerOrgId = await getOrgEntityId(callerEntityId);
    } catch {
      return { ok: false, httpStatus: 404, code: "NOT_IN_ANY_ORG" };
    }
    orgEntityIdForAudit = callerOrgId;
    const orgScope = await resolveOrgScopeVector(callerOrgId);
    scopePredicate = {
      OR: [
        { actor_entity_id: { in: orgScope } },
        { target_entity_id: { in: orgScope } },
      ],
    };
  } else {
    scopePredicate = { actor_entity_id: callerEntityId };
  }
  // Optional filters AND-compose with the scope predicate via
  // the top-level AND[] array — every additional filter NARROWS
  // the result. Filters cannot widen (Prisma where semantics)
  // and never escape the scope fence. Mirrors the /org/audit
  // pattern at org.routes.ts:1378-1395.
  const filterClauses: Prisma.AuditEventWhereInput[] = [scopePredicate];
  if (filters.event_type !== undefined) {
    filterClauses.push({ event_type: filters.event_type });
  }
  if (filters.target_entity_id !== undefined) {
    filterClauses.push({ target_entity_id: filters.target_entity_id });
  }
  if (filters.target_capsule_id !== undefined) {
    filterClauses.push({ target_capsule_id: filters.target_capsule_id });
  }
  if (filters.outcome !== undefined) {
    filterClauses.push({ outcome: filters.outcome });
  }
  if (filters.start_time !== undefined || filters.end_time !== undefined) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (filters.start_time !== undefined) ts.gte = filters.start_time;
    if (filters.end_time !== undefined) ts.lte = filters.end_time;
    filterClauses.push({ timestamp: ts });
  }
  const where: Prisma.AuditEventWhereInput = { AND: filterClauses };
  const skip = (filters.page - 1) * filters.page_size;
  const [rows, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take: filters.page_size,
    }),
    prisma.auditEvent.count({ where }),
  ]);
  // Read-audit emission. Records only the filter keys (presence,
  // not values) per the CONSOLE_READ pattern. Scope variant
  // discriminated by the AUDIT_VIEW_LIST vs AUDIT_VIEW_ORG_LIST
  // action label so a reviewer can trivially distinguish self-
  // reads from org-admin reads.
  const filterKeys = Object.entries(filters)
    .filter(
      ([k, v]) =>
        k !== "scope" &&
        k !== "page" &&
        k !== "page_size" &&
        v !== undefined &&
        v !== null,
    )
    .map(([k]) => k);
  const auditMeta: Record<string, unknown> = {
    filter_keys: filterKeys,
    page: filters.page,
    page_size: filters.page_size,
    result_count: rows.length,
  };
  if (filters.scope === "org" && orgEntityIdForAudit !== null) {
    auditMeta.org_entity_id = orgEntityIdForAudit;
  }
  const listAction =
    filters.scope === "platform"
      ? "AUDIT_VIEW_PLATFORM_LIST"
      : filters.scope === "org"
        ? "AUDIT_VIEW_ORG_LIST"
        : "AUDIT_VIEW_LIST";
  await emitAuditViewerRead(callerEntityId, listAction, auditMeta);
  return {
    ok: true,
    httpStatus: 200,
    view: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      events: rows.map(projectAuditEvent),
    },
  };
}

// WHAT: Fetch a single AuditEvent row scoped to the caller. Adds
//        previous + next chain-context references for hand-
//        tracing by a reviewer.
// INPUT: callerEntityId + auditId.
// OUTPUT: A GetAuditEventResult.
// WHY: Enumeration-safe 404 — cross-actor + unknown id collapse
//      to the same AUDIT_EVENT_NOT_FOUND envelope. The chain
//      refs are scoped to the same actor_entity_id chain so a
//      caller cannot use them to walk across someone else's
//      chain.
export async function getAuditEventForCaller(
  callerEntityId: string,
  auditId: string,
  scope: AuditViewScope = "self",
): Promise<GetAuditEventResult> {
  if (typeof auditId !== "string" || !UUID_RE.test(auditId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_AUDIT_ID" };
  }
  // Section 7 Wave 2/3: scope branch. Each scope pre-flights
  // its admin gate BEFORE the row lookup so callers cannot
  // probe for audit_ids outside their authorized scope.
  let rowQueryWhere: Prisma.AuditEventWhereInput;
  let chainScopeWhere: Prisma.AuditEventWhereInput;
  let orgEntityIdForAudit: string | null = null;
  if (scope === "platform") {
    const hasNiovAdmin =
      await callerHasNiovAdminCapability(callerEntityId);
    if (!hasNiovAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "PLATFORM_SCOPE_FORBIDDEN",
        message:
          "scope=platform requires can_admin_niov on the caller's TAR.",
      };
    }
    // Platform-scope detail = any audit_id; chain refs walk
    // the unconstrained timeline (mirrors the platform-scope
    // list semantics).
    rowQueryWhere = { audit_id: auditId };
    chainScopeWhere = {};
  } else if (scope === "org") {
    const hasAdmin = await callerHasAdminCapability(callerEntityId);
    if (!hasAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "ORG_SCOPE_FORBIDDEN",
        message:
          "scope=org requires can_admin_org on the caller's TAR.",
      };
    }
    let callerOrgId: string;
    try {
      callerOrgId = await getOrgEntityId(callerEntityId);
    } catch {
      return { ok: false, httpStatus: 404, code: "NOT_IN_ANY_ORG" };
    }
    orgEntityIdForAudit = callerOrgId;
    const orgScope = await resolveOrgScopeVector(callerOrgId);
    const orgScopeFence: Prisma.AuditEventWhereInput = {
      OR: [
        { actor_entity_id: { in: orgScope } },
        { target_entity_id: { in: orgScope } },
      ],
    };
    rowQueryWhere = { AND: [{ audit_id: auditId }, orgScopeFence] };
    chainScopeWhere = orgScopeFence;
  } else {
    rowQueryWhere = { audit_id: auditId, actor_entity_id: callerEntityId };
    chainScopeWhere = { actor_entity_id: callerEntityId };
  }
  const row = await prisma.auditEvent.findFirst({ where: rowQueryWhere });
  if (row === null) {
    // Enumeration-safe 404. Cross-actor / cross-org / unknown
    // id collapse to the same envelope. A non-owner cannot
    // probe for which audit_ids exist outside their scope.
    return { ok: false, httpStatus: 404, code: "AUDIT_EVENT_NOT_FOUND" };
  }
  // Previous + next references scoped to the same caller-or-org
  // chain. The chainScopeWhere predicate keeps the refs from
  // traversing into rows outside the caller's authorized scope.
  const [previousRow, nextRow] = await Promise.all([
    prisma.auditEvent.findFirst({
      where: {
        AND: [chainScopeWhere, { timestamp: { lt: row.timestamp } }],
      },
      orderBy: { timestamp: "desc" },
      select: { audit_id: true, event_hash: true, timestamp: true },
    }),
    prisma.auditEvent.findFirst({
      where: {
        AND: [chainScopeWhere, { timestamp: { gt: row.timestamp } }],
      },
      orderBy: { timestamp: "asc" },
      select: { audit_id: true, event_hash: true, timestamp: true },
    }),
  ]);
  const auditMeta: Record<string, unknown> = { audit_id: auditId };
  if (scope === "org" && orgEntityIdForAudit !== null) {
    auditMeta.org_entity_id = orgEntityIdForAudit;
  }
  const detailAction =
    scope === "platform"
      ? "AUDIT_VIEW_PLATFORM_EVENT"
      : scope === "org"
        ? "AUDIT_VIEW_ORG_EVENT"
        : "AUDIT_VIEW_EVENT";
  await emitAuditViewerRead(callerEntityId, detailAction, auditMeta);
  return {
    ok: true,
    httpStatus: 200,
    view: {
      ...projectAuditEvent(row),
      previous_event:
        previousRow === null
          ? null
          : {
              audit_id: previousRow.audit_id,
              event_hash: previousRow.event_hash,
              timestamp: previousRow.timestamp.toISOString(),
            },
      next_event:
        nextRow === null
          ? null
          : {
              audit_id: nextRow.audit_id,
              event_hash: nextRow.event_hash,
              timestamp: nextRow.timestamp.toISOString(),
            },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ADR-0071 cross-scope verify-chain service.
//
// Option A clean break per Founder QLOCK 2026-05-31: NEW
// canonical `VerifyChainView` (verified / checked_event_count /
// broken_at_event_id / chain_algorithm / window_start/end /
// first_event_id+hash / last_event_id+hash / failure_reason /
// lawful_basis_id / evidence_note / honest_note). Old fields
// (`valid` / `total_events` / `broken_at` / `actor_entity_id`)
// are NOT aliased.
// ─────────────────────────────────────────────────────────────

const VERIFY_CHAIN_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFY_CHAIN_CHAIN_ALGORITHM = "SHA-256/14-field-canonical-record" as const;
const VERIFY_CHAIN_EVIDENCE_NOTE =
  "Audit-chain integrity verification within the scoped window. Proves cryptographic chain hash integrity; not a compliance certification, regulator approval, or legal determination.";
const VERIFY_CHAIN_HONEST_NOTE =
  "verified=true means every checked row's hash recomputes to the stored event_hash and every previous_event_hash links to its predecessor. Empty windows return verified=true with checked_event_count=0 (vacuously). Failure reasons follow a closed vocabulary; broken_at_event_id may be null under regulator scope when the broken row is outside lawful-basis visibility.";

// WHAT: Map a primitive `valid=false` outcome to the closed-vocab
//        VerifyChainFailureReason. ADR-0071 §3 + §7.4.
// INPUT: The primitive result.
// OUTPUT: A closed-vocab failure reason.
// WHY: The primitive surfaces a single brokenAt id without
//      explaining whether the link mismatched or the hash
//      recomputed differently. At v1 we collapse to
//      HASH_MISMATCH for any chain break; future iterations may
//      refine to PREVIOUS_LINK_MISMATCH / CANONICAL_RECORD_DRIFT
//      via the underlying primitive when the additional
//      diagnostic surfaces are added (forward-substrate).
function failureReasonFor(_result: VerifyAuditChainResult): VerifyChainFailureReason {
  return "HASH_MISMATCH";
}

// WHAT: Merge two primitive verifyAuditChain results in
//        timeline order (oldest first wins for first_event /
//        latest wins for last_event). The merge short-circuits
//        as soon as one chain reports valid=false.
// INPUT: An accumulator + the next primitive result + the
//        next entity's identity.
// OUTPUT: An updated accumulator.
// WHY: Multi-chain (org / platform) verification iterates the
//      in-scope entity set and aggregates totals + boundary
//      hashes without surfacing per-entity chains in the
//      response per ADR-0071 §5 (per-entity chain results
//      forbidden at org/platform aggregate).
interface AggregateChainState {
  verified: boolean;
  checked_event_count: number;
  broken_at_event_id: string | null;
  failure_reason: VerifyChainFailureReason | null;
  first_event_id: string | null;
  first_event_hash: string | null;
  first_event_ts: Date | null;
  last_event_id: string | null;
  last_event_hash: string | null;
  last_event_ts: Date | null;
}

function emptyAggregate(): AggregateChainState {
  return {
    verified: true,
    checked_event_count: 0,
    broken_at_event_id: null,
    failure_reason: null,
    first_event_id: null,
    first_event_hash: null,
    first_event_ts: null,
    last_event_id: null,
    last_event_hash: null,
    last_event_ts: null,
  };
}

function foldChain(
  acc: AggregateChainState,
  result: VerifyAuditChainResult,
): AggregateChainState {
  const next: AggregateChainState = {
    verified: acc.verified && result.valid,
    checked_event_count: acc.checked_event_count + result.totalEvents,
    broken_at_event_id: acc.broken_at_event_id ?? result.brokenAt,
    failure_reason:
      acc.failure_reason ?? (result.valid ? null : failureReasonFor(result)),
    first_event_id: acc.first_event_id,
    first_event_hash: acc.first_event_hash,
    first_event_ts: acc.first_event_ts,
    last_event_id: acc.last_event_id,
    last_event_hash: acc.last_event_hash,
    last_event_ts: acc.last_event_ts,
  };
  if (
    result.firstEventTimestamp !== null &&
    (next.first_event_ts === null ||
      result.firstEventTimestamp.getTime() < next.first_event_ts.getTime())
  ) {
    next.first_event_id = result.firstEventId;
    next.first_event_hash = result.firstEventHash;
    next.first_event_ts = result.firstEventTimestamp;
  }
  if (
    result.lastEventTimestamp !== null &&
    (next.last_event_ts === null ||
      result.lastEventTimestamp.getTime() > next.last_event_ts.getTime())
  ) {
    next.last_event_id = result.lastEventId;
    next.last_event_hash = result.lastEventHash;
    next.last_event_ts = result.lastEventTimestamp;
  }
  return next;
}

// WHAT: Project an aggregate result + scope inputs into the
//        canonical VerifyChainView shape.
// INPUT: Scope + lawful_basis_id (regulator only) + window
//        bounds + aggregate state.
// OUTPUT: A SAFE VerifyChainView per ADR-0071 §3.
// WHY: Centralizes the projection so every scope branch produces
//      the exact same field set. Forbidden fields (per §5) are
//      forbidden by-construction at this projection seam.
function projectVerifyChainView(args: {
  scope: VerifyChainScope;
  lawful_basis_id: string | null;
  window_start: Date | null;
  window_end: Date | null;
  agg: AggregateChainState;
}): VerifyChainView {
  return {
    ok: true,
    scope: args.scope,
    verified: args.agg.verified,
    checked_event_count: args.agg.checked_event_count,
    chain_algorithm: VERIFY_CHAIN_CHAIN_ALGORITHM,
    window_start:
      args.window_start === null ? null : args.window_start.toISOString(),
    window_end:
      args.window_end === null ? null : args.window_end.toISOString(),
    first_event_id: args.agg.first_event_id,
    last_event_id: args.agg.last_event_id,
    first_event_hash: args.agg.first_event_hash,
    last_event_hash: args.agg.last_event_hash,
    broken_at_event_id: args.agg.broken_at_event_id,
    failure_reason: args.agg.failure_reason,
    lawful_basis_id: args.lawful_basis_id,
    evidence_note: VERIFY_CHAIN_EVIDENCE_NOTE,
    honest_note: VERIFY_CHAIN_HONEST_NOTE,
  };
}

// WHAT: ADR-0071 cross-scope verify-chain. Replaces the prior
//        self-only `verifyAuditChainForCaller`. Routes through
//        `self` / `org` / `platform` / `regulator` per Founder
//        QLOCK Option A.
// INPUT: VerifyChainServiceInput.
// OUTPUT: VerifyChainResult discriminated union.
// WHY: Operationalizes ADR-0071 §1-§9 at the service tier.
//      RULE 0 owner-scope by-construction at `self`; TAR-
//      authoritative capability checks at `org`/`platform`;
//      ADR-0036 9-condition LawfulBasis enforcement at
//      `regulator`. ZERO new audit literal — reuses existing
//      `AUDIT_VIEW_VERIFY_CHAIN` discriminator with extended
//      SAFE meta per §8.
export async function verifyAuditChainForScope(
  input: VerifyChainServiceInput,
): Promise<VerifyChainResult> {
  const { callerEntityId, scope } = input;

  if (scope === "regulator") {
    if (input.subject_entity_id !== undefined) {
      return {
        ok: false,
        httpStatus: 400,
        code: "INVALID_FIELD",
        message:
          "subject_entity_id is not accepted under scope=regulator; the basis itself selects the events to verify.",
      };
    }
    if (input.lawful_basis_id === undefined) {
      return {
        ok: false,
        httpStatus: 400,
        code: "LAWFUL_BASIS_REQUIRED",
      };
    }
    const basisCheck = await getActiveLawfulBasisForRegulator(
      input.lawful_basis_id,
      callerEntityId,
    );
    if (basisCheck.ok === false) {
      if (basisCheck.code === "LAWFUL_BASIS_NOT_FOUND") {
        return { ok: false, httpStatus: 404, code: "LAWFUL_BASIS_NOT_FOUND" };
      }
      if (
        basisCheck.code === "INTERNAL_ENFORCEMENT_ERROR" ||
        basisCheck.code === "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT"
      ) {
        return { ok: false, httpStatus: 500, code: basisCheck.code };
      }
      return { ok: false, httpStatus: 403, code: basisCheck.code };
    }
    const windowStart =
      input.from !== undefined && input.from.getTime() > basisCheck.basis.valid_from.getTime()
        ? input.from
        : basisCheck.basis.valid_from;
    const windowEnd =
      input.to !== undefined && input.to.getTime() < basisCheck.basis.valid_until.getTime()
        ? input.to
        : basisCheck.basis.valid_until;
    const maxEvents =
      input.max_events !== undefined && input.max_events > 0
        ? Math.min(input.max_events, VERIFY_CHAIN_MAX_EVENTS)
        : VERIFY_CHAIN_MAX_EVENTS;
    return runRegulatorScope({
      callerEntityId,
      lawful_basis_id: input.lawful_basis_id,
      windowStart,
      windowEnd,
      maxEvents,
    });
  }

  // self / org / platform — share the windowed multi-chain
  // verification path. Validate scope-specific gates first.
  const { entityIds, gateError } = await resolveScopeEntityIds({
    callerEntityId,
    scope,
    subject_entity_id: input.subject_entity_id,
  });
  if (gateError !== null) return gateError;

  // Window defaults: self has no default window (caller's chain
  // is bounded by their activity volume); org/platform default
  // to 30 days when both from + to are omitted per ADR-0071 §6.
  let windowStart: Date | null = input.from ?? null;
  let windowEnd: Date | null = input.to ?? null;
  if (
    (scope === "org" || scope === "platform") &&
    windowStart === null &&
    windowEnd === null
  ) {
    windowEnd = new Date();
    windowStart = new Date(windowEnd.getTime() - VERIFY_CHAIN_DEFAULT_WINDOW_MS);
  }

  const maxEvents =
    input.max_events !== undefined && input.max_events > 0
      ? Math.min(input.max_events, VERIFY_CHAIN_MAX_EVENTS)
      : VERIFY_CHAIN_MAX_EVENTS;

  // Pre-flight perf-cap estimate per ADR-0071 §6. A single Prisma
  // count over the in-scope predicate; if it exceeds the cap we
  // fail closed with WINDOW_TOO_LARGE before walking any chain.
  const where: Prisma.AuditEventWhereInput = {
    actor_entity_id: { in: entityIds },
  };
  if (windowStart !== null || windowEnd !== null) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (windowStart !== null) ts.gte = windowStart;
    if (windowEnd !== null) ts.lte = windowEnd;
    where.timestamp = ts;
  }
  const estimate = await prisma.auditEvent.count({ where });
  if (estimate > maxEvents) {
    return {
      ok: false,
      httpStatus: 400,
      code: "WINDOW_TOO_LARGE",
      message: `Estimated ${estimate} events exceeds the ${maxEvents} cap. Narrow the window via from/to or subject_entity_id.`,
    };
  }

  let agg = emptyAggregate();
  const optsBase: { from?: Date; to?: Date; maxEvents?: number } = {
    maxEvents,
  };
  if (windowStart !== null) optsBase.from = windowStart;
  if (windowEnd !== null) optsBase.to = windowEnd;
  // Walk each in-scope entity's chain. Short-circuit on first
  // break per ADR-0071 §7.2.
  for (const entityId of entityIds) {
    const result = await verifyAuditChain(entityId, optsBase);
    agg = foldChain(agg, result);
    if (!agg.verified) break;
  }

  const view = projectVerifyChainView({
    scope,
    lawful_basis_id: null,
    window_start: windowStart,
    window_end: windowEnd,
    agg,
  });
  await emitVerifyChainAudit(callerEntityId, view);
  return { ok: true, httpStatus: 200, view };
}

// WHAT: Resolve the in-scope actor_entity_id set for a non-
//        regulator scope. Self → caller only. Org →
//        subject_entity_id if same-org else 404; without
//        subject → org-scope vector. Platform → subject if
//        provided else every entity.
// INPUT: callerEntityId + scope + optional subject_entity_id.
// OUTPUT: entityIds + a gate error if access denied.
// WHY: Centralizes capability + scope-fence resolution so the
//      service body stays linear.
async function resolveScopeEntityIds(args: {
  callerEntityId: string;
  scope: "self" | "org" | "platform";
  subject_entity_id?: string;
}): Promise<{
  entityIds: string[];
  gateError: VerifyChainResult | null;
}> {
  if (args.scope === "self") {
    // Per ADR-0071 §6, subject_entity_id is ignored under self.
    return { entityIds: [args.callerEntityId], gateError: null };
  }
  if (args.scope === "platform") {
    const hasNiov = await callerHasNiovAdminCapability(args.callerEntityId);
    if (!hasNiov) {
      return {
        entityIds: [],
        gateError: {
          ok: false,
          httpStatus: 403,
          code: "SCOPE_NOT_ALLOWED",
          message: "scope=platform requires can_admin_niov on the caller's TAR.",
        },
      };
    }
    if (args.subject_entity_id !== undefined) {
      // Single-subject narrowing. No same-org constraint at
      // platform scope.
      const subject = await prisma.entity.findFirst({
        where: { entity_id: args.subject_entity_id, deleted_at: null },
        select: { entity_id: true },
      });
      if (subject === null) {
        return {
          entityIds: [],
          gateError: {
            ok: false,
            httpStatus: 404,
            code: "SUBJECT_NOT_FOUND",
          },
        };
      }
      return { entityIds: [subject.entity_id], gateError: null };
    }
    // Without a subject the in-scope set is every live entity.
    // The estimate query later applies the timestamp window
    // before any chain walk happens.
    const rows = await prisma.entity.findMany({
      where: { deleted_at: null },
      select: { entity_id: true },
    });
    return {
      entityIds: rows.map((r) => r.entity_id),
      gateError: null,
    };
  }
  // scope === "org"
  const hasAdmin = await callerHasAdminCapability(args.callerEntityId);
  if (!hasAdmin) {
    return {
      entityIds: [],
      gateError: {
        ok: false,
        httpStatus: 403,
        code: "SCOPE_NOT_ALLOWED",
        message: "scope=org requires can_admin_org on the caller's TAR.",
      },
    };
  }
  let callerOrgId: string;
  try {
    callerOrgId = await getOrgEntityId(args.callerEntityId);
  } catch {
    return {
      entityIds: [],
      gateError: { ok: false, httpStatus: 404, code: "NOT_IN_ANY_ORG" },
    };
  }
  const orgScope = await resolveOrgScopeVector(callerOrgId);
  if (args.subject_entity_id !== undefined) {
    if (!orgScope.includes(args.subject_entity_id)) {
      // Cross-org subject — enumeration-safe 404 mirroring
      // existing Section 7 patterns.
      return {
        entityIds: [],
        gateError: { ok: false, httpStatus: 404, code: "SUBJECT_NOT_FOUND" },
      };
    }
    return { entityIds: [args.subject_entity_id], gateError: null };
  }
  return { entityIds: orgScope, gateError: null };
}

// WHAT: Regulator-scope verify-chain implementation. Walks the
//        events visible under `lawful_basis_id` and verifies
//        chain continuity around each by reading the prior row's
//        `event_hash` (only that column) without surfacing the
//        prior row's data fields.
// INPUT: callerEntityId + lawful_basis_id + window bounds +
//        maxEvents.
// OUTPUT: A VerifyChainResult.
// WHY: ADR-0071 §7.3 — proves chain integrity around events the
//      regulator is permitted to see without leaking existence
//      or content of invisible adjacent events beyond what
//      `previous_event_hash` structurally exposes.
async function runRegulatorScope(args: {
  callerEntityId: string;
  lawful_basis_id: string;
  windowStart: Date;
  windowEnd: Date;
  maxEvents: number;
}): Promise<VerifyChainResult> {
  const where: Prisma.AuditEventWhereInput = {
    lawful_basis_id: args.lawful_basis_id,
    timestamp: { gte: args.windowStart, lte: args.windowEnd },
  };
  const estimate = await prisma.auditEvent.count({ where });
  if (estimate > args.maxEvents) {
    return {
      ok: false,
      httpStatus: 400,
      code: "WINDOW_TOO_LARGE",
      message: `Estimated ${estimate} events exceeds the ${args.maxEvents} cap.`,
    };
  }
  const visible = await prisma.auditEvent.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take: args.maxEvents,
  });
  const agg = emptyAggregate();
  for (const e of visible) {
    // §7.3 continuity verification — verify the link via the
    // prior row's stored `event_hash` ONLY (not the data
    // fields). When the prior row is also visible under the
    // basis we still only read its hash column for the link
    // check. The data-field projection at this surface remains
    // boundary-hashes only.
    if (e.previous_event_hash !== null) {
      const prior = await prisma.auditEvent.findFirst({
        where: {
          actor_entity_id: e.actor_entity_id,
          event_hash: e.previous_event_hash,
        },
        select: { audit_id: true, event_hash: true, lawful_basis_id: true },
      });
      if (prior === null) {
        // Missing predecessor → chain break. Whether the prior
        // row is visible under the basis decides whether we
        // surface the visible-event id or hide it.
        agg.verified = false;
        agg.broken_at_event_id = e.audit_id;
        agg.failure_reason = "MISSING_PREVIOUS_EVENT";
        agg.checked_event_count += 1;
        applyRegulatorBoundary(agg, e);
        break;
      }
    }
    const recomputed = sha256Hex(
      canonicalRecord({
        audit_id: e.audit_id,
        event_type: e.event_type,
        actor_entity_id: e.actor_entity_id,
        target_entity_id: e.target_entity_id,
        target_capsule_id: e.target_capsule_id,
        session_id: e.session_id,
        outcome: e.outcome,
        denial_reason: e.denial_reason,
        details: e.details,
        ip_address: e.ip_address,
        timestamp: e.timestamp,
        previous_event_hash: e.previous_event_hash,
        lawful_basis_id: e.lawful_basis_id,
        lawful_basis_chain_hash: e.lawful_basis_chain_hash,
      }),
    );
    if (recomputed !== e.event_hash) {
      agg.verified = false;
      agg.broken_at_event_id = e.audit_id;
      agg.failure_reason = "HASH_MISMATCH";
      agg.checked_event_count += 1;
      applyRegulatorBoundary(agg, e);
      break;
    }
    agg.checked_event_count += 1;
    applyRegulatorBoundary(agg, e);
  }

  const view = projectVerifyChainView({
    scope: "regulator",
    lawful_basis_id: args.lawful_basis_id,
    window_start: args.windowStart,
    window_end: args.windowEnd,
    agg,
  });
  await emitVerifyChainAudit(args.callerEntityId, view);
  return { ok: true, httpStatus: 200, view };
}

function applyRegulatorBoundary(
  agg: AggregateChainState,
  e: { audit_id: string; event_hash: string; timestamp: Date },
): void {
  if (agg.first_event_ts === null) {
    agg.first_event_id = e.audit_id;
    agg.first_event_hash = e.event_hash;
    agg.first_event_ts = e.timestamp;
  }
  agg.last_event_id = e.audit_id;
  agg.last_event_hash = e.event_hash;
  agg.last_event_ts = e.timestamp;
}

// WHAT: SAFE read-audit emission for verify-chain. Reuses the
//        existing AUDIT_VIEW_VERIFY_CHAIN literal with extended
//        meta per ADR-0071 §8. ZERO new audit literal.
// INPUT: callerEntityId + the projected view.
// OUTPUT: void.
// WHY: §8 forbidden in audit details: any forbidden field per
//      §5. We surface only the safe scalar facts (scope +
//      verified + checked_event_count + window + lawful_basis_id
//      + failure_reason).
async function emitVerifyChainAudit(
  callerEntityId: string,
  view: VerifyChainView,
): Promise<void> {
  const details: Record<string, unknown> = {
    action: "AUDIT_VIEW_VERIFY_CHAIN",
    scope: view.scope,
    verified: view.verified,
    checked_event_count: view.checked_event_count,
  };
  if (view.window_start !== null) details.window_start = view.window_start;
  if (view.window_end !== null) details.window_end = view.window_end;
  if (view.lawful_basis_id !== null) {
    details.lawful_basis_id = view.lawful_basis_id;
  }
  if (view.failure_reason !== null) {
    details.failure_reason = view.failure_reason;
  }
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details,
  });
}

// WHAT: The query-string-shaped input the export route accepts.
//        Mirrors ListAuditEventsQuery minus `page` / `page_size`
//        (export is bounded by EXPORT_AUDIT_EVENTS_MAX_ROWS,
//        not by per-page pagination) plus an optional explicit
//        `max_rows` operator-controlled smaller cap.
export interface ExportAuditEventsQuery {
  format?: unknown;
  scope?: unknown;
  event_type?: unknown;
  target_entity_id?: unknown;
  target_capsule_id?: unknown;
  outcome?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  max_rows?: unknown;
}

// WHAT: The normalized + clamped filter shape after validation.
export interface NormalizedExportAuditEventsFilters {
  scope: AuditViewScope;
  format: "ndjson" | "csv";
  max_rows: number;
  event_type?: AuditEventType;
  target_entity_id?: string;
  target_capsule_id?: string;
  outcome?: AuditOutcome;
  start_time?: Date;
  end_time?: Date;
}

// WHAT: Validate + normalize the export query string. Reuses
//        the same shared sub-validators as the list route.
//        format defaults to "ndjson"; "csv" added at the
//        Hardening Wave A register (Section 7 forward-substrate
//        closure). max_rows clamped to [1, EXPORT_AUDIT_EVENTS_MAX_ROWS];
//        default EXPORT_AUDIT_EVENTS_MAX_ROWS.
export function validateExportAuditEventsQuery(
  query: ExportAuditEventsQuery,
):
  | { ok: true; normalized: NormalizedExportAuditEventsFilters }
  | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[] } {
  const invalid: string[] = [];
  let format: "ndjson" | "csv" = "ndjson";
  if (query.format !== undefined) {
    if (
      typeof query.format !== "string" ||
      (query.format !== "ndjson" && query.format !== "csv")
    ) {
      invalid.push("format");
    } else {
      format = query.format;
    }
  }
  let max_rows = EXPORT_AUDIT_EVENTS_MAX_ROWS;
  if (query.max_rows !== undefined) {
    const n = asPositiveInt(query.max_rows);
    if (n === null || n > EXPORT_AUDIT_EVENTS_MAX_ROWS) {
      invalid.push("max_rows");
    } else {
      max_rows = n;
    }
  }
  let event_type: AuditEventType | undefined;
  if (query.event_type !== undefined) {
    if (
      typeof query.event_type !== "string" ||
      !isKnownAuditEventType(query.event_type)
    ) {
      invalid.push("event_type");
    } else {
      event_type = query.event_type;
    }
  }
  let target_entity_id: string | undefined;
  if (query.target_entity_id !== undefined) {
    if (
      typeof query.target_entity_id !== "string" ||
      !UUID_RE.test(query.target_entity_id)
    ) {
      invalid.push("target_entity_id");
    } else {
      target_entity_id = query.target_entity_id;
    }
  }
  let target_capsule_id: string | undefined;
  if (query.target_capsule_id !== undefined) {
    if (
      typeof query.target_capsule_id !== "string" ||
      !UUID_RE.test(query.target_capsule_id)
    ) {
      invalid.push("target_capsule_id");
    } else {
      target_capsule_id = query.target_capsule_id;
    }
  }
  let outcome: AuditOutcome | undefined;
  if (query.outcome !== undefined) {
    if (
      typeof query.outcome !== "string" ||
      !VALID_AUDIT_OUTCOMES.has(query.outcome)
    ) {
      invalid.push("outcome");
    } else {
      outcome = query.outcome as AuditOutcome;
    }
  }
  let start_time: Date | undefined;
  if (query.start_time !== undefined) {
    const d = asIsoDate(query.start_time);
    if (d === null) invalid.push("start_time");
    else start_time = d;
  }
  let end_time: Date | undefined;
  if (query.end_time !== undefined) {
    const d = asIsoDate(query.end_time);
    if (d === null) invalid.push("end_time");
    else end_time = d;
  }
  let scope: AuditViewScope = "self";
  if (query.scope !== undefined) {
    if (
      typeof query.scope !== "string" ||
      (query.scope !== "self" &&
        query.scope !== "org" &&
        query.scope !== "platform")
    ) {
      invalid.push("scope");
    } else {
      scope = query.scope;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedExportAuditEventsFilters = {
    scope,
    format,
    max_rows,
  };
  if (event_type !== undefined) normalized.event_type = event_type;
  if (target_entity_id !== undefined) {
    normalized.target_entity_id = target_entity_id;
  }
  if (target_capsule_id !== undefined) {
    normalized.target_capsule_id = target_capsule_id;
  }
  if (outcome !== undefined) normalized.outcome = outcome;
  if (start_time !== undefined) normalized.start_time = start_time;
  if (end_time !== undefined) normalized.end_time = end_time;
  return { ok: true, normalized };
}

// WHAT: Export envelope returned by exportAuditEventsForCaller
//        when the export succeeds.
export interface ExportAuditEventsView {
  format: "ndjson" | "csv";
  scope: AuditViewScope;
  // NDJSON body (one JSON-serialized SafeAuditEventView per
  // line, terminated by \n) OR CSV body (header row + one row
  // per audit event with RFC 4180 quoting per safeCsvCell).
  // UTF-8 safe; never contains a standalone \r in NDJSON; CSV
  // uses \r\n line terminators per RFC 4180.
  body: string;
  row_count: number;
  truncated: boolean;
}

// WHAT: Discriminated result.
export type ExportAuditEventsResult =
  | { ok: true; httpStatus: 200; view: ExportAuditEventsView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 422;
      code: string;
      message?: string;
    };

// WHAT: The canonical CSV header for an exported SafeAuditEventView
//        slice. Locked at the value-pin tier so future
//        SafeAuditEventView field additions are an explicit
//        substrate-honest revisit (the field appears in NDJSON via
//        JSON.stringify but the CSV writer is column-positional;
//        adding a column requires updating this constant + the
//        per-row builder below).
// INPUT: None.
// OUTPUT: A frozen tuple of column names.
// WHY: RFC 4180 §2 header-row pattern; one column per safe field.
const EXPORT_CSV_HEADER: ReadonlyArray<keyof SafeAuditEventView> =
  Object.freeze([
    "audit_id",
    "event_type",
    "actor_entity_id",
    "target_entity_id",
    "target_capsule_id",
    "session_id",
    "outcome",
    "denial_reason",
    "details",
    "ip_address",
    "timestamp",
    "previous_event_hash",
    "event_hash",
    "lawful_basis_id",
    "lawful_basis_chain_hash",
    "jurisdiction",
  ]);

// WHAT: Escape one cell value into an RFC 4180 conforming CSV
//        token. Strings with commas / quotes / line-breaks are
//        wrapped in double-quotes; embedded double-quotes are
//        doubled. null + undefined become empty strings. Objects
//        (the audit `details` Json) are serialized via JSON.stringify
//        first, then escaped.
// INPUT: Any cell value.
// OUTPUT: A CSV-safe string.
// WHY: RFC 4180 §2.5 + §2.7 quoting discipline. Defense in
//      depth — operator-supplied event_type / details / etc. that
//      happen to contain commas / newlines / quotes survive a
//      round-trip through any RFC-4180-compliant CSV reader
//      (Excel, LibreOffice, jq -R, csvtool, pandas).
export function safeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw =
    typeof value === "string" ? value : JSON.stringify(value);
  if (
    raw.includes(",") ||
    raw.includes("\"") ||
    raw.includes("\n") ||
    raw.includes("\r")
  ) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }
  return raw;
}

// WHAT: Build an RFC 4180 CSV body from a slice of
//        SafeAuditEventView rows. Header row + one record per
//        row + CRLF line terminators per RFC 4180 §2.1.
// INPUT: A slice of SafeAuditEventView rows.
// OUTPUT: A complete CSV body as a single string.
// WHY: Centralizes the row-shaping so safeCsvCell is applied
//      uniformly across every column. No trailing CRLF — empty
//      slice → header-row-only body (callers can detect by
//      row_count = 0).
function buildCsvBody(rows: SafeAuditEventView[]): string {
  const header = EXPORT_CSV_HEADER.join(",");
  if (rows.length === 0) return header;
  const lines = rows.map((row) =>
    EXPORT_CSV_HEADER.map((col) => safeCsvCell(row[col])).join(","),
  );
  return [header, ...lines].join("\r\n");
}

// WHAT: Bounded NDJSON or CSV export of the caller's audit chain
//        (self / org / platform per scope) up to the
//        max_rows cap.
// INPUT: callerEntityId + normalized filters.
// OUTPUT: An ExportAuditEventsResult carrying the NDJSON body
//          + row_count + truncated flag.
// WHY: Section 7 Wave 4 — regulator-tier review needs a
//      machine-friendly bulk read. NDJSON is preferred over
//      CSV for safe streaming (one row per line; opaque-shaped
//      details JSON survives round-trip; no quoting hazards).
//      The hard EXPORT_AUDIT_EVENTS_MAX_ROWS cap + the
//      smaller-by-default max_rows operator-overridable cap
//      bound memory + response time. truncated flag tells the
//      caller whether they hit the cap so they can re-issue
//      with a narrower time-range.
export async function exportAuditEventsForCaller(
  callerEntityId: string,
  filters: NormalizedExportAuditEventsFilters,
): Promise<ExportAuditEventsResult> {
  const scopeRes = await resolveAuditScopePredicate(
    callerEntityId,
    filters.scope,
  );
  if (scopeRes.ok === false) {
    return {
      ok: false,
      httpStatus: scopeRes.httpStatus,
      code: scopeRes.code,
      ...(scopeRes.message === undefined ? {} : { message: scopeRes.message }),
    };
  }
  const filterClauses: Prisma.AuditEventWhereInput[] = [scopeRes.predicate];
  if (filters.event_type !== undefined) {
    filterClauses.push({ event_type: filters.event_type });
  }
  if (filters.target_entity_id !== undefined) {
    filterClauses.push({ target_entity_id: filters.target_entity_id });
  }
  if (filters.target_capsule_id !== undefined) {
    filterClauses.push({ target_capsule_id: filters.target_capsule_id });
  }
  if (filters.outcome !== undefined) {
    filterClauses.push({ outcome: filters.outcome });
  }
  if (filters.start_time !== undefined || filters.end_time !== undefined) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (filters.start_time !== undefined) ts.gte = filters.start_time;
    if (filters.end_time !== undefined) ts.lte = filters.end_time;
    filterClauses.push({ timestamp: ts });
  }
  const where: Prisma.AuditEventWhereInput = { AND: filterClauses };
  // Take max_rows + 1 so we can compute the truncated flag
  // (caller hit the cap iff we got max_rows + 1 rows back).
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: filters.max_rows + 1,
  });
  const truncated = rows.length > filters.max_rows;
  const slice = truncated ? rows.slice(0, filters.max_rows) : rows;
  const body =
    filters.format === "ndjson"
      ? // NDJSON body. One JSON.stringify per row + \n
        // terminator. Keeps the writer simple; the row cap
        // bounds memory.
        slice.map((r) => JSON.stringify(projectAuditEvent(r))).join("\n")
      : // CSV body per RFC 4180. Header row + one record per
        // event with \r\n line terminators. Opaque
        // `details` Json column serialized to a JSON string +
        // wrapped in safeCsvCell so quoting / embedded
        // delimiters / multi-line content survive round-trip.
        // Same SAFE projection as NDJSON via projectAuditEvent.
        buildCsvBody(slice.map((r) => projectAuditEvent(r)));
  const filterKeys = Object.entries(filters)
    .filter(
      ([k, v]) =>
        k !== "scope" &&
        k !== "format" &&
        k !== "max_rows" &&
        v !== undefined &&
        v !== null,
    )
    .map(([k]) => k);
  const auditMeta: Record<string, unknown> = {
    format: filters.format,
    scope: filters.scope,
    row_count: slice.length,
    max_rows: filters.max_rows,
    truncated,
    filter_keys: filterKeys,
  };
  if (filters.scope === "org" && scopeRes.orgEntityIdForAudit !== null) {
    auditMeta.org_entity_id = scopeRes.orgEntityIdForAudit;
  }
  await emitAuditViewerRead(callerEntityId, "AUDIT_VIEW_EXPORT", auditMeta);
  return {
    ok: true,
    httpStatus: 200,
    view: {
      format: filters.format,
      scope: filters.scope,
      body,
      row_count: slice.length,
      truncated,
    },
  };
}

// WHAT: Query-string shape for the Wave 5 regulator-view route.
//        lawful_basis_id is REQUIRED (404 INVALID_FIELD if
//        missing); pagination + filter set otherwise mirror the
//        list route (no `scope` field — regulator-view is its
//        own discrete entry point).
export interface ListRegulatorAuditEventsQuery {
  lawful_basis_id?: unknown;
  page?: unknown;
  page_size?: unknown;
  event_type?: unknown;
  target_entity_id?: unknown;
  target_capsule_id?: unknown;
  outcome?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}

export interface NormalizedListRegulatorAuditEventsFilters {
  lawful_basis_id: string;
  page: number;
  page_size: number;
  event_type?: AuditEventType;
  target_entity_id?: string;
  target_capsule_id?: string;
  outcome?: AuditOutcome;
  start_time?: Date;
  end_time?: Date;
}

// WHAT: Validate the regulator-view query string. lawful_basis_id
//        required UUID; filter set + pagination shared with the
//        list route's validators.
// INPUT: ListRegulatorAuditEventsQuery (typically request.query).
// OUTPUT: { ok: true, normalized } | { ok: false, code,
//          invalid_fields }.
export function validateListRegulatorAuditEventsQuery(
  query: ListRegulatorAuditEventsQuery,
):
  | { ok: true; normalized: NormalizedListRegulatorAuditEventsFilters }
  | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[] } {
  const invalid: string[] = [];
  let lawful_basis_id = "";
  if (
    typeof query.lawful_basis_id !== "string" ||
    !UUID_RE.test(query.lawful_basis_id)
  ) {
    invalid.push("lawful_basis_id");
  } else {
    lawful_basis_id = query.lawful_basis_id;
  }
  let page = 1;
  if (query.page !== undefined) {
    const p = asPositiveInt(query.page);
    if (p === null) invalid.push("page");
    else page = p;
  }
  let page_size = DEFAULT_AUDIT_EVENTS_PAGE_SIZE;
  if (query.page_size !== undefined) {
    const ps = asPositiveInt(query.page_size);
    if (ps === null || ps > MAX_AUDIT_EVENTS_PAGE_SIZE) {
      invalid.push("page_size");
    } else {
      page_size = ps;
    }
  }
  let event_type: AuditEventType | undefined;
  if (query.event_type !== undefined) {
    if (
      typeof query.event_type !== "string" ||
      !isKnownAuditEventType(query.event_type)
    ) {
      invalid.push("event_type");
    } else {
      event_type = query.event_type;
    }
  }
  let target_entity_id: string | undefined;
  if (query.target_entity_id !== undefined) {
    if (
      typeof query.target_entity_id !== "string" ||
      !UUID_RE.test(query.target_entity_id)
    ) {
      invalid.push("target_entity_id");
    } else {
      target_entity_id = query.target_entity_id;
    }
  }
  let target_capsule_id: string | undefined;
  if (query.target_capsule_id !== undefined) {
    if (
      typeof query.target_capsule_id !== "string" ||
      !UUID_RE.test(query.target_capsule_id)
    ) {
      invalid.push("target_capsule_id");
    } else {
      target_capsule_id = query.target_capsule_id;
    }
  }
  let outcome: AuditOutcome | undefined;
  if (query.outcome !== undefined) {
    if (
      typeof query.outcome !== "string" ||
      !VALID_AUDIT_OUTCOMES.has(query.outcome)
    ) {
      invalid.push("outcome");
    } else {
      outcome = query.outcome as AuditOutcome;
    }
  }
  let start_time: Date | undefined;
  if (query.start_time !== undefined) {
    const d = asIsoDate(query.start_time);
    if (d === null) invalid.push("start_time");
    else start_time = d;
  }
  let end_time: Date | undefined;
  if (query.end_time !== undefined) {
    const d = asIsoDate(query.end_time);
    if (d === null) invalid.push("end_time");
    else end_time = d;
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedListRegulatorAuditEventsFilters = {
    lawful_basis_id,
    page,
    page_size,
  };
  if (event_type !== undefined) normalized.event_type = event_type;
  if (target_entity_id !== undefined) {
    normalized.target_entity_id = target_entity_id;
  }
  if (target_capsule_id !== undefined) {
    normalized.target_capsule_id = target_capsule_id;
  }
  if (outcome !== undefined) normalized.outcome = outcome;
  if (start_time !== undefined) normalized.start_time = start_time;
  if (end_time !== undefined) normalized.end_time = end_time;
  return { ok: true, normalized };
}

// WHAT: The regulator-view page-envelope.
export interface ListRegulatorAuditEventsView {
  lawful_basis_id: string;
  page: number;
  page_size: number;
  total: number;
  events: SafeAuditEventView[];
}

// WHAT: Discriminated result for the regulator-view list call.
//        403 codes map 1:1 to the 7 LawfulBasis enforcement
//        failures from getActiveLawfulBasisForRegulator
//        (`LAWFUL_BASIS_NOT_*` / `REGULATOR_TARGET_MISMATCH`);
//        404 reserved for LAWFUL_BASIS_NOT_FOUND.
export type ListRegulatorAuditEventsResult =
  | { ok: true; httpStatus: 200; view: ListRegulatorAuditEventsView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 500;
      code: string;
      message?: string;
    };

// WHAT: List audit_events bound to a specific LawfulBasis row
//        for the caller acting as the REGULATOR target of that
//        grant. Calls into the LIVE
//        getActiveLawfulBasisForRegulator primitive for the
//        9-condition enforcement check; on success queries
//        audit_events WHERE lawful_basis_id = basis_id with
//        SAFE projection.
// INPUT: callerEntityId (the regulator acting); filters
//        (normalized + validated).
// OUTPUT: A ListRegulatorAuditEventsResult.
// WHY: Section 7 Wave 5 — ADR-0036 regulator-tier audit
//      access. Scope is naturally narrow: a regulator can only
//      see audit rows bound to a grant where THEY are the
//      target_entity_id (REGULATOR identity-binding from
//      ADR-0036 Sub-decision 6). Active basis + time-window +
//      hash-chain integrity + revocation status all checked
//      live per the 9-condition pattern; expired / revoked /
//      mismatched grants fail closed with 403.
export async function listRegulatorAuditEventsForCaller(
  callerEntityId: string,
  filters: NormalizedListRegulatorAuditEventsFilters,
): Promise<ListRegulatorAuditEventsResult> {
  const basisCheck = await getActiveLawfulBasisForRegulator(
    filters.lawful_basis_id,
    callerEntityId,
  );
  if (basisCheck.ok === false) {
    if (basisCheck.code === "LAWFUL_BASIS_NOT_FOUND") {
      return {
        ok: false,
        httpStatus: 404,
        code: "LAWFUL_BASIS_NOT_FOUND",
      };
    }
    if (
      basisCheck.code === "INTERNAL_ENFORCEMENT_ERROR" ||
      basisCheck.code === "LAWFUL_BASIS_NOT_LINKED_TO_AUDIT"
    ) {
      return {
        ok: false,
        httpStatus: 500,
        code: basisCheck.code,
      };
    }
    return {
      ok: false,
      httpStatus: 403,
      code: basisCheck.code,
    };
  }
  // Build the where clause: rows that carry this lawful_basis_id
  // (set by writeAuditEvent on regulator-bound emissions per
  // ADR-0036 Sub-decision 5) plus the optional filter set
  // AND-narrowing the result.
  const filterClauses: Prisma.AuditEventWhereInput[] = [
    { lawful_basis_id: filters.lawful_basis_id },
  ];
  if (filters.event_type !== undefined) {
    filterClauses.push({ event_type: filters.event_type });
  }
  if (filters.target_entity_id !== undefined) {
    filterClauses.push({ target_entity_id: filters.target_entity_id });
  }
  if (filters.target_capsule_id !== undefined) {
    filterClauses.push({ target_capsule_id: filters.target_capsule_id });
  }
  if (filters.outcome !== undefined) {
    filterClauses.push({ outcome: filters.outcome });
  }
  if (filters.start_time !== undefined || filters.end_time !== undefined) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (filters.start_time !== undefined) ts.gte = filters.start_time;
    if (filters.end_time !== undefined) ts.lte = filters.end_time;
    filterClauses.push({ timestamp: ts });
  }
  const where: Prisma.AuditEventWhereInput = { AND: filterClauses };
  const skip = (filters.page - 1) * filters.page_size;
  const [rows, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip,
      take: filters.page_size,
    }),
    prisma.auditEvent.count({ where }),
  ]);
  const filterKeys = Object.entries(filters)
    .filter(
      ([k, v]) =>
        k !== "lawful_basis_id" &&
        k !== "page" &&
        k !== "page_size" &&
        v !== undefined &&
        v !== null,
    )
    .map(([k]) => k);
  await emitAuditViewerRead(callerEntityId, "AUDIT_VIEW_REGULATOR", {
    lawful_basis_id: filters.lawful_basis_id,
    page: filters.page,
    page_size: filters.page_size,
    result_count: rows.length,
    filter_keys: filterKeys,
  });
  return {
    ok: true,
    httpStatus: 200,
    view: {
      lawful_basis_id: filters.lawful_basis_id,
      page: filters.page,
      page_size: filters.page_size,
      total,
      events: rows.map(projectAuditEvent),
    },
  };
}
