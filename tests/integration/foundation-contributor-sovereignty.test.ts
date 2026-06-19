// FILE: foundation-contributor-sovereignty.test.ts (integration)
// PURPOSE: Phase 1312-A — Contributor Sovereignty backend. Proves the core
//          product truth: data is not sold; governed access is leased under
//          consent + proof, and revocation MUST be visible AND enforced.
//          Specifically proves: (1) a provider sees the sovereignty view of a
//          grant on THEIR data (who has access + policy + usage + revocation
//          status), provider-scoped + enumeration-safe; (2) after the provider
//          REVOKES, the buyer's previously-working read is REFUSED — revoked
//          access cannot be used after withdrawal; (3) the sovereignty view then
//          reflects status REVOKED / is_active false.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (:grant_id/sovereignty + revoke)
//   - apps/api/src/services/foundation/marketplace.service.ts

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

const TEST_JWT_SECRET = "foundation-contributor-sovereignty-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let BUYER_TOKEN: string;
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
    display_name: `${TEST_PREFIX}csA_${randomUUID()}`,
    email: `${TEST_PREFIX}csA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function makePackage(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Sovereignty signals",
      description: "d",
      access_mode: "SAFE_PROJECTION",
      allowed_use: ["ANALYTICS", "PERSONALIZATION"],
      status: "PUBLISHED",
      pricing_model: { amount_usd: 0.02 },
    },
  });
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

async function makeActiveGrant(listingId: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`,
    headers: auth(BUYER_TOKEN),
    payload: { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true },
  });
  if (res.statusCode !== 201) throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { grant: { grant_id: string } }).grant.grant_id;
}

function read(grantId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`,
    headers: auth(token),
    payload: {},
  });
}

describe("Phase 1312-A — Contributor Sovereignty", () => {
  it("provider sees the sovereignty view of a grant on their data (provider-scoped, enumeration-safe)", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/sovereignty`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    const s = (
      res.json() as {
        sovereignty: {
          grant: { grant_id: string; buyer_entity_id: string };
          policy: { raw_body_excluded: boolean };
          sovereignty: { is_active: boolean; revocable: boolean; status: string; revocation_enforced_at_read: boolean };
        };
      }
    ).sovereignty;
    expect(s.grant.grant_id).toBe(grantId);
    expect(s.policy.raw_body_excluded).toBe(true);
    expect(s.sovereignty.is_active).toBe(true);
    expect(s.sovereignty.revocable).toBe(true);
    expect(s.sovereignty.status).toBe("ACTIVE");
    expect(s.sovereignty.revocation_enforced_at_read).toBe(true);

    // Buyer cannot see the provider's sovereignty view (provider-scoped).
    const asBuyer = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/sovereignty`,
      headers: auth(BUYER_TOKEN),
    });
    expect(asBuyer.statusCode).toBe(404);
    expect((asBuyer.json() as { code: string }).code).toBe("GRANT_NOT_FOUND");
  });

  it("CORE TRUTH: after the provider revokes, the buyer's read is refused (revoked access cannot be used)", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    // The buyer can read while the grant is ACTIVE.
    const before = await read(grantId, BUYER_TOKEN);
    expect(before.statusCode).toBe(200);

    // The provider (data owner) revokes the grant.
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/revoke`,
      headers: auth(PROVIDER_TOKEN),
      payload: { reason: "withdrawn by provider" },
    });
    expect(revoke.statusCode).toBe(200);

    // The buyer's SAME read now fails — revoked access cannot be used.
    const after = await read(grantId, BUYER_TOKEN);
    expect(after.statusCode).not.toBe(200);
    expect(["GRANT_NOT_ACTIVE", "READ_NOT_PERMITTED", "GRANT_NOT_FOUND"]).toContain(
      (after.json() as { code: string }).code,
    );

    // The DB row persists (RULE 10 — revoke is a status flip, not a delete).
    const row = await prisma.marketplaceDataGrant.findFirst({ where: { grant_id: grantId } });
    expect(row?.status).toBe("REVOKED");
    expect(row?.revoked_at).not.toBeNull();

    // The sovereignty view reflects the withdrawal.
    const sov = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/sovereignty`,
      headers: auth(PROVIDER_TOKEN),
    });
    const s = (
      sov.json() as {
        sovereignty: { sovereignty: { is_active: boolean; status: string; revoked_at: string | null } };
      }
    ).sovereignty.sovereignty;
    expect(s.status).toBe("REVOKED");
    expect(s.is_active).toBe(false);
    expect(s.revoked_at).not.toBeNull();
  });

  it("the provider's role-filtered list shows grants on their data", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/my-data-grants?role=provider",
      headers: auth(PROVIDER_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { grants: Array<{ grant_id: string }> };
    expect(body.grants.some((g) => g.grant_id === grantId)).toBe(true);
  });
});
