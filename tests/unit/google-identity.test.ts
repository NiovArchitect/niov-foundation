// FILE: google-identity.test.ts (unit)
// PURPOSE: [SLICE3-PREREQ] Lock the Google OIDC id_token verifier. Proves the
//          pin authority is cryptographic — signature (RS256 against the
//          published JWKS), issuer, audience, and expiry are ALL enforced, a
//          non-empty `sub` is required, and a decode-only / alg:none / wrong-key
//          token is NEVER accepted. Email is extracted as metadata only.
// CONNECTS TO: apps/api/src/services/connector/google-identity.ts

import { generateKeyPairSync, type KeyPairKeyObjectResult } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  verifyGoogleIdToken,
  __resetGoogleJwksCacheForTests,
} from "../../apps/api/src/services/connector/google-identity.js";

const CLIENT_ID = "aud-123.apps.googleusercontent.com";
const ISSUER = "https://accounts.google.com";
const KID = "test-key-1";

const legit: KeyPairKeyObjectResult = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const attacker: KeyPairKeyObjectResult = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

function jwkFor(pair: KeyPairKeyObjectResult, kid: string): Record<string, unknown> {
  const jwk = pair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  return { ...jwk, kid, alg: "RS256", use: "sig" };
}

// The JWKS the verifier will see: ONLY the legit public key under KID.
const jwksLegit = { keys: [jwkFor(legit, KID)] };
const fetchJwks = (): Promise<typeof jwksLegit> => Promise.resolve(jwksLegit);

function signRs256(
  payload: Record<string, unknown>,
  signWith: KeyPairKeyObjectResult = legit,
  kid: string = KID,
): string {
  const pem = signWith.privateKey.export({ type: "pkcs8", format: "pem" });
  return jwt.sign(payload, pem as string, { algorithm: "RS256", keyid: kid });
}

const nowSec = 1_800_000_000; // fixed epoch seconds for determinism
const nowMs = nowSec * 1000;
function basePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: "google-sub-1234567890",
    iss: ISSUER,
    aud: CLIENT_ID,
    iat: nowSec - 30,
    exp: nowSec + 3600,
    email: "admin@meridian.example",
    email_verified: true,
    ...over,
  };
}

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    __resetGoogleJwksCacheForTests();
  });

  it("accepts a valid token and returns the immutable sub + email metadata", async () => {
    const token = signRs256(basePayload());
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subject).toBe("google-sub-1234567890");
      expect(r.email).toBe("admin@meridian.example");
      expect(r.email_verified).toBe(true);
      expect(r.issuer).toBe(ISSUER);
    }
  });

  it("accepts the alternate issuer form", async () => {
    const token = signRs256(basePayload({ iss: "accounts.google.com" }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r.ok).toBe(true);
  });

  it("rejects a wrong audience", async () => {
    const token = signRs256(basePayload({ aud: "someone-else.apps.googleusercontent.com" }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "WRONG_AUDIENCE" });
  });

  it("rejects a wrong issuer", async () => {
    const token = signRs256(basePayload({ iss: "https://evil.example" }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "WRONG_ISSUER" });
  });

  it("rejects an expired token (beyond clock tolerance)", async () => {
    const token = signRs256(basePayload({ exp: nowSec - 3600 }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("rejects a token signed by a DIFFERENT key than the JWKS advertises", async () => {
    // Attacker signs with their own key but claims the legit kid.
    const token = signRs256(basePayload(), attacker, KID);
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a token whose kid is not in the JWKS", async () => {
    const token = signRs256(basePayload(), legit, "unknown-kid");
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "SIGNING_KEY_UNAVAILABLE" });
  });

  it("rejects a token with no subject", async () => {
    const token = signRs256(basePayload({ sub: undefined }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "NO_SUBJECT" });
  });

  it("NEVER accepts an alg:none (decode-only) token", async () => {
    // A classic forgery: header alg=none, no signature.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(basePayload())).toString("base64url");
    const token = `${header}.${body}.`;
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "UNSUPPORTED_ALG" });
  });

  it("rejects a symmetric-alg (HS256) token — no confused-alg acceptance", async () => {
    const token = jwt.sign(basePayload(), "attacker-shared-secret", {
      algorithm: "HS256",
      keyid: KID,
    });
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r).toEqual({ ok: false, reason: "UNSUPPORTED_ALG" });
  });

  it("rejects a malformed token", async () => {
    const r = await verifyGoogleIdToken("not-a-jwt", { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["MALFORMED_TOKEN", "INVALID"]).toContain(r.reason);
  });

  it("accepts a valid token without email (email is optional metadata)", async () => {
    const token = signRs256(basePayload({ email: undefined, email_verified: undefined }));
    const r = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nowMs, fetchJwks });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subject).toBe("google-sub-1234567890");
      expect(r.email).toBeUndefined();
    }
  });

  it("fails closed when the JWKS cannot be fetched", async () => {
    const token = signRs256(basePayload());
    const r = await verifyGoogleIdToken(token, {
      clientId: CLIENT_ID,
      nowMs,
      fetchJwks: () => Promise.reject(new Error("network down")),
    });
    expect(r).toEqual({ ok: false, reason: "SIGNING_KEY_UNAVAILABLE" });
  });
});
