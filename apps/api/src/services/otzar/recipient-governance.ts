// FILE: recipient-governance.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Deterministic recipient-governance gate for
//          transcript-derived follow-up actions. This is the load-bearing fix
//          for the Shiney->Shweta wrong-recipient class of bug: an LLM proposed
//          a recipient ("Shweta") that the transcript never names, and the
//          downstream code trusted the LLM's entity_id. This gate NEVER trusts
//          the LLM's resolved recipient. For every proposed recipient it
//          independently computes a PROOF PATH from deterministic signals and
//          classifies recipient safety + autonomy eligibility.
//
//          CORE INVARIANT: a recipient is send-ready ONLY if a deterministic
//          proof path backs the exact entity_id the action targets — a
//          transcript token that resolves to that entity (explicit mention), OR
//          meeting participation, OR a proven work connection (project owner /
//          policy-required reviewer / etc) — AND policy permits. Fuzzy name
//          similarity ALONE is never sufficient (rank last), and a recipient who
//          is neither mentioned nor a participant nor work-connected is
//          out_of_scope regardless of what the LLM claimed. This is what
//          excludes Shweta. Absence from the transcript does NOT auto-exclude
//          (an absent approver / project owner is valid WITH proof) — only the
//          absence of any proof path does.
//
//          The classifier is PURE and synchronous (no IO) so it is fully
//          unit-testable against fixture rosters/transcripts. The async
//          orchestration that gathers DB signals (meeting participants, project
//          membership, org-collaboration-policy verdict) lives in the caller and
//          is passed in as plain data — keeping the safety property testable
//          without the LLM or the database.
// CONNECTS TO: comms-extract.service.ts (wires the gate into extraction),
//              work-os/authority-context.service.ts (resolveTargetInOrg rules,
//              mirrored here as a pure matcher), responsibility-graph.ts (lead /
//              owner extraction), tests/unit/recipient-governance.test.ts.

// ── Proof-path vocabulary (doctrine-complete) ──────────────────────────────
export type ParticipantStatus = "participant" | "non_participant" | "unknown";

export type MentionStatus =
  | "explicitly_mentioned"
  | "alias_mentioned"
  | "not_mentioned";

export type WorkConnectionType =
  | "transcript_assignee"
  | "meeting_lead"
  | "founder_context_authority"
  | "project_owner"
  | "tool_owner"
  | "repo_owner"
  | "approval_owner"
  | "support_role"
  | "optional_advisor"
  | "policy_required_reviewer"
  | "fuzzy_match_only"
  | "none";

export type RoleMatch = "clear" | "weak" | "mismatch" | "unknown";

export type HierarchyConnection =
  | "lead"
  | "manager"
  | "direct_report"
  | "cross_team"
  | "none"
  | "unknown";

export type ProjectConnection =
  | "owner"
  | "contributor"
  | "support"
  | "none"
  | "unknown";

export type PolicyStatus =
  | "allowed"
  | "review_needed"
  | "approval_required"
  | "blocked"
  | "unknown";

export type RecipientSensitivity =
  | "low"
  | "internal"
  | "restricted"
  | "sensitive"
  | "unknown";

export type RecipientConfidence = "high" | "medium" | "low";

export type RecipientSafety =
  | "confirmed"
  | "likely"
  | "ambiguous"
  | "out_of_scope"
  | "unauthorized"
  | "cross_team_needs_approval";

export type AutonomyEligibility =
  | "eligible" // future trusted mode; UI still requires approval until autonomy is enabled
  | "draft_only"
  | "approval_required"
  | "clarification_required"
  | "blocked";

export type EvidenceSource =
  | "transcript"
  | "meeting"
  | "explicit_mention"
  | "project_ownership"
  | "approval_policy"
  | "correction_memory"
  // [PROD-UX-BUGC] The CALLER completed the recipient review (confirm/select).
  // A distinct proof source by design: a human vouching is never presented as
  // an Otzar-verified transcript/roster proof path. Only reachable through the
  // governed resolve-recipient path (out_of_scope/likely confirm, ambiguous
  // select) — never past unauthorized or cross_team_needs_approval.
  | "caller_confirmed"
  | "fuzzy_only"
  | "none";

export interface RecipientEvidence {
  /** The short source span (transcript quote / excerpt) supporting the route. */
  quote: string | null;
  source: EvidenceSource;
  /** The exact transcript token that deterministically resolved to entity_id,
   *  or null when no token provably referenced this recipient. */
  matchedToken: string | null;
  /** Other roster display names the matched token also resolves to — the
   *  ambiguity signal ("Shiney or Shweta?"). Empty when unambiguous. */
  alternativeCandidates: string[];
}

/** The governance verdict attached to every proposed recipient. Doctrine-
 *  complete: every field the Work-Graph proof-path model names is present.
 *  Fields with no grounded source yet (tool/repo ownership, typed department)
 *  resolve to "unknown"/"none" honestly — never invented. */
