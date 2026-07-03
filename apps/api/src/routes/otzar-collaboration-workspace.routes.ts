// FILE: otzar-collaboration-workspace.routes.ts
// PURPOSE: Phase 1221 — HTTP surface for the CollaborationWorkspace
//          substrate (additive, distinct from
//          otzar-collaboration.routes.ts which serves
//          TwinCollaborationRequest).
//
//          - POST  /api/v1/otzar/collaboration/workspaces
//          - GET   /api/v1/otzar/collaboration/workspaces
//          - GET   /api/v1/otzar/collaboration/workspaces/:workspace_id
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/members
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/import-comms-output
//          - POST  /api/v1/otzar/collaboration/workspaces/:workspace_id/commitments/:commitment_id/confirm
//          - GET   /api/v1/otzar/collaboration/workspaces/:workspace_id/actions
//
// PRIVACY INVARIANT:
//   - Bearer + capability check on every route.
//   - Service-tier `*ForCaller` gate enforces same-org + membership.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/collaboration-workspace.service.ts
//   - apps/api/src/services/auth.service.ts

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  addCollaborationMemberForCaller,
  archiveCollaborationWorkspaceForCaller,
  confirmCommitmentForCaller,
  createCollaborationWorkspaceForCaller,
  getCollaborationWorkspaceDetailForCaller,
  importCommsOutputForWorkspaceForCaller,
  listCollaborationWorkspaceActionsForCaller,
  listCollaborationWorkspacesForCaller,
} from "../services/otzar/collaboration-workspace.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

interface CreateBody {
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  source_type?: unknown;
  source_conversation_id?: unknown;
  member_entity_ids?: unknown;
  initial_members?: unknown;
}

interface AddMemberBody {
  member_entity_id?: unknown;
  role_label?: unknown;
  responsibility_summary?: unknown;
  member_type?: unknown;
  access_level?: unknown;
}

interface ImportCommsBody {
  summary?: unknown;
  decisions?: unknown;
  commitments?: unknown;
  source_conversation_id?: unknown;
}

interface ConfirmCommitmentBody {
  draft_text?: unknown;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isStrOrUndef(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

export async function registerOtzarCollaborationWorkspaceRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST create workspace
  app.post<{ Body: CreateBody }>(
    "/api/v1/otzar/collaboration/workspaces",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply
          .code(401)
          .send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const body = request.body ?? {};
      if (!isStr(body.title) || body.title.trim().length === 0) {
        return reply
          .code(422)
          .send({ ok: false, code: "INVALID_REQUEST", message: "title is required" });
      }
      const visibility =
        body.visibility === "EXTERNAL_ALLOWED" ? "EXTERNAL_ALLOWED" : "INTERNAL_ONLY";
      const sourceType =
        body.source_type === "COMMS_CAPTURE"
          ? "COMMS_CAPTURE"
          : body.source_type === "PROJECT"
            ? "PROJECT"
            : body.source_type === "IMPORTED"
              ? "IMPORTED"
              : "MANUAL";
      const sourceConversationId = isStr(body.source_conversation_id)
        ? body.source_conversation_id
        : undefined;
      // Two member-input shapes accepted: bare entity_ids array OR
      // structured `initial_members`. Structured is preferred (lets
      // caller pass role_label + responsibility_summary at create).
      const initialMembers: Array<{
        member_entity_id: string;
        role_label: string;
        responsibility_summary?: string;
        member_type?: "INTERNAL" | "EXTERNAL";
        access_level?: "VIEW" | "COMMENT" | "CONTRIBUTE" | "APPROVE";
      }> = [];
      if (Array.isArray(body.initial_members)) {
        for (const m of body.initial_members) {
          if (typeof m !== "object" || m === null) continue;
          const member_entity_id = (m as Record<string, unknown>).member_entity_id;
          const role_label = (m as Record<string, unknown>).role_label;
          if (!isStr(member_entity_id) || !isStr(role_label)) continue;
          const responsibility_summary = (m as Record<string, unknown>).responsibility_summary;
          const member_type = (m as Record<string, unknown>).member_type;
          const access_level = (m as Record<string, unknown>).access_level;
          const entry: {
            member_entity_id: string;
            role_label: string;
            responsibility_summary?: string;
            member_type?: "INTERNAL" | "EXTERNAL";
            access_level?: "VIEW" | "COMMENT" | "CONTRIBUTE" | "APPROVE";
          } = { member_entity_id, role_label };
          if (isStr(responsibility_summary)) entry.responsibility_summary = responsibility_summary;
          if (member_type === "INTERNAL" || member_type === "EXTERNAL")
            entry.member_type = member_type;
          if (
            access_level === "VIEW" ||
            access_level === "COMMENT" ||
            access_level === "CONTRIBUTE" ||
            access_level === "APPROVE"
          )
            entry.access_level = access_level;
          initialMembers.push(entry);
        }
      } else if (Array.isArray(body.member_entity_ids)) {
        for (const eid of body.member_entity_ids) {
          if (isStr(eid)) {
            initialMembers.push({
              member_entity_id: eid,
              role_label: "Member",
            });
          }
        }
      }
      const result = await createCollaborationWorkspaceForCaller({
        callerEntityId: session.entity_id,
        title: body.title,
        ...(isStr(body.description) ? { description: body.description } : {}),
        visibility,
        sourceType,
        ...(sourceConversationId !== undefined
          ? { sourceConversationId }
          : {}),
        initialMembers,
      });
      if (result.ok === false) {
        return reply
          .code(result.httpStatus)
          .send({
            ok: false,
            code: result.code,
            ...(result.message === undefined ? {} : { message: result.message }),
          });
      }
      return reply
        .code(result.httpStatus)
        .send({ ok: true, workspace: result.workspace, members: result.members });
    },
  );

