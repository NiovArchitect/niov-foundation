// FILE: tests/unit/cohort-delivery-gate.test.ts
// PURPOSE: Phase 1308-A — pure unit tests for the cohort delivery gate +
//          view builder. Proves: CHILDREN is the only hard re-block at delivery
//          (high-sensitivity is NOT re-blocked — a human already cleared it);
//          only an APPROVED, decided, non-expired request against an ACTIVE
//          cohort passes; and buildDeliveryView flips threshold_enforced=true,
//          enforces minimum_cohort_size, mints a proof ONLY when the threshold
//          is met, and NEVER exposes an exact count or a numeric aggregate
//          (signal_available stays false). No I/O.
// CONNECTS TO: apps/api/src/services/foundation/cohort-delivery.service.ts

import { describe, expect, it } from "vitest";
import {
  buildDeliveryView,
  evaluateDeliveryGate,
} from "../../apps/api/src/services/foundation/cohort-delivery.service.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");
const PAST = new Date("2026-06-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const COHORT_ID = "11111111-1111-1111-1111-111111111111";

type GateRequest = Parameters<typeof evaluateDeliveryGate>[0];
type GateCohort = Parameters<typeof evaluateDeliveryGate>[1];

function gReq(overrides: Partial<GateRequest> = {}): GateRequest {
  return {
    status: "APPROVED",
    decided_at: PAST,
    expires_at: null,
    cohort_product_id: COHORT_ID,
    ...overrides,
  } as GateRequest;
}
function gCohort(overrides: Partial<GateCohort> = {}): GateCohort {
  return {
    cohort_product_id: COHORT_ID,
    status: "ACTIVE",
    sensitive_categories: [],
    deleted_at: null,
    ...overrides,
  } as GateCohort;
}

describe("Phase 1308-A — evaluateDeliveryGate", () => {
  it("APPROVED + decided + ACTIVE + not expired → ok", () => {
    expect(evaluateDeliveryGate(gReq(), gCohort(), NOW)).toEqual({ ok: true });
  });

  it("CHILDREN is the only hard re-block (defense-in-depth)", () => {
    expect(evaluateDeliveryGate(gReq(), gCohort({ sensitive_categories: ["CHILDREN"] }), NOW)).toEqual(
      { ok: false, code: "CHILDREN_DATA_BLOCKED" },
    );
  });

  it("HIGH_SENSITIVITY is NOT re-blocked at delivery (human already cleared it)", () => {
    // sensitivity_class is intentionally not part of the gate — only CHILDREN is.
    expect(
      evaluateDeliveryGate(gReq(), gCohort({ sensitive_categories: ["HEALTH"] }), NOW),
    ).toEqual({ ok: true });
  });

  it("non-ACTIVE / soft-deleted cohort → COHORT_NOT_ACTIVE", () => {
    expect(evaluateDeliveryGate(gReq(), gCohort({ status: "PAUSED" }), NOW)).toEqual({
      ok: false,
      code: "COHORT_NOT_ACTIVE",
    });
    expect(evaluateDeliveryGate(gReq(), gCohort({ deleted_at: NOW }), NOW)).toEqual({
      ok: false,
      code: "COHORT_NOT_ACTIVE",
    });
  });

  it("request not bound to the cohort → ACCESS_REQUEST_NOT_FOUND", () => {
    expect(
      evaluateDeliveryGate(gReq({ cohort_product_id: "22222222-2222-2222-2222-222222222222" }), gCohort(), NOW),
    ).toEqual({ ok: false, code: "ACCESS_REQUEST_NOT_FOUND" });
  });

  it("not APPROVED / not decided → DELIVERY_NOT_AUTHORIZED", () => {
    for (const status of ["PENDING", "DENIED", "REVOKED", "EXPIRED"] as const) {
      expect(evaluateDeliveryGate(gReq({ status }), gCohort(), NOW)).toEqual({
        ok: false,
        code: "DELIVERY_NOT_AUTHORIZED",
      });
    }
    expect(evaluateDeliveryGate(gReq({ decided_at: null }), gCohort(), NOW)).toEqual({
      ok: false,
      code: "DELIVERY_NOT_AUTHORIZED",
    });
  });

  it("expired access window → REQUEST_EXPIRED; future window → ok", () => {
    expect(evaluateDeliveryGate(gReq({ expires_at: PAST }), gCohort(), NOW)).toEqual({
      ok: false,
      code: "REQUEST_EXPIRED",
    });
    expect(evaluateDeliveryGate(gReq({ expires_at: FUTURE }), gCohort(), NOW)).toEqual({ ok: true });
  });
});

type ViewCohort = Parameters<typeof buildDeliveryView>[0];
type ViewRequest = Parameters<typeof buildDeliveryView>[1];

function vCohort(overrides: Partial<ViewCohort> = {}): ViewCohort {
  return { cohort_product_id: COHORT_ID, minimum_cohort_size: 50, proof_required: true, ...overrides } as ViewCohort;
}
function vReq(mode: string): ViewRequest {
  return { request_id: "33333333-3333-3333-3333-333333333333", requested_access_mode: mode } as ViewRequest;
}

describe("Phase 1308-A — buildDeliveryView", () => {
  it("threshold met → gate_passed, proof minted, threshold_enforced=true, signal_available=false", () => {
    const v = buildDeliveryView(vCohort(), vReq("PROOF_ONLY"), 50, NOW);
    expect(v.threshold_enforced).toBe(true);
    expect(v.threshold_met).toBe(true);
    expect(v.gate_passed).toBe(true);
    expect(v.suppressed_reason).toBeNull();
    expect(v.signal_available).toBe(false);
    expect(v.privacy_method).toBe("MINIMUM_COHORT_SIZE_THRESHOLD_ONLY");
    expect(v.proof).not.toBeNull();
    expect(v.proof?.proof_basis).toBe("ELIGIBLE_CONTRIBUTOR_THRESHOLD_MET");
    // PROOF_ONLY carries no signal envelope.
    expect(v.signal).toBeNull();
  });

  it("threshold NOT met → honest suppression (no proof, no signal, no exact count)", () => {
    const v = buildDeliveryView(vCohort(), vReq("AGGREGATED_SIGNAL"), 49, NOW);
    expect(v.threshold_met).toBe(false);
    expect(v.gate_passed).toBe(false);
    expect(v.suppressed_reason).toBe("MINIMUM_COHORT_SIZE_NOT_MET");
    expect(v.proof).toBeNull();
    expect(v.signal).toBeNull();
    expect(v.signal_available).toBe(false);
    // The exact eligible count (49) must never appear anywhere in the view.
    expect(JSON.stringify(v)).not.toContain("49");
  });

  it("AGGREGATED_SIGNAL / DEPERSONALIZED_SIGNAL are structurally distinct envelopes, no numeric aggregate", () => {
    for (const mode of ["AGGREGATED_SIGNAL", "DEPERSONALIZED_SIGNAL"] as const) {
      const v = buildDeliveryView(vCohort(), vReq(mode), 60, NOW);
      expect(v.signal?.kind).toBe(mode);
      expect(v.signal?.numeric_aggregate_available).toBe(false);
      // proof is also present (the governed deliverable) regardless of mode.
      expect(v.proof).not.toBeNull();
    }
  });

  it("the exact eligible count never leaks into the view (even when far above floor)", () => {
    const v = buildDeliveryView(vCohort({ minimum_cohort_size: 50 }), vReq("AGGREGATED_SIGNAL"), 1234, NOW);
    expect(v.threshold_met).toBe(true);
    expect(JSON.stringify(v)).not.toContain("1234");
  });
});
