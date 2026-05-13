// FILE: privileged-endpoints.ts
// PURPOSE: Runtime registry of LIVE privileged endpoints that require
//          dual-control verification before handler execution. The
//          requireDualControl Fastify preHandler (sub-phase E) reads
//          this registry on every incoming request: a match means the
//          request is intercepted and a second approver's APPROVED
//          EscalationRequest (escalation_type DUAL_CONTROL_REQUIRED)
//          must exist before the route handler runs; no match means the
//          request bypasses the preHandler (single-actor operation per
//          COMPLIANCE_ARCHITECTURE_REVIEW.md Tension 3 "Everything else
//          stays single-actor").
// CONNECTS TO:
//   - apps/api/src/middleware/dual-control.middleware.ts (the consumer;
//     sub-phase E [SEC-DUAL-CONTROL-MIDDLEWARE] of the Sub-box 2 Phase 1 arc)
//   - apps/api/src/routes/platform.routes.ts (the 2 LIVE Category (1)
//     routes the preHandler binds to at sub-phases F + G)
//   - docs/architecture/dual-control-operations-canonical-record.md (the
//     implementation-facing canonical record; the full 8-operation
//     enumeration across the 4 categories)
//   - docs/COMPLIANCE_ARCHITECTURE_REVIEW.md Tension 3 (the
//     source-of-substance for the 4-category framing; the "enumerated
//     set, not a general primitive" principle)
//   - apps/api/src/index.ts (re-exports PRIVILEGED_ENDPOINTS /
//     isPrivilegedEndpoint / PrivilegedEndpoint / EscalationActionDescriptor
//     via @niov/api for the test tier + future cross-package consumers)
//
// SCOPE NOTE: this runtime registry contains ONLY the LIVE Category (1)
// entries -- the operations that exist as Fastify routes today and have
// the requireDualControl preHandler bound. The full 8-operation
// enumeration (2 LIVE / 4 forward-substrate / 1 DB-tier / 1
// RULE-10-retired) is at the canonical-record doc, per the three-artifact
// substrate split: the runtime registry consumes only what the middleware
// operates on; the canonical-record doc holds the full enumeration; the
// Tension 3 amendment is the source-of-substance. Future LIVE entries
// (per the canonical-record doc forward paths -- e.g. operation 1 account
// creation at Sub-box 2 Phase 2; operation 6 TAR clearance-ceiling) land
// here when their target sub-phase ships. This is import-time-loaded
// immutable substrate (`as const`): no in-memory mutation across the
// server lifetime -- the BEAM-compatibility pattern-3 posture (state from
// a durable source; here, the module load) per the canonical-record doc
// §5; the other BEAM-compatibility patterns land at the sub-phase E
// middleware (this file is data, not coordination).

/**
 * WHAT: The action that triggers dual-control verification for a
 *       privileged endpoint -- a type literal identifying the operation
 *       plus optional metadata carried into the EscalationRequest +
 *       Zone U1 audit-event detail.
 * INPUT: Used as a value/parameter type.
 * OUTPUT: None -- this is a type, not a value.
 * WHY: Decouples the route-binding substrate from the action-semantics
 *      substrate; the dual-control middleware reasons about action types
 *      (constructing EscalationRequest descriptors and Zone U1 audit
 *      events), not raw route strings.
 */
export type EscalationActionDescriptor = {
  type: "PLATFORM_MONETIZATION_CONFIG_UPDATE" | "PLATFORM_ORG_CREATION";
  metadata?: Record<string, unknown>;
};

/**
 * WHAT: One LIVE privileged-endpoint entry -- the (method, route) tuple
 *       the requireDualControl preHandler intercepts, plus the admin
 *       capability tier already gating it and the action descriptor.
 * INPUT: Used as a value type.
 * OUTPUT: None -- this is a type, not a value.
 * WHY: Type-safe runtime substrate that the middleware reads at
 *      request-processing time; immutable across the server lifetime
 *      (the registry is declared `as const`).
 */
export type PrivilegedEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  route: string;
  authTier: "can_admin_niov" | "can_admin_org";
  actionDescriptor: EscalationActionDescriptor;
};

