// FILE: proposed-action-promotion.service.ts
// PURPOSE: W5 Action Promotion Runtime per ADR-0086 §2. The single
//          governed bridge between W4 Proposed Action substrate
//          (static catalog at docs/proposed-action/) and Section 2
//          Action runtime (apps/api/src/services/action/action.service.ts).
//
//          Composes against `createActionForCaller` verbatim — Section 2
//          retains ALL execution authority. This service:
//          1. resolves a W4 catalog entry by its `id` string,
//          2. evaluates `governance_gates`,
//          3. maps the catalog's `intended_external_system` to the
//             canonical Section 2 ActionType,
//          4. delegates to `createActionForCaller` with a SAFE
//             payload_redacted shape,
//          5. emits `PROPOSED_ACTION_REFERENCED` (NEW audit literal
//             per ADR-0086 §5) linking the resulting action_id back to
//             the catalog id.
//
//          NEVER bypasses Section 2 policy / approval / dual-control /
//          audit / sovereignty. NEVER carries vendor secret material,
//          raw payload content, raw transcript, chain-of-thought, or
//          PII.
//
// CONNECTS TO:
//   - apps/api/src/services/action/action.service.ts
//     (createActionForCaller — the canonical create surface)
//   - apps/api/src/services/proposed-action/proposed-action-catalog.ts
//     (catalog loader)
//   - packages/database (writeAuditEvent for PROPOSED_ACTION_REFERENCED)
//   - apps/api/src/routes/proposed-action.routes.ts (the HTTP surface)
//   - ADR-0086 §2 / §3 / §4 / §5 / §6 / §7

import { writeAuditEvent } from "@niov/database";
import {
  createActionForCaller,
  type CreateActionInput,
  type CreateActionResult,
} from "../action/action.service.js";
import type { SafeActionView } from "../action/views.js";
import {
  getProposedActionById,
  type ProposedActionEntry,
} from "./proposed-action-catalog.js";

export interface PromoteProposedActionInput {
  catalog_id: string;
  idempotency_key: string;
  runtime_data: Record<string, unknown>;
  payload_summary?: string;
  target_entity_id?: string | null;
}

export interface PromoteProposedActionOptions {
  dual_control_satisfied: boolean;
}

export type PromoteProposedActionResult =
  | {
      ok: true;
      httpStatus: 200;
      action: SafeActionView;
      proposed_action_catalog_id: string;
    }
  | {
      ok: false;
      httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 503;
      code: string;
      message?: string;
      unknown_fields?: string[];
      invalid_fields?: string[];
    };

// WHAT: Map a catalog's `intended_external_system` to the canonical
//        Section 2 ActionType.
// INPUT: An IntendedExternalSystem value.
// OUTPUT: The Section 2 ActionType the promotion will create.
// WHY: Closed-vocab deterministic mapping per ADR-0086 §3. INTERNAL_ONLY
//      maps to SEND_INTERNAL_NOTIFICATION (Wave 11 internal-only
//      handler); every other system maps to INVOKE_CONNECTOR (Section 4
//      runtime). The mapping is exhaustive against the W4 schema enum.
export function mapIntendedExternalSystemToActionType(
  intendedExternalSystem: ProposedActionEntry["intended_external_system"],
): "SEND_INTERNAL_NOTIFICATION" | "INVOKE_CONNECTOR" {
  if (intendedExternalSystem === "INTERNAL_ONLY") {
    return "SEND_INTERNAL_NOTIFICATION";
  }
  return "INVOKE_CONNECTOR";
}

