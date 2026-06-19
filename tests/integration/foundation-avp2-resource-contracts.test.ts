// FILE: foundation-avp2-resource-contracts.test.ts (integration)
// PURPOSE: F-1329 — AVP² Resource Contract Projection. Proves a listing's
//          trust_metadata.resources project into object-level quotable resource
//          contracts (quote_required, proof_required, license, mock price range,
//          live access disabled, mock-only) that NEVER carry content; visibility-
//          scoped to provider / same-org PUBLISHED; enumeration-safe.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (.../listings/:id/resource-contracts)
//   - apps/api/src/services/foundation/avp2-resource-contract.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-avp2-resource-secret";
let app: FastifyInstance;
let OWNER_TOKEN: string;
let SAMEORG_TOKEN: string;
let STRANGER_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
  return (login.json() as { token: string }).token;
}
function auth(token: string): Record<string, string> { return { authorization: `Bearer ${token}` }; }

async function registerBookListing(): Promise<string> {
  const res = await app.inject({
    method: "POST", url: "/api/v1/foundation/marketplace/listings", headers: auth(OWNER_TOKEN),
    payload: {
      listing_type: "SERVICE", title: "Demo Publisher", description: "Licensed excerpts", status: "PUBLISHED",
      pricing_model: { amount_usd: 0.05 },
      trust_metadata: {
        license_terms: "Licensed-Excerpt-v1", proof_required: true, quote_required: true,
        training_allowed: false, redistribution_allowed: false, commercial_ai_allowed: false,
        metering_unit: "paragraph", allowed_uses: ["READING"], selector_support: ["paragraph_range"],
        resources: [
          { resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", title: "Chapter 7", selector_support: ["paragraph_range"], mock_price_floor: 0.01, mock_price_ceiling: 0.04 },
        ],
      },
    },
  });
  if (res.statusCode !== 201) throw new Error(`listing failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

interface RcBody {
  ok: true;
  listing_id: string;
  resource_contracts: Array<{
    resource_contract_id: string; resource_id: string; resource_type: string; title: string;
    selector_support: string[]; quote_required: boolean; proof_required: boolean; license_terms: string | null;
    training_allowed: boolean; mock_price_floor: number | null; mock_price_ceiling: number | null;
    settlement_mode: string; live_access_enabled: boolean;
  }>;
}
async function resourceContracts(token: string, listingId: string): Promise<{ status: number; body: RcBody; raw: string }> {
  const res = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/listings/${listingId}/resource-contracts`, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as RcBody, raw: res.payload };
}

let LISTING_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rcA_${randomUUID()}`, email: `${TEST_PREFIX}rcA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}rcB_${randomUUID()}`, email: `${TEST_PREFIX}rcB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  OWNER_TOKEN = await member(orgA.entity_id);
  SAMEORG_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
  LISTING_ID = await registerBookListing();
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1329 — AVP² Resource Contract Projection", () => {
  it("projects a quotable object-level resource contract; mock-only; live access disabled; license explicit", async () => {
    const { status, body, raw } = await resourceContracts(OWNER_TOKEN, LISTING_ID);
    expect(status).toBe(200);
    expect(body.resource_contracts.length).toBe(1);
    const rc = body.resource_contracts[0];
    expect(rc?.resource_id).toBe("book-demo.chapter-7");
    expect(rc?.resource_type).toBe("CONTENT_FRAGMENT");
    expect(rc?.selector_support).toEqual(["paragraph_range"]);
    expect(rc?.quote_required).toBe(true);
    expect(rc?.proof_required).toBe(true);
    expect(rc?.license_terms).toBe("Licensed-Excerpt-v1");
    expect(rc?.training_allowed).toBe(false);
    expect(rc?.mock_price_floor).toBe(0.01);
    expect(rc?.mock_price_ceiling).toBe(0.04);
    expect(rc?.settlement_mode).toBe("MOCK_ONLY");
    expect(rc?.live_access_enabled).toBe(false);
    // NEVER any content / body / fragment text on the wire.
    for (const t of ['"content"', '"body"', '"fragment"', '"payload"', '"text"', "storage_location"]) expect(raw).not.toContain(t);
  });

  it("a same-org viewer can read a PUBLISHED listing's resource contracts", async () => {
    const { status, body } = await resourceContracts(SAMEORG_TOKEN, LISTING_ID);
    expect(status).toBe(200);
    expect(body.resource_contracts[0]?.resource_id).toBe("book-demo.chapter-7");
  });

  it("cross-tenant + unknown listing → LISTING_NOT_FOUND; no auth → 401", async () => {
    const stranger = await resourceContracts(STRANGER_TOKEN, LISTING_ID);
    expect(stranger.status).toBe(404);
    expect((stranger.body as unknown as { code: string }).code).toBe("LISTING_NOT_FOUND");
    const unknown = await resourceContracts(OWNER_TOKEN, randomUUID());
    expect(unknown.status).toBe(404);
    const noAuth = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/listings/${LISTING_ID}/resource-contracts` });
    expect(noAuth.statusCode).toBe(401);
  });
});
