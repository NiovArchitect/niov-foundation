// FILE: connector-activation-entitlement-gate.test.ts (unit)
// PURPOSE: Section 8 B5-α consumer wiring per ADR-0093 §5
//          Candidate A. Wires the soft-gate entitlement helper
//          into Section 4 connector binding creation per the
//          Founder-named "connector adapter invocation"
//          entitlement target.
//
//          The soft-gate posture lets orgs that pre-date the
//          Entitlement system continue to register bindings
//          (NO_ENTITLEMENT_ROW_BACKWARD_COMPAT); orgs WITH an
//          Entitlement row must own the capability pack
//          `connector_activation:<TYPE>` (or have the feature
//          entitled as true) for the registration to succeed.
//
// CONNECTS TO:
//   - apps/api/src/services/billing/entitlement-check.service.ts
//     (assertEntitledForOrgSoftGate)
//   - apps/api/src/services/connector/connector-binding.service.ts
//     (registerConnectorBindingForOrg)
//   - ADR-0093 §5 Candidate A / §10 always-allow invariants
//   - RULE 4 (audit before response) / RULE 13 (substrate-honest
//     soft rollout)

import { describe, expect, it, beforeEach, vi } from "vitest";

const {
  prismaMock,
  writeAuditEventMock,
  createConnectorBindingMock,
} = vi.hoisted(() => ({
  prismaMock: {
    entitlement: { findUnique: vi.fn() },
  },
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_event_id: "0".repeat(36) }),
  createConnectorBindingMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: writeAuditEventMock,
    createConnectorBinding: createConnectorBindingMock,
  };
});

import {
  assertEntitledForOrgSoftGate,
  setEntitlementLoaderForTests,
  type EntitlementRowShape,
} from "@niov/api";
import { registerConnectorBindingForOrg } from "../../apps/api/src/services/connector/connector-binding.service.js";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  setEntitlementLoaderForTests(null);
  prismaMock.entitlement.findUnique.mockReset();
  createConnectorBindingMock.mockReset();
});

function row(
  overrides: Partial<EntitlementRowShape> = {},
): EntitlementRowShape {
  return {
    org_entity_id: ORG_ID,
    plan_archetype_id: "team",
    feature_entitlements: {},
    capability_packs: [],
    ...overrides,
  };
}

function bindingRowFake() {
  return {
    binding_id: "33333333-3333-3333-3333-333333333333",
    org_entity_id: ORG_ID,
    type: "SLACK_READ",
    display_name: "Acme Slack",
    config: {},
    secret_ref: "SLACK_HMAC_SECRET",
    enabled: true,
    created_by_entity_id: ACTOR_ID,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    deleted_at: null,
  };
}

// =====================================================================
// 1. Soft-gate decision logic — assertEntitledForOrgSoftGate
// =====================================================================

