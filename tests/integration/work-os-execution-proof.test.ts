// FILE: work-os-execution-proof.test.ts (integration)
// PURPOSE: Phase 1283 — HTTP-level coverage for the execution proof layer:
//          execution-attempts auto-recording, the execution-proof summary
//          route, persisted coordination + watcher state on the ledger row,
//          and Blind Spots failed-attempt integration. End-to-end via
//          buildApp against the test DB (work_ledger_entries +
//          execution_attempts populated by CI's npm run db:push).
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/work-ledger.service.ts
//   - apps/api/src/services/work-os/execution-verification.service.ts

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { randomBytes } from "node:crypto";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "work-os-execution-proof-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;
let ORG_ID: string;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  ORG_ID = org.entity_id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function login(): Promise<{ entityId: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: ORG_ID, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: `10.91.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return { entityId: ent.entity_id, token: (res.json() as { token: string }).token };
}

async function createLedger(token: string, body: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/work-os/ledger",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { entry: { ledger_entry_id: string } }).entry.ledger_entry_id;
}

describe("execution proof layer", () => {
  it("auto-records a VERIFIED WORK_LEDGER_CREATE attempt; proof route returns it", async () => {
    const { token } = await login();
    const lid = await createLedger(token, { ledger_type: "FOLLOW_UP", title: "proof a" });

    const attemptsRes = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${lid}/execution-attempts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(attemptsRes.statusCode).toBe(200);
    const attempts = (attemptsRes.json() as { attempts: Array<{ attempt_type: string; status: string }> }).attempts;
    const create = attempts.find((a) => a.attempt_type === "WORK_LEDGER_CREATE");
    expect(create?.status).toBe("VERIFIED");

    const proofRes = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${lid}/execution-proof`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(proofRes.statusCode).toBe(200);
    const proof = (proofRes.json() as { proof: { has_verified_ledger_create: boolean; proof_status: string } }).proof;
    expect(proof.has_verified_ledger_create).toBe(true);
    expect(["VERIFIED", "PARTIAL"]).toContain(proof.proof_status);
  });

  it("persists a coordination summary on the ledger row, readable from My Work later", async () => {
    const { token } = await login();
    const lid = await createLedger(token, { ledger_type: "FOLLOW_UP", title: "proof coord" });

    const myWork = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(myWork.statusCode).toBe(200);
    const item = (myWork.json() as { items: Array<{ ledger_entry_id: string; coordination?: { runtime: string } }> })
      .items.find((i) => i.ledger_entry_id === lid);
    // Coordination is persisted post-dispatch (BEAM unavailable in test => a
    // recorded runtime, never faked as dispatched).
    expect(item?.coordination?.runtime).toBeDefined();
  });

  it("surfaces a FAILED execution attempt in Blind Spots as a runtime issue", async () => {
    const { token, entityId } = await login();
    const lid = await createLedger(token, { ledger_type: "TASK", title: "proof blind", owner_entity_id: entityId });
    await prisma.executionAttempt.create({
      data: {
        ledger_entry_id: lid, org_entity_id: ORG_ID, attempt_type: "BEAM_FANOUT",
        runtime: "BEAM", evidence_type: "PROVIDER_RESPONSE", status: "FAILED", error_code: "http_500",
      },
    });
    const blind = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/blind-spots",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(blind.statusCode).toBe(200);
    const found = (blind.json() as { items: Array<{ ledger_entry_id: string; blind_spot_reason?: string }> })
      .items.find((i) => i.ledger_entry_id === lid);
    expect(found?.blind_spot_reason).toBe("COORDINATION_FAILED");
  });

  it("does not leak attempts across tenants", async () => {
    const { token } = await login();
    const lid = await createLedger(token, { ledger_type: "FOLLOW_UP", title: "proof iso" });
    // A second org's caller cannot read this entry's attempts.
    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}org2_${randomUUID()}`,
      email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`,
      public_key: "k",
      clearance_level: 0,
    });
    const pw = "correct-horse-battery";
    const otherInput = makeEntityInput({ entity_type: "PERSON", password: pw });
    const otherEnt = await createEntity(otherInput);
    await prisma.entityMembership.create({
      data: { parent_id: otherOrg.entity_id, child_id: otherEnt.entity_id, role_title: "MEMBER", is_active: true },
    });
    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: otherInput.email, password: pw, requested_operations: ["read"] },
      remoteAddress: "10.92.1.1",
    });
    const otherToken = (otherLogin.json() as { token: string }).token;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/work-os/ledger/${lid}/execution-attempts`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(404); // cross-tenant entry read denied first
  });
});

// ── [PROD-UX-SCALE] my-work server pagination — the fixed take:200 truncated
//    silently once a caller crossed 200 items (observed live). ──
describe("GET /work-os/my-work pagination", () => {
  it("pages with skip/take, reports has_more, and never duplicates rows", async () => {
    const { token } = await login();
    for (let i = 0; i < 5; i++) {
      await createLedger(token, { ledger_type: "FOLLOW_UP", title: `page item ${i}` });
    }
    const p1 = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work?take=2",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(p1.statusCode).toBe(200);
    const b1 = p1.json() as { items: Array<{ ledger_entry_id: string }>; has_more: boolean; skip: number; take: number };
    expect(b1.items).toHaveLength(2);
    expect(b1.has_more).toBe(true);
    expect(b1.skip).toBe(0);
    const p2 = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work?skip=2&take=2",
      headers: { authorization: `Bearer ${token}` },
    });
    const b2 = p2.json() as { items: Array<{ ledger_entry_id: string }>; has_more: boolean };
    expect(b2.items).toHaveLength(2);
    const ids1 = new Set(b1.items.map((i) => i.ledger_entry_id));
    expect(b2.items.some((i) => ids1.has(i.ledger_entry_id))).toBe(false);
    // Default call (no params) stays the legacy first page + has_more field.
    const legacy = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work",
      headers: { authorization: `Bearer ${token}` },
    });
    const bl = legacy.json() as { items: unknown[]; has_more: boolean };
    expect(bl.items.length).toBeGreaterThanOrEqual(5);
    expect(bl.has_more).toBe(false);
    // Scoping is preserved: another caller sees NONE of these rows.
    const other = await login();
    const theirPage = await app.inject({
      method: "GET",
      url: "/api/v1/work-os/my-work?take=200",
      headers: { authorization: `Bearer ${other.token}` },
    });
    const tb = theirPage.json() as { items: Array<{ ledger_entry_id: string }> };
    expect(tb.items.some((i) => ids1.has(i.ledger_entry_id))).toBe(false);
  });
});
