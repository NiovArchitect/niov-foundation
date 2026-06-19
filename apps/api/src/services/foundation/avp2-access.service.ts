// FILE: avp2-access.service.ts
// PURPOSE: F-1332 — AVP² (Agent Verification & Payment Protocol) Access Receipt
//          Layer. Step 3 (the close) of the AVP² loop: the agent presents the
//          single-use access_token it received at acceptance (F-1331) and
//          Foundation RECORDS the access attempt, returning a Proof-of-Access.
//          The receipt is recorded as an append-only AVP2_ACCESS_RECORDED ledger
//          event (no new schema); the event's own hash is the proof_reference,
//          which the F-1321 proof feed and F-1324 policy lineage can resolve.
//
//          FOUNDATION NEVER DELIVERS CONTENT. content_delivery.delivered is
//          ALWAYS false (reason DELIVERY_NOT_ENABLED_IN_FOUNDATION). This is the
//          hard safety net that keeps the AVP² loop from ever being a COSMP /
//          delivery bypass: even with a valid token, the access step records and
//          proves — it does not hand over content, fragments, or payloads.
//          Economics are MOCK-ONLY.
//
//          SECURITY:
//          - Token verification by hash: the presented raw token is SHA-256
//            hashed and matched against the AVP2_QUOTE_ACCEPTED row's
//            access_token_hash. An unknown/invalid token is denied enumeration-
//            safe ACCESS_DENIED.
//          - Actor-binding: the caller must equal the acceptance's creator (the
//            AVP2_QUOTE_ACCEPTED row's actor_entity_id) — possession of a token
//            alone is not authority. A mismatch is denied ACCESS_DENIED.
//          - Access is metered usage, not a one-shot: multiple access records
//            against one acceptance are legitimate (each is a usage occurrence).
//
// CONNECTS TO: packages/database (prisma audit rows, writeAuditEvent) +
//              auth.service + avp2-accept.service (hashAccessToken) +
//              apps/api/src/routes/foundation.routes.ts. Consumes the raw token
//              minted by F-1331; the proof_reference it emits is readable by
//              F-1321 / F-1324.
//
// SAFETY: RULE 4 — AVP2_ACCESS_RECORDED is written BEFORE the response; its hash
// is the returned proof_reference. delivered:false always. Never carries content;
// never echoes the raw token. Mock-only.

import { randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { hashAccessToken } from "./avp2-accept.service.js";

export interface Avp2AccessRequest {
  access_token?: string;
  // descriptive agent hints only (never authority)
  agent_context?: { agent_id?: string; on_behalf_of?: string; purpose?: string };
}

export interface Avp2AccessReceipt {
  access_id: string;
  quote_id: string;
  acceptance_id: string;
  listing_id: string;
  resource_id: string;
  resource_type: string;
  content_delivery: {
    delivered: false;
    reason: "DELIVERY_NOT_ENABLED_IN_FOUNDATION";
    note: string;
  };
  proof: {
    proof_reference: string; // the AVP2_ACCESS_RECORDED event hash
    verified: true;
    settlement_mode: "MOCK_ONLY";
    is_mock: true;
    recorded_at: string;
  };
  recorded_at: string;
}

export type RecordAccessResult =
  | { ok: true; receipt: Avp2AccessReceipt }
  | { ok: false; code: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export class Avp2AccessService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: record an access attempt against an accepted quote and return proof.
  // INPUT: session token + { access_token }. OUTPUT: a Proof-of-Access receipt.
  // WHY: POST /api/v1/foundation/avp2/access — step 3 of the loop. Token-verified
  //      (by hash), actor-bound; delivered is always false (no content ever).
  async recordAccessForCaller(
    sessionToken: string,
    req: Avp2AccessRequest,
  ): Promise<RecordAccessResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };

    const rawToken = typeof req.access_token === "string" ? req.access_token : "";
    if (rawToken.length === 0) return { ok: false, code: "ACCESS_TOKEN_REQUIRED" };

    // Verify the token by hash — match the AVP2_QUOTE_ACCEPTED row that holds it.
    const tokenHash = hashAccessToken(rawToken);
    const acceptEvent = await prisma.auditEvent.findFirst({
      where: {
        event_type: "AVP2_QUOTE_ACCEPTED",
        details: { path: ["access_token_hash"], equals: tokenHash },
      },
      orderBy: { timestamp: "asc" },
    });
    // Enumeration-safe: unknown/invalid token and someone else's token both deny.
    if (acceptEvent === null) return { ok: false, code: "ACCESS_DENIED" };

    // Actor-binding — possession of the token alone is not authority. The caller
    // must be the entity that accepted the quote.
    if (acceptEvent.actor_entity_id !== v.entity_id)
      return { ok: false, code: "ACCESS_DENIED" };

    const d = (acceptEvent.details ?? {}) as Record<string, unknown>;
    const quoteId = str(d.quote_id);
    const acceptanceId = str(d.acceptance_id);
    const listingId = str(d.listing_id);
    const providerEntityId = str(d.provider_entity_id);
    const resourceId = str(d.resource_id);
    const resourceType = str(d.resource_type);

    const accessId = `access_${randomUUID()}`;
    const recordedAt = new Date().toISOString();

    // RULE 4 — record the access BEFORE replying. The event's own hash is the
    // proof_reference. delivered:false is recorded explicitly. Never content,
    // never the raw token (only the access_id + the already-stored references).
    const event = await writeAuditEvent({
      event_type: "AVP2_ACCESS_RECORDED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      target_entity_id: providerEntityId.length > 0 ? providerEntityId : null,
      session_id: v.session_id,
      details: {
        quote_id: quoteId,
        acceptance_id: acceptanceId,
        access_id: accessId,
        listing_id: listingId,
        resource_id: resourceId,
        resource_type: resourceType,
        delivered: false,
        delivery_reason: "DELIVERY_NOT_ENABLED_IN_FOUNDATION",
        settlement_mode: "MOCK_ONLY",
        is_mock: true,
      },
    });

    return {
      ok: true,
      receipt: {
        access_id: accessId,
        quote_id: quoteId,
        acceptance_id: acceptanceId,
        listing_id: listingId,
        resource_id: resourceId,
        resource_type: resourceType,
        content_delivery: {
          delivered: false,
          reason: "DELIVERY_NOT_ENABLED_IN_FOUNDATION",
          note:
            "AVP² proves governed access; Foundation does not deliver content. " +
            "The agent asked for a quote, accepted it, and this receipt proves " +
            "the access — content delivery is out of scope for the protocol edge.",
        },
        proof: {
          proof_reference: event.event_hash,
          verified: true,
          settlement_mode: "MOCK_ONLY",
          is_mock: true,
          recorded_at: recordedAt,
        },
        recorded_at: recordedAt,
      },
    };
  }
}
