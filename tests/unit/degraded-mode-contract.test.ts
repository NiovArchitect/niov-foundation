// FILE: degraded-mode-contract.test.ts (unit)
// PURPOSE: Cover the Foundation-tier degraded/uncertainty truth contract at
//          PERS.4 per ADR-0048 Q-PERS.4. Pure module; no DB / no network.
//          Proves the use-policy table is complete + leak-free, the
//          mapping functions are total over the existing PERS.2 reason
//          vocabularies, consumer obligations are frozen, and
//          buildDegradedContract never emits `stale` without an explicit
//          stale signal (defined-not-emitted lock).
// CONNECTS TO: apps/api/src/services/personalization/degraded-mode-contract.ts
//              + permission-envelope.service.ts + moment-context.service.ts
//              via @niov/api barrel.

import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_POLICY,
  CONSUMER_OBLIGATIONS,
  disclosurePolicyFor,
  classifyFailClosed,
  mapEnvelopeReason,
  mapMomentReason,
  buildDegradedContract,
  resolvePermissionEnvelope,
  resolveMomentContext,
  type DegradedReason,
  type EnvelopeReason,
  type MomentDegradedReason,
} from "@niov/api";

const ALL_REASONS: DegradedReason[] = [
  "permission_denied",
  "permission_missing",
  "integration_unavailable",
  "not_provided",
  "stale",
  "fallback_used",
  "uncertain",
  "policy_blocked",
  "cross_context_blocked",
  "cross_wallet_blocked",
  "clearance_blocked",
  "sensitive_enrichment_blocked",
  "needs_permission",
];

const ALL_ENVELOPE_REASONS: EnvelopeReason[] = [
  "stable_identity_required",
  "accuracy_enhancing_grant_present",
  "accuracy_enhancing_grant_absent",
  "optional_enrichment_grant_present",
  "optional_enrichment_grant_absent",
  "cross_wallet_blocked",
  "cross_context_blocked",
  "enterprise_policy_restricted",
  "not_requested",
  "unknown_context_key",
];

const ALL_MOMENT_REASONS: MomentDegradedReason[] = [
  "not_provided",
  "permission_denied",
  "permission_missing",
  "integration_unavailable",
];

describe("DISCLOSURE_POLICY — completeness + leak-free use policy", () => {
  it("every DegradedReason has a policy entry", () => {
    for (const r of ALL_REASONS) {
      const p = disclosurePolicyFor(r);
      expect(p).toBeDefined();
      expect(typeof p.disposition).toBe("string");
    }
  });

  it("no degraded reason may ever be used as truth, and none may be fabricated", () => {
    for (const r of ALL_REASONS) {
      const p = disclosurePolicyFor(r);
      expect(p.may_use_as_truth).toBe(false);
      expect(p.must_not_fabricate).toBe(true);
    }
  });

  it("fallback_used maps to fallback_not_truth", () => {
    expect(disclosurePolicyFor("fallback_used").disposition).toBe("fallback_not_truth");
    expect(disclosurePolicyFor("fallback_used").may_use_as_truth).toBe(false);
  });

  it("uncertain (and stale) are low_confidence + must_disclose_uncertainty", () => {
    for (const r of ["uncertain", "stale"] as const) {
      expect(disclosurePolicyFor(r).disposition).toBe("low_confidence");
      expect(disclosurePolicyFor(r).must_disclose_uncertainty).toBe(true);
    }
  });

  it("needs_permission + sensitive_enrichment_blocked may request permission", () => {
    expect(disclosurePolicyFor("needs_permission").may_request_permission).toBe(true);
    expect(disclosurePolicyFor("sensitive_enrichment_blocked").may_request_permission).toBe(true);
  });

  it("blocked reasons are withheld", () => {
    for (const r of [
      "permission_denied",
      "policy_blocked",
      "cross_context_blocked",
      "cross_wallet_blocked",
      "clearance_blocked",
    ] as const) {
      expect(disclosurePolicyFor(r).disposition).toBe("withheld");
    }
  });
});

describe("CONSUMER_OBLIGATIONS — declared + frozen", () => {
  it("is non-empty and immutable", () => {
    expect(CONSUMER_OBLIGATIONS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(CONSUMER_OBLIGATIONS)).toBe(true);
  });

  it("encodes the hallucination guard + no-fallback-as-truth + no-bridging", () => {
    const joined = CONSUMER_OBLIGATIONS.join(" | ").toLowerCase();
    expect(joined).toContain("fabricate");
    expect(joined).toContain("fallback");
    expect(joined).toContain("bridge");
    expect(joined).toContain("uncertainty");
  });
});

