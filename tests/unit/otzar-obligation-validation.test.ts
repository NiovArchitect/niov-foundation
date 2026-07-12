// FILE: tests/unit/otzar-obligation-validation.test.ts
// PURPOSE: [OTZAR STAGE-2 HARDENING D+H] Exhaustive proof of the obligation enum allowlists +
//          the recursive safe-JSON validator: every canonical value is accepted, every unknown
//          value is rejected, and forbidden/oversized/nested-unsafe JSON is rejected.
// CONNECTS TO: packages/database/src/queries/otzar-obligation-validation.ts

import { describe, expect, it } from "vitest";
import {
  OBLIGATION_TYPES, OBLIGATION_PRIORITIES, REQUIRED_RESPONSE_CLASSES, SOURCE_CHANNELS,
  PROVENANCE_CLASSES, VISIBILITY_SCOPES,
  isObligationType, isObligationState, isObligationPriority, isRequiredResponseClass,
  isSourceChannel, isProvenanceClass, isVisibilityScope,
  validateSafeJson, DEFAULT_SAFE_JSON_LIMITS,
} from "@niov/database";

describe("obligation enum allowlists (D)", () => {
  const cases: Array<[string, readonly string[], (v: unknown) => boolean]> = [
    ["type", OBLIGATION_TYPES, isObligationType],
    ["state", ["OPEN", "AWAITING_RESPONSE", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "ESCALATED", "COMPLETED", "CANCELLED", "SUPERSEDED", "EXPIRED"], isObligationState],
    ["priority", OBLIGATION_PRIORITIES, isObligationPriority],
    ["required_response_class", REQUIRED_RESPONSE_CLASSES, isRequiredResponseClass],
    ["source_channel", SOURCE_CHANNELS, isSourceChannel],
    ["provenance_class", PROVENANCE_CLASSES, isProvenanceClass],
    ["visibility_scope", VISIBILITY_SCOPES, isVisibilityScope],
  ];
  for (const [name, values, guard] of cases) {
    it(`${name}: accepts every canonical value, rejects unknown/empty/casing/non-string`, () => {
      for (const v of values) expect(guard(v)).toBe(true);
      expect(guard("TOTALLY_UNKNOWN")).toBe(false);
      expect(guard(values[0]!.toLowerCase())).toBe(false); // case-sensitive
      expect(guard("")).toBe(false);
      expect(guard(null)).toBe(false);
      expect(guard(undefined)).toBe(false);
      expect(guard(42)).toBe(false);
      expect(guard({})).toBe(false);
    });
  }
});

describe("safe-JSON validator (H)", () => {
  it("accepts a plain safe object", () => {
    expect(validateSafeJson({ note: "ok", count: 3, nested: { flag: true, list: [1, 2, "three"] } }).ok).toBe(true);
  });

  const forbiddenKeys = [
    "password", "Passwd", "secret", "api_secret", "token", "access_token", "authorization",
    "Cookie", "api_key", "apiKey", "oauth", "oauth_token", "private_key", "sealed_payload",
    "raw_response", "provider_raw", "stack_trace", "database_url", "db_url", "connection_string", "bearer",
  ];
  for (const key of forbiddenKeys) {
    it(`rejects forbidden key "${key}" at top level and when nested`, () => {
      expect(validateSafeJson({ [key]: "x" }).ok).toBe(false);
      expect(validateSafeJson({ a: { b: [{ [key]: "x" }] } }).ok).toBe(false);
    });
  }

  it("allows innocuous keys that merely contain safe words", () => {
    expect(validateSafeJson({ description: "a summary", title_note: "hi" }).ok).toBe(true);
  });

  it("enforces depth / key-count / string-length / total-size limits", () => {
    // Depth.
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < DEFAULT_SAFE_JSON_LIMITS.maxDepth + 2; i++) deep = { nested: deep };
    expect(validateSafeJson(deep).ok).toBe(false);
    // Key count.
    const many: Record<string, unknown> = {};
    for (let i = 0; i < DEFAULT_SAFE_JSON_LIMITS.maxKeys + 5; i++) many[`k${i}`] = i;
    expect(validateSafeJson(many).ok).toBe(false);
    // String length.
    expect(validateSafeJson({ s: "x".repeat(DEFAULT_SAFE_JSON_LIMITS.maxStringLength + 1) }).ok).toBe(false);
    // Total size.
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) big[`k${i}`] = "y".repeat(500);
    expect(validateSafeJson(big).ok).toBe(false);
  });

  it("rejects non-plain / unsupported values", () => {
    expect(validateSafeJson({ when: new Date() }).ok).toBe(false); // non-plain object
    expect(validateSafeJson({ fn: (() => 1) as unknown }).ok).toBe(false);
    expect(validateSafeJson({ big: BigInt(1) as unknown }).ok).toBe(false);
  });

  it("accepts null, primitives, and arrays at the top", () => {
    expect(validateSafeJson(null).ok).toBe(true);
    expect(validateSafeJson([1, "a", { ok: true }]).ok).toBe(true);
  });
});
