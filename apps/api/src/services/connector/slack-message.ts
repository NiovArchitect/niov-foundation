// FILE: slack-message.ts
// PURPOSE: [SLACK-INGEST-1] Slack read → canonical ingest, safe first slice.
//          Fetch ONE message from a PUBLIC Slack channel using the org's
//          sealed OAuth envelope so the route can feed it to the EXISTING
//          spine (slackMessageToSourceEvent → otzarService.ingestSourceEvent).
//          Server-side only: the org's Slack token is used as an outbound
//          Authorization header; tokens are never returned, logged, or
//          persisted (same invariants as zoom-transcript.ts).
//          NOTE (boundary vs slack-read.provider.ts): the Action-rail
//          SlackReadProvider deliberately returns COUNTS ONLY in
//          delivery_metadata — it can never carry message content. This
//          service is the content-returning read for governed ingestion;
//          content flows to the ingestion spine and NEVER into audit
//          details or delivery metadata.
// POLICY (this slice): public channels only. Private channels, DMs, and
//          group DMs are refused BEFORE any content is read
//          (CHANNEL_NOT_ALLOWED) — they park until an explicit
//          policy + consent model exists.
// CONNECTS TO: connector-data.routes.ts (POST /slack/messages/ingest),
//              connector-oauth.service.ts (per-org sealed envelope),
//              source-event.ts (slackMessageToSourceEvent),
//              tests/unit/slack-message.test.ts.

import { writeAuditEvent } from "@niov/database";
import { getProviderAccessTokenForOrg } from "./connector-oauth.service.js";

/** Max message text accepted (guards the ingest pipeline; Slack's own cap
 *  is ~40k chars for a single message). */
export const MAX_SLACK_MESSAGE_CHARS = 40_000;

// WHAT: pre-flight shape check for a Slack message ts ("1699900000.123456").
// WHY: refuse malformed input at the route tier before any provider call.
export function isValidSlackMessageTs(ts: string): boolean {
  return /^\d{1,13}\.\d{1,6}$/.test(ts);
}

// WHAT: pre-flight channel-id policy for this slice. Slack DM ids start
//       with "D", legacy group DMs with "G" — both are parked. Public and
//       private channels share the "C" prefix, so the definitive
//       public-only gate is conversations.info (is_private / is_im /
//       is_mpim) below; this is the cheap first fence.
export function slackChannelIdAllowed(channelId: string): boolean {
  return /^C[A-Z0-9]{4,}$/i.test(channelId);
}

export type SlackMessageFetch =
  | {
      ok: true;
      team_id: string | null;
      channel_name: string | null;
      message: {
        ts: string;
        thread_ts: string | null;
        author_handle: string | null;
        author_name: string | null;
        text: string;
      };
    }
  | {
      ok: false;
      code:
        | "NOT_CONFIGURED"
        | "AUTH"
        | "SCOPE_REAUTH_REQUIRED"
        | "CHANNEL_NOT_ALLOWED"
        | "NOT_IN_CHANNEL"
        | "NOT_FOUND"
        | "MESSAGE_TOO_LARGE"
        | "PROVIDER_ERROR";
    };

async function audit(
  args: { actor_entity_id: string; org_entity_id: string },
  resultCount: number,
  reason: string | null,
): Promise<void> {
  // Audit carries provider + outcome ONLY — never channel content, message
  // text, user PII, or token material (Slack error codes are not secrets).
  await writeAuditEvent({
    event_type: "CONNECTOR_DATA_READ",
    outcome: reason === null ? "SUCCESS" : "DENIED",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: { provider: "slack", resource: "channel_message", result_count: resultCount, reason },
  });
}

// Slack returns ok:false with a short error code at HTTP 200. Map the codes
// that need distinct operator action; everything else is PROVIDER_ERROR.
function codeForSlackError(err: string): Extract<SlackMessageFetch, { ok: false }>["code"] {
  switch (err) {
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "account_inactive":
      return "AUTH";
    case "missing_scope":
      return "SCOPE_REAUTH_REQUIRED";
    case "channel_not_found":
      return "NOT_FOUND";
    case "not_in_channel":
      return "NOT_IN_CHANNEL";
    default:
      return "PROVIDER_ERROR";
  }
}

async function slackGet(
  path: string,
  accessToken: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; code: Extract<SlackMessageFetch, { ok: false }>["code"]; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch {
    return { ok: false, code: "PROVIDER_ERROR", reason: "fetch_failed" };
  }
  if (!res.ok) {
    return { ok: false, code: "PROVIDER_ERROR", reason: `http_${res.status}` };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null) {
    return { ok: false, code: "PROVIDER_ERROR", reason: "non_json_response" };
  }
  if (body["ok"] !== true) {
    const err = typeof body["error"] === "string" ? body["error"] : "unknown_error";
    return { ok: false, code: codeForSlackError(err), reason: err };
  }
  return { ok: true, body };
}

