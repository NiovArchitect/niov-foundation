// FILE: risk-assessment.test.ts (integration)
// PURPOSE: Phase 1285-X — HTTP-level coverage for the risk-assessment route:
//          Foundation assembles deterministic watcher findings (scoped, tenant-
//          isolated), enriches each with an advisory risk_assessment, and — with
//          Python NOT configured in the test env — proves the deterministic
//          fallback (assessment still attached, honest envelope, no authority).
//          Also proves cross-tenant isolation and that titles, not raw UUIDs,
//          are the primary label. End-to-end via buildApp against the test DB.
// CONNECTS TO:
//   - apps/api/src/routes/work-os-ledger.routes.ts
//   - apps/api/src/services/work-os/risk-scoring.service.ts
//   - apps/api/src/services/work-os/watcher.service.ts

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

const TEST_JWT_SECRET = "risk-assessment-test-secret";
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
    remoteAddress: `10.94.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`,
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

interface AssessedFinding {
  finding_id: string;
  watcher_type: string;
  severity: string;
  title: string;
  risk_assessment: {
    risk_score: number;
    severity: string;
    confidence: string;
    contributing_signals: string[];
    suggested_next_action: string;
    human_review_needed: boolean;
    provenance: string;
  };
}
interface AssessmentBody {
  ok: boolean;
  findings: AssessedFinding[];
  envelope: { capability: string; status: string; authority: string | null };
}

async function assessment(token: string): Promise<AssessmentBody> {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/work-os/risk/assessment",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as AssessmentBody;
}

describe("risk assessment route", () => {
  it("attaches a deterministic risk_assessment to watcher findings when Python is not configured", async () => {
    const { token } = await login(ORG_ID);
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10d overdue
    const overdueId = await createLedger(token, { ledger_type: "TASK", title: "Overdue launch task", due_at: past });
    const blockerId = await createLedger(token, { ledger_type: "BLOCKER", title: "Compliance blocker" });

    const body = await assessment(token);
    expect(body.ok).toBe(true);
    expect(body.envelope.capability).toBe("RISK_SCORING");
    // Python not wired in the test env => honest NOT_CONFIGURED, no authority,
    // deterministic assessments still attached (the flow never blocks on Python).
    expect(body.envelope.status).toBe("NOT_CONFIGURED");
    expect(body.envelope.authority).toBe(null);

    const ids = body.findings.map((f) => f.finding_id);
    expect(ids).toContain(`OVERDUE_WORK:${overdueId}`);
    expect(ids).toContain(`UNRESOLVED_BLOCKER:${blockerId}`);
    for (const f of body.findings) {
      expect(f.risk_assessment.provenance).toBe("foundation:deterministic-risk");
      expect(f.risk_assessment.risk_score).toBeGreaterThanOrEqual(0);
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(f.risk_assessment.severity);
      expect(f.title).not.toBe(f.finding_id); // title is the label, never a raw UUID
    }
    // The blocker carries the BLOCKED signal and is flagged for review.
    const blocker = body.findings.find((f) => f.finding_id === `UNRESOLVED_BLOCKER:${blockerId}`)!;
    expect(blocker.risk_assessment.contributing_signals).toContain("BLOCKED");
    expect(blocker.risk_assessment.human_review_needed).toBe(true);
    // Ordered by risk_score desc.
    for (let i = 1; i < body.findings.length; i++) {
      expect(body.findings[i - 1]!.risk_assessment.risk_score).toBeGreaterThanOrEqual(body.findings[i]!.risk_assessment.risk_score);
    }
  });

  it("never surfaces another tenant's findings", async () => {
    const a = await login(ORG_ID);
    const marker = `riskquux-${randomUUID().slice(0, 8)}`;
    await createLedger(a.token, { ledger_type: "BLOCKER", title: `Secret ${marker} blocker` });

    const otherOrg = await createEntity({
      entity_type: "COMPANY",
      display_name: `${TEST_PREFIX}org2_${randomUUID()}`,
      email: `${TEST_PREFIX}org2_${randomUUID()}@niov.test`,
      public_key: "k",
      clearance_level: 0,
    });
    const b = await login(otherOrg.entity_id);
    const body = await assessment(b.token);
    expect(body.findings.every((f) => !f.title.includes(marker))).toBe(true);
  });
});
