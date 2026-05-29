// FILE: attempt-list.service.ts
// PURPOSE: ADR-0057 Wave 10 ActionAttempt list service. Returns
//          a paginated list of SafeActionAttemptView rows for one
//          specific parent Action. Same authorization spine as
//          attempt.service.ts (source self-scope OR
//          can_admin_org-over-same-org); RULE 0
//          enumeration-prevention 404 for non-source non-admin.
//          Mirrors the list.service.ts pagination + filter
//          discipline but scoped to one parent action_id; no
//          org_scope query param (the list is always implicitly
//          scoped to the parent Action's org via the parent's
//          authorization check).
// CONNECTS TO:
//   - apps/api/src/services/action/attempt.service.ts
//     (projectActionAttemptView + SafeActionAttemptView; same
//     no-leak projection)
//   - apps/api/src/services/action/list.service.ts (pagination
//     pattern; max page size cap; sort-order discipline)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId
//     for the can_admin_org cross-check)
//   - apps/api/src/routes/actions.routes.ts (the route consumer)
//   - packages/database (prisma + Prisma types)
//   - ADR-0057 §9 (forbidden-fields per §10)
//
// FOUNDER LOCKS:
//   - Self-scope by default: caller MUST be source_entity_id of the
//     parent Action.
//   - can_admin_org callers in the same org as Action.org_entity_id
//     can also read. TAR-authoritative.
//   - 404 ACTION_NOT_FOUND for unknown action_id (RULE 0
//     enumeration-prevention; same envelope as the parent action's
//     get/cancel/attempt-detail routes).
//   - Standard pagination: page (1-based) + page_size
//     (1..MAX_ATTEMPTS_PAGE_SIZE, default DEFAULT_ATTEMPTS_PAGE_SIZE).
//     ActionAttempt rows per Action are bounded by the resolved
//     retry_budget (typically <=3 today; configurable per PR #49)
//     so the per-page cap is small.
//   - Sort: by attempt_number ASC. Chronological matches the
//     executor's monotonic numbering + matches the Control Tower
//     UX intent.
//   - Optional filter: outcome (single ActionAttemptOutcome or
//     array). Composes AS AND with the action_id scope predicate.
//   - Soft-delete invisibility: deleted_at IS NULL composed AS AND
//     with every scope predicate.
//   - Forbidden fields per ADR-0057 §10 are NEVER returned in any
//     item or page envelope (projectActionAttemptView enforces).

import { prisma } from "@niov/database";
import type { ActionAttemptOutcome, Prisma } from "@prisma/client";
import {
  projectActionAttemptView,
  type SafeActionAttemptView,
} from "./attempt.service.js";
import { getOrgEntityId } from "../governance/org.js";

// WHAT: Maximum number of ActionAttempt rows returned in one page.
//        Mirrors MAX_ACTIONS_PAGE_SIZE = 100 precedent but a single
//        Action almost always has <=3 attempts (per RETRY_BUDGET);
//        the cap exists for defense-in-depth, not realistic
//        pagination needs.
export const MAX_ATTEMPTS_PAGE_SIZE = 100;
export const DEFAULT_ATTEMPTS_PAGE_SIZE = 50;

// WHAT: The narrow set of canonical ActionAttemptOutcome enum
//        literals (string-shaped) used by the filter validator.
const VALID_ATTEMPT_OUTCOMES: ReadonlySet<string> = new Set<string>([
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
]);

// WHAT: UUID guard mirrors the other action services.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// WHAT: The query-string-shaped input the list-attempts route
//        accepts. All fields optional; string-shaped per HTTP
//        query semantics.
export interface ListAttemptsQuery {
  page?: unknown;
  page_size?: unknown;
  outcome?: unknown;
}

// WHAT: The normalized + clamped filter shape after validation.
export interface NormalizedListAttemptsFilters {
  page: number;
  page_size: number;
  outcome?: ActionAttemptOutcome[];
}

// WHAT: Coerce a string-like to a positive integer; return null on
//        failure.
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

// WHAT: Coerce an outcome filter to a non-empty array of valid
//        ActionAttemptOutcome literals, or null on validation
//        failure.
function asOutcomeArray(value: unknown): ActionAttemptOutcome[] | null {
  if (value === undefined) return null;
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  if (raw.length === 0) return null;
  const out: ActionAttemptOutcome[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !VALID_ATTEMPT_OUTCOMES.has(v)) return null;
    out.push(v as ActionAttemptOutcome);
  }
  return out;
}

// WHAT: Validate + normalize the query string per the list-attempts
//        contract.
// INPUT: A ListAttemptsQuery (typically request.query).
// OUTPUT: { ok: true, normalized } | { ok: false, code,
//         invalid_fields }.
// WHY: Mirrors list.service.ts's validator pattern. outcome can be
//      passed once OR repeated; both forms normalize to an array.
export function validateListAttemptsQuery(
  query: ListAttemptsQuery,
):
  | { ok: true; normalized: NormalizedListAttemptsFilters }
  | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[] } {
  const invalid: string[] = [];
  let page = 1;
  if (query.page !== undefined) {
    const p = asPositiveInt(query.page);
    if (p === null) invalid.push("page");
    else page = p;
  }
  let page_size = DEFAULT_ATTEMPTS_PAGE_SIZE;
  if (query.page_size !== undefined) {
    const ps = asPositiveInt(query.page_size);
    if (ps === null || ps > MAX_ATTEMPTS_PAGE_SIZE) {
      invalid.push("page_size");
    } else {
      page_size = ps;
    }
  }
  let outcome: ActionAttemptOutcome[] | undefined;
  if (query.outcome !== undefined) {
    const arr = asOutcomeArray(query.outcome);
    if (arr === null) invalid.push("outcome");
    else outcome = arr;
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: NormalizedListAttemptsFilters = { page, page_size };
  if (outcome !== undefined) normalized.outcome = outcome;
  return { ok: true, normalized };
}

// WHAT: The page-envelope shape returned by listActionAttemptsForCaller.
export interface ListActionAttemptsView {
  action_id: string;
  page: number;
  page_size: number;
  total: number;
  attempts: SafeActionAttemptView[];
}

// WHAT: Discriminated-union result returned by
//        listActionAttemptsForCaller.
export type ListActionAttemptsResult =
  | { ok: true; httpStatus: 200; view: ListActionAttemptsView }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404;
      code: string;
      message?: string;
    };

