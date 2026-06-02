// FILE: microsoft-365-read.provider.ts
// PURPOSE: Section 4 C5 — sixth real vendor connector. Microsoft
//          365 read-only adapter implementing the canonical
//          ConnectorProvider interface (connector.service.ts).
//          Closes the 6/6 connector matrix at RUNTIME_READY by
//          covering the Workspace / Knowledge family's second
//          provider (Google Workspace OPERATING via CT PR #22 +
//          Microsoft 365 RUNTIME_READY via this PR).
//
//          Supports three read operations at the C5 register
//          (mirrors C3 Google Workspace operation shape):
//            - calendar.events.list  (primary calendar events
//                                     metadata via Microsoft
//                                     Graph /me/calendar/events)
//            - drive.items.list      (OneDrive root items
//                                     metadata; no content
//                                     download at C5)
//            - mail.messages.list    (Outlook mail messages
//                                     metadata only; no body
//                                     read at C5)
//
//          Uses OAuth 2.0 access tokens issued by Azure Active
//          Directory carried in the Authorization: Bearer
//          header. The access token is resolved via the
//          binding.secret_ref env-var-NAME pattern (ADR-0019 +
//          ADR-0024) — the resolved VALUE never leaves this
//          provider.
//
//          Fixture-first: by default the provider runs in
//          deterministic fixture mode (no outbound HTTP). The
//          real Microsoft Graph API is reached only when
//          MS365_USE_REAL=1 is set in env AND the binding's
//          config.use_real flag is true AND secret_ref resolves
//          to a non-empty env-var VALUE. Tests + CI run in
//          fixture mode unconditionally.
//
// What this slice does NOT do:
//   - No writes (events.create / files.upload /
//     messages.send / etc.) — C5 is strictly read-first.
//     Write capabilities forward-substrate to ≥C6 per ADR-0084.
//   - No OAuth refresh-token rotation. C5 accepts a static
//     admin-supplied access token via secret_ref. Refresh-token
//     rotation forward-substrate to a later C-slice.
//   - No file content download. drive.items.list returns
//     metadata only (id + size + folder hint); GET /me/drive/
//     items/{id}/content forward-substrate to ≥C5+.
//   - No mail body read. mail.messages.list returns message
//     IDs only; messages.get with $select=body forward-
//     substrate to ≥C5+.
//   - No Teams Read at C5 (forward-substrate to a later
//     C-slice; Microsoft Graph /me/joinedTeams + /chats
//     surface).
//   - No webhook / change-notification subscriptions at C5.
//     Subscriptions / Lifecycle events forward-substrate to
//     ≥C7 (composes against verifyInboundHmac substrate).
//   - No SharePoint / OneNote / Planner / Bookings reads at
//     C5 (later C-slice).
//
// PRIVACY INVARIANT (mirrors C3 Google Workspace provider):
//   - delivery_metadata may carry counts + status code + retry
//     count; NEVER raw event/file/message content, attendee
//     email PII, file names, subject lines, sender/recipient
//     email addresses, or the access token.
//   - On error, message is a short scrubbed summary; never
//     includes the resolved access token, raw response body, or
//     third-party stack traces.
//
// RULE 21 RESEARCH ARC (recorded in commit body + tests/unit/c5-microsoft-365-read-provider.test.ts):
//   - Microsoft Graph v1.0 stable base path
//     https://graph.microsoft.com/v1.0
//   - OAuth 2.0 access token from Azure Active Directory; both
//     delegated and application permissions land as Bearer
//     tokens at the request boundary
//   - $select query parameter restricts response field set —
//     used at C5 to bound the response shape so subject lines /
//     body content / file names / attendee email PII cannot
//     accidentally surface even in real-mode response parsing
//   - $top query parameter bounds page size (max 999; C5
//     pins 50 for symmetry with C2/C3/C4-A/C4-B/C-GitHub)
//   - tenant_id config field carries the Azure AD tenant
//     identifier (GUID format); analogous role to C3
//     workspace_domain or C4-A cloud_id
//
// CONNECTS TO:
//   - connector.service.ts (ConnectorProvider interface +
//     ConnectorInvocation + ConnectorResult)
//   - apps/api/src/services/govsec/agent-abuse-guard.ts (forward
//     substrate; consumed at the Action handler tier rather than
//     inside this provider)
//   - apps/api/src/services/govsec/tenant-isolation-guard.ts
//     (forward substrate; consumed at the Action handler tier)
//   - docs/connector-readiness/microsoft-365.json (catalog
//     readiness item — first_slice_recommendation: C5 Microsoft
//     365 read-first connector runtime; this provider
//     implements that recommendation; closes the 6/6 connector
//     matrix)

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
const MS365_READ_OPERATIONS = [
  "calendar.events.list",
  "drive.items.list",
  "mail.messages.list",
] as const;
type Microsoft365ReadOperation = (typeof MS365_READ_OPERATIONS)[number];

