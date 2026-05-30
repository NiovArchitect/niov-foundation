// FILE: analytics.service.ts
// PURPOSE: Section 6 Enterprise Analytics — SAFE projection
//          aggregates per ADR-0061. Each method returns a
//          closed-vocabulary aggregate over the caller's own
//          org's operational signals; same-org scope enforced
//          at every query; k=5 minimum-population threshold
//          enforced before any numeric value is surfaced;
//          ADMIN_ACTION + details.action = "ANALYTICS_READ"
//          audit emitted on every read (no new audit literal).
// CONNECTS TO:
//   - apps/api/src/routes/analytics.routes.ts (admin route layer)
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability gate handled at route tier)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - packages/database/src/queries/audit.ts (writeAuditEvent)
//   - ADR-0061 Section 6 Enterprise Analytics v1 SAFE Projection
//     Pattern

import { prisma, writeAuditEvent } from "@niov/database";

// WHAT: The k=5 minimum-population threshold default per
//        ADR-0061 §1.c (HIPAA Safe Harbor 45 CFR §164.514(b)(1)
//        regulatory precedent).
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Hardcoded at the service tier per ADR-0061 — lowering
//      below 5 weakens privacy posture and requires separate
//      Founder authorization. Frozen anchor so the threshold
//      cannot be inadvertently changed by a future config edit.
export const ANALYTICS_MIN_POPULATION = 5;

// WHAT: Window-days clamp range per analytics-query input
//        validation.
// INPUT: Used as constants.
// OUTPUT: Numbers.
// WHY: Prevents pathological inputs (window_days = 0 or 365)
//      from either trivially returning empty results or
//      causing slow aggregate queries. 7d is the v1 product
//      default per Founder direction; clamp range 1..30 is
//      generous enough for monthly views, narrow enough to
//      keep queries cheap.
export const ANALYTICS_WINDOW_DAYS_DEFAULT = 7;
export const ANALYTICS_WINDOW_DAYS_MIN = 1;
export const ANALYTICS_WINDOW_DAYS_MAX = 30;

// WHAT: The closed-vocabulary signal labels for the
//        correction-velocity aggregate.
// INPUT: Used as a value array + TS literal-union type.
// OUTPUT: None.
// WHY: ADR-0061 §1.a closed-vocab outputs. Operators see a
//      stable label rather than a raw count comparison that
//      could be re-engineered into per-employee inference.
//      The thresholds for ELEVATED / TYPICAL / QUIET are
//      simple integer comparisons; they do NOT use any
//      employee-level scoring.
export const CORRECTION_VELOCITY_LABELS = [
  "ELEVATED",
  "TYPICAL",
  "QUIET",
  "INSUFFICIENT_POPULATION",
] as const;

export type CorrectionVelocityLabel =
  (typeof CORRECTION_VELOCITY_LABELS)[number];

// WHAT: Threshold table for correction-velocity → signal label
//        mapping (corrections per member per 7d).
// INPUT: Used as a constant.
// OUTPUT: Number.
// WHY: ADR-0061 §1.a closed-vocab — the label, not the raw
//      ratio, is what surfaces in admin responses. Operators
//      get policy-relevant signal without numeric distraction.
//      `ELEVATED` triggers at >= 1.0 corrections-per-member-per-7d
//      (high signal noise in the org); `QUIET` triggers at
//      <= 0.2 (low engagement); `TYPICAL` is the middle band.
const VELOCITY_ELEVATED_THRESHOLD = 1.0;
const VELOCITY_QUIET_THRESHOLD = 0.2;

// WHAT: The SAFE projection envelope for the correction-
//        velocity-7d aggregate.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Closed-vocab fields only per ADR-0061 §1.a. NEVER
//      includes raw correction content, per-entity attribution,
//      capsule IDs, wallet IDs, or any field that would let an
//      operator re-identify which member raised which
//      correction.
export interface CorrectionVelocityAggregate {
  ok: true;
  aggregate: "CORRECTION_VELOCITY_7D";
  window_days: number;
  org_entity_id: string;
  member_count: number;
  redacted: boolean;
  correction_count: number | null;
  signal_label: CorrectionVelocityLabel;
  honest_note: string;
}

