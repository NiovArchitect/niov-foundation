// FILE: foundation-marketplace.test.ts (integration)
// PURPOSE: Phase 1292-A — HTTP coverage for the marketplace substrate. Proves:
//          auth required; a provider creates a listing; discovery is tenant-
//          scoped (own + PUBLISHED in-org; cross-org listings invisible);
//          enumeration-safe LISTING_NOT_FOUND for an out-of-org listing; access
//          evaluation composes authority + mock-only payment (a priced listing
//          → mock payment decision, never real settlement); a free listing →
//          can_use; and the wire never implies real settlement. End-to-end.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts
//   - apps/api/src/services/foundation/marketplace.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-marketplace-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let CONSUMER_TOKEN: string;
let OUTSIDER_TOKEN: string;
let AGENT_TOKEN: string;
let APP_TOKEN: string;
const store = new MemoryRateLimitStore();

async function member(
  orgId: string,
  ops: string[],
  entity_type: "PERSON" | "AI_AGENT" | "APPLICATION" = "PERSON",
): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type, password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: e.entity_id, role_title: "MEMBER", is_active: true },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return (login.json() as { token: string }).token;
}

// A solo / orgless provider — a first-class PERSONAL DMW owner with NO
// EntityMembership. callerOrgOrNull resolves to null for them. This is the
// PRIMARY 1301-A case: a personal provider opting a listing into cross-org reach.
async function solo(ops: string[]): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  await createEntity(input);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ops },
  });
  return (login.json() as { token: string }).token;
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(randomBytes(32)),
    rateLimitStore: store,
  });
  const orgA = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}mpA_${randomUUID()}`,
    email: `${TEST_PREFIX}mpA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}mpB_${randomUUID()}`,
    email: `${TEST_PREFIX}mpB_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  CONSUMER_TOKEN = await member(orgA.entity_id, ["read", "write"]);
  OUTSIDER_TOKEN = await member(orgB.entity_id, ["read", "write"]);
  AGENT_TOKEN = await member(orgA.entity_id, ["read", "write"], "AI_AGENT");
  APP_TOKEN = await member(orgA.entity_id, ["read", "write"], "APPLICATION");
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

function createListing(body: Record<string, unknown>, token: string | null) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/listings",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}
function access(listingId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/access`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Foundation marketplace substrate", () => {
  it("401s without auth", async () => {
    const res = await createListing({ listing_type: "TOOL", title: "x", description: "y" }, null);
    expect(res.statusCode).toBe(401);
  });

  it("a provider creates a PUBLISHED listing", async () => {
    const res = await createListing(
      { listing_type: "TOOL", title: "Summarizer", description: "Summarize text", status: "PUBLISHED", pricing_model: { model: "PER_USE", amount_usd: 0.01 } },
      PROVIDER_TOKEN,
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; listing: { listing_id: string; status: string } };
    expect(body.ok).toBe(true);
    expect(body.listing.status).toBe("PUBLISHED");
  });

  it("rejects an invalid listing type", async () => {
    const res = await createListing({ listing_type: "NONSENSE", title: "x", description: "y" }, PROVIDER_TOKEN);
    expect(res.statusCode).toBe(422);
  });

  it("a same-org consumer discovers the PUBLISHED listing; an outsider does not", async () => {
    await createListing(
      { listing_type: "SKILL", title: "OrgVisible", description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const inOrg = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/listings",
      headers: { authorization: `Bearer ${CONSUMER_TOKEN}` },
    });
    const titles = (inOrg.json() as { listings: { title: string }[] }).listings.map((l) => l.title);
    expect(titles).toContain("OrgVisible");

    const outsider = await app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/listings",
      headers: { authorization: `Bearer ${OUTSIDER_TOKEN}` },
    });
    const outTitles = (outsider.json() as { listings: { title: string }[] }).listings.map((l) => l.title);
    expect(outTitles).not.toContain("OrgVisible"); // cross-org isolation
  });

  it("access on a priced listing → mock-only payment decision (never real settlement)", async () => {
    const created = await createListing(
      { listing_type: "SERVICE", title: "PaidSvc", description: "d", status: "PUBLISHED", pricing_model: { amount_usd: 0.01 } },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await access(listingId, CONSUMER_TOKEN);
    expect(res.statusCode).toBe(200);
    const a = (res.json() as { access: Record<string, unknown> }).access;
    expect(a.can_use).toBe(true);
    expect(a.can_request).toBe(true);
    expect((a.payment as { settlement_mode: string }).settlement_mode).toBe("MOCK_ONLY");
    expect((a.payment as { real_provider_enabled: boolean }).real_provider_enabled).toBe(false);
    expect(a.memory_access_requires_explicit_permission).toBe(true);
    expect(res.payload).not.toContain('"real_provider_enabled":true');
  });

  it("a free listing → can_use with no payment object", async () => {
    const created = await createListing(
      { listing_type: "AGENT", title: "FreeAgent", description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await access(listingId, CONSUMER_TOKEN);
    expect(res.statusCode).toBe(200);
    const a = (res.json() as { access: { can_use: boolean; can_pay: boolean; payment: unknown } }).access;
    expect(a.can_use).toBe(true);
    expect(a.can_pay).toBe(true);
    expect(a.payment).toBeNull();
  });

  it("an out-of-org consumer cannot access a listing (enumeration-safe 404)", async () => {
    const created = await createListing(
      { listing_type: "APP", title: "OrgAOnly", description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await access(listingId, OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("LISTING_NOT_FOUND");
  });
});

function createDataPackage(body: Record<string, unknown>, token: string | null) {
  return app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}
function dataAccess(listingId: string, intendedUse: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/data-access`,
    headers: { authorization: `Bearer ${token}` },
    payload: { intended_use: intendedUse },
  });
}

