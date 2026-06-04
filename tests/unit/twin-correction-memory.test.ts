// FILE: twin-correction-memory.test.ts (unit)
// PURPOSE: Phase EDX-5 PR 1 — unit coverage for the create / list /
//          revoke / projectSafeView pure-function helpers on the
//          TwinCorrectionMemory substrate. Prisma + writeAuditEvent
//          mocked so this file runs in the unit tier without DB.
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-correction-memory.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    twinCorrectionMemory: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  auditMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: auditMock,
  };
});

// Phase 1 PR 4 — mock the work-project membership helper.
const { isActiveProjectMemberMock } = vi.hoisted(() => ({
  isActiveProjectMemberMock: vi.fn(),
}));
vi.mock("../../apps/api/src/services/otzar/work-project.service.js", () => ({
  isActiveProjectMember: isActiveProjectMemberMock,
}));

import {
  createTwinCorrectionMemoryForCaller,
  listTwinCorrectionsForCaller,
  projectTwinCorrectionSafeView,
  revokeTwinCorrectionForCaller,
} from "../../apps/api/src/services/otzar/twin-correction-memory.service.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_CALLER_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";
const CORRECTION_ID = "44444444-4444-4444-4444-444444444444";

function rowFixture(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-03T12:00:00.000Z");
  return {
    correction_id: CORRECTION_ID,
    org_entity_id: ORG_ID,
    owner_entity_id: CALLER_ID,
    created_by_entity_id: CALLER_ID,
    scope_type: "PERSONAL" as const,
    scope_id: null,
    correction_type: "PREFERENCE" as const,
    state: "ACTIVE" as const,
    sensitivity_class: "MODERATE" as const,
    retention_class: "STANDARD" as const,
    safe_summary: "Use last name only when summarizing customer feedback.",
    source_message_id: null,
    source_conversation_id: null,
    effective_from: now,
    expires_at: null,
    revoked_at: null,
    superseded_by_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.twinCorrectionMemory.create.mockReset();
  prismaMock.twinCorrectionMemory.findUnique.mockReset();
  prismaMock.twinCorrectionMemory.findMany.mockReset();
  prismaMock.twinCorrectionMemory.update.mockReset();
  auditMock.mockReset();
  isActiveProjectMemberMock.mockReset();
});

describe("projectTwinCorrectionSafeView", () => {
  it("never surfaces source_message_id or source_conversation_id directly", () => {
    const row = rowFixture({
      source_message_id: "55555555-5555-5555-5555-555555555555",
      source_conversation_id: "66666666-6666-6666-6666-666666666666",
    });
    const view = projectTwinCorrectionSafeView(row);
    expect(view).not.toHaveProperty("source_message_id");
    expect(view).not.toHaveProperty("source_conversation_id");
  });

  it("marks ACTIVE corrections as revocable; terminal states not revocable", () => {
    expect(projectTwinCorrectionSafeView(rowFixture()).revocable).toBe(true);
    expect(
      projectTwinCorrectionSafeView(rowFixture({ state: "REVOKED" }))
        .revocable,
    ).toBe(false);
    expect(
      projectTwinCorrectionSafeView(
        rowFixture({ state: "PROMOTED_TO_TEAM_PATTERN" }),
      ).revocable,
    ).toBe(false);
  });
});

describe("createTwinCorrectionMemoryForCaller", () => {
  it("writes the row + emits ADMIN_ACTION audit before returning", async () => {
    prismaMock.twinCorrectionMemory.create.mockResolvedValue(rowFixture());
    const result = await createTwinCorrectionMemoryForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
      correctionType: "PREFERENCE",
      safeSummary: "Use last name only when summarizing customer feedback.",
    });
    expect(prismaMock.twinCorrectionMemory.create).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.event_type).toBe("ADMIN_ACTION");
    expect(auditCall.details.action).toBe("TWIN_CORRECTION_RECORDED");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correction.correction_id).toBe(CORRECTION_ID);
  });

  it("forces caller as owner AND created_by (RULE 0)", async () => {
    prismaMock.twinCorrectionMemory.create.mockResolvedValue(rowFixture());
    await createTwinCorrectionMemoryForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
      correctionType: "PREFERENCE",
      safeSummary: "Test",
    });
    const createCall = prismaMock.twinCorrectionMemory.create.mock.calls[0]?.[0];
    expect(createCall.data.owner_entity_id).toBe(CALLER_ID);
    expect(createCall.data.created_by_entity_id).toBe(CALLER_ID);
  });

  it("bounds safe_summary to prevent raw-transcript collection", async () => {
    prismaMock.twinCorrectionMemory.create.mockResolvedValue(rowFixture());
    const oversize = "y".repeat(800);
    await createTwinCorrectionMemoryForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scopeType: "PERSONAL",
      correctionType: "PREFERENCE",
      safeSummary: oversize,
    });
    const createCall = prismaMock.twinCorrectionMemory.create.mock.calls[0]?.[0];
    expect(createCall.data.safe_summary.length).toBeLessThanOrEqual(500);
  });

  it("accepts the 14 closed-vocab correction types", async () => {
    const ALL_TYPES = [
      "MEANING_CLARIFICATION",
      "TERMINOLOGY_DEFINITION",
      "PREFERENCE",
      "TONE_PREFERENCE",
      "PROJECT_PREFERENCE",
      "CLIENT_CONTEXT",
      "TEAM_BEST_PRACTICE_CANDIDATE",
      "ORG_BEST_PRACTICE_CANDIDATE",
      "FAILED_PATTERN",
      "SUCCESSFUL_PATTERN",
      "SENSITIVITY_BOUNDARY",
      "APPROVAL_PREFERENCE",
      "DO_NOT_USE_CONTEXT",
      "ASK_BEFORE_ACTING",
    ] as const;
    for (const t of ALL_TYPES) {
      prismaMock.twinCorrectionMemory.create.mockResolvedValue(
        rowFixture({ correction_type: t }),
      );
      const result = await createTwinCorrectionMemoryForCaller({
        callerEntityId: CALLER_ID,
        orgEntityId: ORG_ID,
        scopeType: "PERSONAL",
        correctionType: t,
        safeSummary: "test",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.correction.correction_type).toBe(t);
    }
  });

  // Phase 1 PR 4 — PROJECT-scope correction project-membership guard.
  it("PROJECT_NOT_MEMBER when scope_type=PROJECT + scope_id given + caller not a member", async () => {
    isActiveProjectMemberMock.mockResolvedValue(false);
    const result = await createTwinCorrectionMemoryForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scopeType: "PROJECT",
      scopeId: "99999999-9999-9999-9999-999999999999",
      correctionType: "PROJECT_PREFERENCE",
      safeSummary: "Project-scoped preference",
    });
    expect(result).toEqual({ ok: false, code: "PROJECT_NOT_MEMBER" });
    expect(prismaMock.twinCorrectionMemory.create).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("happy path when scope_type=PROJECT + scope_id given + caller IS a member", async () => {
    isActiveProjectMemberMock.mockResolvedValue(true);
    prismaMock.twinCorrectionMemory.create.mockResolvedValue(
      rowFixture({ scope_type: "PROJECT" }),
    );
    const result = await createTwinCorrectionMemoryForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      scopeType: "PROJECT",
      scopeId: "99999999-9999-9999-9999-999999999999",
      correctionType: "PROJECT_PREFERENCE",
      safeSummary: "Project-scoped preference",
    });
    expect(result.ok).toBe(true);
  });
});

