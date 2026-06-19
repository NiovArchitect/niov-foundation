// FILE: foundation-proof-events.test.ts (integration)
// PURPOSE: F-1321 — the Scoped Proof Event Feed. Proves the canonical trust
//          spine is a governed PROJECTION, not an audit dump: it surfaces real
//          audit-backed proof (grant created / read, listing registered) mapped
//          to proof CLASSES; it is scope-filtered and authorization-gated; it
//          never leaks raw content, internal counts, or cross-tenant identities;
//          resource scopes are party/owner-only (enumeration safe); org scope
//          requires admin_org; and it pages with a keyset cursor.
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET /foundation/proof/events)
//   - apps/api/src/services/foundation/proof-events.service.ts

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
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-proof-events-secret";
let app: FastifyInstance;
let PROVIDER_TOKEN: string;
let BUYER_TOKEN: string;
let STRANGER_TOKEN: string; // a different org — true cross-tenant
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<string> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({
    data: { parent_id: orgId, child_id: e.entity_id, is_active: true },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read", "write"] },
  });
  return (login.json() as { token: string }).token;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function makePackage(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/data-packages",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Proof feed signals",
      description: "d",
      access_mode: "SAFE_PROJECTION",
      allowed_use: ["ANALYTICS", "PERSONALIZATION"],
      status: "PUBLISHED",
      pricing_model: { amount_usd: 0.02 },
    },
  });
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

async function makeActiveGrant(listingId: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`,
    headers: auth(BUYER_TOKEN),
    payload: { intended_use: "PERSONALIZATION", consent_confirmed: true, opt_in_confirmed: true },
  });
  if (res.statusCode !== 201) throw new Error(`grant failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { grant: { grant_id: string } }).grant.grant_id;
}

async function registerListing(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/marketplace/listings",
    headers: auth(PROVIDER_TOKEN),
    payload: { listing_type: "AGENT", title: "Proof feed capability", description: "d", status: "PUBLISHED" },
  });
  if (res.statusCode !== 201) throw new Error(`listing failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { listing: { listing_id: string } }).listing.listing_id;
}

interface ProofEvent {
  event_id: string;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  actor_entity_id: string | null;
  proof_reference: string;
  is_mock: boolean;
  visibility_scope: string;
}
interface FeedBody {
  ok: true;
  scope: string;
  events: ProofEvent[];
  next_cursor: string | null;
  fidelity_notes: Array<{ event_class: string; fidelity: string; note: string }>;
  coverage_note: string | null;
}

// Forbidden substrings: raw content, storage internals, internal counts, secrets.
const FORBIDDEN = [
  "storage_location",
  "payload_content",
  "payload_summary",
  "embedding",
  "content_hash",
  "eligible_count",
  "minimum_cohort_size",
  "wallet_id",
  "denied_reasons",
];

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
    display_name: `${TEST_PREFIX}peA_${randomUUID()}`,
    email: `${TEST_PREFIX}peA_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  const orgB = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}peB_${randomUUID()}`,
    email: `${TEST_PREFIX}peB_${randomUUID()}@niov.test`,
    public_key: "k",
    clearance_level: 0,
  });
  PROVIDER_TOKEN = await member(orgA.entity_id);
  BUYER_TOKEN = await member(orgA.entity_id);
  STRANGER_TOKEN = await member(orgB.entity_id);
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function feed(token: string, query: string): Promise<{ status: number; body: FeedBody; raw: string }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/foundation/proof/events${query}`,
    headers: auth(token),
  });
  return { status: res.statusCode, body: res.json() as FeedBody, raw: res.payload };
}

