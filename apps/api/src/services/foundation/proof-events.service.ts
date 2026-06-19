// FILE: apps/api/src/services/foundation/proof-events.service.ts
// PURPOSE: F-1321 — the canonical SCOPED PROOF EVENT FEED. A read-only,
//          append-only-derived projection over the `audit_events` ledger that
//          exposes governed proof of what happened across the Federation Cloud
//          exchange (requests, consent, grants, contributions, deliveries,
//          listings, metering, settlement-intent, policy evaluations).
//
//          This is NOT a logging endpoint and NOT an audit dump. It is a
//          governed PROJECTION: an explicit field allowlist over each audit
//          row, scope-filtered and authorization-gated so a caller can only ever
//          see proof they are party to. Raw payloads, capsule content, internal
//          counts (e.g. eligible_count), and cross-tenant counterparty identities
//          are never projected.
//
// CONNECTS TO:
//   - packages/database/src/queries/audit.ts (the audit_events ledger + literals)
//   - apps/api/src/services/auth.service.ts (service-owned auth gate)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId — tenant scoping)
//   - apps/api/src/routes/foundation.routes.ts (GET /foundation/proof/events)
//   - niov-federation-cloud /proof-usage (FC-1322 consumer)
//
// HARD RULES (RULE 0 / directive F-1321):
//   - read-only; never writes, never mutates the ledger
//   - projection only — explicit per-field allowlist, never `details` passthrough
//   - no raw memory-capsule content, no raw payloads, no secret fields
//   - no cross-tenant counterparty identity leakage (actor redacted unless the
//     caller is authorized to see it)
//   - economics are mock-only (settlement_mode = MOCK_ONLY, is_mock = true)

import { prisma, type AuditEvent, type AuditOutcome } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";

// ── Proof event classes ──────────────────────────────────────────────────────
// WHAT: the canonical proof event vocabulary the feed exposes, mapped to the
//       REAL Foundation audit literals that back each class. Where a class has
//       no backing literal yet, its `sources` is empty and `fidelity` records
//       why — the feed returns no rows for it and reports the gap honestly. We
//       never fabricate event history.

export type ProofFidelity = "EXACT" | "DERIVED" | "PARTIAL" | "MISSING";

export type ProofResourceType =
  | "ACCESS_REQUEST"
  | "CONSENT"
  | "DATA_GRANT"
  | "COHORT_CONTRIBUTION"
  | "COHORT"
  | "LISTING"
  | "METER"
  | "SETTLEMENT"
  | "POLICY";

export type ProofActorRole = "BUYER" | "PROVIDER" | "CONTRIBUTOR" | "SYSTEM";

interface ProofClassSpec {
  event_class: string;
  sources: string[]; // Foundation audit literals (may be empty = MISSING)
  fidelity: ProofFidelity;
  resource_type: ProofResourceType;
  actor_role: ProofActorRole;
  // Which scopes a caller-as-actor sees this class under.
  roles: Array<"buyer" | "provider" | "contributor">;
  // When a literal maps to >1 class, the discriminator inspects the row.
  match?: (row: AuditEvent, details: Record<string, unknown>) => boolean;
  fidelity_note?: string;
}

// Discriminators for literals that fan out into multiple proof classes.
function decisionIs(target: string) {
  return (row: AuditEvent, d: Record<string, unknown>): boolean => {
    const decision = typeof d.decision === "string" ? d.decision : null;
    if (decision !== null) return decision.toUpperCase() === target;
    // Fallback to outcome when the decision isn't carried in details.
    return target === "APPROVED" ? row.outcome === "SUCCESS" : row.outcome === "DENIED";
  };
}
function outcomeIs(target: AuditOutcome) {
  return (row: AuditEvent): boolean => row.outcome === target;
}

