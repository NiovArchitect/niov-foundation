// FILE: my-day-intelligence.service.ts
// PURPOSE: Phase 1234 — the first real product consumer of the
//          Python intelligence runtime. Builds the caller's SAFE
//          scoped signal pack from existing Foundation substrate
//          (Actions / Notifications / TwinCollaborationRequest /
//          TwinAuthorityGrant / WorkProject / CollaborationCommitment
//          / ExternalCommitment), hands it to
//          rankEmployeeTwinNextActions (Python when configured,
//          honest deterministic fixture otherwise), and returns the
//          calm ambient "My Day" view: what matters today, what is
//          waiting on the caller, and what the caller is waiting on.
//
// SAFETY POSTURE (RULE 0):
//   - The signal pack is counts + closed-vocab labels + timestamps
//     ONLY. No raw payloads, no audit details, no capsule content,
//     no connector config, no chain-of-thought.
//   - Everything is caller-scoped: the caller's own actions,
//     notifications addressed to the caller, collaboration requests
//     targeting the caller, grants the caller issued, projects the
//     caller belongs to, commitments the caller owns. Cross-org and
//     cross-teammate signals never enter the pack.
//   - Revoked / expired / superseded authority grants are excluded
//     by state filter (only ACTIVE counts).
//   - External commitments surface as counts with internal-owner
//     context only — never external-collaborator private fields.
//   - Python never executes anything; it ranks. TypeScript remains
//     the sole policy / approval / DMW / audit authority.
//
// CONNECTS TO:
//   - apps/api/src/services/intelligence/python-ranking.service.ts
//     (rankEmployeeTwinNextActions; provider/fallback discipline)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - apps/api/src/routes/otzar-my-day.routes.ts (HTTP surface)
//   - tests/unit/my-day-intelligence.test.ts (pure helpers)
//   - tests/integration/my-day-intelligence.test.ts (service-level)

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import {
  rankEmployeeTwinNextActions,
  type NextActionRankingInput,
  type NextActionRankingResult,
  type NextActionSuggestion,
  type RankerRuntimeConfig,
} from "../intelligence/python-ranking.service.js";

// ─── view shapes ─────────────────────────────────────────────

/**
 * The honest provider label the UI shows in diagnostics. Collapses
 * provider_mode + fallback_reason into one closed-vocab value.
 */
export type MyDayProviderStatus =
  | "PYTHON_CONFIGURED"
  | "FIXTURE_PROVIDER_URL_NOT_SET"
  | "FIXTURE_PROVIDER_DISABLED"
  | "FIXTURE_PROVIDER_TIMEOUT"
  | "FIXTURE_PROVIDER_ERROR"
  | "FIXTURE_PROVIDER_INVALID_RESPONSE";

/** SAFE caller-scoped signal counts. Counts and timestamps only. */
export interface MyDaySignals {
  proposed_actions_count: number;
  recent_action_count: number;
  unread_notifications_count: number;
  collaboration_inbox_pending_count: number;
  collaboration_needs_approval_count: number;
  collaboration_blocked_count: number;
  active_authority_grants_count: number;
  expiring_soon_grants_count: number;
  sensitive_case_by_case_grants_count: number;
  active_project_count: number;
  open_commitments_owned_count: number;
  waiting_on_external_count: number;
  owed_to_external_count: number;
  most_recent_action_at: string | null;
  most_recent_collaboration_at: string | null;
}

export interface MyDayIntelligenceView {
  /** Calm, user-facing one-liner. Never developer language. */
  headline: string;
  suggestions: ReadonlyArray<NextActionSuggestion>;
  signals: MyDaySignals;
  /**
   * "Waiting on external party" context: counts plus internal-owner
   * framing only. Never external-collaborator private details.
   */
  waiting_on_external: {
    they_owe_us_count: number;
    we_owe_them_count: number;
  };
  provider_status: MyDayProviderStatus;
  generated_at: string;
}

type Failure = { ok: false; code: string };

// ─── pure helpers (unit-tested; no DB) ───────────────────────

