// FILE: twin-collaboration-inbox.test.ts (unit)
// PURPOSE: Phase EDX-6 PR 3 — unit coverage for the
//          collaboration_inbox_summary sidecar helper.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-collaboration-inbox.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCollaborationRequest: {
      findMany: vi.fn(),
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

import { computeCollaborationInboxSummaryForCaller } from "../../apps/api/src/services/otzar/twin-collaboration-inbox.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinCollaborationRequest.findMany.mockReset();
});

describe("computeCollaborationInboxSummaryForCaller — empty inbox", () => {
  it("returns zero counts + null most_recent_request_at", async () => {
    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([]);
    const s = await computeCollaborationInboxSummaryForCaller(CALLER_ID);
    expect(s).toEqual({
      pending_request_count: 0,
      needs_my_approval_count: 0,
      blocked_request_count: 0,
      completed_recent_count: 0,
      most_recent_request_at: null,
    });
  });
});

describe("computeCollaborationInboxSummaryForCaller — populated inbox", () => {
  it("aggregates per-state counts and most_recent_request_at", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * DAY_MS);
    const completedInWindow = new Date(now.getTime() - 5 * DAY_MS);
    const completedOutsideWindow = new Date(now.getTime() - 60 * DAY_MS);
    const old = new Date(now.getTime() - 10 * DAY_MS);

    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([
      { state: "REQUESTED", completed_at: null, created_at: recent },
      { state: "IN_PROGRESS", completed_at: null, created_at: old },
      { state: "NEEDS_APPROVAL", completed_at: null, created_at: old },
      { state: "NEEDS_APPROVAL", completed_at: null, created_at: old },
      { state: "BLOCKED", completed_at: null, created_at: old },
      {
        state: "COMPLETED",
        completed_at: completedInWindow,
        created_at: old,
      },
      {
        state: "COMPLETED",
        completed_at: completedOutsideWindow,
        created_at: old,
      },
      { state: "REJECTED", completed_at: null, created_at: old },
      { state: "CANCELED", completed_at: null, created_at: old },
      { state: "EXPIRED", completed_at: null, created_at: old },
    ]);

    const s = await computeCollaborationInboxSummaryForCaller(CALLER_ID);
    // REQUESTED + IN_PROGRESS = pending
    expect(s.pending_request_count).toBe(2);
    // 2 NEEDS_APPROVAL rows
    expect(s.needs_my_approval_count).toBe(2);
    // 1 BLOCKED
    expect(s.blocked_request_count).toBe(1);
    // 1 COMPLETED within 30-day window; the older one is excluded
    expect(s.completed_recent_count).toBe(1);
    // most_recent_request_at is the newest created_at
    expect(s.most_recent_request_at).toBe(recent.toISOString());
  });
});

describe("computeCollaborationInboxSummaryForCaller — self-scope guard", () => {
  it("where clause matches target_entity_id OR target_twin_entity_id pinned to caller", async () => {
    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([]);
    await computeCollaborationInboxSummaryForCaller(CALLER_ID);
    const call =
      prismaMock.twinCollaborationRequest.findMany.mock.calls[0]?.[0];
    expect(call.where.OR).toEqual([
      { target_entity_id: CALLER_ID },
      { target_twin_entity_id: CALLER_ID },
    ]);
  });

  it("never surfaces per-row substance (counts + 1 timestamp only)", async () => {
    prismaMock.twinCollaborationRequest.findMany.mockResolvedValue([
      {
        state: "REQUESTED",
        completed_at: null,
        created_at: new Date(),
      },
    ]);
    const s = await computeCollaborationInboxSummaryForCaller(CALLER_ID);
    expect(Object.keys(s).sort()).toEqual(
      [
        "blocked_request_count",
        "completed_recent_count",
        "most_recent_request_at",
        "needs_my_approval_count",
        "pending_request_count",
      ].sort(),
    );
  });
});
