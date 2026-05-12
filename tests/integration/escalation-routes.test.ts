// FILE: escalation-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for the /api/v1/escalations/* routes
//          (D-2D-D10-7): approve / reject (with the service-tier
//          source != resolver dual-control gate), get-one (party vs
//          non-party), get-pending (caller's own). End-to-end via
//          buildApp + app.inject.
// CONNECTS TO: buildApp (full Fastify wiring incl. registerEscalationRoutes),
//              escalation.service.ts (createEscalationForCaller for
//              test setup; the routes wrap approve/reject/get/list),
//              prisma (test seeding + assertions), the audit_events
//              table (ESCALATION_APPROVED / ESCALATION_REJECTED).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  createEscalationForCaller,
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

const TEST_JWT_SECRET = "escalation-routes-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

// WHAT: Delete every escalation_requests row that references a test
//        entity (source / target / resolver). Query-based / parameterless
//        so it also clears stale rows from a prior run.
// INPUT: None.
// OUTPUT: A promise resolving once the rows are gone.
// WHY: The approve/reject HTTP routes (and the createEscalationForCaller
//      test setup) create escalation_requests rows tied to test
//      entities; those rows FK-block cleanupTestData()'s hard-delete,
//      so this runs BEFORE cleanupTestData(). RULE 17 cross-reference:
//      this mirrors tests/unit/escalation.test.ts ([D-2D-D10-3]
//      DRIFT 2 Option A resolution) and tests/unit/cosmp/negotiate.test.ts
//      ([D-2D-D10-5] redux). DRIFT 2 REDUX #2 -- the pattern is now
//      operational across 3 test files (escalation.test.ts /
//      negotiate.test.ts / this file). RULE 10 no-FK-cascade
//      preservation: test-local cleanup, not a shared-helper extension
//      -- do NOT extend helpers.ts:cleanupTestData() (the blast-radius
//      coupling problem per [D-2D-D10-3] Option C rejection).
async function cleanupTestEscalations(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
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
  await cleanupTestEscalations();
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

afterEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterAll(async () => {
  await app.close();
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

// WHAT: Create + login a PERSON entity, return its id + bearer token.
// INPUT: None.
// OUTPUT: { entityId, token, ip }.
// WHY: Escalation parties (source, target) need real entities + active
//      sessions. The session requests read+write (write for
//      approve/reject; read for the GETs).
async function makePersonAndLogin(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const ip = `10.77.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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

// WHAT: Create a PENDING escalation with the given source + target.
// INPUT: sourceEntityId, targetEntityId.
// OUTPUT: The created escalation_id.
// WHY: The HTTP surface deliberately does not expose create (the only
//      creation path is the gate-fail coupling per [D-2D-D10-5]); test
//      setup uses the service function directly.
async function makeEscalation(
  sourceEntityId: string,
  targetEntityId: string,
): Promise<string> {
  const escalation = await createEscalationForCaller(sourceEntityId, {
    target_entity_id: targetEntityId,
    escalation_type: "HUMAN_REVIEW_REQUIRED",
    severity: "HIGH",
    description: "integration-test escalation",
  });
  return escalation.escalation_id;
}

describe("POST /api/v1/escalations/:id/approve", () => {
  it("lets the target resolve a PENDING escalation -> 200, status APPROVED, ESCALATION_APPROVED audit event exists", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${escalationId}/approve`,
      headers: { authorization: `Bearer ${target.token}` },
      payload: { resolution_metadata: { reviewed_by: "manager" } },
      remoteAddress: target.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; escalation: { status: string } };
    expect(body.ok).toBe(true);
    expect(body.escalation.status).toBe("APPROVED");

    const row = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    expect(row?.status).toBe("APPROVED");
    expect(row?.resolved_by_entity_id).toBe(target.entityId);
    expect(row?.resolved_at).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        details: { path: ["escalation_id"], equals: escalationId },
      },
      // The escalation also has an earlier ESCALATION_CREATED event
      // with the same details.escalation_id (from createEscalationForCaller
      // in test setup); order newest-first to get the resolution event.
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.details as Record<string, unknown>).action).toBe(
      "ESCALATION_APPROVED",
    );
  });
});

