// FILE: twin-memory-scope.test.ts (unit)
// PURPOSE: Phase EDX-1 employee Twin self-state extension per the
//          [FOUNDER-AUTH — EVERYDAY EMPLOYEE DOMAIN GENERAL
//          INTELLIGENCE EXPERIENCE] directive. Unit tests for the
//          pure-function helper that projects the caller's
//          currently-active ConversationMemoryScope count +
//          soonest expiry from DM2-A DMW substrate.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-memory-scope.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    conversationMemoryScope: {
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

import { computeMemoryScopeSummaryForCaller } from "../../apps/api/src/services/otzar/twin-memory-scope.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversationMemoryScope.count.mockReset();
  prismaMock.conversationMemoryScope.findFirst.mockReset();
});

describe("computeMemoryScopeSummaryForCaller — empty inventory", () => {
  it("returns 0 + null when no active scopes exist", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(0);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue(null);

    const summary = await computeMemoryScopeSummaryForCaller(CALLER_ID);
    expect(summary.active_scopes_count).toBe(0);
    expect(summary.soonest_expiry_at).toBeNull();
  });
});

describe("computeMemoryScopeSummaryForCaller — populated inventory", () => {
  it("returns count + soonest ISO expiry", async () => {
    const expiry = new Date("2026-12-31T23:59:59.000Z");
    prismaMock.conversationMemoryScope.count.mockResolvedValue(4);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue({
      expires_at: expiry,
    });

    const summary = await computeMemoryScopeSummaryForCaller(CALLER_ID);
    expect(summary.active_scopes_count).toBe(4);
    expect(summary.soonest_expiry_at).toBe("2026-12-31T23:59:59.000Z");
  });

  it("returns null soonest_expiry_at when all active scopes have null expires_at", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(2);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue(null);

    const summary = await computeMemoryScopeSummaryForCaller(CALLER_ID);
    expect(summary.active_scopes_count).toBe(2);
    expect(summary.soonest_expiry_at).toBeNull();
  });
});

describe("computeMemoryScopeSummaryForCaller — where-clause shape", () => {
  it("counts where entity_id = caller AND (expires_at is null OR expires_at > now)", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(0);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue(null);

    await computeMemoryScopeSummaryForCaller(CALLER_ID);

    const countCall = prismaMock.conversationMemoryScope.count.mock.calls[0]![0]!;
    expect(countCall.where.entity_id).toBe(CALLER_ID);
    expect(countCall.where.OR).toBeDefined();
    expect(countCall.where.OR).toHaveLength(2);
    expect(countCall.where.OR[0]).toEqual({ expires_at: null });
    expect(countCall.where.OR[1].expires_at.gt).toBeInstanceOf(Date);
  });

  it("findFirst for soonest expiry filters expires_at > now (excludes null-expiry rows)", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(0);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue(null);

    await computeMemoryScopeSummaryForCaller(CALLER_ID);

    const findCall = prismaMock.conversationMemoryScope.findFirst.mock.calls[0]![0]!;
    expect(findCall.where.entity_id).toBe(CALLER_ID);
    expect(findCall.where.expires_at.gt).toBeInstanceOf(Date);
    expect(findCall.orderBy).toEqual({ expires_at: "asc" });
  });
});

describe("computeMemoryScopeSummaryForCaller — no-leak invariant", () => {
  it("returns only active_scopes_count + soonest_expiry_at (no conversation_id / access_scope / capsule_types / declared_by)", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(1);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue({
      expires_at: new Date("2026-12-31T23:59:59.000Z"),
      // Extra fields that would leak if `select` weren't tight.
      conversation_id: "should-not-leak-conv",
      access_scope: "FULL_SCOPED",
      capsule_types: ["DOMAIN_KNOWLEDGE"],
      context_signals_only: false,
      declared_by: "another-entity",
    });

    const summary = await computeMemoryScopeSummaryForCaller(CALLER_ID);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("should-not-leak-conv");
    expect(serialized).not.toContain("FULL_SCOPED");
    expect(serialized).not.toContain("DOMAIN_KNOWLEDGE");
    expect(serialized).not.toContain("another-entity");

    // Confirm select clause asked for ONLY expires_at.
    const findCall = prismaMock.conversationMemoryScope.findFirst.mock.calls[0]![0]!;
    expect(findCall.select).toEqual({ expires_at: true });

    expect(Object.keys(summary).sort()).toEqual([
      "active_scopes_count",
      "soonest_expiry_at",
    ]);
  });

  it("never includes entity_id in the projection (caller already knows it's their own)", async () => {
    prismaMock.conversationMemoryScope.count.mockResolvedValue(1);
    prismaMock.conversationMemoryScope.findFirst.mockResolvedValue({
      expires_at: new Date(),
    });

    const summary = await computeMemoryScopeSummaryForCaller(CALLER_ID);
    expect(JSON.stringify(summary)).not.toContain(CALLER_ID);
  });
});
