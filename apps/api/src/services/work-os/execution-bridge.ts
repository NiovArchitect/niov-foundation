// FILE: execution-bridge.ts
// PURPOSE: Work-OS Slice F — the BRIDGE between the Work OS ledger
//          (Slices A–E: WorkLedgerEntry carrying an execution_plan) and
//          the existing ADR-0057 governed Action executor. Before Slice
//          F these were two disconnected worlds: WorkLedgerEntry has a
//          `proposed_action_id` FK that nothing populated, and the Action
//          executor (createActionForCaller → policy-evaluator → approval
//          → INVOKE_CONNECTOR handler → connector provider) was fed only
//          by its own ProposedAction path, never by the ledger.
//
//          This module wires them: a caller-owned commitment whose
//          execution_plan names a supported write connector becomes a
//          governed INVOKE_CONNECTOR Action via the EXISTING create
//          surface (no second executor, no second approval system, no new
//          data model). The Action's own policy-evaluator + approval gate
//          is the single governance gate — this bridge never bypasses it
//          and never auto-executes.
//
//          Two entry points:
//            - promoteCommitmentToAction: ledger commitment → governed
//              Action; links proposed_action_id; sets the ledger status
//              from the created Action's status. Missing binding → the
//              ledger goes BLOCKED (setup-required) and NO action is
//              created (never a fake success).
//            - reconcileLedgerExecutionState: re-reads the linked Action
//              and maps its status onto the ledger (EXECUTING → EXECUTED
//              / BLOCKED / CANCELLED). Called after approval + execution.
//
// GOVERNANCE INVARIANTS:
//   - Self-scoped: only the caller's own commitment; getLedgerEntry
//     enforces participant scope, org-scoped.
//   - No auto-send: the Action lands in PROPOSED (approval-gated) and is
//     executed only by the existing approved-Action lifecycle.
//   - Honest boundaries: no connector binding → BLOCKED setup-required,
//     recorded, never faked. Unsupported connector → not_executable.
//   - Deterministic: idempotency_key = "wledger:<entry_id>" so a re-submit
//     replays the same Action rather than duplicating it.
// CONNECTS TO:
//   - work-ledger.service.ts (getLedgerEntry, patchLedgerEntry)
//   - action/action.service.ts (createActionForCaller — the single gate)
//   - action/get.service.ts (getActionForCaller — reconcile read)
//   - otzar/connector-capability.ts (resolveConnectorCapability — recorded)
//   - connector/slack-write.provider.ts, connector-rails/mcp-invoke.provider.ts
//     (the last-hop write providers the approved Action reaches)

import type { ActionStatus } from "@prisma/client";
import { listConnectorBindingsForOrg } from "@niov/database";
import { createActionForCaller } from "../action/action.service.js";
import { getActionForCaller } from "../action/get.service.js";
import {
  resolveConnectorCapability,
  type RequiredConnector,
} from "../otzar/connector-capability.js";
import {
  getLedgerEntry,
  patchLedgerEntry,
  type WorkLedgerView,
} from "./work-ledger.service.js";

// ── Supported write connectors (v1) ─────────────────────────────────
// Maps the execution_plan.requiredConnector to the ConnectorBinding
// `type` string the governed Action will invoke. v1 supports Slack
// write + MCP tool invocation; everything else is a documented boundary
// (human-must-do / forward-substrate write providers).
const SUPPORTED_WRITE_CONNECTORS: Readonly<Record<string, string>> = Object.freeze({
  SLACK: "SLACK_WRITE",
  MCP_SERVER: "MCP_INVOKE",
});

// Execution modes that mean "there is nothing to execute through a
// connector" — the plan says a human must act, or it is blocked.
const NON_EXECUTABLE_MODES: ReadonlySet<string> = new Set([
  "human_must_do",
  "blocked",
]);

export type PromoteOutcome =
  | "action_created"
  | "blocked_setup_required"
  | "not_executable"
  | "unsupported_connector";

export interface PromoteResult {
  ok: boolean;
  outcome: PromoteOutcome;
  action_id?: string;
  action_status?: string;
  // When the governed Action lands PROPOSED under dual-control, this is
  // the paired EscalationRequest id a DISTINCT approver resolves to
  // approve execution (source ≠ resolver). Absent for AUTO_APPROVE.
  escalation_id?: string;
  ledger_status?: string;
  connector_type?: string;
  capability_state?: string;
  reason?: string;
}

export interface PromoteArgs {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
}

