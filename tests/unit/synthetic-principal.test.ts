// FILE: tests/unit/synthetic-principal.test.ts
// PURPOSE: Server-side synthetic principal filter for org_roster / team-work.

import { describe, expect, it } from "vitest";
import {
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
    }
  });

  it("flags r03-s250 pressure locals", () => {
    expect(
      isSyntheticPrincipal({ email: "r03-s250+abc-12@niovlabs.com" }),
    ).toBe(true);
  });

  it("keeps allowlisted demo team", () => {
    for (const email of [
      "sadeil@niovlabs.com",
      "david@niovlabs.com",
      "annie@niovlabs.com",
      "william@niovlabs.com",
      "shweta@niovlabs.com",
      "walter@niovlabs.com",
    ]) {
      expect(isSyntheticPrincipal({ email }), email).toBe(false);
    }
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
