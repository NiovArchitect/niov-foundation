// FILE: python-client.test.ts (unit)
// PURPOSE: ADR-0090 §10 PY4 TypeScript client wrapper unit tests.
//          Covers envelope validation per ADR-0090 §4,
//          no-leak assertion validation per ADR-0090 §8, audit
//          emission posture per ADR-0090 §7 (ADMIN_ACTION +
//          details.action discriminator), and the fixture
//          transport's deterministic outputs.
// CONNECTS TO: apps/api/src/services/python/python-client.ts via
//              @niov/api.

import { describe, expect, it, beforeEach, vi } from "vitest";

const { writeAuditEventMock } = vi.hoisted(() => ({
  writeAuditEventMock: vi
    .fn()
    .mockResolvedValue({ audit_event_id: "0".repeat(36) }),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeAuditEvent: writeAuditEventMock,
  };
});

import {
  FixturePythonTransport,
  PYTHON_PURPOSE_VALUES,
  PythonIntelligenceClient,
  validateEnvelope,
  validateNoLeakAssertions,
  type PythonComputationEnvelope,
  type PythonTransport,
} from "@niov/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const CALLER = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";
const REQ = "33333333-3333-3333-3333-333333333333";

function fullNoLeak() {
  return {
    no_employee_scoring: true,
    no_manager_surveillance: true,
    no_psychological_inference: true,
    no_protected_attribute_inference: true,
    no_political_inference: true,
    no_health_inference: true,
    no_relationship_inference: true,
  } as const;
}

function fixtureEnvelope(
  overrides: Partial<PythonComputationEnvelope> = {},
): PythonComputationEnvelope {
  return {
    envelope_version: "1.0",
    request_id: REQ,
    caller_entity_id: CALLER,
    org_entity_id: ORG,
    purpose: "HIVE_SIGNAL_SCORING_FIXTURE",
    consent_proof: "consent-chain-ref-fixture",
    scope_envelope: {
      tenant_isolation: ORG,
      dmw_scope: "dmw.org-aggregate.v1",
      retention_class: "AGGREGATE_ONLY",
    },
    payload_safe: { count: 7 },
    no_leak_assertions: fullNoLeak(),
    ...overrides,
  };
}

// =====================================================================
// 1. Closed-vocab purposes
// =====================================================================

describe("PYTHON_PURPOSE_VALUES — closed-vocab lock", () => {
  it("exposes exactly 2 V1 fixture-only purposes", () => {
    expect(PYTHON_PURPOSE_VALUES).toEqual([
      "HIVE_SIGNAL_SCORING_FIXTURE",
      "RECOMMENDATION_RANKING_FIXTURE",
    ]);
  });
});

// =====================================================================
// 2. validateEnvelope — pure function per ADR-0090 §4
// =====================================================================

