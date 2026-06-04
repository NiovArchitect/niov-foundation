// FILE: twin-authority-grant.test.ts (unit)
// PURPOSE: Phase EDX-4 PR 1 — Twin Authority Grant substrate per
//          the [FOUNDER-AUTH — AUTONOMOUS EMPLOYEE DGI STRUCTURAL
//          RUNTIME COMPLETION] directive. Unit tests for the
//          create / list / revoke / consume / check authority
//          pure-function helpers. Prisma + writeAuditEvent are
//          mocked so this file runs in the unit tier without a
//          DB hit.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-authority-grant.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    twinAuthorityGrant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  auditMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: auditMock,
  };
});

// Phase 1 PR 4 — mock the work-project membership helper so the
// PROJECT_SCOPED branch can be exercised without DB.
const { isActiveProjectMemberMock } = vi.hoisted(() => ({
  isActiveProjectMemberMock: vi.fn(),
}));
vi.mock("../../apps/api/src/services/otzar/work-project.service.js", () => ({
  isActiveProjectMember: isActiveProjectMemberMock,
}));

import {
  checkAuthorityForAction,
  consumeOneTimeTwinAuthorityGrant,
  createTwinAuthorityGrantForCaller,
  listTwinAuthorityGrantsForCaller,
  projectTwinAuthorityGrantSafeView,
  revokeTwinAuthorityGrantForCaller,
} from "../../apps/api/src/services/otzar/twin-authority-grant.service.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";
const GRANTEE_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_CALLER_ID = "44444444-4444-4444-4444-444444444444";
const GRANT_ID = "55555555-5555-5555-5555-555555555555";

function rowFixture(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-03T12:00:00.000Z");
  return {
    grant_id: GRANT_ID,
    org_entity_id: ORG_ID,
    grantor_entity_id: CALLER_ID,
    grantee_entity_id: GRANTEE_ID,
    scope_type: "PERSONAL" as const,
    scope_id: null,
    action_type: null,
    connector_type: null,
    connector_binding_id: null,
    duration_class: "SESSION" as const,
    sensitivity_class: "MODERATE" as const,
    state: "ACTIVE" as const,
    effective_from: now,
    expires_at: null,
    revoked_at: null,
    revoked_by_entity_id: null,
    consumed_at: null,
    purpose_summary: "Test grant",
    constraints_json: {},
    consent_grant_id: null,
    receipt_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinAuthorityGrant.create.mockReset();
  prismaMock.twinAuthorityGrant.findUnique.mockReset();
  prismaMock.twinAuthorityGrant.findMany.mockReset();
  prismaMock.twinAuthorityGrant.update.mockReset();
  auditMock.mockReset();
  isActiveProjectMemberMock.mockReset();
});

describe("projectTwinAuthorityGrantSafeView", () => {
  it("never surfaces connector_binding_id directly", () => {
    const row = rowFixture({
      connector_binding_id: "66666666-6666-6666-6666-666666666666",
    });
    const view = projectTwinAuthorityGrantSafeView(row);
    expect(view).not.toHaveProperty("connector_binding_id");
    expect(view.has_connector_binding).toBe(true);
  });

  it("never surfaces constraints_json or revoked_by_entity_id", () => {
    const row = rowFixture({
      revoked_by_entity_id: "77777777-7777-7777-7777-777777777777",
      constraints_json: { secret: "should-not-leak" },
    });
    const view = projectTwinAuthorityGrantSafeView(row);
    expect(view).not.toHaveProperty("constraints_json");
    expect(view).not.toHaveProperty("revoked_by_entity_id");
  });

  it("marks ACTIVE grants as revocable; terminal states not revocable", () => {
    expect(projectTwinAuthorityGrantSafeView(rowFixture()).revocable).toBe(true);
    expect(
      projectTwinAuthorityGrantSafeView(rowFixture({ state: "REVOKED" }))
        .revocable,
    ).toBe(false);
    expect(
      projectTwinAuthorityGrantSafeView(rowFixture({ state: "CONSUMED" }))
        .revocable,
    ).toBe(false);
    expect(
      projectTwinAuthorityGrantSafeView(rowFixture({ state: "EXPIRED" }))
        .revocable,
    ).toBe(false);
  });
});

