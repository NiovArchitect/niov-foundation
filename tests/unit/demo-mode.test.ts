// FILE: demo-mode.test.ts (unit)
// PURPOSE: [OTZAR-V1-LIVE-1A-FOUNDATION] Lock the demo-intake gate. Demo modes
//          (DEMO_SCRIPTED / DEMO_FIXTURE) must be refused in staging/production
//          unless ALLOW_DEMO_MODE=true, and stay permitted in test/local-dev so
//          the fixture-driven suite is unaffected. Pure logic — explicit env
//          objects, no global process.env mutation.
// CONNECTS TO: apps/api/src/services/otzar/demo-mode.ts.

import { describe, expect, it } from "vitest";
import { isDemoModeAllowed } from "../../apps/api/src/services/otzar/demo-mode.js";

describe("isDemoModeAllowed", () => {
  it("ALLOWS demo when ALLOW_DEMO_MODE=true even under NODE_ENV=production", () => {
    expect(
      isDemoModeAllowed({ NODE_ENV: "production", ALLOW_DEMO_MODE: "true" }),
    ).toBe(true);
  });

  it("REFUSES demo under NODE_ENV=production with no ALLOW_DEMO_MODE", () => {
    expect(isDemoModeAllowed({ NODE_ENV: "production" })).toBe(false);
  });

  it("REFUSES demo under NODE_ENV=staging with no ALLOW_DEMO_MODE", () => {
    expect(isDemoModeAllowed({ NODE_ENV: "staging" })).toBe(false);
  });

  it("ALLOWS demo under NODE_ENV=test (the fixture-driven suite)", () => {
    expect(isDemoModeAllowed({ NODE_ENV: "test" })).toBe(true);
  });

  it("ALLOWS demo under NODE_ENV=development (local dev)", () => {
    expect(isDemoModeAllowed({ NODE_ENV: "development" })).toBe(true);
  });

  it("ALLOWS demo when NODE_ENV is unset (local default)", () => {
    expect(isDemoModeAllowed({})).toBe(true);
  });

  it("ALLOW_DEMO_MODE only honors the exact string 'true'", () => {
    expect(isDemoModeAllowed({ NODE_ENV: "production", ALLOW_DEMO_MODE: "1" })).toBe(false);
    expect(isDemoModeAllowed({ NODE_ENV: "production", ALLOW_DEMO_MODE: "TRUE" })).toBe(false);
  });
});
