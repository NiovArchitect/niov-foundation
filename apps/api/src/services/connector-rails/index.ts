// FILE: index.ts
// PURPOSE: Barrel re-exports for the Phase 5 connector + MCP rails
//          substrate. Consumers import from this barrel rather than
//          the individual service files.

export {
  type ConnectorProviderType,
  type ConnectorAuthMode,
  type ConnectorWriteMode,
  type ConnectorProviderDefinition,
  listConnectorProviders,
  getConnectorProvider,
  isAuthModeSupported,
} from "./provider-registry";

export {
  type ConnectorScopeType,
  type ConnectorOperationClass,
  type CreateScopeGrantInput,
  type CreateScopeGrantResult,
  createConnectorScopeGrant,
  listConnectorScopeGrants,
  revokeConnectorScopeGrant,
  findMatchingGrant,
} from "./scope-grant.service";

export {
  type CreateMcpServerConnectionInput,
  type CreateMcpServerConnectionResult,
  createMcpServerConnection,
  listMcpServerConnections,
  getMcpServerConnection,
  updateMcpServerStatus,
  revokeMcpServerConnection,
} from "./mcp-server.service";

export {
  type CreateMcpToolPolicyInput,
  type CreateMcpToolPolicyResult,
  createMcpToolPolicy,
  listMcpToolPolicies,
  revokeMcpToolPolicy,
  findMatchingPolicy,
} from "./mcp-tool-policy.service";
