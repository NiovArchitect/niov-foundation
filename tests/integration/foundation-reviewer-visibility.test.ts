// FILE: tests/integration/foundation-reviewer-visibility.test.ts (integration)
// PURPOSE: Phase 1299-B — proves end-to-end (via buildApp) the governed
//          reviewer VISIBILITY + AUDIT PROJECTION surface on top of 1299-A:
//          - provider/buyer list their OWN reviews (scope=mine);
//          - an authorized org admin / compliance reviewer lists PENDING
//            org-reviewable reviews (scope=org_reviewable) + org history;
//          - a random org member / non-human / cross-tenant caller gets an
//            EMPTY org list (never another org's data);
//          - a buyer never sees their OWN purchase in org_reviewable;
//          - personal-DMW reviews never appear in an org scope and their audit
//            is invisible to org reviewers;
//          - the audit projection returns SAFE lifecycle + eligibility-decision
//            events (no raw content / payload / storage_location / embedding);
//          - VISIBILITY IS NOT APPROVAL AUTHORITY (seeing a review does not let
//            an unauthorized caller approve it);
//          - an authorized reviewer can still approve after viewing.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET reviews?scope=…, /:id/audit)
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

const TEST_JWT_SECRET = "foundation-reviewer-visibility-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN = "";
let PROVIDER_ID = "";
let BUYER_TOKEN = "";
let BUYER_ID = "";
let ADMIN_TOKEN = "";
let COMPLIANCE_TOKEN = "";
let PLAIN_TOKEN = "";
let AI_ADMIN_TOKEN = "";
let OUTSIDER_TOKEN = "";
let PERSONAL_PROVIDER_TOKEN = "";
let PERSONAL_REVIEW_ID = "";
const store = new MemoryRateLimitStore();

