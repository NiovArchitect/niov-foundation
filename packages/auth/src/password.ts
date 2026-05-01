// FILE: password.ts
// PURPOSE: Hash plaintext passwords and verify candidate passwords
//          against stored hashes using bcrypt.
// CONNECTS TO: createEntity (when a password is provided at create
//              time), the auth service's login flow (verifies a
//              login attempt), and any future "change password" or
//              admin-set-password flows.

import bcrypt from "bcrypt";

// WHAT: How many bcrypt rounds we use to derive each password hash.
// INPUT: None.
// OUTPUT: A number of rounds.
// WHY: 12 is a 2026-grade default -- slow enough to make GPU cracking
//      expensive, fast enough to keep login under ~250ms on a typical
//      server. Naming the constant means we can bump it later without
//      grep.
export const BCRYPT_ROUNDS = 12;

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
