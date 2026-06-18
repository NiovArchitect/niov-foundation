// FILE: federation-cloud-cohort.service.ts
// PURPOSE: Phase 1305-A — Federation Cloud COHORT DATA PRODUCT SUBSTRATE.
//          The governed registry + policy-evaluation substrate for DMW data
//          COHORTS as a future Federation Cloud product class
//          (privacy-preserving aggregate / depersonalized signals composed from
//          many governed DMW / Capsule scopes). This is the BACKEND substrate
//          only — there is NO cohort UI, NO real signal delivery, NO real
//          contributors, NO real settlement, NO fake privacy math
//          (k-anonymity / differential privacy are NOT implemented or implied),
//          and NO fake buyer demand / monetization in 1305-A.
//
//          A CohortDataProduct is an entity-owned governed registry entry. The
//          policy evaluator returns a STRUCTURED, HONEST decision
//          (ALLOW_EVALUATION / REVIEW_REQUIRED / DENIED) plus a policy snapshot;
//          it NEVER returns data. Governance is non-negotiable: consent / opt-in
//          / proof / revocation are forced true; raw_body_excluded is forced
//          true (no raw data ever); training / model-improvement /
//          redistribution / commercial use default false; minimum_cohort_size
//          >= 50; threshold_enforced is reported FALSE (no CohortContribution in
//          1305-A — nothing is enforced against real contributors);
//          HIGH_SENSITIVITY routes to REVIEW_REQUIRED; a CHILDREN sensitive
//          category is DENIED outright.
//
// CONNECTS TO:
//   - packages/database CohortDataProduct model + prisma + writeAuditEvent
//     (literals COHORT_PRODUCT_REGISTERED / _UPDATED / _ARCHIVED /
//     COHORT_ACCESS_EVALUATED).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/services/governance/org.js (getOrgEntityId) — tenant scope.
//   - apps/api/src/routes/cohort.routes.ts — the HTTP surface.
//
// SAFETY: tenant-scoped (cross-org isolation); enumeration-safe
// COHORT_PRODUCT_NOT_FOUND; provider is always the caller (no spoofing);
// SAFE projection (no provider internals beyond the registry fields, never raw
// data, never contributor identities/counts); audit details carry IDs /
// closed-vocab enums / booleans only. Forward-substrate: CohortContribution /
// AccessGrant / UsageLedger / Proof + real aggregation are explicitly NOT here.

import {
  prisma,
  writeAuditEvent,
  type CohortDataProduct,
  type CohortProductStatus,
  type DataSensitivityClass,
  type MarketplaceDiscoveryScope,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// ── Closed vocabularies (service-tier validated; not Prisma enums so the
// category vocabulary can evolve without a schema change). ──────────────────

// Cohort kinds (matches the schema comment vocabulary).
export const COHORT_TYPES = [
  "CONSUMER_BEHAVIOR",
  "PERSONAL_AI",
  "WEARABLE_AMBIENT",
  "ENTERPRISE_WORKFLOW",
  "AGENT_DEVICE_TRANSACTION",
  "GAME_WORLD_APP",
  "LLM_TOOL_EVALUATION",
  "HEALTH_WELLNESS_AGGREGATE",
  "CUSTOM",
] as const;

// Cohort access modes — AGGREGATE / DEPERSONALIZED / PROOF only. Raw,
// per-individual, retrieval-query, and capsule-bundle modes are intentionally
// ABSENT: a cohort never exposes raw or per-contributor data.
export const COHORT_ACCESS_MODES = [
  "AGGREGATED_SIGNAL",
  "DEPERSONALIZED_SIGNAL",
  "PROOF_ONLY",
] as const;

// Allowed downstream uses (closed vocab). TRAINING / MODEL_IMPROVEMENT are
// listable but gated by the per-product boolean flags (default false).
export const COHORT_ALLOWED_USES = [
  "ANALYTICS",
  "PERSONALIZATION",
  "EVALUATION",
  "RESEARCH",
  "APP_FEATURE",
  "AGENT_RUNTIME",
  "LLM_CONTEXT",
  "MARKETPLACE_SERVICE",
  "TRAINING",
  "MODEL_IMPROVEMENT",
] as const;

// Sensitive-category vocabulary. CHILDREN is a hard block in the evaluator.
export const COHORT_SENSITIVE_CATEGORIES = [
  "CHILDREN",
  "HEALTH",
  "MEDICAL",
  "BIOMETRIC",
  "GENETIC",
  "FINANCIAL",
  "PRECISE_LOCATION",
  "RELIGION",
  "POLITICAL",
  "SEXUAL_ORIENTATION",
  "BYSTANDER",
] as const;

export const COHORT_SENSITIVITY_CLASSES = [
  "STANDARD",
  "SENSITIVE",
  "HIGH_SENSITIVITY",
] as const;

// Lifecycle statuses a provider may set. ARCHIVED is the soft-retire (also sets
// deleted_at). PRIVATE is the default discovery reach; CROSS_ORG is opt-in and
// STANDARD-only (PUBLIC org-less reach is forward-substrate, refused here).
export const COHORT_PRODUCT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
] as const;
export const COHORT_DISCOVERY_SCOPES = ["PRIVATE", "CROSS_ORG"] as const;

