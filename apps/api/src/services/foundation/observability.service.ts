// FILE: observability.service.ts
// PURPOSE: Phase 1293-A — Foundation OBSERVABILITY + METERING-ENFORCEMENT
//          substrate (production hardening, honest — not security theater).
//          Two genuinely-missing primitives on the TypeScript/API side:
//
//          1. A SAFE structured observability envelope — a correlation-bearing,
//             tenant-safe record (correlation_id / runtime / action / outcome /
//             latency / policy_decision + entity/org references) that carries NO
//             PII or content. This is the shape a future OpenTelemetry /
//             metrics exporter would emit; this phase lands the safe contract +
//             a read snapshot, not the full export pipeline (that is GOVSEC.6
//             forward-substrate; the BEAM side already has its own telemetry).
//
//          2. A metering-ENFORCEMENT evaluator — usage metering has been
//             tracking-only (recordUsageForOrg / getOrgUsage; ADR-0093 deferred
//             enforcement pending Founder pricing). This adds the missing gate
//             evaluator evaluateMeterThreshold (ALLOW / WARN / DENY against a
//             caller-supplied limit) + a check endpoint that emits a
//             USAGE_METER_THRESHOLD_REACHED audit on WARN/DENY. It is an
//             OPT-IN evaluator: it does NOT silently wire into existing flows to
//             auto-deny (that would risk breaking tenants and still needs a
//             Founder pricing decision) — callers choose to gate on it.
//
// CONNECTS TO:
//   - apps/api/src/services/billing/usage-meter.service.ts (getOrgUsage).
//   - apps/api/src/services/governance/org.ts (getOrgEntityId).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - packages/database writeAuditEvent (USAGE_METER_THRESHOLD_REACHED).
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY: the observability envelope + snapshot carry SAFE references only
// (entity_id / org_entity_id as IDs, never email / display_name / content /
// raw payloads / secrets). Metering values are the caller's OWN org only
// (tenant-scoped). No metric leaks another tenant's data.

import { writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { getOrgUsage } from "../billing/usage-meter.service.js";

export type ObservabilityOutcome = "SUCCESS" | "DENIED" | "ERROR";
export type MeterThresholdDecision = "ALLOW" | "WARN" | "DENY";

// A SAFE, correlation-bearing structured observability record. No PII/content.
export interface ObservabilityEnvelope {
  correlation_id: string;
  runtime: "FOUNDATION_API" | "PYTHON_ADVISORY" | "BEAM_COORDINATION";
  action: string;
  outcome: ObservabilityOutcome;
  latency_ms: number | null;
  policy_decision: string | null;
  // SAFE references — IDs only, never email/display_name/content.
  entity_ref: string | null;
  org_ref: string | null;
  evaluated_at: string;
}

// WHAT: Build a SAFE observability envelope. Pure.
// WHY: One contract for telemetry across runtimes that never carries PII.
export function buildObservabilityEnvelope(args: {
  correlation_id: string;
  runtime?: ObservabilityEnvelope["runtime"];
  action: string;
  outcome: ObservabilityOutcome;
  latency_ms?: number | null;
  policy_decision?: string | null;
  entity_ref?: string | null;
  org_ref?: string | null;
  evaluatedAt?: Date;
}): ObservabilityEnvelope {
  return {
    correlation_id: args.correlation_id,
    runtime: args.runtime ?? "FOUNDATION_API",
    action: args.action,
    outcome: args.outcome,
    latency_ms: args.latency_ms ?? null,
    policy_decision: args.policy_decision ?? null,
    entity_ref: args.entity_ref ?? null,
    org_ref: args.org_ref ?? null,
    evaluated_at: (args.evaluatedAt ?? new Date()).toISOString(),
  };
}

export interface MeterThresholdResult {
  decision: MeterThresholdDecision;
  current: number;
  limit: number;
  remaining: number;
  ratio: number;
}

// WHAT: Evaluate a usage value against a limit. Pure, deterministic.
// INPUT: current usage, the limit, and the warn ratio (default 0.8 = 80%).
// OUTPUT: ALLOW (< warn) / WARN (>= warn, < limit) / DENY (>= limit).
// WHY: The metering-enforcement gate the substrate lacked. Opt-in: callers
//      decide whether to act on DENY. Tracking (recordUsageForOrg) stays the
//      source of truth; this turns a counter into a governable threshold.
export function evaluateMeterThreshold(
  current: number,
  limit: number,
  warnRatio = 0.8,
): MeterThresholdResult {
  const safeLimit = limit > 0 ? limit : 0;
  const ratio = safeLimit > 0 ? current / safeLimit : current > 0 ? 1 : 0;
  const decision: MeterThresholdDecision =
    safeLimit > 0 && current >= safeLimit
      ? "DENY"
      : ratio >= warnRatio && safeLimit > 0
        ? "WARN"
        : "ALLOW";
  return {
    decision,
    current,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - current),
    ratio: Number(ratio.toFixed(4)),
  };
}

