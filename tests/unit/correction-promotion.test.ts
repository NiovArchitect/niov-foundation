// FILE: correction-promotion.test.ts (unit)
// PURPOSE: [SECTION-10 CORRECTION-PROMOTION] Unit coverage for owner-consent,
//          promotable-type, ACTIVE-state gates, competing-candidate validation,
//          and mapping of promoteOrgTruth outcomes onto correction state
//          transitions — without a live Postgres (prisma + promoteOrgTruth mocked).

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, promoteMock, resolveOwnerMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCorrectionMemory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    entityMembership: {
      findFirst: vi.fn(),
    },
  },
  promoteMock: vi.fn(),
  resolveOwnerMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    promoteOrgTruth: promoteMock,
    resolveDomainOwner: resolveOwnerMock,
    writeAuditEvent: auditMock,
  };
});

import {
  promoteTwinCorrectionToOrgTruth,
  TWIN_CORRECTION_SOURCE_TYPE,
} from "../../apps/api/src/services/otzar/correction-promotion.service.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ORG = "33333333-3333-3333-3333-333333333333";
const CORR = "44444444-4444-4444-4444-444444444444";
const COMP = "55555555-5555-5555-5555-555555555555";
const TRUTH = "66666666-6666-6666-6666-666666666666";
const CONFLICT = "77777777-7777-7777-7777-777777777777";

