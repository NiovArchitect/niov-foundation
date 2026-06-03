// FILE: twin-authority-grant.service.ts
// PURPOSE: Phase EDX-4 — Twin Authority Grant substrate per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] + [FOUNDER-AUTH — AUTONOMOUS
//          EMPLOYEE DGI STRUCTURAL RUNTIME COMPLETION] directives.
//          Pure-function service for creating / listing / revoking
//          / checking / consuming TwinAuthorityGrant rows so the
//          everyday employee can express "my Twin may do X for Y
//          duration with Z sensitivity" and have the system enforce
//          it before any material AI action.
//
//          Service-only at this slice — routes + MyTwinView
//          integration + ConductSession integration land in
//          subsequent EDX-4 PRs.
//
// PRIVACY INVARIANT:
//   - SafeView projection excludes raw constraints, connector
//     secrets, secret_refs, private memory, raw audit details,
//     and any per-grant substance not safe for the employee-facing
//     surface.
//   - listGrantsForCaller is self-scoped — never returns grants
//     where another entity is the grantor (RULE 0).
//   - checkAuthorityForAction returns a closed-vocab denial
//     reason; never echoes raw constraint values.
//
// CONNECTS TO:
//   - packages/database (prisma.twinAuthorityGrant)
//   - packages/database/src/queries/audit.ts (ADMIN_ACTION +
//     details.action discriminator pattern; no new top-level
//     audit literal at this slice)
//   - apps/api/src/services/otzar/otzar.service.ts (forward-
//     substrate — MyTwinView active_authority_summary refinement
//     + ConductSession approval_duration_options integration land
//     in subsequent EDX-4 PRs)

