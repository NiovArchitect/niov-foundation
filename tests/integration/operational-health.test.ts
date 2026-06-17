// FILE: operational-health.test.ts (integration)
// PURPOSE: Phase 1285-Z — HTTP-level coverage for the operational-health route:
//          Foundation assembles a scoped execution-health snapshot from durable
//          Work Ledger + watcher state, returns DETERMINISTIC health_score /
//          status / counts (Python NOT configured in the test env → honest
//          NOT_CONFIGURED, no authority), reflects created blocked/overdue work
//          in the counts, isolates tenants, and surfaces no raw UUID labels.
//          End-to-end via buildApp against the test DB.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/operational-analytics.service.ts

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

const TEST_JWT_SECRET = "operational-health-test-secret";
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
    remoteAddress: `10.96.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return { entityId: ent.entity_id, token: (res.json() as { token: string }).token };
}

async function createLedger(token: string, body: Record<string, unknown>): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/work-os/ledger",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  expect(res.statusCode).toBe(201);
}

interface HealthBody {
  ok: boolean;
  health: {
    scope: string;
    health_score: number;
    execution_status: string;
    summary: string;
    blocked_count: number;
    overdue_count: number;
    recurring_blockers: string[];
    overloaded_people: string[];
    provenance: string;
    human_review_needed: boolean;
  };
  envelope: { capability: string; status: string; authority: string | null };
}

async function health(token: string): Promise<HealthBody> {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/work-os/operational-health",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as HealthBody;
}

describe("operational health route", () => {
  it("returns deterministic health from durable work when Python is not configured", async () => {
    const { token } = await login(ORG_ID);
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await createLedger(token, { ledger_type: "TASK", title: "Overdue launch task", due_at: past });
    await createLedger(token, { ledger_type: "BLOCKER", title: "Compliance blocker" });

    const b = await health(token);
    expect(b.ok).toBe(true);
    expect(b.envelope.capability).toBe("OPERATIONAL_ANALYTICS");
    expect(b.envelope.status).toBe("NOT_CONFIGURED"); // honest — Python not wired
    expect(b.envelope.authority).toBe(null);
    expect(b.health.scope).toBe("personal");
    expect(b.health.provenance).toBe("foundation:deterministic-analytics");
    expect(b.health.blocked_count).toBeGreaterThanOrEqual(1);
    expect(b.health.overdue_count).toBeGreaterThanOrEqual(1);
    expect(b.health.recurring_blockers).toContain("Compliance blocker");
    expect(["HEALTHY", "WATCH", "AT_RISK", "CRITICAL"]).toContain(b.health.execution_status);
    // Health numbers are sane bounds.
    expect(b.health.health_score).toBeGreaterThanOrEqual(0);
    expect(b.health.health_score).toBeLessThanOrEqual(100);
  });

  it("never reflects another tenant's work in the snapshot", async () => {
    const a = await login(ORG_ID);
    const marker = `opsquux-${randomUUID().slice(0, 8)}`;
    await createLedger(a.token, { ledger_type: "BLOCKER", title: `Secret ${marker} blocker` });

    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}org2_${randomUUID()}`,
      email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`,
      public_key: "k",
      clearance_level: 0,
    });
    const b = await login(otherOrg.entity_id);
    const body = await health(b.token);
    expect(body.health.recurring_blockers.every((t) => !t.includes(marker))).toBe(true);
    expect(body.health.summary.includes(marker)).toBe(false);
  });
});
