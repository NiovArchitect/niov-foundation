// FILE: feedback.service.ts
// PURPOSE: The seven self-improvement feedback loops that make Otzar
//          compound over time. Each loop has a single public method
//          (runLoopXOnce) that is invoked either on a cron schedule
//          (Loops 2, 3, 4, 6, 7) or as an event-driven hook from the
//          read / outcome services (Loops 1 and 5). Every loop end
//          touches FeedbackLoopHealth so Loop 7 can detect staleness.
// CONNECTS TO: prisma (relevance / suggestion / metrics tables),
//              hiveService.buildHiveAggregate (Loop 4),
//              writeAuditEvent (anomaly + admin audit), the
//              RateLimitStore.setMultiplier (Loop 5 throttle), and
//              the scheduler.ts entry point.

import {
  prisma,
  writeAuditEvent,
  type CapsuleType,
} from "@niov/database";
import { HiveService } from "../hive/hive.service.js";
import { PRICING_TABLE } from "../monetization/monetization.service.js";
import type { RateLimitStore } from "../../rate-limit.js";

// WHAT: The expected interval (in minutes) for each loop.
//        Loop 7 reads this table, multiplies by 2, and flags any
//        loop whose last_run is older than the threshold.
// INPUT: Used as a constant lookup table.
// OUTPUT: Numbers.
// WHY: Centralizes the cadence so cron schedules + Loop 7's
//      staleness check stay in sync. Event-driven loops (1, 5) are
//      treated as "should fire at least daily / weekly" because they
//      depend on inbound traffic; days without traffic shouldn't
//      flag them as broken.
export const LOOP_EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  loop_1: 1440, // event-driven; stale if no recordOutcome in 24h
  loop_2: 60, // hourly cron
  loop_3: 1440, // daily cron
  loop_4: 30, // every 30 min cron
  loop_5: 10080, // event-driven; stale if no read activity in 7 days
  loop_6: 10080, // weekly cron
  loop_7: 43200, // monthly cron (~30d)
};

// WHAT: The seven loop names + ids that get seeded into
//        FeedbackLoopHealth on boot.
// INPUT: Used as a constant.
// OUTPUT: Array of { loop_id, loop_name }.
// WHY: Single source of truth for the seed function in
//      services/governance/seeds.ts and for Loop 7's iteration.
export const FEEDBACK_LOOPS: ReadonlyArray<{
  loop_id: string;
  loop_name: string;
}> = [
  { loop_id: "loop_1", loop_name: "Capsule Relevance" },
  { loop_id: "loop_2", loop_name: "Token Efficiency" },
  { loop_id: "loop_3", loop_name: "Permission Patterns" },
  { loop_id: "loop_4", loop_name: "Hive Aggregate Refresh" },
  { loop_id: "loop_5", loop_name: "Anomaly Detection" },
  { loop_id: "loop_6", loop_name: "Monetization Demand" },
  { loop_id: "loop_7", loop_name: "Meta Health Check" },
];

// WHAT: Demand-level thresholds Loop 6 uses to bucket capsule_types
//        by 30-day access count.
// INPUT: Used as constants.
// OUTPUT: Numbers.
// WHY: Initial cuts -- LOW < 5 ≤ MEDIUM < 50 ≤ HIGH. These are the
//      best-effort first pass; real distributions will inform the
//      tuned values.
//
// TODO(Section 17): tune thresholds based on observed access distributions
// and tune PRICING_TABLE based on actual market data
export const DEMAND_LOW_MAX = 5;
export const DEMAND_MEDIUM_MAX = 50;

// WHAT: The window Loop 5 uses to compare current-hour activity to
//        the actor's 7-day baseline for the same capsule.
const ANOMALY_WINDOW_MINUTES = 60;
const ANOMALY_BASELINE_DAYS = 7;
const ANOMALY_RATIO_THRESHOLD = 10;
const ANOMALY_THROTTLE_MULTIPLIER = 0.5;
const ANOMALY_THROTTLE_TTL_SECONDS = 3600;