import { writeAuditEvent } from "@niov/database";
import type {
  TwinAuthorityDurationClass,
  TwinAuthorityGrantState,
  TwinAuthoritySensitivityClass,
  TwinAuthorityScopeType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@niov/database";

// ─────────────────────────────────────────────────────────────
// Closed vocabs — re-export the Prisma-generated literal unions so
// downstream callers don't have to import from @prisma/client.
// ─────────────────────────────────────────────────────────────

export type {
  TwinAuthorityDurationClass,
  TwinAuthorityGrantState,
  TwinAuthoritySensitivityClass,
  TwinAuthorityScopeType,
};

// WHAT: Closed-vocab denial reason returned by checkAuthorityForAction.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Lets ConductSession (and future callers) render a safe
//      explanation without inspecting raw constraint JSON. Each
//      value names a specific gate that failed; never carries
//      free-form text or raw substrate values.
export type AuthorityDenialReason =
  | "NO_MATCHING_GRANT"
  | "GRANT_EXPIRED"
  | "GRANT_REVOKED"
  | "GRANT_CONSUMED"
  | "GRANT_BLOCKED"
  | "GRANT_SUPERSEDED"
  | "OUT_OF_SCOPE"
  | "SENSITIVE_CASE_BY_CASE_REQUIRES_EXPLICIT_GRANT"
  | "CONNECTOR_WRITE_NOT_AUTHORIZED";

// WHAT: Inputs for createTwinAuthorityGrantForCaller.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: The grantor is always the authenticated caller — never an
//      arbitrary entity_id from the body (RULE 0). org_entity_id +
//      grantee + scope + duration + sensitivity + purpose_summary
//      are required; remaining fields are optional refinements.
export interface CreateTwinAuthorityGrantInput {
  callerEntityId: string;
  orgEntityId: string;
  granteeEntityId: string;
  scopeType: TwinAuthorityScopeType;
  scopeId?: string | null;
  actionType?: string | null;
  connectorType?: string | null;
  connectorBindingId?: string | null;
  durationClass: TwinAuthorityDurationClass;
  sensitivityClass?: TwinAuthoritySensitivityClass;
  purposeSummary: string;
  expiresAt?: Date | null;
  constraints?: Record<string, unknown>;
  consentGrantId?: string | null;
  receiptId?: string | null;
}

// WHAT: Safe, employee-facing projection of a single grant.
// INPUT: Used as a value / return type.
// OUTPUT: None.
// WHY: Excludes connector_binding_id (the FK), constraints_json
//      (may carry safe configuration but is read-only at the
//      service tier), and any free-form fields the UI shouldn't
//      consume blindly. `has_connector_binding` collapses the FK
//      into a boolean so the UI can render an icon without ever
//      receiving the binding id.
export interface TwinAuthorityGrantSafeView {
  grant_id: string;
  duration_class: TwinAuthorityDurationClass;
  sensitivity_class: TwinAuthoritySensitivityClass;
  scope_type: TwinAuthorityScopeType;
  scope_id: string | null;
  state: TwinAuthorityGrantState;
  effective_from: string;
  expires_at: string | null;
  revoked_at: string | null;
  consumed_at: string | null;
  purpose_summary: string;
  action_type: string | null;
  connector_type: string | null;
  has_connector_binding: boolean;
  revocable: boolean;
  created_at: string;
}

// WHAT: Inputs for listTwinAuthorityGrantsForCaller.
export interface ListTwinAuthorityGrantsInput {
  callerEntityId: string;
  state?: TwinAuthorityGrantState;
  take?: number;
}

// WHAT: Inputs for revokeTwinAuthorityGrantForCaller.
export interface RevokeTwinAuthorityGrantInput {
  callerEntityId: string;
  grantId: string;
}

// WHAT: Result shape for revokeTwinAuthorityGrantForCaller.
export type RevokeResult =
  | { ok: true; grant: TwinAuthorityGrantSafeView }
  | {
      ok: false;
      code:
        | "GRANT_NOT_FOUND"
        | "NOT_GRANTOR"
        | "ALREADY_REVOKED"
        | "ALREADY_CONSUMED"
        | "ALREADY_EXPIRED";
    };

// WHAT: Inputs for checkAuthorityForAction.
export interface CheckTwinAuthorityInput {
  granteeEntityId: string;
  orgEntityId: string;
  scopeType: TwinAuthorityScopeType;
  scopeId?: string | null;
  actionType?: string | null;
  connectorType?: string | null;
  sensitivityClass?: TwinAuthoritySensitivityClass;
  now?: Date;
}

// WHAT: Result shape for checkAuthorityForAction.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Discriminated union so callers can switch on `allowed` and
//      either consume the matching grant_id (for one-time
//      consumption) or render the closed-vocab denial reason.
export type AuthorityCheckResult =
  | { allowed: true; grant_id: string; duration_class: TwinAuthorityDurationClass }
  | { allowed: false; reason: AuthorityDenialReason };

// WHAT: Inputs for consumeOneTimeTwinAuthorityGrant.
export interface ConsumeOneTimeInput {
  grantId: string;
}

// WHAT: Result shape for consumeOneTimeTwinAuthorityGrant.
export type ConsumeResult =
  | { ok: true; grant_id: string }
  | {
      ok: false;
      code:
        | "GRANT_NOT_FOUND"
        | "NOT_ONE_TIME"
        | "ALREADY_CONSUMED"
        | "NOT_ACTIVE";
    };

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

// WHAT: Bound the purpose_summary length so the column never
//        accidentally collects raw prompts / chain-of-thought.
const PURPOSE_SUMMARY_MAX_LENGTH = 500;

// WHAT: Map a raw TwinAuthorityGrant row to the safe employee-
//        facing projection. Pure transformation; no DB hit.
// INPUT: The row as returned by Prisma. The constraints JSON is
//        intentionally NOT projected.
// OUTPUT: TwinAuthorityGrantSafeView.
// WHY: Centralises the "what's safe to surface" decision so every
//      consumer (list / revoke / future MyTwinView wiring) emits
//      the same shape.
export function projectTwinAuthorityGrantSafeView(row: {
  grant_id: string;
  duration_class: TwinAuthorityDurationClass;
  sensitivity_class: TwinAuthoritySensitivityClass;
  scope_type: TwinAuthorityScopeType;
  scope_id: string | null;
  state: TwinAuthorityGrantState;
  effective_from: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  consumed_at: Date | null;
  purpose_summary: string;
  action_type: string | null;
  connector_type: string | null;
  connector_binding_id: string | null;
  created_at: Date;
}): TwinAuthorityGrantSafeView {
  const revocable = row.state === "ACTIVE";
  return {
    grant_id: row.grant_id,
    duration_class: row.duration_class,
    sensitivity_class: row.sensitivity_class,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    state: row.state,
    effective_from: row.effective_from.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    consumed_at: row.consumed_at?.toISOString() ?? null,
    purpose_summary: row.purpose_summary,
    action_type: row.action_type,
    connector_type: row.connector_type,
    has_connector_binding: row.connector_binding_id !== null,
    revocable,
  created_at: row.created_at.toISOString(),
  };
}

// WHAT: Create a TwinAuthorityGrant on behalf of the caller.
// INPUT: CreateTwinAuthorityGrantInput. callerEntityId becomes
//        grantor_entity_id (RULE 0 — caller is always the grantor).
// OUTPUT: Safe view of the persisted grant.
// WHY: Always writes the row + emits an ADMIN_ACTION audit event
//      with details.action = "TWIN_AUTHORITY_GRANTED" BEFORE the
//      service returns (RULE 4). purpose_summary is bounded.
//      SENSITIVE_CASE_BY_CASE grants are explicitly allowed at
//      creation — the gate fires at check-time, not create-time.
export async function createTwinAuthorityGrantForCaller(
  input: CreateTwinAuthorityGrantInput,
): Promise<TwinAuthorityGrantSafeView> {
  const purpose = input.purposeSummary.slice(0, PURPOSE_SUMMARY_MAX_LENGTH);
  const constraints = input.constraints ?? {};
  const sensitivity = input.sensitivityClass ?? "MODERATE";

  const row = await prisma.twinAuthorityGrant.create({
    data: {
      org_entity_id: input.orgEntityId,
      grantor_entity_id: input.callerEntityId,
      grantee_entity_id: input.granteeEntityId,
      scope_type: input.scopeType,
      scope_id: input.scopeId ?? null,
      action_type: input.actionType ?? null,
      connector_type: input.connectorType ?? null,
      connector_binding_id: input.connectorBindingId ?? null,
      duration_class: input.durationClass,
      sensitivity_class: sensitivity,
      state: "ACTIVE",
      expires_at: input.expiresAt ?? null,
      purpose_summary: purpose,
      constraints_json: constraints as unknown as Prisma.InputJsonValue,
      consent_grant_id: input.consentGrantId ?? null,
      receipt_id: input.receiptId ?? null,
    },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: input.granteeEntityId,
    details: {
      action: "TWIN_AUTHORITY_GRANTED",
      grant_id: row.grant_id,
      duration_class: row.duration_class,
      sensitivity_class: row.sensitivity_class,
      scope_type: row.scope_type,
      action_type: row.action_type,
      connector_type: row.connector_type,
      has_expiry: row.expires_at !== null,
    },
  });

  return projectTwinAuthorityGrantSafeView(row);
}

// WHAT: List the caller's grants (grantor-side).
// INPUT: ListTwinAuthorityGrantsInput.
// OUTPUT: Array of safe views.
// WHY: Self-scoped — never returns grants for other grantors.
//      Optional state filter narrows to a single state. take is
//      capped server-side.
const LIST_TAKE_CAP = 100;
export async function listTwinAuthorityGrantsForCaller(
  input: ListTwinAuthorityGrantsInput,
): Promise<TwinAuthorityGrantSafeView[]> {
  const take = Math.min(input.take ?? 50, LIST_TAKE_CAP);
  const rows = await prisma.twinAuthorityGrant.findMany({
    where: {
      grantor_entity_id: input.callerEntityId,
      ...(input.state !== undefined ? { state: input.state } : {}),
    },
    orderBy: { created_at: "desc" },
    take,
  });
  return rows.map(projectTwinAuthorityGrantSafeView);
}

// WHAT: Revoke a grant the caller owns (as grantor).
// INPUT: RevokeTwinAuthorityGrantInput.
// OUTPUT: RevokeResult.
// WHY: Caller-must-be-grantor enforcement (RULE 0). Idempotency
//      codes when the grant is already in a terminal state.
//      Emits ADMIN_ACTION + details.action = "TWIN_AUTHORITY_REVOKED"
//      BEFORE returning (RULE 4).
export async function revokeTwinAuthorityGrantForCaller(
  input: RevokeTwinAuthorityGrantInput,
): Promise<RevokeResult> {
  const row = await prisma.twinAuthorityGrant.findUnique({
    where: { grant_id: input.grantId },
  });
  if (row === null) {
    return { ok: false, code: "GRANT_NOT_FOUND" };
  }
  if (row.grantor_entity_id !== input.callerEntityId) {
    return { ok: false, code: "NOT_GRANTOR" };
  }
  if (row.state === "REVOKED") {
    return { ok: false, code: "ALREADY_REVOKED" };
  }
  if (row.state === "CONSUMED") {
    return { ok: false, code: "ALREADY_CONSUMED" };
  }
  if (row.state === "EXPIRED") {
    return { ok: false, code: "ALREADY_EXPIRED" };
  }

  const now = new Date();
  const updated = await prisma.twinAuthorityGrant.update({
    where: { grant_id: input.grantId },
    data: {
      state: "REVOKED",
      revoked_at: now,
      revoked_by_entity_id: input.callerEntityId,
    },
  });

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    target_entity_id: row.grantee_entity_id,
    details: {
      action: "TWIN_AUTHORITY_REVOKED",
      grant_id: row.grant_id,
      previous_state: row.state,
    },
  });

  return { ok: true, grant: projectTwinAuthorityGrantSafeView(updated) };
}

