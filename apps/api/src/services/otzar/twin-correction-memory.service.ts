// FILE: twin-correction-memory.service.ts
// PURPOSE: Phase EDX-5 PR 1 — Twin Correction Memory substrate per
//          the [FOUNDER-AUTH — AUTONOMOUS EMPLOYEE DGI STRUCTURAL
//          RUNTIME COMPLETION] directive. Pure-function service for
//          creating / listing / revoking TwinCorrectionMemory rows
//          so the employee can teach their Twin how *they* work
//          (preferences, tone, project context, sensitivity
//          boundaries, terminology, "ask before acting" rules, …)
//          WITHOUT the system collapsing two employees in the same
//          role into a generic role profile.
//
//          Service-only at this slice — routes + MyTwinView
//          integration + ConductSession integration land in
//          subsequent EDX-5 PRs.
//
// PRIVACY INVARIANT:
//   - SafeView projection excludes source_message_id /
//     source_conversation_id (those are FK breadcrumbs for the
//     owner's audit lineage, never surfaced cross-user).
//   - listForOwner is self-scoped — never returns rows owned by
//     another entity (RULE 0).
//   - safe_summary is bounded at write time to prevent raw-
//     transcript collection.
//   - NEVER hard-deleted (RULE 10) — soft-state via the
//     `state` enum.
//
// CONNECTS TO:
//   - packages/database (prisma.twinCorrectionMemory)
//   - packages/database/src/queries/audit.ts (ADMIN_ACTION +
//     details.action discriminator pattern; no new top-level
//     audit literal at this slice)
//   - apps/api/src/services/otzar/otzar.service.ts (forward-
//     substrate — MyTwinView personal-preferences summary
//     sidecar + ConductSession integration land in subsequent
//     EDX-5 PRs)

import { writeAuditEvent } from "@niov/database";
import type {
  TwinAuthoritySensitivityClass,
  TwinCorrectionRetentionClass,
  TwinCorrectionScopeType,
  TwinCorrectionState,
  TwinCorrectionType,
} from "@prisma/client";
import { prisma } from "@niov/database";
import { isActiveProjectMember } from "./work-project.service.js";

export type {
  TwinCorrectionRetentionClass,
  TwinCorrectionScopeType,
  TwinCorrectionState,
  TwinCorrectionType,
};

// WHAT: Bound the safe_summary length so the column never collects
//        raw transcripts / prompts / chain-of-thought. 500 chars
//        matches TwinAuthorityGrant.purpose_summary's cap so the
//        two substrates share the same "never raw" discipline.
const SAFE_SUMMARY_MAX_LENGTH = 500;

// WHAT: Inputs for createTwinCorrectionMemoryForCaller.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: The owner is always the authenticated caller (RULE 0).
//      scope_type + correction_type + safe_summary are required;
//      remaining fields are optional refinements.
export interface CreateTwinCorrectionInput {
  callerEntityId: string;
  orgEntityId: string;
  scopeType: TwinCorrectionScopeType;
  scopeId?: string | null;
  correctionType: TwinCorrectionType;
  safeSummary: string;
  sensitivityClass?: TwinAuthoritySensitivityClass;
  retentionClass?: TwinCorrectionRetentionClass;
  sourceMessageId?: string | null;
  sourceConversationId?: string | null;
  expiresAt?: Date | null;
}

// WHAT: Safe, employee-facing projection of a single correction row.
// INPUT: Used as a value / return type.
// OUTPUT: None.
// WHY: Excludes source_message_id + source_conversation_id (FK
//      breadcrumbs only safe in the owner's own audit view, never
//      surfaced cross-user). `revocable` collapses the state-machine
//      "can I revoke this?" question into a single boolean.
export interface TwinCorrectionSafeView {
  correction_id: string;
  scope_type: TwinCorrectionScopeType;
  scope_id: string | null;
  correction_type: TwinCorrectionType;
  state: TwinCorrectionState;
  sensitivity_class: TwinAuthoritySensitivityClass;
  retention_class: TwinCorrectionRetentionClass;
  safe_summary: string;
  effective_from: string;
  expires_at: string | null;
  revoked_at: string | null;
  superseded_by_id: string | null;
  revocable: boolean;
  created_at: string;
}

