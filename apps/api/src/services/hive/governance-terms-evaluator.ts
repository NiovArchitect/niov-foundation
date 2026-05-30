// FILE: governance-terms-evaluator.ts
// PURPOSE: Section 3 Wave 4 v1 Layer 1 governance_terms policy
//          evaluator per ADR-0063. Pure-function evaluator over
//          the stored Hive.governance_terms JSON. NO database
//          reads; NO external source fetching; NO Layer 2/3
//          substrate; NO daemon. Wire-time evaluation only at
//          the 3 call sites the HiveService surfaces.
// CONNECTS TO:
//   - apps/api/src/services/hive/hive.service.ts (createHive,
//     inviteToHive, getHiveIntelligence)
//   - ADR-0063 Sub-decision 2 (10 v1 evaluable terms; 9 wired
//     at this slice; require_admin_approval_for_invites DEFERRED
//     per Founder Wave 4 implementation authorization until an
//     admin invite path exists)

import type { EntityType, HiveType } from "@niov/database";

// WHAT: The closed vocabulary of v1 Layer 1 governance_terms keys.
// INPUT: Used as a value constant + a TS literal-union type.
// OUTPUT: None.
// WHY: ADR-0063 Sub-decision 2 locks the 10 v1 evaluable terms;
//      Founder Wave 4 implementation authorization deferred
//      `require_admin_approval_for_invites` (would hard-freeze
//      `inviteToHive` because no admin invite path exists yet).
//      The remaining 9 are listed here; the parser ignores
//      every other key per ADR-0063 ("unrecognized keys IGNORED
//      at v1").
export const V1_GOVERNANCE_TERM_KEYS = [
  "allowed_hive_types",
  "allowed_member_entity_types",
  "allow_ai_agent_membership",
  "max_member_count",
  "allowed_capsule_types_accessible",
  "allowed_capsule_types_contributed",
  "dissolve_requires_admin",
  "aggregate_min_member_count",
  "policy_source_ref",
] as const;

// WHAT: The structured shape of governance_terms after parsing.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Type-safe access at the evaluator call sites. Every field
//      is optional — operators may set any subset; absent keys
//      mean "no enforcement for this dimension."
export interface ParsedGovernanceTerms {
  allowed_hive_types?: HiveType[];
  allowed_member_entity_types?: EntityType[];
  allow_ai_agent_membership?: boolean;
  max_member_count?: number;
  allowed_capsule_types_accessible?: string[];
  allowed_capsule_types_contributed?: string[];
  dissolve_requires_admin?: boolean;
  aggregate_min_member_count?: number;
  policy_source_ref?: string;
}

// WHAT: Discriminated failure code for governance enforcement.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ADR-0063 Sub-decision 5 + Founder Wave 4 implementation
//      term-set narrowing. 6 codes at v1 (the 7th from
//      Sub-decision 13 — INVITE_REQUIRES_ADMIN_APPROVAL — is NOT
//      added because the term is deferred per Founder direction).
export type GovernanceViolationCode =
  | "GOVERNANCE_HIVE_TYPE_FORBIDDEN"
  | "GOVERNANCE_INVITEE_TYPE_FORBIDDEN"
  | "GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED"
  | "GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN"
  | "GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN"
  | "GOVERNANCE_TERMS_MALFORMED";

// WHAT: Evaluator success / failure shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Discriminated union — callers consume via switch on `ok`.
//      On failure, `term` names the canonical key that failed
//      (safe to surface in error messages; the term names are
//      operational vocabulary, not sensitive); `message` is a
//      safe human-readable string that NEVER contains the full
//      governance_terms object or cross-org facts.
export type GovernanceEvalResult =
  | { ok: true }
  | {
      ok: false;
      code: GovernanceViolationCode;
      term: string;
      message: string;
    };

