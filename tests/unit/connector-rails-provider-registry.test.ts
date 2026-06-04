/**
 * Unit tests for the Phase 5 ConnectorProviderDefinition catalog.
 * Pure-function tests — no DB.
 */
import { describe, expect, it } from "vitest";
import {
  getConnectorProvider,
  isAuthModeSupported,
  listConnectorProviders,
} from "../../apps/api/src/services/connector-rails";

describe("connector-rails / provider-registry", () => {
  it("listConnectorProviders returns all 14 canonical providers", () => {
    const providers = listConnectorProviders();
    expect(providers.length).toBe(14);
    const ids = new Set(providers.map((p) => p.provider_id));
    expect(ids).toEqual(
      new Set([
        "GOOGLE_WORKSPACE",
        "MICROSOFT_365",
        "SLACK",
        "JIRA",
        "LINEAR",
        "SALESFORCE",
        "HUBSPOT",
        "GITHUB",
        "GITLAB",
        "NOTION",
        "CONFLUENCE",
        "INTERNAL_API",
        "MCP_SERVER",
        "CUSTOM",
      ]),
    );
  });

  it("every provider has a non-empty supported_auth_modes list", () => {
    for (const p of listConnectorProviders()) {
      expect(p.supported_auth_modes.length).toBeGreaterThan(0);
    }
  });

  it("getConnectorProvider returns undefined for an unknown id", () => {
    expect(getConnectorProvider("NOT_A_PROVIDER")).toBeUndefined();
  });

  it("getConnectorProvider returns the canonical definition for known ids", () => {
    const slack = getConnectorProvider("SLACK");
    expect(slack).toBeDefined();
    expect(slack?.display_name).toBe("Slack");
    expect(slack?.connector_write_founder_gated).toBe(true);
  });

  it("isAuthModeSupported accepts a valid auth mode + rejects unknown", () => {
    expect(isAuthModeSupported("SLACK", "OAUTH2")).toBe(true);
    expect(isAuthModeSupported("SLACK", "MCP_AUTH")).toBe(false);
    expect(isAuthModeSupported("MCP_SERVER", "MCP_AUTH")).toBe(true);
  });

  it("CUSTOM provider defaults write mode to DISABLED", () => {
    const custom = getConnectorProvider("CUSTOM");
    expect(custom?.default_write_mode).toBe("DISABLED");
    expect(custom?.connector_write_founder_gated).toBe(true);
  });

  it("INTERNAL_API + JIRA + LINEAR + HUBSPOT do NOT require Founder gating for writes (customer can grant directly)", () => {
    expect(getConnectorProvider("INTERNAL_API")?.connector_write_founder_gated).toBe(false);
    expect(getConnectorProvider("JIRA")?.connector_write_founder_gated).toBe(false);
    expect(getConnectorProvider("LINEAR")?.connector_write_founder_gated).toBe(false);
    // HubSpot defaults to gated.
    expect(getConnectorProvider("HUBSPOT")?.connector_write_founder_gated).toBe(true);
  });

  it("Google Workspace + Microsoft 365 + Slack default write mode = DRAFT_ONLY", () => {
    expect(getConnectorProvider("GOOGLE_WORKSPACE")?.default_write_mode).toBe(
      "DRAFT_ONLY",
    );
    expect(getConnectorProvider("MICROSOFT_365")?.default_write_mode).toBe(
      "DRAFT_ONLY",
    );
    expect(getConnectorProvider("SLACK")?.default_write_mode).toBe("DRAFT_ONLY");
  });
});
