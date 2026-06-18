// FILE: retention-policy.service.ts
// PURPOSE: Phase 1298-A — make RETENTION real and enforceable across the data
//          marketplace. A pure, deterministic retention evaluator
//          (evaluateRetentionPolicy / computeExpiryFromRetentionPolicy /
//          normalizeRetentionPolicy) plus a maintenance SWEEP
//          (FoundationRetentionService.sweepExpiredMarketplaceAccess) so access
//          can never live longer than policy allows.
//
//          Two-layer enforcement: (1) LAZY at use — grant creation derives a
//          finite expiry, and grant read fails closed on expired
//          grant/consent/review; (2) SWEEP — a deterministic maintenance pass
//          marks expired ACTIVE grants + APPROVED reviews EXPIRED and audits
//          expired consents. Foundation remains authority; retention is
//          enforced in code, not advisory. Raw content is never delivered;
//          economics stay mock-only; no app/agent/device/LLM/Python/BEAM may
//          extend retention.
//
//          Fail-closed for HIGH-SENSITIVITY: never UNTIL_REVOKED, ALWAYS a
//          finite expiry. Missing retention on a high-sensitivity package
//          DEFAULT-APPLIES a finite window (audited) rather than denying a grant
//          1296-A made grantable; an explicit UNTIL_REVOKED or an unrecognized
//          retention string on high-sensitivity is rejected; the window is
//          capped (90d) and never outlives a governing human review.
//
// CONNECTS TO:
//   - apps/api/src/services/foundation/high-sensitivity-policy.ts
//     (isHighSensitivityPackage — the high-sensitivity discriminator).
//   - apps/api/src/services/foundation/marketplace.service.ts
//     (createDataGrantForCaller derives + validates grant/consent expiry).
//   - apps/api/src/services/foundation/high-sensitivity-review.service.ts
//     (approval expiry capped; resolver returns review expiry).
//   - apps/api/src/services/foundation/marketplace-data-delivery.service.ts
//     (read fails closed + lazily expires/audits).
//   - apps/api/src/services/feedback/scheduler.ts (hourly sweep tick).
//   - packages/database (MarketplaceDataGrant / MarketplaceDataConsent /
//     HighSensitivityReview + writeAuditEvent).
//
// SAFETY: lifecycle metadata only — never raw capsule body / payload /
// content_hash / storage_location / embeddings / PII / secrets.

import {
  prisma,
  writeAuditEvent,
  SYSTEM_PRINCIPALS,
} from "@niov/database";
import { isHighSensitivityPackage } from "./high-sensitivity-policy.js";

// Closed retention vocabulary (canonical; not scattered strings).
export const RETENTION_POLICY_KINDS = [
  "SESSION_ONLY",
  "ONE_DAY",
  "SEVEN_DAYS",
  "THIRTY_DAYS",
  "NINETY_DAYS",
  "ONE_YEAR",
  "UNTIL_REVOKED",
  "CUSTOM_EXPIRES_AT",
] as const;
export type RetentionPolicyKind = (typeof RETENTION_POLICY_KINDS)[number];

export const RETENTION_REASON_CODES = [
  "RETENTION_POLICY_REQUIRED",
  "RETENTION_POLICY_UNKNOWN",
  "RETENTION_EXPIRES_AT_REQUIRED",
  "RETENTION_EXPIRES_AT_IN_PAST",
  "RETENTION_UNTIL_REVOKED_NOT_ALLOWED",
  "RETENTION_TOO_LONG_FOR_SENSITIVITY",
  "RETENTION_EXPIRED",
  "GRANT_EXPIRED",
  "CONSENT_EXPIRED",
  "REVIEW_EXPIRED",
  "PACKAGE_EXPIRED",
  "RETENTION_ALLOWED",
  "RETENTION_DEFAULT_APPLIED",
] as const;
export type RetentionReasonCode = (typeof RETENTION_REASON_CODES)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// High-sensitivity ceiling + default window (no perpetual high-sensitivity
// access; missing retention on a high-sensitivity package gets this default).
const HS_MAX_MS = 90 * DAY_MS;
const HS_DEFAULT_MS = 30 * DAY_MS;

export interface RetentionDecision {
  allowed: boolean;
  expires_at: string | null;
  retention_policy: string;
  reason_codes: RetentionReasonCode[];
  requires_finite_expiry: boolean;
  applied_default: boolean;
  audit_required: boolean;
}

export interface RetentionInput {
  retention_policy?: string | null;
  sensitivity_class: string;
  sensitive_categories: string[];
  // Caller-provided explicit expiry (ISO) — wins over the policy kind.
  explicit_expires_at?: string | null;
  // A governing human review's expiry (reviewed high-sensitivity path) — the
  // grant must never outlive it.
  review_expires_at?: Date | null;
  now: Date;
}

