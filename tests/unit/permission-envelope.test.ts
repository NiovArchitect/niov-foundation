// FILE: permission-envelope.test.ts (unit)
// PURPOSE: Cover the Foundation/COSMP permission-envelope resolver at
//          PERS.2 per ADR-0048 Q-PERS.2-γ. Pure deterministic resolver;
//          no DB / no network. Proves 4-tier mapping, personal vs
//          enterprise discrimination, enterprise defaults, no
//          cross-wallet default, typed denied/missing states,
//          Permission.conditions-style grant authorization, sensitive
//          enrichment denied without grant, and temporal-class →
//          permission-tier mapping.
// CONNECTS TO: apps/api/src/services/personalization/permission-envelope.service.ts
//              + temporal-personalization.ts via @niov/api barrel.

import { describe, expect, it } from "vitest";
import {
  resolvePermissionEnvelope,
  getTemporalPolicy,
  type PermissionEnvelopeInput,
  type ScopedGrant,
} from "@niov/api";

const WALLET = "11111111-1111-1111-1111-111111111111";
const OTHER_WALLET = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

function baseInput(
  overrides: Partial<PermissionEnvelopeInput> = {},
): PermissionEnvelopeInput {
  return {
    actor_entity_id: ACTOR,
    wallet_id: WALLET,
    entity_type: "PERSON",
    domain: "personal",
    requested_context: [],
    ...overrides,
  };
}

function find(env: ReturnType<typeof resolvePermissionEnvelope>, key: string) {
  return env.resolved.find((r) => r.key === key);
}

describe("resolvePermissionEnvelope — 4-tier mapping", () => {
  it("required stable-identity substrate resolves to required + available", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["entity_id", "wallet_id", "timezone", "display_name"] }),
    );
    for (const key of ["entity_id", "wallet_id", "timezone", "display_name"]) {
      const r = find(env, key);
      expect(r?.tier).toBe("required");
      expect(r?.available).toBe(true);
      expect(r?.reason).toBe("stable_identity_required");
    }
  });

  it("accuracy_enhancing context is denied without a grant (typed missing)", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["preferred_name", "device"] }),
    );
    const pn = find(env, "preferred_name");
    expect(pn?.tier).toBe("accuracy_enhancing");
    expect(pn?.available).toBe(false);
    expect(pn?.reason).toBe("accuracy_enhancing_grant_absent");
  });

  it("optional_enrichment (sensitive) remains denied/missing without explicit grant", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["health", "finance"] }),
    );
    const health = find(env, "health");
    expect(health?.tier).toBe("optional_enrichment");
    expect(health?.available).toBe(false);
    expect(health?.reason).toBe("optional_enrichment_grant_absent");
    expect(health?.temporalClass).toBe("SENSITIVE_ENRICHMENT");
  });

  it("unknown context key fails closed to denied_or_unavailable", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["totally_unknown_key"] }),
    );
    const r = find(env, "totally_unknown_key");
    expect(r?.tier).toBe("denied_or_unavailable");
    expect(r?.available).toBe(false);
    expect(r?.reason).toBe("unknown_context_key");
  });
});

describe("resolvePermissionEnvelope — grant authorization", () => {
  it("an in-wallet, in-domain grant authorizes an accuracy_enhancing context", () => {
    const grant: ScopedGrant = { wallet_id: WALLET, domain: "personal", granted: true };
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["device"], grants: { device: grant } }),
    );
    const r = find(env, "device");
    expect(r?.available).toBe(true);
    expect(r?.reason).toBe("accuracy_enhancing_grant_present");
  });

  it("an explicit grant authorizes sensitive optional_enrichment", () => {
    const grant: ScopedGrant = { wallet_id: WALLET, domain: "personal", granted: true };
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["health"], grants: { health: grant } }),
    );
    const r = find(env, "health");
    expect(r?.available).toBe(true);
    expect(r?.reason).toBe("optional_enrichment_grant_present");
  });

  it("a grant bound to a DIFFERENT wallet never authorizes — cross_wallet_blocked", () => {
    const grant: ScopedGrant = { wallet_id: OTHER_WALLET, domain: "personal", granted: true };
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["device"], grants: { device: grant } }),
    );
    const r = find(env, "device");
    expect(r?.available).toBe(false);
    expect(r?.reason).toBe("cross_wallet_blocked");
  });

  it("no cross-wallet by default — absent grant never reaches across wallets", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["contacts"] }),
    );
    const r = find(env, "contacts");
    expect(r?.available).toBe(false);
  });
});

