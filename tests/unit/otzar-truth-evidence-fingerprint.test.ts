// FILE: tests/unit/otzar-truth-evidence-fingerprint.test.ts
// PURPOSE: [OTZAR STAGE-2 TRUTH-EVIDENCE §5] The evidence fingerprint is deterministic, key-order-
//          independent, null-stable, and changes when decision-relevant evidence changes.
import { describe, expect, it } from "vitest";
import { computeEvidenceFingerprint } from "@niov/database";

describe("evidence fingerprint (§5)", () => {
  it("is deterministic + key-order independent", () => {
    const a = computeEvidenceFingerprint({ source: "s", version: 3, truth_class: "authorized_decision" });
    const b = computeEvidenceFingerprint({ truth_class: "authorized_decision", version: 3, source: "s" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("null/undefined/absent are equivalent (stable)", () => {
    expect(computeEvidenceFingerprint({ a: 1, b: null })).toBe(computeEvidenceFingerprint({ a: 1 }));
    expect(computeEvidenceFingerprint({ a: 1, b: undefined })).toBe(computeEvidenceFingerprint({ a: 1 }));
  });
  it("a changed source version / authority / truth-class yields a different fingerprint", () => {
    const base = { source: "s", version: 3, authority_class: "authorized", truth_class: "authorized_decision" };
    expect(computeEvidenceFingerprint({ ...base, version: 4 })).not.toBe(computeEvidenceFingerprint(base));
    expect(computeEvidenceFingerprint({ ...base, authority_class: "unverified" })).not.toBe(computeEvidenceFingerprint(base));
    expect(computeEvidenceFingerprint({ ...base, truth_class: "recommendation" })).not.toBe(computeEvidenceFingerprint(base));
  });
});
