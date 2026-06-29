// FILE: decision-rights.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Decision-rights reconciliation. Hierarchy is
//          critical but it does NOT mean "the boss is always right." Otzar must
//          separate Direction (what we're trying to do) / Decision (who
//          finalized) / Truth (what evidence supports) / Responsibility (who
//          owns) / Approval (who must approve) / Execution (who acts). It
//          reconciles authority, expertise, evidence, and alignment into a
//          decision confidence + an autonomy verdict:
//            - authority high + expertise agree + evidence strong + finalized ->
//              high confidence (safe to route).
//            - authority high but evidence weak -> not certain (medium, hold).
//            - authority vs expertise CONFLICT, or unresolved dissent ->
//              confidence LOW, autonomy BLOCKED, ask one focused clarification,
//              route to the decision owner.
//            - policy outranks hierarchy for safety.
//          Pure & deterministic — no LLM, no DB. Tenant-general.
// CONNECTS TO: autonomy.ts (autonomy decision consumes this), recipient-
//              governance.ts, tests/unit/decision-rights.test.ts.

export type DecisionDomain =
  | "strategic"
  | "technical"
  | "product"
  | "design"
  | "security"
  | "legal"
  | "finance"
  | "people"
  | "customer"
  | "execution"
  | "architecture"
  | "deadline"
  | "unknown";

export type AuthorityType =
  | "role"
  | "project"
  | "technical"
  | "domain_expertise"
  | "founder_executive"
  | "policy"
  | "approval"
  | "implementation_ownership"
  | "meeting_leadership"
  | "customer_account";

export type AlignmentState =
  | "aligned"
  | "decision_made"
  | "decision_proposed"
  | "disagreement_unresolved"
  | "blocker_raised"
  | "needs_owner_clarification"
  | "needs_authority_decision"
  | "needs_evidence"
  | "superseded";

export type SignalStrength = "strong" | "moderate" | "weak" | "none";

export interface DecisionSignal {
  /** The party making/holding the signal (name or entity id). */
  party: string;
  authorityType?: AuthorityType;
  strength: SignalStrength;
  /** The direction/claim this party asserts (free text), if any. */
  direction?: string | null;
  /** Source/quote backing it. */
  evidence?: string | null;
  /** True when this signal CONTRADICTS the authority direction (dissent). */
  contradictsAuthority?: boolean;
}

export interface DecisionInput {
  decisionDomain: DecisionDomain;
  /** Who has the right to finalize this decision + the direction they set. */
  authority: DecisionSignal | null;
  /** Domain experts / owners with relevant knowledge. */
  expertise: DecisionSignal[];
  /** Ticket/PR/test/doc evidence signals. */
  evidence: DecisionSignal[];
  /** Whether org policy permits the resulting action. */
  policyAllows: boolean;
  /** Did the team actually finalize a decision (vs merely propose)? */
  finalDecisionMade: boolean;
}

export interface DecisionRights {
  decisionDomain: DecisionDomain;
  decisionOwner: string | null;
  authoritySource: DecisionSignal | null;
  expertiseSignals: DecisionSignal[];
  evidenceSignals: DecisionSignal[];
  dissentSignals: DecisionSignal[];
  alignmentState: AlignmentState;
  confidence: "high" | "medium" | "low";
  escalationTarget: string | null;
  /** True when the decision is not solid enough for autonomous action. */
  autonomyBlocked: boolean;
  requiresClarificationReason: string | null;
  /** A short, human note Otzar can show ("Direction from lead, but evidence
   *  unclear" / "Expert evidence conflicts"). */
  note: string | null;
}

function strongest(signals: DecisionSignal[]): SignalStrength {
  let best: SignalStrength = "none";
  const order: SignalStrength[] = ["none", "weak", "moderate", "strong"];
  for (const s of signals) {
    if (order.indexOf(s.strength) > order.indexOf(best)) best = s.strength;
  }
  return best;
}

/**
 * Reconcile authority + expertise + evidence + alignment into a decision-rights
 * verdict. The boss is not always right; the expert is not always authorized;
 * policy outranks both for safety.
 */
