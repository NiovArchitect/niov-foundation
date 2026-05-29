// FILE: notification-read.service.ts
// PURPOSE: ADR-0057 Wave 12 internal-only notification inbox read
//          surface. Consumes the Wave 11 Notification substrate
//          (NEW Prisma model + NotificationService) and exposes the
//          recipient-self-scope inbox: list (paginated, optional
//          filters), idempotent mark-as-read, RULE 10 soft-delete
//          dismiss. NO external delivery; NO new audit literals;
//          NO admin / cross-recipient surfaces.
// CONNECTS TO:
//   - packages/database (prisma; the Wave 11 Notification model)
//   - apps/api/src/services/notification/notification.service.ts
//     (Wave 11 NotificationService — write-side; this file is the
//     read-side companion)
//   - apps/api/src/routes/notification.routes.ts (the route
//     consumer)
//   - apps/api/src/services/action/list.service.ts (pagination
//     pattern precedent; MAX_ACTIONS_PAGE_SIZE = 100)
//
// FOUNDER LOCKS (per Wave 12 Founder direction):
//   - Self-scope only at sub-phase 1: caller MUST be
//     recipient_entity_id. No admin / org-scope path at Wave 12;
//     adding admin scope requires its own QLOCK to ensure the
//     no-leak + opt-out story is intact at the broader surface.
//   - body_redacted is NEVER projected on the list route per
//     Founder direction (only body_summary surfaces; body_redacted
//     stays on the row for future detail-view UX if needed).
//   - Mark-as-read + dismiss are both idempotent — repeated calls
//     for an already-read / already-dismissed notification return
//     200 with the same SafeNotificationView; no re-fire of
//     timestamps.
//   - Enumeration-safe 404: cross-recipient + unknown id +
//     soft-deleted (when looked up at mark-read time) collapse to
//     the same NOTIFICATION_NOT_FOUND envelope. A non-owner caller
//     cannot distinguish "this id doesn't exist" from "this id
//     belongs to someone else".
//   - Soft-delete invisibility: deleted_at IS NULL composed AS-AND
//     with every list-tier filter. Dismiss sets deleted_at; the
//     row stays in the table (RULE 10), but disappears from the
//     inbox list.
//   - No external side effects. No provider delivery. No webhook.
//     The handler-tier writes the row; the read-tier surfaces it.

import { prisma } from "@niov/database";
import type { Prisma } from "@prisma/client";

// WHAT: Maximum number of Notification rows returned in one page.
//        Mirrors MAX_ACTIONS_PAGE_SIZE = 100 precedent. Defense-
//        in-depth cap so a malicious / buggy caller cannot drain
//        the whole inbox in one request.
export const MAX_NOTIFICATIONS_PAGE_SIZE = 100;
export const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 50;

// WHAT: UUID guard mirrors the other Foundation services.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: Derived read-state label for the list-view UX. Computed
//        from read_at column; persisted state stays as columns
//        per the Wave 11 schema design (no NotificationStatus
//        enum).
//   * UNREAD: read_at IS NULL
//   * READ: read_at IS NOT NULL
//   * (DISMISSED rows are filtered out at the query tier; never
//     surface on the list route.)
export type NotificationStatusLabel = "UNREAD" | "READ";

// WHAT: SAFE projection of a Notification row for the inbox list
//        + mark-read / dismiss route responses. Locks the response
//        contract at the type level so any future handler that
//        tries to add body_redacted, source_entity_id, or
//        org_entity_id to a downstream-facing response fails at
//        compile time.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: body_redacted is intentionally OMITTED from the list per the
//      Wave 12 Founder direction's "do not expose body_redacted
//      unless existing no-leak rules prove it is safe; default to
//      NOT projecting body_redacted in list route". source_entity_id
//      is also omitted at sub-phase 1 — the recipient knows the
//      message was sent on their behalf via an action; the sender's
//      raw entity_id is forensic-only and lives on the row + on the
//      back-referenced AuditEvent chain (queryable by admins, not
//      surfaced on the recipient's inbox).
export interface SafeNotificationView {
  notification_id: string;
  notification_class: string;
  body_summary: string;
  action_id: string | null;
  created_at: string;
  read_at: string | null;
  status: NotificationStatusLabel;
}

// WHAT: The query-string-shaped input the list route accepts. All
//        fields optional; string-shaped per HTTP query semantics.
export interface ListNotificationsQuery {
  page?: unknown;
  page_size?: unknown;
  unread_only?: unknown;
  notification_class?: unknown;
}

// WHAT: The normalized + clamped filter shape after validation.
export interface NormalizedListNotificationsFilters {
  page: number;
  page_size: number;
  unread_only: boolean;
  notification_class?: string;
}

// WHAT: Coerce a string-like to a positive integer; return null on
//        failure. Mirrors attempt-list.service.ts asPositiveInt.
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

