// FILE: marketplace-data-delivery.service.ts
// PURPOSE: Phase 1295-A — COSMP-governed DATA-READ DELIVERY for marketplace
//          data grants. Turns an ACTIVE MarketplaceDataGrant into a SAFE,
//          governed read result — never raw data export, never ownership
//          transfer, never a COSMP bypass.
//
//          This is "COSMP-governed safe access delivery", NOT "raw data
//          delivery". A marketplace buyer holds no Permission on the provider's
//          capsules, so this path uses the GRANT as the authorization basis and
//          returns only SAFE PROJECTIONS (metadata-tier: capsule_type, a safe
//          summary where the access mode permits, sensitivity, timestamps,
//          provenance) plus a per-item grant-proof attestation. Raw capsule
//          content and a real per-capsule COSMP Permission read remain
//          forward-substrate (a buyer who needs decrypted content needs an
//          explicit COSMP permission — not delivered here).
//
//          Foundation remains authority; the DMW stays the governed container;
//          Memory Capsules stay atomic governed objects; access honors the
//          buyer's clearance, ai_access_blocked / requires_validation (excluded
//          for non-owner marketplace buyers), jurisdiction, soft-delete, the
//          capsule_type_allowlist, consent/opt-in/revocation, allowed_use, and
//          the sensitivity gate. Economics stay mock-only.
//
// CONNECTS TO:
//   - packages/database MarketplaceDataGrant / MarketplaceDataConsent /
//     MarketplaceDataPackage / MemoryCapsule / Wallet (read) + writeAuditEvent
//     + verifyAuditChain.
//   - apps/api/src/services/foundation/authority.service.ts
//     (computeAuthorityEnvelope — buyer authority + clearance).
//   - apps/api/src/services/foundation/marketplace.service.ts
//     (POLICY_GATED_CATEGORIES; DATA_ACCESS_MODES).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY: SAFE PROJECTION ONLY. Never returns raw capsule body / payload_content
// / storage_location / content_hash / embedding / device_id / PII / provider
// secrets. `safe_summary` is a renamed projection of payload_summary, omitted
// for proof-only / reference / depersonalized packages. Buyer-only +
// enumeration-safe. Revoked / expired / high-sensitivity are denied.

