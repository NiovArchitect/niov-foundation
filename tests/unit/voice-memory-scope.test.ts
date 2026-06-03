// FILE: voice-memory-scope.test.ts (unit)
// PURPOSE: DMW Runtime DM2-A Scoped Voice Memory Gate unit
//          tests per ADR-0092 §4 Candidate B.
// CONNECTS TO: apps/api/src/services/dmw/voice-memory-scope.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    conversationMemoryScope: {
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
  VOICE_SCOPE_ALLOWED_CAPSULE_TYPES,
  declareConversationMemoryScopeForCaller,
  getConversationMemoryScope,
  isScopeActive,
  type ConversationMemoryScopeSummary,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const CONV = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";
const DECLARED_BY = "33333333-3333-3333-3333-333333333333";

function row(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: CONV,
    entity_id: ENTITY,
    access_scope: "METADATA_ONLY",
    capsule_types: [],
    context_signals_only: true,
    expires_at: null,
    declared_by: DECLARED_BY,
    created_at: new Date("2026-06-02T00:00:00Z"),
    updated_at: new Date("2026-06-02T00:00:00Z"),
    ...overrides,
  };
}

// =====================================================================
// 1. VOICE_SCOPE_ALLOWED_CAPSULE_TYPES — closed-vocab lock
// =====================================================================

describe("VOICE_SCOPE_ALLOWED_CAPSULE_TYPES — V1 closed-vocab", () => {
  it("includes the 13 V1 canonical capsule types", () => {
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.size).toBe(13);
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("FOUNDATIONAL")).toBe(true);
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("PREFERENCE")).toBe(true);
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("DOMAIN_KNOWLEDGE")).toBe(
      true,
    );
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("CORRECTION")).toBe(true);
  });

  it("excludes sensitive Section 12C.0 capsule types not authorized for voice scope at V1", () => {
    // Sensitive types deliberately excluded from V1 voice scope
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("COMPLIANCE_RECORD")).toBe(
      false,
    );
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("DEVICE_DATA")).toBe(false);
    expect(VOICE_SCOPE_ALLOWED_CAPSULE_TYPES.has("SESSION_LEARNING")).toBe(
      false,
    );
  });
});

// =====================================================================
// 2. declareConversationMemoryScopeForCaller — validation
// =====================================================================

describe("declareConversationMemoryScopeForCaller — validation", () => {
  it("rejects non-UUID conversation_id", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: "x",
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("conversation_id");
    expect(prismaMock.conversationMemoryScope.upsert).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-UUID entity_id", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: "x",
      declared_by: DECLARED_BY,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-UUID declared_by", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown access_scope", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
      access_scope: "EVERYTHING" as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("access_scope");
  });

  it("rejects capsule_type not on the V1 allowlist", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
      capsule_types: ["DOMAIN_KNOWLEDGE", "COMPLIANCE_RECORD"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("capsule_types");
  });

  it("rejects expires_at in the past", async () => {
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
      expires_at: new Date("2000-01-01"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("expires_at");
  });
});

// =====================================================================
// 3. declareConversationMemoryScopeForCaller — IO orchestration
// =====================================================================