// WHAT: The relevance bumps applied by Loop 1.
const RELEVANCE_USED_BUMP = 0.05;
const RELEVANCE_UNUSED_DECAY = 0.02;
const RELEVANCE_MIN = 0.0;
const RELEVANCE_MAX = 1.0;

// WHAT: The relevance-floor adjustment Loop 2 makes.
const FLOOR_STEP = 0.05;
const FLOOR_MIN = 0.05;
const FLOOR_MAX = 0.8;
const TER_LOW_THRESHOLD = 0.5;
const TER_HIGH_THRESHOLD = 0.85;
const SUCCESS_LOW_THRESHOLD = 0.6;
const LOOP_2_MIN_OUTCOMES = 100;

// WHAT: Loop 3 / Loop 6 windows.
const PERMISSION_PATTERN_DAYS = 30;
const MONETIZATION_DEMAND_DAYS = 30;
const PERMISSION_PATTERN_BRIDGE_FLOOR = 3;

// WHAT: Loop 4 minimum member count to refresh aggregate (matches
//        HIVE_AGGREGATE_TAG_FLOOR from Section 5).
const LOOP_4_MIN_MEMBERS = 3;

// WHAT: Successful return shape for runLoop1Once.
export interface Loop1Result {
  outcome_id: string;
  used_count: number;
  unused_count: number;
}

// WHAT: Successful return shape for runLoop2Once.
export interface Loop2Result {
  outcomes_considered: number;
  ter: number | null;
  avg_success: number | null;
  prior_floor: number;
  new_floor: number;
  changed: boolean;
}

// WHAT: Successful return shape for runLoop3Once.
export interface Loop3Result {
  patterns_detected: number;
  suggestions_upserted: number;
}

// WHAT: Successful return shape for runLoop4Once.
export interface Loop4Result {
  hives_refreshed: number;
  hives_skipped: number;
}

// WHAT: Successful return shape for runLoop5Once.
export interface Loop5Result {
  anomaly_detected: boolean;
  ratio: number | null;
  baseline_avg: number | null;
}

// WHAT: Successful return shape for runLoop6Once.
export interface Loop6Result {
  capsule_types_processed: number;
  suggestions_created: number;
}

// WHAT: Successful return shape for runLoop7Once.
export interface Loop7Result {
  loops_checked: number;
  stale_loops: string[];
}

// WHAT: Mark one loop's row in FeedbackLoopHealth as freshly run.
// INPUT: The loop_id string ("loop_1".."loop_7") and the status.
// OUTPUT: A promise resolving once the row is upserted.
// WHY: Every loop method calls this in a finally block so even an
//      error keeps the health row truthful.
async function touchLoopHealth(
  loop_id: string,
  status: "OK" | "ERROR",
): Promise<void> {
  await prisma.feedbackLoopHealth.upsert({
    where: { loop_id },
    create: {
      loop_id,
      loop_name:
        FEEDBACK_LOOPS.find((l) => l.loop_id === loop_id)?.loop_name ??
        loop_id,
      last_run: new Date(),
      last_status: status,
    },
    update: {
      last_run: new Date(),
      last_status: status,
    },
  });
}

