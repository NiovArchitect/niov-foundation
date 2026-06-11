// FILE: compliance-sharing.routes.ts
// PURPOSE: Phase 1233 — HTTP surface for company-controlled
//          compliance sharing. Existing /api/v1/compliance/* routes
//          (frameworks / profiles) remain UNCHANGED per RULE 1;
//          these are additive.
//
//          Company side (org admin):
//          - POST  /api/v1/compliance/share-packages
//          - GET   /api/v1/compliance/share-packages
//          - POST  /api/v1/compliance/share-packages/:package_id/revoke
//
//          Regulator side (package addressee only):
//          - GET   /api/v1/compliance/share-packages/:package_id/evidence

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  createSharePackageForCaller,
  getEvidenceForRegulator,
  listSharePackagesForCaller,
  revokeSharePackageForCaller,
} from "../services/compliance/compliance-sharing.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface CreateBody {
  regulator_entity_id?: unknown;
  purpose?: unknown;
  scopes?: unknown;
  valid_until?: unknown;
  redaction_profile?: unknown;
  lawful_basis_id?: unknown;
}

interface RevokeBody {
  reason?: unknown;
}

const FAILURE_STATUS: Record<string, number> = {
  NO_ORG_FOR_CALLER: 404,
  ADMIN_REQUIRED: 403,
  PURPOSE_REQUIRED: 422,
  INVALID_SCOPES: 422,
  INVALID_VALID_UNTIL: 422,
  REGULATOR_REQUIRED: 422,
  REGULATOR_NOT_ACTIVE: 422,
  LAWFUL_BASIS_NOT_FOUND: 422,
  PACKAGE_NOT_FOUND: 404,
  ALREADY_REVOKED: 409,
  PACKAGE_REVOKED: 403,
  PACKAGE_EXPIRED: 403,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

export async function registerComplianceSharingRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: CreateBody }>(
    "/api/v1/compliance/share-packages",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      if (!isStr(body.regulator_entity_id) || !isStr(body.purpose)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "regulator_entity_id and purpose are required",
        });
      }
      const result = await createSharePackageForCaller({
        callerEntityId: session.entity_id,
        regulatorEntityId: body.regulator_entity_id,
        purpose: body.purpose,
        scopes: body.scopes,
        validUntil: body.valid_until,
        redactionProfile: body.redaction_profile,
        ...(isStr(body.lawful_basis_id)
          ? { lawfulBasisId: body.lawful_basis_id }
          : {}),
      });
      if (result.ok === false) {
        return reply.code(failureStatus(result.code)).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({ ok: true, package: result.package });
    },
  );

  app.get("/api/v1/compliance/share-packages", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await listSharePackagesForCaller(session.entity_id);
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, packages: result.packages });
  });

  app.post<{ Params: { package_id: string }; Body: RevokeBody }>(
    "/api/v1/compliance/share-packages/:package_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await revokeSharePackageForCaller({
        callerEntityId: session.entity_id,
        packageId: request.params.package_id,
        ...(isStr(body.reason) ? { reason: body.reason } : {}),
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        package_id: result.package_id,
        revoked_at: result.revoked_at,
      });
    },
  );

  app.get<{ Params: { package_id: string } }>(
    "/api/v1/compliance/share-packages/:package_id/evidence",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const result = await getEvidenceForRegulator({
        callerEntityId: session.entity_id,
        packageId: request.params.package_id,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, evidence: result.evidence });
    },
  );
}
