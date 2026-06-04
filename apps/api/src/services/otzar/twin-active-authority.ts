// FILE: twin-active-authority.ts
// PURPOSE: Phase EDX-4 PR 3 — MyTwinView active_authority_summary
//          sidecar per the [FOUNDER-AUTH — AUTONOMOUS EMPLOYEE DGI
//          STRUCTURAL RUNTIME COMPLETION] directive. Self-scoped
//          pure-function helper that projects the caller's
//          TwinAuthorityGrant inventory (PR #269 substrate; PR #270
//          routes) as a capacity-only summary so the everyday
//          employee can see "how many authorities have I granted
//          my Twin, when does the soonest expire, do any need
//          case-by-case attention" without exposing per-grant
//          substance.
//
//          DISTINCT from the existing `active_grants_summary`
//          sidecar (twin-active-grants.ts) which aggregates DM1-A
//          ConsentGrant + DM3-A TeamDelegation. This sidecar
//          aggregates only the EDX-4 TwinAuthorityGrant substrate;
//          both sidecars surface independently on MyTwinView.
//
//          A TwinAuthorityGrant is "active" when:
//          - the row exists with the caller as grantor_entity_id
//          - state = 'ACTIVE'
//          - (expires_at is null OR expires_at > now)
//
// PRIVACY INVARIANT:
//   - Returns capacity-only signals + a closed-vocab
//     `duration_classes_present` list.
//   - NEVER returns grant_id / grantee_entity_id / scope_id /
//     purpose_summary / constraints_json / connector_binding_id /
//     any per-grant substance.
//   - NEVER returns counts > 0 for any entity OTHER than the
//     caller.
//
// CONNECTS TO:
//   - packages/database (prisma.twinAuthorityGrant.findMany +
//     prisma.twinAuthorityGrant.count)
//   - apps/api/src/services/otzar/otzar.service.ts (consumed by
//     getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";
import type { TwinAuthorityDurationClass } from "@prisma/client";

// WHAT: Window for the "expiring soon" count. Grants whose
//        expires_at falls between now and (now + this window)
//        are considered expiring soon.
const EXPIRING_SOON_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// WHAT: SAFE projection of the caller's TwinAuthorityGrant
//        inventory. Used as a MyTwinView sidecar.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Capacity-only signals + a closed-vocab list of duration
//      classes the caller currently has at least one active
//      grant of. Enables the UI to render summaries like:
//      "You've granted 4 authorities to your Twin; 1 expires in
//       the next week; 2 are SESSION duration; you have 1
//       indefinite grant."
export interface TwinActiveAuthoritySummary {
  active_grant_count: number;
  expiring_soon_count: number;
  indefinite_grant_count: number;
  sensitive_case_by_case_count: number;
  most_recent_grant_at: string | null;
  next_expiry_at: string | null;
  has_revocable_grants: boolean;
  duration_classes_present: ReadonlyArray<TwinAuthorityDurationClass>;
}

// WHAT: Compute the caller's active authority summary.
// INPUT: callerEntityId — the resolved grantor.
// OUTPUT: TwinActiveAuthoritySummary.
// WHY: One bounded findMany + scalar derivations. has_revocable_
//      grants is the active_grant_count > 0 boolean (every ACTIVE
//      grant the caller owns is revocable; revoked / consumed /
//      expired grants are excluded by the active filter).
export async function computeActiveAuthoritySummaryForCaller(
  callerEntityId: string,
): Promise<TwinActiveAuthoritySummary> {
  const now = new Date();
  const expiringSoonCutoff = new Date(
    now.getTime() + EXPIRING_SOON_WINDOW_DAYS * MS_PER_DAY,
  );

  const rows = await prisma.twinAuthorityGrant.findMany({
    where: {
      grantor_entity_id: callerEntityId,
      state: "ACTIVE",
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    select: {
      duration_class: true,
      expires_at: true,
      created_at: true,
    },
  });

  const active_grant_count = rows.length;
  let expiring_soon_count = 0;
  let indefinite_grant_count = 0;
  let sensitive_case_by_case_count = 0;
  let mostRecentCreated: Date | null = null;
  let nextExpiry: Date | null = null;
  const durationSet = new Set<TwinAuthorityDurationClass>();

  for (const row of rows) {
    durationSet.add(row.duration_class);
    if (
      row.duration_class === "INDEFINITE" ||
      row.duration_class === "UNTIL_REVOKED"
    ) {
      indefinite_grant_count++;
    }
    if (row.duration_class === "SENSITIVE_CASE_BY_CASE") {
      sensitive_case_by_case_count++;
    }
    if (
      row.expires_at !== null &&
      row.expires_at > now &&
      row.expires_at <= expiringSoonCutoff
    ) {
      expiring_soon_count++;
    }
    if (
      row.expires_at !== null &&
      (nextExpiry === null || row.expires_at < nextExpiry)
    ) {
      nextExpiry = row.expires_at;
    }
    if (
      mostRecentCreated === null ||
      row.created_at > mostRecentCreated
    ) {
      mostRecentCreated = row.created_at;
    }
  }

  return {
    active_grant_count,
    expiring_soon_count,
    indefinite_grant_count,
    sensitive_case_by_case_count,
    most_recent_grant_at:
      mostRecentCreated !== null ? mostRecentCreated.toISOString() : null,
    next_expiry_at: nextExpiry !== null ? nextExpiry.toISOString() : null,
    has_revocable_grants: active_grant_count > 0,
    duration_classes_present: Array.from(durationSet).sort(),
  };
}