describe("declareConversationMemoryScopeForCaller — IO orchestration", () => {
  it("upserts the row with safe defaults + emits CONVERSATION_MEMORY_SCOPE_DECLARED audit with SAFE details", async () => {
    prismaMock.conversationMemoryScope.upsert.mockResolvedValue(row());
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scope.access_scope).toBe("METADATA_ONLY");
      expect(r.scope.capsule_types).toEqual([]);
      expect(r.scope.context_signals_only).toBe(true);
      expect(r.scope.expires_at).toBeNull();
    }
    // Audit details
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(a.event_type).toBe("CONVERSATION_MEMORY_SCOPE_DECLARED");
    expect(a.actor_entity_id).toBe(DECLARED_BY);
    expect(a.target_entity_id).toBe(ENTITY);
    const det = a.details as Record<string, unknown>;
    expect(det.conversation_id).toBe(CONV);
    expect(det.access_scope).toBe("METADATA_ONLY");
    expect(det.context_signals_only).toBe(true);
    // No-leak invariants — forbidden raw payload / vendor / capsule content
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/audio_ref/i);
    expect(serialized).not.toMatch(/transcript/i);
  });

  it("respects explicit access_scope + capsule_types + context_signals_only + expires_at when provided", async () => {
    const future = new Date(Date.now() + 60_000);
    prismaMock.conversationMemoryScope.upsert.mockResolvedValue(
      row({
        access_scope: "SUMMARY",
        capsule_types: ["DOMAIN_KNOWLEDGE", "PREFERENCE"],
        context_signals_only: false,
        expires_at: future,
      }),
    );
    const r = await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
      access_scope: "SUMMARY",
      capsule_types: ["DOMAIN_KNOWLEDGE", "PREFERENCE"],
      context_signals_only: false,
      expires_at: future,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scope.access_scope).toBe("SUMMARY");
      expect(r.scope.capsule_types).toEqual(["DOMAIN_KNOWLEDGE", "PREFERENCE"]);
      expect(r.scope.context_signals_only).toBe(false);
      expect(r.scope.expires_at).toEqual(future);
    }
  });

  it("calls Prisma upsert with composite (conversation_id, entity_id) where clause", async () => {
    prismaMock.conversationMemoryScope.upsert.mockResolvedValue(row());
    await declareConversationMemoryScopeForCaller({
      conversation_id: CONV,
      entity_id: ENTITY,
      declared_by: DECLARED_BY,
    });
    const arg = prismaMock.conversationMemoryScope.upsert.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(arg?.where).toEqual({
      conversation_id_entity_id: { conversation_id: CONV, entity_id: ENTITY },
    });
  });
});

// =====================================================================
// 4. getConversationMemoryScope
// =====================================================================

describe("getConversationMemoryScope", () => {
  it("returns null for malformed conversation_id without DB query", async () => {
    const r = await getConversationMemoryScope("x", ENTITY);
    expect(r).toBeNull();
    expect(prismaMock.conversationMemoryScope.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for malformed entity_id without DB query", async () => {
    const r = await getConversationMemoryScope(CONV, "x");
    expect(r).toBeNull();
    expect(prismaMock.conversationMemoryScope.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when row not found", async () => {
    prismaMock.conversationMemoryScope.findUnique.mockResolvedValue(null);
    const r = await getConversationMemoryScope(CONV, ENTITY);
    expect(r).toBeNull();
  });

  it("returns SAFE projection when found", async () => {
    prismaMock.conversationMemoryScope.findUnique.mockResolvedValue(row());
    const r = await getConversationMemoryScope(CONV, ENTITY);
    expect(r).not.toBeNull();
    expect(r?.conversation_id).toBe(CONV);
    expect(r?.entity_id).toBe(ENTITY);
  });

  it("does NOT emit audit on read", async () => {
    prismaMock.conversationMemoryScope.findUnique.mockResolvedValue(row());
    await getConversationMemoryScope(CONV, ENTITY);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// 5. isScopeActive — pure decision function
// =====================================================================

describe("isScopeActive", () => {
  const baseScope = (overrides: Partial<ConversationMemoryScopeSummary> = {}): ConversationMemoryScopeSummary => ({
    conversation_id: CONV,
    entity_id: ENTITY,
    access_scope: "METADATA_ONLY",
    capsule_types: [],
    context_signals_only: true,
    expires_at: null,
    declared_by: DECLARED_BY,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  it("returns true when expires_at is null (open-ended scope)", () => {
    expect(isScopeActive(baseScope())).toBe(true);
  });

  it("returns true when expires_at is in the future", () => {
    expect(
      isScopeActive(
        baseScope({ expires_at: new Date(Date.now() + 60_000) }),
      ),
    ).toBe(true);
  });

  it("returns false when expires_at is in the past", () => {
    expect(
      isScopeActive(baseScope({ expires_at: new Date("2000-01-01") })),
    ).toBe(false);
  });

  it("accepts an explicit now Date for deterministic testing", () => {
    const expires = new Date("2026-06-02T12:00:00Z");
    const before = new Date("2026-06-02T11:00:00Z");
    const after = new Date("2026-06-02T13:00:00Z");
    expect(isScopeActive(baseScope({ expires_at: expires }), before)).toBe(true);
    expect(isScopeActive(baseScope({ expires_at: expires }), after)).toBe(false);
  });
});
