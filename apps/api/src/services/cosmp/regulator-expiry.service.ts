// FILE: regulator-expiry.service.ts
// PURPOSE: Hardening Wave D — proactive REGULATOR_ACCESS_EXPIRED
//          emitter per ADR-0036 Sub-decision 4. The REGULATOR_ACCESS_EXPIRED
//          audit literal was reserved at CAR Sub-box 3 sub-phase 5
//          but never emitted (canonical text: "expiration handling is
//          forward-queued to sub-phase 6 enforcement / scheduler tier
//          per Q3 LOCKED Option α — would use existing
//          SYSTEM_PRINCIPALS.SCHEDULER per Q7 LOCKED Option α").
//          Hardening Wave D implements that scheduler tier.
// CONNECTS TO:
//   - packages/database/prisma/schema.prisma (LawfulBasis model)
//   - packages/database/src/queries/audit.ts (writeAuditEvent +
//     SYSTEM_PRINCIPALS.SCHEDULER + REGULATOR_ACCESS_EXPIRED literal)
//   - packages/database/src/queries/lawful-basis.ts (LawfulBasis
//     accessors)
//   - apps/api/src/services/action/scheduler.ts (the SCHEDULER
//     cron host that wakes this sweep on a timer)
//
// DESIGN POSTURE:
//   - Idempotent. The sweep finds LawfulBasis rows where:
//       (a) valid_until <= now (already past expiration window)
//       (b) the row has not been revoked (no
//           REGULATOR_ACCESS_REVOKED audit row carrying this
//           basis_id; revocation supersedes expiration in the
//           lifecycle vocabulary)
//       (c) the row has not already been marked expired by a
//           prior sweep (no REGULATOR_ACCESS_EXPIRED audit row
//           carrying this basis_id)
//     For each matching row, emits one REGULATOR_ACCESS_EXPIRED
//     audit row. Re-running the sweep is a no-op once a basis has
//     been marked.
//   - Audit attribution: actor_entity_id=null +
//     system_principal=SYSTEM_PRINCIPALS.SCHEDULER per the
//     escalation.service.ts:686 expireEscalation precedent.
//   - target_entity_id: the regulator entity_id (the grant's
//     intended subject; preserves forensic traceability to the
//     regulator whose access just expired).
//   - lawful_basis_id + lawful_basis_chain_hash: included so the
//     hash-chain binding from CAR Sub-box 3 sub-phase 4 stays
//     intact through the expiration row.
//   - Bounded batch: SWEEP_BATCH_LIMIT caps rows per tick so a
//     pathological backlog (e.g., the sweep was disabled for a
//     long period then re-enabled) cannot run unbounded.
//
// PRIVACY INVARIANT:
//   - The audit details carry basis_id + chain_hash + valid_until
//     ONLY. They do NOT echo basis_reference or
//     jurisdiction_invoked — those columns are stored on the
//     LawfulBasis row + accessible to authorized regulator-tier
//     reads, but they would be redundant noise in the expiration
//     row (and the canonical Sub-box 3 reads project them
//     elsewhere).

import {
  prisma,
  SYSTEM_PRINCIPALS,
  writeAuditEvent,
} from "@niov/database";
import type { Prisma } from "@prisma/client";

// WHAT: How many candidate bases the sweep processes per tick.
// INPUT: None.
// OUTPUT: A constant integer.
// WHY: Bounded batch + ordered by valid_until ASC = oldest-first
//      fairness; a pathological backlog drains over multiple ticks
//      rather than starving one giant transaction.
export const REGULATOR_EXPIRY_SWEEP_BATCH = 50;

// WHAT: The result shape returned by tickRegulatorAccessExpirySweep.
// INPUT: None.
// OUTPUT: None — type only.
// WHY: Observability — operators monitoring the scheduler want to
//      see how many bases were marked vs how many were already
//      handled / not-yet-expired / revoked.
export interface TickRegulatorExpiryResult {
  expired: number;
  // candidates_considered = rows whose valid_until <= now (before
  // de-dup filtering against existing REVOKED / EXPIRED audits).
  candidates_considered: number;
}

