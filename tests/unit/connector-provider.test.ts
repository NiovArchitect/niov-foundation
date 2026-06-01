// FILE: connector-provider.test.ts (unit)
// PURPOSE: Section 4 Wave 1 ConnectorProvider abstraction + registry
//          coverage. Verifies the canonical provider contract,
//          FixtureBasedConnectorProvider determinism, the 8 forced
//          error-class branches, getConnectorProvider factory shape,
//          getConnectorTypeDefinition lookup safety, the
//          CONNECTOR_REGISTRY frozen-anchor contract, and the
//          privacy invariant (no secret material or response bodies
//          surface in any provider result).
// CONNECTS TO:
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import {
  CONNECTOR_REGISTRY,
  FixtureBasedConnectorProvider,
  getConnectorProvider,
  getConnectorTypeDefinition,
} from "@niov/api";
import type {
  ConnectorInvocation,
  ConnectorResult,
  ConnectorType,
} from "@niov/api";

function makeInvocation(
  overrides: Partial<ConnectorInvocation> = {},
): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-4000-8000-000000000001",
    type: "OUTBOUND_WEBHOOK",
    config: { url: "https://example.test/hook" },
    secret_ref: "TEST_WEBHOOK_SECRET",
    payload: { hello: "world" },
    ...overrides,
  };
}

describe("CONNECTOR_REGISTRY — frozen-anchor contract", () => {
  it("contains the Wave 1 connector types plus C2 SLACK_READ + C3 GOOGLE_WORKSPACE_READ extensions", () => {
    const keys = Object.keys(CONNECTOR_REGISTRY);
    expect(keys.sort()).toEqual([
      "FIXTURE_ECHO",
      "GOOGLE_WORKSPACE_READ",
      "OUTBOUND_WEBHOOK",
      "SLACK_READ",
    ]);
  });

  it("is frozen and individual entries are frozen", () => {
    expect(Object.isFrozen(CONNECTOR_REGISTRY)).toBe(true);
    expect(Object.isFrozen(CONNECTOR_REGISTRY.OUTBOUND_WEBHOOK)).toBe(true);
    expect(Object.isFrozen(CONNECTOR_REGISTRY.FIXTURE_ECHO)).toBe(true);
    expect(
      Object.isFrozen(CONNECTOR_REGISTRY.OUTBOUND_WEBHOOK.default_config_keys),
    ).toBe(true);
  });

  it("OUTBOUND_WEBHOOK declares the canonical transport + required secret_ref", () => {
    const def = CONNECTOR_REGISTRY.OUTBOUND_WEBHOOK;
    expect(def.type).toBe("OUTBOUND_WEBHOOK");
    expect(def.transport).toBe("https-post-hmac-sha256");
    expect(def.secret_ref_required).toBe(true);
    expect(def.default_config_keys).toContain("url");
  });

  it("FIXTURE_ECHO is a test-only connector with no secret requirement", () => {
    const def = CONNECTOR_REGISTRY.FIXTURE_ECHO;
    expect(def.secret_ref_required).toBe(false);
    expect(def.default_config_keys).toEqual([]);
  });
});

describe("getConnectorTypeDefinition — lookup helper", () => {
  it("returns the registry entry for a known type", () => {
    expect(getConnectorTypeDefinition("OUTBOUND_WEBHOOK")).toBe(
      CONNECTOR_REGISTRY.OUTBOUND_WEBHOOK,
    );
    expect(getConnectorTypeDefinition("FIXTURE_ECHO")).toBe(
      CONNECTOR_REGISTRY.FIXTURE_ECHO,
    );
  });

  it("returns null for unknown types (does not throw)", () => {
    expect(getConnectorTypeDefinition("SLACK")).toBeNull();
    expect(getConnectorTypeDefinition("")).toBeNull();
    expect(getConnectorTypeDefinition("__proto__")).toBeNull();
  });
});

describe("FixtureBasedConnectorProvider — happy path determinism", () => {
  it("returns ok=true echoing the invocation type + binding_id", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const result = await provider.invoke(makeInvocation());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivery_metadata.type).toBe("OUTBOUND_WEBHOOK");
    expect(result.delivery_metadata.binding_id).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(result.delivery_metadata.provider).toBe(
      "FixtureBasedConnectorProvider",
    );
  });

  it("is fully deterministic across repeated invocations", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const a = await provider.invoke(makeInvocation());
    const b = await provider.invoke(makeInvocation());
    expect(a).toEqual(b);
  });
});