describe("validateEnvelope", () => {
  it("accepts a canonical valid envelope", () => {
    expect(validateEnvelope(fixtureEnvelope()).ok).toBe(true);
  });

  it("rejects envelope_version != \"1.0\"", () => {
    const r = validateEnvelope(
      fixtureEnvelope({ envelope_version: "2.0" as unknown as "1.0" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ENVELOPE_INVALID");
  });

  it("rejects non-UUID request_id", () => {
    expect(
      validateEnvelope(fixtureEnvelope({ request_id: "not-a-uuid" })).ok,
    ).toBe(false);
  });

  it("rejects non-UUID caller_entity_id", () => {
    expect(
      validateEnvelope(fixtureEnvelope({ caller_entity_id: "x" })).ok,
    ).toBe(false);
  });

  it("rejects non-UUID org_entity_id", () => {
    expect(
      validateEnvelope(fixtureEnvelope({ org_entity_id: "x" })).ok,
    ).toBe(false);
  });

  it("rejects unknown purpose", () => {
    expect(
      validateEnvelope(
        fixtureEnvelope({
          purpose: "UNKNOWN_PURPOSE" as unknown as PythonComputationEnvelope["purpose"],
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects empty consent_proof", () => {
    expect(
      validateEnvelope(fixtureEnvelope({ consent_proof: "" })).ok,
    ).toBe(false);
  });

  it("rejects scope_envelope.tenant_isolation != org_entity_id (cross-tenant guard)", () => {
    expect(
      validateEnvelope(
        fixtureEnvelope({
          scope_envelope: {
            tenant_isolation: "44444444-4444-4444-4444-444444444444",
            dmw_scope: "dmw.x.v1",
            retention_class: "STANDARD",
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects empty scope_envelope.dmw_scope", () => {
    expect(
      validateEnvelope(
        fixtureEnvelope({
          scope_envelope: {
            tenant_isolation: ORG,
            dmw_scope: "",
            retention_class: "STANDARD",
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects invalid retention_class", () => {
    expect(
      validateEnvelope(
        fixtureEnvelope({
          scope_envelope: {
            tenant_isolation: ORG,
            dmw_scope: "x",
            retention_class: "PERMANENT" as unknown as "STANDARD",
          },
        }),
      ).ok,
    ).toBe(false);
  });
});

// =====================================================================
// 3. validateNoLeakAssertions — defense-in-depth per ADR-0090 §8
// =====================================================================

describe("validateNoLeakAssertions", () => {
  it("accepts the full assertion set", () => {
    expect(validateNoLeakAssertions(fullNoLeak()).ok).toBe(true);
  });

  it("rejects when any required key is missing", () => {
    const partial: Record<string, unknown> = { ...fullNoLeak() };
    delete partial.no_employee_scoring;
    const r = validateNoLeakAssertions(partial);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("NO_LEAK_FAILED");
      expect(r.missing).toContain("no_employee_scoring");
    }
  });

  it("rejects when any required key is false", () => {
    const r = validateNoLeakAssertions({
      ...fullNoLeak(),
      no_manager_surveillance: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("no_manager_surveillance");
  });

  it("collects all missing assertions in one pass", () => {
    const r = validateNoLeakAssertions({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toHaveLength(7);
  });
});

// =====================================================================
// 4. FixturePythonTransport — deterministic outputs per purpose
// =====================================================================

describe("FixturePythonTransport", () => {
  it("HIVE_SIGNAL_SCORING_FIXTURE returns deterministic SAFE payload", async () => {
    const t = new FixturePythonTransport();
    const r = await t.compute(fixtureEnvelope());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload_safe.signal_label).toBe("HIVE_SIGNAL_FIXTURE");
      expect(r.payload_safe.score_band).toBe("BAND_2");
      expect(r.honest_note).toMatch(/Fixture-only/);
    }
  });

  it("RECOMMENDATION_RANKING_FIXTURE returns deterministic SAFE payload", async () => {
    const t = new FixturePythonTransport();
    const r = await t.compute(
      fixtureEnvelope({ purpose: "RECOMMENDATION_RANKING_FIXTURE" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload_safe.ranking_label).toBe("RANKING_FIXTURE");
      expect(r.payload_safe.band).toBe("BAND_1");
    }
  });
});

// =====================================================================
// 5. PythonIntelligenceClient — IO orchestration + audit emission
// =====================================================================

describe("PythonIntelligenceClient.compute — IO orchestration", () => {
  it("happy path emits 2 audit events (INVOKED + COMPLETED) with SAFE details", async () => {
    const c = new PythonIntelligenceClient();
    const r = await c.compute(fixtureEnvelope());
    expect(r.ok).toBe(true);
    expect(writeAuditEventMock).toHaveBeenCalledTimes(2);
    const invoked = writeAuditEventMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const completed = writeAuditEventMock.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(invoked.event_type).toBe("ADMIN_ACTION");
    expect(invoked.outcome).toBe("SUCCESS");
    expect(invoked.actor_entity_id).toBe(CALLER);
    expect(invoked.target_entity_id).toBe(ORG);
    const invDet = invoked.details as Record<string, unknown>;
    expect(invDet.action).toBe("PYTHON_COMPUTATION_INVOKED");
    expect(invDet.purpose).toBe("HIVE_SIGNAL_SCORING_FIXTURE");
    expect(invDet.retention_class).toBe("AGGREGATE_ONLY");
    expect(completed.event_type).toBe("ADMIN_ACTION");
    const compDet = completed.details as Record<string, unknown>;
    expect(compDet.action).toBe("PYTHON_COMPUTATION_COMPLETED");
    expect(compDet.outcome_code).toBe("SUCCESS");
    expect(compDet.redacted).toBe(false);
    // Forbidden: raw payload values + caller PII beyond entity_id
    const serialized = JSON.stringify([invDet, compDet]);
    expect(serialized).not.toMatch(/count/);
    expect(serialized).not.toMatch(/consent-chain-ref-fixture/);
  });

  it("ENVELOPE_INVALID is returned without transport invocation and emits NO audit", async () => {
    const fakeTransport: PythonTransport = {
      compute: vi.fn().mockResolvedValue({ ok: true }),
    };
    const c = new PythonIntelligenceClient(fakeTransport);
    const r = await c.compute(
      fixtureEnvelope({ caller_entity_id: "not-uuid" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.outcome).toBe("DENIED_ENVELOPE_INVALID");
      expect(r.code).toBe("ENVELOPE_INVALID");
    }
    expect(fakeTransport.compute).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("NO_LEAK_FAILED is returned without transport invocation when an assertion is missing", async () => {
    const fakeTransport: PythonTransport = {
      compute: vi.fn().mockResolvedValue({ ok: true }),
    };
    const c = new PythonIntelligenceClient(fakeTransport);
    const partialNoLeak: Record<string, unknown> = { ...fullNoLeak() };
    delete partialNoLeak.no_psychological_inference;
    const r = await c.compute(
      fixtureEnvelope({
        no_leak_assertions:
          partialNoLeak as unknown as PythonComputationEnvelope["no_leak_assertions"],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.outcome).toBe("DENIED_NO_LEAK_FAILED");
      expect(r.message).toMatch(/no_psychological_inference/);
    }
    expect(fakeTransport.compute).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it("INVOKED audit fires BEFORE the transport call (RULE 4 invariant)", async () => {
    const callOrder: string[] = [];
    writeAuditEventMock.mockImplementation(async (input: Record<string, unknown>) => {
      const det = input.details as Record<string, unknown>;
      callOrder.push(det.action as string);
      return { audit_event_id: "0".repeat(36) };
    });
    const fakeTransport: PythonTransport = {
      async compute(env) {
        callOrder.push("TRANSPORT_COMPUTE");
        return {
          ok: true,
          request_id: env.request_id,
          org_entity_id: env.org_entity_id,
          purpose: env.purpose,
          payload_safe: {},
          redacted: false,
          honest_note: "ok",
        };
      },
    };
    const c = new PythonIntelligenceClient(fakeTransport);
    await c.compute(fixtureEnvelope());
    expect(callOrder).toEqual([
      "PYTHON_COMPUTATION_INVOKED",
      "TRANSPORT_COMPUTE",
      "PYTHON_COMPUTATION_COMPLETED",
    ]);
  });

  it("transport failure is mapped to DENIED outcome with completion audit", async () => {
    const failingTransport: PythonTransport = {
      async compute(env) {
        return {
          ok: false,
          request_id: env.request_id,
          org_entity_id: env.org_entity_id,
          purpose: env.purpose,
          outcome: "FAILED_TIMEOUT",
          code: "FAILED_TIMEOUT",
          message: "fixture timeout",
        };
      },
    };
    const c = new PythonIntelligenceClient(failingTransport);
    const r = await c.compute(fixtureEnvelope());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.outcome).toBe("FAILED_TIMEOUT");
    expect(writeAuditEventMock).toHaveBeenCalledTimes(2);
    const completed = writeAuditEventMock.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(completed.outcome).toBe("DENIED");
    const compDet = completed.details as Record<string, unknown>;
    expect(compDet.outcome_code).toBe("FAILED_TIMEOUT");
  });

  it("default constructor uses FixturePythonTransport", async () => {
    const c = new PythonIntelligenceClient();
    const r = await c.compute(fixtureEnvelope());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload_safe.signal_label).toBe("HIVE_SIGNAL_FIXTURE");
    }
  });
});
