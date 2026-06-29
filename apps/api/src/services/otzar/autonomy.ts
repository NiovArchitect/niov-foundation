// FILE: autonomy.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Earned-autonomy model. The approval layer is
//          training wheels, not the final product — but autonomy is EARNED, not
//          assumed. This computes, for a proposed action, whether it WOULD be
//          eligible for auto-send in a future trusted mode and WHY, the action
//          risk, the minimized context scope, the approval reason, and the
//          post-action ledger state (sent / waiting / needs_review / blocked).
//
//          CRITICAL: no auto-send is enabled anywhere. `wouldAutoSendUnderMode`
//          is ADVISORY only — the live system always drafts + asks. This model
//          exists so the UI can say "this would be auto-eligible, and why" and so
//          a future mode can flip on safely once governance is proven.
// CONNECTS TO: recipient-governance.ts, decision-rights.ts, comms-extract,
//              tests/unit/autonomy.test.ts.

import type { RecipientGovernance } from "./recipient-governance.js";
import type { DecisionRights } from "./decision-rights.js";

export type AutonomyMode =
  | "draft_and_approve" // current default
  | "notify_before_send"
  | "auto_send_with_visibility"
  | "policy_governed"
  | "executive";

export type ActionRisk = "low" | "medium" | "high";

// Context minimization: send only what the recipient needs.
export type ContextScope =
  | "full"
  | "task_summary"
  | "narrow_excerpt"
  | "approval_summary"
  | "none";

// Post-action ledger model — the calm "Sent / Waiting / Needs review / Blocked".
export type LedgerState = "sent" | "waiting" | "needs_review" | "blocked" | "draft";

export interface AutonomyDecision {
  /** Would this be eligible for auto-send in a future trusted mode? */
  futureAutoEligible: boolean;
  /** Human-readable reasons (why eligible / why not). */
  reasons: string[];
  requiresApprovalReason: string | null;
  actionRisk: ActionRisk;
  /** Minimized context to share (never "full" unless policy + need allow it). */
  contextScope: ContextScope;
  /** Ledger bucket under the CURRENT mode. */
  ledgerState: LedgerState;
  /** Advisory: under the given mode + policy, would an auto-send fire? The live
   *  system never acts on this — it always drafts + asks. */
  wouldAutoSendUnderMode: boolean;
}

export function computeAutonomyDecision(args: {
  governance: RecipientGovernance;
  decision?: DecisionRights | null;
  mode?: AutonomyMode;
}): AutonomyDecision {
  const g = args.governance;
  const d = args.decision ?? null;
  const mode = args.mode ?? "draft_and_approve";
  const reasons: string[] = [];

  // ── Action risk ─────────────────────────────────────────────────────────
  const actionRisk: ActionRisk =
    g.recipientSafety === "out_of_scope" || g.recipientSafety === "unauthorized" || g.sensitivity === "sensitive" || g.sensitivity === "restricted"
      ? "high"
      : g.recipientSafety === "confirmed" && (g.sensitivity === "low" || g.sensitivity === "internal")
        ? "low"
        : "medium";

  // ── Ledger state ────────────────────────────────────────────────────────
  const ledgerState: LedgerState =
    g.recipientSafety === "out_of_scope" || g.recipientSafety === "unauthorized"
      ? "blocked"
      : g.recipientSafety === "ambiguous"
        ? "needs_review"
        : g.recipientSafety === "cross_team_needs_approval" || g.recipientSafety === "likely"
          ? "needs_review"
          : d?.autonomyBlocked === true
            ? "needs_review"
            : "draft"; // confirmed -> drafted, awaiting approval under current mode

  // ── Context minimization ────────────────────────────────────────────────
  const contextScope: ContextScope =
    ledgerState === "blocked"
      ? "none"
      : g.recipientSafety === "cross_team_needs_approval"
        ? "approval_summary"
        : g.recipientSafety === "confirmed"
          ? "task_summary" // only the task-specific context, never the full transcript
          : "narrow_excerpt";

  // ── Future auto-eligibility (the decision matrix) ───────────────────────
  const safetyOk = g.recipientSafety === "confirmed";
  const proofOk = g.mentionStatus === "explicitly_mentioned" || g.participantStatus === "participant";
  const roleOk = g.roleMatch === "clear";
  const sensOk = g.sensitivity === "low" || g.sensitivity === "internal";
  const policyOk = g.policyStatus === "allowed";
  const noAmbiguity = g.autonomyEligibility !== "clarification_required" && g.recipientSafety !== "ambiguous";
  const decisionOk = d === null || (d.autonomyBlocked === false && d.confidence === "high");

  if (!safetyOk) reasons.push("recipient is not confirmed");
  if (!proofOk) reasons.push("no explicit assignment or participation");
  if (!roleOk) reasons.push("role fit is not clear");
  if (!sensOk) reasons.push("sensitivity above low/internal");
  if (!policyOk) reasons.push("policy does not clearly allow");
  if (!noAmbiguity) reasons.push("recipient ambiguity");
  if (!decisionOk) reasons.push("decision not aligned/confirmed (authority vs expertise)");

  const futureAutoEligible =
    safetyOk && proofOk && roleOk && sensOk && policyOk && noAmbiguity && decisionOk;
  if (futureAutoEligible) {
    reasons.length = 0;
    reasons.push("explicit assignment", "confirmed recipient", "clear role fit", "low sensitivity", "policy allows", "no ambiguity");
  }

  // ── Approval reason (why a human must look, under current/intermediate modes)
  const requiresApprovalReason: string | null =
    g.recipientSafety === "out_of_scope"
      ? "Recipient has no proof path to this work."
      : g.recipientSafety === "unauthorized"
        ? "Policy does not permit this recipient."
        : g.recipientSafety === "ambiguous"
          ? "Recipient is ambiguous — clarify first."
          : g.recipientSafety === "cross_team_needs_approval"
            ? "Cross-team or sensitive route — approval required."
            : d?.autonomyBlocked === true
              ? d.requiresClarificationReason
              : !futureAutoEligible
                ? "Not yet auto-eligible — review before sending."
                : null;

  // ── Would auto-send fire under the given mode? (ADVISORY — never executed) ─
  const modeAllowsAuto =
    mode === "auto_send_with_visibility" || mode === "policy_governed" || mode === "executive";
  const wouldAutoSendUnderMode = modeAllowsAuto && futureAutoEligible && policyOk;

  return {
    futureAutoEligible,
    reasons,
    requiresApprovalReason,
    actionRisk,
    contextScope,
    ledgerState,
    wouldAutoSendUnderMode,
  };
}
