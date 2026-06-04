// FILE: twin-collaboration.test.ts (unit)
// PURPOSE: Phase EDX-6 PR 1 — unit coverage for the create / list /
//          accept / reject / cancel / complete pure-function
//          helpers on the TwinCollaborationRequest substrate.
//          Prisma + writeAuditEvent mocked.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-collaboration.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCollaborationRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    entityMembership: {
      findFirst: vi.fn(),
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

// Phase 1 PR 4 — mock the work-project membership helper.
const { isActiveProjectMemberMock } = vi.hoisted(() => ({
  isActiveProjectMemberMock: vi.fn(),
}));
vi.mock("../../apps/api/src/services/otzar/work-project.service.js", () => ({
  isActiveProjectMember: isActiveProjectMemberMock,
}));

// Phase 2 PR 2 — mock the org collaboration policy evaluator.
const { evalPolicyMock } = vi.hoisted(() => ({
  evalPolicyMock: vi.fn(),
}));
vi.mock(
  "../../apps/api/src/services/governance/org-collaboration-policy.service.js",
  () => ({
    evaluateOrgCollaborationPolicy: evalPolicyMock,
  }),
);

import {
  acceptTwinCollaborationRequestForCaller,
  cancelTwinCollaborationRequestForCaller,
  completeTwinCollaborationRequestForCaller,
  createTwinCollaborationRequestForCaller,
  listInboundCollaborationRequestsForCaller,
  listOutboundCollaborationRequestsForCaller,
  projectCollaborationRequestSafeView,
  rejectTwinCollaborationRequestForCaller,
} from "../../apps/api/src/services/otzar/twin-collaboration.service.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";
const COLLAB_ID = "44444444-4444-4444-4444-444444444444";

function rowFixture(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-03T12:00:00.000Z");
  return {
    collaboration_id: COLLAB_ID,
    org_entity_id: ORG_ID,
    requester_entity_id: CALLER_ID,
    requester_twin_entity_id: null,
    target_entity_id: TARGET_ID,
    target_twin_entity_id: null,
    target_team_id: null,
    target_project_id: null,
    workflow_id: null,
    action_id: null,
    request_type: "STATUS_REQUEST" as const,
    target_type: "EMPLOYEE" as const,
    state: "REQUESTED" as const,
    sensitivity_class: "MODERATE" as const,
    safe_summary: "Can you confirm the launch window?",
    requested_by_ai: false,
    requires_approval: false,
    approval_grant_id: null,
    blocked_reason: null,
    expires_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinCollaborationRequest.create.mockReset();
  prismaMock.twinCollaborationRequest.findUnique.mockReset();
  prismaMock.twinCollaborationRequest.findMany.mockReset();
  prismaMock.twinCollaborationRequest.update.mockReset();
  prismaMock.entityMembership.findFirst.mockReset();
  auditMock.mockReset();
  isActiveProjectMemberMock.mockReset();
  evalPolicyMock.mockReset();
  // Default the policy evaluator to ALLOW so the pre-existing tests
  // (which were written before the policy gate landed) keep passing.
  evalPolicyMock.mockResolvedValue({
    outcome: "ALLOW",
    reason_code: "ORG_DEFAULT_ALLOW",
    requires_employee_authority: false,
    requires_admin_approval: false,
    requires_dual_control: false,
  });
});

describe("projectCollaborationRequestSafeView", () => {
  it("collapses target FKs to booleans, never the IDs", () => {
    const row = rowFixture({
      target_entity_id: TARGET_ID,
      target_twin_entity_id: "55555555-5555-5555-5555-555555555555",
      target_team_id: "66666666-6666-6666-6666-666666666666",
      target_project_id: "77777777-7777-7777-7777-777777777777",
    });
    const view = projectCollaborationRequestSafeView(row);
    expect(view).not.toHaveProperty("target_entity_id");
    expect(view).not.toHaveProperty("target_twin_entity_id");
    expect(view.has_target_entity).toBe(true);
    expect(view.has_target_twin).toBe(true);
    expect(view.has_target_team).toBe(true);
    expect(view.has_target_project).toBe(true);
  });
});

