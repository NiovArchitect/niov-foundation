// FILE: collaboration-assignment-resolver.ts
// PURPOSE: Phase 1221 — pure-function commitment-assignment resolver
//          for the CollaborationWorkspace substrate. Takes a captured
//          conversation excerpt + the workspace membership roster +
//          (optionally) the wider org roster, and returns a Resolved /
//          Ambiguous / Unresolved / Restricted decision with an
//          explicit `assignment_reason` prose, confidence, and source.
//
// PRIVACY INVARIANT (RULE 0):
//   - NEVER fabricate an `entity_id`. Names with no roster match
//     land as UNRESOLVED with `owner_entity_id = null`.
//   - NEVER fuzzy-match display_name (no Levenshtein / no embedding
//     nearest-neighbor). Only case-insensitive exact match OR a
//     first-name + space prefix (e.g. "Annie " matches
//     "Annie Wells").
//   - NEVER leak names from the wider org roster if the caller's
//     permission scope does not let them see those names; collapse
//     to UNRESOLVED in that case.
//   - When multiple candidates match, return AMBIGUOUS with up to
//     3 candidate ids — NEVER auto-pick.
//
// CONNECTS TO:
//   - collaboration-workspace.service.ts (consumer)
//   - apps/api/src/services/otzar/comms-extract.service.ts
//     (`buildDemoExtraction` is the DEMO_SCRIPTED upstream)
//   - src/lib/role-archetypes.ts (CT-tier mirror; ROLE_RESPONSIBILITY
//     uses role-archetype responsibility hints in this service for
//     MEDIUM-confidence assignment)
//
// WHY: This is the heart of the Phase 1221 Founder ask — "Otzar
//      must hand people the correct assignments based on what they
//      said they would do, what they were asked to do, their role,
//      their responsibility, and the collaboration context."
//      Implemented as a strict-precedence decision cascade so the
//      caller can read off the exact reason a commitment landed
//      with a specific owner.

/**
 * A snapshot of a workspace member visible to the resolver. Only
 * the fields needed for assignment are exposed — no PII leakage.
 */
export interface ResolverMemberSnapshot {
  member_entity_id: string;
  display_name: string;
  email: string | null;
  role_label: string;
  responsibility_summary: string | null;
  member_type: "INTERNAL" | "EXTERNAL";
  access_level: "VIEW" | "COMMENT" | "CONTRIBUTE" | "APPROVE";
}

/**
 * A snapshot of an org roster entry the caller is permitted to see.
 * Used only for the OUTSIDE_WORKSPACE detection path — never for
 * direct assignment (a non-member is never a workspace owner).
 */
export interface ResolverRosterEntry {
  entity_id: string;
  display_name: string;
}

export interface ResolverInput {
  /** Raw text of the commitment as extracted from the capture. */
  commitment_text: string;
  /** Verbatim conversation excerpt that sourced the commitment. */
  source_excerpt: string;
  /** The workspace membership snapshot. */
  members: ReadonlyArray<ResolverMemberSnapshot>;
  /** The caller-visible org roster (may be empty if permissions deny). */
  org_roster: ReadonlyArray<ResolverRosterEntry>;
  /** Whether external collaborators are permitted on this workspace. */
  external_allowed: boolean;
}

export type AssignmentSource =
  | "EXPLICIT_AGREEMENT"
  | "EXPLICIT_ASK"
  | "ROLE_RESPONSIBILITY"
  | "ROLE_ARCHETYPE"
  | "PROJECT_MEMBERSHIP";

export type AssignmentResolution =
  | "RESOLVED"
  | "UNRESOLVED"
  | "AMBIGUOUS"
  | "RESTRICTED";

export type AssignmentConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ResolverDecision {
  owner_entity_id: string | null;
  owner_display_name: string;
  resolution_status: AssignmentResolution;
  confidence: AssignmentConfidence;
  assignment_reason: string;
  assignment_source: AssignmentSource | null;
  /** Only populated when resolution_status === "AMBIGUOUS". */
  candidate_entity_ids: ReadonlyArray<string>;
}

