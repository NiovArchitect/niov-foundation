// FILE: execution-planner.ts
// PURPOSE: [SECTION-12-WORKGRAPH Phase 4] Turn each transcript-derived work item
//          into a TYPED, executable plan — not "send a note". Otzar classifies what
//          KIND of work it is, which tool it needs, whether it can act, whether
//          approval is required, whether a connector is missing, and the next best
//          action. Deterministic; consumes the connector capability state
//          (connector-capability.ts) and reuses the NextBestAction vocabulary.
//
// NO AUTO-SEND (preserved from Slice 1): the strongest mode is
//   otzar_can_execute_with_approval — connector WRITES are founder-gated, so a
//   fully-authorized action still routes to approval, never auto-executes. A
//   missing/unauthorized tool becomes connector_required/permission_required
//   (a visible setup-required blocker), never silently dropped.
// RUNTIME (ADR-0069/0090): TS — execution-mode is a governance/authorization
//   decision (must stay in the Foundation authority tier). Any future ML ranking
//   of priority/urgency is a separate enrichment over these plans.
// CONNECTS TO: work-item-planner.ts (WorkItemPlan), connector-capability.ts,
//   decision-recommendation.ts (NextBestAction), comms-ingest.service.ts (attaches
//   a plan to each persisted WorkLedgerEntry), tests/unit/execution-planner.test.ts.

import type { NextBestAction } from "./decision-recommendation.js";
import type { ConnectorCapabilityState, ConnectorOperation, RequiredConnector } from "./connector-capability.js";

export type ExecutionType =
  | "message"
  | "calendar_event"
  | "ticket_update"
  | "document_generation"
  | "repo_access"
  | "admin_permission_change"
  | "research_or_data_validation"
  | "connector_setup"
  | "human_task"
  | "approval_request"
  | "follow_up_check_in"
  | "work_ledger_update";

export type ExecutionMode =
  | "human_must_do"
  | "otzar_can_draft"
  | "otzar_can_execute_with_approval"
  | "otzar_can_execute_when_policy_allows"
  | "connector_required"
  | "permission_required"
  | "blocked";

export type PolicyStatus = "allowed" | "requires_approval" | "blocked" | "unknown";

export interface ExecutionPlan {
  executionType: ExecutionType;
  executionMode: ExecutionMode;
  requiredConnector: RequiredConnector;
  requiredCapability: ConnectorOperation | null;
  capabilityState: ConnectorCapabilityState | null;
  policyStatus: PolicyStatus;
  approvalRequired: boolean;
  blockerReason: string | null;
  nextBestAction: NextBestAction;
  confidence: "high" | "medium" | "low";
}

// Deterministic classification. Order is priority: the more specific / more
// blocking interpretation wins (repo access before generic grant; send-via-tool
// before ticket-edit).
const PATTERNS: ReadonlyArray<{ type: ExecutionType; re: RegExp }> = [
  { type: "repo_access", re: /\b(repo|repository)\b[^.?!]*\b(access|write|push|permission|collaborator)\b|\b(write|push)\s+access\b[^.?!]*\brepo/i },
  { type: "admin_permission_change", re: /\b(grant|provision|revoke|give|assign)\b[^.?!]*\b(access|permission|admin|role|seat)\b/i },
  { type: "message", re: /\b(send|share|post|dm|ping|forward)\b[^.?!]*\b(slack|teams|link|links|message|note|update)\b|\bslack\b[^.?!]*\blinks?\b/i },
  { type: "ticket_update", re: /\b(update|create|edit|comment|add)\b[^.?!]*\b(ticket|jira|linear|issue|story|backlog)\b|\b(ticket|issue|jira|linear)\b[^.?!]*\b(escalation matrix|notification visualization|details|status)\b/i },
  { type: "document_generation", re: /\b(write|create|draft|generate|produce|author|put together)\b[^.?!]*\b(document|doc|spec|report|one[- ]?pager|proposal|deck|write[- ]?up|summary doc)\b/i },
  { type: "calendar_event", re: /\b(schedule|book|set up (a )?(meeting|call|sync)|calendar invite|send (an )?invite)\b/i },
  { type: "research_or_data_validation", re: /\b(research|investigate|validate|verify\b[^.?!]*\baccuracy|data (validation|quality|accuracy)|etl|benchmark|evaluate (the )?accuracy)\b/i },
  { type: "connector_setup", re: /\b(connect|authori[sz]e|set up|configure)\b[^.?!]*\b(slack|jira|linear|github|gitlab|calendar|gmail|drive|notion|confluence|connector|integration|oauth)\b/i },
  { type: "approval_request", re: /\b(get|need|request)\b[^.?!]*\b(approval|sign[- ]?off)\b|\bmust (be )?approve(d)?\b/i },
  { type: "follow_up_check_in", re: /\b(follow[- ]?up|check[- ]?in|remind|nudge|circle back)\b/i },
];

/** Classify a commitment/work-item title into its execution type. Deterministic. */
export function classifyExecutionType(text: string): ExecutionType {
  const t = text ?? "";
  for (const p of PATTERNS) if (p.re.test(t)) return p.type;
  return "human_task";
}

