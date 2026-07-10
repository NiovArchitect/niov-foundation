// FILE: inbound-signal.service.ts
// PURPOSE: [INBOUND-SIGNAL · Slice 2] The internal HMAC-signed event rail — the
//          safe substrate that PROVES the provider-webhook processing model
//          without any real Google webhook yet. A trusted internal/provider-style
//          sender posts a SIGNED event (signature over the raw body); this
//          authenticates it, rejects replays, dedupes, resolves the org/actor
//          from the FAIL-CLOSED ambient allowlist (NOT the payload), and maps a
//          verified `source_*` signal into the existing source-revalidation sink
//          — which RE-FETCHES from Google and never trusts the payload as truth.
//          NOT a real webhook, NOT broad ingestion, NOT a Drive crawl, NOT a
//          public/bearer/cookie action rail. Synthetic/internal only for now.
// CONNECTS TO: connector/inbound-hmac.ts (verifyInboundHmac), redis.ts (NonceStore
//          claimOnce/incr), source-recheck.service.ts (parseRecheckTargets — the
//          shared ambient allowlist), document-context.service.ts
//          (revalidateImportedDocForCaller — the re-fetch sink), governance/org.js
//          (getOrgEntityId), audit.
//
// DOCTRINE: the inbound event is a SIGNAL, not truth. Authenticate → scope →
// dedupe → permission → convert to a governed re-fetch ONLY after validation. No
// raw payload / secret / signature is ever logged or audited.

import { prisma, writeAuditEvent } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { verifyInboundHmac } from "../connector/inbound-hmac.js";
import { parseRecheckTargets } from "./source-recheck.service.js";
import {
  revalidateImportedDocForCaller,
  type FetchDocText,
} from "./document-context.service.js";
import type { NonceStore } from "../../redis.js";

// Nonce TTL must be >= the HMAC replay window (5 min) so a signature replayed
// inside the window is caught by the single-use nonce, and beyond it by the
// timestamp check.
const NONCE_TTL_SECONDS = 10 * 60;
// Per-resource debounce: coalesce a burst of signals for the same source so it
// isn't re-fetched from Google more than once per window.
const DEBOUNCE_TTL_SECONDS = 5 * 60;
// Per-org, per-minute cap on downstream (Google) re-fetches triggered by signals.
const MAX_SIGNALS_PER_ORG_PER_MIN = 60;

const SOURCE_EVENTS = new Set(["source_changed", "source_deleted", "source_access_revoked"]);
const CALENDAR_EVENTS = new Set([
  "calendar_changed",
  "calendar_cancelled",
  "calendar_attendee_response_changed",
]);

export interface InboundSignalDeps {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  timestampHeader: string | string[] | undefined;
  secret: string | undefined;
  nonceStore: NonceStore;
  // Test seam for the revalidation sink (drives changed/deleted/revoked/transient
  // WITHOUT real network); production omits it → real Google fetch.
  fetchDocText?: FetchDocText;
  nowMs?: number;
}

export type InboundSignalResult =
  | { httpStatus: 200; status: "processed"; event_type: string; state?: string }
  | { httpStatus: 200; status: "deduped" }
  | { httpStatus: 202; status: "quarantined"; reason: string }
  | { httpStatus: 400; status: "bad_request"; reason: string }
  | { httpStatus: 401; status: "unauthenticated"; reason: string }
  | { httpStatus: 403; status: "quarantined"; reason: string }
  | { httpStatus: 409; status: "replay_rejected" }
  | { httpStatus: 429; status: "quarantined"; reason: string }
  | { httpStatus: 503; status: "transient" };

interface SignalPayload {
  org_entity_id: string;
  actor_entity_id: string;
  event_type: string;
  resource_id: string;
  event_id: string;
  nonce: string;
}

function parsePayload(raw: Buffer): SignalPayload | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const fields = ["org_entity_id", "actor_entity_id", "event_type", "resource_id", "event_id", "nonce"] as const;
  for (const f of fields) {
    if (typeof o[f] !== "string" || (o[f] as string).length === 0) return null;
  }
  return {
    org_entity_id: o.org_entity_id as string,
    actor_entity_id: o.actor_entity_id as string,
    event_type: o.event_type as string,
    resource_id: o.resource_id as string,
    event_id: o.event_id as string,
    nonce: o.nonce as string,
  };
}

