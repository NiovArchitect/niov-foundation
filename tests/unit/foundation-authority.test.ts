// FILE: tests/unit/foundation-authority.test.ts (unit)
// PURPOSE: Phase 1288-B — locks the generalized Entity & Authority Envelope
//          computation (computeAuthorityEnvelope). Proves: the five authority
//          dimensions (know/do/request/pay/approve) are present + deterministic
//          for PERSON / AI_AGENT / DEVICE / APPLICATION; RULE 0 sovereignty
//          (only PERSON is sovereign + grants LONG_TERM/PERMANENT); AI_AGENT is
//          FULL→SUMMARY capped + cannot grant to AI + validation-gated; DEVICE
//          identity is never trusted + raw frames/biometrics forbidden; an
//          APPLICATION can never self-authorize; can_pay is DISABLED for every
//          entity (economic substrate is Phase 1290-A); cross-tenant access is
//          always false; and a missing/non-active TAR fails closed.
// CONNECTS TO: apps/api/src/services/foundation/authority.service.ts.

import { describe, expect, it } from "vitest";
import { computeAuthorityEnvelope, AUTHORITY_CLEARANCE_MAX } from "@niov/api";
import type {
  Entity,
  TokenAttributeRepository,
  Wallet,
  EntityType,
  WalletType,
} from "@niov/database";

// A fully-capable ACTIVE TAR. Individual tests override flags as needed.
function tar(
  over: Partial<TokenAttributeRepository> = {},
): TokenAttributeRepository {
  return {
    tar_id: "tar-x",
    entity_id: "ent-x",
    can_login: true,
    can_read_capsules: true,
    can_write_capsules: true,
    can_share_capsules: true,
    can_create_hives: false,
    can_access_external_api: false,
    can_admin_niov: false,
    can_admin_org: false,
    clearance_ceiling: 6,
    monetization_role: "NEITHER",
    compliance_frameworks: [],
    regulator_jurisdiction: [],
    regulator_authority_scope: [],
    regulator_credentialed_by: null,
    tar_version: 3,
    tar_hash: "hash",
    status: "ACTIVE",
    created_at: new Date(0),
    updated_at: new Date(0),
    ...over,
  } as TokenAttributeRepository;
}

function entity(type: EntityType, over: Partial<Entity> = {}): Entity {
  return {
    entity_id: `ent-${type}`,
    entity_type: type,
    display_name: `${type} display`,
    clearance_level: 3,
    ...over,
  } as Entity;
}

function wallet(type: WalletType): Wallet {
  return { wallet_type: type } as Wallet;
}

const FIXED = new Date("2026-06-17T00:00:00.000Z");

describe("computeAuthorityEnvelope — the five dimensions", () => {
  it("includes all five authority dimensions + memory scope for a PERSON", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("PERSON"),
      tar: tar(),
      wallet: wallet("PERSONAL"),
      evaluatedAt: FIXED,
    });
    expect(env.can_know).toBeDefined();
    expect(env.can_do).toBeDefined();
    expect(env.can_request).toBeDefined();
    expect(env.can_pay).toBeDefined();
    expect(env.requires_approval).toBeDefined();
    expect(env.memory_scope).toBeDefined();
    expect(env.entity_class).toBe("HUMAN");
    expect(env.is_sovereign).toBe(true); // RULE 0
    expect(env.can_know.clearance_ceiling).toBe(6);
    expect(env.can_know.cross_tenant_access).toBe(false);
    expect(AUTHORITY_CLEARANCE_MAX).toBe(6);
  });

  it("is deterministic — same inputs produce the same envelope", () => {
    const args = {
      entity: entity("AI_AGENT"),
      tar: tar({ clearance_ceiling: 2 }),
      wallet: wallet("PERSONAL"),
      evaluatedAt: FIXED,
    };
    expect(JSON.stringify(computeAuthorityEnvelope(args))).toBe(
      JSON.stringify(computeAuthorityEnvelope(args)),
    );
  });
});

describe("computeAuthorityEnvelope — RULE 0 + sovereignty grants", () => {
  it("only a PERSON is sovereign and may grant LONG_TERM/PERMANENT", () => {
    const person = computeAuthorityEnvelope({
      entity: entity("PERSON"),
      tar: tar(),
      wallet: wallet("PERSONAL"),
    });
    expect(person.is_sovereign).toBe(true);
    expect(person.memory_scope.can_grant_long_term_or_permanent).toBe(true);

    for (const t of ["COMPANY", "AI_AGENT", "DEVICE", "APPLICATION"] as const) {
      const env = computeAuthorityEnvelope({
        entity: entity(t),
        tar: tar(),
        wallet: wallet("ENTERPRISE"),
      });
      expect(env.is_sovereign).toBe(false);
      expect(env.memory_scope.can_grant_long_term_or_permanent).toBe(false);
    }
  });
});

