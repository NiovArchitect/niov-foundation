// FILE: mcp-invoke.provider.ts
// PURPOSE: Work-OS Slice F — real Model Context Protocol (MCP) tool
//          invocation provider implementing the canonical
//          ConnectorProvider interface (connector/connector.service.ts).
//          Speaks MCP JSON-RPC 2.0 `tools/call` over HTTP to a
//          per-binding-configured MCP server (McpServerConnection.server_url).
//
//          v1 posture (honest boundary):
//            - Real MCP protocol client (JSON-RPC 2.0, tools/call).
//            - auth_mode NONE_FOR_LOCAL_MOCK is fully supported and is
//              the tested/live-verified path: a local mock MCP server
//              stands in for a production server. http:// is permitted
//              ONLY for NONE_FOR_LOCAL_MOCK (local mock); every other
//              auth mode requires https://.
//            - Production external MCP servers are architecturally wired
//              (API_KEY / MCP_AUTH resolve a Bearer token from secret_ref),
//              but real external-server live verification waits until a
//              real server_url + credential are provided.
//
//          Governance posture: this provider is the LAST hop, reached
//          only from the INVOKE_CONNECTOR Action handler after the Action
//          policy-evaluator + approval gate cleared. The per-tool
//          McpToolPolicy (READ / WRITE / MUTATION / EXTERNAL_SEND ×
//          ALLOW / NEEDS_APPROVAL / BLOCK / DRAFT_ONLY) is resolved
//          UPSTREAM by execution-bridge.ts (which owns the DB read) and
//          passed in via config.policy_outcome; the provider makes a
//          defensive last-hop refusal when that outcome forbids a write.
//
// PRIVACY INVARIANT (mirrors the connector provider family):
//   - delivery_metadata carries tool + a bounded result summary +
//     status ONLY. NEVER the resolved secret, NEVER raw MCP result
//     bodies beyond a bounded summary, NEVER third-party stack traces.
//   - secret_ref resolves an env-var VALUE that is used only as a
//     Bearer token and never leaves this provider.
// CONNECTS TO:
//   - connector/connector.service.ts (ConnectorProvider / ConnectorInvocation
//     / ConnectorResult)
//   - connector-rails/mcp-tool-policy.service.ts (McpToolPolicy vocab,
//     resolved upstream)
//   - work-os/execution-bridge.ts (creates the governed Action)

import type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
} from "../connector/connector.service.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SUMMARY_CHARS = 200;

// Fixture-failure keys — assert the full ConnectorResult union in unit
// tests without a real (or mock) server. Mirrors the vendor providers.
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

// Policy outcomes that forbid a governed write reaching a real tool
// call. ALLOW + NEEDS_APPROVAL proceed (NEEDS_APPROVAL is already
// satisfied by the Action approval gate upstream); BLOCK / DRAFT_ONLY /
// DUAL_CONTROL_REQUIRED must never execute here.
const FORBIDDEN_OUTCOMES = new Set(["BLOCK", "DRAFT_ONLY", "DUAL_CONTROL_REQUIRED"]);

interface NormalizedInvoke {
  serverUrl: URL;
  toolName: string;
  authMode: string;
  args: Record<string, unknown>;
}

function normalize(
  invocation: ConnectorInvocation,
): { ok: true; call: NormalizedInvoke } | { ok: false; result: ConnectorResult } {
  const cfg = invocation.config;
  const serverUrlRaw = cfg["server_url"];
  if (typeof serverUrlRaw !== "string" || serverUrlRaw.length === 0) {
    return { ok: false, result: { ok: false, error_class: "NOT_CONFIGURED", message: "mcp_invoke: config.server_url required" } };
  }
  let serverUrl: URL;
  try {
    serverUrl = new URL(serverUrlRaw);
  } catch {
    return { ok: false, result: { ok: false, error_class: "NOT_CONFIGURED", message: "mcp_invoke: config.server_url is not a valid URL" } };
  }
  const authMode = typeof cfg["auth_mode"] === "string" ? (cfg["auth_mode"] as string) : "MCP_AUTH";
  // http:// is permitted ONLY for the local-mock auth mode; every real
  // auth mode requires https:// so a token never crosses plaintext.
  if (serverUrl.protocol !== "https:") {
    const localMockHttp = serverUrl.protocol === "http:" && authMode === "NONE_FOR_LOCAL_MOCK";
    if (!localMockHttp) {
      return { ok: false, result: { ok: false, error_class: "NOT_CONFIGURED", message: "mcp_invoke: server_url must use https:// (http:// only for NONE_FOR_LOCAL_MOCK)" } };
    }
  }
  const toolName = cfg["tool_name"];
  if (typeof toolName !== "string" || toolName.length === 0) {
    return { ok: false, result: { ok: false, error_class: "VALIDATION", message: "mcp_invoke: config.tool_name required" } };
  }
  // Defensive last-hop policy check — the outcome was resolved upstream
  // by execution-bridge via findMatchingPolicy; a forbidding outcome
  // must never reach a real tool call.
  const outcome = cfg["policy_outcome"];
  if (typeof outcome === "string" && FORBIDDEN_OUTCOMES.has(outcome)) {
    return { ok: false, result: { ok: false, error_class: "DISABLED", message: `mcp_invoke: tool policy outcome ${outcome} forbids execution` } };
  }
  const rawArgs = invocation.payload["arguments"];
  const args =
    rawArgs !== null && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};
  return { ok: true, call: { serverUrl, toolName, authMode, args } };
}

