// FILE: foundation-capability-contracts.test.ts (integration)
// PURPOSE: F-1326 — Callable Capability Contracts. Proves a capability (listing)
//          yields a derived governance contract (callable modes, allowed in/out,
//          proof/consent, metering, mock price, access policy) that NEVER enables
//          live execution; that it is visible to the owner and to same-org viewers
//          of a PUBLISHED capability; and that it is enumeration-safe
//          (cross-tenant / unknown → LISTING_NOT_FOUND).
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET .../listings/:id/contracts)
//   - apps/api/src/services/foundation/capability-contract.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-capability-contracts-secret";
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

async function registerCapability(): Promise<string> {
  const res = await app.inject({
    method: "POST", url: "/api/v1/foundation/marketplace/listings", headers: auth(OWNER_TOKEN),
    payload: {
      listing_type: "AGENT", title: "Governed agent", description: "d", status: "PUBLISHED",
      required_authority: ["READ"], required_memory_scope: ["PREFERENCE"],
      pricing_model: { amount_usd: 0.25 },
      trust_metadata: {
        callable_modes: ["GOVERNED_INVOKE"], allowed_inputs: ["TEXT"], allowed_outputs: ["JSON"],
        proof_required: true, consent_required: true, metering_unit: "invocation", mock_price_usd: 0.5, policy_summary: "scoped use only",
      },
    },
  });
  if (res.statusCode !== 201) throw new Error(`listing failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

interface ContractsBody {
  ok: true;
  capability_id: string;
  contracts: Array<{
    contract_id: string; capability_id: string; owner_entity_id: string;
    callable_modes: string[]; allowed_inputs: string[]; allowed_outputs: string[];
    proof_required: boolean; consent_required: boolean; metering_unit: string | null;
    mock_price: number | null; settlement_mode: string; live_execution_enabled: boolean; status: string;
    access_policy: { required_authority: string[]; required_memory_scope: string[]; policy_summary: string | null };
  }>;
}
async function contracts(token: string, listingId: string): Promise<{ status: number; body: ContractsBody; raw: string }> {
  const res = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/listings/${listingId}/contracts`, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as ContractsBody, raw: res.payload };
}

let CAP_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}ccA_${randomUUID()}`, email: `${TEST_PREFIX}ccA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}ccB_${randomUUID()}`, email: `${TEST_PREFIX}ccB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  OWNER_TOKEN = await member(orgA.entity_id);
  SAMEORG_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
  CAP_ID = await registerCapability();
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1326 — Callable Capability Contracts", () => {
  it("owner sees the derived contract; governance reads from trust_metadata; NEVER live execution", async () => {
    const { status, body } = await contracts(OWNER_TOKEN, CAP_ID);
    expect(status).toBe(200);
    expect(body.capability_id).toBe(CAP_ID);
    expect(body.contracts.length).toBe(1);
    const c = body.contracts[0];
    expect(c?.contract_id).toBe(`contract:listing:${CAP_ID}`);
    expect(c?.live_execution_enabled).toBe(false);
    expect(c?.settlement_mode).toBe("MOCK_ONLY");
    expect(c?.callable_modes).toEqual(["GOVERNED_INVOKE"]);
    expect(c?.allowed_inputs).toEqual(["TEXT"]);
    expect(c?.allowed_outputs).toEqual(["JSON"]);
    expect(c?.proof_required).toBe(true);
    expect(c?.consent_required).toBe(true);
    expect(c?.metering_unit).toBe("invocation");
    expect(c?.mock_price).toBe(0.5);
    expect(c?.access_policy.required_authority).toEqual(["READ"]);
    expect(c?.access_policy.policy_summary).toBe("scoped use only");
    // No execution endpoints / secret values / raw payloads on the contract
    // objects themselves (the safety note legitimately uses words like "secrets").
    const contractsJson = JSON.stringify(body.contracts);
    for (const t of ["invoke_url", "api_key", "secret_", "payload_content", "execution_endpoint"]) expect(contractsJson).not.toContain(t);
    // And the contract explicitly disables live execution.
    expect(c?.live_execution_enabled).toBe(false);
  });

  it("a same-org viewer can read a PUBLISHED capability's contract", async () => {
    const { status, body } = await contracts(SAMEORG_TOKEN, CAP_ID);
    expect(status).toBe(200);
    expect(body.contracts[0]?.capability_id).toBe(CAP_ID);
  });

  it("a cross-tenant stranger and an unknown id → LINEAGE-style LISTING_NOT_FOUND", async () => {
    const stranger = await contracts(STRANGER_TOKEN, CAP_ID);
    expect(stranger.status).toBe(404);
    expect((stranger.body as unknown as { code: string }).code).toBe("LISTING_NOT_FOUND");

    const unknown = await contracts(OWNER_TOKEN, randomUUID());
    expect(unknown.status).toBe(404);
  });

  it("no auth → 401", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/foundation/marketplace/listings/${CAP_ID}/contracts` });
    expect(res.statusCode).toBe(401);
  });
});
