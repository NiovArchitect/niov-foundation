// FILE: google-workspace-read.provider.ts
// PURPOSE: Section 4 C3 — second real vendor connector. Google
//          Workspace read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Supports three read operations at the C3 register:
//            - calendar.events.list (primary calendar events
//              metadata)
//            - drive.files.list (Drive file metadata; no content
//              download at C3)
//            - gmail.messages.list (Gmail message IDs only; no
//              body read at C3)
//          Uses OAuth-2.0 access tokens (ya29.* per Google docs)
//          carried in the Authorization: Bearer header. The
//          access token is resolved via the binding.secret_ref
//          env-var-NAME pattern (ADR-0019 + ADR-0024) — the
//          resolved value never leaves this provider.
//          Fixture-first: by default the provider runs in
//          deterministic fixture mode (no outbound HTTP). The
//          real Google APIs are reached only when
//          GOOGLE_USE_REAL=1 is set in env AND the binding's
//          config.use_real flag is true. Tests + CI run in
//          fixture mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (events.insert / files.create / messages.send /
//     etc.) — C3 is strictly read-first. Write capabilities
//     forward-substrate to ≥C6 per ADR-0084 9-slice ladder.
//   - No OAuth refresh-token flow. C3 accepts a static admin-
//     supplied access token via secret_ref. Refresh-token
//     rotation forward-substrate to a later C-slice (composes
//     against GOVSEC.5 break-glass + ADR-0019 cryptographic
//     posture).
//   - No content download. drive.files.list returns metadata
//     (id + name + mimeType + modifiedTime); files.get with
//     alt=media forward-substrate to ≥C5. gmail.messages.list
//     returns message IDs only; messages.get with format=full
//     forward-substrate to ≥C5.
//   - No Pub/Sub push notifications. C3 is pull-only. Push
//     forward-substrate to ≥C7 (composes against the existing
//     verifyInboundHmac substrate at Hardening Wave B).
//
// PRIVACY INVARIANT (mirrors SlackReadProvider + OutboundWebhookProvider):
//   - delivery_metadata may carry counts + status code + retry
//     count; NEVER raw event/file/message content, attendee
//     email PII, file names, subject lines, or the access token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved access token, raw response body, or
//     third-party stack traces.
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)
//   - apps/api/src/services/govsec/tenant-isolation-guard.ts
//     (forward substrate; consumed at the Action handler tier)

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
const GOOGLE_READ_OPERATIONS = [
  "calendar.events.list",
  "drive.files.list",
  "gmail.messages.list",
] as const;
type GoogleReadOperation = (typeof GOOGLE_READ_OPERATIONS)[number];

function isGoogleReadOperation(value: unknown): value is GoogleReadOperation {
  return (
    typeof value === "string" &&
    (GOOGLE_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real Google APIs. Mirrors SlackReadProvider + ADR-0014
// key-based dispatch.
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
// Environment gate. The real Google API path activates only
// when ALL of the following hold:
//   1. process.env.GOOGLE_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave GOOGLE_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealGoogleApi(invocation: ConnectorInvocation): boolean {
  if (process.env["GOOGLE_USE_REAL"] !== "1") return false;
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
// across runs — they reflect the fixture shape, not real Google
// workspace state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: GoogleReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "calendar.events.list":
      return Object.freeze({
        provider: "GoogleWorkspaceReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        events_count: 4,
        recurring_events_count: 1,
      });
    case "drive.files.list":
      return Object.freeze({
        provider: "GoogleWorkspaceReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        files_count: 6,
        folders_count: 2,
      });
    case "gmail.messages.list":
      return Object.freeze({
        provider: "GoogleWorkspaceReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        messages_count: 7,
        result_size_estimate: 7,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// GoogleWorkspaceReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class GoogleWorkspaceReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the GOOGLE_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isGoogleReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "google_workspace_read: operation must be one of calendar.events.list / drive.files.list / gmail.messages.list",
      };
    }

    if (shouldUseRealGoogleApi(invocation)) {
      return this.invokeRealGoogleApi(operation, invocation);
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

  // Real Google APIs path. Kept deliberately small at C3:
  // exactly the three read operations, each via a single GET
  // with a Bearer token header. Response bodies are parsed only
  // for counts + ok status — never echoed in delivery_metadata.
  // Network errors collapse to NETWORK. Google 401 collapses to
  // AUTH; 429 collapses to RATE_LIMIT; other non-2xx collapse to
  // PROVIDER_ERROR with the status code surfaced (status codes
  // are not secret material).
  private async invokeRealGoogleApi(
    operation: GoogleReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "google_workspace_read: secret_ref required" };
    }
    const accessToken = process.env[invocation.secret_ref];
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "google_workspace_read: secret_ref env var not set" };
    }

    const url = this.buildOperationUrl(operation);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (response.status === 401) {
        return { ok: false, error_class: "AUTH", message: "google_workspace_read: 401 unauthorized" };
      }
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "google_workspace_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `google_workspace_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, body),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // Google network failures + DNS + connection refused all
      // collapse here. The scrubbed message text is bounded to
      // 120 chars and never includes the access token (Node fetch
      // errors do not include the Authorization header).
      return { ok: false, error_class: "NETWORK", message: `google_workspace_read: ${msg}` };
    }
  }

  private buildOperationUrl(operation: GoogleReadOperation): string {
    switch (operation) {
      case "calendar.events.list": {
        // Primary calendar; metadata-only fields parameter to
        // minimize the response body shape and ensure we never
        // accidentally surface attendee email PII or event
        // descriptions in real-mode response parsing.
        return "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&fields=items(id,status,updated,recurringEventId),nextPageToken";
      }
      case "drive.files.list": {
        // Drive v3; metadata-only fields parameter (id +
        // mimeType + modifiedTime). Names + content explicitly
        // excluded from the fields mask.
        return "https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,mimeType,modifiedTime),nextPageToken";
      }
      case "gmail.messages.list": {
        // Gmail v1; metadata-only (message IDs + threadIds).
        // No format=full / format=metadata header content
        // headers requested at C3.
        return "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50";
      }
    }
  }

  private realSuccessMetadata(
    operation: GoogleReadOperation,
    invocation: ConnectorInvocation,
    body: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "calendar.events.list": {
        const items = Array.isArray(body["items"]) ? body["items"] : [];
        const recurring = items.filter(
          (it) =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as Record<string, unknown>)["recurringEventId"] === "string",
        );
        return Object.freeze({
          provider: "GoogleWorkspaceReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          events_count: items.length,
          recurring_events_count: recurring.length,
        });
      }
      case "drive.files.list": {
        const files = Array.isArray(body["files"]) ? body["files"] : [];
        const folders = files.filter(
          (f) =>
            typeof f === "object" &&
            f !== null &&
            (f as Record<string, unknown>)["mimeType"] ===
              "application/vnd.google-apps.folder",
        );
        return Object.freeze({
          provider: "GoogleWorkspaceReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          files_count: files.length,
          folders_count: folders.length,
        });
      }
      case "gmail.messages.list": {
        const messages = Array.isArray(body["messages"]) ? body["messages"] : [];
        const estimate =
          typeof body["resultSizeEstimate"] === "number"
            ? body["resultSizeEstimate"]
            : messages.length;
        return Object.freeze({
          provider: "GoogleWorkspaceReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          messages_count: messages.length,
          result_size_estimate: estimate,
        });
      }
    }
  }
}
