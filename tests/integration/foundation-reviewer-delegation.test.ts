// FILE: tests/integration/foundation-reviewer-delegation.test.ts (integration)
// PURPOSE: Phase 1299-A — proves end-to-end (via buildApp) the ORG-COMPLIANCE
//          REVIEWER DELEGATION on top of the 1297-A review workflow:
//          - an org-owned MEDICAL package still REQUIRES_REVIEW (PENDING created);
//          - the buyer/requester cannot approve (REVIEWER_IS_BUYER), even when
//            they hold an admin membership in the provider's org (no self-serve);
//          - a non-human org admin cannot approve (REVIEWER_IS_NON_HUMAN);
//          - an unauthorized org member cannot approve (REVIEWER_NOT_ORG_AUTHORIZED);
//          - an authorized org admin AND an org compliance reviewer CAN approve;
//          - an approved review permits only the safe mode (no raw content on read);
//          - a cross-tenant reviewer cannot see (REVIEW_NOT_FOUND) or approve;
//          - the shipped buyer stop-use survives (buyer may revoke), and an org
//            reviewer may also revoke;
//          - every eligibility decision is audited
//            (HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED).
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/high-sensitivity-review.service.ts
//   - apps/api/src/services/foundation/high-sensitivity-reviewer-policy.ts

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
  resetRateLimits,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-reviewer-delegation-secret";
let app: FastifyInstance;
let ORG_A = "";
let ORG_B = "";
let PROVIDER_TOKEN = "";
let PROVIDER_ID = "";
let BUYER_TOKEN = "";
let ADMIN_TOKEN = ""; // org admin in ORG_A (is_admin membership)
let COMPLIANCE_TOKEN = ""; // "Compliance Officer" role in ORG_A
let PLAIN_TOKEN = ""; // ordinary member in ORG_A (no authorizing role)
let AI_ADMIN_TOKEN = ""; // AI_AGENT with an is_admin membership in ORG_A
let OUTSIDER_TOKEN = ""; // member of ORG_B (cross-tenant)
let CROSS_ORG_ADMIN_TOKEN = ""; // plain member of ORG_A + admin of ORG_B
let TAR_PLAIN_TOKEN = ""; // plain member of ORG_A holding GLOBAL TAR can_admin_org
let INACTIVE_TOKEN = ""; // INACTIVE admin membership in ORG_A
let PERSONAL_PROVIDER_TOKEN = ""; // personal-DMW provider (no org)
let PERSONAL_LISTING = ""; // a personal-DMW MEDICAL package listing
const store = new MemoryRateLimitStore();

// Create an entity, optionally place it in an org with a specific membership
// role / admin flag, and log it in for the requested operations.
async function member(
  orgId: string | null,
  ops: string[],
  opts: { type?: EntityType; role?: string; isAdmin?: boolean; isActive?: boolean } = {},
): Promise<{ token: string; id: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: opts.type ?? "PERSON", password });
  const e = await createEntity(input);
  if (orgId !== null)
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: e.entity_id,
        role_title: opts.role ?? "MEMBER",
        is_admin: opts.isAdmin ?? false,
        is_active: opts.isActive ?? true,
      },
    });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return { token: (login.json() as { token: string }).token, id: e.entity_id };
}

async function addCapsule(ownerId: string): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { entity_id: ownerId } });
  await createCapsule(
    makeCapsuleInput(wallet.wallet_id, ownerId, {
      capsule_type: "PREFERENCE",
      payload_summary: `${TEST_PREFIX}sensitive signal`,
    }),
  );
}

