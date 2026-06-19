// FILE: marketplace.service.ts
// PURPOSE: Phase 1292-A — Foundation MARKETPLACE SUBSTRATE. The governed
//          registry + access/transaction substrate that future agents,
//          devices, applications, games, SaaS, worlds, and services use to
//          list, discover, govern access to, meter, and (mock-only) transact
//          capabilities. NOT a consumer marketplace UI — the governed registry
//          and transaction substrate underneath one.
//
//          A MarketplaceListing is an entity-owned governed listing (AGENT /
//          SKILL / TOOL / DEVICE / APP / WORLD / CONNECTOR / SERVICE). Access
//          is decided by Foundation: can_discover / can_use / can_request /
//          can_pay / requires_approval — composing the 1288-B authority
//          envelope (the consumer's authority + memory scope) and the 1290-A
//          spend-policy (mock-only economics). No unauthorized entity can use a
//          listing; an app/world/service listing never bypasses authority;
//          listing access never silently grants capsule access; settlement is
//          mock-only (no real funds/provider). Tenant-scoped: the default
//          discovery surface (listListingsForCaller) is confined to the caller's
//          org + their own listings.
//
//          Phase 1301-A adds an OPT-IN cross-org discovery catalog: a provider
//          may flip a PUBLISHED listing's discovery_scope to CROSS_ORG to make
//          its SAFE metadata projection browsable by other orgs
//          (discoverListingsForCaller). It is metadata-only — never a grant,
//          never raw content, never a capsule/consent/quote touch. High-
//          sensitivity data packages can NEVER be cross-org (set-time + read-
//          time enforced). PUBLIC (org-less open reach) remains forward-
//          substrate; there is no default public exposure.
//
// CONNECTS TO:
//   - packages/database MarketplaceListing model + prisma + writeAuditEvent.
//   - apps/api/src/services/foundation/authority.service.ts
//     (computeAuthorityEnvelope — consumer authority + memory_scope).
//   - apps/api/src/services/foundation/economic-policy.service.ts
//     (evaluateSpendPolicy — mock-only marketplace payment decision).
//   - apps/api/src/services/billing/usage-meter.service.ts (per-listing meter).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY: tenant-scoped (cross-org isolation); enumeration-safe
// LISTING_NOT_FOUND; listing access composes (never bypasses) authority +
// memory scope; payment is mock-only via 1290-A (real_provider_enabled false);
// SAFE projection (no provider internals beyond the listing fields). Memory
// note: a listing's required_memory_scope is advisory — actual capsule access
// still requires an explicit COSMP permission, never granted by a listing.

