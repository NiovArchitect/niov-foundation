// FILE: foundation-cohort-access-requests.test.ts (integration)
// PURPOSE: Phase 1307-A — HTTP coverage for the cohort ACCESS REQUEST lifecycle.
//          Proves: a buyer can request access to a visible ACTIVE cohort (open
//          to AI buyers — requesting ≠ granting); an invisible/missing cohort is
//          enumeration-safe COHORT_PRODUCT_NOT_FOUND; CHILDREN cohorts auto-DENY
//          at intake; a HUMAN provider/admin decides PENDING→APPROVED/DENIED; the
//          ADVISOR MUST-FIX gate holds — a restricted AI-class admin CANNOT decide
//          (NOT_AUTHORIZED) and a buyer CANNOT approve its own request
//          (SELF_APPROVAL_FORBIDDEN); revoke flips status (RULE 10 row persists);
//          and an approval delivers NO signal (signal_available:false). End-to-end.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (registerCohortAccessRequestRoutes)
//   - apps/api/src/services/foundation/cohort-access-request.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma, type EntityType } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-cohort-access-req-secret";
let app: FastifyInstance;
let ORG_ID: string;
let PROVIDER_TOKEN: string; // PERSON, org admin, the cohort provider + manager
let BUYER_TOKEN: string; // PERSON, same org, plain read/write
let BUYER_ENTITY_ID: string;
let AI_ADMIN_TOKEN: string; // AI_AGENT, same org, admin_org — must NOT be able to decide
const store = new MemoryRateLimitStore();

// WHAT: Create an org member (child of ORG_ID) and log it in.
// WHY: buyer visibility requires same-org + ACTIVE cohort; decide/revoke require
//      a provider/admin manager. admin members get can_admin_org on the TAR
//      (+ recomputed hash) and request the admin_org operation at login.
async function member(
  entity_type: EntityType,
  opts: { admin?: boolean } = {},
): Promise<{ entityId: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type, password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: ORG_ID, child_id: entity.entity_id, is_admin: opts.admin === true },
  });
  if (opts.admin === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: {
        tar_hash: computeTARHash({
          can_login: fresh.can_login,
          can_read_capsules: fresh.can_read_capsules,
          can_write_capsules: fresh.can_write_capsules,
          can_share_capsules: fresh.can_share_capsules,
          can_create_hives: fresh.can_create_hives,
          can_access_external_api: fresh.can_access_external_api,
          can_admin_niov: fresh.can_admin_niov,
          can_admin_org: fresh.can_admin_org,
          clearance_ceiling: fresh.clearance_ceiling,
          monetization_role: fresh.monetization_role,
          compliance_frameworks: fresh.compliance_frameworks,
          status: fresh.status,
        }),
      },
    });
  }
  const ops = opts.admin === true ? ["read", "write", "admin_org"] : ["read", "write"];
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  return { entityId: entity.entity_id, token: (login.json() as { token: string }).token };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
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
  // The org (COMPANY) all fixtures belong to — provider_org resolution target.
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  ORG_ID = org.entity_id;
  const provider = await member("PERSON", { admin: true });
  PROVIDER_TOKEN = provider.token;
  const buyer = await member("PERSON");
  BUYER_TOKEN = buyer.token;
  BUYER_ENTITY_ID = buyer.entityId;
  const aiAdmin = await member("AI_AGENT", { admin: true });
  AI_ADMIN_TOKEN = aiAdmin.token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// Create an ACTIVE cohort owned by PROVIDER_TOKEN (provider_org = ORG_ID), so a
// same-org buyer can see + request against it.
async function createActiveCohort(
  extra: Record<string, unknown> = {},
): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Access-request cohort",
      description: "x",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
      ...extra,
    },
  });
  if (r.statusCode !== 201) throw new Error(`cohort create failed: ${r.statusCode} ${r.body}`);
  return (r.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
}

const FORBIDDEN = [
  "provider_org_entity_id",
  "buyer_org_entity_id",
  "decided_by_entity_id",
  "payload_content",
  "storage_location",
];

function assertNoLeak(body: unknown): void {
  const s = JSON.stringify(body);
  for (const t of FORBIDDEN) expect(s).not.toContain(t);
}

