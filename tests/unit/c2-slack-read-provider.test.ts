// FILE: c2-slack-read-provider.test.ts
// PURPOSE: Section 4 C2 — unit tests for SlackReadProvider.
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the SLACK_USE_REAL environment gate. No outbound HTTP
//          is ever made by these tests (the env gate stays unset).
// CONNECTS TO: apps/api/src/services/connector/slack-read.provider.ts,
//              apps/api/src/services/connector/connector.service.ts.

import { describe, expect, it } from "vitest";
import { SlackReadProvider } from "../../apps/api/src/services/connector/slack-read.provider";
import {
  CONNECTOR_REGISTRY,
  getConnectorProviderAsync,
  getConnectorTypeDefinition,
  type ConnectorInvocation,
} from "../../apps/api/src/services/connector/connector.service";

function makeInvocation(
  payload: Record<string, unknown>,
  config: Record<string, unknown> = {},
): ConnectorInvocation {
  return {
    binding_id: "00000000-0000-0000-0000-000000000001",
    type: "SLACK_READ",
    config: Object.freeze(config),
    secret_ref: "SLACK_BOT_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C2 — SLACK_READ registry extension", () => {
  it("registers SLACK_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.SLACK_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.SLACK_READ.type).toBe("SLACK_READ");
    expect(CONNECTOR_REGISTRY.SLACK_READ.secret_ref_required).toBe(true);
    expect(CONNECTOR_REGISTRY.SLACK_READ.transport).toBe("https-get-bearer-token");
  });

  it("resolves SLACK_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("SLACK_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("Slack");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("SLACK_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("")).toBeNull();
  });

  it("getConnectorProviderAsync(SLACK_READ) returns a SlackReadProvider", async () => {
    const provider = await getConnectorProviderAsync("SLACK_READ");
    expect(provider).toBeInstanceOf(SlackReadProvider);
  });
});

describe("C2 — SlackReadProvider fixture-mode success", () => {
  it("returns success metadata for channels.list", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "channels.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("channels.list");
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["channels_count"]).toBe(3);
    }
  });

  it("returns success metadata for users.list", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "users.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("users.list");
      expect(result.delivery_metadata["members_count"]).toBe(8);
    }
  });

  it("returns success metadata for conversations.history with required channel", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "conversations.history", channel: "C123" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("conversations.history");
      expect(result.delivery_metadata["messages_count"]).toBe(5);
    }
  });
});

describe("C2 — SlackReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "chat.postMessage" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects conversations.history without channel as VALIDATION", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "conversations.history" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C2 — SlackReadProvider fixture-mode forced failures", () => {
  const forced: Array<[string, string]> = [
    ["force-auth-failure", "AUTH"],
    ["force-network-failure", "NETWORK"],
    ["force-timeout", "TIMEOUT"],
    ["force-rate-limit", "RATE_LIMIT"],
    ["force-provider-error", "PROVIDER_ERROR"],
    ["force-validation-failure", "VALIDATION"],
    ["force-not-configured", "NOT_CONFIGURED"],
    ["force-disabled", "DISABLED"],
  ];

  it.each(forced)(
    "fixture_key %s maps to error_class %s",
    async (fixtureKey, expectedClass) => {
      const provider = new SlackReadProvider();
      const result = await provider.invoke(
        makeInvocation({ fixture_key: fixtureKey, operation: "channels.list" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("C2 — SlackReadProvider environment gate", () => {
  it("does NOT activate real Slack API when SLACK_USE_REAL is unset", async () => {
    // Default test env: SLACK_USE_REAL is unset
    expect(process.env["SLACK_USE_REAL"]).toBeUndefined();
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "channels.list" }, { use_real: true }),
    );
    // Even with config.use_real=true, the env gate prevents real
    // API access; fixture-mode metadata is returned.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real Slack API when config.use_real is false", async () => {
    const provider = new SlackReadProvider();
    const originalEnv = process.env["SLACK_USE_REAL"];
    try {
      process.env["SLACK_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "channels.list" },
          { use_real: false },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["SLACK_USE_REAL"];
      } else {
        process.env["SLACK_USE_REAL"] = originalEnv;
      }
    }
  });
});

describe("C2 — SlackReadProvider privacy invariant", () => {
  it("delivery_metadata never carries raw bot token, message content, or response body", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "conversations.history", channel: "C456" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Bot tokens start with xoxb- per Slack docs
      expect(serialized).not.toMatch(/xoxb-/);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // Common message-content + user-PII markers absent
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/email/i);
      expect(serialized).not.toMatch(/text/i);
    }
  });

  it("error message scrubs bot token and authorization header even when fixture forces failure", async () => {
    const provider = new SlackReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { fixture_key: "force-auth-failure", operation: "channels.list" },
        { use_real: true },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/xoxb-/);
      expect(result.message).not.toMatch(/bearer/i);
    }
  });
});
