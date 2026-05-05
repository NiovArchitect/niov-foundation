// FILE: crypto-config.ts
// PURPOSE: Centralized, frozen configuration for every cryptographic
//          algorithm choice in Foundation. Single point of change for
//          NIST / FIPS algorithm transitions, consumed by JWT signing,
//          password hashing, content encryption, content hashing, and
//          boot-validation env-checks. Keeping every algorithm choice
//          in one frozen const removes the silent-drift risk where
//          one call site picks a different default than another.
// CONNECTS TO: apps/api/src/services/auth.service.ts (JWT signing),
//              packages/auth/src/password.ts (bcrypt rounds),
//              packages/auth/src/crypto.ts (AES + SHA),
//              apps/api/src/boot-validation.ts (production env gates),
//              docs/FIPS_DEPLOYMENT_POSTURE.md (the deployment posture
//              document that cites this file as the algorithm contract).
//
// FIPS DEPLOYMENT POSTURE:
// The algorithm CHOICES below are FIPS-acceptable per NIST SP 800-131A
// + NIST SP 800-63B + FIPS 140-3 algorithm guidance:
//   - HS256 (HMAC-SHA-256) is FIPS-approved as a JWT signing algorithm
//   - bcrypt with rounds >= 10 is acceptable per NIST SP 800-63B for
//     password hashing
//   - AES-256-GCM is FIPS-approved for symmetric encryption
//   - SHA-256 is FIPS-approved as a hash function
// The algorithm-validation property of FIPS 140-3 is a RUNTIME-DEPLOYMENT
// concern, not an application-code concern: the application code uses
// node:crypto + bcrypt + jsonwebtoken which delegate to the underlying
// OpenSSL build. To run FIPS-validated, deploy on a Node.js runtime
// linked against FIPS-validated OpenSSL (RHEL 9 in FIPS mode, AWS Nitro
// Enclaves with validated module, or equivalent). See
// docs/FIPS_DEPLOYMENT_POSTURE.md for the full deployment recipe.
//
// SECTION 12.5 SUB-BOX 7 FORWARD REFERENCE:
// The COMPLIANCE_ARCHITECTURE_REVIEW.md Family 5 attestation work
// (Sub-box 7) extends this configuration with an asymmetric signing
// path (RS256 or ES256) used for compliance attestations published
// to external recipients. The current HS256 algorithm covers internal
// session tokens only; the asymmetric path lands when verifiable-
// credentials infrastructure is needed. JWT_ALGORITHM stays HS256 for
// session tokens; a parallel ATTESTATION_ALGORITHM constant joins this
// config when Sub-box 7 lands.

// WHAT: The frozen central crypto configuration.
// INPUT: None.
// OUTPUT: A read-only object with every algorithm constant.
// WHY: Object.freeze is asserted by tests/unit/boot-validation.test.ts
//      so future engineers (or LLMs) cannot mutate the config at
//      runtime without breaking a red test. Tamper resistance for the
//      most security-critical config in Foundation.
export const CRYPTO_CONFIG = Object.freeze({
  // JWT signing algorithm. HS256 = HMAC-SHA-256, FIPS-approved per
  // NIST SP 800-131A and FIPS 180-4. Pin explicit rather than relying
  // on jsonwebtoken's implicit default to prevent silent drift if the
  // library ever changes its default (also the boot-validation gate
  // requires JWT_SECRET >= 32 bytes for HS256 entropy per NIST SP
  // 800-131A Table 4).
  JWT_ALGORITHM: "HS256" as const,

  // bcrypt rounds. 12 is the production default; 4 is the test default
  // so the suite is not bound by bcrypt cost. Both are acceptable per
  // NIST SP 800-63B Appendix A.3 (memory-hard / iterated hash
  // requirement). Production minimum is 10 -- below that the cost is
  // insufficient against modern GPU attacks.
  BCRYPT_ROUNDS_PRODUCTION: 12,
  BCRYPT_ROUNDS_TEST: 4,
  BCRYPT_ROUNDS_MIN_PRODUCTION: 10,

  // Symmetric content encryption for memory capsules. AES-256-GCM is
  // FIPS-approved per NIST SP 800-38D. The 256-bit key length is the
  // mandatory minimum for FIPS 140-3 module validation.
  AES_ALGORITHM: "aes-256-gcm" as const,

  // Cryptographic hash for content fingerprints + audit-event chain
  // integrity. SHA-256 is FIPS-approved per FIPS 180-4. Used by
  // packages/auth/src/crypto.ts (capsule content_hash) AND
  // packages/database/src/queries/audit.ts (canonical event_hash
  // chain).
  HASH_ALGORITHM: "sha256" as const,

  // Minimum JWT_SECRET byte length. NIST SP 800-131A Table 4 specifies
  // 112-bit security strength minimum for HMAC keys; 32 bytes (256
  // bits) provides 256-bit security strength which exceeds that
  // requirement and aligns with the underlying SHA-256 output size.
  JWT_SECRET_MIN_BYTES: 32,

  // Required ENCRYPTION_KEY byte length for AES-256-GCM. The 32-byte
  // key length is mandated by the AES-256 cipher; AES-128 (16-byte
  // keys) is rejected because FIPS 140-3 high-impact validation
  // requires 256-bit keys for symmetric encryption.
  ENCRYPTION_KEY_REQUIRED_BYTES: 32,
});

// WHAT: TypeScript type for the frozen config so consumers get strict
//       structural typing without re-declaring the shape.
// INPUT: Used as a type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Future work (Sub-box 7 asymmetric path) extends the config; the
//      type is the contract for what every CRYPTO_CONFIG consumer can
//      assume exists.
export type CryptoConfig = typeof CRYPTO_CONFIG;
