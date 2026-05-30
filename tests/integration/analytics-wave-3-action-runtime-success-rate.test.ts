// FILE: analytics-wave-3-action-runtime-success-rate.test.ts (integration)
// PURPOSE: Section 6 Wave 3 — second concrete analytics
//          aggregate (org-wide action-runtime success rate)
//          contract coverage per ADR-0061. Verifies the same
//          auth + same-org + k=5 gates as the Wave 2
//          correction-velocity aggregate plus the additional
//          ACTION_RUNTIME_MIN_VOLUME gate (separate
//          high-variance protection).
// CONNECTS TO:
//   - apps/api/src/routes/analytics.routes.ts (Wave 3 route)
//   - apps/api/src/services/analytics/analytics.service.ts
//     (getActionRuntimeSuccessRateForOrg method)
//   - ADR-0061 Section 6 v1 SAFE Projection Pattern

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "analytics-wave-3-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function refreshTARHash(entityId: string): Promise<void> {
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
  const newHash = computeTARHash({
    can_login: fresh.can_login,
    can_read_capsules: fresh.can_read_capsules,
    can_write_capsules: fresh.can_write_capsules,
    can_share_capsules: fresh.can_share_capsules,
    can_create_hives: fresh.can_create_hives,
    can_access_external_api: fresh.can_access_external_api,
    can_admin_niov: fresh.can_admin_niov,
    can_admin_org: fresh.can_admin_org,
    clearance_ceiling: fresh.clearance_ceiling,
    monetization_role: fresh.monetization_role,
    compliance_frameworks: fresh.compliance_frameworks,
    status: fresh.status,
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function makeMember(opts: {
  orgId: string;
  can_admin_org?: boolean;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: opts.orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
  });
  await refreshTARHash(entity.entity_id);
  const ip = `10.98.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return { entityId: entity.entity_id, token: body.token, ip };
}

async function makeActionWithAttempts(opts: {
  sourceEntityId: string;
  orgEntityId: string;
  outcomes: Array<"SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED">;
  attemptEndedAt?: Date;
}): Promise<string> {
  const action = await prisma.action.create({
    data: {
      source_entity_id: opts.sourceEntityId,
      org_entity_id: opts.orgEntityId,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      policy_envelope: {},
      payload_summary: `${TEST_PREFIX}analytics-test`,
      payload_redacted: { kind: "notification" },
      idempotency_key: `ik-${TEST_PREFIX}${randomUUID()}`,
      status: "SUCCEEDED",
    },
  });
  let attemptNumber = 1;
  for (const outcome of opts.outcomes) {
    await prisma.actionAttempt.create({
      data: {
        action_id: action.action_id,
        attempt_number: attemptNumber++,
        ended_at: opts.attemptEndedAt ?? new Date(),
        outcome,
      },
    });
  }
  return action.action_id;
}

async function post(
  caller: { token: string; ip: string } | null,
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url,
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

describe("Section 6 Wave 3 — auth gates", () => {
  it("401 without bearer", async () => {
    const r = await post(
      null,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.statusCode).toBe(401);
  });

  it("403 ADMIN_CAPABILITY_REQUIRED without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(
      nonAdmin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.statusCode).toBe(403);
  });
});

describe("Section 6 Wave 3 — k=5 population gate", () => {
  it("INSUFFICIENT_POPULATION when org has < 5 members", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.redacted).toBe(true);
    expect(r.body.success_rate).toBeNull();
    expect(r.body.succeeded_count).toBeNull();
  });
});

describe("Section 6 Wave 3 — ACTION_RUNTIME_MIN_VOLUME gate", () => {
  it("INSUFFICIENT_VOLUME when attempt_count < 10 but member_count >= 5", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    // Only 5 attempts — below MIN_VOLUME=10
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: ["SUCCEEDED", "SUCCEEDED", "SUCCEEDED", "FAILED", "FAILED"],
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("INSUFFICIENT_VOLUME");
    expect(r.body.redacted).toBe(true);
    expect(r.body.attempt_count).toBe(5);
    expect(r.body.success_rate).toBeNull();
  });

  it("attempt_count surfaced at INSUFFICIENT_VOLUME (still safe aggregate)", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: ["SUCCEEDED"],
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.body.attempt_count).toBe(1);
    expect(r.body.succeeded_count).toBeNull();
    expect(r.body.failed_count).toBeNull();
  });
});

describe("Section 6 Wave 3 — non-redacted aggregate", () => {
  it("HEALTHY label when success_rate >= 0.9", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    // 10 attempts; 9 SUCCEEDED, 1 FAILED → 90% success
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: [
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "FAILED",
      ],
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("HEALTHY");
    expect(r.body.redacted).toBe(false);
    expect(r.body.attempt_count).toBe(10);
    expect(r.body.succeeded_count).toBe(9);
    expect(r.body.failed_count).toBe(1);
    expect(r.body.success_rate).toBe(0.9);
  });

  it("DEGRADED label when 0.6 <= success_rate < 0.9", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    // 10 attempts; 7 SUCCEEDED, 3 FAILED → 70%
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: [
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "FAILED",
        "FAILED",
        "FAILED",
      ],
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.body.signal_label).toBe("DEGRADED");
    expect(r.body.success_rate).toBe(0.7);
  });

  it("UNHEALTHY label when success_rate < 0.6", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    // 10 attempts; 4 SUCCEEDED, 4 FAILED, 1 TIMED_OUT, 1 CANCELLED → 40%
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: [
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "SUCCEEDED",
        "FAILED",
        "FAILED",
        "FAILED",
        "FAILED",
        "TIMED_OUT",
        "CANCELLED",
      ],
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.body.signal_label).toBe("UNHEALTHY");
    expect(r.body.succeeded_count).toBe(4);
    expect(r.body.failed_count).toBe(4);
    expect(r.body.timed_out_count).toBe(1);
    expect(r.body.cancelled_count).toBe(1);
  });
});

describe("Section 6 Wave 3 — window enforcement", () => {
  it("excludes attempts whose ended_at is outside the window", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    // 10 attempts in the window (HEALTHY)
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: Array(10).fill("SUCCEEDED"),
    });
    // 10 attempts OUTSIDE the window — should be ignored
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: Array(10).fill("FAILED"),
      attemptEndedAt: fortyDaysAgo,
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.body.attempt_count).toBe(10);
    expect(r.body.succeeded_count).toBe(10);
    expect(r.body.failed_count).toBe(0);
  });
});

describe("Section 6 Wave 3 — same-org scoping", () => {
  it("org A success rate NEVER includes org B attempts", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await makeMember({ orgId: orgA, can_admin_org: true });
    const adminB = await makeMember({ orgId: orgB, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId: orgA, can_admin_org: false });
    }
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId: orgB, can_admin_org: false });
    }
    // 10 SUCCEEDED in org A
    await makeActionWithAttempts({
      sourceEntityId: adminA.entityId,
      orgEntityId: orgA,
      outcomes: Array(10).fill("SUCCEEDED"),
    });
    // 10 FAILED in org B — must not affect org A's reading
    await makeActionWithAttempts({
      sourceEntityId: adminB.entityId,
      orgEntityId: orgB,
      outcomes: Array(10).fill("FAILED"),
    });
    const r = await post(
      adminA,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.body.attempt_count).toBe(10);
    expect(r.body.succeeded_count).toBe(10);
    expect(r.body.failed_count).toBe(0);
    expect(r.body.signal_label).toBe("HEALTHY");
  });
});

describe("Section 6 Wave 3 — audit + no-leak", () => {
  it("emits ADMIN_ACTION + ANALYTICS_READ audit with correct discriminators", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: Array(10).fill("SUCCEEDED"),
    });
    await post(admin, "/api/v1/analytics/action-runtime-success-rate", {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as {
      action?: string;
      aggregate?: string;
      redacted?: boolean;
    };
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("ACTION_RUNTIME_SUCCESS_RATE");
    expect(details.redacted).toBe(false);
  });

  it("response NEVER includes attempt_id / action_id / worker_id / error_class", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    for (let i = 0; i < 4; i++) {
      await makeMember({ orgId, can_admin_org: false });
    }
    await makeActionWithAttempts({
      sourceEntityId: admin.entityId,
      orgEntityId: orgId,
      outcomes: Array(10).fill("SUCCEEDED"),
    });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      {},
    );
    expect(r.raw).not.toContain("attempt_id");
    expect(r.raw).not.toContain("action_id");
    expect(r.raw).not.toContain("worker_id");
    expect(r.raw).not.toContain("error_class");
    expect(r.raw).not.toContain("error_summary");
    expect(r.raw).not.toContain("payload_summary");
    expect(r.raw).not.toContain("payload_redacted");
    expect(r.raw).not.toContain("idempotency_key");
  });
});

describe("Section 6 Wave 3 — input validation", () => {
  it("422 on invalid window_days", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(
      admin,
      "/api/v1/analytics/action-runtime-success-rate",
      { window_days: 100 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
});