// WHAT: TAR-authoritative check that the caller has can_admin_org
//        AND resolves to the same org as the parent Action.
// INPUT: callerEntityId + the parent Action's org_entity_id.
// OUTPUT: Boolean.
// WHY: Mirrors attempt.service.ts's callerHasAdminScopeOverOrg.
//      Duplicated locally per the "each action read service owns
//      its own gate logic explicitly" precedent (list.service.ts
//      L17-22 prose).
async function callerHasAdminScopeOverOrg(
  callerEntityId: string,
  actionOrgEntityId: string,
): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: callerEntityId },
    select: { can_admin_org: true, status: true },
  });
  if (tar === null || tar.status !== "ACTIVE" || tar.can_admin_org !== true) {
    return false;
  }
  try {
    const callerOrgId = await getOrgEntityId(callerEntityId);
    return callerOrgId === actionOrgEntityId;
  } catch {
    return false;
  }
}

// WHAT: Fetch a paginated list of SafeActionAttemptView for one
//        parent Action. Same authorization spine as
//        getActionAttemptForCaller.
// INPUT: callerEntityId + actionId + normalized filters.
// OUTPUT: A ListActionAttemptsResult.
// WHY: Centralizes the read-side per ADR-0057 §9 Wave 10. Step-wise:
//      1. Validate actionId UUID (400 INVALID_ACTION_ID).
//      2. Load the parent Action (404 ACTION_NOT_FOUND on missing
//         OR soft-delete).
//      3. Ownership check (RULE 0 enumeration-prevention 404 on
//         non-source non-admin).
//      4. Build the AS-AND composed where filter (action_id +
//         deleted_at IS NULL + optional outcome). Run findMany +
//         count in parallel.
//      5. Load latest ActionResult per attempt for the page slice
//         (single grouped query; map by attempt_id) so the page
//         envelope mirrors the detail-view shape.
//      6. Project each row through projectActionAttemptView.
export async function listActionAttemptsForCaller(
  callerEntityId: string,
  actionId: string,
  filters: NormalizedListAttemptsFilters,
): Promise<ListActionAttemptsResult> {
  if (typeof actionId !== "string" || !UUID_RE.test(actionId)) {
    return { ok: false, httpStatus: 400, code: "INVALID_ACTION_ID" };
  }

  const action = await prisma.action.findUnique({
    where: { action_id: actionId },
  });
  if (action === null || action.deleted_at !== null) {
    return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
  }

  const isSource = action.source_entity_id === callerEntityId;
  if (!isSource) {
    const isOrgAdmin = await callerHasAdminScopeOverOrg(
      callerEntityId,
      action.org_entity_id,
    );
    if (!isOrgAdmin) {
      // RULE 0 enumeration-prevention: same 404 envelope as the
      // attempt-detail route's stranger-path.
      return { ok: false, httpStatus: 404, code: "ACTION_NOT_FOUND" };
    }
  }

  const where: Prisma.ActionAttemptWhereInput = {
    action_id: actionId,
    deleted_at: null,
  };
  if (filters.outcome !== undefined && filters.outcome.length > 0) {
    where.outcome = { in: filters.outcome };
  }

  const skip = (filters.page - 1) * filters.page_size;
  const [rows, total] = await Promise.all([
    prisma.actionAttempt.findMany({
      where,
      orderBy: { attempt_number: "asc" },
      skip,
      take: filters.page_size,
    }),
    prisma.actionAttempt.count({ where }),
  ]);

  // Bulk-load the latest ActionResult per attempt for the page
  // slice. For attempts without results (FAILED / TIMED_OUT /
  // RUNNING / PENDING), the map lookup returns undefined → null.
  // One query irrespective of page size.
  const attemptIds = rows.map((r) => r.attempt_id);
  const resultsByAttempt = new Map<
    string,
    { result_summary: string; result_metadata: unknown }
  >();
  if (attemptIds.length > 0) {
    const results = await prisma.actionResult.findMany({
      where: { attempt_id: { in: attemptIds } },
      orderBy: { created_at: "desc" },
      select: {
        attempt_id: true,
        result_summary: true,
        result_metadata: true,
      },
    });
    // findMany returns all results; keep only the most recent per
    // attempt_id (orderBy desc + Map's set-on-first-encounter).
    for (const r of results) {
      if (!resultsByAttempt.has(r.attempt_id)) {
        resultsByAttempt.set(r.attempt_id, {
          result_summary: r.result_summary,
          result_metadata: r.result_metadata,
        });
      }
    }
  }

  const attempts = rows.map((row) =>
    projectActionAttemptView(row, resultsByAttempt.get(row.attempt_id) ?? null),
  );

  return {
    ok: true,
    httpStatus: 200,
    view: {
      action_id: actionId,
      page: filters.page,
      page_size: filters.page_size,
      total,
      attempts,
    },
  };
}