// WHAT: Parse governance_terms JSON into a strict ParsedGovernanceTerms.
// INPUT: The raw `governance_terms` value loaded from the Hive row.
// OUTPUT: ParsedGovernanceTerms (per-key best-effort) OR
//         "MALFORMED" when the top-level value is not a JSON object.
// WHY: Lenient parsing per ADR-0063 Sub-decision 2: unrecognized
//      keys IGNORED; per-key type-mismatch IGNORED. The only true
//      MALFORMED case is the top-level value not being a JSON
//      object (null, array, primitive) — that means the
//      operator broke the field's contract entirely.
export function parseGovernanceTerms(
  raw: unknown,
): ParsedGovernanceTerms | "MALFORMED" {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "MALFORMED";
  }
  const t = raw as Record<string, unknown>;
  const out: ParsedGovernanceTerms = {};

  // allowed_hive_types: string[] of HiveType values (we accept
  // any string; the evaluator compares against the actual
  // requested HiveType — invalid HiveType strings simply never
  // match, which is the correct fail-closed behavior).
  if (Array.isArray(t.allowed_hive_types)) {
    const arr = t.allowed_hive_types.filter(
      (v): v is HiveType => typeof v === "string",
    );
    out.allowed_hive_types = arr;
  }

  if (Array.isArray(t.allowed_member_entity_types)) {
    const arr = t.allowed_member_entity_types.filter(
      (v): v is EntityType => typeof v === "string",
    );
    out.allowed_member_entity_types = arr;
  }

  if (typeof t.allow_ai_agent_membership === "boolean") {
    out.allow_ai_agent_membership = t.allow_ai_agent_membership;
  }

  if (
    typeof t.max_member_count === "number" &&
    Number.isInteger(t.max_member_count) &&
    t.max_member_count > 0
  ) {
    out.max_member_count = t.max_member_count;
  }

  if (Array.isArray(t.allowed_capsule_types_accessible)) {
    const arr = t.allowed_capsule_types_accessible.filter(
      (v): v is string => typeof v === "string",
    );
    out.allowed_capsule_types_accessible = arr;
  }

  if (Array.isArray(t.allowed_capsule_types_contributed)) {
    const arr = t.allowed_capsule_types_contributed.filter(
      (v): v is string => typeof v === "string",
    );
    out.allowed_capsule_types_contributed = arr;
  }

  if (typeof t.dissolve_requires_admin === "boolean") {
    out.dissolve_requires_admin = t.dissolve_requires_admin;
  }

  if (
    typeof t.aggregate_min_member_count === "number" &&
    Number.isInteger(t.aggregate_min_member_count) &&
    t.aggregate_min_member_count > 0
  ) {
    out.aggregate_min_member_count = t.aggregate_min_member_count;
  }

  // policy_source_ref: metadata-only at v1. We type-check it but
  // do NOT validate URL shape or fetch the source per ADR-0063
  // Sub-decision 2 (last term) + Founder Wave 4 direction
  // ("metadata only at v1. Validate only basic shape if safe.
  // Do not enforce external policy source.").
  if (typeof t.policy_source_ref === "string" && t.policy_source_ref.length > 0) {
    out.policy_source_ref = t.policy_source_ref;
  }

  return out;
}

// WHAT: Evaluate the createHive call against governance_terms.
// INPUT: The seed terms object (the operator's create payload)
//        + the requested hive_type + the creator membership
//        settings (capsule_types_accessible + capsule_types_contributed).
// OUTPUT: GovernanceEvalResult.
// WHY: ADR-0063 Sub-decision 4 — createHive evaluates
//      `allowed_hive_types` (against the requested type) and
//      validates the seed's internal consistency. The creator
//      membership is the first member, so its capsule_types_*
//      are checked against the same allowlists used at
//      inviteToHive.
export function evaluateGovernanceForCreate(
  rawTerms: unknown,
  args: {
    requested_hive_type: HiveType;
    creator_capsule_types_accessible: string[];
    creator_capsule_types_contributed: string[];
  },
): GovernanceEvalResult {
  const parsed = parseGovernanceTerms(rawTerms);
  if (parsed === "MALFORMED") {
    return {
      ok: false,
      code: "GOVERNANCE_TERMS_MALFORMED",
      term: "governance_terms",
      message: "governance_terms must be a JSON object",
    };
  }

  // allowed_hive_types: if present, the requested hive_type must
  // be in the allowlist. (Wave 2 HIVE_TYPE_V1_ALLOWLIST has
  // already run at the HiveService createHive boundary BEFORE
  // this evaluator is called — see ADR-0063 Sub-decision 4 +
  // Founder Wave 4 term semantics.)
  if (parsed.allowed_hive_types !== undefined) {
    if (!parsed.allowed_hive_types.includes(args.requested_hive_type)) {
      return {
        ok: false,
        code: "GOVERNANCE_HIVE_TYPE_FORBIDDEN",
        term: "allowed_hive_types",
        message: "hive_type blocked by hive policy term `allowed_hive_types`",
      };
    }
  }

  const accessibleCheck = checkCapsuleTypesAccessible(
    parsed,
    args.creator_capsule_types_accessible,
  );
  if (accessibleCheck.ok === false) return accessibleCheck;

  const contributedCheck = checkCapsuleTypesContributed(
    parsed,
    args.creator_capsule_types_contributed,
  );
  if (contributedCheck.ok === false) return contributedCheck;

  return { ok: true };
}

