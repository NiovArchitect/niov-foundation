// FILE: avp2-accept.service.ts
// PURPOSE: F-1331 — AVP² (Agent Verification & Payment Protocol) Quote Acceptance
//          Layer. Step 2 of the AVP² loop: the agent accepts a quote it earlier
//          requested. Acceptance is the COMMITMENT — it projects a MOCK
//          settlement intent (status PROJECTED) and issues a single-use
//          access_token the agent presents at the access step (F-1332). The
//          acceptance is recorded as an append-only AVP2_QUOTE_ACCEPTED ledger
//          event (no new schema); the quote it accepts is reconstructed from its
//          AVP2_QUOTE_CREATED event by quote_id.
//
//          COMMITMENT TO A MOCK INTENT ONLY. PROJECTED is a mock settlement
//          projection — NOT a charge, NOT a transfer, NOT delivery, NOT
//          execution. Economics are MOCK-ONLY. No raw content ever.
//
//          SECURITY:
//          - Actor-binding: only the quote's CREATOR (the AVP2_QUOTE_CREATED
//            row's actor_entity_id) may accept it. A different entity holding a
//            valid quote_id is denied — enumeration-safe QUOTE_NOT_FOUND (we do
//            not reveal that someone else's quote exists).
//          - Expiry: a quote past its expires_at cannot be accepted (QUOTE_EXPIRED).
//          - First-accept-wins idempotency: re-accepting a quote returns the
//            EXISTING acceptance (same acceptance_id + settlement). The single-use
//            raw access_token is issued ONCE at first acceptance and never
//            re-disclosed (only its SHA-256 hash is in the ledger); an idempotent
//            replay returns access_token = null with idempotent_replay = true.
//            Residual: the audit ledger has no uniqueness lock, so two truly
//            concurrent first-accept POSTs could each write an AVP2_QUOTE_ACCEPTED
//            row; the reader collapses to the earliest by timestamp, so callers
//            converge on one acceptance even in that race.
//
// CONNECTS TO: packages/database (queryAuditEvents/prisma audit rows,
//              writeAuditEvent) + auth.service + apps/api/src/routes/
//              foundation.routes.ts. Reads AVP2_QUOTE_CREATED (F-1330); the raw
//              access_token it issues is consumed by F-1332 /access.
//
// SAFETY: RULE 4 — AVP2_QUOTE_ACCEPTED is written BEFORE the response. The raw
// access_token is returned to the caller exactly once; the ledger stores only its
// SHA-256 hash. Mock-only settlement; live access disabled.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";

export interface Avp2Acceptance {
  acceptance_id: string;
  quote_id: string;
  status: "ACCEPTED";
  listing_id: string;
  provider_entity_id: string;
  resource_id: string;
  resource_type: string;
  settlement: {
    status: "PROJECTED";
    mock_amount: number | null;
    settlement_mode: "MOCK_ONLY";
    is_mock: true;
  };
  // The single-use token the agent presents at the access step (F-1332). Returned
  // raw exactly once (first acceptance); null on an idempotent replay.
  access_token: string | null;
  live_access_enabled: false;
  idempotent_replay: boolean;
  accepted_at: string;
}

export type AcceptQuoteResult =
  | { ok: true; acceptance: Avp2Acceptance }
  | { ok: false; code: string };

