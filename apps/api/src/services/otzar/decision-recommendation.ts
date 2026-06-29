// FILE: decision-recommendation.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Decision recommendation. When direction is
//          unclear or contested, Otzar should not just say "needs clarification"
//          — it should RECOMMEND the strongest direction from memory + evidence +
//          hierarchy + expertise + policy (and, only when internal memory is
//          thin, recommend governed research). But recommendation != decision !=
//          authority != execution: Otzar recommends the best path, the Work Graph
//          says who decides, policy says what's allowed, and Otzar executes only
//          when trust conditions hold. Pure & deterministic; memory-first.
// CONNECTS TO: decision-rights.ts, recipient-governance.ts, autonomy.ts,
//              tests/unit/decision-recommendation.test.ts.

import type { DecisionRights } from "./decision-rights.js";
import { frameTaskFromStrategicDirection } from "./decision-rights.js";
import type { RecipientGovernance } from "./recipient-governance.js";

export type RecommendationConfidence = "high" | "medium" | "low";

export type NextBestAction =
  | "execute"
  | "draft"
  | "route"
  | "ask_one_question"
  | "request_approval"
  | "gather_evidence"
  | "research"
  | "block";

export type EvidenceKind =
  | "transcript"
  | "chat"
  | "email"
  | "doc"
  | "ticket"
  | "pr"
  | "work_graph"
  | "prior_decision"
  | "prior_outcome"
  | "role_expertise"
  | "hierarchy"
  | "policy"
  | "correction"
  | "research";

export interface RecommendationReason {
  kind: EvidenceKind;
  detail: string;
  /** True for EXTERNAL research — labeled separately from internal memory and
   *  never treated as org policy. */
  external?: boolean;
  source?: string | null;
}

export interface DecisionRecommendation {
  recommendedDirection: string;
  confidence: RecommendationConfidence;
  /** The proof path supporting the recommendation. */
  why: RecommendationReason[];
  risks: string[];
  alternatives: Array<{ direction: string; weakerBecause: string }>;
  decisionOwner: string | null;
  nextBestAction: NextBestAction;
  requiresConfirmation: boolean;
  /** Memory-first: only true when internal evidence is thin AND the domain
   *  benefits from external best-practice. Never overrides policy/authority. */
  researchRecommended: boolean;
  policyBlocked: boolean;
}

export function recommendDirection(args: {
  decision: DecisionRights;
  governance?: RecipientGovernance | null;
  proposedDirection?: string | null;
  /** Internal governed memory signals (work graph / prior decisions / outcomes /
   *  tickets / docs). Memory-first: consulted before any research. */
  internalEvidence?: RecommendationReason[];
  /** A strategic priority that should frame the task (e.g. "speed over overbuild"). */
  strategicPriority?: string | null;
  policyAllows?: boolean;
}): DecisionRecommendation {
  const d = args.decision;
  const internal = args.internalEvidence ?? [];
  const policyAllows = args.policyAllows ?? d.alignmentState !== "needs_authority_decision";
  const policyBlocked = policyAllows === false;

  // ── Recommended direction (strategic framing applied) ───────────────────
  let recommendedDirection =
    d.note && d.alignmentState === "decision_made"
      ? d.note
      : args.proposedDirection ?? d.authoritySource?.direction ?? "Hold and confirm the owner/direction.";
  if (args.strategicPriority) {
    const framed = frameTaskFromStrategicDirection(args.strategicPriority, recommendedDirection);
    if (framed) recommendedDirection = `${recommendedDirection} — ${framed}`;
  }

  // ── Proof path (why) ────────────────────────────────────────────────────
  const why: RecommendationReason[] = [...internal];
  if (d.authoritySource) {
    why.push({ kind: "hierarchy", detail: `${d.authoritySource.party} holds decision rights (${d.decisionDomain}).` });
  }
  for (const e of d.expertiseSignals) {
    why.push({ kind: "role_expertise", detail: `${e.party} has ${e.strength} domain evidence.`, source: e.evidence ?? null });
  }
  if (args.strategicPriority) {
    why.push({ kind: "prior_decision", detail: `Strategic priority: ${args.strategicPriority}.` });
  }

  // ── Confidence (from decision-rights) ───────────────────────────────────
  const confidence: RecommendationConfidence = d.confidence;

  // ── Risks ───────────────────────────────────────────────────────────────
  const risks: string[] = [];
  if (d.dissentSignals.length > 0) risks.push("conflicting ownership — wrong owner risk");
  if (args.governance && args.governance.recipientSafety !== "confirmed") risks.push("recipient not confirmed — wrong recipient / context-leak risk");
  if (args.strategicPriority && /speed|modular|don't overbuild/.test(args.strategicPriority.toLowerCase())) risks.push("overbuild risk if scope expands beyond the priority");
  if (policyBlocked) risks.push("policy violation if executed without approval");

  // ── Alternatives (the dissent directions, weaker because unconfirmed) ───
  const alternatives = d.dissentSignals
    .filter((s) => (s.direction ?? "").length > 0)
    .map((s) => ({ direction: s.direction!, weakerBecause: `asserted by ${s.party} but conflicts with the decision owner / unconfirmed` }));

  const decisionOwner = d.decisionOwner ?? d.escalationTarget;

  // ── Memory-first, research-second ───────────────────────────────────────
  const technicalDomain = ["technical", "security", "architecture"].includes(d.decisionDomain);
  const researchRecommended = internal.length === 0 && confidence === "low" && technicalDomain && !policyBlocked;

  // ── Next best action ────────────────────────────────────────────────────
  let nextBestAction: NextBestAction;
  if (policyBlocked) {
    nextBestAction = "block";
  } else if (confidence === "high" && d.autonomyBlocked === false) {
    nextBestAction = "draft"; // auto-send is not enabled; the safe move is draft/route
  } else if (confidence === "medium") {
    nextBestAction = "request_approval";
  } else {
    // low
    nextBestAction = researchRecommended ? "research" : internal.length === 0 ? "gather_evidence" : "ask_one_question";
  }

  const requiresConfirmation = confidence !== "high" || d.autonomyBlocked;

  return {
    recommendedDirection,
    confidence,
    why,
    risks,
    alternatives,
    decisionOwner,
    nextBestAction,
    requiresConfirmation,
    researchRecommended,
    policyBlocked,
  };
}
