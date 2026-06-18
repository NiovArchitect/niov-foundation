// FILE: foundation-cohort-delivery.test.ts (integration)
// PURPOSE: Phase 1308-A — HTTP coverage for the cohort proof + safe-signal
//          delivery gate. Proves end-to-end: a buyer with an APPROVED access
//          request gets a SUPPRESSED result below the minimum_cohort_size floor
//          and a DELIVERED proof at/above it (threshold_enforced flips true); a
//          PENDING request → DELIVERY_NOT_AUTHORIZED; an expired window →
//          REQUEST_EXPIRED; a CHILDREN cohort is hard re-blocked even with an
//          APPROVED request (defense-in-depth); a request owned by another buyer
//          is enumeration-safe ACCESS_REQUEST_NOT_FOUND; and the SAFE projection
//          NEVER leaks contributor identities, raw bodies, or the exact count.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (registerCohortDeliveryRoutes)
//   - apps/api/src/services/foundation/cohort-delivery.service.ts

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

const TEST_JWT_SECRET = "foundation-cohort-delivery-secret";
let app: FastifyInstance;
let ORG_ID: string;
let PROVIDER_TOKEN: string; // PERSON, org admin, cohort provider + human decider
let BUYER_TOKEN: string; // PERSON, same org
let OTHER_BUYER_TOKEN: string; // PERSON, same org — for the cross-owner check
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
  OTHER_BUYER_TOKEN = (await member("PERSON")).token;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function createActiveCohort(extra: Record<string, unknown> = {}): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Delivery cohort",
      description: "x",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL", "PROOF_ONLY"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
      ...extra,
    },
  });
  if (r.statusCode !== 201) throw new Error(`cohort create failed: ${r.statusCode} ${r.body}`);
  return (r.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
}

// Seed N eligible contributions directly (no consent basis → eligible by the
// pure predicate; random contributor UUIDs — no FK on contributor_entity_id).
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

// Buyer creates a request; provider (human) approves it. Returns request id.
async function approvedRequest(
  cohortId: string,
  buyerToken: string,
  mode = "AGGREGATED_SIGNAL",
): Promise<string> {
  const req = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${cohortId}/access-requests`,
    headers: auth(buyerToken),
    payload: { intended_use: "ANALYTICS", requested_access_mode: mode },
  });
  const rid = (req.json() as { access_request: { request_id: string } }).access_request.request_id;
  const decide = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${cohortId}/access-requests/${rid}/decide`,
    headers: auth(PROVIDER_TOKEN),
    payload: { decision: "APPROVED" },
  });
  if (decide.statusCode !== 200) throw new Error(`approve failed: ${decide.statusCode} ${decide.body}`);
  return rid;
}

const FORBIDDEN = [
  "contributor_entity_id",
  "wallet_id",
  "buyer_org_entity_id",
  "provider_org_entity_id",
  "payload_content",
  "storage_location",
  "eligible_count",
];

function assertNoLeak(body: unknown): void {
  const s = JSON.stringify(body);
  for (const t of FORBIDDEN) expect(s).not.toContain(t);
}

