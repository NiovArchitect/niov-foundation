// FILE: consent-grant.test.ts (unit)
// PURPOSE: DMW Runtime DM1-A ConsentGrant substrate unit tests
//          per ADR-0092 §4 Candidate A.
// CONNECTS TO: apps/api/src/services/dmw/consent-grant.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    consentGrant: {
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
  CONSENT_PURPOSE_VALUES,
  getConsentGrantById,
  recordConsentGrantForCaller,
  revokeConsentGrantForCaller,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const GRANTOR = "11111111-1111-1111-1111-111111111111";
const GRANTEE = "22222222-2222-2222-2222-222222222222";
const CONSENT = "33333333-3333-3333-3333-333333333333";

function row(overrides: Record<string, unknown> = {}) {
  return {
    consent_id: CONSENT,
    grantor_entity_id: GRANTOR,
    grantee_entity_id: GRANTEE,
    purpose: "VOICE_INTENT_DELIVERY",
    permission_id: null,
    consent_state: "REQUESTED",
    valid_from: new Date("2026-06-02T00:00:00Z"),
    valid_until: null,
    revoked_at: null,
    revoked_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// =====================================================================
// 1. CONSENT_PURPOSE_VALUES closed-vocab
// =====================================================================

describe("CONSENT_PURPOSE_VALUES — closed-vocab lock", () => {
  it("exposes exactly 5 V1 canonical purposes", () => {
    expect(CONSENT_PURPOSE_VALUES).toEqual([
      "VOICE_INTENT_DELIVERY",
      "PROPOSED_ACTION_PROMOTION",
      "COMMUNICATION_SUMMARY",
      "MEMORY_CAPSULE_ACCESS",
      "TEAM_DELEGATION",
    ]);
  });
});

// =====================================================================
// 2. recordConsentGrantForCaller — validation
// =====================================================================

describe("recordConsentGrantForCaller — validation", () => {
  it("rejects non-UUID grantor_entity_id", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: "not-a-uuid",
      grantee_entity_id: GRANTEE,
      purpose: "VOICE_INTENT_DELIVERY",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("grantor_entity_id");
    }
    expect(prismaMock.consentGrant.create).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-UUID grantee_entity_id", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: "x",
      purpose: "VOICE_INTENT_DELIVERY",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects self-grant (grantor === grantee) — RULE 0 invariant", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTOR,
      purpose: "VOICE_INTENT_DELIVERY",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("grantee_entity_id");
    }
  });

  it("rejects unknown purpose", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "UNKNOWN_PURPOSE" as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("purpose");
    }
  });

  it("rejects malformed permission_id when provided", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "VOICE_INTENT_DELIVERY",
      permission_id: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects valid_until in the past", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "VOICE_INTENT_DELIVERY",
      valid_until: new Date("2000-01-01"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("valid_until");
    }
  });

  it("rejects DENIED/EXPIRED/REVOKED as initial_state (only REQUESTED + APPROVED permitted)", async () => {
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "VOICE_INTENT_DELIVERY",
      initial_state: "REVOKED",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("initial_state");
    }
  });
});

// =====================================================================
// 3. recordConsentGrantForCaller — happy path + audit
// =====================================================================

describe("recordConsentGrantForCaller — happy path", () => {
  it("creates the row + emits CONSENT_GRANT_RECORDED with SAFE details", async () => {
    prismaMock.consentGrant.create.mockResolvedValue(
      row({ consent_state: "REQUESTED" }),
    );
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "VOICE_INTENT_DELIVERY",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.consent_grant.consent_id).toBe(CONSENT);
      expect(r.consent_grant.consent_state).toBe("REQUESTED");
      expect(r.consent_grant.purpose).toBe("VOICE_INTENT_DELIVERY");
    }
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(a.event_type).toBe("CONSENT_GRANT_RECORDED");
    expect(a.actor_entity_id).toBe(GRANTOR);
    expect(a.target_entity_id).toBe(GRANTEE);
    const det = a.details as Record<string, unknown>;
    expect(det.consent_id).toBe(CONSENT);
    expect(det.consent_state).toBe("REQUESTED");
    expect(det.valid_from).toBe("2026-06-02T00:00:00.000Z");
    // Forbidden: free-text reason + raw payload content
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/reason/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
  });

  it("respects APPROVED initial_state when provided", async () => {
    prismaMock.consentGrant.create.mockResolvedValue(
      row({ consent_state: "APPROVED" }),
    );
    const r = await recordConsentGrantForCaller({
      grantor_entity_id: GRANTOR,
      grantee_entity_id: GRANTEE,
      purpose: "PROPOSED_ACTION_PROMOTION",
      initial_state: "APPROVED",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.consent_grant.consent_state).toBe("APPROVED");
  });
});

