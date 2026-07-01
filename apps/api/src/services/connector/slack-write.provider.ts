// FILE: slack-write.provider.ts
// PURPOSE: Section 4 / Work-OS Slice F — first real WRITE vendor
//          connector. Slack chat.postMessage adapter implementing the
//          canonical ConnectorProvider interface (connector.service.ts).
//          Supports exactly ONE write operation at this register:
//            - chat.postMessage (post a governed message to a channel)
//          Uses bot tokens (xoxb-*) per Slack OAuth v2. The bot token
//          is resolved via the binding.secret_ref env-var-NAME pattern
//          (ADR-0019 + ADR-0024) — the resolved VALUE never leaves this
//          provider (never logged, never in delivery_metadata, never on
//          an error, never returned).
//
//          Fixture-first: by default the provider runs in deterministic
//          fixture mode (no outbound HTTP, no real Slack post). The real
//          Slack Web API is reached ONLY when ALL hold:
//            1. process.env.SLACK_USE_REAL === "1"
//            2. binding.config.use_real === true
//            3. binding.secret_ref resolves to a non-empty env-var value
//          CI + unit + integration tests leave SLACK_USE_REAL unset, so
//          no test ever posts to a real workspace.
//
//          Governance posture: this provider is the LAST hop. It is only
//          ever reached from the INVOKE_CONNECTOR Action handler after
//          the Action policy-evaluator + approval gate cleared. It does
//          not auto-send: nothing calls it outside a governed, approved
//          Action lifecycle.
//
// PRIVACY INVARIANT (mirrors SlackReadProvider / OutboundWebhookProvider):
//   - delivery_metadata carries ok + channel + ts + permalink + mode +
//     a status marker ONLY. NEVER the bot token, NEVER the message text
//     echoed back, NEVER raw Slack response bodies beyond the safe
//     receipt fields, NEVER third-party stack traces.
//   - On error, message is a short scrubbed summary carrying only the
//     Slack error CODE (e.g. "channel_not_found", "missing_scope:chat:write")
//     which is not secret material — never the token, never raw bodies.
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider / ConnectorInvocation /
//     ConnectorResult)
//   - action/handlers.ts (INVOKE_CONNECTOR handler routes here via
//     getConnectorProviderAsync("SLACK_WRITE"))
//   - work-os/execution-bridge.ts (creates the governed Action whose
//     approved execution reaches this provider)

import type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
} from "./connector.service.js";

// ────────────────────────────────────────────────────────────────
// Closed-vocab operation labels. The invocation_payload carries one
// of these; anything else returns VALIDATION at the provider boundary.
// ────────────────────────────────────────────────────────────────
const SLACK_WRITE_OPERATIONS = ["chat.postMessage"] as const;
type SlackWriteOperation = (typeof SLACK_WRITE_OPERATIONS)[number];

