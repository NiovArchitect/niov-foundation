// FILE: permission-envelope.service.ts
// PURPOSE: Foundation/COSMP permission-envelope resolver for the
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.2 per Q-PERS.2-γ). Maps a requested
//          personalization context into the four canonical permission
//          tiers (required / accuracy_enhancing / optional_enrichment /
//          denied_or_unavailable) with personal-vs-enterprise
//          discrimination, OrgSettings enterprise defaults, and
//          Permission.conditions-style grants — never granting
//          cross-wallet data by default and never silently bridging
//          personal and enterprise contexts.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/temporal-personalization.ts
//     (PermissionTier vocabulary + per-context default temporal class /
//     tier)
//   - apps/api/src/services/personalization/moment-context.service.ts
//     (consumes the resolved envelope to decide which moment-context
//     fields it may populate)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Permission Matrix; Q-PERS.2-γ)
//
// Pure deterministic TypeScript: no DB reads (caller pre-fetches /
// supplies OrgSettings defaults + Permission.conditions-style grants),
// no I/O, no Elixir. Audit-intent metadata only (NO new audit literals
// per Q-PERS.2-η). Referentially transparent; portable to a future
// Elixir register per ADR-0028 forward-substrate.

import type { PermissionTier, TemporalClass } from "./temporal-personalization.js";
import { getTemporalPolicy } from "./temporal-personalization.js";

// WHAT: The deployment/use context domain a request is made in.
// WHY: Personal and enterprise contexts are governed differently
//      (ADR-0001 + ADR-0046); the resolver must never silently bridge
//      them.
export type ContextDomain = "personal" | "enterprise";

// WHAT: Machine-readable reason a context key resolved to its tier /
//        availability, WITHOUT exposing forbidden data (Q-PERS.2-γ).
// WHY: PERS.4 degraded-mode contract + the future audit manifest read
//      these reasons; they must be enumerable and leak-free.
export type EnvelopeReason =
  | "stable_identity_required"
  | "accuracy_enhancing_grant_present"
  | "accuracy_enhancing_grant_absent"
  | "optional_enrichment_grant_present"
  | "optional_enrichment_grant_absent"
  | "cross_wallet_blocked"
  | "cross_context_blocked"
  | "enterprise_policy_restricted"
  | "not_requested"
  | "unknown_context_key";

// WHAT: A scoped grant for a context key (Permission.conditions-style).
//        `wallet_id` binds the grant to a wallet so the resolver can
//        refuse cross-wallet use; `domain` binds it to a context so the
//        resolver can refuse cross-context bridging.
// WHY: Grants ride Permission.conditions JSON in the live substrate; at
//      PERS.2 the caller supplies an already-validated grant map (no DB
//      read here), keeping this resolver pure.
export interface ScopedGrant {
  readonly wallet_id: string;
  readonly domain: ContextDomain;
  readonly granted: boolean;
}

// WHAT: Canonical classification of a personalization context key.
//        `baseTier` is the tier the key defaults to; `temporalClass`
//        ties the key to a temporal-personalization class; `personalOnly`
//        marks keys that must never flow into an enterprise working set
//        without an explicit cross-context grant.
// WHY: One canonical map of which personalization signals are required
//      vs accuracy-enhancing vs optional-enrichment, and which are
//      cross-context-sensitive (Founder doctrine: no silent bridging).
interface ContextKeyClassification {
  readonly baseTier: PermissionTier;
  readonly temporalClass: TemporalClass;
  readonly personalOnly: boolean;
  readonly enterpriseOnly: boolean;
}

// WHAT: The canonical context-key registry. Keys absent here resolve to
//        `unknown_context_key` / denied_or_unavailable (fail-closed).
// WHY: Fail-closed default — an unrecognized requested context is never
//      silently granted.
const CONTEXT_KEY_REGISTRY: Readonly<
  Record<string, ContextKeyClassification>