/** The tool + operation an execution type needs. NONE = no external connector. */
export function connectorForExecutionType(type: ExecutionType): { connector: RequiredConnector; operation: ConnectorOperation | null } {
  switch (type) {
    case "message": return { connector: "SLACK", operation: "write_request" };
    case "calendar_event": return { connector: "CALENDAR", operation: "write_request" };
    case "ticket_update": return { connector: "JIRA", operation: "write_request" };
    case "document_generation": return { connector: "GOOGLE_WORKSPACE", operation: "write_request" };
    case "repo_access": return { connector: "GITHUB", operation: "write_request" };
    case "admin_permission_change": return { connector: "GITHUB", operation: "write_request" };
    case "research_or_data_validation": return { connector: "NONE", operation: null }; // memory-first
    case "connector_setup": return { connector: "INTERNAL", operation: null };
    case "approval_request": return { connector: "INTERNAL", operation: null };
    case "follow_up_check_in": return { connector: "NONE", operation: null };
    case "work_ledger_update": return { connector: "INTERNAL", operation: null };
    case "human_task": return { connector: "NONE", operation: null };
  }
}

export interface PlanExecutionInput {
  title: string;
  evidenceQuote?: string;
  /** Resolved connector capability (Phase 5). null = not yet resolved. */
  capabilityState?: ConnectorCapabilityState | null;
  confidence?: "high" | "medium" | "low";
  /** Override the classified type when the planner already knows it (e.g. BLOCKER). */
  forceType?: ExecutionType;
}

function label(c: RequiredConnector): string {
  return c === "GOOGLE_WORKSPACE" ? "Google Workspace" : c === "MICROSOFT_365" ? "Microsoft 365" : c.charAt(0) + c.slice(1).toLowerCase();
}

/**
 * Build the typed execution plan. Deterministic + governed. The strongest live
 * mode is otzar_can_execute_with_approval (never auto-execute); missing/
 * unauthorized tools surface as setup-required, never dropped.
 */
export function planExecution(input: PlanExecutionInput): ExecutionPlan {
  // Classify from the title + the source evidence quote — the responsibility-graph
  // work-item title can be terse, so the original sentence sharpens the type.
  const executionType =
    input.forceType ?? classifyExecutionType(`${input.title} ${input.evidenceQuote ?? ""}`);
  const { connector, operation } = connectorForExecutionType(executionType);
  const capabilityState = input.capabilityState ?? null;
  const confidence = input.confidence ?? "medium";

  // No external connector: internal / human work.
  if (connector === "NONE" || connector === "INTERNAL") {
    switch (executionType) {
      case "research_or_data_validation":
        return base("otzar_can_draft", connector, operation, capabilityState, "allowed", false, null, "research", confidence, executionType);
      case "follow_up_check_in":
        return base("otzar_can_draft", connector, operation, capabilityState, "allowed", false, null, "draft", confidence, executionType);
      case "approval_request":
        return base("otzar_can_draft", connector, operation, capabilityState, "requires_approval", true, null, "request_approval", confidence, executionType);
      case "work_ledger_update":
        return base("otzar_can_execute_when_policy_allows", connector, operation, capabilityState, "allowed", false, null, "execute", confidence, executionType);
      case "connector_setup":
        return base("connector_required", connector, operation, capabilityState, "allowed", false, "Connect the required tool before Otzar can act here.", "route", confidence, executionType);
      default: // human_task
        return base("human_must_do", connector, operation, capabilityState, "allowed", false, null, "route", confidence, executionType);
    }
  }

  // Connector-backed work: the capability state drives the mode.
  const conn = label(connector);
  switch (capabilityState) {
    case "available_and_authorized":
      // Connector WRITES are founder-gated → execute only WITH approval.
      return base("otzar_can_execute_with_approval", connector, operation, capabilityState, "requires_approval", true, null, "request_approval", confidence, executionType);
    case "available_needs_user_auth":
      return base("permission_required", connector, operation, capabilityState, "allowed", false, `Connect your ${conn} so Otzar can do this for you.`, "route", confidence, executionType);
    case "available_needs_admin_auth":
      return base("permission_required", connector, operation, capabilityState, "allowed", false, `An admin needs to authorize ${conn} access.`, "route", confidence, executionType);
    case "not_connected":
      return base("connector_required", connector, operation, capabilityState, "allowed", false, `${conn} isn't connected yet — set it up to proceed.`, "route", confidence, executionType);
    case "connector_missing":
      return base("connector_required", connector, operation, capabilityState, "allowed", false, `No ${conn} connector is available — admin setup is required.`, "route", confidence, executionType);
    case "policy_blocked":
      return base("blocked", connector, operation, capabilityState, "blocked", true, `Org policy blocks this ${conn} action — approval is required.`, "request_approval", confidence, executionType);
    case "insufficient_context":
      return base("blocked", connector, operation, capabilityState, "unknown", false, "Otzar needs one more detail (who / which resource) before acting.", "ask_one_question", confidence, executionType);
    case null:
    default:
      // Capability not yet resolved — be conservative: treat as setup-required.
      return base("connector_required", connector, operation, capabilityState, "unknown", false, `${conn} access hasn't been verified — setup may be required.`, "route", confidence, executionType);
  }
}

function base(
  executionMode: ExecutionMode,
  requiredConnector: RequiredConnector,
  requiredCapability: ConnectorOperation | null,
  capabilityState: ConnectorCapabilityState | null,
  policyStatus: PolicyStatus,
  approvalRequired: boolean,
  blockerReason: string | null,
  nextBestAction: NextBestAction,
  confidence: "high" | "medium" | "low",
  executionType: ExecutionType,
): ExecutionPlan {
  return {
    executionType,
    executionMode,
    requiredConnector,
    requiredCapability,
    capabilityState,
    policyStatus,
    approvalRequired,
    blockerReason,
    nextBestAction,
    confidence,
  };
}