export interface RecipientGovernance {
  entity_id: string | null;
  display_name: string;
  email: string | null;
  role: string | null;
  participantStatus: ParticipantStatus;
  mentionStatus: MentionStatus;
  workConnectionType: WorkConnectionType;
  evidence: RecipientEvidence;
  roleMatch: RoleMatch;
  hierarchyConnection: HierarchyConnection;
  projectConnection: ProjectConnection;
  policyStatus: PolicyStatus;
  sensitivity: RecipientSensitivity;
  confidence: RecipientConfidence;
  recipientSafety: RecipientSafety;
  autonomyEligibility: AutonomyEligibility;
}

// ── Deterministic roster matching (STRICT — mirrors resolveTargetInOrg's safe
//    rules but deliberately omits the loose `includes` substring rule) ────────
export interface RosterEntry {
  entity_id: string;
  display_name: string;
  email: string | null;
  /** role_title from EntityMembership (free text). */
  title?: string | null;
  /** shared_project_count from identity-context, a deterministic work signal. */
  shared_project_count?: number;
}

/** Extract candidate person-name tokens from free text. Captures capitalized
 *  words ("David", "Shiney") and all-caps tokens ("SHINEY"). */
export function extractNameTokens(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Za-z]+\b/g) ?? [];
  return Array.from(new Set(matches));
}

/** Resolve ONE token to roster entity_ids using STRICT rules only: exact
 *  display_name, whole whitespace token, or first-name prefix ("david " ->
 *  "David Odie"). NEVER substring — "shiney" cannot reach "shweta". */
export function resolveTokenToEntities(
  token: string,
  roster: ReadonlyArray<RosterEntry>,
): string[] {
  const needle = token.trim().toLowerCase();
  if (needle.length < 2) return [];
  const ids: string[] = [];
  for (const p of roster) {
    const dn = p.display_name.toLowerCase();
    const parts = dn.split(/\s+/);
    if (dn === needle || parts.includes(needle) || dn.startsWith(`${needle} `)) {
      ids.push(p.entity_id);
    }
  }
  return ids;
}

/** Build the set of entity_ids the transcript PROVABLY references, plus the
 *  ambiguous tokens (a token that strictly matches >1 roster member). */
export function provablyReferenced(
  transcriptText: string,
  sourceExcerpt: string | null,
  roster: ReadonlyArray<RosterEntry>,
): {
  ids: Set<string>;
  ambiguous: Map<string, string[]>; // token -> entity_ids
  tokenForEntity: Map<string, string>; // entity_id -> the token that matched it
} {
  const tokens = extractNameTokens(
    `${sourceExcerpt ?? ""} ${transcriptText}`,
  );
  const ids = new Set<string>();
  const ambiguous = new Map<string, string[]>();
  const tokenForEntity = new Map<string, string>();
  for (const t of tokens) {
    const matched = resolveTokenToEntities(t, roster);
    if (matched.length === 1) {
      ids.add(matched[0]!);
      if (!tokenForEntity.has(matched[0]!)) tokenForEntity.set(matched[0]!, t);
    } else if (matched.length > 1) {
      ambiguous.set(t, matched);
    }
  }
  return { ids, ambiguous, tokenForEntity };
}

// ── The gate input ─────────────────────────────────────────────────────────
export interface ClassifyRecipientInput {
  /** The recipient the LLM/extractor proposed. entity_id may be null. */
  target: { entity_id: string | null; display_name: string; email: string | null; role?: string | null };
  /** Short source span that triggered the action. */
  sourceExcerpt: string | null;
  /** The full captured transcript text. */
  transcriptText: string;
  /** The viewer's org roster (the only roster the LLM was shown). */
  roster: ReadonlyArray<RosterEntry>;
  /** Meeting participant entity_ids when the capture has a participant list;
   *  null when unknown (raw paste with no meeting metadata). */
  participantEntityIds: ReadonlySet<string> | null;
  /** Deterministic project connection for this entity (resolved by the caller
   *  via isActiveProjectMember), or "unknown". */
  projectConnection?: ProjectConnection;
  /** Org-collaboration-policy verdict for routing to this recipient, mapped to
   *  PolicyStatus by the caller (evaluateOrgCollaborationPolicy), or "unknown". */
  policyStatus?: PolicyStatus;
  /** Hierarchy relation (lead/manager/cross_team/...) when known. */
  hierarchyConnection?: HierarchyConnection;
  /** The work domain the action is about, classified deterministically from the
   *  transcript/draft (e.g. "engineering"). Used only as a soft role-match
   *  heuristic over free-text role_title — NOT a typed compatibility matrix. */
  workDomain?: WorkDomain;
  /** Sensitivity of the context being shared. */
  sensitivity?: RecipientSensitivity;
  /** Explicit work-connection override from the responsibility graph
   *  (transcript_assignee / meeting_lead / founder_context_authority / etc). */
  workConnectionType?: WorkConnectionType;
  /** Known aliases for this recipient (from org correction memory), lowercased.
   *  An alias token in the transcript counts as an alias_mentioned proof. */
  aliases?: ReadonlyArray<string>;
  /** Entity ids that org correction memory has excluded from this work context
   *  (e.g. a marketing member wrongly matched for engineering work). A match
   *  here is a HARD exclusion regardless of any other signal. */
  excludeEntityIds?: ReadonlySet<string>;
}

