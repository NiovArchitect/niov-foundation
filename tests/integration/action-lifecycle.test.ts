// FILE: action-lifecycle.test.ts (integration)
// PURPOSE: End-to-end coverage for the ADR-0057 §1 + §11 Action
//          lifecycle: scheduler admission (APPROVED → SCHEDULED),
//          executor claim (SCHEDULED → RUNNING with SELECT FOR UPDATE
//          SKIP LOCKED), stub-handler dispatch, ActionAttempt +
//          ActionResult creation, terminal SUCCEEDED, retry path,
//          terminal FAILED, terminal TIMED_OUT, expiry sweep
//          (SCHEDULED → EXPIRED), and the no-leak audit/result-
//          metadata contract.
// CONNECTS TO:
//   - apps/api/src/services/action/scheduler.ts (tickActionScheduler
//     + tickActionExpirySweep)
//   - apps/api/src/services/action/executor.ts (tickActionExecutor)
//   - apps/api/src/services/action/handlers.ts (TEST_MARKER_FORCE_*)
//   - apps/api/src/services/action/lifecycle.service.ts
//     (ATTEMPT_TIMEOUT_MS_DEFAULT)
//   - apps/api/src/routes/actions.routes.ts (POST /api/v1/actions —
//     drives AUTO_APPROVE landings consumed by the scheduler)
//   - packages/database (prisma.action.* + prisma.actionAttempt.* +
//     prisma.actionResult.* + prisma.auditEvent.* for assertions)
//   - tests/helpers.ts (fixtures + cleanup precedent)
//
// FOUNDER LOCKS exercised:
//   - LOCK-GAP-1 retry budget: RECORD_CAPSULE=3 → up to 2 retries
//     before terminalization.
//   - LOCK-GAP-2 per-attempt timeout: tests pass attemptTimeoutMs=50
//     so the wall-clock test stays under 1 s.
//   - LOCK-GAP-3 stub handlers only: every success path lands the
//     "stub" result_metadata.
//   - LOCK-GAP-4 cancel route absent: no ACTION_CANCELLED literal
//     expected.
//   - LOCK-GAP-5 expiry sweep included: SCHEDULED + expires_at < now
//     terminalizes to EXPIRED + emits ACTION_EXPIRED.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  TEST_MARKER_FORCE_FAILURE,
  TEST_MARKER_FORCE_TIMEOUT,
  tickActionExecutor,
  tickActionExpirySweep,
  tickActionScheduler,
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

const TEST_JWT_SECRET = "action-lifecycle-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

async function cleanupTestActions(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  // No Prisma FK relation between Action / ActionAttempt / ActionResult,
  // so traverse by explicit id list per layer.
  const testActions = await prisma.action.findMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { org_entity_id: { in: ids } },
      ],
    },
    select: { action_id: true },
  });
  const actionIds = testActions.map((a) => a.action_id);
  if (actionIds.length > 0) {
    const testAttempts = await prisma.actionAttempt.findMany({
      where: { action_id: { in: actionIds } },
      select: { attempt_id: true },
    });
    const attemptIds = testAttempts.map((a) => a.attempt_id);
    if (attemptIds.length > 0) {
      await prisma.actionResult.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
      await prisma.actionAttempt.deleteMany({
        where: { attempt_id: { in: attemptIds } },
      });
    }
    await prisma.action.deleteMany({
      where: { action_id: { in: actionIds } },
    });
  }
  await prisma.actionPolicy.deleteMany({
    where: {
      OR: [{ org_entity_id: { in: ids } }, { updated_by: { in: ids } }],
    },
  });
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestActions();
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
  await cleanupTestActions();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

// WHAT: Same fixture helpers as actions-create.test.ts — kept local
//        so the two suites do not contend on a shared module.
async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  await prisma.orgSettings.upsert({
    where: { org_entity_id: org.entity_id },
    create: {
      org_entity_id: org.entity_id,
      require_human_approval: false,
      auto_approve_low_risk: true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: false,
      auto_approve_low_risk: true,
    },
  });
  return org.entity_id;
}