describe("listTwinCorrectionsForCaller", () => {
  it("is self-scoped — only the caller's own corrections", async () => {
    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([rowFixture()]);
    await listTwinCorrectionsForCaller({ callerEntityId: CALLER_ID });
    const whereCall =
      prismaMock.twinCorrectionMemory.findMany.mock.calls[0]?.[0];
    expect(whereCall.where.owner_entity_id).toBe(CALLER_ID);
  });

  it("caps take to 100", async () => {
    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([]);
    await listTwinCorrectionsForCaller({
      callerEntityId: CALLER_ID,
      take: 9999,
    });
    const call = prismaMock.twinCorrectionMemory.findMany.mock.calls[0]?.[0];
    expect(call.take).toBe(100);
  });

  it("applies optional state + correction_type + scope_type filters", async () => {
    prismaMock.twinCorrectionMemory.findMany.mockResolvedValue([]);
    await listTwinCorrectionsForCaller({
      callerEntityId: CALLER_ID,
      state: "REVOKED",
      correctionType: "TONE_PREFERENCE",
      scopeType: "PROJECT",
    });
    const call = prismaMock.twinCorrectionMemory.findMany.mock.calls[0]?.[0];
    expect(call.where.state).toBe("REVOKED");
    expect(call.where.correction_type).toBe("TONE_PREFERENCE");
    expect(call.where.scope_type).toBe("PROJECT");
  });
});

describe("revokeTwinCorrectionForCaller", () => {
  it("returns CORRECTION_NOT_FOUND when missing", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(null);
    const r = await revokeTwinCorrectionForCaller({
      callerEntityId: CALLER_ID,
      correctionId: CORRECTION_ID,
    });
    expect(r).toEqual({ ok: false, code: "CORRECTION_NOT_FOUND" });
  });

  it("returns NOT_OWNER when caller is not the owner (cross-tenant guard)", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(rowFixture());
    const r = await revokeTwinCorrectionForCaller({
      callerEntityId: OTHER_CALLER_ID,
      correctionId: CORRECTION_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_OWNER" });
  });

  it("idempotent terminal-state codes", async () => {
    for (const [state, code] of [
      ["REVOKED", "ALREADY_REVOKED"],
      ["SUPERSEDED", "ALREADY_SUPERSEDED"],
      ["EXPIRED", "ALREADY_EXPIRED"],
      ["PROMOTED_TO_TEAM_PATTERN", "ALREADY_PROMOTED"],
      ["PROMOTED_TO_ORG_PATTERN", "ALREADY_PROMOTED"],
    ] as const) {
      prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(
        rowFixture({ state }),
      );
      const r = await revokeTwinCorrectionForCaller({
        callerEntityId: CALLER_ID,
        correctionId: CORRECTION_ID,
      });
      expect(r).toEqual({ ok: false, code });
    }
  });

  it("revokes ACTIVE corrections + emits TWIN_CORRECTION_REVOKED audit", async () => {
    prismaMock.twinCorrectionMemory.findUnique.mockResolvedValue(rowFixture());
    prismaMock.twinCorrectionMemory.update.mockResolvedValue(
      rowFixture({ state: "REVOKED", revoked_at: new Date() }),
    );
    const r = await revokeTwinCorrectionForCaller({
      callerEntityId: CALLER_ID,
      correctionId: CORRECTION_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.correction.state).toBe("REVOKED");
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.details.action).toBe("TWIN_CORRECTION_REVOKED");
  });
});
