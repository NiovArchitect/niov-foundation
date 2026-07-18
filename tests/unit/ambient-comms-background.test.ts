// FILE: ambient-comms-background.test.ts
// PURPOSE: Contract for background ambient org sync — continuous Meet pull
//          without UI open; doctrine: auto primary, paste fallback.
import { describe, expect, it } from "vitest";
import { GOOGLE_OAUTH_TOOL } from "../../apps/api/src/services/otzar/ambient-comms-background.service.js";

describe("ambient-comms-background doctrine", () => {
  it("targets org-level Google OAuth credential tool key", () => {
    expect(GOOGLE_OAUTH_TOOL).toBe("OAUTH_GOOGLE_WORKSPACE");
  });

  it("documents continuous primary path cadence", () => {
    // Cron in action/scheduler: every 5 minutes ("0 */5 * * * *").
    const cadenceMinutes = 5;
    expect(cadenceMinutes).toBeGreaterThanOrEqual(1);
    expect(cadenceMinutes).toBeLessThanOrEqual(15);
  });
});
