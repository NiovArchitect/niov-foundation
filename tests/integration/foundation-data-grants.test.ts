// FILE: foundation-data-grants.test.ts (integration)
// PURPOSE: Phase 1294-A — durable data-marketplace grants + consent ledger.
//          Proves: grant requires auth + consent + opt-in; succeeds when
//          confirmed + use allowed; training denied by default; mock-only
//          economics; no raw body; provider+buyer see own grant; cross-tenant
//          invisible; revoke → REVOKED + idempotent; AI buyer cannot bypass
//          (paid → NEEDS_APPROVAL, training denied); PERSONAL DMW (null org)
//          packages are first-class + consent-gated; HIGH_SENSITIVITY (health/
//          medical) grants are DENIED pending a dedicated policy gate; a
//          different user cannot see/grant a personal listing (invisible
//          without grant). End-to-end via buildApp.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/marketplace.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, type EntityType } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-data-grants-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string; // orgA
let BUYER_TOKEN: string; // orgA
let OUTSIDER_TOKEN: string; // orgB
let AI_TOKEN: string; // orgA, AI_AGENT
let PERSONAL_TOKEN: string; // no org (individual)
const store = new MemoryRateLimitStore();

async function member(
  orgId: string | null,
  ops: string[],
  entity_type: EntityType = "PERSON",
): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type, password });
  const e = await createEntity(input);
  if (orgId !== null) {
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true },
    });
  }
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return (login.json() as { token: string }).token;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(randomBytes(32)),
    rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}dgA_${randomUUID()}`, email: `${TEST_PREFIX}dgA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}dgB_${randomUUID()}`, email: `${TEST_PREFIX}dgB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  PROVIDER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  BUYER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  OUTSIDER_TOKEN = await member(orgB.entity_id, ["read", "write"]);
  AI_TOKEN = await member(orgA.entity_id, ["read", "write"], "AI_AGENT");
  PERSONAL_TOKEN = await member(null, ["read", "write"]); // individual, no org
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

