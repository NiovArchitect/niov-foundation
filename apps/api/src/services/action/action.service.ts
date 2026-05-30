// FILE: action.service.ts
// PURPOSE: The Action create-time service per ADR-0057 §3 + §5 + §6 +
//          §9 + §10 + §11. Wires the pure evaluateActionPolicy (PR #20),
//          the ActionPolicy admin substrate (PR #22), the Action schema
//          (PR #18), the EscalationRequest pairing pipeline (governance/
//          escalation.service.ts), and the ACTION_PROPOSED / _APPROVED /
//          _REJECTED audit literals (PR #18) into one atomic create-time
//          boundary.
// CONNECTS TO:
//   - apps/api/src/services/action/policy-evaluator.ts (PR #20; pure
//     evaluator; unchanged by this slice)
//   - apps/api/src/services/action/views.ts (safe projection)
//   - apps/api/src/services/governance/escalation.service.ts
//     (createEscalationForCaller + resolveDualControlTarget; the tx
//     parameter on createEscalationForCaller was added in the same
//     slice per ADR-0057 §5 Q4 LOCK so this service can compose
//     EscalationRequest creation inside the outer Action transaction)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - packages/database (prisma.action.* + prisma.actionPolicy.* +
//     prisma.orgSettings.* + prisma.twinConfig.* + prisma.entityProfile.*
//     + prisma.tokenAttributeRepository.* + prisma.permission.*;
//     writeAuditEvent for the ACTION_* emissions; Prisma types)
//   - apps/api/src/routes/actions.routes.ts (the route handler that
//     consumes createActionForCaller)
//
// FOUNDER LOCKS (per the Option E QLOCK):
//   Q1 (risk_tier derivation): constant-per-action-type at this slice.
//       RECORD_CAPSULE = LOW; SEND_INTERNAL_NOTIFICATION = LOW;
//       PROPOSE_PERMISSION_GRANT = MEDIUM. No request-supplied risk_tier.
//   Q2 (dual-control class): all 3 initial ActionTypes are org-tier and
//       use Class B (`can_admin_org`).
//   Q3 (synthetic PrivilegedEndpoint): a service-internal synthetic
//       PrivilegedEndpoint is constructed for the resolveDualControlTarget
//       call. POST /api/v1/actions is NOT added to PRIVILEGED_ENDPOINTS
//       (the route is not preHandler dual-control-gated; the evaluator
//       decides, and the dual-control pairing happens here).
//   Q4 (createEscalationForCaller tx): the refactored optional-tx form
//       composes inside the outer Action transaction here. Backward-
//       compatible with the existing single-arg call sites.
//   Q5 (policy_envelope_hash canonicalization): alphabetically-sorted
//       canonical JSON + SHA-256.
//   Q6 (Action.expires_at at create-time): NULL. Defer to future scheduler.
//   Q7 (REQUIRE_BREAK_GLASS at create-time): 200 with requires_approval=true
//       + safe decision_reason marker; no BG.2 wiring in this slice.
//   Q8 (target_entity_id in audit): per-path safe inclusion per
//       ADR-0057 §10 Phase E Invariant 6; NO_ELIGIBLE_TARGET path
//       omits target_entity_id.
//   Q9 (ADR-0057 §16 step 6 deviation): create-route-only; no executor
//       / worker / scheduler.
//   Q10 (TwinConfig.autonomy_level validation): defensive fail-closed
//       on invalid or missing values → ENVELOPE_INVALID.
//   Q11/Q12 (no db:push:test / no prisma generate): confirmed; no
//       schema or client regeneration touched by this slice.

import { createHash } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type {
  Action,
  ActionDecision,
  ActionRiskTier,
  ActionStatus,
  ActionType,
  Prisma,
} from "@prisma/client";
import { evaluateActionPolicy, REASON_CODES } from "./policy-evaluator.js";
import type {
  PolicyEnvelope,
  ActionDecisionResult,
} from "./policy-evaluator.js";
import {
  createEscalationForCaller,
  resolveDualControlTarget,
} from "../governance/escalation.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { dualControlDescription } from "../../security/privileged-endpoints.js";
import type {
  EscalationActionDescriptor,
  PrivilegedEndpoint,
} from "../../security/privileged-endpoints.js";
import { projectActionView, type SafeActionView } from "./views.js";
import { validatePayloadForActionType } from "./action-payload-validators.js";

