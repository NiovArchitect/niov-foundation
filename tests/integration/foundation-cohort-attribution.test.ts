// FILE: foundation-cohort-attribution.test.ts (integration)
// PURPOSE: F-1323 — the Contribution Attribution Ledger. Proves the derived,
//          role-scoped attribution view: deterministic equal-weight v1; provider
//          sees all units WITH contributor identities; a contributor sees ONLY
//          their own unit; a buyer sees aggregate totals with NO units and NO
//          identities; a cross-tenant stranger gets COHORT_PRODUCT_NOT_FOUND;
//          withdrawal zeroes a unit's participation; mock-only economics; no raw
//          content / wallet / PII leakage.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (GET /cohorts/:id/attribution)
//   - apps/api/src/services/foundation/cohort-attribution.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-attribution-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let C1_TOKEN: string;
let C2_TOKEN: string;
let BUYER_TOKEN: string;
let STRANGER_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
  });
  return (login.json() as { token: string }).token;
}
function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

interface AttributionUnit {
  contribution_id: string;
  contributor_entity_id: string | null;
  contribution_status: string;
  weight: number;
  usage_touches: number;
  value_participation: number;
  proof_reference: string;
  withdrawn_at: string | null;
}
interface AttributionBody {
  ok: true;
  attribution: {
    viewer_role: string;
    total_contributors: number | null;
    active_contributors: number | null;
    count_suppressed: boolean;
    suppression_reason: string | null;
    total_weight: number;
    metered_usage_total: number;
    mock_value_total: number;
    is_mock: boolean;
    settlement_mode: string;
    attribution_units: AttributionUnit[];
    proof_reference: string;
  };
}

let COHORT_ID: string;
let C1_ENTITY: string;

