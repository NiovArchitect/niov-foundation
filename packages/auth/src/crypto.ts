// FILE: crypto.ts
// PURPOSE: AES-256-GCM helpers for encrypting and decrypting capsule
//          content before it lands in object storage. Section 3C
//          (WRITE) encrypts here; future read paths will decrypt.
// CONNECTS TO: WriteService, future ReadService decryption flow,
//              and any service that needs to round-trip user data
//              through Supabase Storage.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { CRYPTO_CONFIG } from "./crypto-config.js";

// WHAT: Class that wraps a 32-byte AES-256 key and exposes encrypt /
//        decrypt methods.
// INPUT: A 32-byte Buffer at construction.
// OUTPUT: A class instance.
// WHY: Holding the key inside the class instead of passing it around
//      means callers cannot accidentally log or serialize it.
export class ContentEncryption {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error(
        `ContentEncryption requires a 32-byte key (got ${key.length})`,
      );
    }
  }

  // WHAT: Encrypt a plaintext string with AES-256-GCM.
  // INPUT: The plaintext.
  // OUTPUT: A self-contained envelope string containing the IV, auth
  //         tag, and ciphertext, all base64-encoded and dot-joined.
  // WHY: A fresh IV per call is critical for GCM safety. The auth
  //      tag detects tampering at decrypt time.
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(CRYPTO_CONFIG.AES_ALGORITHM, this.key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
  }

  // WHAT: Decrypt a previously-encrypted envelope string.
  // INPUT: The envelope produced by encrypt().
  // OUTPUT: The original plaintext.
  // WHY: Throws if the envelope is malformed or the auth tag does
  //      not verify, so any tampering surfaces as a hard error.
  decrypt(envelope: string): string {
    const parts = envelope.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid ciphertext envelope");
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const ct = Buffer.from(ctB64!, "base64");
    const decipher = createDecipheriv(CRYPTO_CONFIG.AES_ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  }
}

// WHAT: Construct a ContentEncryption from environment variables.
// INPUT: None (reads process.env).
// OUTPUT: A ready-to-use ContentEncryption instance.
// WHY: Production wiring lives in one place. Prefers an explicit
//      ENCRYPTION_KEY env var (64 hex chars = 32 bytes); falls back
//      to a SHA-256 of JWT_SECRET so a fresh project can ship before
//      operators rotate the key. Throws if neither is set.
export function makeContentEncryption(): ContentEncryption {
  const explicit = process.env.ENCRYPTION_KEY;
  if (typeof explicit === "string" && explicit.length === 64) {
    return new ContentEncryption(Buffer.from(explicit, "hex"));
  }
  const fallback = process.env.JWT_SECRET;
  if (typeof fallback === "string" && fallback.length > 0) {
    const key = createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(fallback).digest();
    return new ContentEncryption(key);
  }
  throw new Error(
    "Either ENCRYPTION_KEY (64 hex chars) or JWT_SECRET must be set in env",
  );
}

// WHAT: Compute the SHA-256 hex hash of an arbitrary string.
// INPUT: The string to hash.
// OUTPUT: A 64-character lowercase hex string.
// WHY: Section 3C stores content_hash = SHA-256 of the encrypted
//      ciphertext so tampering at the storage layer is detectable.
export function sha256Hex(input: string): string {
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(input).digest("hex");
}
