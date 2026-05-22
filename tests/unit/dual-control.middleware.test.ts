// FILE: dual-control.middleware.test.ts (unit)
// PURPOSE: Cover the requireDualControl Fastify preHandler + the pure
//          evaluateDualControlState transform + the dualControlDescription
//          carrier helper (apps/api/src/middleware/dual-control.middleware.ts
//          + apps/api/src/security/privileged-endpoints.ts, sub-phase E
//          [SEC-DUAL-CONTROL-MIDDLEWARE]). Real containerized Postgres per
//          ADR-0011 unit tier; real EscalationRequest fixtures via
//          createEscalationForCaller / approveEscalationForCaller. The
//          FastifyRequest / FastifyReply are hand-rolled test doubles (no
//          vi.mock -- the verification core is a pure function and the
//          Fastify wrapper is thin). Mirrors the tests/unit/escalation.test.ts
//          cleanup discipline.
// CONNECTS TO:
//   - apps/api/src/middleware/dual-control.middleware.ts (the substrate
//     under test; consumed via the "@niov/api" re-exports)
//   - apps/api/src/security/privileged-endpoints.ts (dualControlDescription;
//     the PrivilegedEndpoint descriptor passed to requireDualControl)
//   - apps/api/src/services/governance/escalation.service.ts
//     (createEscalationForCaller / approveEscalationForCaller /
//     findApprovedDualControlForCaller -- fixture + read-side substrate)
//   - tests/unit/escalation.test.ts (the cleanup + audit-lookup pattern
//     this file mirrors)
//   - docs/architecture/dual-control-operations-canonical-record.md §3+§4+§5
//     (verification flow, Zone U1 audit-event sequence, the 6 BEAM patterns)
//
// cleanupTestEscalations RATIONALE: same as tests/unit/escalation.test.ts --
// EscalationRequest entity relations have no onDelete: Cascade, so this test
// owns its own escalation_requests cleanup, running BEFORE cleanupTestData()
// in beforeAll / afterEach / afterAll. audit_events are NOT cleaned (the
// ADR-0002 BEFORE DELETE trigger forbids it); test isolation comes from
// fresh-per-test entities and actor_entity_id filtering.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  approveEscalationForCaller,
  createEscalationForCaller,
  dualControlDescription,
  evaluateDualControlState,
  findApprovedDualControlForCaller,
  requireDualControl,
} from "@niov/api";
import type { DualControlEscalationView, PrivilegedEndpoint } from "@niov/api";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

// ---------------------------------------------------------------------------
// Fixtures + test doubles
// ---------------------------------------------------------------------------

const ACTION_TYPE = "PLATFORM_MONETIZATION_CONFIG_UPDATE" as const;
const ENDPOINT: PrivilegedEndpoint = {
  method: "PATCH",
  route: "/api/v1/platform/monetization/config",
  authTier: "can_admin_niov",
  actionDescriptor: { type: ACTION_TYPE },
};

// WHAT: Delete every escalation_requests row referencing a test entity.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: Must run BEFORE cleanupTestData() -- see the file-header rationale.
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

// WHAT: Build a fresh PERSON entity for use as a test caller.
// INPUT: None.
// OUTPUT: The new entity_id.
// WHY: The escalation_requests FKs (source / target) point at entities.
async function makeParty(): Promise<string> {
  const e = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  return e.entity_id;
}

type ReplyState = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  sent: boolean;
};

// WHAT: A hand-rolled FastifyReply test double recording status / headers /
//        body / whether send() was called.
// INPUT: None.
// OUTPUT: { reply, state } -- the double cast to FastifyReply + the recorder.
// WHY: The preHandler only uses reply.code(), reply.header(), reply.send();
//      a full Fastify app is the integration tier (sub-phases F + G).
function makeFakeReply(): { reply: FastifyReply; state: ReplyState } {
  const state: ReplyState = {
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: false,
  };
  const reply: Record<string, unknown> = {};
  reply.code = (n: number) => {
    state.statusCode = n;
    return reply;
  };
  reply.status = (n: number) => {
    state.statusCode = n;
    return reply;
  };
  reply.header = (k: string, v: string) => {
    state.headers[k] = v;
    return reply;
  };
  reply.send = (payload: unknown) => {
    state.body = payload;
    state.sent = true;
    return reply;
  };
  return { reply: reply as unknown as FastifyReply, state };
}