import {
  prisma,
  writeAuditEvent,
  verifyAuditChain,
  type DataAccessMode,
  type DataSensitivityClass,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { computeAuthorityEnvelope } from "./authority.service.js";
import {
  evaluateHighSensitivityAccess,
  isHighSensitivityPackage,
} from "./high-sensitivity-policy.js";
import { resolveReviewDecisionForGrantRead } from "./high-sensitivity-review.service.js";

const READ_RESULT_MAX = 50;
const READ_RESULT_DEFAULT = 10;

export interface SafeReadItemProof {
  can_read_now: boolean;
  // Marketplace-grant attestation (NOT a COSMP Permission proof — the buyer has
  // no permission on these capsules; the grant is the basis). Raw content still
  // requires an explicit COSMP permission, which this path does not deliver.
  result: "MARKETPLACE_GRANT_AUTHORIZED";
  proof_reference: string;
  chain_verified: boolean;
  evaluated_at: string;
}

export interface SafeReadItem {
  safe_label: string;
  capsule_type: string;
  // Present only for SAFE_PROJECTION / MEMORY_CAPSULE_BUNDLE / RETRIEVAL_QUERY,
  // and only when the package is not depersonalized/aggregate-only.
  safe_summary?: string;
  sensitivity_class: DataSensitivityClass;
  created_at: string;
  updated_at: string;
  provenance: string;
  proof: SafeReadItemProof;
}

export interface DataGrantReadResult {
  grant_id: string;
  listing_id: string;
  data_package_id: string;
  access_mode: DataAccessMode;
  intended_use: string;
  status: "DELIVERED" | "NO_MATCH" | "DENIED";
  raw_body_excluded: true;
  proof_delivery: "PER_CAPSULE_AT_READ_TIME";
  items: SafeReadItem[];
  denied_reasons: string[];
  honest_note: string;
  evaluated_at: string;
}

export type DataGrantReadResponse =
  | { ok: true; read: DataGrantReadResult }
  | { ok: false; code: string; denied_reasons?: string[] };

// Modes that never carry a summary (reference/proof only).
const NO_SUMMARY_MODES = new Set<DataAccessMode>([
  "PROOF_ONLY",
  "CAPSULE_REFERENCE",
]);

export class MarketplaceDataDeliveryService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Deliver a governed SAFE read for an ACTIVE data grant.
  // INPUT: token + grant_id + optional { access_mode, query, capsule_type_filter, limit }.
  // OUTPUT: { ok:true, read } or { ok:false, code }.
  // WHY: POST /api/v1/foundation/marketplace/data-grants/:id/read.
  async readDataGrantForCaller(
    sessionToken: string,
    grantId: string,
    input: {
      access_mode?: string;
      query?: string;
      capsule_type_filter?: string[];
      limit?: number;
    },
  ): Promise<DataGrantReadResponse> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) return { ok: false, code: validation.code };
    const buyerEntityId = validation.entity_id;

    // Buyer-only + enumeration-safe: only the grant's buyer may read it.
    const grant = await prisma.marketplaceDataGrant.findFirst({
      where: { grant_id: grantId },
    });
    if (grant === null || grant.buyer_entity_id !== buyerEntityId)
      return { ok: false, code: "GRANT_NOT_FOUND" };

    const emitDenied = async (reasons: string[]): Promise<void> => {
      await writeAuditEvent({
        event_type: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
        outcome: "DENIED",
        actor_entity_id: buyerEntityId,
        denial_reason: reasons[0] ?? "read-not-permitted",
        details: {
          action: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
          grant_id: grantId,
          listing_id: grant.listing_id,
          data_package_id: grant.data_package_id,
          status: "DENIED",
          denied_reasons: reasons,
        },
      });
    };

    // Grant must be ACTIVE + not expired.
    if (grant.status !== "ACTIVE") {
      await emitDenied(["grant-not-active"]);
      return { ok: false, code: "GRANT_NOT_ACTIVE", denied_reasons: ["grant-not-active"] };
    }
    if (grant.expires_at !== null && grant.expires_at <= new Date()) {
      await emitDenied(["grant-expired"]);
      return { ok: false, code: "GRANT_EXPIRED", denied_reasons: ["grant-expired"] };
    }

    // Consent must exist + not be revoked/expired.
    if (grant.consent_record_id !== null) {
      const consent = await prisma.marketplaceDataConsent.findFirst({
        where: { consent_id: grant.consent_record_id },
      });
      if (
        consent === null ||
        consent.revoked_at !== null ||
        (consent.expires_at !== null && consent.expires_at <= new Date())
      ) {
        await emitDenied(["consent-not-active"]);
        return { ok: false, code: "CONSENT_NOT_ACTIVE", denied_reasons: ["consent-not-active"] };
      }
    }

    const pkg = await prisma.marketplaceDataPackage.findFirst({
      where: { data_package_id: grant.data_package_id, deleted_at: null },
    });
    if (pkg === null) {
      await emitDenied(["data-package-not-found"]);
      return { ok: false, code: "DATA_PACKAGE_NOT_FOUND" };
    }

    const denied: string[] = [];
    // Intended use must still be offered + elevated rights opt-in.
    if (!pkg.allowed_use.includes(grant.intended_use))
      denied.push("intended-use-not-offered");
    if (grant.intended_use === "TRAINING" && !pkg.training_allowed)
      denied.push("training-not-permitted");
    if (grant.intended_use === "MODEL_IMPROVEMENT" && !pkg.model_improvement_allowed)
      denied.push("model-improvement-not-permitted");

    // Effective access mode: the GRANT's authorized mode, or a narrower
    // PROOF_ONLY request. The grant (not the package) is the authorization
    // basis — a high-sensitivity review may have downgraded the grant to a
    // narrower safe mode than the package offers (1297-A), and a package may be
    // edited after a grant is issued; honoring the grant prevents both from
    // silently widening access.
    const requested = (input.access_mode ?? grant.access_mode) as DataAccessMode;
    const effectiveMode: DataAccessMode =
      requested === grant.access_mode || requested === "PROOF_ONLY"
        ? requested
        : grant.access_mode;
    if (requested !== grant.access_mode && requested !== "PROOF_ONLY")
      denied.push("access-mode-exceeds-grant");

    // Sensitivity gate (1296-A + 1297-A): high-sensitivity / policy-gated
    // packages re-run the DEDICATED high-sensitivity policy evaluator at READ
    // time, against the effective mode. Only safe modes may be delivered; raw
    // content is never permitted. CHILDREN -> deny; MEDICAL/BIOMETRIC ->
    // proof-only auto, else review; HEALTH -> safe projection under strict
    // controls. When the evaluator returns REQUIRES_REVIEW, a matching APPROVED
    // human review (consulted here) may authorize the effective safe mode —
    // re-checked live (not expired / not revoked) at every read (1297-A).
    let reviewIdForRead: string | null = null;
    if (isHighSensitivityPackage(pkg.sensitivity_class, pkg.sensitive_categories)) {
      const hs = evaluateHighSensitivityAccess({
        sensitivity_class: pkg.sensitivity_class,
        sensitive_categories: pkg.sensitive_categories,
        access_mode: effectiveMode,
        intended_use: grant.intended_use,
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
      if (hs.decision === "REQUIRES_REVIEW") {
        const resolved = await resolveReviewDecisionForGrantRead(
          buyerEntityId,
          grant.data_package_id,
          grant.intended_use,
          effectiveMode,
        );
        if (resolved.allowed) reviewIdForRead = resolved.review_id;
        else denied.push("REVIEW_REQUIRED");
      } else if (!hs.decision.startsWith("ALLOW")) {
        denied.push(hs.reason_codes[0] ?? "HIGH_SENSITIVITY_DEFAULT_DENY");
      } else if (!hs.allowed_access_modes.includes(effectiveMode)) {
        denied.push("access-mode-not-allowed-for-sensitivity");
      }
      const sensitivityAllowed =
        hs.decision.startsWith("ALLOW") || reviewIdForRead !== null;
      await writeAuditEvent({
        event_type: "HIGH_SENSITIVITY_POLICY_EVALUATED",
        outcome: sensitivityAllowed ? "SUCCESS" : "DENIED",
        actor_entity_id: buyerEntityId,
        denial_reason: sensitivityAllowed ? null : hs.reason_codes[0] ?? null,
        details: {
          action: "HIGH_SENSITIVITY_POLICY_EVALUATED",
          listing_id: grant.listing_id,
          data_package_id: grant.data_package_id,
          grant_id: grant.grant_id,
          sensitivity_class: pkg.sensitivity_class,
          sensitive_categories: pkg.sensitive_categories,
          intended_use: grant.intended_use,
          access_mode: effectiveMode,
          decision: hs.decision,
          reason_codes: hs.reason_codes,
          human_review_required: hs.human_review_required,
          review_id: reviewIdForRead,
        },
      });
    }

    if (denied.length > 0) {
      await emitDenied(denied);
      return { ok: false, code: "READ_NOT_PERMITTED", denied_reasons: denied };
    }

    // Buyer authority (clearance) — never the request.
    const buyer = await prisma.entity.findFirst({
      where: { entity_id: buyerEntityId, deleted_at: null },
    });
    if (buyer === null) return { ok: false, code: "ENTITY_NOT_FOUND" };
    const [buyerTar, buyerWallet] = await Promise.all([
      prisma.tokenAttributeRepository.findUnique({ where: { entity_id: buyerEntityId } }),
      prisma.wallet.findUnique({ where: { entity_id: buyerEntityId } }),
    ]);
    const envelope = computeAuthorityEnvelope({ entity: buyer, tar: buyerTar, wallet: buyerWallet });
    if (!envelope.can_know.can_read_capsules) {
      await emitDenied(["buyer-authority-insufficient"]);
      return { ok: false, code: "READ_NOT_PERMITTED", denied_reasons: ["buyer-authority-insufficient"] };
    }

    // Select the PROVIDER's capsules in scope — safe fields only.
    const providerWallet = await prisma.wallet.findUnique({
      where: { entity_id: grant.provider_entity_id },
    });
    const limit = Math.min(
      Math.max(1, typeof input.limit === "number" ? input.limit : READ_RESULT_DEFAULT),
      READ_RESULT_MAX,
    );
    const typeFilter =
      Array.isArray(input.capsule_type_filter) && input.capsule_type_filter.length > 0
        ? pkg.capsule_type_allowlist.filter((t) =>
            input.capsule_type_filter!.includes(t),
          )
        : pkg.capsule_type_allowlist;

    let items: SafeReadItem[] = [];
    if (providerWallet !== null && typeFilter.length > 0) {
      const candidates = await prisma.memoryCapsule.findMany({
        where: {
          wallet_id: providerWallet.wallet_id,
          deleted_at: null,
          capsule_type: { in: typeFilter as never },
          clearance_required: { lte: envelope.can_know.clearance_ceiling },
          // Non-owner marketplace buyers never see AI-blocked or
          // validation-gated capsules (RULE 0 — a human walled these off).
          ai_access_blocked: false,
          requires_validation: false,
        },
        select: {
          capsule_type: true,
          payload_summary: true,
          jurisdiction: true,
          created_at: true,
          last_updated_at: true,
        },
        orderBy: { last_updated_at: "desc" },
        take: limit * 3,
      });

      // Jurisdiction + deterministic query filter, then cap to limit.
      const buyerJurisdiction = buyer.jurisdiction;
      const q = (input.query ?? "").trim().toLowerCase();
      const chain = await verifyAuditChain(buyerEntityId);
      const now = new Date().toISOString();
      const includeSummary = !NO_SUMMARY_MODES.has(effectiveMode) &&
        !pkg.depersonalized_only && !pkg.aggregate_only;

      items = candidates
        .filter((c) => {
          if (
            buyerJurisdiction !== null &&
            c.jurisdiction !== null &&
            c.jurisdiction !== buyerJurisdiction
          )
            return false;
          if (
            q.length > 0 &&
            !c.payload_summary.toLowerCase().includes(q)
          )
            return false;
          return true;
        })
        .slice(0, limit)
        .map((c, i): SafeReadItem => ({
          safe_label: `${c.capsule_type} item ${i + 1}`,
          capsule_type: c.capsule_type,
          ...(includeSummary ? { safe_summary: c.payload_summary } : {}),
          sensitivity_class: pkg.sensitivity_class,
          created_at: c.created_at.toISOString(),
          updated_at: c.last_updated_at.toISOString(),
          provenance: "MARKETPLACE_DATA_GRANT",
          proof: {
            can_read_now: true,
            result: "MARKETPLACE_GRANT_AUTHORIZED",
            proof_reference: `${grant.grant_id}#${i + 1}`,
            chain_verified: chain.valid,
            evaluated_at: now,
          },
        }));
    }

    const status: DataGrantReadResult["status"] =
      items.length > 0 ? "DELIVERED" : "NO_MATCH";

    await writeAuditEvent({
      event_type: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
      outcome: "SUCCESS",
      actor_entity_id: buyerEntityId,
      details: {
        action: "MARKETPLACE_DATA_GRANT_READ_EVALUATED",
        grant_id: grantId,
        listing_id: grant.listing_id,
        data_package_id: grant.data_package_id,
        access_mode: effectiveMode,
        intended_use: grant.intended_use,
        status,
        result_count: items.length,
        proof_delivery: "PER_CAPSULE_AT_READ_TIME",
        review_id: reviewIdForRead,
      },
    });

    return {
      ok: true,
      read: {
        grant_id: grant.grant_id,
        listing_id: grant.listing_id,
        data_package_id: grant.data_package_id,
        access_mode: effectiveMode,
        intended_use: grant.intended_use,
        status,
        raw_body_excluded: true,
        proof_delivery: "PER_CAPSULE_AT_READ_TIME",
        items,
        denied_reasons: [],
        honest_note:
          "Governed safe-projection delivery — never raw capsule content. " +
          "This is COSMP-governed marketplace access under your grant, not a " +
          "data export. Per-item proof attests grant authorization; decrypted " +
          "content still requires an explicit COSMP permission (not delivered " +
          "here). Access honors clearance, jurisdiction, soft-delete, the " +
          "capsule-type allowlist, consent, and revocation.",
        evaluated_at: new Date().toISOString(),
      },
    };
  }
}
