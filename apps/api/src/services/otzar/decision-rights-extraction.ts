// FILE: decision-rights-extraction.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Deterministically extract decision-rights
//          SIGNALS from a transcript — authority (founder/exec priority, meeting
//          lead, owner, approver), expertise (who built/owns/tested a system),
//          and dissent/conflict ("not complete", "need to confirm", conflicting
//          direction) — and assemble them into a DecisionInput the existing
//          decision-rights model consumes. Pure, no LLM/DB, tenant-general,
//          names from the transcript only (never hardcoded). This closes the
//          "models exist but aren't fed from transcript" gap WITHOUT faking
//          intelligence: a signal is emitted only when an explicit linguistic
//          marker is present.
// CONNECTS TO: decision-rights.ts (consumes the DecisionInput), responsibility-
//              graph.ts (lead/owner), autonomy.ts (decision-aware),
//              comms-extract.service.ts, tests/unit/decision-rights-extraction.test.ts.

import type { DecisionDomain, DecisionInput, DecisionSignal } from "./decision-rights.js";

const NAME = "([A-Z][A-Za-z]+)";

function sentences(text: string): string[] {
  return text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

// Strategic / founder-executive priority ("speed matters more than overbuilding",
// "prioritize speed", "don't overbuild", "keep it lean").
const PRIORITY_PATTERNS: RegExp[] = [
  /\b(speed (?:matters|over|is the priority)[^.?!]*)/i,
  /\b(prioriti[sz]e [^.?!]+)/i,
  /\b(don'?t overbuild[^.?!]*)/i,
  /\b(keep (?:it|this) (?:lean|minimal|modular)[^.?!]*)/i,
];

// Authority direction: meeting lead, owner assignment, approver requirement.
const AUTHORITY_LEAD: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:will|is going to)\\s+lead`),
  new RegExp(`[Ll]et ${NAME}\\s+(?:step in and\\s+)?lead`),
];
const APPROVER: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:needs to|must|has to)\\s+approve`),
  new RegExp(`[Gg]et ${NAME}(?:'s)?\\s+approval`),
  /\b(legal|finance|security|compliance|admin)\s+(?:needs to|must|has to)?\s*(?:review|approve|sign off)/i,
];

// Expertise / implementation ownership.
const EXPERTISE: RegExp[] = [
  new RegExp(`${NAME}\\s+(?:owns|built|implemented|tested|wrote)\\b`),
  new RegExp(`${NAME}\\s+is\\s+responsible for`),
  new RegExp(`${NAME}\\s+is\\s+(?:the\\s+)?(?:auth|ui|security|frontend|backend|integration|product|design)\\s+(?:owner|lead)`),
];

// Dissent / unresolved / conflict markers.
const DISSENT: RegExp[] = [
  /\b(not (?:complete|done|finished|ready))\b/i,
  /\b(isn'?t (?:complete|done|finished|ready))\b/i,
  /\b(need(?:s)? to (?:confirm|verify|double-?check))\b/i,
  /\b(not sure|unsure|uncertain)\b/i,
  /\b(i disagree|that'?s not (?:right|correct)|actually,? (?:no|it'?s not))\b/i,
  /\b(conflict|disagreement|blocked|blocker)\b/i,
];

function firstName(s: string, res: RegExp[]): { name: string | null; quote: string } | null {
  for (const re of res) {
    const m = s.match(re);
    if (m) return { name: m[1] && /^[A-Z][a-z]/.test(m[1]) ? m[1] : null, quote: s };
  }
  return null;
}

export interface ExtractedDecisionSignals {
  authority: DecisionSignal[];
  expertise: DecisionSignal[];
  dissent: DecisionSignal[];
  strategicPriority: string | null;
}

/** Extract decision-rights signals from transcript text. Deterministic. */
export function extractDecisionSignals(transcript: string): ExtractedDecisionSignals {
  const authority: DecisionSignal[] = [];
  const expertise: DecisionSignal[] = [];
  const dissent: DecisionSignal[] = [];
  let strategicPriority: string | null = null;

  for (const s of sentences(transcript)) {
    if (strategicPriority === null) {
      for (const p of PRIORITY_PATTERNS) {
        const m = s.match(p);
        if (m) { strategicPriority = m[1]?.trim() ?? s; break; }
      }
    }
    const lead = firstName(s, AUTHORITY_LEAD);
    if (lead?.name) authority.push({ party: lead.name, authorityType: "meeting_leadership", strength: "strong", direction: s, evidence: s });
    const appr = firstName(s, APPROVER);
    if (appr) authority.push({ party: appr.name ?? "policy approver", authorityType: "approval", strength: "strong", evidence: s });
    const exp = firstName(s, EXPERTISE);
    if (exp?.name) expertise.push({ party: exp.name, authorityType: "implementation_ownership", strength: "strong", evidence: s });
    for (const d of DISSENT) {
      if (d.test(s)) {
        // Attribute to a named speaker if the sentence starts with "<Name>:" or "<Name> says".
        const who = s.match(/^([A-Z][A-Za-z]+)\s*[:,]/) ?? s.match(/([A-Z][A-Za-z]+)\s+(?:says|said|notes|raised)/);
        dissent.push({ party: who?.[1] ?? "unattributed", authorityType: "domain_expertise", strength: "moderate", contradictsAuthority: true, evidence: s });
        break;
      }
    }
  }
  return { authority, expertise, dissent, strategicPriority };
}

/** Assemble a DecisionInput for the decision-rights model from a transcript.
 *  finalDecisionMade is true only when there is authority AND no unresolved
 *  dissent (a conservative default; an explicit "we agreed"/"decided" also
 *  flips it). policyAllows defaults true (the caller can override from the
 *  org-collaboration-policy verdict). */
export function buildDecisionInputFromTranscript(
  transcript: string,
  decisionDomain: DecisionDomain,
  opts: { policyAllows?: boolean } = {},
): DecisionInput & { strategicPriority: string | null } {
  const sig = extractDecisionSignals(transcript);
  const decided = /\b(we (?:agreed|decided)|decision (?:is )?made|final(?:i[sz]ed)?)\b/i.test(transcript);
  const finalDecisionMade = (sig.authority.length > 0 && sig.dissent.length === 0) || decided;
  // The model DERIVES dissent from expertise/evidence signals carrying
  // contradictsAuthority=true, so fold the extracted dissent into expertise.
  return {
    decisionDomain,
    authority: sig.authority[0] ?? null,
    expertise: [...sig.expertise, ...sig.dissent],
    evidence: sig.expertise, // implementation evidence doubles as evidence strength
    policyAllows: opts.policyAllows ?? true,
    finalDecisionMade,
    strategicPriority: sig.strategicPriority,
  };
}