/**
 * WHAT: The runtime registry of LIVE privileged endpoints requiring
 *       dual-control verification -- the 2 Category (1) LIVE entries per
 *       the canonical-record doc and the Tension 3 amendment.
 * INPUT: Import-time-loaded immutable substrate (`as const`).
 * OUTPUT: A readonly array of PrivilegedEndpoint.
 * WHY: Single source of truth for the dual-control middleware's
 *      per-request lookup; the middleware matches incoming requests
 *      against this registry and enforces dual-control only on matches.
 *      Both LIVE entries are can_admin_niov-gated (the platform-tier
 *      operations -- the highest-stakes routes that exist today).
 */
export const PRIVILEGED_ENDPOINTS: readonly PrivilegedEndpoint[] = [
  {
    // Operation A -- the 70/30 revenue-split mutation; the highest
    // economic-impact substrate operation in the Foundation. Binds at
    // sub-phase F [SEC-DUAL-CONTROL-BINDING-CONFIG].
    method: "PATCH",
    route: "/api/v1/platform/monetization/config",
    authTier: "can_admin_niov",
    actionDescriptor: { type: "PLATFORM_MONETIZATION_CONFIG_UPDATE" },
  },
  {
    // Operation B -- org creation (Dandelion Phase 0); provisions a new
    // tenant on the Foundation. Binds at sub-phase G
    // [SEC-DUAL-CONTROL-BINDING-ORGS].
    method: "POST",
    route: "/api/v1/platform/orgs",
    authTier: "can_admin_niov",
    actionDescriptor: { type: "PLATFORM_ORG_CREATION" },
  },
] as const;

/**
 * WHAT: Type guard that resolves a (method, route) tuple to its
 *       PrivilegedEndpoint entry if registered, otherwise undefined.
 * INPUT: method (the HTTP method string) + route (the Fastify route
 *        path; must match the registry entry exactly).
 * OUTPUT: The matched PrivilegedEndpoint, or undefined if not registered.
 * WHY: The dual-control middleware calls this on every incoming request
 *      to decide whether dual-control verification is required;
 *      absence-of-match means the request bypasses the middleware (a
 *      single-actor operation per Tension 3). Method-sensitivity is
 *      deliberate: a matching route under a different method is NOT a
 *      privileged endpoint -- this prevents an accidental dual-control
 *      bypass via method substitution.
 */
export function isPrivilegedEndpoint(
  method: string,
  route: string,
): PrivilegedEndpoint | undefined {
  return PRIVILEGED_ENDPOINTS.find(
    (entry) => entry.method === method && entry.route === route,
  );
}

/**
 * WHAT: Canonical `description` string for an EscalationRequest gating a
 *       dual-control privileged-endpoint operation -- the exact-match
 *       carrier of the action-descriptor type.
 * INPUT: actionType (an EscalationActionDescriptor["type"] literal -- the
 *        privileged-endpoint operation being gated).
 * OUTPUT: A string of the form `DUAL_CONTROL:${actionType}` (uppercase
 *         prefix + colon + the descriptor literal).
 * WHY: The EscalationRequest model has no `details` JSON column (it has
 *      `description: String` and `resolution_metadata: Json?`), and the
 *      dual-control canonical record (§3 step 3) specifies the action
 *      descriptor is matched "via description or a future action field".
 *      Until that future field exists, the `description` column is the
 *      carrier. Both the `requireDualControl` Fastify preHandler
 *      (`apps/api/src/middleware/dual-control.middleware.ts`, sub-phase E)
 *      and `findApprovedDualControlForCaller`
 *      (`apps/api/src/services/governance/escalation.service.ts`) route
 *      through this helper so the create-side write and the read-side
 *      query use identical exact-match semantics -- no typo drift, and a
 *      future reader can grep `DUAL_CONTROL:` to find every dual-control
 *      escalation. See `docs/architecture/dual-control-operations-canonical-record.md`
 *      §3 + §4.
 */
export function dualControlDescription(
  actionType: EscalationActionDescriptor["type"],
): string {
  return `DUAL_CONTROL:${actionType}`;
}
