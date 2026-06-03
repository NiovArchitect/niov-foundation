// FILE: voice-access-log.test.ts (unit)
// PURPOSE: DMW DM2-B VoiceAccessLog substrate unit tests per
//          ADR-0092 §4 Candidate B. Verifies validation +
//          atomic upsert/increment + read SAFE projection.
// CONNECTS TO: apps/api/src/services/dmw/voice-access-log.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceAccessLog: {
      upsert: vi.fn(),
      findMany: vi.fn(),
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
  getConversationVoiceAccessHistory,
  recordVoiceAccessForConversation,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const CONV = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const PROVIDER = "LOCAL_MOCK";

function row(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: CONV,
    entity_id: ENTITY,
    voice_provider: PROVIDER,
    duration_seconds: BigInt(0),
    capsule_access_count: BigInt(0),
    signals_projected_count: BigInt(0),
    last_recorded_at: new Date("2026-06-02T00:00:00Z"),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// =====================================================================
// 1. recordVoiceAccessForConversation — validation
// =====================================================================

describe("recordVoiceAccessForConversation — validation", () => {
  it("rejects non-UUID conversation_id", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: "x",
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      capsule_access_count_delta: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("conversation_id");
    expect(prismaMock.voiceAccessLog.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-UUID entity_id", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: "x",
      voice_provider: PROVIDER,
      capsule_access_count_delta: 1,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown voice_provider", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: "ELEVEN_LABS",
      capsule_access_count_delta: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("voice_provider");
  });

  it.each([
    ["TEXT_ONLY"],
    ["LOCAL_MOCK"],
    ["SESAME"],
    ["FUTURE"],
  ])("accepts canonical VoiceProviderType %s", async (provider) => {
    prismaMock.voiceAccessLog.upsert.mockResolvedValue(
      row({ voice_provider: provider }),
    );
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: provider,
      capsule_access_count_delta: 1,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects negative delta", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      capsule_access_count_delta: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("delta");
  });

  it("rejects non-integer delta", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      capsule_access_count_delta: 0.5,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects all-zero deltas (no-op probe)", async () => {
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("delta");
    expect(prismaMock.voiceAccessLog.upsert).not.toHaveBeenCalled();
  });

  it("invalid input emits NO audit event (VF.2 voice literals NOT touched)", async () => {
    await recordVoiceAccessForConversation({
      conversation_id: "x",
      entity_id: ENTITY,
      voice_provider: PROVIDER,
    });
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// 2. recordVoiceAccessForConversation — happy path
// =====================================================================

describe("recordVoiceAccessForConversation — happy path", () => {
  it("upserts the row with atomic increments + emits NO audit event (rides existing VF.2 literals)", async () => {
    prismaMock.voiceAccessLog.upsert.mockResolvedValue(
      row({
        duration_seconds: BigInt(45),
        capsule_access_count: BigInt(3),
        signals_projected_count: BigInt(2),
      }),
    );
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      duration_seconds_delta: 30,
      capsule_access_count_delta: 2,
      signals_projected_count_delta: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.log.duration_seconds).toBe(BigInt(45));
      expect(r.log.capsule_access_count).toBe(BigInt(3));
      expect(r.log.signals_projected_count).toBe(BigInt(2));
    }
    // No audit emission — ADR-0092 §4 Candidate B "voice-specific
    // access rides existing VF.2 6 voice literals"
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("calls Prisma upsert with composite (conversation_id, entity_id, voice_provider) where clause + increment ops", async () => {
    prismaMock.voiceAccessLog.upsert.mockResolvedValue(row());
    await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      duration_seconds_delta: 10,
    });
    const arg = prismaMock.voiceAccessLog.upsert.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(arg?.where).toEqual({
      conversation_id_entity_id_voice_provider: {
        conversation_id: CONV,
        entity_id: ENTITY,
        voice_provider: PROVIDER,
      },
    });
    const update = arg?.update as { duration_seconds: { increment: bigint } };
    expect(update.duration_seconds.increment).toBe(BigInt(10));
  });

  it("preserves BigInt precision past Number.MAX_SAFE_INTEGER", async () => {
    const big = BigInt("9007199254740992");
    prismaMock.voiceAccessLog.upsert.mockResolvedValue(
      row({ capsule_access_count: big }),
    );
    const r = await recordVoiceAccessForConversation({
      conversation_id: CONV,
      entity_id: ENTITY,
      voice_provider: PROVIDER,
      capsule_access_count_delta: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.log.capsule_access_count).toBe(big);
  });
});

// =====================================================================
// 3. getConversationVoiceAccessHistory
// =====================================================================

describe("getConversationVoiceAccessHistory", () => {
  it("returns empty array for malformed conversation_id without DB query", async () => {
    const r = await getConversationVoiceAccessHistory("x");
    expect(r).toEqual([]);
    expect(prismaMock.voiceAccessLog.findMany).not.toHaveBeenCalled();
  });

  it("returns empty array when no rows exist", async () => {
    prismaMock.voiceAccessLog.findMany.mockResolvedValue([]);
    const r = await getConversationVoiceAccessHistory(CONV);
    expect(r).toEqual([]);
  });

  it("returns SAFE projection rows ordered by entity then voice_provider", async () => {
    prismaMock.voiceAccessLog.findMany.mockResolvedValue([
      row({
        entity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        voice_provider: "LOCAL_MOCK",
      }),
      row({
        entity_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        voice_provider: "TEXT_ONLY",
      }),
      row({
        entity_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        voice_provider: "LOCAL_MOCK",
      }),
    ]);
    const r = await getConversationVoiceAccessHistory(CONV);
    expect(r).toHaveLength(3);
    expect(r[0]?.entity_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(r[2]?.entity_id).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    // Confirm orderBy was applied via the query
    const call = prismaMock.voiceAccessLog.findMany.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(call?.orderBy).toEqual([
      { entity_id: "asc" },
      { voice_provider: "asc" },
    ]);
  });

  it("does NOT emit audit on read", async () => {
    prismaMock.voiceAccessLog.findMany.mockResolvedValue([row()]);
    await getConversationVoiceAccessHistory(CONV);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});