// WHAT: Inputs for listTwinCorrectionsForCaller.
export interface ListTwinCorrectionsInput {
  callerEntityId: string;
  state?: TwinCorrectionState;
  correctionType?: TwinCorrectionType;
  scopeType?: TwinCorrectionScopeType;
  take?: number;
}

// WHAT: Inputs for revokeTwinCorrectionForCaller.
export interface RevokeTwinCorrectionInput {
  callerEntityId: string;
  correctionId: string;
}

// WHAT: Result shape for revokeTwinCorrectionForCaller.
export type RevokeCorrectionResult =
  | { ok: true; correction: TwinCorrectionSafeView }
  | {
      ok: false;
      code:
        | "CORRECTION_NOT_FOUND"
        | "NOT_OWNER"
        | "ALREADY_REVOKED"
        | "ALREADY_SUPERSEDED"
        | "ALREADY_EXPIRED"
        | "ALREADY_PROMOTED";
    };

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

// WHAT: Map a raw row to the safe employee-facing projection. Pure
//        transformation; no DB hit.
export function projectTwinCorrectionSafeView(row: {
  correction_id: string;
  scope_type: TwinCorrectionScopeType;
  scope_id: string | null;
  correction_type: TwinCorrectionType;
  state: TwinCorrectionState;
  sensitivity_class: TwinAuthoritySensitivityClass;
  retention_class: TwinCorrectionRetentionClass;
  safe_summary: string;
  effective_from: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  superseded_by_id: string | null;
  created_at: Date;
}): TwinCorrectionSafeView {
  const revocable = row.state === "ACTIVE";
  return {
    correction_id: row.correction_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    correction_type: row.correction_type,
    state: row.state,
    sensitivity_class: row.sensitivity_class,
    retention_class: row.retention_class,
    safe_summary: row.safe_summary,
    effective_from: row.effective_from.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    superseded_by_id: row.superseded_by_id,
    revocable,
    created_at: row.created_at.toISOString(),
  };
}

// WHAT: Create a TwinCorrectionMemory row on behalf of the caller.
// INPUT: CreateTwinCorrectionInput. callerEntityId becomes both
//        owner_entity_id and created_by_entity_id (RULE 0).
// OUTPUT: Safe view of the persisted row.
// WHY: Always writes + emits an ADMIN_ACTION audit event BEFORE
//      the service returns (RULE 4). safe_summary bounded to
//      SAFE_SUMMARY_MAX_LENGTH chars. PERSONAL is the default-safe
//      scope when no scope_id is provided. Phase 1 PR 4 — PROJECT-
//      scope corrections with an explicit scope_id additionally
//      validate that the caller is an ACTIVE member of the named
//      project before the write fires.
export type CreateCorrectionResult =
  | { ok: true; correction: TwinCorrectionSafeView }
  | { ok: false; code: "PROJECT_NOT_MEMBER" };

