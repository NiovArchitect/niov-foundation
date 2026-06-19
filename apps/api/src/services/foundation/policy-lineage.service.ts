// FILE: policy-lineage.service.ts
// PURPOSE: F-1324 — the Policy Lineage Graph. Resolves a proof_reference (an
//          audit-chain event_hash from the F-1321 proof feed) into the CAUSAL
//          LINEAGE of that policy decision: which rules participated, which
//          constraints triggered, and the consent / grant / cohort / sensitivity
//          / access-mode / use / role context recorded at decision time.
//
//          This is the explainability substrate — WHY a decision happened. It is
//          a PROJECTION over the append-only audit row's recorded details. It is
//          NOT the policy engine internals, NOT executable policy code, NOT
//          mutable policy state. Where a state was not recorded at decision time
//          it is reported as null (UNKNOWN) — lineage is never invented.
//
// CONNECTS TO: packages/database (AuditEvent + writeAuditEvent + the marketplace
//              /cohort tables for authorization) + auth.service + governance/org +
//              apps/api/src/routes/foundation.routes.ts (GET /policy/lineage/:ref).
//
// SAFETY: role-scoped + enumeration-safe LINEAGE_NOT_FOUND. The caller must be a
// party to the decision (actor, resource provider/owner, grant party, cohort
// contributor/buyer, or same-org admin). NEVER raw private payloads, source
// memory, raw capsules, or chain secrets — only safe scalar decision context.

import { prisma, writeAuditEvent, type AuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// The canonical rule classes a lineage may surface (directive F-1324).
export type PolicyRuleClass =
  | "CONSENT_REQUIRED"
  | "CONSENT_GRANTED"
  | "CONSENT_REVOKED"
  | "HIGH_SENSITIVITY_BLOCK"
  | "USE_NOT_PERMITTED"
  | "ACCESS_MODE_BLOCKED"
  | "ROLE_FORBIDDEN"
  | "K_ANONYMITY_BLOCK"
  | "GRANT_REVOKED"
  | "GRANT_EXPIRED"
  | "PROVIDER_SCOPE_REQUIRED";

export type PolicyActorRole = "buyer" | "provider" | "contributor" | "admin";

export interface PolicyRule {
  rule_id: string;
  rule_name: string;
  rule_type: PolicyRuleClass;
  result: "PASS" | "FAIL";
  precedence: number;
  explanation: string;
}

export interface PolicyLineage {
  policy_rules: PolicyRule[];
  consent_state: string | null;
  grant_state: string | null;
  cohort_state: string | null;
  capability_state: string | null;
  sensitivity_state: string | null;
  access_mode: string | null;
  allowed_use: string | null;
  actor_role: PolicyActorRole;
  reason_codes: string[];
  enforcement_points: string[];
}

export interface PolicyLineageView {
  proof_reference: string;
  resource_type: string;
  resource_id: string | null;
  decision: string;
  decision_timestamp: string;
  lineage: PolicyLineage;
}

export type GetPolicyLineageResult =
  | { ok: true; lineage: PolicyLineageView }
  | { ok: false; code: string };

// The audit event types that ARE policy decisions and therefore have a lineage.
// A real proof_reference always comes from the F-1321 proof feed (which only
// emits these decision/evaluation literals); flooring on this set means a caller
// passing the hash of a NON-decision event they happen to own (e.g. LOGIN_SUCCESS,
// CONVERSATION_STARTED, CAPSULE_CONTENT_READ) gets LINEAGE_NOT_FOUND rather than
// an invented lineage — honoring the F-1324 "do not invent lineage" contract.
export const POLICY_DECISION_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "COHORT_ACCESS_EVALUATED",
  "COHORT_ACCESS_REQUESTED",
  "COHORT_ACCESS_DECIDED",
  "COHORT_ACCESS_REVOKED",
  "COHORT_ACCESS_EXPIRED",
  "COHORT_SIGNAL_DELIVERED",
  "COHORT_DELIVERY_SUPPRESSED",
  "COHORT_DELIVERY_DENIED",
  "COHORT_CONTRIBUTION_RECORDED",
  "COHORT_CONTRIBUTION_REVOKED",
  "MARKETPLACE_DATA_GRANT_EVALUATED",
  "MARKETPLACE_DATA_GRANT_CREATED",
  "MARKETPLACE_DATA_GRANT_REVOKED",
  "MARKETPLACE_DATA_GRANT_EXPIRED",
  "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
  "MARKETPLACE_DATA_CONSENT_RECORDED",
  "MARKETPLACE_DATA_CONSENT_EXPIRED",
  "MARKETPLACE_ACCESS_EVALUATED",
  "MARKETPLACE_DATA_ACCESS_EVALUATED",
  "HIGH_SENSITIVITY_POLICY_EVALUATED",
  "HIGH_SENSITIVITY_REVIEW_CREATED",
  "HIGH_SENSITIVITY_REVIEW_APPROVED",
  "HIGH_SENSITIVITY_REVIEW_DENIED",
  "HIGH_SENSITIVITY_REVIEW_REVOKED",
  "HIGH_SENSITIVITY_REVIEW_EXPIRED",
  "HIGH_SENSITIVITY_REVIEWER_ELIGIBILITY_EVALUATED",
  "CONSENT_REVOKED",
  "AUTHORITY_ENVELOPE_EVALUATED",
  "RETENTION_POLICY_EVALUATED",
]);