async function attribution(token: string): Promise<{ status: number; body: AttributionBody; raw: string }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/foundation/cohorts/${COHORT_ID}/attribution`,
    headers: auth(token),
  });
  return { status: res.statusCode, body: res.json() as AttributionBody, raw: res.payload };
}

const FORBIDDEN = ["wallet_id", "payload_content", "payload_summary", "storage_location", "content_hash"];

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
  const orgA = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}attrA_${randomUUID()}`,
    email: `${TEST_PREFIX}attrA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}attrB_${randomUUID()}`,
    email: `${TEST_PREFIX}attrB_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  C1_TOKEN = await member(orgA.entity_id);
  C2_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);

  // Provider registers an ACTIVE cohort.
  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Attribution cohort",
      description: "d",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
    },
  });
  COHORT_ID = (reg.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;

  // Two contributors join.
  for (const t of [C1_TOKEN, C2_TOKEN]) {
    const j = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${COHORT_ID}/join`,
      headers: auth(t),
      payload: { contribution_scope: "PREFERENCE" },
    });
    if (![200, 201].includes(j.statusCode)) throw new Error(`join failed: ${j.statusCode} ${j.body}`);
  }
  // The buyer makes an access request (a real buyer relationship).
  await app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${COHORT_ID}/access-requests`,
    headers: auth(BUYER_TOKEN),
    payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
  });
  // Resolve C1's entity id for the contributor-redaction assertions.
  const c1 = await attribution(C1_TOKEN);
  C1_ENTITY = c1.body.attribution.attribution_units[0]?.contributor_entity_id ?? "";
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1323 — Contribution Attribution Ledger", () => {
  it("provider sees ALL units WITH identities + EXACT counts (never suppressed); equal-weight v1", async () => {
    const { status, body, raw } = await attribution(PROVIDER_TOKEN);
    expect(status).toBe(200);
    expect(body.attribution.viewer_role).toBe("provider");
    // Provider is never k-suppressed even below the floor (default min 50, 2 active).
    expect(body.attribution.active_contributors).toBe(2);
    expect(body.attribution.count_suppressed).toBe(false);
    expect(body.attribution.total_weight).toBe(1.0);
    expect(body.attribution.is_mock).toBe(true);
    expect(body.attribution.settlement_mode).toBe("MOCK_ONLY");
    expect(body.attribution.attribution_units.length).toBe(2);
    for (const u of body.attribution.attribution_units) {
      expect(u.contributor_entity_id).not.toBeNull();
      expect(u.weight).toBe(0.5);
      expect(u.proof_reference.length).toBeGreaterThan(0);
    }
    for (const t of FORBIDDEN) expect(raw).not.toContain(t);
  });

  it("a contributor below the k-floor sees suppressed counts but still their OWN unit", async () => {
    const { status, body } = await attribution(C1_TOKEN);
    expect(status).toBe(200);
    expect(body.attribution.viewer_role).toBe("contributor");
    // Below the default k-floor (50) with 2 active → counts suppressed.
    expect(body.attribution.active_contributors).toBeNull();
    expect(body.attribution.total_contributors).toBeNull();
    expect(body.attribution.count_suppressed).toBe(true);
    expect(body.attribution.suppression_reason).toBe("BELOW_K_ANONYMITY_THRESHOLD");
    // But the caller's OWN unit (self-visibility) is still returned.
    expect(body.attribution.attribution_units.length).toBe(1);
    expect(body.attribution.attribution_units[0]?.contributor_entity_id).toBe(C1_ENTITY);
  });

  it("a contributor never sees another contributor's identity", async () => {
    const { body } = await attribution(C2_TOKEN);
    expect(body.attribution.attribution_units.length).toBe(1);
    const onlyId = body.attribution.attribution_units[0]?.contributor_entity_id;
    expect(onlyId).not.toBe(C1_ENTITY); // it's C2's own id, not C1's
  });

  it("a buyer below the k-floor sees usage/value aggregates only — NO units, NO identities, suppressed counts", async () => {
    const { status, body, raw } = await attribution(BUYER_TOKEN);
    expect(status).toBe(200);
    expect(body.attribution.viewer_role).toBe("buyer");
    expect(body.attribution.attribution_units).toEqual([]);
    // K-anonymity: exact contributor counts suppressed below the floor.
    expect(body.attribution.active_contributors).toBeNull();
    expect(body.attribution.total_contributors).toBeNull();
    expect(body.attribution.count_suppressed).toBe(true);
    // Usage / mock-value aggregates remain visible.
    expect(typeof body.attribution.metered_usage_total).toBe("number");
    expect(body.attribution.total_weight).toBe(1.0);
    // The buyer's payload carries no contributor entity id at all.
    expect(C1_ENTITY.length).toBeGreaterThan(0);
    expect(raw).not.toContain(C1_ENTITY);
  });

  it("a cross-tenant stranger gets COHORT_PRODUCT_NOT_FOUND (enumeration-safe)", async () => {
    const { status, body } = await attribution(STRANGER_TOKEN);
    expect(status).toBe(404);
    expect((body as unknown as { code: string }).code).toBe("COHORT_PRODUCT_NOT_FOUND");
  });

  it("no auth → 401", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/foundation/cohorts/${COHORT_ID}/attribution` });
    expect(res.statusCode).toBe(401);
  });

  it("withdrawal zeroes that unit's participation and recomputes active weight", async () => {
    const w = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${COHORT_ID}/withdraw`,
      headers: auth(C2_TOKEN),
      payload: {},
    });
    expect([200, 201]).toContain(w.statusCode);

    const { body } = await attribution(PROVIDER_TOKEN);
    expect(body.attribution.active_contributors).toBe(1);
    expect(body.attribution.total_weight).toBe(1.0);
    const withdrawn = body.attribution.attribution_units.find((u) => u.contribution_status !== "ELIGIBLE");
    const stillActive = body.attribution.attribution_units.find((u) => u.contribution_status === "ELIGIBLE");
    expect(withdrawn?.weight).toBe(0);
    expect(withdrawn?.withdrawn_at).not.toBeNull();
    expect(stillActive?.weight).toBe(1); // the lone remaining active record takes the whole weight
  });

  it("ABOVE the k-floor, buyer + contributor see EXACT counts (not suppressed)", async () => {
    // A cohort whose k-floor is met by its active participation. The register
    // floor is 50, so the fixture sets minimum_cohort_size = 2 directly (test-
    // controlled DB) to exercise the at/above-floor branch deterministically.
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "Above-floor cohort",
        description: "d",
        cohort_type: "CONSUMER_BEHAVIOR",
        access_modes: ["AGGREGATED_SIGNAL"],
        allowed_uses: ["ANALYTICS"],
        status: "ACTIVE",
      },
    });
    const id = (reg.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
    await prisma.cohortDataProduct.update({ where: { cohort_product_id: id }, data: { minimum_cohort_size: 2 } });

    for (const t of [C1_TOKEN, C2_TOKEN]) {
      await app.inject({ method: "POST", url: `/api/v1/foundation/cohorts/${id}/join`, headers: auth(t), payload: { contribution_scope: "PREFERENCE" } });
    }
    await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/access-requests`,
      headers: auth(BUYER_TOKEN),
      payload: { intended_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });

    const get = async (token: string): Promise<AttributionBody> => {
      const r = await app.inject({ method: "GET", url: `/api/v1/foundation/cohorts/${id}/attribution`, headers: auth(token) });
      return r.json() as AttributionBody;
    };

    const buyer = await get(BUYER_TOKEN);
    expect(buyer.attribution.viewer_role).toBe("buyer");
    expect(buyer.attribution.count_suppressed).toBe(false);
    expect(buyer.attribution.active_contributors).toBe(2);

    const contributor = await get(C1_TOKEN);
    expect(contributor.attribution.viewer_role).toBe("contributor");
    expect(contributor.attribution.count_suppressed).toBe(false);
    expect(contributor.attribution.active_contributors).toBe(2);
  });
});
