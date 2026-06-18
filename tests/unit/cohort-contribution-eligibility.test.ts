// FILE: tests/unit/cohort-contribution-eligibility.test.ts
// PURPOSE: Phase 1306-A — pure unit tests for isContributionEligible. Proves a
//          contribution counts ONLY while ELIGIBLE, not soft-deleted, inside its
//          window, AND (if it has a consent basis) that consent is still LIVE —
//          a consent revoked/expired after recording drops eligibility (RULE 0
//          consent/revocation). No I/O.
// CONNECTS TO: apps/api/src/services/foundation/cohort-contribution.service.ts

import { describe, expect, it } from "vitest";
import type { CohortContribution } from "@niov/database";
import { isContributionEligible } from "../../apps/api/src/services/foundation/cohort-contribution.service.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");

type Row = Pick<
  CohortContribution,
  "status" | "deleted_at" | "eligible_from" | "eligible_until" | "consent_record_id"
>;

function row(overrides: Partial<Row> = {}): Row {
  return {
    status: "ELIGIBLE",
    deleted_at: null,
    eligible_from: null,
    eligible_until: null,
    consent_record_id: null,
    ...overrides,
  } as Row;
}

describe("Phase 1306-A — isContributionEligible", () => {
  it("ELIGIBLE + no consent + open window → eligible", () => {
    expect(isContributionEligible(row(), NOW, true)).toBe(true);
  });

  it("non-ELIGIBLE status → not eligible", () => {
    for (const status of ["REVOKED", "EXPIRED", "PAUSED"] as const) {
      expect(isContributionEligible(row({ status }), NOW, true)).toBe(false);
    }
  });

  it("soft-deleted → not eligible", () => {
    expect(isContributionEligible(row({ deleted_at: NOW }), NOW, true)).toBe(false);
  });

  it("before eligible_from / after eligible_until → not eligible", () => {
    expect(
      isContributionEligible(row({ eligible_from: new Date("2026-07-01T00:00:00Z") }), NOW, true),
    ).toBe(false);
    expect(
      isContributionEligible(row({ eligible_until: new Date("2026-01-01T00:00:00Z") }), NOW, true),
    ).toBe(false);
  });

  it("inside an explicit window → eligible", () => {
    expect(
      isContributionEligible(
        row({
          eligible_from: new Date("2026-06-01T00:00:00Z"),
          eligible_until: new Date("2026-12-01T00:00:00Z"),
        }),
        NOW,
        true,
      ),
    ).toBe(true);
  });

  it("MUST-FIX: a consent-based contribution drops out when its consent is not live", () => {
    const r = row({ consent_record_id: "11111111-1111-1111-1111-111111111111" });
    // Consent revoked/expired after recording → not eligible even though status
    // is still ELIGIBLE and the window is open.
    expect(isContributionEligible(r, NOW, false)).toBe(false);
    // Consent live → eligible.
    expect(isContributionEligible(r, NOW, true)).toBe(true);
  });

  it("consentActive is irrelevant when there is no consent basis", () => {
    // No consent_record_id → consentActive false must NOT disqualify.
    expect(isContributionEligible(row({ consent_record_id: null }), NOW, false)).toBe(true);
  });
});
