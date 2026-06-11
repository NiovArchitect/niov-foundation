// FILE: cosmp-capsule-management.routes.ts
// PURPOSE: Phase 1229 — HTTP additions for the COSMP Capsule
//          Management surface. Existing /api/v1/cosmp/* routes
//          (negotiate / capsule create / share / read /
//          similarity) remain UNCHANGED per RULE 1; these are
//          additive.
//
//          - GET   /api/v1/cosmp/capsules                (list)
//          - POST  /api/v1/cosmp/capsules/:id/revoke     (soft-delete)
//          - GET   /api/v1/cosmp/audit                   (wallet-scoped audit summary)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  getCOSMPAuditForCaller,
  listCapsulesForCaller,
  revokeCapsuleForCaller,
} from "../services/cosmp/capsule-management.service.js";
import type { CapsuleType } from "@prisma/client";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface RevokeBody {
  reason?: unknown;
}

const KNOWN_CAPSULE_TYPES: ReadonlyArray<CapsuleType> = [
  "FOUNDATIONAL",
  "PREFERENCE",
  "DEVICE_DATA",
  "SESSION_LEARNING",
  "BEHAVIORAL_PATTERN",
  "IDENTITY",
  "DOMAIN_KNOWLEDGE",
  "CORRECTION",
  "CONVERSATION_LEARNING",
  "DECISION",
  "COMMITMENT",
  "TASK_LEARNING",
] as unknown as ReadonlyArray<CapsuleType>;

export async function registerCOSMPCapsuleManagementRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get<{
    Querystring: {
      capsule_type?: string;
      include_revoked?: string;
      take?: string;
      skip?: string;
    };
  }>("/api/v1/cosmp/capsules", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const q = request.query ?? {};
    const capsuleType = KNOWN_CAPSULE_TYPES.find(
      (t) => (t as string) === q.capsule_type,
    );
    const result = await listCapsulesForCaller({
      callerEntityId: session.entity_id,
      ...(capsuleType !== undefined ? { capsuleType } : {}),
      includeRevoked: q.include_revoked === "true",
      ...(isStr(q.take) ? { take: Number(q.take) } : {}),
      ...(isStr(q.skip) ? { skip: Number(q.skip) } : {}),
    });
    if (result.ok === false)
      return reply.code(403).send({ ok: false, code: result.code });
    return reply
      .code(200)
      .send({ ok: true, capsules: result.capsules, total: result.total });
  });

  app.post<{
    Params: { capsule_id: string };
    Body: RevokeBody;
  }>(
    "/api/v1/cosmp/capsules/:capsule_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await revokeCapsuleForCaller({
        callerEntityId: session.entity_id,
        capsuleId: request.params.capsule_id,
        ...(isStr(body.reason) ? { reason: body.reason } : {}),
      });
      if (result.ok === false) {
        const status =
          result.code === "CAPSULE_NOT_FOUND"
            ? 404
            : result.code === "NOT_OWNER"
              ? 403
              : result.code === "ALREADY_REVOKED"
                ? 409
                : 403;
        return reply.code(status).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(200).send({
        ok: true,
        capsule_id: result.capsule_id,
        revoked_at: result.revoked_at,
      });
    },
  );

  app.get<{ Querystring: { take?: string } }>(
    "/api/v1/cosmp/audit",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const take = isStr(request.query?.take)
        ? Number(request.query.take)
        : undefined;
      const result = await getCOSMPAuditForCaller({
        callerEntityId: session.entity_id,
        ...(take !== undefined ? { take } : {}),
      });
      if (result.ok === false)
        return reply.code(403).send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, summary: result.summary });
    },
  );
}
