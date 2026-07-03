// FILE: work-graph-learning.ts
// PURPOSE: [SECTION-12-WORKGRAPH] The closed-loop learning + correction-memory
//          slice. Otzar must learn from work WITHOUT leaking work: every action
//          outcome writes a SCOPED, evidence-backed learning event, and a
//          founder correction ("Shweta is marketing; this should have been
//          Shiney") becomes an ORG-SCOPED, auditable correction that influences
//          future recipient resolution — never cross-tenant, never an
//          uncontrolled global memory.
//
//          This slice provides the DOCTRINE-COMPLETE models + deterministic
//          builders + the gate integration (alias + exclusion). It does NOT
//          fake an org-memory aggregation engine or expiry/revalidation daemon —
//          those are documented as the next grounded slice. Persistence rides
//          the existing correction-memory + audit rails (no new uncontrolled
//          memory store).
// CONNECTS TO: recipient-governance.ts (corrections feed the gate),
//              comms-extract.service.ts (action outcomes emit learning events),
//              tests/unit/work-graph-learning.test.ts.

import type { RecipientGovernance, RecipientSafety } from "./recipient-governance.js";

// ── Scoped learning event (no-leak) ────────────────────────────────────────
export type LearningSourceType =
  | "transcript"
  | "message"
  | "approval"
  | "correction"
  | "send"
  | "reply";

export type MemoryScope =
  | "individual"
  | "team"
  | "project"
  | "org"
  | "policy"
  | "correction";

export type LearningOutcome =
  | "accepted"
  | "corrected"
  | "rejected"
  | "sent"
  | "blocked"
  | "clarified";

export type LearningImpact =
  | "improves_recipient_resolution"
  | "improves_role_template"
  | "improves_routing"
  | "improves_autonomy_eligibility"
  | "improves_name_disambiguation"
  | "improves_policy_boundary";

/** A single scoped, evidence-backed learning event. Every field the doctrine
 *  names is present. allowedReuse/allowedTwins encode the no-leak boundary: a
 *  memory edge must never be used outside its allowed scope. */
export interface LearningEvent {
  action_id: string;
  org_entity_id: string;
  source_type: LearningSourceType;
  /** Entity ids of people involved (subjects), org-scoped. */
  people_involved: string[];
  work_item: string | null;
  memory_scope: MemoryScope;
  sensitivity: RecipientGovernance["sensitivity"];
  /** Who/what may reuse this edge — the no-leak allow-list. Empty = no reuse. */
  allowed_reuse: string[];
  /** Evidence reference (a quote / source span) — NOT the full raw transcript. */
  evidence: string | null;
  outcome: LearningOutcome;
  impact: LearningImpact[];
}

/** Build a scoped learning event from an action outcome + its governance
 *  verdict. Pure & deterministic. The memory scope and allowed-reuse are derived
 *  from the recipient safety so an unsafe/blocked action never widens reuse. */
export function buildLearningEvent(args: {
  actionId: string;
  orgEntityId: string;
  sourceType: LearningSourceType;
  governance: RecipientGovernance;
  workItem: string | null;
  outcome: LearningOutcome;
}): LearningEvent {
  const { governance: g } = args;
  const peopleInvolved = g.entity_id !== null ? [g.entity_id] : [];

  // Scope: a corrected outcome is correction-scoped; an org-policy boundary is
  // policy-scoped; otherwise default to the narrowest justified scope.
  const isPolicyBoundary =
    g.policyStatus === "approval_required" ||
    g.policyStatus === "blocked" ||
    g.workConnectionType === "approval_owner" ||
    g.workConnectionType === "policy_required_reviewer";
  const memory_scope: MemoryScope =
    args.outcome === "corrected"
      ? "correction"
      : isPolicyBoundary
        ? "policy"
        : g.workConnectionType === "project_owner" || g.workConnectionType === "support_role"
          ? "project"
          : "individual";

  // No-leak allow-list: only when the recipient is safe AND low-sensitivity may
  // the edge be reused for routing; otherwise reuse is empty (blocked).
  const allowed_reuse: LearningImpact[] = [];
  if (g.recipientSafety === "confirmed") {
    allowed_reuse.push("improves_recipient_resolution", "improves_routing");
    if (g.autonomyEligibility === "eligible") allowed_reuse.push("improves_autonomy_eligibility");
  }
  if (args.outcome === "corrected") allowed_reuse.push("improves_name_disambiguation");

  const impact: LearningImpact[] = [...new Set(allowed_reuse)];

  return {
    action_id: args.actionId,
    org_entity_id: args.orgEntityId,
    source_type: args.sourceType,
    people_involved: peopleInvolved,
    work_item: args.workItem,
    memory_scope,
    sensitivity: g.sensitivity,
    allowed_reuse: impact.map(String),
    evidence: g.evidence.quote,
    outcome: args.outcome,
    impact,
  };
}

