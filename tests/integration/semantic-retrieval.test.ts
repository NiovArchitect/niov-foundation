// FILE: semantic-retrieval.test.ts (integration)
// PURPOSE: Phase 1285-W — HTTP-level coverage for the semantic-retrieval query
//          route: Foundation assembles a SCOPED candidate set over durable Work
//          Ledger rows, ranks deterministically (Python is NOT configured in the
//          test env, so this proves the deterministic fallback works without
//          Python), and never leaks across tenants or surfaces raw UUIDs as the
//          primary label. End-to-end via buildApp against the test DB.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/semantic-retrieval.service.ts

import { randomUUID, randomBytes } from "node:crypto";
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

const TEST_JWT_SECRET = "semantic-retrieval-test-secret";
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

async function login(orgId: string): Promise<{ entityId: string; token: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const ent = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: ent.entity_id, role_title: "MEMBER", is_active: true },
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
    remoteAddress: `10.93.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
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

interface RetrievalResult {
  result_id: string;
  title: string;
  score: number;
  provenance: string;
  related_person: { display_name: string } | null;
}
interface QueryBody {
  ok: boolean;
  results: RetrievalResult[];
  envelope: { capability: string; status: string; authority: string | null };
}

async function query(token: string, payload: Record<string, unknown>): Promise<QueryBody> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/work-os/semantic-retrieval/query",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as QueryBody;
}

describe("semantic retrieval query route", () => {
  it("returns deterministic, relevance-ranked results when Python is not configured", async () => {
    const { token } = await login(ORG_ID);
    const decisionId = await createLedger(token, {
      ledger_type: "DECISION",
      title: "Onboarding copy decision",
      summary: "We decided to go with the new onboarding copy.",
    });
    await createLedger(token, { ledger_type: "TASK", title: "Order standing desks", summary: "Facilities to order desks." });

    const body = await query(token, { query: "what did we decide about onboarding" });
    expect(body.ok).toBe(true);
    expect(body.envelope.capability).toBe("SEMANTIC_RETRIEVAL");
    // Python is not wired in the test env => honest NOT_CONFIGURED, no authority,
    // deterministic results still returned (the flow never blocks on Python).
    expect(body.envelope.status).toBe("NOT_CONFIGURED");
    expect(body.envelope.authority).toBe(null);
    expect(body.results[0]!.result_id).toBe(decisionId);
    expect(body.results[0]!.provenance).toBe("foundation:deterministic-lexical");
    // The unrelated desks task carries no overlap and is excluded.
    expect(body.results.map((r) => r.title)).not.toContain("Order standing desks");
    // Primary label is the title, never a raw UUID.
    expect(body.results[0]!.title).toBe("Onboarding copy decision");
    expect(body.results[0]!.title).not.toBe(body.results[0]!.result_id);
  });

  it("422s an empty query", async () => {
    const { token } = await login(ORG_ID);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/work-os/semantic-retrieval/query",
      headers: { authorization: `Bearer ${token}` },
      payload: { query: "   " },
    });
    expect(res.statusCode).toBe(422);
  });

  it("never surfaces another tenant's records", async () => {
    // Tenant A creates a uniquely-titled record.
    const a = await login(ORG_ID);
    const marker = `zephyrquux-${randomUUID().slice(0, 8)}`;
    await createLedger(a.token, { ledger_type: "DECISION", title: `Secret ${marker} plan`, summary: `confidential ${marker}` });

    // Tenant B (separate org) queries the same distinctive term.
    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}org2_${randomUUID()}`,
      email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`,
      public_key: "k",
      clearance_level: 0,
    });
    const b = await login(otherOrg.entity_id);
    const body = await query(b.token, { query: `${marker}` });
    expect(body.results.map((r) => r.title)).not.toContain(`Secret ${marker} plan`);
    expect(body.results.every((r) => !r.title.includes(marker))).toBe(true);
  });

  it("respects source_filter on candidate_type", async () => {
    const { token } = await login(ORG_ID);
    const marker = `xeniaplex-${randomUUID().slice(0, 8)}`;
    const blockerId = await createLedger(token, { ledger_type: "BLOCKER", title: `${marker} blocker`, summary: "blocked" });
    const followUpId = await createLedger(token, { ledger_type: "FOLLOW_UP", title: `${marker} follow up`, summary: "follow up" });

    const body = await query(token, { query: marker, source_filter: ["BLOCKER"] });
    const ids = body.results.map((r) => r.result_id);
    expect(ids).toContain(blockerId); // BLOCKER is eligible under the filter
    expect(ids).not.toContain(followUpId); // FOLLOW_UP is filtered out
  });
});
