// FILE: twin-work-verification-gate.test.ts
// PURPOSE: [C.3c] Pure completion gate for accuracy-critical Twin claims.
// CONNECTS TO: twinWorkCompletionGate in twin-work-claim.service.

import { describe, expect, it } from "vitest";
import { twinWorkCompletionGate } from "../../apps/api/src/services/otzar/twin-work-claim.service.js";

describe("twinWorkCompletionGate", () => {
  it("allows STANDARD work without verification", () => {
    const g = twinWorkCompletionGate({
      accuracy_class: "STANDARD",
      requires_verification: false,
    });
    expect(g.allowed).toBe(true);
    expect(g.verification_state).toBe("NOT_REQUIRED");
  });

  it("blocks regulated work until human verifies", () => {
    const g = twinWorkCompletionGate({
      accuracy_class: "INSURANCE",
      requires_verification: true,
      verification_state: "PENDING",
    });
    expect(g.allowed).toBe(false);
    expect(g.code).toBe("VERIFICATION_REQUIRED");
  });

  it("allows regulated work after VERIFIED", () => {
    const g = twinWorkCompletionGate({
      accuracy_class: "REGULATED_HEALTH",
      requires_verification: true,
      verification_state: "VERIFIED",
    });
    expect(g.allowed).toBe(true);
    expect(g.verification_state).toBe("VERIFIED");
  });

  it("treats missing twin_work as allow (legacy rows)", () => {
    expect(twinWorkCompletionGate(null).allowed).toBe(true);
  });
});