describe("createTwinCollaborationRequestForCaller", () => {
  it("creates a REQUESTED row + emits TWIN_COLLABORATION_REQUESTED audit", async () => {
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(rowFixture());
    const r = await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: "Can you confirm the launch window?",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("REQUESTED");
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.details.action).toBe("TWIN_COLLABORATION_REQUESTED");
  });

  it("requires_approval=true → state NEEDS_APPROVAL", async () => {
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({ state: "NEEDS_APPROVAL", requires_approval: true }),
    );
    const r = await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: "Test",
      requiresApproval: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("NEEDS_APPROVAL");
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("NEEDS_APPROVAL");
  });

  it("returns CROSS_ORG_DENIED when target is not in caller's org", async () => {
    prismaMock.entityMembership.findFirst.mockResolvedValue(null); // not in org
    const r = await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: "Test",
    });
    expect(r).toEqual({ ok: false, code: "CROSS_ORG_DENIED" });
  });

  it("returns TARGET_NOT_FOUND when target_type=EMPLOYEE but no targetEntityId", async () => {
    const r = await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      requestType: "STATUS_REQUEST",
      safeSummary: "Test",
    });
    expect(r).toEqual({ ok: false, code: "TARGET_NOT_FOUND" });
  });

  it("bounds safe_summary to prevent raw-transcript collection", async () => {
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(rowFixture());
    const oversize = "z".repeat(800);
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: oversize,
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.safe_summary.length).toBeLessThanOrEqual(500);
  });

  // Phase 1 PR 4 — PROJECT target_type project-membership guard.
  it("PROJECT target with caller-not-a-member creates a BLOCKED row + MISSING_PROJECT_MEMBERSHIP reason", async () => {
    isActiveProjectMemberMock.mockResolvedValue(false);
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({
        target_type: "PROJECT",
        target_project_id: "99999999-9999-9999-9999-999999999999",
        state: "BLOCKED",
        blocked_reason: "MISSING_PROJECT_MEMBERSHIP",
      }),
    );
    const r = await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "PROJECT",
      targetProjectId: "99999999-9999-9999-9999-999999999999",
      requestType: "PROJECT_COORDINATION",
      safeSummary: "Project handoff",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The create call writes the blocked row with the reason.
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("BLOCKED");
    expect(createCall.data.blocked_reason).toBe("MISSING_PROJECT_MEMBERSHIP");
  });

  it("PROJECT target with caller IS a member creates a REQUESTED row + no blocked_reason", async () => {
    isActiveProjectMemberMock.mockResolvedValue(true);
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({
        target_type: "PROJECT",
        target_project_id: "99999999-9999-9999-9999-999999999999",
      }),
    );
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "PROJECT",
      targetProjectId: "99999999-9999-9999-9999-999999999999",
      requestType: "PROJECT_COORDINATION",
      safeSummary: "Project coordination",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("REQUESTED");
    expect(createCall.data.blocked_reason).toBeNull();
  });

  // Phase 2 PR 2 — org collaboration policy integration. The
  // evaluator is mocked so we can drive the create-time state
  // machine through each outcome.
  it("policy ALLOW + no requires_approval → REQUESTED", async () => {
    evalPolicyMock.mockResolvedValue({
      outcome: "ALLOW",
      reason_code: "ORG_DEFAULT_ALLOW",
      requires_employee_authority: false,
      requires_admin_approval: false,
      requires_dual_control: false,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(rowFixture());
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: "ALLOW path",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("REQUESTED");
  });

  it("policy NEEDS_APPROVAL forces NEEDS_APPROVAL state", async () => {
    evalPolicyMock.mockResolvedValue({
      outcome: "NEEDS_APPROVAL",
      reason_code: "ORG_DEFAULT_NEEDS_APPROVAL",
      requires_employee_authority: false,
      requires_admin_approval: true,
      requires_dual_control: false,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({ state: "NEEDS_APPROVAL" }),
    );
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "CROSS_TEAM_COORDINATION",
      safeSummary: "Cross-team",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("NEEDS_APPROVAL");
  });

  it("policy BLOCK creates BLOCKED row + POLICY_REQUIRES_APPROVAL reason", async () => {
    evalPolicyMock.mockResolvedValue({
      outcome: "BLOCK",
      reason_code: "POLICY_ROW_MATCH",
      requires_employee_authority: false,
      requires_admin_approval: false,
      requires_dual_control: false,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({
        state: "BLOCKED",
        blocked_reason: "POLICY_REQUIRES_APPROVAL",
      }),
    );
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "STATUS_REQUEST",
      safeSummary: "Will be blocked",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("BLOCKED");
    expect(createCall.data.blocked_reason).toBe("POLICY_REQUIRES_APPROVAL");
  });

  it("policy DUAL_CONTROL_REQUIRED → NEEDS_APPROVAL", async () => {
    evalPolicyMock.mockResolvedValue({
      outcome: "DUAL_CONTROL_REQUIRED",
      reason_code: "SENSITIVE_DOMAIN_DUAL_CONTROL",
      requires_employee_authority: false,
      requires_admin_approval: true,
      requires_dual_control: true,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: TARGET_ID,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({ state: "NEEDS_APPROVAL" }),
    );
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "EMPLOYEE",
      targetEntityId: TARGET_ID,
      requestType: "CONTEXT_REQUEST",
      sensitivityClass: "LEGAL",
      safeSummary: "Legal review needed",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("NEEDS_APPROVAL");
  });

  it("project membership block wins over policy (BLOCKED + MISSING_PROJECT_MEMBERSHIP)", async () => {
    // Even if the policy would allow, the project-membership rule
    // takes precedence and creates a BLOCKED row with the project-
    // membership reason.
    isActiveProjectMemberMock.mockResolvedValue(false);
    evalPolicyMock.mockResolvedValue({
      outcome: "ALLOW",
      reason_code: "ORG_DEFAULT_ALLOW",
      requires_employee_authority: false,
      requires_admin_approval: false,
      requires_dual_control: false,
    });
    prismaMock.twinCollaborationRequest.create.mockResolvedValue(
      rowFixture({
        state: "BLOCKED",
        blocked_reason: "MISSING_PROJECT_MEMBERSHIP",
      }),
    );
    await createTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      targetType: "PROJECT",
      targetProjectId: "99999999-9999-9999-9999-999999999999",
      requestType: "PROJECT_COORDINATION",
      safeSummary: "Project block",
    });
    const createCall =
      prismaMock.twinCollaborationRequest.create.mock.calls[0]?.[0];
    expect(createCall.data.state).toBe("BLOCKED");
    expect(createCall.data.blocked_reason).toBe(
      "MISSING_PROJECT_MEMBERSHIP",
    );
    // Policy evaluator is NOT called when project-membership blocks.
    expect(evalPolicyMock).not.toHaveBeenCalled();
  });
});

describe("list helpers", () => {
  it("inbound matches target_entity_id OR target_twin_entity_id", async () => {
    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([
      rowFixture(),
    ]);
    await listInboundCollaborationRequestsForCaller({
      callerEntityId: CALLER_ID,
    });
    const call =
      prismaMock.twinCollaborationRequest.findMany.mock.calls[0]?.[0];
    expect(call.where.OR).toEqual([
      { target_entity_id: CALLER_ID },
      { target_twin_entity_id: CALLER_ID },
    ]);
  });

  it("outbound pins requester_entity_id to caller", async () => {
    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([
      rowFixture(),
    ]);
    await listOutboundCollaborationRequestsForCaller({
      callerEntityId: CALLER_ID,
    });
    const call =
      prismaMock.twinCollaborationRequest.findMany.mock.calls[0]?.[0];
    expect(call.where.requester_entity_id).toBe(CALLER_ID);
  });
});

describe("transition helpers — target-applied (accept / reject)", () => {
  it("accept: COLLABORATION_NOT_FOUND when missing", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(null);
    const r = await acceptTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r).toEqual({ ok: false, code: "COLLABORATION_NOT_FOUND" });
  });

  it("accept: NOT_TARGET when caller is not the target", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ target_entity_id: "99999999-9999-9999-9999-999999999999" }),
    );
    const r = await acceptTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_TARGET" });
  });

  it("accept: REQUESTED → ACCEPTED + emits audit", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ target_entity_id: CALLER_ID }),
    );
    prismaMock.twinCollaborationRequest.update.mockResolvedValue(
      rowFixture({ state: "ACCEPTED", target_entity_id: CALLER_ID }),
    );
    const r = await acceptTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("ACCEPTED");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "TWIN_COLLABORATION_ACCEPTED",
    );
  });

  it("reject: REQUESTED → REJECTED + emits audit", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ target_entity_id: CALLER_ID }),
    );
    prismaMock.twinCollaborationRequest.update.mockResolvedValue(
      rowFixture({ state: "REJECTED", target_entity_id: CALLER_ID }),
    );
    const r = await rejectTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("REJECTED");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "TWIN_COLLABORATION_REJECTED",
    );
  });

  it("accept: INVALID_STATE_TRANSITION from terminal state", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ state: "COMPLETED", target_entity_id: CALLER_ID }),
    );
    const r = await acceptTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r).toEqual({ ok: false, code: "INVALID_STATE_TRANSITION" });
  });
});

