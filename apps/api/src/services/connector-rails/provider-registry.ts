// FILE: provider-registry.ts
// PURPOSE: Phase 5 — canonical service-tier catalog of supported
//          connector providers (the `ConnectorProviderDefinition`
//          concept from the [FOUNDER-AUTH — FULL DEPLOYED RUNTIMES]
//          directive, implemented as a TypeScript constant rather
//          than a Prisma table per the repo convention at
//          apps/api/src/services/connector/connector.service.ts
//          §"NOT a Prisma enum — the registry is the canonical source
//          and grows behind Founder QLOCK; an enum would add a
//          migration per new connector type").
//
// CONNECTS TO:
//   - apps/api/src/services/connector-rails/tenant-connection.service.ts
//     (looks up provider definitions when creating / validating
//     TenantConnectorConnection rows)
//   - apps/api/src/services/connector-rails/scope-grant.service.ts
//     (verifies allowed_operations against the provider's
//     supported_operations)
//
// SAFETY POSTURE:
//   - This file contains NO secrets. It is a static catalog.
//   - default_write_mode is the conservative starting posture;
//     individual tenant connections must explicitly opt UP to
//     more permissive write_modes via Founder-authorized config.

export type ConnectorProviderType =
  | "GOOGLE_WORKSPACE"
  | "MICROSOFT_365"
  | "SLACK"
  | "JIRA"
  | "LINEAR"
  | "SALESFORCE"
  | "HUBSPOT"
  | "GITHUB"
  | "GITLAB"
  | "NOTION"
  | "CONFLUENCE"
  | "INTERNAL_API"
  | "MCP_SERVER"
  | "CUSTOM";

export type ConnectorAuthMode =
  | "OAUTH2"
  | "API_KEY"
  | "SERVICE_ACCOUNT"
  | "MCP_AUTH"
  | "NONE_FOR_LOCAL_MOCK";

export type ConnectorWriteMode =
  | "DISABLED"
  | "DRAFT_ONLY"
  | "APPROVAL_REQUIRED"
  | "ENABLED_WITH_POLICY";

export interface ConnectorProviderDefinition {
  provider_id: ConnectorProviderType;
  display_name: string;
  supported_auth_modes: ConnectorAuthMode[];
  read_supported: boolean;
  draft_supported: boolean;
  write_supported: boolean;
  default_write_mode: ConnectorWriteMode;
  compliance_tags: string[];
  /**
   * When true, enabling WRITE_EXECUTE for this provider requires
   * explicit Founder authorization above and beyond the per-tenant
   * connection's policy. Enforced at the service tier.
   */
  connector_write_founder_gated: boolean;
}

const REGISTRY: Record<ConnectorProviderType, ConnectorProviderDefinition> = {
  GOOGLE_WORKSPACE: {
    provider_id: "GOOGLE_WORKSPACE",
    display_name: "Google Workspace",
    supported_auth_modes: ["OAUTH2", "SERVICE_ACCOUNT"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["GDPR", "SOC2"],
    connector_write_founder_gated: true,
  },
  MICROSOFT_365: {
    provider_id: "MICROSOFT_365",
    display_name: "Microsoft 365",
    supported_auth_modes: ["OAUTH2"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["GDPR", "SOC2", "HIPAA"],
    connector_write_founder_gated: true,
  },
  SLACK: {
    provider_id: "SLACK",
    display_name: "Slack",
    supported_auth_modes: ["OAUTH2"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  JIRA: {
    provider_id: "JIRA",
    display_name: "Jira",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "APPROVAL_REQUIRED",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: false,
  },
  LINEAR: {
    provider_id: "LINEAR",
    display_name: "Linear",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "APPROVAL_REQUIRED",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: false,
  },
  SALESFORCE: {
    provider_id: "SALESFORCE",
    display_name: "Salesforce",
    supported_auth_modes: ["OAUTH2"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2", "HIPAA"],
    connector_write_founder_gated: true,
  },
  HUBSPOT: {
    provider_id: "HUBSPOT",
    display_name: "HubSpot",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "APPROVAL_REQUIRED",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  GITHUB: {
    provider_id: "GITHUB",
    display_name: "GitHub",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  GITLAB: {
    provider_id: "GITLAB",
    display_name: "GitLab",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  NOTION: {
    provider_id: "NOTION",
    display_name: "Notion",
    supported_auth_modes: ["OAUTH2"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  CONFLUENCE: {
    provider_id: "CONFLUENCE",
    display_name: "Confluence",
    supported_auth_modes: ["OAUTH2", "API_KEY"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DRAFT_ONLY",
    compliance_tags: ["SOC2"],
    connector_write_founder_gated: true,
  },
  INTERNAL_API: {
    provider_id: "INTERNAL_API",
    display_name: "Internal API (customer-owned)",
    supported_auth_modes: ["API_KEY", "OAUTH2", "SERVICE_ACCOUNT"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "APPROVAL_REQUIRED",
    compliance_tags: [],
    connector_write_founder_gated: false,
  },
  MCP_SERVER: {
    provider_id: "MCP_SERVER",
    display_name: "MCP Server",
    supported_auth_modes: ["MCP_AUTH", "API_KEY", "NONE_FOR_LOCAL_MOCK"],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "APPROVAL_REQUIRED",
    compliance_tags: [],
    connector_write_founder_gated: true,
  },
  CUSTOM: {
    provider_id: "CUSTOM",
    display_name: "Custom (tenant-defined)",
    supported_auth_modes: [
      "OAUTH2",
      "API_KEY",
      "SERVICE_ACCOUNT",
      "NONE_FOR_LOCAL_MOCK",
    ],
    read_supported: true,
    draft_supported: true,
    write_supported: true,
    default_write_mode: "DISABLED",
    compliance_tags: [],
    connector_write_founder_gated: true,
  },
};

Object.freeze(REGISTRY);

/**
 * List all supported provider definitions in stable order. The Control
 * Tower onboarding UI consumes this to render the provider catalog.
 */
export function listConnectorProviders(): ConnectorProviderDefinition[] {
  return Object.values(REGISTRY);
}

/**
 * Get a single provider definition by id. Returns undefined when the
 * id is not a known provider — callers should treat this as an
 * UNKNOWN_PROVIDER failure, not a recoverable state.
 */
export function getConnectorProvider(
  providerId: string,
): ConnectorProviderDefinition | undefined {
  if (!(providerId in REGISTRY)) return undefined;
  return REGISTRY[providerId as ConnectorProviderType];
}

/**
 * Validate that an auth_mode string matches one of the provider's
 * supported_auth_modes. Pure function — no DB access.
 */
export function isAuthModeSupported(
  providerId: ConnectorProviderType,
  authMode: string,
): boolean {
  const def = REGISTRY[providerId];
  return (def.supported_auth_modes as string[]).includes(authMode);
}
