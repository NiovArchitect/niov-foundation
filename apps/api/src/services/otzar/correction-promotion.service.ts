// FILE: correction-promotion.service.ts
// PURPOSE: [SECTION-10 CORRECTION-PROMOTION] Decision-rights-authorized
//          state machine that promotes an ACTIVE TwinCorrectionMemory
//          candidate (TEAM_BEST_PRACTICE_CANDIDATE /
//          ORG_BEST_PRACTICE_CANDIDATE) into the live organizational-truth
//          promotion command (`promoteOrgTruth`), then transitions the
//          correction into the pre-declared PROMOTED_TO_TEAM_PATTERN /
//          PROMOTED_TO_ORG_PATTERN states.
//
//          When competing correction candidates assert materially
//          different claims, promoteOrgTruth opens a conflict set +
//          exactly one governed review obligation and promotes NOTHING;
//          correction rows stay ACTIVE until a reviewer resolves the
//          conflict.
//
// INVARIANTS:
//   - Owner consent: only the correction owner may initiate promotion
//     (schema doctrine: never auto-promote personal work-style memory).
//   - Decision rights: owns/can_approve the domain is enforced inside
//     promoteOrgTruth; recommend-only cannot finalize.
//   - No silent winner when claims conflict.
//   - Safe projections only — no raw source_message / conversation
//     content, no prompts, no secrets.
//   - No broad organization read fan-out.
//
// CONNECTS TO:
//   - packages/database promoteOrgTruth / resolveDomainOwner
//   - twin-correction-memory.service (state + safe view)
//   - otzar-correction-memory.routes (HTTP surface)

import {
  prisma,
  promoteOrgTruth,
  resolveDomainOwner,
  writeAuditEvent,
  type ObligationScope,
  type PromoteResult,
  type SourceCandidate,
  type SafeOrgTruthRecord,
  type SafeConflictSet,
} from "@niov/database";
import type { TwinCorrectionState, TwinCorrectionType } from "@prisma/client";
import {
  projectTwinCorrectionSafeView,
  type TwinCorrectionSafeView,
} from "./twin-correction-memory.service.js";

/** Closed-vocab source_record_type for TwinCorrectionMemory as an org-truth source. */
export const TWIN_CORRECTION_SOURCE_TYPE = "TWIN_CORRECTION_MEMORY" as const;

/** Correction types eligible for team/org pattern promotion. */
export const PROMOTABLE_CORRECTION_TYPES: ReadonlySet<TwinCorrectionType> = new Set([
  "TEAM_BEST_PRACTICE_CANDIDATE",
  "ORG_BEST_PRACTICE_CANDIDATE",
]);

function promotedStateFor(type: TwinCorrectionType): Extract<
  TwinCorrectionState,
  "PROMOTED_TO_TEAM_PATTERN" | "PROMOTED_TO_ORG_PATTERN"
> {
  if (type === "ORG_BEST_PRACTICE_CANDIDATE") return "PROMOTED_TO_ORG_PATTERN";
  return "PROMOTED_TO_TEAM_PATTERN";
}

export interface PromoteCorrectionInput {
  /** Authenticated actor — must be the correction owner (owner consent). */
  actorEntityId: string;
  orgEntityId: string;
  correctionId: string;
  decisionDomain: string;
  topic: string;
  reason: string;
  subjectRef?: string | null;
  subjectRefClass?: string | null;
  workspaceId?: string | null;
  /** Other ACTIVE promotable corrections in the same org that compete. */
  competingCorrectionIds?: string[];
  expectedCurrentVersion?: number | null;
  /**
   * Resolve obligation scope for the domain owner when a material conflict
   * is opened. Optional — when omitted, conflict opens without a review
   * obligation if the domain owner has no Twin scope.
   */
  resolveOwnerScope?: () => Promise<ObligationScope | null>;
}

export type PromoteCorrectionResult =
  | {
      ok: true;
      outcome: "promoted";
      correction: TwinCorrectionSafeView;
      truth_record: SafeOrgTruthRecord;
      created: boolean;
    }
  | {
      ok: true;
      outcome: "conflict_open";
      conflict_set: SafeConflictSet;
      review_obligation_id: string | null;
      /** Winner + competing remain ACTIVE until conflict resolution. */
      correction: TwinCorrectionSafeView;
    }
  | {
      ok: false;
      code:
        | "CORRECTION_NOT_FOUND"
        | "NOT_OWNER"
        | "NOT_PROMOTABLE_TYPE"
        | "NOT_ACTIVE"
        | "ALREADY_PROMOTED"
        | "COMPETING_NOT_FOUND"
        | "COMPETING_NOT_PROMOTABLE"
        | "COMPETING_CROSS_ORG"
        | "INVALID_INPUT"
        | "UNAUTHORIZED"
        | "RECOMMEND_ONLY"
        | "INELIGIBLE_SOURCE"
        | "STATE_CHANGED"
        | "AUDIT_UNCOMMITTED"
        | "ORG_TRUTH_FAILED";
      message: string;
    };

