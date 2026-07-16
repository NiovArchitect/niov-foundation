// FILE: date-agreement.service.ts
// PURPOSE: Multi-person conversation date agreement classification.
//          Distinguishes suggested / rejected / unavailable / confirmed /
//          superseded / final agreed meeting times WITHOUT using hierarchy
//          alone as authority. Pure + unit-testable; used by collab smoke
//          and (later) by comms extraction enrichment.
// CONNECTS TO: calendar-continuity (weekday/time resolution), comms-extract.

export type DateStance =
  | "SUGGESTED"
  | "PREFERRED"
  | "TENTATIVE"
  | "UNAVAILABLE"
  | "REJECTED"
  | "AGREED"
  | "CONFIRMED"
  | "CHANGED"
  | "SUPERSEDED"
  | "FINAL_AGREED"
  | "DEADLINE"
  | "MEETING_TIME"
  | "DUE_DATE"
  | "EFFECTIVE_DATE";

export interface DateCandidate {
  /** Stable key for the candidate (normalized phrase). */
  key: string;
  raw_phrase: string;
  stance: DateStance;
  speaker_label: string;
  /** True when speaker is explicitly marked as decision owner / project owner. */
  is_decision_owner: boolean;
  /** True when speaker is labeled CEO/executive (context only — not auto-authority). */
  is_executive: boolean;
  sequence: number;
}

export interface DateAgreementResult {
  candidates: DateCandidate[];
  /** Final agreed meeting time key when confidence is high enough. */
  final_agreed_key: string | null;
  final_agreed_phrase: string | null;
  /** Who confirmed the final agreement (decision owner preferred). */
  confirmed_by: string | null;
  authority_basis:
    | "DECISION_OWNER_CONFIRM"
    | "OWNER_SUPERSESSION"
    | "GROUP_AGREE_NO_OWNER"
    | "NONE";
  /** Chronological supersession notes. */
  change_history: string[];
  /** True when an executive suggestion conflicts with decision-owner final. */
  executive_conflict_with_owner: boolean;
}

const OWNER_RE =
  /\b(project owner|decision owner|owner|product lead|meeting owner)\b/i;
const EXEC_RE = /\b(ceo|chief executive|founder|executive)\b/i;
const UNAVAIL_RE =
  /\b(unavailable|can'?t make|cannot make|won'?t work|doesn'?t work for me|out of office)\b/i;
const REJECT_RE = /\b(reject|no go|not that|cancel that|scrap)\b/i;
const AGREE_RE =
  /\b(works for me|works\.|i agree|let'?s lock|locked|agreed|sounds good)\b/i;
const CONFIRM_RE =
  /\b(confirmed|confirm(?:ed|s)?|final(?:ly)?|lock(?:ed|s)? it|please create the calendar)\b/i;
const SUPERSEDE_RE =
  /\b(actually move|move (?:it|the meeting)|instead|supersed|changed to|reschedule)\b/i;
const DEADLINE_RE = /\b(deadline|due by|due date|effective date)\b/i;

/** Extract speaker label from "Name (role): text" or "Name: text". */
function parseLine(line: string): { speaker: string; body: string } | null {
  const m = line.match(/^\s*([^:]{1,80}):\s*(.+)$/);
  if (m === null || m[1] === undefined || m[2] === undefined) return null;
  return { speaker: m[1].trim(), body: m[2].trim() };
}

/** Rough day/time phrase capture for classification (not full temporal resolve). */
function extractPhrases(body: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[0].replace(/\s+/g, " ").trim());
  }
  // Also "Thursday at 11:30 AM Eastern" already covered; "11:30 AM" alone skipped.
  return out;
}

