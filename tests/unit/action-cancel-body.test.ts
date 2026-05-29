// FILE: action-cancel-body.test.ts (unit)
// PURPOSE: Pure-function unit tests for validateCancelActionBody per
//          ADR-0057 §6 (cancel route body validation). Mirrors the
//          tests/unit/action-create.test.ts validator-precedent.
// CONNECTS TO: apps/api/src/services/action/cancel.service.ts via
//              the "@niov/api" barrel.

import { describe, expect, it } from "vitest";
import { validateCancelActionBody, LIFECYCLE_FIELD_MAX_CHARS } from "@niov/api";

describe("ADR-0057 §6 — validateCancelActionBody", () => {
  it("accepts undefined body (no reason)", () => {
    const r = validateCancelActionBody(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual({});
  });
  it("accepts null body (no reason)", () => {
    const r = validateCancelActionBody(null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual({});
  });
  it("accepts empty object (no reason)", () => {
    const r = validateCancelActionBody({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toEqual({});
  });
  it("accepts reason within length bound", () => {
    const r = validateCancelActionBody({ reason: "user changed mind" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.reason).toBe("user changed mind");
  });
  it("rejects non-object body (array)", () => {
    const r = validateCancelActionBody([] as unknown as Record<string, unknown>);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_FIELD");
      expect(r.invalid_fields).toContain("body");
    }
  });
  it("rejects unknown field", () => {
    const r = validateCancelActionBody({ note: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNKNOWN_FIELD");
      expect(r.unknown_fields).toContain("note");
    }
  });
  it("rejects non-string reason", () => {
    const r = validateCancelActionBody({ reason: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_FIELD");
      expect(r.invalid_fields).toContain("reason");
    }
  });
  it("rejects reason over LIFECYCLE_FIELD_MAX_CHARS", () => {
    const r = validateCancelActionBody({
      reason: "x".repeat(LIFECYCLE_FIELD_MAX_CHARS + 1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_FIELD");
      expect(r.invalid_fields).toContain("reason");
    }
  });
  it("accepts reason exactly at LIFECYCLE_FIELD_MAX_CHARS", () => {
    const r = validateCancelActionBody({
      reason: "x".repeat(LIFECYCLE_FIELD_MAX_CHARS),
    });
    expect(r.ok).toBe(true);
  });
});
