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
  it("contains exactly 4 LIVE Category (1) entries (Operations A + B + C + D)", () => {
    // Substrate-state verification: the runtime registry consumes ONLY
    // the LIVE entries per the three-artifact substrate split. Future
    // LIVE entries land here when their target sub-phase ships.
    //
    // Sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036 Sub-decision 6:
    // count grew 2 -> 4 with the addition of REGULATOR_ACCESS_GRANT
    // (Operation C; POST /api/v1/regulator/access-grants) and
    // REGULATOR_ACCESS_REVOKE (Operation D;
    // POST /api/v1/regulator/access-revocations). Both are
    // can_admin_niov-tier per Q8 LOCKED Option α (preserves the
    // Tension 3 Category (1) invariant canonical at substantive
    // register substantively).
    expect(PRIVILEGED_ENDPOINTS).toHaveLength(4);
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

  it("returns the matching entry for POST /api/v1/regulator/access-grants (Operation C)", () => {
    // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
    // Sub-decisions 6 + 7. REGULATOR_ACCESS_GRANT is can_admin_niov-tier
    // (preserves Tension 3 Category (1) invariant per Q8 LOCKED Option α).
    const entry = isPrivilegedEndpoint(
      "POST",
      "/api/v1/regulator/access-grants",
    );
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe("REGULATOR_ACCESS_GRANT");
    expect(entry?.authTier).toBe("can_admin_niov");
  });

  it("returns the matching entry for POST /api/v1/regulator/access-revocations (Operation D)", () => {
    // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
    // Sub-decision 6. REGULATOR_ACCESS_REVOKE is can_admin_niov-tier.
    // Audit-event-only revocation model per Q-D answer; revoke resolves
    // regulator_entity_id via LawfulBasis.audit_id chain (no durable
    // RegulatorAccessGrant table at sub-phase 5).
    const entry = isPrivilegedEndpoint(
      "POST",
      "/api/v1/regulator/access-revocations",
    );
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe("REGULATOR_ACCESS_REVOKE");
    expect(entry?.authTier).toBe("can_admin_niov");
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