// WHAT: Map the SAFE signal pack onto the ranker's input contract.
// INPUT: MyDaySignals.
// OUTPUT: NextActionRankingInput (all fields populated; fields with
//         no cheap caller-scoped source are zero-filled honestly).
// WHY: Keeps the substrate-to-ranker projection in one tested place
//      so the Python runtime and fixture ranker see identical shapes.
export function buildRankingInput(s: MyDaySignals): NextActionRankingInput {
  return {
    pending_approvals_count: s.proposed_actions_count,
    recent_action_count: s.recent_action_count,
    active_authority_grants_count: s.active_authority_grants_count,
    expiring_soon_grants_count: s.expiring_soon_grants_count,
    sensitive_case_by_case_grants_count:
      s.sensitive_case_by_case_grants_count,
    active_preferences_count: 0,
    active_sensitivity_boundaries_count: 0,
    collaboration_inbox_pending_count: s.collaboration_inbox_pending_count,
    collaboration_needs_approval_count:
      s.collaboration_needs_approval_count,
    collaboration_blocked_count: s.collaboration_blocked_count,
    active_project_count: s.active_project_count,
    most_recent_action_at: s.most_recent_action_at,
    most_recent_collaboration_at: s.most_recent_collaboration_at,
  };
}

// WHAT: Collapse ranking provider_mode + fallback_reason into the
//       single closed-vocab provider status the UI shows.
// INPUT: NextActionRankingResult.
// OUTPUT: MyDayProviderStatus.
// WHY: The UI needs one honest label, not two fields to interpret.
export function providerStatusFrom(
  result: Pick<NextActionRankingResult, "provider_mode" | "fallback_reason">,
): MyDayProviderStatus {
  if (result.provider_mode === "PYTHON") return "PYTHON_CONFIGURED";
  switch (result.fallback_reason) {
    case "PROVIDER_DISABLED":
      return "FIXTURE_PROVIDER_DISABLED";
    case "PROVIDER_TIMEOUT":
      return "FIXTURE_PROVIDER_TIMEOUT";
    case "PROVIDER_ERROR":
      return "FIXTURE_PROVIDER_ERROR";
    case "PROVIDER_INVALID_RESPONSE":
      return "FIXTURE_PROVIDER_INVALID_RESPONSE";
    default:
      return "FIXTURE_PROVIDER_URL_NOT_SET";
  }
}

// WHAT: The calm My Day headline.
// INPUT: suggestion count + count of items waiting on external parties.
// OUTPUT: A short, warm, user-facing sentence.
// WHY: The ambient shell leads with one sentence, not a dashboard.
//      Copy discipline: no payload/schema/adapter/capsule/wallet
//      vocabulary (test-locked).
export function headlineFor(
  suggestionCount: number,
  waitingOnExternalCount: number,
): string {
  if (suggestionCount === 0 && waitingOnExternalCount === 0) {
    return "Nothing needs your attention right now. Otzar is keeping watch.";
  }
  if (suggestionCount === 0) {
    return `Nothing needs your action right now — you're waiting on ${waitingOnExternalCount} ${waitingOnExternalCount === 1 ? "item" : "items"} from outside your organization.`;
  }
  return `Otzar found ${suggestionCount} ${suggestionCount === 1 ? "thing" : "things"} that may need your attention.`;
}

/** Window for "expiring soon" authority grants. */
const EXPIRING_SOON_DAYS = 7;
/** Window for "recent" actions. */
const RECENT_ACTION_DAYS = 7;

/** Commitment statuses that still need somebody to act. */
const OPEN_COMMITMENT_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "ACTION_CREATED",
  "BLOCKED",
] as const;

// ─── signal gathering (caller-scoped; DB) ────────────────────

