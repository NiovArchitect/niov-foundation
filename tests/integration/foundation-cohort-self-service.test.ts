// FILE: foundation-cohort-self-service.test.ts (integration)
// PURPOSE: Phase 1313-A — contributor self-service cohort participation. Proves a
//          contributor can JOIN a cohort it can see (the act of joining is the
//          consent — RULE 0), see their OWN participation, and WITHDRAW at will;
//          that a self-join counts toward the provider's eligible count and a
//          withdrawal drops it immediately; idempotent join (ALREADY_JOINED) +
//          withdraw-when-not-joined (NOT_JOINED); a cohort the caller cannot see
//          is enumeration-safe COHORT_PRODUCT_NOT_FOUND; and the caller's
//          my-contributions view never exposes other contributors.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (join / withdraw / my-contributions)
//   - apps/api/src/services/foundation/cohort-contribution.service.ts

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

const TEST_JWT_SECRET = "foundation-cohort-self-service-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let CONTRIBUTOR_TOKEN: string;
let OUTSIDER_TOKEN: string; // different org — cannot see the cohort
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: e.entity_id, is_active: true },
  });
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
    display_name: `${TEST_PREFIX}ssA_${randomUUID()}`,
    email: `${TEST_PREFIX}ssA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}ssB_${randomUUID()}`,
    email: `${TEST_PREFIX}ssB_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  CONTRIBUTOR_TOKEN = await member(orgA.entity_id);
  OUTSIDER_TOKEN = await member(orgB.entity_id);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function createActiveCohort(): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Self-service cohort",
      description: "x",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
    },
  });
  if (r.statusCode !== 201) throw new Error(`cohort create failed: ${r.statusCode} ${r.body}`);
  return (r.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
}

function join(id: string, token: string, scope = "PREFERENCE") {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${id}/join`,
    headers: auth(token),
    payload: { contribution_scope: scope },
  });
}
function withdraw(id: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/cohorts/${id}/withdraw`,
    headers: auth(token),
  });
}
function providerEligibleCount(id: string) {
  return app
    .inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
    })
    .then((r) => (r.json() as { summary: { eligible_count: number } }).summary.eligible_count);
}

describe("Phase 1313-A — contributor self-service cohort participation", () => {
  it("a contributor joins (self-consent), is idempotent, and the join counts toward eligibility", async () => {
    const id = await createActiveCohort();
    expect(await providerEligibleCount(id)).toBe(0);

    const noAuth = await app.inject({ method: "POST", url: `/api/v1/foundation/cohorts/${id}/join` });
    expect(noAuth.statusCode).toBe(401);

    const j = await join(id, CONTRIBUTOR_TOKEN);
    expect(j.statusCode).toBe(201);
    const c = (j.json() as { contribution: { status: string; self_initiated: boolean } }).contribution;
    expect(c.status).toBe("ELIGIBLE");
    expect(c.self_initiated).toBe(true);

    // The self-join counts toward the provider's eligible count.
    expect(await providerEligibleCount(id)).toBe(1);

    // Idempotent — same scope again → ALREADY_JOINED.
    const dup = await join(id, CONTRIBUTOR_TOKEN);
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { code: string }).code).toBe("ALREADY_JOINED");
  });

  it("the contributor sees their OWN participation; withdrawal drops eligibility (RULE 10 row persists)", async () => {
    const id = await createActiveCohort();
    await join(id, CONTRIBUTOR_TOKEN);
    expect(await providerEligibleCount(id)).toBe(1);

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/cohorts/my-contributions",
      headers: auth(CONTRIBUTOR_TOKEN),
    });
    expect(mine.statusCode).toBe(200);
    const list = mine.json() as {
      contributions: Array<{ cohort_product_id: string; status: string; self_initiated: boolean }>;
    };
    expect(list.contributions.some((x) => x.cohort_product_id === id && x.status === "ELIGIBLE")).toBe(
      true,
    );
    // Never exposes other contributors' identity fields.
    const s = JSON.stringify(mine.json());
    for (const t of ["contributor_entity_id", "wallet_id"]) expect(s).not.toContain(t);

    const w = await withdraw(id, CONTRIBUTOR_TOKEN);
    expect(w.statusCode).toBe(200);
    expect((w.json() as { withdrawn_count: number }).withdrawn_count).toBe(1);

    // Eligible count drops immediately.
    expect(await providerEligibleCount(id)).toBe(0);

    // The row persists as REVOKED (RULE 10).
    const row = await prisma.cohortContribution.findFirst({
      where: { cohort_product_id: id },
      orderBy: { created_at: "desc" },
    });
    expect(row?.status).toBe("REVOKED");

    // Withdrawing again → NOT_JOINED.
    const w2 = await withdraw(id, CONTRIBUTOR_TOKEN);
    expect(w2.statusCode).toBe(409);
    expect((w2.json() as { code: string }).code).toBe("NOT_JOINED");
  });

  it("a cohort the caller cannot see is enumeration-safe COHORT_PRODUCT_NOT_FOUND", async () => {
    const id = await createActiveCohort();
    const outsider = await join(id, OUTSIDER_TOKEN);
    expect(outsider.statusCode).toBe(404);
    expect((outsider.json() as { code: string }).code).toBe("COHORT_PRODUCT_NOT_FOUND");

    const missing = await join(randomUUID(), CONTRIBUTOR_TOKEN);
    expect(missing.statusCode).toBe(404);
  });
});
