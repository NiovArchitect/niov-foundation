// FILE: proposed-action-promotion.test.ts (unit)
// PURPOSE: W5 Action Promotion Runtime unit tests per ADR-0086 §10.
//          Covers the catalog loader + the promotion service +
//          the body validator + the closed-vocab mapping. The 11
//          mandatory test scenarios from ADR-0086 §10 are exercised
//          where they can be exercised at the unit tier without
//          hitting Section 2's full DB-backed pipeline; the
//          DB-backed scenarios (happy promotion end-to-end +
//          PROPOSED_ACTION_REFERENCED emission to AuditEvent +
//          escalation lookup at dual-control route) are integration-
//          tier and live under tests/integration/.
// CONNECTS TO: apps/api/src/services/proposed-action/* via @niov/api.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ audit_event_id: "0".repeat(36) }),
  };
});

import {
  buildCreateActionInput,
  getProposedActionById,
  getProposedActionRegistry,
  listProposedActions,
  mapIntendedExternalSystemToActionType,
  PLAN_ARCHETYPE_VALUES,
  ACTOR_ROLE_VALUES,
  INTENDED_EXTERNAL_SYSTEM_VALUES,
  PROPOSED_ACTION_RETENTION_CLASS_VALUES,
  promoteProposedActionForCaller,
  setProposedActionRegistryForTests,
  validatePromoteBody,
  type ProposedActionEntry,
} from "@niov/api";
import * as actionService from "../../apps/api/src/services/action/action.service.js";

function fakeEntry(overrides: Partial<ProposedActionEntry> = {}): ProposedActionEntry {
  return {
    id: "proposed-action.fake-fixture.business.v1",
    plan_archetype_id: "business",
    actor_role: "AI_TEAMMATE",
    intended_external_system: "INTERNAL_ONLY",
    operation: "draft_followup_internal_only",
    governance_gates: {
      policy_decision_required: true,
      approval_chain_required: false,
      dual_control_required: false,
      audit_required: true,
    },
    retention_class: "STANDARD",
    name: "Fake fixture proposed action",
    proposed_action_state: "PROPOSED_NOT_AUTHORIZED",
    ...overrides,
  };
}

function fakeRegistry(...entries: ProposedActionEntry[]): ReadonlyMap<string, ProposedActionEntry> {
  const m = new Map<string, ProposedActionEntry>();
  for (const e of entries) m.set(e.id, e);
  return m;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setProposedActionRegistryForTests(null);
});

// =====================================================================
// 1. Catalog enum + closed-vocab discipline
// =====================================================================

describe("W5 catalog closed-vocab discipline", () => {
  it("exposes the canonical PlanArchetype enum", () => {
    expect(PLAN_ARCHETYPE_VALUES).toEqual([
      "starter-pilot",
      "team",
      "business",
      "enterprise",
    ]);
  });

  it("exposes the canonical ActorRole enum", () => {
    expect(ACTOR_ROLE_VALUES).toEqual([
      "DIGITAL_TWIN",
      "AI_TEAMMATE",
      "ADMIN_TWIN",
      "OPERATOR",
      "HIVE_COORDINATOR",
    ]);
  });

  it("exposes the canonical IntendedExternalSystem enum (6 vendors + INTERNAL_ONLY + OUTBOUND_WEBHOOK)", () => {
    expect(INTENDED_EXTERNAL_SYSTEM_VALUES).toEqual([
      "SLACK",
      "GOOGLE_WORKSPACE",
      "JIRA_CLOUD",
      "LINEAR",
      "GITHUB",
      "MICROSOFT_365",
      "INTERNAL_ONLY",
      "OUTBOUND_WEBHOOK",
    ]);
  });

  it("exposes the canonical proposed-action retention class enum", () => {
    expect(PROPOSED_ACTION_RETENTION_CLASS_VALUES).toEqual([
      "STANDARD",
      "AGGREGATE_ONLY",
      "EPHEMERAL",
    ]);
  });
});

// =====================================================================
// 2. Catalog loader DI hook (validates the registry override path the
//    rest of the unit tests depend on)
// =====================================================================

describe("setProposedActionRegistryForTests + getProposedActionById", () => {
  it("resolves an entry by catalog id", () => {
    const e = fakeEntry({ id: "proposed-action.unit-fixture.team.v1" });
    setProposedActionRegistryForTests(fakeRegistry(e));
    expect(getProposedActionById("proposed-action.unit-fixture.team.v1")).toBe(e);
  });

  it("returns null for unknown id", () => {
    setProposedActionRegistryForTests(fakeRegistry(fakeEntry()));
    expect(getProposedActionById("proposed-action.does-not-exist.team.v1")).toBeNull();
  });

  it("lists every entry in iteration order", () => {
    const a = fakeEntry({ id: "proposed-action.alpha.team.v1" });
    const b = fakeEntry({ id: "proposed-action.bravo.team.v1" });
    setProposedActionRegistryForTests(fakeRegistry(a, b));
    expect(listProposedActions().map((e) => e.id)).toEqual([
      "proposed-action.alpha.team.v1",
      "proposed-action.bravo.team.v1",
    ]);
  });
});

