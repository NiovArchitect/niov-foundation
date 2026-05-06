# ADR-0007: Manual bearer auth for `/compliance/*` endpoints

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 2 @ `f3359fb`; will be
superseded by Section 12.5 Sub-box 7)

## Context

Foundation endpoints have heterogeneous auth patterns. Most
admin endpoints use a `requireAdminCapability` middleware
attached to the route registration. `/compliance/*` endpoints
(introduced before Section 12C.0) use a different pattern:
manual bearer-token extraction + `authService.validateSession`
call, embedded in the route handler.

Section 12C.0 Item 9 (GET /api/v1/compliance/state) needed to
choose: standardize on `requireAdminCapability` middleware
(DRIFT 14 Option B) or match the existing `/compliance/*`
sibling pattern (DRIFT 14 Option A).

Premature standardization would have:

- Broken pattern with sibling endpoints (POST
  /compliance/check, GET /compliance/frameworks, etc.)
- Required testing all `/compliance/*` endpoints under the new
  pattern (out of scope for Item 9)
- Locked us into a middleware design before Section 12.5
  Sub-box 7's verifiable-credentials infrastructure landed (the
  proper unification target)

Manual bearer auth on `/compliance/*` preserves sibling
consistency in this commit and creates a clear migration target
for Sub-box 7. Sub-box 7 will then standardize all
`/compliance/*` endpoints under a unified
verifiable-credentials auth model in one batch.

## Decision

GET /api/v1/compliance/state uses manual bearer-token extraction
+ session validation matching sibling `/compliance/*` endpoints
(DRIFT 14 Option A). The implementation pattern:

- Route handler extracts bearer token via
  `bearerFrom(headers.authorization)`; returns 401
  SESSION_INVALID if missing
- Route handler calls
  `complianceService.getComplianceStateForCaller(sessionToken)`
  (the service-owned auth gate from ADR-0004)
- The service handles validation, delegation lookup, and
  business logic in one call

Section 12.5 Sub-box 7 will supersede this ADR by introducing
unified verifiable-credentials auth across all `/compliance/*`
endpoints. When Sub-box 7 lands, this ADR's Status updates to
"Superseded by ADR-NNNN" where NNNN is the Sub-box 7 ADR.

## Consequences

### Easier

- `/compliance/*` endpoints stay structurally consistent with
  siblings (no half-migrated state)
- Section 12.5 Sub-box 7 has a clear migration target (the
  whole `/compliance/*` tree, not just the new endpoint)
- Service-owned auth gate pattern (ADR-0004) is reusable across
  all `/compliance/*` endpoints

### Harder

- `/compliance/*` endpoints don't share the
  `requireAdminCapability` middleware's centralized policy
  logic
- New `/compliance/*` endpoints must use the manual bearer
  pattern until Sub-box 7 lands (otherwise inconsistent with
  siblings)
- Sub-box 7 work is gated on Track A test infrastructure
  isolation completing first (per Section 12 progress tracker)

## Alternatives Considered

### `requireAdminCapability` middleware (DRIFT 14 Option B)

Rejected. Premature standardization breaks pattern with
`/compliance/*` siblings and locks middleware design before
Sub-box 7's verifiable-credentials infrastructure lands.

### Standardize all `/compliance/*` in this commit

Rejected. Out of scope for Item 9; would have required +6
endpoint refactors and full re-verification of `/compliance/*`
behavior.

### Defer GET /api/v1/compliance/state until Sub-box 7

Rejected. Continuous compliance state surface (Compliance
Architecture Review Dimension 3.3) was YELLOW remediation in
Section 12.5 and needed to land in Section 12C.0.

## References

- `apps/api/src/routes/compliance.routes.ts:115-124` (the route
  handler using manual bearer pattern)
- `apps/api/src/services/compliance/compliance.service.ts:528-545`
  (the service-owned auth gate it consumes)
- `f3359fb` (Section 12C.0 Commit 2; introduces this pattern
  via Item 9)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` Sub-box 7 (the
  superseding work)
- ADR-0004 (service-owned auth gate pattern; this ADR builds on
  it)

Bidirectional citations (cited from):

- `docs/reference/architectural-anchors.md` (no direct
  citation; this ADR is auth-pattern documentation, not an
  anchor)
- ADR-0004 (cites this ADR as an example of the service-owned
  auth pattern's application)
