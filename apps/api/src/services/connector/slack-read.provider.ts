// FILE: slack-read.provider.ts
// PURPOSE: Section 4 C2 — first real read-first vendor connector.
//          Slack read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Supports three read operations at the C2 register:
//            - conversations.list (public channels + bot-member
//              channels metadata)
//            - users.list (workspace member directory)
//            - conversations.history (messages from channels the
//              bot is a member of)
//          Uses bot tokens (xoxb-*) per Slack OAuth v2 — the
//          installer-independent path preferred by Slack docs
//          for app-installed integrations.
//          Bot token is resolved via the binding.secret_ref
//          env-var-NAME pattern (ADR-0019 + ADR-0024) — the
//          resolved value never leaves this provider.
//          Fixture-first: by default the provider runs in
//          deterministic fixture mode (no outbound HTTP). The
//          real Slack Web API is reached only when
//          SLACK_USE_REAL=1 is set in env AND the binding's
//          config.use_real flag is true. Tests + CI run in
//          fixture mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (chat.postMessage / files.upload / etc.) — C2
//     is strictly read-first. Write capabilities forward-substrate
//     to ≥C6 per ADR-0084 9-slice ladder.
//   - No OAuth installation flow — C2 uses a static admin-supplied
//     xoxb- token via secret_ref. OAuth flow forward-substrate to
//     a later C-slice.
//   - No Events API webhook ingestion — C2 is pull-only. Events
//     API forward-substrate to ≥C7 (composes against the existing
//     verifyInboundHmac substrate at Hardening Wave B).
//   - No private-message / search.messages reads — these require
//     user-token scopes (xoxp-) which raise sovereignty/scope
//     tradeoffs deferred to a later C-slice.
//
// PRIVACY INVARIANT (mirrors the existing OutboundWebhookProvider):
//   - delivery_metadata may carry counts + status code + retry
//     count; NEVER raw message content, channel content, user PII,
//     or the bot token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved bot token, raw response body, or
//     third-party stack traces.
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)

import type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
} from "./connector.service.js";

// ────────────────────────────────────────────────────────────────
// Closed-vocab operation labels. The Action runtime payload
// validator + the invocation_payload schema carry one of these.
// Anything else returns VALIDATION at the provider boundary.
// ────────────────────────────────────────────────────────────────
const SLACK_READ_OPERATIONS = [
  "channels.list",
  "users.list",
  "conversations.history",
] as const;
type SlackReadOperation = (typeof SLACK_READ_OPERATIONS)[number];