// WHAT: hash a raw access token for ledger storage.
// WHY: the ledger must NEVER hold the raw token — only a verifier. F-1332 hashes
//      the presented token the same way and matches.
export function hashAccessToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export class Avp2AcceptService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: accept a quote the caller created.
  // INPUT: session token + quote_id. OUTPUT: the projected acceptance + token.
  // WHY: POST /api/v1/foundation/avp2/quote/:quote_id/accept — step 2 of the
  //      quote→accept→access loop. Actor-bound, expiry-checked, idempotent.
  async acceptQuoteForCaller(
    sessionToken: string,
    quoteId: string,
  ): Promise<AcceptQuoteResult> {
    const v = await this.authService.validateSession(sessionToken, "write");
    if (!v.valid) return { ok: false, code: v.code };
    if (typeof quoteId !== "string" || quoteId.length === 0)
      return { ok: false, code: "QUOTE_ID_REQUIRED" };

    // Reconstruct the quote from its AVP2_QUOTE_CREATED event (the offer).
    const quoteEvent = await prisma.auditEvent.findFirst({
      where: {
        event_type: "AVP2_QUOTE_CREATED",
        details: { path: ["quote_id"], equals: quoteId },
      },
      orderBy: { timestamp: "asc" },
    });
    // Enumeration-safe: an unknown quote and someone else's quote look identical.
    if (quoteEvent === null) return { ok: false, code: "QUOTE_NOT_FOUND" };

    // Actor-binding — only the creator may accept. The creator is the row's
    // actor_entity_id, NOT anything the caller supplies.
    if (quoteEvent.actor_entity_id !== v.entity_id)
      return { ok: false, code: "QUOTE_NOT_FOUND" };

    const d = (quoteEvent.details ?? {}) as Record<string, unknown>;
    const listingId = str(d.listing_id);
    const providerEntityId = str(d.provider_entity_id);
    const resourceId = str(d.resource_id);
    const resourceType = str(d.resource_type);
    const mockAmount = num(d.mock_price);

    // First-accept-wins idempotency — if already accepted, return that acceptance
    // (the raw token is NOT re-disclosed; only its hash was ever stored). This is
    // checked BEFORE expiry: an acceptance, once committed, is a fact — the offer
    // window expiring later must not make a real acceptance un-retrievable.
    // Expiry only gates NEW acceptances (below).
    const existing = await prisma.auditEvent.findFirst({
      where: {
        event_type: "AVP2_QUOTE_ACCEPTED",
        details: { path: ["quote_id"], equals: quoteId },
      },
      orderBy: { timestamp: "asc" },
    });
    if (existing !== null) {
      const ed = (existing.details ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        acceptance: {
          acceptance_id: str(ed.acceptance_id),
          quote_id: quoteId,
          status: "ACCEPTED",
          listing_id: listingId,
          provider_entity_id: providerEntityId,
          resource_id: resourceId,
          resource_type: resourceType,
          settlement: {
            status: "PROJECTED",
            mock_amount: num(ed.mock_price),
            settlement_mode: "MOCK_ONLY",
            is_mock: true,
          },
          access_token: null, // never re-disclosed
          live_access_enabled: false,
          idempotent_replay: true,
          accepted_at: existing.timestamp.toISOString(),
        },
      };
    }

    // Expiry gates NEW acceptances only (idempotent replay handled above). A
    // malformed timestamp is treated as expired (fail-closed) rather than
    // never-expires — only reachable via synthetic events, but belt-and-suspenders.
    const expiresAt = str(d.expires_at);
    if (expiresAt.length > 0) {
      const expMs = new Date(expiresAt).getTime();
      if (!Number.isFinite(expMs) || Date.now() > expMs)
        return { ok: false, code: "QUOTE_EXPIRED" };
    }

    // First acceptance — mint the single-use access token (raw returned once).
    const acceptanceId = `accept_${randomUUID()}`;
    const accessToken = `avp2_${randomBytes(32).toString("hex")}`;
    const accessTokenHash = hashAccessToken(accessToken);
    const acceptedAt = new Date().toISOString();

    // RULE 4 — record the acceptance BEFORE replying. Details carry the mock
    // settlement projection + the token HASH (never the raw token, never content).
    await writeAuditEvent({
      event_type: "AVP2_QUOTE_ACCEPTED",
      outcome: "SUCCESS",
      actor_entity_id: v.entity_id,
      target_entity_id: providerEntityId.length > 0 ? providerEntityId : null,
      session_id: v.session_id,
      details: {
        quote_id: quoteId,
        acceptance_id: acceptanceId,
        listing_id: listingId,
        provider_entity_id: providerEntityId,
        resource_id: resourceId,
        resource_type: resourceType,
        mock_price: mockAmount,
        settlement_mode: "MOCK_ONLY",
        settlement_status: "PROJECTED",
        access_token_hash: accessTokenHash,
        is_mock: true,
      },
    });

    return {
      ok: true,
      acceptance: {
        acceptance_id: acceptanceId,
        quote_id: quoteId,
        status: "ACCEPTED",
        listing_id: listingId,
        provider_entity_id: providerEntityId,
        resource_id: resourceId,
        resource_type: resourceType,
        settlement: {
          status: "PROJECTED",
          mock_amount: mockAmount,
          settlement_mode: "MOCK_ONLY",
          is_mock: true,
        },
        access_token: accessToken,
        live_access_enabled: false,
        idempotent_replay: false,
        accepted_at: acceptedAt,
      },
    };
  }
}