// WHAT: Normalize a free-text retention_policy to a known kind.
// INPUT: the stored string (may be null/empty/unknown).
// OUTPUT: a RetentionPolicyKind, "UNKNOWN" (non-empty unrecognized), or null
//         (absent). Absent vs UNKNOWN matters: absent on high-sensitivity
//         default-applies; UNKNOWN on high-sensitivity is rejected.
export function normalizeRetentionPolicy(
  value: string | null | undefined,
): RetentionPolicyKind | "UNKNOWN" | null {
  if (value === null || value === undefined) return null;
  const v = value.trim().toUpperCase();
  if (v.length === 0) return null;
  if ((RETENTION_POLICY_KINDS as readonly string[]).includes(v))
    return v as RetentionPolicyKind;
  return "UNKNOWN";
}

// WHAT: Compute a concrete expiry from a finite retention kind.
// INPUT: the kind + the reference "now".
// OUTPUT: a Date, or null for unbounded/explicit kinds (handled by the caller).
export function computeExpiryFromRetentionPolicy(
  kind: RetentionPolicyKind,
  now: Date,
): Date | null {
  const t = now.getTime();
  switch (kind) {
    case "SESSION_ONLY":
      return new Date(t + HOUR_MS);
    case "ONE_DAY":
      return new Date(t + DAY_MS);
    case "SEVEN_DAYS":
      return new Date(t + 7 * DAY_MS);
    case "THIRTY_DAYS":
      return new Date(t + 30 * DAY_MS);
    case "NINETY_DAYS":
      return new Date(t + 90 * DAY_MS);
    case "ONE_YEAR":
      return new Date(t + 365 * DAY_MS);
    case "UNTIL_REVOKED":
    case "CUSTOM_EXPIRES_AT":
      return null;
  }
}

// WHAT: Decide the finite expiry (and allow/deny) for a marketplace grant under
//        its package's retention policy + sensitivity.
// INPUT: a RetentionInput.
// OUTPUT: a RetentionDecision (pure + deterministic).
// WHY: the single retention authority — grant creation derives expiry from it,
//      and it fails closed for high-sensitivity (never UNTIL_REVOKED).
export function evaluateRetentionPolicy(input: RetentionInput): RetentionDecision {
  const isHS = isHighSensitivityPackage(
    input.sensitivity_class,
    input.sensitive_categories,
  );
  const normalized = normalizeRetentionPolicy(input.retention_policy);
  const policyLabel =
    normalized === null ? "NONE" : normalized === "UNKNOWN" ? "UNKNOWN" : normalized;

  const deny = (code: RetentionReasonCode): RetentionDecision => ({
    allowed: false,
    expires_at: null,
    retention_policy: policyLabel,
    reason_codes: [code],
    requires_finite_expiry: isHS,
    applied_default: false,
    audit_required: true,
  });

  const reasons: RetentionReasonCode[] = [];
  let expiresAt: Date | null = null;
  let appliedDefault = false;

  // 1) An explicit caller expiry wins over the policy kind.
  if (typeof input.explicit_expires_at === "string" && input.explicit_expires_at.length > 0) {
    const d = new Date(input.explicit_expires_at);
    if (Number.isNaN(d.getTime())) return deny("RETENTION_EXPIRES_AT_REQUIRED");
    if (d <= input.now) return deny("RETENTION_EXPIRES_AT_IN_PAST");
    expiresAt = d;
  } else if (normalized === "UNTIL_REVOKED") {
    if (isHS) return deny("RETENTION_UNTIL_REVOKED_NOT_ALLOWED");
    expiresAt = null; // unbounded permitted only for standard/low sensitivity
  } else if (normalized === "UNKNOWN") {
    if (isHS) return deny("RETENTION_POLICY_UNKNOWN");
    expiresAt = null; // standard: treat an unknown label as until-revoked
    reasons.push("RETENTION_POLICY_UNKNOWN");
  } else if (normalized !== null) {
    // A recognized finite (or CUSTOM, handled above) kind.
    expiresAt = computeExpiryFromRetentionPolicy(normalized, input.now);
    if (expiresAt === null && isHS) {
      // CUSTOM_EXPIRES_AT with no explicit expiry on high-sensitivity.
      return deny("RETENTION_EXPIRES_AT_REQUIRED");
    }
  } else {
    // No policy declared.
    if (isHS) {
      expiresAt = new Date(input.now.getTime() + HS_DEFAULT_MS);
      appliedDefault = true;
      reasons.push("RETENTION_DEFAULT_APPLIED");
    } else {
      expiresAt = null; // standard: until-revoked
    }
  }

  // 2) High-sensitivity invariants: ALWAYS finite, capped, never outlives a
  //    governing review.
  if (isHS) {
    if (expiresAt === null) {
      expiresAt = new Date(input.now.getTime() + HS_DEFAULT_MS);
      appliedDefault = true;
      reasons.push("RETENTION_DEFAULT_APPLIED");
    }
    if (expiresAt.getTime() - input.now.getTime() > HS_MAX_MS)
      return deny("RETENTION_TOO_LONG_FOR_SENSITIVITY");
    if (
      input.review_expires_at instanceof Date &&
      input.review_expires_at < expiresAt
    )
      expiresAt = input.review_expires_at;
  }

  reasons.push("RETENTION_ALLOWED");
  return {
    allowed: true,
    expires_at: expiresAt?.toISOString() ?? null,
    retention_policy: policyLabel,
    reason_codes: reasons,
    requires_finite_expiry: isHS,
    applied_default: appliedDefault,
    audit_required: true,
  };
}