function normKey(phrase: string): string {
  return phrase.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Classify multi-person transcript lines into date candidates + final agreement.
 * Authority: explicit decision/project owner confirm/supersede wins over CEO
 * suggestion when both appear. Hierarchy is context, not a silent override.
 */
export function classifyDateAgreement(transcript: string): DateAgreementResult {
  const lines = transcript.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const candidates: DateCandidate[] = [];
  const change_history: string[] = [];
  let seq = 0;
  let finalKey: string | null = null;
  let finalPhrase: string | null = null;
  let confirmedBy: string | null = null;
  let authority: DateAgreementResult["authority_basis"] = "NONE";
  let execSuggestedKey: string | null = null;
  let ownerFinalKey: string | null = null;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed === null) continue;
    const { speaker, body } = parsed;
    const isOwner = OWNER_RE.test(speaker) || OWNER_RE.test(body);
    const isExec = EXEC_RE.test(speaker);
    const phrases = extractPhrases(body);
    if (phrases.length === 0) continue;

    let stance: DateStance = "SUGGESTED";
    if (DEADLINE_RE.test(body)) stance = "DEADLINE";
    else if (UNAVAIL_RE.test(body)) stance = "UNAVAILABLE";
    else if (REJECT_RE.test(body)) stance = "REJECTED";
    else if (SUPERSEDE_RE.test(body)) stance = "CHANGED";
    else if (CONFIRM_RE.test(body) && isOwner) stance = "CONFIRMED";
    else if (CONFIRM_RE.test(body)) stance = "AGREED";
    else if (AGREE_RE.test(body)) stance = "AGREED";
    else if (/\bprefer|preferred\b/i.test(body)) stance = "PREFERRED";
    else if (/\btentative|maybe|could do\b/i.test(body)) stance = "TENTATIVE";

    for (const phrase of phrases) {
      const key = normKey(phrase);
      seq += 1;
      candidates.push({
        key,
        raw_phrase: phrase,
        stance,
        speaker_label: speaker,
        is_decision_owner: isOwner,
        is_executive: isExec,
        sequence: seq,
      });
      change_history.push(
        `#${seq} ${speaker}: ${stance} "${phrase}"`,
      );

      if (isExec && (stance === "SUGGESTED" || stance === "CHANGED" || stance === "PREFERRED")) {
        execSuggestedKey = key;
      }

      // Decision owner confirmation / supersession is authoritative for final.
      if (isOwner && (stance === "CONFIRMED" || stance === "CHANGED" || stance === "AGREED")) {
        // Mark previous final as superseded in history.
        if (finalKey !== null && finalKey !== key) {
          change_history.push(
            `supersede: "${finalPhrase}" → "${phrase}" by decision owner`,
          );
          for (const c of candidates) {
            if (c.key === finalKey && c.stance === "FINAL_AGREED") {
              c.stance = "SUPERSEDED";
            }
          }
        }
        finalKey = key;
        finalPhrase = phrase;
        confirmedBy = speaker;
        authority =
          stance === "CHANGED" ? "OWNER_SUPERSESSION" : "DECISION_OWNER_CONFIRM";
        ownerFinalKey = key;
        candidates.push({
          key,
          raw_phrase: phrase,
          stance: "FINAL_AGREED",
          speaker_label: speaker,
          is_decision_owner: true,
          is_executive: isExec,
          sequence: ++seq,
        });
      } else if (
        !isOwner &&
        (stance === "AGREED" || stance === "CONFIRMED") &&
        finalKey === null
      ) {
        // Group agree without owner — provisional only.
        finalKey = key;
        finalPhrase = phrase;
        confirmedBy = speaker;
        authority = "GROUP_AGREE_NO_OWNER";
      }
    }
  }

  const executive_conflict_with_owner =
    execSuggestedKey !== null &&
    ownerFinalKey !== null &&
    execSuggestedKey !== ownerFinalKey;

  return {
    candidates,
    final_agreed_key: finalKey,
    final_agreed_phrase: finalPhrase,
    confirmed_by: confirmedBy,
    authority_basis: authority,
    change_history,
    executive_conflict_with_owner,
  };
}