export type WorkDomain =
  | "engineering"
  | "marketing"
  | "sales"
  | "finance"
  | "legal"
  | "product"
  | "operations"
  | "general"
  | "unknown";

// Free-text role -> domain heuristic. Honest approximation over role_title
// strings (there is no typed Department model yet). Returns "unknown" when the
// role string gives no signal.
function roleDomain(role: string | null | undefined): WorkDomain {
  const r = (role ?? "").toLowerCase();
  if (r.length === 0) return "unknown";
  if (/engineer|developer|integration|backend|frontend|devops|sre|swe|tech/.test(r)) return "engineering";
  if (/market|brand|growth|content|comms\b|social/.test(r)) return "marketing";
  if (/sales|account exec|\bae\b|business development|\bsdr\b/.test(r)) return "sales";
  if (/finance|accountant|controller|\bcfo\b/.test(r)) return "finance";
  if (/legal|counsel|compliance/.test(r)) return "legal";
  if (/product manager|product owner|\bpm\b|product lead/.test(r)) return "product";
  if (/operations|\bops\b/.test(r)) return "operations";
  return "general";
}

function classifyRoleMatch(
  role: string | null | undefined,
  workDomain: WorkDomain | undefined,
): RoleMatch {
  if (workDomain === undefined || workDomain === "unknown") return "unknown";
  const dom = roleDomain(role);
  if (dom === "unknown") return "unknown";
  if (dom === workDomain) return "clear";
  if (dom === "general") return "weak";
  return "mismatch";
}

