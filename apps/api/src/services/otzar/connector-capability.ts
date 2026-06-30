// FILE: connector-capability.ts
// PURPOSE: [SECTION-12-WORKGRAPH Phase 5] The connector/MCP capability resolver the
//          execution planner consults so it never GUESSES whether a tool is
//          available, authorized, blocked, missing, or needs setup. Reuses the
//          existing connector rails — provider-registry (does the provider support
//          the op?), ConnectorBinding (is there an enabled binding for the org?),
//          ConnectorScopeGrant (is the actor authorized?), and org policy — and
//          collapses them into the seven governed capability states. A pure
//          `computeCapabilityState` holds the decision logic (fully unit-testable);
//          a thin `resolveConnectorCapability` fetches the facts from the DB.
//
// GOVERNANCE: read-only resolution. Never grants/auto-authorizes. Connector WRITES
//   stay founder-gated (provider-registry default_write_mode) — a fully authorized
//   write still routes to approval, never auto-execute. No state leaks across
//   org/user (binding + grant lookups are org/actor-scoped).
// RUNTIME (ADR-0069/0090): TS — this is governance/authorization, which must stay
//   in the Foundation authority tier (ADR-0090 §3 forbids Python for policy).
// CONNECTS TO: connector-rails/provider-registry.ts, scope-grant.service.ts,
//   packages/database connector-binding queries, execution-planner.ts,
//   tests/unit/connector-capability.test.ts.

// The seven governed capability states (founder spec).
export type ConnectorCapabilityState =
  | "available_and_authorized"
  | "available_needs_user_auth"
  | "available_needs_admin_auth"
  | "not_connected"
  | "connector_missing"
  | "policy_blocked"
  | "insufficient_context";

// The tool a kind of work needs. "NONE" = no external connector (human/internal).
export type RequiredConnector =
  | "SLACK"
  | "GOOGLE_WORKSPACE"
  | "MICROSOFT_365"
  | "JIRA"
  | "LINEAR"
  | "GITHUB"
  | "GITLAB"
  | "NOTION"
  | "CONFLUENCE"
  | "CALENDAR"
  | "GMAIL"
  | "MCP_SERVER"
  | "INTERNAL"
  | "NONE";

export type ConnectorOperation = "read" | "draft" | "write_request" | "write_execute";

// The deterministic facts the capability state is computed from. Fetched by
// resolveConnectorCapability; injectable directly for unit tests.
export interface CapabilityFacts {
  /** The connector is a known provider in the registry (else connector_missing). */
  providerKnown: boolean;
  /** The provider supports the requested operation tier (read/draft/write). */
  supportsOperation: boolean;
  /** An enabled ConnectorBinding exists for this org + connector type. */
  bindingExists: boolean;
  /** A matching ConnectorScopeGrant authorizes THIS actor for the operation. */
  actorAuthorized: boolean;
  /** Authorization, if missing, would require ADMIN action (vs user self-auth). */
  adminAuthRequired: boolean;
  /** Org policy permits this operation (OrgCollaborationPolicy / write-gate). */
  policyAllows: boolean;
  /** Enough resolved context to act (target/recipient/resource known). */
  hasContext: boolean;
}

/**
 * Pure decision: collapse the connector facts into one governed capability state.
 * Ordering is deliberate — the most blocking / earliest-setup condition wins, so a
 * missing connector is never reported as merely "unauthorized", and an
 * unresolved target never looks "available".
 */
export function computeCapabilityState(facts: CapabilityFacts): ConnectorCapabilityState {
  if (!facts.providerKnown || !facts.supportsOperation) return "connector_missing";
  if (!facts.hasContext) return "insufficient_context";
  if (!facts.bindingExists) return "not_connected";
  if (!facts.policyAllows) return "policy_blocked";
  if (!facts.actorAuthorized) return facts.adminAuthRequired ? "available_needs_admin_auth" : "available_needs_user_auth";
  return "available_and_authorized";
}