function isMicrosoft365ReadOperation(
  value: unknown,
): value is Microsoft365ReadOperation {
  return (
    typeof value === "string" &&
    (MS365_READ_OPERATIONS as ReadonlyArray<string>).includes(value)
  );
}

// ────────────────────────────────────────────────────────────────
// Fixture mode keys. Tests pass an explicit fixture_key in
// invocation.payload to assert handler behavior across the full
// ConnectorResult discriminated union without ever reaching the
// real Microsoft Graph API. Mirrors C2/C3/C4-A/C4-B/C-GitHub
// providers + ADR-0014 key-based dispatch.
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
// Environment gate. The real Microsoft Graph API path activates
// only when ALL of the following hold:
//   1. process.env.MS365_USE_REAL === "1"
//   2. binding.config.use_real === true
//   3. binding.secret_ref resolves to a non-empty env-var VALUE
// CI + unit + integration tests leave MS365_USE_REAL unset, so
// every invocation deterministically runs in fixture mode.
// ────────────────────────────────────────────────────────────────
function shouldUseRealMicrosoftGraphApi(
  invocation: ConnectorInvocation,
): boolean {
  if (process.env["MS365_USE_REAL"] !== "1") return false;
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
// across runs — they reflect the fixture shape, not real
// Microsoft 365 tenant state.
// ────────────────────────────────────────────────────────────────
function fixtureSuccessMetadata(
  operation: Microsoft365ReadOperation,
  invocation: ConnectorInvocation,
): Readonly<Record<string, unknown>> {
  switch (operation) {
    case "calendar.events.list":
      return Object.freeze({
        provider: "Microsoft365ReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts + recurring-class aggregate only — NEVER
        // event subjects, attendee email PII, location text,
        // body content.
        events_count: 5,
        recurring_events_count: 2,
      });
    case "drive.items.list":
      return Object.freeze({
        provider: "Microsoft365ReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts only — NEVER file names, folder paths, or
        // owner display names.
        items_count: 8,
        folders_count: 3,
      });
    case "mail.messages.list":
      return Object.freeze({
        provider: "Microsoft365ReadProvider",
        mode: "fixture",
        operation,
        binding_id: invocation.binding_id,
        // Counts only — NEVER subject lines, body content,
        // sender / recipient email addresses, or attachment
        // names.
        messages_count: 12,
      });
  }
}

// ────────────────────────────────────────────────────────────────
// Microsoft365ReadProvider — production class.
// ────────────────────────────────────────────────────────────────
export class Microsoft365ReadProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Fixture mode short-circuits BEFORE any real outbound HTTP.
    // Tests rely on this path; the only way to reach the real API
    // is the MS365_USE_REAL + config.use_real + secret_ref triple.
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return this.fixtureFailureResponse(fixtureKey);
    }

    const operation = invocation.payload["operation"];
    if (!isMicrosoft365ReadOperation(operation)) {
      return {
        ok: false,
        error_class: "VALIDATION",
        message:
          "microsoft_365_read: operation must be one of calendar.events.list / drive.items.list / mail.messages.list",
      };
    }

    if (shouldUseRealMicrosoftGraphApi(invocation)) {
      return this.invokeRealMicrosoftGraphApi(operation, invocation);
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

  // Real Microsoft Graph API path. Kept deliberately small at C5:
  // exactly the three read operations, each via a single GET
  // with a Bearer token header. Response bodies are parsed only
  // for counts + recurring/folder aggregates — never echoed in
  // delivery_metadata. Network errors collapse to NETWORK.
  // Microsoft Graph 401 collapses to AUTH; 429 collapses to
  // RATE_LIMIT; 403 (token-missing-scope) collapses to AUTH
  // because the operator can't distinguish at the audit register
  // between an invalid token + a scope-missing token. Other
  // non-2xx collapse to PROVIDER_ERROR with the status code
  // surfaced (status codes are not secret material).
  private async invokeRealMicrosoftGraphApi(
    operation: Microsoft365ReadOperation,
    invocation: ConnectorInvocation,
  ): Promise<ConnectorResult> {
    if (invocation.secret_ref === null) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "microsoft_365_read: secret_ref required" };
    }
    const accessToken = process.env[invocation.secret_ref];
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { ok: false, error_class: "NOT_CONFIGURED", message: "microsoft_365_read: secret_ref env var not set" };
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
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error_class: "AUTH", message: `microsoft_365_read: ${response.status} unauthorized` };
      }
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "microsoft_365_read: 429 rate-limited" };
      }
      if (!response.ok) {
        return {
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: `microsoft_365_read: http ${response.status}`,
        };
      }
      const body = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        delivery_metadata: this.realSuccessMetadata(operation, invocation, body),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      // Microsoft Graph network failures + DNS + connection
      // refused all collapse here. The scrubbed message text is
      // bounded to 120 chars and never includes the access token
      // (Node fetch errors do not include the Authorization
      // header).
      return { ok: false, error_class: "NETWORK", message: `microsoft_365_read: ${msg}` };
    }
  }

  private buildOperationUrl(operation: Microsoft365ReadOperation): string {
    switch (operation) {
      case "calendar.events.list": {
        // Primary calendar via /me/calendar/events; $select
        // restricts the response field set to id + type +
        // seriesMasterId only so subject lines / attendee email
        // PII / body content / location text cannot
        // accidentally surface in real-mode response parsing.
        return "https://graph.microsoft.com/v1.0/me/calendar/events?$top=50&$select=id,type,seriesMasterId";
      }
      case "drive.items.list": {
        // OneDrive root children via /me/drive/root/children;
        // $select restricts the response field set to id +
        // size + folder only so file names cannot accidentally
        // surface in real-mode response parsing. The `folder`
        // field is a sub-object when the item is a folder.
        return "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=50&$select=id,size,folder";
      }
      case "mail.messages.list": {
        // Mail messages via /me/messages; $select restricts the
        // response field set to id only so subject lines /
        // body content / sender / recipient email addresses
        // cannot accidentally surface.
        return "https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=id";
      }
    }
  }

  private realSuccessMetadata(
    operation: Microsoft365ReadOperation,
    invocation: ConnectorInvocation,
    body: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> {
    switch (operation) {
      case "calendar.events.list": {
        // Microsoft Graph response uses `value` as the array
        // wrapper (OData v4 convention) — distinct from Google
        // Calendar's `items`.
        const events = Array.isArray(body["value"]) ? body["value"] : [];
        // Microsoft Graph event types: "singleInstance" |
        // "occurrence" | "exception" | "seriesMaster". A
        // "seriesMaster" represents the recurring series; we
        // count those (plus their child "occurrence" /
        // "exception" instances filtered by seriesMasterId) as
        // recurring.
        const recurring = events.filter(
          (it) =>
            typeof it === "object" &&
            it !== null &&
            (((it as Record<string, unknown>)["type"] ===
              "seriesMaster") ||
              ((it as Record<string, unknown>)["type"] === "occurrence") ||
              ((it as Record<string, unknown>)["type"] === "exception")),
        );
        return Object.freeze({
          provider: "Microsoft365ReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          events_count: events.length,
          recurring_events_count: recurring.length,
        });
      }
      case "drive.items.list": {
        const items = Array.isArray(body["value"]) ? body["value"] : [];
        const folders = items.filter(
          (it) =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as Record<string, unknown>)["folder"] ===
              "object" &&
            (it as Record<string, unknown>)["folder"] !== null,
        );
        return Object.freeze({
          provider: "Microsoft365ReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          items_count: items.length,
          folders_count: folders.length,
        });
      }
      case "mail.messages.list": {
        const messages = Array.isArray(body["value"]) ? body["value"] : [];
        return Object.freeze({
          provider: "Microsoft365ReadProvider",
          mode: "real",
          operation,
          binding_id: invocation.binding_id,
          messages_count: messages.length,
        });
      }
    }
  }
}
