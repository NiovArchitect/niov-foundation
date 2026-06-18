// FILE: cohort-delivery.service.ts
// PURPOSE: Phase 1308-A — the governed COHORT PROOF + SAFE-SIGNAL DELIVERY gate.
//          This is the delivery layer 1305-A (registry) / 1306-A (contribution
//          accounting) / 1307-A (access-request lifecycle) deferred. It is the
//          ONE place where the `minimum_cohort_size` floor is finally ENFORCED:
//          `threshold_enforced` flips to TRUE here. A buyer with an APPROVED,
//          non-expired access request asks to deliver; the gate enforces the
//          threshold against the LIVE eligible-contributor count and returns a
//          SAFE proof-of-threshold artifact — or an honest suppression.
//
//          SAFETY / HONESTY (non-negotiable):
//          - NO raw capsule content, NO contributor identities, NO exact
//            contributor count, NO per-contributor data ever reaches the buyer.
//          - NO fake privacy math: the ONLY privacy mechanism is the
//            minimum_cohort_size threshold gate (`privacy_method:
//            "MINIMUM_COHORT_SIZE_THRESHOLD_ONLY"`) — NOT k-anonymity, NOT
//            differential privacy, NOT a real aggregation guarantee.
//          - The numeric aggregate signal is honestly deferred
//            (`signal_available: false`) — 1308-A delivers a governed
//            proof-of-threshold, not a numeric cohort aggregate. Real numeric
//            aggregate payloads are forward-substrate pending real buyer demand
//            + a privacy review.
//          - NO payout, NO settlement, NO revenue share (mock-only economics
//            land later in 1309-A, which meters off the audit events here).
//
//          GATE (all required): an APPROVED access request owned by the caller
//          (buyer), not expired, not revoked; the cohort ACTIVE; CHILDREN data
//          hard re-blocked (defense-in-depth — already DENIED at request intake
//          per 1307-A, re-checked here); and the LIVE eligible-contributor count
//          (consent-aware, uncapped) >= minimum_cohort_size.
//
// CONNECTS TO: packages/database CohortDataProduct + CohortAccessRequest +
//              CohortContribution + MarketplaceDataConsent + prisma +
//              writeAuditEvent (COHORT_SIGNAL_DELIVERED / _SUPPRESSED / _DENIED);
//              apps/api/src/services/auth.service.ts (validateSession);
//              apps/api/src/services/foundation/cohort-contribution.service.ts
//              (isContributionEligible — the consent-aware eligibility predicate);
//              apps/api/src/routes/cohort.routes.ts (HTTP surface).
//
// SAFETY: bearer-gated; the request must belong to the caller as BUYER
// (enumeration-safe ACCESS_REQUEST_NOT_FOUND). The SAFE projection never carries
// identities / raw bodies / exact counts. Audit details carry IDs / enums /
// booleans / the internal eligible count (audit is internal, never buyer-facing).

