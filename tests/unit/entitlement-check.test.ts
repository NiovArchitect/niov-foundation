// FILE: entitlement-check.test.ts (unit)
// PURPOSE: B5-α Entitlement Check Runtime per ADR-0093 §5
//          Candidate A. Pure-function unit tests for the
//          decision logic + DI hook + always-allow base-tier
//          invariants + ENTITLEMENT_CHECK_DENIED audit emission.
// CONNECTS TO: apps/api/src/services/billing/entitlement-check.service.ts
//              via @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, writeAuditEventMock, getOrgEntityIdMock } = vi.hoisted(
  () => ({
    prismaMock: {
      entitlement: { findUnique: vi.fn() },
    },
    writeAuditEventMock: vi
      .fn()
      .mockResolvedValue({ audit_event_id: "0".repeat(36) }),
    getOrgEntityIdMock: vi.fn(),
  }),
);

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: writeAuditEventMock,
  };
});

vi.mock("../../apps/api/src/services/governance/org.js", () => ({
  getOrgEntityId: getOrgEntityIdMock,
}));

import {
  ALWAYS_ALLOW_BASE_TIER_FEATURES,
  assertEntitledForCaller,
  evaluateEntitlement,
  setEntitlementLoaderForTests,
  type EntitlementRowShape,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
  setEntitlementLoaderForTests(null);
});

function row(overrides: Partial<EntitlementRowShape> = {}): EntitlementRowShape {
  return {
    org_entity_id: "11111111-1111-1111-1111-111111111111",
    plan_archetype_id: "team",
    feature_entitlements: {},
    capability_packs: [],
    ...overrides,
  };
}

// =====================================================================
// 1. Always-allow base-tier invariants per ADR-0093 §10
// =====================================================================

describe("ALWAYS_ALLOW_BASE_TIER_FEATURES — ADR-0093 §10 invariants", () => {
  it("never denies the 10 always-allow base-tier features even when org has no Entitlement row", () => {
    const features = [
      "audit_baseline",
      "audit_chain_read",
      "audit_verify_chain_self_scope",
      "DMW_baseline_safety",
      "DMW_auto_provisioning",
      "Foundation_safety_baseline",
      "lawful_basis_attestation",
      "soft_delete",
      "permission_revocation",
      "voice_intent_envelope_vf4",
    ];
    for (const f of features) {
      const r = evaluateEntitlement(f, null, "org-1");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.reason).toBe("ALWAYS_ALLOW_BASE_TIER");
    }
  });

  it("the always-allow set is exactly 10 features (canonical lock per ADR-0093 §10)", () => {
    expect(ALWAYS_ALLOW_BASE_TIER_FEATURES.size).toBe(10);
  });

  it("never denies an always-allow feature even when the Entitlement row explicitly marks it false (defense-in-depth invariant per RULE 0)", () => {
    const r = evaluateEntitlement(
      "DMW_baseline_safety",
      row({ feature_entitlements: { DMW_baseline_safety: false } }),
      "org-1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("ALWAYS_ALLOW_BASE_TIER");
  });
});

// =====================================================================
// 2. Pure decision logic — explicit feature_entitlements
// =====================================================================