export const PROOF_EVENT_CLASSES: ProofClassSpec[] = [
  { event_class: "REQUEST_CREATED", sources: ["COHORT_ACCESS_REQUESTED"], fidelity: "EXACT", resource_type: "ACCESS_REQUEST", actor_role: "BUYER", roles: ["buyer"] },
  { event_class: "REQUEST_APPROVED", sources: ["COHORT_ACCESS_DECIDED"], fidelity: "DERIVED", resource_type: "ACCESS_REQUEST", actor_role: "PROVIDER", roles: ["provider"], match: decisionIs("APPROVED"), fidelity_note: "Derived from COHORT_ACCESS_DECIDED (decision in details), not a distinct literal." },
  { event_class: "REQUEST_DENIED", sources: ["COHORT_ACCESS_DECIDED"], fidelity: "DERIVED", resource_type: "ACCESS_REQUEST", actor_role: "PROVIDER", roles: ["provider"], match: decisionIs("DENIED"), fidelity_note: "Derived from COHORT_ACCESS_DECIDED (decision in details), not a distinct literal." },
  { event_class: "CONSENT_GRANTED", sources: ["MARKETPLACE_DATA_CONSENT_RECORDED", "CONSENT_GRANT_RECORDED"], fidelity: "EXACT", resource_type: "CONSENT", actor_role: "CONTRIBUTOR", roles: ["contributor", "buyer"] },
  { event_class: "CONSENT_REVOKED", sources: [], fidelity: "MISSING", resource_type: "CONSENT", actor_role: "CONTRIBUTOR", roles: ["contributor"], fidelity_note: "No distinct consent-revoked literal yet; consent withdrawal currently surfaces as GRANT_REVOKED / CONSENT_EXPIRED." },
  { event_class: "GRANT_CREATED", sources: ["MARKETPLACE_DATA_GRANT_CREATED"], fidelity: "EXACT", resource_type: "DATA_GRANT", actor_role: "PROVIDER", roles: ["provider", "buyer"] },
  { event_class: "GRANT_READ", sources: ["MARKETPLACE_DATA_GRANT_READ_EVALUATED"], fidelity: "EXACT", resource_type: "DATA_GRANT", actor_role: "BUYER", roles: ["buyer"], match: outcomeIs("SUCCESS") },
  { event_class: "GRANT_DENIED", sources: ["MARKETPLACE_DATA_GRANT_READ_EVALUATED"], fidelity: "DERIVED", resource_type: "DATA_GRANT", actor_role: "BUYER", roles: ["buyer"], match: outcomeIs("DENIED"), fidelity_note: "Derived from MARKETPLACE_DATA_GRANT_READ_EVALUATED with outcome=DENIED." },
  { event_class: "GRANT_REVOKED", sources: ["MARKETPLACE_DATA_GRANT_REVOKED"], fidelity: "EXACT", resource_type: "DATA_GRANT", actor_role: "PROVIDER", roles: ["provider", "buyer"] },
  { event_class: "GRANT_EXPIRED", sources: ["MARKETPLACE_DATA_GRANT_EXPIRED"], fidelity: "EXACT", resource_type: "DATA_GRANT", actor_role: "SYSTEM", roles: ["provider", "buyer"] },
  { event_class: "CONTRIBUTION_JOINED", sources: ["COHORT_CONTRIBUTION_RECORDED"], fidelity: "EXACT", resource_type: "COHORT_CONTRIBUTION", actor_role: "CONTRIBUTOR", roles: ["contributor"] },
  { event_class: "CONTRIBUTION_WITHDRAWN", sources: ["COHORT_CONTRIBUTION_REVOKED"], fidelity: "EXACT", resource_type: "COHORT_CONTRIBUTION", actor_role: "CONTRIBUTOR", roles: ["contributor"] },
  { event_class: "COHORT_DELIVERY_ALLOWED", sources: ["COHORT_SIGNAL_DELIVERED"], fidelity: "EXACT", resource_type: "COHORT", actor_role: "PROVIDER", roles: ["provider"] },
  { event_class: "COHORT_DELIVERY_SUPPRESSED", sources: ["COHORT_DELIVERY_SUPPRESSED"], fidelity: "EXACT", resource_type: "COHORT", actor_role: "PROVIDER", roles: ["provider"] },
  { event_class: "COHORT_DELIVERY_DENIED", sources: ["COHORT_DELIVERY_DENIED"], fidelity: "EXACT", resource_type: "COHORT", actor_role: "PROVIDER", roles: ["provider"] },
  { event_class: "LISTING_REGISTERED", sources: ["MARKETPLACE_LISTING_CREATED"], fidelity: "EXACT", resource_type: "LISTING", actor_role: "PROVIDER", roles: ["provider"] },
  { event_class: "LISTING_DISCOVERED", sources: [], fidelity: "MISSING", resource_type: "LISTING", actor_role: "BUYER", roles: ["buyer"], fidelity_note: "Discovery is a read (GET) and is not audited; no source literal exists." },
  { event_class: "LISTING_ACCESS_EVALUATED", sources: ["MARKETPLACE_ACCESS_EVALUATED"], fidelity: "EXACT", resource_type: "LISTING", actor_role: "BUYER", roles: ["buyer"] },
  { event_class: "METER_INCREMENTED", sources: ["USAGE_METER_THRESHOLD_REACHED", "USAGE_METER_RECORDED", "DATA_MONETIZED"], fidelity: "PARTIAL", resource_type: "METER", actor_role: "SYSTEM", roles: ["provider", "buyer"], fidelity_note: "Metering is recorded at thresholds/monetization points, not as a per-unit increment stream; meter_delta may be null." },
  { event_class: "SETTLEMENT_INTENT_CREATED", sources: ["ECONOMIC_INTENT_QUOTED"], fidelity: "EXACT", resource_type: "SETTLEMENT", actor_role: "BUYER", roles: ["provider", "buyer"], fidelity_note: "Settlement is mock-only; no real funds move." },
  { event_class: "POLICY_EVALUATED", sources: ["HIGH_SENSITIVITY_POLICY_EVALUATED", "RETENTION_POLICY_EVALUATED", "AUTHORITY_ENVELOPE_EVALUATED", "COHORT_ACCESS_EVALUATED", "MARKETPLACE_DATA_GRANT_EVALUATED"], fidelity: "PARTIAL", resource_type: "POLICY", actor_role: "SYSTEM", roles: ["provider", "buyer", "contributor"], fidelity_note: "Aggregates several policy-gate literals; not a single canonical policy-evaluation literal." },
];