// WHAT: Optional inputs to the sweep — `now` for deterministic
//        test clocks, `maxBatch` for operator tuning.
// INPUT: Used as a parameter type.
// OUTPUT: None — type only.
// WHY: Mirrors the TickSchedulerOptions shape at
//      apps/api/src/services/action/scheduler.ts so the cron-tick
//      host doesn't have to special-case this sweep.
export interface TickRegulatorExpiryOptions {
  now?: Date;
  maxBatch?: number;
}

// WHAT: One regulator-expiry sweep. Idempotent.
// INPUT: TickRegulatorExpiryOptions.
// OUTPUT: TickRegulatorExpiryResult.
// WHY: Implements ADR-0036 Sub-decision 4's forward-queued
//      scheduler tier. Per-row work is bounded; the cron host
//      calls this on a steady cadence (Wave D wires every 60s).
//      Failure to find candidates → expired=0 (silent success;
//      no audit emission, no logs).
export async function tickRegulatorAccessExpirySweep(
  options: TickRegulatorExpiryOptions = {},
): Promise<TickRegulatorExpiryResult> {
  const now = options.now ?? new Date();
  const maxBatch = options.maxBatch ?? REGULATOR_EXPIRY_SWEEP_BATCH;

  // Step 1 — find bases whose validity window has elapsed.
  const candidates = await prisma.lawfulBasis.findMany({
    where: { valid_until: { lte: now } },
    orderBy: { valid_until: "asc" },
    take: maxBatch,
    select: {
      basis_id: true,
      chain_hash: true,
      valid_until: true,
      audit_id: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: 0, candidates_considered: 0 };
  }

  // Step 2 — for each candidate, look up the regulator target +
  // any existing terminal audit (REVOKED supersedes EXPIRED; an
  // existing EXPIRED is the idempotency signal). The grant audit
  // row (LawfulBasis.audit_id) carries target_entity_id which is
  // the regulator the basis was granted to per ADR-0036
  // Sub-decision 6.
  let expired = 0;
  for (const candidate of candidates) {
    // Idempotency: skip if an EXPIRED audit row already carries
    // this basis_id (prior sweep already marked it).
    const alreadyExpired = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_EXPIRED",
        lawful_basis_id: candidate.basis_id,
      },
      select: { audit_id: true },
    });
    if (alreadyExpired !== null) continue;

    // Supersession: skip if the basis was revoked (REVOKED is the
    // canonical terminal state; emitting EXPIRED on top would be
    // redundant + confuse the lifecycle chain).
    const revoked = await prisma.auditEvent.findFirst({
      where: {
        event_type: "REGULATOR_ACCESS_REVOKED",
        lawful_basis_id: candidate.basis_id,
      },
      select: { audit_id: true },
    });
    if (revoked !== null) continue;

    // Resolve the grant audit so we can surface target_entity_id
    // (the regulator) on the expiration row. If audit_id is null
    // (LawfulBasis without a grant audit linkage — edge case;
    // shouldn't happen post-Sub-box-3-sub-phase-5 but defensive)
    // we fall back to target_entity_id=null.
    let target_entity_id: string | null = null;
    if (candidate.audit_id !== null) {
      const grant = await prisma.auditEvent.findUnique({
        where: { audit_id: candidate.audit_id },
        select: { target_entity_id: true },
      });
      target_entity_id = grant?.target_entity_id ?? null;
    }

    const details: Prisma.InputJsonValue = {
      action: "REGULATOR_ACCESS_EXPIRED",
      basis_id: candidate.basis_id,
      valid_until: candidate.valid_until.toISOString(),
    };
    await writeAuditEvent({
      event_type: "REGULATOR_ACCESS_EXPIRED",
      outcome: "SUCCESS",
      actor_entity_id: null,
      system_principal: SYSTEM_PRINCIPALS.SCHEDULER,
      target_entity_id,
      lawful_basis_id: candidate.basis_id,
      lawful_basis_chain_hash: candidate.chain_hash,
      details,
    });
    expired += 1;
  }

  return { expired, candidates_considered: candidates.length };
}