// ── Reason code → rule class (faithful map over REAL emitted reason codes). ───
export const REASON_TO_RULE: Record<string, PolicyRuleClass> = {
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  CONSENT_GRANTED: "CONSENT_GRANTED",
  CONSENT_GRANT_RECORDED: "CONSENT_GRANTED",
  MARKETPLACE_DATA_CONSENT_RECORDED: "CONSENT_GRANTED",
  CONSENT_REVOKED: "CONSENT_REVOKED",
  CONSENT_NOT_ACTIVE: "CONSENT_REVOKED",
  CONSENT_INACTIVE: "CONSENT_REVOKED",
  CONSENT_EXPIRED: "CONSENT_REVOKED",
  CONSENT_MISMATCH: "CONSENT_REVOKED",
  CONSENT_NOT_FOUND: "CONSENT_REVOKED",
  CONTRIBUTOR_WITHDREW_CONSENT: "CONSENT_REVOKED",
  MARKETPLACE_DATA_CONSENT_EXPIRED: "CONSENT_REVOKED",
  HIGH_SENSITIVITY: "HIGH_SENSITIVITY_BLOCK",
  HIGH_SENSITIVITY_DEFAULT_DENY: "HIGH_SENSITIVITY_BLOCK",
  DISCOVERY_BLOCKED_HIGH_SENSITIVITY: "HIGH_SENSITIVITY_BLOCK",
  HIGH_SENSITIVITY_REVIEW_REQUIRED: "HIGH_SENSITIVITY_BLOCK",
  USE_NOT_PERMITTED: "USE_NOT_PERMITTED",
  TRAINING_NOT_PERMITTED: "USE_NOT_PERMITTED",
  MODEL_IMPROVEMENT_NOT_PERMITTED: "USE_NOT_PERMITTED",
  INVALID_USE_RIGHT: "USE_NOT_PERMITTED",
  READ_NOT_PERMITTED: "USE_NOT_PERMITTED",
  INVALID_ACCESS_MODE: "ACCESS_MODE_BLOCKED",
  ACCESS_MODE_BLOCKED: "ACCESS_MODE_BLOCKED",
  NOT_AUTHORIZED: "ROLE_FORBIDDEN",
  ROLE_FORBIDDEN: "ROLE_FORBIDDEN",
  SELF_REVIEW_NOT_PERMITTED: "ROLE_FORBIDDEN",
  NON_HUMAN_REVIEWER_FORBIDDEN: "ROLE_FORBIDDEN",
  REVIEWER_IS_BUYER: "ROLE_FORBIDDEN",
  REVIEWER_IS_NON_HUMAN: "ROLE_FORBIDDEN",
  MINIMUM_COHORT_SIZE_NOT_MET: "K_ANONYMITY_BLOCK",
  BELOW_K_ANONYMITY_THRESHOLD: "K_ANONYMITY_BLOCK",
  GRANT_REVOKED: "GRANT_REVOKED",
  GRANT_NOT_ACTIVE: "GRANT_REVOKED",
  GRANT_EXPIRED: "GRANT_EXPIRED",
  RETENTION_EXPIRED: "GRANT_EXPIRED",
  PROVIDER_SCOPE_REQUIRED: "PROVIDER_SCOPE_REQUIRED",
  REVIEWER_NOT_PROVIDER_OWNER: "PROVIDER_SCOPE_REQUIRED",
};