// All literals the feed will ever surface (the AND-floor of every query — we
// never return a non-proof audit event).
export const PROOF_SOURCE_LITERALS: string[] = Array.from(
  new Set(PROOF_EVENT_CLASSES.flatMap((c) => c.sources)),
);

// literal → the specs that consume it (for classification).
const SPECS_BY_LITERAL = new Map<string, ProofClassSpec[]>();
for (const spec of PROOF_EVENT_CLASSES) {
  for (const lit of spec.sources) {
    const arr = SPECS_BY_LITERAL.get(lit) ?? [];
    arr.push(spec);
    SPECS_BY_LITERAL.set(lit, arr);
  }
}

// event_class → spec (for the `event_type` filter param accepting class names).
const SPEC_BY_CLASS = new Map(PROOF_EVENT_CLASSES.map((c) => [c.event_class, c]));

// Role → the literals a caller-as-actor sees under that role scope.
function literalsForRole(role: "buyer" | "provider" | "contributor"): string[] {
  return Array.from(
    new Set(PROOF_EVENT_CLASSES.filter((c) => c.roles.includes(role)).flatMap((c) => c.sources)),
  );
}

// ── SAFE projection shape ────────────────────────────────────────────────────
export interface ProofEventView {
  event_id: string;
  event_type: string; // proof CLASS (not the raw literal)
  resource_type: ProofResourceType;
  resource_id: string | null;
  actor_role: ProofActorRole;
  actor_entity_id: string | null; // only when the caller is authorized to see it
  org_entity_id: string | null;
  decision: string;
  proof_reference: string; // the audit chain hash — safe, opaque, no content
  meter_delta: number | null;
  settlement_mode: "MOCK_ONLY" | null;
  is_mock: boolean;
  policy_reference: string | null;
  reason_code: string | null;
  visibility_scope: string;
  created_at: string;
}

export interface ProofFidelityNote {
  event_class: string;
  fidelity: ProofFidelity;
  note: string;
}