describe("F-1321 — Scoped Proof Event Feed", () => {
  it("scope=self surfaces the caller's own audit-backed proof as proof CLASSES", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);
    // One real read → GRANT_READ proof.
    const read = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/marketplace/data-grants/${grantId}/read`,
      headers: auth(BUYER_TOKEN),
      payload: {},
    });
    expect(read.statusCode).toBe(200);

    const { status, body, raw } = await feed(BUYER_TOKEN, "?scope=self");
    expect(status).toBe(200);
    expect(body.scope).toBe("self");
    const classes = body.events.map((e) => e.event_type);
    expect(classes).toContain("GRANT_CREATED");
    expect(classes).toContain("GRANT_READ");
    // Every event carries an opaque proof reference (the audit chain hash).
    for (const e of body.events) expect(e.proof_reference.length).toBeGreaterThan(0);
    // No raw content / internal counts / secrets on the wire.
    for (const t of FORBIDDEN) expect(raw).not.toContain(t);
    // Fidelity notes are surfaced for non-EXACT classes (DERIVED/PARTIAL).
    expect(body.fidelity_notes.some((n) => n.event_class === "POLICY_EVALUATED")).toBe(true);
  });

  it("default scope is self (no scope param)", async () => {
    const { status, body } = await feed(BUYER_TOKEN, "");
    expect(status).toBe(200);
    expect(body.scope).toBe("self");
  });

  it("scope=buyer returns only buyer-relevant classes (never provider-actor LISTING_REGISTERED)", async () => {
    await registerListing(); // provider registers — must NOT appear in buyer scope
    const { status, body } = await feed(BUYER_TOKEN, "?scope=buyer");
    expect(status).toBe(200);
    expect(body.events.every((e) => e.event_type !== "LISTING_REGISTERED")).toBe(true);
  });

  it("scope=provider surfaces LISTING_REGISTERED + grant proof on owned resources", async () => {
    await registerListing();
    const { status, body } = await feed(PROVIDER_TOKEN, "?scope=provider");
    expect(status).toBe(200);
    const classes = body.events.map((e) => e.event_type);
    expect(classes).toContain("LISTING_REGISTERED");
    // Grant read (actor = buyer) is visible to the provider because it is on a
    // listing the provider owns.
    expect(classes).toContain("GRANT_READ");
  });

  it("resource scope=grant is party-only: both parties 200, a cross-tenant stranger 404", async () => {
    const listing = await makePackage();
    const grantId = await makeActiveGrant(listing);

    const asBuyer = await feed(BUYER_TOKEN, `?scope=grant&resource_id=${grantId}`);
    expect(asBuyer.status).toBe(200);
    expect(asBuyer.body.events.length).toBeGreaterThanOrEqual(1);

    const asProvider = await feed(PROVIDER_TOKEN, `?scope=grant&resource_id=${grantId}`);
    expect(asProvider.status).toBe(200);

    const asStranger = await feed(STRANGER_TOKEN, `?scope=grant&resource_id=${grantId}`);
    expect(asStranger.status).toBe(404);
    expect((asStranger.body as unknown as { code: string }).code).toBe("RESOURCE_NOT_FOUND");
  });

  it("resource scope=listing is owner/admin-only (stranger 404)", async () => {
    const listingId = await registerListing();
    const asOwner = await feed(PROVIDER_TOKEN, `?scope=listing&resource_id=${listingId}`);
    expect(asOwner.status).toBe(200);
    const asStranger = await feed(STRANGER_TOKEN, `?scope=listing&resource_id=${listingId}`);
    expect(asStranger.status).toBe(404);
  });

  it("resource scope without resource_id → 422 RESOURCE_ID_REQUIRED", async () => {
    const res = await feed(BUYER_TOKEN, "?scope=grant");
    expect(res.status).toBe(422);
    expect((res.body as unknown as { code: string }).code).toBe("RESOURCE_ID_REQUIRED");
  });

  it("scope=org without admin_org → 403 NOT_AUTHORIZED", async () => {
    const res = await feed(BUYER_TOKEN, "?scope=org");
    expect(res.status).toBe(403);
    expect((res.body as unknown as { code: string }).code).toBe("NOT_AUTHORIZED");
  });

  it("invalid scope → 422; no auth → 401", async () => {
    const bad = await feed(BUYER_TOKEN, "?scope=everything");
    expect(bad.status).toBe(422);
    expect((bad.body as unknown as { code: string }).code).toBe("INVALID_SCOPE");

    const noAuth = await app.inject({ method: "GET", url: "/api/v1/foundation/proof/events" });
    expect(noAuth.statusCode).toBe(401);
  });

  it("pages with a keyset cursor (limit=1 yields next_cursor; the next page differs)", async () => {
    const first = await feed(BUYER_TOKEN, "?scope=self&limit=1");
    expect(first.status).toBe(200);
    expect(first.body.events.length).toBe(1);
    if (first.body.next_cursor !== null) {
      const second = await feed(BUYER_TOKEN, `?scope=self&limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`);
      expect(second.status).toBe(200);
      if (second.body.events.length > 0) {
        expect(second.body.events[0]?.event_id).not.toBe(first.body.events[0]?.event_id);
      }
    }
  });

  it("self-scope economic projection is mock-only (is_mock true only for settlement/meter)", async () => {
    const { body } = await feed(BUYER_TOKEN, "?scope=self");
    for (const e of body.events) {
      if (e.resource_type === "SETTLEMENT" || e.resource_type === "METER") expect(e.is_mock).toBe(true);
      else expect(e.is_mock).toBe(false);
    }
  });
});

// ── F-1322 Proof Fidelity Completion ─────────────────────────────────────────
async function registerCohort(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/foundation/cohorts",
    headers: auth(PROVIDER_TOKEN),
    payload: {
      title: "Consent revoke cohort",
      description: "d",
      cohort_type: "CONSUMER_BEHAVIOR",
      access_modes: ["AGGREGATED_SIGNAL"],
      allowed_uses: ["ANALYTICS"],
      status: "ACTIVE",
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) throw new Error(`cohort failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;
}

describe("F-1322 — Proof Fidelity Completion (CONSENT_REVOKED + LISTING_DISCOVERED)", () => {
  it("contributor withdrawal emits an EXACT CONSENT_REVOKED proof event (distinct, sovereign)", async () => {
    const cohortId = await registerCohort();
    const join = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${cohortId}/join`,
      headers: auth(BUYER_TOKEN),
      payload: { contribution_scope: "PREFERENCE" },
    });
    expect([200, 201]).toContain(join.statusCode);
    const withdraw = await app.inject({
      method: "POST",
      url: `/api/v1/foundation/cohorts/${cohortId}/withdraw`,
      headers: auth(BUYER_TOKEN),
      payload: {},
    });
    expect([200, 201]).toContain(withdraw.statusCode);

    const { status, body, raw } = await feed(BUYER_TOKEN, "?scope=self&event_type=CONSENT_REVOKED");
    expect(status).toBe(200);
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    const ev = body.events[0];
    expect(ev?.event_type).toBe("CONSENT_REVOKED");
    expect(ev?.resource_type).toBe("CONSENT");
    expect(ev?.resource_id).not.toBeNull();
    expect(ev?.proof_reference.length).toBeGreaterThan(0);
    // No raw payload / contributor PII on the wire.
    for (const t of FORBIDDEN) expect(raw).not.toContain(t);
    // It is no longer a fidelity gap.
    expect(body.fidelity_notes.some((n) => n.event_class === "CONSENT_REVOKED")).toBe(false);
  });

  it("a requester viewing a published listing emits an EXACT LISTING_DISCOVERED proof event", async () => {
    const listingId = await registerListing(); // PUBLISHED, provider-owned
    // BUYER (same org, not the provider) discovers it via the single-listing read.
    const view = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/listings/${listingId}`,
      headers: auth(BUYER_TOKEN),
    });
    expect(view.statusCode).toBe(200);

    const { status, body } = await feed(BUYER_TOKEN, "?scope=self&event_type=LISTING_DISCOVERED");
    expect(status).toBe(200);
    const discovered = body.events.find((e) => e.resource_id === listingId);
    expect(discovered).toBeDefined();
    expect(discovered?.event_type).toBe("LISTING_DISCOVERED");
    expect(discovered?.resource_type).toBe("LISTING");
    expect(body.fidelity_notes.some((n) => n.event_class === "LISTING_DISCOVERED")).toBe(false);
  });

  it("a provider reading their OWN listing does NOT emit LISTING_DISCOVERED (not a discovery occurrence)", async () => {
    const listingId = await registerListing();
    const before = await feed(PROVIDER_TOKEN, "?scope=self&event_type=LISTING_DISCOVERED");
    const beforeCount = before.body.events.filter((e) => e.resource_id === listingId).length;
    const view = await app.inject({
      method: "GET",
      url: `/api/v1/foundation/marketplace/listings/${listingId}`,
      headers: auth(PROVIDER_TOKEN),
    });
    expect(view.statusCode).toBe(200);
    const after = await feed(PROVIDER_TOKEN, "?scope=self&event_type=LISTING_DISCOVERED");
    const afterCount = after.body.events.filter((e) => e.resource_id === listingId).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("the new literals are auth-scoped: a cross-tenant stranger's self feed never sees them", async () => {
    // The stranger (orgB) performed no consent revoke / listing discovery; self
    // scope is actor=caller by construction, so neither literal can appear.
    const { status, body } = await feed(STRANGER_TOKEN, "?scope=self");
    expect(status).toBe(200);
    expect(body.events.some((e) => e.event_type === "CONSENT_REVOKED")).toBe(false);
    expect(body.events.some((e) => e.event_type === "LISTING_DISCOVERED")).toBe(false);
  });
});
