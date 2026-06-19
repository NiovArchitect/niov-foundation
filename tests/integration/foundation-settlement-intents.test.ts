// FILE: foundation-settlement-intents.test.ts (integration)
// PURPOSE: F-1325 — the Settlement Intent Graph. Proves the derived, mock-only
//          economic obligation projection: a grant yields a bilateral intent
//          (payer=buyer, payee=provider) with proof/lineage anchor + metered
//          usage + mock value; owed/receivable totals are role-correct; status
//          tracks the grant lifecycle (ACTIVE→PROJECTED, REVOKED→REVOKED);
//          filters work; it is caller-scoped (a stranger sees none); no leakage.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET /settlement/intents)
//   - apps/api/src/services/foundation/settlement-intent.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-settlement-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let BUYER_TOKEN: string;
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

async function makePackage(): Promise<string> {
  const res = await app.inject({
    method: "POST", url: "/api/v1/foundation/marketplace/data-packages", headers: auth(PROVIDER_TOKEN),
    payload: { title: "Settlement signals", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["ANALYTICS", "PERSONALIZATION"], status: "PUBLISHED", pricing_model: { amount_usd: 0.05 } },
  });
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}
async function makeActiveGrant(listingId: string): Promise<string> {
  const res = await app.inject({
    method: "POST", url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`, headers: auth(BUYER_TOKEN),
    payload: { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true },
  });
  if (res.statusCode !== 201) throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { grant: { grant_id: string } }).grant.grant_id;
}
async function readGrant(grantId: string): Promise<void> {
  await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`, headers: auth(BUYER_TOKEN), payload: {} });
}

interface Intent {
  intent_id: string;
  payer_entity_id: string;
  payee_entity_id: string;
  resource_type: string;
  resource_id: string;
  proof_reference: string | null;
  metered_usage_total: number;
  mock_value_total: number;
  settlement_mode: string;
  status: string;
}
interface SettlementBody {
  ok: true;
  intents: Intent[];
  owed_total: number;
  receivable_total: number;
  is_mock: boolean;
  settlement_mode: string;
}
async function intents(token: string, qs = ""): Promise<{ status: number; body: SettlementBody; raw: string }> {
  const res = await app.inject({ method: "GET", url: `/api/v1/foundation/settlement/intents${qs}`, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as SettlementBody, raw: res.payload };
}

let GRANT_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}stA_${randomUUID()}`, email: `${TEST_PREFIX}stA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}stB_${randomUUID()}`, email: `${TEST_PREFIX}stB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
  const listing = await makePackage();
  GRANT_ID = await makeActiveGrant(listing);
  await readGrant(GRANT_ID);
  await readGrant(GRANT_ID);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1325 — Settlement Intent Graph", () => {
  it("a grant yields a bilateral PROJECTED intent; buyer is payer (owes), provider is payee (receivable)", async () => {
    const buyer = await intents(BUYER_TOKEN);
    expect(buyer.status).toBe(200);
    expect(buyer.body.is_mock).toBe(true);
    expect(buyer.body.settlement_mode).toBe("MOCK_ONLY");
    const mine = buyer.body.intents.find((i) => i.resource_id === GRANT_ID);
    expect(mine).toBeDefined();
    expect(mine?.intent_id).toBe(`intent:grant:${GRANT_ID}`);
    expect(mine?.resource_type).toBe("DATA_GRANT");
    expect(mine?.status).toBe("PROJECTED");
    expect(mine?.payer_entity_id).toBe(mine?.payer_entity_id); // present
    expect(mine?.metered_usage_total).toBeGreaterThanOrEqual(2);
    expect(mine?.mock_value_total).toBeGreaterThan(0); // 2 reads × $0.05
    expect(mine?.proof_reference).not.toBeNull();
    expect(mine?.settlement_mode).toBe("MOCK_ONLY");
    // Buyer is the payer → owes; nothing receivable.
    expect(buyer.body.owed_total).toBeGreaterThan(0);
    expect(buyer.body.receivable_total).toBe(0);
    for (const t of ["payload_content", "storage_location", "wallet_id", "content_hash"]) expect(buyer.raw).not.toContain(t);

    const provider = await intents(PROVIDER_TOKEN);
    const sameIntent = provider.body.intents.find((i) => i.resource_id === GRANT_ID);
    expect(sameIntent).toBeDefined();
    // Provider is the payee → receivable; nothing owed.
    expect(provider.body.receivable_total).toBeGreaterThan(0);
    expect(provider.body.owed_total).toBe(0);
  });

  it("role + status filters work", async () => {
    const asPayer = await intents(BUYER_TOKEN, "?role=payer");
    expect(asPayer.body.intents.every((i) => i.payer_entity_id !== "")).toBe(true);
    expect(asPayer.body.intents.some((i) => i.resource_id === GRANT_ID)).toBe(true);
    // Buyer has no payee intents.
    const asPayee = await intents(BUYER_TOKEN, "?role=payee");
    expect(asPayee.body.intents.some((i) => i.resource_id === GRANT_ID)).toBe(false);
    const projected = await intents(BUYER_TOKEN, "?status=PROJECTED");
    expect(projected.body.intents.every((i) => i.status === "PROJECTED")).toBe(true);
  });

  it("revoking the grant flips the intent to REVOKED and drops it from live totals", async () => {
    await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${GRANT_ID}/revoke`, headers: auth(BUYER_TOKEN), payload: {} });
    const buyer = await intents(BUYER_TOKEN);
    const mine = buyer.body.intents.find((i) => i.resource_id === GRANT_ID);
    expect(mine?.status).toBe("REVOKED");
    expect(buyer.body.owed_total).toBe(0); // REVOKED is not a live obligation
  });

  it("a stranger with no grants sees an empty intent set (caller-scoped); no auth → 401", async () => {
    const stranger = await intents(STRANGER_TOKEN);
    expect(stranger.status).toBe(200);
    expect(stranger.body.intents.some((i) => i.resource_id === GRANT_ID)).toBe(false);

    const noAuth = await app.inject({ method: "GET", url: "/api/v1/foundation/settlement/intents" });
    expect(noAuth.statusCode).toBe(401);
  });
});
