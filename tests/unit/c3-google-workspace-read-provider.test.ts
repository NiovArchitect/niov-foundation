// FILE: c3-google-workspace-read-provider.test.ts
// PURPOSE: Section 4 C3 — unit tests for GoogleWorkspaceReadProvider.
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the GOOGLE_USE_REAL environment gate. No outbound HTTP
//          is ever made by these tests (the env gate stays unset).
// CONNECTS TO:
//   - apps/api/src/services/connector/google-workspace-read.provider.ts
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import { GoogleWorkspaceReadProvider } from "../../apps/api/src/services/connector/google-workspace-read.provider";
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
    binding_id: "00000000-0000-0000-0000-000000000003",
    type: "GOOGLE_WORKSPACE_READ",
    config: Object.freeze(config),
    secret_ref: "GOOGLE_ACCESS_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C3 — GOOGLE_WORKSPACE_READ registry extension", () => {
  it("registers GOOGLE_WORKSPACE_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ.type).toBe(
      "GOOGLE_WORKSPACE_READ",
    );
    expect(CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ.secret_ref_required).toBe(
      true,
    );
    expect(CONNECTOR_REGISTRY.GOOGLE_WORKSPACE_READ.transport).toBe(
      "https-get-bearer-token",
    );
  });

  it("resolves GOOGLE_WORKSPACE_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("GOOGLE_WORKSPACE_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("Google");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("GOOGLE_WORKSPACE_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("GOOGLE")).toBeNull();
  });

  it("getConnectorProviderAsync(GOOGLE_WORKSPACE_READ) returns a GoogleWorkspaceReadProvider", async () => {
    const provider = await getConnectorProviderAsync("GOOGLE_WORKSPACE_READ");
    expect(provider).toBeInstanceOf(GoogleWorkspaceReadProvider);
  });
});

describe("C3 — GoogleWorkspaceReadProvider fixture-mode success", () => {
  it("returns success metadata for calendar.events.list", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe(
        "calendar.events.list",
      );
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["events_count"]).toBe(4);
    }
  });

  it("returns success metadata for drive.files.list", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "drive.files.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("drive.files.list");
      expect(result.delivery_metadata["files_count"]).toBe(6);
      expect(result.delivery_metadata["folders_count"]).toBe(2);
    }
  });

  it("returns success metadata for gmail.messages.list", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "gmail.messages.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("gmail.messages.list");
      expect(result.delivery_metadata["messages_count"]).toBe(7);
    }
  });
});

describe("C3 — GoogleWorkspaceReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.insert" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a write-style operation as VALIDATION", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "gmail.messages.send" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C3 — GoogleWorkspaceReadProvider fixture-mode forced failures", () => {
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
      const provider = new GoogleWorkspaceReadProvider();
      const result = await provider.invoke(
        makeInvocation({
          fixture_key: fixtureKey,
          operation: "calendar.events.list",
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_class).toBe(expectedClass);
      }
    },
  );
});

describe("C3 — GoogleWorkspaceReadProvider environment gate", () => {
  it("does NOT activate real Google API when GOOGLE_USE_REAL is unset", async () => {
    // Default test env: GOOGLE_USE_REAL is unset
    expect(process.env["GOOGLE_USE_REAL"]).toBeUndefined();
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { operation: "calendar.events.list" },
        { use_real: true },
      ),
    );
    // Even with config.use_real=true, the env gate prevents real
    // API access; fixture-mode metadata is returned.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real Google API when config.use_real is false", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const originalEnv = process.env["GOOGLE_USE_REAL"];
    try {
      process.env["GOOGLE_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "drive.files.list" },
          { use_real: false },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["GOOGLE_USE_REAL"];
      } else {
        process.env["GOOGLE_USE_REAL"] = originalEnv;
      }
    }
  });

  it("does NOT activate real Google API when secret_ref env var is missing", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const originalUseReal = process.env["GOOGLE_USE_REAL"];
    try {
      process.env["GOOGLE_USE_REAL"] = "1";
      // GOOGLE_ACCESS_TOKEN_MISSING is not set in env, so the
      // triple gate fails and fixture mode runs.
      const invocation: ConnectorInvocation = {
        binding_id: "00000000-0000-0000-0000-000000000003",
        type: "GOOGLE_WORKSPACE_READ",
        config: Object.freeze({ use_real: true }),
        secret_ref: "GOOGLE_ACCESS_TOKEN_MISSING_DO_NOT_SET",
        payload: Object.freeze({ operation: "gmail.messages.list" }),
      };
      const result = await provider.invoke(invocation);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalUseReal === undefined) {
        delete process.env["GOOGLE_USE_REAL"];
      } else {
        process.env["GOOGLE_USE_REAL"] = originalUseReal;
      }
    }
  });
});

describe("C3 — GoogleWorkspaceReadProvider privacy invariant", () => {
  it("delivery_metadata never carries access token, raw event/file/message content, or response body", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Google OAuth access tokens start with ya29.* per Google docs
      expect(serialized).not.toMatch(/ya29\.[A-Za-z0-9_-]{8,}/);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // Common content markers absent
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/subject/i);
      expect(serialized).not.toMatch(/attendee/i);
      expect(serialized).not.toMatch(/snippet/i);
      expect(serialized).not.toMatch(/filename/i);
    }
  });

  it("error message scrubs access token and authorization header even when fixture forces failure", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        {
          fixture_key: "force-auth-failure",
          operation: "calendar.events.list",
        },
        { use_real: true },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/ya29\.[A-Za-z0-9_-]{8,}/);
      expect(result.message).not.toMatch(/bearer/i);
    }
  });

  it("success result for drive.files.list never echoes file names or content", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "drive.files.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      // Whitelist the keys that delivery_metadata may carry.
      expect(keys.sort()).toEqual([
        "binding_id",
        "files_count",
        "folders_count",
        "mode",
        "operation",
        "provider",
      ]);
    }
  });

  it("success result for gmail.messages.list never echoes message bodies or subjects", async () => {
    const provider = new GoogleWorkspaceReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "gmail.messages.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "messages_count",
        "mode",
        "operation",
        "provider",
        "result_size_estimate",
      ]);
    }
  });
});