// WHAT: A hand-rolled FastifyRequest test double carrying request.auth (or
//        not, to exercise the hook-ordering guard).
// INPUT: callerEntityId -- omit to simulate a missing prior auth hook.
// OUTPUT: The double cast to FastifyRequest.
// WHY: The preHandler reads only request.auth?.entity_id.
function makeFakeRequest(callerEntityId?: string): FastifyRequest {
  const auth =
    callerEntityId === undefined
      ? undefined
      : {
          entity_id: callerEntityId,
          session_id: "test-session",
          clearance_ceiling: 0,
          allowed_operations: [] as string[],
        };
  return { auth } as unknown as FastifyRequest;
}

// WHAT: Read this caller's ADMIN_ACTION audit events, newest-irrelevant
//        (returns all, the caller filters).
// INPUT: entityId (the actor).
// OUTPUT: Array of { event_type, actor_entity_id, denial_reason, details }.
// WHY: Verifies the Zone U1 sequence writes (ADR-0002 + RULE 4); isolated by
//      actor_entity_id since each test uses a fresh entity.
async function adminAuditEventsFor(entityId: string): Promise<
  Array<{
    event_type: string;
    actor_entity_id: string | null;
    denial_reason: string | null;
    details: Record<string, unknown>;
  }>
> {
  const rows = await prisma.auditEvent.findMany({
    where: { event_type: "ADMIN_ACTION", actor_entity_id: entityId },
    orderBy: { timestamp: "asc" },
  });
  return rows.map((r) => ({
    event_type: r.event_type,
    actor_entity_id: r.actor_entity_id,
    denial_reason: r.denial_reason,
    details: r.details as Record<string, unknown>,
  }));
}

// WHAT: The DUAL_CONTROL_* action discriminators among a caller's audit
//        events, in write order.
// INPUT: entityId.
// OUTPUT: Array of action strings (e.g. ["DUAL_CONTROL_VERIFICATION_PRE", ...]).
// WHY: The middleware's events are tagged details.action; fixture events
//      (ESCALATION_CREATED / ESCALATION_APPROVED) are filtered out.
async function dualControlActionsFor(entityId: string): Promise<string[]> {
  const events = await adminAuditEventsFor(entityId);
  return events
    .map((e) => String(e.details.action ?? ""))
    .filter((a) => a.startsWith("DUAL_CONTROL_"));
}

