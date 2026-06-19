// FILE: foundation-avp2-quote.test.ts (integration)
// PURPOSE: F-1330 — AVP² Quote Intent Layer. Proves an agent can ask for a quote
//          against a SPECIFIC resource_id (the agent does not scrape — it asks
//          for a quote); deterministic mock pricing; per-resource HARD denials
//          (unknown resource_id → RESOURCE_NOT_FOUND, no listing-level fallback);
//          visibility-scoped + enumeration-safe; mock-only; live access disabled;
//          an AVP2_QUOTE_CREATED audit event is recorded; never carries content.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (POST /api/v1/foundation/avp2/quote)
//   - apps/api/src/services/foundation/avp2-quote.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-avp2-quote-secret";
let app: FastifyInstance;
let OWNER_TOKEN: string;
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

interface QuoteBody {
  ok: true;
  quote: {
    quote_id: string; status: string; listing_id: string; resource_id: string; resource_type: string;
    title: string; intended_use: string; quantity: number;
    price: { mock_amount: number | null; currency: string; settlement_mode: string; is_mock: boolean };
    governance: { quote_required: boolean; proof_required: boolean; license_terms: string | null };
    proof_basis: { proof_required: boolean; proof_method: string };
    lineage_basis: { policy_source: string; listing_id: string };
    live_access_enabled: boolean; created_at: string; expires_at: string;
  };
}
async function quote(token: string, body: unknown): Promise<{ status: number; json: unknown; raw: string }> {
  const res = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/quote", headers: auth(token), payload: body as Record<string, unknown> });
  return { status: res.statusCode, json: res.json(), raw: res.payload };
}

let LISTING_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}qA_${randomUUID()}`, email: `${TEST_PREFIX}qA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}qB_${randomUUID()}`, email: `${TEST_PREFIX}qB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  OWNER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
  LISTING_ID = await registerBookListing();
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1330 — AVP² Quote Intent Layer", () => {
  it("agent asks for a quote on a specific resource → deterministic mock price; mock-only; live access disabled; never content", async () => {
    const { status, json, raw } = await quote(OWNER_TOKEN, {
      agent_context: { agent_id: "agent-42", purpose: "research" },
      resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7", quantity: 3 },
      intended_use: "summarize chapter 7",
      settlement: { mode: "MOCK_ONLY" },
    });
    expect(status).toBe(201);
    const q = (json as QuoteBody).quote;
    expect(q.status).toBe("QUOTED");
    expect(q.resource_id).toBe("book-demo.chapter-7");
    expect(q.quantity).toBe(3);
    expect(q.price.mock_amount).toBeCloseTo(0.03); // floor 0.01 × 3
    expect(q.price.settlement_mode).toBe("MOCK_ONLY");
    expect(q.price.is_mock).toBe(true);
    expect(q.governance.proof_required).toBe(true);
    expect(q.governance.license_terms).toBe("Licensed-Excerpt-v1");
    expect(q.proof_basis.proof_method).toBe("AVP2_ACCESS_RECEIPT");
    expect(q.lineage_basis.policy_source).toBe("MARKETPLACE_LISTING_GOVERNANCE");
    expect(q.live_access_enabled).toBe(false);
    expect(new Date(q.expires_at).getTime()).toBeGreaterThan(new Date(q.created_at).getTime());
    // NEVER any content / body / fragment text on the wire.
    for (const t of ['"content"', '"body"', '"fragment"', '"payload"', '"text"', "storage_location"]) expect(raw).not.toContain(t);
  });

  it("records an AVP2_QUOTE_CREATED audit event bound to the caller (RULE 4)", async () => {
    const before = Date.now();
    const { json } = await quote(OWNER_TOKEN, {
      resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7" },
      intended_use: "audit-check",
    });
    const q = (json as QuoteBody).quote;
    const ev = await prisma.auditEvent.findFirst({
      where: { event_type: "AVP2_QUOTE_CREATED", details: { path: ["quote_id"], equals: q.quote_id } },
    });
    expect(ev).not.toBeNull();
    expect((ev?.details as Record<string, unknown>)?.resource_id).toBe("book-demo.chapter-7");
    expect((ev?.details as Record<string, unknown>)?.settlement_mode).toBe("MOCK_ONLY");
    expect(ev?.timestamp.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("HARD deny: unknown resource_id → RESOURCE_NOT_FOUND (no listing-level fallback)", async () => {
    const { status, json } = await quote(OWNER_TOKEN, {
      resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-999" },
      intended_use: "x",
    });
    expect(status).toBe(404);
    expect((json as { code: string }).code).toBe("RESOURCE_NOT_FOUND");
  });

  it("validation: missing resource_id → 422; missing intended_use → 422; bad quantity → 422; non-mock settlement → 422", async () => {
    const noRes = await quote(OWNER_TOKEN, { resource_request: { listing_id: LISTING_ID }, intended_use: "x" });
    expect(noRes.status).toBe(422);
    expect((noRes.json as { code: string }).code).toBe("RESOURCE_ID_REQUIRED");
    const noUse = await quote(OWNER_TOKEN, { resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7" } });
    expect(noUse.status).toBe(422);
    expect((noUse.json as { code: string }).code).toBe("INTENDED_USE_REQUIRED");
    const badQty = await quote(OWNER_TOKEN, { resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7", quantity: 0 }, intended_use: "x" });
    expect(badQty.status).toBe(422);
    expect((badQty.json as { code: string }).code).toBe("INVALID_QUANTITY");
    const badMode = await quote(OWNER_TOKEN, { resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7" }, intended_use: "x", settlement: { mode: "REAL_USDC" } });
    expect(badMode.status).toBe(422);
    expect((badMode.json as { code: string }).code).toBe("INVALID_SETTLEMENT_MODE");
  });

  it("cross-tenant + unknown listing → LISTING_NOT_FOUND; no auth → 401", async () => {
    const stranger = await quote(STRANGER_TOKEN, { resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7" }, intended_use: "x" });
    expect(stranger.status).toBe(404);
    expect((stranger.json as { code: string }).code).toBe("LISTING_NOT_FOUND");
    const unknown = await quote(OWNER_TOKEN, { resource_request: { listing_id: randomUUID(), resource_id: "r" }, intended_use: "x" });
    expect(unknown.status).toBe(404);
    expect((unknown.json as { code: string }).code).toBe("LISTING_NOT_FOUND");
    const noAuth = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/quote", payload: { resource_request: { listing_id: LISTING_ID, resource_id: "book-demo.chapter-7" }, intended_use: "x" } });
    expect(noAuth.statusCode).toBe(401);
  });
});
