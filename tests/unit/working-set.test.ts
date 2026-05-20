// FILE: working-set.test.ts (unit)
// PURPOSE: Cover the Foundation/COSMP working-set orchestrator at PERS.3
//          per ADR-0048 Q-PERS.3. Pure composition test: a fake
//          SessionContextResolver + a stub ContextAssembler + the REAL
//          PERS.2 resolvers (resolvePermissionEnvelope / resolveMomentContext
//          run inside the service). No DB, no network. Proves: personal +
//          enterprise + DEVICE domain derivation; fail-closed on
//          session/wallet/COE failure with ZERO personalization leakage;
//          cross-wallet / cross-context blocked by the envelope; moment
//          degraded reasons surfaced; per-field TTL/freshness present;
//          deterministic injected now; no raw vector/distance/embedding
//          fields in the response; audit_intent metadata without an audit
//          literal.
// CONNECTS TO: apps/api/src/services/personalization/working-set.service.ts
//              + permission-envelope.service.ts + moment-context.service.ts
//              + temporal-personalization.ts via @niov/api barrel.

import { describe, expect, it } from "vitest";
import {
  WorkingSetService,
  getTemporalPolicy,
  type SessionContextResolver,
  type SessionContextSuccess,
  type ContextAssembler,
  type WorkingSetInput,
  type WorkingSetSuccess,
  type WorkingSetFailure,
  type AssembleContextSuccess,
  type AssembleContextFailure,
} from "@niov/api";
import type { WalletType } from "@niov/database";

const WALLET = "11111111-1111-1111-1111-111111111111";
const OTHER_WALLET = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";
const FIXED_NOW = new Date("2026-05-19T17:30:00.000Z");

function okResolver(
  overrides: Partial<Omit<SessionContextSuccess, "ok">> = {},
): SessionContextResolver {
  return {
    async resolve() {
      return {
        ok: true,
        entity_id: overrides.entity_id ?? ACTOR,
        wallet_id: overrides.wallet_id ?? WALLET,
        wallet_type: overrides.wallet_type ?? ("PERSONAL" as WalletType),
        entity_type: overrides.entity_type ?? "PERSON",
        timezone: overrides.timezone ?? "America/New_York",
      };
    },
  };
}

function failResolver(
  code: AssembleContextFailure["code"] = "SESSION_INVALID",
  message = "Context denied",
): SessionContextResolver {
  return {
    async resolve() {
      return { ok: false, code, message };
    },
  };
}

const SAMPLE_SUCCESS: AssembleContextSuccess = {
  ok: true,
  capsules_loaded: 2,
  tokens_consumed: 350,
  capsules_skipped_low_relevance: 1,
  capsules_skipped_budget: 0,
  capsules_denied_permission: 1,
  context: [
    { capsule_id: "c1", capsule_type: "PREFERENCE", topic_tags: ["a"], content: "alpha" },
    { capsule_id: "c2", capsule_type: "IDENTITY", topic_tags: ["b"], content: "beta" },
  ],
};

function successAssembler(
  result: AssembleContextSuccess = SAMPLE_SUCCESS,
): ContextAssembler {
  return {
    async assembleContext() {
      return result;
    },
  };
}

function failAssembler(
  code: AssembleContextFailure["code"] = "OPERATION_NOT_PERMITTED",
  message = "denied",
): ContextAssembler {
  return {
    async assembleContext() {
      return { ok: false, code, message };
    },
  };
}

const BASE_INPUT: WorkingSetInput = {
  request_text: "what's on my plate today",
  token_budget: 1000,
  requested_context: [],
};

function asSuccess(
  r: WorkingSetSuccess | WorkingSetFailure,
): WorkingSetSuccess {
  if (!r.ok) throw new Error(`expected success, got failure ${r.code}`);
  return r;
}

describe("WorkingSetService — domain derivation", () => {
  it("personal happy path composes session + envelope + moment + COE capsules", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", {
        ...BASE_INPUT,
        requested_context: ["entity_id", "timezone"],
        now: FIXED_NOW,
      }),
    );
    expect(out.domain).toBe("personal");
    expect(out.capsules).toHaveLength(2);
    expect(out.moment.current_time_iso).toBe("2026-05-19T17:30:00.000Z");
    expect(out.permissions.map((p) => p.key)).toEqual(["entity_id", "timezone"]);
    expect(out.stats.capsules_loaded).toBe(2);
    expect(out.stats.context_keys_requested).toBe(2);
    expect(typeof out.audit_intent).toBe("string");
  });

  it("ENTERPRISE wallet_type derives enterprise domain", async () => {
    const svc = new WorkingSetService(
      okResolver({ wallet_type: "ENTERPRISE" as WalletType, entity_type: "COMPANY" }),
      successAssembler(),
    );
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW }),
    );
    expect(out.domain).toBe("enterprise");
  });

  it("DEVICE wallet_type maps to personal domain at PERS.3", async () => {
    const svc = new WorkingSetService(
      okResolver({ wallet_type: "DEVICE" as WalletType, entity_type: "DEVICE" }),
      successAssembler(),
    );
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW }),
    );
    expect(out.domain).toBe("personal");
  });
});

