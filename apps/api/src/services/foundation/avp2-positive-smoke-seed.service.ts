// FILE: avp2-positive-smoke-seed.service.ts
// PURPOSE: F-1362 — AVP² Positive-Smoke Seed. A LOCAL/DEV-ONLY operator helper
//          that creates (or idempotently reuses) a SAFE, non-production
//          MarketplaceListing + CONTENT_FRAGMENT resource that the existing
//          Foundation-backed AVP² flow (resource-contract projection → quote →
//          accept → access → proof) can actually quote and access. It does NOT
//          create isolated data and does NOT bypass governance: it goes through
//          the same FoundationMarketplaceService.createListingForCaller path used
//          by POST /api/v1/foundation/marketplace/listings, so the seeded listing
//          is a first-class governed listing.
//
//          Safe by construction: mock settlement only, never real payment, never a
//          public listing, never production/private user data, never raw content.
//          The seeded resource carries NO content body — only governance metadata.
//
//          This is NOT live proof by itself. It prepares data; the live proof is
//          the niov-avp positive smoke driving quote→accept→access→proof against
//          this listing. The agent does not scrape — the agent asks for a quote.
//
// CONNECTS TO: ./marketplace.service (createListingForCaller, listListingsForCaller),
//          apps/api/src/routes/foundation.routes.ts (the dev-gated route).

import type { FoundationMarketplaceService } from "./marketplace.service.js";

// Stable identifiers so repeated safe calls are idempotent (reuse, never spam).
export const POSITIVE_SMOKE_SEED_KEY = "avp-positive-smoke-v0.1";
export const POSITIVE_SMOKE_SEED_TITLE = "AVP² Positive Smoke Test Listing";
export const POSITIVE_SMOKE_RESOURCE_ID = "avp-positive-smoke.content-fragment";
export const POSITIVE_SMOKE_SELECTOR = "paragraph_range:12-15";

// The materializer-facing response (flat shape it reads at the top level). The
// edge label is MOCK_CREDITS; Foundation's substrate label is MOCK_ONLY.
export interface Avp2PositiveSmokeSeedResponse {
  listing_id: string;
  resource_id: string;
  foundation_base_url: string;
  selector: string;
  delivered_required: false;
  settlement_mode: "MOCK_CREDITS";
  real_payment: false;
  public_listing: false;
  production_data: false;
  contains_private_user_data: false;
}

export type Avp2PositiveSmokeSeedResult =
  | { ok: true; seed: Avp2PositiveSmokeSeedResponse; created: boolean }
  | { ok: false; code: string };

// Value-only forbidden markers — a leaked secret would land in a string VALUE.
const SEED_FORBIDDEN_MARKERS = [
  "foundation_bearer_token", "authorization", "bearer", "access_token", "token_hash",
  "private_key", "sk_live", "sk_test", "wallet_private_key", "real_user", "production_user",
  "production data", "raw sensitive content", "content body", "proof body",
];
const SEED_PAYMENT_LABELS = ["usdc", "stripe", "wallet", "card", "real_payment"];

function collectValues(node: unknown, out: string[]): void {
  if (typeof node === "string") { out.push(node); return; }
  if (Array.isArray(node)) { for (const v of node) collectValues(v, out); return; }
  if (typeof node === "object" && node !== null) for (const v of Object.values(node)) collectValues(v, out);
}

