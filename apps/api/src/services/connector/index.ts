// FILE: index.ts (connector service barrel)
// PURPOSE: Public surface for Section 4 connector substrate.
// CONNECTS TO: apps/api/src/index.ts top-level barrel.

export {
  CONNECTOR_REGISTRY,
  FixtureBasedConnectorProvider,
  getConnectorProvider,
  getConnectorProviderAsync,
  getConnectorTypeDefinition,
} from "./connector.service.js";

export { OutboundWebhookProvider } from "./outbound-webhook.provider.js";

export { verifyInboundHmac } from "./inbound-hmac.js";
export type {
  InboundHmacResult,
  VerifyInboundHmacInput,
} from "./inbound-hmac.js";

export {
  bindingMatchesNotificationClass,
  dispatchNotificationFanOut,
  makeConnectorFanOutHook,
} from "./notification-fanout.service.js";
export type {
  NotificationFanOutInput,
  NotificationFanOutResult,
} from "./notification-fanout.service.js";

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