async function makePackage(token: string, over: Record<string, unknown>): Promise<string> {
  const p = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      title: "Signals",
      description: "d",
      access_mode: "SAFE_PROJECTION",
      allowed_use: ["ANALYTICS", "PERSONALIZATION"],
      capsule_type_allowlist: ["PREFERENCE"],
      status: "PUBLISHED",
      ...over,
    },
  });
  const body = p.json() as { listing?: { listing_id: string } };
  if (!body.listing) throw new Error(`makePackage failed: ${p.statusCode} ${p.payload}`);
  return body.listing.listing_id;
}
function createReview(body: Record<string, unknown>, token: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/high-sensitivity/reviews",
    headers: { authorization: `Bearer ${token}` },
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

// Open a fresh PENDING review for a new MEDICAL package and return its id.
async function pendingReview(intendedUse: string): Promise<{ reviewId: string; listingId: string }> {
  const listingId = await makePackage(PROVIDER_TOKEN, {
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["MEDICAL"],
    access_mode: "SAFE_PROJECTION",
  });
  const r = (await createReview({ listing_id: listingId, intended_use: intendedUse }, BUYER_TOKEN)).json() as {
    review: { review_id: string };
  };
  return { reviewId: r.review.review_id, listingId };
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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rdA_${randomUUID()}`, email: `${TEST_PREFIX}rdA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rdB_${randomUUID()}`, email: `${TEST_PREFIX}rdB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  ORG_A = orgA.entity_id;
  ORG_B = orgB.entity_id;
  const prov = await member(orgA.entity_id, ["read", "write"]); PROVIDER_TOKEN = prov.token; PROVIDER_ID = prov.id;
  // Buyer is also an org admin — proves self-serve approval is still denied.
  BUYER_TOKEN = (await member(orgA.entity_id, ["read", "write"], { isAdmin: true })).token;
  ADMIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { isAdmin: true })).token;
  COMPLIANCE_TOKEN = (await member(orgA.entity_id, ["read", "write"], { role: "Compliance Officer" })).token;
  PLAIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { role: "Software Engineer" })).token;
  AI_ADMIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { type: "AI_AGENT", isAdmin: true })).token;
  OUTSIDER_TOKEN = (await member(orgB.entity_id, ["read", "write"], { isAdmin: true })).token;

  // Login is IP-rate-limited (10/min); reset between setup batches so the many
  // beforeAll logins do not trip the gateway limit (withCleanRateLimits only
  // resets per-test, after beforeAll has already run).
  await resetRateLimits(store);

  // CONFUSED-DEPUTY GUARD subject: an ACTIVE *plain* member of the provider org
  // (ORG_A) who is ALSO an ADMIN of a DIFFERENT org (ORG_B). The ORG_B admin
  // role must NEVER be borrowed to authorize a review of ORG_A's data.
  const crossAdmin = await member(orgA.entity_id, ["read", "write"], { role: "Software Engineer" });
  CROSS_ORG_ADMIN_TOKEN = crossAdmin.token;
  await prisma.entityMembership.create({
    data: { parent_id: orgB.entity_id, child_id: crossAdmin.id, role_title: "ADMIN", is_admin: true, is_active: true },
  });

  // CONFUSED-DEPUTY GUARD subject #2 (TAR channel): an ACTIVE *plain* member of
  // the provider org who holds a GLOBAL TAR can_admin_org capability (e.g.
  // because they administer some other org). The global flag must NOT elevate
  // them here — only a provider-org admin membership / role does.
  const tarPlain = await member(orgA.entity_id, ["read", "write"], { role: "Software Engineer" });
  TAR_PLAIN_TOKEN = tarPlain.token;
  await prisma.tokenAttributeRepository.upsert({
    where: { entity_id: tarPlain.id },
    create: { entity_id: tarPlain.id, can_admin_org: true, status: "ACTIVE", tar_hash: "test-tar-hash" },
    update: { can_admin_org: true, status: "ACTIVE" },
  });

  // INACTIVE admin membership in the provider org — must not authorize.
  INACTIVE_TOKEN = (await member(orgA.entity_id, ["read", "write"], { isAdmin: true, isActive: false })).token;

  // Personal-DMW provider (no org) — its review may NOT be approved via any
  // org-membership delegation; only the owner path applies.
  const personalProv = await member(null, ["read", "write"]); PERSONAL_PROVIDER_TOKEN = personalProv.token;
  await addCapsule(PROVIDER_ID);
  await addCapsule(personalProv.id);
  PERSONAL_LISTING = await makePackage(PERSONAL_PROVIDER_TOKEN, {
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["MEDICAL"],
    access_mode: "SAFE_PROJECTION",
    status: "DRAFT", // a personal (orgless) provider cannot PUBLISH to an org marketplace
  });
});

afterAll(async () => { await app.close(); await cleanupTestData(); await prisma.$disconnect(); });
withCleanRateLimits(store);

