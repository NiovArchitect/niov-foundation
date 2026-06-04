/**
 * Unit tests for the pure helper portion of the Phase 5
 * ConnectorScopeGrant substrate. DB-touching path is exercised by
 * integration tests; here we cover findMatchingGrant which is a
 * pure function.
 */
import { describe, expect, it } from "vitest";
import type { ConnectorScopeGrant } from "@prisma/client";
import { findMatchingGrant } from "../../apps/api/src/services/connector-rails";

function grant(
  overrides: Partial<ConnectorScopeGrant>,
): ConnectorScopeGrant {
  return {
    grant_id: "g-1",
    org_entity_id: "org-1",
    connection_id: "conn-1",
    scope_type: "ORG",
    scope_id: null,
    allowed_operations: ["READ"],
    requires_employee_authority: true,
    requires_admin_approval: false,
    requires_dual_control: false,
    created_by_entity_id: "admin-1",
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: null,
    revoked_at: null,
    ...overrides,
  } as ConnectorScopeGrant;
}

describe("connector-rails / findMatchingGrant", () => {
  it("returns the grant when scope_type + operation match", () => {
    const g = grant({});
    expect(findMatchingGrant([g], "ORG", null, "READ")).toBe(g);
  });

  it("returns null when no operation matches", () => {
    const g = grant({ allowed_operations: ["READ"] });
    expect(findMatchingGrant([g], "ORG", null, "WRITE_EXECUTE")).toBeNull();
  });

  it("requires scope_id match for non-ORG grants", () => {
    const team = grant({ scope_type: "TEAM", scope_id: "team-1" });
    expect(findMatchingGrant([team], "TEAM", "team-1", "READ")).toBe(team);
    expect(findMatchingGrant([team], "TEAM", "team-2", "READ")).toBeNull();
  });

  it("ignores revoked grants", () => {
    const g = grant({ revoked_at: new Date() });
    expect(findMatchingGrant([g], "ORG", null, "READ")).toBeNull();
  });

  it("ignores expired grants", () => {
    const g = grant({ expires_at: new Date(Date.now() - 1000) });
    expect(findMatchingGrant([g], "ORG", null, "READ")).toBeNull();
  });

  it("accepts not-yet-expired grants", () => {
    const g = grant({ expires_at: new Date(Date.now() + 60_000) });
    expect(findMatchingGrant([g], "ORG", null, "READ")).toBe(g);
  });

  it("returns the first matching grant when multiple exist", () => {
    const a = grant({ grant_id: "a", allowed_operations: ["READ", "DRAFT"] });
    const b = grant({ grant_id: "b", allowed_operations: ["READ"] });
    expect(findMatchingGrant([a, b], "ORG", null, "READ")).toBe(a);
  });
});
