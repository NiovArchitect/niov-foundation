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
  isKnownAuditEventType,
  prisma,
  verifyAuditChain,
  writeAuditEvent,
} from "@niov/database";
import type { AuditEventType } from "@niov/database";
import type { AuditEvent, AuditOutcome, Prisma } from "@prisma/client";

// WHAT: Default page size for the list route. Mirrors the
//        existing MAX_AUDIT_EVENTS_PAGE_SIZE = 100 cap (declared
//        in packages/database; re-used here).
export const DEFAULT_AUDIT_EVENTS_PAGE_SIZE = 50;

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
}

// WHAT: The normalized + clamped filter shape after validation.
export interface NormalizedListAuditEventsFilters {
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
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedListAuditEventsFilters = { page, page_size };
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

export interface VerifyAuditChainView {
  actor_entity_id: string;
  valid: boolean;
  total_events: number;
  broken_at: string | null;
}

export type VerifyAuditChainCallerResult =
  | { ok: true; httpStatus: 200; view: VerifyAuditChainView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

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
    | "AUDIT_VIEW_VERIFY_CHAIN",
  meta: Record<string, unknown> = {},
): Promise<void> {
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: { action, ...meta },
  });
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
  const where: Prisma.AuditEventWhereInput = {
    actor_entity_id: callerEntityId,
  };
  if (filters.event_type !== undefined) where.event_type = filters.event_type;
  if (filters.target_entity_id !== undefined) {
    where.target_entity_id = filters.target_entity_id;
  }
  if (filters.target_capsule_id !== undefined) {
    where.target_capsule_id = filters.target_capsule_id;
  }
  if (filters.outcome !== undefined) where.outcome = filters.outcome;
  if (filters.start_time !== undefined || filters.end_time !== undefined) {
    where.timestamp = {};
    if (filters.start_time !== undefined) {
      where.timestamp.gte = filters.start_time;
    }
    if (filters.end_time !== undefined) {
      where.timestamp.lte = filters.end_time;
    }
  }
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
  // not values) per the CONSOLE_READ pattern.
  const filterKeys = Object.entries(filters)
    .filter(
      ([k, v]) =>
        k !== "page" && k !== "page_size" && v !== undefined && v !== null,
    )
    .map(([k]) => k);
  await emitAuditViewerRead(callerEntityId, "AUDIT_VIEW_LIST", {
    filter_keys: filterKeys,
    page: filters.page,
    page_size: filters.page_size,
    result_count: rows.length,
  });
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
): Promise<GetAuditEventResult> {
  if (typeof auditId !== "string" || !UUID_RE.test(auditId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_AUDIT_ID" };
  }
  const row = await prisma.auditEvent.findFirst({
    where: { audit_id: auditId, actor_entity_id: callerEntityId },
  });
  if (row === null) {
    return { ok: false, httpStatus: 404, code: "AUDIT_EVENT_NOT_FOUND" };
  }
  // Previous + next references scoped to the same caller's
  // chain. Both queries narrow to actor_entity_id ==
  // callerEntityId so they can never traverse into another
  // entity's chain.
  const [previousRow, nextRow] = await Promise.all([
    prisma.auditEvent.findFirst({
      where: {
        actor_entity_id: callerEntityId,
        timestamp: { lt: row.timestamp },
      },
      orderBy: { timestamp: "desc" },
      select: { audit_id: true, event_hash: true, timestamp: true },
    }),
    prisma.auditEvent.findFirst({
      where: {
        actor_entity_id: callerEntityId,
        timestamp: { gt: row.timestamp },
      },
      orderBy: { timestamp: "asc" },
      select: { audit_id: true, event_hash: true, timestamp: true },
    }),
  ]);
  await emitAuditViewerRead(callerEntityId, "AUDIT_VIEW_EVENT", {
    audit_id: auditId,
  });
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

// WHAT: Verify the caller's own audit chain. Walks every row
//        in the caller's chain via the LIVE verifyAuditChain
//        primitive and surfaces the `{ valid, totalEvents,
//        brokenAt }` result.
// INPUT: callerEntityId.
// OUTPUT: A VerifyAuditChainCallerResult.
// WHY: Section 7 RULE 13 — hash-chain verification is the
//      single most-load-bearing operator surface for tamper
//      detection. Exposing the primitive at HTTP tier lets a
//      reviewer confirm their own chain is intact without
//      requiring DB access.
export async function verifyAuditChainForCaller(
  callerEntityId: string,
): Promise<VerifyAuditChainCallerResult> {
  const result = await verifyAuditChain(callerEntityId);
  await emitAuditViewerRead(callerEntityId, "AUDIT_VIEW_VERIFY_CHAIN", {
    valid: result.valid,
    total_events: result.totalEvents,
  });
  return {
    ok: true,
    httpStatus: 200,
    view: {
      actor_entity_id: callerEntityId,
      valid: result.valid,
      total_events: result.totalEvents,
      broken_at: result.brokenAt,
    },
  };
}
