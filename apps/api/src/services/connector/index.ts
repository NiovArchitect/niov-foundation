// FILE: index.ts (connector service barrel)
// PURPOSE: Public surface for Section 4 connector substrate.
// CONNECTS TO: apps/api/src/index.ts top-level barrel.

export {
  CONNECTOR_REGISTRY,
  FixtureBasedConnectorProvider,
  getConnectorProvider,
  getConnectorTypeDefinition,
} from "./connector.service.js";

export type {
  ConnectorInvocation,
  ConnectorProvider,
  ConnectorResult,
  ConnectorType,
  ConnectorTypeDefinition,
} from "./connector.service.js";

export {
  getConnectorBindingForOrgService,
  listConnectorBindingsForOrgService,
  projectConnectorBinding,
  registerConnectorBindingForOrg,
  softDeleteConnectorBindingForOrgService,
  updateConnectorBindingForOrgService,
} from "./connector-binding.service.js";

export type {
  ConnectorBindingFailure,
  ConnectorBindingView,
  RegisterConnectorBindingInput,
  UpdateConnectorBindingInput,
} from "./connector-binding.service.js";
