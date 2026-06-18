// FILE: foundation-high-sensitivity-review.test.ts (integration)
// PURPOSE: Phase 1297-A — the high-sensitivity human-review workflow engine.
//          Proves end-to-end via buildApp: a REQUIRES_REVIEW high-sensitivity
//          decision becomes a durable PENDING review; the buyer cannot
//          self-approve another provider's data; a non-human (AI_AGENT) cannot
//          review; approval cannot broaden the access mode; CHILDREN is recorded
//          DENIED and never approvable; an APPROVED review lets the buyer create
//          a grant downgraded to the approved safe mode and read it (NO raw
//          content); a REVOKED or EXPIRED review blocks the read at read time; a
//          personal-DMW owner may self-review PROOF_ONLY; cross-tenant reviews
//          are invisible; every transition is audited.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/high-sensitivity-review.service.ts
//   - apps/api/src/services/foundation/marketplace.service.ts
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

const TEST_JWT_SECRET = "foundation-hs-review-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let PROVIDER_ID: string;
let BUYER_TOKEN: string;
let BUYER_ID: string;
let OUTSIDER_TOKEN: string;
let AI_PROVIDER_TOKEN: string;
let PERSONAL_TOKEN: string;
let PERSONAL_ID: string;
const store = new MemoryRateLimitStore();

async function member(
  orgId: string | null,
  ops: string[],
  t: EntityType = "PERSON",
): Promise<{ token: string; id: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: t, password });
  const e = await createEntity(input);
  if (orgId !== null)
    await prisma.entityMembership.create({
      data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true },
    });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return { token: (login.json() as { token: string }).token, id: e.entity_id };
}

async function addCapsule(ownerId: string, over: Record<string, unknown> = {}): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: ownerId } });
  await createCapsule(
    makeCapsuleInput(wallet.wallet_id, ownerId, {
      capsule_type: "PREFERENCE",
      payload_summary: `${TEST_PREFIX}sensitive signal`,
      ...over,
    }),
  );
}

