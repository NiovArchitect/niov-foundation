// FILE: org-collaboration-policy.routes.ts
// PURPOSE: Phase 2 PR 3 — admin HTTP surface for the
//          OrgCollaborationPolicy substrate landed at PR #284.
//          can_admin_org-gated routes for managing the per-org
//          policy matrix that governs how TwinCollaborationRequest
//          creates resolve (PR #285).
//
//          - GET  /api/v1/orgs/me/collaboration-policy
//          - POST /api/v1/orgs/me/collaboration-policy
//
//          Both routes resolve the caller's org via getOrgEntityId
//          (mirroring auth-admin.routes.ts) — admins manage their
//          OWN org's policy, never another org's.
//
// PRIVACY INVARIANT:
//   - Response always projects through
//     projectOrgCollaborationPolicySafeView.
//   - org_entity_id never appears in the response payload.
//
// CONNECTS TO:
//   - apps/api/src/services/governance/org-collaboration-policy.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability("can_admin_org"))

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  listOrgCollaborationPoliciesForOrg,
  upsertOrgCollaborationPolicyForCaller,
  type OrgCollaborationOutcome,
  type OrgCollaborationScope,
} from "../services/governance/org-collaboration-policy.service.js";
import type {
  TwinAuthoritySensitivityClass,
  TwinCollaborationRequestType,
} from "@prisma/client";

const VALID_SCOPES: ReadonlyArray<OrgCollaborationScope> = [
  "SAME_TEAM",
  "SAME_PROJECT",
  "CROSS_TEAM",
  "CROSS_PROJECT",
  "ORG_WIDE",
];
const VALID_OUTCOMES: ReadonlyArray<OrgCollaborationOutcome> = [
  "ALLOW",
  "NEEDS_APPROVAL",
  "BLOCK",
  "DRAFT_ONLY",
  "DUAL_CONTROL_REQUIRED",
];
const VALID_REQUEST_TYPES: ReadonlyArray<TwinCollaborationRequestType> = [
  "STATUS_REQUEST",
  "REVIEW_REQUEST",
  "BLOCKER_RESOLUTION",
  "FOLLOW_UP",
  "HANDOFF",
  "CONTEXT_REQUEST",
  "APPROVAL_REQUEST",
  "PROJECT_COORDINATION",
  "CROSS_TEAM_COORDINATION",
  "WORKFLOW_COORDINATION",
];
const VALID_SENSITIVITY_CLASSES: ReadonlyArray<TwinAuthoritySensitivityClass> = [
  "LOW",
  "MODERATE",
  "HIGH",
  "REGULATED",
  "CUSTOMER_SENSITIVE",
  "FINANCIAL",
  "LEGAL",
  "SECURITY",
  "PERSONAL_MEMORY",
  "CONNECTOR_WRITE",
];

async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (
      message === "NOT_IN_ANY_ORG" ||
      message === "ORG_HIERARCHY_TOO_DEEP"
    ) {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

export async function registerOrgCollaborationPolicyRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // GET /api/v1/orgs/me/collaboration-policy — list
  app.get(
    "/api/v1/orgs/me/collaboration-policy",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const policies = await listOrgCollaborationPoliciesForOrg({
        orgEntityId,
      });
      return reply.code(200).send({ ok: true, policies });
    },
  );

  // POST /api/v1/orgs/me/collaboration-policy — upsert
  app.post<{
    Body: {
      collaboration_scope?: unknown;
      request_type?: unknown;
      sensitivity_class?: unknown;
      outcome?: unknown;
      requires_employee_authority?: unknown;
      requires_admin_approval?: unknown;
      requires_dual_control?: unknown;
      connector_write_allowed?: unknown;
    };
  }>(
    "/api/v1/orgs/me/collaboration-policy",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      if (
        typeof body.collaboration_scope !== "string" ||
        !(VALID_SCOPES as ReadonlyArray<string>).includes(
          body.collaboration_scope,
        )
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "collaboration_scope is required (closed vocab)",
        });
      }
      if (
        typeof body.outcome !== "string" ||
        !(VALID_OUTCOMES as ReadonlyArray<string>).includes(body.outcome)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "outcome is required (closed vocab)",
        });
      }
      if (
        body.request_type !== undefined &&
        body.request_type !== null &&
        (typeof body.request_type !== "string" ||
          !(VALID_REQUEST_TYPES as ReadonlyArray<string>).includes(
            body.request_type,
          ))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "request_type must be a closed-vocab value when provided",
        });
      }
      if (
        body.sensitivity_class !== undefined &&
        body.sensitivity_class !== null &&
        (typeof body.sensitivity_class !== "string" ||
          !(VALID_SENSITIVITY_CLASSES as ReadonlyArray<string>).includes(
            body.sensitivity_class,
          ))
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message:
            "sensitivity_class must be a closed-vocab value when provided",
        });
      }
      const view = await upsertOrgCollaborationPolicyForCaller({
        callerEntityId: callerId,
        orgEntityId,
        scope: body.collaboration_scope as OrgCollaborationScope,
        requestType:
          typeof body.request_type === "string"
            ? (body.request_type as TwinCollaborationRequestType)
            : null,
        sensitivityClass:
          typeof body.sensitivity_class === "string"
            ? (body.sensitivity_class as TwinAuthoritySensitivityClass)
            : null,
        outcome: body.outcome as OrgCollaborationOutcome,
        requiresEmployeeAuthority:
          typeof body.requires_employee_authority === "boolean"
            ? body.requires_employee_authority
            : undefined,
        requiresAdminApproval:
          typeof body.requires_admin_approval === "boolean"
            ? body.requires_admin_approval
            : undefined,
        requiresDualControl:
          typeof body.requires_dual_control === "boolean"
            ? body.requires_dual_control
            : undefined,
        connectorWriteAllowed:
          typeof body.connector_write_allowed === "boolean"
            ? body.connector_write_allowed
            : undefined,
      });
      return reply.code(200).send({ ok: true, policy: view });
    },
  );
}
