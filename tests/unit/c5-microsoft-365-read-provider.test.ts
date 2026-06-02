// FILE: c5-microsoft-365-read-provider.test.ts
// PURPOSE: Section 4 C5 — unit tests for Microsoft365ReadProvider.
//          Closes the 6/6 connector matrix at RUNTIME_READY by
//          completing the Workspace / Knowledge family at 2/2
//          RUNTIME_READY (Google Workspace LIVE; Microsoft 365
//          this PR).
//          Verifies the registry extension + fixture-mode success
//          + fixture-mode forced-failure paths + payload validation
//          + the MS365_USE_REAL environment gate + privacy invariant.
//          No outbound HTTP is ever made by these tests (the env
//          gate stays unset).
// RULE 21 RESEARCH ARC LINEAGE:
//   - Microsoft Graph v1.0 stable base path
//     https://graph.microsoft.com/v1.0
//   - OAuth 2.0 access token from Azure Active Directory; both
//     delegated and application permissions land as Bearer
//     tokens at the request boundary
//   - $select query parameter restricts response field set —
//     C5 pins minimal field sets so subject lines / body
//     content / file names / attendee email PII cannot
//     accidentally surface in real-mode response parsing
//   - $top query parameter bounds page size (max 999; C5
//     pins 50 for symmetry with C2/C3/C4-A/C4-B/C-GitHub)
//   - 401 + 403 both surface as AUTH at this provider boundary
//     (token invalid OR token-missing-scope)
//   - Microsoft Graph response uses `value` as the array
//     wrapper per OData v4 (distinct from Google Calendar's
//     `items`)
//   - tenant_id config field carries the Azure AD tenant
//     identifier (GUID format); analogous role to C3
//     workspace_domain or C4-A cloud_id
//   - docs/connector-readiness/microsoft-365.json catalog item
//     first_slice_recommendation: C5 Microsoft 365 read-first
//     connector runtime
// CONNECTS TO:
//   - apps/api/src/services/connector/microsoft-365-read.provider.ts
//   - apps/api/src/services/connector/connector.service.ts

import { describe, expect, it } from "vitest";
import { Microsoft365ReadProvider } from "../../apps/api/src/services/connector/microsoft-365-read.provider";
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
    binding_id: "00000000-0000-0000-0000-000000000007",
    type: "MICROSOFT_365_READ",
    config: Object.freeze(config),
    secret_ref: "MS365_ACCESS_TOKEN_TEST",
    payload: Object.freeze(payload),
  };
}

describe("C5 — MICROSOFT_365_READ registry extension — closes 6/6 connector matrix", () => {
  it("registers MICROSOFT_365_READ in CONNECTOR_REGISTRY", () => {
    expect(CONNECTOR_REGISTRY.MICROSOFT_365_READ).toBeDefined();
    expect(CONNECTOR_REGISTRY.MICROSOFT_365_READ.type).toBe(
      "MICROSOFT_365_READ",
    );
    expect(CONNECTOR_REGISTRY.MICROSOFT_365_READ.secret_ref_required).toBe(
      true,
    );
    expect(CONNECTOR_REGISTRY.MICROSOFT_365_READ.transport).toBe(
      "https-get-bearer-token",
    );
    expect(
      CONNECTOR_REGISTRY.MICROSOFT_365_READ.default_config_keys,
    ).toContain("use_real");
    expect(
      CONNECTOR_REGISTRY.MICROSOFT_365_READ.default_config_keys,
    ).toContain("tenant_id");
  });

  it("resolves MICROSOFT_365_READ via getConnectorTypeDefinition", () => {
    const def = getConnectorTypeDefinition("MICROSOFT_365_READ");
    expect(def).not.toBeNull();
    expect(def?.display_name).toContain("Microsoft 365");
  });

  it("returns null for unknown candidate strings", () => {
    expect(getConnectorTypeDefinition("MICROSOFT_365_WRITE")).toBeNull();
    expect(getConnectorTypeDefinition("MICROSOFT_365")).toBeNull();
    expect(getConnectorTypeDefinition("OFFICE_365_READ")).toBeNull();
  });

  it("getConnectorProviderAsync(MICROSOFT_365_READ) returns a Microsoft365ReadProvider", async () => {
    const provider = await getConnectorProviderAsync("MICROSOFT_365_READ");
    expect(provider).toBeInstanceOf(Microsoft365ReadProvider);
  });
});

describe("C5 — Microsoft365ReadProvider fixture-mode success", () => {
  it("returns success metadata for calendar.events.list", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe(
        "calendar.events.list",
      );
      expect(result.delivery_metadata["mode"]).toBe("fixture");
      expect(result.delivery_metadata["events_count"]).toBe(5);
      expect(result.delivery_metadata["recurring_events_count"]).toBe(2);
    }
  });

  it("returns success metadata for drive.items.list", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "drive.items.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe("drive.items.list");
      expect(result.delivery_metadata["items_count"]).toBe(8);
      expect(result.delivery_metadata["folders_count"]).toBe(3);
    }
  });

  it("returns success metadata for mail.messages.list", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "mail.messages.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["operation"]).toBe(
        "mail.messages.list",
      );
      expect(result.delivery_metadata["messages_count"]).toBe(12);
    }
  });
});