// Minimum group size floor (stored, NOT enforced against real contributors in
// 1305-A — there is no CohortContribution table yet).
export const COHORT_MIN_SIZE_FLOOR = 50;

// ── SAFE projection ─────────────────────────────────────────────────────────

export interface SafeCohortView {
  cohort_product_id: string;
  listing_id: string | null;
  provider_entity_id: string;
  title: string;
  description: string;
  cohort_type: string;
  capsule_type_allowlist: string[];
  access_modes: string[];
  allowed_uses: string[];
  sensitivity_class: DataSensitivityClass;
  sensitive_categories: string[];
  minimum_cohort_size: number;
  consent_required: boolean;
  opt_in_required: boolean;
  revocation_supported: boolean;
  proof_required: boolean;
  raw_body_excluded: boolean;
  training_allowed: boolean;
  model_improvement_allowed: boolean;
  redistribution_allowed: boolean;
  commercial_use_allowed: boolean;
  retention_policy: string | null;
  pricing_model: unknown;
  metering_unit: string | null;
  status: CohortProductStatus;
  discovery_scope: MarketplaceDiscoveryScope;
  created_at: string;
  // 1305-A honesty markers — always present so consumers never assume a live
  // cohort: no real contributors are counted, no real signal is delivered.
  threshold_enforced: false;
  signal_available: false;
}

// WHAT: Project a registry row to its SAFE, no-leak view.
// WHY: never exposes provider org internals, contributor identities/counts, raw
//      bodies, revenue_share_policy, or deleted_at. pricing_model is advisory
//      shape only (no settlement).
function toSafeCohort(c: CohortDataProduct): SafeCohortView {
  return {
    cohort_product_id: c.cohort_product_id,
    listing_id: c.listing_id,
    provider_entity_id: c.provider_entity_id,
    title: c.title,
    description: c.description,
    cohort_type: c.cohort_type,
    capsule_type_allowlist: c.capsule_type_allowlist,
    access_modes: c.access_modes,
    allowed_uses: c.allowed_uses,
    sensitivity_class: c.sensitivity_class,
    sensitive_categories: c.sensitive_categories,
    minimum_cohort_size: c.minimum_cohort_size,
    consent_required: c.consent_required,
    opt_in_required: c.opt_in_required,
    revocation_supported: c.revocation_supported,
    proof_required: c.proof_required,
    raw_body_excluded: c.raw_body_excluded,
    training_allowed: c.training_allowed,
    model_improvement_allowed: c.model_improvement_allowed,
    redistribution_allowed: c.redistribution_allowed,
    commercial_use_allowed: c.commercial_use_allowed,
    retention_policy: c.retention_policy,
    pricing_model: c.pricing_model,
    metering_unit: c.metering_unit,
    status: c.status,
    discovery_scope: c.discovery_scope,
    created_at: c.created_at.toISOString(),
    threshold_enforced: false,
    signal_available: false,
  };
}