// WHAT: Mark a one-time grant as consumed.
// INPUT: ConsumeOneTimeInput.
// OUTPUT: ConsumeResult.
// WHY: One-time grants are consumed in a single material-action
//      flow. The check helper returns the grant_id; the action
//      runtime calls this helper to seal the consumption. State
//      transitions ACTIVE → CONSUMED + sets consumed_at; emits
//      ADMIN_ACTION + details.action = "TWIN_AUTHORITY_CONSUMED".
export async function consumeOneTimeTwinAuthorityGrant(
  input: ConsumeOneTimeInput,
): Promise<ConsumeResult> {
  const row = await prisma.twinAuthorityGrant.findUnique({
    where: { grant_id: input.grantId },
  });
  if (row === null) {
    return { ok: false, code: "GRANT_NOT_FOUND" };
  }
  if (row.duration_class !== "ONE_TIME") {
    return { ok: false, code: "NOT_ONE_TIME" };
  }
  if (row.state === "CONSUMED") {
    return { ok: false, code: "ALREADY_CONSUMED" };
  }
  if (row.state !== "ACTIVE") {
    return { ok: false, code: "NOT_ACTIVE" };
  }
  const now = new Date();
  await prisma.twinAuthorityGrant.update({
    where: { grant_id: input.grantId },
    data: { state: "CONSUMED", consumed_at: now },
  });
  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: row.grantor_entity_id,
    target_entity_id: row.grantee_entity_id,
    details: {
      action: "TWIN_AUTHORITY_CONSUMED",
      grant_id: row.grant_id,
    },
  });
  return { ok: true, grant_id: row.grant_id };
}