// WHAT: Closed-vocab signal labels for the action-runtime
//        success-rate aggregate.
// INPUT: Used as a value array + TS literal-union type.
// OUTPUT: None.
// WHY: ADR-0061 §1.a closed-vocab outputs. HEALTHY at >=0.9
//      success rate; DEGRADED at >=0.6 and <0.9; UNHEALTHY at
//      <0.6; INSUFFICIENT_VOLUME at <ACTION_RUNTIME_MIN_VOLUME
//      attempts (separate gate from k=5 population gate;
//      protects against high-variance signal at low N).
//      INSUFFICIENT_POPULATION when org member_count < k=5
//      (same gate as correction-velocity aggregate).
export const ACTION_RUNTIME_SUCCESS_LABELS = [
  "HEALTHY",
  "DEGRADED",
  "UNHEALTHY",
  "INSUFFICIENT_VOLUME",
  "INSUFFICIENT_POPULATION",
] as const;

export type ActionRuntimeSuccessLabel =
  (typeof ACTION_RUNTIME_SUCCESS_LABELS)[number];

// WHAT: Minimum attempt-volume threshold below which the
//        aggregate redacts to INSUFFICIENT_VOLUME. Distinct
//        from k=5 population gate.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: At low attempt volume, success-rate fluctuates wildly
//      (1 fail in 3 attempts = 67% success; signal-noise too
//      high to action). v1 picks 10 — enough samples for
//      stable signal, low enough not to redact small but
//      active orgs. Founder may raise per-aggregate
//      sensitivity later per ADR-0061 §8 checkpoint #2.
export const ACTION_RUNTIME_MIN_VOLUME = 10;

const SUCCESS_RATE_HEALTHY_THRESHOLD = 0.9;
const SUCCESS_RATE_DEGRADED_THRESHOLD = 0.6;

// WHAT: SAFE projection envelope for action-runtime success
//        rate aggregate.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Closed-vocab per ADR-0061 §1.a. Surfaces aggregate
//      counts (attempt_count) + per-outcome counts (which are
//      themselves aggregate counts, not per-attempt
//      attribution); NEVER attempt IDs / action IDs / worker
//      IDs / error_class / error_summary / payload_redacted.
//      success_rate is a derived ratio (0..1) — already an
//      aggregate quantity per ADR-0061 §1.a allowance for
//      "integer counts" extended naturally to rates derived
//      from those counts.
export interface ActionRuntimeSuccessRateAggregate {
  ok: true;
  aggregate: "ACTION_RUNTIME_SUCCESS_RATE";
  window_days: number;
  org_entity_id: string;
  member_count: number;
  redacted: boolean;
  attempt_count: number;
  succeeded_count: number | null;
  failed_count: number | null;
  timed_out_count: number | null;
  cancelled_count: number | null;
  success_rate: number | null;
  signal_label: ActionRuntimeSuccessLabel;
  honest_note: string;
}

// WHAT: Failure shape for analytics service tier.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors the existing playground / connector-binding
//      failure pattern. Route tier maps codes to HTTP status.
export type AnalyticsFailureCode =
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface AnalyticsFailure {
  ok: false;
  code: AnalyticsFailureCode;
  message: string;
  invalid_fields?: string[];
}

// WHAT: Honest-note copy for the correction-velocity aggregate.
// INPUT: Used as a constant.
// OUTPUT: Strings.
// WHY: ADR-0061 §1.a + ADR-0058 §7 SAFE-projection precedent —
//      every analytics aggregate surfaces honest_note copy
//      that explains the signal without overclaiming meaning.
//      Forbidden copy ("employee score", "performance index",
//      "manager dashboard", "surveillance signal") is
//      explicitly avoided.
const HONEST_NOTE_BELOW_THRESHOLD =
  `Population below k=${ANALYTICS_MIN_POPULATION}; numeric ` +
  `values redacted to prevent re-identification per ADR-0061.`;
const HONEST_NOTE_ABOVE_THRESHOLD =
  "Counts derived from same-org CORRECTION capsules in the " +
  "window. Signal label is operational only — not an employee " +
  "score, not a performance index, not a manager dashboard.";

