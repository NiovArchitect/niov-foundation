// FILE: usage-meter.service.ts
// PURPOSE: Section 8 Billing Completion B6-α per ADR-0093 §5
//          Candidate C. Tracking-only usage meter foundation.
//          Per-org per-meter counter that internal event sources
//          (Section 4 INVOKE_CONNECTOR + W5 PROPOSED_ACTION_
//          REFERENCED + voice intent + audit exports + ...) call
//          to record usage; never publicly exposed.
//
//          Enforcement is explicitly DEFERRED to a future B6-β
//          slice per ADR-0093 §7 + Founder pricing decision. V1
//          carries the current running total only; rolled-up
//          snapshots are forward-substrate.
//
//          USAGE_METER_RECORDED audit event fires on every
//          increment per RULE 4 + ADR-0042 §Q-γ.1.
//
// CONNECTS TO:
//   - packages/database (prisma.usageMeter.upsert +
//     writeAuditEvent for USAGE_METER_RECORDED)
//   - ADR-0093 §5 Candidate C + §7 + §10
//   - ADR-0042 §Q-γ.1 clean-transition
//   - docs/entitlement-catalog/usage-meters.json (B2 catalog
//     vocabulary)

import { prisma, writeAuditEvent } from "@niov/database";

// WHAT: The minimal meter_id pattern check for the closed-vocab
//        catalog vocabulary `meter.<name>.v<n>`.
// INPUT: A meter_id string.
// OUTPUT: true if the id matches the canonical pattern; false
//         otherwise.
// WHY: B2 catalog at docs/entitlement-catalog/usage-meters.json
//      uses this pattern; defense-in-depth at the runtime tier
//      catches typos before they create orphaned counter rows.
const METER_ID_PATTERN =
  /^meter\.[a-z][a-z0-9-]*\.v[0-9]+$/;

export function isValidMeterId(meter_id: unknown): meter_id is string {
  return typeof meter_id === "string" && METER_ID_PATTERN.test(meter_id);
}

export type RecordUsageResult =
  | {
      ok: true;
      org_entity_id: string;
      meter_id: string;
      delta: number;
      post_value: bigint;
    }
  | {
      ok: false;
      code:
        | "INVALID_METER_ID"
        | "INVALID_DELTA"
        | "INVALID_ORG_ENTITY_ID";
      httpStatus: 422;
      message: string;
    };

export type GetOrgUsageResult = {
  ok: true;
  org_entity_id: string;
  meters: ReadonlyArray<{
    meter_id: string;
    current_value: bigint;
    last_recorded_at: Date;
  }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WHAT: Record a usage delta against the org's running counter for
//        the given meter_id.
// INPUT: org_entity_id (UUID) + meter_id (closed-vocab) + delta
//        (positive integer; recording USAGE not refund).
// OUTPUT: RecordUsageResult discriminated union.
// WHY: ADR-0093 §5 Candidate C canonical write helper. Atomic
//      upsert + increment is delivered via prisma.usageMeter.upsert
//      with `increment` on the update branch + initial value on
//      create. Audit emission per RULE 4 + ADR-0042 §Q-γ.1 fires
//      AFTER the upsert succeeds. Errors at validation tier fail
//      fast with 422 INVALID_*; no audit emitted.
export async function recordUsageForOrg(
  org_entity_id: string,
  meter_id: string,
  delta: number,
): Promise<RecordUsageResult> {
  if (typeof org_entity_id !== "string" || !UUID_RE.test(org_entity_id)) {
    return {
      ok: false,
      code: "INVALID_ORG_ENTITY_ID",
      httpStatus: 422,
      message: "org_entity_id must be a UUID",
    };
  }
  if (!isValidMeterId(meter_id)) {
    return {
      ok: false,
      code: "INVALID_METER_ID",
      httpStatus: 422,
      message: `meter_id must match ${METER_ID_PATTERN.source}`,
    };
  }
  if (!Number.isInteger(delta) || delta <= 0) {
    return {
      ok: false,
      code: "INVALID_DELTA",
      httpStatus: 422,
      message: "delta must be a positive integer",
    };
  }
  const deltaBig = BigInt(delta);
  const updated = await prisma.usageMeter.upsert({
    where: {
      org_entity_id_meter_id: { org_entity_id, meter_id },
    },
    update: {
      current_value: { increment: deltaBig },
      last_recorded_at: new Date(),
    },
    create: {
      org_entity_id,
      meter_id,
      current_value: deltaBig,
    },
  });
  await writeAuditEvent({
    event_type: "USAGE_METER_RECORDED",
    outcome: "SUCCESS",
    actor_entity_id: null,
    target_entity_id: org_entity_id,
    details: {
      org_entity_id,
      meter_id,
      delta,
      post_value: updated.current_value.toString(),
    },
  });
  return {
    ok: true,
    org_entity_id,
    meter_id,
    delta,
    post_value: updated.current_value,
  };
}

// WHAT: Read every meter counter for the given org as a SAFE
//        projection.
// INPUT: org_entity_id (UUID).
// OUTPUT: GetOrgUsageResult — an array of { meter_id, current_value,
//         last_recorded_at } rows.
// WHY: ADR-0093 §5 Candidate C read helper. SAFE projection:
//      closed-vocab meter_ids + integer counters + timestamps; no
//      per-actor attribution, no raw payload echo, no pricing data
//      surfaced.
export async function getOrgUsage(
  org_entity_id: string,
): Promise<GetOrgUsageResult> {
  const rows = await prisma.usageMeter.findMany({
    where: { org_entity_id },
    select: {
      meter_id: true,
      current_value: true,
      last_recorded_at: true,
    },
    orderBy: { meter_id: "asc" },
  });
  return {
    ok: true,
    org_entity_id,
    meters: rows.map((r) => ({
      meter_id: r.meter_id,
      current_value: r.current_value,
      last_recorded_at: r.last_recorded_at,
    })),
  };
}
