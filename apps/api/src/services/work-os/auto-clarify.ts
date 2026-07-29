// FILE: auto-clarify.ts
// PURPOSE: Slice 6 — pure autonomous clarification for routine ambiguity.
//          Given source snippet + known project truth, produce a clarified
//          work title and proof note without assigning labor to the user.
// CONNECTS TO: work-contract, demo seed, clarity pipeline (future wire).

export interface AutoClarifyInput {
  raw_phrase: string;
  /** Optional known people names in the org (display). */
  known_people?: string[];
  /** Optional project subject line. */
  project_subject?: string | null;
  /** Optional open dependency label. */
  dependency?: string | null;
}

export interface AutoClarifyResult {
  clarified: boolean;
  title: string;
  summary: string;
  proof: string;
  needs_human: boolean;
}

/**
 * WHAT: Clarify routine "circle back / follow up" phrases using project truth.
 * INPUT: raw phrase + optional people/project/dependency.
 * OUTPUT: clarified title or needs_human.
 * WHY: Human should not press "Request clarification" for routine cases.
 */
export function autoClarifyRoutineAmbiguity(
  input: AutoClarifyInput,
): AutoClarifyResult {
  const raw = input.raw_phrase.trim();
  const people = input.known_people ?? [];
  const project = (input.project_subject ?? "").trim();
  const dep = (input.dependency ?? "").trim();

  // Extract a person name from "with X" / "ask X"
  const withName =
    raw.match(
      /(?:with|ask|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    )?.[1] ??
    people.find((p) => raw.toLowerCase().includes(p.toLowerCase().split(" ")[0]!));

  const name = withName ?? null;

  // Security gate pattern — require security/encrypt signals (not bare "checklist").
  if (
    /security|encrypt|data.?rights|controls?\b/i.test(raw + " " + dep + " " + project) ||
    (/checklist/i.test(raw) && /security|encrypt|gate/i.test(raw + " " + dep + " " + project))
  ) {
    const who = name ?? "the security lead";
    const subj = project.length > 0 ? project : "the application review";
    return {
      clarified: true,
      title: `${who}: confirm remaining security controls before interview invite for ${subj}`,
      summary: `Otzar clarified that ${who} must confirm the remaining security checklist items before the interview invitation can proceed for ${subj}.`,
      proof: `auto_clarify:security_gate; person=${who}; project=${subj}`,
      needs_human: false,
    };
  }

  // Customer evidence pattern — require signal on the raw phrase itself
  // (not project_subject alone: document bodies often say "Reference material").
  if (/customer|reference|market|evidence/i.test(raw)) {
    const who = name ?? "the market lead";
    return {
      clarified: true,
      title: `${who}: verify customer evidence for ${project || "the review"}`,
      summary: `Otzar clarified the follow-up is about verifying customer evidence, owned by ${who}.`,
      proof: `auto_clarify:market_evidence; person=${who}`,
      needs_human: false,
    };
  }

  if (name && project) {
    return {
      clarified: true,
      title: `Ask ${name} for the specific update needed on ${project}`,
      summary: `Otzar clarified that the next step is an update from ${name} on ${project}.`,
      proof: `auto_clarify:named_project; person=${name}`,
      needs_human: false,
    };
  }

  if (name) {
    return {
      clarified: true,
      title: `Ask ${name} for the update needed to move the review forward`,
      summary: `Otzar clarified a named follow-up with ${name}; subject still thin — will refine from sources.`,
      proof: `auto_clarify:named_only; person=${name}`,
      needs_human: false,
    };
  }

  return {
    clarified: false,
    title: "Clarify this follow-up before it becomes active work",
    summary: "Source is too thin for autonomous clarification.",
    proof: "auto_clarify:needs_human",
    needs_human: true,
  };
}
