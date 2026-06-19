// FILE: foundation-avp2-accept.test.ts (integration)
// PURPOSE: F-1331 — AVP² Quote Acceptance Layer. Proves the quote's CREATOR can
//          accept it (projecting a MOCK settlement intent + a single-use access
//          token), that acceptance is actor-bound (a different entity is denied
//          enumeration-safe), expiry-checked, and first-accept-wins idempotent
//          (re-accept returns the same acceptance with no fresh token). Mock-only;
//          live access disabled; never carries content.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (POST /avp2/quote/:id/accept)
//   - apps/api/src/services/foundation/avp2-accept.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, writeAuditEvent } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-avp2-accept-secret";
let app: FastifyInstance;
let OWNER_TOKEN: string;
let OWNER_ENTITY_ID: string;
let STRANGER_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<{ token: string; entityId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
  return { token: (login.json() as { token: string }).token, entityId: e.entity_id };
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
        resources: [{ resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", title: "Chapter 7", mock_price_floor: 0.02, mock_price_ceiling: 0.04 }],
      },
    },
  });
  if (res.statusCode !== 201) throw new Error(`listing failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

async function createQuote(token: string, listingId: string, resourceId = "book-demo.chapter-7"): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/quote", headers: auth(token), payload: { resource_request: { listing_id: listingId, resource_id: resourceId, quantity: 2 }, intended_use: "summarize" } });
  if (res.statusCode !== 201) throw new Error(`quote failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { quote: { quote_id: string } }).quote.quote_id;
}

