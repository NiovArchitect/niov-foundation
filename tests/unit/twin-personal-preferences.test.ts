// FILE: twin-personal-preferences.test.ts (unit)
// PURPOSE: Phase EDX-5 PR 3 — unit coverage for the
//          personal_preferences_summary sidecar helper. Mirrors the
//          twin-active-grants / twin-active-authority mock-prisma
//          pattern.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-personal-preferences.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCorrectionMemory: {
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

import { computePersonalPreferencesSummaryForCaller } from "../../apps/api/src/services/otzar/twin-personal-preferences.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinCorrectionMemory.count.mockReset();
  prismaMock.twinCorrectionMemory.findFirst.mockReset();
});

describe("computePersonalPreferencesSummaryForCaller — empty inventory", () => {
  it("returns zero counts + null last_correction_at", async () => {
    prismaMock.twinCorrectionMemory.count.mockResolvedValue(0);
    prismaMock.twinCorrectionMemory.findFirst.mockResolvedValue(null);
    const s = await computePersonalPreferencesSummaryForCaller(CALLER_ID);
    expect(s).toEqual({
      active_personal_preferences_count: 0,
      active_tone_preferences_count: 0,
      active_project_preferences_count: 0,
      active_sensitivity_boundaries_count: 0,
      active_approval_preferences_count: 0,
      active_terminology_definitions_count: 0,
      active_ask_before_acting_count: 0,
      last_correction_at: null,
    });
  });
});

describe("computePersonalPreferencesSummaryForCaller — populated inventory", () => {
  it("returns each per-type count plus last_correction_at", async () => {
    // Call order matches Promise.all in the implementation:
    // PREFERENCE, TONE, PROJECT, SENSITIVITY, APPROVAL, TERMINOLOGY,
    // ASK_BEFORE_ACTING — then findFirst.
    prismaMock.twinCorrectionMemory.count
      .mockResolvedValueOnce(3) // PREFERENCE
      .mockResolvedValueOnce(2) // TONE_PREFERENCE
      .mockResolvedValueOnce(1) // PROJECT_PREFERENCE
      .mockResolvedValueOnce(1) // SENSITIVITY_BOUNDARY
      .mockResolvedValueOnce(0) // APPROVAL_PREFERENCE
      .mockResolvedValueOnce(4) // TERMINOLOGY_DEFINITION
      .mockResolvedValueOnce(2); // ASK_BEFORE_ACTING
    const recent = new Date("2026-06-02T10:00:00.000Z");
    prismaMock.twinCorrectionMemory.findFirst.mockResolvedValue({
      created_at: recent,
    });
    const s = await computePersonalPreferencesSummaryForCaller(CALLER_ID);
    expect(s).toEqual({
      active_personal_preferences_count: 3,
      active_tone_preferences_count: 2,
      active_project_preferences_count: 1,
      active_sensitivity_boundaries_count: 1,
      active_approval_preferences_count: 0,
      active_terminology_definitions_count: 4,
      active_ask_before_acting_count: 2,
      last_correction_at: recent.toISOString(),
    });
  });
});

describe("computePersonalPreferencesSummaryForCaller — self-scope guard", () => {
  it("every count and the findFirst pin owner_entity_id to the caller + state=ACTIVE", async () => {
    prismaMock.twinCorrectionMemory.count.mockResolvedValue(0);
    prismaMock.twinCorrectionMemory.findFirst.mockResolvedValue(null);
    await computePersonalPreferencesSummaryForCaller(CALLER_ID);
    for (const call of prismaMock.twinCorrectionMemory.count.mock.calls) {
      const where = call[0]?.where;
      expect(where.owner_entity_id).toBe(CALLER_ID);
      expect(where.state).toBe("ACTIVE");
    }
    const firstCall =
      prismaMock.twinCorrectionMemory.findFirst.mock.calls[0]?.[0];
    expect(firstCall.where.owner_entity_id).toBe(CALLER_ID);
    expect(firstCall.where.state).toBe("ACTIVE");
  });
});
