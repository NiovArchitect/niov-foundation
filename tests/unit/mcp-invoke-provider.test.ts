// FILE: mcp-invoke-provider.test.ts (unit)
// PURPOSE: Work-OS Slice F — McpInvokeProvider no-network contract: the
//          defensive last-hop McpToolPolicy outcome check (BLOCK refused
//          as DISABLED, never reaching the server), the https-required
//          guard for non-mock auth modes, the resolvable-secret_ref guard,
//          and the fixture-failure key mapping. The REAL JSON-RPC
//          round-trip against a local mock MCP server lives in the
//          integration tier (tests/integration/mcp-invoke-provider.test.ts)
//          because the unit tier's shared singleFork process leaks a global
//          `fetch` stub from other unit files that breaks real fetches.
// CONNECTS TO:
//   - apps/api/src/services/connector-rails/mcp-invoke.provider.ts
import { describe, expect, it, vi } from "vitest";
import { McpInvokeProvider } from "../../apps/api/src/services/connector-rails/mcp-invoke.provider.js";
import type { ConnectorInvocation } from "../../apps/api/src/services/connector/connector.service.js";

function inv(overrides: Partial<ConnectorInvocation> = {}): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-4000-8000-000000000002",
    type: "MCP_INVOKE",
    config: { server_url: "http://127.0.0.1:1/mcp", tool_name: "record_calibration", auth_mode: "NONE_FOR_LOCAL_MOCK" },
    secret_ref: null,
    payload: { arguments: { work_title: "Orion telemetry calibration" } },
    ...overrides,
  };
}

describe("McpInvokeProvider — governance + config guards (no network)", () => {
  it("refuses a forbidding McpToolPolicy outcome (BLOCK) as DISABLED, never reaching the server", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await new McpInvokeProvider().invoke(
      inv({ config: { server_url: "http://127.0.0.1:1/mcp", tool_name: "t", auth_mode: "NONE_FOR_LOCAL_MOCK", policy_outcome: "BLOCK" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requires https:// for non-mock auth modes", async () => {
    const r = await new McpInvokeProvider().invoke(
      inv({ config: { server_url: "http://evil.test/mcp", tool_name: "t", auth_mode: "API_KEY" }, secret_ref: "X" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("requires a resolvable secret_ref for non-mock auth modes", async () => {
    delete process.env.MISSING_MCP_SECRET;
    const r = await new McpInvokeProvider().invoke(
      inv({ config: { server_url: "https://mcp.test/rpc", tool_name: "t", auth_mode: "API_KEY" }, secret_ref: "MISSING_MCP_SECRET" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("NOT_CONFIGURED");
  });

  it("requires config.tool_name", async () => {
    const r = await new McpInvokeProvider().invoke(
      inv({ config: { server_url: "http://127.0.0.1:1/mcp", auth_mode: "NONE_FOR_LOCAL_MOCK" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe("VALIDATION");
  });

  it("maps the fixture-failure keys", async () => {
    const cases: Array<[string, string]> = [
      ["force-auth-failure", "AUTH"],
      ["force-provider-error", "PROVIDER_ERROR"],
      ["force-timeout", "TIMEOUT"],
      ["force-disabled", "DISABLED"],
    ];
    for (const [key, cls] of cases) {
      const r = await new McpInvokeProvider().invoke(inv({ payload: { fixture_key: key } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_class).toBe(cls);
    }
  });
});
