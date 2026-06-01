// FILE: govsec-7-tenant-isolation-guard.test.ts
// PURPOSE: Unit tests for GOVSEC.7 pure-function guards at
//          apps/api/src/services/govsec/tenant-isolation-guard.ts.
//          Verifies the 4 helper assertions against canonical
//          same-org / cross-org / orphan / department-filter
//          scenarios. Mirrors the GOVSEC.6 unit test pattern.
// CONNECTS TO: apps/api/src/services/govsec/tenant-isolation-guard.ts.

import { describe, expect, it } from "vitest";
import {
  assertDepartmentFilterAndOrgScope,
  assertNoCrossOrgEscalation,
  assertSameOrgForCapsule,
  assertSameOrgForHive,
  type CallerOrgContext,
} from "../../apps/api/src/services/govsec/tenant-isolation-guard";

const CALLER_ORG_A: CallerOrgContext = {
  entity_id: "person-a",
  org_id: "org-1",
};
const CALLER_ORG_B: CallerOrgContext = {
  entity_id: "person-b",
  org_id: "org-2",
};
const ORPHAN_CALLER: CallerOrgContext = {
  entity_id: "person-orphan",
  org_id: null,
};

describe("GOVSEC.7 — assertSameOrgForCapsule", () => {
  it("allows same-org capsule access", () => {
    const result = assertSameOrgForCapsule(CALLER_ORG_A, {
      capsule_id: "cap-1",
      wallet_org_id: "org-1",
    });
    expect(result.ok).toBe(true);
  });

  it("denies cross-org capsule access", () => {
    const result = assertSameOrgForCapsule(CALLER_ORG_A, {
      capsule_id: "cap-2",
      wallet_org_id: "org-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CALLER_ORG_MISMATCH_CAPSULE");
  });

  it("denies orphan caller (no org_id) reading any capsule", () => {
    const result = assertSameOrgForCapsule(ORPHAN_CALLER, {
      capsule_id: "cap-3",
      wallet_org_id: "org-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_CALLER_NO_ORG");
  });

  it("denies orphan capsule (wallet_org_id null)", () => {
    const result = assertSameOrgForCapsule(CALLER_ORG_A, {
      capsule_id: "cap-4",
      wallet_org_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_RESOURCE_NO_ORG");
  });
});

describe("GOVSEC.7 — assertSameOrgForHive", () => {
  it("allows same-org hive access", () => {
    const result = assertSameOrgForHive(CALLER_ORG_A, {
      hive_id: "hive-1",
      org_id: "org-1",
    });
    expect(result.ok).toBe(true);
  });

  it("denies cross-org hive access", () => {
    const result = assertSameOrgForHive(CALLER_ORG_A, {
      hive_id: "hive-2",
      org_id: "org-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CALLER_ORG_MISMATCH_HIVE");
  });

  it("denies orphan caller reading any hive", () => {
    const result = assertSameOrgForHive(ORPHAN_CALLER, {
      hive_id: "hive-3",
      org_id: "org-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_CALLER_NO_ORG");
  });

  it("denies orphan hive (org_id null)", () => {
    const result = assertSameOrgForHive(CALLER_ORG_A, {
      hive_id: "hive-4",
      org_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_RESOURCE_NO_ORG");
  });
});

describe("GOVSEC.7 — assertNoCrossOrgEscalation", () => {
  it("allows same-org escalation", () => {
    const result = assertNoCrossOrgEscalation({
      escalation_id: "esc-1",
      source_org_id: "org-1",
      target_org_id: "org-1",
    });
    expect(result.ok).toBe(true);
  });

  it("denies cross-org escalation", () => {
    const result = assertNoCrossOrgEscalation({
      escalation_id: "esc-2",
      source_org_id: "org-1",
      target_org_id: "org-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CROSS_ORG_ESCALATION_FORBIDDEN");
  });

  it("denies escalation with null source org", () => {
    const result = assertNoCrossOrgEscalation({
      escalation_id: "esc-3",
      source_org_id: null,
      target_org_id: "org-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_RESOURCE_NO_ORG");
  });

  it("denies escalation with null target org", () => {
    const result = assertNoCrossOrgEscalation({
      escalation_id: "esc-4",
      source_org_id: "org-1",
      target_org_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_RESOURCE_NO_ORG");
  });
});

describe("GOVSEC.7 — assertDepartmentFilterAndOrgScope", () => {
  it("allows same-org department filter", () => {
    const result = assertDepartmentFilterAndOrgScope({
      proposed_department_id: "dept-eng",
      caller_org_id: "org-1",
      department_resolved_org_id: "org-1",
    });
    expect(result.ok).toBe(true);
  });

  it("denies cross-org department filter", () => {
    const result = assertDepartmentFilterAndOrgScope({
      proposed_department_id: "dept-other-org-eng",
      caller_org_id: "org-1",
      department_resolved_org_id: "org-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.code).toBe("DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE");
  });

  it("denies orphan caller proposing a department filter", () => {
    const result = assertDepartmentFilterAndOrgScope({
      proposed_department_id: "dept-eng",
      caller_org_id: null,
      department_resolved_org_id: "org-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORPHAN_CALLER_NO_ORG");
  });

  it("denies unresolved department (deny-by-default)", () => {
    const result = assertDepartmentFilterAndOrgScope({
      proposed_department_id: "dept-unknown",
      caller_org_id: "org-1",
      department_resolved_org_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.code).toBe("DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE");
  });
});

describe("GOVSEC.7 — failure codes are closed-vocab", () => {
  it("never returns a code outside the documented enum", () => {
    const codes = new Set<string>();
    const samples = [
      assertSameOrgForCapsule(CALLER_ORG_A, {
        capsule_id: "c",
        wallet_org_id: "org-2",
      }),
      assertSameOrgForCapsule(ORPHAN_CALLER, {
        capsule_id: "c",
        wallet_org_id: "org-1",
      }),
      assertSameOrgForCapsule(CALLER_ORG_A, {
        capsule_id: "c",
        wallet_org_id: null,
      }),
      assertSameOrgForHive(CALLER_ORG_A, { hive_id: "h", org_id: "org-2" }),
      assertNoCrossOrgEscalation({
        escalation_id: "e",
        source_org_id: "org-1",
        target_org_id: "org-2",
      }),
      assertDepartmentFilterAndOrgScope({
        proposed_department_id: "d",
        caller_org_id: "org-1",
        department_resolved_org_id: "org-2",
      }),
    ];
    const allowed = new Set([
      "CALLER_ORG_MISMATCH_CAPSULE",
      "CALLER_ORG_MISMATCH_HIVE",
      "CROSS_ORG_ESCALATION_FORBIDDEN",
      "DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE",
      "ORPHAN_CALLER_NO_ORG",
      "ORPHAN_RESOURCE_NO_ORG",
    ]);
    for (const result of samples) {
      if (!result.ok) codes.add(result.code);
    }
    for (const code of codes) {
      expect(allowed.has(code)).toBe(true);
    }
    // Exercise all 6 failure codes at least once across the helpers
    const allCodesExercised = new Set<string>();
    const adversarial = [
      assertSameOrgForCapsule(CALLER_ORG_B, {
        capsule_id: "c",
        wallet_org_id: "org-1",
      }), // CALLER_ORG_MISMATCH_CAPSULE
      assertSameOrgForHive(CALLER_ORG_A, { hive_id: "h", org_id: "org-2" }), // CALLER_ORG_MISMATCH_HIVE
      assertNoCrossOrgEscalation({
        escalation_id: "e",
        source_org_id: "org-1",
        target_org_id: "org-2",
      }), // CROSS_ORG_ESCALATION_FORBIDDEN
      assertDepartmentFilterAndOrgScope({
        proposed_department_id: "d",
        caller_org_id: "org-1",
        department_resolved_org_id: "org-2",
      }), // DEPARTMENT_FILTER_OUT_OF_ORG_SCOPE
      assertSameOrgForCapsule(ORPHAN_CALLER, {
        capsule_id: "c",
        wallet_org_id: "org-1",
      }), // ORPHAN_CALLER_NO_ORG
      assertNoCrossOrgEscalation({
        escalation_id: "e",
        source_org_id: null,
        target_org_id: "org-1",
      }), // ORPHAN_RESOURCE_NO_ORG
    ];
    for (const result of adversarial) {
      if (!result.ok) allCodesExercised.add(result.code);
    }
    expect(allCodesExercised.size).toBe(6);
  });
});