// ── Pure policy evaluator (no I/O — unit-testable in isolation) ─────────────

export type CohortAccessOutcome =
  | "ALLOW_EVALUATION"
  | "REVIEW_REQUIRED"
  | "DENIED";

export interface CohortAccessRequest {
  requested_use: string;
  requested_access_mode: string;
}

export interface CohortPolicySnapshot {
  consent_required: boolean;
  opt_in_required: boolean;
  proof_required: boolean;
  revocation_supported: boolean;
  raw_body_excluded: boolean;
  training_allowed: boolean;
  model_improvement_allowed: boolean;
  redistribution_allowed: boolean;
  commercial_use_allowed: boolean;
  minimum_cohort_size: number;
  // Literal false — no CohortContribution in 1305-A, so the size floor is NOT
  // enforced against real contributors.
  threshold_enforced: false;
}

export interface CohortAccessDecision {
  decision: CohortAccessOutcome;
  reasons: string[];
  policy: CohortPolicySnapshot;
  // Literal false — 1305-A delivers NO real cohort signal under any decision.
  signal_delivered: false;
}

// WHAT: Decide, honestly, what a request against a cohort product may do.
// INPUT: the registry row + the requested use / access mode.
// OUTPUT: a structured decision + the governing policy snapshot. NEVER data.
// WHY: the governed evaluator the future Federation Cloud cohort exchange will
//      compose. In 1305-A it is registry/evaluation only — ALLOW_EVALUATION
//      means "the request is admissible in principle", not "here is a signal".
export function evaluateCohortPolicy(
  product: CohortDataProduct,
  request: CohortAccessRequest,
): CohortAccessDecision {
  const policy: CohortPolicySnapshot = {
    consent_required: product.consent_required,
    opt_in_required: product.opt_in_required,
    proof_required: product.proof_required,
    revocation_supported: product.revocation_supported,
    raw_body_excluded: product.raw_body_excluded,
    training_allowed: product.training_allowed,
    model_improvement_allowed: product.model_improvement_allowed,
    redistribution_allowed: product.redistribution_allowed,
    commercial_use_allowed: product.commercial_use_allowed,
    minimum_cohort_size: product.minimum_cohort_size,
    threshold_enforced: false,
  };
  const deny = (reason: string): CohortAccessDecision => ({
    decision: "DENIED",
    reasons: [reason],
    policy,
    signal_delivered: false,
  });

  // Hard block: children's data is never offered for cohort access.
  if (product.sensitive_categories.includes("CHILDREN"))
    return deny("CHILDREN_DATA_BLOCKED");

  // High-sensitivity routes to human review, never auto-allow.
  if (product.sensitivity_class === "HIGH_SENSITIVITY")
    return {
      decision: "REVIEW_REQUIRED",
      reasons: ["HIGH_SENSITIVITY_REVIEW_REQUIRED"],
      policy,
      signal_delivered: false,
    };

  // Only an ACTIVE product is offered for evaluation.
  if (product.status !== "ACTIVE") return deny("COHORT_NOT_ACTIVE");

  // The access mode must be one the provider actually offers.
  if (!product.access_modes.includes(request.requested_access_mode))
    return deny("ACCESS_MODE_NOT_OFFERED");

  // The use must be one the provider permits.
  if (!product.allowed_uses.includes(request.requested_use))
    return deny("USE_NOT_PERMITTED");

  // Training / model-improvement need the explicit per-product flag.
  if (request.requested_use === "TRAINING" && !product.training_allowed)
    return deny("TRAINING_NOT_PERMITTED");
  if (
    request.requested_use === "MODEL_IMPROVEMENT" &&
    !product.model_improvement_allowed
  )
    return deny("MODEL_IMPROVEMENT_NOT_PERMITTED");

  // Admissible in principle — but 1305-A delivers no real signal.
  return {
    decision: "ALLOW_EVALUATION",
    reasons: ["EVALUATION_ONLY_NO_SIGNAL"],
    policy,
    signal_delivered: false,
  };
}

// ── Result types ────────────────────────────────────────────────────────────

