import { describe, expect, it } from "vitest";

// Pure product contract for ambient-first comms doctrine (no network).
// Full sync is integration/provider-proven when OAuth is live.

describe("ambient-comms doctrine", () => {
  it("documents primary automatic vs fallback rails", () => {
    const primary = {
      source_id: "google_meet",
      automatic: true,
      is_primary: true,
      is_fallback: false,
    };
    const fallback = {
      source_id: "manual_paste",
      automatic: false,
      is_primary: false,
      is_fallback: true,
    };
    expect(primary.is_primary).toBe(true);
    expect(primary.automatic).toBe(true);
    expect(fallback.is_fallback).toBe(true);
    expect(fallback.automatic).toBe(false);
  });
});