describe("assertEntitledForOrgSoftGate — backward-compat for orgs with no Entitlement row", () => {
  it("returns NO_ENTITLEMENT_ROW_BACKWARD_COMPAT when no row exists and feature is non-base-tier", async () => {
    setEntitlementLoaderForTests(async () => null);
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("NO_ENTITLEMENT_ROW_BACKWARD_COMPAT");
  });

  it("does NOT emit ENTITLEMENT_CHECK_DENIED for the backward-compat path", async () => {
    setEntitlementLoaderForTests(async () => null);
    await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("still resolves base-tier features as ALWAYS_ALLOW_BASE_TIER even without a row", async () => {
    setEntitlementLoaderForTests(async () => null);
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "audit_baseline",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("ALWAYS_ALLOW_BASE_TIER");
  });
});

describe("assertEntitledForOrgSoftGate — orgs with Entitlement row evaluate normally", () => {
  it("returns CAPABILITY_PACK_OWNED when the row owns the connector pack", async () => {
    setEntitlementLoaderForTests(async () =>
      row({ capability_packs: ["SLACK_READ"] }),
    );
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("CAPABILITY_PACK_OWNED");
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns FEATURE_ENTITLED when feature_entitlements explicitly true", async () => {
    setEntitlementLoaderForTests(async () =>
      row({
        feature_entitlements: { "connector_activation:SLACK_READ": true },
      }),
    );
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("FEATURE_ENTITLED");
  });

  it("denies + emits ENTITLEMENT_CHECK_DENIED when the row exists but does not include the pack", async () => {
    setEntitlementLoaderForTests(async () =>
      row({ capability_packs: ["JIRA_CLOUD_READ"] }),
    );
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ENTITLEMENT_INSUFFICIENT");
      expect(r.reason_code).toBe("CAPABILITY_PACK_NOT_OWNED");
      expect(r.feature_id).toBe("connector_activation:SLACK_READ");
    }
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const audit = writeAuditEventMock.mock.calls[0]![0]!;
    expect(audit.event_type).toBe("ENTITLEMENT_CHECK_DENIED");
    expect(audit.outcome).toBe("DENIED");
    expect(audit.actor_entity_id).toBe(ACTOR_ID);
    expect(audit.target_entity_id).toBe(ORG_ID);
  });

  it("denies + emits ENTITLEMENT_CHECK_DENIED when feature_entitlements explicitly false", async () => {
    setEntitlementLoaderForTests(async () =>
      row({
        feature_entitlements: {
          "connector_activation:SLACK_READ": false,
        },
        capability_packs: ["SLACK_READ"],
      }),
    );
    const r = await assertEntitledForOrgSoftGate({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      feature_id: "connector_activation:SLACK_READ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason_code).toBe("FEATURE_NOT_ENTITLED");
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
  });
});

// =====================================================================
// 2. registerConnectorBindingForOrg consumer-tier wiring
// =====================================================================

describe("registerConnectorBindingForOrg — entitlement gate firing", () => {
  it("allows backward-compat (no Entitlement row) for a valid type", async () => {
    setEntitlementLoaderForTests(async () => null);
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
      },
    });
    expect(result.ok).toBe(true);
    expect(createConnectorBindingMock).toHaveBeenCalledTimes(1);
  });

  it("allows when org owns the connector_activation:SLACK_READ pack", async () => {
    setEntitlementLoaderForTests(async () =>
      row({ capability_packs: ["SLACK_READ"] }),
    );
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
      },
    });
    expect(result.ok).toBe(true);
  });

  it("denies with ENTITLEMENT_INSUFFICIENT + emits ENTITLEMENT_CHECK_DENIED when row exists but pack absent", async () => {
    setEntitlementLoaderForTests(async () =>
      row({ capability_packs: ["JIRA_CLOUD_READ"] }),
    );
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ENTITLEMENT_INSUFFICIENT");
      expect(result.reason_code).toBe("CAPABILITY_PACK_NOT_OWNED");
      expect(result.feature_id).toBe("connector_activation:SLACK_READ");
    }
    expect(createConnectorBindingMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledTimes(1);
    const audit = writeAuditEventMock.mock.calls[0]![0]!;
    expect(audit.event_type).toBe("ENTITLEMENT_CHECK_DENIED");
    expect(audit.details.feature_id).toBe(
      "connector_activation:SLACK_READ",
    );
  });

  it("does NOT emit ENTITLEMENT_CHECK_DENIED on backward-compat (no row) allow path", async () => {
    setEntitlementLoaderForTests(async () => null);
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
      },
    });
    const denied = writeAuditEventMock.mock.calls.find(
      (c) =>
        (c[0] as { event_type?: string }).event_type ===
        "ENTITLEMENT_CHECK_DENIED",
    );
    expect(denied).toBeUndefined();
  });

  it("still rejects validation errors BEFORE the entitlement check fires", async () => {
    setEntitlementLoaderForTests(async () => row());
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "",
        display_name: "Acme",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FIELD");
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("still rejects UNKNOWN_CONNECTOR_TYPE BEFORE the entitlement check fires", async () => {
    setEntitlementLoaderForTests(async () => row());
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "NOT_A_REAL_TYPE",
        display_name: "Acme",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNKNOWN_CONNECTOR_TYPE");
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("denial response does NOT leak secret_ref, config, or plan internals", async () => {
    setEntitlementLoaderForTests(async () =>
      row({
        plan_archetype_id: "team",
        capability_packs: ["JIRA_CLOUD_READ"],
      }),
    );
    const result = await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
        config: { webhook_url: "https://hooks.slack.com/secret" },
      },
    });
    expect(result.ok).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SLACK_HMAC_SECRET");
    expect(serialized).not.toContain("hooks.slack.com");
    expect(serialized).not.toContain("plan_archetype_id");
  });
});