describe("createTwinAuthorityGrantForCaller", () => {
  it("writes the grant + emits ADMIN_ACTION audit before returning", async () => {
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(rowFixture());
    const result = await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PERSONAL",
      durationClass: "SESSION",
      purposeSummary: "Test grant",
    });
    expect(prismaMock.twinAuthorityGrant.create).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.event_type).toBe("ADMIN_ACTION");
    expect(auditCall.details.action).toBe("TWIN_AUTHORITY_GRANTED");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.grant_id).toBe(GRANT_ID);
  });

  it("forces caller as grantor (RULE 0)", async () => {
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(rowFixture());
    await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PERSONAL",
      durationClass: "SESSION",
      purposeSummary: "Test",
    });
    const createCall = prismaMock.twinAuthorityGrant.create.mock.calls[0]?.[0];
    expect(createCall.data.grantor_entity_id).toBe(CALLER_ID);
  });

  it("bounds purpose_summary to prevent raw-prompt collection", async () => {
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(rowFixture());
    const oversize = "x".repeat(800);
    await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PERSONAL",
      durationClass: "SESSION",
      purposeSummary: oversize,
    });
    const createCall = prismaMock.twinAuthorityGrant.create.mock.calls[0]?.[0];
    expect(createCall.data.purpose_summary.length).toBeLessThanOrEqual(500);
  });

  it("accepts ONE_TIME duration_class on creation", async () => {
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(
      rowFixture({ duration_class: "ONE_TIME" }),
    );
    const result = await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "ACTION_TYPE",
      actionType: "SEND_NOTIFICATION",
      durationClass: "ONE_TIME",
      purposeSummary: "Send approval reminder once",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.duration_class).toBe("ONE_TIME");
  });

  // Phase 1 PR 4 — PROJECT_SCOPED + scope_id validation.
  it("PROJECT_NOT_MEMBER when scope_type=PROJECT + scope_id given + caller not a member", async () => {
    isActiveProjectMemberMock.mockResolvedValue(false);
    const result = await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PROJECT",
      scopeId: "99999999-9999-9999-9999-999999999999",
      durationClass: "PROJECT_SCOPED",
      purposeSummary: "Project-scoped grant",
    });
    expect(result).toEqual({ ok: false, code: "PROJECT_NOT_MEMBER" });
    // No write should fire when the membership guard rejects.
    expect(prismaMock.twinAuthorityGrant.create).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("happy path when scope_type=PROJECT + scope_id given + caller IS a member", async () => {
    isActiveProjectMemberMock.mockResolvedValue(true);
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(
      rowFixture({ scope_type: "PROJECT" }),
    );
    const result = await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PROJECT",
      scopeId: "99999999-9999-9999-9999-999999999999",
      durationClass: "PROJECT_SCOPED",
      purposeSummary: "Project-scoped grant",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.scope_type).toBe("PROJECT");
  });

  it("PROJECT scope without scope_id skips the membership check (forward-substrate)", async () => {
    prismaMock.twinAuthorityGrant.create.mockResolvedValue(
      rowFixture({ scope_type: "PROJECT" }),
    );
    const result = await createTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      granteeEntityId: GRANTEE_ID,
      scopeType: "PROJECT",
      durationClass: "PROJECT_SCOPED",
      purposeSummary: "Project-class but unscoped",
    });
    expect(result.ok).toBe(true);
    expect(isActiveProjectMemberMock).not.toHaveBeenCalled();
  });
});

describe("listTwinAuthorityGrantsForCaller", () => {
  it("is self-scoped — only the caller's own grants", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([rowFixture()]);
    await listTwinAuthorityGrantsForCaller({ callerEntityId: CALLER_ID });
    const whereCall =
      prismaMock.twinAuthorityGrant.findMany.mock.calls[0]?.[0];
    expect(whereCall.where.grantor_entity_id).toBe(CALLER_ID);
  });

  it("caps take to 100", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    await listTwinAuthorityGrantsForCaller({
      callerEntityId: CALLER_ID,
      take: 9999,
    });
    const call = prismaMock.twinAuthorityGrant.findMany.mock.calls[0]?.[0];
    expect(call.take).toBe(100);
  });

  it("respects state filter when provided", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    await listTwinAuthorityGrantsForCaller({
      callerEntityId: CALLER_ID,
      state: "REVOKED",
    });
    const call = prismaMock.twinAuthorityGrant.findMany.mock.calls[0]?.[0];
    expect(call.where.state).toBe("REVOKED");
  });
});

