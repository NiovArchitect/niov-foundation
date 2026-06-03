// FILE: team-delegation.test.ts (unit)
// PURPOSE: DMW DM3-A TeamDelegation substrate unit tests per
//          ADR-0092 §4 Candidate C (AI Teammate Delegation
//          Frame).
// CONNECTS TO: apps/api/src/services/dmw/team-delegation.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    teamDelegation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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
  TEAM_DELEGATION_ALLOWED_CAPABILITIES,
  TEAM_DELEGATION_FORBIDDEN_CAPABILITIES,
  createTeamDelegationForCaller,
  getTeamDelegationById,
  revokeTeamDelegationForCaller,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const DELEGATOR = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";
const DELEGATION = "33333333-3333-3333-3333-333333333333";

function row(overrides: Record<string, unknown> = {}) {
  return {
    delegation_id: DELEGATION,
    delegator_entity_id: DELEGATOR,
    team_entity_id: TEAM,
    capability_scope: ["COORDINATION_ONLY"],
    supervision_required: true,
    revocation_bridge_id: null,
    valid_from: new Date("2026-06-02T00:00:00Z"),
    valid_until: null,
    status: "ACTIVE",
    revoked_at: null,
    revoked_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// =====================================================================
// 1. Closed-vocab capability discipline
// =====================================================================

describe("TEAM_DELEGATION capability vocab — closed-vocab discipline", () => {
  it("exposes the 4 ALLOWED V1 capabilities", () => {
    expect(TEAM_DELEGATION_ALLOWED_CAPABILITIES).toEqual([
      "COORDINATION_ONLY",
      "READ_SCOPED_CAPSULES",
      "PROPOSE_W5_ACTIONS",
      "INVOKE_CONNECTOR_READ",
    ]);
  });

  it("blocks INVOKE_CONNECTOR_WRITE per ADR-0084 ≥C6 forward-substrate boundary", () => {
    expect(TEAM_DELEGATION_FORBIDDEN_CAPABILITIES.has("INVOKE_CONNECTOR_WRITE"))
      .toBe(true);
  });
});

// =====================================================================
// 2. createTeamDelegationForCaller — validation
// =====================================================================

describe("createTeamDelegationForCaller — validation", () => {
  it("rejects non-UUID delegator_entity_id", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: "x",
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("delegator_entity_id");
    }
    expect(prismaMock.teamDelegation.create).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects self-delegation (delegator === team) — RULE 0 invariant", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: DELEGATOR,
      capability_scope: ["COORDINATION_ONLY"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("team_entity_id");
    }
  });

  it("rejects empty capability_scope[]", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("capability_scope");
    }
  });

  it("rejects valid_until in the past", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY"],
      valid_until: new Date("2000-01-01"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("valid_until");
    }
  });

  it("rejects malformed revocation_bridge_id when provided", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY"],
      revocation_bridge_id: "x",
    });
    expect(r.ok).toBe(false);
  });
});

// =====================================================================
// 3. createTeamDelegationForCaller — capability gating
// =====================================================================

describe("createTeamDelegationForCaller — capability gating", () => {
  it("rejects FORBIDDEN INVOKE_CONNECTOR_WRITE with 403 FORBIDDEN_CAPABILITY (overrides INVALID_FIELD path)", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY", "INVOKE_CONNECTOR_WRITE"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "FORBIDDEN_CAPABILITY") {
      expect(r.httpStatus).toBe(403);
      expect(r.forbidden).toContain("INVOKE_CONNECTOR_WRITE");
    }
    expect(prismaMock.teamDelegation.create).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects unknown capability with 422 INVALID_FIELD", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["UNKNOWN_CAP"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("capability_scope");
    }
  });

  it("FORBIDDEN check fires BEFORE ALLOWED check — 403 wins over 422 (defense-in-depth)", async () => {
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["INVOKE_CONNECTOR_WRITE", "UNKNOWN_CAP"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN_CAPABILITY");
  });

  it.each([
    "COORDINATION_ONLY",
    "READ_SCOPED_CAPSULES",
    "PROPOSE_W5_ACTIONS",
    "INVOKE_CONNECTOR_READ",
  ])("accepts canonical capability %s", async (cap) => {
    prismaMock.teamDelegation.create.mockResolvedValue(
      row({ capability_scope: [cap] }),
    );
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: [cap],
    });
    expect(r.ok).toBe(true);
  });
});

// =====================================================================
// 4. createTeamDelegationForCaller — happy path + audit
// =====================================================================