export interface ObservabilitySnapshot {
  runtime: "FOUNDATION_API";
  org_ref: string | null;
  meters: { meter_id: string; current_value: string }[];
  evaluated_at: string;
}

export type SnapshotResult =
  | { ok: true; snapshot: ObservabilitySnapshot }
  | { ok: false; code: string };
export type MeterCheckResult =
  | { ok: true; result: MeterThresholdResult & { meter_id: string } }
  | { ok: false; code: string };

export class FoundationObservabilityService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      return await getOrgEntityId(entityId);
    } catch {
      return null;
    }
  }

  // WHAT: A SAFE observability snapshot of the caller's OWN org usage meters.
  // WHY: GET /api/v1/foundation/observability/snapshot. Tenant-scoped; carries
  //      meter IDs + counters only (no PII, no other tenant's data).
  async getObservabilitySnapshotForCaller(
    sessionToken: string,
  ): Promise<SnapshotResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    let meters: { meter_id: string; current_value: string }[] = [];
    if (orgEntityId !== null) {
      const usage = await getOrgUsage(orgEntityId);
      if (usage.ok) {
        meters = usage.meters.map((m) => ({
          meter_id: m.meter_id,
          current_value: m.current_value.toString(),
        }));
      }
    }
    return {
      ok: true,
      snapshot: {
        runtime: "FOUNDATION_API",
        org_ref: orgEntityId,
        meters,
        evaluated_at: new Date().toISOString(),
      },
    };
  }

  // WHAT: Check one of the caller's org meters against a limit (enforcement
  //        evaluator). Emits a USAGE_METER_THRESHOLD_REACHED audit on WARN/DENY.
  // WHY: POST /api/v1/foundation/observability/meter-check. The governable gate;
  //      opt-in (the caller decides whether to act on DENY).
  async checkMeterThresholdForCaller(
    sessionToken: string,
    meterId: string,
    limit: number,
  ): Promise<MeterCheckResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    if (typeof meterId !== "string" || meterId.length === 0)
      return { ok: false, code: "INVALID_METER_ID" };
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0)
      return { ok: false, code: "INVALID_LIMIT" };

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    let current = 0;
    if (orgEntityId !== null) {
      const usage = await getOrgUsage(orgEntityId);
      if (usage.ok) {
        const row = usage.meters.find((m) => m.meter_id === meterId);
        if (row !== undefined) current = Number(row.current_value);
      }
    }

    const result = evaluateMeterThreshold(current, limit);

    if (result.decision !== "ALLOW") {
      await writeAuditEvent({
        event_type: "USAGE_METER_THRESHOLD_REACHED",
        outcome: result.decision === "DENY" ? "DENIED" : "SUCCESS",
        actor_entity_id: validation.entity_id,
        denial_reason: result.decision === "DENY" ? "meter-limit-exceeded" : null,
        details: {
          action: "USAGE_METER_THRESHOLD_REACHED",
          meter_id: meterId,
          decision: result.decision,
          current: result.current,
          limit: result.limit,
          ratio: result.ratio,
        },
      });
    }

    return { ok: true, result: { ...result, meter_id: meterId } };
  }
}
