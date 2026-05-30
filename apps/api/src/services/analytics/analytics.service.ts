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

// WHAT: Closed-vocab signal labels for the connector-activity
//        aggregate.
// INPUT: Used as a value array + TS literal-union type.
// OUTPUT: None.
// WHY: ADR-0061 §1.a closed-vocab. Operators see a stable
//      label (ACTIVE / CONFIGURED_INACTIVE / NOT_CONFIGURED /
//      INSUFFICIENT_POPULATION) instead of attempting to
//      infer from raw counts. The label conveys the
//      operationally-relevant question ("is the org actually
//      using connectors?") without per-binding attribution.
export const CONNECTOR_ACTIVITY_LABELS = [
  "ACTIVE",
  "CONFIGURED_INACTIVE",
  "NOT_CONFIGURED",
  "INSUFFICIENT_POPULATION",
] as const;

export type ConnectorActivityLabel =
  (typeof CONNECTOR_ACTIVITY_LABELS)[number];

// WHAT: Closed-vocab signal labels for hive-participation
//        aggregate.
// INPUT: Used as a value array + TS literal-union type.
// OUTPUT: None.
// WHY: ADR-0061 §1.a closed-vocab. Operators get the
//      operational signal ("how widely are members
//      participating in same-org Hives?") without per-member
//      attribution. The label is policy-relevant; the raw
//      ratio is also surfaced as derived aggregate quantity
//      (count/count) per ADR-0061 §1.a allowance.
export const HIVE_PARTICIPATION_LABELS = [
  "BROAD_PARTICIPATION",
  "MODERATE_PARTICIPATION",
  "NARROW_PARTICIPATION",
  "NO_HIVES",
  "INSUFFICIENT_POPULATION",
] as const;

export type HiveParticipationLabel =
  (typeof HIVE_PARTICIPATION_LABELS)[number];

const HIVE_PARTICIPATION_BROAD_THRESHOLD = 0.5;
const HIVE_PARTICIPATION_MODERATE_THRESHOLD = 0.2;

// WHAT: SAFE projection envelope for the hive-participation
//        aggregate.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Closed-vocab fields only. Org-level aggregate counts
//      and one derived rate. NEVER includes hive_id, member
//      entity_ids, hive_name, governance_terms, or any
//      per-member attribution.
export interface HiveParticipationAggregate {
  ok: true;
  aggregate: "HIVE_PARTICIPATION";
  org_entity_id: string;
  member_count: number;
  redacted: boolean;
  hive_count_active: number | null;
  participating_member_count: number | null;
  participation_rate: number | null;
  signal_label: HiveParticipationLabel;
  honest_note: string;
}