// WHAT: Pure helper — does this row match the requested action?
// INPUT: A grant row + the check input.
// OUTPUT: Boolean — whether the row's scope satisfies the request.
// WHY: Centralises the "does the scope cover the action" decision
//      so the check helper and any future check consumer agree.
function scopeMatchesCheck(
  row: {
    scope_type: TwinAuthorityScopeType;
    scope_id: string | null;
    action_type: string | null;
    connector_type: string | null;
    org_entity_id: string;
  },
  input: CheckTwinAuthorityInput,
): boolean {
  if (row.org_entity_id !== input.orgEntityId) return false;
  // scope_id, action_type, connector_type all narrow further when
  // present on the row; a missing value on the row means "any".
  if (row.scope_id !== null && row.scope_id !== input.scopeId) return false;
  if (
    row.action_type !== null &&
    input.actionType !== undefined &&
    input.actionType !== null &&
    row.action_type !== input.actionType
  ) {
    return false;
  }
  if (
    row.connector_type !== null &&
    input.connectorType !== undefined &&
    input.connectorType !== null &&
    row.connector_type !== input.connectorType
  ) {
    return false;
  }
  // ACTION_TYPE / CONNECTOR / WORKFLOW / CONVERSATION scopes
  // require the check's scope_type to match the row's scope_type.
  // PERSONAL / SESSION / PROJECT / TEAM / ORG scopes are broader
  // and may satisfy a narrower check (e.g. an ORG scope satisfies
  // a PROJECT-scoped check from the same org).
  const NARROW_SCOPES: ReadonlyArray<TwinAuthorityScopeType> = [
    "ACTION_TYPE",
    "CONNECTOR",
    "WORKFLOW",
    "CONVERSATION",
  ];
  if (NARROW_SCOPES.includes(row.scope_type)) {
    return row.scope_type === input.scopeType;
  }
  return true;
}