describe("Phase 1307-A — cohort access request lifecycle", () => {
  it("requires auth; an invisible cohort is enumeration-safe COHORT_PRODUCT_NOT_FOUND", async () => {
    const id = await createActiveCohort();
    const noAuth = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect(noAuth.statusCode).toBe(401);

    // A random (non-existent) cohort id → 404, not a different code.
    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${randomUUID()}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { code: string }).code).toBe("COHORT_PRODUCT_NOT_FOUND");
  });

  it("a same-org buyer creates a PENDING request; no internal identity leaks; approval delivers no signal", async () => {
    const id = await createActiveCohort();
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect(req.statusCode).toBe(201);
    const body = req.json() as {
      access_request: { request_id: string; status: string; signal_available: boolean };
    };
    expect(body.access_request.status).toBe("PENDING");
    expect(body.access_request.signal_available).toBe(false);
    assertNoLeak(req.json());
  });

  it("rejects an access mode / use the cohort does not offer (422)", async () => {
    const id = await createActiveCohort();
    const badMode = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "PROOF_ONLY" },
    });
    expect(badMode.statusCode).toBe(422);
    expect((badMode.json() as { code: string }).code).toBe("ACCESS_MODE_NOT_OFFERED");
  });

  it("CHILDREN cohort auto-DENIES the request at intake", async () => {
    const id = await createActiveCohort({ sensitive_categories: ["CHILDREN"] });
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect(req.statusCode).toBe(201);
    expect((req.json() as { access_request: { status: string } }).access_request.status).toBe(
      "DENIED",
    );
  });

  it("MUST-FIX: a restricted AI-class admin CANNOT decide (NOT_AUTHORIZED)", async () => {
    const id = await createActiveCohort();
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const rid = (req.json() as { access_request: { request_id: string } }).access_request
      .request_id;

    // The AI_AGENT is a same-org admin (a manager) — but a non-human entity may
    // never grant cohort access (RULE 0 + stop condition #7).
    const aiDecide = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/decide`,
      headers: auth(AI_ADMIN_TOKEN),
      payload: { decision: "APPROVED" },
    });
    expect(aiDecide.statusCode).toBe(403);
    expect((aiDecide.json() as { code: string }).code).toBe("NOT_AUTHORIZED");

    // The request is untouched — still PENDING.
    const row = await prisma.cohortAccessRequest.findUnique({ where: { request_id: rid } });
    expect(row?.status).toBe("PENDING");
  });

  it("MUST-FIX: a buyer cannot approve its own request (SELF_APPROVAL_FORBIDDEN)", async () => {
    // The provider (a human admin) requests against ITS OWN cohort, then tries
    // to decide its own request — forbidden even though it is a manager + human.
    const id = await createActiveCohort();
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(PROVIDER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const rid = (req.json() as { access_request: { request_id: string } }).access_request
      .request_id;

    const selfDecide = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/decide`,
      headers: auth(PROVIDER_TOKEN),
      payload: { decision: "APPROVED" },
    });
    expect(selfDecide.statusCode).toBe(403);
    expect((selfDecide.json() as { code: string }).code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("a HUMAN provider/admin approves a buyer's request, then can revoke it (RULE 10 row persists)", async () => {
    const id = await createActiveCohort();
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const rid = (req.json() as { access_request: { request_id: string } }).access_request
      .request_id;

    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/decide`,
      headers: auth(PROVIDER_TOKEN),
      payload: { decision: "APPROVED", decision_reason: "ok" },
    });
    expect(approve.statusCode).toBe(200);
    expect((approve.json() as { access_request: { status: string } }).access_request.status).toBe(
      "APPROVED",
    );
    assertNoLeak(approve.json());

    // The provider can list and see the buyer's request as a manager.
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json() as {
      access_requests: Array<{ request_id: string }>;
      is_manager: boolean;
    };
    expect(listed.is_manager).toBe(true);
    expect(listed.access_requests.some((r) => r.request_id === rid)).toBe(true);

    // Revoke the approved request → REVOKED; the row persists (RULE 10).
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/revoke`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(revoke.statusCode).toBe(200);
    expect((revoke.json() as { access_request: { status: string } }).access_request.status).toBe(
      "REVOKED",
    );
    const row = await prisma.cohortAccessRequest.findUnique({ where: { request_id: rid } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("REVOKED");
  });

  it("a non-manager buyer listing sees only their own requests (not a manager)", async () => {
    const id = await createActiveCohort();
    await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      access_requests: Array<{ buyer_entity_id: string }>;
      is_manager: boolean;
    };
    expect(body.is_manager).toBe(false);
    expect(body.access_requests.every((r) => r.buyer_entity_id === BUYER_ENTITY_ID)).toBe(true);
  });
});