export type RegisterCohortResult =
  | { ok: true; cohort: SafeCohortView }
  | { ok: false; code: string };
export type ListCohortsResult =
  | { ok: true; cohorts: SafeCohortView[] }
  | { ok: false; code: string };
export type GetCohortResult =
  | { ok: true; cohort: SafeCohortView }
  | { ok: false; code: string };
export type UpdateCohortStatusResult =
  | { ok: true; cohort: SafeCohortView }
  | { ok: false; code: string };
export type EvaluateCohortAccessResult =
  | { ok: true; cohort_product_id: string; access: CohortAccessDecision }
  | { ok: false; code: string };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export class FederationCloudCohortService {
  constructor(private readonly authService: AuthService) {}

  // Resolve the caller's org parent, or null for a personal DMW (self-as-org).
  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: Register a cohort data product (the caller is always the provider).
  // WHY: POST /api/v1/foundation/cohorts. Governance flags are forced safe;
  //      monetization-affecting flags default false; no real signal is created.
  async registerCohortForCaller(
    sessionToken: string,
    input: {
      title: string;
      description: string;
      cohort_type: string;
      capsule_type_allowlist?: unknown;
      access_modes?: unknown;
      allowed_uses?: unknown;
      sensitivity_class?: string;
      sensitive_categories?: unknown;
      minimum_cohort_size?: unknown;
      retention_policy?: string;
      pricing_model?: unknown;
      metering_unit?: string;
      training_allowed?: unknown;
      model_improvement_allowed?: unknown;
      redistribution_allowed?: unknown;
      commercial_use_allowed?: unknown;
      discovery_scope?: string;
      status?: string;
    },
  ): Promise<RegisterCohortResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    if (
      typeof input.title !== "string" ||
      input.title.trim().length === 0 ||
      typeof input.description !== "string"
    )
      return { ok: false, code: "INVALID_REQUEST" };

    if (!(COHORT_TYPES as readonly string[]).includes(input.cohort_type))
      return { ok: false, code: "INVALID_COHORT_TYPE" };

    const sensitivityClass: DataSensitivityClass =
      input.sensitivity_class === "SENSITIVE" ||
      input.sensitivity_class === "HIGH_SENSITIVITY"
        ? (input.sensitivity_class as DataSensitivityClass)
        : "STANDARD";

    // Closed-vocab arrays — reject any out-of-vocab member (no silent drop on a
    // registration; the provider should know exactly what was registered).
    const accessModes = isStringArray(input.access_modes)
      ? input.access_modes
      : [];
    for (const m of accessModes)
      if (!(COHORT_ACCESS_MODES as readonly string[]).includes(m))
        return { ok: false, code: "INVALID_ACCESS_MODE" };

    const allowedUses = isStringArray(input.allowed_uses)
      ? input.allowed_uses
      : [];
    for (const u of allowedUses)
      if (!(COHORT_ALLOWED_USES as readonly string[]).includes(u))
        return { ok: false, code: "INVALID_USE_RIGHT" };

    const sensitiveCategories = isStringArray(input.sensitive_categories)
      ? input.sensitive_categories
      : [];
    for (const s of sensitiveCategories)
      if (!(COHORT_SENSITIVE_CATEGORIES as readonly string[]).includes(s))
        return { ok: false, code: "INVALID_SENSITIVE_CATEGORY" };

    const capsuleTypeAllowlist = isStringArray(input.capsule_type_allowlist)
      ? input.capsule_type_allowlist
      : [];

    // Minimum group size floor.
    let minimumCohortSize = COHORT_MIN_SIZE_FLOOR;
    if (input.minimum_cohort_size !== undefined) {
      if (
        typeof input.minimum_cohort_size !== "number" ||
        !Number.isInteger(input.minimum_cohort_size) ||
        input.minimum_cohort_size < COHORT_MIN_SIZE_FLOOR
      )
        return { ok: false, code: "INVALID_COHORT_SIZE" };
      minimumCohortSize = input.minimum_cohort_size;
    }

    const status: CohortProductStatus =
      input.status === "ACTIVE" ||
      input.status === "PAUSED" ||
      input.status === "ARCHIVED"
        ? (input.status as CohortProductStatus)
        : "DRAFT";

    // Discovery reach: CROSS_ORG is STANDARD-only (a sensitive/high-sensitivity
    // cohort is never cross-org discoverable). PUBLIC reach is forward-substrate.
    let discoveryScope: MarketplaceDiscoveryScope = "PRIVATE";
    if (input.discovery_scope !== undefined) {
      if (!(COHORT_DISCOVERY_SCOPES as readonly string[]).includes(input.discovery_scope))
        return { ok: false, code: "INVALID_DISCOVERY_SCOPE" };
      if (input.discovery_scope === "CROSS_ORG" && sensitivityClass !== "STANDARD")
        return { ok: false, code: "DISCOVERY_BLOCKED_HIGH_SENSITIVITY" };
      discoveryScope = input.discovery_scope as MarketplaceDiscoveryScope;
    }

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const created = await prisma.cohortDataProduct.create({
      data: {
        provider_entity_id: validation.entity_id,
        provider_org_entity_id: orgEntityId,
        title: input.title,
        description: input.description,
        cohort_type: input.cohort_type,
        capsule_type_allowlist: capsuleTypeAllowlist,
        access_modes: accessModes,
        allowed_uses: allowedUses,
        sensitivity_class: sensitivityClass,
        sensitive_categories: sensitiveCategories,
        minimum_cohort_size: minimumCohortSize,
        // Governance is non-negotiable in 1305-A — forced safe regardless of input.
        consent_required: true,
        opt_in_required: true,
        revocation_supported: true,
        proof_required: true,
        raw_body_excluded: true,
        // Monetization-affecting rights default OFF; opt-in true only.
        training_allowed: input.training_allowed === true,
        model_improvement_allowed: input.model_improvement_allowed === true,
        redistribution_allowed: input.redistribution_allowed === true,
        commercial_use_allowed: input.commercial_use_allowed === true,
        retention_policy:
          typeof input.retention_policy === "string"
            ? input.retention_policy
            : null,
        pricing_model: (input.pricing_model ?? {}) as never,
        metering_unit:
          typeof input.metering_unit === "string" ? input.metering_unit : null,
        status,
        discovery_scope: discoveryScope,
      },
    });

    await writeAuditEvent({
      event_type: "COHORT_PRODUCT_REGISTERED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "COHORT_PRODUCT_REGISTERED",
        cohort_product_id: created.cohort_product_id,
        cohort_type: created.cohort_type,
        sensitivity_class: created.sensitivity_class,
        access_mode_count: created.access_modes.length,
        allowed_use_count: created.allowed_uses.length,
        has_sensitive_categories: created.sensitive_categories.length > 0,
        training_allowed: created.training_allowed,
        commercial_use_allowed: created.commercial_use_allowed,
        status: created.status,
        discovery_scope: created.discovery_scope,
        threshold_enforced: false,
      },
    });

    return { ok: true, cohort: toSafeCohort(created) };
  }

  // WHAT: List cohort products — the caller's own + ACTIVE in their org.
  // WHY: GET /api/v1/foundation/cohorts. Tenant-scoped (cross-org isolation).
  async listCohortsForCaller(
    sessionToken: string,
    filter?: { cohort_type?: string },
  ): Promise<ListCohortsResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);

    const typeFilter =
      filter?.cohort_type !== undefined &&
      (COHORT_TYPES as readonly string[]).includes(filter.cohort_type)
        ? { cohort_type: filter.cohort_type }
        : {};

    const rows = await prisma.cohortDataProduct.findMany({
      where: {
        deleted_at: null,
        ...typeFilter,
        OR: [
          { provider_entity_id: validation.entity_id },
          ...(orgEntityId !== null
            ? [
                {
                  status: "ACTIVE" as CohortProductStatus,
                  provider_org_entity_id: orgEntityId,
                },
              ]
            : []),
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { ok: true, cohorts: rows.map(toSafeCohort) };
  }

  // WHAT: Read one cohort product (own, or ACTIVE in the caller's org).
  // WHY: GET /api/v1/foundation/cohorts/:id. Enumeration-safe — a non-visible
  //      or missing product returns the same COHORT_PRODUCT_NOT_FOUND.
  async getCohortForCaller(
    sessionToken: string,
    cohortProductId: string,
  ): Promise<GetCohortResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);

    const row = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (row === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };
    const ownedByCaller = row.provider_entity_id === validation.entity_id;
    const visibleInOrg =
      orgEntityId !== null &&
      row.provider_org_entity_id === orgEntityId &&
      row.status === "ACTIVE";
    if (!ownedByCaller && !visibleInOrg)
      return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };
    return { ok: true, cohort: toSafeCohort(row) };
  }

  // WHAT: Provider-only lifecycle transition (DRAFT/ACTIVE/PAUSED/ARCHIVED).
  // WHY: PATCH /api/v1/foundation/cohorts/:id/status. ARCHIVED soft-retires
  //      (sets deleted_at per RULE 10 — the row is never hard-deleted).
  async updateCohortStatusForCaller(
    sessionToken: string,
    cohortProductId: string,
    status: string,
  ): Promise<UpdateCohortStatusResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    if (!(COHORT_PRODUCT_STATUSES as readonly string[]).includes(status))
      return { ok: false, code: "INVALID_STATUS" };
    const nextStatus = status as CohortProductStatus;

    // Provider-only + enumeration-safe.
    const row = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (row === null || row.provider_entity_id !== validation.entity_id)
      return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const archiving = nextStatus === "ARCHIVED";
    const updated = await prisma.cohortDataProduct.update({
      where: { cohort_product_id: cohortProductId },
      data: {
        status: nextStatus,
        ...(archiving ? { deleted_at: new Date() } : {}),
      },
    });

    await writeAuditEvent({
      event_type: archiving ? "COHORT_PRODUCT_ARCHIVED" : "COHORT_PRODUCT_UPDATED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: archiving ? "COHORT_PRODUCT_ARCHIVED" : "COHORT_PRODUCT_UPDATED",
        cohort_product_id: updated.cohort_product_id,
        previous_status: row.status,
        status: updated.status,
        soft_deleted: archiving,
      },
    });

    return { ok: true, cohort: toSafeCohort(updated) };
  }

  // WHAT: Evaluate a (use, access_mode) request against a cohort product.
  // WHY: POST /api/v1/foundation/cohorts/:id/evaluate. Returns a STRUCTURED
  //      decision + policy snapshot, NEVER data. 1305-A delivers no real signal
  //      under any decision (signal_delivered=false).
  async evaluateCohortAccessForCaller(
    sessionToken: string,
    cohortProductId: string,
    request: { requested_use?: string; requested_access_mode?: string },
  ): Promise<EvaluateCohortAccessResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    if (
      typeof request.requested_use !== "string" ||
      typeof request.requested_access_mode !== "string"
    )
      return { ok: false, code: "INVALID_REQUEST" };

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const row = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: cohortProductId, deleted_at: null },
    });
    if (row === null) return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };
    const ownedByCaller = row.provider_entity_id === validation.entity_id;
    const visibleInOrg =
      orgEntityId !== null &&
      row.provider_org_entity_id === orgEntityId &&
      row.status === "ACTIVE";
    if (!ownedByCaller && !visibleInOrg)
      return { ok: false, code: "COHORT_PRODUCT_NOT_FOUND" };

    const access = evaluateCohortPolicy(row, {
      requested_use: request.requested_use,
      requested_access_mode: request.requested_access_mode,
    });

    await writeAuditEvent({
      event_type: "COHORT_ACCESS_EVALUATED",
      outcome: access.decision === "DENIED" ? "DENIED" : "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "COHORT_ACCESS_EVALUATED",
        cohort_product_id: row.cohort_product_id,
        decision: access.decision,
        reasons: access.reasons,
        requested_use: request.requested_use,
        requested_access_mode: request.requested_access_mode,
        signal_delivered: false,
        threshold_enforced: false,
      },
    });

    return { ok: true, cohort_product_id: row.cohort_product_id, access };
  }
}