function isSlackWriteOperation(value: unknown): value is SlackWriteOperation {
  return (
    typeof value === "string" &&
    (SLACK_WRITE_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture-failure keys. Tests pass an explicit fixture_key to assert
// handler behavior across the full ConnectorResult union without ever
// reaching real Slack. Mirrors SlackReadProvider.
// ────────────────────────────────────────────────────────────────
const FIXTURE_KEYS = [
  "force-auth-failure",
  "force-network-failure",
  "force-timeout",
  "force-rate-limit",
  "force-provider-error",
  "force-validation-failure",
  "force-not-configured",
  "force-disabled",
] as const;
type FixtureKey = (typeof FIXTURE_KEYS)[number];

function isFixtureKey(value: unknown): value is FixtureKey {
  return (
    typeof value === "string" &&
    (FIXTURE_KEYS as ReadonlyArray<string>).includes(value)
  );
}

const DEFAULT_TIMEOUT_MS = 10_000;
const SLACK_API_BASE = "https://slack.com/api";

// ────────────────────────────────────────────────────────────────
// Environment gate — identical triple to SlackReadProvider so the
// "reach the real Slack Web API" decision is uniform across read +
// write. A WRITE additionally means: no real post unless the operator
// has explicitly turned on SLACK_USE_REAL AND flagged the binding.
// ────────────────────────────────────────────────────────────────
function shouldUseRealSlackApi(invocation: ConnectorInvocation): boolean {
  if (process.env["SLACK_USE_REAL"] !== "1") return false;
  if (invocation.config["use_real"] !== true) return false;
  if (invocation.secret_ref === null) return false;
  const resolved = process.env[invocation.secret_ref];
  if (typeof resolved !== "string" || resolved.length === 0) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────
// Normalized, validated post payload. `channel` + `text` are
// required; unfurl flags default to false (governed messages should
// not balloon into link previews); thread_ts is optional.
// ────────────────────────────────────────────────────────────────
interface NormalizedPost {
  channel: string;
  text: string;
  thread_ts: string | null;
  unfurl_links: boolean;
  unfurl_media: boolean;
}

function normalizePost(
  payload: Readonly<Record<string, unknown>>,
): { ok: true; post: NormalizedPost } | { ok: false; message: string } {
  const channel = payload["channel"];
  if (typeof channel !== "string" || channel.length === 0) {
    return { ok: false, message: "slack_write: payload.channel is required" };
  }
  const text = payload["text"];
  if (typeof text !== "string" || text.length === 0) {
    return { ok: false, message: "slack_write: payload.text is required" };
  }
  const threadTs = payload["thread_ts"];
  const unfurlLinks = payload["unfurl_links"];
  const unfurlMedia = payload["unfurl_media"];
  return {
    ok: true,
    post: {
      channel,
      text,
      thread_ts: typeof threadTs === "string" && threadTs.length > 0 ? threadTs : null,
      // Default false; only an explicit `true` opts in.
      unfurl_links: unfurlLinks === true,
      unfurl_media: unfurlMedia === true,
    },
  };
}

// ────────────────────────────────────────────────────────────────
// SlackWriteProvider — production class.
// ────────────────────────────────────────────────────────────────
export class SlackWriteProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture-failure short-circuit BEFORE any validation or HTTP.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isSlackWriteOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "slack_write: operation must be chat.postMessage",
      };
    }

    const normalized = normalizePost(invocation.payload);
    if (normalized.ok === false) {
      return { ok: false, error_class: "VALIDATION", message: normalized.message };
    }

    if (shouldUseRealSlackApi(invocation)) {
      return this.postRealMessage(normalized.post, invocation);
    }

    // Fixture success — deterministic, no outbound HTTP. mode:"fixture"
    // makes it impossible to mistake a CI run for a real Slack post.
    return {
      ok: true,
      delivery_metadata: Object.freeze({
        provider: "SlackWriteProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        channel: normalized.post.channel,
        ts: "0000000000.000000",
        permalink: null,
      }),
    };
  }

  private fixtureFailureResponse(fixtureKey: FixtureKey): ConnectorResult {
    switch (fixtureKey) {
      case "force-auth-failure":
        return { ok: false, error_class: "AUTH", message: "fixture: forced AUTH failure" };
      case "force-network-failure":
        return { ok: false, error_class: "NETWORK", message: "fixture: forced NETWORK failure" };
      case "force-timeout":
        return { ok: false, error_class: "TIMEOUT", message: "fixture: forced TIMEOUT failure" };
      case "force-rate-limit":
        return { ok: false, error_class: "RATE_LIMIT", message: "fixture: forced RATE_LIMIT failure" };
      case "force-provider-error":
        return { ok: false, error_class: "PROVIDER_ERROR", message: "fixture: forced PROVIDER_ERROR failure" };
      case "force-validation-failure":
        return { ok: false, error_class: "VALIDATION", message: "fixture: forced VALIDATION failure" };
      case "force-not-configured":
        return { ok: false, error_class: "NOT_CONFIGURED", message: "fixture: forced NOT_CONFIGURED failure" };
      case "force-disabled":
        return { ok: false, error_class: "DISABLED", message: "fixture: forced DISABLED failure" };
    }
  }

  // Real Slack Web API path — a single POST chat.postMessage with a
  // Bearer bot token. The response body is parsed only for the safe
  // receipt fields (ok / channel / ts / error). On success a
  // best-effort permalink is fetched; a permalink failure NEVER fails
  // the write (the message already posted). Slack error codes are
  // surfaced (they are not secret); missing_scope additionally reports
  // the needed scope so the operator can fix the token.
  private async postRealMessage(
    post: NormalizedPost,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    // secret_ref is guaranteed non-null + resolvable by
    // shouldUseRealSlackApi, but re-check to satisfy the type + defend
    // in depth.
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "slack_write: secret_ref required" };
    }
    const botToken = process.env[invocation.secret_ref];
    if (typeof botToken !== "string" || botToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "slack_write: secret_ref env var not set" };
    }

    const body: Record<string, unknown> = {
      channel: post.channel,
      text: post.text,
      unfurl_links: post.unfurl_links,
      unfurl_media: post.unfurl_media,
    };
    if (post.thread_ts !== null) body["thread_ts"] = post.thread_ts;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "slack_write: 429 rate-limited" };
      }
      if (!response.ok) {
        return { ok: false, error_class: "PROVIDER_ERROR", message: `slack_write: http ${response.status}` };
      }
      const parsed = (await response.json()) as {
        ok: boolean;
        channel?: string;
        ts?: string;
        error?: string;
        needed?: string;
      };
      if (parsed.ok !== true) {
        return this.mapSlackError(parsed.error, parsed.needed);
      }
      const channel = typeof parsed.channel === "string" ? parsed.channel : post.channel;
      const ts = typeof parsed.ts === "string" ? parsed.ts : null;
      const permalink =
        ts !== null ? await this.tryPermalink(botToken, channel, ts) : null;
      return {
        ok: true,
        delivery_metadata: Object.freeze({
          provider: "SlackWriteProvider",
          mode: "real",
          operation: "chat.postMessage",
          binding_id: invocation.binding_id,
          channel,
          ts,
          permalink,
        }),
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        return { ok: false, error_class: "TIMEOUT", message: `slack_write: timed out after ${DEFAULT_TIMEOUT_MS}ms` };
      }
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      return { ok: false, error_class: "NETWORK", message: `slack_write: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  // Map a Slack ok:false error code to a ConnectorResult error_class.
  // invalid_auth / not_authed / token_revoked / account_inactive → AUTH.
  // missing_scope additionally carries the needed scope (operator fix).
  // channel_not_found / not_in_channel / invalid_arguments → VALIDATION.
  // ratelimited → RATE_LIMIT. Everything else → PROVIDER_ERROR.
  private mapSlackError(error: string | undefined, needed: string | undefined): ConnectorResult {
    const code = typeof error === "string" && error.length > 0 ? error : "unknown_error";
    if (code === "invalid_auth" || code === "not_authed" || code === "token_revoked" || code === "account_inactive") {
      return { ok: false, error_class: "AUTH", message: `slack_write: ${code}` };
    }
    if (code === "missing_scope") {
      const scope = typeof needed === "string" && needed.length > 0 ? needed : "chat:write";
      return { ok: false, error_class: "AUTH", message: `slack_write: missing_scope:${scope}` };
    }
    if (code === "channel_not_found" || code === "not_in_channel" || code === "invalid_arguments" || code === "is_archived") {
      return { ok: false, error_class: "VALIDATION", message: `slack_write: ${code}` };
    }
    if (code === "ratelimited") {
      return { ok: false, error_class: "RATE_LIMIT", message: `slack_write: ${code}` };
    }
    return { ok: false, error_class: "PROVIDER_ERROR", message: `slack_write: ${code}` };
  }

  // Best-effort permalink fetch. Returns null on any failure — a
  // permalink is a convenience, never a correctness requirement, and
  // must never turn a successful post into a failed ConnectorResult.
  private async tryPermalink(
    botToken: string,
    channel: string,
    messageTs: string,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const url = `${SLACK_API_BASE}/chat.getPermalink?channel=${encodeURIComponent(channel)}&message_ts=${encodeURIComponent(messageTs)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${botToken}`, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const parsed = (await response.json()) as { ok: boolean; permalink?: string };
      if (parsed.ok === true && typeof parsed.permalink === "string") {
        return parsed.permalink;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