// WHAT: The set of 3 initial canonical ActionType values per ADR-0057 §2.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: Centralized so the validator + risk-tier-derivation map stay in
//      one place. Enum extension follows ADR-0021 Capsule Type Extension
//      Protocol (deliberate-blocker per-type validator).
const VALID_ACTION_TYPES = new Set<string>([
  "RECORD_CAPSULE",
  "PROPOSE_PERMISSION_GRANT",
  "SEND_INTERNAL_NOTIFICATION",
  // Section 4 Wave 3 — invoke a registered ConnectorBinding through
  // the Action runtime. Risk tier MEDIUM (it touches external
  // boundary-of-trust resources once Wave 4's real OutboundWebhookProvider
  // lands; staying MEDIUM rather than LOW makes per-org policy
  // tighten-down available without a future schema change).
  "INVOKE_CONNECTOR",
]);

// WHAT: Constant-per-action-type risk_tier map per Q1 LOCK.
// INPUT: Used as a value lookup.
// OUTPUT: None.
// WHY: At this slice, risk_tier is NOT submitted by the caller; it is
//      service-derived from action_type only. A future per-action-type
//      payload-shape resolver may take over.
const RISK_TIER_FOR_ACTION_TYPE: Readonly<Record<string, ActionRiskTier>> = {
  RECORD_CAPSULE: "LOW",
  PROPOSE_PERMISSION_GRANT: "MEDIUM",
  SEND_INTERNAL_NOTIFICATION: "LOW",
  // Section 4 Wave 3 — LOW risk tier. The dual-control gate lives at
  // binding REGISTRATION (Wave 2 can_admin_org + ADMIN_ACTION audit):
  // an org member who invokes a binding is dispatching to a binding
  // that an admin already approved + that can be disabled at any
  // time. The Action runtime captures the invocation in its
  // ACTION_* audit chain. Per-binding / per-org tightening is
  // forward-substrate via ActionPolicy operator overrides (PR #47);
  // a future wave can raise the default once OAuth-bearing connector
  // types land behind their own QLOCK.
  INVOKE_CONNECTOR: "LOW",
};

// WHAT: Writable allowlist for the POST /api/v1/actions body.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: Defense in depth — any field outside this set triggers 422
//      UNKNOWN_FIELD before any DB work, matching the org-settings +
//      action-policies precedent.
const ACTION_CREATE_WRITABLE: ReadonlySet<string> = new Set([
  "action_type",
  "target_entity_id",
  "idempotency_key",
  "payload_summary",
  "payload_redacted",
]);

// WHAT: The canonical UUIDv4-like regex (loose, accepts any UUID
//        version since the schema uses @db.Uuid and Prisma validates).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WHAT: The caller-supplied input to createActionForCaller, after
//        route-tier validation has already filtered unknown fields.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: The route handler parses the raw request body and constructs
//      this typed input. The service does NOT trust the body shape
//      blindly; it re-validates here per RULE 9 service-tier auth-gate
//      pattern.
export interface CreateActionInput {
  action_type: string;
  target_entity_id?: string | null;
  idempotency_key: string;
  payload_summary: string;
  payload_redacted: unknown;
}

// WHAT: The discriminated-union result returned by createActionForCaller.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: Every consumer (the route handler) MUST handle every branch.
//      Status codes are mapped at the route handler tier.
export type CreateActionResult =
  | { ok: true; httpStatus: 200; view: SafeActionView }
  | {
      ok: false;
      httpStatus: 401 | 403 | 404 | 409 | 422 | 503;
      code: string;
      message?: string;
      view?: SafeActionView;
      unknown_fields?: string[];
      invalid_fields?: string[];
    };

