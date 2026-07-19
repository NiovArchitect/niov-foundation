// FILE: otzar-work-style-learning.routes.ts
// PURPOSE: HTTP surface for work-style learning lifecycle.
// CONNECTS TO: work-style-learning.service, AuthService, getOrgEntityId.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  approveWorkStyleCandidate,
  getWorkStyleStatus,
  listApprovedWorkStylePreferences,
  listWorkStyleCandidates,
  recordWorkStyleSignal,
  rejectWorkStyleCandidate,
  setOrgWorkStylePolicy,
  startWorkStyleSession,
  stopWorkStyleSession,
} from "../services/otzar/work-style-learning.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

export async function registerOtzarWorkStyleLearningRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // GET status — policy, session, counts
  app.get("/api/v1/otzar/work-style/status", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    let org: string;
    try {
      org = await getOrgEntityId(session.entity_id);
    } catch {
      return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
    }
    const status = await getWorkStyleStatus({
      orgEntityId: org,
      callerEntityId: session.entity_id,
    });
    return reply.code(200).send({ ok: true, ...status });
  });

  // POST policy (admin)
  app.post<{ Body: { enabled?: unknown } }>(
    "/api/v1/otzar/work-style/policy",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const entityId = request.auth?.entity_id;
      if (!entityId)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      let org: string;
      try {
        org = await getOrgEntityId(entityId);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const enabled = request.body?.enabled === true;
      const r = await setOrgWorkStylePolicy({
        orgEntityId: org,
        adminEntityId: entityId,
        enabled,
      });
      return reply.code(200).send({ ok: true, enabled: r.enabled });
    },
  );

  // POST start session
  app.post<{
    Body: {
      consent?: unknown;
      task_label?: unknown;
      app_context?: unknown;
    };
  }>("/api/v1/otzar/work-style/sessions/start", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "write");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    let org: string;
    try {
      org = await getOrgEntityId(session.entity_id);
    } catch {
      return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
    }
    const body = request.body ?? {};
    const r = await startWorkStyleSession({
      orgEntityId: org,
      callerEntityId: session.entity_id,
      consent: body.consent === true,
      taskLabel:
        typeof body.task_label === "string" ? body.task_label : "Work task",
      appContext:
        typeof body.app_context === "string" ? body.app_context : "Otzar",
    });
    if (!r.ok) {
      const code =
        r.code === "ORG_POLICY_DISABLED"
          ? 403
          : r.code === "CONSENT_REQUIRED"
            ? 422
            : 409;
      return reply.code(code).send({ ok: false, code: r.code });
    }
    return reply.code(200).send({ ok: true, session_id: r.session_id });
  });

  // POST signal
  app.post<{
    Params: { session_id: string };
    Body: { signal_type?: unknown; safe_label?: unknown };
  }>(
    "/api/v1/otzar/work-style/sessions/:session_id/signal",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      let org: string;
      try {
        org = await getOrgEntityId(session.entity_id);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const body = request.body ?? {};
      const r = await recordWorkStyleSignal({
        orgEntityId: org,
        callerEntityId: session.entity_id,
        sessionId: request.params.session_id,
        signalType:
          typeof body.signal_type === "string" ? body.signal_type : "step",
        safeLabel:
          typeof body.safe_label === "string" ? body.safe_label : "",
      });
      if (!r.ok)
        return reply
          .code(r.code === "INVALID_SIGNAL" ? 422 : 409)
          .send({ ok: false, code: r.code });
      return reply.code(200).send({ ok: true });
    },
  );

  // POST stop → candidates
  app.post<{ Params: { session_id: string } }>(
    "/api/v1/otzar/work-style/sessions/:session_id/stop",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      let org: string;
      try {
        org = await getOrgEntityId(session.entity_id);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const r = await stopWorkStyleSession({
        orgEntityId: org,
        callerEntityId: session.entity_id,
        sessionId: request.params.session_id,
      });
      if (!r.ok)
        return reply.code(409).send({ ok: false, code: r.code });
      return reply.code(200).send({ ok: true, candidates: r.candidates });
    },
  );

  app.get("/api/v1/otzar/work-style/candidates", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    let org: string;
    try {
      org = await getOrgEntityId(session.entity_id);
    } catch {
      return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
    }
    const candidates = await listWorkStyleCandidates({
      callerEntityId: session.entity_id,
      orgEntityId: org,
    });
    return reply.code(200).send({ ok: true, candidates });
  });

  app.post<{
    Params: { candidate_id: string };
    Body: { edited_plain?: unknown };
  }>(
    "/api/v1/otzar/work-style/candidates/:candidate_id/approve",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      let org: string;
      try {
        org = await getOrgEntityId(session.entity_id);
      } catch {
        return reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      }
      const edited =
        typeof request.body?.edited_plain === "string"
          ? request.body.edited_plain
          : undefined;
      const r = await approveWorkStyleCandidate({
        callerEntityId: session.entity_id,
        orgEntityId: org,
        candidateId: request.params.candidate_id,
        ...(edited !== undefined ? { editedPlain: edited } : {}),
      });
      if (!r.ok)
        return reply
          .code(r.code === "NOT_FOUND" ? 404 : 409)
          .send({ ok: false, code: r.code });
      return reply.code(200).send({ ok: true, preference: r.preference });
    },
  );

  app.post<{ Params: { candidate_id: string } }>(
    "/api/v1/otzar/work-style/candidates/:candidate_id/reject",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const r = await rejectWorkStyleCandidate({
        callerEntityId: session.entity_id,
        candidateId: request.params.candidate_id,
      });
      if (!r.ok)
        return reply.code(409).send({ ok: false, code: r.code });
      return reply.code(200).send({ ok: true });
    },
  );

  app.get("/api/v1/otzar/work-style/preferences", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const preferences = await listApprovedWorkStylePreferences({
      callerEntityId: session.entity_id,
    });
    return reply.code(200).send({ ok: true, preferences });
  });
}
