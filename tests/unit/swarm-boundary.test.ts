// FILE: swarm-boundary.test.ts (unit)
// PURPOSE: DMW DM3-B SwarmBoundary substrate unit tests per
//          ADR-0092 §4 Candidate C (closes the AI Teammate
//          Delegation Frame pair).
// CONNECTS TO: apps/api/src/services/dmw/swarm-boundary.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    swarmBoundary: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
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
  declareSwarmBoundaryForCaller,
  getSwarmBoundaryByTeamId,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const TEAM = "11111111-1111-1111-1111-111111111111";
const DECLARED_BY = "22222222-2222-2222-2222-222222222222";

function row(overrides: Record<string, unknown> = {}) {
  return {
    team_entity_id: TEAM,
    capsule_access_mode: "METADATA_ONLY",
    cross_team_reach: false,
    escalation_on_exceed: "DENY",
    declared_by: DECLARED_BY,
    created_at: new Date("2026-06-02T00:00:00Z"),
    updated_at: new Date("2026-06-02T00:00:00Z"),
    ...overrides,
  };
}

// =====================================================================
// 1. declareSwarmBoundaryForCaller — validation
// =====================================================================

describe("declareSwarmBoundaryForCaller — validation", () => {
  it("rejects non-UUID team_entity_id", async () => {
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: "x",
      declared_by: DECLARED_BY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("team_entity_id");
    expect(prismaMock.swarmBoundary.upsert).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-UUID declared_by", async () => {
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects self-declaration (team === declared_by) — RULE 0 invariant", async () => {
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: TEAM,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("declared_by");
  });

  it("rejects unknown capsule_access_mode", async () => {
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
      capsule_access_mode: "UNRESTRICTED" as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("capsule_access_mode");
  });

  it("rejects unknown escalation_on_exceed", async () => {
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
      escalation_on_exceed: "NUKE" as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("escalation_on_exceed");
  });
});

// =====================================================================
// 2. declareSwarmBoundaryForCaller — happy path + audit
// =====================================================================

describe("declareSwarmBoundaryForCaller — happy path", () => {
  it("upserts with safe defaults + emits SWARM_BOUNDARY_DECLARED audit with SAFE details", async () => {
    prismaMock.swarmBoundary.upsert.mockResolvedValue(row());
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.boundary.capsule_access_mode).toBe("METADATA_ONLY");
      expect(r.boundary.cross_team_reach).toBe(false);
      expect(r.boundary.escalation_on_exceed).toBe("DENY");
    }
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(a.event_type).toBe("SWARM_BOUNDARY_DECLARED");
    expect(a.actor_entity_id).toBe(DECLARED_BY);
    expect(a.target_entity_id).toBe(TEAM);
    const det = a.details as Record<string, unknown>;
    expect(det.team_entity_id).toBe(TEAM);
    expect(det.capsule_access_mode).toBe("METADATA_ONLY");
    expect(det.escalation_on_exceed).toBe("DENY");
    // No-leak invariants
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/swarm_member/i);
    expect(serialized).not.toMatch(/membership/i);
  });

  it.each([
    "METADATA_ONLY",
    "SCOPED_SUMMARY",
    "FULL_SCOPED",
  ])("accepts canonical capsule_access_mode %s", async (mode) => {
    prismaMock.swarmBoundary.upsert.mockResolvedValue(
      row({ capsule_access_mode: mode }),
    );
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
      capsule_access_mode: mode as "METADATA_ONLY",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.boundary.capsule_access_mode).toBe(mode);
  });

  it.each([
    "DENY",
    "ESCALATE_TO_W5",
    "AUDIT_ONLY",
  ])("accepts canonical escalation_on_exceed %s", async (esc) => {
    prismaMock.swarmBoundary.upsert.mockResolvedValue(
      row({ escalation_on_exceed: esc }),
    );
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
      escalation_on_exceed: esc as "DENY",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.boundary.escalation_on_exceed).toBe(esc);
  });

  it("respects cross_team_reach=true override when explicitly provided", async () => {
    prismaMock.swarmBoundary.upsert.mockResolvedValue(
      row({ cross_team_reach: true }),
    );
    const r = await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
      cross_team_reach: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.boundary.cross_team_reach).toBe(true);
  });

  it("calls Prisma upsert with team_entity_id where clause", async () => {
    prismaMock.swarmBoundary.upsert.mockResolvedValue(row());
    await declareSwarmBoundaryForCaller({
      team_entity_id: TEAM,
      declared_by: DECLARED_BY,
    });
    const arg = prismaMock.swarmBoundary.upsert.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(arg?.where).toEqual({ team_entity_id: TEAM });
  });
});

// =====================================================================
// 3. getSwarmBoundaryByTeamId
// =====================================================================

describe("getSwarmBoundaryByTeamId", () => {
  it("returns null for malformed team_entity_id without DB query", async () => {
    const r = await getSwarmBoundaryByTeamId("x");
    expect(r).toBeNull();
    expect(prismaMock.swarmBoundary.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when not found", async () => {
    prismaMock.swarmBoundary.findUnique.mockResolvedValue(null);
    const r = await getSwarmBoundaryByTeamId(TEAM);
    expect(r).toBeNull();
  });

  it("returns SAFE projection when found", async () => {
    prismaMock.swarmBoundary.findUnique.mockResolvedValue(row());
    const r = await getSwarmBoundaryByTeamId(TEAM);
    expect(r).not.toBeNull();
    expect(r?.team_entity_id).toBe(TEAM);
  });

  it("does NOT emit audit on read", async () => {
    prismaMock.swarmBoundary.findUnique.mockResolvedValue(row());
    await getSwarmBoundaryByTeamId(TEAM);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});
