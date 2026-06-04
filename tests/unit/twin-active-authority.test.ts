// FILE: twin-active-authority.test.ts (unit)
// PURPOSE: Phase EDX-4 PR 3 — unit coverage for the
//          active_authority_summary sidecar helper. Mirrors the
//          twin-active-grants.test.ts mock-prisma pattern so it
//          runs in the unit tier without DB.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-active-authority.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    twinAuthorityGrant: {
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

import { computeActiveAuthoritySummaryForCaller } from "../../apps/api/src/services/otzar/twin-active-authority.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinAuthorityGrant.findMany.mockReset();
});

describe("computeActiveAuthoritySummaryForCaller — empty inventory", () => {
  it("returns zero counts + null timestamps + has_revocable_grants false", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    expect(s).toEqual({
      active_grant_count: 0,
      expiring_soon_count: 0,
      indefinite_grant_count: 0,
      sensitive_case_by_case_count: 0,
      most_recent_grant_at: null,
      next_expiry_at: null,
      has_revocable_grants: false,
      duration_classes_present: [],
    });
  });
});

describe("computeActiveAuthoritySummaryForCaller — populated inventory", () => {
  it("aggregates counts, durations, and most_recent_grant_at", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10 * DAY_MS);
    const recent = new Date(now.getTime() - 1 * HOUR_MS);
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      {
        duration_class: "SESSION",
        expires_at: null,
        created_at: old,
      },
      {
        duration_class: "INDEFINITE",
        expires_at: null,
        created_at: recent,
      },
      {
        duration_class: "SENSITIVE_CASE_BY_CASE",
        expires_at: null,
        created_at: old,
      },
    ]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    expect(s.active_grant_count).toBe(3);
    expect(s.indefinite_grant_count).toBe(1);
    expect(s.sensitive_case_by_case_count).toBe(1);
    expect(s.has_revocable_grants).toBe(true);
    expect(s.duration_classes_present).toEqual([
      "INDEFINITE",
      "SENSITIVE_CASE_BY_CASE",
      "SESSION",
    ]);
    expect(s.most_recent_grant_at).toBe(recent.toISOString());
  });

  it("counts UNTIL_REVOKED as indefinite (per directive — indefinite ≠ unlimited)", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      {
        duration_class: "UNTIL_REVOKED",
        expires_at: null,
        created_at: new Date(),
      },
    ]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    expect(s.indefinite_grant_count).toBe(1);
  });

  it("expiring_soon_count counts grants expiring within 7 days", async () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * DAY_MS);
    const later = new Date(now.getTime() + 30 * DAY_MS);
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      { duration_class: "SHORT_TERM", expires_at: soon, created_at: now },
      { duration_class: "PROJECT_SCOPED", expires_at: later, created_at: now },
    ]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    expect(s.expiring_soon_count).toBe(1);
    // next_expiry_at is the soonest of the two.
    expect(s.next_expiry_at).toBe(soon.toISOString());
  });

  it("never returns next_expiry_at when no expiring grant exists", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      {
        duration_class: "SESSION",
        expires_at: null,
        created_at: new Date(),
      },
    ]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    expect(s.next_expiry_at).toBeNull();
  });
});

describe("computeActiveAuthoritySummaryForCaller — self-scope guard", () => {
  it("the where clause pins grantor_entity_id to the caller", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([]);
    await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    const call = prismaMock.twinAuthorityGrant.findMany.mock.calls[0]?.[0];
    expect(call.where.grantor_entity_id).toBe(CALLER_ID);
    expect(call.where.state).toBe("ACTIVE");
  });

  it("surfaces only safe fields (no per-grant substance)", async () => {
    prismaMock.twinAuthorityGrant.findMany.mockResolvedValue([
      {
        duration_class: "SESSION",
        expires_at: null,
        created_at: new Date(),
      },
    ]);
    const s = await computeActiveAuthoritySummaryForCaller(CALLER_ID);
    // The shape must be counts + classes + timestamps — never raw
    // grant ids, scope ids, purpose summaries, or constraints.
    expect(Object.keys(s).sort()).toEqual(
      [
        "active_grant_count",
        "duration_classes_present",
        "expiring_soon_count",
        "has_revocable_grants",
        "indefinite_grant_count",
        "most_recent_grant_at",
        "next_expiry_at",
        "sensitive_case_by_case_count",
      ].sort(),
    );
  });
});
