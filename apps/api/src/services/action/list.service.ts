// FILE: list.service.ts
// PURPOSE: The ADR-0057 §9 Action list service per the route-table
//          row `GET /api/v1/actions` — self-scope by default
//          (caller's own Action rows where source_entity_id ==
//          callerEntityId); `org_scope = true` requires
//          can_admin_org and returns every Action row in the
//          caller's org. Standard page/page_size pagination capped
//          at 100. Optional status + risk_tier + action_type
//          filters. Safe-view-only projection (no payload, no
//          envelope, no routing internals).
// CONNECTS TO:
//   - apps/api/src/services/action/views.ts (SafeActionView
//     mapper)
//   - apps/api/src/services/action/get.service.ts (the
//     `callerHasAdminScopeOverOrg`-shaped TAR + getOrgEntityId
//     check pattern; re-implemented locally for the list scope so
//     no cross-service coupling is introduced)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - apps/api/src/routes/actions.routes.ts (the list route
//     consumer)
//   - packages/database (prisma + Prisma types)
//   - ADR-0057 §9 (route table) + §10 (forbidden-fields list)
//
// FOUNDER LOCKS (per the autonomous-operator continuation):
//   - Self-scope by default: where source_entity_id ==
//     callerEntityId AND deleted_at IS NULL. No cross-source leak
//     at the query tier (mirrors the DRIFT-9 cross-org leak guard
//     pattern but for source-entity).
//   - org_scope=true requires can_admin_org-ACTIVE on the caller's
//     TAR AND requires the caller to resolve to a COMPANY org via
//     getOrgEntityId. The resulting query filter is
//     `where: { org_entity_id: callerOrgId, deleted_at: null }`;
//     cross-org rows are never returned.
//   - Standard pagination: page (1-based) + page_size (1..100,
//     default 50). Page-of-results + total-matching count
//     returned together so callers can render pager UI.
//   - Optional filters: status (single ActionStatus or array),
//     risk_tier (single ActionRiskTier or array), action_type
//     (single ActionType or array). All filters compose AS AND
//     with the scope predicate.
//   - Order: by created_at DESC (newest first) — matches the
//     Action Inbox UX intent in ADR-0057 §12.
//   - Forbidden fields per ADR-0057 §10 are NEVER returned in any
//     item or page envelope.

import { prisma } from "@niov/database";
import type {
  ActionRiskTier,
  ActionStatus,
  ActionType,
  Prisma,
} from "@prisma/client";
import { projectActionView, type SafeActionView } from "./views.js";
import { safeApproverReason } from "../governance/escalation.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { resolveEntityNames, type ResolvedName } from "../identity/resolve-entities.js";

// WHAT: Extract the recipient entity_id from an Action's payload_redacted JSON,
//        for SEND_INTERNAL_NOTIFICATION rows that carry the recipient there
//        rather than in the structural target_entity_id (governance) column.
// INPUT: the payload_redacted JSON value (Prisma JsonValue).
// OUTPUT: the recipient entity_id string, or null.
// WHY: ADR-0057 §10 Amendment 1 — the notification's recipient is the
//      conceptual target. We read it server-side ONLY to resolve a display
//      label; the payload itself and the UUID never leave the service tier.
export function recipientIdFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const rid = (payload as Record<string, unknown>).recipient_entity_id;
  return typeof rid === "string" && rid.length > 0 ? rid : null;
}

// WHAT: The effective target id for label resolution: the structural
//        target_entity_id if set, else the payload recipient (notifications).
// WHY: keeps batch-resolution + per-row labeling consistent.
function effectiveTargetId(
  target_entity_id: string | null,
  payload_redacted: unknown,
): string | null {
  return target_entity_id ?? recipientIdFromPayload(payload_redacted);
}