// WHAT: Evaluate the inviteToHive call against governance_terms.
// INPUT: The hive's stored governance_terms + invitee.entity_type
//        + the running member_count (BEFORE the invitee row is
//        added) + the invitee membership's capsule_types_*.
// OUTPUT: GovernanceEvalResult.
// WHY: ADR-0063 Sub-decision 4 — inviteToHive evaluates
//      `allowed_member_entity_types`, `max_member_count`,
//      `allowed_capsule_types_accessible`, and
//      `allowed_capsule_types_contributed`.
//      `allow_ai_agent_membership` is ADVISORY at v1 per Founder
//      direction (Wave 2 AI_AGENT exclusion runs FIRST at the
//      HiveService boundary BEFORE this evaluator is called; if
//      `allow_ai_agent_membership === false` and somehow the
//      invitee is AI_AGENT and reaches this point, the evaluator
//      also rejects — defense in depth without overriding
//      Wave 2). `require_admin_approval_for_invites` is DEFERRED
//      per Founder Wave 4 implementation authorization (no admin
//      invite path exists yet; would hard-freeze inviteToHive).
export function evaluateGovernanceForInvite(
  rawTerms: unknown,
  args: {
    invitee_entity_type: EntityType;
    current_member_count: number;
    invitee_capsule_types_accessible: string[];
    invitee_capsule_types_contributed: string[];
  },
): GovernanceEvalResult {
  const parsed = parseGovernanceTerms(rawTerms);
  if (parsed === "MALFORMED") {
    return {
      ok: false,
      code: "GOVERNANCE_TERMS_MALFORMED",
      term: "governance_terms",
      message: "governance_terms must be a JSON object",
    };
  }

  if (parsed.allowed_member_entity_types !== undefined) {
    if (
      !parsed.allowed_member_entity_types.includes(args.invitee_entity_type)
    ) {
      return {
        ok: false,
        code: "GOVERNANCE_INVITEE_TYPE_FORBIDDEN",
        term: "allowed_member_entity_types",
        message:
          "invitee entity_type blocked by hive policy term `allowed_member_entity_types`",
      };
    }
  }

  // allow_ai_agent_membership: ADVISORY at v1 per Founder
  // direction. Wave 2 AI_AGENT_NOT_ELIGIBLE_FOR_HIVE check at
  // inviteToHive will have rejected AI_AGENT before this point;
  // this defense-in-depth branch only fires if the Wave 2 check
  // were ever lifted at the same time as this term were set to
  // false. Documented at ADR-0063 Sub-decision 2.
  if (
    parsed.allow_ai_agent_membership === false &&
    args.invitee_entity_type === "AI_AGENT"
  ) {
    return {
      ok: false,
      code: "GOVERNANCE_INVITEE_TYPE_FORBIDDEN",
      term: "allow_ai_agent_membership",
      message:
        "invitee blocked by hive policy term `allow_ai_agent_membership`",
    };
  }

  // max_member_count: compare against (member_count + 1) — the
  // invitee would be the next active member.
  if (parsed.max_member_count !== undefined) {
    if (args.current_member_count + 1 > parsed.max_member_count) {
      return {
        ok: false,
        code: "GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED",
        term: "max_member_count",
        message:
          "invite blocked by hive policy term `max_member_count` (capacity reached)",
      };
    }
  }

  const accessibleCheck = checkCapsuleTypesAccessible(
    parsed,
    args.invitee_capsule_types_accessible,
  );
  if (accessibleCheck.ok === false) return accessibleCheck;

  const contributedCheck = checkCapsuleTypesContributed(
    parsed,
    args.invitee_capsule_types_contributed,
  );
  if (contributedCheck.ok === false) return contributedCheck;

  return { ok: true };
}

