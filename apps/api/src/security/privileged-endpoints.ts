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
  type:
    | "PLATFORM_MONETIZATION_CONFIG_UPDATE"
    | "PLATFORM_ORG_CREATION"
    // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
    // Sub-decision 6 dual-control binding for regulator access
    // grant + revoke routes. Both routes are can_admin_niov-tier
    // (preserves the Tension 3 Category (1) invariant per Q8 LOCKED
    // Option α canonical at substantive register substantively).
    | "REGULATOR_ACCESS_GRANT"
    | "REGULATOR_ACCESS_REVOKE"
    // ADR-0057 §7 Operation E — the first LIVE entry to exercise
    // Class B (`can_admin_org` tier) at the integration tier. Binds
    // to PUT /api/v1/org/action-policies — the org admin surface
    // for upserting ActionPolicy rows that the future
    // evaluateActionPolicy consumer at action.service.ts (forward-
    // substrate per ADR-0057 §16 step 4-7) reads from. Privileged
    // because it changes the autonomy contract.
    | "ORG_ACTION_POLICY_UPDATE"
    // D6 enterprise activation per ADR-0080 §23 Amendment 7 +
    // ADR-0026 dual-control middleware pattern. Converts the
    // truthfully-recorded DUAL-CONTROL design-intent from the
    // enterprise-activation.json catalog (steps 10 + 11 emit
    // WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL +
    // REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL audit literals)
    // into actual approval-flow enforcement at runtime. The
    // enterprise activation walks 14 catalog steps including
    // financial-effect templates (step 10) + regulator-grade audit
    // tier (step 11); both are categorically dual-control-bound
    // per ADR-0026 §6. Binds POST /api/v1/org/dandelion/activate/
    // enterprise; Class B (can_admin_org tier) — second admin in
    // the same org must approve before the route handler runs.
    | "ORG_DANDELION_ENTERPRISE_ACTIVATION"
    // W5 Action Promotion Runtime per ADR-0086 §4. Binds POST
    // /api/v1/proposed-actions/:catalog_id/promote-dual-control.
    // Class B (can_admin_org tier) — second admin in the same org
    // must approve before the promotion service translates the W4
    // catalog entry into a Section 2 Action via createActionForCaller.
    // The plain POST /api/v1/proposed-actions/:catalog_id/promote
    // route is NOT in this registry; the service decides per the
    // catalog's `governance_gates.dual_control_required` flag and
    // 409s when the wrapped route is required.
    | "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION";
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
  {
    // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
    // Sub-decisions 6 + 7. Operation C -- REGULATOR access grant: tenant
    // admin grants an external REGULATOR principal time-bounded access
    // under a documented LawfulBasis (subpoena / regulatory authority /
    // court order / DPA request / MLAT / consent-of-data-subject).
    // Atomic transaction: createLawfulBasisInTx + writeAuditEvent
    // (REGULATOR_ACCESS_GRANTED) + linkLawfulBasisToAuditEventInTx.
    // Bound at apps/api/src/routes/regulator.routes.ts.
    method: "POST",
    route: "/api/v1/regulator/access-grants",
    authTier: "can_admin_niov",
    actionDescriptor: { type: "REGULATOR_ACCESS_GRANT" },
  },
  {
    // CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
    // Sub-decision 6. Operation D -- REGULATOR access revoke: tenant
    // admin revokes a previously-granted lawful basis before its
    // valid_until. Audit-event-only revocation model per Q-D answer
    // (no durable RegulatorAccessGrant table at sub-phase 5; revoke
    // resolves regulator_entity_id via LawfulBasis.audit_id ->
    // AuditEvent.target_entity_id chain). REGULATOR_ACCESS_EXPIRED
    // (scheduler-emitted) is forward-queued; not bound here.
    method: "POST",
    route: "/api/v1/regulator/access-revocations",
    authTier: "can_admin_niov",
    actionDescriptor: { type: "REGULATOR_ACCESS_REVOKE" },
  },
  {
    // ADR-0057 §7 Operation E -- ORG_ACTION_POLICY_UPDATE: the org
    // admin surface for upserting ActionPolicy rows (UNIQUE
    // (org_entity_id, action_type, risk_tier) per ADR-0057 §2). This
    // is the FIRST LIVE entry to exercise Class B at the integration
    // tier (Class B target resolver picks the org-admin pool member;
    // deterministic-lowest-`entity_id`; cross-org candidates excluded
    // structurally per ADR-0026 Amendment 1 §6).
    //
    // RULE 13 substrate-state observation: this entry introduces the
    // FIRST `can_admin_org`-tier LIVE registry entry. The prior
    // tests/unit/privileged-endpoints.test.ts invariant
    // "contains only can_admin_niov-gated entries (per Tension 3
    // Category (1))" was authored before ADR-0057 §7 introduced
    // Category (1) Class B expansion; that test is updated in this
    // same slice to reflect the new tier mix.
    //
    // Fail-closed: single-admin org -> 503 ESCALATION_TARGET_NOT_FOUND
    // + DUAL_CONTROL_NO_APPROVER_AVAILABLE marker per ADR-0026
    // Amendment 1 §6 + GAP-C1 source-cannot-self-resolve guard at
    // escalation.service.ts:397-407.
    //
    // Audit emission (forward-substrate via the route handler) is
    // ACTION_POLICY_UPDATE per ADR-0057 §10 -- the
    // safe-allowlisted details surface is: policy_id, action_type,
    // risk_tier, default_decision, route, method, actor_entity_id.
    // FORBIDDEN per ADR-0057 §10: raw request body, raw policy
    // envelope JSON, secrets, capsule content, embeddings/vectors,
    // candidate-pool data, break-glass justification text.
    method: "PUT",
    route: "/api/v1/org/action-policies",
    authTier: "can_admin_org",
    actionDescriptor: { type: "ORG_ACTION_POLICY_UPDATE" },
  },
  {
    // D6 enterprise activation per ADR-0080 §23 Amendment 7 +
    // ADR-0026 dual-control middleware pattern. Binds
    // POST /api/v1/org/dandelion/activate/enterprise — converts
    // the truthfully-recorded DUAL-CONTROL design-intent from the
    // enterprise-activation.json catalog (steps 10 + 11) into
    // actual approval-flow enforcement at runtime. The starter-
    // pilot / team / business archetypes intentionally remain
    // single-actor (their catalogs do not carry *_DUAL_CONTROL
    // audit literals; their corresponding routes
    // /activate{,/team,/business} are NOT in this registry).
    //
    // Class B (can_admin_org tier) — second admin in the same org
    // must approve before the route handler runs; cross-org
    // candidates excluded structurally per ADR-0026 Amendment 1 §6.
    // Fail-closed: single-admin org → 503
    // ESCALATION_TARGET_NOT_FOUND + DUAL_CONTROL_NO_APPROVER_
    // AVAILABLE marker.
    //
    // Privacy invariant inherited from D6 enterprise runtime:
    // env-var NAMEs only in request body (slack_secret_ref +
    // google_secret_ref). The dual-control approval flow does NOT
    // need to surface the request body in the EscalationRequest;
    // standard EscalationRequest metadata + the route descriptor
    // alone identify the operation to the second approver.
    method: "POST",
    route: "/api/v1/org/dandelion/activate/enterprise",
    authTier: "can_admin_org",
    actionDescriptor: { type: "ORG_DANDELION_ENTERPRISE_ACTIVATION" },
  },
  {
    // W5 Action Promotion Runtime per ADR-0086 §4. Binds the
    // dual-control-wrapped promotion route. The plain
    // /promote route is intentionally NOT in this registry — its
    // service path 409s with DUAL_CONTROL_REQUIRED when the catalog
    // entry requires dual-control, prompting the caller to use the
    // wrapped route below. Class B (can_admin_org tier): second
    // admin in the same org must approve before the promotion
    // service maps the catalog entry to a Section 2 Action via
    // createActionForCaller. Cross-org candidates excluded
    // structurally per ADR-0026 Amendment 1 §6. Fail-closed:
    // single-admin org → 503 ESCALATION_TARGET_NOT_FOUND +
    // DUAL_CONTROL_NO_APPROVER_AVAILABLE marker.
    //
    // Privacy invariant: the catalog_id route parameter is the W4
    // catalog string id; it carries no secret material. The
    // EscalationRequest description carries
    // DUAL_CONTROL:PROPOSED_ACTION_DUAL_CONTROL_PROMOTION plus the
    // catalog_id — sufficient to identify the operation to the
    // second approver without exposing runtime_data or
    // payload_redacted to the EscalationRequest substrate.
    method: "POST",
    route: "/api/v1/proposed-actions/:catalog_id/promote-dual-control",
    authTier: "can_admin_org",
    actionDescriptor: { type: "PROPOSED_ACTION_DUAL_CONTROL_PROMOTION" },
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
