// FILE: tests/unit/synthetic-principal.test.ts
// PURPOSE: Server-side synthetic principal filter for org_roster / team-work
//          + soft-isolation HIGH vs REVIEW_REQUIRED classification.

import { describe, expect, it } from "vitest";
import {
  classifySyntheticPrincipal,
  DEMO_TEAM_EMAIL_ALLOWLIST,
  filterCoworkerPeople,
  isSyntheticPrincipal,
} from "../../apps/api/src/services/otzar/synthetic-principal.js";

describe("isSyntheticPrincipal (Foundation)", () => {
  it("flags founder-reproduced rc2-admin emails", () => {
    for (const email of [
      "rc2-admin-2+sadeil@niovlabs.com",
      "rc2-admin-2b+sadeil@niovlabs.com",
      "rc2-admin-3+sadeil@niovlabs.com",
      "rc2-admin-4+sadeil@niovlabs.com",
    ]) {
      expect(isSyntheticPrincipal({ email }), email).toBe(true);
      expect(classifySyntheticPrincipal({ email }).confidence).toBe("HIGH");
      expect(classifySyntheticPrincipal({ email }).reason).toBe(
        "exact_rc2_admin_prefix",
      );
    }
  });

  it("flags r03-s250 pressure locals", () => {
    expect(
      isSyntheticPrincipal({ email: "r03-s250+abc-12@niovlabs.com" }),
    ).toBe(true);
    expect(
      classifySyntheticPrincipal({
        email: "r03-s250+abc-12@niovlabs.com",
      }).reason,
    ).toBe("exact_pressure_load_fixture_local");
  });

  it("keeps allowlisted demo team", () => {
    for (const email of [
      "sadeil@niovlabs.com",
      "david@niovlabs.com",
      "annie@niovlabs.com",
      "william@niovlabs.com",
      "shweta@niovlabs.com",
      "walter@niovlabs.com",
      "vishesh@niovlabs.com",
      "samiksha@niovlabs.com",
    ]) {
      expect(isSyntheticPrincipal({ email }), email).toBe(false);
      expect(classifySyntheticPrincipal({ email }).confidence).toBe(
        "NOT_SYNTHETIC",
      );
      expect(DEMO_TEAM_EMAIL_ALLOWLIST.has(email)).toBe(true);
    }
  });

  it("does not classify human-looking names as HIGH via broad substring", () => {
    // "will" / "admin" / "test" in ordinary human names must not match
    expect(
      isSyntheticPrincipal({
        email: "william.smith@company.com",
        display_name: "William Smith",
      }),
    ).toBe(false);
    expect(
      isSyntheticPrincipal({
        email: "administrator@niovlabs.com",
        display_name: "Office Administrator",
      }),
    ).toBe(false);
    expect(
      classifySyntheticPrincipal({
        email: "annie.research@niovlabs.com",
        display_name: "Annie",
      }).confidence,
    ).toBe("NOT_SYNTHETIC");
  });

  it("marks ambiguous fixtures as REVIEW_REQUIRED not HIGH", () => {
    const c = classifySyntheticPrincipal({
      email: "person+test@niovlabs.com",
      display_name: "Person",
    });
    expect(c.confidence).toBe("REVIEW_REQUIRED");
    expect(isSyntheticPrincipal({ email: "person+test@niovlabs.com" })).toBe(
      false,
    );
  });

  it("filters coworker lists", () => {
    const out = filterCoworkerPeople([
      { email: "david@niovlabs.com", display_name: "David" },
      { email: "rc2-admin-2+sadeil@niovlabs.com", display_name: "x" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.email).toBe("david@niovlabs.com");
  });
});
