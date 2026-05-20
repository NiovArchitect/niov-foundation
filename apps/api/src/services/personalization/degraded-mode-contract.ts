// FILE: degraded-mode-contract.ts
// PURPOSE: Foundation-tier degraded/uncertainty truth contract for the
//          personalization-orchestration substrate (ADR-0048 Phase 3
//          Sub-Arc 3; PERS.4 per Q-PERS.4). The Foundation must not merely
//          personalize — it must truthfully disclose the STATE of every
//          context signal so apps, Otzar, and agents cannot misuse missing,
//          denied, stale, fallback, uncertain, or blocked context. This
//          module canonicalizes one degraded/uncertainty taxonomy, the
//          per-reason use policy, the downstream consumer obligations, and
//          the pure normalization that maps the scattered PERS.2 reason
//          vocabularies (EnvelopeReason + MomentDegradedReason + timezone
//          fallback/uncertain + the COE aggregate denial count) into a
//          single canonical disclosure carried by the working set.
//
//          Q-PERS.4 locks:
//            - β-1: this module lives under personalization/.
//            - ε-1: no audit literals — advisory/disclosure metadata only.
//            - ζ-1: fail-closed (session/COE failure) is a top-level
//              WorkingSetFailure, NOT a partial degraded entry.
//            - η-1: consumer obligations are declared (hallucination guard,
//              no-fallback-as-truth, disclose-uncertainty, no-blocked-use,
//              no-bridging).
//            - blind-spot locks: `stale` is DEFINED here but NOT emitted by
//              buildDegradedContract (caller moment inputs are fresh
//              in-request and carry no as-of timestamp — emitting stale
//              would be a false claim; emission is forward-substrate for a
//              freshness clock / ADR-0045 capsule-staleness integration);
//              `clearance_blocked` is aggregate (COE exposes a denial COUNT,
//              not per-capsule reasons).
//
//          AUDIENCE & DISCLOSURE TIERS (Founder doctrine, PERS.4):
//          This contract is MACHINE-FACING and FOUNDATION-FACING BY
//          DEFAULT. It is NOT a render target for end users. The fields
//          here (raw degraded reasons, dispositions, capsule-denial
//          counts, resolver failure details, repair telemetry) are for:
//            - Agents + Foundation services — consume the full machine-
//              readable truth contract so they do not hallucinate,
//              over-personalize, or misuse missing/denied/stale/fallback
//              context.
//            - Foundation / Federation administrators — deeper diagnostic
//              + audit views.
//            - Future self-repair agents — use these signals to diagnose
//              what is not working, propose safe repairs, and create an
//              audit trail.
//          End-user consumers (apps/Otzar) should surface only GRACEFUL,
//          experience-level uncertainty, and only when it improves trust
//          or actionability — never the raw Foundation/Memory Capsule
//          diagnostics above. Translating this contract into a
//          user-appropriate experience is an app/UX-layer responsibility
//          (ADR-0048 "apps compose UX"), not a Foundation behavior; this
//          module does not change behavior to enforce it.
//
// CONNECTS TO:
//   - apps/api/src/services/personalization/permission-envelope.service.ts
//     (EnvelopeReason + PermissionEnvelope normalized here)
//   - apps/api/src/services/personalization/moment-context.service.ts
//     (MomentDegradedReason + MomentContextEnvelope normalized here)
//   - apps/api/src/services/personalization/temporal-personalization.ts
//     (TemporalClass — disambiguates sensitive enrichment)
//   - apps/api/src/services/personalization/working-set.service.ts
//     (consumes buildDegradedContract + CONSUMER_OBLIGATIONS; carries the
//     contract in the working-set response)
//   - docs/architecture/decisions/0048-personalization-orchestration-substrate.md
//     (§Degraded-Mode Contract; Q-PERS.4)
//
// Pure deterministic TypeScript: no I/O, no DB, no network, no audit
// literal, no route, no Date.now(). Referentially transparent.

