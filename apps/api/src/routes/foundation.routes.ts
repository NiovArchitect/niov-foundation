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
import type { FoundationEconomicService } from "../services/foundation/economic-policy.service.js";
import type { FoundationAmbientDeviceService } from "../services/foundation/ambient-device.service.js";
import type { FoundationMarketplaceService } from "../services/foundation/marketplace.service.js";

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
  INVALID_PURPOSE: 422,
  INVALID_SETTLEMENT_MODE: 422,
  INVALID_LISTING_TYPE: 422,
  INVALID_ACCESS_MODE: 422,
  INVALID_USE_RIGHT: 422,
  LISTING_NOT_FOUND: 404,
  DATA_PACKAGE_NOT_FOUND: 404,
};

function failureStatus(code: string): number {
  return FAILURE_STATUS[code] ?? 403;
}

export async function registerFoundationRoutes(
  app: FastifyInstance,
  authorityService: FoundationAuthorityService,
  proofService: FoundationProofService,
  economicService: FoundationEconomicService,
  ambientDeviceService: FoundationAmbientDeviceService,
  marketplaceService: FoundationMarketplaceService,
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

  // Economic intent quote — HTTP 402-style payment-required handshake (1290-A).
  // Mock-only: 200 ALLOWED_MOCK / 402 PAYMENT_REQUIRED / 403 DENIED. No funds.
  app.post<{
    Body: {
      amount_usd?: unknown;
      purpose?: unknown;
      settlement_mode?: unknown;
      per_transaction_cap?: unknown;
      spend_limit?: unknown;
      spent_so_far?: unknown;
    };
  }>("/api/v1/foundation/economic/quote", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const body = request.body ?? {};
    if (typeof body.amount_usd !== "number" || typeof body.purpose !== "string")
      return reply
        .code(422)
        .send({ ok: false, code: "INVALID_REQUEST" });
    const result = await economicService.quoteEconomicIntentForCaller(token, {
      amount_usd: body.amount_usd,
      purpose: body.purpose,
      settlement_mode:
        typeof body.settlement_mode === "string"
          ? body.settlement_mode
          : undefined,
      per_transaction_cap:
        typeof body.per_transaction_cap === "number"
          ? body.per_transaction_cap
          : null,
      spend_limit:
        typeof body.spend_limit === "number" ? body.spend_limit : null,
      spent_so_far:
        typeof body.spent_so_far === "number" ? body.spent_so_far : null,
    });
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    // HTTP disposition mirrors the quote status: 402 when payment is required.
    const httpStatus =
      result.quote.status === "ALLOWED_MOCK"
        ? 200
        : result.quote.status === "PAYMENT_REQUIRED"
          ? 402
          : 403;
    return reply.code(httpStatus).send({ ok: true, quote: result.quote });
  });

  // Ambient device packet — governed disposition (1291-A). Text only; raw
  // frames/biometrics forbidden; device identity never trusted. Returns 200
  // with the governed decision (including BLOCKED) so the device gets the
  // honest disposition; 401 / 422 for auth / malformed.
  app.post<{
    Body: Record<string, unknown>;
  }>("/api/v1/foundation/devices/ambient-packets", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const body = request.body ?? {};
    if (
      typeof body.source_type !== "string" ||
      typeof body.mode !== "string" ||
      typeof body.text !== "string" ||
      typeof body.consent !== "object" ||
      body.consent === null
    )
      return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
    const result = await ambientDeviceService.evaluateAmbientPacketForCaller(
      token,
      body as never,
    );
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, packet: result.packet });
  });

  // ── Marketplace substrate (1292-A) ──────────────────────────────────────
  // Create a listing (provider = caller).
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/foundation/marketplace/listings",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.listing_type !== "string" || typeof b.title !== "string")
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await marketplaceService.createListingForCaller(
        token,
        b as never,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({ ok: true, listing: result.listing });
    },
  );

  // Discover listings (own + PUBLISHED in caller's org).
  app.get<{ Querystring: { listing_type?: string } }>(
    "/api/v1/foundation/marketplace/listings",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.listListingsForCaller(token, {
        listing_type: request.query.listing_type,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, listings: result.listings });
    },
  );

  // Read one listing.
  app.get<{ Params: { listing_id: string } }>(
    "/api/v1/foundation/marketplace/listings/:listing_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.getListingForCaller(
        token,
        request.params.listing_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, listing: result.listing });
    },
  );

  // Evaluate governed access to a listing (discover/use/request/pay/approval).
  app.post<{ Params: { listing_id: string } }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/access",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.evaluateListingAccessForCaller(
        token,
        request.params.listing_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, access: result.access });
    },
  );

  // ── Data marketplace (1292-A) ───────────────────────────────────────────
  // Create a DATA_PACKAGE listing (permissioned governed-access product).
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/foundation/marketplace/data-packages",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.title !== "string" || typeof b.description !== "string")
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await marketplaceService.createDataPackageForCaller(
        token,
        b as never,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({
        ok: true,
        listing: result.listing,
        data_package: result.data_package,
      });
    },
  );

  // Evaluate governed access to a DATA_PACKAGE for an intended use.
  app.post<{ Params: { listing_id: string }; Body: { intended_use?: unknown } }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/data-access",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const intendedUse =
        typeof request.body?.intended_use === "string"
          ? request.body.intended_use
          : "";
      if (intendedUse.length === 0)
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await marketplaceService.evaluateDataAccessForCaller(
        token,
        request.params.listing_id,
        intendedUse,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, access: result.access });
    },
  );
}