// ── Pure helpers (unit-tested without a DB) ─────────────────────────

/** Map an Action lifecycle status onto the ledger execution status.
 *  PROPOSED → NEEDS_APPROVAL (approval-gated, not executed).
 *  APPROVED/SCHEDULED/RUNNING → EXECUTING (in flight).
 *  SUCCEEDED → EXECUTED. FAILED/TIMED_OUT/EXPIRED → BLOCKED.
 *  REJECTED/CANCELLED → CANCELLED. */
export function mapActionStatusToLedgerStatus(status: string): string {
  switch (status) {
    case "PROPOSED":
      return "NEEDS_APPROVAL";
    case "APPROVED":
    case "SCHEDULED":
    case "RUNNING":
      return "EXECUTING";
    case "SUCCEEDED":
      return "EXECUTED";
    case "FAILED":
    case "TIMED_OUT":
    case "EXPIRED":
      return "BLOCKED";
    case "REJECTED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "EXECUTING";
  }
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Read the stored execution plan (camelCase) off a ledger entry. */
export function readExecutionPlan(entry: WorkLedgerView): {
  requiredConnector: string | null;
  executionMode: string | null;
  executionType: string | null;
} | null {
  const plan = asObj(entry.execution_plan);
  if (plan === null) return null;
  return {
    requiredConnector: asStr(plan["requiredConnector"]),
    executionMode: asStr(plan["executionMode"]),
    executionType: asStr(plan["executionType"]),
  };
}

/** Build the governed, test-safe message text for a Slack write from a
 *  ledger commitment. The [Otzar · governed] marker makes it
 *  unmistakably a governed write-back, never an arbitrary message. */
export function buildGovernedSlackText(entry: WorkLedgerView): string {
  const summary = entry.summary !== null && entry.summary.length > 0 ? ` — ${entry.summary}` : "";
  return `[Otzar · governed write-back] ${entry.title}${summary}`;
}

/** Build the INVOKE_CONNECTOR invocation_payload for a supported write
 *  connector type. Returns null for an unsupported type. */
export function buildInvocationPayload(
  connectorBindingType: string,
  entry: WorkLedgerView,
  bindingConfig: Record<string, unknown>,
): Record<string, unknown> | null {
  if (connectorBindingType === "SLACK_WRITE") {
    const channel = asStr(bindingConfig["default_channel"]);
    if (channel === null) return null;
    return {
      operation: "chat.postMessage",
      channel,
      text: buildGovernedSlackText(entry),
      unfurl_links: false,
      unfurl_media: false,
    };
  }
  if (connectorBindingType === "MCP_INVOKE") {
    // The tool_name + server_url live on the binding config; the
    // invocation payload carries only the tool arguments.
    return {
      arguments: {
        work_title: entry.title,
        ledger_entry_id: entry.ledger_entry_id,
      },
    };
  }
  return null;
}

// ── DB-backed bridge ────────────────────────────────────────────────

/** Promote a caller-owned ledger commitment to a governed INVOKE_CONNECTOR
 *  Action. The Action's own policy-evaluator + approval gate governs
 *  execution; this bridge only maps + submits + links. */
export async function promoteCommitmentToAction(
  args: PromoteArgs,
): Promise<PromoteResult> {
  const loaded = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  if (loaded.ok === false) {
    return { ok: false, outcome: "not_executable", reason: "ledger entry not found or not visible" };
  }
  const entry = loaded.entry;

  const plan = readExecutionPlan(entry);
  if (plan === null || plan.requiredConnector === null) {
    return { ok: false, outcome: "not_executable", reason: "no execution plan / required connector on this commitment" };
  }
  if (plan.executionMode !== null && NON_EXECUTABLE_MODES.has(plan.executionMode)) {
    return { ok: false, outcome: "not_executable", reason: `execution mode ${plan.executionMode} is not connector-executable` };
  }

  const bindingType = SUPPORTED_WRITE_CONNECTORS[plan.requiredConnector];
  if (bindingType === undefined) {
    return {
      ok: false,
      outcome: "unsupported_connector",
      reason: `connector ${plan.requiredConnector} has no v1 write provider (Slack + MCP only)`,
    };
  }

  // Record the live capability state for transparency (never the gate).
  let capabilityState: string | undefined;
  try {
    const cap = await resolveConnectorCapability({
      orgEntityId: args.org_entity_id,
      actorEntityId: args.caller_entity_id,
      requiredConnector: plan.requiredConnector as RequiredConnector,
      operation: "write_execute",
    });
    capabilityState = cap.state;
  } catch {
    capabilityState = undefined;
  }

  // The hard gate: an enabled ConnectorBinding of the required write type
  // MUST exist for the org. No binding → BLOCKED setup-required, NO
  // action, never a fake success.
  const bindings = await listConnectorBindingsForOrg(args.org_entity_id, { enabled: true });
  const binding = bindings.find((b) => String(b.type) === bindingType);
  if (binding === undefined) {
    await patchLedgerEntry({
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      caller_entity_id: args.caller_entity_id,
      is_manager: args.is_manager,
      patch: { status: "BLOCKED", next_action: `Connect ${plan.requiredConnector} to execute this commitment` },
    });
    return {
      ok: true,
      outcome: "blocked_setup_required",
      connector_type: bindingType,
      capability_state: capabilityState ?? "connector_missing",
      ledger_status: "BLOCKED",
      reason: `no enabled ${bindingType} binding for this org — setup required`,
    };
  }

  const bindingConfig =
    binding.config !== null && typeof binding.config === "object" && !Array.isArray(binding.config)
      ? (binding.config as Record<string, unknown>)
      : {};
  const invocationPayload = buildInvocationPayload(bindingType, entry, bindingConfig);
  if (invocationPayload === null) {
    await patchLedgerEntry({
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      caller_entity_id: args.caller_entity_id,
      is_manager: args.is_manager,
      patch: { status: "BLOCKED", next_action: `Finish configuring the ${bindingType} binding` },
    });
    return {
      ok: true,
      outcome: "blocked_setup_required",
      connector_type: bindingType,
      ledger_status: "BLOCKED",
      reason: `${bindingType} binding is missing required config (e.g. default_channel)`,
    };
  }

  // Create the governed Action through the EXISTING single gate. The
  // idempotency key is derived from the ledger entry so re-submitting a
  // commitment replays the same Action instead of duplicating a write.
  const created = await createActionForCaller(args.caller_entity_id, {
    action_type: "INVOKE_CONNECTOR",
    idempotency_key: `wledger:${args.ledger_entry_id}`,
    payload_summary: `governed write-back for commitment ${args.ledger_entry_id.slice(0, 8)} via ${bindingType}`,
    payload_redacted: {
      binding_id: binding.binding_id,
      invocation_payload: invocationPayload,
    },
  });
  if (created.ok === false) {
    return {
      ok: false,
      outcome: "not_executable",
      connector_type: bindingType,
      reason: `action create refused: ${created.code}`,
    };
  }

  const actionStatus = created.view.status;
  const ledgerStatus = mapActionStatusToLedgerStatus(actionStatus);
  await patchLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
    patch: {
      proposed_action_id: created.view.action_id,
      status: ledgerStatus,
    },
  });

  return {
    ok: true,
    outcome: "action_created",
    action_id: created.view.action_id,
    action_status: actionStatus,
    ...(created.view.escalation_id !== undefined ? { escalation_id: created.view.escalation_id } : {}),
    ledger_status: ledgerStatus,
    connector_type: bindingType,
    capability_state: capabilityState,
  };
}

