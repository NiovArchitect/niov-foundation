# Section 7 — Full Audit Viewer

> Detailed canonical record for production Section 7. Master index:
> [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md).

## Purpose

Operator + admin + regulator-facing surface to read the
append-only audit chain with hash-chain integrity verification,
per-actor / per-target filtering, scope-respecting projection,
and export. Per ADR-0002 the audit chain is sacrosanct; this
section adds the read surface, never the write surface.

## Current status

**Read substrate partial.** Foundation primitives
(`queryAuditEvents`, `verifyAuditChain`,
`MAX_AUDIT_EVENTS_PAGE_SIZE = 100`,
`writeAuditEvent` with per-chain advisory locks) are LIVE in
`packages/database/src/queries/audit.ts`. A dedicated full
audit-viewer route + Control Tower surface is forward-substrate.

## What is live

- Append-only `AuditEvent` table with BEFORE DELETE trigger
  enforcing RULE 10 + ADR-0002.
- Hash-chain integrity (`event_hash` + `previous_event_hash` +
  `verifyAuditChain`).
- Per-chain advisory locks via `pg_advisory_xact_lock` so
  concurrent writers never link to the same previous event.
- 5 system principals (`SCHEDULER`, `BOOT_VALIDATOR`,
  `COMPLIANCE_SEEDER`, `FEEDBACK_LOOP`, `COSMP_ROUTER`).
- `queryAuditEvents` filter/paginate primitive (consumed by
  internal tests + compliance routes; no dedicated viewer
  endpoint yet).

## What is not live

- Dedicated audit-viewer route surface
  (`/api/v1/audit/events?...`).
- Per-actor / per-target scope enforcement at the viewer route
  tier (the primitive supports the filter, but the route +
  authorization is forward-substrate).
- Hash-chain verification surface exposed to operators / admins.
- Export surface (CSV / NDJSON).
- Control Tower audit-viewer UX.

## RULE 13 disclosures specific to Section 7

- The audit chain is the most-privileged read surface; the
  viewer MUST enforce TAR-authoritative scope checks at every
  request (no stale token claims).
- Audit details MUST be projected through a viewer-specific
  no-leak filter — even though `writeAuditEvent` already
  enforces a SAFE-allowlist at write time, the viewer SHOULD
  re-assert at read time as defense-in-depth.
- Regulator access to the audit chain MUST go through the
  REGULATOR principal substrate per ADR-0036 (Lawful-Basis
  Attestation), not the standard org-admin path.

## Next slices

Forward-substrate. Likely sequencing:
1. Per-actor audit-event GET route (self-scope; mirrors the
   Action GET viewer pattern).
2. Org-scoped audit-event LIST route (admin-only).
3. Hash-chain verification surface (operator-only).
4. Export surface (regulator-only, lawful-basis-gated).
5. Control Tower audit-viewer UX.

## Risks / forward-substrate

- The audit chain contains sensitive routing identifiers
  (entity_ids, capsule_ids); the viewer MUST scope every read
  by the caller's authorized identity surface.
- Hash-chain verification is computationally expensive at
  scale; the viewer SHOULD paginate verification windows.

---

Back to master: [`../CURRENT_BUILD_STATE.md`](../CURRENT_BUILD_STATE.md)