// =====================================================================
// 3. On-disk W4 catalog loads cleanly + the 18 known proposed actions
//    are all present at runtime.
// =====================================================================

describe("on-disk W4 catalog (docs/proposed-action/)", () => {
  it("loads without throwing and indexes ≥ 18 proposed actions across the 3 archetype files", () => {
    setProposedActionRegistryForTests(null);
    const reg = getProposedActionRegistry();
    expect(reg.size).toBeGreaterThanOrEqual(18);
  });

  it("every entry's proposed_action_state is PROPOSED_NOT_AUTHORIZED (W4 invariant)", () => {
    setProposedActionRegistryForTests(null);
    for (const e of getProposedActionRegistry().values()) {
      expect(e.proposed_action_state).toBe("PROPOSED_NOT_AUTHORIZED");
    }
  });

  it("every entry's governance_gates.audit_required is true (RULE 4 invariant)", () => {
    setProposedActionRegistryForTests(null);
    for (const e of getProposedActionRegistry().values()) {
      expect(e.governance_gates.audit_required).toBe(true);
    }
  });
});

// =====================================================================
// 4. Closed-vocab catalog → Section 2 ActionType mapping
// =====================================================================

describe("mapIntendedExternalSystemToActionType", () => {
  it("INTERNAL_ONLY → SEND_INTERNAL_NOTIFICATION", () => {
    expect(mapIntendedExternalSystemToActionType("INTERNAL_ONLY")).toBe(
      "SEND_INTERNAL_NOTIFICATION",
    );
  });

  it.each([
    "SLACK",
    "GOOGLE_WORKSPACE",
    "JIRA_CLOUD",
    "LINEAR",
    "GITHUB",
    "MICROSOFT_365",
    "OUTBOUND_WEBHOOK",
  ] as const)("%s → INVOKE_CONNECTOR", (system) => {
    expect(mapIntendedExternalSystemToActionType(system)).toBe("INVOKE_CONNECTOR");
  });
});

// =====================================================================
// 5. buildCreateActionInput — SAFE projection discipline
// =====================================================================

