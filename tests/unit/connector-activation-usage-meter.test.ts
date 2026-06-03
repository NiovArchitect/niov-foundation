// FILE: connector-activation-usage-meter.test.ts (unit)
// PURPOSE: Section 8 B6-α consumer wiring per ADR-0093 §5
//          Candidate C. Wires the usage-meter foundation into
//          Section 4 connector binding creation so successful
//          activations increment the org's running counter
//          against `meter.connector-activations.v1`.
//
//          Telemetry-tier — meter failure MUST NOT fail the
//          binding creation. USAGE_METER_RECORDED audit fires
//          inside recordUsageForOrg on success.
//
// CONNECTS TO:
//   - apps/api/src/services/billing/usage-meter.service.ts
//   - apps/api/src/services/connector/connector-binding.service.ts
//   - ADR-0093 §5 Candidate C + §7 + §10
//   - RULE 4 (audit before response)
//   - ADR-0042 §Q-γ.1 clean-transition

import { describe, expect, it, beforeEach, vi } from "vitest";

const {
  prismaMock,
  writeAuditEventMock,
  createConnectorBindingMock,
} = vi.hoisted(() => ({
  prismaMock: {
    entitlement: { findUnique: vi.fn() },
    usageMeter: { upsert: vi.fn() },
  },
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_id: "0".repeat(36) }),
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

import { setEntitlementLoaderForTests } from "@niov/api";
import { registerConnectorBindingForOrg } from "../../apps/api/src/services/connector/connector-binding.service.js";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  setEntitlementLoaderForTests(async () => null); // backward-compat path
  prismaMock.usageMeter.upsert.mockReset();
  createConnectorBindingMock.mockReset();
  writeAuditEventMock.mockResolvedValue({ audit_id: "0".repeat(36) });
});

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

function usageMeterRowFake(value: bigint) {
  return {
    org_entity_id: ORG_ID,
    meter_id: "meter.connector-activations.v1",
    current_value: value,
    last_recorded_at: new Date(),
  };
}

// =====================================================================
// 1. Success path emits USAGE_METER_RECORDED + ADMIN_ACTION audits
// =====================================================================

describe("connector activation usage meter — success path telemetry", () => {
  it("emits USAGE_METER_RECORDED audit after successful binding creation", async () => {
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    prismaMock.usageMeter.upsert.mockResolvedValue(
      usageMeterRowFake(1n),
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

    expect(result.ok).toBe(true);
    // Two audit events should fire: ADMIN_ACTION (binding) + USAGE_METER_RECORDED.
    expect(writeAuditEventMock).toHaveBeenCalledTimes(2);
    const usageAudit = writeAuditEventMock.mock.calls.find(
      (c) =>
        (c[0] as { event_type?: string }).event_type ===
        "USAGE_METER_RECORDED",
    );
    expect(usageAudit).toBeDefined();
    const audit = usageAudit![0]! as {
      event_type: string;
      outcome: string;
      target_entity_id?: string;
      details: { meter_id: string; delta: number };
    };
    expect(audit.event_type).toBe("USAGE_METER_RECORDED");
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.target_entity_id).toBe(ORG_ID);
    expect(audit.details.meter_id).toBe("meter.connector-activations.v1");
    expect(audit.details.delta).toBe(1);
  });

  it("invokes prisma.usageMeter.upsert with composite PK + increment 1", async () => {
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    prismaMock.usageMeter.upsert.mockResolvedValue(
      usageMeterRowFake(1n),
    );

    await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "SLACK_READ",
        display_name: "Acme Slack",
        secret_ref: "SLACK_HMAC_SECRET",
      },
    });

    expect(prismaMock.usageMeter.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prismaMock.usageMeter.upsert.mock.calls[0]![0]!;
    expect(upsertArg.where.org_entity_id_meter_id).toEqual({
      org_entity_id: ORG_ID,
      meter_id: "meter.connector-activations.v1",
    });
    expect(upsertArg.update.current_value).toEqual({ increment: 1n });
    expect(upsertArg.create.current_value).toBe(1n);
  });

  it("uses canonical meter_id pattern `meter.connector-activations.v1`", async () => {
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    prismaMock.usageMeter.upsert.mockResolvedValue(
      usageMeterRowFake(5n),
    );

    await registerConnectorBindingForOrg({
      org_entity_id: ORG_ID,
      actor_entity_id: ACTOR_ID,
      body: {
        type: "JIRA_CLOUD_READ",
        display_name: "Acme Jira",
        secret_ref: "JIRA_HMAC_SECRET",
      },
    });

    const upsertArg = prismaMock.usageMeter.upsert.mock.calls[0]![0]!;
    expect(upsertArg.where.org_entity_id_meter_id.meter_id).toMatch(
      /^meter\.[a-z][a-z0-9-]*\.v[0-9]+$/,
    );
  });
});

// =====================================================================
// 2. Failure isolation — telemetry MUST NOT fail binding creation
// =====================================================================

describe("connector activation usage meter — telemetry failure isolation", () => {
  it("returns ok:true binding view even when prisma.usageMeter.upsert throws", async () => {
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    prismaMock.usageMeter.upsert.mockRejectedValue(
      new Error("simulated db failure"),
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

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.binding_id).toBe(
        "33333333-3333-3333-3333-333333333333",
      );
    }
  });

  it("returns ok:true binding view even when USAGE_METER_RECORDED audit throws after upsert succeeds", async () => {
    createConnectorBindingMock.mockResolvedValue(bindingRowFake());
    prismaMock.usageMeter.upsert.mockResolvedValue(
      usageMeterRowFake(1n),
    );
    // First audit (ADMIN_ACTION binding) resolves; second audit
    // (USAGE_METER_RECORDED) throws.
    writeAuditEventMock
      .mockReset()
      .mockResolvedValueOnce({ audit_id: "0".repeat(36) })
      .mockRejectedValueOnce(new Error("simulated audit failure"));

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
});

// =====================================================================
// 3. Skip on failure paths — never count failed activations
// =====================================================================

describe("connector activation usage meter — skip when binding does not land", () => {
  it("does NOT increment the meter when validation fails (INVALID_FIELD)", async () => {
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
    expect(prismaMock.usageMeter.upsert).not.toHaveBeenCalled();
  });

  it("does NOT increment the meter when entitlement check denies", async () => {
    setEntitlementLoaderForTests(async () => ({
      org_entity_id: ORG_ID,
      plan_archetype_id: "team",
      feature_entitlements: {},
      capability_packs: ["JIRA_CLOUD_READ"],
    }));

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
    if (!result.ok) expect(result.code).toBe("ENTITLEMENT_INSUFFICIENT");
    expect(prismaMock.usageMeter.upsert).not.toHaveBeenCalled();
  });

  it("does NOT increment the meter when persistence throws DUPLICATE_DISPLAY_NAME", async () => {
    createConnectorBindingMock.mockRejectedValue(
      new Error("Unique constraint failed P2002"),
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
    if (!result.ok) expect(result.code).toBe("DUPLICATE_DISPLAY_NAME");
    expect(prismaMock.usageMeter.upsert).not.toHaveBeenCalled();
  });
});