import {
  prisma,
  writeAuditEvent,
  type CohortAccessRequest,
  type CohortDataProduct,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { isContributionEligible } from "./cohort-contribution.service.js";

// ── SAFE projection (no identities, no raw bodies, no exact counts) ──────────

export interface CohortProof {
  // The governed deliverable: an attestation that the cohort met its declared
  // minimum eligible-contributor floor and the access mode was authorized.
  proof_basis: "ELIGIBLE_CONTRIBUTOR_THRESHOLD_MET";
  access_mode: string;
  minimum_cohort_size: number;
  threshold_met: true;
  generated_at: string;
}

export interface CohortSignalEnvelope {
  // Structurally distinguishes AGGREGATED_SIGNAL vs DEPERSONALIZED_SIGNAL while
  // honestly carrying NO numeric aggregate in 1308-A.
  kind: string;
  // Honest marker — no numeric aggregate payload is delivered in 1308-A.
  numeric_aggregate_available: false;
  note: string;
}

export interface CohortDeliveryView {
  cohort_product_id: string;
  access_request_id: string;
  access_mode: string;
  // THE FLIP — in 1308-A the minimum_cohort_size floor is genuinely enforced.
  threshold_enforced: true;
  threshold_met: boolean;
  // Whether the governed gate passed (authorized + active + threshold met).
  gate_passed: boolean;
  minimum_cohort_size: number;
  // Set when gate did NOT pass on the threshold (honest suppression).
  suppressed_reason: string | null;
  // The ONLY privacy mechanism — NOT k-anonymity, NOT differential privacy.
  privacy_method: "MINIMUM_COHORT_SIZE_THRESHOLD_ONLY";
  raw_body_excluded: true;
  contributor_identities_excluded: true;
  // Numeric cohort aggregate is honestly deferred — forward-substrate.
  signal_available: false;
  // The governed deliverable when the gate passes (else null).
  proof: CohortProof | null;
  // Structural envelope for AGGREGATED_SIGNAL / DEPERSONALIZED_SIGNAL (else null).
  signal: CohortSignalEnvelope | null;
  honest_note: string;
  generated_at: string;
}

const HONEST_NOTE =
  "Governed threshold-gated cohort delivery. The only privacy mechanism is the " +
  "minimum_cohort_size floor (NOT k-anonymity, NOT differential privacy, NOT a " +
  "real aggregation guarantee). No raw capsule content, no contributor " +
  "identities, no exact contributor count. The numeric cohort aggregate is not " +
  "delivered in this phase (signal_available=false); it is forward-substrate " +
  "pending real buyer demand and a privacy review.";

// ── Pure delivery gate (no I/O — unit-testable) ─────────────────────────────

export type DeliveryGateResult =
  | { ok: false; code: string }
  | { ok: true };

// WHAT: Decide whether a delivery may proceed for an access request + cohort.
// INPUT: the request row, the cohort row, the evaluation instant.
// OUTPUT: ok, or a refusal code. WHY: an APPROVED, non-expired, non-revoked
//        request against an ACTIVE cohort — and CHILDREN data hard re-blocked
//        even if (impossibly) it slipped through 1307-A intake. NOTE: high-
//        sensitivity is NOT re-blocked here — a human already cleared it via the
//        1307-A requires_review approval; re-blocking would break legitimately
//        approved deliveries. CHILDREN is the only hard re-block.
export function evaluateDeliveryGate(
  request: Pick<CohortAccessRequest, "status" | "decided_at" | "expires_at" | "cohort_product_id">,
  cohort: Pick<CohortDataProduct, "cohort_product_id" | "status" | "sensitive_categories" | "deleted_at">,
  now: Date,
): DeliveryGateResult {
  // Defense-in-depth: children's data is never delivered, full stop.
  if (cohort.sensitive_categories.includes("CHILDREN"))
    return { ok: false, code: "CHILDREN_DATA_BLOCKED" };
  if (cohort.deleted_at !== null || cohort.status !== "ACTIVE")
    return { ok: false, code: "COHORT_NOT_ACTIVE" };
  if (request.cohort_product_id !== cohort.cohort_product_id)
    return { ok: false, code: "ACCESS_REQUEST_NOT_FOUND" };
  // Only an APPROVED, decided request confers delivery permission.
  if (request.status !== "APPROVED" || request.decided_at === null)
    return { ok: false, code: "DELIVERY_NOT_AUTHORIZED" };
  // An expired access window forbids delivery (no perpetual access).
  if (request.expires_at !== null && request.expires_at.getTime() <= now.getTime())
    return { ok: false, code: "REQUEST_EXPIRED" };
  return { ok: true };
}

// WHAT: Build the SAFE delivery view once the gate has passed and the live
//        eligible count is known.
// INPUT: cohort + request + the accurate live eligible count + instant.
// OUTPUT: the buyer-facing SAFE projection. WHY: this is where threshold_met is
//        computed against minimum_cohort_size (the enforced floor) and the
//        proof-of-threshold artifact is minted. NO exact count leaves this
//        function; signal_available stays false (numeric aggregate deferred).
export function buildDeliveryView(
  cohort: Pick<CohortDataProduct, "cohort_product_id" | "minimum_cohort_size" | "proof_required">,
  request: Pick<CohortAccessRequest, "request_id" | "requested_access_mode">,
  liveEligibleCount: number,
  now: Date,
): CohortDeliveryView {
  const thresholdMet = liveEligibleCount >= cohort.minimum_cohort_size;
  const mode = request.requested_access_mode;
  const generatedAt = now.toISOString();

  const proof: CohortProof | null = thresholdMet
    ? {
        proof_basis: "ELIGIBLE_CONTRIBUTOR_THRESHOLD_MET",
        access_mode: mode,
        minimum_cohort_size: cohort.minimum_cohort_size,
        threshold_met: true,
        generated_at: generatedAt,
      }
    : null;

  // Structural envelope for the signal modes (no numeric aggregate in 1308-A).
  const signal: CohortSignalEnvelope | null =
    thresholdMet && (mode === "AGGREGATED_SIGNAL" || mode === "DEPERSONALIZED_SIGNAL")
      ? {
          kind: mode,
          numeric_aggregate_available: false,
          note:
            "Structured signal envelope. No numeric aggregate is delivered in " +
            "this phase — forward-substrate pending real buyer demand + privacy review.",
        }
      : null;

  return {
    cohort_product_id: cohort.cohort_product_id,
    access_request_id: request.request_id,
    access_mode: mode,
    threshold_enforced: true,
    threshold_met: thresholdMet,
    gate_passed: thresholdMet,
    minimum_cohort_size: cohort.minimum_cohort_size,
    suppressed_reason: thresholdMet ? null : "MINIMUM_COHORT_SIZE_NOT_MET",
    privacy_method: "MINIMUM_COHORT_SIZE_THRESHOLD_ONLY",
    raw_body_excluded: true,
    contributor_identities_excluded: true,
    signal_available: false,
    proof,
    signal,
    honest_note: HONEST_NOTE,
    generated_at: generatedAt,
  };
}

// ── Result type ──────────────────────────────────────────────────────────────

export type DeliverCohortSignalResult =
  | { ok: true; delivery: CohortDeliveryView }
  | { ok: false; code: string };

export class CohortDeliveryService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Accurately count the LIVE eligible contributors for a cohort —
  //        consent-aware and UNCAPPED (a coarse band would be a false aggregate
  //        if capped). No-consent eligible rows are counted in SQL; consent-
  //        bearing eligible-by-row rows are filtered by their consent's live
  //        state. The exact count never leaves the service (buyer sees only a
  //        boolean threshold_met).
  // WHY: the threshold-enforcement decision must be accurate, not approximate.
  private async liveEligibleCount(cohortProductId: string, now: Date): Promise<number> {
    const windowOpen = {
      OR: [{ eligible_from: null }, { eligible_from: { lte: now } }],
      AND: [{ OR: [{ eligible_until: null }, { eligible_until: { gt: now } }] }],
    };

    // No-consent eligible rows: a pure, exact count (no consent dependency).
    const noConsentEligible = await prisma.cohortContribution.count({
      where: {
        cohort_product_id: cohortProductId,
        deleted_at: null,
        status: "ELIGIBLE",
        consent_record_id: null,
        ...windowOpen,
      },
    });

    // Consent-bearing eligible-by-row rows: load only their consent ids
    // (uncapped — bounded by the cohort's consent-bearing membership), then
    // count those whose consent is currently live (revoked_at null + unexpired).
    const consentRows = await prisma.cohortContribution.findMany({
      where: {
        cohort_product_id: cohortProductId,
        deleted_at: null,
        status: "ELIGIBLE",
        consent_record_id: { not: null },
        ...windowOpen,
      },
      select: { consent_record_id: true },
    });
    if (consentRows.length === 0) return noConsentEligible;

    const consentIds = [
      ...new Set(consentRows.map((r) => r.consent_record_id).filter((x): x is string => x !== null)),
    ];
    const consents = await prisma.marketplaceDataConsent.findMany({
      where: { consent_id: { in: consentIds } },
      select: { consent_id: true, revoked_at: true, expires_at: true },
    });
    const liveById = new Set<string>();
    for (const c of consents) {
      const live =
        c.revoked_at === null && (c.expires_at === null || c.expires_at.getTime() > now.getTime());
      if (live) liveById.add(c.consent_id);
    }
    // Re-run the pure eligibility predicate per row for the consent dimension so
    // the source of truth stays isContributionEligible (status/window already
    // enforced by the query; consentActive is the only remaining factor).
    const consentEligible = consentRows.filter((r) =>
      isContributionEligible(
        {
          status: "ELIGIBLE",
          deleted_at: null,
          eligible_from: null,
          eligible_until: null,
          consent_record_id: r.consent_record_id,
        },
        now,
        r.consent_record_id !== null ? liveById.has(r.consent_record_id) : true,
      ),
    ).length;

    return noConsentEligible + consentEligible;
  }

  // WHAT: Deliver a governed proof-of-threshold for an APPROVED access request
  //        (buyer-initiated). Returns a SAFE projection — or an honest
  //        suppression when the threshold is not met.
  // WHY: POST /api/v1/foundation/cohorts/:id/access-requests/:rid/deliver.
  //      NOTE (intentional): there is NO entity_type/human gate here — the human
  //      gate fired at 1307-A decide-time; an AI buyer consuming an aggregate
  //      under a human-approved grant is in-bounds (consuming != granting).
  async deliverCohortSignalForCaller(
    sessionToken: string,
    cohortProductId: string,
    requestId: string,
  ): Promise<DeliverCohortSignalResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    // The request must belong to the caller as BUYER (enumeration-safe).
    const request = await prisma.cohortAccessRequest.findFirst({
      where: {
        request_id: requestId,
        cohort_product_id: cohortProductId,
        buyer_entity_id: v.entity_id,
        deleted_at: null,
      },
    });
    if (request === null) return { ok: false, code: "ACCESS_REQUEST_NOT_FOUND" };

    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId },
    });
    if (cohort === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const now = new Date();
    const gate = evaluateDeliveryGate(request, cohort, now);
    if (gate.ok === false) {
      await writeAuditEvent({
        event_type: "COHORT_DELIVERY_DENIED",
        outcome: "DENIED",
        actor_entity_id: v.entity_id,
        details: {
          action: "COHORT_DELIVERY_DENIED",
          cohort_product_id: cohort.cohort_product_id,
          access_request_id: request.request_id,
          access_mode: request.requested_access_mode,
          reason: gate.code,
          delivered: false,
          threshold_enforced: true,
        },
      });
      return { ok: false, code: gate.code };
    }

    const eligibleCount = await this.liveEligibleCount(cohort.cohort_product_id, now);
    const delivery = buildDeliveryView(cohort, request, eligibleCount, now);

    await writeAuditEvent({
      event_type: delivery.gate_passed ? "COHORT_SIGNAL_DELIVERED" : "COHORT_DELIVERY_SUPPRESSED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: delivery.gate_passed ? "COHORT_SIGNAL_DELIVERED" : "COHORT_DELIVERY_SUPPRESSED",
        cohort_product_id: cohort.cohort_product_id,
        access_request_id: request.request_id,
        access_mode: request.requested_access_mode,
        delivered: delivery.gate_passed,
        threshold_met: delivery.threshold_met,
        threshold_enforced: true,
        // Internal metering signal for 1309-A — audit is never buyer-facing.
        eligible_count: eligibleCount,
        minimum_cohort_size: cohort.minimum_cohort_size,
        signal_available: false,
      },
    });

    return { ok: true, delivery };
  }
}