export interface ReconcileResult {
  ok: boolean;
  ledger_status?: string;
  action_status?: string;
  reason?: string;
}

/** Re-read the Action linked to a ledger commitment and map its current
 *  status onto the ledger. Idempotent; safe to call repeatedly (e.g. by
 *  the smoke poll or a read-time refresh). */
export async function reconcileLedgerExecutionState(
  args: PromoteArgs,
): Promise<ReconcileResult> {
  const loaded = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  if (loaded.ok === false) {
    return { ok: false, reason: "ledger entry not found or not visible" };
  }
  const actionId = loaded.entry.proposed_action_id;
  if (actionId === undefined || actionId === null || actionId.length === 0) {
    return { ok: false, reason: "no linked action to reconcile" };
  }

  const action = await getActionForCaller(args.caller_entity_id, actionId);
  if (action.ok === false) {
    return { ok: false, reason: `linked action not readable: ${action.code}` };
  }
  const actionStatus: ActionStatus = action.view.status;
  const ledgerStatus = mapActionStatusToLedgerStatus(actionStatus);
  const patched = await patchLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
    patch: { status: ledgerStatus },
  });
  if (patched.ok === false) {
    return { ok: false, action_status: actionStatus, reason: `ledger patch refused: ${patched.code}` };
  }
  return { ok: true, ledger_status: ledgerStatus, action_status: actionStatus };
}
