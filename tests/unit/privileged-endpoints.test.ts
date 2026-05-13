// FILE: privileged-endpoints.test.ts
// PURPOSE: Unit tests for the LIVE privileged-endpoint runtime registry
//          exposed via @niov/api (apps/api/src/security/privileged-endpoints.ts).
//          Pure-data tests -- no database; verifies the registry shape,
//          entry uniqueness, the can_admin_niov auth-tier invariant per
//          Tension 3 Category (1), and the isPrivilegedEndpoint type guard.
// CONNECTS TO:
//   - apps/api/src/security/privileged-endpoints.ts (the substrate under
//     test; consumed via the @niov/api re-export)
//   - docs/architecture/dual-control-operations-canonical-record.md (the
//     canonical-record doc this registry consumes; the 2 LIVE entries
//     from Category (1) -- the runtime registry is LIVE-only per the
//     three-artifact substrate split)
//   - docs/COMPLIANCE_ARCHITECTURE_REVIEW.md Tension 3 (the
//     source-of-substance for the 4-category framing)

import { describe, it, expect } from "vitest";
import {
  PRIVILEGED_ENDPOINTS,
  isPrivilegedEndpoint,
  type PrivilegedEndpoint,
} from "@niov/api";

describe("PRIVILEGED_ENDPOINTS registry", () => {
  it("contains exactly 2 LIVE Category (1) entries", () => {
    // Substrate-state verification: the runtime registry consumes ONLY
    // the LIVE entries per the three-artifact substrate split. The 4
    // forward-substrate operations, 1 DB-tier operation, and 1
    // RULE-10-retired operation are at the canonical-record doc, NOT
    // here. Future LIVE entries land here when their target sub-phase
    // ships (per the canonical-record doc forward paths).
    expect(PRIVILEGED_ENDPOINTS).toHaveLength(2);
  });

  it("has no duplicate (method, route) entries", () => {
    const keys = PRIVILEGED_ENDPOINTS.map((e) => `${e.method} ${e.route}`);
    expect(new Set(keys).size).toBe(PRIVILEGED_ENDPOINTS.length);
  });

  it("has no duplicate action-descriptor types", () => {
    const types = PRIVILEGED_ENDPOINTS.map((e) => e.actionDescriptor.type);
    expect(new Set(types).size).toBe(PRIVILEGED_ENDPOINTS.length);
  });

  it("contains only can_admin_niov-gated entries (per Tension 3 Category (1))", () => {
    const allCanAdminNiov = PRIVILEGED_ENDPOINTS.every(
      (e: PrivilegedEndpoint) => e.authTier === "can_admin_niov",
    );
    expect(allCanAdminNiov).toBe(true);
  });
});

describe("isPrivilegedEndpoint type guard", () => {
  it("returns the matching entry for PATCH /api/v1/platform/monetization/config", () => {
    const entry = isPrivilegedEndpoint(
      "PATCH",
      "/api/v1/platform/monetization/config",
    );
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe(
      "PLATFORM_MONETIZATION_CONFIG_UPDATE",
    );
  });

  it("returns the matching entry for POST /api/v1/platform/orgs", () => {
    const entry = isPrivilegedEndpoint("POST", "/api/v1/platform/orgs");
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe("PLATFORM_ORG_CREATION");
  });

  it("returns undefined for an unregistered route", () => {
    expect(isPrivilegedEndpoint("GET", "/api/v1/some/random/path")).toBeUndefined();
  });

  it("returns undefined for a matching route under the wrong method", () => {
    // Substrate-state observation: method-sensitivity prevents an
    // accidental dual-control bypass via method substitution -- a GET on
    // the monetization-config path is NOT a privileged endpoint.
    expect(
      isPrivilegedEndpoint("GET", "/api/v1/platform/monetization/config"),
    ).toBeUndefined();
  });

  it("returns undefined for a matching method but an unregistered route", () => {
    expect(isPrivilegedEndpoint("PATCH", "/api/v1/platform/unknown")).toBeUndefined();
  });
});
