// FILE: temporal-personalization.ts
// PURPOSE: Temporal personalization model for the Foundation/COSMP
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.2 per Q-PERS.2-ε). Encodes the five temporal
//          personalization classes that govern consistent-yet-dynamic
//          data flow — so the Foundation never collapses all
//          personalization into one freshness/staleness model.
//
//          Core doctrine (Founder, PERS.2):
//            - REAL_TIME signals update fast (short TTL; refresh-or-mark-
//              uncertain).
//            - REPEATED_PATTERN signals stay stable unless consistent
//              contrary change is observed (one contradiction does not
//              flip them).
//            - STABLE_IDENTITY must not thrash from one-off behavior
//              (explicit / admin-or-user-governed update only).
//            - CONTEXTUAL_PREFERENCE applies only under matching context
//              (never generalized globally).
//            - SENSITIVE_ENRICHMENT remains scoped + permissioned + high-
//              audit + graceful-degrade.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/permission-envelope.service.ts
//     (maps each temporal class to a default permission tier)
//   - apps/api/src/services/personalization/moment-context.service.ts
//     (maps each temporal class to default freshness/TTL behavior)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Personalization Capsule Taxonomy + Q-PERS.2-ε temporal model)
//
// Pure deterministic TypeScript (Q-PERS.2-θ): no I/O, no Date.now(),
// no DB reads, no Elixir. Referentially transparent; portable to a
// future Elixir register per ADR-0028 forward-substrate.

// WHAT: The four canonical permission tiers (ADR-0048 §Permission
//        Matrix; Q-PERS.2-γ). Mirrors the permission-envelope resolver's
//        tier vocabulary so the temporal model and the envelope agree.
// INPUT: Used as a type only.
// OUTPUT: None — a type.
// WHY: Each temporal class declares the permission tier its signals
//      default to, so the envelope resolver and moment-context resolver
//      share one canonical mapping.
export type PermissionTier =
  | "required"
  | "accuracy_enhancing"
  | "optional_enrichment"
  | "denied_or_unavailable";

// WHAT: The five temporal personalization classes (Q-PERS.2-ε).
// INPUT: Used as a type only.
// OUTPUT: None — a type.
// WHY: Distinguishing these classes is what lets the Foundation support
//      consistent-yet-dynamic data flow without one global staleness
//      model.
export type TemporalClass =
  | "REAL_TIME"
  | "REPEATED_PATTERN"
  | "STABLE_IDENTITY"
  | "CONTEXTUAL_PREFERENCE"
  | "SENSITIVE_ENRICHMENT";

// WHAT: How a temporal class's freshness is governed.
//        - EXPIRES_FAST: short TTL; must refresh or mark uncertain.
//        - REQUIRES_REPEATED_CHANGE: long-lived; one contradiction does
//          not invalidate; needs repeated contrary signals.
//        - EXPLICIT_UPDATE_ONLY: very durable; changes only by explicit
//          user/admin-governed update (or high-confidence repeated
//          pattern).
//        - CONTEXT_SCOPED: applies only under matching context; not a
//          time-decay model.
//        - SCOPED_PERMISSIONED: availability is permission-gated and
//          scoped; freshness is a function of grant validity.
// WHY: Each class needs a distinct freshness posture (Founder doctrine).
export type FreshnessBehavior =
  | "EXPIRES_FAST"
  | "REQUIRES_REPEATED_CHANGE"
  | "EXPLICIT_UPDATE_ONLY"
  | "CONTEXT_SCOPED"
  | "SCOPED_PERMISSIONED";

// WHAT: How conflicting / updating signals are reconciled for a class.
// WHY: Encodes the Founder doctrine on whether a single observation may
//      mutate the class's durable representation.
export type ConflictUpdatePosture =
  | "OVERWRITE_LATEST" // real-time: latest observation wins for the moment
  | "REQUIRE_REPEATED_CONTRARY" // pattern: needs repeated contrary signals
  | "EXPLICIT_GOVERNED_UPDATE" // identity: explicit user/admin governed
  | "MATCH_CONTEXT_ONLY" // contextual preference: applies in-context only
  | "SCOPED_GRANT_BOUND"; // sensitive: bound to scope + grant validity

