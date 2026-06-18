// FILE: foundation.routes.ts
// PURPOSE: Phase 1288-B — HTTP surface for the Foundation-layer generalized
//          Entity & Authority Envelope.
//
//            - GET /api/v1/foundation/authority/me
//                the authenticated caller's own authority envelope.
//            - GET /api/v1/foundation/entities/:entity_id/authority
//                a same-org target's envelope (org-admin only; cross-tenant
//                fail-closed).
//            - GET /api/v1/foundation/capsules/:capsule_id/access-proof
//                (1289-A.1) the caller's own Memory Capsule proof-of-access
//                (permission state + tamper-evident audit evidence;
//                enumeration-safe CAPSULE_NOT_FOUND when no basis).
//
//          The `foundation` namespace is deliberately NOT Otzar-specific:
//          this is platform substrate that future apps/worlds/devices/agents
//          consume. Authority is computed by Foundation from persisted
//          Entity/TAR/Wallet — never from the request body, never by an LLM/
//          Python/BEAM/device/app.
// CONNECTS TO: apps/api/src/services/foundation/authority.service.ts,
//          apps/api/src/services/auth.service.ts (validateSession),
//          apps/api/src/server.ts (registerFoundationRoutes).

import type { FastifyInstance } from "fastify";
import type { FoundationAuthorityService } from "../services/foundation/authority.service.js";
import type { FoundationProofService } from "../services/foundation/proof-of-access.service.js";

// WHAT: Extract a Bearer token from the Authorization header.
// INPUT: the raw header value.
// OUTPUT: the token, or null when absent/malformed.
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service failure code to an HTTP status.
// WHY: Session failures → 401; authorization/tenant refusals → 403; unknown
//      subject → 404. Default to 403 (least-revealing for refusals).
const FAILURE_STATUS: Record<string, number> = {
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  SESSION_INVALIDATED: 401,
  OPERATION_NOT_PERMITTED: 403,
  NOT_AUTHORIZED: 403,
  CROSS_TENANT_FORBIDDEN: 403,
  NO_ORG_FOR_CALLER: 404,
  ENTITY_NOT_FOUND: 404,
  TARGET_NOT_FOUND: 404,
  CAPSULE_NOT_FOUND: 404,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

export async function registerFoundationRoutes(
  app: FastifyInstance,
  authorityService: FoundationAuthorityService,
  proofService: FoundationProofService,
): Promise<void> {
  // The caller's own authority envelope.
  app.get("/api/v1/foundation/authority/me", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const result = await authorityService.getMyAuthorityForCaller(token);
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, authority: result.authority });
  });

  // A same-org target's authority envelope (org-admin only; self always ok).
  app.get<{ Params: { entity_id: string } }>(
    "/api/v1/foundation/entities/:entity_id/authority",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const targetEntityId = request.params.entity_id;
      const result = await authorityService.evaluateAuthorityForCaller(
        token,
        targetEntityId,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, authority: result.authority });
    },
  );

  // The caller's own Memory Capsule proof-of-access (1289-A.1).
  app.get<{ Params: { capsule_id: string } }>(
    "/api/v1/foundation/capsules/:capsule_id/access-proof",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await proofService.getCapsuleAccessProofForCaller(
        token,
        request.params.capsule_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, proof: result.proof });
    },
  );
}
