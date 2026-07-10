// FILE: inbound-signal.routes.ts
// PURPOSE: [INBOUND-SIGNAL · Slice 2] The bearer-less, HMAC-authenticated inbound
//          signal endpoint. HMAC over the raw body is the SOLE auth — no Bearer,
//          no cookie. Route-scoped raw-body parsing via a CUSTOM content-type so
//          global application/json parsing is untouched. Delegates all logic to
//          processInboundSignal.
// CONNECTS TO: services/otzar/inbound-signal.service.ts, redis.ts (NonceStore),
//          server.ts (registration).

import type { FastifyInstance } from "fastify";
import { makeDefaultNonceStore } from "../redis.js";
import { processInboundSignal } from "../services/otzar/inbound-signal.service.js";

// The signed sender MUST use this content-type so we receive the EXACT raw bytes
// the signature covers. Registering a parser for this custom type does NOT affect
// application/json — only requests explicitly using application/otzar-signal (which
// only this endpoint's signed senders send) get the raw Buffer body.
const INBOUND_CONTENT_TYPE = "application/otzar-signal";

export async function registerInboundSignalRoutes(
  app: FastifyInstance,
  // Test seam: inject a NonceStore so integration tests use the in-memory store
  // deterministically; production builds one with an isolated Redis prefix.
  nonceStore = makeDefaultNonceStore("niov:inbound:"),
): Promise<void> {
  if (!app.hasContentTypeParser(INBOUND_CONTENT_TYPE)) {
    app.addContentTypeParser(
      INBOUND_CONTENT_TYPE,
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );
  }

  app.post("/api/v1/otzar/inbound/signal", async (request, reply) => {
    // Require the signed content-type so we always hold the raw signed bytes.
    const ct = String(request.headers["content-type"] ?? "");
    if (!ct.includes(INBOUND_CONTENT_TYPE)) {
      return reply.code(415).send({ ok: false, status: "unsupported_media_type" });
    }
    const rawBody = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(typeof request.body === "string" ? request.body : "");

    const result = await processInboundSignal({
      rawBody,
      signatureHeader: request.headers["x-otzar-signature"],
      timestampHeader: request.headers["x-otzar-timestamp"],
      secret: process.env.INBOUND_SIGNAL_SECRET,
      nonceStore,
    });

    // Minimal response — never echo the payload, secret, signature, or a token.
    const body: Record<string, unknown> = {
      ok: result.status === "processed" || result.status === "deduped",
      status: result.status,
    };
    if ("reason" in result) body.reason = result.reason;
    if ("state" in result && result.state !== undefined) body.state = result.state;
    return reply.code(result.httpStatus).send(body);
  });
}
