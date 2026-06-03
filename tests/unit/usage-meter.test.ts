// FILE: usage-meter.test.ts (unit)
// PURPOSE: B6-α Usage Meter Foundation per ADR-0093 §5
//          Candidate C. Pure-function + IO-orchestration unit
//          tests for the tracking-only usage meter substrate.
// CONNECTS TO: apps/api/src/services/billing/usage-meter.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    usageMeter: {
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
  getOrgUsage,
  isValidMeterId,
  recordUsageForOrg,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const ORG = "11111111-1111-1111-1111-111111111111";
const METER = "meter.connector-read-events.v1";

// =====================================================================
// 1. isValidMeterId — closed-vocab catalog pattern
// =====================================================================

describe("isValidMeterId — B2 catalog vocabulary lock", () => {
  it("accepts the 5 canonical team-ledger meter_ids", () => {
    expect(isValidMeterId("meter.active-twin-seats.v1")).toBe(true);
    expect(isValidMeterId("meter.active-admin-seats.v1")).toBe(true);
    expect(isValidMeterId("meter.workflow-recommendations.v1")).toBe(true);
    expect(isValidMeterId("meter.connector-read-events.v1")).toBe(true);
    expect(isValidMeterId("meter.audit-exports.v1")).toBe(true);
  });

  it("rejects ids without the meter. prefix", () => {
    expect(isValidMeterId("active-twin-seats.v1")).toBe(false);
  });

  it("rejects ids without the .vN version suffix", () => {
    expect(isValidMeterId("meter.active-twin-seats")).toBe(false);
  });

  it("rejects ids with uppercase letters", () => {
    expect(isValidMeterId("meter.ActiveTwinSeats.v1")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidMeterId(42)).toBe(false);
    expect(isValidMeterId(null)).toBe(false);
    expect(isValidMeterId(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidMeterId("")).toBe(false);
  });
});

// =====================================================================
// 2. recordUsageForOrg — validation + happy path
// =====================================================================

describe("recordUsageForOrg — validation", () => {
  it("rejects non-UUID org_entity_id → INVALID_ORG_ENTITY_ID", async () => {
    const r = await recordUsageForOrg("not-a-uuid", METER, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_ORG_ENTITY_ID");
      expect(r.httpStatus).toBe(422);
    }
    expect(prismaMock.usageMeter.upsert).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects invalid meter_id → INVALID_METER_ID", async () => {
    const r = await recordUsageForOrg(ORG, "not.canonical", 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_METER_ID");
    expect(prismaMock.usageMeter.upsert).not.toHaveBeenCalled();
  });

  it("rejects delta = 0 → INVALID_DELTA", async () => {
    const r = await recordUsageForOrg(ORG, METER, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DELTA");
  });

  it("rejects negative delta → INVALID_DELTA (recording USAGE not refund)", async () => {
    const r = await recordUsageForOrg(ORG, METER, -1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DELTA");
  });

  it("rejects non-integer delta → INVALID_DELTA", async () => {
    const r = await recordUsageForOrg(ORG, METER, 1.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DELTA");
  });

  it("invalid input fails fast without emitting audit", async () => {
    await recordUsageForOrg(ORG, "bad", 1);
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});

describe("recordUsageForOrg — happy path", () => {
  it("upserts the meter + emits USAGE_METER_RECORDED audit with SAFE details", async () => {
    prismaMock.usageMeter.upsert.mockResolvedValue({
      org_entity_id: ORG,
      meter_id: METER,
      current_value: BigInt(42),
      last_recorded_at: new Date("2026-06-02T00:00:00Z"),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const r = await recordUsageForOrg(ORG, METER, 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.org_entity_id).toBe(ORG);
      expect(r.meter_id).toBe(METER);
      expect(r.delta).toBe(5);
      expect(r.post_value).toBe(BigInt(42));
    }
    // Upsert call shape
    expect(prismaMock.usageMeter.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.usageMeter.upsert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(call.where).toEqual({
      org_entity_id_meter_id: { org_entity_id: ORG, meter_id: METER },
    });
    const update = call.update as { current_value: { increment: bigint } };
    expect(update.current_value.increment).toBe(BigInt(5));
    const create = call.create as {
      org_entity_id: string;
      meter_id: string;
      current_value: bigint;
    };
    expect(create.current_value).toBe(BigInt(5));
    // Audit emission
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const audit = writeAuditEventMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(audit.event_type).toBe("USAGE_METER_RECORDED");
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.actor_entity_id).toBeNull();
    expect(audit.target_entity_id).toBe(ORG);
    const det = audit.details as Record<string, unknown>;
    expect(det.org_entity_id).toBe(ORG);
    expect(det.meter_id).toBe(METER);
    expect(det.delta).toBe(5);
    expect(det.post_value).toBe("42");
    // Forbidden in audit details: pricing, secrets, raw payload
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/price/i);
    expect(serialized).not.toMatch(/usd/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/payload/i);
  });

  it("handles large BigInt post_value without precision loss", async () => {
    const big = BigInt("9007199254740992"); // > Number.MAX_SAFE_INTEGER
    prismaMock.usageMeter.upsert.mockResolvedValue({
      org_entity_id: ORG,
      meter_id: METER,
      current_value: big,
      last_recorded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const r = await recordUsageForOrg(ORG, METER, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.post_value).toBe(big);
    const audit = writeAuditEventMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const det = audit.details as Record<string, unknown>;
    expect(det.post_value).toBe("9007199254740992");
  });
});

// =====================================================================
// 3. getOrgUsage — read helper SAFE projection
// =====================================================================

describe("getOrgUsage", () => {
  it("returns rows ordered by meter_id; emits no audit on read", async () => {
    prismaMock.usageMeter.findMany.mockResolvedValue([
      {
        meter_id: "meter.audit-exports.v1",
        current_value: BigInt(3),
        last_recorded_at: new Date("2026-06-02T00:00:00Z"),
      },
      {
        meter_id: "meter.connector-read-events.v1",
        current_value: BigInt(120),
        last_recorded_at: new Date("2026-06-02T00:05:00Z"),
      },
    ]);
    const r = await getOrgUsage(ORG);
    expect(r.ok).toBe(true);
    expect(r.org_entity_id).toBe(ORG);
    expect(r.meters).toHaveLength(2);
    expect(r.meters[0]?.meter_id).toBe("meter.audit-exports.v1");
    expect(r.meters[0]?.current_value).toBe(BigInt(3));
    expect(r.meters[1]?.current_value).toBe(BigInt(120));
    expect(writeAuditEventMock).not.toHaveBeenCalled();
    // Confirm findMany invocation shape (same-org scope; ordered)
    const callArg = prismaMock.usageMeter.findMany.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect((callArg?.where as Record<string, unknown>).org_entity_id).toBe(ORG);
    expect(callArg?.orderBy).toEqual({ meter_id: "asc" });
  });

  it("returns empty meters[] when the org has no recorded usage yet", async () => {
    prismaMock.usageMeter.findMany.mockResolvedValue([]);
    const r = await getOrgUsage(ORG);
    expect(r.ok).toBe(true);
    expect(r.meters).toEqual([]);
  });
});