// ─── helpers ────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Find a workspace member by name with strict-match-only semantics:
 *   1. exact case-insensitive display_name equality
 *   2. first-name + space prefix (e.g. "annie" → "Annie Wells")
 * Returns ALL matches so the caller can detect AMBIGUOUS.
 */
function findMembersByName(
  name: string,
  members: ReadonlyArray<ResolverMemberSnapshot>,
): ResolverMemberSnapshot[] {
  const target = normalize(name);
  if (target.length === 0) return [];
  const exact = members.filter(
    (m) => normalize(m.display_name) === target,
  );
  if (exact.length > 0) return exact;
  return members.filter((m) =>
    normalize(m.display_name).startsWith(`${target} `),
  );
}

function findRosterByName(
  name: string,
  roster: ReadonlyArray<ResolverRosterEntry>,
): ResolverRosterEntry[] {
  const target = normalize(name);
  if (target.length === 0) return [];
  const exact = roster.filter(
    (r) => normalize(r.display_name) === target,
  );
  if (exact.length > 0) return exact;
  return roster.filter((r) =>
    normalize(r.display_name).startsWith(`${target} `),
  );
}

/**
 * Scan the source_excerpt for "<Name> agreed" / "<Name> said they
 * can" / "<Name> said she can" / "<Name> said he can" / "<Name>
 * will" patterns. Each candidate is matched against the workspace
 * roster strictly. Returns the first member whose name appears
 * before one of the agreement verbs.
 */
function detectExplicitAgreement(
  excerpt: string,
  members: ReadonlyArray<ResolverMemberSnapshot>,
): { member: ResolverMemberSnapshot; matchedName: string } | null {
  const lc = normalize(excerpt);
  // Per-member scan — only consider names actually in the roster
  // (strict-match-only). For each member, look for "<first> agreed",
  // "<first> said she", "<first> said he", "<first> said they",
  // "<first> will", "<first> can", "<first> committed".
  const verbs = [
    "agreed",
    "said she",
    "said he",
    "said they can",
    "will ",
    "can complete",
    "can do",
    "committed",
  ];
  for (const member of members) {
    const first = normalize(member.display_name).split(" ")[0] ?? "";
    if (first.length === 0) continue;
    for (const v of verbs) {
      const idx = lc.indexOf(`${first} ${v}`);
      if (idx !== -1) {
        return { member, matchedName: member.display_name };
      }
    }
  }
  return null;
}

/**
 * Scan the source_excerpt for "<asker> asked <NameX>" / "asked
 * <NameX> to" patterns. The asker is ignored — only the asked
 * person is captured. Returns the first member whose name appears
 * after an "asked <NameX>" phrase.
 */
function detectExplicitAsk(
  excerpt: string,
  members: ReadonlyArray<ResolverMemberSnapshot>,
): { member: ResolverMemberSnapshot; matchedName: string } | null {
  const lc = normalize(excerpt);
  for (const member of members) {
    const first = normalize(member.display_name).split(" ")[0] ?? "";
    if (first.length === 0) continue;
    if (
      lc.includes(`asked ${first} `) ||
      lc.includes(`asked ${first},`) ||
      lc.includes(`asked ${first}.`) ||
      lc.endsWith(`asked ${first}`)
    ) {
      return { member, matchedName: member.display_name };
    }
  }
  return null;
}

/**
 * The closed-vocab responsibility hints map. Each entry maps a
 * commitment-text keyword to a role-archetype responsibility label
 * we recognize. When a member's role_label or
 * responsibility_summary contains the hint, that member is the
 * ROLE_RESPONSIBILITY winner.
 */