// WHAT: Resolve an Action's target + source entity ids to SAFE display-name
//        labels (never the UUID). null when there is no id or it is unresolved.
// INPUT: the resolved-names map + the two ids off the Action row.
// OUTPUT: { target_label, requester_label } — display names or null.
// WHY: ADR-0057 §10 Amendment 1 — the approver/admin sees "to David Odie", not
//      a routing UUID. Resolution is a display-name projection; the UUIDs never
//      leave the service tier.
function labelsFor(
  names: Map<string, ResolvedName>,
  target_id: string | null,
  source_entity_id: string | null,
): { target_label: string | null; requester_label: string | null } {
  const pick = (id: string | null): string | null => {
    if (id === null) return null;
    const r = names.get(id);
    // Unresolved → null so the UI shows "recipient unavailable", never a UUID.
    return r === undefined || r.unresolved ? null : r.display_name;
  };
  return { target_label: pick(target_id), requester_label: pick(source_entity_id) };
}

// WHAT: Maximum number of Action rows returned in one page.
//        Mirrors MAX_AUDIT_EVENTS_PAGE_SIZE = 100 precedent.
// INPUT: None.
// OUTPUT: The number 100.
// WHY: Hard-cap so a malicious / buggy caller cannot drain the
//      whole table in one request.
export const MAX_ACTIONS_PAGE_SIZE = 100;
export const DEFAULT_ACTIONS_PAGE_SIZE = 50;

// WHAT: The narrow set of canonical ActionStatus / ActionType /
//        ActionRiskTier enum literals (string-shaped) used by the
//        filter validator.
// INPUT: None.
// OUTPUT: Frozen Sets.
// WHY: Centralized so the validator cannot drift from the Prisma
//      enum.
const VALID_ACTION_STATUSES: ReadonlySet<string> = new Set<string>([
  "PROPOSED",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "REJECTED",
  "EXPIRED",
]);
const VALID_ACTION_RISK_TIERS: ReadonlySet<string> = new Set<string>([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
const VALID_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  "RECORD_CAPSULE",
  "PROPOSE_PERMISSION_GRANT",
  "SEND_INTERNAL_NOTIFICATION",
  "INVOKE_CONNECTOR",
]);

// WHAT: The query-string-shaped input the list route accepts. All
//        fields are optional and string-shaped (HTTP query semantics).
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Route handlers pass `request.query` straight here; the
//      validator clamps + normalizes.
export interface ListActionsQuery {
  org_scope?: unknown;
  page?: unknown;
  page_size?: unknown;
  status?: unknown;
  risk_tier?: unknown;
  action_type?: unknown;
}

// WHAT: The normalized + clamped filter shape after validation.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Internal contract between validator and service.
export interface NormalizedListFilters {
  org_scope: boolean;
  page: number;
  page_size: number;
  status?: ActionStatus[];
  risk_tier?: ActionRiskTier[];
  action_type?: ActionType[];
}