// WHAT: Check whether the grantee has authority to perform the
//        requested action.
// INPUT: CheckTwinAuthorityInput.
// OUTPUT: AuthorityCheckResult.
// WHY: Returns the matching grant_id (so a downstream consumer can
//      consume a ONE_TIME grant) plus the duration_class (so the
//      caller can render "your grant lasts until …"). On denial
//      returns a closed-vocab reason; never echoes raw constraints.
//      SENSITIVE_CASE_BY_CASE grants only satisfy checks whose
//      sensitivity_class is explicitly named on the request — the
//      "case-by-case" gate is enforced here.
//      Emits ADMIN_ACTION + details.action = "TWIN_AUTHORITY_CHECK_DENIED"
//      ON DENIAL only — allowed checks do not audit at this slice
//      (consumers may opt in to a USE audit at the action layer).
export async function checkAuthorityForAction(
  input: CheckTwinAuthorityInput,
): Promise<AuthorityCheckResult> {
  const now = input.now ?? new Date();
  const rows = await prisma.twinAuthorityGrant.findMany({
    where: {
      grantee_entity_id: input.granteeEntityId,
      org_entity_id: input.orgEntityId,
      state: "ACTIVE",
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
    },
    orderBy: { created_at: "desc" },
  });

  let deniedReason: AuthorityDenialReason = "NO_MATCHING_GRANT";

  for (const row of rows) {
    if (!scopeMatchesCheck(row, input)) {
      deniedReason = "OUT_OF_SCOPE";
      continue;
    }
    if (
      row.duration_class === "SENSITIVE_CASE_BY_CASE" &&
      input.sensitivityClass === undefined
    ) {
      deniedReason = "SENSITIVE_CASE_BY_CASE_REQUIRES_EXPLICIT_GRANT";
      continue;
    }
    if (
      row.sensitivity_class === "CONNECTOR_WRITE" &&
      input.connectorType === undefined
    ) {
      deniedReason = "CONNECTOR_WRITE_NOT_AUTHORIZED";
      continue;
    }
    return {
      allowed: true,
      grant_id: row.grant_id,
      duration_class: row.duration_class,
    };
  }

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "DENIED",
    actor_entity_id: input.granteeEntityId,
    target_entity_id: input.granteeEntityId,
    details: {
      action: "TWIN_AUTHORITY_CHECK_DENIED",
      reason: deniedReason,
      scope_type: input.scopeType,
      action_type: input.actionType ?? null,
      connector_type: input.connectorType ?? null,
    },
  });

  return { allowed: false, reason: deniedReason };
}