// WHAT: Coerce a query-string boolean ("true" | true) to a strict
//        boolean. Any other value → false (lenient default; the
//        explicit positive-form is the only opt-in).
function asBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string" && value.toLowerCase() === "true") {
    return true;
  }
  return false;
}

// WHAT: Validate + normalize the list query string.
// INPUT: A ListNotificationsQuery (typically request.query).
// OUTPUT: { ok: true, normalized } | { ok: false, code,
//         invalid_fields }.
export function validateListNotificationsQuery(
  query: ListNotificationsQuery,
):
  | { ok: true; normalized: NormalizedListNotificationsFilters }
  | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[] } {
  const invalid: string[] = [];
  let page = 1;
  if (query.page !== undefined) {
    const p = asPositiveInt(query.page);
    if (p === null) invalid.push("page");
    else page = p;
  }
  let page_size = DEFAULT_NOTIFICATIONS_PAGE_SIZE;
  if (query.page_size !== undefined) {
    const ps = asPositiveInt(query.page_size);
    if (ps === null || ps > MAX_NOTIFICATIONS_PAGE_SIZE) {
      invalid.push("page_size");
    } else {
      page_size = ps;
    }
  }
  let notification_class: string | undefined;
  if (query.notification_class !== undefined) {
    if (
      typeof query.notification_class !== "string" ||
      query.notification_class.length === 0 ||
      query.notification_class.length > 64
    ) {
      invalid.push("notification_class");
    } else {
      notification_class = query.notification_class;
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedListNotificationsFilters = {
    page,
    page_size,
    unread_only: asBoolean(query.unread_only),
  };
  if (notification_class !== undefined) {
    normalized.notification_class = notification_class;
  }
  return { ok: true, normalized };
}

// WHAT: The page-envelope shape returned by listNotificationsForCaller.
export interface ListNotificationsView {
  page: number;
  page_size: number;
  total: number;
  notifications: SafeNotificationView[];
}

// WHAT: Discriminated-union result returned by
//        listNotificationsForCaller.
export type ListNotificationsResult =
  | { ok: true; httpStatus: 200; view: ListNotificationsView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: Discriminated-union result returned by
//        markNotificationReadForCaller +
//        dismissNotificationForCaller.
export type NotificationMutationResult =
  | { ok: true; httpStatus: 200; view: SafeNotificationView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: Project a raw Notification row to the SafeNotificationView.
// INPUT: A row with the safe column subset.
// OUTPUT: A SafeNotificationView.
// WHY: One projector so the forbidden-fields contract is enforced
//      by construction. body_redacted + source_entity_id +
//      org_entity_id + deleted_at + recipient_entity_id are NEVER
//      part of the SafeNotificationView shape — the type system
//      enforces this.
function projectNotificationView(row: {
  notification_id: string;
  notification_class: string;
  body_summary: string;
  action_id: string | null;
  created_at: Date;
  read_at: Date | null;
}): SafeNotificationView {
  return {
    notification_id: row.notification_id,
    notification_class: row.notification_class,
    body_summary: row.body_summary,
    action_id: row.action_id,
    created_at: row.created_at.toISOString(),
    read_at: row.read_at === null ? null : row.read_at.toISOString(),
    status: row.read_at === null ? "UNREAD" : "READ",
  };
}

// WHAT: SAFE column subset every read-side query selects. Excludes
//        body_redacted, source_entity_id, org_entity_id, deleted_at,
//        recipient_entity_id (already known via the caller scope).
const SAFE_NOTIFICATION_SELECT = {
  notification_id: true,
  notification_class: true,
  body_summary: true,
  action_id: true,
  created_at: true,
  read_at: true,
} as const;

// WHAT: List the caller's inbox notifications.
// INPUT: callerEntityId + normalized filters.
// OUTPUT: A ListNotificationsResult.
// WHY: Centralizes the read-side per ADR-0057 Wave 12. Self-scope
//      only at sub-phase 1 — every query has recipient_entity_id ==
//      callerEntityId AS-AND with deleted_at IS NULL composed at
//      the query tier so cross-recipient + dismissed rows never
//      enter the page envelope.
export async function listNotificationsForCaller(
  callerEntityId: string,
  filters: NormalizedListNotificationsFilters,
): Promise<ListNotificationsResult> {
  const where: Prisma.NotificationWhereInput = {
    recipient_entity_id: callerEntityId,
    deleted_at: null,
  };
  if (filters.unread_only) {
    where.read_at = null;
  }
  if (filters.notification_class !== undefined) {
    where.notification_class = filters.notification_class;
  }
  const skip = (filters.page - 1) * filters.page_size;
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: filters.page_size,
      select: SAFE_NOTIFICATION_SELECT,
    }),
    prisma.notification.count({ where }),
  ]);
  return {
    ok: true,
    httpStatus: 200,
    view: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      notifications: rows.map(projectNotificationView),
    },
  };
}