describe("POST /api/v1/escalations/:id/reject", () => {
  it("lets the target reject a PENDING escalation -> 200, status REJECTED, ESCALATION_REJECTED audit event exists", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${escalationId}/reject`,
      headers: { authorization: `Bearer ${target.token}` },
      payload: {},
      remoteAddress: target.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; escalation: { status: string } };
    expect(body.escalation.status).toBe("REJECTED");

    const row = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    expect(row?.status).toBe("REJECTED");

    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        details: { path: ["escalation_id"], equals: escalationId },
      },
      // The escalation also has an earlier ESCALATION_CREATED event
      // with the same details.escalation_id (from createEscalationForCaller
      // in test setup); order newest-first to get the resolution event.
      orderBy: { timestamp: "desc" },
    });
    expect((audit?.details as Record<string, unknown>).action).toBe(
      "ESCALATION_REJECTED",
    );
  });
});

describe("POST /api/v1/escalations/:id/approve -- dual-control gate", () => {
  it("forbids the source from self-approving (source != resolver enforced service-tier) -> 403 ESCALATION_FORBIDDEN", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${escalationId}/approve`,
      headers: { authorization: `Bearer ${source.token}` },
      payload: {},
      remoteAddress: source.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("ESCALATION_FORBIDDEN");
    const row = await prisma.escalationRequest.findUnique({
      where: { escalation_id: escalationId },
    });
    expect(row?.status).toBe("PENDING");
  });

  it("returns 404 ESCALATION_NOT_FOUND for a non-existent escalation id", async () => {
    const caller = await makePersonAndLogin();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${randomUUID()}/approve`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {},
      remoteAddress: caller.ip,
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("ESCALATION_NOT_FOUND");
  });

  it("returns 409 ESCALATION_INVALID_TRANSITION when approving an already-resolved escalation", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    // First approval succeeds.
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${escalationId}/approve`,
      headers: { authorization: `Bearer ${target.token}` },
      payload: {},
      remoteAddress: target.ip,
    });
    expect(first.statusCode).toBe(200);
    // Second approval is an invalid transition (status is no longer PENDING).
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/escalations/${escalationId}/approve`,
      headers: { authorization: `Bearer ${target.token}` },
      payload: {},
      remoteAddress: target.ip,
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { code: string }).code).toBe(
      "ESCALATION_INVALID_TRANSITION",
    );
  });
});

describe("GET /api/v1/escalations/:id", () => {
  it("lets a party (the source) read the escalation -> 200 with the escalation payload", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/escalations/${escalationId}`,
      headers: { authorization: `Bearer ${source.token}` },
      remoteAddress: source.ip,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      escalation: { escalation_id: string; status: string };
    };
    expect(body.escalation.escalation_id).toBe(escalationId);
    expect(body.escalation.status).toBe("PENDING");
  });

  it("returns 403 ESCALATION_FORBIDDEN when a non-party tries to read the escalation", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    const outsider = await makePersonAndLogin();
    const escalationId = await makeEscalation(source.entityId, target.entityId);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/escalations/${escalationId}`,
      headers: { authorization: `Bearer ${outsider.token}` },
      remoteAddress: outsider.ip,
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("ESCALATION_FORBIDDEN");
  });
});

describe("GET /api/v1/escalations/pending", () => {
  it("returns the caller's own PENDING escalations (newest first) and honors ?limit=", async () => {
    const source = await makePersonAndLogin();
    const target = await makePersonAndLogin();
    await makeEscalation(source.entityId, target.entityId);
    await makeEscalation(source.entityId, target.entityId);
    await makeEscalation(source.entityId, target.entityId);
    const all = await app.inject({
      method: "GET",
      url: "/api/v1/escalations/pending",
      headers: { authorization: `Bearer ${target.token}` },
      remoteAddress: target.ip,
    });
    expect(all.statusCode).toBe(200);
    const allBody = all.json() as { ok: boolean; escalations: unknown[] };
    expect(allBody.escalations).toHaveLength(3);

    const limited = await app.inject({
      method: "GET",
      url: "/api/v1/escalations/pending?limit=2",
      headers: { authorization: `Bearer ${target.token}` },
      remoteAddress: target.ip,
    });
    expect(limited.statusCode).toBe(200);
    expect((limited.json() as { escalations: unknown[] }).escalations).toHaveLength(2);
  });
});
