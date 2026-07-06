// FILE: truth-weight.service.ts
// PURPOSE: [BLOCK-3C] Truth weight over stamped communication lineage —
//          the composition law the retrieval surfaces obey:
//            truth weight = decision rights + communication act + source
//            lineage + authority lineage + agreement lineage +
//            currentness + permissions.
//          NEVER: newest-wins, executive-wins, hierarchy-wins,
//          transcript-wins, document-wins, sales-promise-beats-approved-
//          scope, request-becomes-policy, memory-becomes-current-truth.
//          Pure and deterministic — no LLM, no DB. Permissions are NOT
//          decided here: callers gate row visibility BEFORE ranking (the
//          party-or-manager ledger gate + the AIX-3 candidate gate);
//          this service only weighs rows the caller may already see.
// CONNECTS TO: communication-lineage.service.ts (the stamped input),
//          clarity-answer.service.ts (the consuming surface),
//          context-retrieval.service.ts (CONTEXT_RANKING_LAW — ranks 1–3
//          spine semantics now lineage-aware), supersession-linking
//          .service.ts, tests/integration/truth-weight-retrieval.test.ts.

import type { CommunicationAct, CommunicationLineage } from "./communication-lineage.service.js";

/** Weight classes, strongest first. Rank number = position (1 wins). */
export const TRUTH_WEIGHT_CLASSES = [
  // 1 — a policy constraint binds regardless of who prefers what.
  "policy_constraint",
  // 2 — a decision/approval made WITHIN structured authority.
  "authorized_decision",
  // 3 — a decision-like act with no structured rights to judge against
  //     (honest heuristic tier — never inflated to authorized).
  "unverified_decision",
  // 4 — commitments/assignments/action items within or without rights,
  //     plus objections/escalations/corrections (real work signals).
  "work_signal",
  // 5 — proposals, requests, recommend-only statements: they inform,
  //     they never finalize.
  "recommendation",
  // 6 — memory references, unresolved questions, clarifications: never
  //     current truth by themselves.
  "reference_only",
  // 7 — flagged: finality claimed beyond authority. Visible, marked,
  //     never approved truth.
  "exceeds_authority",
  // 8 — superseded by a linked, newer, valid source.
  "superseded",
] as const;
export type TruthWeightClass = (typeof TRUTH_WEIGHT_CLASSES)[number];

export interface TruthWeight {
  weight_class: TruthWeightClass;
  /** 1 = strongest. Position in TRUTH_WEIGHT_CLASSES. */
  rank: number;
  /** True only for classes that may state current organizational truth. */
  is_current_truth: boolean;
  /** True only when this statement could FINALIZE something. */
  can_finalize: boolean;
  /** Honest, human-safe flags (never raw mechanics). */
  flags: string[];
}

const DECISION_ACTS: ReadonlySet<CommunicationAct> = new Set([
  "decision",
  "approval",
  "superseding_decision",
  "rejection",
]);
const RECOMMENDATION_ACTS: ReadonlySet<CommunicationAct> = new Set(["proposal", "request"]);
const REFERENCE_ACTS: ReadonlySet<CommunicationAct> = new Set([
  "memory_reference",
  "unresolved_question",
  "clarification",
]);

function classify(l: CommunicationLineage): TruthWeightClass {
  // Superseded rows lose to their superseding source — always.
  if (l.superseded_by !== null || l.currentness === "superseded") return "superseded";
  // A policy constraint outranks personal preference and domain rights.
  if (l.communication_act === "policy_constraint") return "policy_constraint";
  // References never become current truth (a memory of a decision is not
  // a decision; a question is not an answer).
  if (REFERENCE_ACTS.has(l.communication_act)) return "reference_only";
  // Finality claimed beyond structured authority: flagged, never truth.
  if (l.authority_status === "exceeds_authority") return "exceeds_authority";
  // A request/proposal — or anything said from a recommend-only posture —
  // informs but does not finalize.
  if (RECOMMENDATION_ACTS.has(l.communication_act) || l.authority_status === "recommend_only")
    return "recommendation";
  if (DECISION_ACTS.has(l.communication_act)) {
    // Rights-verified decisions rank above unverified ones. "unknown"
    // means no structured rights existed to judge against — honest
    // middle tier, never inflated (the executive does not always win;
    // hierarchy alone confers nothing).
    return l.authority_status === "within_authority" ? "authorized_decision" : "unverified_decision";
  }
  return "work_signal";
}

/** Weigh ONE statement's stamped lineage. Pure. */
export function computeTruthWeight(l: CommunicationLineage): TruthWeight {
  const weight_class = classify(l);
  const rank = TRUTH_WEIGHT_CLASSES.indexOf(weight_class) + 1;
  const flags: string[] = [];
  if (l.authority_status === "exceeds_authority")
    flags.push("This went beyond the speaker's decision rights — not approved truth until the owner confirms.");
  if (l.authority_status === "recommend_only")
    flags.push("Said from a recommend-only posture — it informs, it does not finalize.");
  if (l.communication_act === "memory_reference")
    flags.push("A recollection, not a source of record.");
  if (l.communication_act === "unresolved_question") flags.push("Still an open question.");
  if (l.superseded_by !== null) flags.push("Superseded by a newer approved source.");
  return {
    weight_class,
    rank,
    is_current_truth:
      (weight_class === "authorized_decision" ||
        weight_class === "policy_constraint" ||
        weight_class === "work_signal" ||
        weight_class === "unverified_decision") &&
      l.currentness === "current",
    can_finalize: weight_class === "authorized_decision" || weight_class === "policy_constraint",
    flags,
  };
}

/** Compare two weighed statements: lower rank wins; recency breaks ties
 *  ONLY within the same class (newest-wins is never a cross-class rule). */
export function compareTruthWeight(
  a: { weight: TruthWeight; source_date: string | null },
  b: { weight: TruthWeight; source_date: string | null },
): number {
  if (a.weight.rank !== b.weight.rank) return a.weight.rank - b.weight.rank;
  const ad = a.source_date ?? "";
  const bd = b.source_date ?? "";
  return bd.localeCompare(ad); // same class: newer first
}

/** Parse a stamped lineage out of a ledger row's details JSON. Returns
 *  null unless the shape is genuinely the 3B statement stamp. */
export function lineageFromDetails(details: unknown): CommunicationLineage | null {
  if (typeof details !== "object" || details === null) return null;
  const l = (details as { communication_lineage?: unknown }).communication_lineage;
  if (typeof l !== "object" || l === null) return null;
  const cand = l as Partial<CommunicationLineage>;
  if (typeof cand.communication_act !== "string") return null; // artifact-level stamps have no act
  return cand as CommunicationLineage;
}

/** The calm, user-facing correction when someone works from a superseded
 *  source: a brief correction plus the current source — never a source
 *  dump, never "you are wrong", never raw ranking mechanics. */
export function composeSupersededCorrection(args: {
  staleTitle: string;
  currentTitle: string;
}): string {
  return `You may be looking at an older plan — "${args.staleTitle}" was superseded. The current decision is "${args.currentTitle}".`;
}
