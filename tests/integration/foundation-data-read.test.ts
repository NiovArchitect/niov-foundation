// FILE: foundation-data-read.test.ts (integration)
// PURPOSE: Phase 1295-A — COSMP-governed safe data-read delivery for marketplace
//          grants. Proves: auth; buyer-only + enumeration-safe; ACTIVE grant +
//          consent → SAFE_PROJECTION DELIVERED (safe_summary, per-item proof, NO
//          raw body); revoked grant → denied; PROOF_ONLY returns no summary;
//          capsule_type_allowlist enforced; read-side sensitivity + use gates
//          (defense-in-depth via injected grant); personal-DMW read works; an
//          AI buyer cannot bypass (ai_access_blocked capsules excluded).
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/marketplace-data-delivery.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  createCapsule,
  createEntity,
  prisma,
  type EntityType,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeCapsuleInput,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-data-read-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let PROVIDER_ID: string;
let BUYER_TOKEN: string;
let OUTSIDER_TOKEN: string;
let AI_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string | null, ops: string[], t: EntityType = "PERSON"): Promise<{ token: string; id: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: t, password });
  const e = await createEntity(input);
  if (orgId !== null) await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ops } });
  return { token: (login.json() as { token: string }).token, id: e.entity_id };
}

async function addCapsule(ownerId: string, over: Record<string, unknown> = {}): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: ownerId } });
  await createCapsule(makeCapsuleInput(wallet.wallet_id, ownerId, { capsule_type: "PREFERENCE", payload_summary: `${TEST_PREFIX}prefers tea`, ...over }));
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({ jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(), contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}drA_${randomUUID()}`, email: `${TEST_PREFIX}drA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}drB_${randomUUID()}`, email: `${TEST_PREFIX}drB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const prov = await member(orgA.entity_id, ["read", "write"]); PROVIDER_TOKEN = prov.token; PROVIDER_ID = prov.id;
  BUYER_TOKEN = (await member(orgA.entity_id, ["read", "write"])).token;
  OUTSIDER_TOKEN = (await member(orgB.entity_id, ["read", "write"])).token;
  AI_TOKEN = (await member(orgA.entity_id, ["read", "write"], "AI_AGENT")).token;
});

afterAll(async () => { await app.close(); await cleanupTestData(); await prisma.$disconnect(); });
withCleanRateLimits(store);

function dataPackage(body: Record<string, unknown>, token: string) {
  return app.inject({ method: "POST", url: "/api/v1/foundation/marketplace/data-packages", headers: { authorization: `Bearer ${token}` }, payload: body });
}
function makeGrant(listingId: string, intended_use: string, token: string) {
  return app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`, headers: { authorization: `Bearer ${token}` }, payload: { intended_use, consent_confirmed: true, opt_in_confirmed: true } });
}
function read(grantId: string, body: Record<string, unknown>, token: string | null) {
  return app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`, headers: token !== null ? { authorization: `Bearer ${token}` } : {}, payload: body });
}
async function pkgAndGrant(token: string, pkgOver: Record<string, unknown>, intended_use: string, buyerToken: string): Promise<string> {
  const p = await dataPackage({ title: "Signals", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["ANALYTICS", "PERSONALIZATION"], capsule_type_allowlist: ["PREFERENCE"], status: "PUBLISHED", ...pkgOver }, token);
  const id = (p.json() as { listing: { listing_id: string } }).listing.listing_id;
  const g = await makeGrant(id, intended_use, buyerToken);
  return (g.json() as { grant: { grant_id: string } }).grant.grant_id;
}