describe("buildCreateActionInput", () => {
  it("INTERNAL_ONLY entry produces SEND_INTERNAL_NOTIFICATION with caller-supplied runtime_data + catalog back-reference", () => {
    const entry = fakeEntry({
      intended_external_system: "INTERNAL_ONLY",
      name: "Send executive brief draft",
    });
    const ci = buildCreateActionInput(
      entry,
      {
        recipient_entity_id: "11111111-2222-3333-4444-555555555555",
        notification_class: "BRIEF",
        body_summary: "Tomorrow's executive brief",
      },
      "idem-key-001",
      undefined,
      null,
    );
    expect(ci.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(ci.idempotency_key).toBe("idem-key-001");
    expect(ci.payload_summary).toBe("Send executive brief draft");
    expect(ci.payload_redacted).toMatchObject({
      recipient_entity_id: "11111111-2222-3333-4444-555555555555",
      notification_class: "BRIEF",
      body_summary: "Tomorrow's executive brief",
      proposed_action_catalog_id: entry.id,
    });
  });

  it("connector-bound entry produces INVOKE_CONNECTOR with binding_id + invocation_payload pass-through + catalog back-reference", () => {
    const entry = fakeEntry({
      intended_external_system: "SLACK",
      operation: "channels.list",
      name: "Slack channels list (Stage 3)",
    });
    const ci = buildCreateActionInput(
      entry,
      {
        binding_id: "00000000-0000-0000-0000-000000000777",
        invocation_payload: { operation: "channels.list" },
      },
      "idem-key-002",
      undefined,
      undefined,
    );
    expect(ci.action_type).toBe("INVOKE_CONNECTOR");
    expect(ci.payload_redacted).toMatchObject({
      binding_id: "00000000-0000-0000-0000-000000000777",
      invocation_payload: { operation: "channels.list" },
      proposed_action_catalog_id: entry.id,
    });
  });

  it("honors caller-supplied payload_summary override", () => {
    const entry = fakeEntry({ name: "Default name" });
    const ci = buildCreateActionInput(
      entry,
      { recipient_entity_id: "11111111-2222-3333-4444-555555555555", notification_class: "X", body_summary: "y" },
      "k1",
      "Custom incident-specific summary",
      null,
    );
    expect(ci.payload_summary).toBe("Custom incident-specific summary");
  });

  it("forwards target_entity_id when provided", () => {
    const entry = fakeEntry();
    const ci = buildCreateActionInput(
      entry,
      { recipient_entity_id: "11111111-2222-3333-4444-555555555555", notification_class: "X", body_summary: "y" },
      "k1",
      undefined,
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(ci.target_entity_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("does NOT include target_entity_id when null", () => {
    const entry = fakeEntry();
    const ci = buildCreateActionInput(
      entry,
      { recipient_entity_id: "11111111-2222-3333-4444-555555555555", notification_class: "X", body_summary: "y" },
      "k1",
      undefined,
      null,
    );
    expect(ci.target_entity_id).toBeUndefined();
  });
});

// =====================================================================
// 6. validatePromoteBody — body shape + UNKNOWN_FIELD / INVALID_FIELD
// =====================================================================

describe("validatePromoteBody", () => {
  it("accepts a canonical valid body", () => {
    const r = validatePromoteBody({
      idempotency_key: "idem-key-101",
      runtime_data: { binding_id: "00000000-0000-0000-0000-000000000abc" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects UNKNOWN_FIELD", () => {
    const r = validatePromoteBody({
      idempotency_key: "x",
      runtime_data: {},
      surprise_field: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNKNOWN_FIELD");
      expect(r.unknown_fields).toContain("surprise_field");
    }
  });

  it("rejects empty idempotency_key", () => {
    const r = validatePromoteBody({ idempotency_key: "", runtime_data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("idempotency_key");
  });

  it("rejects > 200 char idempotency_key", () => {
    const r = validatePromoteBody({ idempotency_key: "x".repeat(201), runtime_data: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("idempotency_key");
  });

  it("rejects non-object runtime_data", () => {
    const r = validatePromoteBody({ idempotency_key: "k", runtime_data: "string" as unknown as Record<string, unknown> });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("runtime_data");
  });

  it("rejects array runtime_data", () => {
    const r = validatePromoteBody({ idempotency_key: "k", runtime_data: [] as unknown as Record<string, unknown> });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("runtime_data");
  });

  it("rejects malformed target_entity_id", () => {
    const r = validatePromoteBody({
      idempotency_key: "k",
      runtime_data: {},
      target_entity_id: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid_fields).toContain("target_entity_id");
  });
});

// =====================================================================
// 7. promoteProposedActionForCaller — control-flow + governance gate
//    discrimination
// =====================================================================

describe("promoteProposedActionForCaller", () => {
  it("404 PROPOSED_ACTION_NOT_FOUND when catalog id is unknown", async () => {
    setProposedActionRegistryForTests(fakeRegistry(fakeEntry()));
    const r = await promoteProposedActionForCaller(
      "caller-1",
      {
        catalog_id: "proposed-action.does-not-exist.team.v1",
        idempotency_key: "k1",
        runtime_data: {},
      },
      { dual_control_satisfied: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(404);
      expect(r.code).toBe("PROPOSED_ACTION_NOT_FOUND");
    }
  });

  it("409 DUAL_CONTROL_REQUIRED when catalog flags it and the plain route is taken", async () => {
    const entry = fakeEntry({
      governance_gates: {
        policy_decision_required: false,
        approval_chain_required: false,
        dual_control_required: true,
        audit_required: true,
      },
    });
    setProposedActionRegistryForTests(fakeRegistry(entry));
    const r = await promoteProposedActionForCaller(
      "caller-1",
      { catalog_id: entry.id, idempotency_key: "k1", runtime_data: {} },
      { dual_control_satisfied: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(409);
      expect(r.code).toBe("DUAL_CONTROL_REQUIRED");
      expect(r.message).toMatch(/promote-dual-control/);
    }
  });

  it("DUAL_CONTROL_REQUIRED does NOT fire when dual_control_satisfied=true (the wrapped route)", async () => {
    const entry = fakeEntry({
      intended_external_system: "INTERNAL_ONLY",
      governance_gates: {
        policy_decision_required: false,
        approval_chain_required: false,
        dual_control_required: true,
        audit_required: true,
      },
    });
    setProposedActionRegistryForTests(fakeRegistry(entry));
    const createSpy = vi
      .spyOn(actionService, "createActionForCaller")
      .mockResolvedValue({
        ok: true,
        httpStatus: 200,
        view: {
          action_id: "deadbeef-dead-beef-dead-beefdeadbeef",
          status: "PROPOSED",
          action_type: "SEND_INTERNAL_NOTIFICATION",
          risk_tier: "LOW",
          requires_approval: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as Parameters<typeof actionService.createActionForCaller>[1] extends never ? never : Awaited<ReturnType<typeof actionService.createActionForCaller>> extends { ok: true; view: infer V } ? V : never,
      });
    const r = await promoteProposedActionForCaller(
      "caller-1",
      {
        catalog_id: entry.id,
        idempotency_key: "k1",
        runtime_data: {
          recipient_entity_id: "11111111-2222-3333-4444-555555555555",
          notification_class: "BRIEF",
          body_summary: "x",
        },
      },
      { dual_control_satisfied: true },
    );
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    createSpy.mockRestore();
  });

  it("forwards Section 2's failure verbatim (e.g., policy DENIED) without re-emitting PROPOSED_ACTION_REFERENCED", async () => {
    const entry = fakeEntry({ intended_external_system: "INTERNAL_ONLY" });
    setProposedActionRegistryForTests(fakeRegistry(entry));
    const createSpy = vi
      .spyOn(actionService, "createActionForCaller")
      .mockResolvedValue({
        ok: false,
        httpStatus: 403,
        code: "POLICY_DENIED",
        message: "Forbidden by org policy",
      });
    const r = await promoteProposedActionForCaller(
      "caller-1",
      {
        catalog_id: entry.id,
        idempotency_key: "k1",
        runtime_data: {
          recipient_entity_id: "11111111-2222-3333-4444-555555555555",
          notification_class: "BRIEF",
          body_summary: "x",
        },
      },
      { dual_control_satisfied: false },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(403);
      expect(r.code).toBe("POLICY_DENIED");
    }
    createSpy.mockRestore();
  });

  it("on Section 2 success emits PROPOSED_ACTION_REFERENCED audit with SAFE details — no raw payload, no values, no secrets", async () => {
    const entry = fakeEntry({
      id: "proposed-action.safe-projection-test.business.v1",
      intended_external_system: "SLACK",
      operation: "channels.list",
      retention_class: "STANDARD",
      governance_gates: {
        policy_decision_required: true,
        approval_chain_required: false,
        dual_control_required: false,
        audit_required: true,
      },
    });
    setProposedActionRegistryForTests(fakeRegistry(entry));
    const createSpy = vi
      .spyOn(actionService, "createActionForCaller")
      .mockResolvedValue({
        ok: true,
        httpStatus: 200,
        view: {
          action_id: "feedface-feed-face-feed-facefeedface",
          status: "PROPOSED",
          action_type: "INVOKE_CONNECTOR",
          risk_tier: "LOW",
          requires_approval: true,
        } as unknown as Awaited<
          ReturnType<typeof actionService.createActionForCaller>
        > extends { ok: true; view: infer V }
          ? V
          : never,
      });
    const { writeAuditEvent } = await import("@niov/database");
    const wMock = writeAuditEvent as unknown as ReturnType<typeof vi.fn>;
    wMock.mockClear();
    await promoteProposedActionForCaller(
      "caller-1",
      {
        catalog_id: entry.id,
        idempotency_key: "k1",
        runtime_data: {
          binding_id: "00000000-0000-0000-0000-000000000aaa",
          invocation_payload: { operation: "channels.list" },
        },
      },
      { dual_control_satisfied: false },
    );
    expect(wMock).toHaveBeenCalledTimes(1);
    const call = wMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.event_type).toBe("PROPOSED_ACTION_REFERENCED");
    expect(call.outcome).toBe("SUCCESS");
    expect(call.actor_entity_id).toBe("caller-1");
    const details = call.details as Record<string, unknown>;
    expect(details.catalog_id).toBe(entry.id);
    expect(details.action_id).toBe("feedface-feed-face-feed-facefeedface");
    expect(details.plan_archetype_id).toBe("business");
    expect(details.actor_role).toBe("AI_TEAMMATE");
    expect(details.intended_external_system).toBe("SLACK");
    expect(details.operation).toBe("channels.list");
    expect(details.dual_control_required).toBe(false);
    expect(details.dual_control_satisfied).toBe(false);
    expect(details.approval_chain_required).toBe(false);
    expect(details.policy_decision_required).toBe(true);
    expect(details.retention_class).toBe("STANDARD");
    expect(details.section2_status).toBe("PROPOSED");
    // FORBIDDEN: raw payload content, vendor token, recipient PII, raw transcript.
    const serialized = JSON.stringify(call);
    expect(serialized).not.toMatch(/xoxb-/);
    expect(serialized).not.toMatch(/ya29\./);
    expect(serialized).not.toMatch(/Bearer /);
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(serialized).not.toMatch(/@outlook\.com/);
    expect(serialized).not.toMatch(/private_key/);
    // The audit details should NOT echo the runtime_data values back; the
    // catalog back-reference is what gets emitted, not the per-call payload.
    expect(details).not.toHaveProperty("binding_id");
    expect(details).not.toHaveProperty("invocation_payload");
    expect(details).not.toHaveProperty("recipient_entity_id");
    expect(details).not.toHaveProperty("body_summary");
    createSpy.mockRestore();
  });
});
