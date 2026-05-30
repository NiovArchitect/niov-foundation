// FILE: audit-csv-export.test.ts (unit)
// PURPOSE: Hardening Wave A — safeCsvCell RFC 4180 escaping
//          contract coverage. Verifies: null/undefined → empty;
//          plain strings pass through unquoted; commas / quotes /
//          line-breaks trigger quoting; embedded quotes get
//          doubled; objects (the audit `details` Json column)
//          serialize through JSON.stringify before escaping.
// CONNECTS TO:
//   - apps/api/src/services/audit/audit-view.service.ts
//     (safeCsvCell + buildCsvBody for the Wave 4 NDJSON export
//     route's new format=csv branch)

import { describe, expect, it } from "vitest";
import { safeCsvCell } from "@niov/api";

describe("safeCsvCell — RFC 4180 §2.5 + §2.7 escaping", () => {
  it("null + undefined → empty string", () => {
    expect(safeCsvCell(null)).toBe("");
    expect(safeCsvCell(undefined)).toBe("");
  });

  it("plain strings pass through unquoted", () => {
    expect(safeCsvCell("hello")).toBe("hello");
    expect(safeCsvCell("audit_id_12345")).toBe("audit_id_12345");
    expect(safeCsvCell("")).toBe("");
  });

  it("strings containing commas get wrapped in double-quotes", () => {
    expect(safeCsvCell("a,b,c")).toBe('"a,b,c"');
  });

  it("strings containing double-quotes get the quotes doubled + wrapped", () => {
    expect(safeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
  });

  it("strings containing newlines get wrapped", () => {
    expect(safeCsvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(safeCsvCell("line one\r\nline two")).toBe(
      '"line one\r\nline two"',
    );
  });

  it("objects serialize through JSON.stringify before escaping", () => {
    expect(safeCsvCell({ action: "TEST", value: 1 })).toBe(
      '"{""action"":""TEST"",""value"":1}"',
    );
  });

  it("nested objects with commas + quotes survive round-trip safely", () => {
    const cell = safeCsvCell({
      action: "AUDIT_VIEW_EXPORT",
      filter_keys: ["event_type", "outcome"],
    });
    expect(cell.startsWith("\"")).toBe(true);
    expect(cell.endsWith("\"")).toBe(true);
    // Unwrap + un-double the embedded quotes; should round-trip
    // back to the original JSON.
    const unwrapped = cell.slice(1, -1).replaceAll('""', '"');
    expect(JSON.parse(unwrapped)).toEqual({
      action: "AUDIT_VIEW_EXPORT",
      filter_keys: ["event_type", "outcome"],
    });
  });

  it("numbers + booleans serialize predictably via JSON.stringify", () => {
    expect(safeCsvCell(42)).toBe("42");
    expect(safeCsvCell(true)).toBe("true");
    expect(safeCsvCell(false)).toBe("false");
    expect(safeCsvCell(3.14)).toBe("3.14");
  });

  it("arrays serialize through JSON.stringify + get wrapped (contain comma)", () => {
    expect(safeCsvCell(["a", "b"])).toBe('"[""a"",""b""]"');
  });
});