// Audit helper — details are STRICTLY leak-safe (event_type/reason/resource_id
// only; never raw payload, secret, or signature). actor/org null before the
// allowlist verifies them.
async function audit(
  eventType:
    | "INBOUND_SIGNAL_PROCESSED"
    | "INBOUND_SIGNAL_REPLAY_REJECTED"
    | "INBOUND_SIGNAL_DEDUPED"
    | "INBOUND_SIGNAL_QUARANTINED"
    | "INBOUND_SIGNAL_FAILED"
    | "SOURCE_REVALIDATION_TRIGGERED",
  outcome: "SUCCESS" | "DENIED" | "ERROR",
  actorId: string | null,
  orgId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await writeAuditEvent({
      event_type: eventType,
      outcome,
      actor_entity_id: actorId,
      target_entity_id: orgId,
      details,
    });
  } catch {
    // best-effort audit — never fail the request on an audit write.
  }
}

// WHAT: Process one signed inbound signal end-to-end.
// OUTPUT: A discriminated result the route maps to an HTTP status + minimal body.
export async function processInboundSignal(deps: InboundSignalDeps): Promise<InboundSignalResult> {
  // 1. AUTHENTICATE via HMAC over the raw body (this is the SOLE auth — no Bearer,
  //    no cookie). Fail-closed: an unset secret ⇒ MISSING_SECRET ⇒ 401. Bad HMAC
  //    gets NO audit row (an unauthenticated attacker must not flood the audit
  //    log; the IP rate-limit bounds abuse).
  const hmac = verifyInboundHmac({
    rawBody: deps.rawBody,
    signatureHeader: deps.signatureHeader,
    timestampHeader: deps.timestampHeader,
    secret: deps.secret,
    ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {}),
  });
  if (!hmac.ok) {
    return { httpStatus: 401, status: "unauthenticated", reason: hmac.reason };
  }

  // 2. Parse + validate the signed payload (the sender is trusted — HMAC passed —
  //    but a malformed body is still quarantined, not processed).
  const p = parsePayload(deps.rawBody);
  if (p === null) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", null, null, { reason: "malformed_payload" });
    return { httpStatus: 400, status: "bad_request", reason: "malformed_payload" };
  }

  // 3. SINGLE-USE NONCE up front (anti-replay of the HTTP request — always).
  if (!(await deps.nonceStore.claimOnce(`inbound_nonce:${p.nonce}`, NONCE_TTL_SECONDS))) {
    await audit("INBOUND_SIGNAL_REPLAY_REJECTED", "DENIED", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
    });
    return { httpStatus: 409, status: "replay_rejected" };
  }

  // 4. ORG/ACTOR from the FAIL-CLOSED ambient allowlist (SOURCE_RECHECK_TARGETS),
  //    NOT the payload: the payload merely proposes an (org, actor); it is honored
  //    only if the operator explicitly enabled that exact pair. The demo org is
  //    never listed ⇒ structurally untargetable even with a valid signature.
  const targets = parseRecheckTargets(process.env.SOURCE_RECHECK_TARGETS);
  const allowed = targets.some(
    (t) => t.orgEntityId === p.org_entity_id && t.actorEntityId === p.actor_entity_id,
  );
  if (!allowed) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", null, null, {
      event_type: p.event_type,
      reason: "org_actor_not_allowlisted",
    });
    return { httpStatus: 403, status: "quarantined", reason: "org_actor_not_allowlisted" };
  }
  // Actor must be ACTIVE and resolve to exactly the claimed org (same guard as the
  // Slice-1 cron) — a stale allowlist entry can't act on a suspended admin.
  const entity = await prisma.entity.findUnique({
    where: { entity_id: p.actor_entity_id },
    select: { status: true },
  });
  let resolvedOrg: string | null = null;
  try {
    resolvedOrg = await getOrgEntityId(p.actor_entity_id);
  } catch {
    resolvedOrg = null;
  }
  if (entity === null || entity.status !== "ACTIVE" || resolvedOrg !== p.org_entity_id) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", null, p.org_entity_id, {
      event_type: p.event_type,
      reason: "actor_guard_failed",
    });
    return { httpStatus: 403, status: "quarantined", reason: "actor_guard_failed" };
  }

  // 5. Per-org quota bound (downstream Google-fetch amplification guard).
  const minuteBucket = Math.floor((deps.nowMs ?? Date.now()) / 60_000);
  const count = await deps.nonceStore.incr(`inbound_quota:${p.org_entity_id}:${minuteBucket}`, 90);
  if (count > MAX_SIGNALS_PER_ORG_PER_MIN) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      reason: "org_quota_exceeded",
    });
    return { httpStatus: 429, status: "quarantined", reason: "org_quota_exceeded" };
  }

  // 6. CLASSIFY + process.
  if (CALENDAR_EVENTS.has(p.event_type)) {
    // Calendar re-sync has no clean existing single-event sink; accept +
    // authenticate + audit, but DEFER processing (documented — Slice 2.1/3).
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      reason: "calendar_sink_not_wired",
    });
    return { httpStatus: 202, status: "quarantined", reason: "calendar_sink_not_wired" };
  }
  if (!SOURCE_EVENTS.has(p.event_type)) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      reason: "unknown_event_type",
    });
    return { httpStatus: 202, status: "quarantined", reason: "unknown_event_type" };
  }

  // source_changed / source_deleted / source_access_revoked → RE-FETCH the already-
  // imported doc for this org whose Google file_id matches resource_id. We NEVER
  // import from a signal: if there is no matching imported source, quarantine.
  const row = await prisma.workLedgerEntry.findFirst({
    where: {
      org_entity_id: p.org_entity_id,
      ledger_type: "DOCUMENT_CONTEXT",
      status: { not: "CANCELLED" },
      details: { path: ["document", "external_source", "file_id"], equals: p.resource_id },
    },
    orderBy: { created_at: "desc" },
    select: { ledger_entry_id: true },
  });
  if (row === null) {
    await audit("INBOUND_SIGNAL_QUARANTINED", "DENIED", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      resource_id: p.resource_id,
      reason: "no_matching_imported_source",
    });
    return { httpStatus: 202, status: "quarantined", reason: "no_matching_imported_source" };
  }

  // Per-resource DEBOUNCE gate BEFORE the Google fetch (so a burst can't fetch).
  const debounceKey = `inbound_debounce:${p.org_entity_id}:${p.resource_id}`;
  if (!(await deps.nonceStore.claimOnce(debounceKey, DEBOUNCE_TTL_SECONDS))) {
    await audit("INBOUND_SIGNAL_DEDUPED", "SUCCESS", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      resource_id: p.resource_id,
    });
    return { httpStatus: 200, status: "deduped" };
  }

  // Re-fetch + revalidate (transition-gated audit/notify, snapshot-preserving).
  const result = await revalidateImportedDocForCaller(p.actor_entity_id, row.ledger_entry_id, {
    auditMode: "on_transition",
    ...(deps.fetchDocText !== undefined ? { fetchDocText: deps.fetchDocText } : {}),
  });
  if (result.ok === false) {
    // Transient (REVALIDATION_UNAVAILABLE): the event was NOT handled. RELEASE the
    // debounce so a retry can re-attempt — otherwise the dedupe would silently
    // drop the change until the daily cron catches it.
    await deps.nonceStore.delete(debounceKey);
    await audit("INBOUND_SIGNAL_FAILED", "ERROR", p.actor_entity_id, p.org_entity_id, {
      event_type: p.event_type,
      resource_id: p.resource_id,
      code: result.code,
    });
    return { httpStatus: 503, status: "transient" };
  }

  // Definitive: the debounce/dedupe marker persists. revalidate already emitted
  // the source-lifecycle audit (transition-gated) + any notification.
  await audit("SOURCE_REVALIDATION_TRIGGERED", "SUCCESS", p.actor_entity_id, p.org_entity_id, {
    event_type: p.event_type,
    resource_id: p.resource_id,
    state: result.state,
    trigger: "inbound_signal",
  });
  await audit("INBOUND_SIGNAL_PROCESSED", "SUCCESS", p.actor_entity_id, p.org_entity_id, {
    event_type: p.event_type,
  });
  return { httpStatus: 200, status: "processed", event_type: p.event_type, state: result.state };
}
