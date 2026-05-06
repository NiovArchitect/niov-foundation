# ADR-0003: Frozen-config tamper anchors

## Status

Accepted 2026-05-04 (Section 12C.0 Commit 2 @ `f3359fb`)

## Context

Algorithm choices and system-principal enumerations are
security-critical configuration. Code that mutates these at
runtime (intentionally or via a buggy refactor) defeats the
security property they were meant to enforce. Two specific
risks:

**Cryptography:** a refactor that replaces HS256 with the JWT
`none` algorithm makes every JWT forgeable. A swap from
AES-256-GCM to a weaker cipher breaks FIPS 140-3 validation.
Lowering bcrypt rounds below 10 weakens password hashing per
NIST SP 800-63B Appendix A.3.

**System-principal enumeration:** audit attribution depends on
`SYSTEM_PRINCIPALS` being a fixed set (`SCHEDULER`,
`BOOT_VALIDATOR`, `COMPLIANCE_SEEDER`, `FEEDBACK_LOOP`). Adding a
principal at runtime breaks NIST 800-53 AU-2 system-actor
coverage; modifying an existing principal's value breaks
audit-chain hash continuity for prior emissions tagged with that
principal.

Both surfaces benefit from the same tamper-resistance pattern:
runtime immutability via `Object.freeze()` plus a runtime test
(`Object.isFrozen()` assertion) that catches mutation attempts
at the test gate.

## Decision

Foundation security-critical configuration is exported as
`Object.freeze()`'d constants, with anchor tests asserting
`Object.isFrozen()` at runtime.

As of Section 12C.0, two such anchors are active:

- `CRYPTO_CONFIG` (`packages/auth/src/crypto-config.ts`):
  algorithm choices (HS256, AES-256-GCM, SHA-256), bcrypt
  rounds, byte-length minima.
- `SYSTEM_PRINCIPALS` (`packages/database/src/queries/audit.ts`):
  enumerated subsystem identities for audit emissions.

Future security-critical configuration (e.g., Section 12.5
Sub-box 7 attestation algorithm parameters) will follow the
same pattern.

## Consequences

### Easier

- Mutation attempts throw `TypeError` in strict mode; tampering
  surfaces as a red test, not a silent behavior change
- FIPS 140-3 validation posture is preserved against accidental
  refactor
- NIST SP 800-63B Appendix A.3 bcrypt-rounds posture is
  preserved
- Audit-chain hash continuity is preserved (`SYSTEM_PRINCIPALS`
  enumeration cannot drift)

### Harder

- Adding a new principal or algorithm requires a code change to
  the frozen object; cannot be configured via environment
  variable alone
- Test code that mocks these constants must use `vi.mock` at the
  module boundary (not `Object.assign` on the frozen object)

## Alternatives Considered

### Documentation-only "do not mutate"

Rejected. Bypassable; not enforceable by review at scale.

### Private class fields on a singleton

Rejected. Doesn't prevent intentional mutation, only accidental
external access. Also breaks the existing pattern where
Foundation prefers exported constants over class instances for
stateless configuration.

### TypeScript `as const` only

Rejected. Provides compile-time immutability but not runtime; a
JS-side mutation succeeds silently. The runtime
`Object.isFrozen()` assertion is the catch that `as const`
cannot provide.

## References

- `packages/auth/src/crypto-config.ts` (`CRYPTO_CONFIG` export)
- `packages/database/src/queries/audit.ts` (`SYSTEM_PRINCIPALS`
  export)
- `tests/unit/boot-validation.test.ts` (frozen `CRYPTO_CONFIG`
  anchor)
- `tests/unit/audit-system-principals.test.ts` (frozen
  `SYSTEM_PRINCIPALS` anchor)
- `docs/FIPS_DEPLOYMENT_POSTURE.md` (committed substrate; cites
  `CRYPTO_CONFIG` as the canonical reference)
- `f3359fb` (Section 12C.0 Commit 2; introduces both anchors)

Bidirectional citations (cited from):

- `docs/reference/glossary.md` → "Frozen Config",
  "CRYPTO_CONFIG", "SYSTEM_PRINCIPALS"
- `docs/reference/architectural-anchors.md` → entries 5 and 6
  (Frozen `CRYPTO_CONFIG`, Frozen `SYSTEM_PRINCIPALS`)
