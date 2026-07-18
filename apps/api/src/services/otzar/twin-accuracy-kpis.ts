// FILE: twin-accuracy-kpis.ts
// PURPOSE: Phase E.3 — pure rollup of Twin work accuracy / dual-control KPIs
//          from WorkLedgerEntry rows that carry details.twin_work. Admin
//          inventory surfaces Twin vs human verification (never invents).
// CONNECTS TO: enterprise-tools.service inventory, twin-work-claim.service,
//          tests/unit/twin-accuracy-kpis.test.ts.

export type TwinAccuracyKpis = {
  /** Rows with a twin_work claim object. */
  twin_claims: number;
  /** Twin still in flight (working / clarity / collab / awaiting verify). */
  twin_active: number;
  /** Twin marked COMPLETED in twin_work. */
  twin_completed: number;
  /** Regulated accuracy class or requires_verification. */
  regulated_claims: number;
  /** Human verification still needed. */
  awaiting_human_verify: number;
  /** Human verified (dual-control). */
  human_verified: number;
  /** Verified and completed. */
  human_verified_and_completed: number;
  /** Human edited Twin-claimed doc after claim (edit detect). */
  human_edit_after_claim: number;
  /** Ledger parked NEEDS_CALLER_CONFIRMATION for verification. */
  completion_gate_blocks: number;
  /** Sample regulated accuracy classes seen (closed vocab labels). */
  regulated_classes: string[];
};

const ACTIVE_STATES = new Set([
  "CLAIMED_WORKING",
  "NEEDS_CLARITY",
  "COLLAB_REQUESTED",
  "AWAITING_VERIFICATION",
  "EXECUTING",
]);

function extractTwinWork(details: unknown): Record<string, unknown> | null {
  if (typeof details !== "object" || details === null) return null;
  const tw = (details as Record<string, unknown>).twin_work;
  if (typeof tw !== "object" || tw === null) return null;
  return tw as Record<string, unknown>;
}

function isRegulated(tw: Record<string, unknown>): boolean {
  if (tw.requires_verification === true) return true;
  const ac = tw.accuracy_class;
  return typeof ac === "string" && ac.length > 0 && ac !== "STANDARD";
}

function awaitsHuman(tw: Record<string, unknown>): boolean {
  if (!isRegulated(tw)) return false;
  if (tw.verification_state === "VERIFIED") return false;
  return (
    tw.verification_state === "PENDING" ||
    tw.verification_state === "AWAITING_HUMAN" ||
    tw.state === "AWAITING_VERIFICATION" ||
    tw.requires_verification === true
  );
}

/**
 * Pure rollup from ledger rows. Missing twin_work rows are ignored.
 */
export function rollupTwinAccuracyKpis(
  rows: ReadonlyArray<{ status: string; details: unknown }>,
): TwinAccuracyKpis {
  let twin_claims = 0;
  let twin_active = 0;
  let twin_completed = 0;
  let regulated_claims = 0;
  let awaiting_human_verify = 0;
  let human_verified = 0;
  let human_verified_and_completed = 0;
  let human_edit_after_claim = 0;
  let completion_gate_blocks = 0;
  const classSet = new Set<string>();

  for (const row of rows) {
    const tw = extractTwinWork(row.details);
    if (tw === null) continue;
    twin_claims += 1;
    const state = typeof tw.state === "string" ? tw.state : "";
    if (ACTIVE_STATES.has(state)) twin_active += 1;
    if (state === "COMPLETED") twin_completed += 1;

    if (isRegulated(tw)) {
      regulated_claims += 1;
      if (typeof tw.accuracy_class === "string" && tw.accuracy_class !== "STANDARD") {
        classSet.add(tw.accuracy_class);
      }
    }
    if (awaitsHuman(tw)) awaiting_human_verify += 1;
    if (tw.verification_state === "VERIFIED") {
      human_verified += 1;
      if (state === "COMPLETED") human_verified_and_completed += 1;
    }
    if (
      tw.edit_detected === true ||
      tw.edit_signal === "MODIFIED_AFTER_CLAIM"
    ) {
      human_edit_after_claim += 1;
    }
    if (
      row.status === "NEEDS_CALLER_CONFIRMATION" &&
      (state === "AWAITING_VERIFICATION" || awaitsHuman(tw))
    ) {
      completion_gate_blocks += 1;
    }
  }

  return {
    twin_claims,
    twin_active,
    twin_completed,
    regulated_claims,
    awaiting_human_verify,
    human_verified,
    human_verified_and_completed,
    human_edit_after_claim,
    completion_gate_blocks,
    regulated_classes: [...classSet].sort(),
  };
}

export function emptyTwinAccuracyKpis(): TwinAccuracyKpis {
  return rollupTwinAccuracyKpis([]);
}