export interface RetentionSweepResult {
  grants_expired: number;
  reviews_expired: number;
  consents_expired: number;
  items_processed: number;
  evaluated_at: string;
}

export class FoundationRetentionService {
  // WHAT: Maintenance sweep — mark expired ACTIVE grants + APPROVED reviews
  //        EXPIRED and audit expired consents. Deterministic + idempotent
  //        (only past-expiry ACTIVE/APPROVED rows match; after marking they
  //        never re-match). Never deletes a row; never touches audit history.
  // INPUT: an optional reference "now" (for tests).
  // OUTPUT: counts of what was expired.
  // WHY: Layer 2 enforcement — no stale approved access lingers beyond policy.
  //      Runs under SYSTEM_PRINCIPALS.SCHEDULER (no caller); invoked by the cron
  //      tick in production and directly by tests.
  async sweepExpiredMarketplaceAccess(
    now: Date = new Date(),
  ): Promise<RetentionSweepResult> {
    // 1) Expired ACTIVE grants → EXPIRED (+ audit each; + its consent if lapsed).
    const grants = await prisma.marketplaceDataGrant.findMany({
      where: { status: "ACTIVE", expires_at: { not: null, lt: now } },
      take: 500,
    });
    let consentsExpired = 0;
    for (const g of grants) {
      await prisma.marketplaceDataGrant.update({
        where: { grant_id: g.grant_id },
        data: { status: "EXPIRED" },
      });
      await writeAuditEvent({
        event_type: "MARKETPLACE_DATA_GRANT_EXPIRED",
        outcome: "SUCCESS",
        actor_entity_id: null,
        system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
        details: {
          action: "MARKETPLACE_DATA_GRANT_EXPIRED",
          grant_id: g.grant_id,
          listing_id: g.listing_id,
          data_package_id: g.data_package_id,
          access_mode: g.access_mode,
          expires_at: g.expires_at?.toISOString() ?? null,
          result: "EXPIRED",
          source: "SWEEP",
        },
      });
      // Audit the linked consent's expiry alongside the grant transition (bounds
      // consent-expiry audit to the grant lifecycle; consents have no status).
      if (g.consent_record_id !== null) {
        const consent = await prisma.marketplaceDataConsent.findFirst({
          where: { consent_id: g.consent_record_id },
        });
        if (
          consent !== null &&
          consent.revoked_at === null &&
          consent.expires_at !== null &&
          consent.expires_at < now
        ) {
          consentsExpired += 1;
          await writeAuditEvent({
            event_type: "MARKETPLACE_DATA_CONSENT_EXPIRED",
            outcome: "SUCCESS",
            actor_entity_id: null,
            system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
            details: {
              action: "MARKETPLACE_DATA_CONSENT_EXPIRED",
              consent_id: consent.consent_id,
              listing_id: consent.listing_id,
              data_package_id: consent.data_package_id,
              expires_at: consent.expires_at.toISOString(),
              result: "EXPIRED",
              source: "SWEEP",
            },
          });
        }
      }
    }

    // 2) Expired APPROVED high-sensitivity reviews → EXPIRED (+ audit each).
    const reviews = await prisma.highSensitivityReview.findMany({
      where: { status: "APPROVED", expires_at: { not: null, lt: now } },
      take: 500,
    });
    for (const r of reviews) {
      await prisma.highSensitivityReview.update({
        where: { review_id: r.review_id },
        data: { status: "EXPIRED" },
      });
      await writeAuditEvent({
        event_type: "HIGH_SENSITIVITY_REVIEW_EXPIRED",
        outcome: "SUCCESS",
        actor_entity_id: null,
        system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
        details: {
          action: "HIGH_SENSITIVITY_REVIEW_EXPIRED",
          review_id: r.review_id,
          listing_id: r.listing_id,
          data_package_id: r.data_package_id,
          sensitivity_class: r.sensitivity_class,
          expires_at: r.expires_at?.toISOString() ?? null,
          result: "EXPIRED",
          source: "SWEEP",
        },
      });
    }

    const result: RetentionSweepResult = {
      grants_expired: grants.length,
      reviews_expired: reviews.length,
      consents_expired: consentsExpired,
      items_processed: grants.length + reviews.length + consentsExpired,
      evaluated_at: now.toISOString(),
    };

    await writeAuditEvent({
      event_type: "RETENTION_SWEEP_COMPLETED",
      outcome: "SUCCESS",
      actor_entity_id: null,
      system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
      details: { action: "RETENTION_SWEEP_COMPLETED", ...result },
    });

    return result;
  }
}