function isSlackReadOperation(value: unknown): value is SlackReadOperation {
  return (
    typeof value === "string" &&
    (SLACK_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real Slack Web API. Mirrors FixtureBasedConnectorProvider +
// FixtureBasedLLMProvider per ADR-0014.
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

// ────────────────────────────────────────────────────────────────
// Environment gate. The real Slack Web API path activates only
// when ALL of the following hold:
//   1. process.env.SLACK_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave SLACK_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealSlackApi(invocation: ConnectorInvocation): boolean {
  if (process.env["SLACK_USE_REAL"] !== "1") return false;
  const useReal = invocation.config["use_real"];
  if (useReal !== true) return false;
  if (invocation.secret_ref === null) return false;
  const resolved = process.env[invocation.secret_ref];
  if (typeof resolved !== "string" || resolved.length === 0) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────
// Deterministic fixture-mode delivery_metadata per operation.
// Each operation returns counts + a non-empty marker the caller
// can assert against in tests. Counts are illustrative and stable
// across runs — they reflect the fixture shape, not real Slack
// workspace state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: SlackReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "channels.list":
      return Object.freeze({
        provider: "SlackReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        channels_count: 3,
        public_channels_count: 2,
        private_channels_count: 1,
      });
    case "users.list":
      return Object.freeze({
        provider: "SlackReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        members_count: 8,
        admins_count: 1,
      });
    case "conversations.history":
      return Object.freeze({
        provider: "SlackReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        messages_count: 5,
        truncated: false,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// SlackReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class SlackReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the SLACK_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isSlackReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message: "slack_read: operation must be one of channels.list / users.list / conversations.history",
      };
    }

    // conversations.history requires a target channel; the Action
    // payload validator at the route tier carries the assertion,
    // but the provider defends in depth.
    if (operation === "conversations.history") {
      const channel = invocation.payload["channel"];
      if (typeof channel !== "string" || channel.length === 0) {
        return {
          ok: false,
          error_class: "VALIDATION",
          message: "slack_read: conversations.history requires payload.channel",
        };
      }
    }

    if (shouldUseRealSlackApi(invocation)) {
      return this.invokeRealSlackApi(operation, invocation);
    }

    return {
      ok: true,
      delivery_metadata: fixtureSuccessMetadata(operation, invocation),
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

  // Real Slack Web API path. Kept deliberately small at C2:
  // exactly the three read operations, each via a single GET
  // with a Bearer token header. Response bodies are parsed only
  // for counts + ok status — never echoed in delivery_metadata.
  // Network errors collapse to NETWORK. Slack's ok=false
  // responses collapse to PROVIDER_ERROR with the short
  // Slack-supplied error code echoed as the message text
  // (Slack error codes like "invalid_auth" / "channel_not_found"
  // are not secret material).
  private async invokeRealSlackApi(
    operation: SlackReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "slack_read: secret_ref required" };
    }
    const botToken = process.env[invocation.secret_ref];
    if (typeof botToken !== "string" || botToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "slack_read: secret_ref env var not set" };
    }

    const url = this.buildOperationUrl(operation, invocation);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${botToken}`,
          Accept: "application/json",
        },
      });
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "slack_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `slack_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (body.ok !== true) {
        const errCode = typeof body.error === "string" ? body.error : "unknown_error";
        // invalid_auth + not_authed map to AUTH for clearer
        // operator triage; everything else collapses to
        // PROVIDER_ERROR with the Slack error code surfaced.
        if (errCode === "invalid_auth" || errCode === "not_authed") {
          return { ok: false, error_class: "AUTH", message: `slack_read: ${errCode}` };
        }
        return { ok: false, error_class: "PROVIDER_ERROR", message: `slack_read: ${errCode}` };
      }
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, body),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // Slack network failures + DNS + connection refused all
      // collapse here. The scrubbed message text is bounded to
      // 120 chars and never includes the bot token (Node fetch
      // errors do not include the Authorization header).
      return { ok: false, error_class: "NETWORK", message: `slack_read: ${msg}` };
    }
  }

  private buildOperationUrl(
    operation: SlackReadOperation,
    invocation: ConnectorInvocation,
  ): string {
    const base = "https://slack.com/api";
    switch (operation) {
      case "channels.list": {
        // conversations.list is the modern replacement for the
        // legacy channels.list; types parameter narrows to
        // public_channel + private_channel (the bot must be a
        // member to see private channels).
        return `${base}/conversations.list?types=public_channel,private_channel&limit=200`;
      }
      case "users.list": {
        return `${base}/users.list?limit=200`;
      }
      case "conversations.history": {
        const channel = invocation.payload["channel"];
        const channelStr = typeof channel === "string" ? channel : "";
        return `${base}/conversations.history?channel=${encodeURIComponent(channelStr)}&limit=50`;
      }
    }
  }

  private realSuccessMetadata(
    operation: SlackReadOperation,
    invocation: ConnectorInvocation,
    body: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "channels.list": {
        const channels = Array.isArray(body["channels"]) ? body["channels"] : [];
        return Object.freeze({
          provider: "SlackReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          channels_count: channels.length,
        });
      }
      case "users.list": {
        const members = Array.isArray(body["members"]) ? body["members"] : [];
        return Object.freeze({
          provider: "SlackReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          members_count: members.length,
        });
      }
      case "conversations.history": {
        const messages = Array.isArray(body["messages"]) ? body["messages"] : [];
        const hasMore = body["has_more"] === true;
        return Object.freeze({
          provider: "SlackReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          messages_count: messages.length,
          truncated: hasMore,
        });
      }
    }
  }
}
