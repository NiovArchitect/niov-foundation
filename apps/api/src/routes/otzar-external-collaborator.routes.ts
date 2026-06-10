// FILE: otzar-external-collaborator.routes.ts
// PURPOSE: Phase 1221 ADDENDUM — HTTP surface for the
//          ExternalCollaborator / ExternalCommitment substrate.
//
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators
//          - GET   /api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators
//          - PUT   /api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/context
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/invite
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/revoke
//          - GET   /api/v1/otzar/collaboration/workspaces/:workspace_id/external-commitments
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/external-commitments/:external_commitment_id/create-follow-up

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  createInternalFollowupForExternalCommitmentForCaller,
  inviteExternalCollaboratorForCaller,
  listExternalCommitmentsForCaller,
  listWorkspaceExternalCollaboratorsForCaller,
  revokeExternalCollaboratorForCaller,
  trackExternalCollaboratorForCaller,
  updateExternalCollaboratorContextForCaller,
} from "../services/otzar/external-collaborator.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface TrackBody {
  display_name?: unknown;
  email?: unknown;
  company_name?: unknown;
  relationship_type?: unknown;
  internal_owner_entity_id?: unknown;
  purpose_summary?: unknown;
  goals_summary?: unknown;
  needs_from_us?: unknown;
  we_need_from_them?: unknown;
  risk_level?: unknown;
  access_level?: unknown;
  project_role?: unknown;
}

interface ContextBody {
  purpose_summary?: unknown;
  goals_summary?: unknown;
  needs_from_us?: unknown;
  we_need_from_them?: unknown;
  internal_owner_entity_id?: unknown;
  risk_level?: unknown;
  project_role?: unknown;
  allowed_context_policy?: unknown;
}

interface InviteBody {
  access_level?: unknown;
}

interface FollowupBody {
  internal_owner_entity_id?: unknown;
  draft_text?: unknown;
}

const RELATIONSHIP_TYPES = [
  "CLIENT",
  "VENDOR",
  "CONTRACTOR",
  "PARTNER",
  "INVESTOR",
  "ADVISOR",
  "AGENCY",
  "REGULATOR",
  "PROSPECT",
  "CANDIDATE",
  "OTHER",
] as const;

const ACCESS_LEVELS = [
  "NONE",
  "VIEW_SHARED",
  "COMMENT_SHARED",
  "CONTRIBUTE_SHARED",
  "APPROVE_SHARED",
] as const;

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

function asRelationship(
  v: unknown,
): (typeof RELATIONSHIP_TYPES)[number] | undefined {
  return RELATIONSHIP_TYPES.find((x) => x === v);
}
function asAccessLevel(v: unknown): (typeof ACCESS_LEVELS)[number] | undefined {
  return ACCESS_LEVELS.find((x) => x === v);
}
function asRiskLevel(v: unknown): (typeof RISK_LEVELS)[number] | undefined {
  return RISK_LEVELS.find((x) => x === v);
}

export async function registerOtzarExternalCollaboratorRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST track external collaborator
  app.post<{
    Params: { workspace_id: string };
    Body: TrackBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.display_name) || body.display_name.trim().length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "display_name is required",
        });
      }
      const result = await trackExternalCollaboratorForCaller({
        workspaceId: request.params.workspace_id,
        callerEntityId: session.entity_id,
        displayName: body.display_name,
        ...(isStr(body.email) ? { email: body.email } : {}),
        ...(isStr(body.company_name) ? { companyName: body.company_name } : {}),
        ...(asRelationship(body.relationship_type) === undefined
          ? {}
          : { relationshipType: asRelationship(body.relationship_type)! }),
        ...(isStr(body.internal_owner_entity_id)
          ? { internalOwnerEntityId: body.internal_owner_entity_id }
          : {}),
        ...(isStr(body.purpose_summary)
          ? { purposeSummary: body.purpose_summary }
          : {}),
        ...(isStr(body.goals_summary)
          ? { goalsSummary: body.goals_summary }
          : {}),
        ...(isStr(body.needs_from_us)
          ? { needsFromUs: body.needs_from_us }
          : {}),
        ...(isStr(body.we_need_from_them)
          ? { weNeedFromThem: body.we_need_from_them }
          : {}),
        ...(asRiskLevel(body.risk_level) === undefined
          ? {}
          : { riskLevel: asRiskLevel(body.risk_level)! }),
        ...(asAccessLevel(body.access_level) === undefined
          ? {}
          : { accessLevel: asAccessLevel(body.access_level)! }),
        ...(isStr(body.project_role) ? { projectRole: body.project_role } : {}),
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(result.httpStatus).send({
        ok: true,
        external_collaborator: result.external_collaborator,
        workspace_membership: result.workspace_membership,
      });
    },
  );

  // GET list externals on workspace
  app.get<{ Params: { workspace_id: string } }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await listWorkspaceExternalCollaboratorsForCaller(
        request.params.workspace_id,
        session.entity_id,
      );
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        workspace_memberships: result.workspace_memberships,
      });
    },
  );

  // PUT context update
  app.put<{
    Params: { workspace_id: string; external_id: string };
    Body: ContextBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/context",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await updateExternalCollaboratorContextForCaller({
        workspaceId: request.params.workspace_id,
        externalCollaboratorId: request.params.external_id,
        callerEntityId: session.entity_id,
        ...(isStr(body.purpose_summary)
          ? { purposeSummary: body.purpose_summary }
          : {}),
        ...(isStr(body.goals_summary)
          ? { goalsSummary: body.goals_summary }
          : {}),
        ...(isStr(body.needs_from_us)
          ? { needsFromUs: body.needs_from_us }
          : {}),
        ...(isStr(body.we_need_from_them)
          ? { weNeedFromThem: body.we_need_from_them }
          : {}),
        ...(isStr(body.internal_owner_entity_id)
          ? { internalOwnerEntityId: body.internal_owner_entity_id }
          : {}),
        ...(asRiskLevel(body.risk_level) === undefined
          ? {}
          : { riskLevel: asRiskLevel(body.risk_level)! }),
        ...(isStr(body.project_role) ? { projectRole: body.project_role } : {}),
        ...(isStr(body.allowed_context_policy)
          ? { allowedContextPolicy: body.allowed_context_policy }
          : {}),
      });
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply
        .code(200)
        .send({ ok: true, external_collaborator: result.external_collaborator });
    },
  );

  // POST invite
  app.post<{
    Params: { workspace_id: string; external_id: string };
    Body: InviteBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/invite",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await inviteExternalCollaboratorForCaller({
        workspaceId: request.params.workspace_id,
        externalCollaboratorId: request.params.external_id,
        callerEntityId: session.entity_id,
        ...(asAccessLevel(body.access_level) === undefined
          ? {}
          : { accessLevel: asAccessLevel(body.access_level)! }),
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply
        .code(200)
        .send({ ok: true, workspace_membership: result.workspace_membership });
    },
  );

  // POST revoke
  app.post<{
    Params: { workspace_id: string; external_id: string };
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-collaborators/:external_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await revokeExternalCollaboratorForCaller({
        workspaceId: request.params.workspace_id,
        externalCollaboratorId: request.params.external_id,
        callerEntityId: session.entity_id,
      });
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true });
    },
  );

  // GET external commitments
  app.get<{ Params: { workspace_id: string } }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-commitments",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await listExternalCommitmentsForCaller(
        request.params.workspace_id,
        session.entity_id,
      );
      if (result.ok === false)
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      return reply
        .code(200)
        .send({ ok: true, external_commitments: result.external_commitments });
    },
  );

  // POST create internal follow-up
  app.post<{
    Params: { workspace_id: string; external_commitment_id: string };
    Body: FollowupBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/external-commitments/:external_commitment_id/create-follow-up",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result =
        await createInternalFollowupForExternalCommitmentForCaller({
          workspaceId: request.params.workspace_id,
          externalCommitmentId: request.params.external_commitment_id,
          callerEntityId: session.entity_id,
          ...(isStr(body.internal_owner_entity_id)
            ? { internalOwnerEntityId: body.internal_owner_entity_id }
            : {}),
          ...(isStr(body.draft_text) ? { draftText: body.draft_text } : {}),
        });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(200).send({
        ok: true,
        action: result.action,
        external_commitment: result.external_commitment,
      });
    },
  );
}