function toSourceCandidate(row: {
  correction_id: string;
  correction_type: TwinCorrectionType;
  safe_summary: string;
  scope_type: string;
}): SourceCandidate {
  // Claim is the structured comparison key for material conflict detection.
  // Equal summaries → no conflict; differing summaries → conflict_open.
  const claim = {
    summary: row.safe_summary,
    correction_type: row.correction_type,
    scope_type: row.scope_type,
  };
  return {
    source_record_type: TWIN_CORRECTION_SOURCE_TYPE,
    source_record_id: row.correction_id,
    source_version: 1,
    truth_class: "team_or_org_pattern_candidate",
    authority_status: "owner_consented",
    currentness: "current",
    source_integrity_state: "INTACT",
    claim,
  };
}

/**
 * Promote an ACTIVE TEAM/ORG best-practice correction candidate through the
 * live org-truth promotion command, then transition its TwinCorrectionState
 * to the matching PROMOTED_TO_* terminal when promotion succeeds cleanly.
 */
export async function promoteTwinCorrectionToOrgTruth(
  input: PromoteCorrectionInput,
): Promise<PromoteCorrectionResult> {
  const domain = input.decisionDomain.trim();
  const topic = input.topic.trim();
  const reason = input.reason.trim();
  if (domain.length === 0 || topic.length === 0 || reason.length === 0) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "decision_domain, topic, and reason are required.",
    };
  }

  const winner = await prisma.twinCorrectionMemory.findUnique({
    where: { correction_id: input.correctionId },
  });
  if (winner === null) {
    return { ok: false, code: "CORRECTION_NOT_FOUND", message: "This correction is not available." };
  }
  // Existence of a foreign-org / non-owned correction is not disclosed as
  // distinct from not-found (same-org owner consent gate).
  if (winner.org_entity_id !== input.orgEntityId || winner.owner_entity_id !== input.actorEntityId) {
    return { ok: false, code: "NOT_OWNER", message: "Only the correction owner may promote it." };
  }
  if (!PROMOTABLE_CORRECTION_TYPES.has(winner.correction_type)) {
    return {
      ok: false,
      code: "NOT_PROMOTABLE_TYPE",
      message: "Only TEAM_BEST_PRACTICE_CANDIDATE or ORG_BEST_PRACTICE_CANDIDATE may be promoted.",
    };
  }
  if (winner.state === "PROMOTED_TO_TEAM_PATTERN" || winner.state === "PROMOTED_TO_ORG_PATTERN") {
    return { ok: false, code: "ALREADY_PROMOTED", message: "This correction has already been promoted." };
  }
  if (winner.state !== "ACTIVE") {
    return {
      ok: false,
      code: "NOT_ACTIVE",
      message: "Only an ACTIVE correction candidate can be promoted.",
    };
  }

  const competingIds = (input.competingCorrectionIds ?? []).filter(
    (id) => id !== winner.correction_id,
  );
  const competingRows =
    competingIds.length === 0
      ? []
      : await prisma.twinCorrectionMemory.findMany({
          where: { correction_id: { in: competingIds } },
        });
  if (competingRows.length !== competingIds.length) {
    return {
      ok: false,
      code: "COMPETING_NOT_FOUND",
      message: "One or more competing corrections are not available.",
    };
  }
  for (const c of competingRows) {
    if (c.org_entity_id !== input.orgEntityId) {
      return {
        ok: false,
        code: "COMPETING_CROSS_ORG",
        message: "Competing corrections must belong to the same organization.",
      };
    }
    if (!PROMOTABLE_CORRECTION_TYPES.has(c.correction_type) || c.state !== "ACTIVE") {
      return {
        ok: false,
        code: "COMPETING_NOT_PROMOTABLE",
        message: "Competing corrections must be ACTIVE TEAM/ORG best-practice candidates.",
      };
    }
  }

  const winnerSource = toSourceCandidate(winner);
  const competingSources = competingRows.map(toSourceCandidate);

  const promoteResult: PromoteResult = await promoteOrgTruth({
    scope: {
      org_entity_id: input.orgEntityId,
      decision_domain: domain,
      topic,
      subject_ref: input.subjectRef ?? null,
      subject_ref_class: input.subjectRefClass ?? null,
      workspace_id: input.workspaceId ?? null,
    },
    actor_entity_id: input.actorEntityId,
    winner: winnerSource,
    competing: competingSources,
    title: winner.safe_summary.slice(0, 200),
    value: {
      summary: winner.safe_summary,
      correction_type: winner.correction_type,
      scope_type: winner.scope_type,
    },
    value_type: "twin_correction_pattern",
    reason,
    expected_current_version: input.expectedCurrentVersion ?? null,
    resolveOwnerScope:
      input.resolveOwnerScope ??
      (async () => {
        const owner = await resolveDomainOwner(input.orgEntityId, domain);
        return owner === null ? null : resolveMinimalOwnerScope(owner, input.orgEntityId);
      }),
  });

  if (promoteResult.kind === "conflict_open") {
    // Candidates stay ACTIVE — the conflict review surface owns resolution.
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: input.actorEntityId,
      target_entity_id: input.orgEntityId,
      details: {
        action: "TWIN_CORRECTION_PROMOTION_CONFLICT_OPEN",
        correction_id: winner.correction_id,
        conflict_set_id: promoteResult.conflict_set.conflict_set_id,
        competing_count: competingRows.length,
        decision_domain: domain,
      },
    });
    return {
      ok: true,
      outcome: "conflict_open",
      conflict_set: promoteResult.conflict_set,
      review_obligation_id: promoteResult.review_obligation_id,
      correction: projectTwinCorrectionSafeView(winner),
    };
  }

  if (promoteResult.kind !== "promoted") {
    return mapPromoteFailure(promoteResult.kind);
  }

  // CAS: only transition ACTIVE → PROMOTED_TO_* so concurrent revoke/promote cannot clobber.
  const targetState = promotedStateFor(winner.correction_type);
  const updated = await prisma.twinCorrectionMemory.updateMany({
    where: {
      correction_id: winner.correction_id,
      owner_entity_id: input.actorEntityId,
      state: "ACTIVE",
    },
    data: { state: targetState },
  });

  const finalRow =
    updated.count === 1
      ? await prisma.twinCorrectionMemory.findUniqueOrThrow({
          where: { correction_id: winner.correction_id },
        })
      : await prisma.twinCorrectionMemory.findUniqueOrThrow({
          where: { correction_id: winner.correction_id },
        });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.actorEntityId,
    target_entity_id: input.orgEntityId,
    details: {
      action: "TWIN_CORRECTION_PROMOTED",
      correction_id: winner.correction_id,
      promoted_state: finalRow.state,
      truth_record_id: promoteResult.record.truth_record_id,
      decision_domain: domain,
      created: promoteResult.created,
      state_transition_applied: updated.count === 1,
    },
  });

  return {
    ok: true,
    outcome: "promoted",
    correction: projectTwinCorrectionSafeView(finalRow),
    truth_record: promoteResult.record,
    created: promoteResult.created,
  };
}

