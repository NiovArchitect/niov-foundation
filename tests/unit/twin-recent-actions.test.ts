// FILE: twin-recent-actions.test.ts (unit)
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit tests for the
//          pure-function helper that projects the caller's recent
//          Action substance volume + most-recent timestamp from
//          the Section 2 Action substrate.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-recent-actions.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    action: {
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

import { computeRecentActionSummaryForCaller } from "../../apps/api/src/services/otzar/twin-recent-actions.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.action.count.mockReset();
  prismaMock.action.findFirst.mockReset();
});

describe("computeRecentActionSummaryForCaller — empty window", () => {
  it("returns window + 0 + null when no recent actions exist", async () => {
    prismaMock.action.count.mockResolvedValue(0);
    prismaMock.action.findFirst.mockResolvedValue(null);

    const summary = await computeRecentActionSummaryForCaller(CALLER_ID);

    expect(summary.window_hours).toBe(168);
    expect(summary.total_count).toBe(0);
    expect(summary.most_recent_at).toBeNull();
  });
});

describe("computeRecentActionSummaryForCaller — populated window", () => {
  it("returns count + ISO timestamp when recent actions exist", async () => {
    const at = new Date("2026-06-03T05:30:00.000Z");
    prismaMock.action.count.mockResolvedValue(9);
    prismaMock.action.findFirst.mockResolvedValue({ created_at: at });

    const summary = await computeRecentActionSummaryForCaller(CALLER_ID);

    expect(summary.window_hours).toBe(168);
    expect(summary.total_count).toBe(9);
    expect(summary.most_recent_at).toBe("2026-06-03T05:30:00.000Z");
  });

  it("filters by source_entity_id + created_at >= since via where clause", async () => {
    prismaMock.action.count.mockResolvedValue(1);
    prismaMock.action.findFirst.mockResolvedValue({
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    await computeRecentActionSummaryForCaller(CALLER_ID);

    const countCall = prismaMock.action.count.mock.calls[0]![0]!;
    expect(countCall.where.source_entity_id).toBe(CALLER_ID);
    expect(countCall.where.created_at).toHaveProperty("gte");
    expect(countCall.where.created_at.gte).toBeInstanceOf(Date);

    const findCall = prismaMock.action.findFirst.mock.calls[0]![0]!;
    expect(findCall.where.source_entity_id).toBe(CALLER_ID);
    expect(findCall.where.created_at).toHaveProperty("gte");
  });
});

describe("computeRecentActionSummaryForCaller — explicit window override", () => {
  it("honors a custom windowHours parameter", async () => {
    prismaMock.action.count.mockResolvedValue(0);
    prismaMock.action.findFirst.mockResolvedValue(null);

    const summary = await computeRecentActionSummaryForCaller(CALLER_ID, 24);
    expect(summary.window_hours).toBe(24);

    const countCall = prismaMock.action.count.mock.calls[0]![0]!;
    const sinceFromCount = countCall.where.created_at.gte as Date;
    const expectedSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Within a 2-second tolerance to account for execution time.
    expect(
      Math.abs(sinceFromCount.getTime() - expectedSince.getTime()),
    ).toBeLessThan(2000);
  });
});

describe("computeRecentActionSummaryForCaller — no-leak invariant", () => {
  it("returns only window_hours + total_count + most_recent_at (no action_id / action_type / status / payload / target)", async () => {
    const at = new Date("2026-06-03T05:30:00.000Z");
    prismaMock.action.count.mockResolvedValue(2);
    prismaMock.action.findFirst.mockResolvedValue({
      created_at: at,
      // Extra fields that would leak if `select` weren't tight.
      action_id: "should-not-leak",
      action_type: "INVOKE_CONNECTOR",
      status: "SUCCEEDED",
      payload_redacted: "sensitive details",
      target_entity_id: "another-entity",
      handler_error_class: "CONNECTOR_AUTH_FAILED",
    });

    const summary = await computeRecentActionSummaryForCaller(CALLER_ID);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toContain("INVOKE_CONNECTOR");
    expect(serialized).not.toContain("SUCCEEDED");
    expect(serialized).not.toContain("sensitive details");
    expect(serialized).not.toContain("another-entity");
    expect(serialized).not.toContain("CONNECTOR_AUTH_FAILED");

    // Confirm select clause asked for ONLY created_at.
    const findCall = prismaMock.action.findFirst.mock.calls[0]![0]!;
    expect(findCall.select).toEqual({ created_at: true });

    expect(Object.keys(summary).sort()).toEqual([
      "most_recent_at",
      "total_count",
      "window_hours",
    ]);
  });

  it("never includes source_entity_id in the projection (caller already knows it's their own)", async () => {
    prismaMock.action.count.mockResolvedValue(1);
    prismaMock.action.findFirst.mockResolvedValue({ created_at: new Date() });

    const summary = await computeRecentActionSummaryForCaller(CALLER_ID);
    expect(JSON.stringify(summary)).not.toContain(CALLER_ID);
  });
});

describe("computeRecentActionSummaryForCaller — ordering", () => {
  it("requests most-recent first (orderBy created_at desc)", async () => {
    prismaMock.action.count.mockResolvedValue(1);
    prismaMock.action.findFirst.mockResolvedValue({
      created_at: new Date("2026-06-03T05:30:00.000Z"),
    });

    await computeRecentActionSummaryForCaller(CALLER_ID);

    const findCall = prismaMock.action.findFirst.mock.calls[0]![0]!;
    expect(findCall.orderBy).toEqual({ created_at: "desc" });
  });
});
