// FILE: outbound-webhook.provider.ts
// PURPOSE: Section 4 Wave 4 — first real ConnectorProvider. HTTPS POST
//          to a per-binding-configured URL with HMAC-SHA-256 request
//          signing using the secret_ref-resolved env-var value. Zero
//          provider-SDK dependency; pure node:https + node:crypto.
//          Replaces the FixtureBasedConnectorProvider in the
//          getConnectorProvider("OUTBOUND_WEBHOOK") branch.
// CONNECTS TO:
//   - apps/api/src/services/connector/connector.service.ts (provider
//     interface; ConnectorInvocation / ConnectorResult contracts)
//   - apps/api/src/services/action/handlers.ts (INVOKE_CONNECTOR
//     handler routes through getConnectorProvider; Wave 4 makes the
//     OUTBOUND_WEBHOOK branch return this class)
//   - Wave 5 NotificationService external fan-out bridge (consumes
//     INVOKE_CONNECTOR with binding_id of an OUTBOUND_WEBHOOK
//     binding)
//
// PRIVACY INVARIANT:
//   - The resolved secret value (process.env[secret_ref]) is used to
//     sign the request body via HMAC-SHA-256; it is NEVER logged,
//     NEVER echoed into delivery_metadata, NEVER returned in a
//     ConnectorResult, NEVER attached to errors. Sign-and-forget.
//   - delivery_metadata carries timing + HTTP status code + an
//     attempts counter ONLY. NEVER response body, NEVER response
//     headers, NEVER request body.
//   - Non-2xx responses return a closed CONNECTOR_PROVIDER_ERROR /
//     CONNECTOR_AUTH / CONNECTOR_RATE_LIMIT error_class without any
//     raw body content. Network failures map to CONNECTOR_NETWORK;
//     timeouts to CONNECTOR_TIMEOUT.
//
// PRODUCTION POSTURE:
//   - URL is required + must be https:// (no plaintext http://
//     except for an explicit "ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE"
//     env var; Wave 4 tests opt in via that env var so the local
//     Fastify destination route can serve over http://).
//   - DEFAULT_TIMEOUT_MS = 10_000; retry is the Action runtime's
//     job (RETRY_BUDGET per ADR-0057 §11); a single invoke = a
//     single HTTP request.
//   - HMAC signature header: X-NIOV-Signature: sha256=<hex>.
//   - Timestamp header: X-NIOV-Timestamp: <ms epoch>. Signature
//     covers `${timestamp}.${rawBody}` to defeat replay.

import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
} from "./connector.service.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const SIGNATURE_HEADER = "x-niov-signature";
const TIMESTAMP_HEADER = "x-niov-timestamp";
const ALLOW_HTTP_ENV = "ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE";

// WHAT: HTTP method allowlist for outbound-webhook calls.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: Wave 4 supports POST + PUT only. GET / DELETE / PATCH / HEAD
//      are forward-substrate (most webhook surfaces are write-tier
//      POST or PUT; the rare GET case lands behind its own QLOCK).
const ALLOWED_METHODS = new Set(["POST", "PUT"]);