describe("resolvePermissionEnvelope — personal vs enterprise discrimination", () => {
  it("a personal-only context requested in ENTERPRISE domain is cross_context_blocked without grant", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ domain: "enterprise", entity_type: "COMPANY", requested_context: ["location"] }),
    );
    const r = find(env, "location");
    expect(r?.available).toBe(false);
    expect(r?.reason).toBe("cross_context_blocked");
  });

  it("enterprise-only required `role` is restricted in PERSONAL domain", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ domain: "personal", requested_context: ["role"] }),
    );
    const r = find(env, "role");
    expect(r?.available).toBe(false);
    expect(r?.reason).toBe("enterprise_policy_restricted");
  });

  it("enterprise dept_data_isolation restricts enterprise-only accuracy context without in-domain grant", () => {
    const env = resolvePermissionEnvelope(
      baseInput({
        domain: "enterprise",
        entity_type: "COMPANY",
        requested_context: ["team_graph"],
        enterprise_defaults: { dept_data_isolation: true, audit_ai_actions: true },
      }),
    );
    const r = find(env, "team_graph");
    expect(r?.available).toBe(false);
    expect(r?.reason).toBe("enterprise_policy_restricted");
  });

  it("enterprise dept_data_isolation grants enterprise-only context WITH an in-domain grant", () => {
    const grant: ScopedGrant = { wallet_id: WALLET, domain: "enterprise", granted: true };
    const env = resolvePermissionEnvelope(
      baseInput({
        domain: "enterprise",
        entity_type: "COMPANY",
        requested_context: ["team_graph"],
        grants: { team_graph: grant },
        enterprise_defaults: { dept_data_isolation: true, audit_ai_actions: true },
      }),
    );
    const r = find(env, "team_graph");
    expect(r?.available).toBe(true);
  });
});

describe("resolvePermissionEnvelope — audit-intent metadata + no leakage", () => {
  it("every resolved key carries machine-readable reason + audit_intent without forbidden data", () => {
    const env = resolvePermissionEnvelope(
      baseInput({ requested_context: ["entity_id", "health"] }),
    );
    for (const r of env.resolved) {
      expect(typeof r.reason).toBe("string");
      expect(typeof r.audit_intent).toBe("string");
      expect(r.audit_intent.length).toBeGreaterThan(0);
    }
  });
});

describe("temporal class → permission tier mapping (Q-PERS.2-ε)", () => {
  it("STABLE_IDENTITY defaults to required tier", () => {
    expect(getTemporalPolicy("STABLE_IDENTITY").defaultPermissionTier).toBe("required");
  });
  it("SENSITIVE_ENRICHMENT defaults to optional_enrichment tier", () => {
    expect(getTemporalPolicy("SENSITIVE_ENRICHMENT").defaultPermissionTier).toBe("optional_enrichment");
  });
  it("REAL_TIME + REPEATED_PATTERN + CONTEXTUAL_PREFERENCE default to accuracy_enhancing", () => {
    expect(getTemporalPolicy("REAL_TIME").defaultPermissionTier).toBe("accuracy_enhancing");
    expect(getTemporalPolicy("REPEATED_PATTERN").defaultPermissionTier).toBe("accuracy_enhancing");
    expect(getTemporalPolicy("CONTEXTUAL_PREFERENCE").defaultPermissionTier).toBe("accuracy_enhancing");
  });
  it("no temporal class allows a one-off event to update durable memory", () => {
    for (const c of [
      "REAL_TIME",
      "REPEATED_PATTERN",
      "STABLE_IDENTITY",
      "CONTEXTUAL_PREFERENCE",
      "SENSITIVE_ENRICHMENT",
    ] as const) {
      expect(getTemporalPolicy(c).oneOffCanUpdateDurableMemory).toBe(false);
    }
  });
});