describe("Foundation org-compliance reviewer delegation (1299-A)", () => {
  it("an org-owned MEDICAL package still opens a PENDING review", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const rv = (await getReview(reviewId, PROVIDER_TOKEN)).json() as { review: { status: string } };
    expect(rv.review.status).toBe("PENDING_REVIEW");
  });

  it("the buyer/requester cannot approve — even as an org admin (REVIEWER_IS_BUYER)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const res = await approve(reviewId, {}, BUYER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_IS_BUYER");
  });

  it("a non-human org admin cannot approve (REVIEWER_IS_NON_HUMAN)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const res = await approve(reviewId, {}, AI_ADMIN_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_IS_NON_HUMAN");
  });

  it("an unauthorized org member cannot approve (REVIEWER_NOT_ORG_AUTHORIZED)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const res = await approve(reviewId, {}, PLAIN_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_NOT_ORG_AUTHORIZED");
  });

  it("a cross-tenant reviewer cannot SEE the review (REVIEW_NOT_FOUND)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    expect((await getReview(reviewId, OUTSIDER_TOKEN)).statusCode).toBe(404);
    const res = await approve(reviewId, {}, OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("REVIEW_NOT_FOUND");
  });

  it("(confused-deputy) an ADMIN of another org — only a PLAIN member here — cannot approve (REVIEWER_NOT_ORG_AUTHORIZED)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    // CROSS_ORG_ADMIN is an active plain member of the provider org AND an admin
    // of ORG_B. Eligibility facts come ONLY from the provider-org membership, so
    // their ORG_B admin role must not authorize → unauthorized, NOT ORG_ADMIN.
    const res = await approve(reviewId, {}, CROSS_ORG_ADMIN_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_NOT_ORG_AUTHORIZED");
  });

  it("(confused-deputy, TAR channel) a plain member with GLOBAL TAR can_admin_org cannot approve (REVIEWER_NOT_ORG_AUTHORIZED)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    // The global TAR can_admin_org flag must NOT elevate a plain provider-org
    // member — admin authority must be attributable to the provider org itself.
    const res = await approve(reviewId, {}, TAR_PLAIN_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("REVIEWER_NOT_ORG_AUTHORIZED");
  });

  it("an INACTIVE provider-org membership cannot approve (invisible → REVIEW_NOT_FOUND)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const res = await approve(reviewId, {}, INACTIVE_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("REVIEW_NOT_FOUND");
  });

  it("(personal DMW) org membership never authorizes a non-owner reviewer", async () => {
    // The personal-DMW owner opens a self-review on their own MEDICAL package.
    const r = (await createReview({ listing_id: PERSONAL_LISTING, intended_use: "ANALYTICS" }, PERSONAL_PROVIDER_TOKEN)).json() as {
      review: { review_id: string };
    };
    // An ORG_A admin cannot see or approve a personal-DMW review (no org to
    // delegate into) — org membership confers nothing here.
    const res = await approve(r.review.review_id, {}, ADMIN_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("REVIEW_NOT_FOUND");
    // The owner CAN self-review, but only for PROOF_ONLY (1297-A constraint).
    const ap = await approve(r.review.review_id, { approved_access_modes: ["PROOF_ONLY"] }, PERSONAL_PROVIDER_TOKEN);
    expect(ap.statusCode).toBe(200);
    expect((ap.json() as { review: { status: string } }).review.status).toBe("APPROVED");
  });

  it("an org admin CAN approve; approval is bound to the safe mode only", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    const res = await approve(reviewId, { approved_access_modes: ["PROOF_ONLY"] }, ADMIN_TOKEN);
    expect(res.statusCode).toBe(200);
    const rv = (res.json() as { review: Record<string, unknown> }).review;
    expect(rv.status).toBe("APPROVED");
    expect(rv.approved_access_modes).toEqual(["PROOF_ONLY"]);
    expect(rv.raw_body_allowed).toBe(false);
    expect(rv.training_allowed).toBe(false);
    expect(rv.commercial_use_allowed).toBe(false);
  });

  it("an org COMPLIANCE reviewer CAN approve, and the buyer then reads NO raw content", async () => {
    const { reviewId, listingId } = await pendingReview("PERSONALIZATION");
    const ap = await approve(reviewId, { approved_access_modes: ["PROOF_ONLY"] }, COMPLIANCE_TOKEN);
    expect(ap.statusCode).toBe(200);
    expect((ap.json() as { review: { status: string } }).review.status).toBe("APPROVED");

    const grant = await makeGrant(listingId, "PERSONALIZATION", BUYER_TOKEN);
    expect(grant.statusCode).toBe(201);
    const gid = (grant.json() as { grant: { grant_id: string } }).grant.grant_id;

    const rd = await read(gid, BUYER_TOKEN);
    expect(rd.statusCode).toBe(200);
    // No raw content / PII / vectors ever surface on the read.
    expect(rd.payload).not.toContain("payload_content");
    expect(rd.payload).not.toContain("storage_location");
    expect(rd.payload).not.toContain("content_hash");
    expect(rd.payload).not.toContain("embedding");
  });

  it("the buyer can still REVOKE an org-approved review (stop-use preserved)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    expect((await approve(reviewId, { approved_access_modes: ["PROOF_ONLY"] }, COMPLIANCE_TOKEN)).statusCode).toBe(200);
    const res = await revoke(reviewId, BUYER_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { review: { status: string } }).review.status).toBe("REVOKED");
  });

  it("an org reviewer can also revoke; a cross-tenant caller cannot (REVIEW_NOT_FOUND)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    expect((await approve(reviewId, { approved_access_modes: ["PROOF_ONLY"] }, ADMIN_TOKEN)).statusCode).toBe(200);
    expect((await revoke(reviewId, OUTSIDER_TOKEN)).statusCode).toBe(404);
    expect((await revoke(reviewId, COMPLIANCE_TOKEN)).statusCode).toBe(200);
  });

  it("every eligibility decision is audited (HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED)", async () => {
    const { reviewId } = await pendingReview("ANALYTICS");
    await approve(reviewId, {}, PLAIN_TOKEN); // DENIED eligibility
    await approve(reviewId, { approved_access_modes: ["PROOF_ONLY"] }, ADMIN_TOKEN); // SUCCESS eligibility
    // Both the SUCCESS + DENIED eligibility decisions were recorded.
    const all = await prisma.auditEvent.findMany({
      where: { event_type: "HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED" },
      orderBy: { timestamp: "desc" },
      take: 10,
    });
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((e) => e.outcome === "SUCCESS")).toBe(true);
    expect(all.some((e) => e.outcome === "DENIED")).toBe(true);
  });
});
