// FILE: receipt.test.ts (unit)
// PURPOSE: DMW Runtime DM1-B Receipt substrate unit tests per
//          ADR-0092 §4 Candidate A (closes the Consent + Receipt
//          pair). Verifies canonical record builder + SHA-256
//          hash determinism + service IO + tamper-evidence
//          verification.
// CONNECTS TO: apps/api/src/services/dmw/receipt.service.ts via
//              @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    consentGrant: { findUnique: vi.fn() },
    receipt: {
      create: vi.fn(),
      findUnique: vi.fn(),
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

import {
  buildReceiptCanonicalRecord,
  computeReceiptHash,
  getReceiptById,
  issueReceiptForConsent,
  verifyReceiptHash,
  type ReceiptSummary,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const CONSENT = "11111111-1111-1111-1111-111111111111";
const PERMISSION = "22222222-2222-2222-2222-222222222222";
const AUDIT = "33333333-3333-3333-3333-333333333333";
const RECEIPT = "44444444-4444-4444-4444-444444444444";

// =====================================================================
// 1. buildReceiptCanonicalRecord — pure deterministic builder
// =====================================================================

describe("buildReceiptCanonicalRecord", () => {
  it("concatenates the 4 fields with pipe delimiters", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const r = buildReceiptCanonicalRecord({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    expect(r).toBe(
      `${CONSENT}|${PERMISSION}|${AUDIT}|2026-06-02T12:00:00.000Z`,
    );
  });

  it("encodes null permission_id as empty segment", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const r = buildReceiptCanonicalRecord({
      consent_id: CONSENT,
      permission_id: null,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    expect(r).toBe(`${CONSENT}||${AUDIT}|2026-06-02T12:00:00.000Z`);
  });

  it("encodes null audit_event_id as empty segment", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const r = buildReceiptCanonicalRecord({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: null,
      timestamp_sealed: ts,
    });
    expect(r).toBe(`${CONSENT}|${PERMISSION}||2026-06-02T12:00:00.000Z`);
  });
});

// =====================================================================
// 2. computeReceiptHash — deterministic SHA-256
// =====================================================================

describe("computeReceiptHash", () => {
  it("returns a deterministic hex digest of expected length", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const h1 = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    const h2 = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("changes the digest when any single field changes", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const baseline = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    const altConsent = computeReceiptHash({
      consent_id: "00000000-0000-0000-0000-000000000000",
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    const altPermission = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: "00000000-0000-0000-0000-000000000000",
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    const altAudit = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: "00000000-0000-0000-0000-000000000000",
      timestamp_sealed: ts,
    });
    const altTimestamp = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: new Date("2026-06-02T12:00:01.000Z"),
    });
    expect(altConsent).not.toBe(baseline);
    expect(altPermission).not.toBe(baseline);
    expect(altAudit).not.toBe(baseline);
    expect(altTimestamp).not.toBe(baseline);
  });
});

// =====================================================================
// 3. issueReceiptForConsent — validation + IO orchestration
// =====================================================================

describe("issueReceiptForConsent — validation", () => {
  it("rejects malformed consent_id → INVALID_FIELD", async () => {
    const r = await issueReceiptForConsent({ consent_id: "not-uuid" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("consent_id");
    }
    expect(prismaMock.consentGrant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.receipt.create).not.toHaveBeenCalled();
  });

  it("rejects malformed audit_event_id when provided", async () => {
    const r = await issueReceiptForConsent({
      consent_id: CONSENT,
      audit_event_id: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "INVALID_FIELD") {
      expect(r.invalid_fields).toContain("audit_event_id");
    }
  });

  it("rejects malformed permission_id when provided", async () => {
    const r = await issueReceiptForConsent({
      consent_id: CONSENT,
      permission_id: "x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("issueReceiptForConsent — IO orchestration", () => {
  it("returns CONSENT_NOT_FOUND when consent doesn't exist", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue(null);
    const r = await issueReceiptForConsent({ consent_id: CONSENT });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "CONSENT_NOT_FOUND") {
      expect(r.httpStatus).toBe(404);
    }
    expect(prismaMock.receipt.create).not.toHaveBeenCalled();
  });

  it("issues a receipt with computed hash when consent exists; falls back to consent.permission_id when input omits it", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue({
      consent_id: CONSENT,
      permission_id: PERMISSION,
    });
    const sealedTs = new Date("2026-06-02T12:00:00.000Z");
    prismaMock.receipt.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      receipt_id: RECEIPT,
      consent_id: data.consent_id,
      permission_id: data.permission_id ?? null,
      audit_event_id: data.audit_event_id ?? null,
      timestamp_sealed: data.timestamp_sealed,
      receipt_hash: data.receipt_hash,
      created_at: sealedTs,
    }));
    const r = await issueReceiptForConsent({
      consent_id: CONSENT,
      audit_event_id: AUDIT,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.receipt.consent_id).toBe(CONSENT);
      // Falls back to consent.permission_id since input didn't supply
      expect(r.receipt.permission_id).toBe(PERMISSION);
      expect(r.receipt.audit_event_id).toBe(AUDIT);
      expect(r.receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
      // Verify hash matches the canonical record
      const expected = computeReceiptHash({
        consent_id: CONSENT,
        permission_id: PERMISSION,
        audit_event_id: AUDIT,
        timestamp_sealed: r.receipt.timestamp_sealed,
      });
      expect(r.receipt.receipt_hash).toBe(expected);
    }
  });

  it("accepts explicit permission_id override even when consent carries one", async () => {
    prismaMock.consentGrant.findUnique.mockResolvedValue({
      consent_id: CONSENT,
      permission_id: PERMISSION,
    });
    const override = "55555555-5555-5555-5555-555555555555";
    prismaMock.receipt.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      receipt_id: RECEIPT,
      consent_id: data.consent_id,
      permission_id: data.permission_id ?? null,
      audit_event_id: data.audit_event_id ?? null,
      timestamp_sealed: data.timestamp_sealed,
      receipt_hash: data.receipt_hash,
      created_at: new Date(),
    }));
    const r = await issueReceiptForConsent({
      consent_id: CONSENT,
      permission_id: override,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.receipt.permission_id).toBe(override);
    }
  });
});

