// FILE: compliance-sharing-redaction.test.ts
// PURPOSE: Phase 1233 — pure-function tests for the compliance
//          share-package redaction + validation helpers. No DB.

import { describe, expect, it } from "vitest";
import {
  MAX_VALIDITY_DAYS,
  SHARE_PACKAGE_SCOPES,
  parseScopes,
  parseValidUntil,
  redactAuditEvents,
  toCountRecord,
} from "../../apps/api/src/services/compliance/compliance-sharing.service.js";

describe("Phase 1233 — parseScopes", () => {
  it("accepts a valid subset and dedupes", () => {
    expect(
      parseScopes(["AUDIT_SUMMARY", "MEMORY_LINEAGE", "AUDIT_SUMMARY"]),
    ).toEqual(["AUDIT_SUMMARY", "MEMORY_LINEAGE"]);
  });

  it("accepts the full closed vocab", () => {
    expect(parseScopes([...SHARE_PACKAGE_SCOPES])).toEqual([
      ...SHARE_PACKAGE_SCOPES,
    ]);
  });

  it("rejects empty, non-array, and unknown scopes", () => {
    expect(parseScopes([])).toBeNull();
    expect(parseScopes("AUDIT_SUMMARY")).toBeNull();
    expect(parseScopes(undefined)).toBeNull();
    expect(parseScopes(["AUDIT_SUMMARY", "EVERYTHING"])).toBeNull();
    expect(parseScopes(["RAW_DATA_DUMP"])).toBeNull();
  });
});

describe("Phase 1233 — parseValidUntil", () => {
  const now = new Date("2026-06-10T00:00:00.000Z");

  it("accepts a future ISO timestamp inside the window", () => {
    const d = parseValidUntil("2026-07-10T00:00:00.000Z", now);
    expect(d?.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("rejects past, now, non-string, garbage, and beyond-max", () => {
    expect(parseValidUntil("2026-06-09T00:00:00.000Z", now)).toBeNull();
    expect(parseValidUntil("2026-06-10T00:00:00.000Z", now)).toBeNull();
    expect(parseValidUntil(12345, now)).toBeNull();
    expect(parseValidUntil("not-a-date", now)).toBeNull();
    const beyond = new Date(
      now.getTime() + (MAX_VALIDITY_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(parseValidUntil(beyond, now)).toBeNull();
  });
});

describe("Phase 1233 — redactAuditEvents", () => {
  it("projects to event_type + outcome + occurred_at ONLY", () => {
    const rows = [
      {
        event_type: "ACTION_EXECUTED",
        outcome: "SUCCESS",
        timestamp: new Date("2026-06-01T12:00:00.000Z"),
        // Fields a real AuditEvent row would also carry; the
        // projection must drop every one of them.
        details: { secret: "MUST_NOT_LEAK" },
        actor_entity_id: "11111111-1111-1111-1111-111111111111",
        target_entity_id: "22222222-2222-2222-2222-222222222222",
        chain_hash: "deadbeef",
      },
    ] as unknown as Array<{
      event_type: string;
      outcome: string;
      timestamp: Date;
    }>;
    const redacted = redactAuditEvents(rows);
    expect(redacted).toEqual([
      {
        event_type: "ACTION_EXECUTED",
        outcome: "SUCCESS",
        occurred_at: "2026-06-01T12:00:00.000Z",
      },
    ]);
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("MUST_NOT_LEAK");
    expect(serialized).not.toContain("details");
    expect(serialized).not.toContain("actor_entity_id");
    expect(serialized).not.toContain("chain_hash");
    expect(serialized).not.toContain("1111-1111");
  });
});

describe("Phase 1233 — toCountRecord", () => {
  it("folds groupBy rows into a sorted count record", () => {
    const rows = [
      { status: "SUCCEEDED", _count: 7 },
      { status: "FAILED", _count: 2 },
      { status: "PROPOSED", _count: 1 },
    ];
    expect(toCountRecord(rows, "status")).toEqual({
      FAILED: 2,
      PROPOSED: 1,
      SUCCEEDED: 7,
    });
    expect(Object.keys(toCountRecord(rows, "status"))).toEqual([
      "FAILED",
      "PROPOSED",
      "SUCCEEDED",
    ]);
  });

  it("ignores rows whose grouped key is not a string", () => {
    const rows = [
      { status: "OK", _count: 3 },
      { status: 42, _count: 9 },
    ] as Array<Record<string, unknown> & { _count: number }>;
    expect(toCountRecord(rows, "status")).toEqual({ OK: 3 });
  });
});