  // GET list
  app.get(
    "/api/v1/otzar/collaboration/workspaces",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const items = await listCollaborationWorkspacesForCaller(session.entity_id);
      return reply.code(200).send({ ok: true, workspaces: items });
    },
  );

  // GET detail
  app.get<{ Params: { workspace_id: string } }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const result = await getCollaborationWorkspaceDetailForCaller(
        request.params.workspace_id,
        session.entity_id,
      );
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, ...result.detail });
    },
  );

  // POST add member
  app.post<{
    Params: { workspace_id: string };
    Body: AddMemberBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/members",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const body = request.body ?? {};
      if (!isStr(body.member_entity_id) || !isStr(body.role_label)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "member_entity_id and role_label are required",
        });
      }
      const memberType =
        body.member_type === "EXTERNAL"
          ? "EXTERNAL"
          : body.member_type === "INTERNAL"
            ? "INTERNAL"
            : undefined;
      const accessLevel =
        body.access_level === "VIEW" ||
        body.access_level === "COMMENT" ||
        body.access_level === "CONTRIBUTE" ||
        body.access_level === "APPROVE"
          ? body.access_level
          : undefined;
      const result = await addCollaborationMemberForCaller({
        workspaceId: request.params.workspace_id,
        callerEntityId: session.entity_id,
        memberEntityId: body.member_entity_id,
        roleLabel: body.role_label,
        ...(isStrOrUndef(body.responsibility_summary) && isStr(body.responsibility_summary)
          ? { responsibilitySummary: body.responsibility_summary }
          : {}),
        ...(memberType !== undefined ? { memberType } : {}),
        ...(accessLevel !== undefined ? { accessLevel } : {}),
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({ ok: true, membership: result.membership });
    },
  );

  // POST archive — [GAP-C] the reversibility rail. APPROVE-gated in-service,
  // idempotent ALREADY_ARCHIVED, audited. Mirrors the project archive route.
  app.post<{ Params: { workspace_id: string } }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/archive",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const result = await archiveCollaborationWorkspaceForCaller({
        workspaceId: request.params.workspace_id,
        callerEntityId: session.entity_id,
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
        workspace: result.workspace,
        audit_event_id: result.audit_event_id,
      });
    },
  );

  // POST import comms output
  app.post<{
    Params: { workspace_id: string };
    Body: ImportCommsBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/import-comms-output",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const body = request.body ?? {};
      const decisions = Array.isArray(body.decisions)
        ? body.decisions.filter(isStr)
        : [];
      const commitmentsRaw = Array.isArray(body.commitments) ? body.commitments : [];
      const commitments: Array<{ text: string; source_excerpt: string }> = [];
      for (const c of commitmentsRaw) {
        if (typeof c !== "object" || c === null) continue;
        const text = (c as Record<string, unknown>).text;
        const source_excerpt = (c as Record<string, unknown>).source_excerpt;
        if (isStr(text) && isStr(source_excerpt)) {
          commitments.push({ text, source_excerpt });
        }
      }
      const result = await importCommsOutputForWorkspaceForCaller({
        workspaceId: request.params.workspace_id,
        callerEntityId: session.entity_id,
        ...(isStr(body.summary) ? { summary: body.summary } : {}),
        decisions,
        commitments,
        ...(isStr(body.source_conversation_id)
          ? { sourceConversationId: body.source_conversation_id }
          : {}),
      });
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({
        ok: true,
        decisions: result.decisions,
        commitments: result.commitments,
        shared_context: result.shared_context,
      });
    },
  );

  // POST confirm commitment → governed action
  app.post<{
    Params: { workspace_id: string; commitment_id: string };
    Body: ConfirmCommitmentBody;
  }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/commitments/:commitment_id/confirm",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "write");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const body = request.body ?? {};
      const result = await confirmCommitmentForCaller({
        workspaceId: request.params.workspace_id,
        commitmentId: request.params.commitment_id,
        callerEntityId: session.entity_id,
        ...(isStr(body.draft_text) ? { draftText: body.draft_text } : {}),
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
        .send({ ok: true, commitment: result.commitment, action: result.action });
    },
  );

  // GET workspace actions
  app.get<{ Params: { workspace_id: string } }>(
    "/api/v1/otzar/collaboration/workspaces/:workspace_id/actions",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply.code(401).send({ ok: false, code: session.code });
      }
      const result = await listCollaborationWorkspaceActionsForCaller(
        request.params.workspace_id,
        session.entity_id,
      );
      if (result.ok === false) {
        return reply.code(result.httpStatus).send({ ok: false, code: result.code });
      }
      return reply.code(200).send({ ok: true, actions: result.actions });
    },
  );
}