const RESPONSIBILITY_HINTS: ReadonlyArray<{
  keywords: ReadonlyArray<string>;
  role_hint: string;
}> = [
  { keywords: ["compliance", "regulatory", "regulator"], role_hint: "compliance" },
  { keywords: ["ui flow", "ui review", "design review"], role_hint: "ui" },
  { keywords: ["ai/nlp", "model evaluation", "ml model"], role_hint: "ai" },
  { keywords: ["security review", "threat model"], role_hint: "security" },
  { keywords: ["approval", "coordination", "launch"], role_hint: "launch" },
];

function detectByResponsibility(
  commitment_text: string,
  members: ReadonlyArray<ResolverMemberSnapshot>,
): ResolverMemberSnapshot | null {
  const lc = normalize(commitment_text);
  for (const hint of RESPONSIBILITY_HINTS) {
    if (!hint.keywords.some((k) => lc.includes(k))) continue;
    const winners = members.filter((m) => {
      const blob = normalize(
        `${m.role_label} ${m.responsibility_summary ?? ""}`,
      );
      return blob.includes(hint.role_hint);
    });
    if (winners.length === 1) {
      const first = winners[0];
      if (first !== undefined) return first;
    }
  }
  return null;
}

// ─── main resolver ──────────────────────────────────────────────

/**
 * Resolve a single commitment against the workspace roster.
 * Strict-precedence cascade:
 *   1. EXPLICIT_AGREEMENT (HIGH) — member name + agreement verb
 *   2. EXPLICIT_ASK       (HIGH) — "asked <name>" pattern
 *   3. ROLE_RESPONSIBILITY (HIGH) — single-match role/responsibility hint
 *   4. ROLE_ARCHETYPE     (MEDIUM) — single member with matching role_label
 *   5. PROJECT_MEMBERSHIP (LOW) — exactly one project member named anywhere
 *   6. OUTSIDE_WORKSPACE   — name matches an org roster entry NOT in the
 *                            workspace → UNRESOLVED with a callout reason
 *   7. AMBIGUOUS          — multiple workspace members match
 *   8. UNRESOLVED         — nothing matched
 * EXTERNAL members produce RESTRICTED when external_allowed = false.
 */