const RULE_EXPLANATION: Record<PolicyRuleClass, string> = {
  CONSENT_REQUIRED: "Explicit consent is required before this access may proceed.",
  CONSENT_GRANTED: "Active consent was present for this access.",
  CONSENT_REVOKED: "Consent was revoked, inactive, expired, or absent — access terminated.",
  HIGH_SENSITIVITY_BLOCK: "High-sensitivity data triggered a default-deny / review-required gate.",
  USE_NOT_PERMITTED: "The intended use (e.g. training / model improvement / read) is not permitted by policy.",
  ACCESS_MODE_BLOCKED: "The requested access mode is not allowed for this resource.",
  ROLE_FORBIDDEN: "The caller's role is not authorized for this action.",
  K_ANONYMITY_BLOCK: "The cohort is below its minimum-size k-anonymity floor.",
  GRANT_REVOKED: "The grant is revoked or no longer active.",
  GRANT_EXPIRED: "The grant or retention window has expired.",
  PROVIDER_SCOPE_REQUIRED: "Provider-owner (or owning-org) scope is required for this action.",
};

// event_type → the enforcement point that produced the decision.
export function enforcementPointFor(eventType: string): string {
  if (eventType.startsWith("COHORT_ACCESS")) return "COHORT_ACCESS_GATE";
  if (eventType.startsWith("COHORT_SIGNAL") || eventType.startsWith("COHORT_DELIVERY")) return "COHORT_DELIVERY_GATE";
  if (eventType.startsWith("COHORT_CONTRIBUTION")) return "COHORT_CONTRIBUTION_GATE";
  if (eventType === "MARKETPLACE_DATA_GRANT_READ_EVALUATED") return "GRANT_READ_GATE";
  if (eventType.startsWith("MARKETPLACE_DATA_GRANT")) return "GRANT_GATE";
  if (eventType.startsWith("MARKETPLACE_DATA_CONSENT")) return "CONSENT_GATE";
  if (eventType === "MARKETPLACE_ACCESS_EVALUATED") return "LISTING_ACCESS_GATE";
  if (eventType.startsWith("HIGH_SENSITIVITY")) return "HIGH_SENSITIVITY_GATE";
  if (eventType === "CONSENT_REVOKED") return "CONSENT_GATE";
  if (eventType.startsWith("AUTHORITY")) return "AUTHORITY_ENVELOPE_GATE";
  if (eventType.startsWith("RETENTION")) return "RETENTION_GATE";
  return "POLICY_GATE";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export class PolicyLineageService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      return await getOrgEntityId(entityId);
    } catch {
      return null;
    }
  }

  // Resolve resource_type + resource_id from the decision event's details.
  private resourceOf(details: Record<string, unknown>, eventType: string): { type: string; id: string | null } {
    if (eventType.includes("CONTRIBUTION")) return { type: "COHORT_CONTRIBUTION", id: strOrNull(details.contribution_id) };
    if (eventType.includes("COHORT")) return { type: "COHORT", id: strOrNull(details.cohort_product_id) };
    if (eventType.includes("GRANT")) return { type: "DATA_GRANT", id: strOrNull(details.grant_id) };
    if (eventType.includes("CONSENT")) return { type: "CONSENT", id: strOrNull(details.grant_id) ?? strOrNull(details.contribution_id) };
    if (eventType.includes("LISTING") || eventType.includes("MARKETPLACE_ACCESS")) return { type: "LISTING", id: strOrNull(details.listing_id) };
    if (eventType.startsWith("HIGH_SENSITIVITY")) return { type: "POLICY", id: strOrNull(details.review_id) ?? strOrNull(details.listing_id) };
    return { type: "POLICY", id: strOrNull(details.cohort_product_id) ?? strOrNull(details.listing_id) ?? strOrNull(details.grant_id) };
  }

  // Authorize the caller as a party to this decision; return their role or null.
  private async authorizeAndRole(
    event: AuditEvent,
    details: Record<string, unknown>,
    caller: string,
    allowedOps: string[],
  ): Promise<PolicyActorRole | null> {
    const callerOrg = await this.callerOrgOrNull(caller);
    const sameOrgAdmin = (orgId: string | null): boolean =>
      orgId !== null && callerOrg !== null && callerOrg === orgId && allowedOps.includes("admin_org");

    const grantId = strOrNull(details.grant_id);
    if (grantId !== null) {
      const grant = await prisma.marketplaceDataGrant.findUnique({
        where: { grant_id: grantId },
        select: { provider_entity_id: true, buyer_entity_id: true },
      });
      if (grant !== null) {
        if (grant.provider_entity_id === caller) return "provider";
        if (grant.buyer_entity_id === caller) return "buyer";
      }
    }

    const cohortId = strOrNull(details.cohort_product_id);
    if (cohortId !== null) {
      const cohort = await prisma.cohortDataProduct.findFirst({
        where: { cohort_product_id: cohortId, deleted_at: null },
        select: { provider_entity_id: true, provider_org_entity_id: true },
      });
      if (cohort !== null) {
        if (cohort.provider_entity_id === caller) return "provider";
        if (sameOrgAdmin(cohort.provider_org_entity_id)) return "admin";
        const contribution = await prisma.cohortContribution.findFirst({
          where: { cohort_product_id: cohortId, contributor_entity_id: caller, deleted_at: null },
          select: { contribution_id: true },
        });
        if (contribution !== null) return "contributor";
        const req = await prisma.cohortAccessRequest.findFirst({
          where: { cohort_product_id: cohortId, buyer_entity_id: caller },
          select: { request_id: true },
        });
        if (req !== null) return "buyer";
      }
    }

    const listingId = strOrNull(details.listing_id);
    if (listingId !== null) {
      const listing = await prisma.marketplaceListing.findUnique({
        where: { listing_id: listingId },
        select: { provider_entity_id: true, provider_org_entity_id: true },
      });
      if (listing !== null) {
        if (listing.provider_entity_id === caller) return "provider";
        if (sameOrgAdmin(listing.provider_org_entity_id)) return "admin";
      }
    }

    // The caller performed the decision themselves → they own this proof.
    if (event.actor_entity_id === caller) {
      // Coarse role from the decision's enforcement context.
      const ep = enforcementPointFor(event.event_type);
      if (ep === "COHORT_CONTRIBUTION_GATE" || ep === "CONSENT_GATE") return "contributor";
      if (ep === "GRANT_READ_GATE" || ep === "LISTING_ACCESS_GATE") return "buyer";
      return "provider";
    }
    return null;
  }

  private collectReasonCodes(event: AuditEvent, details: Record<string, unknown>): { all: string[]; denied: Set<string> } {
    const denied = new Set<string>();
    const all: string[] = [];
    const add = (v: unknown, isDenial: boolean): void => {
      if (typeof v !== "string" || v.length === 0) return;
      if (!all.includes(v)) all.push(v);
      if (isDenial) denied.add(v);
    };
    add(event.denial_reason, true);
    if (Array.isArray(details.denied_reasons)) for (const r of details.denied_reasons) add(r, true);
    add(details.reason_code, event.outcome === "DENIED");
    add(details.intake_reason, false);
    add(details.suppression_reason, true);
    if (Array.isArray(details.reasons)) for (const r of details.reasons) add(r, false);
    return { all, denied };
  }

  private deriveRules(reasonCodes: string[], denied: Set<string>, eventType: string, outcome: string): PolicyRule[] {
    const rules: PolicyRule[] = [];
    const seen = new Set<PolicyRuleClass>();
    let precedence = 0;
    for (const code of reasonCodes) {
      const ruleType = REASON_TO_RULE[code];
      if (ruleType === undefined || seen.has(ruleType)) continue;
      seen.add(ruleType);
      const result: "PASS" | "FAIL" = ruleType === "CONSENT_GRANTED" ? "PASS" : denied.has(code) ? "FAIL" : "PASS";
      rules.push({
        rule_id: `rule:${ruleType.toLowerCase()}`,
        rule_name: ruleType,
        rule_type: ruleType,
        result,
        precedence: precedence++,
        explanation: RULE_EXPLANATION[ruleType],
      });
    }
    // If no reason mapped, surface the enforcement-point rule reflecting outcome.
    if (rules.length === 0) {
      const ep = enforcementPointFor(eventType);
      rules.push({
        rule_id: `gate:${ep.toLowerCase()}`,
        rule_name: ep,
        rule_type: outcome === "DENIED" ? "ROLE_FORBIDDEN" : "CONSENT_GRANTED",
        result: outcome === "DENIED" ? "FAIL" : "PASS",
        precedence: 0,
        explanation: `Decision produced at the ${ep} with outcome ${outcome}; no granular reason codes were recorded.`,
      });
    }
    return rules;
  }

  private deriveStates(
    details: Record<string, unknown>,
    reasonCodes: string[],
    eventType: string,
  ): Pick<PolicyLineage, "consent_state" | "grant_state" | "cohort_state" | "capability_state" | "sensitivity_state" | "access_mode" | "allowed_use"> {
    const has = (c: string): boolean => reasonCodes.includes(c);
    const consentState =
      has("CONSENT_REVOKED") || has("CONSENT_NOT_ACTIVE") || has("CONSENT_INACTIVE") || has("CONTRIBUTOR_WITHDREW_CONSENT") ? "REVOKED"
        : has("CONSENT_EXPIRED") || has("MARKETPLACE_DATA_CONSENT_EXPIRED") ? "EXPIRED"
          : has("CONSENT_REQUIRED") ? "REQUIRED"
            : has("CONSENT_GRANTED") || has("CONSENT_GRANT_RECORDED") || details.has_consent === true ? "GRANTED"
              : null;
    const statusStr = strOrNull(details.status);
    const grantState = eventType.includes("GRANT") ? statusStr : null;
    const cohortState = eventType.includes("COHORT")
      ? (typeof details.threshold_met === "boolean" ? (details.threshold_met ? "THRESHOLD_MET" : "THRESHOLD_NOT_MET") : statusStr)
      : null;
    const sensitivityState =
      strOrNull(details.sensitivity_class) ??
      (reasonCodes.some((c) => c.startsWith("HIGH_SENSITIVITY")) ? "HIGH_SENSITIVITY" : null);
    return {
      consent_state: consentState,
      grant_state: grantState,
      cohort_state: cohortState,
      // Not recorded by these decision events — honestly UNKNOWN (never invented).
      capability_state: null,
      sensitivity_state: sensitivityState,
      access_mode: strOrNull(details.access_mode) ?? strOrNull(details.requested_access_mode),
      allowed_use: strOrNull(details.intended_use),
    };
  }

  // WHAT: resolve a proof_reference into its policy decision lineage.
  // INPUT: session token + proof_reference (an audit event_hash).
  // OUTPUT: a SAFE, role-scoped PolicyLineageView. WHY: GET /policy/lineage/:ref.
  async getPolicyLineageForCaller(
    sessionToken: string,
    proofReference: string,
  ): Promise<GetPolicyLineageResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };

    if (typeof proofReference !== "string" || proofReference.length === 0)
      return { ok: false, code: "LINEAGE_NOT_FOUND" };

    const event = await prisma.auditEvent.findFirst({ where: { event_hash: proofReference } });
    if (event === null) return { ok: false, code: "LINEAGE_NOT_FOUND" };
    // Decision-event floor: a non-decision event has no lineage to project.
    // Enumeration-safe (same code as not-found) so it leaks nothing.
    if (!POLICY_DECISION_EVENT_TYPES.has(event.event_type))
      return { ok: false, code: "LINEAGE_NOT_FOUND" };

    const details = asRecord(event.details);
    const role = await this.authorizeAndRole(event, details, v.entity_id, v.allowed_operations);
    if (role === null) return { ok: false, code: "LINEAGE_NOT_FOUND" }; // enumeration-safe

    const { all: reasonCodes, denied } = this.collectReasonCodes(event, details);
    const rules = this.deriveRules(reasonCodes, denied, event.event_type, event.outcome);
    const states = this.deriveStates(details, reasonCodes, event.event_type);
    const resource = this.resourceOf(details, event.event_type);
    const decision = strOrNull(details.decision) ?? event.outcome;

    await writeAuditEvent({
      event_type: "POLICY_LINEAGE_VIEWED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      details: {
        action: "POLICY_LINEAGE_VIEWED",
        proof_reference: proofReference,
        resource_type: resource.type,
        resource_id: resource.id,
        decision,
        viewer_role: role,
        rule_class_count: rules.length,
      },
    });

    const lineage: PolicyLineageView = {
      proof_reference: proofReference,
      resource_type: resource.type,
      resource_id: resource.id,
      decision,
      decision_timestamp: event.timestamp.toISOString(),
      lineage: {
        policy_rules: rules,
        ...states,
        actor_role: role,
        reason_codes: reasonCodes,
        enforcement_points: [enforcementPointFor(event.event_type)],
      },
    };
    return { ok: true, lineage };
  }
}
