// FILE: approval-backlog-aggregate.test.ts (unit)
// PURPOSE: ADR-0087 Hive Intelligence Runtime — V1 APPROVAL_BACKLOG
//          signal unit tests. Verifies the closed-vocab label
//          classification thresholds, the k=5 minimum-population gate,
//          the window-day validation, and the SAFE projection
//          invariants. The integration-tier round-trip (DB-backed
//          end-to-end + ANALYTICS_READ audit row write) lives under
//          tests/integration/.
// CONNECTS TO: apps/api/src/services/analytics/analytics.service.ts
//              via @niov/api barrel.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    entityMembership: { findMany: vi.fn() },
    escalationRequest: { count: vi.fn() },
  },
  writeAuditEventMock: vi.fn().mockResolvedValue({ audit_event_id: "0".repeat(36) }),
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
  APPROVAL_BACKLOG_LABELS,
  AnalyticsService,
  type ApprovalBacklogAggregate,
  type ApprovalBacklogLabel,
} from "@niov/api";

function members(n: number): Array<{ child_id: string }> {
  return Array.from({ length: n }, (_, i) => ({
    child_id: `mem-${String(i).padStart(4, "0")}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

const ORG = "org-1";
const CALLER = "caller-admin";

async function call(opts: {
  member_count: number;
  total: number;
  pending: number;
  window_days?: number;
}): Promise<ApprovalBacklogAggregate | { ok: false }> {
  prismaMock.entityMembership.findMany.mockResolvedValue(members(opts.member_count));
  // First call returns total, second returns pending.
  prismaMock.escalationRequest.count
    .mockResolvedValueOnce(opts.total)
    .mockResolvedValueOnce(opts.pending);
  const svc = new AnalyticsService();
  return svc.getApprovalBacklogForOrg({
    org_entity_id: ORG,
    actor_entity_id: CALLER,
    ...(opts.window_days !== undefined ? { window_days: opts.window_days } : {}),
    ip_address: "127.0.0.1",
  }) as Promise<ApprovalBacklogAggregate>;
}

describe("ADR-0087 APPROVAL_BACKLOG — closed-vocab labels", () => {
  it("exposes the canonical 6-label enum", () => {
    expect(APPROVAL_BACKLOG_LABELS).toEqual([
      "HIGH_BACKLOG",
      "MODERATE_BACKLOG",
      "LIGHT_BACKLOG",
      "NO_BACKLOG",
      "NO_ESCALATIONS",
      "INSUFFICIENT_POPULATION",
    ]);
  });
});

describe("ADR-0087 APPROVAL_BACKLOG — threshold classification", () => {
  it("pending_rate >= 0.5 → HIGH_BACKLOG", async () => {
    const r = (await call({ member_count: 10, total: 10, pending: 5 })) as ApprovalBacklogAggregate;
    expect(r.signal_label as ApprovalBacklogLabel).toBe("HIGH_BACKLOG");
    expect(r.pending_rate).toBe(0.5);
  });

  it("pending_rate = 0.2 → MODERATE_BACKLOG", async () => {
    const r = (await call({ member_count: 10, total: 10, pending: 2 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("MODERATE_BACKLOG");
    expect(r.pending_rate).toBe(0.2);
  });

  it("pending_rate in (0, 0.2) → LIGHT_BACKLOG", async () => {
    const r = (await call({ member_count: 10, total: 100, pending: 1 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("LIGHT_BACKLOG");
    expect(r.pending_rate).toBe(0.01);
  });

  it("pending = 0 AND total > 0 → NO_BACKLOG", async () => {
    const r = (await call({ member_count: 10, total: 5, pending: 0 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("NO_BACKLOG");
    expect(r.pending_rate).toBe(0);
  });

  it("total = 0 → NO_ESCALATIONS (pending_rate null)", async () => {
    const r = (await call({ member_count: 10, total: 0, pending: 0 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("NO_ESCALATIONS");
    expect(r.pending_rate).toBeNull();
    expect(r.total_count).toBe(0);
    expect(r.pending_count).toBe(0);
  });

  it("pending_rate = 0.49999... → MODERATE_BACKLOG (boundary just below 0.5)", async () => {
    const r = (await call({ member_count: 10, total: 10000, pending: 4999 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("MODERATE_BACKLOG");
    expect(r.pending_rate).toBeCloseTo(0.4999, 4);
  });

  it("pending_rate = 1.0 → HIGH_BACKLOG", async () => {
    const r = (await call({ member_count: 10, total: 3, pending: 3 })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("HIGH_BACKLOG");
    expect(r.pending_rate).toBe(1);
  });
});

describe("ADR-0087 APPROVAL_BACKLOG — k=5 minimum-population gate", () => {
  it("member_count < 5 → INSUFFICIENT_POPULATION + redacted = true + counts null", async () => {
    prismaMock.entityMembership.findMany.mockResolvedValue(members(4));
    const svc = new AnalyticsService();
    const r = (await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      ip_address: null,
    })) as ApprovalBacklogAggregate;
    expect(r.signal_label).toBe("INSUFFICIENT_POPULATION");
    expect(r.redacted).toBe(true);
    expect(r.pending_count).toBeNull();
    expect(r.total_count).toBeNull();
    expect(r.pending_rate).toBeNull();
    expect(r.member_count).toBe(4);
    // EscalationRequest.count must NOT have been queried when redacted.
    expect(prismaMock.escalationRequest.count).not.toHaveBeenCalled();
    // Audit emitted with redacted=true.
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const call0 = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const det = call0.details as Record<string, unknown>;
    expect(det.action).toBe("ANALYTICS_READ");
    expect(det.aggregate).toBe("APPROVAL_BACKLOG");
    expect(det.redacted).toBe(true);
  });

  it("member_count = 5 → above the gate (NO_ESCALATIONS path with redacted = false)", async () => {
    const r = (await call({ member_count: 5, total: 0, pending: 0 })) as ApprovalBacklogAggregate;
    expect(r.redacted).toBe(false);
    expect(r.signal_label).toBe("NO_ESCALATIONS");
  });
});

describe("ADR-0087 APPROVAL_BACKLOG — window_days validation", () => {
  it("rejects window_days = 0 → INVALID_REQUEST", async () => {
    const svc = new AnalyticsService();
    const r = await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      window_days: 0,
      ip_address: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_REQUEST");
      expect(r.invalid_fields).toContain("window_days");
    }
  });

  it("rejects window_days = 31 → INVALID_REQUEST", async () => {
    const svc = new AnalyticsService();
    const r = await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      window_days: 31,
      ip_address: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_REQUEST");
  });

  it("rejects window_days = -1 → INVALID_REQUEST", async () => {
    const svc = new AnalyticsService();
    const r = await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      window_days: -1,
      ip_address: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_REQUEST");
  });

  it("rejects non-integer window_days → INVALID_REQUEST", async () => {
    const svc = new AnalyticsService();
    const r = await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
      window_days: 3.5,
      ip_address: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_REQUEST");
  });

  it("window_days = 7 (default) is accepted; 1 and 30 are at the bounds and accepted", async () => {
    const r1 = (await call({ member_count: 5, total: 0, pending: 0, window_days: 1 })) as ApprovalBacklogAggregate;
    expect(r1.window_days).toBe(1);
    expect(r1.ok).toBe(true);

    const r2 = (await call({ member_count: 5, total: 0, pending: 0, window_days: 30 })) as ApprovalBacklogAggregate;
    expect(r2.window_days).toBe(30);
    expect(r2.ok).toBe(true);
  });
});

describe("ADR-0087 APPROVAL_BACKLOG — SAFE projection + no-leak invariants", () => {
  it("audit ANALYTICS_READ emission carries no per-actor attribution", async () => {
    await call({ member_count: 10, total: 5, pending: 3 });
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(c.event_type).toBe("ADMIN_ACTION");
    expect(c.actor_entity_id).toBe(CALLER);
    expect(c.target_entity_id).toBe(ORG);
    const det = c.details as Record<string, unknown>;
    expect(det.action).toBe("ANALYTICS_READ");
    expect(det.aggregate).toBe("APPROVAL_BACKLOG");
    expect(det.org_entity_id).toBe(ORG);
    expect(det.redacted).toBe(false);
    expect(det.result_count).toBe(3);
    expect(det.filter_keys).toEqual(["window_days"]);
    // FORBIDDEN in audit details: per-escalation attribution.
    // Assertion scoped to `details` (the audit envelope's own
    // top-level target_entity_id is the canonical AuditEvent
    // scoping field set to org_entity_id — that's not a leak).
    const detSerialized = JSON.stringify(det);
    expect(detSerialized).not.toMatch(/escalation_id/);
    expect(detSerialized).not.toMatch(/source_entity_id/);
    expect(detSerialized).not.toMatch(/resolved_by_entity_id/);
    expect(detSerialized).not.toMatch(/resolution_metadata/);
    expect(detSerialized).not.toMatch(/escalation_type/);
    expect(detSerialized).not.toMatch(/severity/);
    expect(detSerialized).not.toMatch(/description/);
    expect(detSerialized).not.toMatch(/employee_score/);
    expect(detSerialized).not.toMatch(/productivity_score/);
  });

  it("ip_address forwards to the audit row when supplied", async () => {
    await call({ member_count: 10, total: 5, pending: 3 });
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(c.ip_address).toBe("127.0.0.1");
  });

  it("ip_address is null when not supplied (defensive guard)", async () => {
    prismaMock.entityMembership.findMany.mockResolvedValue(members(5));
    prismaMock.escalationRequest.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const svc = new AnalyticsService();
    await svc.getApprovalBacklogForOrg({
      org_entity_id: ORG,
      actor_entity_id: CALLER,
    });
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(c.ip_address).toBeNull();
  });

  it("response body does NOT contain any forbidden raw EscalationRequest field", async () => {
    const r = (await call({ member_count: 10, total: 8, pending: 3 })) as ApprovalBacklogAggregate;
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/escalation_id/);
    expect(serialized).not.toMatch(/source_entity_id/);
    expect(serialized).not.toMatch(/resolved_by_entity_id/);
    expect(serialized).not.toMatch(/resolution_metadata/);
    expect(serialized).not.toMatch(/escalation_type/);
    expect(serialized).not.toMatch(/severity/);
    expect(serialized).not.toMatch(/description/);
    // Verify the SAFE projection shape
    expect(Object.keys(r).sort()).toEqual([
      "aggregate",
      "honest_note",
      "member_count",
      "ok",
      "org_entity_id",
      "pending_count",
      "pending_rate",
      "redacted",
      "signal_label",
      "total_count",
      "window_days",
    ]);
  });

  it("honest_note explicitly denies employee/productivity/manager-dashboard framing", async () => {
    const r = (await call({ member_count: 10, total: 8, pending: 3 })) as ApprovalBacklogAggregate;
    expect(r.honest_note).toMatch(/not an employee score/);
    expect(r.honest_note).toMatch(/not a manager dashboard/);
    expect(r.honest_note).toMatch(/not a productivity index/);
  });
});

describe("ADR-0087 APPROVAL_BACKLOG — same-org boundary at the query tier", () => {
  it("EscalationRequest.count is called with source_entity_id ∈ org-member IDs (same-org boundary enforced)", async () => {
    await call({ member_count: 6, total: 4, pending: 2 });
    expect(prismaMock.escalationRequest.count).toHaveBeenCalledTimes(2);
    const firstCall = prismaMock.escalationRequest.count.mock.calls[0]?.[0] as { where: { source_entity_id: { in: string[] } } };
    expect(firstCall.where.source_entity_id.in).toHaveLength(6);
    expect(firstCall.where.source_entity_id.in[0]).toMatch(/^mem-/);
    // Second call is the pending-status subset; same source filter.
    const secondCall = prismaMock.escalationRequest.count.mock.calls[1]?.[0] as { where: { source_entity_id: { in: string[] }; status: string } };
    expect(secondCall.where.source_entity_id.in).toHaveLength(6);
    expect(secondCall.where.status).toBe("PENDING");
  });
});