describe("evaluateEntitlement — explicit feature_entitlements decision", () => {
  it("entitled=true → ok with FEATURE_ENTITLED reason", () => {
    const r = evaluateEntitlement(
      "workflow_recommendations_basic",
      row({ feature_entitlements: { workflow_recommendations_basic: true } }),
      "org-1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("FEATURE_ENTITLED");
  });

  it("entitled=false → ok=false with reason_code FEATURE_NOT_ENTITLED + httpStatus 403", () => {
    const r = evaluateEntitlement(
      "workflow_stage_4_execution",
      row({
        feature_entitlements: { workflow_stage_4_execution: false },
      }),
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ENTITLEMENT_INSUFFICIENT");
      expect(r.httpStatus).toBe(403);
      expect(r.reason_code).toBe("FEATURE_NOT_ENTITLED");
      expect(r.feature_id).toBe("workflow_stage_4_execution");
    }
  });

  it("no Entitlement row → ok=false with reason_code NO_ENTITLEMENT_ROW", () => {
    const r = evaluateEntitlement(
      "workflow_recommendations_basic",
      null,
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ENTITLEMENT_INSUFFICIENT");
      expect(r.reason_code).toBe("NO_ENTITLEMENT_ROW");
      expect(r.org_entity_id).toBe("org-1");
    }
  });
});

// =====================================================================
// 3. Capability-pack scoping
// =====================================================================

describe("evaluateEntitlement — capability_packs scoping for prefix:pack_id features", () => {
  it("feature_id=connector_activation:SLACK_READ with pack pack.collaboration owned → CAPABILITY_PACK_OWNED", () => {
    const r = evaluateEntitlement(
      "connector_activation:SLACK_READ",
      row({ capability_packs: ["pack.collaboration", "SLACK_READ"] }),
      "org-1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("CAPABILITY_PACK_OWNED");
  });

  it("feature_id=connector_activation:SLACK_READ without SLACK_READ pack → CAPABILITY_PACK_NOT_OWNED", () => {
    const r = evaluateEntitlement(
      "connector_activation:SLACK_READ",
      row({ capability_packs: ["pack.collaboration"] }),
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason_code).toBe("CAPABILITY_PACK_NOT_OWNED");
      expect(r.feature_id).toBe("connector_activation:SLACK_READ");
    }
  });

  it("feature_id with no colon scope + not in feature_entitlements → FEATURE_NOT_ENTITLED", () => {
    const r = evaluateEntitlement(
      "advanced_analytics",
      row({ capability_packs: [] }),
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe("FEATURE_NOT_ENTITLED");
  });

  it("feature_id with trailing colon (malformed) does NOT match capability_packs", () => {
    const r = evaluateEntitlement(
      "connector_activation:",
      row({ capability_packs: [""] }),
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe("FEATURE_NOT_ENTITLED");
  });

  it("explicit feature_entitlements override capability_packs (entitled=false wins even if pack is owned)", () => {
    const r = evaluateEntitlement(
      "connector_activation:SLACK_READ",
      row({
        feature_entitlements: { "connector_activation:SLACK_READ": false },
        capability_packs: ["SLACK_READ"],
      }),
      "org-1",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe("FEATURE_NOT_ENTITLED");
  });
});

// =====================================================================
// 4. assertEntitledForCaller — IO orchestration + audit emission
// =====================================================================

describe("assertEntitledForCaller — IO orchestration", () => {
  it("resolves caller org, loads via DI hook, returns entitled-true without writing audit", async () => {
    setEntitlementLoaderForTests(async (org_entity_id) => {
      expect(org_entity_id).toBe("org-1");
      return row({
        org_entity_id: "org-1",
        feature_entitlements: { Dandelion_preview_read_only: true },
      });
    });
    getOrgEntityIdMock.mockResolvedValue("org-1");
    const r = await assertEntitledForCaller(
      "caller-1",
      "Dandelion_preview_read_only",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("FEATURE_ENTITLED");
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("emits ENTITLEMENT_CHECK_DENIED audit on denial with SAFE details (no feature payload / pricing / pack contents)", async () => {
    setEntitlementLoaderForTests(async () => row({ plan_archetype_id: "team" }));
    getOrgEntityIdMock.mockResolvedValue("org-1");
    const r = await assertEntitledForCaller(
      "caller-1",
      "workflow_stage_4_execution",
    );
    expect(r.ok).toBe(false);
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(c.event_type).toBe("ENTITLEMENT_CHECK_DENIED");
    expect(c.outcome).toBe("DENIED");
    expect(c.actor_entity_id).toBe("caller-1");
    expect(c.target_entity_id).toBe("org-1");
    const det = c.details as Record<string, unknown>;
    expect(det.org_entity_id).toBe("org-1");
    expect(det.feature_id).toBe("workflow_stage_4_execution");
    expect(det.plan_archetype_id).toBe("team");
    expect(det.reason_code).toBe("FEATURE_NOT_ENTITLED");
    // Forbidden in audit details: no feature payload, no pricing, no pack contents
    const serialized = JSON.stringify(det);
    expect(serialized).not.toMatch(/price/i);
    expect(serialized).not.toMatch(/usd/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/capability_packs/);
  });

  it("emits ENTITLEMENT_CHECK_DENIED with reason_code NO_ENTITLEMENT_ROW when org has no Entitlement row", async () => {
    setEntitlementLoaderForTests(async () => null);
    getOrgEntityIdMock.mockResolvedValue("org-1");
    const r = await assertEntitledForCaller("caller-1", "workflow_stage_4_execution");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe("NO_ENTITLEMENT_ROW");
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const c = writeAuditEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const det = c.details as Record<string, unknown>;
    expect(det.reason_code).toBe("NO_ENTITLEMENT_ROW");
    expect(det.plan_archetype_id).toBeNull();
  });

  it("does NOT emit audit on always-allow base-tier feature even when org has no Entitlement row (RULE 0 + ADR-0093 §10)", async () => {
    setEntitlementLoaderForTests(async () => null);
    getOrgEntityIdMock.mockResolvedValue("org-1");
    const r = await assertEntitledForCaller("caller-1", "audit_baseline");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("ALWAYS_ALLOW_BASE_TIER");
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});
