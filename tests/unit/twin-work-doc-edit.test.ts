// FILE: twin-work-doc-edit.test.ts
// PURPOSE: [C.3b] Pure Drive edit-after-claim comparator — no Google needed.
// CONNECTS TO: twin-work-doc-edit compareTwinDocEdit.

import { describe, expect, it } from "vitest";
import { compareTwinDocEdit } from "../../apps/api/src/services/otzar/twin-work-doc-edit.js";

describe("compareTwinDocEdit", () => {
  it("first check near claim time does not flag (create race)", () => {
    const r = compareTwinDocEdit({
      claimed_at: "2026-07-16T12:00:00.000Z",
      baseline_modified_at: null,
      drive_modified_at: "2026-07-16T12:00:03.000Z",
      slack_ms: 5000,
    });
    expect(r.edit_detected).toBe(false);
    expect(r.edit_signal).toBe("NONE");
    expect(r.next_baseline_modified_at).toBe("2026-07-16T12:00:03.000Z");
  });

  it("later Drive modifiedTime flags MODIFIED_AFTER_CLAIM", () => {
    const r = compareTwinDocEdit({
      claimed_at: "2026-07-16T12:00:00.000Z",
      baseline_modified_at: "2026-07-16T12:00:03.000Z",
      drive_modified_at: "2026-07-16T14:30:00.000Z",
      slack_ms: 5000,
    });
    expect(r.edit_detected).toBe(true);
    expect(r.edit_signal).toBe("MODIFIED_AFTER_CLAIM");
  });

  it("stays sticky once previously detected", () => {
    const r = compareTwinDocEdit({
      claimed_at: "2026-07-16T12:00:00.000Z",
      baseline_modified_at: "2026-07-16T12:00:03.000Z",
      drive_modified_at: "2026-07-16T12:00:03.000Z",
      previously_detected: true,
    });
    expect(r.edit_detected).toBe(true);
    expect(r.edit_signal).toBe("MODIFIED_AFTER_CLAIM");
  });

  it("unchanged Drive time after baseline is quiet", () => {
    const r = compareTwinDocEdit({
      claimed_at: "2026-07-16T12:00:00.000Z",
      baseline_modified_at: "2026-07-16T12:00:03.000Z",
      drive_modified_at: "2026-07-16T12:00:03.000Z",
    });
    expect(r.edit_detected).toBe(false);
    expect(r.edit_signal).toBe("NONE");
  });
});
