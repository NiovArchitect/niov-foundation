// FILE: connector.service.ts
// PURPOSE: Section 4 Wave 1 ConnectorProvider abstraction +
//          ConnectorRegistry. Greenfield substrate that mirrors
//          the canonical provider pattern at
//          apps/api/src/services/embedding/embedding.service.ts +
//          apps/api/src/services/llm/llm.service.ts.
//          Wave 1 lands the abstraction + registry + a
//          deterministic FixtureBasedConnectorProvider for CI;
//          subsequent waves add ConnectorBinding persistence
//          (Wave 2) + INVOKE_CONNECTOR ActionType + handler
//          (Wave 3) + real OutboundWebhookProvider (Wave 4) +
//          NotificationService external fan-out bridge (Wave 5).
//
// CONNECTS TO:
//   - Future Wave 2 ConnectorBinding model (Prisma; per-org
//     enablement + scoped config + secret_ref env-var name).
//   - Future Wave 3 INVOKE_CONNECTOR ActionType handler — calls
//     getConnectorProvider(type).invoke(...) inside the Action
//     runtime so ACTION_* audit literals cover the lifecycle.
//   - Future Wave 4 OutboundWebhookProvider — real provider for
//     HTTPS POST with HMAC-SHA-256 signing.
//   - apps/api/src/services/connector/index.ts barrel.
//
// PRIVACY INVARIANT (mirrors embedding/llm provider patterns;
// extends to connector substrate per RULE 4 + RULE 13):
//   - Provider results NEVER carry raw provider error bodies,
//     HTTP response bodies, third-party stack traces, or
//     secret material. Errors collapse to discriminated
//     error_class literals + a short human-readable message
//     scrubbed of secrets at the provider boundary.
//   - `secret_ref` strings (env var NAMES) may be echoed; resolved
//     secret VALUES never leave the provider implementation.
//   - delivery_metadata may carry timing, status codes, retry
//     counts; it MUST NOT carry headers, response bodies, or
//     authentication material.

// WHAT: The connector-type discriminator. Currently OUTBOUND_WEBHOOK
//        only; future types (SLACK, EMAIL, etc.) join the union as
//        each provider lands behind its own Founder QLOCK + RULE 21
//        research arc.
// INPUT: Used as a string-literal union.
// OUTPUT: None — type only.
// WHY: Branded string union over connector kinds. Mirrors the
//      embedding model/dimensions string-literal pattern.
export type ConnectorType =
  | "OUTBOUND_WEBHOOK"
  | "FIXTURE_ECHO"
  | "SLACK_READ"
  | "GOOGLE_WORKSPACE_READ"
  | "JIRA_CLOUD_READ";

// WHAT: The shape of one connector-type definition in the registry.
// INPUT: Used as a record type.
// OUTPUT: None.
// WHY: The registry is the authoritative catalog of which connector
//      types exist + what each one does, used by Wave 2's binding
//      validator + Wave 3's handler dispatch + future admin UIs.
//      `transport` is a freeform label (e.g. "https-post") used for
//      operator documentation; `default_config_keys` documents the
//      keys a binding's `config` JSON column is expected to carry.
//      `secret_ref_required` makes the registration validator
//      enforce that a binding for this type carries a non-empty
//      `secret_ref` string.
export interface ConnectorTypeDefinition {
  type: ConnectorType;
  display_name: string;
  transport: string;
  default_config_keys: ReadonlyArray<string>;
  secret_ref_required: boolean;
  description: string;
}

// WHAT: The frozen canonical connector-type catalog.
// INPUT: None — module constant.
// OUTPUT: None — module constant.
// WHY: Single source of truth for which connector types Section 4
//      supports. Frozen-anchor pattern per ADR-0003. New types are
//      added by appending entries in their own Founder-authorized
//      wave (RULE 13 surfaces type extensions inline).
export const CONNECTOR_REGISTRY: Readonly<
  Record<ConnectorType, ConnectorTypeDefinition>