describe("classifyFailClosed — session vs upstream", () => {
  it("SESSION_* codes are expired_or_invalid_session", () => {
    expect(classifyFailClosed("SESSION_INVALID")).toBe("expired_or_invalid_session");
    expect(classifyFailClosed("SESSION_EXPIRED")).toBe("expired_or_invalid_session");
    expect(classifyFailClosed("SESSION_REVOKED")).toBe("expired_or_invalid_session");
  });
  it("non-session codes are upstream_context_failure", () => {
    expect(classifyFailClosed("OPERATION_NOT_PERMITTED")).toBe("upstream_context_failure");
    expect(classifyFailClosed("INVALID_REQUEST")).toBe("upstream_context_failure");
  });
});

describe("mapEnvelopeReason — total over EnvelopeReason; canonical mappings", () => {
  it("is total (returns a DegradedReason or null for every EnvelopeReason)", () => {
    for (const r of ALL_ENVELOPE_REASONS) {
      const out = mapEnvelopeReason(r, "REAL_TIME");
      expect(out === null || ALL_REASONS.includes(out)).toBe(true);
    }
  });

  it("available / required / not-requested reasons map to null (not degraded)", () => {
    expect(mapEnvelopeReason("stable_identity_required", "STABLE_IDENTITY")).toBeNull();
    expect(mapEnvelopeReason("accuracy_enhancing_grant_present", "REAL_TIME")).toBeNull();
    expect(mapEnvelopeReason("optional_enrichment_grant_present", "SENSITIVE_ENRICHMENT")).toBeNull();
    expect(mapEnvelopeReason("not_requested", "REAL_TIME")).toBeNull();
  });

  it("accuracy_enhancing_grant_absent maps to needs_permission", () => {
    expect(mapEnvelopeReason("accuracy_enhancing_grant_absent", "REAL_TIME")).toBe("needs_permission");
  });

  it("optional_enrichment_grant_absent (SENSITIVE_ENRICHMENT) maps to sensitive_enrichment_blocked", () => {
    expect(
      mapEnvelopeReason("optional_enrichment_grant_absent", "SENSITIVE_ENRICHMENT"),
    ).toBe("sensitive_enrichment_blocked");
  });

  it("unknown_context_key maps to permission_missing; policy/cross map directly", () => {
    expect(mapEnvelopeReason("unknown_context_key", "REAL_TIME")).toBe("permission_missing");
    expect(mapEnvelopeReason("enterprise_policy_restricted", "STABLE_IDENTITY")).toBe("policy_blocked");
    expect(mapEnvelopeReason("cross_wallet_blocked", "REAL_TIME")).toBe("cross_wallet_blocked");
    expect(mapEnvelopeReason("cross_context_blocked", "REAL_TIME")).toBe("cross_context_blocked");
  });
});

describe("mapMomentReason — total over MomentDegradedReason", () => {
  it("maps every MomentDegradedReason to a canonical DegradedReason", () => {
    for (const r of ALL_MOMENT_REASONS) {
      const out = mapMomentReason(r);
      expect(ALL_REASONS.includes(out)).toBe(true);
    }
  });
});

describe("buildDegradedContract — never emits stale without a stale signal", () => {
  const ACTOR = "33333333-3333-3333-3333-333333333333";
  const WALLET = "11111111-1111-1111-1111-111111111111";
  const NOW = new Date("2026-05-19T17:30:00.000Z");

  function fixtureContract(requested: string[]) {
    const envelope = resolvePermissionEnvelope({
      actor_entity_id: ACTOR,
      wallet_id: WALLET,
      entity_type: "PERSON",
      domain: "personal",
      requested_context: requested,
    });
    const moment = resolveMomentContext({
      now: NOW,
      entity_profile_timezone: "America/New_York",
      permissions: envelope,
    });
    return buildDegradedContract({ envelope, moment, capsules_denied_permission: 0 });
  }

  it("does not emit a `stale` entry (no as-of timestamp at build time)", () => {
    const entries = fixtureContract(["entity_id", "health"]);
    expect(entries.some((e) => e.reason === "stale")).toBe(false);
  });

  it("emits a sensitive_enrichment_blocked entry for a denied sensitive key", () => {
    const entries = fixtureContract(["health"]);
    expect(entries.some((e) => e.reason === "sensitive_enrichment_blocked")).toBe(true);
  });

  it("emits a clearance_blocked entry only when capsules were denied", () => {
    const envelope = resolvePermissionEnvelope({
      actor_entity_id: ACTOR,
      wallet_id: WALLET,
      entity_type: "PERSON",
      domain: "personal",
      requested_context: [],
    });
    const moment = resolveMomentContext({
      now: NOW,
      entity_profile_timezone: "America/New_York",
      permissions: envelope,
    });
    const none = buildDegradedContract({ envelope, moment, capsules_denied_permission: 0 });
    const some = buildDegradedContract({ envelope, moment, capsules_denied_permission: 3 });
    expect(none.some((e) => e.reason === "clearance_blocked")).toBe(false);
    expect(some.filter((e) => e.reason === "clearance_blocked")).toHaveLength(1);
  });
});
