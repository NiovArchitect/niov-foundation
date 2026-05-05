// FILE: boot-validation.ts
// PURPOSE: Fail-fast environment-variable check that runs at the
//          very top of buildApp. Throws on missing required vars
//          (JWT_SECRET, DATABASE_URL, REDIS_URL); warns (does not
//          throw) on missing OTZAR_ENTITY_ID because Otzar can be
//          deployed without it -- conductSession in 11B will surface
//          the missing-Otzar case at request time with a clearer
//          error than a startup crash would.
// CONNECTS TO: buildApp (called first), tests/unit/boot-validation.test.ts,
//              packages/auth/src/crypto-config.ts (12C.0 Item 5
//              cryptographic gates source CRYPTO_CONFIG byte-length
//              and rounds minima from one frozen place).

import { CRYPTO_CONFIG } from "@niov/auth";
import { logger } from "./logger.js";

// WHAT: Validate that the required environment variables are
//        present, and -- in production -- that cryptographic env
//        vars meet FIPS-acceptable minimums.
// INPUT: An optional override of process.env (for tests).
// OUTPUT: Throws on missing required vars or insufficient
//         production-mode cryptographic config; logs a warn on
//         missing OTZAR_ENTITY_ID; returns silently when all good.
// WHY: Production wants the server to fail loudly at boot rather
//      than silently start with a half-configured environment that
//      surfaces as confusing 500s later. 12C.0 Item 5 adds 4
//      production-mode crypto checks so deployments under
//      NODE_ENV=production cannot launch with insufficient JWT
//      secret entropy, missing AES key, or under-rounded bcrypt --
//      all of which would silently weaken security against
//      modern attacks. Test + dev modes skip these checks so the
//      suite runs without requiring full production env setup.
export function validateBootEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing: string[] = [];
  if (typeof env.JWT_SECRET !== "string" || env.JWT_SECRET.length === 0) {
    missing.push("JWT_SECRET");
  }
  if (typeof env.DATABASE_URL !== "string" || env.DATABASE_URL.length === 0) {
    missing.push("DATABASE_URL");
  }
  if (typeof env.REDIS_URL !== "string" || env.REDIS_URL.length === 0) {
    missing.push("REDIS_URL");
  }
  if (missing.length > 0) {
    throw new Error(
      `Boot validation failed: missing required env vars: ${missing.join(", ")}`,
    );
  }

  // 12C.0 Item 5: production-only cryptographic gates. NODE_ENV
  // values other than "production" (test, development, or unset)
  // skip these checks so dev/test environments can run with the
  // dev fallbacks in packages/auth/src/crypto.ts. These gates close
  // the SHA-256(JWT_SECRET) ENCRYPTION_KEY fallback path for
  // production builds (the fallback is not an approved KDF per
  // NIST SP 800-131A; production must set ENCRYPTION_KEY explicitly).
  if (env.NODE_ENV === "production") {
    // 1. ENCRYPTION_KEY must be explicitly set (no SHA-256(JWT_SECRET)
    //    fallback in production).
    if (
      typeof env.ENCRYPTION_KEY !== "string" ||
      env.ENCRYPTION_KEY.length === 0
    ) {
      throw new Error(
        "Boot validation failed: ENCRYPTION_KEY must be explicitly set in production. " +
          "The SHA-256(JWT_SECRET) fallback is dev-only per crypto-config.ts FIPS posture.",
      );
    }
    // 2. ENCRYPTION_KEY must meet minimum byte length. Stored as
    //    hex string (64 chars = 32 bytes).
    const keyBytes = Buffer.from(env.ENCRYPTION_KEY, "hex").length;
    if (keyBytes < CRYPTO_CONFIG.ENCRYPTION_KEY_REQUIRED_BYTES) {
      throw new Error(
        `Boot validation failed: ENCRYPTION_KEY must be at least ` +
          `${CRYPTO_CONFIG.ENCRYPTION_KEY_REQUIRED_BYTES} bytes ` +
          `(got ${keyBytes}). FIPS 140-3 high-impact validation requires ` +
          `256-bit symmetric keys for AES-256-GCM.`,
      );
    }
    // 3. JWT_SECRET must meet minimum entropy for HS256.
    const secretBytes = Buffer.byteLength(env.JWT_SECRET ?? "", "utf8");
    if (secretBytes < CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES) {
      throw new Error(
        `Boot validation failed: JWT_SECRET must be at least ` +
          `${CRYPTO_CONFIG.JWT_SECRET_MIN_BYTES} bytes for HS256 ` +
          `(got ${secretBytes}). NIST SP 800-131A Table 4 requires ` +
          `HMAC keys of at least the security strength of the underlying hash (256 bits).`,
      );
    }
    // 4. BCRYPT_ROUNDS, when env-overridden, must meet production
    //    minimum. (Defaults are sourced from CRYPTO_CONFIG so this
    //    only catches operators who explicitly lower BCRYPT_ROUNDS
    //    via env without realizing the security impact.)
    if (typeof env.BCRYPT_ROUNDS === "string" && env.BCRYPT_ROUNDS.length > 0) {
      const bcryptRounds = Number.parseInt(env.BCRYPT_ROUNDS, 10);
      if (
        !Number.isFinite(bcryptRounds) ||
        bcryptRounds < CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION
      ) {
        throw new Error(
          `Boot validation failed: BCRYPT_ROUNDS must be at least ` +
            `${CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION} in production ` +
            `(got ${env.BCRYPT_ROUNDS}). NIST SP 800-63B Appendix A.3 ` +
            `requires sufficient cost against modern GPU attacks.`,
        );
      }
    }
  }

  if (
    typeof env.OTZAR_ENTITY_ID !== "string" ||
    env.OTZAR_ENTITY_ID.length === 0
  ) {
    logger.warn(
      "[boot-validation] OTZAR_ENTITY_ID not set -- seedOtzarEntity will create a new APPLICATION entity on next boot. Add the printed entity_id to .env.",
    );
  }
}
