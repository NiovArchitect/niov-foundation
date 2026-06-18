// FILE: foundation-cohort-contributions.test.ts (integration)
// PURPOSE: Phase 1306-A — HTTP coverage for cohort contribution accounting.
//          Proves: provider/admin-only record/list/revoke; outsider gets
//          enumeration-safe COHORT_PRODUCT_NOT_FOUND; the eligible-count summary
//          honors the LIVE consent state (a consent revoked AFTER recording
//          drops the contribution from the eligible count — RULE 0); revoke
//          flips status; and NO contributor identity / wallet id ever appears in
//          any response. End-to-end.
// CONNECTS TO:
//   - apps/api/src/routes/cohort.routes.ts (registerCohortContributionRoutes)
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

const TEST_JWT_SECRET = "foundation-cohort-contrib-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let OUTSIDER_TOKEN: string;
let PROVIDER_ENTITY_ID: string;
let CONTRIBUTOR_ENTITY_ID: string;
const store = new MemoryRateLimitStore();

// An orgless PERSON with read+write. The cohort provider is whoever creates the
// cohort; the outsider is simply a different orgless person (not the provider,
// not an org-admin of the provider's org) — sufficient for the isolation check.
async function person(ops: string[]): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  await createEntity(input);
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
  PROVIDER_TOKEN = await person(["read", "write"]);
  OUTSIDER_TOKEN = await person(["read", "write"]);
  const contributor = await createEntity(
    makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" }),
  );
  CONTRIBUTOR_ENTITY_ID = contributor.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

const FORBIDDEN_IDENTITY = [
  "contributor_entity_id",
  "contributor_org_entity_id",
  "wallet_id",
  "consent_record_id",
];

function assertNoIdentity(body: unknown): void {
  const s = JSON.stringify(body);
  for (const t of FORBIDDEN_IDENTITY) expect(s).not.toContain(t);
}

async function createActiveCohort(): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Contribution cohort",
      description: "x",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
    },
  });
  const body = r.json() as { cohort: { cohort_product_id: string; provider_entity_id: string } };
  PROVIDER_ENTITY_ID = body.cohort.provider_entity_id;
  return body.cohort.cohort_product_id;
}

// Create a marketplace_data_consent row (the consent basis a contribution links).
async function createConsent(contributorId: string, providerId: string): Promise<string> {
  const c = await prisma.marketplaceDataConsent.create({
    data: {
      listing_id: randomUUID(),
      data_package_id: randomUUID(),
      provider_entity_id: providerId,
      consenting_entity_id: contributorId,
      allowed_use: ["ANALYTICS"],
      access_mode: "AGGREGATED_SIGNAL",
    },
  });
  return c.consent_id;
}

describe("Phase 1306-A — cohort contribution accounting", () => {
  it("requires auth + is provider/admin-only (outsider → COHORT_PRODUCT_NOT_FOUND)", async () => {
    const id = await createActiveCohort();
    const noAuth = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
    });
    expect(noAuth.statusCode).toBe(401);

    const outsider = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(OUTSIDER_TOKEN),
      payload: { contributor_entity_id: CONTRIBUTOR_ENTITY_ID, contribution_scope: "PREFERENCE" },
    });
    expect(outsider.statusCode).toBe(404);
    expect((outsider.json() as { code: string }).code).toBe("COHORT_PRODUCT_NOT_FOUND");
  });

  it("requires a consent basis when the cohort requires consent", async () => {
    const id = await createActiveCohort();
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
      payload: { contributor_entity_id: CONTRIBUTOR_ENTITY_ID, contribution_scope: "PREFERENCE" },
    });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { code: string }).code).toBe("CONSENT_REQUIRED");
  });

  it("records a contribution + never leaks contributor identity; revoking the CONSENT drops eligibility", async () => {
    const id = await createActiveCohort();
    const consentId = await createConsent(CONTRIBUTOR_ENTITY_ID, PROVIDER_ENTITY_ID);

    const rec = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
      payload: {
        contributor_entity_id: CONTRIBUTOR_ENTITY_ID,
        contribution_scope: "PREFERENCE",
        consent_record_id: consentId,
      },
    });
    expect(rec.statusCode).toBe(201);
    const recBody = rec.json() as { contribution: { contribution_id: string; eligible: boolean } };
    expect(recBody.contribution.eligible).toBe(true);
    assertNoIdentity(recBody);

    // Eligible count = 1 while consent is live.
    const list1 = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(list1.statusCode).toBe(200);
    const l1 = list1.json() as {
      contributions: Array<Record<string, unknown>>;
      summary: { eligible_count: number; threshold_enforced: boolean };
    };
    expect(l1.summary.eligible_count).toBe(1);
    expect(l1.summary.threshold_enforced).toBe(false);
    assertNoIdentity(list1.json());

    // MUST-FIX: withdraw the consent → the contribution drops from eligible.
    await prisma.marketplaceDataConsent.update({
      where: { consent_id: consentId },
      data: { revoked_at: new Date() },
    });
    const list2 = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
    });
    const l2 = list2.json() as {
      contributions: Array<{ eligible: boolean; consent_active: boolean }>;
      summary: { eligible_count: number };
    };
    expect(l2.summary.eligible_count).toBe(0);
    expect(l2.contributions[0]?.eligible).toBe(false);
    expect(l2.contributions[0]?.consent_active).toBe(false);
  });

  it("provider can revoke a contribution (status → REVOKED)", async () => {
    const id = await createActiveCohort();
    const consentId = await createConsent(CONTRIBUTOR_ENTITY_ID, PROVIDER_ENTITY_ID);
    const rec = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/contributions`,
      headers: auth(PROVIDER_TOKEN),
      payload: {
        contributor_entity_id: CONTRIBUTOR_ENTITY_ID,
        contribution_scope: "PREFERENCE",
        consent_record_id: consentId,
      },
    });
    const cid = (rec.json() as { contribution: { contribution_id: string } }).contribution
      .contribution_id;

    const rev = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${id}/contributions/${cid}/revoke`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(rev.statusCode).toBe(200);
    const rb = rev.json() as { contribution: { status: string; eligible: boolean } };
    expect(rb.contribution.status).toBe("REVOKED");
    expect(rb.contribution.eligible).toBe(false);
    assertNoIdentity(rev.json());

    // Row still exists (RULE 10 — revoke is a status flip, not a delete).
    const row = await prisma.cohortContribution.findUnique({
      where: { contribution_id: cid },
    });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("REVOKED");
    // Identity is stored internally but was never returned over HTTP.
    expect(row?.contributor_entity_id).toBe(CONTRIBUTOR_ENTITY_ID);
  });
});