async function makeOrgMember(opts: {
  orgId: string;
  autonomy_level?: "APPROVAL_REQUIRED" | "EXECUTIVE_OVERRIDE" | "OBSERVE_ONLY";
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
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
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
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  if (opts.autonomy_level !== undefined) {
    await prisma.twinConfig.upsert({
      where: { twin_id: entity.entity_id },
      create: {
        twin_id: entity.entity_id,
        autonomy_level: opts.autonomy_level,
      },
      update: { autonomy_level: opts.autonomy_level },
    });
  }
  const ip = `10.78.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

async function seedPolicy(
  orgEntityId: string,
  updated_by: string,
  action_type:
    | "RECORD_CAPSULE"
    | "PROPOSE_PERMISSION_GRANT"
    | "SEND_INTERNAL_NOTIFICATION" = "SEND_INTERNAL_NOTIFICATION",
  risk_tier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW",
): Promise<void> {
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgEntityId,
        action_type,
        risk_tier,
      },
    },
    create: {
      org_entity_id: orgEntityId,
      action_type,
      risk_tier,
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by,
    },
    update: { default_decision: "AUTO_APPROVE", updated_by },
  });
}

interface CreateOpts {
  payload_redacted?: Record<string, unknown>;
  action_type?:
    | "RECORD_CAPSULE"
    | "PROPOSE_PERMISSION_GRANT"
    | "SEND_INTERNAL_NOTIFICATION";
}

async function createApprovedAction(
  caller: { entityId: string; token: string; ip: string },
  opts: CreateOpts = {},
): Promise<string> {
  // Wave 11 made SEND_INTERNAL_NOTIFICATION payload validation real
  // (validateSendInternalNotificationPayload requires
  // recipient_entity_id + notification_class + body_summary). The
  // self-notification default below keeps these lifecycle tests
  // focused on lifecycle semantics (admission/execution/retry/
  // expiry/concurrency) while still passing the create-time
  // validator: source caller is the recipient, and self is
  // trivially a member of source's org.
  const defaultPayload: Record<string, unknown> = {
    recipient_entity_id: caller.entityId,
    notification_class: "lifecycle-test",
    body_summary: "lifecycle-test-body",
  };
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    payload: {
      action_type: opts.action_type ?? "SEND_INTERNAL_NOTIFICATION",
      idempotency_key: `ik-${randomUUID()}`,
      payload_summary: "test-summary",
      payload_redacted: opts.payload_redacted ?? defaultPayload,
    },
    remoteAddress: caller.ip,
  });
  if (response.statusCode !== 200) {
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as {
    ok: boolean;
    action: { action_id: string; status: string };
  };
  expect(body.ok).toBe(true);
  expect(body.action.status).toBe("APPROVED");
  return body.action.action_id;
}

const SAFE_LIFECYCLE_DETAIL_KEYS = new Set([
  "action_id",
  "action_type",
  "previous_status",
  "next_status",
  "attempt_id",
  "attempt_number",
  "worker_id",
  "decision_reason",
  "error_class",
  "error_summary",
  // Injected by writeAuditEvent when system_principal is set.
  "system_principal",
]);

function assertAuditDetailsSafe(details: unknown): void {
  expect(details).not.toBeNull();
  expect(typeof details).toBe("object");
  const obj = details as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    expect(SAFE_LIFECYCLE_DETAIL_KEYS.has(key)).toBe(true);
  }
  for (const forbidden of [
    "payload_summary",
    "payload_redacted",
    "policy_envelope",
    "policy_envelope_hash",
    "raw_error",
    "stack",
    "secret",
  ]) {
    expect(Object.prototype.hasOwnProperty.call(obj, forbidden)).toBe(false);
  }
}

describe("ADR-0057 §1 + §11 — admission + executor + success", () => {
  it("scheduler admits APPROVED → SCHEDULED + executor drives → SUCCEEDED with ActionAttempt + ActionResult + safe audit", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);

    const admit = await tickActionScheduler();
    expect(admit.scheduled).toBeGreaterThanOrEqual(1);

    const afterAdmit = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(afterAdmit.status).toBe("SCHEDULED");

    const tick = await tickActionExecutor({
      workerId: "test-worker-A",
      attemptTimeoutMs: 1_000,
    });
    expect(tick.claimed).toBeGreaterThanOrEqual(1);
    expect(tick.succeeded).toBeGreaterThanOrEqual(1);

    const final = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(final.status).toBe("SUCCEEDED");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("SUCCEEDED");
    expect(attempts[0]?.worker_id).toBe("test-worker-A");

    const result = await prisma.actionResult.findFirst({
      where: { attempt_id: attempts[0]?.attempt_id ?? "" },
    });
    expect(result).not.toBeNull();
    // Wave 11: SEND_INTERNAL_NOTIFICATION is a REAL handler.
    // result_summary is `internal_notification_dispatched:<id>`;
    // result_metadata mirrors the prod-equivalent SAFE shape.
    expect(result?.result_summary).toMatch(
      /^internal_notification_dispatched:/,
    );
    expect(result?.result_metadata).toMatchObject({
      handler: "send_internal_notification",
      action_type: "SEND_INTERNAL_NOTIFICATION",
      status: "dispatched_internal",
    });
    // result_metadata MUST NOT leak payload-derived data.
    const metaJson = JSON.stringify(result?.result_metadata);
    expect(metaJson.includes("test-summary")).toBe(false);
    expect(metaJson.includes("policy_envelope")).toBe(false);
    expect(metaJson.includes("payload_redacted")).toBe(false);

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: {
          in: ["ACTION_SCHEDULED", "ACTION_STARTED", "ACTION_SUCCEEDED"],
        },
        details: { path: ["action_id"], equals: actionId },
      },
      orderBy: { timestamp: "asc" },
    });
    const eventTypes = audits.map((a) => a.event_type);
    expect(eventTypes).toEqual(["ACTION_SCHEDULED", "ACTION_STARTED", "ACTION_SUCCEEDED"]);
    for (const audit of audits) {
      assertAuditDetailsSafe(audit.details);
    }
  });
});

describe("ADR-0057 §11 — retry budget exhaustion → ACTION_FAILED", () => {
  it("FAILURE marker loops in-tick up to RETRY_BUDGET (SEND_INTERNAL_NOTIFICATION=3) then terminalizes FAILED", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller, {
      payload_redacted: {
        recipient_entity_id: caller.entityId,
        notification_class: "force-fail-test",
        body_summary: "force-fail",
        [TEST_MARKER_FORCE_FAILURE]: true,
      },
    });

    // One admit + one execute. The executor loops in-tick across the
    // retry budget so the parent terminalizes within a single tick.
    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-fail",
      attemptTimeoutMs: 1_000,
    });
    const row = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(row.status).toBe("FAILED");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
      orderBy: { attempt_number: "asc" },
    });
    expect(attempts.length).toBe(3);
    for (const a of attempts) {
      expect(a.outcome).toBe("FAILED");
      expect(a.error_class).toBe("STUB_FORCED_FAILURE");
    }

    const failedAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_FAILED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(failedAudits.length).toBe(1);
    assertAuditDetailsSafe(failedAudits[0]?.details);
    const details = failedAudits[0]?.details as Record<string, unknown>;
    expect(details.error_class).toBe("STUB_FORCED_FAILURE");
    expect(details.next_status).toBe("FAILED");

    // Critical no-leak invariant: ACTION_FAILED audit must not echo
    // the test marker key (it's a payload-derived value).
    const json = JSON.stringify(failedAudits[0]?.details);
    expect(json.includes(TEST_MARKER_FORCE_FAILURE)).toBe(false);
  });
});

describe("ADR-0057 §11 — per-attempt timeout → TIMED_OUT + ACTION_FAILED", () => {
  it("TIMEOUT marker terminalizes after retry budget with attempt.outcome=TIMED_OUT", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(
      orgId,
      caller.entityId,
      "PROPOSE_PERMISSION_GRANT",
      "MEDIUM",
    );
    const actionId = await createApprovedAction(caller, {
      action_type: "PROPOSE_PERMISSION_GRANT",
      payload_redacted: {
        // Wave 4 validator requires capsule_id + grantee_entity_id +
        // access_scope; the test marker bypasses the real handler
        // dispatch at execute-time but the create-time validator
        // still runs.
        capsule_id: "11111111-1111-1111-1111-111111111111",
        grantee_entity_id: "22222222-2222-2222-2222-222222222222",
        access_scope: "FULL",
        [TEST_MARKER_FORCE_TIMEOUT]: true,
      },
    });

    // PROPOSE_PERMISSION_GRANT budget is 1: a single TIMEOUT
    // terminalizes immediately.
    await tickActionScheduler();
    await tickActionExecutor({
      workerId: "test-worker-timeout",
      attemptTimeoutMs: 1_000,
    });

    const row = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(row.status).toBe("TIMED_OUT");

    const attempts = await prisma.actionAttempt.findMany({
      where: { action_id: actionId },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.outcome).toBe("TIMED_OUT");
    expect(attempts[0]?.error_class).toBe("STUB_FORCED_TIMEOUT");

    const failedAudits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_FAILED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(failedAudits.length).toBe(1);
    const details = failedAudits[0]?.details as Record<string, unknown>;
    expect(details.next_status).toBe("TIMED_OUT");
    expect(details.error_class).toBe("STUB_FORCED_TIMEOUT");
    assertAuditDetailsSafe(failedAudits[0]?.details);
  });
});

describe("ADR-0057 §11 — expiry sweep", () => {
  it("SCHEDULED row past expires_at → EXPIRED + ACTION_EXPIRED with safe details", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);
    await tickActionScheduler();

    // Force expires_at into the past so the expiry sweep catches it.
    await prisma.action.update({
      where: { action_id: actionId },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });

    const sweep = await tickActionExpirySweep();
    expect(sweep.expired).toBeGreaterThanOrEqual(1);

    const row = await prisma.action.findUniqueOrThrow({
      where: { action_id: actionId },
    });
    expect(row.status).toBe("EXPIRED");

    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_EXPIRED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(audits.length).toBe(1);
    const details = audits[0]?.details as Record<string, unknown>;
    expect(details.next_status).toBe("EXPIRED");
    expect(details.decision_reason).toBe("expires_at_elapsed");
    assertAuditDetailsSafe(audits[0]?.details);
  });
});

describe("ADR-0057 §11 — concurrent executor ticks (SKIP LOCKED)", () => {
  it("two parallel ticks do not execute the same Action twice", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, caller.entityId);
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await createApprovedAction(caller));
    }
    await tickActionScheduler();

    // Run two ticks in parallel; SKIP LOCKED + the early
    // RUNNING transition together guarantee no double-claim.
    const [r1, r2] = await Promise.all([
      tickActionExecutor({
        workerId: "test-worker-conc-A",
        attemptTimeoutMs: 1_000,
      }),
      tickActionExecutor({
        workerId: "test-worker-conc-B",
        attemptTimeoutMs: 1_000,
      }),
    ]);
    const claimed = r1.claimed + r2.claimed;
    // Total claimed must not exceed our 5 admitted rows.
    expect(claimed).toBeLessThanOrEqual(5);
    expect(r1.succeeded + r2.succeeded).toBe(claimed);

    // Per-action attempt count = exactly 1 on success path.
    for (const id of ids) {
      const attempts = await prisma.actionAttempt.findMany({
        where: { action_id: id },
      });
      expect(attempts.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("ADR-0057 §11 — no ACTION_CANCELLED literal emitted at this slice", () => {
  it("none of the lifecycle ticks emit ACTION_CANCELLED (LOCK-GAP-4)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgMember({
      orgId,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    });
    await seedPolicy(orgId, caller.entityId);
    const actionId = await createApprovedAction(caller);
    await tickActionScheduler();
    await tickActionExecutor({ attemptTimeoutMs: 1_000 });
    const cancelled = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_CANCELLED",
        details: { path: ["action_id"], equals: actionId },
      },
    });
    expect(cancelled.length).toBe(0);
  });
});
