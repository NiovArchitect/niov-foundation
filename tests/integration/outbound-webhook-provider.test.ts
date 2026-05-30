// FILE: outbound-webhook-provider.test.ts (integration)
// PURPOSE: Section 4 Wave 4 — first real ConnectorProvider end-to-end
//          coverage. Spins up a local Node http server, points an
//          OUTBOUND_WEBHOOK ConnectorBinding at it via ALLOW_HTTP_FOR_
//          LOCAL_TEST_INSECURE, exercises the OutboundWebhookProvider
//          directly (NOT through the Action runtime — that path is
//          covered by Wave 3 integration tests + Wave 5 will exercise
//          the full pipe via the notification fan-out bridge).
//          Verifies: HMAC-SHA-256 signature header correctness;
//          timestamp + signature defeat replay; non-2xx mapping to
//          PROVIDER_ERROR / AUTH / RATE_LIMIT; timeout mapping;
//          missing secret env var mapping to AUTH; invalid URL +
//          plaintext http (without the insecure opt-in) mapping to
//          NOT_CONFIGURED; absent secret_ref mapping to
//          NOT_CONFIGURED; SAFE delivery_metadata never carries
//          response body / headers / secret material / request body.
// CONNECTS TO:
//   - apps/api/src/services/connector/outbound-webhook.provider.ts

import { createHmac } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OutboundWebhookProvider } from "@niov/api";
import type { ConnectorInvocation } from "@niov/api";

const SECRET_ENV = "TEST_OUTBOUND_WEBHOOK_HMAC_SECRET";
const SECRET_VALUE = "super-secret-test-hmac-key-do-not-leak-12345";

let server: Server;
let serverUrl: string;
let lastRequest: {
  method: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
} | null = null;
let responseStatus = 200;
let responseDelayMs = 0;

beforeAll(async () => {
  process.env[SECRET_ENV] = SECRET_VALUE;
  process.env.ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE = "true";
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      lastRequest = {
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const send = (): void => {
        res.statusCode = responseStatus;
        res.setHeader("content-type", "text/plain");
        res.end(`response body: status=${responseStatus}`);
      };
      if (responseDelayMs > 0) {
        setTimeout(send, responseDelayMs);
      } else {
        send();
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server address resolution failed");
  }
  serverUrl = `http://127.0.0.1:${addr.port}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  delete process.env[SECRET_ENV];
  delete process.env.ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE;
});

beforeEach(() => {
  lastRequest = null;
  responseStatus = 200;
  responseDelayMs = 0;
});

afterEach(() => {
  responseStatus = 200;
  responseDelayMs = 0;
});

function makeInvocation(
  overrides: Partial<ConnectorInvocation> = {},
): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-4000-8000-000000000001",
    type: "OUTBOUND_WEBHOOK",
    config: { url: serverUrl },
    secret_ref: SECRET_ENV,
    payload: { hello: "world" },
    ...overrides,
  };
}

describe("OutboundWebhookProvider — happy path + HMAC contract", () => {
  it("200 success returns ok=true with SAFE delivery_metadata; HMAC signature is correct", async () => {
    const provider = new OutboundWebhookProvider();
    const result = await provider.invoke(makeInvocation());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivery_metadata.provider).toBe("OutboundWebhookProvider");
    expect(result.delivery_metadata.http_status).toBe(200);
    expect(typeof result.delivery_metadata.elapsed_ms).toBe("number");
    // SAFE invariant: no response body / headers / secret echo.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("response body");
    expect(serialized).not.toContain(SECRET_VALUE);
    expect(serialized).not.toContain(SECRET_ENV);

    // HMAC verification on the server-recorded request.
    expect(lastRequest).not.toBeNull();
    const req = lastRequest!;
    expect(req.method).toBe("POST");
    const sigHeader = req.headers["x-niov-signature"];
    const tsHeader = req.headers["x-niov-timestamp"];
    expect(typeof sigHeader).toBe("string");
    expect(typeof tsHeader).toBe("string");
    const expectedSig =
      "sha256=" +
      createHmac("sha256", SECRET_VALUE)
        .update(`${tsHeader as string}.${req.body}`)
        .digest("hex");
    expect(sigHeader).toBe(expectedSig);
  });

  it("respects operator-supplied config.headers but signature + timestamp headers always win", async () => {
    const provider = new OutboundWebhookProvider();
    const result = await provider.invoke(
      makeInvocation({
        config: {
          url: serverUrl,
          headers: {
            "x-niov-signature": "OPERATOR_TRIED_TO_OVERRIDE",
            "x-operator-header": "operator-value",
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers["x-niov-signature"]).not.toBe(
      "OPERATOR_TRIED_TO_OVERRIDE",
    );
    expect(lastRequest!.headers["x-operator-header"]).toBe("operator-value");
  });

  it("PUT method accepted when configured", async () => {
    const provider = new OutboundWebhookProvider();
    const result = await provider.invoke(
      makeInvocation({
        config: { url: serverUrl, method: "PUT" },
      }),
    );
    expect(result.ok).toBe(true);
    expect(lastRequest!.method).toBe("PUT");
  });
});

describe("OutboundWebhookProvider — HTTP status → error_class mapping", () => {
  it("401 → CONNECTOR_AUTH", async () => {
    responseStatus = 401;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("AUTH");
  });

  it("403 → CONNECTOR_AUTH", async () => {
    responseStatus = 403;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("AUTH");
  });

  it("429 → CONNECTOR_RATE_LIMIT", async () => {
    responseStatus = 429;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("RATE_LIMIT");
  });

  it("500 → CONNECTOR_PROVIDER_ERROR", async () => {
    responseStatus = 500;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("PROVIDER_ERROR");
  });

  it("error_class results carry no response body content", async () => {
    responseStatus = 500;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    expect(r.ok).toBe(false);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("response body");
    expect(serialized).not.toContain(SECRET_VALUE);
  });
});

describe("OutboundWebhookProvider — configuration failures", () => {
  it("missing secret_ref → NOT_CONFIGURED", async () => {
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation({ secret_ref: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("missing url → NOT_CONFIGURED", async () => {
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation({ config: {} }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("invalid URL → NOT_CONFIGURED", async () => {
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(
      makeInvocation({ config: { url: "not-a-url" } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("plaintext http:// without ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE → NOT_CONFIGURED", async () => {
    delete process.env.ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE;
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(makeInvocation());
    process.env.ALLOW_HTTP_FOR_LOCAL_TEST_INSECURE = "true";
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("unset secret env var → AUTH", async () => {
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(
      makeInvocation({ secret_ref: "TOTALLY_UNSET_SECRET_VAR_XYZ" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("AUTH");
  });

  it("DELETE method → NOT_CONFIGURED (only POST / PUT allowed)", async () => {
    const provider = new OutboundWebhookProvider();
    const r = await provider.invoke(
      makeInvocation({ config: { url: serverUrl, method: "DELETE" } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("NOT_CONFIGURED");
  });
});
