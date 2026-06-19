// FILE: tests/unit/settlement-intent.test.ts (unit)
// PURPOSE: F-1325 — lock the deterministic grant-status → settlement-intent-status
//          mapping. Intent only; mock-only.
// CONNECTS TO: apps/api/src/services/foundation/settlement-intent.service.ts

import { describe, expect, it } from "vitest";
import { settlementStatusFor } from "../../apps/api/src/services/foundation/settlement-intent.service.js";

describe("F-1325 settlement intent status mapping", () => {
  it("maps grant lifecycle to intent status deterministically", () => {
    expect(settlementStatusFor("ACTIVE")).toBe("PROJECTED");
    expect(settlementStatusFor("EXPIRED")).toBe("MATURED");
    expect(settlementStatusFor("REVOKED")).toBe("REVOKED");
  });

  it("non-accruing grant states void the obligation", () => {
    expect(settlementStatusFor("PENDING_CONSENT")).toBe("VOIDED");
    expect(settlementStatusFor("DENIED")).toBe("VOIDED");
    expect(settlementStatusFor("ANYTHING_ELSE")).toBe("VOIDED");
  });
});
