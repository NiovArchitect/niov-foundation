// FILE: twin-active-grants.test.ts (unit)
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit tests for the
//          pure-function helper that projects the caller's
//          currently-active grants — across DM1-A ConsentGrant
//          + DM3-A TeamDelegation — as a single summary.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-active-grants.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    consentGrant: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    teamDelegation: {
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

import { computeActiveGrantsSummaryForCaller } from "../../apps/api/src/services/otzar/twin-active-grants.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.consentGrant.count.mockReset();
  prismaMock.consentGrant.findFirst.mockReset();
  prismaMock.teamDelegation.count.mockReset();
  prismaMock.teamDelegation.findFirst.mockReset();
});

describe("computeActiveGrantsSummaryForCaller — empty inventory", () => {
  it("returns 0 + 0 + null when caller has no active grants", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(0);
    prismaMock.teamDelegation.count.mockResolvedValue(0);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);

    expect(summary.active_consent_grants_count).toBe(0);
    expect(summary.active_team_delegations_count).toBe(0);
    expect(summary.soonest_expiry_at).toBeNull();
  });
});

describe("computeActiveGrantsSummaryForCaller — populated inventory", () => {
  it("returns counts from both substrates separately", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(3);
    prismaMock.teamDelegation.count.mockResolvedValue(2);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);
    expect(summary.active_consent_grants_count).toBe(3);
    expect(summary.active_team_delegations_count).toBe(2);
  });

  it("returns the EARLIEST expiry across both substrates", async () => {
    const consentExpiry = new Date("2026-09-30T00:00:00.000Z");
    const delegationExpiry = new Date("2026-12-31T23:59:59.000Z");

    prismaMock.consentGrant.count.mockResolvedValue(1);
    prismaMock.teamDelegation.count.mockResolvedValue(1);
    prismaMock.consentGrant.findFirst.mockResolvedValue({
      valid_until: consentExpiry,
    });
    prismaMock.teamDelegation.findFirst.mockResolvedValue({
      valid_until: delegationExpiry,
    });

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);
    // Earlier is September (consent), not December (delegation).
    expect(summary.soonest_expiry_at).toBe("2026-09-30T00:00:00.000Z");
  });

  it("returns delegation expiry when only delegation has a non-null valid_until", async () => {
    const delegationExpiry = new Date("2026-12-31T23:59:59.000Z");

    prismaMock.consentGrant.count.mockResolvedValue(1);
    prismaMock.teamDelegation.count.mockResolvedValue(1);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue({
      valid_until: delegationExpiry,
    });

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);
    expect(summary.soonest_expiry_at).toBe("2026-12-31T23:59:59.000Z");
  });

  it("returns null soonest when all active grants have null valid_until", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(2);
    prismaMock.teamDelegation.count.mockResolvedValue(1);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);
    expect(summary.soonest_expiry_at).toBeNull();
    expect(summary.active_consent_grants_count).toBe(2);
    expect(summary.active_team_delegations_count).toBe(1);
  });
});

describe("computeActiveGrantsSummaryForCaller — where-clause shape", () => {
  it("ConsentGrant active: grantor + APPROVED + revoked_at null + (valid_until null OR > now)", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(0);
    prismaMock.teamDelegation.count.mockResolvedValue(0);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    await computeActiveGrantsSummaryForCaller(CALLER_ID);

    const countCall = prismaMock.consentGrant.count.mock.calls[0]![0]!;
    expect(countCall.where.grantor_entity_id).toBe(CALLER_ID);
    expect(countCall.where.consent_state).toBe("APPROVED");
    expect(countCall.where.revoked_at).toBeNull();
    expect(countCall.where.OR).toHaveLength(2);
  });

  it("TeamDelegation active: delegator + ACTIVE + (valid_until null OR > now)", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(0);
    prismaMock.teamDelegation.count.mockResolvedValue(0);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    await computeActiveGrantsSummaryForCaller(CALLER_ID);

    const countCall = prismaMock.teamDelegation.count.mock.calls[0]![0]!;
    expect(countCall.where.delegator_entity_id).toBe(CALLER_ID);
    expect(countCall.where.status).toBe("ACTIVE");
    expect(countCall.where.OR).toHaveLength(2);
  });
});

describe("computeActiveGrantsSummaryForCaller — no-leak invariant", () => {
  it("returns only the 3 documented fields", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(1);
    prismaMock.teamDelegation.count.mockResolvedValue(1);
    prismaMock.consentGrant.findFirst.mockResolvedValue({
      valid_until: new Date("2026-09-30T00:00:00.000Z"),
      // Extra fields that would leak if `select` weren't tight.
      consent_id: "should-not-leak-consent",
      grantee_entity_id: "another-entity",
      purpose: "sensitive purpose",
      permission_id: "permission-uuid",
    });
    prismaMock.teamDelegation.findFirst.mockResolvedValue({
      valid_until: new Date("2026-12-31T00:00:00.000Z"),
      delegation_id: "should-not-leak-delegation",
      team_entity_id: "team-uuid",
      capability_scope: ["INVOKE_CONNECTOR_READ"],
      supervision_required: true,
    });

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("should-not-leak-consent");
    expect(serialized).not.toContain("should-not-leak-delegation");
    expect(serialized).not.toContain("sensitive purpose");
    expect(serialized).not.toContain("another-entity");
    expect(serialized).not.toContain("team-uuid");
    expect(serialized).not.toContain("permission-uuid");
    expect(serialized).not.toContain("INVOKE_CONNECTOR_READ");

    expect(Object.keys(summary).sort()).toEqual([
      "active_consent_grants_count",
      "active_team_delegations_count",
      "soonest_expiry_at",
    ]);
  });

  it("never includes entity_id in the projection (caller already knows it's their own)", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(1);
    prismaMock.teamDelegation.count.mockResolvedValue(1);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    const summary = await computeActiveGrantsSummaryForCaller(CALLER_ID);
    expect(JSON.stringify(summary)).not.toContain(CALLER_ID);
  });

  it("tight select clauses ask for ONLY valid_until", async () => {
    prismaMock.consentGrant.count.mockResolvedValue(0);
    prismaMock.teamDelegation.count.mockResolvedValue(0);
    prismaMock.consentGrant.findFirst.mockResolvedValue(null);
    prismaMock.teamDelegation.findFirst.mockResolvedValue(null);

    await computeActiveGrantsSummaryForCaller(CALLER_ID);

    const consentFind = prismaMock.consentGrant.findFirst.mock.calls[0]![0]!;
    const delegationFind = prismaMock.teamDelegation.findFirst.mock.calls[0]![0]!;
    expect(consentFind.select).toEqual({ valid_until: true });
    expect(delegationFind.select).toEqual({ valid_until: true });
    expect(consentFind.orderBy).toEqual({ valid_until: "asc" });
    expect(delegationFind.orderBy).toEqual({ valid_until: "asc" });
  });
});