// WHAT: Check whether the aggregate-read should be allowed or
//        soft-collapsed to zero-state under aggregate_min_member_count.
// INPUT: The hive's stored governance_terms + the active member_count.
// OUTPUT: { ok: true; below_threshold: false } for normal read;
//         { ok: true; below_threshold: true; threshold } for
//         zero-state collapse; failure only on MALFORMED.
// WHY: ADR-0063 Sub-decision 4 + Sub-decision 5 — getHiveIntelligence
//      zero-state under aggregate_min_member_count reuses the
//      existing HIVE_INTELLIGENCE_READ audit with new
//      details.zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT".
//      This is NOT a violation — it's a soft scope-narrowing
//      mirror of Wave 2's empty-capsule_types_accessible zero-state.
//      MALFORMED is still a failure (operator broke the JSON).
export type GovernanceAggregateGateResult =
  | { ok: true; below_threshold: false }
  | { ok: true; below_threshold: true; threshold: number }
  | {
      ok: false;
      code: "GOVERNANCE_TERMS_MALFORMED";
      term: string;
      message: string;
    };

export function evaluateGovernanceForAggregateRead(
  rawTerms: unknown,
  args: { current_member_count: number },
): GovernanceAggregateGateResult {
  const parsed = parseGovernanceTerms(rawTerms);
  if (parsed === "MALFORMED") {
    return {
      ok: false,
      code: "GOVERNANCE_TERMS_MALFORMED",
      term: "governance_terms",
      message: "governance_terms must be a JSON object",
    };
  }
  if (parsed.aggregate_min_member_count === undefined) {
    return { ok: true, below_threshold: false };
  }
  if (args.current_member_count < parsed.aggregate_min_member_count) {
    return {
      ok: true,
      below_threshold: true,
      threshold: parsed.aggregate_min_member_count,
    };
  }
  return { ok: true, below_threshold: false };
}

// WHAT: Shared helper for capsule_types_accessible allowlist check.
// INPUT: Parsed terms + requested types.
// OUTPUT: GovernanceEvalResult ({ ok: true } when allowlist
//         absent OR when every requested type is in the allowlist).
// WHY: Same check runs at createHive (creator settings) +
//      inviteToHive (invitee settings); centralize.
function checkCapsuleTypesAccessible(
  parsed: ParsedGovernanceTerms,
  requested: string[],
): GovernanceEvalResult {
  if (parsed.allowed_capsule_types_accessible === undefined) {
    return { ok: true };
  }
  const allowlist = new Set(parsed.allowed_capsule_types_accessible);
  for (const t of requested) {
    if (!allowlist.has(t)) {
      return {
        ok: false,
        code: "GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN",
        term: "allowed_capsule_types_accessible",
        message:
          "membership capsule_types_accessible blocked by hive policy term `allowed_capsule_types_accessible`",
      };
    }
  }
  return { ok: true };
}

// WHAT: Shared helper for capsule_types_contributed allowlist check.
// INPUT: Parsed terms + requested types.
// OUTPUT: GovernanceEvalResult.
// WHY: Same shape as the accessible check; centralize for parity.
function checkCapsuleTypesContributed(
  parsed: ParsedGovernanceTerms,
  requested: string[],
): GovernanceEvalResult {
  if (parsed.allowed_capsule_types_contributed === undefined) {
    return { ok: true };
  }
  const allowlist = new Set(parsed.allowed_capsule_types_contributed);
  for (const t of requested) {
    if (!allowlist.has(t)) {
      return {
        ok: false,
        code: "GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN",
        term: "allowed_capsule_types_contributed",
        message:
          "membership capsule_types_contributed blocked by hive policy term `allowed_capsule_types_contributed`",
      };
    }
  }
  return { ok: true };
}