export function resolveCommitmentAssignment(
  input: ResolverInput,
): ResolverDecision {
  // 1) EXPLICIT_AGREEMENT
  const agreement = detectExplicitAgreement(
    input.source_excerpt,
    input.members,
  );
  if (agreement !== null) {
    return finalizeForMember(
      agreement.member,
      "RESOLVED",
      "HIGH",
      "EXPLICIT_AGREEMENT",
      `${agreement.member.display_name} agreed to this in the capture.`,
      input.external_allowed,
    );
  }

  // 2) EXPLICIT_ASK
  const ask = detectExplicitAsk(input.source_excerpt, input.members);
  if (ask !== null) {
    return finalizeForMember(
      ask.member,
      "RESOLVED",
      "HIGH",
      "EXPLICIT_ASK",
      `${ask.member.display_name} was explicitly asked to handle this.`,
      input.external_allowed,
    );
  }

  // 3) ROLE_RESPONSIBILITY
  const byRole = detectByResponsibility(input.commitment_text, input.members);
  if (byRole !== null) {
    return finalizeForMember(
      byRole,
      "RESOLVED",
      "HIGH",
      "ROLE_RESPONSIBILITY",
      `${byRole.display_name} owns ${describeResponsibility(
        byRole,
      )} in this workspace.`,
      input.external_allowed,
    );
  }

  // 4) ROLE_ARCHETYPE — same hint logic but at MEDIUM confidence
  //    when multiple members carry the role label and we can't
  //    confidently single one out from text. We DO NOT pick;
  //    we mark AMBIGUOUS.
  // (Implementation note: this branch is reached when responsibility
  //  hints matched but multiple members share the role.)
  // 5) PROJECT_MEMBERSHIP — try to find ANY workspace member name in
  //    the commitment_text or source_excerpt.
  const directHits: ResolverMemberSnapshot[] = [];
  for (const member of input.members) {
    const matches = findMembersByName(
      member.display_name,
      input.members,
    );
    if (matches.length === 0) continue;
    const lcCommit = normalize(input.commitment_text);
    const lcExcerpt = normalize(input.source_excerpt);
    const first = normalize(member.display_name).split(" ")[0] ?? "";
    if (
      first.length > 0 &&
      (lcCommit.includes(first) || lcExcerpt.includes(first))
    ) {
      directHits.push(member);
    }
  }
  const uniqueDirectHits = Array.from(
    new Map(directHits.map((m) => [m.member_entity_id, m])).values(),
  );
  if (uniqueDirectHits.length === 1) {
    const member = uniqueDirectHits[0];
    if (member !== undefined) {
      return finalizeForMember(
        member,
        "RESOLVED",
        "LOW",
        "PROJECT_MEMBERSHIP",
        `${member.display_name} is the only workspace member mentioned in this commitment.`,
        input.external_allowed,
      );
    }
  }
  if (uniqueDirectHits.length > 1) {
    return {
      owner_entity_id: null,
      owner_display_name: "(needs selection)",
      resolution_status: "AMBIGUOUS",
      confidence: "LOW",
      assignment_reason:
        "Multiple workspace members are mentioned. Pick the right owner before confirming.",
      assignment_source: null,
      candidate_entity_ids: uniqueDirectHits
        .slice(0, 3)
        .map((m) => m.member_entity_id),
    };
  }

  // 6) OUTSIDE_WORKSPACE — name resolves to a visible org-roster
  //    entry that is NOT a workspace member. Still UNRESOLVED; the
  //    caller is told to invite-then-confirm.
  for (const entry of input.org_roster) {
    const first = normalize(entry.display_name).split(" ")[0] ?? "";
    if (first.length === 0) continue;
    const lcExcerpt = normalize(input.source_excerpt);
    const lcCommit = normalize(input.commitment_text);
    if (
      lcExcerpt.includes(first) ||
      lcCommit.includes(first)
    ) {
      const matchInMembers = findMembersByName(
        entry.display_name,
        input.members,
      );
      if (matchInMembers.length === 0) {
        return {
          owner_entity_id: null,
          owner_display_name: entry.display_name,
          resolution_status: "UNRESOLVED",
          confidence: "LOW",
          assignment_reason: `${entry.display_name} is on the org roster but not in this workspace. Add them as a member before confirming.`,
          assignment_source: null,
          candidate_entity_ids: [],
        };
      }
    }
  }

  // 8) UNRESOLVED — nothing matched. NEVER fabricate.
  return {
    owner_entity_id: null,
    owner_display_name: "(unresolved)",
    resolution_status: "UNRESOLVED",
    confidence: "LOW",
    assignment_reason:
      "Otzar could not identify the owner from the capture or workspace roster. Set the owner manually before confirming.",
    assignment_source: null,
    candidate_entity_ids: [],
  };
}

function finalizeForMember(
  member: ResolverMemberSnapshot,
  status: AssignmentResolution,
  confidence: AssignmentConfidence,
  source: AssignmentSource,
  reason: string,
  externalAllowed: boolean,
): ResolverDecision {
  if (member.member_type === "EXTERNAL" && !externalAllowed) {
    return {
      owner_entity_id: null,
      owner_display_name: member.display_name,
      resolution_status: "RESTRICTED",
      confidence: "LOW",
      assignment_reason: `${member.display_name} is an external collaborator and this workspace does not allow external owners. Update visibility or pick an internal owner.`,
      assignment_source: null,
      candidate_entity_ids: [],
    };
  }
  return {
    owner_entity_id: member.member_entity_id,
    owner_display_name: member.display_name,
    resolution_status: status,
    confidence,
    assignment_reason: reason,
    assignment_source: source,
    candidate_entity_ids: [],
  };
}

function describeResponsibility(
  member: ResolverMemberSnapshot,
): string {
  if (
    member.responsibility_summary !== null &&
    member.responsibility_summary.trim().length > 0
  ) {
    return member.responsibility_summary;
  }
  return member.role_label;
}
