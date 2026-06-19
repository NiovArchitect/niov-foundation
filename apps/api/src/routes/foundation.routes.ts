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
import type { FoundationObservabilityService } from "../services/foundation/observability.service.js";
import type { MarketplaceDataDeliveryService } from "../services/foundation/marketplace-data-delivery.service.js";
import type { FoundationHighSensitivityReviewService, ReviewListScope } from "../services/foundation/high-sensitivity-review.service.js";
import { REVIEW_LIST_SCOPES } from "../services/foundation/high-sensitivity-review.service.js";
import type { FoundationProofEventsService } from "../services/foundation/proof-events.service.js";
import type { PolicyLineageService } from "../services/foundation/policy-lineage.service.js";
import type { SettlementIntentService } from "../services/foundation/settlement-intent.service.js";
import type { CapabilityContractService } from "../services/foundation/capability-contract.service.js";
import type { EntityGraphService } from "../services/foundation/entity-graph.service.js";
import type { Avp2ResourceContractService } from "../services/foundation/avp2-resource-contract.service.js";

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
  // Phase 1301-A — cross-org discovery opt-in.
  INVALID_DISCOVERY_SCOPE: 422,
  LISTING_NOT_PUBLISHED: 409,
  DISCOVERY_BLOCKED_HIGH_SENSITIVITY: 403,
  INVALID_METER_ID: 422,
  INVALID_LIMIT: 422,
  INVALID_SENSITIVITY_CLASS: 422,
  CONSENT_REQUIRED: 409,
  OPT_IN_REQUIRED: 409,
  USE_NOT_PERMITTED: 403,
  PAYMENT_DENIED: 402,
  GRANT_NOT_FOUND: 404,
  GRANT_NOT_ACTIVE: 409,
  GRANT_EXPIRED: 409,
  CONSENT_NOT_ACTIVE: 409,
  READ_NOT_PERMITTED: 403,
  // Phase 1297-A — high-sensitivity review workflow.
  INVALID_REQUEST: 422,
  REVIEW_NOT_FOUND: 404,
  INVALID_SCOPE: 422,
  REVIEW_NOT_APPLICABLE: 409,
  REVIEW_NOT_REQUIRED: 409,
  REVIEW_NOT_PENDING: 409,
  REVIEW_NOT_APPROVED: 409,
  REVIEW_NOT_APPROVABLE: 409,
  REVIEW_REQUIRED: 409,
  NON_HUMAN_REVIEWER_FORBIDDEN: 403,
  NOT_AUTHORIZED_REVIEWER: 403,
  SELF_REVIEW_NOT_PERMITTED: 403,
  // Phase 1299-A — org-compliance reviewer-delegation refusals. All are
  // authorization refusals (403); cross-tenant stays invisible via the loader
  // (REVIEW_NOT_FOUND → 404). ENTITY_NOT_FOUND keeps its 404 mapping above.
  REVIEWER_IS_NON_HUMAN: 403,
  REVIEWER_IS_BUYER: 403,
  REVIEWER_NOT_PROVIDER_OWNER: 403,
  REVIEWER_CROSS_TENANT: 403,
  REVIEWER_MEMBERSHIP_INACTIVE: 403,
  REVIEWER_NOT_ORG_AUTHORIZED: 403,
  CHILDREN_DATA_REVIEW_NOT_SUPPORTED: 403,
  APPROVED_MODE_NOT_ALLOWED: 422,
  INVALID_APPROVED_MODES: 422,
  INVALID_EXPIRY: 422,
  // Phase 1298-A — retention-policy enforcement denials (bad retention config).
  RETENTION_POLICY_REQUIRED: 422,
  RETENTION_POLICY_UNKNOWN: 422,
  RETENTION_EXPIRES_AT_REQUIRED: 422,
  RETENTION_EXPIRES_AT_IN_PAST: 422,
  RETENTION_UNTIL_REVOKED_NOT_ALLOWED: 422,
  RETENTION_TOO_LONG_FOR_SENSITIVITY: 422,
  // F-1321 — scoped proof event feed.
  RESOURCE_ID_REQUIRED: 422,
  RESOURCE_NOT_FOUND: 404,
  NOT_IN_ANY_ORG: 404,
  INVALID_EVENT_TYPE: 422,
  INVALID_STATUS: 422,
  INVALID_FROM: 422,
  INVALID_TO: 422,
  INVALID_CURSOR: 422,
  // F-1324 — policy lineage graph.
  LINEAGE_NOT_FOUND: 404,
  // F-1327 — entity relationship graph.
  GRAPH_NOT_FOUND: 404,
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
  observabilityService: FoundationObservabilityService,
  dataDeliveryService: MarketplaceDataDeliveryService,
  reviewService: FoundationHighSensitivityReviewService,
  proofEventsService: FoundationProofEventsService,
  policyLineageService: PolicyLineageService,
  settlementIntentService: SettlementIntentService,
  capabilityContractService: CapabilityContractService,
  entityGraphService: EntityGraphService,
  avp2ResourceContractService: Avp2ResourceContractService,
): Promise<void> {
  // F-1321 — Scoped Proof Event Feed. A read-only governed PROJECTION over the
  // append-only audit ledger. Never a log dump: scope-filtered, authorization-
  // gated, field-allowlisted. Query: scope (default self) + optional resource_id,
  // event_type, status, from, to, limit, cursor.
  app.get<{
    Querystring: {
      scope?: string;
      resource_id?: string;
      event_type?: string;
      status?: string;
      from?: string;
      to?: string;
      limit?: string;
      cursor?: string;
    };
  }>("/api/v1/foundation/proof/events", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const q = request.query;
    const parsedLimit =
      q.limit !== undefined && q.limit.length > 0 ? Number(q.limit) : undefined;
    if (parsedLimit !== undefined && !Number.isFinite(parsedLimit))
      return reply.code(422).send({ ok: false, code: "INVALID_LIMIT" });
    const result = await proofEventsService.getProofEventsForCaller(token, {
      scope: q.scope,
      resource_id: q.resource_id,
      event_type: q.event_type,
      status: q.status,
      from: q.from,
      to: q.to,
      limit: parsedLimit,
      cursor: q.cursor,
    });
    if (result.ok === false)
      return reply
        .code(failureStatus(result.code))
        .send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, ...result.feed });
  });

  // F-1324 — Policy Lineage Graph. Resolve a proof_reference (an audit-chain
  // event_hash) into its causal policy decision lineage. Projection only;
  // role-scoped + enumeration-safe (LINEAGE_NOT_FOUND).
  app.get<{ Params: { proof_reference: string } }>(
    "/api/v1/foundation/policy/lineage/:proof_reference",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await policyLineageService.getPolicyLineageForCaller(
        token,
        request.params.proof_reference,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, ...result.lineage });
    },
  );

  // F-1325 — Settlement Intent Graph. The caller's economic obligation intents
  // (as payer and/or payee). Derived, mock-only, read-only. Optional filters:
  // status (PROJECTED|MATURED|VOIDED|REVOKED) + role (payer|payee).
  app.get<{ Querystring: { status?: string; role?: string } }>(
    "/api/v1/foundation/settlement/intents",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await settlementIntentService.getSettlementIntentsForCaller(token, {
        status: request.query.status,
        role: request.query.role,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, ...result.settlement });
    },
  );

  // F-1326 — Callable Capability Contracts. How a capability (listing) may be
  // invoked under governance. Contracts only — no live execution. Visible to
  // anyone who can see the capability (enumeration-safe LISTING_NOT_FOUND).
  app.get<{ Params: { listing_id: string } }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/contracts",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await capabilityContractService.getContractsForCaller(
        token,
        request.params.listing_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, ...result.contracts });
    },
  );

  // F-1327 — Entity Relationship Graph. A read-only projection of how an entity
  // relates to the ecosystem (ownership / provides / purchases / contributes /
  // uses). Scoped to self / own-org / org-member; enumeration-safe GRAPH_NOT_FOUND.
  app.get<{ Params: { entity_id: string } }>(
    "/api/v1/foundation/graph/:entity_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await entityGraphService.getGraphForCaller(
        token,
        request.params.entity_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, ...result.graph });
    },
  );

  // F-1329 — AVP² Resource Contract Projection. Object-level quotable resource
  // contracts derived from a listing. Projection only — no live access, no
  // delivery, no content. Enumeration-safe LISTING_NOT_FOUND.
  app.get<{ Params: { listing_id: string } }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/resource-contracts",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await avp2ResourceContractService.getResourceContractsForCaller(
        token,
        request.params.listing_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, ...result.contracts });
    },
  );

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

  // Phase 1301-A — cross-org discovery catalog (PUBLISHED + provider-opted-in to
  // CROSS_ORG, excluding the caller's own + same-org listings). Metadata-only —
  // never a grant, never raw content.
  app.get<{ Querystring: { listing_type?: string } }>(
    "/api/v1/foundation/marketplace/discover",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.discoverListingsForCaller(token, {
        listing_type: request.query.listing_type,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, listings: result.listings });
    },
  );

  // Phase 1301-A — set a listing's cross-org discovery reach (provider-opt-in
  // only). Body: { discovery_scope: "PRIVATE" | "CROSS_ORG" }.
  app.patch<{
    Params: { listing_id: string };
    Body: { discovery_scope?: unknown };
  }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/discovery",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const scope =
        typeof request.body?.discovery_scope === "string"
          ? request.body.discovery_scope
          : "";
      const result =
        await marketplaceService.setListingDiscoveryPolicyForCaller(
          token,
          request.params.listing_id,
          scope,
        );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, listing: result.listing });
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

  // ── Data marketplace grants / consent ledger (1294-A) ───────────────────
  // Create a durable governed data grant (+ consent) for a DATA_PACKAGE.
  app.post<{ Params: { listing_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/foundation/marketplace/listings/:listing_id/data-grants",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.intended_use !== "string" || b.intended_use.length === 0)
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await marketplaceService.createDataGrantForCaller(
        token,
        request.params.listing_id,
        {
          intended_use: b.intended_use,
          consent_confirmed: b.consent_confirmed === true,
          opt_in_confirmed: b.opt_in_confirmed === true,
          expires_at:
            typeof b.expires_at === "string" ? b.expires_at : undefined,
        },
      );
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send({
          ok: false,
          code: result.code,
          ...(result.denied_reasons
            ? { denied_reasons: result.denied_reasons }
            : {}),
        });
      return reply.code(201).send({ ok: true, grant: result.grant });
    },
  );

  // Revoke a data grant.
  app.post<{ Params: { grant_id: string }; Body: { reason?: unknown } }>(
    "/api/v1/foundation/marketplace/data-grants/:grant_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.revokeDataGrantForCaller(
        token,
        request.params.grant_id,
        typeof request.body?.reason === "string" ? request.body.reason : undefined,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, grant: result.grant });
    },
  );

  // List the caller's data grants (provider + buyer).
  app.get(
    "/api/v1/foundation/marketplace/data-grants",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.listDataGrantsForCaller(token);
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, grants: result.grants });
    },
  );

  // Phase 1311-B / 1312-A — list the caller's grants filtered to ONE role:
  // "buyer" (what I purchased / have access to) or "provider" (grants on my
  // data). Default buyer. The mixed-role /data-grants stays for back-compat.
  app.get<{ Querystring: { role?: string } }>(
    "/api/v1/foundation/marketplace/my-data-grants",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const role = request.query.role === "provider" ? "provider" : "buyer";
      const result = await marketplaceService.listDataGrantsByRoleForCaller(
        token,
        role,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, role, grants: result.grants });
    },
  );

  // Phase 1311-B — the Buyer Access Console summary for ONE of the caller's
  // grants (grant + resource label + access policy + audit-derived usage +
  // mock-only settlement intent). Buyer-scoped; enumeration-safe.
  app.get<{ Params: { grant_id: string } }>(
    "/api/v1/foundation/marketplace/data-grants/:grant_id/console",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.getBuyerGrantConsoleForCaller(
        token,
        request.params.grant_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, console: result.console });
    },
  );

  // Phase 1312-A — the Contributor Sovereignty view for ONE grant on the
  // caller's data (who has access + policy + usage + revocation status).
  // Provider-scoped; enumeration-safe. Revocation uses the existing
  // /data-grants/:grant_id/revoke route.
  app.get<{ Params: { grant_id: string } }>(
    "/api/v1/foundation/marketplace/data-grants/:grant_id/sovereignty",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.getProviderGrantSovereigntyForCaller(
        token,
        request.params.grant_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, sovereignty: result.sovereignty });
    },
  );

  // Read one data grant.
  app.get<{ Params: { grant_id: string } }>(
    "/api/v1/foundation/marketplace/data-grants/:grant_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await marketplaceService.getDataGrantForCaller(
        token,
        request.params.grant_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, grant: result.grant });
    },
  );

  // COSMP-governed safe data-read delivery for a grant (1295-A). Returns SAFE
  // projections only (never raw content); per-item grant proof at read time.
  app.post<{ Params: { grant_id: string }; Body: Record<string, unknown> }>(
    "/api/v1/foundation/marketplace/data-grants/:grant_id/read",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      const result = await dataDeliveryService.readDataGrantForCaller(
        token,
        request.params.grant_id,
        {
          access_mode:
            typeof b.access_mode === "string" ? b.access_mode : undefined,
          query: typeof b.query === "string" ? b.query : undefined,
          capsule_type_filter: Array.isArray(b.capsule_type_filter)
            ? (b.capsule_type_filter as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
          limit: typeof b.limit === "number" ? b.limit : undefined,
        },
      );
      if (result.ok === false)
        return reply.code(failureStatus(result.code)).send({
          ok: false,
          code: result.code,
          ...(result.denied_reasons
            ? { denied_reasons: result.denied_reasons }
            : {}),
        });
      return reply.code(200).send({ ok: true, read: result.read });
    },
  );

  // ── High-sensitivity human-review workflow (1297-A) ─────────────────────
  // Open (or fetch) a review for a REQUIRES_REVIEW high-sensitivity package.
  app.post<{ Body: { listing_id?: unknown; intended_use?: unknown } }>(
    "/api/v1/foundation/high-sensitivity/reviews",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.listing_id !== "string" || b.listing_id.length === 0)
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      if (typeof b.intended_use !== "string" || b.intended_use.length === 0)
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await reviewService.createReviewForCaller(token, b.listing_id, {
        intended_use: b.intended_use,
      });
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(201).send({ ok: true, review: result.review });
    },
  );

  // List reviews the caller may see, by scope (1299-B):
  //   ?scope=mine (default) | org_reviewable | org_history
  app.get<{ Querystring: { scope?: string } }>(
    "/api/v1/foundation/high-sensitivity/reviews",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const raw = request.query?.scope;
      if (typeof raw === "string" && raw.length > 0 && !REVIEW_LIST_SCOPES.has(raw))
        return reply.code(422).send({ ok: false, code: "INVALID_SCOPE" });
      const scope = (raw ?? "mine") as ReviewListScope;
      const result = await reviewService.listReviewsForCaller(token, scope);
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        scope: result.scope,
        reviews: result.reviews,
        ...(result.summary !== undefined ? { summary: result.summary } : {}),
      });
    },
  );

  // SAFE lifecycle/eligibility audit projection for one review (1299-B).
  // Visible to provider, buyer, or an AUTHORIZED provider-org reviewer.
  app.get<{ Params: { review_id: string } }>(
    "/api/v1/foundation/high-sensitivity/reviews/:review_id/audit",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await reviewService.getReviewAuditForCaller(
        token,
        request.params.review_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({
        ok: true,
        review: result.review,
        audit_events: result.audit_events,
      });
    },
  );

  // Read one review (provider OR buyer only; enumeration-safe).
  app.get<{ Params: { review_id: string } }>(
    "/api/v1/foundation/high-sensitivity/reviews/:review_id",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await reviewService.getReviewForCaller(
        token,
        request.params.review_id,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, review: result.review });
    },
  );

  // Approve a pending review for specific safe access mode(s) (provider-only).
  app.post<{
    Params: { review_id: string };
    Body: { approved_access_modes?: unknown; expires_at?: unknown };
  }>(
    "/api/v1/foundation/high-sensitivity/reviews/:review_id/approve",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      const result = await reviewService.approveReviewForCaller(
        token,
        request.params.review_id,
        {
          approved_access_modes: Array.isArray(b.approved_access_modes)
            ? (b.approved_access_modes as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
          expires_at: typeof b.expires_at === "string" ? b.expires_at : undefined,
        },
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, review: result.review });
    },
  );

  // Deny a pending review (provider-only).
  app.post<{ Params: { review_id: string }; Body: { reason?: unknown } }>(
    "/api/v1/foundation/high-sensitivity/reviews/:review_id/deny",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await reviewService.denyReviewForCaller(
        token,
        request.params.review_id,
        typeof request.body?.reason === "string" ? request.body.reason : undefined,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, review: result.review });
    },
  );

  // Revoke an approved review (provider OR buyer).
  app.post<{ Params: { review_id: string }; Body: { reason?: unknown } }>(
    "/api/v1/foundation/high-sensitivity/reviews/:review_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result = await reviewService.revokeReviewForCaller(
        token,
        request.params.review_id,
        typeof request.body?.reason === "string" ? request.body.reason : undefined,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, review: result.review });
    },
  );

  // ── Observability + metering enforcement (1293-A) ───────────────────────
  // SAFE observability snapshot of the caller's own org usage meters.
  app.get(
    "/api/v1/foundation/observability/snapshot",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const result =
        await observabilityService.getObservabilitySnapshotForCaller(token);
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, snapshot: result.snapshot });
    },
  );

  // Metering enforcement evaluator: check an org meter against a limit.
  app.post<{ Body: { meter_id?: unknown; limit?: unknown } }>(
    "/api/v1/foundation/observability/meter-check",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const b = request.body ?? {};
      if (typeof b.meter_id !== "string" || typeof b.limit !== "number")
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST" });
      const result = await observabilityService.checkMeterThresholdForCaller(
        token,
        b.meter_id,
        b.limit,
      );
      if (result.ok === false)
        return reply
          .code(failureStatus(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, result: result.result });
    },
  );
}