// Map our RequiredConnector to the provider-registry ConnectorProviderType where
// they differ in spelling. Used by the DB resolver.
export function requiredConnectorToProviderType(rc: RequiredConnector): string | null {
  switch (rc) {
    case "CALENDAR":
      return "GOOGLE_WORKSPACE"; // calendar lives under the workspace provider
    case "INTERNAL":
    case "NONE":
      return null; // no external provider
    default:
      return rc;
  }
}

/** Whether a capability state means the tool is reachable (vs needs setup/blocked). */
export function isReachable(state: ConnectorCapabilityState): boolean {
  return state === "available_and_authorized";
}

// ── DB-backed resolver ─────────────────────────────────────────────────────
// Composes the live connector facts. The decision stays in the pure
// computeCapabilityState above. Bridges the two connector subsystems: the
// connector-rails provider-registry (does the provider support the op?) and the
// connector/ ConnectorBinding rows (e.g. "GITHUB_READ" — matched by provider name)
// + connector-rails ConnectorScopeGrant (is the actor authorized?).
import { getConnectorProvider } from "../connector-rails/provider-registry.js";
import { listConnectorScopeGrants, findMatchingGrant } from "../connector-rails/scope-grant.service.js";
import type { ConnectorOperationClass } from "../connector-rails/scope-grant.service.js";
import { listConnectorBindingsForOrg } from "@niov/database";

function operationToClass(op: ConnectorOperation): ConnectorOperationClass {
  switch (op) {
    case "read": return "READ";
    case "draft": return "DRAFT";
    case "write_request": return "WRITE_REQUEST";
    case "write_execute": return "WRITE_EXECUTE";
  }
}

export interface ResolveCapabilityArgs {
  orgEntityId: string;
  actorEntityId: string;
  requiredConnector: RequiredConnector;
  operation: ConnectorOperation;
  /** Whether enough context (target/resource) is resolved to act. Default true. */
  hasContext?: boolean;
}

/**
 * Resolve the live connector capability for an org+actor. Read-only; never grants.
 * For INTERNAL/NONE work there is no external connector gate, so the caller should
 * not even ask — but we return null-provider + authorized as a safe no-op.
 */
export async function resolveConnectorCapability(
  args: ResolveCapabilityArgs,
): Promise<{ state: ConnectorCapabilityState; providerType: string | null }> {
  const providerType = requiredConnectorToProviderType(args.requiredConnector);
  if (providerType === null) {
    // No external connector required (internal/human work).
    return { state: "available_and_authorized", providerType: null };
  }
  const provider = getConnectorProvider(providerType);
  const opSupported = provider
    ? args.operation === "read"
      ? provider.read_supported
      : args.operation === "draft"
        ? provider.draft_supported
        : provider.write_supported
    : false;

  // An enabled ConnectorBinding for the org whose type names this provider.
  const bindings = await listConnectorBindingsForOrg(args.orgEntityId, { enabled: true });
  const bindingExists = bindings.some((b) => String(b.type).toUpperCase().includes(providerType));

  // Actor authorization (only meaningful once a binding exists).
  let actorAuthorized = false;
  if (bindingExists) {
    const grants = await listConnectorScopeGrants(args.orgEntityId);
    const opClass = operationToClass(args.operation);
    actorAuthorized =
      findMatchingGrant(grants, "EMPLOYEE", args.actorEntityId, opClass) !== null ||
      findMatchingGrant(grants, "ORG", null, opClass) !== null;
  }

  const facts: CapabilityFacts = {
    providerKnown: provider !== undefined,
    supportsOperation: opSupported,
    bindingExists,
    actorAuthorized,
    adminAuthRequired: false, // user-requestable by default; founder-gating is at execute-with-approval
    policyAllows: true, // org connector-write policy is enforced downstream (INVOKE_CONNECTOR + policy evaluator)
    hasContext: args.hasContext ?? true,
  };
  return { state: computeCapabilityState(facts), providerType };
}
/** Whether the gap is a SETUP-required one (someone must connect/authorize). */
export function needsSetup(state: ConnectorCapabilityState): boolean {
  return (
    state === "not_connected" ||
    state === "connector_missing" ||
    state === "available_needs_user_auth" ||
    state === "available_needs_admin_auth"
  );
}