describe("Phase 1308-A — cohort proof + safe-signal delivery", () => {
  it("requires auth; a PENDING (unapproved) request → DELIVERY_NOT_AUTHORIZED", async () => {
    const id = await createActiveCohort();
    const req = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    const rid = (req.json() as { access_request: { request_id: string } }).access_request.request_id;

    const noAuth = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
    });
    expect(noAuth.statusCode).toBe(401);

    const pending = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(BUYER_TOKEN),
    });
    expect(pending.statusCode).toBe(403);
    expect((pending.json() as { code: string }).code).toBe("DELIVERY_NOT_AUTHORIZED");
  });

  it("below the minimum_cohort_size floor → honest SUPPRESSION (no proof, no signal)", async () => {
    const id = await createActiveCohort();
    await seedEligible(id, 3); // floor is 50
    const rid = await approvedRequest(id, BUYER_TOKEN);
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(BUYER_TOKEN),
    });
    expect(r.statusCode).toBe(200);
    const d = r.json() as {
      delivery: {
        threshold_enforced: boolean;
        threshold_met: boolean;
        gate_passed: boolean;
        suppressed_reason: string | null;
        signal_available: boolean;
        proof: unknown;
        signal: unknown;
      };
    };
    expect(d.delivery.threshold_enforced).toBe(true);
    expect(d.delivery.threshold_met).toBe(false);
    expect(d.delivery.gate_passed).toBe(false);
    expect(d.delivery.suppressed_reason).toBe("MINIMUM_COHORT_SIZE_NOT_MET");
    expect(d.delivery.signal_available).toBe(false);
    expect(d.delivery.proof).toBeNull();
    expect(d.delivery.signal).toBeNull();
    assertNoLeak(r.json());
  });

  it("at/above the floor → DELIVERED proof; threshold_enforced flips true; no numeric aggregate; no leak", async () => {
    const id = await createActiveCohort();
    await seedEligible(id, 50); // meets the floor exactly
    const rid = await approvedRequest(id, BUYER_TOKEN);
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(BUYER_TOKEN),
    });
    expect(r.statusCode).toBe(200);
    const d = r.json() as {
      delivery: {
        threshold_enforced: boolean;
        threshold_met: boolean;
        gate_passed: boolean;
        signal_available: boolean;
        privacy_method: string;
        proof: { proof_basis: string } | null;
        signal: { kind: string; numeric_aggregate_available: boolean } | null;
      };
    };
    expect(d.delivery.threshold_enforced).toBe(true);
    expect(d.delivery.threshold_met).toBe(true);
    expect(d.delivery.gate_passed).toBe(true);
    expect(d.delivery.signal_available).toBe(false);
    expect(d.delivery.privacy_method).toBe("MINIMUM_COHORT_SIZE_THRESHOLD_ONLY");
    expect(d.delivery.proof?.proof_basis).toBe("ELIGIBLE_CONTRIBUTOR_THRESHOLD_MET");
    expect(d.delivery.signal?.kind).toBe("AGGREGATED_SIGNAL");
    expect(d.delivery.signal?.numeric_aggregate_available).toBe(false);
    assertNoLeak(r.json());
  });

  it("an expired access window → REQUEST_EXPIRED (audited DENIED)", async () => {
    const id = await createActiveCohort();
    await seedEligible(id, 50);
    const rid = await approvedRequest(id, BUYER_TOKEN);
    // Force the window into the past (decide() forbids past expiry via the API).
    await prisma.cohortAccessRequest.update({
      where: { request_id: rid },
      data: { expires_at: new Date("2026-01-01T00:00:00.000Z") },
    });
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(BUYER_TOKEN),
    });
    expect(r.statusCode).toBe(409);
    expect((r.json() as { code: string }).code).toBe("REQUEST_EXPIRED");
  });

  it("CHILDREN cohort is hard re-blocked at delivery even with an APPROVED request (defense-in-depth)", async () => {
    const id = await createActiveCohort();
    await seedEligible(id, 50);
    const rid = await approvedRequest(id, BUYER_TOKEN);
    // Flip the cohort to CHILDREN AFTER approval to exercise the delivery-tier
    // re-block (1307-A intake would normally auto-DENY a CHILDREN request).
    await prisma.cohortDataProduct.update({
      where: { cohort_product_id: id },
      data: { sensitive_categories: ["CHILDREN"] },
    });
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(BUYER_TOKEN),
    });
    expect(r.statusCode).toBe(403);
    expect((r.json() as { code: string }).code).toBe("CHILDREN_DATA_BLOCKED");
  });

  it("a request owned by another buyer is enumeration-safe ACCESS_REQUEST_NOT_FOUND", async () => {
    const id = await createActiveCohort();
    await seedEligible(id, 50);
    const rid = await approvedRequest(id, BUYER_TOKEN);
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests/${rid}/deliver`,
      headers: auth(OTHER_BUYER_TOKEN),
    });
    expect(r.statusCode).toBe(404);
    expect((r.json() as { code: string }).code).toBe("ACCESS_REQUEST_NOT_FOUND");
  });
});
