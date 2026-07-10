// FILE: apps/api/src/services/connector/google-identity.ts
// PURPOSE: [SLICE3-PREREQ] Cryptographically verify a Google OpenID Connect
//          id_token and extract the immutable `sub` account identity that pins
//          an org's Google Workspace connection. This is the authority key the
//          different-account-swap guard compares against.
// CONNECTS TO:
//   - connector-oauth.service.ts (handleOAuthCallback verify+pin; the exact-
//     credential resolver's identity re-check).
//   - OTZAR_SLICE3_WATCHCHANNEL_CONTRACT.md §8b (the account-identity prereq).
// WHY: A decode-only JWT is forgeable. We verify issuer + audience (our OAuth
//      client id) + RS256 signature against Google's published JWKS + expiry,
//      and require a non-empty `sub`. Email is display/audit metadata only and
//      NEVER substitutes for `sub`. We never persist the id_token or raw claims.

import { createPublicKey, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";

// Google's OIDC issuer values (both forms appear across Google surfaces).
const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
] as const;

// Canonical JWKS endpoint (the v3 JWK set; v1 PEM is legacy).
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_FETCH_TIMEOUT_MS = 5_000;
// Allow small clock skew between our host and Google (seconds).
const CLOCK_TOLERANCE_SECONDS = 60;

// A minimal RSA JWK shape (Google publishes RSA signing keys).
interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}
interface JwkSet {
  keys: Jwk[];
}

export type GoogleIdentityResult =
  | {
      ok: true;
      /** The immutable OIDC subject — the authority key. Never null/empty. */
      subject: string;
      /** Display/audit only. Never used as the identity key. */
      email?: string;
      email_verified?: boolean;
      issuer: string;
    }
  | {
      ok: false;
      reason:
        | "MALFORMED_TOKEN"
        | "UNSUPPORTED_ALG"
        | "SIGNING_KEY_UNAVAILABLE"
        | "BAD_SIGNATURE"
        | "WRONG_AUDIENCE"
        | "WRONG_ISSUER"
        | "EXPIRED"
        | "NO_SUBJECT"
        | "INVALID";
    };

export interface VerifyGoogleIdTokenOptions {
  /** The configured Google OAuth client id — the required `aud`. */
  clientId: string;
  /** Test seam: epoch ms treated as "now" for expiry checks. */
  nowMs?: number;
  /**
   * Test seam: resolve the JWK set. Production fetches Google's JWKS; tests
   * inject a set containing their fixture public key so the full jwk→KeyObject
   * →verify path is exercised without network.
   */
  fetchJwks?: () => Promise<JwkSet>;
}