export class McpInvokeProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    const fixtureKey = invocation.payload["fixture_key"];
    if (isFixtureKey(fixtureKey)) {
      return fixtureFailureResponse(fixtureKey);
    }

    const normalized = normalize(invocation);
    if (normalized.ok === false) return normalized.result;
    const { serverUrl, toolName, authMode, args } = normalized.call;

    // Resolve auth. NONE_FOR_LOCAL_MOCK → no Authorization header.
    // Every other mode requires a resolvable secret_ref → Bearer token.
    let authHeader: string | null = null;
    if (authMode !== "NONE_FOR_LOCAL_MOCK") {
      if (invocation.secret_ref === null) {
        return { ok: false, error_class: "NOT_CONFIGURED", message: `mcp_invoke: auth_mode ${authMode} requires a secret_ref` };
      }
      const secret = process.env[invocation.secret_ref];
      if (typeof secret !== "string" || secret.length === 0) {
        return { ok: false, error_class: "NOT_CONFIGURED", message: `mcp_invoke: secret_ref env var not set` };
      }
      authHeader = `Bearer ${secret}`;
    }

    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      // A stable per-invocation id; binding_id is not secret.
      id: `wl-${invocation.binding_id.slice(0, 8)}`,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (authHeader !== null) headers["Authorization"] = authHeader;
      const response = await fetch(serverUrl.toString(), {
        method: "POST",
        headers,
        body: rpcBody,
        signal: controller.signal,
      });
      if (response.status === 429) {
        return { ok: false, error_class: "RATE_LIMIT", message: "mcp_invoke: 429 rate-limited" };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error_class: "AUTH", message: `mcp_invoke: http ${response.status}` };
      }
      if (!response.ok) {
        return { ok: false, error_class: "PROVIDER_ERROR", message: `mcp_invoke: http ${response.status}` };
      }
      const parsed = (await response.json()) as {
        error?: { code?: number; message?: string };
        result?: { isError?: boolean; content?: unknown };
      };
      // JSON-RPC transport-level error.
      if (parsed.error !== undefined && parsed.error !== null) {
        const m = typeof parsed.error.message === "string" ? parsed.error.message.slice(0, 120) : "rpc error";
        return { ok: false, error_class: "PROVIDER_ERROR", message: `mcp_invoke: ${m}` };
      }
      // MCP tool-level error (result.isError === true).
      if (parsed.result?.isError === true) {
        return { ok: false, error_class: "PROVIDER_ERROR", message: "mcp_invoke: tool returned isError" };
      }
      return {
        ok: true,
        delivery_metadata: Object.freeze({
          provider: "McpInvokeProvider",
          mode: authMode === "NONE_FOR_LOCAL_MOCK" ? "local_mock" : "real",
          tool: toolName,
          binding_id: invocation.binding_id,
          result_summary: summarizeContent(parsed.result?.content),
        }),
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        return { ok: false, error_class: "TIMEOUT", message: `mcp_invoke: timed out after ${DEFAULT_TIMEOUT_MS}ms` };
      }
      const msg = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
      return { ok: false, error_class: "NETWORK", message: `mcp_invoke: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

// Bounded, non-sensitive summary of the MCP tool result content. MCP
// content is an array of typed parts ({type:"text", text} | ...). We
// surface only a short text preview + the part count — never the full
// body — to honor the privacy invariant.
function summarizeContent(content: unknown): string {
  if (!Array.isArray(content)) return "ok";
  const firstText = content.find(
    (c): c is { type: string; text: string } =>
      c !== null && typeof c === "object" && (c as { type?: unknown }).type === "text" &&
      typeof (c as { text?: unknown }).text === "string",
  );
  const preview = firstText ? firstText.text.slice(0, MAX_SUMMARY_CHARS) : "";
  return `parts:${content.length}${preview.length > 0 ? ` preview:${preview}` : ""}`;
}

function fixtureFailureResponse(fixtureKey: FixtureKey): ConnectorResult {
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