describe("WorkingSetService — fail-closed (no personalization leakage)", () => {
  it("invalid session returns failure with no moment/permissions/capsules", async () => {
    const svc = new WorkingSetService(failResolver("SESSION_INVALID"), successAssembler());
    const out = await svc.buildPersonalizedWorkingSet("tok", {
      ...BASE_INPUT,
      requested_context: ["entity_id", "health"],
      caller_inputs: { location: { lat: 1, lon: 2 } },
      now: FIXED_NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("SESSION_INVALID");
    expect("moment" in out).toBe(false);
    expect("permissions" in out).toBe(false);
    expect("capsules" in out).toBe(false);
  });

  it("missing wallet (resolver INVALID_REQUEST) returns fail-closed", async () => {
    const svc = new WorkingSetService(
      failResolver("INVALID_REQUEST", "Entity has no wallet"),
      successAssembler(),
    );
    const out = await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("INVALID_REQUEST");
  });

  it("assembleContext failure propagates with no personalization leakage", async () => {
    const svc = new WorkingSetService(
      okResolver(),
      failAssembler("OPERATION_NOT_PERMITTED"),
    );
    const out = await svc.buildPersonalizedWorkingSet("tok", {
      ...BASE_INPUT,
      requested_context: ["entity_id", "health"],
      now: FIXED_NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("OPERATION_NOT_PERMITTED");
    expect("moment" in out).toBe(false);
    expect("permissions" in out).toBe(false);
    expect("capsules" in out).toBe(false);
  });

  it("invalid input (non-positive token_budget) fails closed before any resolution", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = await svc.buildPersonalizedWorkingSet("tok", {
      ...BASE_INPUT,
      token_budget: 0,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.code).toBe("INVALID_REQUEST");
  });
});

describe("WorkingSetService — envelope boundaries surfaced", () => {
  it("a grant bound to a different wallet is blocked (cross_wallet_blocked)", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", {
        ...BASE_INPUT,
        requested_context: ["device"],
        grants: {
          device: { wallet_id: OTHER_WALLET, domain: "personal", granted: true },
        },
        now: FIXED_NOW,
      }),
    );
    const device = out.permissions.find((p) => p.key === "device");
    expect(device?.available).toBe(false);
    expect(device?.reason).toBe("cross_wallet_blocked");
    expect(out.degraded.some((d) => d.key === "device" && d.source === "permission")).toBe(true);
  });

  it("a personal-only context in enterprise domain is cross_context_blocked", async () => {
    const svc = new WorkingSetService(
      okResolver({ wallet_type: "ENTERPRISE" as WalletType, entity_type: "COMPANY" }),
      successAssembler(),
    );
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", {
        ...BASE_INPUT,
        requested_context: ["location"],
        now: FIXED_NOW,
      }),
    );
    const location = out.permissions.find((p) => p.key === "location");
    expect(location?.available).toBe(false);
    expect(location?.reason).toBe("cross_context_blocked");
  });
});

describe("WorkingSetService — moment degraded + temporal metadata", () => {
  it("a permission-missing moment field surfaces a degraded reason", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", {
        ...BASE_INPUT,
        requested_context: [],
        now: FIXED_NOW,
      }),
    );
    const locDegraded = out.degraded.find(
      (d) => d.source === "moment" && d.key === "location",
    );
    expect(locDegraded?.reason).toBe("permission_missing");
  });

  it("REAL_TIME moment fields carry the short TTL/freshness from the temporal policy", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW }),
    );
    const loc = out.moment.fields.find((f) => f.key === "location");
    expect(loc?.freshness).toBe("EXPIRES_FAST");
    expect(loc?.ttlSeconds).toBe(getTemporalPolicy("REAL_TIME").defaultTtlSeconds);
    expect(loc?.ttlSeconds).toBe(300);
  });

  it("deterministic injected now is passed through to the moment slice", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW }),
    );
    expect(out.moment.current_time_iso).toBe("2026-05-19T17:30:00.000Z");
  });
});

describe("WorkingSetService — no leakage of forbidden retrieval internals", () => {
  it("no raw vector / distance / embedding fields appear in the working set", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", {
        ...BASE_INPUT,
        requested_context: ["entity_id", "health"],
        now: FIXED_NOW,
      }),
    );
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("cosine");
  });

  it("audit_intent metadata is present but no audit literal is emitted", async () => {
    const svc = new WorkingSetService(okResolver(), successAssembler());
    const out = asSuccess(
      await svc.buildPersonalizedWorkingSet("tok", { ...BASE_INPUT, now: FIXED_NOW }),
    );
    expect(out.audit_intent.startsWith("working_set_built:")).toBe(true);
    // No new audit literal: the orchestrator returns intent metadata only.
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("WORKING_SET_BUILT");
  });
});