describe("Foundation marketplace data-read delivery (1295-A)", () => {
  it("401s without auth", async () => {
    await addCapsule(PROVIDER_ID);
    const gid = await pkgAndGrant(PROVIDER_TOKEN, {}, "ANALYTICS", BUYER_TOKEN);
    expect((await read(gid, {}, null)).statusCode).toBe(401);
  });

  it("non-buyer / cross-tenant cannot read (enumeration-safe)", async () => {
    const gid = await pkgAndGrant(PROVIDER_TOKEN, {}, "ANALYTICS", BUYER_TOKEN);
    expect((await read(gid, {}, OUTSIDER_TOKEN)).statusCode).toBe(404);
    expect((await read(gid, {}, PROVIDER_TOKEN)).statusCode).toBe(404); // provider is not the buyer
  });

  it("ACTIVE grant + consent → SAFE_PROJECTION DELIVERED (safe_summary, proof, NO raw body)", async () => {
    await addCapsule(PROVIDER_ID, { payload_summary: `${TEST_PREFIX}likes hiking` });
    const gid = await pkgAndGrant(PROVIDER_TOKEN, {}, "PERSONALIZATION", BUYER_TOKEN);
    const res = await read(gid, { access_mode: "SAFE_PROJECTION" }, BUYER_TOKEN);
    expect(res.statusCode).toBe(200);
    const r = (res.json() as { read: Record<string, unknown> }).read;
    expect(r.status).toBe("DELIVERED");
    expect(r.raw_body_excluded).toBe(true);
    expect(r.proof_delivery).toBe("PER_CAPSULE_AT_READ_TIME");
    const items = r.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.capsule_type).toBe("PREFERENCE");
    expect(typeof items[0]!.safe_summary).toBe("string"); // summary present in SAFE_PROJECTION
    expect((items[0]!.proof as { result: string }).result).toBe("MARKETPLACE_GRANT_AUTHORIZED");
    // No raw body / storage / embedding / forbidden keys on the wire.
    expect(res.payload).not.toContain("storage_location");
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("payload_summary"); // renamed key, not leaked
    expect(res.payload).not.toContain("embedding");
    expect(res.payload).not.toContain("content_hash");
  });

  it("PROOF_ONLY returns proof + type but NO summary", async () => {
    await addCapsule(PROVIDER_ID);
    const gid = await pkgAndGrant(PROVIDER_TOKEN, { access_mode: "PROOF_ONLY" }, "ANALYTICS", BUYER_TOKEN);
    const res = await read(gid, { access_mode: "PROOF_ONLY" }, BUYER_TOKEN);
    const items = (res.json() as { read: { items: Array<Record<string, unknown>> } }).read.items;
    if (items.length > 0) {
      expect(items[0]!.safe_summary).toBeUndefined();
      expect((items[0]!.proof as { result: string }).result).toBe("MARKETPLACE_GRANT_AUTHORIZED");
    }
  });

  it("capsule_type_allowlist is enforced (non-allowed type excluded)", async () => {
    await addCapsule(PROVIDER_ID, { capsule_type: "DECISION", payload_summary: `${TEST_PREFIX}a decision` });
    const gid = await pkgAndGrant(PROVIDER_TOKEN, { capsule_type_allowlist: ["PREFERENCE"] }, "ANALYTICS", BUYER_TOKEN);
    const res = await read(gid, {}, BUYER_TOKEN);
    const items = (res.json() as { read: { items: Array<{ capsule_type: string }> } }).read.items;
    expect(items.every((i) => i.capsule_type === "PREFERENCE")).toBe(true);
  });

  it("a revoked grant cannot read", async () => {
    const gid = await pkgAndGrant(PROVIDER_TOKEN, {}, "ANALYTICS", BUYER_TOKEN);
    await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${gid}/revoke`, headers: { authorization: `Bearer ${PROVIDER_TOKEN}` } });
    const res = await read(gid, {}, BUYER_TOKEN);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("GRANT_NOT_ACTIVE");
  });

  it("read-side sensitivity defense: an injected grant on a HIGH_SENSITIVITY package is denied", async () => {
    // Build a package directly as HIGH_SENSITIVITY + an ACTIVE grant via prisma,
    // bypassing the create-time gate, to prove the READ-side gate is independent.
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: PROVIDER_ID } });
    const listing = await prisma.marketplaceListing.create({ data: { listing_type: "DATA_PACKAGE", provider_entity_id: PROVIDER_ID, title: "H", description: "d", required_authority: [], required_memory_scope: [], status: "PUBLISHED" } });
    const pkg = await prisma.marketplaceDataPackage.create({ data: { listing_id: listing.listing_id, provider_entity_id: PROVIDER_ID, access_mode: "SAFE_PROJECTION", capsule_type_allowlist: ["PREFERENCE"], allowed_use: ["ANALYTICS"], sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["CHILDREN"] } });
    // Find the buyer entity id from a fresh login is overkill; create grant with buyer = a known id.
    const buyerWho = await app.inject({ method: "GET", url: "/api/v1/foundation/authority/me", headers: { authorization: `Bearer ${BUYER_TOKEN}` } });
    const buyerId = (buyerWho.json() as { authority: { entity_id: string } }).authority.entity_id;
    const grant = await prisma.marketplaceDataGrant.create({ data: { listing_id: listing.listing_id, data_package_id: pkg.data_package_id, provider_entity_id: PROVIDER_ID, buyer_entity_id: buyerId, granted_by_entity_id: buyerId, intended_use: "ANALYTICS", access_mode: "SAFE_PROJECTION", status: "ACTIVE" } });
    const res = await read(grant.grant_id, {}, BUYER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { denied_reasons?: string[] }).denied_reasons).toContain("CHILDREN_DATA_REQUIRES_DEDICATED_REVIEW");
  });

  it("an AI buyer reads safe projections but never sees ai_access_blocked capsules", async () => {
    await addCapsule(PROVIDER_ID, { payload_summary: `${TEST_PREFIX}AI-OK capsule` });
    // a blocked capsule the marketplace must never surface
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: PROVIDER_ID } });
    const blocked = await createCapsule(makeCapsuleInput(wallet.wallet_id, PROVIDER_ID, { capsule_type: "PREFERENCE", payload_summary: `${TEST_PREFIX}AI-BLOCKED-MARKER` }));
    await prisma.memoryCapsule.update({ where: { capsule_id: blocked.capsule_id }, data: { ai_access_blocked: true } });
    const gid = await pkgAndGrant(PROVIDER_TOKEN, {}, "ANALYTICS", AI_TOKEN);
    const res = await read(gid, {}, AI_TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain("AI-BLOCKED-MARKER"); // excluded
  });
});

describe("Foundation data-read — high-sensitivity gate (1296-A)", () => {
  it("HEALTH safe-projection grant is now readable under strict controls", async () => {
    await addCapsule(PROVIDER_ID, { payload_summary: `${TEST_PREFIX}wellness signal` });
    const gid = await pkgAndGrant(
      PROVIDER_TOKEN,
      { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["HEALTH"] },
      "PERSONALIZATION",
      BUYER_TOKEN,
    );
    const res = await read(gid, { access_mode: "SAFE_PROJECTION" }, BUYER_TOKEN);
    expect(res.statusCode).toBe(200);
    const r = (res.json() as { read: { status: string; raw_body_excluded: boolean } }).read;
    expect(["DELIVERED", "NO_MATCH"]).toContain(r.status);
    expect(r.raw_body_excluded).toBe(true);
    // Still never raw content.
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("storage_location");
  });

  it("a MEDICAL grant (injected) is denied at read (review required)", async () => {
    const listing = await prisma.marketplaceListing.create({ data: { listing_type: "DATA_PACKAGE", provider_entity_id: PROVIDER_ID, title: "Med", description: "d", required_authority: [], required_memory_scope: [], status: "PUBLISHED" } });
    const pkg = await prisma.marketplaceDataPackage.create({ data: { listing_id: listing.listing_id, provider_entity_id: PROVIDER_ID, access_mode: "SAFE_PROJECTION", capsule_type_allowlist: ["PREFERENCE"], allowed_use: ["ANALYTICS"], sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"] } });
    const who = await app.inject({ method: "GET", url: "/api/v1/foundation/authority/me", headers: { authorization: `Bearer ${BUYER_TOKEN}` } });
    const buyerId = (who.json() as { authority: { entity_id: string } }).authority.entity_id;
    const g = await prisma.marketplaceDataGrant.create({ data: { listing_id: listing.listing_id, data_package_id: pkg.data_package_id, provider_entity_id: PROVIDER_ID, buyer_entity_id: buyerId, granted_by_entity_id: buyerId, intended_use: "ANALYTICS", access_mode: "SAFE_PROJECTION", status: "ACTIVE" } });
    // 1297-A: a MEDICAL SAFE_PROJECTION grant with no APPROVED human review is
    // blocked at read time with REVIEW_REQUIRED (the review path, not a flat
    // category denial); raw content is still never delivered.
    const res = await read(g.grant_id, {}, BUYER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { denied_reasons?: string[] }).denied_reasons).toContain("REVIEW_REQUIRED");
  });
});