describe("revokeTwinAuthorityGrantForCaller", () => {
  it("returns GRANT_NOT_FOUND when missing", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(null);
    const r = await revokeTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      grantId: GRANT_ID,
    });
    expect(r).toEqual({ ok: false, code: "GRANT_NOT_FOUND" });
  });

  it("returns NOT_GRANTOR when caller is not the grantor (cross-tenant guard)", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(rowFixture());
    const r = await revokeTwinAuthorityGrantForCaller({
      callerEntityId: OTHER_CALLER_ID,
      grantId: GRANT_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_GRANTOR" });
  });

  it("returns ALREADY_REVOKED on idempotent revoke", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(
      rowFixture({ state: "REVOKED" }),
    );
    const r = await revokeTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      grantId: GRANT_ID,
    });
    expect(r).toEqual({ ok: false, code: "ALREADY_REVOKED" });
  });

  it("revokes ACTIVE grants and emits TWIN_AUTHORITY_REVOKED audit", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(rowFixture());
    prismaMock.twinAuthorityGrant.update.mockResolvedValue(
      rowFixture({ state: "REVOKED", revoked_at: new Date() }),
    );
    const r = await revokeTwinAuthorityGrantForCaller({
      callerEntityId: CALLER_ID,
      grantId: GRANT_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grant.state).toBe("REVOKED");
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.details.action).toBe("TWIN_AUTHORITY_REVOKED");
  });
});

describe("consumeOneTimeTwinAuthorityGrant", () => {
  it("rejects non-ONE_TIME grants", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(rowFixture());
    const r = await consumeOneTimeTwinAuthorityGrant({ grantId: GRANT_ID });
    expect(r).toEqual({ ok: false, code: "NOT_ONE_TIME" });
  });

  it("consumes ACTIVE ONE_TIME grants and emits audit", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(
      rowFixture({ duration_class: "ONE_TIME" }),
    );
    prismaMock.twinAuthorityGrant.update.mockResolvedValue(
      rowFixture({ duration_class: "ONE_TIME", state: "CONSUMED" }),
    );
    const r = await consumeOneTimeTwinAuthorityGrant({ grantId: GRANT_ID });
    expect(r).toEqual({ ok: true, grant_id: GRANT_ID });
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.details.action).toBe("TWIN_AUTHORITY_CONSUMED");
  });

  it("rejects double-consume", async () => {
    prismaMock.twinAuthorityGrant.findUnique.mockResolvedValue(
      rowFixture({ duration_class: "ONE_TIME", state: "CONSUMED" }),
    );
    const r = await consumeOneTimeTwinAuthorityGrant({ grantId: GRANT_ID });
    expect(r).toEqual({ ok: false, code: "ALREADY_CONSUMED" });
  });
});

describe("checkAuthorityForAction", () => {
  it("returns NO_MATCHING_GRANT when no rows match", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
    });
    expect(r).toEqual({ allowed: false, reason: "NO_MATCHING_GRANT" });
    // Denial emits an audit event.
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "TWIN_AUTHORITY_CHECK_DENIED",
    );
  });

  it("returns allowed=true with grant_id when a PERSONAL grant matches", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([rowFixture()]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
    });
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.grant_id).toBe(GRANT_ID);
    expect(r.duration_class).toBe("SESSION");
    // Successful checks DO NOT emit denial audit.
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("OUT_OF_SCOPE when action_type on row doesn't match request", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      rowFixture({
        scope_type: "ACTION_TYPE",
        action_type: "SEND_NOTIFICATION",
      }),
    ]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: ORG_ID,
      scopeType: "ACTION_TYPE",
      actionType: "PROPOSE_PERMISSION_GRANT",
    });
    expect(r).toEqual({ allowed: false, reason: "OUT_OF_SCOPE" });
  });

  it("SENSITIVE_CASE_BY_CASE requires explicit sensitivity_class on the request", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      rowFixture({ duration_class: "SENSITIVE_CASE_BY_CASE" }),
    ]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
    });
    expect(r).toEqual({
      allowed: false,
      reason: "SENSITIVE_CASE_BY_CASE_REQUIRES_EXPLICIT_GRANT",
    });
  });

  it("SENSITIVE_CASE_BY_CASE allows when sensitivity_class is named", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      rowFixture({ duration_class: "SENSITIVE_CASE_BY_CASE" }),
    ]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
      sensitivityClass: "HIGH",
    });
    expect(r.allowed).toBe(true);
  });

  it("cross-org denial — grant in org A does not satisfy a check in org B", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    const r = await checkAuthorityForAction({
      granteeEntityId: GRANTEE_ID,
      orgEntityId: "99999999-9999-9999-9999-999999999999",
      scopeType: "PERSONAL",
    });
    expect(r.allowed).toBe(false);
    const findManyCall =
      prismaMock.twinAuthorityGrant.findMany.mock.calls[0]?.[0];
    expect(findManyCall.where.org_entity_id).toBe(
      "99999999-9999-9999-9999-999999999999",
    );
  });
});
