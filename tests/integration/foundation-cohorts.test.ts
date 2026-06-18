// FILE: foundation-cohorts.test.ts (integration)
// PURPOSE: Phase 1305-A — HTTP coverage for the Federation Cloud cohort data
//          product registry + policy evaluator. Proves: auth required; a
//          provider registers a cohort; the SAFE view carries the honesty
//          markers (threshold_enforced=false, signal_available=false,
//          raw_body_excluded=true) and no raw/contributor fields; tenant-scoped
//          visibility (own + ACTIVE in-org; outsider → enumeration-safe
//          COHORT_PRODUCT_NOT_FOUND); the evaluator returns structured decisions
//          (ALLOW_EVALUATION / REVIEW_REQUIRED / DENIED) and NEVER a signal;
//          CHILDREN data is blocked; HIGH_SENSITIVITY routes to review; ARCHIVE
//          soft-retires (RULE 10). End-to-end.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts
//   - apps/api/src/services/foundation/federation-cloud-cohort.service.ts

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

const TEST_JWT_SECRET = "foundation-cohorts-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let CONSUMER_TOKEN: string;
let OUTSIDER_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string, ops: string[]): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return (login.json() as { token: string }).token;
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
  const orgA = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}coA_${randomUUID()}`,
    email: `${TEST_PREFIX}coA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}coB_${randomUUID()}`,
    email: `${TEST_PREFIX}coB_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  CONSUMER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  OUTSIDER_TOKEN = await member(orgB.entity_id, ["read", "write"]);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

// NOTE: `raw_body_excluded` is a SAFE governance flag that legitimately appears
// in the projection — do not match the bare substring "raw_body".
const FORBIDDEN_WIRE = [
  "payload_summary",
  "payload_content",
  "raw_body_content",
  "contributor",
  "revenue_share_policy",
  "provider_org_entity_id",
  "deleted_at",
];

function assertNoLeak(body: unknown): void {
  const s = JSON.stringify(body);
  for (const t of FORBIDDEN_WIRE) expect(s).not.toContain(t);
}