describe("C5 — Microsoft365ReadProvider validation", () => {
  it("rejects an unknown operation as VALIDATION", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.create" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects an empty payload as VALIDATION", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(makeInvocation({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a write-style operation (mail.messages.send) as VALIDATION", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "mail.messages.send" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a file-upload operation (drive.items.upload) as VALIDATION", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "drive.items.upload" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });

  it("rejects a Teams read operation (teams.list) as VALIDATION at C5 (Teams forward-substrate)", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "teams.list" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_class).toBe("VALIDATION");
    }
  });
});

describe("C5 — Microsoft365ReadProvider fixture-mode forced failures", () => {
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
      const provider = new Microsoft365ReadProvider();
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

describe("C5 — Microsoft365ReadProvider environment gate", () => {
  it("does NOT activate real Microsoft Graph API when MS365_USE_REAL is unset", async () => {
    expect(process.env["MS365_USE_REAL"]).toBeUndefined();
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        { operation: "calendar.events.list" },
        { use_real: true, tenant_id: "fake-tenant-id" },
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_metadata["mode"]).toBe("fixture");
    }
  });

  it("does NOT activate real Microsoft Graph API when config.use_real is false", async () => {
    const provider = new Microsoft365ReadProvider();
    const originalEnv = process.env["MS365_USE_REAL"];
    try {
      process.env["MS365_USE_REAL"] = "1";
      const result = await provider.invoke(
        makeInvocation(
          { operation: "drive.items.list" },
          { use_real: false, tenant_id: "fake-tenant-id" },
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalEnv === undefined) {
        delete process.env["MS365_USE_REAL"];
      } else {
        process.env["MS365_USE_REAL"] = originalEnv;
      }
    }
  });

  it("does NOT activate real Microsoft Graph API when secret_ref env var is missing", async () => {
    const provider = new Microsoft365ReadProvider();
    const originalUseReal = process.env["MS365_USE_REAL"];
    try {
      process.env["MS365_USE_REAL"] = "1";
      const invocation: ConnectorInvocation = {
        binding_id: "00000000-0000-0000-0000-000000000007",
        type: "MICROSOFT_365_READ",
        config: Object.freeze({ use_real: true, tenant_id: "fake-tenant-id" }),
        secret_ref: "MS365_ACCESS_TOKEN_MISSING_DO_NOT_SET",
        payload: Object.freeze({ operation: "mail.messages.list" }),
      };
      const result = await provider.invoke(invocation);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delivery_metadata["mode"]).toBe("fixture");
      }
    } finally {
      if (originalUseReal === undefined) {
        delete process.env["MS365_USE_REAL"];
      } else {
        process.env["MS365_USE_REAL"] = originalUseReal;
      }
    }
  });
});

describe("C5 — Microsoft365ReadProvider privacy invariant", () => {
  it("delivery_metadata never carries access token, raw mail body, calendar event subject, file name, or recipient PII", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.delivery_metadata);
      // Authorization header value never echoed
      expect(serialized).not.toMatch(/bearer/i);
      // Common Microsoft Graph content markers absent
      expect(serialized).not.toMatch(/subject/i);
      expect(serialized).not.toMatch(/body/i);
      expect(serialized).not.toMatch(/attendee/i);
      expect(serialized).not.toMatch(/from/i);
      expect(serialized).not.toMatch(/recipient/i);
      // Common email + Microsoft 365 PII markers absent
      expect(serialized).not.toMatch(/@/);
      expect(serialized).not.toMatch(/outlook\.com/i);
      expect(serialized).not.toMatch(/onmicrosoft\.com/i);
      // File name / OneDrive path markers absent
      expect(serialized).not.toMatch(/filename/i);
      expect(serialized).not.toMatch(/displayName/i);
    }
  });

  it("error message scrubs access token and authorization header even when fixture forces failure", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation(
        {
          fixture_key: "force-auth-failure",
          operation: "calendar.events.list",
        },
        { use_real: true, tenant_id: "fake-tenant-id" },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/bearer/i);
      // Generic Microsoft Graph access tokens are JWT format
      // (eyJ prefix). The fixture failure message must never
      // include that prefix even though no real token is in
      // play at the fixture register.
      expect(result.message).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
    }
  });

  it("success result for calendar.events.list whitelist-asserts the exact metadata keys (never event subjects / attendee email)", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "calendar.events.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "events_count",
        "mode",
        "operation",
        "provider",
        "recurring_events_count",
      ]);
    }
  });

  it("success result for drive.items.list whitelist-asserts the exact metadata keys (never file names / folder paths)", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "drive.items.list" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.delivery_metadata);
      expect(keys.sort()).toEqual([
        "binding_id",
        "folders_count",
        "items_count",
        "mode",
        "operation",
        "provider",
      ]);
    }
  });

  it("success result for mail.messages.list whitelist-asserts the exact metadata keys (never subjects / bodies / sender email)", async () => {
    const provider = new Microsoft365ReadProvider();
    const result = await provider.invoke(
      makeInvocation({ operation: "mail.messages.list" }),
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
      ]);
    }
  });
});