describe("computeAuthorityEnvelope — AI_AGENT restrictions", () => {
  it("caps FULL→SUMMARY, forbids granting to AI, and gates on validation", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("AI_AGENT"),
      tar: tar({ clearance_ceiling: 2 }),
      wallet: wallet("PERSONAL"),
    });
    expect(env.entity_class).toBe("AI");
    expect(env.memory_scope.full_access_capped_to_summary).toBe(true);
    expect(env.memory_scope.can_grant_to_ai).toBe(false);
    expect(env.memory_scope.requires_validation_gate).toBe(true);
    expect(env.memory_scope.respects_ai_access_blocked).toBe(true);
    expect(env.requires_approval.sensitive_capsule_access).toBe(true);
    expect(env.can_request.requires_human_review_for_sensitive).toBe(true);
  });
});

describe("computeAuthorityEnvelope — DEVICE boundaries", () => {
  it("never trusts device identity and forbids raw frames + biometrics", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("DEVICE", { clearance_level: 1 }),
      tar: tar({ clearance_ceiling: 1 }),
      wallet: wallet("DEVICE"),
    });
    expect(env.entity_class).toBe("DEVICE");
    expect(env.device_scope.is_device).toBe(true);
    expect(env.device_scope.device_identity_trusted).toBe(false);
    expect(env.device_scope.memory_scope_explicit_required).toBe(true);
    expect(env.device_scope.raw_frame_capture_allowed).toBe(false);
    expect(env.device_scope.biometric_recognition_allowed).toBe(false);
    expect(env.can_know.clearance_ceiling).toBe(1);
    expect(env.memory_scope.respects_ai_access_blocked).toBe(true);
  });
});

describe("computeAuthorityEnvelope — APPLICATION cannot self-authorize", () => {
  it("marks app scope non-self-authorizing and grant-required", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("APPLICATION"),
      tar: tar({ clearance_ceiling: 2, can_access_external_api: true }),
      wallet: wallet("ENTERPRISE"),
    });
    expect(env.entity_class).toBe("APPLICATION");
    expect(env.app_scope.is_application).toBe(true);
    expect(env.app_scope.can_self_authorize).toBe(false);
    expect(env.app_scope.requires_explicit_grants).toBe(true);
    expect(env.app_scope.can_invoke_tools).toBe(true);
    expect(env.can_do.can_invoke_app_tools).toBe(true);
  });

  it("APPLICATION is in the restricted (non-human) class for memory scope (1289-A.2)", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("APPLICATION"),
      tar: tar({ clearance_ceiling: 2 }),
      wallet: wallet("ENTERPRISE"),
    });
    // Phase 1289-A.2: APPLICATION now respects the capsule-access gates like
    // AI_AGENT/DEVICE — it must not read AI-blocked / validation-gated capsules.
    expect(env.memory_scope.respects_ai_access_blocked).toBe(true);
    expect(env.memory_scope.requires_validation_gate).toBe(true);
    expect(env.requires_approval.sensitive_capsule_access).toBe(true);
    // But APPLICATION is NOT FULL→SUMMARY capped (that cap is AI_AGENT-only).
    expect(env.memory_scope.full_access_capped_to_summary).toBe(false);
  });
});

describe("computeAuthorityEnvelope — economic substrate not yet enabled", () => {
  it("can_pay is DISABLED for every entity kind (1290-A is separate)", () => {
    for (const t of [
      "PERSON",
      "COMPANY",
      "AI_AGENT",
      "DEVICE",
      "APPLICATION",
      "GOVERNMENT",
      "REGULATOR",
    ] as const) {
      const env = computeAuthorityEnvelope({
        entity: entity(t),
        tar: tar(),
        wallet: wallet("ENTERPRISE"),
      });
      expect(env.can_pay.can_create_payment_intent).toBe(false);
      expect(env.can_pay.settlement_mode).toBe("DISABLED");
      expect(env.can_pay.requires_approval).toBe(true);
      expect(env.spend_scope.real_provider_enabled).toBe(false);
      expect(env.can_request.can_request_payment).toBe(false);
      expect(env.requires_approval.can_self_approve).toBe(false);
    }
  });
});

describe("computeAuthorityEnvelope — fails closed on missing/non-active TAR", () => {
  it("a null TAR yields no capabilities and a default-by-type ceiling", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("AI_AGENT"),
      tar: null,
      wallet: wallet("ENTERPRISE"),
    });
    expect(env.can_know.can_read_capsules).toBe(false);
    expect(env.can_do.can_write_capsules).toBe(false);
    expect(env.memory_scope.cosmp_ops_allowed).toEqual([]);
    expect(env.authority_version).toBe(0);
    expect(env.can_know.clearance_ceiling).toBe(2); // defaultCeilingFor(AI_AGENT)
  });

  it("a REVOKED TAR is treated as no capabilities", () => {
    const env = computeAuthorityEnvelope({
      entity: entity("PERSON"),
      tar: tar({ status: "REVOKED" }),
      wallet: wallet("PERSONAL"),
    });
    expect(env.can_do.can_admin_org).toBe(false);
    expect(env.memory_scope.can_read_capsules).toBe(false);
    expect(env.provenance.tar_status).toBe("REVOKED");
  });
});
