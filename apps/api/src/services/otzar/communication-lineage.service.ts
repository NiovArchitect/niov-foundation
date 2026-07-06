// FILE: communication-lineage.service.ts
// PURPOSE: [BLOCK-3B] Speech-act + source/authority lineage stamped at
//          ingest — the substrate Block 3C truth-weighting will read.
//          Communication performs organizational work, and not all
//          communication is equal: a statement's weight composes decision
//          rights + communication act + source lineage + authority lineage
//          + agreement lineage + currentness + permissions — never
//          newest-wins, never executive-wins, never transcript-wins.
//
//          DETERMINISTIC-FIRST AND HONEST: acts are classified from
//          explicit linguistic markers on the evidence quote (the Redwood
//          Atlas 16-act vocabulary, adopted EXACTLY); authority resolves
//          through the Block 3A structured rights when they exist and
//          falls back to "unknown" — never a guess — when they don't.
//          Supersession pointers are left null unless deterministically
//          known (they are not yet; linking is Block 3C substrate work):
//          unresolved beats wrong. Stamping NEVER blocks ingestion and
//          NEVER changes customer-facing behavior, action execution
//          authority, tools, TAR, or approval rails.
// CONNECTS TO: comms-ingest.service.ts (the stamp sites),
//          decision-rights-store.service.ts (3A rights),
//          tests/fixtures/redwood-atlas/corpus.json (the binding act
//          vocabulary), tests/integration/communication-lineage.test.ts.

import type { DecisionDomain } from "./decision-rights.js";
import type { PartyDomainRights } from "./decision-rights-store.service.js";

/** The Redwood Atlas 16-act vocabulary, adopted exactly — no invented acts. */
export const COMMUNICATION_ACTS = [
  "proposal",
  "request",
  "decision",
  "approval",
  "rejection",
  "assignment",
  "commitment",
  "correction",
  "escalation",
  "objection",
  "clarification",
  "memory_reference",
  "unresolved_question",
  "superseding_decision",
  "policy_constraint",
  "action_item",
] as const;
export type CommunicationAct = (typeof COMMUNICATION_ACTS)[number];

export type AuthorityStatus = "within_authority" | "exceeds_authority" | "recommend_only" | "unknown";
export type Currentness = "current" | "stale" | "superseded" | "unresolved" | "unknown";

/** The stamped statement-level lineage (details.communication_lineage). */
export interface CommunicationLineage {
  communication_type: string;
  source_artifact_id: string | null;
  source_title: string | null;
  source_date: string | null;
  participants: string[];
  speaker: string | null;
  speaker_entity_id: string | null;
  speaker_role_at_time: string | null;
  communication_act: CommunicationAct;
  decision_domain: DecisionDomain;
  authority_basis: string | null;
  authority_status: AuthorityStatus;
  decision_makers_present: string[];
  required_approvers_present: boolean | null;
  agreement_participants: string[];
  supersedes: string | null;
  superseded_by: string | null;
  currentness: Currentness;
  confidence: string | null;
  permission_scope: string;
}

/** Artifact-level lineage for the conversation row itself (no single
 *  speaker/act — statements carry those). */
export interface ArtifactLineage {
  communication_type: string;
  source_artifact_id: string | null;
  source_title: string | null;
  source_date: string | null;
  participants: string[];
  decision_domain: DecisionDomain;
  permission_scope: string;
}

/** Acts that CLAIM organizational finality — the ones authority discipline
 *  bites on. A proposal by anyone is fine; a decision in someone else's
 *  domain is not. */
const FINAL_ACTS: ReadonlySet<CommunicationAct> = new Set([
  "decision",
  "approval",
  "rejection",
  "superseding_decision",
  "assignment",
  "commitment",
]);

/**
 * Deterministic act classification from explicit linguistic markers —
 * first match wins, ordered so weaker-claim acts (memory reference,
 * question, request) are recognized BEFORE decision-like markers can
 * promote them. No LLM; when no marker fires, the row-kind fallback is
 * used (a COMMITMENT work row is a commitment; a FOLLOW_UP is an
 * action_item).
 */