// WHAT: Mark one notification as read for the caller. Idempotent
//        — if read_at is already set, returns the existing view
//        without re-firing the timestamp.
// INPUT: callerEntityId + notificationId.
// OUTPUT: A NotificationMutationResult.
// WHY: Enumeration-safe 404 (cross-recipient OR unknown id OR
//      soft-deleted all collapse to NOTIFICATION_NOT_FOUND);
//      idempotent (RULE 4 audit attribution stays correct even
//      when callers spam the route).
export async function markNotificationReadForCaller(
  callerEntityId: string,
  notificationId: string,
): Promise<NotificationMutationResult> {
  if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_NOTIFICATION_ID" };
  }
  // Load the row scoped to the caller. The compound where doesn't
  // need a unique constraint because notification_id is already PK;
  // the recipient_entity_id + deleted_at filters narrow the
  // ownership + soft-delete dimension by composition.
  const existing = await prisma.notification.findFirst({
    where: {
      notification_id: notificationId,
      recipient_entity_id: callerEntityId,
      deleted_at: null,
    },
    select: SAFE_NOTIFICATION_SELECT,
  });
  if (existing === null) {
    return { ok: false, httpStatus: 404, code: "NOTIFICATION_NOT_FOUND" };
  }
  if (existing.read_at !== null) {
    // Already read — idempotent SUCCESS; no timestamp re-fire.
    return {
      ok: true,
      httpStatus: 200,
      view: projectNotificationView(existing),
    };
  }
  const now = new Date();
  // Update scoped to (notification_id + recipient_entity_id +
  // deleted_at IS NULL) for defense-in-depth — even if the row
  // gets soft-deleted between the load and the update, the
  // updateMany scope keeps a non-owner from accidentally racing in.
  const updated = await prisma.notification.updateMany({
    where: {
      notification_id: notificationId,
      recipient_entity_id: callerEntityId,
      deleted_at: null,
      read_at: null,
    },
    data: { read_at: now },
  });
  if (updated.count === 0) {
    // Concurrent race: someone else marked it read OR dismissed it
    // OR the row vanished. Re-read to surface the latest safe view
    // (which may now show read_at populated from the concurrent
    // mark) OR collapse to enumeration-safe 404 if dismissed.
    const after = await prisma.notification.findFirst({
      where: {
        notification_id: notificationId,
        recipient_entity_id: callerEntityId,
        deleted_at: null,
      },
      select: SAFE_NOTIFICATION_SELECT,
    });
    if (after === null) {
      return { ok: false, httpStatus: 404, code: "NOTIFICATION_NOT_FOUND" };
    }
    return {
      ok: true,
      httpStatus: 200,
      view: projectNotificationView(after),
    };
  }
  // Re-project from the in-memory row + the new timestamp; saves
  // a re-read while preserving the same SafeNotificationView shape.
  return {
    ok: true,
    httpStatus: 200,
    view: projectNotificationView({ ...existing, read_at: now }),
  };
}

// WHAT: Dismiss (RULE 10 soft-delete) one notification for the
//        caller. Idempotent — if deleted_at is already set, the
//        row is treated as not-found per enumeration-safe 404
//        (dismiss is a one-way state; re-dismissing a hidden
//        row should not reveal that it existed).
// INPUT: callerEntityId + notificationId.
// OUTPUT: A NotificationMutationResult — view reflects the row
//          after dismiss (read_at preserved; status echoes the
//          last known read state).
// WHY: deleted_at is the canonical RULE 10 marker. Setting it
//      removes the row from list views but preserves the row in
//      the database for forensic / audit reconstruction.
export async function dismissNotificationForCaller(
  callerEntityId: string,
  notificationId: string,
): Promise<NotificationMutationResult> {
  if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_NOTIFICATION_ID" };
  }
  const existing = await prisma.notification.findFirst({
    where: {
      notification_id: notificationId,
      recipient_entity_id: callerEntityId,
      deleted_at: null,
    },
    select: SAFE_NOTIFICATION_SELECT,
  });
  if (existing === null) {
    // Could be unknown id, cross-recipient, OR already-dismissed.
    // All three collapse to the same envelope per RULE 0
    // enumeration-prevention.
    return { ok: false, httpStatus: 404, code: "NOTIFICATION_NOT_FOUND" };
  }
  const now = new Date();
  const updated = await prisma.notification.updateMany({
    where: {
      notification_id: notificationId,
      recipient_entity_id: callerEntityId,
      deleted_at: null,
    },
    data: { deleted_at: now },
  });
  if (updated.count === 0) {
    // Concurrent dismiss race — already-dismissed by another
    // call. Collapse to 404 for enumeration consistency.
    return { ok: false, httpStatus: 404, code: "NOTIFICATION_NOT_FOUND" };
  }
  return {
    ok: true,
    httpStatus: 200,
    view: projectNotificationView(existing),
  };
}