// WHAT: Validate the body shape the route handler hands to the service.
// INPUT: Raw record body from the HTTP request.
// OUTPUT: Discriminated success + normalized | failure + invalid_fields.
// WHY: Single-place body validation so the route stays thin. UNKNOWN_FIELD
//      is rejected per ADR-0057 §9 precedent (defense-in-depth allowlist).
const PROMOTE_WRITABLE: ReadonlySet<string> = new Set([
  "idempotency_key",
  "runtime_data",
  "payload_summary",
  "target_entity_id",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validatePromoteBody(
  body: Record<string, unknown>,
):
  | { ok: true; normalized: Omit<PromoteProposedActionInput, "catalog_id"> }
  | {
      ok: false;
      code: "UNKNOWN_FIELD" | "INVALID_FIELD";
      unknown_fields?: string[];
      invalid_fields?: string[];
    } {
  const incoming = Object.keys(body);
  const unknown = incoming.filter((k) => !PROMOTE_WRITABLE.has(k));
  if (unknown.length > 0) {
    return { ok: false, code: "UNKNOWN_FIELD", unknown_fields: unknown };
  }
  const invalid: string[] = [];
  const idem = body.idempotency_key;
  if (typeof idem !== "string" || idem.length === 0 || idem.length > 200) {
    invalid.push("idempotency_key");
  }
  const runtime = body.runtime_data;
  if (
    runtime === null ||
    runtime === undefined ||
    typeof runtime !== "object" ||
    Array.isArray(runtime)
  ) {
    invalid.push("runtime_data");
  }
  const summaryRaw = body.payload_summary;
  if (summaryRaw !== undefined) {
    if (typeof summaryRaw !== "string" || summaryRaw.length === 0) {
      invalid.push("payload_summary");
    }
  }
  const target = body.target_entity_id;
  if (target !== undefined && target !== null) {
    if (typeof target !== "string" || !UUID_RE.test(target)) {
      invalid.push("target_entity_id");
    }
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  const normalized: Omit<PromoteProposedActionInput, "catalog_id"> = {
    idempotency_key: idem as string,
    runtime_data: runtime as Record<string, unknown>,
  };
  if (typeof summaryRaw === "string") {
    normalized.payload_summary = summaryRaw;
  }
  if (typeof target === "string") {
    normalized.target_entity_id = target;
  }
  return { ok: true, normalized };
}

// WHAT: Build the Section 2 CreateActionInput from the catalog entry +
//        runtime_data.
// INPUT: catalog entry + caller-supplied runtime_data + idempotency +
//        payload_summary override + target_entity_id.
// OUTPUT: A typed CreateActionInput Section 2's validators accept.
// WHY: The catalog supplies intent (action_type via intended_external_system
//      mapping; governance gates; SAFE projection metadata). The runtime
//      data supplies the executor-needed slots (binding_id /
//      recipient_entity_id / etc.). The promotion service does NOT
//      fabricate payload data; the caller binds the proposal to a
//      specific binding or recipient per their org context.
//
//      payload_redacted always carries the catalog back-reference at the
//      `proposed_action_catalog_id` key so the resulting Section 2 row
//      links to the W4 origin. The caller's runtime_data is passed
//      through verbatim into payload_redacted alongside that
//      back-reference — Section 2's per-ActionType validator gates
//      every field.
export function buildCreateActionInput(
  entry: ProposedActionEntry,
  runtimeData: Record<string, unknown>,
  idempotencyKey: string,
  payloadSummaryOverride: string | undefined,
  targetEntityId: string | null | undefined,
): CreateActionInput {
  const action_type = mapIntendedExternalSystemToActionType(
    entry.intended_external_system,
  );
  const payload_redacted: Record<string, unknown> = {
    ...runtimeData,
    proposed_action_catalog_id: entry.id,
  };
  const payload_summary =
    payloadSummaryOverride ?? entry.name.slice(0, 200);
  const input: CreateActionInput = {
    action_type,
    idempotency_key: idempotencyKey,
    payload_summary,
    payload_redacted,
  };
  if (targetEntityId !== undefined && targetEntityId !== null) {
    input.target_entity_id = targetEntityId;
  }
  return input;
}

// WHAT: Promote a W4 proposed action into a Section 2 Action row.
// INPUT: caller entity id + promote input + dual-control satisfaction
//        signal (set by the route boundary per ADR-0086 §4 — the
//        plain route always passes false; the dual-control-wrapped
//        route passes true).
// OUTPUT: Discriminated success + Section 2 ActionView + catalog
//         back-reference; or typed failure.
// WHY: The single conversion point. Composes against
//      createActionForCaller verbatim so Section 2 retains all
//      execution authority. Emits PROPOSED_ACTION_REFERENCED on
//      success (and on Section-2-tier policy DENIED).
export async function promoteProposedActionForCaller(
  callerEntityId: string,
  input: PromoteProposedActionInput,
  options: PromoteProposedActionOptions,
): Promise<PromoteProposedActionResult> {
  const entry = getProposedActionById(input.catalog_id);
  if (entry === null) {
    return {
      ok: false,
      httpStatus: 404,
      code: "PROPOSED_ACTION_NOT_FOUND",
      message: `No proposed action found with catalog id ${input.catalog_id}`,
    };
  }
  if (entry.proposed_action_state !== "PROPOSED_NOT_AUTHORIZED") {
    return {
      ok: false,
      httpStatus: 409,
      code: "PROPOSED_ACTION_NOT_PROMOTABLE",
      message: `Catalog entry ${input.catalog_id} is not in PROPOSED_NOT_AUTHORIZED state`,
    };
  }
  if (
    entry.governance_gates.dual_control_required &&
    options.dual_control_satisfied === false
  ) {
    return {
      ok: false,
      httpStatus: 409,
      code: "DUAL_CONTROL_REQUIRED",
      message:
        "This proposed action requires dual-control. Use POST /api/v1/proposed-actions/:catalog_id/promote-dual-control",
    };
  }
  const createInput = buildCreateActionInput(
    entry,
    input.runtime_data,
    input.idempotency_key,
    input.payload_summary,
    input.target_entity_id,
  );
  const section2: CreateActionResult = await createActionForCaller(
    callerEntityId,
    createInput,
  );
  if (section2.ok === false) {
    return {
      ok: false,
      httpStatus: section2.httpStatus,
      code: section2.code,
      ...(section2.message !== undefined && { message: section2.message }),
      ...(section2.unknown_fields !== undefined && {
        unknown_fields: section2.unknown_fields,
      }),
      ...(section2.invalid_fields !== undefined && {
        invalid_fields: section2.invalid_fields,
      }),
    };
  }
  await writeAuditEvent({
    event_type: "PROPOSED_ACTION_REFERENCED",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: {
      catalog_id: entry.id,
      action_id: section2.view.action_id,
      plan_archetype_id: entry.plan_archetype_id,
      actor_role: entry.actor_role,
      intended_external_system: entry.intended_external_system,
      operation: entry.operation,
      dual_control_required: entry.governance_gates.dual_control_required,
      dual_control_satisfied: options.dual_control_satisfied,
      approval_chain_required: entry.governance_gates.approval_chain_required,
      policy_decision_required: entry.governance_gates.policy_decision_required,
      retention_class: entry.retention_class,
      section2_status: section2.view.status,
      section2_decision_reason: section2.view.decision_reason ?? null,
    },
  });
  return {
    ok: true,
    httpStatus: 200,
    action: section2.view,
    proposed_action_catalog_id: entry.id,
  };
}