describe("transition helpers — requester-applied (cancel / complete)", () => {
  it("cancel: NOT_REQUESTER when caller is not the requester", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({
        requester_entity_id: "99999999-9999-9999-9999-999999999999",
      }),
    );
    const r = await cancelTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_REQUESTER" });
  });

  it("cancel: REQUESTED → CANCELED + emits audit", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture(),
    );
    prismaMock.twinCollaborationRequest.update.mockResolvedValue(
      rowFixture({ state: "CANCELED" }),
    );
    const r = await cancelTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("CANCELED");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "TWIN_COLLABORATION_CANCELED",
    );
  });

  it("complete: ACCEPTED → COMPLETED + sets completed_at", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ state: "ACCEPTED" }),
    );
    prismaMock.twinCollaborationRequest.update.mockResolvedValue(
      rowFixture({ state: "COMPLETED", completed_at: new Date() }),
    );
    const r = await completeTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.collaboration.state).toBe("COMPLETED");
    expect(r.collaboration.completed_at).not.toBeNull();
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "TWIN_COLLABORATION_COMPLETED",
    );
  });

  it("complete: INVALID_STATE_TRANSITION from terminal state", async () => {
    prismaMock.twinCollaborationRequest.findUnique.mockResolvedValue(
      rowFixture({ state: "EXPIRED" }),
    );
    const r = await completeTwinCollaborationRequestForCaller({
      callerEntityId: CALLER_ID,
      collaborationId: COLLAB_ID,
    });
    expect(r).toEqual({ ok: false, code: "INVALID_STATE_TRANSITION" });
  });
});