import type {
  EnvelopeReason,
  PermissionEnvelope,
} from "./permission-envelope.service.js";
import type {
  MomentContextEnvelope,
  MomentDegradedReason,
} from "./moment-context.service.js";
import type { TemporalClass } from "./temporal-personalization.js";

// WHAT: The canonical per-key/per-field degraded/uncertainty taxonomy
//        (13 reasons). Items the Founder enumerated as fail-closed
//        (expired_or_invalid_session, upstream_context_failure) are NOT
//        here — they are the top-level WorkingSetFailure (see
//        classifyFailClosed); the hallucination guard is a consumer
//        obligation, not a reason.
// WHY: One vocabulary so downstream consumers never have to reconcile the
//      scattered PERS.2 envelope/moment reason strings.
export type DegradedReason =
  | "permission_denied"
  | "permission_missing"
  | "integration_unavailable"
  | "not_provided"
  | "stale"
  | "fallback_used"
  | "uncertain"
  | "policy_blocked"
  | "cross_context_blocked"
  | "cross_wallet_blocked"
  | "clearance_blocked"
  | "sensitive_enrichment_blocked"
  | "needs_permission";

// WHAT: What a downstream consumer may do with a disclosed entry.
// WHY: The disposition is the actionable instruction — usable, withheld
//      (must not use/fabricate), fallback_not_truth (present but not user
//      truth), low_confidence (disclose uncertainty), or fail_closed.
export type UseDisposition =
  | "usable"
  | "withheld"
  | "fallback_not_truth"
  | "low_confidence"
  | "fail_closed";

// WHAT: The use policy attached to a degraded reason.
// WHY: Q-PERS.4-η — each reason carries an explicit, machine-readable use
//      policy so a consumer cannot guess. `must_not_fabricate` is always
//      true: no missing/withheld context may ever be invented as fact.
export interface DisclosurePolicy {
  readonly disposition: UseDisposition;
  readonly may_use_as_truth: boolean;
  readonly must_disclose_uncertainty: boolean;
  readonly may_request_permission: boolean;
  readonly must_not_fabricate: true;
}

// WHAT: The canonical use-policy table for every DegradedReason.
// INPUT: None.
// OUTPUT: A frozen Record keyed by DegradedReason.
// WHY: One canonical, immutable source of truth for how each disclosed
//      reason may be used downstream.
export const DISCLOSURE_POLICY: Readonly<
  Record<DegradedReason, DisclosurePolicy>
> = Object.freeze({
  permission_denied: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  permission_missing: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: true,
    must_not_fabricate: true,
  }),
  integration_unavailable: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  not_provided: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: false,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  stale: Object.freeze({
    disposition: "low_confidence",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  fallback_used: Object.freeze({
    disposition: "fallback_not_truth",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  uncertain: Object.freeze({
    disposition: "low_confidence",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  policy_blocked: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  cross_context_blocked: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  cross_wallet_blocked: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  clearance_blocked: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: false,
    must_not_fabricate: true,
  }),
  sensitive_enrichment_blocked: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: true,
    must_not_fabricate: true,
  }),
  needs_permission: Object.freeze({
    disposition: "withheld",
    may_use_as_truth: false,
    must_disclose_uncertainty: true,
    may_request_permission: true,
    must_not_fabricate: true,
  }),
});

// WHAT: The source surface a disclosed entry came from.
// WHY: Lets a consumer attribute a disclosure to permission resolution,
//      moment context, the timezone resolver, or the COE capsule slice.
export type DegradedSource = "permission" | "moment" | "timezone" | "capsule";

// WHAT: One canonical disclosure entry in the working set.
// WHY: Q-PERS.4 — a leak-free, machine-readable statement of what a
//      context signal's state is and how it may be used.
export interface DegradedContractEntry {
  readonly source: DegradedSource;
  readonly key: string;
  readonly reason: DegradedReason;
  readonly disposition: UseDisposition;
  readonly may_use_as_truth: boolean;
  readonly must_disclose_uncertainty: boolean;
  readonly may_request_permission: boolean;
  readonly must_not_fabricate: true;
  readonly advisory: string;
}