function dataPackage(body: Record<string, unknown>, token: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}
async function makePackage(token: string, over: Record<string, unknown>): Promise<string> {
  const p = await dataPackage(
    {
      title: "Signals",
      description: "d",
      access_mode: "SAFE_PROJECTION",
      allowed_use: ["ANALYTICS", "PERSONALIZATION"],
      capsule_type_allowlist: ["PREFERENCE"],
      status: "PUBLISHED",
      ...over,
    },
    token,
  );
  return (p.json() as { listing: { listing_id: string } }).listing.listing_id;
}
function dataAccess(listingId: string, intended_use: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/data-access`,
    headers: { authorization: `Bearer ${token}` },
    payload: { intended_use },
  });
}
function createReview(body: Record<string, unknown>, token: string | null) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/high-sensitivity/reviews",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}
function approve(reviewId: string, body: Record<string, unknown>, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/high-sensitivity/reviews/${reviewId}/approve`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}
function deny(reviewId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/high-sensitivity/reviews/${reviewId}/deny`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
}
function revoke(reviewId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/high-sensitivity/reviews/${reviewId}/revoke`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
}
function getReview(reviewId: string, token: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/foundation/high-sensitivity/reviews/${reviewId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}
function makeGrant(listingId: string, intended_use: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`,
    headers: { authorization: `Bearer ${token}` },
    payload: { intended_use, consent_confirmed: true, opt_in_confirmed: true },
  });
}
function read(grantId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}hsA_${randomUUID()}`, email: `${TEST_PREFIX}hsA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}hsB_${randomUUID()}`, email: `${TEST_PREFIX}hsB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const prov = await member(orgA.entity_id, ["read", "write"]); PROVIDER_TOKEN = prov.token; PROVIDER_ID = prov.id;
  const buyer = await member(orgA.entity_id, ["read", "write"]); BUYER_TOKEN = buyer.token; BUYER_ID = buyer.id;
  OUTSIDER_TOKEN = (await member(orgB.entity_id, ["read", "write"])).token;
  AI_PROVIDER_TOKEN = (await member(orgA.entity_id, ["read", "write"], "AI_AGENT")).token;
  const personal = await member(null, ["read", "write"]); PERSONAL_TOKEN = personal.token; PERSONAL_ID = personal.id;
  await addCapsule(PROVIDER_ID);
  await addCapsule(PERSONAL_ID);
});

afterAll(async () => { await app.close(); await cleanupTestData(); await prisma.$disconnect(); });
withCleanRateLimits(store);

describe("Foundation high-sensitivity review workflow (1297-A)", () => {
  it("401s without auth", async () => {
    expect((await createReview({ listing_id: randomUUID(), intended_use: "ANALYTICS" }, null)).statusCode).toBe(401);
  });

  it("MEDICAL safe-projection data-access surfaces review_required (not auto-allowed)", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const res = await dataAccess(lid, "PERSONALIZATION", BUYER_TOKEN);
    const a = (res.json() as { access: Record<string, unknown> }).access;
    expect(a.can_access).toBe(false);
    expect(a.review_required).toBe(true);
  });

  it("creates a PENDING review (idempotent); leaks no raw content", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const res = await createReview({ listing_id: lid, intended_use: "PERSONALIZATION" }, BUYER_TOKEN);
    expect(res.statusCode).toBe(201);
    const rv = (res.json() as { review: Record<string, unknown> }).review;
    expect(rv.status).toBe("PENDING_REVIEW");
    expect(rv.raw_body_allowed).toBe(false);
    expect(rv.training_allowed).toBe(false);
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("storage_location");
    expect(res.payload).not.toContain("content_hash");
    expect(res.payload).not.toContain("embedding");
    // Idempotent — second create returns the same pending review.
    const again = await createReview({ listing_id: lid, intended_use: "PERSONALIZATION" }, BUYER_TOKEN);
    expect((again.json() as { review: { review_id: string } }).review.review_id).toBe(rv.review_id);
  });

  it("buyer cannot approve a provider's review (REVIEWER_IS_BUYER) — 1299-A", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    const res = await approve(rid.review.review_id, {}, BUYER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_IS_BUYER");
  });

  it("a non-human (AI_AGENT) provider cannot approve (REVIEWER_IS_NON_HUMAN) — 1299-A", async () => {
    const lid = await makePackage(AI_PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    const res = await approve(rid.review.review_id, {}, AI_PROVIDER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_IS_NON_HUMAN");
  });

  it("approval cannot broaden the access mode (MEDICAL + SAFE_PROJECTION → rejected)", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    const res = await approve(rid.review.review_id, { approved_access_modes: ["SAFE_PROJECTION"] }, PROVIDER_TOKEN);
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("APPROVED_MODE_NOT_ALLOWED");
  });

  it("CHILDREN is recorded DENIED and can never be approved", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["CHILDREN"], access_mode: "SAFE_PROJECTION" });
    const res = await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN);
    const rv = (res.json() as { review: Record<string, unknown> }).review;
    expect(rv.status).toBe("DENIED");
    const ap = await approve(rv.review_id as string, { approved_access_modes: ["PROOF_ONLY"] }, PROVIDER_TOKEN);
    expect(ap.statusCode).toBe(409);
    expect((ap.json() as { code: string }).code).toBe("REVIEW_NOT_PENDING");
  });

  it("HEALTH safe-projection needs no review (auto-allowed → REVIEW_NOT_REQUIRED)", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["HEALTH"], access_mode: "SAFE_PROJECTION" });
    const res = await createReview({ listing_id: lid, intended_use: "PERSONALIZATION" }, BUYER_TOKEN);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("REVIEW_NOT_REQUIRED");
  });

  it("MEDICAL end-to-end: approve PROOF_ONLY → grant downgraded → read (no raw); audited", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    // No grant possible before approval.
    const earlyGrant = await makeGrant(lid, "PERSONALIZATION", BUYER_TOKEN);
    expect((earlyGrant.json() as { code: string }).code).toBe("REVIEW_REQUIRED");

    const rid = (await createReview({ listing_id: lid, intended_use: "PERSONALIZATION" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    const ap = await approve(rid.review.review_id, {}, PROVIDER_TOKEN); // default → PROOF_ONLY
    expect(ap.statusCode).toBe(200);
    const arv = (ap.json() as { review: Record<string, unknown> }).review;
    expect(arv.status).toBe("APPROVED");
    expect(arv.approved_access_modes).toEqual(["PROOF_ONLY"]);
    expect(arv.expires_at).not.toBeNull();
    expect(arv.raw_body_allowed).toBe(false);

    const g = await makeGrant(lid, "PERSONALIZATION", BUYER_TOKEN);
    expect(g.statusCode).toBe(201);
    const grant = (g.json() as { grant: { grant_id: string; access_mode: string } }).grant;
    expect(grant.access_mode).toBe("PROOF_ONLY"); // downgraded to the approved safe mode

    const r = await read(grant.grant_id, BUYER_TOKEN);
    expect(r.statusCode).toBe(200);
    const rd = (r.json() as { read: Record<string, unknown> }).read;
    expect(rd.raw_body_excluded).toBe(true);
    expect(r.payload).not.toContain("payload_content");
    expect(r.payload).not.toContain("storage_location");

    const created = await prisma.auditEvent.count({ where: { event_type: "HIGH_SENSITIVITY_REVIEW_CREATED" } });
    const approved = await prisma.auditEvent.count({ where: { event_type: "HIGH_SENSITIVITY_REVIEW_APPROVED" } });
    expect(created).toBeGreaterThanOrEqual(1);
    expect(approved).toBeGreaterThanOrEqual(1);
  });

  it("BIOMETRIC aggregated: revoked review blocks the read at read time", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["BIOMETRIC"], access_mode: "AGGREGATED_SIGNAL", allowed_use: ["ANALYTICS"] });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    expect((await approve(rid.review.review_id, { approved_access_modes: ["AGGREGATED_SIGNAL"] }, PROVIDER_TOKEN)).statusCode).toBe(200);
    const grant = (await makeGrant(lid, "ANALYTICS", BUYER_TOKEN)).json() as { grant: { grant_id: string; access_mode: string } };
    expect(grant.grant.access_mode).toBe("AGGREGATED_SIGNAL");
    // Read works while approved (BIOMETRIC aggregated is NOT auto-allowed → uses review).
    expect((await read(grant.grant.grant_id, BUYER_TOKEN)).statusCode).toBe(200);
    // Revoke → read now blocked.
    expect((await revoke(rid.review.review_id, PROVIDER_TOKEN)).statusCode).toBe(200);
    const blocked = await read(grant.grant.grant_id, BUYER_TOKEN);
    expect(blocked.statusCode).toBe(403);
    expect((blocked.json() as { denied_reasons?: string[] }).denied_reasons).toContain("REVIEW_REQUIRED");
  });

  it("BIOMETRIC aggregated: expired review blocks the read + lazily marks EXPIRED", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["BIOMETRIC"], access_mode: "AGGREGATED_SIGNAL", allowed_use: ["ANALYTICS"] });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    expect((await approve(rid.review.review_id, { approved_access_modes: ["AGGREGATED_SIGNAL"] }, PROVIDER_TOKEN)).statusCode).toBe(200);
    const grant = (await makeGrant(lid, "ANALYTICS", BUYER_TOKEN)).json() as { grant: { grant_id: string } };
    // Force expiry in the past (simulate a lapsed approval).
    await prisma.highSensitivityReview.update({ where: { review_id: rid.review.review_id }, data: { expires_at: new Date(Date.now() - 1000) } });
    const blocked = await read(grant.grant.grant_id, BUYER_TOKEN);
    expect(blocked.statusCode).toBe(403);
    // The review row is now EXPIRED, and an EXPIRED audit event was written.
    const after = await getReview(rid.review.review_id, BUYER_TOKEN);
    expect((after.json() as { review: { status: string } }).review.status).toBe("EXPIRED");
    expect(await prisma.auditEvent.count({ where: { event_type: "HIGH_SENSITIVITY_REVIEW_EXPIRED" } })).toBeGreaterThanOrEqual(1);
  });

  it("cross-tenant review is invisible (REVIEW_NOT_FOUND)", async () => {
    const lid = await makePackage(PROVIDER_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION" });
    const rid = (await createReview({ listing_id: lid, intended_use: "ANALYTICS" }, BUYER_TOKEN)).json() as { review: { review_id: string } };
    expect((await getReview(rid.review.review_id, OUTSIDER_TOKEN)).statusCode).toBe(404);
  });

  it("personal DMW owner may self-review PROOF_ONLY for their own MEDICAL package", async () => {
    const lid = await makePackage(PERSONAL_TOKEN, { sensitivity_class: "HIGH_SENSITIVITY", sensitive_categories: ["MEDICAL"], access_mode: "SAFE_PROJECTION", status: "DRAFT" });
    const rid = (await createReview({ listing_id: lid, intended_use: "PERSONALIZATION" }, PERSONAL_TOKEN)).json() as { review: { review_id: string } };
    const ap = await approve(rid.review.review_id, { approved_access_modes: ["PROOF_ONLY"] }, PERSONAL_TOKEN);
    expect(ap.statusCode).toBe(200);
    expect((ap.json() as { review: { status: string } }).review.status).toBe("APPROVED");
  });
});
