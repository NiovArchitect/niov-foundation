// FILE: enterprise-twin-state.test.ts (unit)
// PURPOSE: Enterprise Twin Runtime V1 ENTERPRISE_TWIN_STATE
//          aggregate unit tests. The first Enterprise Twin
//          read-only state projection per Founder direction
//          "Authorized first step after BEAM/DMW groundwork:
//          read-only Enterprise Twin state projection."
// CONNECTS TO: apps/api/src/services/analytics/analytics.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    entityMembership: { findMany: vi.fn() },
    entity: { count: vi.fn() },
    hive: { count: vi.fn() },
    entitlement: { findUnique: vi.fn() },
    consentGrant: { count: vi.fn() },
    teamDelegation: { count: vi.fn() },
    connectorBinding: { count: vi.fn() },
    escalationRequest: { count: vi.fn() },
  },
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_event_id: "0".repeat(36) }),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: writeAuditEventMock,
  };
});

import {
  ENTERPRISE_TWIN_POSTURE_LABELS,
  AnalyticsService,
  type EnterpriseTwinStateAggregate,
} from "@niov/api";

const ORG = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function members(n: number): Array<{ child_id: string }> {
  return Array.from({ length: n }, (_, i) => ({
    child_id: `mem-${String(i).padStart(4, "0")}`,
  }));
}

interface CallOpts {
  member_count: number;
  ai_agent_count?: number;
  active_hive_count?: number;
  has_entitlement?: boolean;
  active_consent_count?: number;
  active_delegation_count?: number;
  active_binding_count?: number;
  pending_escalation_count?: number;
}

