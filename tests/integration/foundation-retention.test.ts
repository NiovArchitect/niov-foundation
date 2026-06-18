// FILE: foundation-retention.test.ts (integration)
// PURPOSE: Phase 1298-A — retention-policy enforcement end-to-end via buildApp +
//          the sweep service. Proves: high-sensitivity grants get a finite
//          default expiry; standard grants may be until-revoked (null); a
//          finite retention applies its window; an over-long high-sensitivity
//          retention is denied; expired grant/consent fail closed at read
//          (lazily marked EXPIRED + audited); the maintenance sweep expires
//          active grants + approved reviews; safe read works before expiry; no
//          raw content; AI buyer retention is enforced; audit events emitted.
// CONNECTS TO:
//   - apps/api/src/services/foundation/retention-policy.service.ts
//   - apps/api/src/services/foundation/marketplace.service.ts
//   - apps/api/src/services/foundation/marketplace-data-delivery.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  FoundationRetentionService,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createCapsule, createEntity, prisma, type EntityType } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-retention-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let PROVIDER_ID: string;
let BUYER_TOKEN: string;
let AI_TOKEN: string;
const store = new MemoryRateLimitStore();
const retention = new FoundationRetentionService();

async function member(orgId: string | null, t: EntityType = "PERSON"): Promise<{ token: string; id: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: t, password });
  const e = await createEntity(input);
  if (orgId !== null)
    await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
  return { token: (login.json() as { token: string }).token, id: e.entity_id };
}
async function addCapsule(ownerId: string): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: ownerId } });
  await createCapsule(makeCapsuleInput(wallet.wallet_id, ownerId, { capsule_type: "PREFERENCE", payload_summary: `${TEST_PREFIX}signal` }));
}
function makePackage(token: string, over: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/v1/foundation/marketplace/data-packages", headers: { authorization: `Bearer ${token}` }, payload: { title: "P", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], capsule_type_allowlist: ["PREFERENCE"], status: "PUBLISHED", ...over } });
}
function grant(listingId: string, token: string, body: Record<string, unknown> = {}) {
  return app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`, headers: { authorization: `Bearer ${token}` }, payload: { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true, ...body } });
}
function read(grantId: string, token: string) {
  return app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`, headers: { authorization: `Bearer ${token}` }, payload: {} });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({ jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(), contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rtA_${randomUUID()}`, email: `${TEST_PREFIX}rtA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const prov = await member(orgA.entity_id); PROVIDER_TOKEN = prov.token; PROVIDER_ID = prov.id;
  BUYER_TOKEN = (await member(orgA.entity_id)).token;
  AI_TOKEN = (await member(orgA.entity_id, "AI_AGENT")).token;
  await addCapsule(PROVIDER_ID);
});
afterAll(async () => { await app.close(); await cleanupTestData(); await prisma.$disconnect(); });
withCleanRateLimits(store);

const HS = { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["HEALTH"] };

