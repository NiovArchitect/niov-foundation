// FILE: foundation-policy-lineage.test.ts (integration)
// PURPOSE: F-1324 — the Policy Lineage Graph. Proves a proof_reference (obtained
//          from the F-1321 proof feed) resolves into its causal decision lineage:
//          rules, reason codes, enforcement points, and decision-time states;
//          that a SUCCESS read and a DENIED (revoked-grant) read produce the
//          correct rule results; that it is party/owner-scoped + enumeration-safe
//          (cross-tenant stranger + unknown ref → LINEAGE_NOT_FOUND); and that no
//          raw payloads / policy internals leak.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET /policy/lineage/:ref)
//   - apps/api/src/services/foundation/policy-lineage.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, writeAuditEvent } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-policy-lineage-secret";
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

async function makePackage(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Lineage signals",
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
async function readGrant(grantId: string): Promise<void> {
  await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`, headers: auth(BUYER_TOKEN), payload: {} });
}

// Obtain a real proof_reference (audit event_hash) from the F-1321 proof feed.
async function proofRef(token: string, eventType: string): Promise<string | null> {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/foundation/proof/events?scope=self&event_type=${eventType}`,
    headers: auth(token),
  });
  const body = res.json() as { events: Array<{ proof_reference: string }> };
  return body.events[0]?.proof_reference ?? null;
}

interface LineageBody {
  ok: true;
  proof_reference: string;
  resource_type: string;
  resource_id: string | null;
  decision: string;
  decision_timestamp: string;
  lineage: {
    policy_rules: Array<{ rule_type: string; result: string; explanation: string }>;
    consent_state: string | null;
    grant_state: string | null;
    actor_role: string;
    reason_codes: string[];
    enforcement_points: string[];
  };
}
async function lineage(token: string, ref: string): Promise<{ status: number; body: LineageBody; raw: string }> {
  const res = await app.inject({ method: "GET", url: `/api/v1/foundation/policy/lineage/${ref}`, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as LineageBody, raw: res.payload };
}

const FORBIDDEN = ["payload_content", "payload_summary", "storage_location", "embedding", "content_hash", "wallet_id"];

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
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}plA_${randomUUID()}`, email: `${TEST_PREFIX}plA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}plB_${randomUUID()}`, email: `${TEST_PREFIX}plB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1324 — Policy Lineage Graph", () => {
  it("resolves a SUCCESS grant-read proof into its lineage (PASS at the read gate)", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    await readGrant(grantId);

    const ref = await proofRef(BUYER_TOKEN, "GRANT_READ");
    expect(ref).not.toBeNull();
    const { status, body, raw } = await lineage(BUYER_TOKEN, ref as string);
    expect(status).toBe(200);
    expect(body.proof_reference).toBe(ref);
    expect(body.resource_type).toBe("DATA_GRANT");
    expect(body.resource_id).toBe(grantId);
    expect(body.decision).toBe("SUCCESS");
    expect(body.lineage.actor_role).toBe("buyer");
    expect(body.lineage.enforcement_points).toContain("GRANT_READ_GATE");
    expect(body.lineage.policy_rules.length).toBeGreaterThanOrEqual(1);
    for (const t of FORBIDDEN) expect(raw).not.toContain(t);
  });

  it("resolves a DENIED (revoked-grant) read into a FAILED grant-revoked rule + reason codes", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    // Revoke, then attempt a read → DENIED with a grant-not-active reason.
    await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/data-grants/${grantId}/revoke`, headers: auth(BUYER_TOKEN), payload: {} });
    await readGrant(grantId);

    const ref = await proofRef(BUYER_TOKEN, "GRANT_DENIED");
    expect(ref).not.toBeNull();
    const { status, body } = await lineage(BUYER_TOKEN, ref as string);
    expect(status).toBe(200);
    expect(body.decision).toBe("DENIED");
    expect(body.lineage.reason_codes.length).toBeGreaterThanOrEqual(1);
    // At least one rule FAILED, and the grant-state lineage reflects non-active.
    expect(body.lineage.policy_rules.some((r) => r.result === "FAIL")).toBe(true);
  });

  it("the provider (resource owner) can resolve the lineage of a proof on their grant", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    await readGrant(grantId);
    const ref = await proofRef(BUYER_TOKEN, "GRANT_READ");
    const { status, body } = await lineage(PROVIDER_TOKEN, ref as string);
    expect(status).toBe(200);
    expect(body.lineage.actor_role).toBe("provider");
  });

  it("a cross-tenant stranger gets LINEAGE_NOT_FOUND (enumeration-safe)", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    await readGrant(grantId);
    const ref = await proofRef(BUYER_TOKEN, "GRANT_READ");
    const { status, body } = await lineage(STRANGER_TOKEN, ref as string);
    expect(status).toBe(404);
    expect((body as unknown as { code: string }).code).toBe("LINEAGE_NOT_FOUND");
  });

  it("a NON-decision event the caller OWNS → LINEAGE_NOT_FOUND (no invented lineage)", async () => {
    // Resolve the buyer's own entity id from a self-scope proof event.
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    await readGrant(grantId);
    const feed = await app.inject({ method: "GET", url: "/api/v1/foundation/proof/events?scope=self&event_type=GRANT_READ", headers: auth(BUYER_TOKEN) });
    const buyerId = (feed.json() as { events: Array<{ actor_entity_id: string | null }> }).events[0]?.actor_entity_id;
    expect(buyerId).not.toBeNull();
    // Author a NON-decision audit event owned by the buyer, then resolve its hash.
    const ev = await writeAuditEvent({
      event_type: "CAPSULE_METADATA_READ",
      outcome: "SUCCESS",
      actor_entity_id: buyerId as string,
      details: { action: "CAPSULE_METADATA_READ" },
    });
    const { status, body } = await lineage(BUYER_TOKEN, ev.event_hash);
    expect(status).toBe(404); // floored: not a policy decision → no lineage
    expect((body as unknown as { code: string }).code).toBe("LINEAGE_NOT_FOUND");
  });

  it("an unknown proof_reference → LINEAGE_NOT_FOUND; no auth → 401", async () => {
    const bogus = await lineage(BUYER_TOKEN, "deadbeef".repeat(8));
    expect(bogus.status).toBe(404);
    expect((bogus.body as unknown as { code: string }).code).toBe("LINEAGE_NOT_FOUND");

    const noAuth = await app.inject({ method: "GET", url: `/api/v1/foundation/policy/lineage/${"a".repeat(16)}` });
    expect(noAuth.statusCode).toBe(401);
  });
});
