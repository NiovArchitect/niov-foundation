// FILE: foundation-entity-graph.test.ts (integration)
// PURPOSE: F-1327 — the Entity Relationship Graph. Proves the derived projection:
//          a provider's graph includes PROVIDES edges to their listing + cohort,
//          a PURCHASES edge from a buyer, and a GOVERNS edge from their org; the
//          node/edge vocabularies are returned; and it is scoped (self / own-org /
//          org-member) + enumeration-safe (cross-tenant → GRAPH_NOT_FOUND).
// CONNECTS TO:
//   - apps/api/src/routes/foundation.routes.ts (GET /graph/:entity_id)
//   - apps/api/src/services/foundation/entity-graph.service.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryContentStore, MemoryNonceStore, MemoryRateLimitStore } from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput, TEST_PREFIX } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "foundation-entity-graph-secret";
let app: FastifyInstance;
let ORG_A = "";
let PROVIDER = { token: "", id: "" };
let BUYER = { token: "", id: "" };
let CONTRIBUTOR = { token: "", id: "" };
let STRANGER = { token: "", id: "" };
const store = new MemoryRateLimitStore();

async function member(orgId: string): Promise<{ token: string; id: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const e = await createEntity(input);
  await prisma.entityMembership.create({ data: { parent_id: orgId, child_id: e.entity_id, is_active: true } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: input.email, password, requested_operations: ["read", "write"] } });
  return { token: (login.json() as { token: string }).token, id: e.entity_id };
}
function auth(token: string): Record<string, string> { return { authorization: `Bearer ${token}` }; }

interface GraphBody {
  ok: true;
  center_entity_id: string;
  nodes: Array<{ node_id: string; node_type: string }>;
  edges: Array<{ from: string; to: string; edge_type: string }>;
  node_types: string[];
  edge_types: string[];
}
async function graph(token: string, entityId: string): Promise<{ status: number; body: GraphBody }> {
  const res = await app.inject({ method: "GET", url: `/api/v1/foundation/graph/${entityId}`, headers: auth(token) });
  return { status: res.statusCode, body: res.json() as GraphBody };
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET, sessionNonceStore: new MemoryNonceStore(), declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(), contentEncryption: new ContentEncryption(randomBytes(32)), rateLimitStore: store,
  });
  const orgA = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}egA_${randomUUID()}`, email: `${TEST_PREFIX}egA_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  const orgB = await createEntity({ entity_type: "COMPANY", display_name: `${TEST_PREFIX}egB_${randomUUID()}`, email: `${TEST_PREFIX}egB_${randomUUID()}@niov.test`, public_key: "k", clearance_level: 0 });
  ORG_A = orgA.entity_id;
  PROVIDER = await member(orgA.entity_id);
  BUYER = await member(orgA.entity_id);
  CONTRIBUTOR = await member(orgA.entity_id);
  STRANGER = await member(orgB.entity_id);

  // Provider registers a capability listing + a data package + a cohort.
  await app.inject({ method: "POST", url: "/api/v1/foundation/marketplace/listings", headers: auth(PROVIDER.token), payload: { listing_type: "AGENT", title: "Graph agent", description: "d", status: "PUBLISHED" } });
  const pkg = await app.inject({ method: "POST", url: "/api/v1/foundation/marketplace/data-packages", headers: auth(PROVIDER.token), payload: { title: "Graph signals", description: "d", access_mode: "SAFE_PROJECTION", allowed_use: ["ANALYTICS"], status: "PUBLISHED", pricing_model: { amount_usd: 0.02 } } });
  const listingId = (pkg.json() as { listing: { listing_id: string } }).listing.listing_id;
  const cohortRes = await app.inject({ method: "POST", url: "/api/v1/foundation/cohorts", headers: auth(PROVIDER.token), payload: { title: "Graph cohort", description: "d", cohort_type: "CONSUMER_BEHAVIOR", access_modes: ["AGGREGATED_SIGNAL"], allowed_uses: ["ANALYTICS"], status: "ACTIVE" } });
  const cohortId = (cohortRes.json() as { cohort: { cohort_product_id: string } }).cohort.cohort_product_id;

  // Buyer purchases (grant); contributor joins the cohort.
  await app.inject({ method: "POST", url: `/api/v1/foundation/marketplace/listings/${listingId}/data-grants`, headers: auth(BUYER.token), payload: { intended_use: "ANALYTICS", consent_confirmed: true, opt_in_confirmed: true } });
  await app.inject({ method: "POST", url: `/api/v1/foundation/cohorts/${cohortId}/join`, headers: auth(CONTRIBUTOR.token), payload: { contribution_scope: "PREFERENCE" } });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("F-1327 — Entity Relationship Graph", () => {
  it("a provider's graph: PROVIDES edges + a PURCHASES edge from the buyer + GOVERNS from the org", async () => {
    const { status, body } = await graph(PROVIDER.token, PROVIDER.id);
    expect(status).toBe(200);
    expect(body.center_entity_id).toBe(PROVIDER.id);
    expect(body.node_types.length).toBe(10);
    expect(body.edge_types.length).toBe(9);
    // The provider provides at least one capability/product and one cohort.
    expect(body.edges.filter((e) => e.from === PROVIDER.id && e.edge_type === "PROVIDES").length).toBeGreaterThanOrEqual(2);
    // The buyer purchases from the provider.
    expect(body.edges.some((e) => e.from === BUYER.id && e.to === PROVIDER.id && e.edge_type === "PURCHASES")).toBe(true);
    // The org governs the provider.
    expect(body.edges.some((e) => e.from === ORG_A && e.to === PROVIDER.id && e.edge_type === "GOVERNS")).toBe(true);
    // The center node is present and typed USER (a PERSON).
    expect(body.nodes.find((n) => n.node_id === PROVIDER.id)?.node_type).toBe("USER");
  });

  it("a contributor's graph has a CONTRIBUTES_TO edge to the cohort", async () => {
    const { status, body } = await graph(CONTRIBUTOR.token, CONTRIBUTOR.id);
    expect(status).toBe(200);
    expect(body.edges.some((e) => e.from === CONTRIBUTOR.id && e.edge_type === "CONTRIBUTES_TO")).toBe(true);
    expect(body.nodes.some((n) => n.node_type === "COHORT")).toBe(true);
  });

  it("the caller can view their own ORG graph (GOVERNS edges to members)", async () => {
    const { status, body } = await graph(PROVIDER.token, ORG_A);
    expect(status).toBe(200);
    expect(body.nodes.find((n) => n.node_id === ORG_A)?.node_type).toBe("ORG");
    expect(body.edges.some((e) => e.from === ORG_A && e.edge_type === "GOVERNS")).toBe(true);
  });

  it("a cross-tenant stranger gets GRAPH_NOT_FOUND; no auth → 401", async () => {
    const stranger = await graph(STRANGER.token, PROVIDER.id);
    expect(stranger.status).toBe(404);
    expect((stranger.body as unknown as { code: string }).code).toBe("GRAPH_NOT_FOUND");

    const noAuth = await app.inject({ method: "GET", url: `/api/v1/foundation/graph/${PROVIDER.id}` });
    expect(noAuth.statusCode).toBe(401);
  });
});