// WHAT: Validate + normalize the query string. Coerce string
//        page/page_size to integers; clamp page_size to
//        [1, MAX_ACTIONS_PAGE_SIZE]; default page=1 + page_size=50.
//        Treat any non-true value of org_scope as false (only
//        "true" or boolean true enables the org-scope path).
// INPUT: A ListActionsQuery (typically request.query).
// OUTPUT: { ok: true, normalized } | { ok: false, code,
//          invalid_fields }.
// WHY: Pulled out so the route handler stays thin and the
//      service can unit-test the normalizer independently.
export function validateListActionsQuery(
  query: ListActionsQuery | undefined | null,
):
  | { ok: true; normalized: NormalizedListFilters }
  | {
      ok: false;
      code: "INVALID_FIELD";
      invalid_fields: string[];
    } {
  const q = query ?? {};
  const invalid: string[] = [];

  // org_scope: accept the string "true" / "false" or the boolean.
  let org_scope = false;
  if (q.org_scope !== undefined) {
    if (q.org_scope === true || q.org_scope === "true") {
      org_scope = true;
    } else if (q.org_scope === false || q.org_scope === "false") {
      org_scope = false;
    } else {
      invalid.push("org_scope");
    }
  }

  // page: 1-based integer.
  let page = 1;
  if (q.page !== undefined) {
    const parsed = typeof q.page === "number" ? q.page : Number(q.page);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      invalid.push("page");
    } else {
      page = parsed;
    }
  }

  // page_size: integer in [1, MAX_ACTIONS_PAGE_SIZE]. Default 50.
  let page_size = DEFAULT_ACTIONS_PAGE_SIZE;
  if (q.page_size !== undefined) {
    const parsed =
      typeof q.page_size === "number" ? q.page_size : Number(q.page_size);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > MAX_ACTIONS_PAGE_SIZE
    ) {
      invalid.push("page_size");
    } else {
      page_size = parsed;
    }
  }

  // status / risk_tier / action_type: each accepts a single enum
  // string or a comma-separated list. Unknown values are rejected.
  function parseEnumList(
    raw: unknown,
    fieldName: string,
    valid: ReadonlySet<string>,
  ): string[] | undefined {
    if (raw === undefined) return undefined;
    let values: string[];
    if (Array.isArray(raw)) {
      values = raw.map(String);
    } else if (typeof raw === "string") {
      values = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    } else {
      invalid.push(fieldName);
      return undefined;
    }
    if (values.length === 0) {
      invalid.push(fieldName);
      return undefined;
    }
    for (const v of values) {
      if (!valid.has(v)) {
        invalid.push(fieldName);
        return undefined;
      }
    }
    return values;
  }

  const statusList = parseEnumList(q.status, "status", VALID_ACTION_STATUSES);
  const riskTierList = parseEnumList(
    q.risk_tier,
    "risk_tier",
    VALID_ACTION_RISK_TIERS,
  );
  const actionTypeList = parseEnumList(
    q.action_type,
    "action_type",
    VALID_ACTION_TYPES,
  );

  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }

  const normalized: NormalizedListFilters = {
    org_scope,
    page,
    page_size,
  };
  if (statusList !== undefined) {
    normalized.status = statusList as ActionStatus[];
  }
  if (riskTierList !== undefined) {
    normalized.risk_tier = riskTierList as ActionRiskTier[];
  }
  if (actionTypeList !== undefined) {
    normalized.action_type = actionTypeList as ActionType[];
  }
  return { ok: true, normalized };
}

// WHAT: The list-response shape returned by listActionsForCaller.
//        items + page + page_size + total so the route can render
//        pager UI.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Mirrors QueryAuditEventsResult precedent.
export interface ListActionsView {
  items: SafeActionView[];
  page: number;
  page_size: number;
  total: number;
}