describe("createTeamDelegationForCaller — happy path", () => {
  it("creates the row + emits TEAM_DELEGATION_CREATED audit with SAFE details", async () => {
    prismaMock.teamDelegation.create.mockResolvedValue(row());
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY", "READ_SCOPED_CAPSULES"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.delegation.delegation_id).toBe(DELEGATION);
      expect(r.delegation.supervision_required).toBe(true);
      expect(r.delegation.status).toBe("ACTIVE");
    }
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(a.event_type).toBe("TEAM_DELEGATION_CREATED");
    expect(a.actor_entity_id).toBe(DELEGATOR);
    expect(a.target_entity_id).toBe(TEAM);
    const det = a.details as Record<string, unknown>;
    expect(det.delegation_id).toBe(DELEGATION);
    expect(det.supervision_required).toBe(true);
    expect(det.status).toBe("ACTIVE");
    // No-leak invariants
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/swarm_member/i);
  });

  it("respects supervision_required=false override when explicitly provided", async () => {
    prismaMock.teamDelegation.create.mockResolvedValue(
      row({ supervision_required: false }),
    );
    const r = await createTeamDelegationForCaller({
      delegator_entity_id: DELEGATOR,
      team_entity_id: TEAM,
      capability_scope: ["COORDINATION_ONLY"],
      supervision_required: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delegation.supervision_required).toBe(false);
  });
});

// =====================================================================
// 5. getTeamDelegationById
// =====================================================================

describe("getTeamDelegationById", () => {
  it("returns null for malformed UUID without DB query", async () => {
    const r = await getTeamDelegationById("x");
    expect(r).toBeNull();
    expect(prismaMock.teamDelegation.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when not found", async () => {
    prismaMock.teamDelegation.findUnique.mockResolvedValue(null);
    const r = await getTeamDelegationById(DELEGATION);
    expect(r).toBeNull();
  });

  it("returns SAFE projection when found; no audit emission", async () => {
    prismaMock.teamDelegation.findUnique.mockResolvedValue(row());
    const r = await getTeamDelegationById(DELEGATION);
    expect(r).not.toBeNull();
    expect(r?.delegation_id).toBe(DELEGATION);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// 6. revokeTeamDelegationForCaller
// =====================================================================

describe("revokeTeamDelegationForCaller", () => {
  it("returns 404 NOT_FOUND when delegation missing", async () => {
    prismaMock.teamDelegation.findUnique.mockResolvedValue(null);
    const r = await revokeTeamDelegationForCaller({
      delegation_id: DELEGATION,
      revoked_by: DELEGATOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "NOT_FOUND") expect(r.httpStatus).toBe(404);
    expect(prismaMock.teamDelegation.update).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_REVOKED when delegation already in REVOKED state (no double audit)", async () => {
    prismaMock.teamDelegation.findUnique.mockResolvedValue(
      row({
        status: "REVOKED",
        revoked_at: new Date("2026-06-01T00:00:00Z"),
        revoked_by: DELEGATOR,
      }),
    );
    const r = await revokeTeamDelegationForCaller({
      delegation_id: DELEGATION,
      revoked_by: DELEGATOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "ALREADY_REVOKED") {
      expect(r.httpStatus).toBe(409);
      expect(r.revoked_at).toEqual(new Date("2026-06-01T00:00:00Z"));
    }
    expect(prismaMock.teamDelegation.update).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("revokes + emits TEAM_DELEGATION_CREATED audit with REVOKED status (RULE 10 — row preserved via update)", async () => {
    prismaMock.teamDelegation.findUnique.mockResolvedValue(row({ status: "ACTIVE" }));
    const revokedAt = new Date("2026-06-02T12:00:00Z");
    prismaMock.teamDelegation.update.mockResolvedValue(
      row({ status: "REVOKED", revoked_at: revokedAt, revoked_by: DELEGATOR }),
    );
    const r = await revokeTeamDelegationForCaller({
      delegation_id: DELEGATION,
      revoked_by: DELEGATOR,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.delegation.status).toBe("REVOKED");
      expect(r.delegation.revoked_by).toBe(DELEGATOR);
    }
    // Update was called (NOT delete — RULE 10)
    expect(prismaMock.teamDelegation.update).toHaveBeenCalledTimes(1);
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const det = a.details as Record<string, unknown>;
    expect(det.status).toBe("REVOKED");
    expect(det.revoked_at).toBe(revokedAt.toISOString());
    expect(det.revoked_by).toBe(DELEGATOR);
  });
});
