// FILE: twin-project-context.test.ts (unit)
// PURPOSE: Phase 1 PR 3 — unit coverage for the
//          project_context_summary sidecar helper.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-project-context.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workProjectMember: {
      findMany: vi.fn(),
    },
    workProject: {
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

import { computeProjectContextSummaryForCaller } from "../../apps/api/src/services/otzar/twin-project-context.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";
const P1 = "22222222-2222-2222-2222-222222222222";
const P2 = "33333333-3333-3333-3333-333333333333";
const P3 = "44444444-4444-4444-4444-444444444444";
const P4 = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.workProjectMember.findMany.mockReset();
  prismaMock.workProject.findMany.mockReset();
});

describe("computeProjectContextSummaryForCaller — empty", () => {
  it("returns all-zero counts + null timestamp when caller has no memberships", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([]);
    const s = await computeProjectContextSummaryForCaller(CALLER_ID);
    expect(s).toEqual({
      active_project_count: 0,
      owned_project_count: 0,
      reviewer_project_count: 0,
      member_project_count: 0,
      recent_project_activity_at: null,
    });
  });
});

describe("computeProjectContextSummaryForCaller — mixed roles + ARCHIVED filter", () => {
  it("counts roles per active project and excludes archived ones", async () => {
    const recent = new Date("2026-06-03T12:00:00.000Z");
    const older = new Date("2026-05-15T08:00:00.000Z");
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: P1, role: "OWNER" },
      { project_id: P2, role: "MEMBER" },
      { project_id: P3, role: "REVIEWER" },
      { project_id: P4, role: "OWNER" }, // archived — excluded
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([
      { project_id: P1, updated_at: recent },
      { project_id: P2, updated_at: older },
      { project_id: P3, updated_at: older },
      // P4 archived; not in active set
    ]);
    const s = await computeProjectContextSummaryForCaller(CALLER_ID);
    expect(s.active_project_count).toBe(3);
    expect(s.owned_project_count).toBe(1);
    expect(s.reviewer_project_count).toBe(1);
    expect(s.member_project_count).toBe(1);
    expect(s.recent_project_activity_at).toBe(recent.toISOString());
  });
});

describe("computeProjectContextSummaryForCaller — self-scope guard", () => {
  it("where clause pins entity_id to caller", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([]);
    await computeProjectContextSummaryForCaller(CALLER_ID);
    const call = prismaMock.workProjectMember.findMany.mock.calls[0]?.[0];
    expect(call.where.entity_id).toBe(CALLER_ID);
  });

  it("active project fetch is filtered to ACTIVE state", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: P1, role: "OWNER" },
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([
      { project_id: P1, updated_at: new Date() },
    ]);
    await computeProjectContextSummaryForCaller(CALLER_ID);
    const projectCall = prismaMock.workProject.findMany.mock.calls[0]?.[0];
    expect(projectCall.where.state).toBe("ACTIVE");
  });

  it("surface contains only counts + 1 timestamp (no project_ids / names)", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: P1, role: "OWNER" },
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([
      { project_id: P1, updated_at: new Date() },
    ]);
    const s = await computeProjectContextSummaryForCaller(CALLER_ID);
    expect(Object.keys(s).sort()).toEqual(
      [
        "active_project_count",
        "owned_project_count",
        "reviewer_project_count",
        "member_project_count",
        "recent_project_activity_at",
      ].sort(),
    );
  });
});