// WHAT: The seven-loop service.
// INPUT: A HiveService (Loop 4) and a RateLimitStore (Loop 5).
// OUTPUT: A class with seven runLoopXOnce methods.
// WHY: Constructor injection keeps the loops composable in tests
//      (each test can pass mocks for the dependencies it cares
//      about).
export class FeedbackService {
  constructor(
    private readonly hiveService: HiveService,
    private readonly rateLimitStore: RateLimitStore,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // LOOP 1 — Capsule Relevance (event-driven)
  //
  // Called from /coe/outcome path after each COEOutcome insert.
  // Caller passes the capsule_ids the LLM actually used, plus the
  // FULL candidate list the COE retrieved. Used capsules get +0.05
  // relevance; candidates that were retrieved but unused get -0.02.
  // Both clamped to [0, 1].
  // ──────────────────────────────────────────────────────────────
  async runLoop1Once(input: {
    outcome_id: string;
    candidate_capsule_ids: string[];
    used_capsule_ids: string[];
  }): Promise<Loop1Result> {
    const used = new Set(input.used_capsule_ids);
    let usedCount = 0;
    let unusedCount = 0;

    try {
      for (const id of input.candidate_capsule_ids) {
        if (used.has(id)) {
          // Bump and clamp via raw SQL for atomicity (avoids
          // read-modify-write race when many outcomes land at once).
          await prisma.$executeRaw`
            UPDATE memory_capsules
            SET relevance_score = LEAST(${RELEVANCE_MAX}::float8,
              relevance_score + ${RELEVANCE_USED_BUMP}::float8)
            WHERE capsule_id = ${id}::uuid AND deleted_at IS NULL
          `;
          usedCount++;
        } else {
          await prisma.$executeRaw`
            UPDATE memory_capsules
            SET relevance_score = GREATEST(${RELEVANCE_MIN}::float8,
              relevance_score - ${RELEVANCE_UNUSED_DECAY}::float8)
            WHERE capsule_id = ${id}::uuid AND deleted_at IS NULL
          `;
          unusedCount++;
        }
      }
      await touchLoopHealth("loop_1", "OK");
      return {
        outcome_id: input.outcome_id,
        used_count: usedCount,
        unused_count: unusedCount,
      };
    } catch (err) {
      await touchLoopHealth("loop_1", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 2 — Token Efficiency (cron "0 * * * *")
  //
  // Sliding-window over the most recent 100 COEOutcome rows
  // (no last-run state needed). When count < 100, the system is too
  // young for a meaningful TER and we skip. TER = sum(tokens_used) /
  // sum(tokens_loaded). Below 0.5 → bump floor +0.05 (we're loading
  // too much). Above 0.85 with avg_success < 0.6 → drop floor -0.05
  // (we're loading too little, retrieval is missing things). Bounds
  // [0.05, 0.8].
  // ──────────────────────────────────────────────────────────────
  async runLoop2Once(): Promise<Loop2Result> {
    try {
      const recent = await prisma.cOEOutcome.findMany({
        orderBy: { recorded_at: "desc" },
        take: LOOP_2_MIN_OUTCOMES,
        select: {
          tokens_loaded: true,
          tokens_used: true,
          success: true,
        },
      });

      const config = await prisma.feedbackConfig.findFirst();
      const priorFloor = config?.relevance_floor ?? 0.2;

      if (recent.length < LOOP_2_MIN_OUTCOMES) {
        await touchLoopHealth("loop_2", "OK");
        return {
          outcomes_considered: recent.length,
          ter: null,
          avg_success: null,
          prior_floor: priorFloor,
          new_floor: priorFloor,
          changed: false,
        };
      }

      let totalLoaded = 0;
      let totalUsed = 0;
      let successCount = 0;
      for (const r of recent) {
        totalLoaded += r.tokens_loaded ?? 0;
        totalUsed += r.tokens_used ?? 0;
        if (r.success) successCount++;
      }
      const ter = totalLoaded > 0 ? totalUsed / totalLoaded : 0;
      const avgSuccess = successCount / recent.length;

      let newFloor = priorFloor;
      if (ter < TER_LOW_THRESHOLD) {
        newFloor = Math.min(FLOOR_MAX, priorFloor + FLOOR_STEP);
      } else if (ter > TER_HIGH_THRESHOLD && avgSuccess < SUCCESS_LOW_THRESHOLD) {
        newFloor = Math.max(FLOOR_MIN, priorFloor - FLOOR_STEP);
      }
      const changed = newFloor !== priorFloor;
      if (changed) {
        if (config !== null) {
          await prisma.feedbackConfig.update({
            where: { config_id: config.config_id },
            data: { relevance_floor: newFloor },
          });
        } else {
          await prisma.feedbackConfig.create({
            data: { relevance_floor: newFloor },
          });
        }
      }
      await touchLoopHealth("loop_2", "OK");
      return {
        outcomes_considered: recent.length,
        ter,
        avg_success: avgSuccess,
        prior_floor: priorFloor,
        new_floor: newFloor,
        changed,
      };
    } catch (err) {
      await touchLoopHealth("loop_2", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 3 — Permission Patterns (cron "0 2 * * *")
  //
  // Joins Permission ↔ MemoryCapsule, GROUPs by
  // (grantor_entity_id, grantee_entity_id, capsule_type) over the
  // last 30 days, counts DISTINCT bridge_id, and proposes a standing
  // permission when 3+ separate bridges with the same triple appear.
  // A single multi-capsule bridge counts as ONE bridge.
  // ──────────────────────────────────────────────────────────────
  async runLoop3Once(): Promise<Loop3Result> {
    try {
      const since = new Date(
        Date.now() - PERMISSION_PATTERN_DAYS * 24 * 60 * 60 * 1000,
      );
      // Raw SQL because Prisma doesn't have a DISTINCT-COUNT-of-FK
      // groupBy modifier that joins to the related row.
      const rows = await prisma.$queryRaw<
        Array<{
          grantor_entity_id: string;
          grantee_entity_id: string;
          capsule_type: string;
          bridge_count: bigint;
        }>
      >`
        SELECT
          p.grantor_entity_id,
          p.grantee_entity_id,
          c.capsule_type::text AS capsule_type,
          COUNT(DISTINCT p.bridge_id) AS bridge_count
        FROM permissions p
        JOIN memory_capsules c ON c.capsule_id = p.capsule_id
        WHERE p.created_at >= ${since}
        GROUP BY p.grantor_entity_id, p.grantee_entity_id, c.capsule_type
        HAVING COUNT(DISTINCT p.bridge_id) >= ${PERMISSION_PATTERN_BRIDGE_FLOOR}
      `;

      let upserted = 0;
      for (const r of rows) {
        const text = `Detected ${r.bridge_count} separate ${r.capsule_type} grants from grantor to grantee in the past ${PERMISSION_PATTERN_DAYS} days. Consider granting a standing permission instead of repeated bridges.`;
        // Idempotent upsert: if a not-yet-acknowledged suggestion
        // exists for this triple we update its text (refreshes the
        // count); otherwise insert a new row.
        const existing = await prisma.permissionSuggestion.findFirst({
          where: {
            grantor_id: r.grantor_entity_id,
            grantee_id: r.grantee_entity_id,
            capsule_type: r.capsule_type,
            acknowledged_at: null,
          },
        });
        if (existing === null) {
          await prisma.permissionSuggestion.create({
            data: {
              grantor_id: r.grantor_entity_id,
              grantee_id: r.grantee_entity_id,
              capsule_type: r.capsule_type,
              suggestion_text: text,
            },
          });
        } else {
          await prisma.permissionSuggestion.update({
            where: { suggestion_id: existing.suggestion_id },
            data: { suggestion_text: text },
          });
        }
        upserted++;
      }
      await touchLoopHealth("loop_3", "OK");
      return { patterns_detected: rows.length, suggestions_upserted: upserted };
    } catch (err) {
      await touchLoopHealth("loop_3", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 4 — Hive Aggregate Refresh (cron "*/30 * * * *")
  //
  // For every ACTIVE Hive with member_count >= 3, call
  // hiveService.buildHiveAggregate. Default ENTERPRISE Hives are
  // included by design -- standard twins read fresh org-knowledge
  // SUMMARY through this aggregate. Section 10 patch ensures the
  // aggregate is owned by the org wallet (not the admin's personal
  // wallet) for default ENTERPRISE Hives, so admin offboarding does
  // not transfer the org knowledge summary out with them.
  // ──────────────────────────────────────────────────────────────
  async runLoop4Once(): Promise<Loop4Result> {
    try {
      const hives = await prisma.hive.findMany({
        where: { status: "ACTIVE", member_count: { gte: LOOP_4_MIN_MEMBERS } },
        select: { hive_id: true },
      });
      let refreshed = 0;
      let skipped = 0;
      for (const h of hives) {
        const result = await this.hiveService.buildHiveAggregate(h.hive_id);
        if (result.ok) {
          refreshed++;
        } else {
          skipped++;
        }
      }
      await touchLoopHealth("loop_4", "OK");
      return { hives_refreshed: refreshed, hives_skipped: skipped };
    } catch (err) {
      await touchLoopHealth("loop_4", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 5 — Anomaly Detection (event-driven, called from
  // read.service.ts post-READ)
  //
  // Per-(actor_entity_id, capsule_id) anomaly check. Counts the
  // actor's accesses of this capsule over the last 60 minutes vs
  // their hourly average over the last 7 days for the same capsule.
  // If the ratio is >= 10x AND the 7-day baseline is >= 1
  // (skipping cold-start cases where the actor has never read this
  // capsule before), fire ANOMALY_DETECTED audit + setMultiplier
  // 0.5x for 1 hour on the actor's read_content rate-limit bucket.
  //
  // First reads of a capsule by an actor never trigger anomalies
  // (baseline_avg < 1 short-circuits the check).
  // ──────────────────────────────────────────────────────────────
  async runLoop5Once(input: {
    actor_entity_id: string;
    capsule_id: string;
  }): Promise<Loop5Result> {
    try {
      const now = Date.now();
      const windowStart = new Date(now - ANOMALY_WINDOW_MINUTES * 60 * 1000);
      const baselineStart = new Date(
        now - ANOMALY_BASELINE_DAYS * 24 * 60 * 60 * 1000,
      );

      // Count audit_events of CAPSULE_CONTENT_READ for this actor +
      // capsule within the last 60 minutes.
      const recent = await prisma.auditEvent.count({
        where: {
          actor_entity_id: input.actor_entity_id,
          target_capsule_id: input.capsule_id,
          event_type: "CAPSULE_CONTENT_READ",
          timestamp: { gte: windowStart },
        },
      });

      // Count over the 7-day baseline window (excludes the most
      // recent hour to avoid biasing the baseline by the spike).
      const baselineTotal = await prisma.auditEvent.count({
        where: {
          actor_entity_id: input.actor_entity_id,
          target_capsule_id: input.capsule_id,
          event_type: "CAPSULE_CONTENT_READ",
          timestamp: { gte: baselineStart, lt: windowStart },
        },
      });
      const baselineHours = ANOMALY_BASELINE_DAYS * 24 - 1; // minus the current hour
      const baselineAvg = baselineHours > 0 ? baselineTotal / baselineHours : 0;

      // Bootstrap skip: actor has never (or barely ever) read this
      // capsule before. Cannot meaningfully compare 0 → N.
      if (baselineAvg < 1) {
        await touchLoopHealth("loop_5", "OK");
        return { anomaly_detected: false, ratio: null, baseline_avg: baselineAvg };
      }

      const ratio = recent / baselineAvg;
      if (ratio < ANOMALY_RATIO_THRESHOLD) {
        await touchLoopHealth("loop_5", "OK");
        return { anomaly_detected: false, ratio, baseline_avg: baselineAvg };
      }

      // Fire the alert + throttle.
      await writeAuditEvent({
        event_type: "ANOMALY_DETECTED",
        outcome: "SUCCESS",
        actor_entity_id: input.actor_entity_id,
        target_capsule_id: input.capsule_id,
        details: {
          loop: "loop_5",
          ratio,
          baseline_avg: baselineAvg,
          recent_count: recent,
          window_minutes: ANOMALY_WINDOW_MINUTES,
          baseline_days: ANOMALY_BASELINE_DAYS,
          throttle_multiplier: ANOMALY_THROTTLE_MULTIPLIER,
          throttle_ttl_seconds: ANOMALY_THROTTLE_TTL_SECONDS,
        },
      });
      await this.rateLimitStore.setMultiplier(
        `read_content:entity:${input.actor_entity_id}`,
        ANOMALY_THROTTLE_MULTIPLIER,
        ANOMALY_THROTTLE_TTL_SECONDS,
      );
      await touchLoopHealth("loop_5", "OK");
      return { anomaly_detected: true, ratio, baseline_avg: baselineAvg };
    } catch (err) {
      await touchLoopHealth("loop_5", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 6 — Monetization Demand (cron "0 3 * * 0")
  //
  // PRIVACY: this function MUST NOT include accessor_entity_id in
  // any computation, filter, or output. The query GROUPS BY
  // capsule_type ONLY. The MonetizationSuggestion rows it produces
  // carry the wallet HOLDER (entity_id) and the capsule_type +
  // demand_level + estimated_value_usd. Accessor identity never
  // appears anywhere. See test in feedback.test.ts and patent claim
  // US 12,517,919.
  // ──────────────────────────────────────────────────────────────
  async runLoop6Once(): Promise<Loop6Result> {
    try {
      const since = new Date(
        Date.now() - MONETIZATION_DEMAND_DAYS * 24 * 60 * 60 * 1000,
      );

      // For each (wallet_holder_entity_id, capsule_type), count
      // monetization events. NO accessor_entity_id in SELECT or
      // GROUP BY -- this is the privacy invariant.
      const rows = await prisma.monetizationEvent.groupBy({
        by: ["wallet_holder_entity_id", "capsule_type"],
        where: { created_at: { gte: since }, status: "PROCESSED" },
        _count: { event_id: true },
        _sum: { gross_value_usd: true },
      });

      let created = 0;
      for (const r of rows) {
        const accessCount = r._count.event_id;
        const grossSum = r._sum.gross_value_usd ?? 0;
        const demand_level =
          accessCount < DEMAND_LOW_MAX
            ? "LOW"
            : accessCount < DEMAND_MEDIUM_MAX
              ? "MEDIUM"
              : "HIGH";
        // estimated_value_usd projects forward from observed gross.
        // Use the PRICING_TABLE as a per-event reference; the
        // projection is "what this could be worth at the next
        // pricing tier" -- conservative for now.
        const referencePrice =
          PRICING_TABLE[r.capsule_type as CapsuleType] ?? 0;
        const estimatedValue = Math.max(grossSum, referencePrice * accessCount);
        await prisma.monetizationSuggestion.create({
          data: {
            entity_id: r.wallet_holder_entity_id,
            capsule_type: r.capsule_type,
            demand_level,
            estimated_value_usd: estimatedValue,
          },
        });
        created++;
      }
      await touchLoopHealth("loop_6", "OK");
      return {
        capsule_types_processed: rows.length,
        suggestions_created: created,
      };
    } catch (err) {
      await touchLoopHealth("loop_6", "ERROR");
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LOOP 7 — Meta Health Check (cron "0 4 1 * *")
  //
  // Reads FeedbackLoopHealth for all 7 loops, flags any whose
  // last_run is older than 2x its expected interval. Loop 7 self-
  // skips because it cannot legitimately flag itself stale -- by
  // the time it's reading the table, its own last_run is "now"
  // (just touched) or the moment before, so the check IS the run.
  // ──────────────────────────────────────────────────────────────
  async runLoop7Once(): Promise<Loop7Result> {
    try {
      const rows = await prisma.feedbackLoopHealth.findMany();
      const stale: string[] = [];
      const now = Date.now();
      for (const loop of rows) {
        // Loop 7 cannot flag itself; it always looks stale to itself
        // the moment it runs (its check IS the run).
        if (loop.loop_id === "loop_7") continue;
        const expectedMin = LOOP_EXPECTED_INTERVAL_MINUTES[loop.loop_id];
        if (expectedMin === undefined) continue;
        const thresholdMs = 2 * expectedMin * 60 * 1000;
        const lastRunMs = loop.last_run?.getTime() ?? 0;
        const age = now - lastRunMs;
        if (loop.last_run === null || age > thresholdMs) {
          stale.push(loop.loop_id);
        }
      }
      if (stale.length > 0) {
        await writeAuditEvent({
          event_type: "ADMIN_ACTION",
          outcome: "SUCCESS",
          actor_entity_id: null,
          details: {
            action: "FEEDBACK_LOOP_STALE",
            stale_loops: stale,
            checked_at: new Date().toISOString(),
          },
        });
      }
      await touchLoopHealth("loop_7", "OK");
      return { loops_checked: rows.length, stale_loops: stale };
    } catch (err) {
      await touchLoopHealth("loop_7", "ERROR");
      throw err;
    }
  }
}
