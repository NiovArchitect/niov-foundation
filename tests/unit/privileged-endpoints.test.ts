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
  canonicalDualControlPayload,
  isPrivilegedEndpoint,
  type PrivilegedEndpoint,
} from "@niov/api";

describe("PRIVILEGED_ENDPOINTS registry", () => {
  it("contains exactly 9 LIVE entries (Operations A + B + C + D + E + F + G + H + I)", () => {
    // Substrate-state verification: the runtime registry consumes ONLY
    // the LIVE entries per the three-artifact substrate split. Future
    // LIVE entries land here when their target sub-phase ships.
    //
    // Lineage:
    //   2 -> 4 at CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per
    //     ADR-0036 Sub-decision 6 (REGULATOR_ACCESS_GRANT +
    //     REGULATOR_ACCESS_REVOKE; both can_admin_niov per Q8 LOCKED).
    //   4 -> 5 at this slice [ADR-0057-ORG-ACTION-POLICY-UPDATE-
    //     PRIVILEGED-BINDING] per ADR-0057 §7 — Operation E
    //     ORG_ACTION_POLICY_UPDATE (PUT /api/v1/org/action-policies);
    //     can_admin_org-tier; the FIRST LIVE entry to exercise
    //     Class B at the integration tier.
    //   5 -> 6 at [FOUNDATION-D6-IMPL-DUAL-CONTROL-WIRING] per
    //     ADR-0080 §23 Amendment 7 + ADR-0026 — Operation F
    //     ORG_DANDELION_ENTERPRISE_ACTIVATION (POST /api/v1/org/
    //     dandelion/activate/enterprise); can_admin_org-tier; the
    //     SECOND LIVE Class B entry. Converts the truthfully-recorded
    //     DUAL-CONTROL design-intent from D6 enterprise (steps 10 + 11
    //     emit *_DUAL_CONTROL audit literals) into actual approval-
    //     flow enforcement at runtime.
    //   6 -> 7 at [W5-ACTION-PROMOTION-RUNTIME] per ADR-0086 §4 —
    //     Operation G PROPOSED_ACTION_DUAL_CONTROL_PROMOTION (POST
    //     /api/v1/proposed-actions/:catalog_id/promote-dual-control);
    //     can_admin_org-tier; the THIRD LIVE Class B entry. The
    //     dual-control-wrapped W5 promotion route through which a W4
    //     proposed action whose `governance_gates.dual_control_required`
    //     flag is true is promoted into a Section 2 Action. The plain
    //     POST /api/v1/proposed-actions/:catalog_id/promote route is
    //     NOT in the registry — its service path returns
    //     409 DUAL_CONTROL_REQUIRED when the catalog flags it.
    //   7 -> 9 at [PLATFORM-AUTHORITY] — Operations H + I
    //     PLATFORM_ADMIN_NIOV_GRANT / PLATFORM_ADMIN_NIOV_REVOKE
    //     (POST /api/v1/platform/admin-niov-grants /
    //     /admin-niov-revocations); both can_admin_niov-tier, both
    //     payload-bound + single-use (redact: [] — nothing in the body
    //     is secret, everything binds). The governed successor to the
    //     founder bootstrap script (which stays zero-root only).
    expect(PRIVILEGED_ENDPOINTS).toHaveLength(9);
  });

  it("has no duplicate (method, route) entries", () => {
    const keys = PRIVILEGED_ENDPOINTS.map((e) => `${e.method} ${e.route}`);
    expect(new Set(keys).size).toBe(PRIVILEGED_ENDPOINTS.length);
  });

  it("has no duplicate action-descriptor types", () => {
    const types = PRIVILEGED_ENDPOINTS.map((e) => e.actionDescriptor.type);
    expect(new Set(types).size).toBe(PRIVILEGED_ENDPOINTS.length);
  });

  it("entries use only the canonical authTier values (can_admin_niov | can_admin_org)", () => {
    // Substrate-state observation: the universal can_admin_niov
    // invariant from sub-phase 5 [SUB-BOX-3-ROUTES] is no longer
    // universal after ADR-0057 §7 Operation E lands the first
    // can_admin_org-tier entry. The runtime registry now mixes
    // Class B (can_admin_org) + Class C (can_admin_niov) entries
    // per ADR-0026 Amendment 1 §3 target-resolution order, with the
    // dual-control middleware handling each tier deterministically.
    const allCanonical = PRIVILEGED_ENDPOINTS.every(
      (e: PrivilegedEndpoint) =>
        e.authTier === "can_admin_niov" || e.authTier === "can_admin_org",
    );
    expect(allCanonical).toBe(true);
  });

  it("Class B (can_admin_org) entries are the org-admin-tier surfaces (currently exactly 3: ORG_ACTION_POLICY_UPDATE + ORG_DANDELION_ENTERPRISE_ACTIVATION + PROPOSED_ACTION_DUAL_CONTROL_PROMOTION)", () => {
    const classB = PRIVILEGED_ENDPOINTS.filter(
      (e: PrivilegedEndpoint) => e.authTier === "can_admin_org",
    );
    expect(classB).toHaveLength(3);
    const classBTypes = classB.map((e) => e.actionDescriptor.type).sort();
    expect(classBTypes).toEqual([
      "ORG_ACTION_POLICY_UPDATE",
      "ORG_DANDELION_ENTERPRISE_ACTIVATION",
      "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION",
    ]);
    // Verify each entry's (method, route) tuple
    const policyEntry = classB.find(
      (e) => e.actionDescriptor.type === "ORG_ACTION_POLICY_UPDATE",
    );
    expect(policyEntry?.method).toBe("PUT");
    expect(policyEntry?.route).toBe("/api/v1/org/action-policies");
    const enterpriseEntry = classB.find(
      (e) =>
        e.actionDescriptor.type === "ORG_DANDELION_ENTERPRISE_ACTIVATION",
    );
    expect(enterpriseEntry?.method).toBe("POST");
    expect(enterpriseEntry?.route).toBe(
      "/api/v1/org/dandelion/activate/enterprise",
    );
    const promoteEntry = classB.find(
      (e) =>
        e.actionDescriptor.type === "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION",
    );
    expect(promoteEntry?.method).toBe("POST");
    expect(promoteEntry?.route).toBe(
      "/api/v1/proposed-actions/:catalog_id/promote-dual-control",
    );
  });

  it("Class C (can_admin_niov) entries remain the platform-admin-tier surfaces (currently exactly 6)", () => {
    const classC = PRIVILEGED_ENDPOINTS.filter(
      (e: PrivilegedEndpoint) => e.authTier === "can_admin_niov",
    );
    expect(classC).toHaveLength(6);
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
    // [G1-DUAL-CONTROL] org creation is payload-bound + single-use with
    // admin_password redacted from hash, metadata, and audit.
    expect(entry?.payloadBinding).toEqual({ redact: ["admin_password"] });
  });

  it("[G1-DUAL-CONTROL] the payload-bound set is exactly org creation + the platform-authority pair (everything else keeps Pattern-5 standing-approval semantics)", () => {
    const bound = PRIVILEGED_ENDPOINTS.filter(
      (e) => e.payloadBinding !== undefined,
    );
    expect(bound.map((e) => e.actionDescriptor.type)).toEqual([
      "PLATFORM_ORG_CREATION",
      "PLATFORM_ADMIN_NIOV_GRANT",
      "PLATFORM_ADMIN_NIOV_REVOKE",
    ]);
    // The authority pair binds EVERYTHING (no secrets in the body): an
    // approval can never be replayed against a different target/reason.
    for (const e of bound) {
      if (e.actionDescriptor.type !== "PLATFORM_ORG_CREATION") {
        expect(e.payloadBinding).toEqual({ redact: [] });
      }
    }
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

  it("returns the matching entry for PUT /api/v1/org/action-policies (Operation E)", () => {
    // ADR-0057 §7 Operation E -- the FIRST LIVE entry to exercise
    // Class B (can_admin_org) at the integration tier. The PUT method
    // is the canonical upsert binding for the (org_entity_id,
    // action_type, risk_tier) UNIQUE tuple per ADR-0057 §2.
    const entry = isPrivilegedEndpoint("PUT", "/api/v1/org/action-policies");
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe("ORG_ACTION_POLICY_UPDATE");
    expect(entry?.authTier).toBe("can_admin_org");
  });

  it("returns the matching entry for POST /api/v1/org/dandelion/activate/enterprise (Operation F)", () => {
    // [FOUNDATION-D6-IMPL-DUAL-CONTROL-WIRING] per ADR-0080 §23
    // Amendment 7 + ADR-0026. The SECOND LIVE Class B entry.
    // Converts the truthfully-recorded DUAL-CONTROL design-intent
    // from D6 enterprise (steps 10 + 11 emit *_DUAL_CONTROL audit
    // literals) into actual approval-flow enforcement at runtime.
    const entry = isPrivilegedEndpoint(
      "POST",
      "/api/v1/org/dandelion/activate/enterprise",
    );
    expect(entry).toBeDefined();
    expect(entry?.actionDescriptor.type).toBe(
      "ORG_DANDELION_ENTERPRISE_ACTIVATION",
    );
    expect(entry?.authTier).toBe("can_admin_org");
  });

  it("non-enterprise activation routes are NOT privileged endpoints (starter-pilot / team / business stay single-actor)", () => {
    // The starter-pilot / team / business archetype catalogs do not
    // carry *_DUAL_CONTROL audit literals; their routes intentionally
    // remain single-actor. Only the enterprise archetype carries the
    // dual-control design-intent at the catalog tier per ADR-0080
    // §23 Amendment 7.
    expect(
      isPrivilegedEndpoint("POST", "/api/v1/org/dandelion/activate"),
    ).toBeUndefined();
    expect(
      isPrivilegedEndpoint("POST", "/api/v1/org/dandelion/activate/team"),
    ).toBeUndefined();
    expect(
      isPrivilegedEndpoint(
        "POST",
        "/api/v1/org/dandelion/activate/business",
      ),
    ).toBeUndefined();
  });

  it("GET /api/v1/org/action-policies is NOT a privileged endpoint (only PUT is)", () => {
    // Substrate-state observation: per ADR-0057 §9 the GET surface
    // is read-only and bypasses the dual-control middleware; only
    // PUT carries the dual-control binding because PUT changes the
    // autonomy contract.
    expect(
      isPrivilegedEndpoint("GET", "/api/v1/org/action-policies"),
    ).toBeUndefined();
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

// [G1-DUAL-CONTROL] The canonical payload hash that binds a dual-control
// approval to one exact operation payload (secrets redacted).
describe("canonicalDualControlPayload", () => {
  it("is independent of JSON field order (canonical key-sorted serialization)", () => {
    const a = canonicalDualControlPayload(
      { company_name: "Acme", admin_email: "a@b.c", industry: "TECH" },
      [],
    );
    const b = canonicalDualControlPayload(
      { industry: "TECH", admin_email: "a@b.c", company_name: "Acme" },
      [],
    );
    expect(a.payload_hash).toBe(b.payload_hash);
    expect(a.payload_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when any bound field changes", () => {
    const a = canonicalDualControlPayload({ company_name: "Acme" }, []);
    const b = canonicalDualControlPayload({ company_name: "Acme2" }, []);
    expect(a.payload_hash).not.toBe(b.payload_hash);
  });

  it("redacted fields never affect the hash; their NAMES are reported, values never leave the function (no body echo -- ADR-0057 §10)", () => {
    const a = canonicalDualControlPayload(
      { company_name: "Acme", admin_password: "secret-one" },
      ["admin_password"],
    );
    const b = canonicalDualControlPayload(
      { company_name: "Acme", admin_password: "totally-different" },
      ["admin_password"],
    );
    expect(a.payload_hash).toBe(b.payload_hash);
    expect(a.redacted_fields).toEqual(["admin_password"]);
    expect(JSON.stringify(a)).not.toContain("secret-one");
    // The return shape carries hash + field names ONLY -- never the body.
    expect(Object.keys(a).sort()).toEqual(["payload_hash", "redacted_fields"]);
  });

  it("non-object bodies bind as the empty payload", () => {
    const empty = canonicalDualControlPayload({}, []);
    expect(canonicalDualControlPayload(undefined, []).payload_hash).toBe(
      empty.payload_hash,
    );
    expect(canonicalDualControlPayload("a-string", []).payload_hash).toBe(
      empty.payload_hash,
    );
    expect(canonicalDualControlPayload([1, 2], []).payload_hash).toBe(
      empty.payload_hash,
    );
  });

  it("nested objects are canonicalized recursively; arrays keep order", () => {
    const a = canonicalDualControlPayload(
      { nested: { x: 1, y: [2, 3] }, top: "v" },
      [],
    );
    const b = canonicalDualControlPayload(
      { top: "v", nested: { y: [2, 3], x: 1 } },
      [],
    );
    const c = canonicalDualControlPayload(
      { top: "v", nested: { y: [3, 2], x: 1 } },
      [],
    );
    expect(a.payload_hash).toBe(b.payload_hash);
    expect(a.payload_hash).not.toBe(c.payload_hash);
  });
});
