// FILE: foundation-avp2-access.test.ts (integration)
// PURPOSE: F-1332 — AVP² Access Receipt Layer + the FULL quote→accept→access loop
//          end-to-end. Proves an agent can quote, accept, then present its token
//          to RECORD access and receive a Proof-of-Access — and that Foundation
//          NEVER delivers content (delivered:false), the token is hash-verified +
//          actor-bound, and access is metered (multiple records allowed). The
//          loop is the protocol.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (POST /avp2/access)
//   - apps/api/src/services/foundation/avp2-access.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-avp2-access-secret";
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
      trust_metadata: { proof_required: true, quote_required: true, resources: [{ resource_id: "book-demo.chapter-7", resource_type: "CONTENT_FRAGMENT", title: "Chapter 7", mock_price_floor: 0.02 }] },
    },
  });
  if (res.statusCode !== 201) throw new Error(`listing failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

async function quoteAndAccept(token: string, listingId: string): Promise<{ quoteId: string; accessToken: string; acceptanceId: string }> {
  const qr = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/quote", headers: auth(token), payload: { resource_request: { listing_id: listingId, resource_id: "book-demo.chapter-7" }, intended_use: "read" } });
  const quoteId = (qr.json() as { quote: { quote_id: string } }).quote.quote_id;
  const ar = await app.inject({ method: "POST", url: `/api/v1/foundation/avp2/quote/${quoteId}/accept`, headers: auth(token) });
  const a = (ar.json() as { acceptance: { access_token: string; acceptance_id: string } }).acceptance;
  return { quoteId, accessToken: a.access_token, acceptanceId: a.acceptance_id };
}

interface ReceiptBody {
  ok: true;
  receipt: {
    access_id: string; quote_id: string; acceptance_id: string; listing_id: string; resource_id: string;
    content_delivery: { delivered: boolean; reason: string; note: string };
    proof: { proof_reference: string; verified: boolean; settlement_mode: string; is_mock: boolean; recorded_at: string };
    recorded_at: string;
  };
}
async function access(token: string, body: unknown): Promise<{ status: number; json: unknown; raw: string }> {
  const res = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/access", headers: auth(token), payload: body as Record<string, unknown> });
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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}xA_${randomUUID()}`, email: `${TEST_PREFIX}xA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}xB_${randomUUID()}`, email: `${TEST_PREFIX}xB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  OWNER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
  LISTING_ID = await registerBookListing();
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1332 — AVP² Access Receipt Layer (the full quote→accept→access loop)", () => {
  it("quote → accept → access produces a Proof-of-Access; delivered is ALWAYS false; proof_reference resolves to the recorded event", async () => {
    const { quoteId, accessToken, acceptanceId } = await quoteAndAccept(OWNER_TOKEN, LISTING_ID);
    const { status, json, raw } = await access(OWNER_TOKEN, { access_token: accessToken, agent_context: { agent_id: "agent-9" } });
    expect(status).toBe(201);
    const r = (json as ReceiptBody).receipt;
    expect(r.quote_id).toBe(quoteId);
    expect(r.acceptance_id).toBe(acceptanceId);
    expect(r.resource_id).toBe("book-demo.chapter-7");
    // The hard safety net — Foundation never delivers content.
    expect(r.content_delivery.delivered).toBe(false);
    expect(r.content_delivery.reason).toBe("DELIVERY_NOT_ENABLED_IN_FOUNDATION");
    expect(r.proof.verified).toBe(true);
    expect(r.proof.settlement_mode).toBe("MOCK_ONLY");
    expect(r.proof.is_mock).toBe(true);
    expect(r.proof.proof_reference.length).toBeGreaterThan(0);
    // proof_reference IS the AVP2_ACCESS_RECORDED event hash (resolvable by F-1321/F-1324).
    const ev = await prisma.auditEvent.findFirst({ where: { event_hash: r.proof.proof_reference } });
    expect(ev?.event_type).toBe("AVP2_ACCESS_RECORDED");
    expect((ev?.details as Record<string, unknown>)?.delivered).toBe(false);
    expect((ev?.details as Record<string, unknown>)?.access_id).toBe(r.access_id);
    // Never any content / raw token on the wire.
    for (const t of ['"content"', '"body"', '"fragment"', '"payload"', "storage_location"]) expect(raw).not.toContain(t);
    expect(raw).not.toContain(accessToken);
  });

  it("access is metered: the same token may record access more than once", async () => {
    const { accessToken } = await quoteAndAccept(OWNER_TOKEN, LISTING_ID);
    const first = await access(OWNER_TOKEN, { access_token: accessToken });
    const second = await access(OWNER_TOKEN, { access_token: accessToken });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a1 = (first.json as ReceiptBody).receipt.access_id;
    const a2 = (second.json as ReceiptBody).receipt.access_id;
    expect(a1).not.toBe(a2); // distinct usage occurrences
    expect((second.json as ReceiptBody).receipt.content_delivery.delivered).toBe(false);
  });

  it("actor-binding: a different entity presenting a valid token is denied (ACCESS_DENIED)", async () => {
    const { accessToken } = await quoteAndAccept(OWNER_TOKEN, LISTING_ID);
    const res = await access(STRANGER_TOKEN, { access_token: accessToken });
    expect(res.status).toBe(403);
    expect((res.json as { code: string }).code).toBe("ACCESS_DENIED");
  });

  it("invalid token → ACCESS_DENIED; missing token → 422; no auth → 401", async () => {
    const bad = await access(OWNER_TOKEN, { access_token: "avp2_not_a_real_token" });
    expect(bad.status).toBe(403);
    expect((bad.json as { code: string }).code).toBe("ACCESS_DENIED");
    const missing = await access(OWNER_TOKEN, {});
    expect(missing.status).toBe(422);
    expect((missing.json as { code: string }).code).toBe("ACCESS_TOKEN_REQUIRED");
    const noAuth = await app.inject({ method: "POST", url: "/api/v1/foundation/avp2/access", payload: { access_token: "x" } });
    expect(noAuth.statusCode).toBe(401);
  });
});
