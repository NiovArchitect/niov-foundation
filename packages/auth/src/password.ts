// FILE: password.ts
// PURPOSE: Hash plaintext passwords and verify candidate passwords
//          against stored hashes using bcrypt.
// CONNECTS TO: createEntity (when a password is provided at create
//              time), the auth service's login flow (verifies a
//              login attempt), and any future "change password" or
//              admin-set-password flows.

import bcrypt from "bcrypt";
import { CRYPTO_CONFIG } from "./crypto-config.js";

// WHAT: How many bcrypt rounds we use to derive each password hash.
// INPUT: None.
// OUTPUT: A number of rounds.
// WHY: 12C.0 Item 5: rounds now sourced from CRYPTO_CONFIG so all
//      cryptographic algorithm choices live in one frozen place.
//      Production uses CRYPTO_CONFIG.BCRYPT_ROUNDS_PRODUCTION (12);
//      tests use CRYPTO_CONFIG.BCRYPT_ROUNDS_TEST (4) so the suite
//      is not bound by bcrypt cost. Both are NIST SP 800-63B-acceptable
//      iterated-hash settings (production minimum is 10 per
//      CRYPTO_CONFIG.BCRYPT_ROUNDS_MIN_PRODUCTION).
export const BCRYPT_ROUNDS =
  process.env.NODE_ENV === "test"
    ? CRYPTO_CONFIG.BCRYPT_ROUNDS_TEST
    : CRYPTO_CONFIG.BCRYPT_ROUNDS_PRODUCTION;

// WHAT: Hash a plaintext password into a bcrypt-format string.
// INPUT: The plaintext password the user just typed.
// OUTPUT: A bcrypt hash string suitable for storing in the database.
// WHY: Plaintext passwords must NEVER reach the database. This is the
//      single chokepoint that turns plaintext into the stored shape.
export async function hashPassword(plaintext: string): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("hashPassword requires a non-empty string");
  }
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

// WHAT: Compare a candidate plaintext password to a stored bcrypt hash.
// INPUT: The candidate plaintext and the stored hash to compare with.
// OUTPUT: true when the candidate matches, false otherwise.
// WHY: Constant-time comparison via bcrypt.compare protects against
//      timing attacks. We never compare hashes with === ourselves.
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    return false;
  }
  if (typeof hash !== "string" || hash.length === 0) {
    return false;
  }
  return bcrypt.compare(plaintext, hash);
}