interface AcceptBody {
  ok: true;
  acceptance: {
    acceptance_id: string; quote_id: string; status: string; listing_id: string; resource_id: string;
    settlement: { status: string; mock_amount: number | null; settlement_mode: string; is_mock: boolean };
    access_token: string | null; live_access_enabled: boolean; idempotent_replay: boolean; accepted_at: string;
  };
}
async function accept(token: string, quoteId: string): Promise<{ status: number; json: unknown; raw: string }> {
  const res = await app.inject({ method: "POST", url: `/api/v1/foundation/avp2/quote/${quoteId}/accept`, headers: auth(token) });
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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}aA_${randomUUID()}`, email: `${TEST_PREFIX}aA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}aB_${randomUUID()}`, email: `${TEST_PREFIX}aB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const owner = await member(orgA.entity_id);
  OWNER_TOKEN = owner.token; OWNER_ENTITY_ID = owner.entityId;
  STRANGER_TOKEN = (await member(orgB.entity_id)).token;
  LISTING_ID = await registerBookListing();
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1331 — AVP² Quote Acceptance Layer", () => {
  it("the creator accepts → PROJECTED mock settlement + single-use access token; never content", async () => {
    const quoteId = await createQuote(OWNER_TOKEN, LISTING_ID);
    const { status, json, raw } = await accept(OWNER_TOKEN, quoteId);
    expect(status).toBe(201);
    const a = (json as AcceptBody).acceptance;
    expect(a.status).toBe("ACCEPTED");
    expect(a.quote_id).toBe(quoteId);
    expect(a.settlement.status).toBe("PROJECTED");
    expect(a.settlement.settlement_mode).toBe("MOCK_ONLY");
    expect(a.settlement.is_mock).toBe(true);
    expect(a.settlement.mock_amount).toBeCloseTo(0.04); // floor 0.02 × qty 2
    expect(a.live_access_enabled).toBe(false);
    expect(a.idempotent_replay).toBe(false);
    expect(typeof a.access_token).toBe("string");
    expect(a.access_token?.startsWith("avp2_")).toBe(true);
    // The raw token is returned but its HASH is what the ledger stores.
    const ev = await prisma.auditEvent.findFirst({ where: { event_type: "AVP2_QUOTE_ACCEPTED", details: { path: ["quote_id"], equals: quoteId } } });
    const d = ev?.details as Record<string, unknown>;
    expect(typeof d?.access_token_hash).toBe("string");
    expect(d?.access_token_hash).not.toBe(a.access_token); // raw never stored
    expect(JSON.stringify(d)).not.toContain(a.access_token ?? "__none__");
    for (const t of ['"content"', '"body"', '"fragment"', '"payload"', "storage_location"]) expect(raw).not.toContain(t);
  });

  it("first-accept-wins idempotency: re-accept returns the same acceptance with NO fresh token", async () => {
    const quoteId = await createQuote(OWNER_TOKEN, LISTING_ID);
    const first = (await accept(OWNER_TOKEN, quoteId)).json as AcceptBody;
    const second = await accept(OWNER_TOKEN, quoteId);
    expect(second.status).toBe(201);
    const a2 = (second.json as AcceptBody).acceptance;
    expect(a2.acceptance_id).toBe(first.acceptance.acceptance_id); // same acceptance
    expect(a2.idempotent_replay).toBe(true);
    expect(a2.access_token).toBe(null); // token never re-disclosed
    expect(a2.settlement.status).toBe("PROJECTED");
    // Exactly one AVP2_QUOTE_ACCEPTED row for this quote.
    const count = await prisma.auditEvent.count({ where: { event_type: "AVP2_QUOTE_ACCEPTED", details: { path: ["quote_id"], equals: quoteId } } });
    expect(count).toBe(1);
  });

  it("actor-binding: a different entity holding a valid quote_id is denied (enumeration-safe QUOTE_NOT_FOUND)", async () => {
    const quoteId = await createQuote(OWNER_TOKEN, LISTING_ID);
    const res = await accept(STRANGER_TOKEN, quoteId);
    expect(res.status).toBe(404);
    expect((res.json as { code: string }).code).toBe("QUOTE_NOT_FOUND");
    // And the stranger's denial wrote no acceptance.
    const count = await prisma.auditEvent.count({ where: { event_type: "AVP2_QUOTE_ACCEPTED", details: { path: ["quote_id"], equals: quoteId } } });
    expect(count).toBe(0);
  });

  it("an expired quote cannot be accepted → QUOTE_EXPIRED", async () => {
    const quoteId = `quote_${randomUUID()}`;
    await writeAuditEvent({
      event_type: "AVP2_QUOTE_CREATED", outcome: "SUCCESS", actor_entity_id: OWNER_ENTITY_ID,
      details: {
        quote_id: quoteId, listing_id: LISTING_ID, provider_entity_id: OWNER_ENTITY_ID,
        resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", mock_price: 0.04,
        settlement_mode: "MOCK_ONLY", expires_at: new Date(Date.now() - 60_000).toISOString(), is_mock: true,
      },
    });
    const res = await accept(OWNER_TOKEN, quoteId);
    expect(res.status).toBe(409);
    expect((res.json as { code: string }).code).toBe("QUOTE_EXPIRED");
  });

  it("expiry gates NEW acceptances only: an already-accepted quote stays retrievable after it expires", async () => {
    // Synthesize a quote that is ALREADY accepted, then expire it. Re-accept must
    // return the existing acceptance (a committed acceptance is a fact), not 409.
    const quoteId = `quote_${randomUUID()}`;
    const acceptanceId = `accept_${randomUUID()}`;
    await writeAuditEvent({
      event_type: "AVP2_QUOTE_CREATED", outcome: "SUCCESS", actor_entity_id: OWNER_ENTITY_ID,
      details: {
        quote_id: quoteId, listing_id: LISTING_ID, provider_entity_id: OWNER_ENTITY_ID,
        resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", mock_price: 0.04,
        settlement_mode: "MOCK_ONLY", expires_at: new Date(Date.now() - 60_000).toISOString(), is_mock: true,
      },
    });
    await writeAuditEvent({
      event_type: "AVP2_QUOTE_ACCEPTED", outcome: "SUCCESS", actor_entity_id: OWNER_ENTITY_ID,
      details: {
        quote_id: quoteId, acceptance_id: acceptanceId, listing_id: LISTING_ID, provider_entity_id: OWNER_ENTITY_ID,
        resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", mock_price: 0.04,
        settlement_mode: "MOCK_ONLY", settlement_status: "PROJECTED", access_token_hash: "deadbeef", is_mock: true,
      },
    });
    const res = await accept(OWNER_TOKEN, quoteId);
    expect(res.status).toBe(201);
    const a = (res.json as AcceptBody).acceptance;
    expect(a.acceptance_id).toBe(acceptanceId);
    expect(a.idempotent_replay).toBe(true);
    expect(a.access_token).toBe(null);
  });

  it("unknown quote → QUOTE_NOT_FOUND; no auth → 401", async () => {
    const unknown = await accept(OWNER_TOKEN, `quote_${randomUUID()}`);
    expect(unknown.status).toBe(404);
    expect((unknown.json as { code: string }).code).toBe("QUOTE_NOT_FOUND");
    const noAuth = await app.inject({ method: "POST", url: `/api/v1/foundation/avp2/quote/quote_x/accept` });
    expect(noAuth.statusCode).toBe(401);
  });
});
