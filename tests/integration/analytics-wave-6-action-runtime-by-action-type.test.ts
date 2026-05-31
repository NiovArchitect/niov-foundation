// FILE: analytics-wave-6-action-runtime-by-action-type.test.ts
// PURPOSE: Section 6 Wave 6 — per-ActionType action-runtime
//          health aggregate contract coverage per ADR-0061 §8
//          forward-queue. Verifies the same auth + same-org +
//          k=5 gates as Wave 2-5 plus the per-row
//          ACTION_RUNTIME_MIN_VOLUME (10) redaction at the
//          ActionType tier; verifies SAFE projection
//          (no action_id / attempt_id / actor_entity_id /
//          payload_summary / payload_redacted / error_class
//          leaks); verifies cross-org Actions excluded;
//          verifies ANALYTICS_READ audit with
//          aggregate=ACTION_RUNTIME_BY_ACTION_TYPE; verifies
//          no new audit literal.
// CONNECTS TO:
//   - apps/api/src/routes/analytics.routes.ts
//   - apps/api/src/services/analytics/analytics.service.ts
//     (getActionRuntimeByActionTypeForOrg)
//   - ADR-0061 Section 6 SAFE Projection Pattern

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

const TEST_JWT_SECRET = "analytics-wave-6-test-secret";
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
  const ip = `10.103.${Math.floor(Math.random() * 200) + 1}.${
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
  actionType:
    | "RECORD_CAPSULE"
    | "PROPOSE_PERMISSION_GRANT"
    | "SEND_INTERNAL_NOTIFICATION"
    | "INVOKE_CONNECTOR";
  outcomes: Array<"SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED">;
  attemptEndedAt?: Date;
}): Promise<string> {
  const action = await prisma.action.create({
    data: {
      source_entity_id: opts.sourceEntityId,
      org_entity_id: opts.orgEntityId,
      action_type: opts.actionType,
      risk_tier: "LOW",
      policy_envelope: {},
      payload_summary: `${TEST_PREFIX}wave-6-test`,
      payload_redacted: { kind: "test" },
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

async function seedFiveOrgMembers(
  orgId: string,
): Promise<{ entityId: string; token: string; ip: string }> {
  const admin = await makeMember({ orgId, can_admin_org: true });
  for (let i = 0; i < 4; i++) {
    await makeMember({ orgId, can_admin_org: false });
  }
  return admin;
}

const ROUTE = "/api/v1/analytics/action-runtime-by-action-type";

const FORBIDDEN_NO_LEAK_MARKERS = [
  "action_id",
  "attempt_id",
  "actor_entity_id",
  "source_entity_id",
  "target_entity_id",
  "payload_summary",
  "payload_redacted",
  "error_class",
  "error_summary",
  "idempotency_key",
  "secret_ref",
  "storage_location",
  "content_hash",
  "bridge_id",
];

function assertNoLeak(raw: string): void {
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 6 Wave 6 — auth gates", () => {
  it("401 without bearer", async () => {
    const r = await post(null, ROUTE, {});
    expect(r.statusCode).toBe(401);
  });

  it("403 without can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const nonAdmin = await makeMember({ orgId, can_admin_org: false });
    const r = await post(nonAdmin, ROUTE, {});
    expect(r.statusCode).toBe(403);
  });
});

describe("Section 6 Wave 6 — k=5 population gate", () => {
  it("envelope INSUFFICIENT_POPULATION + empty rows when org has < 5 members", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.aggregate).toBe("ACTION_RUNTIME_BY_ACTION_TYPE");
    expect(r.body.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.body.redacted).toBe(true);
    expect(r.body.rows).toEqual([]);
    expect(r.body.member_count).toBeLessThan(5);
  });
});

describe("Section 6 Wave 6 — per-row aggregation by ActionType", () => {
  it("returns one row per ActionType with attempts in window", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    // RECORD_CAPSULE: 10 SUCCEEDED → HEALTHY
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "RECORD_CAPSULE",
        outcomes: ["SUCCEEDED"],
      });
    }
    // SEND_INTERNAL_NOTIFICATION: 10 attempts mix → DEGRADED (7/10 = 0.7)
    for (let i = 0; i < 7; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "SEND_INTERNAL_NOTIFICATION",
        outcomes: ["SUCCEEDED"],
      });
    }
    for (let i = 0; i < 3; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "SEND_INTERNAL_NOTIFICATION",
        outcomes: ["FAILED"],
      });
    }
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("OK_BY_ROW");
    expect(r.body.redacted).toBe(false);

    const rowsByType = new Map<string, any>();
    for (const row of r.body.rows) {
      rowsByType.set(row.action_type, row);
    }

    const rc = rowsByType.get("RECORD_CAPSULE");
    expect(rc).toBeDefined();
    expect(rc.attempt_count).toBe(10);
    expect(rc.succeeded_count).toBe(10);
    expect(rc.success_rate).toBe(1.0);
    expect(rc.signal_label).toBe("HEALTHY");

    const sn = rowsByType.get("SEND_INTERNAL_NOTIFICATION");
    expect(sn).toBeDefined();
    expect(sn.attempt_count).toBe(10);
    expect(sn.succeeded_count).toBe(7);
    expect(sn.failed_count).toBe(3);
    expect(sn.success_rate).toBe(0.7);
    expect(sn.signal_label).toBe("DEGRADED");
  });

  it("UNHEALTHY label when success_rate < 0.6", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    // 10 attempts; 3 SUCCEEDED + 5 FAILED + 2 TIMED_OUT → 0.3 success rate
    for (let i = 0; i < 3; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "INVOKE_CONNECTOR",
        outcomes: ["SUCCEEDED"],
      });
    }
    for (let i = 0; i < 5; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "INVOKE_CONNECTOR",
        outcomes: ["FAILED"],
      });
    }
    for (let i = 0; i < 2; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "INVOKE_CONNECTOR",
        outcomes: ["TIMED_OUT"],
      });
    }
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    const row = r.body.rows.find(
      (x: any) => x.action_type === "INVOKE_CONNECTOR",
    );
    expect(row.signal_label).toBe("UNHEALTHY");
    expect(row.success_rate).toBe(0.3);
    expect(row.timed_out_count).toBe(2);
  });

  it("per-row INSUFFICIENT_VOLUME when ActionType has < 10 attempts in window", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    // Only 5 attempts of one type — below MIN_VOLUME=10
    for (let i = 0; i < 5; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "PROPOSE_PERMISSION_GRANT",
        outcomes: ["SUCCEEDED"],
      });
    }
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("OK_BY_ROW");
    expect(r.body.redacted).toBe(false);
    const row = r.body.rows.find(
      (x: any) => x.action_type === "PROPOSE_PERMISSION_GRANT",
    );
    expect(row).toBeDefined();
    expect(row.attempt_count).toBe(5);
    expect(row.signal_label).toBe("INSUFFICIENT_VOLUME");
    expect(row.succeeded_count).toBeNull();
    expect(row.success_rate).toBeNull();
    expect(row.failed_count).toBeNull();
  });

  it("zero-state when org has members but no attempts (rows empty)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    expect(r.body.signal_label).toBe("OK_BY_ROW");
    expect(r.body.redacted).toBe(false);
    expect(r.body.rows).toEqual([]);
  });

  it("returns rows ordered by action_type ASC (deterministic)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    // Seed types out of alphabetical order to confirm sort.
    const types: Array<
      "INVOKE_CONNECTOR" | "RECORD_CAPSULE" | "SEND_INTERNAL_NOTIFICATION"
    > = ["INVOKE_CONNECTOR", "RECORD_CAPSULE", "SEND_INTERNAL_NOTIFICATION"];
    for (const t of types) {
      for (let i = 0; i < 10; i++) {
        await makeActionWithAttempts({
          sourceEntityId: admin.entityId,
          orgEntityId: orgId,
          actionType: t,
          outcomes: ["SUCCEEDED"],
        });
      }
    }
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    const actionTypes = r.body.rows.map((x: any) => x.action_type);
    expect(actionTypes).toEqual([
      "INVOKE_CONNECTOR",
      "RECORD_CAPSULE",
      "SEND_INTERNAL_NOTIFICATION",
    ]);
  });
});

describe("Section 6 Wave 6 — same-org isolation", () => {
  it("Actions in another org are EXCLUDED from caller's aggregate", async () => {
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const adminA = await seedFiveOrgMembers(orgA);
    const adminB = await seedFiveOrgMembers(orgB);
    // Org A: 10 SEND_INTERNAL_NOTIFICATION SUCCEEDED
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: adminA.entityId,
        orgEntityId: orgA,
        actionType: "SEND_INTERNAL_NOTIFICATION",
        outcomes: ["SUCCEEDED"],
      });
    }
    // Org B: 10 SEND_INTERNAL_NOTIFICATION FAILED
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: adminB.entityId,
        orgEntityId: orgB,
        actionType: "SEND_INTERNAL_NOTIFICATION",
        outcomes: ["FAILED"],
      });
    }
    const rA = await post(adminA, ROUTE, {});
    const rB = await post(adminB, ROUTE, {});
    const aRow = rA.body.rows.find(
      (x: any) => x.action_type === "SEND_INTERNAL_NOTIFICATION",
    );
    const bRow = rB.body.rows.find(
      (x: any) => x.action_type === "SEND_INTERNAL_NOTIFICATION",
    );
    expect(aRow.attempt_count).toBe(10);
    expect(aRow.succeeded_count).toBe(10);
    expect(aRow.signal_label).toBe("HEALTHY");
    expect(bRow.attempt_count).toBe(10);
    expect(bRow.failed_count).toBe(10);
    expect(bRow.signal_label).toBe("UNHEALTHY");
  });
});

describe("Section 6 Wave 6 — window_days input validation", () => {
  it("422 on non-integer window_days", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, { window_days: "abc" });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
  it("422 on window_days out of range", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const r = await post(admin, ROUTE, { window_days: 999 });
    expect(r.statusCode).toBe(422);
  });
  it("attempts ENDED outside window are excluded", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    // 10 attempts ended 100 days ago
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "RECORD_CAPSULE",
        outcomes: ["SUCCEEDED"],
        attemptEndedAt: oldDate,
      });
    }
    const r = await post(admin, ROUTE, { window_days: 7 });
    expect(r.statusCode).toBe(200);
    expect(r.body.rows).toEqual([]);
  });
});

describe("Section 6 Wave 6 — no-leak invariants", () => {
  it("no forbidden markers in response (15-marker scan)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "RECORD_CAPSULE",
        outcomes: ["SUCCEEDED"],
      });
    }
    const r = await post(admin, ROUTE, {});
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });
});

describe("Section 6 Wave 6 — audit emission", () => {
  it("emits ADMIN_ACTION + ANALYTICS_READ + aggregate=ACTION_RUNTIME_BY_ACTION_TYPE", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    for (let i = 0; i < 10; i++) {
      await makeActionWithAttempts({
        sourceEntityId: admin.entityId,
        orgEntityId: orgId,
        actionType: "RECORD_CAPSULE",
        outcomes: ["SUCCEEDED"],
      });
    }
    await post(admin, ROUTE, {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("ACTION_RUNTIME_BY_ACTION_TYPE");
    expect(details.org_entity_id).toBe(orgId);
    expect(details.redacted).toBe(false);
    expect(typeof details.result_count).toBe("number");
    // No raw per-row counts in audit details:
    expect(details).not.toHaveProperty("succeeded_count");
    expect(details).not.toHaveProperty("failed_count");
    expect(details).not.toHaveProperty("success_rate");
  });

  it("redacted audit when k=5 population gate fails", async () => {
    const orgId = await makeTestOrg();
    const admin = await makeMember({ orgId, can_admin_org: true });
    await post(admin, ROUTE, {});
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: admin.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details.action).toBe("ANALYTICS_READ");
    expect(details.aggregate).toBe("ACTION_RUNTIME_BY_ACTION_TYPE");
    expect(details.redacted).toBe(true);
    expect(details.result_count).toBe(0);
  });

  it("does NOT emit any new audit literal (event_type stays ADMIN_ACTION)", async () => {
    const orgId = await makeTestOrg();
    const admin = await seedFiveOrgMembers(orgId);
    await post(admin, ROUTE, {});
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: admin.entityId },
      select: { event_type: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/ACTION_RUNTIME_BY_ACTION_TYPE/);
      expect(row.event_type).not.toMatch(/PER_ACTION_TYPE/);
    }
  });
});