// WHAT: The behavior contract for one temporal class.
// INPUT: Used as a type only.
// OUTPUT: None — a type.
// WHY: Q-PERS.2-ε requires each class to define freshness behavior +
//      default permission tier + conflict/update posture + whether a
//      one-off event can update durable memory + whether uncertainty
//      disclosure is required when the signal is absent.
export interface TemporalClassPolicy {
  readonly className: TemporalClass;
  readonly freshness: FreshnessBehavior;
  // Default TTL in seconds for a resolved signal of this class. null =
  // no time-based expiry (identity / context-scoped); the moment-context
  // resolver reads this to stamp per-field TTL metadata.
  readonly defaultTtlSeconds: number | null;
  readonly defaultPermissionTier: PermissionTier;
  readonly conflictUpdatePosture: ConflictUpdatePosture;
  // Whether a single one-off observation may update durable memory.
  // Founder doctrine: only false here — durable updates require repeated
  // signals (pattern), explicit governance (identity), context match
  // (preference), or scoped grants (sensitive). Real-time signals are
  // moment-only and never promote a durable capsule on their own.
  readonly oneOffCanUpdateDurableMemory: boolean;
  // Whether the resolver MUST disclose uncertainty when this class's
  // signal is absent (rather than silently omitting or hallucinating).
  readonly uncertaintyDisclosureRequiredWhenAbsent: boolean;
}

// WHAT: The canonical policy table for all five temporal classes.
// INPUT: None.
// OUTPUT: A frozen Record keyed by TemporalClass.
// WHY: One canonical source of temporal behavior, frozen so it cannot be
//      mutated at runtime (anchor-style immutability per the frozen-config
//      discipline in docs/reference/architectural-anchors.md).
export const TEMPORAL_POLICIES: Readonly<
  Record<TemporalClass, TemporalClassPolicy>
> = Object.freeze({
  REAL_TIME: Object.freeze({
    className: "REAL_TIME",
    freshness: "EXPIRES_FAST",
    defaultTtlSeconds: 300, // 5 minutes — refresh-or-mark-uncertain
    defaultPermissionTier: "accuracy_enhancing",
    conflictUpdatePosture: "OVERWRITE_LATEST",
    oneOffCanUpdateDurableMemory: false,
    uncertaintyDisclosureRequiredWhenAbsent: true,
  }),
  REPEATED_PATTERN: Object.freeze({
    className: "REPEATED_PATTERN",
    freshness: "REQUIRES_REPEATED_CHANGE",
    defaultTtlSeconds: 2592000, // 30 days — durable but reviewable
    defaultPermissionTier: "accuracy_enhancing",
    conflictUpdatePosture: "REQUIRE_REPEATED_CONTRARY",
    oneOffCanUpdateDurableMemory: false,
    uncertaintyDisclosureRequiredWhenAbsent: false,
  }),
  STABLE_IDENTITY: Object.freeze({
    className: "STABLE_IDENTITY",
    freshness: "EXPLICIT_UPDATE_ONLY",
    defaultTtlSeconds: null, // no time-based expiry
    defaultPermissionTier: "required",
    conflictUpdatePosture: "EXPLICIT_GOVERNED_UPDATE",
    oneOffCanUpdateDurableMemory: false,
    uncertaintyDisclosureRequiredWhenAbsent: true,
  }),
  CONTEXTUAL_PREFERENCE: Object.freeze({
    className: "CONTEXTUAL_PREFERENCE",
    freshness: "CONTEXT_SCOPED",
    defaultTtlSeconds: null, // applies in-context, not time-decayed
    defaultPermissionTier: "accuracy_enhancing",
    conflictUpdatePosture: "MATCH_CONTEXT_ONLY",
    oneOffCanUpdateDurableMemory: false,
    uncertaintyDisclosureRequiredWhenAbsent: false,
  }),
  SENSITIVE_ENRICHMENT: Object.freeze({
    className: "SENSITIVE_ENRICHMENT",
    freshness: "SCOPED_PERMISSIONED",
    defaultTtlSeconds: 900, // 15 minutes — short, re-check grant
    defaultPermissionTier: "optional_enrichment",
    conflictUpdatePosture: "SCOPED_GRANT_BOUND",
    oneOffCanUpdateDurableMemory: false,
    uncertaintyDisclosureRequiredWhenAbsent: true,
  }),
});

// WHAT: Look up the policy for a temporal class.
// INPUT: A TemporalClass value.
// OUTPUT: The frozen TemporalClassPolicy for that class.
// WHY: Total over the closed TemporalClass union — the Record is keyed by
//      every member, so this never returns undefined for a valid class
//      (satisfies noUncheckedIndexedAccess via the typed key).
export function getTemporalPolicy(
  className: TemporalClass,
): TemporalClassPolicy {
  return TEMPORAL_POLICIES[className];
}
