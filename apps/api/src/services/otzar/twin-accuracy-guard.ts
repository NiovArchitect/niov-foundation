// FILE: twin-accuracy-guard.ts
// PURPOSE: Hard server-side guard against Twin free-text overclaims about
//          durable organizational work (handoffs, obligations, conflicts).
//          Complements the DGI system-prompt strip — never invents state;
//          rewrites only when the model claims open work that DGI says is empty.
// CONNECTS TO: dgi-coherence.service, otzar.service conductSession.

export interface AccuracyGrounding {
  open_incoming_handoffs_count: number;
  open_obligations_count: number;
  open_org_truth_conflicts_count: number;
  open_incoming_handoff_titles?: string[];
  open_obligation_titles?: string[];
}

export type AccuracyGuardResult = {
  text: string;
  corrected: boolean;
  reasons: string[];
};

const STATUS_QUESTION =
  /\b(what|which|any|do i have|do we have|show me|list|need(s)? (my|our)|waiting on me|open work|attention)\b/i;

const CLAIM_OPEN_HANDOFF =
  /\b(\d+\s+)?(open\s+)?(incoming\s+)?handoffs?\s+(need|waiting|require|are open|is open|to acknowledge|awaiting)\b/i;
const CLAIM_HAS_HANDOFF =
  /\byou have\s+(an?\s+)?(open\s+)?(incoming\s+)?handoff\b/i;
const CLAIM_OPEN_OBLIGATION =
  /\b(\d+\s+)?open\s+obligations?\s+(need|waiting|require|are open|is open)\b|\byou have\s+\d+\s+open\s+obligations?\b/i;
const CLAIM_ZERO_HANDOFF =
  /\b(zero|no|none|0)\b.{0,40}\b(open\s+)?(incoming\s+)?handoffs?\b|\b(open\s+)?(incoming\s+)?handoffs?\b.{0,20}\b(none|zero|0)\b/i;
const CLAIM_ZERO_OBLIGATION =
  /\b(zero|no|none|0)\b.{0,40}\bopen\s+obligations?\b|\bopen\s+obligations?\b.{0,20}\b(none|zero|0)\b/i;

function isStatusLike(userMessage: string): boolean {
  return STATUS_QUESTION.test(userMessage);
}

/**
 * Pure: if the model overclaims durable work vs grounding, replace with a
 * fail-closed factual summary. Never invents titles not in grounding.
 */
export function applyTwinAccuracyGuard(args: {
  userMessage: string;
  assistantText: string;
  grounding: AccuracyGrounding;
}): AccuracyGuardResult {
  const text = args.assistantText;
  const g = args.grounding;
  const reasons: string[] = [];
  const statusLike = isStatusLike(args.userMessage);

  const claimsHandoffOpen =
    (CLAIM_OPEN_HANDOFF.test(text) || CLAIM_HAS_HANDOFF.test(text)) &&
    !CLAIM_ZERO_HANDOFF.test(text);
  const claimsObligationOpen =
    CLAIM_OPEN_OBLIGATION.test(text) && !CLAIM_ZERO_OBLIGATION.test(text);

  if (g.open_incoming_handoffs_count === 0 && claimsHandoffOpen) {
    reasons.push("overclaim_open_handoff");
  }
  if (g.open_obligations_count === 0 && claimsObligationOpen) {
    reasons.push("overclaim_open_obligation");
  }

  // For status questions with any overclaim, serve durable facts only.
  if (reasons.length > 0 && statusLike) {
    const lines = [
      "Here is what your durable governed record shows right now (not free-form memory):",
      "",
      g.open_incoming_handoffs_count === 0
        ? "• Open incoming handoffs: none."
        : `• Open incoming handoffs: ${g.open_incoming_handoffs_count}${
            g.open_incoming_handoff_titles?.[0]
              ? ` (e.g. "${g.open_incoming_handoff_titles[0]}")`
              : ""
          }.`,
      g.open_obligations_count === 0
        ? "• Open obligations: none."
        : `• Open obligations: ${g.open_obligations_count}${
            g.open_obligation_titles?.[0]
              ? ` (e.g. "${g.open_obligation_titles[0]}")`
              : ""
          }.`,
      g.open_org_truth_conflicts_count === 0
        ? "• Organizational truth conflicts open for review: none."
        : `• Organizational truth conflicts open for review: ${g.open_org_truth_conflicts_count}.`,
      "",
      "I will not invent work that is not on this record. Ask me to open the next step if you want to act.",
    ];
    return { text: lines.join("\n"), corrected: true, reasons };
  }

  // Non-status overclaim: append a fail-closed footer (do not rewrite the whole answer).
  if (reasons.length > 0) {
    const footer = [
      "",
      "—",
      "Governed accuracy check: your durable record currently shows",
      g.open_incoming_handoffs_count === 0
        ? "zero open incoming handoffs"
        : `${g.open_incoming_handoffs_count} open incoming handoff(s)`,
      "and",
      g.open_obligations_count === 0
        ? "zero open obligations."
        : `${g.open_obligations_count} open obligation(s).`,
      "Prefer that record over any free-form claim above that conflicts with it.",
    ].join(" ");
    return { text: `${text.trimEnd()}\n${footer}`, corrected: true, reasons };
  }

  return { text, corrected: false, reasons: [] };
}