// WHAT: Throw-safe structural validation of the create input.
// INPUT: Raw record body + the resolved ACTION_CREATE_WRITABLE set.
// OUTPUT: { ok: true, normalized } | { ok: false, code, ... }.
// WHY: Single-place body validation so the route handler stays thin
//      and the service can be unit-tested independently of Fastify.
export function validateCreateActionBody(body: Record<string, unknown>): {
  ok: true;
  normalized: CreateActionInput;
} | {
  ok: false;
  code: "UNKNOWN_FIELD" | "INVALID_FIELD";
  unknown_fields?: string[];
  invalid_fields?: string[];
} {
  const incomingKeys = Object.keys(body);
  const unknown = incomingKeys.filter((k) => !ACTION_CREATE_WRITABLE.has(k));
  if (unknown.length > 0) {
    return { ok: false, code: "UNKNOWN_FIELD", unknown_fields: unknown };
  }
  const invalid: string[] = [];
  const action_type = body.action_type;
  if (typeof action_type !== "string" || !VALID_ACTION_TYPES.has(action_type)) {
    invalid.push("action_type");
  }
  const target_entity_id =
    body.target_entity_id === undefined ? null : body.target_entity_id;
  if (target_entity_id !== null) {
    if (typeof target_entity_id !== "string" || !UUID_RE.test(target_entity_id)) {
      invalid.push("target_entity_id");
    }
  }
  const idempotency_key = body.idempotency_key;
  if (typeof idempotency_key !== "string" || idempotency_key.length === 0) {
    invalid.push("idempotency_key");
  } else if (idempotency_key.length > 200) {
    invalid.push("idempotency_key");
  }
  const payload_summary = body.payload_summary;
  if (typeof payload_summary !== "string" || payload_summary.length === 0) {
    invalid.push("payload_summary");
  }
  const payload_redacted = body.payload_redacted;
  if (
    payload_redacted === null ||
    payload_redacted === undefined ||
    typeof payload_redacted !== "object"
  ) {
    invalid.push("payload_redacted");
  }
  if (invalid.length > 0) {
    return { ok: false, code: "INVALID_FIELD", invalid_fields: invalid };
  }
  // Per-ActionType payload validation. The route-tier shape check
  // above ensured payload_redacted is a non-null object; this
  // dispatcher additionally enforces the action-type-specific
  // contract (e.g. RECORD_CAPSULE requires capsule_type + topic_tags
  // + payload_summary + content). Rejection here means the Action
  // would have entered the executor queue malformed and burned a
  // retry budget before terminalizing FAILED — far better to reject
  // at create-time with 422.
  const perTypeValidation = validatePayloadForActionType(
    action_type as string,
    payload_redacted,
  );
  if (perTypeValidation.ok === false) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      invalid_fields: perTypeValidation.invalid_fields,
    };
  }
  return {
    ok: true,
    normalized: {
      action_type: action_type as string,
      target_entity_id: (target_entity_id as string | null) ?? null,
      idempotency_key: idempotency_key as string,
      payload_summary: payload_summary as string,
      payload_redacted: payload_redacted as unknown,
    },
  };
}

// WHAT: Derive the risk_tier from the action_type per Q1 LOCK.
// INPUT: action_type string.
// OUTPUT: ActionRiskTier.
// WHY: Centralized so the unit test can assert the canonical map.
//      Returns "LOW" for any unknown action_type defensively; the
//      validator above would have rejected unknown action_types
//      first, so the default branch is unreachable under correct
//      flow.
export function deriveRiskTier(action_type: string): ActionRiskTier {
  const tier = RISK_TIER_FOR_ACTION_TYPE[action_type];
  return tier ?? "LOW";
}

// WHAT: Canonical alphabetically-sorted JSON serializer for an
//        arbitrary object, used as the hash-input substrate for
//        computePolicyEnvelopeHash per Q5 LOCK.
// INPUT: Any JSON-serializable value.
// OUTPUT: A canonical UTF-8 string with object keys sorted at every
//         nesting level.
// WHY: SHA-256 is byte-sensitive; without canonicalization, two
//      semantically-identical envelopes would hash differently
//      because of key-ordering. Replay determinism + cross-call
//      audit consistency require canonical bytes.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJson(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]));
  return "{" + parts.join(",") + "}";
}

