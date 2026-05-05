// FILE: index.ts
// PURPOSE: The single entry point for the @niov/auth package.
// CONNECTS TO: The auth service in /apps/api, the createEntity query
//              that hashes optional passwords, and any future flow
//              that needs to verify or hash a password.

export { hashPassword, verifyPassword, BCRYPT_ROUNDS } from "./password.js";
export {
  ContentEncryption,
  makeContentEncryption,
  sha256Hex,
} from "./crypto.js";
export { CRYPTO_CONFIG } from "./crypto-config.js";
export type { CryptoConfig } from "./crypto-config.js";