// In-memory JWKS cache (kid → KeyObject) with a coarse TTL. Google rotates keys
// slowly and publishes several at once; a short cache avoids per-verify fetches
// without risking a stale-key window that a re-fetch on miss already covers.
let cache: { keys: Map<string, KeyObject>; expiresAtMs: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h; re-fetched on any kid miss anyway.

async function defaultFetchJwks(): Promise<JwkSet> {
  const res = await fetch(GOOGLE_JWKS_URL, {
    signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`jwks endpoint returned ${res.status}`);
  }
  return (await res.json()) as JwkSet;
}

function jwkToKeyObject(jwk: Jwk): KeyObject | null {
  try {
    // Node accepts a JWK directly; this validates the key material shape.
    return createPublicKey({
      key: jwk as unknown as import("node:crypto").JsonWebKey,
      format: "jwk",
    });
  } catch {
    return null;
  }
}

async function resolveSigningKey(
  kid: string,
  nowMs: number,
  fetchJwks: () => Promise<JwkSet>,
): Promise<KeyObject | null> {
  const cached = cache?.keys.get(kid);
  if (cached !== undefined && cache !== null && cache.expiresAtMs > nowMs) {
    return cached;
  }
  let set: JwkSet;
  try {
    set = await fetchJwks();
  } catch {
    return null;
  }
  const keys = new Map<string, KeyObject>();
  for (const jwk of set.keys) {
    if (typeof jwk.kid !== "string" || jwk.kid.length === 0) continue;
    const key = jwkToKeyObject(jwk);
    if (key !== null) keys.set(jwk.kid, key);
  }
  cache = { keys, expiresAtMs: nowMs + JWKS_CACHE_TTL_MS };
  return keys.get(kid) ?? null;
}

// WHAT: Verify a Google id_token and return its immutable `sub`.
// INPUT: the raw id_token string + options (client id = required audience).
// OUTPUT: { ok:true, subject, email?, email_verified?, issuer } | { ok:false, reason }.
// WHY: The pin authority. A decode-only path is NEVER trusted — signature,
//      issuer, audience, and expiry are all enforced; a non-empty `sub` is
//      required. Returns no token material.
export async function verifyGoogleIdToken(
  idToken: string,
  options: VerifyGoogleIdTokenOptions,
): Promise<GoogleIdentityResult> {
  if (typeof idToken !== "string" || idToken.length === 0) {
    return { ok: false, reason: "MALFORMED_TOKEN" };
  }
  const nowMs = options.nowMs ?? Date.now();
  const fetchJwks = options.fetchJwks ?? defaultFetchJwks;

  let decodedHeader: { kid?: unknown; alg?: unknown } | null = null;
  try {
    const complete = jwt.decode(idToken, { complete: true });
    decodedHeader =
      complete !== null && typeof complete === "object"
        ? (complete.header as { kid?: unknown; alg?: unknown })
        : null;
  } catch {
    decodedHeader = null;
  }
  if (decodedHeader === null) {
    return { ok: false, reason: "MALFORMED_TOKEN" };
  }
  // Only RS256 is accepted — never `none`, never a symmetric alg (which would
  // let a client-supplied HMAC pass a naive verifier).
  if (decodedHeader.alg !== "RS256") {
    return { ok: false, reason: "UNSUPPORTED_ALG" };
  }
  const kid = decodedHeader.kid;
  if (typeof kid !== "string" || kid.length === 0) {
    return { ok: false, reason: "MALFORMED_TOKEN" };
  }

  const key = await resolveSigningKey(kid, nowMs, fetchJwks);
  if (key === null) {
    return { ok: false, reason: "SIGNING_KEY_UNAVAILABLE" };
  }

  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(idToken, key, {
      algorithms: ["RS256"],
      audience: options.clientId,
      issuer: [...GOOGLE_ISSUERS],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      clockTimestamp: Math.floor(nowMs / 1000),
    });
    if (typeof verified === "string") {
      return { ok: false, reason: "INVALID" };
    }
    payload = verified;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: "EXPIRED" };
    }
    if (err instanceof jwt.JsonWebTokenError) {
      const m = err.message.toLowerCase();
      if (m.includes("audience")) return { ok: false, reason: "WRONG_AUDIENCE" };
      if (m.includes("issuer")) return { ok: false, reason: "WRONG_ISSUER" };
      if (m.includes("signature")) return { ok: false, reason: "BAD_SIGNATURE" };
      return { ok: false, reason: "INVALID" };
    }
    return { ok: false, reason: "INVALID" };
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    return { ok: false, reason: "NO_SUBJECT" };
  }
  const issuer = typeof payload.iss === "string" ? payload.iss : GOOGLE_ISSUERS[0];

  const result: Extract<GoogleIdentityResult, { ok: true }> = {
    ok: true,
    subject: sub,
    issuer,
  };
  const email = (payload as Record<string, unknown>).email;
  if (typeof email === "string" && email.length > 0) {
    result.email = email;
  }
  const emailVerified = (payload as Record<string, unknown>).email_verified;
  if (typeof emailVerified === "boolean") {
    result.email_verified = emailVerified;
  }
  return result;
}

// Test seam: reset the module JWKS cache between test cases.
export function __resetGoogleJwksCacheForTests(): void {
  cache = null;
}
