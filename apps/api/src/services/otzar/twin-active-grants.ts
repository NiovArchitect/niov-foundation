// FILE: twin-active-grants.ts
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Self-scoped pure-
//          function helper that projects the caller's currently-
//          active grants — across the DM1-A ConsentGrant
//          substrate (PR #236) and the DM3-A TeamDelegation
//          substrate (PR #240) — as a single summary.
//
//          Surfaces on MyTwinView as an additive optional
//          `active_grants_summary` sidecar so the everyday
//          employee can see "what authorities have I granted to
//          my Twin and when does the soonest expire" — the
//          directive's required *"approvals I granted, expiring
//          soon"* visibility — without exposing per-grant
//          substance.
//
//          A ConsentGrant is "active" when:
//          - the row exists with the caller as grantor_entity_id
//          - consent_state = 'APPROVED'
//          - revoked_at is null
//          - (valid_until is null OR valid_until > now)
//
//          A TeamDelegation is "active" when:
//          - the row exists with the caller as delegator_entity_id
//          - status = 'ACTIVE'
//          - (valid_until is null OR valid_until > now)
//
// PRIVACY INVARIANT:
//   - Returns capacity-only signals: two counts + a single ISO
//     timestamp (the soonest expiry across both substrates).
//   - NEVER returns consent_id / delegation_id / grantee_entity_id
//     / team_entity_id / purpose / permission_id / capability_scope
//     / supervision_required / revocation_bridge_id / status /
//     consent_state / any per-grant substance.
//   - NEVER returns counts > 0 for any entity OTHER than the
//     caller.
//
// CONNECTS TO:
//   - packages/database (prisma.consentGrant.count,
//     prisma.consentGrant.findFirst,
//     prisma.teamDelegation.count,
//     prisma.teamDelegation.findFirst)
//   - apps/api/src/services/otzar/otzar.service.ts
//     (consumed by getMyTwin as an optional sidecar field)

import { prisma } from "@niov/database";

// WHAT: SAFE projection of the caller's currently-active grants.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Surfaces capacity-only signals — two counts + soonest
//      expiry — so the employee Twin UX can render "you've
//      granted N active consents and M active delegations; the
//      soonest expires …" without exposing per-grant substance.
export interface TwinActiveGrantsSummary {
  active_consent_grants_count: number;
  active_team_delegations_count: number;
  soonest_expiry_at: string | null;
}

// WHAT: Compute the caller's active grants summary.
// INPUT: callerEntityId — the caller's resolved entity_id (the
//        grantor/delegator-side perspective).
// OUTPUT: TwinActiveGrantsSummary.
// WHY: Two Prisma counts (one per substrate) + two bounded
//      findFirst lookups for the soonest non-null valid_until
//      per substrate. The merged soonest is the min across both
//      substrates; rows with null valid_until (no-expiry grants)
//      are counted but cannot contribute to soonest_expiry_at.
//      Failures inside the helper bubble up to the caller
//      (`getMyTwin`) where the same ADR-0068 §6 swallow pattern
//      keeps the sidecar absence non-fatal to the My Twin read.
export async function computeActiveGrantsSummaryForCaller(
  callerEntityId: string,
): Promise<TwinActiveGrantsSummary> {
  const now = new Date();

  const consentActiveWhere = {
    grantor_entity_id: callerEntityId,
    consent_state: "APPROVED" as const,
    revoked_at: null,
    OR: [{ valid_until: null }, { valid_until: { gt: now } }],
  };
  const delegationActiveWhere = {
    delegator_entity_id: callerEntityId,
    status: "ACTIVE" as const,
    OR: [{ valid_until: null }, { valid_until: { gt: now } }],
  };

  const [
    active_consent_grants_count,
    active_team_delegations_count,
    consentSoonest,
    delegationSoonest,
  ] = await Promise.all([
    prisma.consentGrant.count({ where: consentActiveWhere }),
    prisma.teamDelegation.count({ where: delegationActiveWhere }),
    prisma.consentGrant.findFirst({
      where: {
        grantor_entity_id: callerEntityId,
        consent_state: "APPROVED",
        revoked_at: null,
        valid_until: { gt: now },
      },
      select: { valid_until: true },
      orderBy: { valid_until: "asc" },
    }),
    prisma.teamDelegation.findFirst({
      where: {
        delegator_entity_id: callerEntityId,
        status: "ACTIVE",
        valid_until: { gt: now },
      },
      select: { valid_until: true },
      orderBy: { valid_until: "asc" },
    }),
  ]);

  const candidateExpiries: Date[] = [];
  if (consentSoonest?.valid_until !== null && consentSoonest?.valid_until !== undefined) {
    candidateExpiries.push(consentSoonest.valid_until);
  }
  if (delegationSoonest?.valid_until !== null && delegationSoonest?.valid_until !== undefined) {
    candidateExpiries.push(delegationSoonest.valid_until);
  }
  const soonest_expiry_at =
    candidateExpiries.length === 0
      ? null
      : new Date(
          Math.min(...candidateExpiries.map((d) => d.getTime())),
        ).toISOString();

  return {
    active_consent_grants_count,
    active_team_delegations_count,
    soonest_expiry_at,
  };
}