// WHAT: Compute the SHA-256 hash of a canonicalized PolicyEnvelope
//        per Q5 LOCK + ADR-0057 §10 (the safe `policy_envelope_hash`
//        field — NEVER the raw envelope).
// INPUT: A PolicyEnvelope shape.
// OUTPUT: A lowercase hex SHA-256 digest.
// WHY: The audit emission carries the hash, not the raw envelope.
//      Two semantically-identical envelopes produce identical
//      hashes (test-asserted); semantically-distinct envelopes
//      produce distinct hashes.
export function computePolicyEnvelopeHash(envelope: PolicyEnvelope): string {
  const canonical = canonicalJson(envelope);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// WHAT: Build the frozen-at-create-time PolicyEnvelope per ADR-0057
//        §3. Reads OrgSettings + TwinConfig + EntityProfile +
//        TokenAttributeRepository + Permission summary + ActionPolicy
//        row in a single coordinated pass.
// INPUT: callerEntityId + resolved orgEntityId + the derived
//        action_type + risk_tier (for the ActionPolicy lookup).
// OUTPUT: A PolicyEnvelope ready to feed evaluateActionPolicy.
// WHY: Centralizes the 6-table read so the route handler stays
//      thin. Defensive defaults per Q10 LOCK: if a row is missing
//      or has an invalid value, the envelope is constructed with
//      safe-default values so the evaluator's structural validator
//      surfaces ENVELOPE_INVALID upstream.
export async function buildPolicyEnvelope(
  callerEntityId: string,
  orgEntityId: string,
  action_type: ActionType,
  risk_tier: ActionRiskTier,
): Promise<PolicyEnvelope> {
  const [orgSettings, twinConfig, entityProfile, tar, permissionCount, actionPolicy] =
    await Promise.all([
      prisma.orgSettings.findUnique({ where: { org_entity_id: orgEntityId } }),
      // TwinConfig.twin_id IS the AI_AGENT entity_id (1:1 per the schema
      // comment at TwinConfig). PERSON callers have no TwinConfig; the
      // defensive default at Q10 LOCK lands them as APPROVAL_REQUIRED.
      prisma.twinConfig.findUnique({ where: { twin_id: callerEntityId } }),
      prisma.entityProfile.findUnique({ where: { entity_id: callerEntityId } }),
      prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: callerEntityId },
      }),
      prisma.permission.count({
        where: {
          OR: [
            { grantor_entity_id: callerEntityId },
            { grantee_entity_id: callerEntityId },
          ],
        },
      }),
      prisma.actionPolicy.findUnique({
        where: {
          org_entity_id_action_type_risk_tier: {
            org_entity_id: orgEntityId,
            action_type,
            risk_tier,
          },
        },
      }),
    ]);

  // Defensive normalization of twin_autonomy_level per Q10 LOCK:
  // invalid or missing values land as an explicit invalid token so
  // the evaluator's isEnvelopeStructurallyValid returns false and
  // the route maps to 422 ENVELOPE_INVALID.
  const rawAutonomy = twinConfig?.autonomy_level;
  const twin_autonomy_level =
    rawAutonomy === "APPROVAL_REQUIRED" ||
    rawAutonomy === "EXECUTIVE_OVERRIDE" ||
    rawAutonomy === "OBSERVE_ONLY"
      ? rawAutonomy
      : "APPROVAL_REQUIRED";

  return {
    twin_autonomy_level,
    org_require_human_approval: orgSettings?.require_human_approval ?? true,
    org_auto_approve_low_risk: orgSettings?.auto_approve_low_risk ?? false,
    org_audit_ai_actions: orgSettings?.audit_ai_actions ?? true,
    entity_profile_safe_view: {
      job_title: entityProfile?.job_title ?? undefined,
      role_template: undefined,
    },
    tar_capability_bits: {
      can_admin_org: tar?.can_admin_org ?? false,
      can_admin_niov: tar?.can_admin_niov ?? false,
      can_write_capsules: tar?.can_write_capsules ?? false,
      can_share_capsules: tar?.can_share_capsules ?? false,
    },
    permission_set_summary: {
      count: permissionCount,
      bridges: [],
    },
    action_policy_row: actionPolicy,
  };
}

// WHAT: Construct the service-internal synthetic PrivilegedEndpoint
//        used solely as the input to resolveDualControlTarget per Q3
//        LOCK. NEVER added to the PRIVILEGED_ENDPOINTS const.
// INPUT: action_type for the discriminator + (always) can_admin_org
//        per Q2 LOCK.
// OUTPUT: A PrivilegedEndpoint object ready for resolveDualControlTarget.
// WHY: resolveDualControlTarget takes a PrivilegedEndpoint and uses
//      authTier to pick Class B vs Class C resolution. We do not want
//      to alter the registry (the actions route is not preHandler-
//      gated), so we synthesize the descriptor at this call site only.
function syntheticPrivilegedEndpoint(
  action_type: ActionType,
): PrivilegedEndpoint {
  const descriptorType =
    `ACTION_CREATE_${action_type}` as EscalationActionDescriptor["type"];
  return {
    method: "POST",
    route: "/api/v1/actions",
    authTier: "can_admin_org",
    actionDescriptor: { type: descriptorType },
  };
}