// WHAT: The fail-closed categories for the top-level WorkingSetFailure
//        codes (NOT degraded entries).
// WHY: ζ-1 — an invalid/expired session or an upstream COE/resolver
//      failure returns a top-level failure with zero personalization, never
//      a partial working set. Documented here for observability.
export type FailClosedCategory =
  | "expired_or_invalid_session"
  | "upstream_context_failure";

// WHAT: The downstream consumer obligations the Foundation declares.
// WHY: Q-PERS.4-η — the Foundation's duty is truthful disclosure; these
//      obligations bind any consumer (LLM, agent, app). Enforcement is the
//      consumer's responsibility (and future integration-test
//      responsibility) — the Foundation cannot police downstream behavior
//      in-process.
export const CONSUMER_OBLIGATIONS: readonly string[] = Object.freeze([
  "MUST NOT infer, invent, or fabricate missing or withheld context as fact",
  "MUST NOT present fallback-derived context as user truth",
  "MUST disclose uncertainty for low-confidence or fallback context",
  "MUST NOT use blocked context (policy / cross-context / cross-wallet / clearance / sensitive)",
  "MUST NOT silently bridge personal and enterprise context",
  "MAY request permission for needs_permission entries, but baseline function MUST continue without it",
  "MUST treat fail_closed results as zero personalization (no moment, no permissions, no capsules)",
]);

// WHAT: Look up the use policy for a degraded reason.
// INPUT: A DegradedReason.
// OUTPUT: The frozen DisclosurePolicy for that reason.
// WHY: Total over the closed DegradedReason union (the Record is keyed by
//      every member; satisfies noUncheckedIndexedAccess via the typed key).
export function disclosurePolicyFor(reason: DegradedReason): DisclosurePolicy {
  return DISCLOSURE_POLICY[reason];
}

// WHAT: Map a top-level WorkingSetFailure code to its fail-closed category.
// INPUT: A failure code string (the 6 COE/working-set codes).
// OUTPUT: The FailClosedCategory.
// WHY: ζ-1 documentation/observability — SESSION_* are session failures;
//      everything else is an upstream context failure. Either way the
//      working set is fail-closed (no partial degraded entries).
export function classifyFailClosed(code: string): FailClosedCategory {
  return code.startsWith("SESSION_")
    ? "expired_or_invalid_session"
    : "upstream_context_failure";
}

// WHAT: Normalize a permission-envelope reason into a canonical
//        DegradedReason, or null when the key is available / not degraded.
// INPUT: An EnvelopeReason + the key's TemporalClass.
// OUTPUT: A DegradedReason, or null for available/non-degraded reasons.
// WHY: Q-PERS.4 mapping lock — accuracy_enhancing_grant_absent →
//      needs_permission; unknown_context_key → permission_missing;
//      optional_enrichment_grant_absent (SENSITIVE_ENRICHMENT) →
//      sensitive_enrichment_blocked; enterprise_policy_restricted →
//      policy_blocked. Total over EnvelopeReason.
export function mapEnvelopeReason(
  reason: EnvelopeReason,
  temporalClass: TemporalClass,
): DegradedReason | null {
  switch (reason) {
    case "stable_identity_required":
    case "accuracy_enhancing_grant_present":
    case "optional_enrichment_grant_present":
    case "not_requested":
      return null; // available / required / not-requested — not degraded
    case "accuracy_enhancing_grant_absent":
      return "needs_permission";
    case "optional_enrichment_grant_absent":
      return temporalClass === "SENSITIVE_ENRICHMENT"
        ? "sensitive_enrichment_blocked"
        : "needs_permission";
    case "cross_wallet_blocked":
      return "cross_wallet_blocked";
    case "cross_context_blocked":
      return "cross_context_blocked";
    case "enterprise_policy_restricted":
      return "policy_blocked";
    case "unknown_context_key":
      return "permission_missing";
  }
}

