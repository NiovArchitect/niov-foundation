// FILE: work-contract.ts
// PURPOSE: Slice 6 — server-side minimum work contract. Prevents generic
//          follow-ups from becoming active work at create time. Pure
//          functions; no DB. Frontend rebucketing is NOT the final gate.
// CONNECTS TO: work-ledger.service createLedgerEntry / getMyWork.

const VAGUE_FOLLOW_UP =
  /^follow\s*up\s+with\s+([A-Za-z][\w'.-]*)\s*$/i;
const VAGUE_GENERIC =
  /^(follow\s*up|check\s*in|touch\s*base|review\s*item|complete\s*checklist|send\s*invite|circle\s*back)\s*$/i;

/** Statuses that mean "active employee work" (not seed/admin/goal). */
const ACTIVE_WORK_STATUSES = new Set([
  "DETECTED",
  "INFERRED",
  "DRAFT",
  "READY_TO_EXECUTE",
  "EXECUTING",
  "NEEDS_OWNER",
  "NEEDS_TARGET_RESOLUTION",
  "NEEDS_PARTICIPANT_CONFIRMATION",
  "NEEDS_SELECTED_TIME",
  "NEEDS_AUTHORITY",
  "NEEDS_APPROVAL",
  "NEEDS_CALLER_CONFIRMATION",
  "BLOCKED",
  "RUNTIME_MISSING",
]);

/**
 * WHAT: true when the title is a non-actionable generic follow-up.
 * INPUT: raw title string.
 * OUTPUT: boolean.
 */
export function isVagueWorkTitle(title: string): boolean {
  const t = title.trim();
  if (t.length === 0) return true;
  if (VAGUE_FOLLOW_UP.test(t)) return true;
  if (VAGUE_GENERIC.test(t)) return true;
  if (/^follow\s*up\s+with\s+/i.test(t) && t.split(/\s+/).length <= 4) {
    return true;
  }
  if (/^circle\s*back\s+with\s+/i.test(t) && t.split(/\s+/).length <= 5) {
    return true;
  }
  return false;
}

/**
 * WHAT: Server-side human title at create time (never invents project facts).
 * INPUT: raw title + optional summary.
 * OUTPUT: display title stored on the ledger row.
 */
export function serverHumanWorkTitle(
  title: string,
  summary?: string | null,
): string {
  const raw = title.trim();
  if (raw.length === 0) {
    return summary && summary.trim().length > 0
      ? summary.trim().slice(0, 120)
      : "Work item needs a clearer title";
  }
  const m = raw.match(VAGUE_FOLLOW_UP);
  if (m?.[1]) {
    return `Ask ${m[1]} for the update needed to move the review forward`;
  }
  if (/^circle\s*back\s+with\s+([A-Za-z][\w'.-]*)/i.test(raw)) {
    const name = raw.match(/^circle\s*back\s+with\s+([A-Za-z][\w'.-]*)/i)?.[1];
    if (name) {
      return `Clarify with ${name} what must be confirmed before the next step`;
    }
  }
  if (VAGUE_GENERIC.test(raw)) {
    if (summary && summary.trim().length > 0) {
      const s = summary.trim();
      return s.length > 100 ? `${s.slice(0, 97)}…` : s;
    }
    return "Clarify this follow-up before it becomes active work";
  }
  return raw;
}

export type WorkContractDecision =
  | { ok: true; title: string; status: string; demoted: boolean; reason?: string }
  | { ok: false; code: "INVALID_REQUEST"; message: string };

/**
 * WHAT: Enforce minimum work contract before active statuses land.
 * INPUT: requested title, summary, status, ledger_type.
 * OUTPUT: normalized title + status (vague → PROPOSED demotion).
 * WHY: Frontend-only rebucketing is not enough for YC / product truth.
 */
export function enforceWorkContract(args: {
  title: string;
  summary?: string | null;
  status: string;
  ledger_type: string;
}): WorkContractDecision {
  const title = serverHumanWorkTitle(args.title, args.summary);
  // Admin seeds / goals / document context are not employee active work.
  if (
    args.ledger_type === "ORG_SEEDING" ||
    args.ledger_type === "GOAL" ||
    args.ledger_type === "DOCUMENT_CONTEXT" ||
    args.ledger_type === "DOCUMENT"
  ) {
    return { ok: true, title, status: args.status, demoted: false };
  }

  const vague = isVagueWorkTitle(args.title) || isVagueWorkTitle(title);
  const wantsActive = ACTIVE_WORK_STATUSES.has(args.status);

  if (vague && wantsActive) {
    return {
      ok: true,
      title,
      status: "PROPOSED",
      demoted: true,
      reason:
        "Vague title cannot become active work — demoted to PROPOSED for clarification",
    };
  }

  // PROPOSED vague is allowed (Suggested work).
  return { ok: true, title, status: args.status, demoted: false };
}

/**
 * WHAT: true when Mark complete is unsafe for this title/status.
 * NOTE: PROPOSED with a specific title (e.g. tracked internal TASK) remains
 * completable by the owner — only vague titles block completion.
 */
export function cannotCompleteSafely(args: {
  title: string;
  status: string;
}): boolean {
  if (isVagueWorkTitle(args.title)) return true;
  if (args.status === "EXECUTING") return true;
  return false;
}