// WHAT: reject an unsafe seed request. Returns an error code, or null when safe.
//       Missing flags default to safe (the endpoint only ever creates safe data),
//       but an explicitly unsafe flag is refused.
export function validateSafeSeedBody(body: unknown): string | null {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (b.settlement_mode !== undefined && b.settlement_mode !== "MOCK_CREDITS" && b.settlement_mode !== "MOCK_ONLY") return "SAFE_SEED_REQUIRED";
  if (b.real_payment === true) return "REAL_PAYMENT_NOT_ALLOWED";
  if (b.public_listing === true) return "PUBLIC_LISTING_NOT_ALLOWED";
  if (b.production_data === true) return "PRODUCTION_DATA_NOT_ALLOWED";
  if (b.contains_private_user_data === true) return "PRIVATE_USER_DATA_NOT_ALLOWED";
  const listing = (typeof b.listing === "object" && b.listing !== null ? b.listing : {}) as Record<string, unknown>;
  if (listing.public_listing === true) return "PUBLIC_LISTING_NOT_ALLOWED";
  if (listing.protocol !== undefined && listing.protocol !== "AVP2") return "UNSUPPORTED_PROTOCOL";
  const resource = (typeof b.resource === "object" && b.resource !== null ? b.resource : {}) as Record<string, unknown>;
  if (resource.resource_type !== undefined && resource.resource_type !== "CONTENT_FRAGMENT" && resource.resource_type !== "ACTION") return "UNSUPPORTED_RESOURCE_TYPE";
  if (resource.training_allowed === true || resource.redistribution_allowed === true || resource.commercial_ai_allowed === true) return "SAFE_SEED_REQUIRED";
  const values: string[] = [];
  collectValues(body, values);
  for (const val of values) {
    const lower = val.toLowerCase();
    if (SEED_FORBIDDEN_MARKERS.some((m) => lower.includes(m))) return "SAFE_SEED_REQUIRED";
    if (SEED_PAYMENT_LABELS.some((l) => new RegExp(`\\b${l}\\b`, "i").test(val))) return "REAL_PAYMENT_NOT_ALLOWED";
  }
  return null;
}

// The safe governance metadata the seeded listing carries. No content body — only
// the governance + a resource descriptor the AVP² projection can quote against.
function safeTrustMetadata(): Record<string, unknown> {
  return {
    seed_key: POSITIVE_SMOKE_SEED_KEY,
    license_terms: "AVP2-Positive-Smoke-Test-v1",
    proof_required: true,
    quote_required: true,
    training_allowed: false,
    redistribution_allowed: false,
    commercial_ai_allowed: false,
    metering_unit: "paragraph",
    allowed_uses: ["READING"],
    selector_support: ["paragraph_range"],
    resources: [
      {
        resource_id: POSITIVE_SMOKE_RESOURCE_ID,
        resource_type: "CONTENT_FRAGMENT",
        title: "AVP² Positive Smoke Content Fragment",
        selector_support: ["paragraph_range"],
        mock_price_floor: 0.01,
        mock_price_ceiling: 0.04,
      },
    ],
  };
}

function buildResponse(listingId: string, foundationBaseUrl: string): Avp2PositiveSmokeSeedResponse {
  return {
    listing_id: listingId,
    resource_id: POSITIVE_SMOKE_RESOURCE_ID,
    foundation_base_url: foundationBaseUrl,
    selector: POSITIVE_SMOKE_SELECTOR,
    delivered_required: false,
    settlement_mode: "MOCK_CREDITS",
    real_payment: false,
    public_listing: false,
    production_data: false,
    contains_private_user_data: false,
  };
}

export class Avp2PositiveSmokeSeedService {
  constructor(private readonly marketplace: FoundationMarketplaceService) {}

  // WHAT: create or idempotently reuse the safe positive-smoke listing for the
  //       caller, returning the materializer-facing seed descriptor.
  async seedForCaller(
    sessionToken: string,
    body: unknown,
    foundationBaseUrl: string,
  ): Promise<Avp2PositiveSmokeSeedResult> {
    const unsafe = validateSafeSeedBody(body);
    if (unsafe !== null) return { ok: false, code: unsafe };

    // Idempotency: reuse an existing seed listing owned by the caller.
    const existing = await this.marketplace.listListingsForCaller(sessionToken);
    if (existing.ok === false) return { ok: false, code: existing.code };
    const prior = existing.listings.find(
      (l) =>
        l.title === POSITIVE_SMOKE_SEED_TITLE &&
        ((l.trust_metadata as { seed_key?: unknown } | null)?.seed_key === POSITIVE_SMOKE_SEED_KEY),
    );
    if (prior !== undefined) return { ok: true, created: false, seed: buildResponse(prior.listing_id, foundationBaseUrl) };

    const created = await this.marketplace.createListingForCaller(sessionToken, {
      listing_type: "SERVICE",
      title: POSITIVE_SMOKE_SEED_TITLE,
      description: "Safe non-production AVP² positive-smoke test listing. Mock settlement only; no real payment; private; no content body.",
      status: "PUBLISHED",
      trust_metadata: safeTrustMetadata(),
    });
    if (created.ok === false) return { ok: false, code: created.code };
    return { ok: true, created: true, seed: buildResponse(created.listing.listing_id, foundationBaseUrl) };
  }
}