> = Object.freeze({
  OUTBOUND_WEBHOOK: Object.freeze({
    type: "OUTBOUND_WEBHOOK" as const,
    display_name: "Outbound Webhook",
    transport: "https-post-hmac-sha256",
    default_config_keys: Object.freeze(["url", "method", "headers"]),
    secret_ref_required: true,
    description:
      "HTTPS POST to a per-binding-configured URL with HMAC-SHA-256 request signing using the secret_ref-resolved env var. Lowest blast radius; no provider SDK; no OAuth.",
  }),
  FIXTURE_ECHO: Object.freeze({
    type: "FIXTURE_ECHO" as const,
    display_name: "Fixture Echo (test-only)",
    transport: "in-process",
    default_config_keys: Object.freeze([]),
    secret_ref_required: false,
    description:
      "Test-only connector that returns the invocation payload back to the caller deterministically. Never enabled in production bindings; used by FixtureBasedConnectorProvider for unit + integration tests.",
  }),
  SLACK_READ: Object.freeze({
    type: "SLACK_READ" as const,
    display_name: "Slack (read-first)",
    transport: "https-get-bearer-token",
    default_config_keys: Object.freeze(["use_real", "workspace_id"]),
    secret_ref_required: true,
    description:
      "Section 4 C2 first real vendor connector. Bot-token (xoxb-*) read-only access to Slack via conversations.list + users.list + conversations.history. Fixture-first: real Slack Web API reached only when SLACK_USE_REAL=1 + binding.config.use_real=true + secret_ref env var set. No writes at C2 (chat.postMessage / files.upload forward-substrate to ≥C6). No OAuth flow at C2 (static admin-supplied bot-token via secret_ref). No Events API webhook at C2 (forward-substrate to ≥C7).",
  }),
  GOOGLE_WORKSPACE_READ: Object.freeze({
    type: "GOOGLE_WORKSPACE_READ" as const,
    display_name: "Google Workspace (read-first)",
    transport: "https-get-bearer-token",
    default_config_keys: Object.freeze(["use_real", "workspace_domain"]),
    secret_ref_required: true,
    description:
      "Section 4 C3 second real vendor connector. OAuth-2.0 access-token read-only access to Google Workspace via calendar.events.list + drive.files.list + gmail.messages.list. Fixture-first: real Google API reached only when GOOGLE_USE_REAL=1 + binding.config.use_real=true + secret_ref env var set. No writes at C3 (calendar/drive/gmail mutations forward-substrate to ≥C6). No OAuth refresh-token flow at C3 (static admin-supplied access-token via secret_ref; refresh-token rotation forward-substrate to a later C-slice). No Drive content download / Gmail body read at C3 (metadata + IDs only; raw content forward-substrate to ≥C5).",
  }),
  JIRA_CLOUD_READ: Object.freeze({
    type: "JIRA_CLOUD_READ" as const,
    display_name: "Jira Cloud (read-first)",
    transport: "https-bearer-token",
    default_config_keys: Object.freeze(["use_real", "cloud_id"]),
    secret_ref_required: true,
    description:
      "Section 4 C4-A third real vendor connector. OAuth-2.0 3LO access-token read-only access to Jira Cloud via myself + project.search + issue.search (POST /rest/api/3/search/jql cursor-based JQL search). Fixture-first: real Jira Cloud API reached only when JIRA_USE_REAL=1 + binding.config.use_real=true + secret_ref env var set. No writes at C4-A (issue create / update / transition / bulk forward-substrate to ≥C6 per dual-control + workflow-binding constraints). No OAuth refresh-token rotation. No agile-board / sprint / worklog / changelog / webhook ingestion at C4-A. Status-category aggregates only — never issue keys / summaries / descriptions / assignee identity. Points-based rate-limit enforcement aware (Atlassian active 2026-03-02).",
  }),
});

// WHAT: Lookup helper — returns the catalog entry for a connector
//        type or null if the type is unknown.
// INPUT: A candidate type string.
// OUTPUT: The ConnectorTypeDefinition or null.
// WHY: Keeps callers from indexing CONNECTOR_REGISTRY directly with
//      arbitrary strings (TypeScript's `noUncheckedIndexedAccess`
//      makes that awkward and the null-discriminated helper is
//      easier to use at validation sites).
export function getConnectorTypeDefinition(
  candidate: string,
): ConnectorTypeDefinition | null {
  if (
    candidate === "OUTBOUND_WEBHOOK" ||
    candidate === "FIXTURE_ECHO" ||
    candidate === "SLACK_READ" ||
    candidate === "GOOGLE_WORKSPACE_READ" ||
    candidate === "JIRA_CLOUD_READ"
  ) {
    return CONNECTOR_REGISTRY[candidate];
  }
  return null;
}

