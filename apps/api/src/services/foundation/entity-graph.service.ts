// FILE: entity-graph.service.ts
// PURPOSE: F-1327 — the Entity Relationship Graph. A read-time PROJECTION of how
//          an entity relates to the rest of the governed ecosystem: ownership /
//          governance (memberships), what it provides (listings + cohorts), what
//          it purchases (grants), what it contributes to and uses (cohorts).
//
//          PROJECTION ONLY — no graph mutation, no new schema. Derived from
//          existing relationship tables (EntityMembership, MarketplaceListing,
//          MarketplaceDataGrant, CohortDataProduct, CohortContribution,
//          CohortAccessRequest). Edge types with no recorded source (CALLS /
//          DELEGATES / DERIVES_FROM) yield no edges — the vocabulary is supported,
//          the edges are never invented.
//
// CONNECTS TO: packages/database + auth.service + governance/org +
//              apps/api/src/routes/foundation.routes.ts (GET /graph/:entity_id).
//
// SAFETY: scoped to the caller's own graph, their org, or (for org admins) an
// org member — enumeration-safe GRAPH_NOT_FOUND otherwise. Nodes carry id + type
// only (no display names / PII). Counterparty ids shown are already mutually
// visible through the underlying grant/membership relationships.

import { prisma, type EntityType } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

export type GraphNodeType =
  | "USER" | "ORG" | "APP" | "TOOL" | "AGENT" | "SERVICE" | "DEVICE" | "WORLD" | "COHORT" | "PRODUCT";
export type GraphEdgeType =
  | "OWNS" | "USES" | "CALLS" | "PROVIDES" | "CONTRIBUTES_TO" | "PURCHASES" | "GOVERNS" | "DELEGATES" | "DERIVES_FROM";

export const GRAPH_NODE_TYPES: GraphNodeType[] = ["USER", "ORG", "APP", "TOOL", "AGENT", "SERVICE", "DEVICE", "WORLD", "COHORT", "PRODUCT"];
export const GRAPH_EDGE_TYPES: GraphEdgeType[] = ["OWNS", "USES", "CALLS", "PROVIDES", "CONTRIBUTES_TO", "PURCHASES", "GOVERNS", "DELEGATES", "DERIVES_FROM"];

export interface GraphNode { node_id: string; node_type: GraphNodeType }
export interface GraphEdge { from: string; to: string; edge_type: GraphEdgeType }

export interface EntityGraphView {
  center_entity_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_types: GraphNodeType[];
  edge_types: GraphEdgeType[];
  coverage_note: string | null;
  generated_at: string;
}

export type GetEntityGraphResult =
  | { ok: true; graph: EntityGraphView }
  | { ok: false; code: string };

const EDGE_CAP = 50; // bound per relationship kind

// entity_type → graph node type.
export function nodeTypeForEntity(entityType: EntityType | string): GraphNodeType {
  switch (entityType) {
    case "PERSON": return "USER";
    case "AI_AGENT": return "AGENT";
    case "DEVICE": return "DEVICE";
    case "APPLICATION": return "APP";
    case "COMPANY":
    case "GOVERNMENT":
    case "REGULATOR": return "ORG";
    default: return "ORG";
  }
}

// MarketplaceListing.listing_type → graph node type.
export function nodeTypeForListing(listingType: string): GraphNodeType {
  switch (listingType) {
    case "AGENT": return "AGENT";
    case "APP": return "APP";
    case "WORLD": return "WORLD";
    case "DEVICE": return "DEVICE";
    case "TOOL":
    case "SKILL": return "TOOL";
    case "SERVICE":
    case "CONNECTOR": return "SERVICE";
    default: return "PRODUCT";
  }
}