// WHAT: Map a moment-context degraded reason into a canonical
//        DegradedReason.
// INPUT: A MomentDegradedReason.
// OUTPUT: The canonical DegradedReason (identity over the 4 values).
// WHY: The moment vocabulary is already a subset of the canonical
//      taxonomy; this keeps the normalization explicit + total.
export function mapMomentReason(
  reason: MomentDegradedReason,
): DegradedReason {
  switch (reason) {
    case "not_provided":
      return "not_provided";
    case "permission_denied":
      return "permission_denied";
    case "permission_missing":
      return "permission_missing";
    case "integration_unavailable":
      return "integration_unavailable";
  }
}

// WHAT: Build a single canonical entry from a reason + source + key.
// WHY: Attaches the use policy + a leak-free advisory string.
function entryFor(
  source: DegradedSource,
  key: string,
  reason: DegradedReason,
): DegradedContractEntry {
  const policy = disclosurePolicyFor(reason);
  return {
    source,
    key,
    reason,
    disposition: policy.disposition,
    may_use_as_truth: policy.may_use_as_truth,
    must_disclose_uncertainty: policy.must_disclose_uncertainty,
    may_request_permission: policy.may_request_permission,
    must_not_fabricate: true,
    advisory: `${source}:${key}:${reason}:${policy.disposition}`,
  };
}

// WHAT: Input to buildDegradedContract.
// WHY: All inputs are already-resolved pure structures (the resolved
//      permission envelope, the moment envelope, and the COE aggregate
//      denial count) — buildDegradedContract performs no I/O.
export interface BuildDegradedContractInput {
  readonly envelope: PermissionEnvelope;
  readonly moment: MomentContextEnvelope;
  // The COE aggregate count of capsules denied at NEGOTIATE / clearance.
  // Per the blind-spot lock this is aggregate, not per-capsule.
  readonly capsules_denied_permission: number;
}

// WHAT: Normalize all degraded signals into the canonical contract.
// INPUT: BuildDegradedContractInput.
// OUTPUT: A list of DegradedContractEntry — one per withheld permission
//         key, plus timezone fallback/uncertain, plus moment-field
//         absences and low-confidence fields, plus a single aggregate
//         clearance entry when the COE denied capsules.
// WHY: Q-PERS.4 γ-1 — the working set must truthfully tell consumers the
//      state of every signal. `stale` is intentionally NOT emitted here
//      (no as-of timestamp at build time — emitting it would be a false
//      claim; forward-substrate per the blind-spot lock).
export function buildDegradedContract(
  input: BuildDegradedContractInput,
): DegradedContractEntry[] {
  const entries: DegradedContractEntry[] = [];

  // Permission envelope: every unavailable key gets a canonical disclosure.
  for (const r of input.envelope.resolved) {
    if (r.available) continue;
    const reason = mapEnvelopeReason(r.reason, r.temporalClass);
    if (reason === null) continue;
    entries.push(entryFor("permission", r.key, reason));
  }

  // Timezone: a safe fallback is present-but-not-truth; an uncertain (but
  // non-fallback) zone is low-confidence.
  if (input.moment.timezone.fallback) {
    entries.push(entryFor("timezone", "timezone", "fallback_used"));
  } else if (input.moment.timezone.uncertain) {
    entries.push(entryFor("timezone", "timezone", "uncertain"));
  }

  // Moment fields: absences carry their typed reason; available-but-
  // uncertain fields are low-confidence. (No `stale` — see WHY above.)
  for (const f of input.moment.fields) {
    if (!f.available && f.degraded_reason !== null) {
      entries.push(entryFor("moment", f.key, mapMomentReason(f.degraded_reason)));
    } else if (f.available && f.uncertain) {
      entries.push(entryFor("moment", f.key, "uncertain"));
    }
  }

  // COE aggregate denial: one clearance/permission entry when capsules were
  // denied at NEGOTIATE / clearance (aggregate, not per-capsule).
  if (input.capsules_denied_permission > 0) {
    entries.push(entryFor("capsule", "capsules", "clearance_blocked"));
  }

  return entries;
}
