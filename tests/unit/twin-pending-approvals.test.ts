// FILE: twin-pending-approvals.test.ts (unit)
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit tests for the
//          pure-function helper that projects pending approval
//          inbox count + most-recent timestamp from
//          EscalationRequest substrate.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-pending-approvals.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    escalationRequest: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
  };
});

import { computePendingApprovalsSummaryForCaller } from "../../apps/api/src/services/otzar/twin-pending-approvals.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.escalationRequest.count.mockReset();
  prismaMock.escalationRequest.findFirst.mockReset();
});

describe("computePendingApprovalsSummaryForCaller — empty inbox", () => {
  it("returns 0 + null when no pending approvals exist", async () => {
    prismaMock.escalationRequest.count.mockResolvedValue(0);
    prismaMock.escalationRequest.findFirst.mockResolvedValue(null);

    const summary = await computePendingApprovalsSummaryForCaller(CALLER_ID);

    expect(summary.pending_count).toBe(0);
    expect(summary.most_recent_at).toBeNull();
  });
});

describe("computePendingApprovalsSummaryForCaller — populated inbox", () => {
  it("returns count + ISO timestamp when pending approvals exist", async () => {
    const at = new Date("2026-06-03T05:30:00.000Z");
    prismaMock.escalationRequest.count.mockResolvedValue(3);
    prismaMock.escalationRequest.findFirst.mockResolvedValue({
      created_at: at,
    });

    const summary = await computePendingApprovalsSummaryForCaller(CALLER_ID);

    expect(summary.pending_count).toBe(3);
    expect(summary.most_recent_at).toBe("2026-06-03T05:30:00.000Z");
  });

  it("filters by target_entity_id + status PENDING via where clause", async () => {
    prismaMock.escalationRequest.count.mockResolvedValue(1);
    prismaMock.escalationRequest.findFirst.mockResolvedValue({
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    await computePendingApprovalsSummaryForCaller(CALLER_ID);

    const countCall = prismaMock.escalationRequest.count.mock.calls[0]![0]!;
    expect(countCall.where.target_entity_id).toBe(CALLER_ID);
    expect(countCall.where.status).toBe("PENDING");

    const findCall = prismaMock.escalationRequest.findFirst.mock.calls[0]![0]!;
    expect(findCall.where.target_entity_id).toBe(CALLER_ID);
    expect(findCall.where.status).toBe("PENDING");
  });
});

describe("computePendingApprovalsSummaryForCaller — no-leak invariant", () => {
  it("returns only count + ISO timestamp (no escalation_id / description / severity / source / capsule / metadata)", async () => {
    const at = new Date("2026-06-03T05:30:00.000Z");
    prismaMock.escalationRequest.count.mockResolvedValue(2);
    prismaMock.escalationRequest.findFirst.mockResolvedValue({
      created_at: at,
      // These extra fields would be present if `select` weren't
      // tight — verify the helper ignores them even if they
      // showed up.
      escalation_id: "should-not-leak",
      description: "sensitive details",
      severity: "HIGH",
      source_entity_id: "another-entity",
    });

    const summary = await computePendingApprovalsSummaryForCaller(CALLER_ID);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toContain("sensitive details");
    expect(serialized).not.toContain("HIGH");
    expect(serialized).not.toContain("another-entity");

    // Confirm select clause asked for ONLY created_at.
    const findCall = prismaMock.escalationRequest.findFirst.mock.calls[0]![0]!;
    expect(findCall.select).toEqual({ created_at: true });

    expect(Object.keys(summary).sort()).toEqual([
      "most_recent_at",
      "pending_count",
    ]);
  });

  it("never includes target_entity_id in the projection (caller already knows it's their own)", async () => {
    prismaMock.escalationRequest.count.mockResolvedValue(1);
    prismaMock.escalationRequest.findFirst.mockResolvedValue({
      created_at: new Date(),
    });

    const summary = await computePendingApprovalsSummaryForCaller(CALLER_ID);
    expect(JSON.stringify(summary)).not.toContain(CALLER_ID);
  });
});

describe("computePendingApprovalsSummaryForCaller — ordering", () => {
  it("requests most-recent first (orderBy created_at desc)", async () => {
    prismaMock.escalationRequest.count.mockResolvedValue(1);
    prismaMock.escalationRequest.findFirst.mockResolvedValue({
      created_at: new Date("2026-06-03T05:30:00.000Z"),
    });

    await computePendingApprovalsSummaryForCaller(CALLER_ID);

    const findCall = prismaMock.escalationRequest.findFirst.mock.calls[0]![0]!;
    expect(findCall.orderBy).toEqual({ created_at: "desc" });
  });
});