// ── The deterministic classifier (pure) ────────────────────────────────────
export function classifyRecipient(
  input: ClassifyRecipientInput,
  referenced?: ReturnType<typeof provablyReferenced>,
): RecipientGovernance {
  const ref =
    referenced ??
    provablyReferenced(input.transcriptText, input.sourceExcerpt, input.roster);
  const { target } = input;

  // 1. Mention proof — does a transcript token deterministically resolve to THIS
  //    entity_id? This is the load-bearing check.
  const matchedToken =
    target.entity_id !== null ? ref.tokenForEntity.get(target.entity_id) ?? null : null;
  const aliasHit = aliasMention(input);
  const mentionStatus: MentionStatus =
    matchedToken !== null
      ? "explicitly_mentioned"
      : aliasHit !== null
        ? "alias_mentioned"
        : "not_mentioned";

  // 2. Ambiguity — is the recipient's own first name a token that strictly
  //    matched multiple roster members (Shiney vs Shweta-style collision)?
  const firstName = target.display_name.split(/\s+/)[0]?.toLowerCase() ?? "";
  const altCandidates: string[] = [];
  for (const [tok, ids] of ref.ambiguous) {
    if (tok.toLowerCase() === firstName && ids.length > 1) {
      for (const id of ids) {
        const peer = input.roster.find((p) => p.entity_id === id);
        if (peer && peer.entity_id !== target.entity_id) altCandidates.push(peer.display_name);
      }
    }
  }
  const ambiguousName = altCandidates.length > 0;

  // 3. Participation.
  const participantStatus: ParticipantStatus =
    input.participantEntityIds === null
      ? "unknown"
      : target.entity_id !== null && input.participantEntityIds.has(target.entity_id)
        ? "participant"
        : "non_participant";

  // 4. Work connection — explicit graph override wins; else infer from the
  //    deterministic signals we actually have (never invented).
  const projectConnection = input.projectConnection ?? "unknown";
  const workConnectionType: WorkConnectionType =
    input.workConnectionType ??
    (mentionStatus === "explicitly_mentioned"
      ? "transcript_assignee"
      : projectConnection === "owner"
        ? "project_owner"
        : projectConnection === "support" || projectConnection === "contributor"
          ? "support_role"
          : "none");

  const roleMatch = classifyRoleMatch(target.role, input.workDomain);
  const policyStatus = input.policyStatus ?? "unknown";
  const hierarchyConnection = input.hierarchyConnection ?? "unknown";
  const sensitivity = input.sensitivity ?? "unknown";

  // 5. Proof presence — is there ANY valid proof path?
  const hasProof =
    mentionStatus === "explicitly_mentioned" ||
    mentionStatus === "alias_mentioned" ||
    participantStatus === "participant" ||
    (workConnectionType !== "none" && workConnectionType !== "fuzzy_match_only");

  // 6. Recipient safety (deterministic decision tree).
  const correctionExcluded =
    target.entity_id !== null &&
    input.excludeEntityIds !== undefined &&
    input.excludeEntityIds.has(target.entity_id);

  let recipientSafety: RecipientSafety;
  if (correctionExcluded) {
    // Org correction memory has explicitly excluded this recipient from this
    // work context — a hard, auditable exclusion that overrides every signal.
    recipientSafety = "out_of_scope";
  } else if (target.entity_id === null) {
    // Never resolved to a real entity — must clarify, never send.
    recipientSafety = "ambiguous";
  } else if (ambiguousName && mentionStatus !== "explicitly_mentioned" && participantStatus !== "participant") {
    // The name itself is ambiguous and nothing disambiguates it -> ask.
    recipientSafety = "ambiguous";
  } else if (!hasProof) {
    // THE SHWETA CASE: the LLM proposed someone with no proof path at all.
    recipientSafety = "out_of_scope";
  } else if (policyStatus === "blocked") {
    recipientSafety = "unauthorized";
  } else if (roleMatch === "mismatch" && mentionStatus !== "explicitly_mentioned") {
    // Role mismatch with no explicit assignment -> review, not send.
    recipientSafety = "out_of_scope";
  } else if (policyStatus === "approval_required" || hierarchyConnection === "cross_team") {
    recipientSafety = "cross_team_needs_approval";
  } else if (
    (mentionStatus === "explicitly_mentioned" || participantStatus === "participant") &&
    (policyStatus === "allowed" || policyStatus === "unknown") &&
    roleMatch !== "mismatch"
  ) {
    recipientSafety = "confirmed";
  } else {
    recipientSafety = "likely";
  }

  // 7. Autonomy eligibility — eligible ONLY when every safety condition holds.
  //    (No auto-send is enabled anywhere; this is the computed signal the UI and
  //    future trusted modes read.)
  let autonomyEligibility: AutonomyEligibility;
  switch (recipientSafety) {
    case "confirmed":
      autonomyEligibility =
        sensitivity === "low" && roleMatch === "clear" && !ambiguousName && policyStatus === "allowed"
          ? "eligible"
          : "draft_only";
      break;
    case "likely":
      autonomyEligibility = "approval_required";
      break;
    case "cross_team_needs_approval":
      autonomyEligibility = "approval_required";
      break;
    case "ambiguous":
      autonomyEligibility = "clarification_required";
      break;
    case "out_of_scope":
    case "unauthorized":
    default:
      autonomyEligibility = "blocked";
      break;
  }

  // 8. Confidence — high only with explicit mention/participation + clear policy.
  const confidence: RecipientConfidence =
    recipientSafety === "confirmed"
      ? "high"
      : recipientSafety === "likely" || recipientSafety === "cross_team_needs_approval"
        ? "medium"
        : "low";

  const evidenceSource: EvidenceSource =
    mentionStatus === "explicitly_mentioned"
      ? "explicit_mention"
      : mentionStatus === "alias_mentioned"
        ? "correction_memory"
        : participantStatus === "participant"
          ? "meeting"
          : workConnectionType === "project_owner" || workConnectionType === "support_role"
            ? "project_ownership"
            : workConnectionType === "policy_required_reviewer" || workConnectionType === "approval_owner"
              ? "approval_policy"
              : hasProof
                ? "transcript"
                : "none";

  return {
    entity_id: target.entity_id,
    display_name: target.display_name,
    email: target.email,
    role: target.role ?? null,
    participantStatus,
    mentionStatus,
    workConnectionType,
    evidence: {
      quote: input.sourceExcerpt,
      source: evidenceSource,
      matchedToken: matchedToken ?? aliasHit,
      alternativeCandidates: altCandidates,
    },
    roleMatch,
    hierarchyConnection,
    projectConnection,
    policyStatus,
    sensitivity,
    confidence,
    recipientSafety,
    autonomyEligibility,
  };
}

// An alias token (from org correction memory) appearing in the transcript is a
// valid (alias) mention proof. Returns the matched alias token, or null.
function aliasMention(input: ClassifyRecipientInput): string | null {
  if (input.aliases === undefined || input.aliases.length === 0) return null;
  const hay = `${input.sourceExcerpt ?? ""} ${input.transcriptText}`.toLowerCase();
  for (const a of input.aliases) {
    const alias = a.trim().toLowerCase();
    if (alias.length >= 2 && new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(hay)) {
      return a;
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Is this governance verdict safe to present with a normal "Send" button? */
export function isSendReady(g: RecipientGovernance): boolean {
  return g.recipientSafety === "confirmed";
}