describe("Phase 1305-A — Federation Cloud cohort routes", () => {
  it("requires auth", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/cohorts",
    });
    expect(r.statusCode).toBe(401);
  });

  it("registers a cohort with forced-safe governance + honesty markers", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "Consumer behavior signal",
        description: "aggregate only",
        cohort_type: "CONSUMER_BEHAVIOR",
        access_modes: ["AGGREGATED_SIGNAL"],
        allowed_uses: ["ANALYTICS"],
        sensitivity_class: "STANDARD",
        status: "ACTIVE",
        // Attempt to weaken governance — must be IGNORED (forced true).
        raw_body_excluded: false,
        consent_required: false,
        // Monetization flag opt-in.
        commercial_use_allowed: true,
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { ok: boolean; cohort: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.cohort.raw_body_excluded).toBe(true);
    expect(body.cohort.consent_required).toBe(true);
    expect(body.cohort.opt_in_required).toBe(true);
    expect(body.cohort.proof_required).toBe(true);
    expect(body.cohort.threshold_enforced).toBe(false);
    expect(body.cohort.signal_available).toBe(false);
    expect(body.cohort.commercial_use_allowed).toBe(true);
    expect(body.cohort.minimum_cohort_size).toBe(50);
    assertNoLeak(body);
  });

  it("rejects a sub-floor minimum_cohort_size", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "too small",
        description: "x",
        cohort_type: "CONSUMER_BEHAVIOR",
        minimum_cohort_size: 10,
      },
    });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { code: string }).code).toBe("INVALID_COHORT_SIZE");
  });

  it("rejects an out-of-vocabulary cohort_type / access mode", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: { title: "x", description: "x", cohort_type: "NOT_A_TYPE" },
    });
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { code: string }).code).toBe("INVALID_COHORT_TYPE");

    const badMode = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "x",
        description: "x",
        cohort_type: "CONSUMER_BEHAVIOR",
        access_modes: ["RAW_DUMP"],
      },
    });
    expect(badMode.statusCode).toBe(422);
    expect((badMode.json() as { code: string }).code).toBe("INVALID_ACCESS_MODE");
  });

  it("is tenant-scoped + enumeration-safe; evaluator returns ALLOW_EVALUATION but no signal", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "Shared active cohort",
        description: "x",
        cohort_type: "PERSONAL_AI",
        access_modes: ["AGGREGATED_SIGNAL"],
        allowed_uses: ["ANALYTICS"],
        status: "ACTIVE",
      },
    });
    const id = (created.json() as { cohort: { cohort_product_id: string } }).cohort
      .cohort_product_id;

    // Same-org consumer can read an ACTIVE in-org cohort.
    const consumerGet = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}`,
      headers: auth(CONSUMER_TOKEN),
    });
    expect(consumerGet.statusCode).toBe(200);

    // Outsider (orgB) gets the same NOT_FOUND as a missing row.
    const outsiderGet = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}`,
      headers: auth(OUTSIDER_TOKEN),
    });
    expect(outsiderGet.statusCode).toBe(404);
    expect((outsiderGet.json() as { code: string }).code).toBe(
      "COHORT_PRODUCT_NOT_FOUND",
    );

    // Evaluator: admissible request → ALLOW_EVALUATION, never a signal.
    const evalRes = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/evaluate`,
      headers: auth(CONSUMER_TOKEN),
      payload: { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect(evalRes.statusCode).toBe(200);
    const access = (evalRes.json() as { access: Record<string, unknown> }).access;
    expect(access.decision).toBe("ALLOW_EVALUATION");
    expect(access.signal_delivered).toBe(false);
    expect((access.policy as Record<string, unknown>).threshold_enforced).toBe(false);
    assertNoLeak(evalRes.json());
  });

  it("blocks CHILDREN data and routes HIGH_SENSITIVITY to review", async () => {
    const children = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "kids",
        description: "x",
        cohort_type: "CUSTOM",
        access_modes: ["AGGREGATED_SIGNAL"],
        allowed_uses: ["ANALYTICS"],
        sensitive_categories: ["CHILDREN"],
        status: "ACTIVE",
      },
    });
    const cid = (children.json() as { cohort: { cohort_product_id: string } }).cohort
      .cohort_product_id;
    const cEval = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${cid}/evaluate`,
      headers: auth(PROVIDER_TOKEN),
      payload: { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect((cEval.json() as { access: { decision: string } }).access.decision).toBe(
      "DENIED",
    );

    const hs = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "hs",
        description: "x",
        cohort_type: "HEALTH_WELLNESS_AGGREGATE",
        access_modes: ["AGGREGATED_SIGNAL"],
        allowed_uses: ["ANALYTICS"],
        sensitivity_class: "HIGH_SENSITIVITY",
        status: "ACTIVE",
      },
    });
    const hid = (hs.json() as { cohort: { cohort_product_id: string } }).cohort
      .cohort_product_id;
    const hEval = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${hid}/evaluate`,
      headers: auth(PROVIDER_TOKEN),
      payload: { requested_use: "ANALYTICS", requested_access_mode: "AGGREGATED_SIGNAL" },
    });
    expect((hEval.json() as { access: { decision: string } }).access.decision).toBe(
      "REVIEW_REQUIRED",
    );
  });

  it("CROSS_ORG discovery is refused for non-STANDARD sensitivity", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: {
        title: "x",
        description: "x",
        cohort_type: "CONSUMER_BEHAVIOR",
        sensitivity_class: "SENSITIVE",
        discovery_scope: "CROSS_ORG",
      },
    });
    expect(r.statusCode).toBe(403);
    expect((r.json() as { code: string }).code).toBe(
      "DISCOVERY_BLOCKED_HIGH_SENSITIVITY",
    );
  });

  it("ARCHIVE soft-retires (RULE 10) — then the cohort reads as NOT_FOUND", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/foundation/cohorts",
      headers: auth(PROVIDER_TOKEN),
      payload: { title: "to archive", description: "x", cohort_type: "CUSTOM", status: "ACTIVE" },
    });
    const id = (created.json() as { cohort: { cohort_product_id: string } }).cohort
      .cohort_product_id;
    const archived = await app.inject({
      method: "PATCH",
      url: `/api/v1/foundation/cohorts/${id}/status`,
      headers: auth(PROVIDER_TOKEN),
      payload: { status: "ARCHIVED" },
    });
    expect(archived.statusCode).toBe(200);
    expect((archived.json() as { cohort: { status: string } }).cohort.status).toBe(
      "ARCHIVED",
    );
    // Soft-deleted: deleted_at set → subsequent reads are NOT_FOUND.
    const after = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(after.statusCode).toBe(404);
    // The row still exists (never hard-deleted).
    const row = await prisma.cohortDataProduct.findUnique({
      where: { cohort_product_id: id },
    });
    expect(row).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();
  });
});
