// FILE: context-retrieval.service.ts
// PURPOSE: [AIX-4] Confidence-aware retrieval of seeded background context
//          — the FIRST read path where seeded context may inform answers,
//          and the codified LIVE-WORK-WINS RANKING LAW it must obey.
//          Retrieval is EXPLANATORY ONLY: every result carries mandatory
//          attribution (what it is, where it came from, how confident,
//          how to treat it), requires_confirmation, and should_not_act:
//          true — seeded context can support explanation, background,
//          clarification, and confidence framing; it can NEVER by itself
//          support sending, approving, assigning, task/follow-up
//          creation, project-state change, connector writes, Dandelion
//          seeds, or permission/authority changes.
//          There is deliberately NO second matcher: retrieval flows
//          through the AIX-3 deterministic candidate gate, which already
//          enforces permission scope (ownerless org-wide documents are a
//          manager/admin read; non-managers get silence, never titles),
//          strong deterministic signals only, the noise cap, and AIX-2
//          human suppression (stale / wrong_scope / contradicted context
//          never returns — v1 suppresses rather than conflict-labels;
//          documented in the AIX model). No vectors, no embeddings, no
//          broad text search, no corpus brain.
// CONNECTS TO: context-candidates.service.ts (the one deterministic
//          gate), clarity-answer.service.ts (WHAT_BACKGROUND — the first
//          consuming surface), the AIX doctrine Part 3 (ranking law),
//          tests/integration/context-retrieval.test.ts.

import {
  getContextCandidatesForLedgerEntry,
  type ContextCandidateProjection,
} from "./context-candidates.service.js";

/** The canonical ranking law (AIX doctrine Part 3), codified. Lower rank
 *  = stronger authority. This surface EMITS ranks 4–7 only; ranks 1–3
 *  are the live spine itself (the ledger row truth, clarification
 *  resolutions, approvals) which every composed answer must lead with.
 *  Rank 8 never leaves the server — suppressed at the AIX-3 gate. */
export const CONTEXT_RANKING_LAW = [
  { rank: 1, source: "live_work", label: "Current live work" },
  { rank: 2, source: "human_correction", label: "Human correction" },
  { rank: 3, source: "approved_decision", label: "Approved decision" },
  { rank: 4, source: "confirmed_seeded", label: "Confirmed seeded context" },
  { rank: 5, source: "candidate_relevance", label: "Possible background context" },
  { rank: 6, source: "unvalidated_seeded", label: "Seeded historical context" },
  { rank: 7, source: "historical_unknown", label: "Historical context" },
  { rank: 8, source: "suppressed", label: "Stale or conflicting context" },
] as const;

export type ContextConfidenceLabel =
  | "Medium confidence"
  | "Background only"
  | "Needs confirmation";

/** The customer-safe retrieval contract. Labels only — raw ids, raw
 *  relevance states, and source bodies never cross this boundary. */
export interface ContextRetrievalResult {
  /** Ranking-law bucket label, e.g. "Confirmed seeded context". */
  source_label: string;
  /** AIX-1 origin, e.g. "Seeded document context · Process / SOP". */
  origin_label: string;
  title_label: string;
  covering_period_label?: string;
  confidence_label: ContextConfidenceLabel;
  /** Position in CONTEXT_RANKING_LAW (4–7 from this surface). */
  confidence_rank: number;
  /** The deterministic reason it was included (AIX-3 reason). */
  why_included: string;
  how_to_treat: string;
  requires_confirmation: boolean;
  /** ALWAYS true — seeded context never authorizes action. */
  should_not_act: true;
  /** Where a human validates it — the AIX-2 path, never a new one. */
  validation_path: string;
}

function toResult(c: ContextCandidateProjection): ContextRetrievalResult {
  const confirmed = c.validation_state_label === "Confirmed current";
  const needsPerson = c.validation_state_label === "Waiting on the right person";
  return {
    source_label: confirmed
      ? "Confirmed seeded context"
      : "Possible background context",
    origin_label: c.origin_label,
    title_label: c.title_label,
    ...(c.covering_period_label !== undefined
      ? { covering_period_label: c.covering_period_label }
      : {}),
    confidence_label: confirmed
      ? "Medium confidence"
      : needsPerson
        ? "Needs confirmation"
        : "Background only",
    confidence_rank: confirmed ? 4 : 5,
    why_included: c.reason_label,
    how_to_treat: confirmed
      ? "Confirmed as current by your team — live work still wins if they conflict."
      : needsPerson
        ? "Otzar needs the right person to confirm this before it can be treated as current."
        : "Not confirmed — use as background only, never for action.",
    requires_confirmation: !confirmed,
    should_not_act: true,
    validation_path: "Confirm or correct it where it appears, in View/Why.",
  };
}

export type ContextRetrievalOutcome =
  | { ok: true; results: ContextRetrievalResult[] }
  | { ok: false; code: "NOT_FOUND"; message: string };

/** Retrieve seeded background that may inform an answer about ONE work
 *  row. Read-only; permission/suppression/noise all enforced by the
 *  AIX-3 gate; results ordered by the ranking law (confirmed first). */
export async function retrieveSeededBackgroundForLedgerEntry(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
}): Promise<ContextRetrievalOutcome> {
  const gate = await getContextCandidatesForLedgerEntry(args);
  if (gate.ok === false) return gate;
  const results = gate.candidates
    .map(toResult)
    .sort((a, b) => a.confidence_rank - b.confidence_rank);
  return { ok: true, results };
}