// =====================================================================
// 4. getConsentGrantById
// =====================================================================

describe("getConsentGrantById", () => {
  it("returns null for malformed consent_id without DB query", async () => {
    const r = await getConsentGrantById("not-a-uuid");
    expect(r).toBeNull();
    expect(prismaMock.consentGrant.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when row not found", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(null);
    const r = await getConsentGrantById(CONSENT);
    expect(r).toBeNull();
  });

  it("returns the SAFE projection when found", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(row());
    const r = await getConsentGrantById(CONSENT);
    expect(r).not.toBeNull();
    expect(r?.consent_id).toBe(CONSENT);
    expect(r?.purpose).toBe("VOICE_INTENT_DELIVERY");
  });

  it("does NOT emit audit on read", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(row());
    await getConsentGrantById(CONSENT);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// 5. revokeConsentGrantForCaller
// =====================================================================

describe("revokeConsentGrantForCaller", () => {
  it("returns 404 NOT_FOUND when consent does not exist", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(null);
    const r = await revokeConsentGrantForCaller({
      consent_id: CONSENT,
      revoked_by: GRANTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "NOT_FOUND") {
      expect(r.httpStatus).toBe(404);
    }
    expect(prismaMock.consentGrant.update).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_REVOKED when consent is already REVOKED (no double audit)", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(
      row({
        consent_state: "REVOKED",
        revoked_at: new Date("2026-06-01T00:00:00Z"),
        revoked_by: GRANTOR,
      }),
    );
    const r = await revokeConsentGrantForCaller({
      consent_id: CONSENT,
      revoked_by: GRANTOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "ALREADY_REVOKED") {
      expect(r.httpStatus).toBe(409);
      expect(r.revoked_at).toEqual(new Date("2026-06-01T00:00:00Z"));
    }
    expect(prismaMock.consentGrant.update).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("revokes + emits CONSENT_GRANT_RECORDED with REVOKED state (RULE 10 — row preserved)", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(
      row({ consent_state: "APPROVED" }),
    );
    const revokedAt = new Date("2026-06-02T12:00:00Z");
    prismaMock.consentGrant.update.mockResolvedValue(
      row({
        consent_state: "REVOKED",
        revoked_at: revokedAt,
        revoked_by: GRANTOR,
      }),
    );
    const r = await revokeConsentGrantForCaller({
      consent_id: CONSENT,
      revoked_by: GRANTOR,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.consent_grant.consent_state).toBe("REVOKED");
      expect(r.consent_grant.revoked_by).toBe(GRANTOR);
    }
    // Update was called (NOT delete — RULE 10)
    expect(prismaMock.consentGrant.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.consentGrant.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect((updateArg.data as Record<string, unknown>).consent_state).toBe(
      "REVOKED",
    );
    // Audit emitted with REVOKED state
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const a = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(a.event_type).toBe("CONSENT_GRANT_RECORDED");
    expect(a.actor_entity_id).toBe(GRANTOR);
    const det = a.details as Record<string, unknown>;
    expect(det.consent_state).toBe("REVOKED");
    expect(det.revoked_at).toBe(revokedAt.toISOString());
    expect(det.revoked_by).toBe(GRANTOR);
  });
});