export async function createTwinCorrectionMemoryForCaller(
  input: CreateTwinCorrectionInput,
): Promise<CreateCorrectionResult> {
  // Phase 1 PR 4 project-membership guard for PROJECT-scope
  // corrections. Only fires when scope_type = PROJECT AND
  // scope_id is supplied (a PROJECT-class but unscoped correction
  // is treated as forward-substrate).
  if (
    input.scopeType === "PROJECT" &&
    typeof input.scopeId === "string" &&
    input.scopeId.length > 0
  ) {
    const isMember = await isActiveProjectMember({
      projectId: input.scopeId,
      entityId: input.callerEntityId,
    });
    if (!isMember) return { ok: false, code: "PROJECT_NOT_MEMBER" };
  }
  const safeSummary = input.safeSummary.slice(0, SAFE_SUMMARY_MAX_LENGTH);
  const sensitivity = input.sensitivityClass ?? "MODERATE";
  const retention = input.retentionClass ?? "STANDARD";

  const row = await prisma.twinCorrectionMemory.create({
    data: {
      org_entity_id: input.orgEntityId,
      owner_entity_id: input.callerEntityId,
      created_by_entity_id: input.callerEntityId,
      scope_type: input.scopeType,
      scope_id: input.scopeId ?? null,
      correction_type: input.correctionType,
      state: "ACTIVE",
      sensitivity_class: sensitivity,
      retention_class: retention,
      safe_summary: safeSummary,
      source_message_id: input.sourceMessageId ?? null,
      source_conversation_id: input.sourceConversationId ?? null,
      expires_at: input.expiresAt ?? null,
    },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      action: "TWIN_CORRECTION_RECORDED",
      correction_id: row.correction_id,
      correction_type: row.correction_type,
      scope_type: row.scope_type,
      sensitivity_class: row.sensitivity_class,
      retention_class: row.retention_class,
      has_expiry: row.expires_at !== null,
    },
  });

  return { ok: true, correction: projectTwinCorrectionSafeView(row) };
}

// WHAT: List the caller's own corrections (self-scope guard).
// INPUT: ListTwinCorrectionsInput.
// OUTPUT: Array of safe views.
// WHY: Self-scoped to owner_entity_id. Optional state /
//      correction_type / scope_type filters narrow. take server-
//      capped to LIST_TAKE_CAP.
const LIST_TAKE_CAP = 100;
export async function listTwinCorrectionsForCaller(
  input: ListTwinCorrectionsInput,
): Promise<TwinCorrectionSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const rows = await prisma.twinCorrectionMemory.findMany({
    where: {
      owner_entity_id: input.callerEntityId,
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.correctionType !== undefined
        ? { correction_type: input.correctionType }
        : {}),
      ...(input.scopeType !== undefined
        ? { scope_type: input.scopeType }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });
  return rows.map(projectTwinCorrectionSafeView);
}

// WHAT: Revoke a correction the caller owns.
// INPUT: RevokeTwinCorrectionInput.
// OUTPUT: RevokeCorrectionResult.
// WHY: Caller-must-be-owner enforcement (RULE 0). Idempotent codes
//      for terminal states (REVOKED / SUPERSEDED / EXPIRED /
//      PROMOTED_TO_TEAM_PATTERN / PROMOTED_TO_ORG_PATTERN). Emits
//      ADMIN_ACTION + details.action = "TWIN_CORRECTION_REVOKED"
//      BEFORE returning (RULE 4).
export async function revokeTwinCorrectionForCaller(
  input: RevokeTwinCorrectionInput,
): Promise<RevokeCorrectionResult> {
  const row = await prisma.twinCorrectionMemory.findUnique({
    where: { correction_id: input.correctionId },
  });
  if (row === null) {
    return { ok: false, code: "CORRECTION_NOT_FOUND" };
  }
  if (row.owner_entity_id !== input.callerEntityId) {
    return { ok: false, code: "NOT_OWNER" };
  }
  switch (row.state) {
    case "REVOKED":
      return { ok: false, code: "ALREADY_REVOKED" };
    case "SUPERSEDED":
      return { ok: false, code: "ALREADY_SUPERSEDED" };
    case "EXPIRED":
      return { ok: false, code: "ALREADY_EXPIRED" };
    case "PROMOTED_TO_TEAM_PATTERN":
    case "PROMOTED_TO_ORG_PATTERN":
      return { ok: false, code: "ALREADY_PROMOTED" };
    case "ACTIVE":
      break;
  }

  const now = new Date();
  const updated = await prisma.twinCorrectionMemory.update({
    where: { correction_id: input.correctionId },
    data: { state: "REVOKED", revoked_at: now },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.callerEntityId,
    details: {
      action: "TWIN_CORRECTION_REVOKED",
      correction_id: row.correction_id,
      previous_state: row.state,
    },
  });

  return { ok: true, correction: projectTwinCorrectionSafeView(updated) };
}
