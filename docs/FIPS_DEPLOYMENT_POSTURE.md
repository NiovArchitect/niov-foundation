# FIPS Deployment Posture

This document is the authoritative reference for Foundation's
cryptographic algorithm choices, runtime FIPS validation path, and
secret-management posture. SSP authors, FedRAMP 3PAOs, and
procurement reviewers should cite this document together with
`packages/auth/src/crypto-config.ts` (the canonical algorithm
contract) as the FIPS evidence package.

Foundation HEAD baseline for this document: 12C.0 batch (Commit 2).
Algorithm selections covered here apply to **session token signing,
password hashing, content encryption, content fingerprinting, and
audit-of-record chain integrity**. Asymmetric attestation signing
(RS256 / ES256) is **not yet present** and lands with Section 12.5
Sub-box 7 (Compliance Architecture Review Family 5).

## 1. Algorithm Choices and NIST Mapping

The frozen `CRYPTO_CONFIG` in `packages/auth/src/crypto-config.ts`
is the single source of truth for every algorithm choice. The
constant is `Object.freeze`-protected so runtime mutation is
impossible; tamper resistance is anchored by
`tests/unit/boot-validation.test.ts`.

| Algorithm | Constant | Use | Standard |
|---|---|---|---|
| HS256 (HMAC-SHA-256) | `JWT_ALGORITHM` | Session JWT signing | NIST SP 800-131A; FIPS 180-4 (SHA-256) |
| bcrypt rounds=12 (prod) / 4 (test); minimum 10 prod | `BCRYPT_ROUNDS_*` | Password hashing | NIST SP 800-63B Appendix A.3 |
| AES-256-GCM | `AES_ALGORITHM` | Memory capsule content encryption | NIST SP 800-38D; FIPS 140-3 (256-bit key requirement for high-impact validation) |
| SHA-256 | `HASH_ALGORITHM` | Content fingerprints + audit-event chain hash | FIPS 180-4 |
| 32-byte (256-bit) JWT secret minimum | `JWT_SECRET_MIN_BYTES` | HMAC key entropy | NIST SP 800-131A Table 4 |
| 32-byte (256-bit) AES key requirement | `ENCRYPTION_KEY_REQUIRED_BYTES` | AES-256-GCM key length | NIST SP 800-38D + FIPS 140-3 |

All five algorithm choices are FIPS-acceptable. None are deprecated
under NIST SP 800-131A's transition schedule through 2030.

## 2. Runtime FIPS Validation Path

The application code uses Node.js built-in `node:crypto` plus
`bcrypt` and `jsonwebtoken` packages, all of which delegate to the
underlying OpenSSL implementation. **FIPS validation is a runtime-
deployment property, not an application-code property.** To run
under FIPS-validated cryptography:

1. **Deploy on a FIPS-validated runtime.** Acceptable platforms:
   - Red Hat Enterprise Linux 9 in FIPS mode (Node.js linked
     against the RHEL 9 FIPS-validated OpenSSL 3 cryptographic
     module, NIST CAVP / CMVP certificate available)
   - AWS Nitro Enclaves with a FIPS-validated module loaded
   - Ubuntu Pro FIPS (Canonical FIPS-validated OpenSSL)
   - Equivalent vendor-supplied FIPS module
2. **Confirm Node.js is built against the validated OpenSSL.** The
   Node.js binary distributed by the OS vendor in FIPS mode reads
   the validated module by default; `node --enable-fips` is **not**
   required (and is in fact deprecated in Node.js 17+ in favor of
   the OS-level approach).
3. **Verify with `crypto.getFips()`** at boot time if explicit
   verification is required for compliance evidence: a FIPS-mode
   runtime returns `1`. Foundation does not currently call
   `crypto.getFips()` during boot-validation; adding this call is
   a Section-level future task if customers require runtime
   verification rather than deployment-time attestation.

The application code does **not** preclude this path. No algorithm
choice in `CRYPTO_CONFIG` would require revalidation under a
FIPS-validated build.

## 3. Secret-Management Posture

### `JWT_SECRET`

- Required at all NODE_ENV levels (boot-validation throws on missing).
- **Production gate** (`NODE_ENV=production`): minimum 32 bytes
  (256 bits) per NIST SP 800-131A Table 4 HMAC-SHA-256 entropy
  requirement.
- Source: external secret store (AWS Secrets Manager, HashiCorp
  Vault, Kubernetes Secret with at-rest encryption, equivalent).
  **Never** check into source control.
- Rotation: at minimum every 90 days, or immediately on suspected
  compromise. Rotation invalidates all in-flight session JWTs;
  callers re-authenticate.