export interface ProofEventsQuery {
  scope?: string;
  resource_id?: string;
  event_type?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface ProofEventsView {
  scope: string;
  events: ProofEventView[];
  next_cursor: string | null;
  fidelity_notes: ProofFidelityNote[];
  coverage_note: string | null;
}

export type ProofEventsResult =
  | { ok: true; feed: ProofEventsView }
  | { ok: false; code: string };

const VALID_SCOPES = ["self", "org", "product", "cohort", "grant", "listing", "provider", "buyer", "contributor"] as const;
type ProofScope = (typeof VALID_SCOPES)[number];
const RESOURCE_SCOPES = new Set(["product", "cohort", "grant", "listing"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SET_CAP = 300; // bound on owned-resource / org-member sets per query

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// keyset cursor: base64("<iso timestamp>|<audit_id>")
function encodeCursor(row: AuditEvent): string {
  return Buffer.from(`${row.timestamp.toISOString()}|${row.audit_id}`, "utf8").toString("base64url");
}
function decodeCursor(cursor: string): { ts: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.lastIndexOf("|");
    if (idx <= 0) return null;
    const ts = new Date(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    if (Number.isNaN(ts.getTime()) || id.length === 0) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

export class FoundationProofEventsService {
  constructor(private readonly authService: AuthService) {}

  private async callerOrgOrNull(entityId: string): Promise<string | null> {
    try {
      const org = await getOrgEntityId(entityId);
      return org;
    } catch {
      return null;
    }
  }

  // Active members of an org (the org itself + its direct active children),
  // bounded by SET_CAP. Used for org-admin actor visibility + org scope.
  private async orgMemberIds(orgEntityId: string): Promise<{ ids: string[]; capped: boolean }> {
    const rows = await prisma.entityMembership.findMany({
      where: { parent_id: orgEntityId, is_active: true },
      select: { child_id: true },
      take: SET_CAP + 1,
    });
    const ids = new Set<string>([orgEntityId]);
    for (const r of rows.slice(0, SET_CAP)) ids.add(r.child_id);
    return { ids: Array.from(ids), capped: rows.length > SET_CAP };
  }

  // Resource ids the caller PROVIDES (authoritative tables — never the audit
  // row). Bounded by SET_CAP per kind.
  private async ownedResourceIds(entityId: string): Promise<{
    cohorts: string[];
    listings: string[];
    grants: string[];
    capped: boolean;
  }> {
    const [cohorts, listings, grants] = await Promise.all([
      prisma.cohortDataProduct.findMany({ where: { provider_entity_id: entityId, deleted_at: null }, select: { cohort_product_id: true }, take: SET_CAP + 1 }),
      prisma.marketplaceListing.findMany({ where: { provider_entity_id: entityId }, select: { listing_id: true }, take: SET_CAP + 1 }),
      prisma.marketplaceDataGrant.findMany({ where: { provider_entity_id: entityId }, select: { grant_id: true }, take: SET_CAP + 1 }),
    ]);
    const capped = cohorts.length > SET_CAP || listings.length > SET_CAP || grants.length > SET_CAP;
    return {
      cohorts: cohorts.slice(0, SET_CAP).map((r) => r.cohort_product_id),
      listings: listings.slice(0, SET_CAP).map((r) => r.listing_id),
      grants: grants.slice(0, SET_CAP).map((r) => r.grant_id),
      capped,
    };
  }

  // OR-of-equals over a JSON details key for a bounded id set.
  private jsonKeyIn(key: string, ids: string[]): Array<Record<string, unknown>> {
    return ids.map((id) => ({ details: { path: [key], equals: id } }));
  }

  // WHAT: the governed scoped proof feed for the caller.
  // INPUT: session token + query (scope, optional resource_id, filters, paging).
  // OUTPUT: a SAFE projection page + keyset cursor + fidelity/coverage notes.
  // WHY: GET /api/v1/foundation/proof/events — the canonical trust spine.
  async getProofEventsForCaller(sessionToken: string, query: ProofEventsQuery): Promise<ProofEventsResult> {
    const validation = await this.authService.validateSession(sessionToken, "read");
    if (!validation.valid) return { ok: false, code: validation.code };
    const caller = validation.entity_id;
    const allowedOps = validation.allowed_operations;

    const scope = (query.scope ?? "self").toLowerCase();
    if (!(VALID_SCOPES as readonly string[]).includes(scope)) return { ok: false, code: "INVALID_SCOPE" };
    const s = scope as ProofScope;

    // Common filters.
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const andFilters: Array<Record<string, unknown>> = [];

    // event_type filter: accept a proof CLASS name or a raw literal.
    if (query.event_type !== undefined && query.event_type.length > 0) {
      const cls = SPEC_BY_CLASS.get(query.event_type);
      if (cls !== undefined) {
        if (cls.sources.length === 0) {
          // A MISSING class can never have rows — return an empty, honest page.
          return { ok: true, feed: { scope, events: [], next_cursor: null, fidelity_notes: this.fidelityNotes(), coverage_note: null } };
        }
        andFilters.push({ event_type: { in: cls.sources } });
      } else if (PROOF_SOURCE_LITERALS.includes(query.event_type)) {
        andFilters.push({ event_type: query.event_type });
      } else {
        return { ok: false, code: "INVALID_EVENT_TYPE" };
      }
    }

    // status → outcome.
    if (query.status !== undefined && query.status.length > 0) {
      const up = query.status.toUpperCase();
      if (up !== "SUCCESS" && up !== "DENIED" && up !== "ERROR") return { ok: false, code: "INVALID_STATUS" };
      andFilters.push({ outcome: up as AuditOutcome });
    }

    // time window.
    const timeFilter: Record<string, Date> = {};
    if (query.from !== undefined) {
      const f = new Date(query.from);
      if (Number.isNaN(f.getTime())) return { ok: false, code: "INVALID_FROM" };
      timeFilter.gte = f;
    }
    if (query.to !== undefined) {
      const t = new Date(query.to);
      if (Number.isNaN(t.getTime())) return { ok: false, code: "INVALID_TO" };
      timeFilter.lte = t;
    }
    if (Object.keys(timeFilter).length > 0) andFilters.push({ timestamp: timeFilter });

    // cursor (keyset).
    if (query.cursor !== undefined && query.cursor.length > 0) {
      const c = decodeCursor(query.cursor);
      if (c === null) return { ok: false, code: "INVALID_CURSOR" };
      andFilters.push({
        OR: [
          { timestamp: { lt: c.ts } },
          { AND: [{ timestamp: c.ts }, { audit_id: { lt: c.id } }] },
        ],
      });
    }

    // ── scope authorization + predicate ──────────────────────────────────────
    let callerOrg: string | null = null;
    let visibleActorIds: Set<string> | null = null; // null = only caller's own
    let coverageNote: string | null = null;

    if (s === "self") {
      andFilters.push({ event_type: { in: PROOF_SOURCE_LITERALS } });
      andFilters.push({ actor_entity_id: caller });
    } else if (s === "buyer" || s === "contributor") {
      const role = s; // both are caller-as-actor
      andFilters.push({ event_type: { in: literalsForRole(role) } });
      andFilters.push({ actor_entity_id: caller });
    } else if (s === "provider") {
      callerOrg = await this.callerOrgOrNull(caller);
      const owned = await this.ownedResourceIds(caller);
      if (owned.capped) coverageNote = `Provider scope bounded to the first ${SET_CAP} owned resources of each kind; older resources may be omitted.`;
      const ownershipOr: Array<Record<string, unknown>> = [
        { actor_entity_id: caller }, // provider-initiated proof
        ...this.jsonKeyIn("cohort_product_id", owned.cohorts),
        ...this.jsonKeyIn("listing_id", owned.listings),
        ...this.jsonKeyIn("grant_id", owned.grants),
      ];
      andFilters.push({ event_type: { in: PROOF_SOURCE_LITERALS } });
      andFilters.push({ OR: ownershipOr });
      // Actor identity visible only for same-tenant actors.
      const members = callerOrg !== null ? await this.orgMemberIds(callerOrg) : { ids: [caller], capped: false };
      visibleActorIds = new Set(members.ids);
      visibleActorIds.add(caller);
    } else if (s === "org") {
      if (!allowedOps.includes("admin_org")) return { ok: false, code: "NOT_AUTHORIZED" };
      callerOrg = await this.callerOrgOrNull(caller);
      if (callerOrg === null) return { ok: false, code: "NOT_IN_ANY_ORG" };
      const members = await this.orgMemberIds(callerOrg);
      if (members.capped) coverageNote = `Org scope bounded to the first ${SET_CAP} members; some members' events may be omitted. External actors touching org resources are not included (actor-scoped projection).`;
      else coverageNote = "Org scope is actor-scoped: it shows your members' actions; external actors touching your resources are not included.";
      andFilters.push({ event_type: { in: PROOF_SOURCE_LITERALS } });
      andFilters.push({ actor_entity_id: { in: members.ids } });
      visibleActorIds = new Set(members.ids);
    } else if (RESOURCE_SCOPES.has(s)) {
      const rid = query.resource_id;
      if (rid === undefined || rid.length === 0) return { ok: false, code: "RESOURCE_ID_REQUIRED" };
      callerOrg = await this.callerOrgOrNull(caller);
      const authz = await this.authorizeResourceScope(s, rid, caller, callerOrg, allowedOps);
      if (!authz.ok) return { ok: false, code: authz.code };
      andFilters.push({ event_type: { in: PROOF_SOURCE_LITERALS } });
      andFilters.push({ OR: this.jsonKeyIn(authz.detailsKey, [rid]) });
      // Resource parties may see each other's actor ids on the shared resource;
      // but cross-tenant identities still redacted unless same-tenant.
      const members = callerOrg !== null ? await this.orgMemberIds(callerOrg) : { ids: [caller], capped: false };
      visibleActorIds = new Set(members.ids);
      visibleActorIds.add(caller);
      // Grant parties: both provider and buyer of the grant may see each other.
      for (const id of authz.coParties) visibleActorIds.add(id);
    } else {
      return { ok: false, code: "INVALID_SCOPE" };
    }

    const where = andFilters.length > 0 ? { AND: andFilters } : {};

    const rows = await prisma.auditEvent.findMany({
      where,
      orderBy: [{ timestamp: "desc" }, { audit_id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1] as AuditEvent) : null;

    const events = page
      .map((row) => this.project(row, callerOrg, visibleActorIds, scope))
      .filter((e): e is ProofEventView => e !== null);

    return {
      ok: true,
      feed: { scope, events, next_cursor: nextCursor, fidelity_notes: this.fidelityNotes(), coverage_note: coverageNote },
    };
  }

  // Authorize a resource-scoped query and return the details key to filter on.
  private async authorizeResourceScope(
    scope: ProofScope,
    resourceId: string,
    caller: string,
    callerOrg: string | null,
    allowedOps: string[],
  ): Promise<{ ok: true; detailsKey: string; coParties: string[] } | { ok: false; code: string }> {
    const sameOrgAdmin = (orgId: string | null): boolean =>
      orgId !== null && callerOrg !== null && callerOrg === orgId && allowedOps.includes("admin_org");

    if (scope === "grant") {
      const grant = await prisma.marketplaceDataGrant.findUnique({
        where: { grant_id: resourceId },
        select: { provider_entity_id: true, buyer_entity_id: true },
      });
      if (grant === null) return { ok: false, code: "RESOURCE_NOT_FOUND" };
      const isParty = grant.provider_entity_id === caller || grant.buyer_entity_id === caller;
      if (!isParty && !sameOrgAdmin(null)) return { ok: false, code: "RESOURCE_NOT_FOUND" };
      // Both parties to the grant may see each other's actor id on it.
      return { ok: true, detailsKey: "grant_id", coParties: [grant.provider_entity_id, grant.buyer_entity_id] };
    }

    if (scope === "listing") {
      const listing = await prisma.marketplaceListing.findUnique({
        where: { listing_id: resourceId },
        select: { provider_entity_id: true, provider_org_entity_id: true },
      });
      if (listing === null) return { ok: false, code: "RESOURCE_NOT_FOUND" };
      const owner = listing.provider_entity_id === caller;
      if (!owner && !sameOrgAdmin(listing.provider_org_entity_id)) return { ok: false, code: "RESOURCE_NOT_FOUND" };
      return { ok: true, detailsKey: "listing_id", coParties: [] };
    }

    // product == cohort product in Foundation's registry.
    const cohort = await prisma.cohortDataProduct.findFirst({
      where: { cohort_product_id: resourceId, deleted_at: null },
      select: { provider_entity_id: true, provider_org_entity_id: true },
    });
    if (cohort === null) return { ok: false, code: "RESOURCE_NOT_FOUND" };
    const owner = cohort.provider_entity_id === caller;
    if (!owner && !sameOrgAdmin(cohort.provider_org_entity_id)) return { ok: false, code: "RESOURCE_NOT_FOUND" };
    return { ok: true, detailsKey: "cohort_product_id", coParties: [] };
  }

  // Classify an audit row into a proof class (the first matching spec wins).
  private classify(row: AuditEvent, details: Record<string, unknown>): ProofClassSpec | null {
    const specs = SPECS_BY_LITERAL.get(row.event_type);
    if (specs === undefined) return null;
    for (const spec of specs) {
      if (spec.match === undefined || spec.match(row, details)) return spec;
    }
    return null;
  }

  // The SAFE field-allowlist projection. NEVER a raw details passthrough.
  private project(
    row: AuditEvent,
    callerOrg: string | null,
    visibleActorIds: Set<string> | null,
    scope: string,
  ): ProofEventView | null {
    const details = asRecord(row.details);
    const spec = this.classify(row, details);
    if (spec === null) return null;

    // resource_id: the primary id for this resource type (safe identifiers only).
    const resourceId =
      spec.resource_type === "ACCESS_REQUEST" ? strOrNull(details.request_id) ?? strOrNull(details.access_request_id)
        : spec.resource_type === "DATA_GRANT" ? strOrNull(details.grant_id)
          : spec.resource_type === "COHORT_CONTRIBUTION" ? strOrNull(details.contribution_id)
            : spec.resource_type === "COHORT" ? strOrNull(details.cohort_product_id)
              : spec.resource_type === "LISTING" ? strOrNull(details.listing_id)
                : spec.resource_type === "CONSENT" ? strOrNull(details.grant_id) ?? strOrNull(details.consent_record_id)
                  : strOrNull(details.listing_id) ?? strOrNull(details.grant_id) ?? strOrNull(details.cohort_product_id);

    // actor identity: only when same-tenant / a party / the caller themselves.
    const actorVisible =
      row.actor_entity_id !== null &&
      (visibleActorIds === null
        ? false // self/buyer/contributor: actor IS the caller, no need to echo a foreign id
        : visibleActorIds.has(row.actor_entity_id));
    // For self/buyer/contributor scope the actor is always the caller; surface it.
    const actorIsCaller = visibleActorIds === null && row.actor_entity_id !== null;
    const actorEntityId = actorVisible || actorIsCaller ? row.actor_entity_id : null;

    const economic = spec.resource_type === "SETTLEMENT" || spec.resource_type === "METER";
    const decision = strOrNull(details.decision) ?? row.outcome;

    // meter_delta: only project a real numeric delta when present.
    const meterDelta =
      typeof details.meter_delta === "number" ? details.meter_delta
        : typeof details.units === "number" ? details.units
          : typeof details.billable_units === "number" ? details.billable_units
            : null;

    const reasonCode =
      row.denial_reason ??
      strOrNull(details.intake_reason) ??
      (Array.isArray(details.denied_reasons) && typeof details.denied_reasons[0] === "string" ? details.denied_reasons[0] : null);

    const policyReference =
      spec.resource_type === "POLICY"
        ? strOrNull(details.policy_reference) ?? strOrNull(details.review_id) ?? spec.event_class
        : null;

    return {
      event_id: row.audit_id,
      event_type: spec.event_class,
      resource_type: spec.resource_type,
      resource_id: resourceId,
      actor_role: spec.actor_role,
      actor_entity_id: actorEntityId,
      org_entity_id: callerOrg,
      decision: typeof decision === "string" ? decision : String(decision),
      proof_reference: row.event_hash,
      meter_delta: meterDelta,
      settlement_mode: economic ? "MOCK_ONLY" : null,
      is_mock: economic,
      policy_reference: policyReference,
      reason_code: reasonCode,
      visibility_scope: scope,
      created_at: row.timestamp.toISOString(),
    };
  }

  private fidelityNotes(): ProofFidelityNote[] {
    return PROOF_EVENT_CLASSES.filter((c) => c.fidelity !== "EXACT").map((c) => ({
      event_class: c.event_class,
      fidelity: c.fidelity,
      note: c.fidelity_note ?? `${c.fidelity} fidelity.`,
    }));
  }
}