export function computeDecisionRights(input: DecisionInput): DecisionRights {
  const dissent = [
    ...input.expertise.filter((e) => e.contradictsAuthority === true),
    ...input.evidence.filter((e) => e.contradictsAuthority === true),
  ];
  const decisionOwner = input.authority?.party ?? null;
  const base: Omit<DecisionRights, "alignmentState" | "confidence" | "escalationTarget" | "autonomyBlocked" | "requiresClarificationReason" | "note"> = {
    decisionDomain: input.decisionDomain,
    decisionOwner,
    authoritySource: input.authority,
    expertiseSignals: input.expertise,
    evidenceSignals: input.evidence,
    dissentSignals: dissent,
  };

  // 1. Policy outranks hierarchy for safety.
  if (!input.policyAllows) {
    return {
      ...base,
      alignmentState: "needs_authority_decision",
      confidence: "low",
      escalationTarget: "policy approver",
      autonomyBlocked: true,
      requiresClarificationReason: "Org policy requires approval for this action.",
      note: "Policy outranks hierarchy — approval required.",
    };
  }

  // 2. Unresolved disagreement / authority-vs-expertise conflict blocks autonomy.
  if (dissent.length > 0 && !input.finalDecisionMade) {
    const expert = dissent.find((d) => d.authorityType === "domain_expertise" || d.authorityType === "implementation_ownership" || d.authorityType === "technical");
    return {
      ...base,
      alignmentState: "disagreement_unresolved",
      confidence: "low",
      escalationTarget: decisionOwner ?? expert?.party ?? null,
      autonomyBlocked: true,
      requiresClarificationReason:
        "Authority direction and expert/work evidence conflict — confirm with the decision owner before routing dependent work.",
      note: expert
        ? `${expert.party} has direct ${expert.authorityType === "implementation_ownership" ? "implementation" : "domain"} evidence that conflicts with the stated direction.`
        : "Evidence conflicts with the stated direction.",
    };
  }

  const evidenceStrength = strongest(input.evidence);
  const expertiseStrength = strongest(input.expertise);
  const authorityStrong = input.authority?.strength === "strong" || input.authority?.strength === "moderate";

  // 3. Full agreement + strong evidence + finalized -> high confidence, safe.
  if (
    input.finalDecisionMade &&
    authorityStrong &&
    (expertiseStrength === "strong" || expertiseStrength === "moderate") &&
    (evidenceStrength === "strong" || evidenceStrength === "moderate") &&
    dissent.length === 0
  ) {
    return {
      ...base,
      alignmentState: "decision_made",
      confidence: "high",
      escalationTarget: null,
      autonomyBlocked: false,
      requiresClarificationReason: null,
      note: "Authority, expertise, and evidence agree.",
    };
  }

  // 4. Authority present but evidence weak -> not certain; hold for confirmation.
  if (authorityStrong && evidenceStrength !== "strong" && evidenceStrength !== "moderate") {
    return {
      ...base,
      alignmentState: input.finalDecisionMade ? "decision_made" : "decision_proposed",
      confidence: "medium",
      escalationTarget: decisionOwner,
      autonomyBlocked: true,
      requiresClarificationReason: "Direction is set by the lead, but the implementation evidence is unclear.",
      note: "Direction from authority; implementation evidence is not yet strong.",
    };
  }

  // 5. Expertise strong but authority lower/absent -> preserve the expert signal,
  //    final follows the decision owner once confirmed; hold meanwhile.
  if ((expertiseStrength === "strong" || expertiseStrength === "moderate") && !authorityStrong) {
    return {
      ...base,
      alignmentState: "decision_proposed",
      confidence: "medium",
      escalationTarget: decisionOwner,
      autonomyBlocked: true,
      requiresClarificationReason: "Strong expert/work evidence exists, but a decision owner has not confirmed the direction.",
      note: "Expert evidence is strong; awaiting decision-owner confirmation.",
    };
  }

  // 6. Default — proposed/uncertain, hold.
  return {
    ...base,
    alignmentState: input.finalDecisionMade ? "decision_made" : "decision_proposed",
    confidence: "low",
    escalationTarget: decisionOwner,
    autonomyBlocked: true,
    requiresClarificationReason: "Not enough aligned signal to act autonomously.",
    note: null,
  };
}

/**
 * Frame a task from a strategic direction so a high-status priority shapes the
 * task without overbuilding. E.g. founder "speed over overbuild" -> constrain an
 * exploration task to modular scope. Deterministic keyword framing; tenant-
 * general. Returns a framing note or null.
 */
export function frameTaskFromStrategicDirection(
  strategicDirection: string,
  task: string,
): string | null {
  const dir = strategicDirection.toLowerCase();
  const wantsSpeed = /speed|fast|quick|don't overbuild|do not overbuild|modular|minimal|lean|mvp/.test(dir);
  if (wantsSpeed && /build|explore|implement|rebuild|prototype|test/.test(task.toLowerCase())) {
    return `Keep this modular and minimal per the stated priority — explore/test only, do not rebuild the full scope.`;
  }
  return null;
}