describe("Foundation DATA marketplace (governed data-access products)", () => {
  it("a provider creates a DATA_PACKAGE listing with safe defaults", async () => {
    const res = await createDataPackage(
      {
        title: "Customer signals",
        description: "depersonalized customer behavior signals",
        access_mode: "SAFE_PROJECTION",
        capsule_type_allowlist: ["BEHAVIORAL_PATTERN"],
        allowed_use: ["ANALYTICS", "PERSONALIZATION"],
        status: "PUBLISHED",
        pricing_model: { amount_usd: 0.02 },
      },
      PROVIDER_TOKEN,
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; listing: { listing_type: string }; data_package: Record<string, unknown> };
    expect(body.listing.listing_type).toBe("DATA_PACKAGE");
    // Safe defaults: elevated rights off, consent/opt-in/revocation/proof on.
    expect(body.data_package.training_allowed).toBe(false);
    expect(body.data_package.model_improvement_allowed).toBe(false);
    expect(body.data_package.redistribution_allowed).toBe(false);
    expect(body.data_package.commercial_use_allowed).toBe(false);
    expect(body.data_package.consent_required).toBe(true);
    expect(body.data_package.user_opt_in_required).toBe(true);
    expect(body.data_package.revocation_supported).toBe(true);
    expect(body.data_package.proof_required).toBe(true);
  });

  it("rejects an invalid access mode and an invalid use right", async () => {
    expect((await createDataPackage({ title: "x", description: "y", access_mode: "RAW_DUMP" }, PROVIDER_TOKEN)).statusCode).toBe(422);
    expect((await createDataPackage({ title: "x", description: "y", allowed_use: ["STEAL"] }, PROVIDER_TOKEN)).statusCode).toBe(422);
  });

  it("a cross-tenant data package is invisible (enumeration-safe)", async () => {
    const created = await createDataPackage(
      { title: "OrgAData", description: "d", access_mode: "PROOF_ONLY", allowed_use: ["ANALYTICS"], status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await dataAccess(listingId, "ANALYTICS", OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("LISTING_NOT_FOUND");
  });

  it("data-access evaluation composes authority + mock economics + never returns raw content", async () => {
    const created = await createDataPackage(
      { title: "Signals", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["PERSONALIZATION"], status: "PUBLISHED", pricing_model: { amount_usd: 0.02 } },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await dataAccess(listingId, "PERSONALIZATION", CONSUMER_TOKEN);
    expect(res.statusCode).toBe(200);
    const a = (res.json() as { access: Record<string, unknown> }).access;
    expect(a.use_permitted).toBe(true);
    expect(a.raw_body_excluded).toBe(true);
    expect(a.requires_consent).toBe(true);
    expect(a.proof_required).toBe(true);
    expect((a.honors as { revocation: boolean }).revocation).toBe(true);
    expect((a.payment as { settlement_mode: string }).settlement_mode).toBe("MOCK_ONLY");
    expect((a.payment as { real_provider_enabled: boolean }).real_provider_enabled).toBe(false);
    // No raw capsule content / storage / embedding on the wire.
    expect(res.payload).not.toContain("storage_location");
    expect(res.payload).not.toContain("payload_content");
    expect(res.payload).not.toContain("embedding");
    expect(res.payload).not.toContain('"real_provider_enabled":true');
  });

  it("training is denied unless explicitly opted in", async () => {
    const created = await createDataPackage(
      { title: "NoTrain", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["ANALYTICS", "TRAINING"], status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await dataAccess(listingId, "TRAINING", CONSUMER_TOKEN);
    const a = (res.json() as { access: { use_permitted: boolean; denied_reasons: string[] } }).access;
    expect(a.use_permitted).toBe(false);
    expect(a.denied_reasons).toContain("training-not-permitted");
  });

  it("an intended use not offered by the package is denied", async () => {
    const created = await createDataPackage(
      { title: "AnalyticsOnly", description: "d", access_mode: "PROOF_ONLY", allowed_use: ["ANALYTICS"], status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await dataAccess(listingId, "LLM_CONTEXT", CONSUMER_TOKEN);
    const a = (res.json() as { access: { use_permitted: boolean; denied_reasons: string[] } }).access;
    expect(a.use_permitted).toBe(false);
    expect(a.denied_reasons).toContain("intended-use-not-offered");
  });

  it("AI_AGENT / APPLICATION buyers cannot bypass: paid access is mock-only + needs approval", async () => {
    const created = await createDataPackage(
      { title: "LlmCtx", description: "d", access_mode: "LLM_CONTEXT_ACCESS", allowed_use: ["LLM_CONTEXT"], status: "PUBLISHED", pricing_model: { amount_usd: 0.02 } },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    for (const token of [AGENT_TOKEN, APP_TOKEN]) {
      const res = await dataAccess(listingId, "LLM_CONTEXT", token);
      expect(res.statusCode).toBe(200);
      const a = (res.json() as { access: { payment: { decision: string; real_provider_enabled: boolean } } }).access;
      // Non-human actor never auto-originates payment (RULE 0 + ADR-0094 §8).
      expect(a.payment.decision).toBe("NEEDS_APPROVAL");
      expect(a.payment.real_provider_enabled).toBe(false);
    }
  });

  it("training denied even when AI_AGENT requests it (no bypass)", async () => {
    const created = await createDataPackage(
      { title: "NoAiTrain", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["TRAINING"], status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await dataAccess(listingId, "TRAINING", AGENT_TOKEN);
    const a = (res.json() as { access: { use_permitted: boolean } }).access;
    expect(a.use_permitted).toBe(false);
  });
});

// ── Phase 1301-A — cross-org marketplace discovery (gated, provider-opt-in) ───
function setDiscovery(listingId: string, scope: unknown, token: string | null) {
  return app.inject({
    method: "PATCH",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/discovery`,
    headers: token !== null ? { authorization: `Bearer ${token}` } : {},
    payload: { discovery_scope: scope },
  });
}
function discover(token: string, listingType?: string) {
  return app.inject({
    method: "GET",
    url:
      "/api/v1/foundation/marketplace/discover" +
      (listingType !== undefined ? `?listing_type=${listingType}` : ""),
    headers: { authorization: `Bearer ${token}` },
  });
}
function discoverTitles(res: { json: () => unknown }): string[] {
  return (res.json() as { listings: { title: string }[] }).listings.map(
    (l) => l.title,
  );
}

describe("Foundation cross-org marketplace discovery (1301-A)", () => {
  it("401s without auth on discover and on set-discovery", async () => {
    expect((await discover_noauth()).statusCode).toBe(401);
    expect((await setDiscovery(randomUUID(), "CROSS_ORG", null)).statusCode).toBe(401);
  });
  function discover_noauth() {
    return app.inject({
      method: "GET",
      url: "/api/v1/foundation/marketplace/discover",
    });
  }

  it("a provider opts a PUBLISHED listing into CROSS_ORG; an outsider org discovers it; same-org does NOT (no dupe)", async () => {
    const title = `XOrgTool_${randomUUID()}`;
    const created = await createListing(
      { listing_type: "TOOL", title, description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;

    const set = await setDiscovery(listingId, "CROSS_ORG", PROVIDER_TOKEN);
    expect(set.statusCode).toBe(200);
    expect((set.json() as { listing: { discovery_scope: string } }).listing.discovery_scope).toBe("CROSS_ORG");

    // Outsider org sees it in the cross-org catalog.
    const out = await discover(OUTSIDER_TOKEN);
    expect(out.statusCode).toBe(200);
    expect(discoverTitles(out)).toContain(title);

    // Same-org consumer does NOT (already on the default surface — no dupes).
    expect(discoverTitles(await discover(CONSUMER_TOKEN))).not.toContain(title);
    // The provider does NOT see their own listing in discovery either.
    expect(discoverTitles(await discover(PROVIDER_TOKEN))).not.toContain(title);
  });

  it("a PUBLISHED listing left at the default (PRIVATE) reach is NOT discoverable cross-org", async () => {
    const title = `PrivateReach_${randomUUID()}`;
    await createListing(
      { listing_type: "SKILL", title, description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    // No opt-in → invisible to the cross-org catalog.
    expect(discoverTitles(await discover(OUTSIDER_TOKEN))).not.toContain(title);
  });

  it("cannot opt a DRAFT listing into CROSS_ORG (LISTING_NOT_PUBLISHED 409)", async () => {
    const created = await createListing(
      { listing_type: "TOOL", title: `DraftReach_${randomUUID()}`, description: "d" }, // default DRAFT
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await setDiscovery(listingId, "CROSS_ORG", PROVIDER_TOKEN);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("LISTING_NOT_PUBLISHED");
  });

  it("rejects an unknown discovery scope, including PUBLIC (deferred) → INVALID_DISCOVERY_SCOPE 422", async () => {
    const created = await createListing(
      { listing_type: "TOOL", title: `BadScope_${randomUUID()}`, description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    for (const bad of ["PUBLIC", "OPEN", "", "cross_org"]) {
      const res = await setDiscovery(listingId, bad, PROVIDER_TOKEN);
      expect(res.statusCode).toBe(422);
      expect((res.json() as { code: string }).code).toBe("INVALID_DISCOVERY_SCOPE");
    }
  });

  it("a non-provider cannot set discovery policy (enumeration-safe LISTING_NOT_FOUND 404)", async () => {
    const created = await createListing(
      { listing_type: "TOOL", title: `OwnedByA_${randomUUID()}`, description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await setDiscovery(listingId, "CROSS_ORG", OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe("LISTING_NOT_FOUND");
  });

  it("a HIGH_SENSITIVITY data package can NEVER be opted into CROSS_ORG (set-time block 403)", async () => {
    const created = await createDataPackage(
      {
        title: `HealthPkg_${randomUUID()}`,
        description: "d",
        access_mode: "PROOF_ONLY",
        allowed_use: ["ANALYTICS"],
        sensitivity_class: "HIGH_SENSITIVITY",
        sensitive_categories: ["HEALTH"],
        status: "PUBLISHED",
      },
      PROVIDER_TOKEN,
    );
    expect(created.statusCode).toBe(201);
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    const res = await setDiscovery(listingId, "CROSS_ORG", PROVIDER_TOKEN);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe("DISCOVERY_BLOCKED_HIGH_SENSITIVITY");
  });

  it("read-time defense: a high-sensitivity package forced to CROSS_ORG out-of-band is still excluded from /discover", async () => {
    const title = `OOBHealth_${randomUUID()}`;
    const created = await createDataPackage(
      {
        title,
        description: "d",
        access_mode: "PROOF_ONLY",
        allowed_use: ["ANALYTICS"],
        sensitivity_class: "HIGH_SENSITIVITY",
        sensitive_categories: ["BIOMETRIC"],
        status: "PUBLISHED",
      },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    // Bypass the setter (which would block this) to force the at-rest state the
    // read path must defend against, then prove the read filter excludes it.
    await prisma.marketplaceListing.update({
      where: { listing_id: listingId },
      data: { discovery_scope: "CROSS_ORG" },
    });
    expect(discoverTitles(await discover(OUTSIDER_TOKEN))).not.toContain(title);
  });

  it("discovery returns only the SAFE projection (no capsule/grant/storage/embedding leak) and is metadata-only", async () => {
    const title = `SafeProj_${randomUUID()}`;
    const created = await createListing(
      { listing_type: "SERVICE", title, description: "d", status: "PUBLISHED", pricing_model: { amount_usd: 0.05 } },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    await setDiscovery(listingId, "CROSS_ORG", PROVIDER_TOKEN);
    const res = await discover(OUTSIDER_TOKEN);
    expect(res.statusCode).toBe(200);
    const hit = (res.json() as { listings: Record<string, unknown>[] }).listings.find(
      (l) => l.title === title,
    );
    expect(hit).toBeDefined();
    // Safe projection shape only.
    expect(hit!.discovery_scope).toBe("CROSS_ORG");
    expect(hit!.status).toBe("PUBLISHED");
    expect(hit!.listing_id).toBe(listingId);
    // No raw/capsule/grant/consent internals on the wire.
    for (const forbidden of [
      "storage_location",
      "payload_content",
      "embedding",
      "grant_id",
      "consent_id",
      "capsule_id",
    ]) {
      expect(res.payload).not.toContain(forbidden);
    }
  });

  it("PRIMARY CASE: a SOLO / orgless provider can opt a PUBLISHED listing into CROSS_ORG and an org caller discovers it", async () => {
    // The first-class personal-DMW path: no EntityMembership, callerOrgOrNull → null.
    const soloToken = await solo(["read", "write"]);
    const title = `SoloXOrg_${randomUUID()}`;
    const created = await createListing(
      { listing_type: "TOOL", title, description: "personal-owned governed listing", status: "PUBLISHED" },
      soloToken,
    );
    // A personal/orgless provider CAN create a PUBLISHED listing (no org-gated status).
    expect(created.statusCode).toBe(201);
    expect((created.json() as { listing: { status: string } }).listing.status).toBe("PUBLISHED");
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;

    const set = await setDiscovery(listingId, "CROSS_ORG", soloToken);
    expect(set.statusCode).toBe(200);
    expect((set.json() as { listing: { discovery_scope: string } }).listing.discovery_scope).toBe("CROSS_ORG");

    // An ORG caller (orgB) now discovers the personal provider's opted-in listing.
    expect(discoverTitles(await discover(OUTSIDER_TOKEN))).toContain(title);
    // And the solo provider does NOT see their own listing in discovery.
    expect(discoverTitles(await discover(soloToken))).not.toContain(title);
  });

  it("a provider can retract cross-org reach (CROSS_ORG → PRIVATE), removing it from discovery", async () => {
    const title = `Retract_${randomUUID()}`;
    const created = await createListing(
      { listing_type: "TOOL", title, description: "d", status: "PUBLISHED" },
      PROVIDER_TOKEN,
    );
    const listingId = (created.json() as { listing: { listing_id: string } }).listing.listing_id;
    await setDiscovery(listingId, "CROSS_ORG", PROVIDER_TOKEN);
    expect(discoverTitles(await discover(OUTSIDER_TOKEN))).toContain(title);

    const retract = await setDiscovery(listingId, "PRIVATE", PROVIDER_TOKEN);
    expect(retract.statusCode).toBe(200);
    expect((retract.json() as { listing: { discovery_scope: string } }).listing.discovery_scope).toBe("PRIVATE");
    expect(discoverTitles(await discover(OUTSIDER_TOKEN))).not.toContain(title);
  });
});
