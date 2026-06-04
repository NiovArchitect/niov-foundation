// FILE: org-collaboration-policy.test.ts (unit)
// PURPOSE: Phase 2 PR 1 — unit coverage for the admin/org
//          collaboration permission policy evaluator + upsert.
// CONNECTS TO:
//   - apps/api/src/services/governance/org-collaboration-policy.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    orgCollaborationPolicy: {
      findMany: vi.fn(),
      upsert: vi.fn(),
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

import {
  evaluateOrgCollaborationPolicy,
  listOrgCollaborationPoliciesForOrg,
  upsertOrgCollaborationPolicyForCaller,
} from "../../apps/api/src/services/governance/org-collaboration-policy.service.js";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const CALLER_ID = "22222222-2222-2222-2222-222222222222";

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    policy_id: "33333333-3333-3333-3333-333333333333",
    org_entity_id: ORG_ID,
    collaboration_scope: "CROSS_TEAM" as const,
    request_type: null,
    sensitivity_class: null,
    outcome: "ALLOW" as const,
    requires_employee_authority: false,
    requires_admin_approval: false,
    requires_dual_control: false,
    connector_write_allowed: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.orgCollaborationPolicy.findMany.mockReset();
  prismaMock.orgCollaborationPolicy.upsert.mockReset();
  auditMock.mockReset();
});

describe("evaluateOrgCollaborationPolicy — defaults", () => {
  it("SAME_PROJECT defaults to ALLOW when no policy row exists", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_PROJECT",
    });
    expect(r.outcome).toBe("ALLOW");
    expect(r.reason_code).toBe("ORG_DEFAULT_ALLOW");
  });

  it("SAME_TEAM defaults to ALLOW", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_TEAM",
    });
    expect(r.outcome).toBe("ALLOW");
  });

  it("CROSS_TEAM defaults to NEEDS_APPROVAL", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
    });
    expect(r.outcome).toBe("NEEDS_APPROVAL");
    expect(r.requires_admin_approval).toBe(true);
  });

  it("CROSS_PROJECT defaults to NEEDS_APPROVAL", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_PROJECT",
    });
    expect(r.outcome).toBe("NEEDS_APPROVAL");
  });

  it("ORG_WIDE defaults to NEEDS_APPROVAL", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "ORG_WIDE",
    });
    expect(r.outcome).toBe("NEEDS_APPROVAL");
  });
});

describe("evaluateOrgCollaborationPolicy — sensitive domain gate", () => {
  it("LEGAL → DUAL_CONTROL_REQUIRED regardless of scope default", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_PROJECT",
      sensitivityClass: "LEGAL",
    });
    expect(r.outcome).toBe("DUAL_CONTROL_REQUIRED");
    expect(r.reason_code).toBe("SENSITIVE_DOMAIN_DUAL_CONTROL");
    expect(r.requires_dual_control).toBe(true);
  });

  it("FINANCIAL → DUAL_CONTROL_REQUIRED", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_TEAM",
      sensitivityClass: "FINANCIAL",
    });
    expect(r.outcome).toBe("DUAL_CONTROL_REQUIRED");
  });

  it("SECURITY → DUAL_CONTROL_REQUIRED", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_TEAM",
      sensitivityClass: "SECURITY",
    });
    expect(r.outcome).toBe("DUAL_CONTROL_REQUIRED");
  });

  it("CUSTOMER_SENSITIVE → DUAL_CONTROL_REQUIRED", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_PROJECT",
      sensitivityClass: "CUSTOMER_SENSITIVE",
    });
    expect(r.outcome).toBe("DUAL_CONTROL_REQUIRED");
  });

  it("MODERATE sensitivity does NOT trigger DUAL_CONTROL", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_PROJECT",
      sensitivityClass: "MODERATE",
    });
    expect(r.outcome).toBe("ALLOW");
  });

  it("explicit BLOCK policy row overrides DUAL_CONTROL", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([
      policyRow({
        outcome: "BLOCK",
        request_type: null,
        sensitivity_class: "LEGAL",
      }),
    ]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
      sensitivityClass: "LEGAL",
    });
    expect(r.outcome).toBe("BLOCK");
  });
});

describe("evaluateOrgCollaborationPolicy — connector-write gate", () => {
  it("connector_write_attempt=true defaults to BLOCK when no row allows it (ADR-0084)", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "SAME_PROJECT",
      connectorWriteAttempt: true,
    });
    expect(r.outcome).toBe("BLOCK");
    expect(r.reason_code).toBe("CONNECTOR_WRITE_NOT_AUTHORIZED");
  });

  it("connector_write_attempt=true allowed when a row enables connector_write_allowed", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([
      policyRow({ connector_write_allowed: true }),
    ]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
      connectorWriteAttempt: true,
    });
    // Falls through to the scope-only row's outcome (ALLOW in the fixture).
    expect(r.outcome).toBe("ALLOW");
  });
});

describe("evaluateOrgCollaborationPolicy — row precedence", () => {
  it("specific (request_type + sensitivity) row wins over scope-only row", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([
      // scope-only row
      policyRow({ outcome: "NEEDS_APPROVAL" }),
      // specific row
      policyRow({
        policy_id: "44444444-4444-4444-4444-444444444444",
        request_type: "STATUS_REQUEST",
        sensitivity_class: "LOW",
        outcome: "ALLOW",
      }),
    ]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
      requestType: "STATUS_REQUEST",
      sensitivityClass: "LOW",
    });
    expect(r.outcome).toBe("ALLOW");
    expect(r.reason_code).toBe("POLICY_ROW_MATCH");
  });

  it("scope-only row used when no specific row matches", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([
      policyRow({ outcome: "BLOCK" }),
    ]);
    const r = await evaluateOrgCollaborationPolicy({
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
      requestType: "HANDOFF",
    });
    expect(r.outcome).toBe("BLOCK");
  });
});

describe("upsertOrgCollaborationPolicyForCaller", () => {
  it("creates/updates a policy row + emits ORG_COLLABORATION_POLICY_UPSERTED audit", async () => {
    prismaMock.orgCollaborationPolicy.upsert.mockResolvedValue(policyRow());
    const view = await upsertOrgCollaborationPolicyForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scope: "CROSS_TEAM",
      outcome: "ALLOW",
    });
    expect(view.outcome).toBe("ALLOW");
    expect(view.collaboration_scope).toBe("CROSS_TEAM");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "ORG_COLLABORATION_POLICY_UPSERTED",
    );
  });
});

describe("listOrgCollaborationPoliciesForOrg", () => {
  it("returns rows for the named org via safe-view projection", async () => {
    prismaMock.orgCollaborationPolicy.findMany.mockResolvedValue([
      policyRow(),
    ]);
    const rows = await listOrgCollaborationPoliciesForOrg({
      orgEntityId: ORG_ID,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.policy_id).toBe(policyRow().policy_id);
    // Ensure the underlying findMany was pinned to the org.
    const call =
      prismaMock.orgCollaborationPolicy.findMany.mock.calls[0]?.[0];
    expect(call.where.org_entity_id).toBe(ORG_ID);
  });
});