// WHAT: SAFE projection envelope for the connector-activity
//        aggregate.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Closed-vocab fields only. NEVER includes binding_id,
//      display_name, secret_ref, config, or per-binding
//      attribution. Only org-level aggregate counts surface.
export interface ConnectorActivityAggregate {
  ok: true;
  aggregate: "CONNECTOR_ACTIVITY";
  window_days: number;
  org_entity_id: string;
  member_count: number;
  redacted: boolean;
  binding_count_active: number | null;
  binding_count_total: number | null;
  invocation_count: number | null;
  signal_label: ConnectorActivityLabel;
  honest_note: string;
}

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

  // WHAT: Compute the org-wide connector-activity aggregate.
  // INPUT: Pre-resolved org_entity_id + window_days +
  //         actor_entity_id for audit emission.
  // OUTPUT: ConnectorActivityAggregate | AnalyticsFailure.
  // WHY: Step-by-step:
  //   1. Validate window_days.
  //   2. Count active org members (k=5 population gate).
  //   3. If member_count < 5 → SAFE redacted projection
  //      (INSUFFICIENT_POPULATION; counts null).
  //   4. Count org ConnectorBinding rows (active = enabled +
  //      not deleted; total = not deleted).
  //   5. Count INVOKE_CONNECTOR ActionAttempts within window
  //      via Action.org_entity_id join.
  //   6. Map (active + invocation) to closed-vocab label.
  //   7. Audit emit; SAFE return.
  async getConnectorActivityForOrg(args: {
    org_entity_id: string;
    actor_entity_id: string;
    window_days?: number;
    ip_address?: string | null;
  }): Promise<ConnectorActivityAggregate | AnalyticsFailure> {
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
    const memberCount = await prisma.entityMembership.count({
      where: { parent_id: args.org_entity_id, is_active: true },
    });
    if (memberCount < ANALYTICS_MIN_POPULATION) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "CONNECTOR_ACTIVITY",
        redacted: true,
        result_count: 0,
        filter_keys: ["window_days"],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "CONNECTOR_ACTIVITY",
        window_days: windowDays,
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: true,
        binding_count_active: null,
        binding_count_total: null,
        invocation_count: null,
        signal_label: "INSUFFICIENT_POPULATION",
        honest_note: HONEST_NOTE_BELOW_THRESHOLD,
      };
    }

    // Step 4 — binding counts.
    const bindingTotal = await prisma.connectorBinding.count({
      where: { org_entity_id: args.org_entity_id, deleted_at: null },
    });
    const bindingActive = await prisma.connectorBinding.count({
      where: {
        org_entity_id: args.org_entity_id,
        deleted_at: null,
        enabled: true,
      },
    });

    // Step 5 — INVOKE_CONNECTOR attempts within window.
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const orgInvokeActions = await prisma.action.findMany({
      where: {
        org_entity_id: args.org_entity_id,
        action_type: "INVOKE_CONNECTOR",
        deleted_at: null,
      },
      select: { action_id: true },
    });
    const invokeActionIds = orgInvokeActions.map((a) => a.action_id);
    const invocationCount =
      invokeActionIds.length === 0
        ? 0
        : await prisma.actionAttempt.count({
            where: {
              action_id: { in: invokeActionIds },
              ended_at: { gte: cutoff, not: null },
            },
          });

    // Step 6 — closed-vocab label.
    let signalLabel: ConnectorActivityLabel;
    if (bindingActive === 0) {
      signalLabel = "NOT_CONFIGURED";
    } else if (invocationCount > 0) {
      signalLabel = "ACTIVE";
    } else {
      signalLabel = "CONFIGURED_INACTIVE";
    }

    // Step 7 — audit emit; SAFE return.
    await this.emitAnalyticsReadAudit({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      aggregate: "CONNECTOR_ACTIVITY",
      redacted: false,
      result_count: invocationCount,
      filter_keys: ["window_days"],
      ip_address: args.ip_address ?? null,
    });

    return {
      ok: true,
      aggregate: "CONNECTOR_ACTIVITY",
      window_days: windowDays,
      org_entity_id: args.org_entity_id,
      member_count: memberCount,
      redacted: false,
      binding_count_active: bindingActive,
      binding_count_total: bindingTotal,
      invocation_count: invocationCount,
      signal_label: signalLabel,
      honest_note:
        "Aggregate counts of same-org ConnectorBinding rows and " +
        "INVOKE_CONNECTOR Action attempts within the window. " +
        "Signal label is operational only — not an employee " +
        "score, not a vendor performance index.",
    };
  }

  // WHAT: Compute the org-wide hive-participation aggregate.
  // INPUT: Pre-resolved org_entity_id + actor_entity_id for
  //         audit emission (no window_days — participation is
  //         a current-state snapshot, not a window aggregate).
  // OUTPUT: HiveParticipationAggregate | AnalyticsFailure.
  // WHY: Step-by-step:
  //   1. Count active org members (k=5 gate).
  //   2. If < 5 → SAFE redacted projection.
  //   3. Count same-org Hives with status = ACTIVE.
  //   4. If 0 active Hives → NO_HIVES (skip member-join).
  //   5. Count DISTINCT members with at least one ACTIVE
  //      HiveMembership in a same-org ACTIVE Hive.
  //   6. Compute participation_rate = participating / member_count.
  //   7. Map rate to closed-vocab label.
  //   8. Audit emit; SAFE return.
  async getHiveParticipationForOrg(args: {
    org_entity_id: string;
    actor_entity_id: string;
    ip_address?: string | null;
  }): Promise<HiveParticipationAggregate | AnalyticsFailure> {
    // Step 1 — k=5 population gate.
    const memberships = await prisma.entityMembership.findMany({
      where: { parent_id: args.org_entity_id, is_active: true },
      select: { child_id: true },
    });
    const memberEntityIds = memberships.map((m) => m.child_id);
    const memberCount = memberEntityIds.length;
    if (memberCount < ANALYTICS_MIN_POPULATION) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "HIVE_PARTICIPATION",
        redacted: true,
        result_count: 0,
        filter_keys: [],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "HIVE_PARTICIPATION",
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: true,
        hive_count_active: null,
        participating_member_count: null,
        participation_rate: null,
        signal_label: "INSUFFICIENT_POPULATION",
        honest_note: HONEST_NOTE_BELOW_THRESHOLD,
      };
    }

    // Step 3 — count same-org active Hives.
    const activeHives = await prisma.hive.findMany({
      where: { org_entity_id: args.org_entity_id, status: "ACTIVE" },
      select: { hive_id: true },
    });
    const hiveCountActive = activeHives.length;
    const activeHiveIds = activeHives.map((h) => h.hive_id);

    if (hiveCountActive === 0) {
      await this.emitAnalyticsReadAudit({
        actor_entity_id: args.actor_entity_id,
        org_entity_id: args.org_entity_id,
        aggregate: "HIVE_PARTICIPATION",
        redacted: false,
        result_count: 0,
        filter_keys: [],
        ip_address: args.ip_address ?? null,
      });
      return {
        ok: true,
        aggregate: "HIVE_PARTICIPATION",
        org_entity_id: args.org_entity_id,
        member_count: memberCount,
        redacted: false,
        hive_count_active: 0,
        participating_member_count: 0,
        participation_rate: 0,
        signal_label: "NO_HIVES",
        honest_note:
          "Org has zero active same-org Hives. Participation " +
          "rate is 0 by construction.",
      };
    }

    // Step 5 — DISTINCT members with at least one ACTIVE
    // HiveMembership in same-org ACTIVE Hive.
    const participatingMemberships = await prisma.hiveMembership.findMany({
      where: {
        hive_id: { in: activeHiveIds },
        entity_id: { in: memberEntityIds },
        status: "ACTIVE",
      },
      select: { entity_id: true },
      distinct: ["entity_id"],
    });
    const participatingCount = participatingMemberships.length;

    // Step 6–7 — rate + label.
    const participationRate = participatingCount / memberCount;
    let signalLabel: HiveParticipationLabel;
    if (participationRate >= HIVE_PARTICIPATION_BROAD_THRESHOLD) {
      signalLabel = "BROAD_PARTICIPATION";
    } else if (participationRate >= HIVE_PARTICIPATION_MODERATE_THRESHOLD) {
      signalLabel = "MODERATE_PARTICIPATION";
    } else {
      signalLabel = "NARROW_PARTICIPATION";
    }

    // Step 8 — audit + SAFE return.
    await this.emitAnalyticsReadAudit({
      actor_entity_id: args.actor_entity_id,
      org_entity_id: args.org_entity_id,
      aggregate: "HIVE_PARTICIPATION",
      redacted: false,
      result_count: participatingCount,
      filter_keys: [],
      ip_address: args.ip_address ?? null,
    });

    return {
      ok: true,
      aggregate: "HIVE_PARTICIPATION",
      org_entity_id: args.org_entity_id,
      member_count: memberCount,
      redacted: false,
      hive_count_active: hiveCountActive,
      participating_member_count: participatingCount,
      participation_rate: Number(participationRate.toFixed(4)),
      signal_label: signalLabel,
      honest_note:
        "DISTINCT same-org members with at least one ACTIVE " +
        "HiveMembership in a same-org ACTIVE Hive. Signal " +
        "label is operational only — not an employee score, " +
        "not a manager dashboard.",
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