export function classifyCommunicationAct(text: string, fallback: CommunicationAct): CommunicationAct {
  const t = text.trim();
  const lc = t.toLowerCase();

  // Corrections + explicit supersession first (they contain decision words).
  if (/\bactually,? (no|it'?s not|that'?s not)\b|\bthat'?s (not right|not correct|wrong)\b|\bcorrection\b/i.test(t))
    return "correction";
  if (/\bsupersede[sd]?\b|\bno longer\b|\breplac(es|ing|ed)\b|\binstead of the (old|previous|original|earlier)\b/i.test(t))
    return "superseding_decision";

  // Weak-claim acts BEFORE decision markers — a memory of a decision is not
  // a decision; a question about policy is not policy.
  if (/\bi think\b[^.?!]*\b(was|used to)\b|\bif i (recall|remember)\b|\boriginally\b[^.?!]*\bwas\b|\bused to be\b/i.test(t))
    return "memory_reference";
  if (/^(can|could|should|shall|would) we\b/i.test(lc) || /\bwhat if\b|\bhow about\b/i.test(t))
    return "request";
  if (/\bi (propose|suggest)\b|\bwe could\b|\bmaybe we\b|\bmy recommendation\b/i.test(t)) return "proposal";

  // Explicit agreement/finalization is the strongest remaining marker — it
  // outranks an embedded REPORT of dissent ("we agreed … after the client
  // pushed back" is a decision, not an objection).
  if (/\bwe (agreed|decided)\b|\bdecision( is)? made\b|\bfinal(i[sz]ed)?\b|\blet'?s (do|go with|move)\b|\bpriority is\b/i.test(t))
    return "decision";

  if (/\bescalat(e|ed|ing|ion)\b/i.test(t)) return "escalation";
  if (/\bto clarify\b|\bjust to confirm\b|\bto be clear\b/i.test(t)) return "clarification";
  if (/\brejected?\b|\bdenied\b|\bnot approved\b|\bturn(ed)? (it |this )?down\b/i.test(t)) return "rejection";
  if (/\bapproved?\b|\bsign(ed|s)? off\b|\bgreen-?light(ed)?\b/i.test(t)) return "approval";
  if (
    /\bpolicy\b|\bcompliance\b|\brequired by\b|\bmust (not|be|have|go through)\b|\bneeds? (legal|finance|security|compliance) (review|approval|sign-?off)\b/i.test(
      t,
    )
  )
    return "policy_constraint";
  if (
    /\bdependency\b[^.?!]*\b(unresolved|missing|blocked)\b|\bblocker\b|\bblocked\b|\bnot feasible\b|\bwon'?t work\b|\bi disagree\b|\bpush(ed)? back\b/i.test(
      t,
    )
  )
    return "objection";
  if (/\b(will|is going to) (own|lead|take|handle|drive)\b|\bowns\b|\bassigned to\b|\bis responsible for\b/i.test(t))
    return "assignment";
  if (/\bi('?ll| will)\b|\bwe('?ll| will) (deliver|ship|send|have|provide)\b|\bpromise\b|\bcommit(s|ted|ting)?\b/i.test(t))
    return "commitment";

  // A bare unanswered question that matched nothing stronger.
  if (t.endsWith("?")) return "unresolved_question";

  return fallback;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/** Resolve a transcript speaker token ("Elena", "Torres", "Elena Torres")
 *  to the ONE rights holder whose name contains every speaker token.
 *  Ambiguity (two Torreses) resolves to undefined — honest unknown, never
 *  a guessed authority. */
function rightsFor(
  speaker: string | null,
  rights: ReadonlyArray<PartyDomainRights>,
): PartyDomainRights | undefined {
  if (speaker === null) return undefined;
  const sig = nameTokens(speaker);
  if (sig.length === 0) return undefined;
  const matches = rights.filter((r) => {
    const party = nameTokens(r.party);
    return sig.every((t) => party.includes(t));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function domainHolders(
  domain: DecisionDomain,
  rights: ReadonlyArray<PartyDomainRights>,
): PartyDomainRights[] {
  return rights.filter((r) => r.owns.includes(domain) || r.can_approve.includes(domain));
}

export interface LineageInput {
  quote: string;
  speaker: string | null;
  speakerEntityId: string | null;
  speakerRoleAtTime: string | null;
  fallbackAct: CommunicationAct;
  decisionDomain: DecisionDomain;
  structuredRights: ReadonlyArray<PartyDomainRights>;
  artifact: {
    communicationType: string;
    sourceArtifactId: string | null;
    sourceTitle: string | null;
    sourceDate: string | null;
    participants: string[];
  };
  confidence: string | null;
}

/**
 * PURE statement-level lineage. Authority truth, mechanically:
 *   - the speaker OWNS or CAN APPROVE the domain → within_authority;
 *   - the speaker is RECOMMEND-ONLY in the domain → a final-claiming act
 *     (decision/approval/assignment/commitment/…) is exceeds_authority;
 *     a non-final act is recommend_only — marked, never promoted;
 *   - the domain is held by SOMEONE ELSE and the speaker claims finality
 *     → exceeds_authority (a sales "full automation" promise does not
 *     become approved truth because it was said confidently);
 *   - no structured rights exist for the domain → unknown (honest
 *     heuristic fallback — never invented authority);
 *   - memory references and unresolved questions never carry authority
 *     and are never current truth (unknown / unresolved currentness).
 * Supersession pointers stay null here: not deterministically known yet.
 */
export function buildCommunicationLineage(input: LineageInput): CommunicationLineage {
  const act = classifyCommunicationAct(input.quote, input.fallbackAct);
  const domain = input.decisionDomain;
  const rights = input.structuredRights;
  const speakerRights = rightsFor(input.speaker, rights);
  const holders = domainHolders(domain, rights);
  const holdersPresent = holders.filter((h) => {
    const party = nameTokens(h.party);
    return input.artifact.participants.some((p) => {
      const toks = nameTokens(p);
      return toks.length > 0 && toks.every((t) => party.includes(t));
    });
  });

  const isFinal = FINAL_ACTS.has(act);
  const nonAuthorityAct = act === "memory_reference" || act === "unresolved_question" || act === "clarification";

  let authority_basis: string | null = null;
  if (speakerRights !== undefined) {
    if (speakerRights.owns.includes(domain)) authority_basis = `owns:${domain}`;
    else if (speakerRights.can_approve.includes(domain)) authority_basis = `can_approve:${domain}`;
    else if (speakerRights.recommend_only.includes(domain)) authority_basis = `recommend_only:${domain}`;
  }

  let authority_status: AuthorityStatus = "unknown";
  if (!nonAuthorityAct) {
    if (speakerRights?.owns.includes(domain) || speakerRights?.can_approve.includes(domain)) {
      authority_status = "within_authority";
    } else if (speakerRights?.recommend_only.includes(domain)) {
      authority_status = isFinal ? "exceeds_authority" : "recommend_only";
    } else if (holders.length > 0 && isFinal) {
      // The domain has structured holders and the speaker is not one of
      // them — claiming finality here exceeds authority regardless of
      // hierarchy or floor-holding.
      authority_status = "exceeds_authority";
    }
  }

  const currentness: Currentness =
    act === "memory_reference" ? "unknown" : act === "unresolved_question" ? "unresolved" : "current";

  const agreementActs: ReadonlySet<CommunicationAct> = new Set(["decision", "approval", "superseding_decision"]);

  return {
    communication_type: input.artifact.communicationType,
    source_artifact_id: input.artifact.sourceArtifactId,
    source_title: input.artifact.sourceTitle,
    source_date: input.artifact.sourceDate,
    participants: input.artifact.participants,
    speaker: input.speaker,
    speaker_entity_id: input.speakerEntityId,
    speaker_role_at_time: input.speakerRoleAtTime,
    communication_act: act,
    decision_domain: domain,
    authority_basis,
    authority_status,
    decision_makers_present: holdersPresent.map((h) => h.party),
    required_approvers_present: holders.length === 0 ? null : holdersPresent.length > 0,
    agreement_participants: agreementActs.has(act) ? input.artifact.participants : [],
    supersedes: null,
    superseded_by: null,
    currentness,
    confidence: input.confidence,
    permission_scope: "follows_row_visibility",
  };
}

/** Artifact-level lineage for the conversation (MEETING) row. */
export function buildArtifactLineage(input: {
  communicationType: string;
  sourceArtifactId: string | null;
  sourceTitle: string | null;
  sourceDate: string | null;
  participants: string[];
  decisionDomain: DecisionDomain;
}): ArtifactLineage {
  return {
    communication_type: input.communicationType,
    source_artifact_id: input.sourceArtifactId,
    source_title: input.sourceTitle,
    source_date: input.sourceDate,
    participants: input.participants,
    decision_domain: input.decisionDomain,
    permission_scope: "follows_row_visibility",
  };
}
