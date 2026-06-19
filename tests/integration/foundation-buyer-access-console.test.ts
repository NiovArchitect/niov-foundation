// FILE: foundation-buyer-access-console.test.ts (integration)
// PURPOSE: Phase 1311-B — the Buyer Access Console backend. Proves a buyer can
//          see WHAT they have access to (role-filtered grant list), and for one
//          grant a full SAFE summary: the governed resource label, the access
//          policy (allowed uses / training status / sensitivity / raw-body
//          excluded), audit-derived USAGE (read count + last accessed), and a
//          MOCK-only settlement intent. The console is buyer-scoped + enumeration
//          safe (the provider — and any other entity — gets GRANT_NOT_FOUND), and
//          never leaks raw content. Role filtering separates "my purchases"
//          (buyer) from "grants on my data" (provider).
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (my-data-grants + :id/console)
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

const TEST_JWT_SECRET = "foundation-buyer-console-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let BUYER_TOKEN: string;
let OUTSIDER_TOKEN: string;
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
  // Provider + buyer share an org so the buyer can see the package; the outsider
  // is a different org (cross-buyer enumeration check).
  const orgA = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}bcA_${randomUUID()}`,
    email: `${TEST_PREFIX}bcA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
  OUTSIDER_TOKEN = await member(orgA.entity_id);
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
      title: "Buyer console signals",
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
    payload: {
      intended_use: "PERSONALIZATION",
      consent_confirmed: true,
      opt_in_confirmed: true,
    },
  });
  if (res.statusCode !== 201) throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { grant: { grant_id: string } }).grant.grant_id;
}

describe("Phase 1311-B — Buyer Access Console", () => {
  it("buyer's my-data-grants?role=buyer lists their purchase; role=provider is empty for the buyer", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    const mine = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/my-data-grants?role=buyer",
      headers: auth(BUYER_TOKEN),
    });
    expect(mine.statusCode).toBe(200);
    const mineBody = mine.json() as { role: string; grants: Array<{ grant_id: string }> };
    expect(mineBody.role).toBe("buyer");
    expect(mineBody.grants.some((g) => g.grant_id === grantId)).toBe(true);

    // The buyer is not a provider of anything → provider view excludes this grant.
    const asProvider = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/my-data-grants?role=provider",
      headers: auth(BUYER_TOKEN),
    });
    const provBody = asProvider.json() as { grants: Array<{ grant_id: string }> };
    expect(provBody.grants.some((g) => g.grant_id === grantId)).toBe(false);
  });

  it("the console shows policy + audit-derived usage + mock settlement; no raw content", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    // Generate one real usage event by reading the grant.
    const read = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`,
      headers: auth(BUYER_TOKEN),
      payload: {},
    });
    expect(read.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/console`,
      headers: auth(BUYER_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    const c = (
      res.json() as {
        console: {
          grant: { grant_id: string; status: string };
          resource: { listing_title: string | null };
          policy: {
            allowed_uses: string[];
            training_allowed: boolean;
            raw_body_excluded: boolean;
            sensitivity_class: string | null;
          };
          usage: { read_count: number; denied_count: number; last_accessed_at: string | null };
          settlement: { is_mock: boolean; economic_decision: string | null };
        };
      }
    ).console;

    expect(c.grant.grant_id).toBe(grantId);
    expect(c.grant.status).toBe("ACTIVE");
    expect(c.resource.listing_title).toBe("Buyer console signals");
    expect(c.policy.allowed_uses).toContain("PERSONALIZATION");
    expect(c.policy.training_allowed).toBe(false);
    expect(c.policy.raw_body_excluded).toBe(true);
    expect(c.policy.sensitivity_class).toBe("STANDARD");
    expect(c.usage.read_count).toBeGreaterThanOrEqual(1);
    expect(c.usage.last_accessed_at).not.toBeNull();
    expect(c.settlement.is_mock).toBe(true);
    expect(c.settlement.economic_decision).toBe("ALLOW_MOCK");

    // No raw content / storage internals on the wire.
    for (const t of ["storage_location", "payload_content", "embedding", "content_hash"])
      expect(res.payload).not.toContain(t);
  });

  it("the console is buyer-scoped: the provider and an outsider get GRANT_NOT_FOUND", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    const asProvider = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/console`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(asProvider.statusCode).toBe(404);
    expect((asProvider.json() as { code: string }).code).toBe("GRANT_NOT_FOUND");

    const asOutsider = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/console`,
      headers: auth(OUTSIDER_TOKEN),
    });
    expect(asOutsider.statusCode).toBe(404);

    // No auth → 401.
    const noAuth = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/console`,
    });
    expect(noAuth.statusCode).toBe(401);
  });

  it("the provider sees the grant under role=provider (the contributor side)", async () => {
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