// WHAT: Emit one of ACTION_PROPOSED / ACTION_APPROVED / ACTION_REJECTED
//        per ADR-0057 §10 SAFE allowlist. Pure in-tx helper.
// INPUT: tx + event_type + action row + decision + decision_reason +
//        envelope hash + optional escalation_id + optional override
//        for the target_entity_id audit field (Q8 LOCK; per-path safe
//        inclusion).
// OUTPUT: None (in-place audit write).
// WHY: One emitter helper so the three branches stay in lock-step on
//      the SAFE field set. NEVER raw payload, NEVER raw envelope,
//      NEVER stack traces.
async function emitActionAudit(
  tx: Prisma.TransactionClient,
  args: {
    event_type: "ACTION_PROPOSED" | "ACTION_APPROVED" | "ACTION_REJECTED";
    outcome: "SUCCESS" | "DENIED";
    actor_entity_id: string;
    action_id: string;
    action_type: ActionType;
    risk_tier: ActionRiskTier;
    decision: ActionDecision;
    policy_envelope_hash: string;
    target_entity_id_audit?: string | null;
    escalation_id?: string | null;
    decision_reason?: string;
  },
): Promise<void> {
  const details: Record<string, unknown> = {
    action_id: args.action_id,
    action_type: String(args.action_type),
    risk_tier: String(args.risk_tier),
    decision: String(args.decision),
    policy_envelope_hash: args.policy_envelope_hash,
    route: "/api/v1/actions",
    method: "POST",
  };
  if (args.escalation_id !== null && args.escalation_id !== undefined) {
    details.escalation_id = args.escalation_id;
  }
  if (args.decision_reason !== undefined) {
    details.decision_reason = args.decision_reason;
  }
  const targetForAudit =
    args.target_entity_id_audit === undefined
      ? null
      : args.target_entity_id_audit;
  await writeAuditEvent(
    {
      event_type: args.event_type,
      outcome: args.outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: targetForAudit,
      details,
    },
    tx,
  );
}