// ── Org-scoped correction memory ────────────────────────────────────────────
/** A governed, org-scoped disambiguation/exclusion correction. Persisted via
 *  the existing correction-memory rail; never cross-tenant; auditable. */
export interface OrgRecipientCorrection {
  org_entity_id: string;
  /** The ambiguous/misheard name from the transcript (lowercased), e.g. "shiney". */
  ambiguous_name: string;
  /** Aliases that all refer to the same correct person (lowercased), e.g.
   *  ["shiney", "shaini", "c shiney"]. Used as alias_mentioned proof. */
  aliases: string[];
  /** The entity_id of the CORRECT person, when known/resolvable. */
  correct_entity_id: string | null;
  /** Entity ids that must NOT receive this class of work (the wrong matches),
   *  e.g. Shweta's id for engineering-integration context. */
  exclude_entity_ids: string[];
  /** Free-text reason for the audit trail. */
  reason: string;
  /** Work domain this correction applies to (e.g. "engineering"). */
  work_domain: string | null;
}

/** Parse a founder correction into a structured org-scoped correction.
 *  Deterministic. Example input: "Shweta is marketing and was not supposed to be
 *  included. This should have been Shiney." */
export function buildDisambiguationCorrection(args: {
  orgEntityId: string;
  feedbackText: string;
  /** Resolve a display name to an entity_id (caller supplies, e.g. roster map). */
  resolveName: (name: string) => string | null;
  workDomain?: string | null;
}): OrgRecipientCorrection | null {
  const text = args.feedbackText.trim();
  // "should have been <Name>" -> the correct person.
  const correct = text.match(/should\s+(?:have\s+been|be)\s+([A-Z][A-Za-z]+)/);
  // "<Name> is marketing / was not supposed to be included" -> the wrong person.
  const wrong = text.match(/([A-Z][A-Za-z]+)\s+is\s+\w+\s+and\s+was\s+not\s+supposed/i)
    ?? text.match(/([A-Z][A-Za-z]+)\s+(?:was|is)\s+not\s+supposed/i)
    ?? text.match(/not\s+(?:include|included)\s+([A-Z][A-Za-z]+)/i);
  if (correct === null && wrong === null) return null;

  const correctName = correct?.[1] ?? null;
  const wrongName = wrong?.[1] ?? null;
  const correctId = correctName ? args.resolveName(correctName) : null;
  const wrongId = wrongName ? args.resolveName(wrongName) : null;

  const aliases = correctName ? [correctName.toLowerCase()] : [];
  return {
    org_entity_id: args.orgEntityId,
    ambiguous_name: (correctName ?? wrongName ?? "").toLowerCase(),
    aliases,
    correct_entity_id: correctId,
    exclude_entity_ids: wrongId !== null ? [wrongId] : [],
    reason: text,
    work_domain: args.workDomain ?? null,
  };
}

/** Aggregate the correction inputs the recipient-governance gate consumes for a
 *  given work domain: the alias list (for the correct person) and the set of
 *  excluded entity_ids. Org-scoped; only corrections for the same org + matching
 *  (or unspecified) work domain apply. */
export function correctionsForContext(
  corrections: ReadonlyArray<OrgRecipientCorrection>,
  orgEntityId: string,
  workDomain: string | null,
): { aliases: string[]; excludeEntityIds: Set<string> } {
  const aliases = new Set<string>();
  const exclude = new Set<string>();
  for (const c of corrections) {
    if (c.org_entity_id !== orgEntityId) continue; // never cross-tenant
    if (c.work_domain !== null && workDomain !== null && c.work_domain !== workDomain) continue;
    for (const a of c.aliases) aliases.add(a);
    for (const e of c.exclude_entity_ids) exclude.add(e);
  }
  return { aliases: Array.from(aliases), excludeEntityIds: exclude };
}

// ── [LEARN-LOOP] Prior recipient decisions from resolved follow-ups ────────
// The BUG C resolve-recipient path already writes a durable, org-scoped,
// audited correction record onto the WorkLedger FOLLOW_UP row itself
// (recipientSafety "confirmed" + evidence.source "caller_confirmed"). Those
// rows ARE the correction store — no second store, no duplicate writes. The
// functions below deterministically derive the two classifier inputs from
// them at ingest time.

