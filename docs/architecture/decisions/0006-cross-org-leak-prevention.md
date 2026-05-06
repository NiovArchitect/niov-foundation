# ADR-0006: Cross-org leak prevention via filter narrowing

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 1 @ `2aa1a88`; extended
in Commit 2 @ `f3359fb` via DRIFT 12 chainKey priority)

## Context

Endpoints that accept query filters (`event_type`,
`actor_entity_id`, `target_entity_id`, `bridge_id`) must narrow
the caller's existing org-scope and never broaden it. A query
filter that allows escape to another tenant's org is a privilege
escalation and a GDPR violation simultaneously.

The risk surface is structural: any filter that becomes part of
the WHERE clause without composing AS AND with the org-scope
predicate creates an escape vector. ORM bugs, developer
mistakes, and adversarial query construction all create the
same failure mode.

Section 12C.0 Commit 1 (Items 3 and 4) added query filter
support to two existing endpoints:

- `GET /api/v1/org/audit` (`event_type`, `actor_entity_id`,
  `target_entity_id` filters)
- `GET /api/v1/org/permissions` (`bridge_id` filter)

Pre-flight grep surfaced DRIFT 9: the initial filter
implementation risked broadening scope when filter values
matched cross-org rows. The resolution made all filter arguments
compose AS AND clauses with the existing org-scope predicate,
never replacing it.

A separate but related concern (DRIFT 12, Commit 2) emerged for
audit chain emissions: chainKey selection priority must follow
`actor_entity_id` → `system_principal` → legacy
`SYSTEM_CHAIN_KEY` to preserve backwards-compat with
pre-Section-12C.0 emissions. That priority is documented here
because it lives in the same audit substrate.

## Decision

Foundation enforces two related architectural properties:

1. **Filter narrowing.** All query filter arguments on endpoints
   that have an existing org-scope predicate compose AS AND with
   that predicate, never AS OR or AS REPLACEMENT.
2. **chainKey priority for audit emissions.** The priority
   sequence is `actor_entity_id` → `system_principal` → legacy
   `SYSTEM_CHAIN_KEY` (where the legacy fallback is the DRIFT
   12 backwards-compat anchor; pre-Section-12C.0 emissions
   remain verifiable).

Anchor tests in `tests/integration/admin-routes.test.ts`
(filter narrowing) and
`tests/unit/audit-system-principals.test.ts` (chainKey priority
+ backwards-compat) lock both properties. Crafted filter values
cannot return cross-org rows; pre-Section-12C.0 emissions remain
chain-verifiable without modification.

## Consequences

### Easier

- Filter-based privilege escalation is structurally prevented
- New endpoints adding filters extend the anchor test (additive)
- Pre-Section-12C.0 audit emissions remain verifiable without
  data migration (DRIFT 12 backwards-compat)
- GDPR data-isolation posture preserved across tenants

### Harder

- New filter arguments must explicitly compose AS AND with the
  org-scope predicate (cannot use the ORM's default OR
  composition pattern)
- Anchor tests must be updated when new endpoints with filters
  land (additive maintenance, not optional)
- chainKey priority is a fixed sequence; new principal types
  (Section 12.5 Sub-box 7's verifiable-credential issuer) must
  fit between existing slots, not replace them

## Alternatives Considered

### Trust the ORM's where-clause composition

Rejected. ORM bugs and developer mistakes both exist; the
runtime test catches both.

### Document-only "always include org-scope"

Rejected. Not enforceable without a runtime test; relies on
reviewer attention.

### Per-endpoint isolation tests without a unified anchor

Rejected. Same property tested in multiple test files diverges
over time; one anchor test in
`tests/integration/admin-routes.test.ts` serves both audit and
permissions endpoints.

## References

- `tests/integration/admin-routes.test.ts` (DRIFT 9 anchor for
  filter narrowing on `/audit` and `/permissions`)
- `tests/unit/audit-system-principals.test.ts` (DRIFT 12 anchor
  for chainKey priority backwards-compat)
- `packages/database/src/queries/audit.ts:251` (chainKey
  priority implementation)
- `2aa1a88` (Section 12C.0 Commit 1; introduces filter
  narrowing anchors)
- `f3359fb` (Section 12C.0 Commit 2; introduces chainKey
  priority + DRIFT 12 backwards-compat anchor)
- ADR-0002 (audit chain integrity; chainKey priority is part of
  the audit substrate)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Cross-Org Leak Prevention",
  "writeAuditEvent"
- `docs/reference/architectural-anchors.md` → entries 1, 2
  (DRIFT 9 anchors), 4 (DRIFT 12 anchor)
- ADR-0002 (back-cited for chainKey priority detail)
