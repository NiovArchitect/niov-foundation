# ADR-0004: Service-owned auth gate pattern

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 2 @ `f3359fb`; emergent
architectural lesson)

## Context

Routes that need both auth and business logic in the same
operation have a recurring temptation: reach into private
service fields (e.g.,
`service["authService"].validateSession(token)`) to validate
the session, then call the business-logic method. This pattern
appears innocuous in any single instance but compounds across
the codebase.

Three problems emerge at scale:

- **Encapsulation violation.** Routes know about the service's
  internal composition. The service cannot refactor its auth
  dependency without touching every route file.
- **Auth-model migrations become high-churn.** When Section 12.5
  Sub-box 7's verifiable-credentials infrastructure lands, every
  route reaching into private auth fields needs touching.
- **Test surface expands.** Each route handler has to test the
  auth failure path independently. Same auth logic, multiple
  test copies.

The pattern surfaced explicitly during Section 12C.0 Item 9
(GET /api/v1/compliance/state). Initial implementation reached
into `complianceService["authService"]`. Refactoring to a public
`getComplianceStateForCaller(token, ...args)` method made the
route handler 4 lines (vs 17 lines pre-refactor) and consolidated
auth logic in the service.

## Decision

When a Foundation route needs both session validation and
business logic in one operation, the service exposes a public
`${operation}ForCaller(sessionToken, ...args)` method that
handles auth + delegation in one call. The route handler:

- Extracts the bearer token (or returns 401)
- Calls the service's `${op}ForCaller` method
- Translates the result to an HTTP response

Routes never reach into private service fields for auth.

The canonical example is
`apps/api/src/services/compliance/compliance.service.ts:528-545`
(`getComplianceStateForCaller`) used by
`apps/api/src/routes/compliance.routes.ts:115-124` (the GET
/api/v1/compliance/state handler).

## Consequences

### Easier

- Auth-model migrations touch only the service layer; route
  files stay shallow
- Service encapsulation preserved (private fields stay private)
- Auth failure paths tested once per service method, not per
  route
- Route handlers become uniformly 3-5 lines, easier to review

### Harder

- Each privileged service method needs both internal-use and
  for-caller variants (or a single method with optional
  pre-validated inputs)
- Service interface surface grows (one extra public method per
  privileged operation)
- Initial pattern adoption requires refactoring existing routes
  that reach into private fields (deferred to natural-edit
  basis post-12C.0)

## Alternatives Considered

### Middleware-based auth

Rejected. Middleware loses access to per-operation context like
delegation rules, conditional auth requirements, or escalation
triggers (Sub-box 1 will introduce these). Per-method auth keeps
the context attached to the operation that needs it.

### Direct service field access via getter

Rejected. Encapsulation violation by another name. Future
refactors of the service's auth dependency still touch every
route.

### Higher-order function wrapping

Rejected. Adds a layer of indirection that obscures which
operation requires auth and which doesn't.

## References

- `apps/api/src/services/compliance/compliance.service.ts:528-545`
  (`getComplianceStateForCaller`, canonical example)
- `apps/api/src/routes/compliance.routes.ts:115-124` (4-line
  route handler using the pattern)
- `f3359fb` (Section 12C.0 Commit 2; introduces the pattern via
  Item 9)
- Section 12C.0 architectural lesson 2 (Service-owned auth gate
  pattern)
- ADR-0007 (manual bearer auth for /compliance/*; this ADR
  inherits and extends the auth-gate pattern)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Service-Owned Auth Gate"
- `CLAUDE.md` (when drafted in Phase 3) → Section 4 (Critical
  Operating Rules, Lesson 2 reference)