// WHAT: The Section 6 Enterprise Analytics service.
// INPUT: None (no constructor dependencies at v1).
// OUTPUT: An instance with one method per aggregate.
// WHY: Methods take an already-resolved `org_entity_id` (the
//      route tier resolves it via getOrgEntityId BEFORE calling
//      the service — same pattern as connector-binding admin
//      service). This keeps the service tier purely focused on
//      the aggregate math + SAFE projection, with no auth /
//      org-resolution concerns.
export class AnalyticsService {
  // WHAT: Compute the org-wide CORRECTION-velocity aggregate
  //        over the requested window.
  // INPUT: Pre-resolved org_entity_id + window_days +
  //         actor_entity_id for audit emission.
  // OUTPUT: CorrectionVelocityAggregate | AnalyticsFailure.
  // WHY: Step-by-step:
  //   1. Validate window_days (clamp 1..30; default 7).
  //   2. Count active members of the org via EntityMembership
  //      (parent_id = orgId + child_id non-null + is_active).
  //   3. If member_count < k=5 → return SAFE redacted projection
  //      (no correction_count; signal_label =
  //      "INSUFFICIENT_POPULATION"). Emit audit with
  //      redacted: true.
  //   4. Otherwise, count CORRECTION capsules created within
  //      the window across the org members' wallets
  //      (capsule_type = "CORRECTION" + deleted_at = null +
  //      wallet.entity_id IN member entity IDs +
  //      created_at >= cutoff).
  //   5. Compute ratio = correction_count / member_count.
  //   6. Map ratio to closed-vocab signal_label.
  //   7. Emit ADMIN_ACTION + details.action = "ANALYTICS_READ"
  //      audit with aggregate + org_entity_id + redacted +
  //      result_count + filter_keys.
  //   8. Return SAFE projection envelope.
  async getCorrectionVelocityForOrg(args: {
    org_entity_id: string;
    actor_entity_id: string;
    window_days?: number;
    ip_address?: string | null;
  }): Promise<CorrectionVelocityAggregate | AnalyticsFailure> {
    const requestedWindow = args.window_days ?? ANALYTICS_WINDOW_DAYS_DEFAULT;
    if (
      !Number.isInteger(requestedWindow) ||
      requestedWindow < ANALYTICS_WINDOW_DAYS_MIN ||
      requestedWindow > ANALYTICS_WINDOW_DAYS_MAX
    ) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: `window_days must be an integer in [${ANALYTICS_WINDOW_DAYS_MIN}, ${ANALYTICS_WINDOW_DAYS_MAX}]`,
        invalid_fields: ["window_days"],
      };
    }
    const windowDays = requestedWindow;

    // Step 2 — resolve active org membership.
    const memberships = await prisma.entityMembership.findMany({
      where: {
        parent_id: args.org_entity_id,
        is_active: true,
      },
      select: { child_id: true },
    });
    const memberEntityIds = memberships.map((m) => m.child_id);
    const memberCount = memberEntityIds.length;

    // Step 3 — k=5 minimum-population gate.
    if (memberCount < ANALYTICS_MIN_POPULATION) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "CORRECTION_VELOCITY_7D",
        redacted: true,
        result_count: 0,
        filter_keys: ["window_days"],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "CORRECTION_VELOCITY_7D",
        window_days: windowDays,
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: true,
        correction_count: null,
        signal_label: "INSUFFICIENT_POPULATION",
        honest_note: HONEST_NOTE_BELOW_THRESHOLD,
      };
    }

    // Step 4 — count CORRECTION capsules within window across
    // member wallets. Window cutoff in UTC; member entity_ids
    // → wallet_ids join via Wallet.entity_id @unique.
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const wallets = await prisma.wallet.findMany({
      where: { entity_id: { in: memberEntityIds } },
      select: { wallet_id: true },
    });
    const memberWalletIds = wallets.map((w) => w.wallet_id);
    const correctionCount =
      memberWalletIds.length === 0
        ? 0
        : await prisma.memoryCapsule.count({
            where: {
              wallet_id: { in: memberWalletIds },
              capsule_type: "CORRECTION",
              deleted_at: null,
              created_at: { gte: cutoff },
            },
          });

    // Step 5–6 — ratio → closed-vocab label.
    const ratio = correctionCount / memberCount;
    let signalLabel: CorrectionVelocityLabel;
    if (ratio >= VELOCITY_ELEVATED_THRESHOLD) {
      signalLabel = "ELEVATED";
    } else if (ratio <= VELOCITY_QUIET_THRESHOLD) {
      signalLabel = "QUIET";
    } else {
      signalLabel = "TYPICAL";
    }

    // Step 7 — audit emission.
    await this.emitAnalyticsReadAudit({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      aggregate: "CORRECTION_VELOCITY_7D",
      redacted: false,
      result_count: correctionCount,
      filter_keys: ["window_days"],
      ip_address: args.ip_address ?? null,
    });

    return {
      ok: true,
      aggregate: "CORRECTION_VELOCITY_7D",
      window_days: windowDays,
      org_entity_id: args.org_entity_id,
      member_count: memberCount,
      redacted: false,
      correction_count: correctionCount,
      signal_label: signalLabel,
      honest_note: HONEST_NOTE_ABOVE_THRESHOLD,
    };
  }

  // WHAT: Compute the org-wide action-runtime success rate
  //        aggregate over the requested window.
  // INPUT: Pre-resolved org_entity_id + window_days +
  //         actor_entity_id for audit emission.
  // OUTPUT: ActionRuntimeSuccessRateAggregate |
  //         AnalyticsFailure.
  // WHY: Step-by-step:
  //   1. Validate window_days (clamp 1..30; default 7).
  //   2. Count active org members (k=5 population gate).
  //   3. If member_count < k=5 → return SAFE redacted
  //      projection (INSUFFICIENT_POPULATION label; no
  //      attempt counts; no rate).
  //   4. Resolve org Action ids in window (Action.org_entity_id
  //      + deleted_at: null + created_at >= cutoff).
  //   5. Count ActionAttempt outcomes for those Actions where
  //      ended_at >= cutoff (the attempt completed within
  //      window).
  //   6. If attempt_count < ACTION_RUNTIME_MIN_VOLUME (10) →
  //      return SAFE redacted projection
  //      (INSUFFICIENT_VOLUME label; counts surfaced but
  //      success_rate redacted to prevent high-variance
  //      misinterpretation).
  //   7. Compute success_rate = succeeded_count / attempt_count.
  //   8. Map rate to closed-vocab signal_label.
  //   9. Emit ADMIN_ACTION + ANALYTICS_READ audit.
  //   10. Return SAFE projection envelope.
  async getActionRuntimeSuccessRateForOrg(args: {
    org_entity_id: string;
    actor_entity_id: string;
    window_days?: number;
    ip_address?: string | null;
  }): Promise<ActionRuntimeSuccessRateAggregate | AnalyticsFailure> {
    const requestedWindow = args.window_days ?? ANALYTICS_WINDOW_DAYS_DEFAULT;
    if (
      !Number.isInteger(requestedWindow) ||
      requestedWindow < ANALYTICS_WINDOW_DAYS_MIN ||
      requestedWindow > ANALYTICS_WINDOW_DAYS_MAX
    ) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: `window_days must be an integer in [${ANALYTICS_WINDOW_DAYS_MIN}, ${ANALYTICS_WINDOW_DAYS_MAX}]`,
        invalid_fields: ["window_days"],
      };
    }
    const windowDays = requestedWindow;

    // Step 2 — k=5 population gate.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: args.org_entity_id, is_active: true },
      select: { child_id: true },
    });
    const memberCount = memberships.length;
    if (memberCount < ANALYTICS_MIN_POPULATION) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
        redacted: true,
        result_count: 0,
        filter_keys: ["window_days"],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
        window_days: windowDays,
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: true,
        attempt_count: 0,
        succeeded_count: null,
        failed_count: null,
        timed_out_count: null,
        cancelled_count: null,
        success_rate: null,
        signal_label: "INSUFFICIENT_POPULATION",
        honest_note: HONEST_NOTE_BELOW_THRESHOLD,
      };
    }

    // Step 4–5 — resolve org Action ids + count outcomes.
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const orgActions = await prisma.action.findMany({
      where: {
        org_entity_id: args.org_entity_id,
        deleted_at: null,
      },
      select: { action_id: true },
    });
    const orgActionIds = orgActions.map((a) => a.action_id);
    const attempts =
      orgActionIds.length === 0
        ? []
        : await prisma.actionAttempt.findMany({
            where: {
              action_id: { in: orgActionIds },
              ended_at: { gte: cutoff, not: null },
              outcome: { not: null },
            },
            select: { outcome: true },
          });
    const attemptCount = attempts.length;
    const counts = {
      SUCCEEDED: 0,
      FAILED: 0,
      TIMED_OUT: 0,
      CANCELLED: 0,
    };
    for (const a of attempts) {
      if (a.outcome === "SUCCEEDED") counts.SUCCEEDED++;
      else if (a.outcome === "FAILED") counts.FAILED++;
      else if (a.outcome === "TIMED_OUT") counts.TIMED_OUT++;
      else if (a.outcome === "CANCELLED") counts.CANCELLED++;
    }

    // Step 6 — minimum-volume gate (separate from k=5 pop).
    if (attemptCount < ACTION_RUNTIME_MIN_VOLUME) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
        redacted: true,
        result_count: attemptCount,
        filter_keys: ["window_days"],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
        window_days: windowDays,
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: true,
        attempt_count: attemptCount,
        succeeded_count: null,
        failed_count: null,
        timed_out_count: null,
        cancelled_count: null,
        success_rate: null,
        signal_label: "INSUFFICIENT_VOLUME",
        honest_note: `Attempt volume below ${ACTION_RUNTIME_MIN_VOLUME}; success_rate redacted to prevent high-variance misinterpretation.`,
      };
    }

    // Step 7–8 — rate + label.
    const successRate = counts.SUCCEEDED / attemptCount;
    let signalLabel: ActionRuntimeSuccessLabel;
    if (successRate >= SUCCESS_RATE_HEALTHY_THRESHOLD) {
      signalLabel = "HEALTHY";
    } else if (successRate >= SUCCESS_RATE_DEGRADED_THRESHOLD) {
      signalLabel = "DEGRADED";
    } else {
      signalLabel = "UNHEALTHY";
    }

    // Step 9 — audit.
    await this.emitAnalyticsReadAudit({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
      redacted: false,
      result_count: attemptCount,
      filter_keys: ["window_days"],
      ip_address: args.ip_address ?? null,
    });

    return {
      ok: true,
      aggregate: "ACTION_RUNTIME_SUCCESS_RATE",
      window_days: windowDays,
      org_entity_id: args.org_entity_id,
      member_count: memberCount,
      redacted: false,
      attempt_count: attemptCount,
      succeeded_count: counts.SUCCEEDED,
      failed_count: counts.FAILED,
      timed_out_count: counts.TIMED_OUT,
      cancelled_count: counts.CANCELLED,
      success_rate: Number(successRate.toFixed(4)),
      signal_label: signalLabel,
      honest_note:
        "Action-runtime outcome counts derived from same-org " +
        "ActionAttempt rows in the window. Signal label is " +
        "operational only — not an employee score, not a worker " +
        "performance index.",
    };
  }

  // WHAT: Centralized ADMIN_ACTION + details.action =
  //        "ANALYTICS_READ" audit emission helper.
  // INPUT: Closed-vocab details inputs.
  // OUTPUT: void.
  // WHY: ADR-0061 §1.f canonical pattern — every analytics
  //      read emits this row. Centralizing the helper means
  //      every future analytics aggregate calls the same
  //      emission path without duplicating discriminator
  //      strings or accidentally surfacing raw aggregated
  //      values in audit details.
  private async emitAnalyticsReadAudit(args: {
    actor_entity_id: string;
    org_entity_id: string;
    aggregate: string;
    redacted: boolean;
    result_count: number;
    filter_keys: readonly string[];
    ip_address: string | null;
  }): Promise<void> {
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      ip_address: args.ip_address,
      details: {
        action: "ANALYTICS_READ",
        aggregate: args.aggregate,
        org_entity_id: args.org_entity_id,
        redacted: args.redacted,
        // result_count is the AGGREGATE count, not raw values.
        // For redacted reads it is 0 (we didn't query); for
        // non-redacted reads it is the count surfaced in the
        // response. Either way it is safe to audit per ADR-0061
        // §3 — aggregates are the audit surface, never raw
        // values.
        result_count: args.result_count,
        filter_keys: [...args.filter_keys],
      },
    });
  }
}