### `ENCRYPTION_KEY`

- Required in production (boot-validation throws when
  `NODE_ENV=production` and the variable is unset).
- **Production gate**: must be a 64-character hex string (32 bytes
  of key material) per FIPS 140-3 high-impact validation requirement
  for AES-256-GCM.
- Dev/test fallback (`NODE_ENV` other than "production"): may
  fall back to `SHA-256(JWT_SECRET)` per
  `packages/auth/src/crypto.ts`. The fallback is **not** an
  approved KDF per NIST SP 800-131A; it is a dev-convenience-only
  affordance. Production deployments **must** set ENCRYPTION_KEY
  explicitly; the boot-validation gate enforces this.
- Source: same external secret store as JWT_SECRET, separate path
  / role / access control.
- Rotation: more sensitive than JWT_SECRET because rotating it
  requires re-encrypting every memory capsule's at-rest
  ciphertext. Operationally a rare event; document the rotation
  procedure in the runbook before commiting to a rotation cadence.

### `BCRYPT_ROUNDS`

- Optional. Defaults sourced from `CRYPTO_CONFIG`
  (`BCRYPT_ROUNDS_PRODUCTION = 12`, `BCRYPT_ROUNDS_TEST = 4`).
- **Production gate** (when env-overridden): minimum 10 per
  `CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION` and NIST SP 800-63B
  Appendix A.3 cost-against-GPU-attacks requirement.

## 4. Boot-Validation Behavior

`apps/api/src/boot-validation.ts::validateBootEnvironment` runs at
the top of `buildApp` and gates production deployments behind the
checks below. All gates are **NODE_ENV=production scoped**;
test and dev environments skip the cryptographic gates so the
test suite and local development can run without full production
secret provisioning.

| Check | Throws when | Reference |
|---|---|---|
| Required env vars present | `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` is missing or empty | All NODE_ENV |
| `ENCRYPTION_KEY` set | Missing or empty | `NODE_ENV=production` only |
| `ENCRYPTION_KEY` byte length | < `CRYPTO_CONFIG.ENCRYPTION_KEY_REQUIRED_BYTES` (32) | `NODE_ENV=production` only |
| `JWT_SECRET` byte length | < `CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES` (32) | `NODE_ENV=production` only |
| `BCRYPT_ROUNDS` minimum | env-overridden value < `CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION` (10) | `NODE_ENV=production` only |

Failure messages cite the relevant NIST / FIPS standard so
operators can read the rationale immediately rather than tracing
back through code.

## 5. Section 12.5 Sub-box 7 Forward Reference

The `CRYPTO_CONFIG` constant is intentionally extensible. Section
12.5 Sub-box 7 (Compliance Architecture Review Family 5 —
Compliance-attested COSMP capsules + verifiable reports) adds an
**asymmetric signing path** for compliance attestations published
to external recipients. Specifically:

- A new `ATTESTATION_ALGORITHM` constant joins this config with
  value `"RS256"` or `"ES256"` (decision deferred to Sub-box 7
  build-time).
- A new `ATTESTATION_KEY_*` configuration block specifies the
  asymmetric key pair location (likely a JWKS endpoint at
  `/.well-known/jwks.json` published over HTTP for recipient
  verification).
- Existing `JWT_ALGORITHM = "HS256"` stays unchanged; HS256
  remains the algorithm for **internal session tokens** (which
  Foundation services verify against the shared JWT secret).
- The asymmetric path covers external compliance attestations
  (which recipients verify against Foundation's published key
  without possessing the JWT secret).

This is the cleanest extension point for federated verification,
which Family 1 (lawful-basis attestation) and Family 5
(compliance-attested capsule reports + selective disclosure with
BBS+ signatures) both depend on.

## 6. Cross-Reference

- `packages/auth/src/crypto-config.ts` — algorithm constants
  (canonical contract)
- `apps/api/src/boot-validation.ts` — production gate enforcement
- `tests/unit/boot-validation.test.ts` — anchor tests for
  CRYPTO_CONFIG immutability and gate behavior
- `docs/AUDIT_RETENTION_POSTURE.md` — separate evidence artifact
  citing SHA-256 + canonical-form audit chain (12C.0 Item 6)
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` — Section 1 Dimension
  1.1 (cryptography library validation path) original review +
  YELLOW remediation that 12C.0 Item 5 closed
- `docs/COMPLIANCE_ARCHITECTURE_REVIEW.md` — Patent-Relevance
  Catalog Family 5 (Sub-box 7 asymmetric path forward
  reference)