async function callWithCounts(
  opts: CallOpts,
): Promise<EnterpriseTwinStateAggregate | { ok: false }> {
  prismaMock.entityMembership.findMany.mockResolvedValue(
    members(opts.member_count),
  );
  prismaMock.entity.count.mockResolvedValue(opts.ai_agent_count ?? 0);
  prismaMock.hive.count.mockResolvedValue(opts.active_hive_count ?? 0);
  prismaMock.entitlement.findUnique.mockResolvedValue(
    opts.has_entitlement === true
      ? { org_entity_id: ORG }
      : null,
  );
  prismaMock.consentGrant.count.mockResolvedValue(
    opts.active_consent_count ?? 0,
  );
  prismaMock.teamDelegation.count.mockResolvedValue(
    opts.active_delegation_count ?? 0,
  );
  prismaMock.connectorBinding.count.mockResolvedValue(
    opts.active_binding_count ?? 0,
  );
  prismaMock.escalationRequest.count.mockResolvedValue(
    opts.pending_escalation_count ?? 0,
  );
  const svc = new AnalyticsService();
  return svc.getEnterpriseTwinStateForOrg({
    org_entity_id: ORG,
    actor_entity_id: CALLER,
    ip_address: "127.0.0.1",
  }) as Promise<EnterpriseTwinStateAggregate>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// 1. Closed-vocab posture labels
// =====================================================================

describe("ENTERPRISE_TWIN_POSTURE_LABELS — closed-vocab", () => {
  it("exposes 5 canonical posture values", () => {
    expect(ENTERPRISE_TWIN_POSTURE_LABELS).toEqual([
      "HEAVY_ACTIVITY",
      "MODERATE_ACTIVITY",
      "LIGHT_ACTIVITY",
      "DORMANT",
      "INSUFFICIENT_POPULATION",
    ]);
  });
});

// =====================================================================
// 2. k=5 minimum-population gate
// =====================================================================

describe("getEnterpriseTwinStateForOrg — k=5 minimum-population gate", () => {
  it("member_count < 5 → INSUFFICIENT_POPULATION + redacted=true + all numeric fields null", async () => {
    prismaMock.entityMembership.findMany.mockResolvedValue(members(4));
    const svc = new AnalyticsService();
    const r = (await svc.getEnterpriseTwinStateForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      ip_address: null,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.redacted).toBe(true);
    expect(r.member_count).toBe(4);
    expect(r.ai_agent_count).toBeNull();
    expect(r.active_hive_count).toBeNull();
    expect(r.has_entitlement).toBeNull();
    expect(r.active_consent_grant_count).toBeNull();
    expect(r.active_team_delegation_count).toBeNull();
    expect(r.active_connector_binding_count).toBeNull();
    expect(r.pending_escalation_count).toBeNull();
    expect(r.activity_density).toBeNull();
    // No downstream Prisma queries fired when redacted.
    expect(prismaMock.entity.count).not.toHaveBeenCalled();
    expect(prismaMock.hive.count).not.toHaveBeenCalled();
    expect(prismaMock.entitlement.findUnique).not.toHaveBeenCalled();
    // Audit emitted with redacted=true.
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const det = c.details as Record<string, unknown>;
    expect(det.aggregate).toBe("ENTERPRISE_TWIN_STATE");
    expect(det.redacted).toBe(true);
  });
});

// =====================================================================
// 3. Posture-label threshold classification
// =====================================================================

describe("getEnterpriseTwinStateForOrg — posture threshold classification", () => {
  it("DORMANT when activity_density = 0 (no governance objects)", async () => {
    const r = (await callWithCounts({
      member_count: 10,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("DORMANT");
    expect(r.activity_density).toBe(0);
  });

  it("LIGHT_ACTIVITY when density in [0.05, 0.5)", async () => {
    const r = (await callWithCounts({
      member_count: 10,
      active_hive_count: 1,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("LIGHT_ACTIVITY");
    expect(r.activity_density).toBe(0.1);
  });

  it("MODERATE_ACTIVITY when density in [0.5, 1.5)", async () => {
    const r = (await callWithCounts({
      member_count: 10,
      active_hive_count: 2,
      active_consent_count: 3,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("MODERATE_ACTIVITY");
    expect(r.activity_density).toBe(0.5);
  });

  it("HEAVY_ACTIVITY when density >= 1.5", async () => {
    const r = (await callWithCounts({
      member_count: 10,
      active_hive_count: 5,
      active_consent_count: 5,
      active_delegation_count: 5,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("HEAVY_ACTIVITY");
    expect(r.activity_density).toBe(1.5);
  });

  it("HEAVY_ACTIVITY at a high density", async () => {
    const r = (await callWithCounts({
      member_count: 5,
      active_hive_count: 10,
      active_consent_count: 10,
      active_delegation_count: 10,
      active_binding_count: 10,
      pending_escalation_count: 10,
    })) as EnterpriseTwinStateAggregate;
    expect(r.posture_label).toBe("HEAVY_ACTIVITY");
    expect(r.activity_density).toBe(10);
  });
});

// =====================================================================
// 4. SAFE projection + no-leak invariants
// =====================================================================

describe("getEnterpriseTwinStateForOrg — SAFE projection invariants", () => {
  it("response carries exact closed-vocab fields only; no entity_ids surfaced", async () => {
    const r = (await callWithCounts({
      member_count: 6,
      ai_agent_count: 2,
      active_hive_count: 1,
      has_entitlement: true,
      active_consent_count: 2,
      active_delegation_count: 1,
      active_binding_count: 1,
      pending_escalation_count: 0,
    })) as EnterpriseTwinStateAggregate;
    expect(r.ok).toBe(true);
    expect(r.aggregate).toBe("ENTERPRISE_TWIN_STATE");
    expect(r.org_entity_id).toBe(ORG);
    expect(r.ai_agent_count).toBe(2);
    expect(r.active_hive_count).toBe(1);
    expect(r.has_entitlement).toBe(true);
    expect(r.active_consent_grant_count).toBe(2);
    expect(r.active_team_delegation_count).toBe(1);
    expect(r.active_connector_binding_count).toBe(1);
    expect(r.pending_escalation_count).toBe(0);
    // Confirm the exact response field set
    expect(Object.keys(r).sort()).toEqual([
      "active_connector_binding_count",
      "active_consent_grant_count",
      "active_hive_count",
      "active_team_delegation_count",
      "activity_density",
      "aggregate",
      "ai_agent_count",
      "has_entitlement",
      "honest_note",
      "member_count",
      "ok",
      "org_entity_id",
      "pending_escalation_count",
      "posture_label",
      "redacted",
    ]);
  });

  it("has_entitlement is false when no Entitlement row exists (never exposes plan_archetype_id or features)", async () => {
    const r = (await callWithCounts({
      member_count: 6,
      has_entitlement: false,
    })) as EnterpriseTwinStateAggregate;
    expect(r.has_entitlement).toBe(false);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/plan_archetype/);
    expect(serialized).not.toMatch(/feature_entitlements/);
    expect(serialized).not.toMatch(/capability_packs/);
  });

  it("honest_note explicitly denies employee-score / manager-dashboard / productivity-index framing", async () => {
    const r = (await callWithCounts({
      member_count: 10,
    })) as EnterpriseTwinStateAggregate;
    expect(r.honest_note).toMatch(/not an employee score/);
    expect(r.honest_note).toMatch(/not a manager dashboard/);
    expect(r.honest_note).toMatch(/not a productivity index/);
  });

  it("audit emission carries no entity_ids / no membership graph / no governance contents", async () => {
    await callWithCounts({
      member_count: 6,
      active_hive_count: 1,
    });
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const det = c.details as Record<string, unknown>;
    expect(det.aggregate).toBe("ENTERPRISE_TWIN_STATE");
    const serialized = JSON.stringify(c);
    expect(serialized).not.toMatch(/mem-/); // synthetic member ids must not surface
    expect(serialized).not.toMatch(/employee_score/i);
    expect(serialized).not.toMatch(/productivity_score/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
  });
});

// =====================================================================
// 5. Same-org boundary at query tier
// =====================================================================

describe("getEnterpriseTwinStateForOrg — same-org boundary", () => {
  it("ConsentGrant query scopes grantor_entity_id to org-member IDs", async () => {
    await callWithCounts({
      member_count: 6,
      active_consent_count: 0,
    });
    expect(prismaMock.consentGrant.count).toHaveBeenCalled();
    const arg = prismaMock.consentGrant.count.mock.calls[0]?.[0] as {
      where: { grantor_entity_id: { in: string[] } };
    };
    expect(arg.where.grantor_entity_id.in).toHaveLength(6);
  });

  it("TeamDelegation query scopes delegator_entity_id to org-member IDs", async () => {
    await callWithCounts({
      member_count: 6,
      active_delegation_count: 0,
    });
    expect(prismaMock.teamDelegation.count).toHaveBeenCalled();
    const arg = prismaMock.teamDelegation.count.mock.calls[0]?.[0] as {
      where: { delegator_entity_id: { in: string[] } };
    };
    expect(arg.where.delegator_entity_id.in).toHaveLength(6);
  });

  it("ConnectorBinding query scopes org_entity_id to caller's org", async () => {
    await callWithCounts({
      member_count: 6,
      active_binding_count: 0,
    });
    expect(prismaMock.connectorBinding.count).toHaveBeenCalled();
    const arg = prismaMock.connectorBinding.count.mock.calls[0]?.[0] as {
      where: { org_entity_id: string; enabled: boolean };
    };
    expect(arg.where.org_entity_id).toBe(ORG);
    expect(arg.where.enabled).toBe(true);
  });

  it("Hive query scopes org_entity_id to caller's org with status=ACTIVE", async () => {
    await callWithCounts({
      member_count: 6,
      active_hive_count: 0,
    });
    expect(prismaMock.hive.count).toHaveBeenCalled();
    const arg = prismaMock.hive.count.mock.calls[0]?.[0] as {
      where: { org_entity_id: string; status: string };
    };
    expect(arg.where.org_entity_id).toBe(ORG);
    expect(arg.where.status).toBe("ACTIVE");
  });
});