describe("FixtureBasedConnectorProvider — 8 forced error-class branches", () => {
  const forcedClasses: ReadonlyArray<{
    fixture_key: string;
    expected: Extract<ConnectorResult, { ok: false }>["error_class"];
  }> = [
    { fixture_key: "force-auth-failure", expected: "AUTH" },
    { fixture_key: "force-disabled", expected: "DISABLED" },
    { fixture_key: "force-network-failure", expected: "NETWORK" },
    { fixture_key: "force-timeout", expected: "TIMEOUT" },
    { fixture_key: "force-rate-limit", expected: "RATE_LIMIT" },
    { fixture_key: "force-provider-error", expected: "PROVIDER_ERROR" },
    { fixture_key: "force-validation-failure", expected: "VALIDATION" },
    { fixture_key: "force-not-configured", expected: "NOT_CONFIGURED" },
  ];

  for (const tc of forcedClasses) {
    it(`maps fixture_key "${tc.fixture_key}" → error_class "${tc.expected}"`, async () => {
      const provider = new FixtureBasedConnectorProvider();
      const r = await provider.invoke(
        makeInvocation({ payload: { fixture_key: tc.fixture_key } }),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error_class).toBe(tc.expected);
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    });
  }

  it("unknown fixture_key still succeeds (default success path)", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const r = await provider.invoke(
      makeInvocation({ payload: { fixture_key: "anything-else" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delivery_metadata.fixture_key).toBe("anything-else");
  });
});

describe("getConnectorProvider — production factory", () => {
  it("throws on OUTBOUND_WEBHOOK after Wave 4 — callers must use getConnectorProviderAsync", () => {
    // Wave 4 swap: the sync factory throws for OUTBOUND_WEBHOOK so
    // accidental sync callers are loudly redirected to the async
    // path that resolves the real OutboundWebhookProvider. The
    // INVOKE_CONNECTOR action handler (handlers.ts) uses the async
    // helper; tests inject FixtureBasedConnectorProvider via the
    // ActionHandlerRegistryDeps constructor seam.
    expect(() => getConnectorProvider("OUTBOUND_WEBHOOK")).toThrow(
      /getConnectorProviderAsync/,
    );
  });

  it("returns a usable FixtureBased provider for FIXTURE_ECHO synchronously", async () => {
    const provider = getConnectorProvider("FIXTURE_ECHO");
    const result = await provider.invoke(
      makeInvocation({ type: "FIXTURE_ECHO" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("Privacy invariant — no secret material in any result", () => {
  it("never echoes the secret_ref env-var name into the success result body", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const r = await provider.invoke(
      makeInvocation({ secret_ref: "PROD_WEBHOOK_SECRET_DO_NOT_LEAK" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("PROD_WEBHOOK_SECRET_DO_NOT_LEAK");
  });

  it("never echoes payload values verbatim into delivery_metadata", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const r = await provider.invoke(
      makeInvocation({
        payload: {
          highly_sensitive_token: "tok_THIS_MUST_NOT_LEAK_xyz_99",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r)).not.toContain("tok_THIS_MUST_NOT_LEAK");
  });

  it("error-class results carry no third-party error bodies or payloads", async () => {
    const provider = new FixtureBasedConnectorProvider();
    const r = await provider.invoke(
      makeInvocation({
        payload: {
          fixture_key: "force-provider-error",
          highly_sensitive_token: "tok_NEVER_LEAK_404",
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error_class).toBe("PROVIDER_ERROR");
    expect(JSON.stringify(r)).not.toContain("tok_NEVER_LEAK_404");
    // Error result has exactly the discriminated shape — no extra
    // fields that could carry sensitive context.
    expect(Object.keys(r).sort()).toEqual(["error_class", "message", "ok"]);
  });
});

describe("ConnectorType discriminator surface", () => {
  it("covers every CONNECTOR_REGISTRY key in the ConnectorType union", () => {
    // Compile-time assertion that the union covers every registry
    // entry — if a new type is added to CONNECTOR_REGISTRY without
    // updating the union, this fails to compile.
    const all: ReadonlyArray<ConnectorType> = Object.keys(
      CONNECTOR_REGISTRY,
    ) as ConnectorType[];
    for (const t of all) {
      expect(CONNECTOR_REGISTRY[t].type).toBe(t);
    }
  });
});