export class EntityGraphService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      return await getOrgEntityId(entityId);
    } catch {
      return null;
    }
  }

  // WHAT: the relationship graph centered on entityId, scoped to the caller.
  // INPUT: session token + entity_id. OUTPUT: nodes + edges (projection).
  // WHY: GET /api/v1/foundation/graph/:entity_id.
  async getGraphForCaller(sessionToken: string, entityId: string): Promise<GetEntityGraphResult> {
    const v = await this.authService.validateSession(sessionToken, "read");
    if (!v.valid) return { ok: false, code: v.code };
    const caller = v.entity_id;

    // ── Scope: self, own org, or (org-admin) an active member of the org. ────
    const callerOrg = await this.callerOrgOrNull(caller);
    let authorized = entityId === caller || (callerOrg !== null && entityId === callerOrg);
    if (!authorized && callerOrg !== null && v.allowed_operations.includes("admin_org")) {
      const membership = await prisma.entityMembership.findFirst({
        where: { parent_id: callerOrg, child_id: entityId, is_active: true },
        select: { parent_id: true },
      });
      authorized = membership !== null;
    }
    if (!authorized) return { ok: false, code: "GRAPH_NOT_FOUND" }; // enumeration-safe

    const center = await prisma.entity.findFirst({
      where: { entity_id: entityId, deleted_at: null },
      select: { entity_id: true, entity_type: true },
    });
    if (center === null) return { ok: false, code: "GRAPH_NOT_FOUND" };

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    let capped = false;
    const addNode = (id: string, type: GraphNodeType): void => { if (!nodes.has(id)) nodes.set(id, { node_id: id, node_type: type }); };
    const addEdge = (from: string, to: string, edge_type: GraphEdgeType): void => { edges.push({ from, to, edge_type }); };

    addNode(center.entity_id, nodeTypeForEntity(center.entity_type));

    // Collect counterparty entity ids whose node type we must resolve in batch.
    const entityIdsToResolve = new Set<string>();

    // ── Memberships: org GOVERNS members (and the center's parent org). ──────
    const asParent = await prisma.entityMembership.findMany({ where: { parent_id: entityId, is_active: true }, select: { child_id: true }, take: EDGE_CAP + 1 });
    if (asParent.length > EDGE_CAP) capped = true;
    for (const m of asParent.slice(0, EDGE_CAP)) { entityIdsToResolve.add(m.child_id); addEdge(entityId, m.child_id, "GOVERNS"); }
    const asChild = await prisma.entityMembership.findMany({ where: { child_id: entityId, is_active: true }, select: { parent_id: true }, take: EDGE_CAP + 1 });
    if (asChild.length > EDGE_CAP) capped = true;
    for (const m of asChild.slice(0, EDGE_CAP)) { entityIdsToResolve.add(m.parent_id); addEdge(m.parent_id, entityId, "GOVERNS"); }

    // ── PROVIDES: listings (capabilities/products) + cohorts. ────────────────
    const listings = await prisma.marketplaceListing.findMany({ where: { provider_entity_id: entityId, deleted_at: null }, select: { listing_id: true, listing_type: true }, take: EDGE_CAP + 1 });
    if (listings.length > EDGE_CAP) capped = true;
    for (const l of listings.slice(0, EDGE_CAP)) { addNode(l.listing_id, nodeTypeForListing(l.listing_type)); addEdge(entityId, l.listing_id, "PROVIDES"); }
    const cohorts = await prisma.cohortDataProduct.findMany({ where: { provider_entity_id: entityId, deleted_at: null }, select: { cohort_product_id: true }, take: EDGE_CAP + 1 });
    if (cohorts.length > EDGE_CAP) capped = true;
    for (const c of cohorts.slice(0, EDGE_CAP)) { addNode(c.cohort_product_id, "COHORT"); addEdge(entityId, c.cohort_product_id, "PROVIDES"); }

    // ── PURCHASES: grants where center is buyer (→ provider) or provider (← buyer).
    const grantsAsBuyer = await prisma.marketplaceDataGrant.findMany({ where: { buyer_entity_id: entityId }, select: { provider_entity_id: true }, take: EDGE_CAP + 1 });
    if (grantsAsBuyer.length > EDGE_CAP) capped = true;
    for (const g of grantsAsBuyer.slice(0, EDGE_CAP)) { entityIdsToResolve.add(g.provider_entity_id); addEdge(entityId, g.provider_entity_id, "PURCHASES"); }
    const grantsAsProvider = await prisma.marketplaceDataGrant.findMany({ where: { provider_entity_id: entityId }, select: { buyer_entity_id: true }, take: EDGE_CAP + 1 });
    if (grantsAsProvider.length > EDGE_CAP) capped = true;
    for (const g of grantsAsProvider.slice(0, EDGE_CAP)) { entityIdsToResolve.add(g.buyer_entity_id); addEdge(g.buyer_entity_id, entityId, "PURCHASES"); }

    // ── CONTRIBUTES_TO: cohorts the center contributes to. ───────────────────
    const contribs = await prisma.cohortContribution.findMany({ where: { contributor_entity_id: entityId, deleted_at: null }, select: { cohort_product_id: true }, take: EDGE_CAP + 1 });
    if (contribs.length > EDGE_CAP) capped = true;
    for (const c of contribs.slice(0, EDGE_CAP)) { addNode(c.cohort_product_id, "COHORT"); addEdge(entityId, c.cohort_product_id, "CONTRIBUTES_TO"); }

    // ── USES: cohorts the center has requested access to. ────────────────────
    const requests = await prisma.cohortAccessRequest.findMany({ where: { buyer_entity_id: entityId }, select: { cohort_product_id: true }, take: EDGE_CAP + 1 });
    if (requests.length > EDGE_CAP) capped = true;
    for (const r of requests.slice(0, EDGE_CAP)) { addNode(r.cohort_product_id, "COHORT"); addEdge(entityId, r.cohort_product_id, "USES"); }

    // Resolve counterparty entity node types in one batch.
    const idsArr = Array.from(entityIdsToResolve).filter((id) => !nodes.has(id));
    if (idsArr.length > 0) {
      const ents = await prisma.entity.findMany({ where: { entity_id: { in: idsArr } }, select: { entity_id: true, entity_type: true } });
      for (const e of ents) addNode(e.entity_id, nodeTypeForEntity(e.entity_type));
      // Any unresolved id (e.g. deleted) defaults to ORG node so edges stay valid.
      for (const id of idsArr) if (!nodes.has(id)) addNode(id, "ORG");
    }

    return {
      ok: true,
      graph: {
        center_entity_id: entityId,
        nodes: Array.from(nodes.values()),
        edges,
        node_types: GRAPH_NODE_TYPES,
        edge_types: GRAPH_EDGE_TYPES,
        coverage_note: capped
          ? `Graph bounded to the first ${EDGE_CAP} relationships per kind; older edges may be omitted. CALLS / DELEGATES / DERIVES_FROM edges are not yet sourced.`
          : "CALLS / DELEGATES / DERIVES_FROM edge types are supported but not yet sourced from recorded relationships.",
        generated_at: new Date().toISOString(),
      },
    };
  }
}
