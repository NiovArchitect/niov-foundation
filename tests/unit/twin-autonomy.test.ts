// FILE: twin-autonomy.test.ts (unit, no DB)
// PURPOSE: [GAP-G SLICE-1] Lock the canonical autonomy ranking + ceiling cap:
//          templates RECOMMEND, the org ceiling CAPS, invalid values can
//          never overgrant. Fail-closed everywhere.
// CONNECTS TO: services/governance/twin-autonomy.ts.

import { describe, expect, it } from "vitest";
import {
  applyTwinAutonomyCeiling,
  normalizeTwinAutonomy,
} from "../../apps/api/src/services/governance/twin-autonomy.js";

describe("[GAP-G] applyTwinAutonomyCeiling — templates recommend, org policy caps", () => {
  it("EXECUTIVE_OVERRIDE recommendation is capped to APPROVAL_REQUIRED by the default ceiling", () => {
    const r = applyTwinAutonomyCeiling("EXECUTIVE_OVERRIDE", "APPROVAL_REQUIRED");
    expect(r.applied).toBe("APPROVAL_REQUIRED");
    expect(r.recommended).toBe("EXECUTIVE_OVERRIDE");
    expect(r.capped).toBe(true);
  });

  it("APPROVAL_REQUIRED stays APPROVAL_REQUIRED (uncapped)", () => {
    const r = applyTwinAutonomyCeiling("APPROVAL_REQUIRED", "APPROVAL_REQUIRED");
    expect(r.applied).toBe("APPROVAL_REQUIRED");
    expect(r.capped).toBe(false);
  });

  it("a LOWER template recommendation stays lower — the ceiling never raises", () => {
    const r = applyTwinAutonomyCeiling("OBSERVE_ONLY", "EXECUTIVE_OVERRIDE");
    expect(r.applied).toBe("OBSERVE_ONLY");
    expect(r.capped).toBe(false);
  });

  it("a raised ceiling lets the recommendation through — a deliberate org decision", () => {
    const r = applyTwinAutonomyCeiling("EXECUTIVE_OVERRIDE", "EXECUTIVE_OVERRIDE");
    expect(r.applied).toBe("EXECUTIVE_OVERRIDE");
    expect(r.capped).toBe(false);
  });

  it("missing template recommendation falls back safely (APPROVAL_REQUIRED, recommended=null)", () => {
    const r = applyTwinAutonomyCeiling(null, "APPROVAL_REQUIRED");
    expect(r.applied).toBe("APPROVAL_REQUIRED");
    expect(r.recommended).toBeNull();
    expect(r.capped).toBe(false);
  });

  it("missing ceiling falls back to APPROVAL_REQUIRED — never open", () => {
    const r = applyTwinAutonomyCeiling("EXECUTIVE_OVERRIDE", undefined);
    expect(r.applied).toBe("APPROVAL_REQUIRED");
    expect(r.ceiling).toBe("APPROVAL_REQUIRED");
    expect(r.capped).toBe(true);
  });

  it("an INVALID ceiling can never overgrant — normalizes down, not up", () => {
    for (const bad of ["GOD_MODE", "", 42, {}, "executive_override"]) {
      const r = applyTwinAutonomyCeiling("EXECUTIVE_OVERRIDE", bad);
      expect(r.applied).toBe("APPROVAL_REQUIRED");
      expect(r.capped).toBe(true);
    }
  });

  it("an invalid template recommendation is treated as no recommendation", () => {
    const r = applyTwinAutonomyCeiling("SUPERUSER", "EXECUTIVE_OVERRIDE");
    expect(r.recommended).toBeNull();
    expect(r.applied).toBe("APPROVAL_REQUIRED");
  });
});

describe("[GAP-G] normalizeTwinAutonomy", () => {
  it("accepts only the three canonical levels", () => {
    expect(normalizeTwinAutonomy("OBSERVE_ONLY")).toBe("OBSERVE_ONLY");
    expect(normalizeTwinAutonomy("EXECUTIVE_OVERRIDE")).toBe("EXECUTIVE_OVERRIDE");
    expect(normalizeTwinAutonomy("nonsense")).toBe("APPROVAL_REQUIRED");
    expect(normalizeTwinAutonomy(undefined)).toBe("APPROVAL_REQUIRED");
  });
});