async function member(
  orgId: string | null,
  ops: string[],
  opts: { type?: EntityType; role?: string; isAdmin?: boolean } = {},
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
        is_active: true,
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
function listReviews(scope: string | null, token: string) {
  const url =
    scope === null
      ? "/api/v1/foundation/high-sensitivity/reviews"
      : `/api/v1/foundation/high-sensitivity/reviews?scope=${scope}`;
  return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
}
function getAudit(reviewId: string, token: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/foundation/high-sensitivity/reviews/${reviewId}/audit`,
    headers: { authorization: `Bearer ${token}` },
  });
}

type ListBody = { reviews: Array<{ review_id: string }>; summary?: Record<string, number> };

// Open a fresh PENDING MEDICAL review (buyer on the provider's package).
async function pendingReview(intendedUse: string): Promise<string> {
  const listingId = await makePackage(PROVIDER_TOKEN, {
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["MEDICAL"],
    access_mode: "SAFE_PROJECTION",
  });
  const r = (await createReview({ listing_id: listingId, intended_use: intendedUse }, BUYER_TOKEN)).json() as {
    review: { review_id: string };
  };
  return r.review.review_id;
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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rvA_${randomUUID()}`, email: `${TEST_PREFIX}rvA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rvB_${randomUUID()}`, email: `${TEST_PREFIX}rvB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const prov = await member(orgA.entity_id, ["read", "write"]); PROVIDER_TOKEN = prov.token; PROVIDER_ID = prov.id;
  const buyer = await member(orgA.entity_id, ["read", "write"]); BUYER_TOKEN = buyer.token; BUYER_ID = buyer.id; // plain member
  ADMIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { isAdmin: true })).token;
  COMPLIANCE_TOKEN = (await member(orgA.entity_id, ["read", "write"], { role: "Compliance Officer" })).token;
  PLAIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { role: "Software Engineer" })).token;
  AI_ADMIN_TOKEN = (await member(orgA.entity_id, ["read", "write"], { type: "AI_AGENT", isAdmin: true })).token;
  await resetRateLimits(store); // login is IP-rate-limited (10/min)
  OUTSIDER_TOKEN = (await member(orgB.entity_id, ["read", "write"], { isAdmin: true })).token;
  const personalProv = await member(null, ["read", "write"]); PERSONAL_PROVIDER_TOKEN = personalProv.token;
  await addCapsule(PROVIDER_ID);
  await addCapsule(personalProv.id);

  // A personal-DMW MEDICAL review (owner self-review) — must stay out of org scopes.
  const personalListing = await makePackage(PERSONAL_PROVIDER_TOKEN, {
    sensitivity_class: "HIGH_SENSITIVITY",
    sensitive_categories: ["MEDICAL"],
    access_mode: "SAFE_PROJECTION",
    status: "DRAFT",
  });
  PERSONAL_REVIEW_ID = ((await createReview({ listing_id: personalListing, intended_use: "ANALYTICS" }, PERSONAL_PROVIDER_TOKEN)).json() as { review: { review_id: string } }).review.review_id;
});

afterAll(async () => { await app.close(); await cleanupTestData(); await prisma.$disconnect(); });
withCleanRateLimits(store);

describe("Foundation reviewer visibility + audit projection (1299-B)", () => {
  it("provider and buyer each see their own reviews (scope=mine)", async () => {
    await pendingReview("ANALYTICS");
    const prov = await listReviews("mine", PROVIDER_TOKEN);
    const buyer = await listReviews(null, BUYER_TOKEN); // default scope = mine
    expect(prov.statusCode).toBe(200);
    expect(buyer.statusCode).toBe(200);
    expect((prov.json() as ListBody).reviews.length).toBeGreaterThan(0);
    expect((buyer.json() as ListBody).reviews.length).toBeGreaterThan(0);
  });

  it("an org admin lists PENDING org-reviewable reviews + a summary", async () => {
    const rid = await pendingReview("PERSONALIZATION");
    const res = await listReviews("org_reviewable", ADMIN_TOKEN);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ListBody;
    expect(body.reviews.some((r) => r.review_id === rid)).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.summary!.pending_review_count).toBeGreaterThan(0);
  });

  it("an org compliance reviewer also lists org-reviewable reviews", async () => {
    const rid = await pendingReview("ANALYTICS");
    const res = await listReviews("org_reviewable", COMPLIANCE_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ListBody).reviews.some((r) => r.review_id === rid)).toBe(true);
  });

  it("a random org member gets an EMPTY org-reviewable list", async () => {
    await pendingReview("ANALYTICS");
    const res = await listReviews("org_reviewable", PLAIN_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ListBody).reviews).toEqual([]);
  });

  it("a non-human org admin gets an EMPTY org-reviewable list", async () => {
    await pendingReview("ANALYTICS");
    const res = await listReviews("org_reviewable", AI_ADMIN_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ListBody).reviews).toEqual([]);
  });

  it("a cross-tenant reviewer gets an EMPTY org-reviewable list (no other org's data)", async () => {
    await pendingReview("ANALYTICS");
    const res = await listReviews("org_reviewable", OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ListBody).reviews).toEqual([]);
  });

  it("the buyer never sees their OWN purchase in org_reviewable", async () => {
    const rid = await pendingReview("ANALYTICS");
    // BUYER is a plain member → not an org reviewer at all → empty (and even if
    // they were, their own purchase is excluded from org_reviewable).
    const res = await listReviews("org_reviewable", BUYER_TOKEN);
    expect((res.json() as ListBody).reviews.some((r) => r.review_id === rid)).toBe(false);
  });

  it("org_history surfaces lifecycle (incl. APPROVED) for an authorized reviewer", async () => {
    const rid = await pendingReview("PERSONALIZATION");
    expect((await approve(rid, { approved_access_modes: ["PROOF_ONLY"] }, ADMIN_TOKEN)).statusCode).toBe(200);
    const res = await listReviews("org_history", COMPLIANCE_TOKEN);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ListBody;
    expect(body.reviews.some((r) => r.review_id === rid)).toBe(true);
    expect(body.summary!.approved_count).toBeGreaterThan(0);
  });

  it("a personal-DMW review never appears in an org scope", async () => {
    const admin = await listReviews("org_history", ADMIN_TOKEN);
    expect((admin.json() as ListBody).reviews.some((r) => r.review_id === PERSONAL_REVIEW_ID)).toBe(false);
  });

  it("a personal-DMW review's audit is invisible to an org reviewer", async () => {
    const res = await getAudit(PERSONAL_REVIEW_ID, ADMIN_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("REVIEW_NOT_FOUND");
  });

  it("an invalid scope is rejected (422 INVALID_SCOPE)", async () => {
    const res = await listReviews("everything", ADMIN_TOKEN);
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("INVALID_SCOPE");
  });

  it("the audit projection returns SAFE lifecycle + eligibility events, no raw content", async () => {
    const rid = await pendingReview("ANALYTICS");
    await approve(rid, {}, PLAIN_TOKEN); // DENIED eligibility (recorded)
    expect((await approve(rid, { approved_access_modes: ["PROOF_ONLY"] }, COMPLIANCE_TOKEN)).statusCode).toBe(200);

    const res = await getAudit(rid, ADMIN_TOKEN);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      review: { review_id: string };
      audit_events: Array<{ event_type: string; outcome: string; reviewer_scope: string | null; reviewer_reason_codes: string[] }>;
    };
    expect(body.review.review_id).toBe(rid);
    const types = body.audit_events.map((e) => e.event_type);
    expect(types).toContain("HIGH_SENSITIVITY_REVIEW_CREATED");
    expect(types).toContain("HIGH_SENSITIVITY_REVIEW_APPROVED");
    expect(types).toContain("HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED");
    // Eligibility decision outcomes are projected safely (SUCCESS + DENIED both present).
    const elig = body.audit_events.filter((e) => e.event_type === "HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED");
    expect(elig.some((e) => e.outcome === "SUCCESS")).toBe(true);
    expect(elig.some((e) => e.outcome === "DENIED")).toBe(true);
    // No raw content / payload / storage / embedding / hash leaks at the wire.
    for (const forbidden of ["payload_content", "storage_location", "embedding", "content_hash", "password", "justification"])
      expect(res.payload).not.toContain(forbidden);
  });

  it("the buyer can read the audit for their own request", async () => {
    const rid = await pendingReview("ANALYTICS");
    const res = await getAudit(rid, BUYER_TOKEN);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { review: { review_id: string } }).review.review_id).toBe(rid);
  });

  it("VISIBILITY IS NOT APPROVAL AUTHORITY: seeing a review never lets an unauthorized caller approve", async () => {
    const rid = await pendingReview("ANALYTICS");
    // PLAIN can read the audit only as a non-party? No — plain is not a party and
    // not authorized → audit invisible. Prove the approval gate independently:
    const ap = await approve(rid, {}, PLAIN_TOKEN);
    expect(ap.statusCode).toBe(403);
    expect((ap.json() as { code: string }).code).toBe("REVIEWER_NOT_ORG_AUTHORIZED");
  });

  it("an authorized reviewer can still approve after viewing", async () => {
    const rid = await pendingReview("PERSONALIZATION");
    expect((await getAudit(rid, ADMIN_TOKEN)).statusCode).toBe(200);
    expect((await approve(rid, { approved_access_modes: ["PROOF_ONLY"] }, ADMIN_TOKEN)).statusCode).toBe(200);
  });
});