// WHAT: Create a genuinely two-person-APPROVED dual-control EscalationRequest
//        whose SOURCE (initiator) is the caller.
// INPUT: callerId + optional expiresAt (defaults to null -- non-expiring).
// OUTPUT: The approved escalation_id.
// WHY: Fixture for the APPROVED-path tests. GOVSEC.5 GAP-C1: the source/initiator
//      may NOT self-approve, so the target/approver is a DISTINCT second human
//      (distinctApproverId !== callerId). findApprovedDualControlForCaller(callerId)
//      still discovers the row because it is scoped by source_entity_id (= caller);
//      evaluateDualControlState does not branch on the target, so the Approved
//      outcome is unchanged. This proves the read-side over a REAL two-person
//      approval rather than the former hollow self-approval.
async function makeApprovedDualControl(
  callerId: string,
  expiresAt: Date | null = null,
): Promise<string> {
  const distinctApproverId = await makeParty();
  const created = await createEscalationForCaller(callerId, {
    target_entity_id: distinctApproverId,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(ACTION_TYPE),
    expires_at: expiresAt,
  });
  await approveEscalationForCaller(distinctApproverId, created.escalation_id);
  return created.escalation_id;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

let callerId = "";

beforeEach(async () => {
  callerId = await makeParty();
});

// ---------------------------------------------------------------------------
// 1-5. evaluateDualControlState -- the pure transform (no DB)
// ---------------------------------------------------------------------------

describe("evaluateDualControlState (pure transform)", () => {
  it("no escalation -> Denied(ESCALATION_PENDING)", () => {
    const out = evaluateDualControlState("caller-1", ENDPOINT.actionDescriptor, null);
    expect(out.kind).toBe("Denied");
    if (out.kind !== "Denied") return;
    expect(out.failure.kind).toBe("PermanentFailure");
    if (out.failure.kind !== "PermanentFailure") return;
    expect(out.failure.reason).toBe("ESCALATION_PENDING");
    expect(out.failure.escalation_id).toBeUndefined();
  });

  it("APPROVED, not expired -> Approved with the escalation_id", () => {
    const view: DualControlEscalationView = {
      escalation_id: "esc-approved",
      status: "APPROVED",
      expires_at: null,
    };
    const out = evaluateDualControlState("caller-1", ENDPOINT.actionDescriptor, view);
    expect(out.kind).toBe("Approved");
    if (out.kind !== "Approved") return;
    expect(out.escalation_id).toBe("esc-approved");
  });

  it("APPROVED but past expires_at -> Denied(ESCALATION_EXPIRED) carrying the id", () => {
    const view: DualControlEscalationView = {
      escalation_id: "esc-expired",
      status: "APPROVED",
      expires_at: new Date(Date.now() - 60_000),
    };
    const out = evaluateDualControlState("caller-1", ENDPOINT.actionDescriptor, view);
    expect(out.kind).toBe("Denied");
    if (out.kind !== "Denied") return;
    if (out.failure.kind !== "PermanentFailure") return;
    expect(out.failure.reason).toBe("ESCALATION_EXPIRED");
    expect(out.failure.escalation_id).toBe("esc-expired");
  });

  it("PENDING status -> Denied(ESCALATION_PENDING) carrying the id (defensive branch)", () => {
    const view: DualControlEscalationView = {
      escalation_id: "esc-pending",
      status: "PENDING",
      expires_at: null,
    };
    const out = evaluateDualControlState("caller-1", ENDPOINT.actionDescriptor, view);
    expect(out.kind).toBe("Denied");
    if (out.kind !== "Denied") return;
    if (out.failure.kind !== "PermanentFailure") return;
    expect(out.failure.reason).toBe("ESCALATION_PENDING");
    expect(out.failure.escalation_id).toBe("esc-pending");
  });

  it("REJECTED status -> Denied(ESCALATION_PENDING)", () => {
    const view: DualControlEscalationView = {
      escalation_id: "esc-rejected",
      status: "REJECTED",
      expires_at: null,
    };
    const out = evaluateDualControlState("caller-1", ENDPOINT.actionDescriptor, view);
    expect(out.kind).toBe("Denied");
    if (out.kind !== "Denied") return;
    if (out.failure.kind !== "PermanentFailure") return;
    expect(out.failure.reason).toBe("ESCALATION_PENDING");
  });
});

// ---------------------------------------------------------------------------
// 6-11. requireDualControl -- the preHandler (real Postgres)
// ---------------------------------------------------------------------------

describe("requireDualControl preHandler", () => {
  it("missing request.auth -> 401 AUTH_REQUIRED, no audit events written", async () => {
    const preHandler = requireDualControl(ENDPOINT);
    const { reply, state } = makeFakeReply();
    const before = await prisma.auditEvent.count();
    await preHandler(makeFakeRequest(undefined), reply);
    const after = await prisma.auditEvent.count();
    expect(state.sent).toBe(true);
    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(after).toBe(before);
  });

  it("no escalation exists -> creates a PENDING one, returns 403, writes PRE+LOOKUP+HANDLER_DENIED, ESCALATION_CREATED count 1", async () => {
    const preHandler = requireDualControl(ENDPOINT);
    const { reply, state } = makeFakeReply();
    await preHandler(makeFakeRequest(callerId), reply);

    expect(state.statusCode).toBe(403);
    const body = state.body as { ok: boolean; error: string; escalation_id: string | null };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ESCALATION_PENDING");
    expect(body.escalation_id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await prisma.escalationRequest.findMany({
      where: { source_entity_id: callerId, escalation_type: "DUAL_CONTROL_REQUIRED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("PENDING");
    expect(rows[0]!.description).toBe(dualControlDescription(ACTION_TYPE));
    expect(rows[0]!.escalation_id).toBe(body.escalation_id);

    expect(await dualControlActionsFor(callerId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(callerId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
    const denied = events.find((e) => e.details.action === "DUAL_CONTROL_HANDLER_DENIED")!;
    expect(denied.denial_reason).toBe("ESCALATION_PENDING");
    expect(denied.details.denial_reason).toBe("ESCALATION_PENDING");
  });

  it("a PENDING escalation already exists -> returns 403, does NOT create a duplicate, ESCALATION_CREATED count stays 1", async () => {
    const original = await createEscalationForCaller(callerId, {
      target_entity_id: callerId,
      escalation_type: "DUAL_CONTROL_REQUIRED",
      severity: "HIGH",
      description: dualControlDescription(ACTION_TYPE),
    });

    const preHandler = requireDualControl(ENDPOINT);
    const { reply, state } = makeFakeReply();
    await preHandler(makeFakeRequest(callerId), reply);

    expect(state.statusCode).toBe(403);
    const body = state.body as { escalation_id: string | null };
    expect(body.escalation_id).toBe(original.escalation_id);

    const rows = await prisma.escalationRequest.findMany({
      where: {
        source_entity_id: callerId,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        status: "PENDING",
      },
    });
    expect(rows).toHaveLength(1);

    const events = await adminAuditEventsFor(callerId);
    expect(events.filter((e) => e.details.action === "ESCALATION_CREATED")).toHaveLength(1);
  });

  it("an APPROVED escalation exists -> writes PRE+LOOKUP+APPROVAL_VERIFIED+HANDLER_DELEGATED and resolves without sending a reply", async () => {
    await makeApprovedDualControl(callerId);

    const preHandler = requireDualControl(ENDPOINT);
    const { reply, state } = makeFakeReply();
    await preHandler(makeFakeRequest(callerId), reply);

    expect(state.sent).toBe(false);
    expect(state.statusCode).toBe(200);

    expect(await dualControlActionsFor(callerId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_APPROVAL_VERIFIED",
      "DUAL_CONTROL_HANDLER_DELEGATED",
    ]);
  });

  it("an APPROVED but past-expiry escalation exists -> returns 403 with denial_reason ESCALATION_EXPIRED", async () => {
    const escId = await makeApprovedDualControl(callerId, new Date(Date.now() - 60_000));

    const preHandler = requireDualControl(ENDPOINT);
    const { reply, state } = makeFakeReply();
    await preHandler(makeFakeRequest(callerId), reply);

    expect(state.statusCode).toBe(403);
    const body = state.body as { error: string; escalation_id: string | null };
    expect(body.error).toBe("ESCALATION_EXPIRED");
    expect(body.escalation_id).toBe(escId);

    expect(await dualControlActionsFor(callerId)).toEqual([
      "DUAL_CONTROL_VERIFICATION_PRE",
      "DUAL_CONTROL_ESCALATION_LOOKUP",
      "DUAL_CONTROL_HANDLER_DENIED",
    ]);
    const events = await adminAuditEventsFor(callerId);
    const denied = events.find((e) => e.details.action === "DUAL_CONTROL_HANDLER_DENIED")!;
    expect(denied.denial_reason).toBe("ESCALATION_EXPIRED");
  });

  it("idempotent verification (Pattern 5): the same APPROVED escalation yields the same outcome twice", async () => {
    const escId = await makeApprovedDualControl(callerId);
    const first = await findApprovedDualControlForCaller(callerId, ENDPOINT.actionDescriptor);
    const second = await findApprovedDualControlForCaller(callerId, ENDPOINT.actionDescriptor);
    expect(first?.escalation_id).toBe(escId);
    expect(second?.escalation_id).toBe(escId);
    const outA = evaluateDualControlState(callerId, ENDPOINT.actionDescriptor, first);
    const outB = evaluateDualControlState(callerId, ENDPOINT.actionDescriptor, second);
    expect(outA).toEqual(outB);
    expect(outA).toEqual({ kind: "Approved", escalation_id: escId });
  });
});

// ---------------------------------------------------------------------------
// 12. dualControlDescription -- the carrier helper
// ---------------------------------------------------------------------------

describe("dualControlDescription", () => {
  it("returns the exact DUAL_CONTROL:${actionType} carrier string", () => {
    expect(dualControlDescription("PLATFORM_MONETIZATION_CONFIG_UPDATE")).toBe(
      "DUAL_CONTROL:PLATFORM_MONETIZATION_CONFIG_UPDATE",
    );
    expect(dualControlDescription("PLATFORM_ORG_CREATION")).toBe(
      "DUAL_CONTROL:PLATFORM_ORG_CREATION",
    );
  });
});