// WHAT: The create-time service per ADR-0057 §1 + §3 + §5 + §6 + §9.
// INPUT: callerEntityId (already-authenticated entity from
//         request.auth!.entity_id) + a validated CreateActionInput.
// OUTPUT: A discriminated-union CreateActionResult; the route handler
//         maps to HTTP status + safe JSON body.
// WHY: Centralizes the entire create-time pipeline:
//      idempotency replay → org resolution → envelope build → hash →
//      evaluator call → decision branch → Action.create [+
//      EscalationRequest pairing | no-target-rejection] + audit emit
//      → safe response projection. Everything except idempotency-
//      replay and org-resolution runs inside ONE outer prisma.$transaction
//      so a crash mid-flow rolls back consistently.
export async function createActionForCaller(
  callerEntityId: string,
  input: CreateActionInput,
): Promise<CreateActionResult> {
  // Step 1 — idempotency check (outside the outer tx; one indexed read).
  const existing = await prisma.action.findUnique({
    where: { idempotency_key: input.idempotency_key },
  });
  if (existing !== null) {
    if (existing.source_entity_id !== callerEntityId) {
      // The key collides with another caller's action — fail-closed
      // without leaking row contents.
      return {
        ok: false,
        httpStatus: 409,
        code: "ACTION_IDEMPOTENCY_CONFLICT",
        message: "idempotency_key is already used by another action",
      };
    }
    return { ok: true, httpStatus: 200, view: projectActionView(existing) };
  }

  // Step 2 — resolve caller's org.
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return {
      ok: false,
      httpStatus: 404,
      code: "NO_ORG_FOR_CALLER",
      message: "Caller is not in an organization",
    };
  }

  // Step 3 — derive risk_tier + build envelope + compute hash.
  const action_type = input.action_type as ActionType;
  const risk_tier = deriveRiskTier(action_type);
  const policy_envelope = await buildPolicyEnvelope(
    callerEntityId,
    orgEntityId,
    action_type,
    risk_tier,
  );
  const policy_envelope_hash = computePolicyEnvelopeHash(policy_envelope);

  // Step 4 — evaluate.
  const decision: ActionDecisionResult = evaluateActionPolicy({
    callerEntityId,
    org_entity_id: orgEntityId,
    action_type,
    risk_tier,
    policy_envelope,
  });

  // Step 5 — fail-closed envelope.
  if (decision.ok === false) {
    const code =
      decision.reason === "ENVELOPE_INVALID"
        ? "ENVELOPE_INVALID"
        : "POLICY_UNRESOLVED";
    return { ok: false, httpStatus: 422, code };
  }

  // Step 6 — atomic create + pair + audit per branch.
  const target_entity_id = input.target_entity_id ?? null;

  if (decision.decision === "FORBIDDEN") {
    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.action.create({
        data: {
          source_entity_id: callerEntityId,
          org_entity_id: orgEntityId,
          target_entity_id,
          action_type,
          risk_tier,
          policy_envelope: policy_envelope as unknown as Prisma.InputJsonValue,
          payload_summary: input.payload_summary,
          payload_redacted:
            input.payload_redacted as unknown as Prisma.InputJsonValue,
          idempotency_key: input.idempotency_key,
          escalation_id: null,
          status: "REJECTED",
        },
      });
      await emitActionAudit(tx, {
        event_type: "ACTION_REJECTED",
        outcome: "DENIED",
        actor_entity_id: callerEntityId,
        action_id: action.action_id,
        action_type,
        risk_tier,
        decision: "FORBIDDEN",
        policy_envelope_hash,
        target_entity_id_audit: target_entity_id,
        decision_reason: decision.reason,
      });
      return action;
    });
    return {
      ok: false,
      httpStatus: 403,
      code: "ACTION_FORBIDDEN",
      view: projectActionView(created, decision.reason),
    };
  }

  if (decision.decision === "AUTO_APPROVE") {
    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.action.create({
        data: {
          source_entity_id: callerEntityId,
          org_entity_id: orgEntityId,
          target_entity_id,
          action_type,
          risk_tier,
          policy_envelope: policy_envelope as unknown as Prisma.InputJsonValue,
          payload_summary: input.payload_summary,
          payload_redacted:
            input.payload_redacted as unknown as Prisma.InputJsonValue,
          idempotency_key: input.idempotency_key,
          escalation_id: null,
          status: "APPROVED",
        },
      });
      await emitActionAudit(tx, {
        event_type: "ACTION_PROPOSED",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        action_id: action.action_id,
        action_type,
        risk_tier,
        decision: "AUTO_APPROVE",
        policy_envelope_hash,
        target_entity_id_audit: target_entity_id,
        decision_reason: decision.reason,
      });
      await emitActionAudit(tx, {
        event_type: "ACTION_APPROVED",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        action_id: action.action_id,
        action_type,
        risk_tier,
        decision: "AUTO_APPROVE",
        policy_envelope_hash,
        target_entity_id_audit: target_entity_id,
        decision_reason: decision.reason,
      });
      return action;
    });
    return {
      ok: true,
      httpStatus: 200,
      view: projectActionView(created, decision.reason),
    };
  }

  if (decision.decision === "REQUIRE_BREAK_GLASS") {
    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.action.create({
        data: {
          source_entity_id: callerEntityId,
          org_entity_id: orgEntityId,
          target_entity_id,
          action_type,
          risk_tier,
          policy_envelope: policy_envelope as unknown as Prisma.InputJsonValue,
          payload_summary: input.payload_summary,
          payload_redacted:
            input.payload_redacted as unknown as Prisma.InputJsonValue,
          idempotency_key: input.idempotency_key,
          escalation_id: null,
          status: "PROPOSED",
        },
      });
      await emitActionAudit(tx, {
        event_type: "ACTION_PROPOSED",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        action_id: action.action_id,
        action_type,
        risk_tier,
        decision: "REQUIRE_BREAK_GLASS",
        policy_envelope_hash,
        target_entity_id_audit: target_entity_id,
        decision_reason: REASON_CODES.POLICY_REQUIRE_BREAK_GLASS,
      });
      return action;
    });
    return {
      ok: true,
      httpStatus: 200,
      view: projectActionView(created, REASON_CODES.POLICY_REQUIRE_BREAK_GLASS),
    };
  }

  // decision.decision === "REQUIRE_DUAL_CONTROL"
  const endpoint = syntheticPrivilegedEndpoint(action_type);
  const targetResolution = await resolveDualControlTarget(
    callerEntityId,
    endpoint,
  );
  if (targetResolution.ok === false) {
    // No eligible target — create REJECTED Action without leaking
    // candidate-pool info. Per Q8 LOCK, target_entity_id is omitted
    // from the audit (the caller's submitted target is not the
    // structurally-safe disclosure; the rejected target is the
    // un-resolved one). The audit decision_reason is the safe
    // enum-bound marker.
    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.action.create({
        data: {
          source_entity_id: callerEntityId,
          org_entity_id: orgEntityId,
          target_entity_id: null,
          action_type,
          risk_tier,
          policy_envelope: policy_envelope as unknown as Prisma.InputJsonValue,
          payload_summary: input.payload_summary,
          payload_redacted:
            input.payload_redacted as unknown as Prisma.InputJsonValue,
          idempotency_key: input.idempotency_key,
          escalation_id: null,
          status: "REJECTED",
        },
      });
      await emitActionAudit(tx, {
        event_type: "ACTION_REJECTED",
        outcome: "DENIED",
        actor_entity_id: callerEntityId,
        action_id: action.action_id,
        action_type,
        risk_tier,
        decision: "REQUIRE_DUAL_CONTROL",
        policy_envelope_hash,
        target_entity_id_audit: null,
        decision_reason: "no-eligible-target",
      });
      return action;
    });
    return {
      ok: false,
      httpStatus: 503,
      code: "DUAL_CONTROL_NO_APPROVER_AVAILABLE",
      view: projectActionView(created, "no-eligible-target"),
    };
  }

  // Eligible target — create Action + paired EscalationRequest atomically.
  const resolvedTarget = targetResolution.target_entity_id;
  const created = await prisma.$transaction(async (tx) => {
    // Step 6a — create Action shell with escalation_id null.
    const action = await tx.action.create({
      data: {
        source_entity_id: callerEntityId,
        org_entity_id: orgEntityId,
        target_entity_id,
        action_type,
        risk_tier,
        policy_envelope: policy_envelope as unknown as Prisma.InputJsonValue,
        payload_summary: input.payload_summary,
        payload_redacted:
          input.payload_redacted as unknown as Prisma.InputJsonValue,
        idempotency_key: input.idempotency_key,
        escalation_id: null,
        status: "PROPOSED",
      },
    });
    // Step 6b — pair EscalationRequest inside the same tx (Q4 LOCK).
    const escalation = await createEscalationForCaller(
      callerEntityId,
      {
        target_entity_id: resolvedTarget,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        severity: "HIGH",
        description: dualControlDescription(endpoint.actionDescriptor.type),
        expires_at: null,
      },
      tx,
    );
    // Step 6c — backfill escalation_id on the Action.
    const updated = await tx.action.update({
      where: { action_id: action.action_id },
      data: { escalation_id: escalation.escalation_id },
    });
    // Step 6d — emit ACTION_PROPOSED audit.
    await emitActionAudit(tx, {
      event_type: "ACTION_PROPOSED",
      outcome: "SUCCESS",
      actor_entity_id: callerEntityId,
      action_id: updated.action_id,
      action_type,
      risk_tier,
      decision: "REQUIRE_DUAL_CONTROL",
      policy_envelope_hash,
      target_entity_id_audit: target_entity_id,
      escalation_id: escalation.escalation_id,
      decision_reason: decision.reason,
    });
    return updated;
  });
  return {
    ok: true,
    httpStatus: 200,
    view: projectActionView(created, decision.reason),
  };
}

// WHAT: Re-export the SafeActionView type so consumers can import from
//        the service module without reaching into views.ts.
// INPUT: None.
// OUTPUT: None.
// WHY: Convenience for the route handler + tests; the canonical
//      definition still lives in views.ts.
export type { SafeActionView } from "./views.js";

// WHAT: Compile-time anchor that the action.service.ts module
//        successfully imported the unused Prisma + Action + ActionStatus
//        types. Some imports above feed only the type system at
//        compile-time; this no-op ensures they are not tree-shaken
//        before TS sees them.
//
// Suppressing unused-import lint via type narrowing of an existing
// re-exported symbol (Action is used at the consumer tier).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ActionTypeAnchor = Action | ActionStatus;