describe("Foundation retention enforcement (1298-A)", () => {
  it("high-sensitivity grant gets a finite default expiry (HEALTH)", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const g = await grant(lid, BUYER_TOKEN);
    expect(g.statusCode).toBe(201);
    const gr = (g.json() as { grant: { status: string; expires_at: string | null } }).grant;
    expect(gr.status).toBe("ACTIVE");
    expect(gr.expires_at).not.toBeNull();
  });

  it("standard grant is until-revoked (null expiry)", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, {})).json().listing.listing_id;
    const g = await grant(lid, BUYER_TOKEN);
    expect(g.statusCode).toBe(201);
    expect((g.json() as { grant: { expires_at: string | null } }).grant.expires_at).toBeNull();
  });

  it("standard grant with SEVEN_DAYS retention expires in ~7 days", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, { retention_policy: "SEVEN_DAYS" })).json().listing.listing_id;
    const g = await grant(lid, BUYER_TOKEN);
    const exp = new Date((g.json() as { grant: { expires_at: string } }).grant.expires_at).getTime();
    const days = (exp - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });

  it("high-sensitivity grant with ONE_YEAR retention is denied (too long)", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, { ...HS, retention_policy: "ONE_YEAR" })).json().listing.listing_id;
    const g = await grant(lid, BUYER_TOKEN);
    expect(g.statusCode).toBe(422);
    expect((g.json() as { code: string }).code).toBe("RETENTION_TOO_LONG_FOR_SENSITIVITY");
  });

  it("safe read works before expiry; no raw content", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const gid = (await grant(lid, BUYER_TOKEN)).json().grant.grant_id;
    const r = await read(gid, BUYER_TOKEN);
    expect(r.statusCode).toBe(200);
    expect(r.payload).not.toContain("payload_content");
    expect(r.payload).not.toContain("storage_location");
  });

  it("expired grant fails closed at read (lazily marked EXPIRED + audited)", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const gid = (await grant(lid, BUYER_TOKEN)).json().grant.grant_id;
    await prisma.marketplaceDataGrant.update({ where: { grant_id: gid }, data: { expires_at: new Date(Date.now() - 1000) } });
    const r = await read(gid, BUYER_TOKEN);
    expect(r.statusCode).toBe(409); // GRANT_EXPIRED is a state-conflict denial
    expect((r.json() as { code: string }).code).toBe("GRANT_EXPIRED");
    const row = await prisma.marketplaceDataGrant.findFirstOrThrow({ where: { grant_id: gid } });
    expect(row.status).toBe("EXPIRED");
    expect(await prisma.auditEvent.count({ where: { event_type: "MARKETPLACE_DATA_GRANT_EXPIRED" } })).toBeGreaterThanOrEqual(1);
  });

  it("expired consent fails closed at read (audited)", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const g = (await grant(lid, BUYER_TOKEN)).json().grant;
    // Expire the consent only (grant still in its 30d window).
    const grow = await prisma.marketplaceDataGrant.findFirstOrThrow({ where: { grant_id: g.grant_id } });
    await prisma.marketplaceDataConsent.update({ where: { consent_id: grow.consent_record_id! }, data: { expires_at: new Date(Date.now() - 1000) } });
    const r = await read(g.grant_id, BUYER_TOKEN);
    expect(r.statusCode).toBe(403);
    expect((r.json() as { code: string }).code).toBe("CONSENT_EXPIRED");
    expect(await prisma.auditEvent.count({ where: { event_type: "MARKETPLACE_DATA_CONSENT_EXPIRED" } })).toBeGreaterThanOrEqual(1);
  });

  it("sweep expires active grants past their expiry + emits RETENTION_SWEEP_COMPLETED", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const gid = (await grant(lid, BUYER_TOKEN)).json().grant.grant_id;
    await prisma.marketplaceDataGrant.update({ where: { grant_id: gid }, data: { expires_at: new Date(Date.now() - 1000) } });
    const result = await retention.sweepExpiredMarketplaceAccess(new Date());
    expect(result.grants_expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.marketplaceDataGrant.findFirstOrThrow({ where: { grant_id: gid } })).status).toBe("EXPIRED");
    // After the sweep marks it EXPIRED, the read fails closed as GRANT_NOT_ACTIVE.
    const swept = await read(gid, BUYER_TOKEN);
    expect(swept.statusCode).toBe(409);
    expect((swept.json() as { code: string }).code).toBe("GRANT_NOT_ACTIVE");
    expect(await prisma.auditEvent.count({ where: { event_type: "RETENTION_SWEEP_COMPLETED" } })).toBeGreaterThanOrEqual(1);
  });

  it("sweep expires approved high-sensitivity reviews past their expiry", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"] })).json().listing.listing_id;
    const rid = (await app.inject({ method: "POST", url: "/api/v1/foundation/high-sensitivity/reviews", headers: { authorization: `Bearer ${BUYER_TOKEN}` }, payload: { listing_id: lid, intended_use: "PERSONALIZATION" } })).json().review.review_id;
    await app.inject({ method: "POST", url: `/api/v1/foundation/high-sensitivity/reviews/${rid}/approve`, headers: { authorization: `Bearer ${PROVIDER_TOKEN}` }, payload: {} });
    await prisma.highSensitivityReview.update({ where: { review_id: rid }, data: { expires_at: new Date(Date.now() - 1000) } });
    const result = await retention.sweepExpiredMarketplaceAccess(new Date());
    expect(result.reviews_expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.highSensitivityReview.findFirstOrThrow({ where: { review_id: rid } })).status).toBe("EXPIRED");
  });

  it("AI_AGENT buyer cannot escape retention — HS grant still finite", async () => {
    const lid = (await makePackage(PROVIDER_TOKEN, HS)).json().listing.listing_id;
    const g = await grant(lid, AI_TOKEN);
    // AI may be NEEDS_APPROVAL for paid packages, but this is free → grant ok + finite.
    expect(g.statusCode).toBe(201);
    expect((g.json() as { grant: { expires_at: string | null } }).grant.expires_at).not.toBeNull();
  });

  it("emits RETENTION_POLICY_EVALUATED on grant creation", async () => {
    expect(await prisma.auditEvent.count({ where: { event_type: "RETENTION_POLICY_EVALUATED" } })).toBeGreaterThanOrEqual(1);
  });
});