function mapPromoteFailure(
  kind: Exclude<PromoteResult["kind"], "promoted" | "conflict_open">,
): Extract<PromoteCorrectionResult, { ok: false }> {
  switch (kind) {
    case "unauthorized":
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "You do not hold decision rights to promote this domain.",
      };
    case "recommend_only":
      return {
        ok: false,
        code: "RECOMMEND_ONLY",
        message: "A recommend-only party cannot finalize a promotion.",
      };
    case "ineligible_source":
      return {
        ok: false,
        code: "INELIGIBLE_SOURCE",
        message: "The correction source is not currently eligible for promotion.",
      };
    case "invalid_content":
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "The promoted value was rejected.",
      };
    case "state_changed":
      return {
        ok: false,
        code: "STATE_CHANGED",
        message: "The current organizational truth changed since you read it. Re-review and retry.",
      };
    case "audit_consistency_failure":
      return {
        ok: false,
        code: "AUDIT_UNCOMMITTED",
        message: "The promotion could not be recorded and was rolled back. Please retry.",
      };
    default:
      return {
        ok: false,
        code: "ORG_TRUTH_FAILED",
        message: "Organizational-truth promotion failed.",
      };
  }
}

/** Minimal domain-owner obligation scope when Twin resolution is not required. */
async function resolveMinimalOwnerScope(
  ownerEntityId: string,
  orgEntityId: string,
): Promise<ObligationScope | null> {
  // Prefer the owner's primary Twin when present; fall back to owner as twin
  // only when no Twin exists so conflict review can still be assigned.
  const twinMembership = await prisma.entityMembership.findFirst({
    where: {
      parent_id: ownerEntityId,
      is_active: true,
      child: { entity_type: "AI_AGENT", status: "ACTIVE" },
    },
    orderBy: [{ created_at: "asc" }, { child_id: "asc" }],
    select: { child_id: true },
  });
  const twinId = twinMembership?.child_id ?? ownerEntityId;
  return {
    org_entity_id: orgEntityId,
    subject_entity_id: ownerEntityId,
    twin_entity_id: twinId,
  };
}