import {
  prisma,
  writeAuditEvent,
  type Entity,
  type MarketplaceListing,
  type MarketplaceListingType,
  type MarketplaceListingStatus,
  type MarketplaceDiscoveryScope,
  type MarketplaceDataPackage,
  type DataAccessMode,
  type DataSensitivityClass,
  type MarketplaceDataGrant,
  type MarketplaceDataGrantStatus,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { computeAuthorityEnvelope } from "./authority.service.js";
import { evaluateSpendPolicy } from "./economic-policy.service.js";
import {
  evaluateHighSensitivityAccess,
  isHighSensitivityPackage,
} from "./high-sensitivity-policy.js";
// Canonical home of POLICY_GATED_CATEGORIES is the pure policy module; re-export
// here so existing importers (data-delivery, the @niov/api barrel) are stable.
export { POLICY_GATED_CATEGORIES } from "./high-sensitivity-policy.js";
import {
  resolveReviewDecisionForGrantRead,
  REVIEW_GATE_REASONS,
} from "./high-sensitivity-review.service.js";
import { evaluateRetentionPolicy } from "./retention-policy.service.js";
import { recordUsageForOrg } from "../billing/usage-meter.service.js";

export const MARKETPLACE_LISTING_TYPES = [
  "AGENT",
  "SKILL",
  "TOOL",
  "DEVICE",
  "APP",
  "WORLD",
  "CONNECTOR",
  "SERVICE",
] as const;

const LISTING_ACCESS_METER = "meter.marketplace-access-evaluations.v1";
const DATA_ACCESS_METER = "meter.marketplace-data-access-evaluations.v1";

// Phase 1292-A data marketplace — how a buyer may access the data product.
export const DATA_ACCESS_MODES = [
  "PROOF_ONLY",
  "SAFE_PROJECTION",
  "RETRIEVAL_QUERY",
  "CAPSULE_REFERENCE",
  "AGGREGATED_SIGNAL",
  "DEPERSONALIZED_SIGNAL",
  "MEMORY_CAPSULE_BUNDLE",
  "LLM_CONTEXT_ACCESS",
  "APP_WORLD_PERSONALIZATION",
] as const;

// Closed-vocab allowed-use rights for a data product. The four "elevated"
// rights (TRAINING / MODEL_IMPROVEMENT / RESEARCH-commercial / REDISTRIBUTION)
// are denied by default and require explicit per-package opt-in booleans.
export const DATA_USE_RIGHTS = [
  "APP_FEATURE",
  "AGENT_RUNTIME",
  "TOOL_RUNTIME",
  "LLM_CONTEXT",
  "ANALYTICS",
  "PERSONALIZATION",
  "EVALUATION",
  "TRAINING",
  "MODEL_IMPROVEMENT",
  "RESEARCH",
  "MARKETPLACE_SERVICE",
] as const;
export type DataUseRight = (typeof DATA_USE_RIGHTS)[number];

export const DATA_SENSITIVITY_CLASSES = [
  "STANDARD",
  "SENSITIVE",
  "HIGH_SENSITIVITY",
] as const;

const DATA_GRANT_METER = "meter.marketplace-data-grants.v1";

export interface SafeDataPackageView {
  data_package_id: string;
  listing_id: string;
  provider_entity_id: string;
  provider_org_entity_id: string | null;
  access_mode: DataAccessMode;
  capsule_type_allowlist: string[];
  allowed_use: string[];
  consent_required: boolean;
  user_opt_in_required: boolean;
  revocation_supported: boolean;
  retention_policy: string | null;
  redistribution_allowed: boolean;
  training_allowed: boolean;
  model_improvement_allowed: boolean;
  commercial_use_allowed: boolean;
  depersonalized_only: boolean;
  aggregate_only: boolean;
  minimum_aggregation_size: number | null;
  proof_required: boolean;
  sensitivity_class: DataSensitivityClass;
  sensitive_categories: string[];
  pricing_model: unknown;
  created_at: string;
}

export interface DataAccessDecision {
  listing_id: string;
  data_package_id: string;
  access_mode: DataAccessMode;
  intended_use: string;
  can_access: boolean;
  use_permitted: boolean;
  denied_reasons: string[];
  requires_consent: boolean;
  requires_opt_in: boolean;
  // Phase 1297-A — true when the dedicated high-sensitivity gate returned
  // REQUIRES_REVIEW for this access shape: not a flat denial, but a human
  // review is needed before a grant/read may proceed (see the
  // high-sensitivity-review workflow). Distinct from a hard DENY (CHILDREN /
  // missing consent / training), which is never review-approvable.
  review_required: boolean;
  proof_required: boolean;
  // A data-marketplace access decision NEVER returns raw capsule content —
  // governed COSMP reads (under explicit permission + ProofOfAccess) are the
  // only path to content, and they honor clearance/jurisdiction/revocation.
  raw_body_excluded: true;
  // Governance honored downstream at COSMP read time (this decision asserts the
  // obligations; it does not itself read any capsule).
  honors: {
    clearance: true;
    jurisdiction: true;
    revocation: true;
    retention: true;
    sensitivity: true;
  };
  // No cascade is claimed (the substrate has no permission lineage — 1289-A).
  cascade_revocation_supported: false;
  payment: {
    settlement_mode: "MOCK_ONLY";
    decision: "ALLOW_MOCK" | "NEEDS_APPROVAL" | "DENIED";
    required_approvals: number;
    real_provider_enabled: false;
  } | null;
  honest_note: string;
  evaluated_at: string;
}

export type CreateDataPackageResult =
  | { ok: true; listing: SafeListingView; data_package: SafeDataPackageView }
  | { ok: false; code: string };
export type DataAccessResult =
  | { ok: true; access: DataAccessDecision }
  | { ok: false; code: string };

// SAFE projection of a durable data grant (no raw capsule body / IDs / PII).
export interface SafeDataGrantView {
  grant_id: string;
  listing_id: string;
  data_package_id: string;
  provider_entity_id: string;
  provider_org_entity_id: string | null;
  buyer_entity_id: string;
  buyer_org_entity_id: string | null;
  intended_use: string;
  access_mode: DataAccessMode;
  status: MarketplaceDataGrantStatus;
  consent_record_id: string | null;
  proof_required: boolean;
  proof_delivery: string;
  economic_decision: string | null;
  // A grant never delivers raw content; reads remain COSMP + ProofOfAccess.
  raw_body_excluded: true;
  cascade_revocation_supported: false;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type DataGrantResult =
  | { ok: true; grant: SafeDataGrantView }
  | { ok: false; code: string; denied_reasons?: string[] };
export type DataGrantListResult =
  | { ok: true; grants: SafeDataGrantView[] }
  | { ok: false; code: string };

// ── Phase 1311-B — Buyer Access Console projections ─────────────────────────
// SAFE buyer-facing summaries over the buyer's OWN grants. Usage is derived from
// the append-only audit chain (MARKETPLACE_DATA_GRANT_READ_EVALUATED) — never a
// new persisted counter. Never exposes raw capsule content, other buyers' grants,
// or contributor identities beyond the provider already on the SAFE grant view.

export interface DataGrantUsageSummary {
  // Successful reads of this grant (from the audit chain).
  read_count: number;
  // Denied read attempts (governance held — useful buyer signal).
  denied_count: number;
  last_accessed_at: string | null;
}

export interface BuyerGrantConsoleView {
  grant: SafeDataGrantView;
  // The governed resource the grant is over (safe label only).
  resource: { listing_title: string | null; listing_type: string | null };
  // The policy governing the buyer's access (from the data package).
  policy: {
    allowed_uses: string[];
    training_allowed: boolean;
    model_improvement_allowed: boolean;
    sensitivity_class: DataSensitivityClass | null;
    aggregate_only: boolean;
    depersonalized_only: boolean;
    minimum_aggregation_size: number | null;
    raw_body_excluded: true;
  };
  usage: DataGrantUsageSummary;
  // Mock-only spend/settlement intent — no funds move, no settlement exists.
  settlement: { is_mock: true; economic_decision: string | null; note: string };
}

export type BuyerGrantConsoleResult =
  | { ok: true; console: BuyerGrantConsoleView }
  | { ok: false; code: string };

// ── Phase 1312-A — Contributor Sovereignty projections ──────────────────────
// The PROVIDER's view of one grant on THEIR data: who has access, under what
// policy, how it has been used, and its revocation status. The core product
// truth — data is not sold; governed access is leased under consent + proof, and
// revocation must be VISIBLE. Revocation itself uses the existing
// revokeDataGrantForCaller; this view surfaces the controls' context.

export interface ProviderGrantSovereigntyView {
  grant: SafeDataGrantView;
  resource: { listing_title: string | null; listing_type: string | null };
  policy: {
    allowed_uses: string[];
    training_allowed: boolean;
    model_improvement_allowed: boolean;
    sensitivity_class: DataSensitivityClass | null;
    aggregate_only: boolean;
    depersonalized_only: boolean;
    raw_body_excluded: true;
  };
  usage: DataGrantUsageSummary;
  sovereignty: {
    // Whether this grant is currently in force (ACTIVE, unexpired, unrevoked).
    is_active: boolean;
    // Whether the provider can revoke it now (in-force grants only).
    revocable: boolean;
    status: MarketplaceDataGrantStatus;
    revoked_at: string | null;
    revocation_reason: string | null;
    expires_at: string | null;
    // Revocation is enforced at READ time (delivery re-checks ACTIVE + consent).
    revocation_enforced_at_read: true;
  };
}

export type ProviderGrantSovereigntyResult =
  | { ok: true; sovereignty: ProviderGrantSovereigntyView }
  | { ok: false; code: string };

function toSafeGrant(g: MarketplaceDataGrant): SafeDataGrantView {
  return {
    grant_id: g.grant_id,
    listing_id: g.listing_id,
    data_package_id: g.data_package_id,
    provider_entity_id: g.provider_entity_id,
    provider_org_entity_id: g.provider_org_entity_id,
    buyer_entity_id: g.buyer_entity_id,
    buyer_org_entity_id: g.buyer_org_entity_id,
    intended_use: g.intended_use,
    access_mode: g.access_mode,
    status: g.status,
    consent_record_id: g.consent_record_id,
    proof_required: g.proof_required,
    proof_delivery: g.proof_delivery,
    economic_decision: g.economic_decision,
    raw_body_excluded: true,
    cascade_revocation_supported: false,
    expires_at: g.expires_at?.toISOString() ?? null,
    revoked_at: g.revoked_at?.toISOString() ?? null,
    created_at: g.created_at.toISOString(),
  };
}

function toSafeDataPackage(d: MarketplaceDataPackage): SafeDataPackageView {
  return {
    data_package_id: d.data_package_id,
    listing_id: d.listing_id,
    provider_entity_id: d.provider_entity_id,
    provider_org_entity_id: d.provider_org_entity_id,
    access_mode: d.access_mode,
    capsule_type_allowlist: d.capsule_type_allowlist,
    allowed_use: d.allowed_use,
    consent_required: d.consent_required,
    user_opt_in_required: d.user_opt_in_required,
    revocation_supported: d.revocation_supported,
    retention_policy: d.retention_policy,
    redistribution_allowed: d.redistribution_allowed,
    training_allowed: d.training_allowed,
    model_improvement_allowed: d.model_improvement_allowed,
    commercial_use_allowed: d.commercial_use_allowed,
    depersonalized_only: d.depersonalized_only,
    aggregate_only: d.aggregate_only,
    minimum_aggregation_size: d.minimum_aggregation_size,
    proof_required: d.proof_required,
    sensitivity_class: d.sensitivity_class,
    sensitive_categories: d.sensitive_categories,
    pricing_model: d.pricing_model,
    created_at: d.created_at.toISOString(),
  };
}

// SAFE projection of a listing (no internal columns beyond the listing fields).
export interface SafeListingView {
  listing_id: string;
  listing_type: MarketplaceListingType;
  provider_entity_id: string;
  title: string;
  description: string;
  version: string;
  pricing_model: unknown;
  required_authority: string[];
  required_memory_scope: string[];
  trust_metadata: unknown;
  status: MarketplaceListingStatus;
  // Phase 1301-A — cross-org reach (PRIVATE | CROSS_ORG). Safe to surface: it is
  // a provider-set reach label, not an authority/permission internal.
  discovery_scope: MarketplaceDiscoveryScope;
  created_at: string;
}

export interface ListingAccessDecision {
  listing_id: string;
  listing_type: MarketplaceListingType;
  can_discover: boolean;
  can_use: boolean;
  can_request: boolean;
  can_pay: boolean;
  requires_approval: boolean;
  reason_code: string;
  // Mock-only payment decision (1290-A); null when the listing is free.
  payment: {
    settlement_mode: "MOCK_ONLY";
    decision: "ALLOW_MOCK" | "NEEDS_APPROVAL" | "DENIED";
    required_approvals: number;
    real_provider_enabled: false;
  } | null;
  // Advisory: a listing never grants capsule access; an explicit COSMP
  // permission is still required for any required_memory_scope.
  memory_access_requires_explicit_permission: true;
  honest_note: string;
  evaluated_at: string;
}

export type CreateListingResult =
  | { ok: true; listing: SafeListingView }
  | { ok: false; code: string };
export type ListListingsResult =
  | { ok: true; listings: SafeListingView[] }
  | { ok: false; code: string };
export type GetListingResult =
  | { ok: true; listing: SafeListingView }
  | { ok: false; code: string };
export type ListingAccessResult =
  | { ok: true; access: ListingAccessDecision }
  | { ok: false; code: string };
// Phase 1301-A — cross-org discovery surfaces.
export type SetDiscoveryPolicyResult =
  | { ok: true; listing: SafeListingView }
  | { ok: false; code: string };
export type DiscoverListingsResult =
  | { ok: true; listings: SafeListingView[] }
  | { ok: false; code: string };
// The discovery_scope values a provider may set (PUBLIC is forward-substrate;
// refusing it here is how this phase declines org-less open reach).
export const MARKETPLACE_DISCOVERY_SCOPES = ["PRIVATE", "CROSS_ORG"] as const;

function toSafeListing(l: MarketplaceListing): SafeListingView {
  return {
    listing_id: l.listing_id,
    listing_type: l.listing_type,
    provider_entity_id: l.provider_entity_id,
    title: l.title,
    description: l.description,
    version: l.version,
    pricing_model: l.pricing_model,
    required_authority: l.required_authority,
    required_memory_scope: l.required_memory_scope,
    trust_metadata: l.trust_metadata,
    status: l.status,
    discovery_scope: l.discovery_scope,
    created_at: l.created_at.toISOString(),
  };
}

// Pull a numeric amount_usd out of a pricing_model JSON (advisory only).
function pricingAmountUsd(pricing: unknown): number {
  if (pricing !== null && typeof pricing === "object") {
    const v = (pricing as Record<string, unknown>).amount_usd;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

export class FoundationMarketplaceService {
  constructor(private readonly authService: AuthService) {}

  // Resolve the caller's organizational parent, or null for a PERSONAL DMW.
  // An individual with no organizational parent resolves to themselves
  // (self-as-org); we map that to null so personal data products + grants are
  // first-class and never mistaken for an org tenant (Founder personal-DMW
  // doctrine). A real org member resolves to the distinct COMPANY id.
  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org === entityId ? null : org;
    } catch {
      return null;
    }
  }

  // WHAT: Create a marketplace listing the caller provides.
  // WHY: POST /api/v1/foundation/marketplace/listings. The provider is always
  //      the caller (no spoofing a provider_entity_id from the body).
  async createListingForCaller(
    sessionToken: string,
    input: {
      listing_type: string;
      title: string;
      description: string;
      version?: string;
      pricing_model?: unknown;
      required_authority?: string[];
      required_memory_scope?: string[];
      trust_metadata?: unknown;
      status?: string;
    },
  ): Promise<CreateListingResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    if (
      !(MARKETPLACE_LISTING_TYPES as readonly string[]).includes(
        input.listing_type,
      )
    )
      return { ok: false, code: "INVALID_LISTING_TYPE" };
    if (
      typeof input.title !== "string" ||
      input.title.trim().length === 0 ||
      typeof input.description !== "string"
    )
      return { ok: false, code: "INVALID_REQUEST" };

    const status: MarketplaceListingStatus =
      input.status === "PUBLISHED" ||
      input.status === "PRIVATE" ||
      input.status === "DELISTED"
        ? (input.status as MarketplaceListingStatus)
        : "DRAFT";

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const created = await prisma.marketplaceListing.create({
      data: {
        listing_type: input.listing_type as MarketplaceListingType,
        provider_entity_id: validation.entity_id,
        provider_org_entity_id: orgEntityId,
        title: input.title,
        description: input.description,
        version: typeof input.version === "string" ? input.version : "1.0.0",
        pricing_model: (input.pricing_model ?? {}) as never,
        required_authority: Array.isArray(input.required_authority)
          ? input.required_authority.filter((s) => typeof s === "string")
          : [],
        required_memory_scope: Array.isArray(input.required_memory_scope)
          ? input.required_memory_scope.filter((s) => typeof s === "string")
          : [],
        trust_metadata: (input.trust_metadata ?? {}) as never,
        status,
      },
    });

    await writeAuditEvent({
      event_type: "MARKETPLACE_LISTING_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "MARKETPLACE_LISTING_CREATED",
        listing_id: created.listing_id,
        listing_type: created.listing_type,
        status: created.status,
        has_pricing: pricingAmountUsd(created.pricing_model) > 0,
      },
    });

    return { ok: true, listing: toSafeListing(created) };
  }

  // WHAT: Discover listings — the caller's own + PUBLISHED in their org.
  // WHY: GET /api/v1/foundation/marketplace/listings. Tenant-scoped:
  //      cross-org discovery is forward-substrate (isolation preserved).
  async listListingsForCaller(
    sessionToken: string,
    filter?: { listing_type?: string },
  ): Promise<ListListingsResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);

    const typeFilter =
      filter?.listing_type !== undefined &&
      (MARKETPLACE_LISTING_TYPES as readonly string[]).includes(
        filter.listing_type,
      )
        ? { listing_type: filter.listing_type as MarketplaceListingType }
        : {};

    const rows = await prisma.marketplaceListing.findMany({
      where: {
        deleted_at: null,
        ...typeFilter,
        OR: [
          { provider_entity_id: validation.entity_id },
          ...(orgEntityId !== null
            ? [
                {
                  status: "PUBLISHED" as MarketplaceListingStatus,
                  provider_org_entity_id: orgEntityId,
                },
              ]
            : []),
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { ok: true, listings: rows.map(toSafeListing) };
  }

  // WHAT: Set a listing's cross-org discovery REACH (provider-opt-in only).
  // INPUT: session token + listing_id + the new discovery_scope.
  // OUTPUT: the updated SAFE listing, or a scrubbed failure code.
  // WHY: PATCH /api/v1/foundation/marketplace/listings/:id/discovery. The only
  //      way a listing enters the cross-org catalog. Provider-only + enumeration-
  //      safe; CROSS_ORG requires PUBLISHED; high-sensitivity data packages can
  //      NEVER be cross-org (personal OR org); the opt-in is audited. PUBLIC
  //      (org-less open reach) is refused here — no default public exposure.
  async setListingDiscoveryPolicyForCaller(
    sessionToken: string,
    listingId: string,
    discoveryScope: string,
  ): Promise<SetDiscoveryPolicyResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    if (
      !(MARKETPLACE_DISCOVERY_SCOPES as readonly string[]).includes(
        discoveryScope,
      )
    )
      return { ok: false, code: "INVALID_DISCOVERY_SCOPE" };
    const scope = discoveryScope as MarketplaceDiscoveryScope;

    // Provider-only + enumeration-safe: a non-provider (or unknown id) gets the
    // same LISTING_NOT_FOUND as a missing row — never confirm another provider's
    // listing exists.
    const listing = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (listing === null || listing.provider_entity_id !== validation.entity_id)
      return { ok: false, code: "LISTING_NOT_FOUND" };

    // Opting INTO cross-org reach is guarded; retracting to PRIVATE is always safe.
    if (scope === "CROSS_ORG") {
      // Reach only makes sense for a PUBLISHED listing. (Orthogonal to status,
      // but a DRAFT / PRIVATE / DELISTED listing is never cross-org-discoverable.)
      if (listing.status !== "PUBLISHED")
        return { ok: false, code: "LISTING_NOT_PUBLISHED" };

      // High-sensitivity data packages can NEVER be cross-org — regardless of
      // provider opt-in, personal or org. (Set-time half of the two-point check;
      // discoverListingsForCaller re-enforces it at read time.)
      const pkg = await prisma.marketplaceDataPackage.findFirst({
        where: { listing_id: listingId, deleted_at: null },
      });
      if (
        pkg !== null &&
        isHighSensitivityPackage(pkg.sensitivity_class, pkg.sensitive_categories)
      ) {
        await writeAuditEvent({
          event_type: "MARKETPLACE_DISCOVERY_POLICY_UPDATED",
          outcome: "DENIED",
          actor_entity_id: validation.entity_id,
          details: {
            action: "MARKETPLACE_DISCOVERY_POLICY_UPDATED",
            listing_id: listing.listing_id,
            listing_type: listing.listing_type,
            status: listing.status,
            discovery_scope: listing.discovery_scope, // unchanged
            is_data_package: true,
            sensitivity_class: pkg.sensitivity_class,
            reason_code: "DISCOVERY_BLOCKED_HIGH_SENSITIVITY",
          },
        });
        return { ok: false, code: "DISCOVERY_BLOCKED_HIGH_SENSITIVITY" };
      }
    }

    const updated = await prisma.marketplaceListing.update({
      where: { listing_id: listingId },
      data: { discovery_scope: scope },
    });

    await writeAuditEvent({
      event_type: "MARKETPLACE_DISCOVERY_POLICY_UPDATED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "MARKETPLACE_DISCOVERY_POLICY_UPDATED",
        listing_id: updated.listing_id,
        listing_type: updated.listing_type,
        status: updated.status,
        discovery_scope: updated.discovery_scope,
        is_data_package: updated.listing_type === "DATA_PACKAGE",
        reason_code: "DISCOVERY_POLICY_SET",
      },
    });

    return { ok: true, listing: toSafeListing(updated) };
  }

  // WHAT: The cross-org discovery catalog — PUBLISHED listings other providers
  //       have OPTED IN to cross-org reach. Metadata-only.
  // INPUT: session token + optional listing_type filter.
  // OUTPUT: SAFE listing projections (toSafeListing) — never capsules, grants,
  //         consent, quotes, or provider internals.
  // WHY: GET /api/v1/foundation/marketplace/discover. A SEPARATE read path from
  //      listListingsForCaller (the default same-org surface) — it grants
  //      NOTHING; using a discovered listing still runs the full access/grant/
  //      consent path. Excludes the caller's own + same-org listings (no dupes)
  //      and re-excludes any high-sensitivity data package at read time.
  async discoverListingsForCaller(
    sessionToken: string,
    filter?: { listing_type?: string },
  ): Promise<DiscoverListingsResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);

    const typeFilter =
      filter?.listing_type !== undefined &&
      (MARKETPLACE_LISTING_TYPES as readonly string[]).includes(
        filter.listing_type,
      )
        ? { listing_type: filter.listing_type as MarketplaceListingType }
        : {};

    const rows = await prisma.marketplaceListing.findMany({
      where: {
        deleted_at: null,
        status: "PUBLISHED" as MarketplaceListingStatus,
        discovery_scope: "CROSS_ORG" as MarketplaceDiscoveryScope,
        ...typeFilter,
        // Exclude the caller's OWN listings (already on the default surface).
        provider_entity_id: { not: validation.entity_id },
        // Exclude the caller's SAME-ORG listings (also already visible) — only
        // applies when the caller has an org. Personal callers see all cross-org.
        ...(orgEntityId !== null
          ? {
              OR: [
                { provider_org_entity_id: null },
                { provider_org_entity_id: { not: orgEntityId } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    // Read-time defense-in-depth: never surface a high-sensitivity data package
    // in the cross-org catalog, even if one slipped to CROSS_ORG out of band
    // (e.g. a package added/reclassified after the listing was opted in). One
    // batched lookup over the DATA_PACKAGE listings in the result set.
    const dataPackageListingIds = rows
      .filter((r) => r.listing_type === "DATA_PACKAGE")
      .map((r) => r.listing_id);
    const blocked = new Set<string>();
    if (dataPackageListingIds.length > 0) {
      const pkgs = await prisma.marketplaceDataPackage.findMany({
        where: { listing_id: { in: dataPackageListingIds }, deleted_at: null },
      });
      for (const p of pkgs) {
        if (
          isHighSensitivityPackage(p.sensitivity_class, p.sensitive_categories)
        )
          blocked.add(p.listing_id);
      }
    }

    const listings = rows
      .filter((r) => !blocked.has(r.listing_id))
      .map(toSafeListing);
    return { ok: true, listings };
  }

  private async loadVisibleListing(
    listingId: string,
    callerEntityId: string,
    callerOrgId: string | null,
  ): Promise<MarketplaceListing | null> {
    const l = await prisma.marketplaceListing.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (l === null) return null;
    const isProvider = l.provider_entity_id === callerEntityId;
    const isPublishedSameOrg =
      l.status === "PUBLISHED" &&
      l.provider_org_entity_id !== null &&
      l.provider_org_entity_id === callerOrgId;
    if (!isProvider && !isPublishedSameOrg) return null; // enumeration-safe
    return l;
  }

  // WHAT: Read one listing (own, or PUBLISHED in the caller's org).
  async getListingForCaller(
    sessionToken: string,
    listingId: string,
  ): Promise<GetListingResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const l = await this.loadVisibleListing(
      listingId,
      validation.entity_id,
      orgEntityId,
    );
    if (l === null) return { ok: false, code: "LISTING_NOT_FOUND" };
    // F-1322: a listing becoming visible to a REQUESTER (not its own provider)
    // is a first-class discovery occurrence. Discovery TELEMETRY only — never the
    // query string, filters, or any content. visibility_scope = the listing's
    // provider-set discovery reach.
    if (l.provider_entity_id !== validation.entity_id) {
      await writeAuditEvent({
        event_type: "LISTING_DISCOVERED",
        outcome: "SUCCESS",
        actor_entity_id: validation.entity_id,
        details: {
          action: "LISTING_DISCOVERED",
          resource_type: "listing",
          resource_id: l.listing_id,
          listing_id: l.listing_id,
          listing_type: l.listing_type,
          visibility_scope: l.discovery_scope,
          reason_code: "LISTING_VIEWED_BY_REQUESTER",
        },
      });
    }
    return { ok: true, listing: toSafeListing(l) };
  }

  // WHAT: Evaluate the caller's governed access to a listing.
  // WHY: POST /api/v1/foundation/marketplace/listings/:id/access. Composes the
  //      authority envelope (use authority) + the 1290-A spend-policy (mock-only
  //      payment). No real transaction; capsule access still needs explicit
  //      COSMP permission.
  async evaluateListingAccessForCaller(
    sessionToken: string,
    listingId: string,
  ): Promise<ListingAccessResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const listing = await this.loadVisibleListing(
      listingId,
      validation.entity_id,
      orgEntityId,
    );
    if (listing === null) return { ok: false, code: "LISTING_NOT_FOUND" };

    // Consumer authority (from persisted Entity/TAR/Wallet — never the request).
    const entity: Entity | null = await prisma.entity.findFirst({
      where: { entity_id: validation.entity_id, deleted_at: null },
    });
    if (entity === null) return { ok: false, code: "ENTITY_NOT_FOUND" };
    const [tar, wallet] = await Promise.all([
      prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: validation.entity_id },
      }),
      prisma.wallet.findUnique({ where: { entity_id: validation.entity_id } }),
    ]);
    const envelope = computeAuthorityEnvelope({ entity, tar, wallet });

    const isProvider = listing.provider_entity_id === validation.entity_id;
    const isPublished = listing.status === "PUBLISHED";
    const canDiscover = isProvider || isPublished;
    // A consumer may use a listing if it is usable to them (published or own)
    // and their authority is active (can_know.can_read_capsules is a proxy for
    // an active, capable entity). An app/world/service listing never bypasses
    // this — the consumer's own authority governs.
    const canUse = canDiscover && envelope.can_know.can_read_capsules;

    // Mock-only payment decision via the 1290-A spend-policy.
    const amountUsd = pricingAmountUsd(listing.pricing_model);
    let payment: ListingAccessDecision["payment"] = null;
    if (amountUsd > 0) {
      const policy = evaluateSpendPolicy({
        entity_type: entity.entity_type,
        amount_usd: amountUsd,
        purpose: "MARKETPLACE_PURCHASE",
        settlement_mode: "MOCK_ONLY",
      });
      payment = {
        settlement_mode: "MOCK_ONLY",
        decision: policy.decision,
        required_approvals: policy.required_approvals,
        real_provider_enabled: false,
      };
    }
    const canPay = payment === null ? true : payment.decision !== "DENIED";
    const requiresApproval =
      payment !== null && payment.decision === "NEEDS_APPROVAL";

    const reason_code = !canUse
      ? "consumer-authority-insufficient"
      : amountUsd > 0
        ? requiresApproval
          ? "use-permitted-payment-requires-approval"
          : "use-permitted-mock-payment-allowed"
        : "use-permitted-free-listing";

    const access: ListingAccessDecision = {
      listing_id: listing.listing_id,
      listing_type: listing.listing_type,
      can_discover: canDiscover,
      can_use: canUse,
      can_request: true,
      can_pay: canPay,
      requires_approval: requiresApproval,
      reason_code,
      payment,
      memory_access_requires_explicit_permission: true,
      honest_note:
        "Marketplace access is governed by your own authority and is mock-only " +
        "for payment. Using a listing never grants capsule access — any " +
        "required memory scope still needs an explicit COSMP permission.",
      evaluated_at: new Date().toISOString(),
    };

    await writeAuditEvent({
      event_type: "MARKETPLACE_ACCESS_EVALUATED",
      outcome: canUse ? "SUCCESS" : "DENIED",
      actor_entity_id: validation.entity_id,
      denial_reason: canUse ? null : reason_code,
      details: {
        action: "MARKETPLACE_ACCESS_EVALUATED",
        listing_id: listing.listing_id,
        listing_type: listing.listing_type,
        can_use: canUse,
        can_pay: canPay,
        requires_approval: requiresApproval,
        payment_decision: payment?.decision ?? null,
        reason_code,
      },
    });

    // Per-listing metering hook (best-effort; never blocks).
    if (orgEntityId !== null) {
      try {
        await recordUsageForOrg(orgEntityId, LISTING_ACCESS_METER, 1);
      } catch {
        // metering hiccup — access decision stands.
      }
    }

    return { ok: true, access };
  }

  // WHAT: Create a DATA_PACKAGE listing + its MarketplaceDataPackage companion.
  // WHY: POST /api/v1/foundation/marketplace/data-packages. A user/org lists a
  //      permissioned access product over their own capsule scopes — they do
  //      NOT lose the data; the DMW stays the governed container. Safe defaults:
  //      no training / model-improvement / redistribution / commercial use
  //      unless explicitly opted in; consent + opt-in + revocation + proof
  //      required by default. Provider = caller (no spoofing).
  async createDataPackageForCaller(
    sessionToken: string,
    input: {
      title: string;
      description: string;
      access_mode?: string;
      capsule_type_allowlist?: string[];
      allowed_use?: string[];
      version?: string;
      pricing_model?: unknown;
      status?: string;
      consent_required?: boolean;
      user_opt_in_required?: boolean;
      revocation_supported?: boolean;
      retention_policy?: string | null;
      redistribution_allowed?: boolean;
      training_allowed?: boolean;
      model_improvement_allowed?: boolean;
      commercial_use_allowed?: boolean;
      depersonalized_only?: boolean;
      aggregate_only?: boolean;
      minimum_aggregation_size?: number | null;
      proof_required?: boolean;
      sensitivity_class?: string;
      sensitive_categories?: string[];
    },
  ): Promise<CreateDataPackageResult> {
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

    const accessMode = (input.access_mode ?? "SAFE_PROJECTION") as DataAccessMode;
    if (!(DATA_ACCESS_MODES as readonly string[]).includes(accessMode))
      return { ok: false, code: "INVALID_ACCESS_MODE" };

    const allowedUse = Array.isArray(input.allowed_use)
      ? input.allowed_use.filter((u) => typeof u === "string")
      : [];
    for (const u of allowedUse) {
      if (!(DATA_USE_RIGHTS as readonly string[]).includes(u))
        return { ok: false, code: "INVALID_USE_RIGHT" };
    }

    const sensitivityClass = (input.sensitivity_class ??
      "STANDARD") as DataSensitivityClass;
    if (!(DATA_SENSITIVITY_CLASSES as readonly string[]).includes(sensitivityClass))
      return { ok: false, code: "INVALID_SENSITIVITY_CLASS" };
    const sensitiveCategories = Array.isArray(input.sensitive_categories)
      ? input.sensitive_categories.filter((s) => typeof s === "string")
      : [];

    const status: MarketplaceListingStatus =
      input.status === "PUBLISHED" ||
      input.status === "PRIVATE" ||
      input.status === "DELISTED"
        ? (input.status as MarketplaceListingStatus)
        : "DRAFT";
    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const pricing = (input.pricing_model ?? {}) as never;

    const { listing, dataPackage } = await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.create({
        data: {
          listing_type: "DATA_PACKAGE",
          provider_entity_id: validation.entity_id,
          provider_org_entity_id: orgEntityId,
          title: input.title,
          description: input.description,
          version: typeof input.version === "string" ? input.version : "1.0.0",
          pricing_model: pricing,
          required_authority: [],
          required_memory_scope: Array.isArray(input.capsule_type_allowlist)
            ? input.capsule_type_allowlist.filter((s) => typeof s === "string")
            : [],
          trust_metadata: {},
          status,
        },
      });
      const dataPackage = await tx.marketplaceDataPackage.create({
        data: {
          listing_id: listing.listing_id,
          provider_entity_id: validation.entity_id,
          provider_org_entity_id: orgEntityId,
          access_mode: accessMode,
          capsule_type_allowlist: Array.isArray(input.capsule_type_allowlist)
            ? input.capsule_type_allowlist.filter((s) => typeof s === "string")
            : [],
          allowed_use: allowedUse,
          consent_required: input.consent_required !== false,
          user_opt_in_required: input.user_opt_in_required !== false,
          revocation_supported: input.revocation_supported !== false,
          retention_policy:
            typeof input.retention_policy === "string"
              ? input.retention_policy
              : null,
          redistribution_allowed: input.redistribution_allowed === true,
          training_allowed: input.training_allowed === true,
          model_improvement_allowed: input.model_improvement_allowed === true,
          commercial_use_allowed: input.commercial_use_allowed === true,
          depersonalized_only: input.depersonalized_only === true,
          aggregate_only: input.aggregate_only === true,
          minimum_aggregation_size:
            typeof input.minimum_aggregation_size === "number"
              ? input.minimum_aggregation_size
              : null,
          proof_required: input.proof_required !== false,
          sensitivity_class: sensitivityClass,
          sensitive_categories: sensitiveCategories,
          pricing_model: pricing,
        },
      });
      return { listing, dataPackage };
    });

    await writeAuditEvent({
      event_type: "MARKETPLACE_LISTING_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "MARKETPLACE_LISTING_CREATED",
        listing_id: listing.listing_id,
        listing_type: "DATA_PACKAGE",
        data_package_id: dataPackage.data_package_id,
        access_mode: accessMode,
        status: listing.status,
      },
    });

    return {
      ok: true,
      listing: toSafeListing(listing),
      data_package: toSafeDataPackage(dataPackage),
    };
  }

  // WHAT: Evaluate a buyer's governed access to a DATA_PACKAGE for an intended
  //        use. Composes the authority envelope + the package policy + the
  //        1290-A mock-only economics. NEVER returns raw capsule content —
  //        actual reads remain governed by COSMP + ProofOfAccess at runtime.
  // WHY: POST /api/v1/foundation/marketplace/listings/:id/data-access.
  async evaluateDataAccessForCaller(
    sessionToken: string,
    listingId: string,
    intendedUse: string,
  ): Promise<DataAccessResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    const orgEntityId = await this.callerOrgOrNull(validation.entity_id);
    const listing = await this.loadVisibleListing(
      listingId,
      validation.entity_id,
      orgEntityId,
    );
    if (listing === null || listing.listing_type !== "DATA_PACKAGE")
      return { ok: false, code: "LISTING_NOT_FOUND" };
    const pkg = await prisma.marketplaceDataPackage.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (pkg === null) return { ok: false, code: "DATA_PACKAGE_NOT_FOUND" };

    const entity = await prisma.entity.findFirst({
      where: { entity_id: validation.entity_id, deleted_at: null },
    });
    if (entity === null) return { ok: false, code: "ENTITY_NOT_FOUND" };
    const [tar, wallet] = await Promise.all([
      prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: validation.entity_id },
      }),
      prisma.wallet.findUnique({ where: { entity_id: validation.entity_id } }),
    ]);
    const envelope = computeAuthorityEnvelope({ entity, tar, wallet });

    const denied: string[] = [];

    // 1. Buyer must be an active, capable entity (authority, not the request).
    if (!envelope.can_know.can_read_capsules)
      denied.push("buyer-authority-insufficient");
    // 2. A buyer cannot self-authorize their own purchase (provider != buyer
    //    for a real access grant; provider previewing own listing is fine but
    //    is not a governed third-party access).
    const isProvider = pkg.provider_entity_id === validation.entity_id;
    // 3. Intended use must be a recognized right AND in the package allowlist.
    if (!(DATA_USE_RIGHTS as readonly string[]).includes(intendedUse))
      denied.push("intended-use-not-recognized");
    else if (!pkg.allowed_use.includes(intendedUse))
      denied.push("intended-use-not-offered");
    // 4. Elevated rights denied unless explicitly opted in.
    if (intendedUse === "TRAINING" && !pkg.training_allowed)
      denied.push("training-not-permitted");
    if (intendedUse === "MODEL_IMPROVEMENT" && !pkg.model_improvement_allowed)
      denied.push("model-improvement-not-permitted");
    // 4b. Sensitivity gate (1296-A): HIGH_SENSITIVITY / policy-gated categories
    //     now run the DEDICATED high-sensitivity policy evaluator (graded
    //     ALLOW_SAFE_PROJECTION / ALLOW_PROOF_ONLY / ALLOW_AGGREGATED /
    //     REQUIRES_REVIEW / DENY). Consent/opt-in are enforced separately at the
    //     grant tier; here we evaluate the access SHAPE (assume-confirmed) and
    //     verify the package's own access_mode is permitted for its sensitivity.
    //     Raw content is never allowed; this gate only ever permits safe modes.
    const isHighSensitivity = isHighSensitivityPackage(
      pkg.sensitivity_class,
      pkg.sensitive_categories,
    );
    let reviewRequired = false;
    if (isHighSensitivity) {
      const hs = evaluateHighSensitivityAccess({
        sensitivity_class: pkg.sensitivity_class,
        sensitive_categories: pkg.sensitive_categories,
        access_mode: pkg.access_mode,
        intended_use: intendedUse,
        consent_confirmed: true,
        opt_in_confirmed: true,
        training_allowed: pkg.training_allowed,
        model_improvement_allowed: pkg.model_improvement_allowed,
        redistribution_allowed: pkg.redistribution_allowed,
        commercial_use_allowed: pkg.commercial_use_allowed,
        depersonalized_only: pkg.depersonalized_only,
        aggregate_only: pkg.aggregate_only,
        retention_policy: pkg.retention_policy,
      });
      // REQUIRES_REVIEW is surfaced (review_required) but still blocks the
      // *automatic* decision: a grant/read only proceeds when a matching human
      // review has been APPROVED (consulted at grant creation + read time).
      reviewRequired = hs.decision === "REQUIRES_REVIEW";
      if (!hs.decision.startsWith("ALLOW"))
        denied.push(hs.reason_codes[0] ?? "HIGH_SENSITIVITY_DEFAULT_DENY");
      else if (!hs.allowed_access_modes.includes(pkg.access_mode))
        denied.push("access-mode-not-allowed-for-sensitivity");
      await writeAuditEvent({
        event_type: "HIGH_SENSITIVITY_POLICY_EVALUATED",
        outcome: hs.decision.startsWith("ALLOW") ? "SUCCESS" : "DENIED",
        actor_entity_id: validation.entity_id,
        denial_reason: hs.decision.startsWith("ALLOW") ? null : hs.reason_codes[0] ?? null,
        details: {
          action: "HIGH_SENSITIVITY_POLICY_EVALUATED",
          listing_id: listing.listing_id,
          data_package_id: pkg.data_package_id,
          sensitivity_class: pkg.sensitivity_class,
          sensitive_categories: pkg.sensitive_categories,
          intended_use: intendedUse,
          access_mode: pkg.access_mode,
          decision: hs.decision,
          reason_codes: hs.reason_codes,
          human_review_required: hs.human_review_required,
        },
      });
    }
    // 5. Redistribution / commercial gating (cross-cutting flags).
    //    (Surfaced as obligations; intended_use covers the primary right.)

    const usePermitted = denied.length === 0;

    // 6. Mock-only economic quote for the access (purpose by access mode).
    const amountUsd = pricingAmountUsd(pkg.pricing_model);
    let payment: DataAccessDecision["payment"] = null;
    if (amountUsd > 0) {
      const policy = evaluateSpendPolicy({
        entity_type: entity.entity_type,
        amount_usd: amountUsd,
        purpose:
          pkg.access_mode === "PROOF_ONLY"
            ? "MEMORY_CAPSULE_EXPORT_PROOF"
            : pkg.access_mode === "RETRIEVAL_QUERY"
              ? "MEMORY_RETRIEVAL_QUERY"
              : "MARKETPLACE_PURCHASE",
        settlement_mode: "MOCK_ONLY",
      });
      payment = {
        settlement_mode: "MOCK_ONLY",
        decision: policy.decision,
        required_approvals: policy.required_approvals,
        real_provider_enabled: false,
      };
    }
    const paymentOk = payment === null ? true : payment.decision !== "DENIED";
    const canAccess = usePermitted && paymentOk && !isProvider
      ? true
      : usePermitted && paymentOk && isProvider
        ? true // provider may preview their own package
        : false;

    const decision: DataAccessDecision = {
      listing_id: listing.listing_id,
      data_package_id: pkg.data_package_id,
      access_mode: pkg.access_mode,
      intended_use: intendedUse,
      can_access: canAccess,
      use_permitted: usePermitted,
      denied_reasons: denied,
      requires_consent: pkg.consent_required,
      requires_opt_in: pkg.user_opt_in_required,
      review_required: reviewRequired,
      proof_required: pkg.proof_required,
      raw_body_excluded: true,
      honors: {
        clearance: true,
        jurisdiction: true,
        revocation: true,
        retention: true,
        sensitivity: true,
      },
      cascade_revocation_supported: false,
      payment,
      honest_note:
        "Data-marketplace access is a permissioned access product, never a " +
        "transfer of ownership. No raw capsule content is returned here: any " +
        "granted access is governed at read time by COSMP + ProofOfAccess and " +
        "honors clearance, jurisdiction, retention, and revocation. Payment is " +
        "mock-only; consent and opt-in are required where the package declares " +
        "them. Training / model-improvement / redistribution / commercial use " +
        "are denied unless the package explicitly opts in.",
      evaluated_at: new Date().toISOString(),
    };

    await writeAuditEvent({
      event_type: "MARKETPLACE_DATA_ACCESS_EVALUATED",
      outcome: canAccess ? "SUCCESS" : "DENIED",
      actor_entity_id: validation.entity_id,
      denial_reason: canAccess ? null : (denied[0] ?? "access-not-permitted"),
      details: {
        action: "MARKETPLACE_DATA_ACCESS_EVALUATED",
        listing_id: listing.listing_id,
        data_package_id: pkg.data_package_id,
        access_mode: pkg.access_mode,
        intended_use: intendedUse,
        can_access: canAccess,
        use_permitted: usePermitted,
        requires_consent: pkg.consent_required,
        requires_opt_in: pkg.user_opt_in_required,
        proof_required: pkg.proof_required,
        payment_decision: payment?.decision ?? null,
        denied_reasons: denied,
      },
    });

    if (orgEntityId !== null) {
      try {
        await recordUsageForOrg(orgEntityId, DATA_ACCESS_METER, 1);
      } catch {
        // metering hiccup — decision stands.
      }
    }

    return { ok: true, access: decision };
  }

  // WHAT: Create a durable, governed marketplace DATA grant (+ consent record).
  // WHY: POST /api/v1/foundation/marketplace/listings/:id/data-grants. Turns an
  //      approved data-access decision into a durable, revocable access right.
  //      Permissioned access only — NO raw capsule content, NO ownership
  //      transfer; proof is delivered PER_CAPSULE_AT_READ_TIME by COSMP +
  //      ProofOfAccess (never faked here). Personal DMWs (null provider/buyer
  //      org) are first-class. High-sensitivity / health / medical / biometric
  //      / children data is denied until a dedicated policy gate lands.
  async createDataGrantForCaller(
    sessionToken: string,
    listingId: string,
    input: {
      intended_use: string;
      consent_confirmed?: boolean;
      opt_in_confirmed?: boolean;
      expires_at?: string;
    },
  ): Promise<DataGrantResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };

    const buyerEntityId = validation.entity_id;
    const buyerOrg = await this.callerOrgOrNull(buyerEntityId);
    const listing = await this.loadVisibleListing(
      listingId,
      buyerEntityId,
      buyerOrg,
    );
    if (listing === null || listing.listing_type !== "DATA_PACKAGE")
      return { ok: false, code: "LISTING_NOT_FOUND" };
    const pkg = await prisma.marketplaceDataPackage.findFirst({
      where: { listing_id: listingId, deleted_at: null },
    });
    if (pkg === null) return { ok: false, code: "DATA_PACKAGE_NOT_FOUND" };

    const emitEval = (
      status: string,
      reason: string,
      ok: boolean,
    ): Promise<unknown> =>
      writeAuditEvent({
        event_type: "MARKETPLACE_DATA_GRANT_EVALUATED",
        outcome: ok ? "SUCCESS" : "DENIED",
        actor_entity_id: buyerEntityId,
        denial_reason: ok ? null : reason,
        details: {
          action: "MARKETPLACE_DATA_GRANT_EVALUATED",
          listing_id: listingId,
          data_package_id: pkg.data_package_id,
          intended_use: input.intended_use,
          access_mode: pkg.access_mode,
          status,
          sensitivity_class: pkg.sensitivity_class,
          reason_code: reason,
        },
      });

    // Re-run the governed access evaluation (authority + use + sensitivity).
    const evalResult = await this.evaluateDataAccessForCaller(
      sessionToken,
      listingId,
      input.intended_use,
    );
    if (evalResult.ok === false) return { ok: false, code: evalResult.code };
    const decision = evalResult.access;
    // The grant is issued for the package's offered mode by default; a human
    // review may downgrade it to an approved safe mode (1297-A).
    let grantAccessMode: DataAccessMode = pkg.access_mode;
    // A governing review's expiry caps the grant's (1298-A) — a grant never
    // outlives the human review that authorized it.
    let reviewExpiresAt: Date | null = null;
    if (!decision.use_permitted) {
      // The high-sensitivity REQUIRES_REVIEW blocker can be lifted ONLY by a
      // matching APPROVED human review; every OTHER denial still blocks.
      const hardBlockers = decision.denied_reasons.filter(
        (r) => !REVIEW_GATE_REASONS.has(r),
      );
      if (!decision.review_required || hardBlockers.length > 0) {
        await emitEval(
          "DENIED",
          hardBlockers[0] ?? decision.denied_reasons[0] ?? "use-not-permitted",
          false,
        );
        return {
          ok: false,
          code: "USE_NOT_PERMITTED",
          denied_reasons:
            hardBlockers.length > 0 ? hardBlockers : decision.denied_reasons,
        };
      }
      // Only the review gate remains — consult an approved human review.
      const resolved = await resolveReviewDecisionForGrantRead(
        buyerEntityId,
        pkg.data_package_id,
        input.intended_use,
        pkg.access_mode,
      );
      if (resolved.approved_access_modes.length === 0) {
        await emitEval("REVIEW_REQUIRED", "high-sensitivity-review-required", false);
        return {
          ok: false,
          code: "REVIEW_REQUIRED",
          denied_reasons: decision.denied_reasons,
        };
      }
      // An approval exists — issue the grant for an approved safe mode (prefer
      // the offered mode when approved, else the safest approved mode).
      grantAccessMode = resolved.approved_access_modes.includes(pkg.access_mode)
        ? pkg.access_mode
        : (resolved.approved_access_modes[0] as DataAccessMode);
      reviewExpiresAt = resolved.expires_at;
    }

    // Consent + opt-in are required by the package → must be explicitly confirmed.
    if (pkg.consent_required && input.consent_confirmed !== true) {
      await emitEval("PENDING_CONSENT", "consent-required", false);
      return { ok: false, code: "CONSENT_REQUIRED" };
    }
    if (pkg.user_opt_in_required && input.opt_in_confirmed !== true) {
      await emitEval("PENDING_CONSENT", "opt-in-required", false);
      return { ok: false, code: "OPT_IN_REQUIRED" };
    }

    // Economic decision (mock-only) for priced packages.
    const economicDecision = decision.payment?.decision ?? null;
    if (economicDecision === "DENIED") {
      await emitEval("DENIED", "payment-denied", false);
      return { ok: false, code: "PAYMENT_DENIED" };
    }

    // Retention enforcement (1298-A): derive + validate the grant's finite
    // expiry from the package retention policy + sensitivity. High-sensitivity
    // is ALWAYS finite (capped, never outliving the governing review); standard
    // may be until-revoked (null). Reviewed grants cap by the review's expiry.
    const retention = evaluateRetentionPolicy({
      retention_policy: pkg.retention_policy,
      sensitivity_class: pkg.sensitivity_class,
      sensitive_categories: pkg.sensitive_categories,
      explicit_expires_at: input.expires_at,
      review_expires_at: reviewExpiresAt,
      now: new Date(),
    });
    await writeAuditEvent({
      event_type: "RETENTION_POLICY_EVALUATED",
      outcome: retention.allowed ? "SUCCESS" : "DENIED",
      actor_entity_id: buyerEntityId,
      denial_reason: retention.allowed ? null : retention.reason_codes[0] ?? null,
      details: {
        action: "RETENTION_POLICY_EVALUATED",
        listing_id: listingId,
        data_package_id: pkg.data_package_id,
        sensitivity_class: pkg.sensitivity_class,
        retention_policy: retention.retention_policy,
        expires_at: retention.expires_at,
        applied_default: retention.applied_default,
        result: retention.allowed ? "ALLOWED" : "DENIED",
        reason_codes: retention.reason_codes,
      },
    });
    if (!retention.allowed) {
      await emitEval("DENIED", retention.reason_codes[0] ?? "retention-not-permitted", false);
      return {
        ok: false,
        code: retention.reason_codes[0] ?? "RETENTION_POLICY_REQUIRED",
        denied_reasons: retention.reason_codes,
      };
    }
    const expiresAt =
      retention.expires_at !== null ? new Date(retention.expires_at) : null;

    const { consent, grant } = await prisma.$transaction(async (tx) => {
      // The consent record is recorded by the PROVIDER's declared policy on
      // behalf of the data subject; here the buyer's confirmation is captured
      // against the provider's package terms. (A provider-side opt-in workflow
      // for third-party subjects is forward-substrate.)
      const consent = await tx.marketplaceDataConsent.create({
        data: {
          listing_id: listingId,
          data_package_id: pkg.data_package_id,
          provider_entity_id: pkg.provider_entity_id,
          provider_org_entity_id: pkg.provider_org_entity_id,
          consenting_entity_id: pkg.provider_entity_id,
          allowed_use: pkg.allowed_use,
          access_mode: grantAccessMode,
          training_allowed: pkg.training_allowed,
          model_improvement_allowed: pkg.model_improvement_allowed,
          redistribution_allowed: pkg.redistribution_allowed,
          commercial_use_allowed: pkg.commercial_use_allowed,
          retention_policy: pkg.retention_policy,
          expires_at: expiresAt,
        },
      });
      const grant = await tx.marketplaceDataGrant.create({
        data: {
          listing_id: listingId,
          data_package_id: pkg.data_package_id,
          provider_entity_id: pkg.provider_entity_id,
          provider_org_entity_id: pkg.provider_org_entity_id,
          buyer_entity_id: buyerEntityId,
          buyer_org_entity_id: buyerOrg,
          granted_by_entity_id: buyerEntityId,
          intended_use: input.intended_use,
          access_mode: grantAccessMode,
          status: "ACTIVE",
          consent_record_id: consent.consent_id,
          proof_required: pkg.proof_required,
          proof_delivery: "PER_CAPSULE_AT_READ_TIME",
          economic_decision: economicDecision,
          expires_at: expiresAt,
        },
      });
      return { consent, grant };
    });

    await writeAuditEvent({
      event_type: "MARKETPLACE_DATA_CONSENT_RECORDED",
      outcome: "SUCCESS",
      actor_entity_id: buyerEntityId,
      details: {
        action: "MARKETPLACE_DATA_CONSENT_RECORDED",
        consent_id: consent.consent_id,
        listing_id: listingId,
        data_package_id: pkg.data_package_id,
        access_mode: grant.access_mode,
      },
    });
    await writeAuditEvent({
      event_type: "MARKETPLACE_DATA_GRANT_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: buyerEntityId,
      details: {
        action: "MARKETPLACE_DATA_GRANT_CREATED",
        grant_id: grant.grant_id,
        listing_id: listingId,
        data_package_id: pkg.data_package_id,
        intended_use: input.intended_use,
        access_mode: grant.access_mode,
        status: grant.status,
        proof_required: grant.proof_required,
        proof_delivery: grant.proof_delivery,
        economic_decision: economicDecision,
        sensitivity_class: pkg.sensitivity_class,
      },
    });
    if (buyerOrg !== null) {
      try {
        await recordUsageForOrg(buyerOrg, DATA_GRANT_METER, 1);
      } catch {
        // metering hiccup — grant stands.
      }
    }

    return { ok: true, grant: toSafeGrant(grant) };
  }

  // WHAT: Revoke a marketplace data grant (provider-side). Future use denied.
  // WHY: POST /api/v1/foundation/marketplace/data-grants/:grant_id/revoke.
  //      Only the provider (or the granting buyer stopping their own use) may
  //      revoke. No cascade is claimed (no lineage substrate). Audited.
  async revokeDataGrantForCaller(
    sessionToken: string,
    grantId: string,
    reason?: string,
  ): Promise<DataGrantResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const grant = await prisma.marketplaceDataGrant.findFirst({
      where: { grant_id: grantId },
    });
    // Enumeration-safe: only provider or buyer of the grant may even see it.
    if (
      grant === null ||
      (grant.provider_entity_id !== validation.entity_id &&
        grant.buyer_entity_id !== validation.entity_id)
    )
      return { ok: false, code: "GRANT_NOT_FOUND" };
    if (grant.status === "REVOKED")
      return { ok: true, grant: toSafeGrant(grant) }; // idempotent

    const updated = await prisma.marketplaceDataGrant.update({
      where: { grant_id: grantId },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
        revocation_reason:
          typeof reason === "string" && reason.length > 0 ? reason : null,
      },
    });
    await writeAuditEvent({
      event_type: "MARKETPLACE_DATA_GRANT_REVOKED",
      outcome: "SUCCESS",
      actor_entity_id: validation.entity_id,
      details: {
        action: "MARKETPLACE_DATA_GRANT_REVOKED",
        grant_id: grantId,
        listing_id: grant.listing_id,
        status: "REVOKED",
        cascade_claimed: false,
      },
    });
    return { ok: true, grant: toSafeGrant(updated) };
  }

  // WHAT: List the caller's data grants (as provider OR buyer). Scope-safe.
  async listDataGrantsForCaller(
    sessionToken: string,
  ): Promise<DataGrantListResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const rows = await prisma.marketplaceDataGrant.findMany({
      where: {
        OR: [
          { provider_entity_id: validation.entity_id },
          { buyer_entity_id: validation.entity_id },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { ok: true, grants: rows.map(toSafeGrant) };
  }

  // WHAT: Read one data grant (provider OR buyer only; enumeration-safe).
  async getDataGrantForCaller(
    sessionToken: string,
    grantId: string,
  ): Promise<DataGrantResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const grant = await prisma.marketplaceDataGrant.findFirst({
      where: { grant_id: grantId },
    });
    if (
      grant === null ||
      (grant.provider_entity_id !== validation.entity_id &&
        grant.buyer_entity_id !== validation.entity_id)
    )
      return { ok: false, code: "GRANT_NOT_FOUND" };
    return { ok: true, grant: toSafeGrant(grant) };
  }

  // WHAT: List the caller's grants filtered to ONE role — "buyer" (what I have
  //       access to / purchased) or "provider" (grants on MY data). Phase 1311-B
  //       buyer console + 1312-A contributor sovereignty both consume this; the
  //       mixed-role listDataGrantsForCaller stays for back-compat.
  // WHY: GET /marketplace/my-data-grants?role=buyer|provider.
  async listDataGrantsByRoleForCaller(
    sessionToken: string,
    role: "buyer" | "provider",
  ): Promise<DataGrantListResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const where =
      role === "provider"
        ? { provider_entity_id: validation.entity_id }
        : { buyer_entity_id: validation.entity_id };
    const rows = await prisma.marketplaceDataGrant.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: 200,
    });
    return { ok: true, grants: rows.map(toSafeGrant) };
  }

  // WHAT: Derive a grant's usage from the append-only audit chain — successful
  //       reads, denied attempts, and the last access instant.
  // WHY: no persisted read counter exists; the audit chain is the source of
  //      truth (mirrors the 1309-A metering-off-audit pattern).
  private async grantUsageSummary(grantId: string): Promise<DataGrantUsageSummary> {
    const base = {
      event_type: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
      details: { path: ["grant_id"], equals: grantId },
    } as const;
    const [read_count, denied_count, lastRead] = await Promise.all([
      prisma.auditEvent.count({ where: { ...base, outcome: "SUCCESS" } }),
      prisma.auditEvent.count({ where: { ...base, outcome: "DENIED" } }),
      prisma.auditEvent.findFirst({
        where: { ...base, outcome: "SUCCESS" },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
    ]);
    return {
      read_count,
      denied_count,
      last_accessed_at: lastRead?.timestamp.toISOString() ?? null,
    };
  }

  // WHAT: The Buyer Access Console summary for ONE of the caller's grants —
  //       grant + governed resource label + the access policy + audit-derived
  //       usage + mock-only settlement intent.
  // WHY: GET /marketplace/data-grants/:grant_id/console. Buyer-scoped + enumeration
  //      safe (a grant the caller is not the BUYER of → GRANT_NOT_FOUND). Never
  //      raw content; never other buyers' grants; never contributor identities
  //      beyond the provider already on the SAFE grant view.
  async getBuyerGrantConsoleForCaller(
    sessionToken: string,
    grantId: string,
  ): Promise<BuyerGrantConsoleResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };

    const grant = await prisma.marketplaceDataGrant.findFirst({
      where: { grant_id: grantId },
    });
    // Buyer-scoped: only the BUYER sees their own access console (enumeration-safe).
    if (grant === null || grant.buyer_entity_id !== validation.entity_id)
      return { ok: false, code: "GRANT_NOT_FOUND" };

    const [pkg, listing, usage] = await Promise.all([
      prisma.marketplaceDataPackage.findFirst({
        where: { data_package_id: grant.data_package_id },
      }),
      prisma.marketplaceListing.findFirst({
        where: { listing_id: grant.listing_id },
        select: { title: true, listing_type: true },
      }),
      this.grantUsageSummary(grant.grant_id),
    ]);

    return {
      ok: true,
      console: {
        grant: toSafeGrant(grant),
        resource: {
          listing_title: listing?.title ?? null,
          listing_type: listing?.listing_type ?? null,
        },
        policy: {
          allowed_uses: pkg?.allowed_use ?? [],
          training_allowed: pkg?.training_allowed ?? false,
          model_improvement_allowed: pkg?.model_improvement_allowed ?? false,
          sensitivity_class: pkg?.sensitivity_class ?? null,
          aggregate_only: pkg?.aggregate_only ?? false,
          depersonalized_only: pkg?.depersonalized_only ?? false,
          minimum_aggregation_size: pkg?.minimum_aggregation_size ?? null,
          raw_body_excluded: true,
        },
        usage,
        settlement: {
          is_mock: true,
          economic_decision: grant.economic_decision,
          note: "Mock-only settlement intent — no funds move and no settlement exists.",
        },
      },
    };
  }

  // WHAT: The Contributor Sovereignty view for ONE grant on the caller's data —
  //       who has access, under what policy, how it has been used, and its
  //       revocation status. Phase 1312-A.
  // WHY: GET /marketplace/data-grants/:grant_id/sovereignty. Provider-scoped +
  //      enumeration safe (a grant the caller is not the PROVIDER of →
  //      GRANT_NOT_FOUND). Revocation itself is the existing
  //      revokeDataGrantForCaller; this surfaces the controls' context. The core
  //      truth: governed access is leased under consent + proof — and revocation
  //      is VISIBLE and enforced at read time.
  async getProviderGrantSovereigntyForCaller(
    sessionToken: string,
    grantId: string,
  ): Promise<ProviderGrantSovereigntyResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };

    const grant = await prisma.marketplaceDataGrant.findFirst({
      where: { grant_id: grantId },
    });
    // Provider-scoped: only the data owner sees the sovereignty view.
    if (grant === null || grant.provider_entity_id !== validation.entity_id)
      return { ok: false, code: "GRANT_NOT_FOUND" };

    const [pkg, listing, usage] = await Promise.all([
      prisma.marketplaceDataPackage.findFirst({
        where: { data_package_id: grant.data_package_id },
      }),
      prisma.marketplaceListing.findFirst({
        where: { listing_id: grant.listing_id },
        select: { title: true, listing_type: true },
      }),
      this.grantUsageSummary(grant.grant_id),
    ]);

    const now = Date.now();
    const isActive =
      grant.status === "ACTIVE" &&
      grant.revoked_at === null &&
      (grant.expires_at === null || grant.expires_at.getTime() > now);
    // In-force grants (ACTIVE or still PENDING_CONSENT) can be revoked.
    const revocable = grant.status === "ACTIVE" || grant.status === "PENDING_CONSENT";

    return {
      ok: true,
      sovereignty: {
        grant: toSafeGrant(grant),
        resource: {
          listing_title: listing?.title ?? null,
          listing_type: listing?.listing_type ?? null,
        },
        policy: {
          allowed_uses: pkg?.allowed_use ?? [],
          training_allowed: pkg?.training_allowed ?? false,
          model_improvement_allowed: pkg?.model_improvement_allowed ?? false,
          sensitivity_class: pkg?.sensitivity_class ?? null,
          aggregate_only: pkg?.aggregate_only ?? false,
          depersonalized_only: pkg?.depersonalized_only ?? false,
          raw_body_excluded: true,
        },
        usage,
        sovereignty: {
          is_active: isActive,
          revocable,
          status: grant.status,
          revoked_at: grant.revoked_at?.toISOString() ?? null,
          revocation_reason: grant.revocation_reason,
          expires_at: grant.expires_at?.toISOString() ?? null,
          revocation_enforced_at_read: true,
        },
      },
    };
  }
}