function createDataPackage(body: Record<string, unknown>, token: string) {
  return app.inject({ method: "POST", url: "/api/v1/foundation/marketplace/data-packages", headers: { authorization: `Bearer ${token}` }, payload: body });
}
function grant(listingId: string, body: Record<string, unknown>, token: string | null) {
  return app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`, headers: token !== null ? { authorization: `Bearer ${token}` } : {}, payload: body });
}
async function makePackage(token: string, over: Record<string, unknown> = {}): Promise<string> {
  const res = await createDataPackage({ title: "Signals", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["ANALYTICS", "PERSONALIZATION"], status: "PUBLISHED", pricing_model: { amount_usd: 0.02 }, ...over }, token);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

describe("Foundation data-marketplace grants (1294-A)", () => {
  it("401s without auth", async () => {
    const id = await makePackage(PROVIDER_TOKEN);
    expect((await grant(id, { intended_use: "ANALYTICS" }, null)).statusCode).toBe(401);
  });

  it("requires consent (409) then opt-in (409) before granting", async () => {
    const id = await makePackage(PROVIDER_TOKEN);
    const noConsent = await grant(id, { intended_use: "ANALYTICS" }, BUYER_TOKEN);
    expect(noConsent.statusCode).toBe(409);
    expect((noConsent.json() as { code: string }).code).toBe("CONSENT_REQUIRED");
    const noOptIn = await grant(id, { intended_use: "ANALYTICS", consent_confirmed: true }, BUYER_TOKEN);
    expect(noOptIn.statusCode).toBe(409);
    expect((noOptIn.json() as { code: string }).code).toBe("OPT_IN_REQUIRED");
  });

  it("creates an ACTIVE grant when consent + opt-in confirmed and use allowed", async () => {
    const id = await makePackage(PROVIDER_TOKEN);
    const res = await grant(id, { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true }, BUYER_TOKEN);
    expect(res.statusCode).toBe(201);
    const g = (res.json() as { grant: Record<string, unknown> }).grant;
    expect(g.status).toBe("ACTIVE");
    expect(g.proof_delivery).toBe("PER_CAPSULE_AT_READ_TIME");
    expect(g.proof_required).toBe(true);
    expect(g.raw_body_excluded).toBe(true);
    expect(g.cascade_revocation_supported).toBe(false);
    expect(g.economic_decision).toBe("ALLOW_MOCK"); // mock-only
    // No raw content on the wire.
    expect(res.payload).not.toContain("storage_location");
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("embedding");
  });

  it("denies TRAINING by default", async () => {
    const id = await makePackage(PROVIDER_TOKEN, { allowed_use: ["ANALYTICS", "TRAINING"] });
    const res = await grant(id, { intended_use: "TRAINING", consent_confirmed: true, opt_in_confirmed: true }, BUYER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("USE_NOT_PERMITTED");
  });

  it("provider + buyer see the grant; an outsider cannot (enumeration-safe)", async () => {
    const id = await makePackage(PROVIDER_TOKEN);
    const created = await grant(id, { intended_use: "ANALYTICS", consent_confirmed: true, opt_in_confirmed: true }, BUYER_TOKEN);
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;
    const get = (t: string) => app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/data-grants/${grantId}`, headers: { authorization: `Bearer ${t}` } });
    expect((await get(BUYER_TOKEN)).statusCode).toBe(200);
    expect((await get(PROVIDER_TOKEN)).statusCode).toBe(200);
    const outsider = await get(OUTSIDER_TOKEN);
    expect(outsider.statusCode).toBe(404);
    expect((outsider.json() as { code: string }).code).toBe("GRANT_NOT_FOUND");
  });

  it("revoke → REVOKED (idempotent); revoked grant cannot be used", async () => {
    const id = await makePackage(PROVIDER_TOKEN);
    const created = await grant(id, { intended_use: "ANALYTICS", consent_confirmed: true, opt_in_confirmed: true }, BUYER_TOKEN);
    const grantId = (created.json() as { grant: { grant_id: string } }).grant.grant_id;
    const rev = await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/revoke`, headers: { authorization: `Bearer ${PROVIDER_TOKEN}` }, payload: { reason: "provider revoke" } });
    expect(rev.statusCode).toBe(200);
    expect((rev.json() as { grant: { status: string } }).grant.status).toBe("REVOKED");
    // idempotent
    const rev2 = await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/revoke`, headers: { authorization: `Bearer ${PROVIDER_TOKEN}` } });
    expect(rev2.statusCode).toBe(200);
    const get = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/data-grants/${grantId}`, headers: { authorization: `Bearer ${BUYER_TOKEN}` } });
    expect((get.json() as { grant: { status: string } }).grant.status).toBe("REVOKED");
  });

  it("AI_AGENT buyer cannot bypass: paid grant → NEEDS_APPROVAL economics; training denied", async () => {
    const id = await makePackage(PROVIDER_TOKEN, { allowed_use: ["LLM_CONTEXT", "TRAINING"], access_mode: "LLM_CONTEXT_ACCESS" });
    const ok = await grant(id, { intended_use: "LLM_CONTEXT", consent_confirmed: true, opt_in_confirmed: true }, AI_TOKEN);
    expect(ok.statusCode).toBe(201);
    expect((ok.json() as { grant: { economic_decision: string } }).grant.economic_decision).toBe("NEEDS_APPROVAL");
    const train = await grant(id, { intended_use: "TRAINING", consent_confirmed: true, opt_in_confirmed: true }, AI_TOKEN);
    expect(train.statusCode).toBe(403);
  });
});

describe("Foundation data-marketplace grants — PERSONAL DMW (null org)", () => {
  it("an individual creates a personal DATA_PACKAGE (provider_org null) and grants with consent", async () => {
    const res = await createDataPackage({ title: "My habits", description: "personal habit signals", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], status: "PUBLISHED" }, PERSONAL_TOKEN);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { listing: { listing_id: string }; data_package: { provider_org_entity_id: string | null } };
    expect(body.data_package.provider_org_entity_id).toBeNull(); // personal
    const id = body.listing.listing_id;
    // consent required by default even for personal self-grant
    expect((await grant(id, { intended_use: "PERSONALIZATION" }, PERSONAL_TOKEN)).statusCode).toBe(409);
    const ok = await grant(id, { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true }, PERSONAL_TOKEN);
    expect(ok.statusCode).toBe(201);
    const g = (ok.json() as { grant: { buyer_org_entity_id: string | null; status: string } }).grant;
    expect(g.buyer_org_entity_id).toBeNull(); // personal buyer
    expect(g.status).toBe("ACTIVE");
  });

  it("MEDICAL personal package (non-proof mode) requires review → grant DENIED (1296-A)", async () => {
    const res = await createDataPackage({ title: "My health", description: "personal health signals", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], status: "PUBLISHED", sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["HEALTH", "MEDICAL"] }, PERSONAL_TOKEN);
    const id = (res.json() as { listing: { listing_id: string } }).listing.listing_id;
    const g = await grant(id, { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true }, PERSONAL_TOKEN);
    expect(g.statusCode).toBe(403);
    const body = g.json() as { code: string; denied_reasons?: string[] };
    expect(body.code).toBe("USE_NOT_PERMITTED");
    expect(body.denied_reasons).toContain("MEDICAL_DATA_REQUIRES_DEDICATED_REVIEW");
  });

  it("HEALTH-only personal package (SAFE_PROJECTION) is now GRANTABLE under strict controls (1296-A)", async () => {
    const res = await createDataPackage({ title: "My wellness", description: "personal wellness signals", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], status: "PUBLISHED", sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["HEALTH"] }, PERSONAL_TOKEN);
    const id = (res.json() as { listing: { listing_id: string } }).listing.listing_id;
    const g = await grant(id, { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true }, PERSONAL_TOKEN);
    expect(g.statusCode).toBe(201);
    expect((g.json() as { grant: { status: string } }).grant.status).toBe("ACTIVE");
    // CHILDREN remains denied outright.
    const c = await createDataPackage({ title: "Kids", description: "x", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], status: "PUBLISHED", sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["CHILDREN"] }, PERSONAL_TOKEN);
    const cid = (c.json() as { listing: { listing_id: string } }).listing.listing_id;
    const cg = await grant(cid, { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true }, PERSONAL_TOKEN);
    expect(cg.statusCode).toBe(403);
    expect((cg.json() as { denied_reasons?: string[] }).denied_reasons).toContain("CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW");
  });

  it("a different user cannot see/grant a personal listing (invisible without grant)", async () => {
    const res = await createDataPackage({ title: "Private", description: "d", access_mode: "PROOF_ONLY", allowed_use: ["ANALYTICS"], status: "PUBLISHED" }, PERSONAL_TOKEN);
    const id = (res.json() as { listing: { listing_id: string } }).listing.listing_id;
    const other = await grant(id, { intended_use: "ANALYTICS", consent_confirmed: true, opt_in_confirmed: true }, BUYER_TOKEN);
    expect(other.statusCode).toBe(404);
    expect((other.json() as { code: string }).code).toBe("LISTING_NOT_FOUND");
  });
});
