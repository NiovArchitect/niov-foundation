// FILE: foundation-cohort-metering.test.ts (integration)
// PURPOSE: Phase 1309-A — HTTP coverage for cohort usage metering + mock
//          economics. Proves end-to-end: the metering surface aggregates the
//          REAL 1308-A delivery audit events (a suppressed delivery, then a
//          delivered one, then a denied attempt all show in the counts), the
//          mock economics are honestly labelled (is_mock / MOCK_ONLY / USDC_MOCK)
//          and bill one unit per DELIVERED delivery × the advisory unit price;
//          metering is provider/admin-only (a buyer gets enumeration-safe
//          COHORT_PRODUCT_NOT_FOUND); and the response never leaks identities or
//          the exact eligible-contributor count.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (registerCohortMeteringRoutes)
//   - apps/api/src/services/foundation/cohort-metering.service.ts

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

const TEST_JWT_SECRET = "foundation-cohort-metering-secret";
let app: FastifyInstance;
let ORG_ID: string;
let PROVIDER_TOKEN: string;
let BUYER_TOKEN: string;
const store = new MemoryRateLimitStore();

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
  const org = await createEntity(makeEntityInput({ entity_type: "COMPANY" }));
  ORG_ID = org.entity_id;
  PROVIDER_TOKEN = (await member("PERSON", { admin: true })).token;
  BUYER_TOKEN = (await member("PERSON")).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function createPricedCohort(unitPriceUsd: number): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Metering cohort",
      description: "x",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
      metering_unit: "delivery",
      pricing_model: { unit_price_usd: unitPriceUsd },
    },
  });
  if (r.statusCode !== 201) throw new Error(`cohort create failed: ${r.statusCode} ${r.body}`);
  return (r.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
}

async function seedEligible(cohortProductId: string, n: number): Promise<void> {
  if (n === 0) return;
  await prisma.cohortContribution.createMany({
    data: Array.from({ length: n }, () => ({
      cohort_product_id: cohortProductId,
      contributor_entity_id: randomUUID(),
      contribution_scope: "PREFERENCE",
    })),
  });
}

async function approvedRequest(cohortId: string): Promise<string> {
  const req = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${cohortId}/access-requests`,
    headers: auth(BUYER_TOKEN),
    payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
  });
  const rid = (req.json() as { access_request: { request_id: string } }).access_request.request_id;
  const decide = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${cohortId}/access-requests/${rid}/decide`,
    headers: auth(PROVIDER_TOKEN),
    payload: { decision: "APPROVED" },
  });
  if (decide.statusCode !== 200) throw new Error(`approve failed: ${decide.statusCode}`);
  return rid;
}

async function deliver(cohortId: string, rid: string, token = BUYER_TOKEN): Promise<number> {
  const r = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${cohortId}/access-requests/${rid}/deliver`,
    headers: auth(token),
  });
  return r.statusCode;
}

describe("Phase 1309-A — cohort usage metering + mock economics", () => {
  it("aggregates real delivery audit events (suppressed + delivered + denied) with honest mock economics", async () => {
    const id = await createPricedCohort(2.5);
    await seedEligible(id, 3); // below the floor of 50

    // Attempt 1 — APPROVED request but below floor → SUPPRESSED audit.
    const rid = await approvedRequest(id);
    expect(await deliver(id, rid)).toBe(200);

    // Attempt 2 — top up to 50, deliver the same request again → DELIVERED audit.
    await seedEligible(id, 47);
    expect(await deliver(id, rid)).toBe(200);

    // Attempt 3 — a PENDING (unapproved) request → DENIED audit (403).
    const pendingReq = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const pid = (pendingReq.json() as { access_request: { request_id: string } }).access_request
      .request_id;
    expect(await deliver(id, pid)).toBe(403);

    // Provider meters the cohort.
    const usage = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/usage`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(usage.statusCode).toBe(200);
    const u = usage.json() as {
      usage: {
        total_attempts: number;
        delivered_count: number;
        suppressed_count: number;
        denied_count: number;
        delivered_by_access_mode: Record<string, number>;
        mock_economics: {
          is_mock: boolean;
          settlement_mode: string;
          asset: string;
          unit_price_usd: number;
          billable_units: number;
          estimated_amount_usd: number;
        };
      };
    };
    expect(u.usage.delivered_count).toBe(1);
    expect(u.usage.suppressed_count).toBe(1);
    expect(u.usage.denied_count).toBe(1);
    expect(u.usage.total_attempts).toBe(3);
    expect(u.usage.delivered_by_access_mode.AGGREGATED_SIGNAL).toBe(1);
    // Mock economics: 1 delivered × $2.50.
    expect(u.usage.mock_economics.is_mock).toBe(true);
    expect(u.usage.mock_economics.settlement_mode).toBe("MOCK_ONLY");
    expect(u.usage.mock_economics.asset).toBe("USDC_MOCK");
    expect(u.usage.mock_economics.unit_price_usd).toBe(2.5);
    expect(u.usage.mock_economics.billable_units).toBe(1);
    expect(u.usage.mock_economics.estimated_amount_usd).toBe(2.5);

    // No identities, no exact eligible count leak.
    const s = JSON.stringify(usage.json());
    for (const t of ["contributor_entity_id", "buyer_entity_id", "eligible_count", "wallet_id"])
      expect(s).not.toContain(t);
  });

  it("metering is provider/admin-only — a buyer gets enumeration-safe COHORT_PRODUCT_NOT_FOUND", async () => {
    const id = await createPricedCohort(1);
    const noAuth = await app.inject({ method: "GET", url: `/api/v1/foundation/cohorts/${id}/usage` });
    expect(noAuth.statusCode).toBe(401);

    const buyer = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/usage`,
      headers: auth(BUYER_TOKEN),
    });
    expect(buyer.statusCode).toBe(404);
    expect((buyer.json() as { code: string }).code).toBe("COHORT_PRODUCT_NOT_FOUND");
  });

  it("a cohort with no deliveries meters zero with a zero mock estimate", async () => {
    const id = await createPricedCohort(5);
    const usage = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/usage`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(usage.statusCode).toBe(200);
    const u = usage.json() as {
      usage: { total_attempts: number; delivered_count: number; mock_economics: { estimated_amount_usd: number } };
    };
    expect(u.usage.total_attempts).toBe(0);
    expect(u.usage.delivered_count).toBe(0);
    expect(u.usage.mock_economics.estimated_amount_usd).toBe(0);
  });
});