// WHAT: Discriminated-union result returned by
//        listActionsForCaller. 200 success, 403 ORG_SCOPE_FORBIDDEN
//        when caller lacks can_admin_org for the requested scope,
//        404 NOT_IN_ANY_ORG when org_scope is requested but the
//        caller has no parent org.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Same shape family as create / cancel / get.
export type ListActionsResult =
  | { ok: true; httpStatus: 200; view: ListActionsView }
  | {
      ok: false;
      httpStatus: 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: TAR-authoritative check that the caller has
//        can_admin_org=true (ACTIVE) — does NOT verify same-org
//        because the org-scope query already scopes to the
//        caller's resolved org.
// INPUT: callerEntityId.
// OUTPUT: True if the caller has an ACTIVE TAR with
//         can_admin_org=true.
// WHY: Pulled out for clarity; the same gate logic is reused in
//      get.service.ts but the same-org check is implicit here
//      (we only query within the caller's resolved org).
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

// WHAT: List Actions for the caller per the normalized filters.
// INPUT: callerEntityId + NormalizedListFilters.
// OUTPUT: A ListActionsResult.
// WHY: Centralized list-time service. Step-wise:
//      1. Resolve scope predicate:
//         - org_scope=false → { source_entity_id: callerEntityId }
//         - org_scope=true  → verify can_admin_org (403 on miss);
//                             resolve caller's org via getOrgEntityId
//                             (404 NOT_IN_ANY_ORG on miss); use
//                             { org_entity_id: callerOrgId }.
//      2. Compose AS-AND with deleted_at = null + filter clauses.
//      3. Run findMany + count concurrently for the page.
//      4. Project each row to SafeActionView.
export async function listActionsForCaller(
  callerEntityId: string,
  filters: NormalizedListFilters,
): Promise<ListActionsResult> {
  let scopePredicate: Prisma.ActionWhereInput;
  if (filters.org_scope === true) {
    const hasAdmin = await callerHasAdminCapability(callerEntityId);
    if (!hasAdmin) {
      return {
        ok: false,
        httpStatus: 403,
        code: "ORG_SCOPE_FORBIDDEN",
        message:
          "org_scope=true requires can_admin_org on the caller's TAR.",
      };
    }
    let callerOrgId: string;
    try {
      callerOrgId = await getOrgEntityId(callerEntityId);
    } catch {
      return {
        ok: false,
        httpStatus: 404,
        code: "NOT_IN_ANY_ORG",
      };
    }
    scopePredicate = { org_entity_id: callerOrgId };
  } else {
    scopePredicate = { source_entity_id: callerEntityId };
  }

  const where: Prisma.ActionWhereInput = {
    ...scopePredicate,
    deleted_at: null,
  };
  if (filters.status !== undefined && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  if (filters.risk_tier !== undefined && filters.risk_tier.length > 0) {
    where.risk_tier = { in: filters.risk_tier };
  }
  if (filters.action_type !== undefined && filters.action_type.length > 0) {
    where.action_type = { in: filters.action_type };
  }

  const skip = (filters.page - 1) * filters.page_size;
  const [rows, total] = await Promise.all([
    prisma.action.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: filters.page_size,
    }),
    prisma.action.count({ where }),
  ]);

  // Resolve target + source entity ids to SAFE display labels for this page
  // (ADR-0057 §10 Amendment 1). One batched lookup; UUIDs never leave here.
  // Target falls back to the payload recipient for notification rows.
  const names = await resolveEntityNames(
    rows.flatMap((r) => [
      effectiveTargetId(r.target_entity_id, r.payload_redacted),
      r.source_entity_id,
    ]),
  );

  // [GAP-E] Sender-visible rejection reason: for this page's REJECTED actions
  // with a paired escalation, batch-read the escalations' resolution metadata
  // and extract the approver's human reason as the same SAFE bounded scalar
  // the audit trail records (safeApproverReason). The escalation row stays
  // the canonical record — this is read-side projection only.
  const rejectedEscalationIds = rows
    .filter((r) => r.status === "REJECTED" && r.escalation_id !== null)
    .map((r) => r.escalation_id as string);
  const reasonByEscalationId = new Map<string, string | null>();
  if (rejectedEscalationIds.length > 0) {
    const escalations = await prisma.escalationRequest.findMany({
      where: { escalation_id: { in: rejectedEscalationIds } },
      select: { escalation_id: true, resolution_metadata: true },
    });
    for (const e of escalations) {
      reasonByEscalationId.set(
        e.escalation_id,
        safeApproverReason(e.resolution_metadata as Prisma.InputJsonValue),
      );
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    view: {
      items: rows.map((r) =>
        projectActionView(
          r,
          undefined,
          {
            ...labelsFor(
              names,
              effectiveTargetId(r.target_entity_id, r.payload_redacted),
              r.source_entity_id,
            ),
            ...(r.status === "REJECTED" && r.escalation_id !== null
              ? { not_approved_reason: reasonByEscalationId.get(r.escalation_id) ?? null }
              : {}),
          },
        ),
      ),
      page: filters.page,
      page_size: filters.page_size,
      total,
    },
  };
}
