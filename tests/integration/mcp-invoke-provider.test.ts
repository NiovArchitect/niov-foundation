// FILE: mcp-invoke-provider.test.ts (integration)
// PURPOSE: Work-OS Slice F — McpInvokeProvider real MCP JSON-RPC 2.0
//          tools/call round-trip against a LOCAL MOCK MCP server. This is
//          the honest "MCP invoke works without an external server under
//          NONE_FOR_LOCAL_MOCK" proof: a real node:http server speaks the
//          MCP wire protocol and the provider drives it end-to-end. Lives
//          in the integration tier (not unit) because it performs a real
//          localhost network round-trip — the unit tier's shared
//          singleFork process leaks a global `fetch` stub from other unit
//          files that breaks real fetches; the integration tier is clean.
//          The no-network guard/fixture behaviors are covered by the unit
//          test tests/unit/mcp-invoke-provider.test.ts.
// CONNECTS TO:
//   - apps/api/src/services/connector-rails/mcp-invoke.provider.ts
import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { McpInvokeProvider } from "../../apps/api/src/services/connector-rails/mcp-invoke.provider.js";
import type { ConnectorInvocation } from "../../apps/api/src/services/connector/connector.service.js";

type MockMode = "ok" | "tool_error" | "rpc_error";

async function startMockMcp(mode: MockMode): Promise<{ server: Server; url: string; lastRpc: () => unknown }> {
  let lastRpc: unknown = null;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        lastRpc = JSON.parse(raw);
      } catch {
        lastRpc = null;
      }
      res.setHeader("content-type", "application/json");
      res.setHeader("connection", "close");
      if (mode === "rpc_error") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: "x", error: { code: -32601, message: "method not found" } }));
        return;
      }
      if (mode === "tool_error") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { isError: true, content: [{ type: "text", text: "boom" }] } }));
        return;
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { content: [{ type: "text", text: "calibration recorded" }] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  return { server, url: `http://127.0.0.1:${port}/mcp`, lastRpc: () => lastRpc };
}

function inv(url: string): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-4000-8000-000000000002",
    type: "MCP_INVOKE",
    config: { server_url: url, tool_name: "record_calibration", auth_mode: "NONE_FOR_LOCAL_MOCK" },
    secret_ref: null,
    payload: { arguments: { work_title: "Orion telemetry calibration" } },
  };
}

describe("McpInvokeProvider — local mock MCP server (real JSON-RPC round-trip)", () => {
  it("invokes tools/call and returns a bounded result summary (mode local_mock)", async () => {
    const mock = await startMockMcp("ok");
    try {
      const r = await new McpInvokeProvider().invoke(inv(mock.url));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.delivery_metadata["mode"]).toBe("local_mock");
        expect(r.delivery_metadata["tool"]).toBe("record_calibration");
        expect(String(r.delivery_metadata["result_summary"])).toContain("calibration recorded");
      }
      const rpc = mock.lastRpc() as { jsonrpc?: string; method?: string; params?: { name?: string } };
      expect(rpc.jsonrpc).toBe("2.0");
      expect(rpc.method).toBe("tools/call");
      expect(rpc.params?.name).toBe("record_calibration");
    } finally {
      await new Promise<void>((resolve) => mock.server.close(() => resolve()));
    }
  });

  it("maps a JSON-RPC transport error to PROVIDER_ERROR", async () => {
    const mock = await startMockMcp("rpc_error");
    try {
      const r = await new McpInvokeProvider().invoke(inv(mock.url));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_class).toBe("PROVIDER_ERROR");
    } finally {
      await new Promise<void>((resolve) => mock.server.close(() => resolve()));
    }
  });

  it("maps a tool-level isError result to PROVIDER_ERROR", async () => {
    const mock = await startMockMcp("tool_error");
    try {
      const r = await new McpInvokeProvider().invoke(inv(mock.url));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_class).toBe("PROVIDER_ERROR");
    } finally {
      await new Promise<void>((resolve) => mock.server.close(() => resolve()));
    }
  });
});