/** The minimal, stable-id projection of one caller-resolved recipient
 *  decision. Parsed from a FOLLOW_UP row's details — never display-name
 *  identity (display_name is used ONLY to recover the alias token the
 *  transcript collided on, never to identify the person). */
export interface ResolvedRecipientDecision {
  entity_id: string | null;
  display_name: string;
  /** Non-empty alternativeCandidates marks a SELECT-resolved (previously
   *  ambiguous) decision; empty marks a CONFIRM (vouch) decision. The names
   *  are needed to recover the COLLISION token (the token shared between the
   *  chosen person and every alternative — the token the human disambiguated). */
  alternative_names: string[];
  evidence_source: string;
  recipient_safety: string;
}

/** Parse one WorkLedger FOLLOW_UP `details` payload into a decision, or null
 *  when the row is not a caller-resolved recipient decision. Pure; tolerant
 *  of unknown shapes (never throws on malformed details). */
export function resolvedDecisionFromFollowUpDetails(
  details: unknown,
): ResolvedRecipientDecision | null {
  if (typeof details !== "object" || details === null) return null;
  const fu = (details as Record<string, unknown>).follow_up;
  if (typeof fu !== "object" || fu === null) return null;
  const gov = (fu as Record<string, unknown>).recipient_governance;
  if (typeof gov !== "object" || gov === null) return null;
  const g = gov as Record<string, unknown>;
  const ev = g.evidence;
  if (typeof ev !== "object" || ev === null) return null;
  const e = ev as Record<string, unknown>;
  if (g.recipientSafety !== "confirmed" || e.source !== "caller_confirmed") return null;
  const entityId = typeof g.entity_id === "string" ? g.entity_id : null;
  const displayName = typeof g.display_name === "string" ? g.display_name : "";
  const alts = Array.isArray(e.alternativeCandidates)
    ? e.alternativeCandidates.filter((x): x is string => typeof x === "string")
    : [];
  if (entityId === null || displayName.length === 0) return null;
  return {
    entity_id: entityId,
    display_name: displayName,
    alternative_names: alts,
    evidence_source: "caller_confirmed",
    recipient_safety: "confirmed",
  };
}

/** The two classifier inputs the learn-loop feeds into classifyRecipient. */
export interface PriorRecipientDecisions {
  /** Lowercased first-name token -> the entity a human SELECTED for it.
   *  Conflicting selections (same token, different entities) are dropped
   *  entirely — humans disagreed, so the ambiguity question must stay. */
  selectionsByToken: Map<string, string>;
  /** Entities a human vouched for through the CONFIRM path. Select decisions
   *  are deliberately NOT vouches — choosing between same-named people says
   *  nothing about work-scope connection. */
  confirmedEntityIds: Set<string>;
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

/** The collision tokens of a SELECT decision: tokens the chosen person's name
 *  shares with EVERY alternative — exactly the token(s) the transcript used
 *  and the human disambiguated ("samiksha" for Samiksha Sharma vs Verma). */
function collisionTokens(d: ResolvedRecipientDecision): string[] {
  let shared = nameTokens(d.display_name);
  for (const alt of d.alternative_names) {
    const altTokens = nameTokens(alt);
    shared = new Set([...shared].filter((t) => altTokens.has(t)));
    if (shared.size === 0) return [];
  }
  return [...shared];
}

/** Aggregate resolved decisions into classifier inputs. Deterministic. */
export function derivePriorRecipientDecisions(
  decisions: ReadonlyArray<ResolvedRecipientDecision>,
): PriorRecipientDecisions {
  const selectionsByToken = new Map<string, string>();
  const conflicted = new Set<string>();
  const confirmedEntityIds = new Set<string>();
  for (const d of decisions) {
    if (d.entity_id === null) continue;
    if (d.evidence_source !== "caller_confirmed" || d.recipient_safety !== "confirmed") continue;
    if (d.alternative_names.length > 0) {
      for (const token of collisionTokens(d)) {
        const existing = selectionsByToken.get(token);
        if (existing !== undefined && existing !== d.entity_id) {
          conflicted.add(token);
          continue;
        }
        selectionsByToken.set(token, d.entity_id);
      }
    } else {
      confirmedEntityIds.add(d.entity_id);
    }
  }
  for (const t of conflicted) selectionsByToken.delete(t);
  return { selectionsByToken, confirmedEntityIds };
}