// WHAT: Gather the SAFE caller-scoped signal counts from substrate.
// INPUT: callerEntityId + orgEntityId + "now" for testability.
// OUTPUT: MyDaySignals.
// WHY: One place that defines exactly which substrate rows may
//      influence My Day — everything caller-scoped by construction.
export async function gatherMyDaySignals(
  callerEntityId: string,
  orgEntityId: string,
  now: Date,
): Promise<MyDaySignals> {
  const recentCutoff = new Date(
    now.getTime() - RECENT_ACTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const expiringCutoff = new Date(
    now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
  );

  const [
    proposedActions,
    recentActions,
    unreadNotifications,
    inboxPending,
    needsApproval,
    blocked,
    activeGrants,
    expiringGrants,
    sensitiveGrants,
    memberProjectRows,
    openCommitmentsOwned,
    theyOweUs,
    weOweThem,
    latestAction,
    latestCollaboration,
  ] = await Promise.all([
    prisma.action.count({
      where: {
        source_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        status: "PROPOSED",
        deleted_at: null,
      },
    }),
    prisma.action.count({
      where: {
        source_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        created_at: { gte: recentCutoff },
        deleted_at: null,
      },
    }),
    prisma.notification.count({
      where: {
        recipient_entity_id: callerEntityId,
        read_at: null,
        deleted_at: null,
      },
    }),
    prisma.twinCollaborationRequest.count({
      where: { target_entity_id: callerEntityId, state: "REQUESTED" },
    }),
    prisma.twinCollaborationRequest.count({
      where: { target_entity_id: callerEntityId, state: "NEEDS_APPROVAL" },
    }),
    prisma.twinCollaborationRequest.count({
      where: {
        state: "BLOCKED",
        OR: [
          { target_entity_id: callerEntityId },
          { requester_entity_id: callerEntityId },
        ],
      },
    }),
    prisma.twinAuthorityGrant.count({
      where: { grantor_entity_id: callerEntityId, state: "ACTIVE" },
    }),
    prisma.twinAuthorityGrant.count({
      where: {
        grantor_entity_id: callerEntityId,
        state: "ACTIVE",
        expires_at: { not: null, lte: expiringCutoff },
      },
    }),
    prisma.twinAuthorityGrant.count({
      where: {
        grantor_entity_id: callerEntityId,
        state: "ACTIVE",
        duration_class: "SENSITIVE_CASE_BY_CASE",
      },
    }),
    prisma.workProjectMember.findMany({
      where: { entity_id: callerEntityId, org_entity_id: orgEntityId },
      select: { project_id: true },
    }),
    prisma.collaborationCommitment.count({
      where: {
        owner_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        status: { in: [...OPEN_COMMITMENT_STATUSES] },
        deleted_at: null,
      },
    }),
    prisma.externalCommitment.count({
      where: {
        internal_owner_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        direction: "EXTERNAL_OWES_INTERNAL",
        status: { in: [...OPEN_COMMITMENT_STATUSES] },
        deleted_at: null,
      },
    }),
    prisma.externalCommitment.count({
      where: {
        internal_owner_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        direction: "INTERNAL_OWES_EXTERNAL",
        status: { in: [...OPEN_COMMITMENT_STATUSES] },
        deleted_at: null,
      },
    }),
    prisma.action.findFirst({
      where: {
        source_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
    prisma.twinCollaborationRequest.findFirst({
      where: {
        OR: [
          { target_entity_id: callerEntityId },
          { requester_entity_id: callerEntityId },
        ],
      },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
  ]);

  // WorkProjectMember carries plain UUID columns (no Prisma
  // relation), so active-project membership is a second query.
  const projectIds = memberProjectRows.map((r) => r.project_id);
  const activeProjects =
    projectIds.length === 0
      ? 0
      : await prisma.workProject.count({
          where: { project_id: { in: projectIds }, state: "ACTIVE" },
        });

  return {
    proposed_actions_count: proposedActions,
    recent_action_count: recentActions,
    unread_notifications_count: unreadNotifications,
    collaboration_inbox_pending_count: inboxPending,
    collaboration_needs_approval_count: needsApproval,
    collaboration_blocked_count: blocked,
    active_authority_grants_count: activeGrants,
    expiring_soon_grants_count: expiringGrants,
    sensitive_case_by_case_grants_count: sensitiveGrants,
    active_project_count: activeProjects,
    open_commitments_owned_count: openCommitmentsOwned,
    waiting_on_external_count: theyOweUs,
    owed_to_external_count: weOweThem,
    most_recent_action_at: latestAction?.created_at.toISOString() ?? null,
    most_recent_collaboration_at:
      latestCollaboration?.created_at.toISOString() ?? null,
  };
}

// ─── service entrypoint ──────────────────────────────────────

export async function getMyDayIntelligenceForCaller(
  callerEntityId: string,
  runtime: RankerRuntimeConfig = {},
): Promise<{ ok: true; intelligence: MyDayIntelligenceView } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const now = new Date();
  const signals = await gatherMyDaySignals(callerEntityId, orgEntityId, now);
  const ranking = await rankEmployeeTwinNextActions(
    buildRankingInput(signals),
    runtime,
  );

  return {
    ok: true,
    intelligence: {
      headline: headlineFor(
        ranking.suggestions.length,
        signals.waiting_on_external_count,
      ),
      suggestions: ranking.suggestions,
      signals,
      waiting_on_external: {
        they_owe_us_count: signals.waiting_on_external_count,
        we_owe_them_count: signals.owed_to_external_count,
      },
      provider_status: providerStatusFrom(ranking),
      generated_at: now.toISOString(),
    },
  };
}