// WHAT: The unified invocation payload every ConnectorProvider
//        accepts.
// INPUT: Used as the provider input type.
// OUTPUT: None.
// WHY: `binding_id` lets the provider correlate the call to the
//      ConnectorBinding row Wave 2 will introduce. `payload` is the
//      opaque per-call body (e.g., webhook JSON body). `config` is
//      the per-binding non-secret config snapshot resolved by the
//      caller (so the provider doesn't have to read the database).
//      `secret_ref` is the env-var NAME the provider resolves at
//      invocation time; the resolved VALUE never crosses this
//      type's boundary as a field.
export interface ConnectorInvocation {
  binding_id: string;
  type: ConnectorType;
  config: Readonly<Record<string, unknown>>;
  secret_ref: string | null;
  payload: Readonly<Record<string, unknown>>;
}

// WHAT: The unified result shape every ConnectorProvider must
//        return.
// INPUT: Used as a return type.
// OUTPUT: None — discriminated union type.
// WHY: Mirrors EmbeddingResult / LLMResult discriminated-union
//      pattern. `ok: true` exposes delivery_metadata (timing,
//      status code if HTTP, retry count); `ok: false` exposes
//      a closed error_class enum so callers can branch
//      deterministically without parsing error messages. Per the
//      module-level privacy invariant: no response bodies, no
//      secret material, no third-party stack traces.
export type ConnectorResult =
  | {
      ok: true;
      delivery_metadata: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      error_class:
        | "AUTH"
        | "NOT_CONFIGURED"
        | "DISABLED"
        | "NETWORK"
        | "TIMEOUT"
        | "RATE_LIMIT"
        | "PROVIDER_ERROR"
        | "VALIDATION";
      message: string;
    };

// WHAT: The unified connector-provider interface.
// INPUT: ConnectorInvocation.
// OUTPUT: Promise<ConnectorResult>.
// WHY: Production code calls `getConnectorProvider(type).invoke(...)`
//      from the INVOKE_CONNECTOR action handler (Wave 3); tests pass
//      a FixtureBasedConnectorProvider through a constructor seam.
//      The interface deliberately does not expose secret-resolution
//      hooks — implementations resolve `secret_ref` internally so
//      no caller can accidentally log the resolved value.
export interface ConnectorProvider {
  invoke(invocation: ConnectorInvocation): Promise<ConnectorResult>;
}

// WHAT: Deterministic fixture provider for CI + unit tests.
// INPUT: ConnectorInvocation.
// OUTPUT: Promise<ConnectorResult>.
// WHY: Mirrors FixtureBasedEmbeddingProvider / FixtureBasedLLMProvider
//      pattern (ADR-0014 key-based dispatch). The fixture key is
//      taken from `invocation.payload.fixture_key`; if absent the
//      provider returns a deterministic success echoing the
//      invocation type + binding_id. Special fixture keys exercise
//      each error_class so tests can prove the handler maps every
//      branch correctly without exercising real outbound HTTP:
//        "force-auth-failure"       → AUTH
//        "force-disabled"           → DISABLED
//        "force-network-failure"    → NETWORK
//        "force-timeout"            → TIMEOUT
//        "force-rate-limit"         → RATE_LIMIT
//        "force-provider-error"     → PROVIDER_ERROR
//        "force-validation-failure" → VALIDATION
//        "force-not-configured"     → NOT_CONFIGURED
export class FixtureBasedConnectorProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    const fixtureKey = invocation.payload["fixture_key"];
    if (typeof fixtureKey === "string") {
      switch (fixtureKey) {
        case "force-auth-failure":
          return {
            ok: false,
            error_class: "AUTH",
            message: "fixture: forced AUTH failure",
          };
        case "force-disabled":
          return {
            ok: false,
            error_class: "DISABLED",
            message: "fixture: forced DISABLED failure",
          };
        case "force-network-failure":
          return {
            ok: false,
            error_class: "NETWORK",
            message: "fixture: forced NETWORK failure",
          };
        case "force-timeout":
          return {
            ok: false,
            error_class: "TIMEOUT",
            message: "fixture: forced TIMEOUT failure",
          };
        case "force-rate-limit":
          return {
            ok: false,
            error_class: "RATE_LIMIT",
            message: "fixture: forced RATE_LIMIT failure",
          };
        case "force-provider-error":
          return {
            ok: false,
            error_class: "PROVIDER_ERROR",
            message: "fixture: forced PROVIDER_ERROR failure",
          };
        case "force-validation-failure":
          return {
            ok: false,
            error_class: "VALIDATION",
            message: "fixture: forced VALIDATION failure",
          };
        case "force-not-configured":
          return {
            ok: false,
            error_class: "NOT_CONFIGURED",
            message: "fixture: forced NOT_CONFIGURED failure",
          };
        default:
          break;
      }
    }
    return {
      ok: true,
      delivery_metadata: Object.freeze({
        provider: "FixtureBasedConnectorProvider",
        type: invocation.type,
        binding_id: invocation.binding_id,
        fixture_key: typeof fixtureKey === "string" ? fixtureKey : null,
      }),
    };
  }
}

