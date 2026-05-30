// FILE: inbound-hmac.ts
// PURPOSE: Hardening Wave B — reusable inbound-webhook HMAC-SHA-256
//          signature verification. Pairs with Wave 4
//          OutboundWebhookProvider sign-with-${timestamp}.${rawBody}
//          pattern; gives Foundation a single canonical receive-side
//          verifier for any future route that needs to accept
//          governed inbound webhooks (Slack interactivity callbacks,
//          GitHub webhooks, custom-built consumer apps signing back
//          to NIOV).
// CONNECTS TO:
//   - apps/api/src/services/connector/outbound-webhook.provider.ts
//     (matched sender; this file is the receive-side counterpart)
//   - future route consumers (none yet — pure substrate at Wave B)
//
// PRIVACY INVARIANT:
//   - The resolved secret VALUE is used ONLY for the
//     timing-safe HMAC compare; it is NEVER logged + NEVER returned
//     in the result. Failure results carry the closed `reason`
//     enum value + a short scrubbed `message` only.
//   - Failure messages NEVER carry the expected / received
//     signatures (would aid forgery) or the raw body (could be
//     PII).
//   - Verification is timing-safe via crypto.timingSafeEqual so
//     attackers cannot exploit per-character comparison to
//     incrementally guess the signature.
//
// PRODUCTION POSTURE:
//   - The verifier expects `sha256=<hex>` signature format (matches
//     the OutboundWebhookProvider sender format + Stripe / Slack /
//     GitHub convention).
//   - A replay window (default 5 minutes; operator-configurable
//     per call) bounds the timestamp drift so a captured
//     signature cannot be replayed indefinitely.
//   - The verifier accepts a buffer of raw request body bytes — it
//     does NOT re-serialize the parsed body, because re-serialization
//     would change the byte sequence and break the signature. Route
//     consumers MUST register the appropriate raw-body parser per
//     Fastify convention before calling this verifier.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SIGNATURE_PREFIX = "sha256=";

// WHAT: The discriminated result of a verifyInboundHmac call.
// INPUT: Used as a return type.
// OUTPUT: None — type only.
// WHY: Mirrors the ConnectorResult discriminated-union shape so
//      route handlers branch deterministically on the closed enum
//      instead of parsing free-text errors. The reason enum is
//      what an operator sees in a 4xx response + an audit detail.
export type InboundHmacResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "MISSING_SIGNATURE_HEADER"
        | "MALFORMED_SIGNATURE_HEADER"
        | "MISSING_TIMESTAMP_HEADER"
        | "MALFORMED_TIMESTAMP_HEADER"
        | "TIMESTAMP_OUTSIDE_REPLAY_WINDOW"
        | "MISSING_SECRET"
        | "SIGNATURE_MISMATCH";
      message: string;
    };

// WHAT: Inputs to verifyInboundHmac.
// INPUT: Used as a parameter type.
// OUTPUT: None — type only.
// WHY: Single options bag so future additional inputs (alternate
//      hash algorithms, alternate header names, multi-signature
//      fallback for key rotation) extend additively.
export interface VerifyInboundHmacInput {
  // Raw request-body bytes. MUST be the exact bytes the sender
  // signed; do NOT pass a re-serialized JSON object.
  rawBody: Buffer | string;
  // Operator-chosen signature header value, e.g. the value of
  // X-NIOV-Signature: "sha256=<hex>".
  signatureHeader: string | string[] | undefined;
  // Operator-chosen timestamp header value, e.g. the value of
  // X-NIOV-Timestamp: "<ms epoch>".
  timestampHeader: string | string[] | undefined;
  // Resolved secret VALUE used to compute the HMAC. The caller
  // is responsible for resolving this from the ConnectorBinding's
  // secret_ref env var; this function never reads process.env.
  secret: string | undefined;
  // Optional replay-window override (milliseconds; default
  // 300_000 = 5 minutes).
  replayWindowMs?: number;
  // Optional clock override for deterministic tests; defaults to
  // Date.now() at call time.
  nowMs?: number;
}

// WHAT: Pick the canonical scalar header value when the request
//        header arrives as a single string OR an array of strings
//        (Fastify can deliver either depending on duplicates).
// INPUT: A header value union.
// OUTPUT: A single string or null when the header was absent.
// WHY: Centralizes the array-vs-scalar handling so the verifier
//      stays readable.
function pickScalarHeader(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return value;
}

// WHAT: Constant-time equality on two equal-length hex strings.
// INPUT: Two hex strings.
// OUTPUT: boolean.
// WHY: timingSafeEqual requires equal-length buffers; the caller
//      compares the freshly-computed HMAC hex to the
//      header-supplied hex. Wrapping ensures any length mismatch
//      yields a deterministic false WITHOUT throwing.
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// WHAT: Verify an inbound webhook HMAC-SHA-256 signature using the
//        same canonical pattern Wave 4 OutboundWebhookProvider sends.
// INPUT: VerifyInboundHmacInput.
// OUTPUT: InboundHmacResult.
// WHY: Single verifier so every future inbound-webhook route
//      reaches into the same audited substrate. Route consumers
//      branch on result.ok; on failure they emit
//      ADMIN_ACTION:INBOUND_HMAC_REJECTED audit (no new audit
//      literal needed — same details.action discriminator pattern
//      Section 4 already uses).
export function verifyInboundHmac(
  input: VerifyInboundHmacInput,
): InboundHmacResult {
  const replayWindowMs = input.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;

  if (typeof input.secret !== "string" || input.secret.length === 0) {
    return {
      ok: false,
      reason: "MISSING_SECRET",
      message: "verifier secret is not configured",
    };
  }

  const signature = pickScalarHeader(input.signatureHeader);
  if (signature === null) {
    return {
      ok: false,
      reason: "MISSING_SIGNATURE_HEADER",
      message: "signature header is absent",
    };
  }
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return {
      ok: false,
      reason: "MALFORMED_SIGNATURE_HEADER",
      message: `signature header must start with ${SIGNATURE_PREFIX}`,
    };
  }
  const receivedHex = signature.slice(SIGNATURE_PREFIX.length);
  if (receivedHex.length !== 64 || !/^[0-9a-f]+$/i.test(receivedHex)) {
    return {
      ok: false,
      reason: "MALFORMED_SIGNATURE_HEADER",
      message: "signature must be exactly 64 lowercase hex chars",
    };
  }

  const timestamp = pickScalarHeader(input.timestampHeader);
  if (timestamp === null) {
    return {
      ok: false,
      reason: "MISSING_TIMESTAMP_HEADER",
      message: "timestamp header is absent",
    };
  }
  const timestampNum = Number(timestamp);
  if (!Number.isFinite(timestampNum) || !Number.isInteger(timestampNum)) {
    return {
      ok: false,
      reason: "MALFORMED_TIMESTAMP_HEADER",
      message: "timestamp must be an integer millisecond epoch",
    };
  }
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestampNum) > replayWindowMs) {
    return {
      ok: false,
      reason: "TIMESTAMP_OUTSIDE_REPLAY_WINDOW",
      message: `timestamp drift exceeds replay window of ${replayWindowMs}ms`,
    };
  }

  const rawBody =
    typeof input.rawBody === "string"
      ? input.rawBody
      : input.rawBody.toString("utf8");
  const expectedHex = createHmac("sha256", input.secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (!constantTimeHexEqual(receivedHex.toLowerCase(), expectedHex)) {
    return {
      ok: false,
      reason: "SIGNATURE_MISMATCH",
      message: "signature does not match expected HMAC",
    };
  }

  return { ok: true };
}
