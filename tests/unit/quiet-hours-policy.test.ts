// FILE: quiet-hours-policy.test.ts
// PURPOSE: First-class quiet hours on WorkingPolicy.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKING_POLICY,
  isQuietHoursAt,
  mayPerformSilentAiWork,
  shouldSuppressHumanNotification,
} from "../../apps/api/src/services/work-os/scheduling-policy.service.js";

describe("quiet hours policy", () => {
  it("defaults include quiet window 19:00–07:00 and silent AI permission", () => {
    expect(DEFAULT_WORKING_POLICY.quiet_start_min).toBe(19 * 60);
    expect(DEFAULT_WORKING_POLICY.quiet_end_min).toBe(7 * 60);
    expect(DEFAULT_WORKING_POLICY.quiet_permitted_silent_ai).toBe(true);
    expect(DEFAULT_WORKING_POLICY.quiet_notification_exceptions).toContain(
      "BREAK_GLASS",
    );
  });

  it("detects wrap-midnight quiet hours", () => {
    // Monday 20:00
    expect(isQuietHoursAt(20 * 60, 1)).toBe(true);
    // Monday 06:00
    expect(isQuietHoursAt(6 * 60, 1)).toBe(true);
    // Monday 10:00
    expect(isQuietHoursAt(10 * 60, 1)).toBe(false);
    // Monday 12:00
    expect(isQuietHoursAt(12 * 60, 1)).toBe(false);
  });

  it("suppresses nonessential notifications in quiet hours", () => {
    expect(shouldSuppressHumanNotification(true, null)).toBe(true);
    expect(shouldSuppressHumanNotification(true, "STATUS_UPDATE")).toBe(true);
    expect(shouldSuppressHumanNotification(true, "BREAK_GLASS")).toBe(false);
    expect(shouldSuppressHumanNotification(false, null)).toBe(false);
  });

  it("allows silent AI during quiet hours by default", () => {
    expect(mayPerformSilentAiWork(true)).toBe(true);
    expect(mayPerformSilentAiWork(false)).toBe(true);
  });
});