// WHAT: The production factory — returns the default provider for
//        a given connector type.
// INPUT: ConnectorType.
// OUTPUT: ConnectorProvider.
// WHY: Wave 4 swap: OUTBOUND_WEBHOOK now returns the real
//      OutboundWebhookProvider; FIXTURE_ECHO still returns
//      FixtureBasedConnectorProvider (test-only type per
//      CONNECTOR_REGISTRY entry). Tests still inject
//      FixtureBasedConnectorProvider directly via constructor seams
//      to keep CI deterministic (no real outbound HTTP); production
//      INVOKE_CONNECTOR handler calls this factory at execute-time.
//      The OutboundWebhookProvider is stateless; constructing a
//      fresh one per call is cheap and avoids module-init ordering
//      surprises.
export function getConnectorProvider(type: ConnectorType): ConnectorProvider {
  if (type === "OUTBOUND_WEBHOOK") {
    // Inline-import wrapped to dodge the circular-import shape
    // between this file and outbound-webhook.provider.ts (the
    // provider imports types from here; constructing it from here
    // requires the run-time class). Dynamic `await import()` works
    // because every caller path is async (Action handler returns
    // a Promise + provider.invoke is async); a static import would
    // create a tsc-time cycle.
    throw new Error(
      "INTERNAL: getConnectorProvider(OUTBOUND_WEBHOOK) must be resolved via the async getConnectorProviderAsync helper at the Wave 4 register",
    );
  }
  return new FixtureBasedConnectorProvider();
}

// WHAT: Async variant of getConnectorProvider that can resolve the
//        real OutboundWebhookProvider. The INVOKE_CONNECTOR handler
//        uses this; tests that pass an injected provider via
//        ActionHandlerRegistryDeps never hit this path.
// INPUT: ConnectorType.
// OUTPUT: Promise<ConnectorProvider>.
// WHY: Wave 4 wants the real provider in production. The static
//      sync factory above stays as the test-default seam for callers
//      that don't await — Wave 3's handler is already async so the
//      switch is a no-op at the call site.
export async function getConnectorProviderAsync(
  type: ConnectorType,
): Promise<ConnectorProvider> {
  if (type === "OUTBOUND_WEBHOOK") {
    const mod = await import("./outbound-webhook.provider.js");
    return new mod.OutboundWebhookProvider();
  }
  if (type === "SLACK_READ") {
    // Section 4 C2 — first real vendor connector. Dynamic import
    // mirrors the OUTBOUND_WEBHOOK pattern above to avoid a static
    // import cycle (the provider imports types from this module).
    const mod = await import("./slack-read.provider.js");
    return new mod.SlackReadProvider();
  }
  if (type === "GOOGLE_WORKSPACE_READ") {
    // Section 4 C3 — second real vendor connector. Same dynamic-
    // import pattern as SLACK_READ and OUTBOUND_WEBHOOK.
    const mod = await import("./google-workspace-read.provider.js");
    return new mod.GoogleWorkspaceReadProvider();
  }
  if (type === "JIRA_CLOUD_READ") {
    // Section 4 C4-A — third real vendor connector. Same dynamic-
    // import pattern as SLACK_READ + GOOGLE_WORKSPACE_READ +
    // OUTBOUND_WEBHOOK.
    const mod = await import("./jira-cloud-read.provider.js");
    return new mod.JiraCloudReadProvider();
  }
  return new FixtureBasedConnectorProvider();
}
