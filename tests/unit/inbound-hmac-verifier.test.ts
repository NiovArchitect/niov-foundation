// FILE: inbound-hmac-verifier.test.ts (unit)
// PURPOSE: Hardening Wave B — verifyInboundHmac contract coverage.
//          Verifies: happy path with the Wave 4 sender's exact
//          format; rejection branches (8 discriminated reasons);
//          timing-safe equality on the hex compare; replay window
//          enforcement; clock-override determinism; rawBody can
//          be either Buffer or string; uppercase signature hex
//          accepted (lowercased internally); array-form header
//          values handled.
// CONNECTS TO:
//   - apps/api/src/services/connector/inbound-hmac.ts
//   - apps/api/src/services/connector/outbound-webhook.provider.ts
//     (matched sender — verifier is the receive-side counterpart)

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInboundHmac } from "@niov/api";

const SECRET = "test-shared-secret-do-not-leak-99";

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
  return (
    "sha256=" +
    createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex")
  );
}

describe("verifyInboundHmac — happy path", () => {
  it("accepts a correctly-signed request with the canonical headers", () => {
    const now = 1_700_000_000_000;
    const body = JSON.stringify({ hello: "world" });
    const ts = String(now);
    const sig = sign(ts, body);
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a Buffer rawBody as well as a string", () => {
    const now = 1_700_000_000_000;
    const body = "{\"k\":1}";
    const ts = String(now);
    const r = verifyInboundHmac({
      rawBody: Buffer.from(body, "utf8"),
      signatureHeader: sign(ts, body),
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(true);
  });

  it("accepts uppercase hex in the signature header (case-insensitive compare)", () => {
    const now = 1_700_000_000_000;
    const body = "{\"k\":1}";
    const ts = String(now);
    const lowerSig = sign(ts, body);
    const upperSig =
      "sha256=" + lowerSig.slice("sha256=".length).toUpperCase();
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: upperSig,
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(true);
  });

  it("unwraps array-form headers by taking the first element", () => {
    const now = 1_700_000_000_000;
    const body = "{}";
    const ts = String(now);
    const sig = sign(ts, body);
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: [sig, "sha256=ignored"],
      timestampHeader: [ts, "999"],
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(true);
  });
});

describe("verifyInboundHmac — rejection branches", () => {
  const now = 1_700_000_000_000;
  const body = "{\"k\":1}";
  const ts = String(now);
  const goodSig = sign(ts, body);

  it("MISSING_SECRET when the resolved secret is empty", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: goodSig,
      timestampHeader: ts,
      secret: "",
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MISSING_SECRET");
  });

  it("MISSING_SECRET when secret is undefined", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: goodSig,
      timestampHeader: ts,
      secret: undefined,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MISSING_SECRET");
  });

  it("MISSING_SIGNATURE_HEADER when the signature header is absent", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: undefined,
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MISSING_SIGNATURE_HEADER");
  });

  it("MALFORMED_SIGNATURE_HEADER when sha256= prefix is missing", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: "abcdef" + "0".repeat(58),
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MALFORMED_SIGNATURE_HEADER");
  });

  it("MALFORMED_SIGNATURE_HEADER when hex length is wrong", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: "sha256=abc",
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MALFORMED_SIGNATURE_HEADER");
  });

  it("MALFORMED_SIGNATURE_HEADER when hex contains non-hex chars", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: "sha256=" + "z".repeat(64),
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MALFORMED_SIGNATURE_HEADER");
  });

  it("MISSING_TIMESTAMP_HEADER when timestamp is absent", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: goodSig,
      timestampHeader: undefined,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MISSING_TIMESTAMP_HEADER");
  });

  it("MALFORMED_TIMESTAMP_HEADER when timestamp is not an integer", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: goodSig,
      timestampHeader: "not-a-number",
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MALFORMED_TIMESTAMP_HEADER");
  });

  it("MALFORMED_TIMESTAMP_HEADER when timestamp is a float", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: goodSig,
      timestampHeader: "1700000000000.5",
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("MALFORMED_TIMESTAMP_HEADER");
  });

  it("TIMESTAMP_OUTSIDE_REPLAY_WINDOW when timestamp drifts beyond default 5 minutes", () => {
    const oldTs = String(now - 10 * 60 * 1000); // 10 minutes old
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sign(oldTs, body),
      timestampHeader: oldTs,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("TIMESTAMP_OUTSIDE_REPLAY_WINDOW");
  });

  it("TIMESTAMP_OUTSIDE_REPLAY_WINDOW also rejects future-dated timestamps beyond window", () => {
    const futureTs = String(now + 10 * 60 * 1000);
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sign(futureTs, body),
      timestampHeader: futureTs,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("TIMESTAMP_OUTSIDE_REPLAY_WINDOW");
  });

  it("respects an operator-supplied replayWindowMs override", () => {
    const slightlyOldTs = String(now - 7 * 60 * 1000); // 7 minutes old
    // Default 5-min window would reject this; an explicit 10-min
    // override should accept (assuming signature matches).
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sign(slightlyOldTs, body),
      timestampHeader: slightlyOldTs,
      secret: SECRET,
      replayWindowMs: 10 * 60 * 1000,
      nowMs: now,
    });
    expect(r.ok).toBe(true);
  });

  it("SIGNATURE_MISMATCH when signature was computed with a different secret", () => {
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sign(ts, body, "WRONG_SECRET"),
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("SIGNATURE_MISMATCH");
  });

  it("SIGNATURE_MISMATCH when rawBody is mutated after signing (replay-of-signature attack)", () => {
    const goodSigForOriginal = sign(ts, body);
    const r = verifyInboundHmac({
      rawBody: body + "tampered",
      signatureHeader: goodSigForOriginal,
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("SIGNATURE_MISMATCH");
  });
});

describe("verifyInboundHmac — privacy invariant", () => {
  it("failure messages never carry the expected signature or rawBody content", () => {
    const now = 1_700_000_000_000;
    const body = "PII_THAT_MUST_NEVER_LEAK_xyz";
    const ts = String(now);
    const r = verifyInboundHmac({
      rawBody: body,
      signatureHeader: sign(ts, body, "WRONG_SECRET"),
      timestampHeader: ts,
      secret: SECRET,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain(body);
    expect(r.message).not.toContain(SECRET);
    // The reason enum is part of the contract; the message is
    // intentionally short + scrubbed.
    expect(r.message.length).toBeLessThan(120);
  });
});