function winnerRow(over: Record<string, unknown> = {}) {
  const now = new Date("2026-07-16T12:00:00.000Z");
  return {
    correction_id: CORR,
    org_entity_id: ORG,
    owner_entity_id: OWNER,
    created_by_entity_id: OWNER,
    scope_type: "TEAM" as const,
    scope_id: null,
    correction_type: "TEAM_BEST_PRACTICE_CANDIDATE" as const,
    state: "ACTIVE" as const,
    sensitivity_class: "MODERATE" as const,
    retention_class: "STANDARD" as const,
    safe_summary: "Always confirm release date with the domain owner before publishing.",
    source_message_id: null,
    source_conversation_id: null,
    effective_from: now,
    expires_at: null,
    revoked_at: null,
    superseded_by_id: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

const baseInput = {
  actorEntityId: OWNER,
  orgEntityId: ORG,
  correctionId: CORR,
  decisionDomain: "technical",
  topic: "release-process",
  reason: "This is our team practice.",
};

beforeEach(() => {
  vi.clearAllMocks();
  auditMock.mockResolvedValue(undefined);
  resolveOwnerMock.mockResolvedValue(OWNER);
  prismaMock.entityMembership.findFirst.mockResolvedValue(null);
});

describe("promoteTwinCorrectionToOrgTruth (unit)", () => {
  it("refuses missing required fields", async () => {
    const r = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      decisionDomain: "  ",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_INPUT");
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("refuses non-owner (owner consent)", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(winnerRow());
    const r = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      actorEntityId: OTHER,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NOT_OWNER");
    expect(promoteMock).not.toHaveBeenCalled();
  });

  it("refuses non-promotable correction types", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(
      winnerRow({ correction_type: "PREFERENCE" }),
    );
    const r = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NOT_PROMOTABLE_TYPE");
  });

  it("refuses already-promoted and non-ACTIVE states", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(
      winnerRow({ state: "PROMOTED_TO_TEAM_PATTERN" }),
    );
    const already = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(already.ok).toBe(false);
    if (already.ok) return;
    expect(already.code).toBe("ALREADY_PROMOTED");

    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(
      winnerRow({ state: "REVOKED" }),
    );
    const revoked = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(revoked.ok).toBe(false);
    if (revoked.ok) return;
    expect(revoked.code).toBe("NOT_ACTIVE");
  });

  it("maps clean promote → PROMOTED_TO_TEAM_PATTERN + audit", async () => {
    const active = winnerRow();
    const promoted = winnerRow({ state: "PROMOTED_TO_TEAM_PATTERN" });
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(active);
    promoteMock.mockResolvedValue({
      kind: "promoted",
      created: true,
      record: {
        truth_record_id: TRUTH,
        org_entity_id: ORG,
        decision_domain: "technical",
        state: "PROMOTED",
        version: 1,
      },
    });
    prismaMock.twinCorrectionMemory.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.twinCorrectionMemory.findUniqueOrThrow.mockResolvedValue(promoted);

    const r = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok || r.outcome !== "promoted") return;
    expect(r.correction.state).toBe("PROMOTED_TO_TEAM_PATTERN");
    expect(r.truth_record.truth_record_id).toBe(TRUTH);

    expect(promoteMock).toHaveBeenCalledOnce();
    const call = promoteMock.mock.calls[0]![0];
    expect(call.winner.source_record_type).toBe(TWIN_CORRECTION_SOURCE_TYPE);
    expect(call.winner.source_record_id).toBe(CORR);
    expect(call.winner.claim.summary).toContain("release date");

    expect(prismaMock.twinCorrectionMemory.updateMany).toHaveBeenCalledWith({
      where: {
        correction_id: CORR,
        owner_entity_id: OWNER,
        state: "ACTIVE",
      },
      data: { state: "PROMOTED_TO_TEAM_PATTERN" },
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ action: "TWIN_CORRECTION_PROMOTED" }),
      }),
    );
  });

  it("ORG candidate transitions to PROMOTED_TO_ORG_PATTERN", async () => {
    const active = winnerRow({ correction_type: "ORG_BEST_PRACTICE_CANDIDATE" });
    const promoted = winnerRow({
      correction_type: "ORG_BEST_PRACTICE_CANDIDATE",
      state: "PROMOTED_TO_ORG_PATTERN",
    });
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(active);
    promoteMock.mockResolvedValue({
      kind: "promoted",
      created: true,
      record: { truth_record_id: TRUTH, state: "PROMOTED", version: 1 },
    });
    prismaMock.twinCorrectionMemory.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.twinCorrectionMemory.findUniqueOrThrow.mockResolvedValue(promoted);

    const r = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok || r.outcome !== "promoted") return;
    expect(r.correction.state).toBe("PROMOTED_TO_ORG_PATTERN");
    expect(prismaMock.twinCorrectionMemory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: "PROMOTED_TO_ORG_PATTERN" } }),
    );
  });

  it("material conflict leaves correction ACTIVE and does not transition state", async () => {
    const active = winnerRow();
    const competing = winnerRow({
      correction_id: COMP,
      safe_summary: "A different competing practice.",
    });
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(active);
    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([competing]);
    promoteMock.mockResolvedValue({
      kind: "conflict_open",
      conflict_set: {
        conflict_set_id: CONFLICT,
        org_entity_id: ORG,
        state: "OPEN",
        version: 1,
      },
      review_obligation_id: "obl-1",
    });

    const r = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      competingCorrectionIds: [COMP],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.outcome !== "conflict_open") return;
    expect(r.conflict_set.conflict_set_id).toBe(CONFLICT);
    expect(r.correction.state).toBe("ACTIVE");
    expect(prismaMock.twinCorrectionMemory.updateMany).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          action: "TWIN_CORRECTION_PROMOTION_CONFLICT_OPEN",
        }),
      }),
    );
  });

  it("maps promoteOrgTruth unauthorized / recommend_only / state_changed", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(winnerRow());

    promoteMock.mockResolvedValue({ kind: "unauthorized" });
    const u = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(u.ok).toBe(false);
    if (u.ok) return;
    expect(u.code).toBe("UNAUTHORIZED");

    promoteMock.mockResolvedValue({ kind: "recommend_only" });
    const rec = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(rec.ok).toBe(false);
    if (rec.ok) return;
    expect(rec.code).toBe("RECOMMEND_ONLY");

    promoteMock.mockResolvedValue({ kind: "state_changed" });
    const st = await promoteTwinCorrectionToOrgTruth(baseInput);
    expect(st.ok).toBe(false);
    if (st.ok) return;
    expect(st.code).toBe("STATE_CHANGED");
  });

  it("refuses competing candidates that are missing, foreign, or not promotable", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(winnerRow());
    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([]);
    const missing = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      competingCorrectionIds: [COMP],
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe("COMPETING_NOT_FOUND");

    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([
      winnerRow({ correction_id: COMP, org_entity_id: "99999999-9999-9999-9999-999999999999" }),
    ]);
    const cross = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      competingCorrectionIds: [COMP],
    });
    expect(cross.ok).toBe(false);
    if (cross.ok) return;
    expect(cross.code).toBe("COMPETING_CROSS_ORG");

    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([
      winnerRow({ correction_id: COMP, correction_type: "PREFERENCE" }),
    ]);
    const bad = await promoteTwinCorrectionToOrgTruth({
      ...baseInput,
      competingCorrectionIds: [COMP],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe("COMPETING_NOT_PROMOTABLE");
  });
});