// WHAT: fetch ONE public-channel Slack message for governed ingestion.
// INPUT: actor + org (caller-resolved, never from the body) + channel + ts.
// OUTPUT: workspace identity + channel name + the message, or an honest
//         failure code. Audited either way (counts + reason only).
// SEQUENCE: auth.test (workspace/team identity — the dedupe scope your
//           doctrine requires) → conversations.info (public-only policy
//           gate BEFORE any content read + human channel name) →
//           conversations.history latest=ts inclusive limit=1 (the one
//           message; exact-ts match required) → users.info (best-effort
//           human author name; failure tolerated).
export async function fetchSlackMessageForOrg(args: {
  actor_entity_id: string;
  org_entity_id: string;
  channel_id: string;
  message_ts: string;
}): Promise<SlackMessageFetch> {
  const token = await getProviderAccessTokenForOrg({
    provider: "SLACK",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit(args, 0, token.code);
    return { ok: false, code: token.code === "NOT_CONNECTED" ? "NOT_CONFIGURED" : "AUTH" };
  }

  // 1. Workspace (team) identity — auth.test needs no granular scope and
  //    doubles as a live-token check.
  const who = await slackGet("auth.test", token.access_token);
  if (who.ok === false) {
    await audit(args, 0, who.reason);
    return { ok: false, code: who.code === "NOT_FOUND" ? "PROVIDER_ERROR" : who.code };
  }
  const teamId = typeof who.body["team_id"] === "string" ? who.body["team_id"] : null;

  // 2. Public-only policy gate. conversations.info is covered by
  //    channels:read; the definitive is_private / is_im / is_mpim flags
  //    are checked BEFORE any message content is read.
  const info = await slackGet(
    `conversations.info?channel=${encodeURIComponent(args.channel_id)}`,
    token.access_token,
  );
  if (info.ok === false) {
    await audit(args, 0, info.reason);
    return { ok: false, code: info.code };
  }
  const channel = (info.body["channel"] ?? {}) as Record<string, unknown>;
  if (channel["is_private"] === true || channel["is_im"] === true || channel["is_mpim"] === true) {
    await audit(args, 0, "channel_not_public");
    return { ok: false, code: "CHANNEL_NOT_ALLOWED" };
  }
  const channelName = typeof channel["name"] === "string" ? channel["name"] : null;

  // 3. The one message: latest=<ts>&inclusive=true&limit=1 returns the
  //    message at exactly that ts when it exists; an exact-ts match is
  //    required so a nearby message is never silently substituted.
  const history = await slackGet(
    `conversations.history?channel=${encodeURIComponent(args.channel_id)}&latest=${encodeURIComponent(args.message_ts)}&inclusive=true&limit=1`,
    token.access_token,
  );
  if (history.ok === false) {
    await audit(args, 0, history.reason);
    return { ok: false, code: history.code };
  }
  const messages = Array.isArray(history.body["messages"]) ? (history.body["messages"] as Array<Record<string, unknown>>) : [];
  const msg = messages.find((m) => m["ts"] === args.message_ts);
  if (msg === undefined) {
    await audit(args, 0, "message_not_found");
    return { ok: false, code: "NOT_FOUND" };
  }
  const text = typeof msg["text"] === "string" ? msg["text"] : "";
  if (text.length > MAX_SLACK_MESSAGE_CHARS) {
    await audit(args, 0, "too_large");
    return { ok: false, code: "MESSAGE_TOO_LARGE" };
  }
  const authorHandle = typeof msg["user"] === "string" ? msg["user"] : null;
  const threadTs = typeof msg["thread_ts"] === "string" ? msg["thread_ts"] : null;

  // 4. Best-effort human author name (users:read). A raw Slack user id is
  //    never good customer copy; failure here degrades to the handle and
  //    the spine's NEEDS_OWNER path — it does not fail the ingest.
  let authorName: string | null = null;
  if (authorHandle !== null) {
    const user = await slackGet(
      `users.info?user=${encodeURIComponent(authorHandle)}`,
      token.access_token,
    );
    if (user.ok === true) {
      const profile = (user.body["user"] ?? {}) as Record<string, unknown>;
      const p = (profile["profile"] ?? {}) as Record<string, unknown>;
      const real = typeof p["real_name"] === "string" && p["real_name"].length > 0 ? p["real_name"] : null;
      const display = typeof p["display_name"] === "string" && p["display_name"].length > 0 ? p["display_name"] : null;
      authorName = real ?? display;
    }
  }

  await audit(args, 1, null);
  return {
    ok: true,
    team_id: teamId,
    channel_name: channelName,
    message: {
      ts: args.message_ts,
      thread_ts: threadTs,
      author_handle: authorHandle,
      author_name: authorName,
      text,
    },
  };
}