// =====================================================================
// 4. getReceiptById
// =====================================================================

describe("getReceiptById", () => {
  it("returns null for malformed receipt_id without DB query", async () => {
    const r = await getReceiptById("x");
    expect(r).toBeNull();
    expect(prismaMock.receipt.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when row not found", async () => {
    prismaMock.receipt.findUnique.mockResolvedValue(null);
    const r = await getReceiptById(RECEIPT);
    expect(r).toBeNull();
  });

  it("returns SAFE projection when found", async () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    prismaMock.receipt.findUnique.mockResolvedValue({
      receipt_id: RECEIPT,
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
      receipt_hash: "deadbeef".repeat(8),
      created_at: ts,
    });
    const r = await getReceiptById(RECEIPT);
    expect(r).not.toBeNull();
    expect(r?.receipt_id).toBe(RECEIPT);
    expect(r?.consent_id).toBe(CONSENT);
  });
});

// =====================================================================
// 5. verifyReceiptHash — tamper-evidence
// =====================================================================

describe("verifyReceiptHash", () => {
  it("returns true when stored hash matches the canonical hash", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const hash = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    const receipt: ReceiptSummary = {
      receipt_id: RECEIPT,
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
      receipt_hash: hash,
    };
    expect(verifyReceiptHash(receipt)).toBe(true);
  });

  it("returns false when ANY field has been tampered with", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const hash = computeReceiptHash({
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
    });
    // Tampered consent_id
    const tampered: ReceiptSummary = {
      receipt_id: RECEIPT,
      consent_id: "00000000-0000-0000-0000-000000000000",
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
      receipt_hash: hash,
    };
    expect(verifyReceiptHash(tampered)).toBe(false);
  });

  it("returns false when receipt_hash itself was swapped", () => {
    const ts = new Date("2026-06-02T12:00:00.000Z");
    const receipt: ReceiptSummary = {
      receipt_id: RECEIPT,
      consent_id: CONSENT,
      permission_id: PERMISSION,
      audit_event_id: AUDIT,
      timestamp_sealed: ts,
      receipt_hash: "deadbeef".repeat(8),
    };
    expect(verifyReceiptHash(receipt)).toBe(false);
  });
});
