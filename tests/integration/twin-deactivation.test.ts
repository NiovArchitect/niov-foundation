// FILE: twin-deactivation.test.ts (integration)
// PURPOSE: [TWIN-DEACTIVATION] HTTP-level coverage for the canonical twin
//          lifecycle rail: POST /org/ai-teammates/:id/deactivate +
//          /reactivate (can_admin_org). Closes the residue-sweep P1 (a
//          suspended member's twin lingered with NO rail to retire it).
//          Proves: deactivate flips the AI_AGENT entity to SUSPENDED
//          (RULE 10 soft rail — TwinConfig untouched) with an audited
//          reason; reactivate restores ACTIVE; idempotence refusals
//          (already-deactivated / already-active); blank reason 400;
//          cross-org twin 404 (enumeration-safe); employee 403; unauth
//          401; a HUMAN entity is never reachable through this rail
//          (404 TWIN_NOT_FOUND).
// CONNECTS TO: apps/api/src/routes/org.routes.ts (the rail),
//              tests/integration/admin-routes.test.ts (harness pattern).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildApp,
  executePhase0,
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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "twin-deactivation-test-secret-do-not-use";
const TEST_KEY = randomBytes(32);
const REASON = "Owner suspended — retiring their AI Teammate (integration test).";

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

function randomIp(): string {
  return `10.96.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
}

interface OrgCtx {
  orgId: string;
  adminId: string;
  adminToken: string;
  memberId: string;
  memberToken: string;
  twinId: string;
}

// One REAL org via executePhase0 (default Hive included -- twin creation
// requires it), a member via the live route, and the member's AI_AGENT
// twin created through the LIVE route.
async function makeOrgWithTwin(): Promise<OrgCtx> {
  const password = "correct-horse-battery";
  const bootstrapper = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  const adminEmail = `${TEST_PREFIX}twadmin_${randomUUID()}@niov.test`;
  const org = await executePhase0({
    company_name: `${TEST_PREFIX}twinorg_${randomUUID()}`,
    industry: "TECH",
    admin_email: adminEmail,
    admin_password: password,
    admin_first_name: null,
    admin_last_name: null,
    actor_entity_id: bootstrapper.entity_id,
  });
  const login = async (email: string): Promise<string> => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, requested_operations: ["read", "write"] },
      remoteAddress: randomIp(),
    });
    if (res.statusCode !== 200) throw new Error(`login ${res.statusCode}`);
    return (res.json() as { token: string }).token;
  };
  const adminToken = await login(adminEmail);
  const memberEmail = `${TEST_PREFIX}twmember_${randomUUID()}@niov.test`;
  const memberResp = await app.inject({
    method: "POST",
    url: "/api/v1/org/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { email: memberEmail, password, hierarchy_level: 1 },
    remoteAddress: randomIp(),
  });
  if (memberResp.statusCode !== 201) {
    throw new Error(`member create ${memberResp.statusCode}: ${memberResp.body}`);
  }
  const memberId = (memberResp.json() as { entity_id: string }).entity_id;
  const memberToken = await login(memberEmail);

  const twinResp = await app.inject({
    method: "POST",
    url: "/api/v1/org/ai-teammates",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      owner_entity_id: memberId,
      role_title: `twin_${randomUUID()}`,
    },
    remoteAddress: randomIp(),
  });
  if (twinResp.statusCode !== 201 && twinResp.statusCode !== 200) {
    throw new Error(`twin create ${twinResp.statusCode}: ${twinResp.body}`);
  }
  const twinId = (twinResp.json() as { entity_id: string }).entity_id;
  return {
    orgId: org.org_entity_id,
    adminId: org.admin_entity_id,
    adminToken,
    memberId,
    memberToken,
    twinId,
  };
}

function act(
  twinId: string,
  direction: "deactivate" | "reactivate",
  token: string | null,
  reason: string = REASON,
) {
  return app.inject({
    method: "POST",
    url: `/api/v1/org/ai-teammates/${twinId}/${direction}`,
    ...(token !== null ? { headers: { authorization: `Bearer ${token}` } } : {}),
    payload: { reason },
  });
}

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

beforeEach(async () => {
  await cleanupTestData();
});

describe("[TWIN-DEACTIVATION] canonical twin lifecycle rail", () => {
  it("deactivate -> SUSPENDED (config untouched, audited); reactivate -> ACTIVE; idempotence refusals", async () => {
    const ctx = await makeOrgWithTwin();

    const res = await act(ctx.twinId, "deactivate", ctx.adminToken);
    expect(res.statusCode).toBe(200);
    const out = res.json() as { status: string; audit_event_id: string };
    expect(out.status).toBe("SUSPENDED");

    const twin = await prisma.entity.findUnique({
      where: { entity_id: ctx.twinId },
    });
    expect(twin?.status).toBe("SUSPENDED");
    expect(twin?.suspended_at).not.toBeNull();
    expect(twin?.deleted_at).toBeNull(); // RULE 10: soft rail, never delete
    const config = await prisma.twinConfig.findUnique({
      where: { twin_id: ctx.twinId },
    });
    expect(config).not.toBeNull(); // reactivation restores as-was

    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: out.audit_event_id },
    });
    expect(audit?.event_type).toBe("ENTITY_SUSPENDED");
    expect(audit?.actor_entity_id).toBe(ctx.adminId);
    const details = (audit?.details ?? {}) as Record<string, unknown>;
    expect(details.action).toBe("AI_TEAMMATE_DEACTIVATED");
    expect(details.reason).toBe(REASON);
    expect(details.owner_entity_id).toBe(ctx.memberId);
    expect(details.prior_status).toBe("ACTIVE");

    // Idempotence: deactivating again refuses honestly.
    const again = await act(ctx.twinId, "deactivate", ctx.adminToken);
    expect(again.statusCode).toBe(409);
    expect((again.json() as { code: string }).code).toBe("TWIN_ALREADY_DEACTIVATED");

    // Reactivate restores ACTIVE with its own audit.
    const re = await act(ctx.twinId, "reactivate", ctx.adminToken);
    expect(re.statusCode).toBe(200);
    const reOut = re.json() as { status: string; audit_event_id: string };
    expect(reOut.status).toBe("ACTIVE");
    const restored = await prisma.entity.findUnique({
      where: { entity_id: ctx.twinId },
    });
    expect(restored?.status).toBe("ACTIVE");
    expect(restored?.suspended_at).toBeNull();
    const reAudit = await prisma.auditEvent.findUnique({
      where: { audit_id: reOut.audit_event_id },
    });
    expect(reAudit?.event_type).toBe("ENTITY_REACTIVATED");
    expect(
      ((reAudit?.details ?? {}) as Record<string, unknown>).action,
    ).toBe("AI_TEAMMATE_REACTIVATED");

    // Reactivating an ACTIVE twin refuses honestly.
    const reAgain = await act(ctx.twinId, "reactivate", ctx.adminToken);
    expect(reAgain.statusCode).toBe(409);
    expect((reAgain.json() as { code: string }).code).toBe("TWIN_ALREADY_ACTIVE");
  });

  it("refusal matrix: blank reason 400, employee 403, unauth 401, cross-org 404, human target 404", async () => {
    const ctx = await makeOrgWithTwin();

    const blank = await act(ctx.twinId, "deactivate", ctx.adminToken, "  ");
    expect(blank.statusCode).toBe(400);
    expect((blank.json() as { code: string }).code).toBe("REASON_REQUIRED");

    const asEmployee = await act(ctx.twinId, "deactivate", ctx.memberToken);
    expect(asEmployee.statusCode).toBe(403);

    const unauth = await act(ctx.twinId, "deactivate", null);
    expect(unauth.statusCode).toBe(401);

    // Cross-org: a second org's admin cannot see or touch this twin.
    const other = await makeOrgWithTwin();
    const crossOrg = await act(ctx.twinId, "deactivate", other.adminToken);
    expect(crossOrg.statusCode).toBe(404); // enumeration-safe

    // A HUMAN entity is unreachable via this rail.
    const human = await act(ctx.memberId, "deactivate", ctx.adminToken);
    expect(human.statusCode).toBe(404);
    expect((human.json() as { code: string }).code).toBe("TWIN_NOT_FOUND");

    // Nothing moved.
    const twin = await prisma.entity.findUnique({
      where: { entity_id: ctx.twinId },
    });
    expect(twin?.status).toBe("ACTIVE");
  });
});