> = Object.freeze({
  // Required stable-identity substrate (Tier 1).
  entity_id: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  wallet_id: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  entity_type: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  wallet_type: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  timezone: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  display_name: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  role: { baseTier: "required", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: true },
  // Accuracy-enhancing (Tier 2) — grant-gated.
  preferred_name: { baseTier: "accuracy_enhancing", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  locale: { baseTier: "accuracy_enhancing", temporalClass: "STABLE_IDENTITY", personalOnly: false, enterpriseOnly: false },
  location: { baseTier: "accuracy_enhancing", temporalClass: "REAL_TIME", personalOnly: true, enterpriseOnly: false },
  calendar: { baseTier: "accuracy_enhancing", temporalClass: "REAL_TIME", personalOnly: true, enterpriseOnly: false },
  contacts: { baseTier: "accuracy_enhancing", temporalClass: "REPEATED_PATTERN", personalOnly: true, enterpriseOnly: false },
  team_graph: { baseTier: "accuracy_enhancing", temporalClass: "REPEATED_PATTERN", personalOnly: false, enterpriseOnly: true },
  work_apps: { baseTier: "accuracy_enhancing", temporalClass: "REAL_TIME", personalOnly: false, enterpriseOnly: true },
  device: { baseTier: "accuracy_enhancing", temporalClass: "REAL_TIME", personalOnly: false, enterpriseOnly: false },
  routine: { baseTier: "accuracy_enhancing", temporalClass: "REPEATED_PATTERN", personalOnly: true, enterpriseOnly: false },
  conversation_style: { baseTier: "accuracy_enhancing", temporalClass: "CONTEXTUAL_PREFERENCE", personalOnly: false, enterpriseOnly: false },
  // Optional enrichment (Tier 3) — sensitive; strict grant.
  health: { baseTier: "optional_enrichment", temporalClass: "SENSITIVE_ENRICHMENT", personalOnly: true, enterpriseOnly: false },
  finance: { baseTier: "optional_enrichment", temporalClass: "SENSITIVE_ENRICHMENT", personalOnly: true, enterpriseOnly: false },
  browsing_history: { baseTier: "optional_enrichment", temporalClass: "SENSITIVE_ENRICHMENT", personalOnly: true, enterpriseOnly: false },
  precise_location: { baseTier: "optional_enrichment", temporalClass: "SENSITIVE_ENRICHMENT", personalOnly: true, enterpriseOnly: false },
  family_routine: { baseTier: "optional_enrichment", temporalClass: "SENSITIVE_ENRICHMENT", personalOnly: true, enterpriseOnly: false },
});

// WHAT: Enterprise governance defaults relevant to envelope resolution
//        (subset of OrgSettings the caller supplies when domain is
//        enterprise). Optional — absent in personal context.
// WHY: When enterprise context exists, the resolver respects
//      dept_data_isolation (cross-team restriction) without reading the
//      DB itself.
export interface EnterpriseEnvelopeDefaults {
  readonly dept_data_isolation: boolean;
  readonly audit_ai_actions: boolean;
}

// WHAT: Input to the permission-envelope resolver.
// WHY: All inputs are caller-supplied / pre-fetched so the resolver is
//      pure (no DB read) and deterministic.
export interface PermissionEnvelopeInput {
  readonly actor_entity_id: string;
  readonly wallet_id: string;
  readonly entity_type: string;
  readonly domain: ContextDomain;
  readonly requested_context: readonly string[];
  // Grants keyed by context key (Permission.conditions-style; already
  // validated by the caller). Absent grant => not granted.
  readonly grants?: Readonly<Record<string, ScopedGrant>>;
  // Enterprise defaults — supplied only when domain === "enterprise".
  readonly enterprise_defaults?: EnterpriseEnvelopeDefaults;
}

// WHAT: The resolved availability for a single context key.
// WHY: Typed availability/denial/missing per Q-PERS.2-γ; `audit_intent`
//      is metadata only (no audit literal emitted).
export interface ResolvedContextKey {
  readonly key: string;
  readonly tier: PermissionTier;
  readonly available: boolean;
  readonly reason: EnvelopeReason;
  readonly temporalClass: TemporalClass;
  readonly audit_intent: string;
}

// WHAT: The full resolved permission envelope.
// WHY: The PERS.3 buildPersonalizedWorkingSet orchestrator + PERS.4
//      degraded-mode contract consume this typed structure.
export interface PermissionEnvelope {
  readonly domain: ContextDomain;
  readonly actor_entity_id: string;
  readonly wallet_id: string;
  readonly resolved: readonly ResolvedContextKey[];
}

// WHAT: Resolve a requested personalization context into the four-tier
//        permission envelope.
// INPUT: PermissionEnvelopeInput (all caller-supplied; no DB read).
// OUTPUT: A PermissionEnvelope with one ResolvedContextKey per requested
//         key.
// WHY: Q-PERS.2-γ — the Foundation owns the decision of what context is
//      available/denied/missing; never grants cross-wallet by default;
//      never silently bridges personal and enterprise.
export function resolvePermissionEnvelope(
  input: PermissionEnvelopeInput,
): PermissionEnvelope {
  const grants = input.grants ?? {};
  const resolved: ResolvedContextKey[] = input.requested_context.map((key) => {
    const classification = CONTEXT_KEY_REGISTRY[key];

    // Fail-closed: unknown context key is never granted.
    if (classification === undefined) {
      return {
        key,
        tier: "denied_or_unavailable",
        available: false,
        reason: "unknown_context_key",
        temporalClass: "REAL_TIME",
        audit_intent: `context_key_unknown:${key}`,
      };
    }

    const policy = getTemporalPolicy(classification.temporalClass);

    // Required stable-identity substrate is always available in-domain;
    // role is enterprise-only required context.
    if (classification.baseTier === "required") {
      if (classification.enterpriseOnly && input.domain !== "enterprise") {
        return {
          key,
          tier: "denied_or_unavailable",
          available: false,
          reason: "enterprise_policy_restricted",
          temporalClass: classification.temporalClass,
          audit_intent: `enterprise_only_required_outside_enterprise:${key}`,
        };
      }
      return {
        key,
        tier: "required",
        available: true,
        reason: "stable_identity_required",
        temporalClass: classification.temporalClass,
        audit_intent: `required_substrate:${key}`,
      };
    }

    // Cross-context guard: a personal-only context requested in an
    // enterprise domain (or an enterprise-only context in a personal
    // domain) is blocked unless an explicit, domain-matching grant is
    // present. No silent bridging.
    const grant = grants[key];
    const crossContext =
      (classification.personalOnly && input.domain === "enterprise") ||
      (classification.enterpriseOnly && input.domain === "personal");

    if (crossContext) {
      const bridged =
        grant !== undefined &&
        grant.granted &&
        grant.wallet_id === input.wallet_id &&
        grant.domain === input.domain;
      if (!bridged) {
        return {
          key,
          tier: "denied_or_unavailable",
          available: false,
          reason: "cross_context_blocked",
          temporalClass: classification.temporalClass,
          audit_intent: `cross_context_blocked:${key}:${input.domain}`,
        };
      }
    }

    // Cross-wallet guard: a grant bound to a different wallet never
    // authorizes this wallet's context. No cross-wallet by default.
    if (grant !== undefined && grant.wallet_id !== input.wallet_id) {
      return {
        key,
        tier: "denied_or_unavailable",
        available: false,
        reason: "cross_wallet_blocked",
        temporalClass: classification.temporalClass,
        audit_intent: `cross_wallet_blocked:${key}`,
      };
    }

    // Enterprise policy: dept_data_isolation restricts enterprise-only
    // accuracy-enhancing context unless an in-domain grant is present.
    if (
      input.domain === "enterprise" &&
      classification.enterpriseOnly &&
      input.enterprise_defaults?.dept_data_isolation === true
    ) {
      const grantedInDomain =
        grant !== undefined &&
        grant.granted &&
        grant.wallet_id === input.wallet_id &&
        grant.domain === "enterprise";
      if (!grantedInDomain) {
        return {
          key,
          tier: "denied_or_unavailable",
          available: false,
          reason: "enterprise_policy_restricted",
          temporalClass: classification.temporalClass,
          audit_intent: `dept_data_isolation_restricted:${key}`,
        };
      }
    }

    // Grant-gated tiers: accuracy_enhancing + optional_enrichment require
    // a present, in-wallet, in-domain grant to be available.
    const granted =
      grant !== undefined &&
      grant.granted &&
      grant.wallet_id === input.wallet_id &&
      grant.domain === input.domain;

    if (classification.baseTier === "optional_enrichment") {
      return {
        key,
        tier: "optional_enrichment",
        available: granted,
        reason: granted
          ? "optional_enrichment_grant_present"
          : "optional_enrichment_grant_absent",
        temporalClass: classification.temporalClass,
        audit_intent: granted
          ? `optional_enrichment_available:${key}`
          : `optional_enrichment_unavailable:${key}`,
      };
    }

    // accuracy_enhancing
    void policy; // policy reserved for PERS.3 freshness composition
    return {
      key,
      tier: "accuracy_enhancing",
      available: granted,
      reason: granted
        ? "accuracy_enhancing_grant_present"
        : "accuracy_enhancing_grant_absent",
      temporalClass: classification.temporalClass,
      audit_intent: granted
        ? `accuracy_enhancing_available:${key}`
        : `accuracy_enhancing_unavailable:${key}`,
    };
  });

  return {
    domain: input.domain,
    actor_entity_id: input.actor_entity_id,
    wallet_id: input.wallet_id,
    resolved,
  };
}