// WHAT: The OutboundWebhookProvider — Wave 4's real implementation.
// INPUT: ConnectorInvocation.
// OUTPUT: Promise<ConnectorResult>.
// WHY: Production-grade real provider for the OUTBOUND_WEBHOOK
//      connector type. Pure node:https + node:crypto; no axios /
//      undici / openai-style SDK. The HMAC-SHA-256 signing pattern
//      is the most-widely-supported webhook auth pattern (Stripe /
//      Slack / GitHub all use this exact shape).
export class OutboundWebhookProvider implements ConnectorProvider {
  async invoke(invocation: ConnectorInvocation): Promise<ConnectorResult> {
    // Step 1 — validate the per-binding config.
    const cfg = invocation.config;
    const url = cfg["url"];
    if (typeof url !== "string" || url.length === 0) {
      return {
        ok: false,
        error_class: "NOT_CONFIGURED",
        message: "binding config missing required 'url' string",
      };
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        ok: false,
        error_class: "NOT_CONFIGURED",
        message: "binding config 'url' is not a valid URL",
      };
    }
    const allowHttp = process.env[ALLOW_HTTP_ENV] === "true";
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
      return {
        ok: false,
        error_class: "NOT_CONFIGURED",
        message:
          "binding config 'url' must use https:// (http:// is allowed only when ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE=true)",
      };
    }

    // Step 2 — validate / default method.
    let method = "POST";
    const cfgMethod = cfg["method"];
    if (typeof cfgMethod === "string") {
      const upper = cfgMethod.toUpperCase();
      if (!ALLOWED_METHODS.has(upper)) {
        return {
          ok: false,
          error_class: "NOT_CONFIGURED",
          message: `binding config 'method' must be one of POST | PUT (got ${cfgMethod})`,
        };
      }
      method = upper;
    }

    // Step 3 — validate secret_ref + resolve.
    if (invocation.secret_ref === null) {
      return {
        ok: false,
        error_class: "NOT_CONFIGURED",
        message: "OUTBOUND_WEBHOOK requires a secret_ref env-var name",
      };
    }
    const secretValue = process.env[invocation.secret_ref];
    if (typeof secretValue !== "string" || secretValue.length === 0) {
      return {
        ok: false,
        error_class: "AUTH",
        message: `secret_ref env var ${invocation.secret_ref} is not set or empty`,
      };
    }

    // Step 4 — serialize the body + compute HMAC over
    // `${timestamp}.${rawBody}` to defeat replay.
    const rawBody = JSON.stringify(invocation.payload ?? {});
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secretValue)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    // Step 5 — dispatch.
    const start = Date.now();
    try {
      const res = await dispatchHttpRequest({
        url: parsed,
        method,
        rawBody,
        signatureHeader: `sha256=${signature}`,
        timestampHeader: timestamp,
        // Allow operator-supplied headers from config.headers (only
        // string values; non-string entries are silently dropped to
        // keep the typing contract honest). Signature + timestamp
        // headers always win on collision.
        operatorHeaders: extractStringHeaders(cfg["headers"]),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
      const elapsedMs = Date.now() - start;
      // Map HTTP status codes to error_class. 2xx is the only
      // success contract; everything else is a discriminated
      // failure.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return {
          ok: true,
          delivery_metadata: Object.freeze({
            provider: "OutboundWebhookProvider",
            type: invocation.type,
            binding_id: invocation.binding_id,
            http_status: res.statusCode,
            elapsed_ms: elapsedMs,
          }),
        };
      }
      const cls = errorClassForStatus(res.statusCode);
      return {
        ok: false,
        error_class: cls,
        message: `webhook returned HTTP ${res.statusCode}`,
      };
    } catch (err) {
      const errAny = err as { code?: unknown; message?: unknown };
      if (errAny.code === "TIMEOUT") {
        return {
          ok: false,
          error_class: "TIMEOUT",
          message: `webhook timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        };
      }
      const msg =
        typeof errAny.message === "string" ? errAny.message : "network error";
      return {
        ok: false,
        error_class: "NETWORK",
        message: msg,
      };
    }
  }
}

// WHAT: Extract a string-keyed string-valued header bag from an
//        opaque config field.
// INPUT: An unknown value (typically cfg.headers).
// OUTPUT: A Record<string, string>.
// WHY: Defense in depth — anything other than a plain
//      `Record<string, string>` is silently dropped so a
//      misconfigured binding cannot crash the dispatch path.
function extractStringHeaders(raw: unknown): Record<string, string> {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string") out[k] = v;
  }
  return out;
}

// WHAT: Map an HTTP status code to a ConnectorResult error_class.
// INPUT: HTTP status code.
// OUTPUT: An error_class literal.
// WHY: Centralizes the mapping so the dispatch code stays simple.
//      401 / 403 → AUTH; 429 → RATE_LIMIT; everything else
//      non-2xx → PROVIDER_ERROR.
function errorClassForStatus(
  status: number,
): "AUTH" | "RATE_LIMIT" | "PROVIDER_ERROR" {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  return "PROVIDER_ERROR";
}

// WHAT: One-shot HTTP request dispatch. Returns the status code on
//        any HTTP response (including non-2xx). Throws { code:
//        "TIMEOUT" } on timeout + { code: "NETWORK" } on socket
//        errors.
// INPUT: dispatch args.
// OUTPUT: Promise<{ statusCode: number }>.
// WHY: Pure node:https + node:http; no external dep. Body is
//      streamed-in via res.on("data") but we discard everything —
//      the privacy invariant forbids carrying any response body
//      content into the result.
function dispatchHttpRequest(args: {
  url: URL;
  method: string;
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  operatorHeaders: Record<string, string>;
  timeoutMs: number;
}): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const isHttps = args.url.protocol === "https:";
    const lib = isHttps ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(args.rawBody, "utf8")),
      ...args.operatorHeaders,
      // Signature + timestamp headers always win — operators cannot
      // override these.
      [SIGNATURE_HEADER]: args.signatureHeader,
      [TIMESTAMP_HEADER]: args.timestampHeader,
    };
    const req = lib(
      {
        protocol: args.url.protocol,
        hostname: args.url.hostname,
        port:
          args.url.port.length > 0
            ? Number(args.url.port)
            : isHttps
              ? 443
              : 80,
        path: `${args.url.pathname}${args.url.search}`,
        method: args.method,
        headers,
      },
      (res) => {
        // Drain the response body — we never read it.
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0 });
        });
      },
    );
    req.setTimeout(args.timeoutMs, () => {
      req.destroy(new Error("TIMEOUT_DESTROY"));
      reject({ code: "TIMEOUT" });
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.message === "TIMEOUT_DESTROY") return; // handled above
      reject(err);
    });
    req.write(args.rawBody);
    req.end();
  });
}
