// FILE: routing-decision.ts
// PURPOSE: [PROD-UX-P0R] The routing/autonomy decision PROJECTION for the
//          Otzar Work OS. A pure, deterministic read over ALREADY-PERSISTED
//          decider outputs on a Work Ledger row (status, authority fields,
//          details.execution_plan from execution-planner.ts, evidence, links).
//          It answers ONE question for the UI: "which lane is this work in,
//          and why — in plain language". It NEVER recomputes policy, NEVER
//          calls an LLM, NEVER mutates anything, and NEVER invents a second
//          autonomy system: every signal it reads was decided elsewhere
//          (execution-planner, execution-bridge, work-item-planner P0D).
// CONNECTS TO: work-ledger.service.ts (getMyWork attaches `routing`;
//          WorkLedgerView is the canonical input shape), work-os-ledger.routes.ts
//          (GET /api/v1/work-os/ledger/:id/routing-decision),
//          otzar/execution-planner.ts (the persisted ExecutionPlan vocabulary),
//          otzar/work-item-planner.ts (isPronounOrNonName — P0D identity truth),
//          otzar/execution-bridge.ts (NEEDS_APPROVAL + proposed_action_id is the
//          persisted dual-control/escalation linkage), tests/unit/routing-decision.test.ts.

import { isPronounOrNonName } from "../otzar/work-item-planner.js";

/** The routing lane a ledger row sits in. First-match-wins precedence is
 *  documented on projectRoutingDecision (identity_review → blocked →
 *  setup_required → escalate → ask_approval → execute_when_allowed →
 *  draft_ready → notify_owner → silent_routing → silent_capture). */
export type RoutingLane =
  | "silent_capture"
  | "silent_routing"
  | "notify_owner"
  | "draft_ready"
  | "execute_when_allowed"
  | "ask_approval"
  | "escalate"
  | "blocked"
  | "setup_required"
  | "identity_review";

export interface RoutingDecisionView {
  lane: RoutingLane;
  /** A plain-language human sentence. NEVER backend jargon: no enum literals,
   *  no underscores, no "envelope"/"binding"/"MCP". */
  reason: string;
  risk: "low" | "medium" | "high";
  /** 0..1. Plan confidence maps high→0.9 / medium→0.6 / low→0.3; falls back
   *  to the row's persisted confidence_score; null when neither exists. */
  confidence: number | null;
  /** The persisted machine basis (policy_reason_code ?? authority_decision) —
   *  raw, for audit surfaces; the human text lives in `reason`. */
  policy_basis: string | null;
  owner_entity_id: string | null;
  owner_status: "resolved" | "needs_review" | "unowned";
  next_best_action: string | null;
  /** The raw requiredConnector token (e.g. "SLACK") when an external tool is
   *  involved; null for internal/human work. The human label is in `reason`. */
  required_tool: string | null;
  evidence_refs: string[];
  audit_pointer: string | null;
}

/** The structural subset of a ledger entry this projection reads. It is
 *  satisfied by WorkLedgerView (getMyWork / getLedgerEntry output) and by any
 *  row-shaped object carrying the same persisted fields. Everything beyond
 *  `status` is optional/nullable so a sparse row (no details, no plan) still
 *  projects safely — never a crash. */
export interface RoutingProjectionInput {
  status: string;
  owner_entity_id?: string | null;
  owner_display_name?: string | undefined;
  conversation_id?: string | null;
  proposed_action_id?: string | undefined;
  audit_event_id?: string | null | undefined;
  authority_decision?: string | null;
  policy_reason_code?: string | null;
  confidence_score?: number | null;
  evidence?: unknown;
  next_action?: string | null;
  execution_plan?: Record<string, unknown> | undefined;
  source_message_id?: string | undefined;
}

// ── Status vocabularies (subset of LEDGER_STATUSES in work-ledger.service.ts) ──

// "Waiting on the owner's attention" review states that are NOT approval —
// the notify_owner lane. NEEDS_OWNER is identity (lane a); NEEDS_APPROVAL is
// escalation/approval (lanes d/e).
const NOTIFY_OWNER_STATUSES: ReadonlySet<string> = new Set([
  "NEEDS_TARGET_RESOLUTION",
  "NEEDS_PARTICIPANT_CONFIRMATION",
  "NEEDS_SELECTED_TIME",
  "NEEDS_AUTHORITY",
  "NEEDS_CALLER_CONFIRMATION",
  "RUNTIME_MISSING",
]);

// Open / in-progress statuses — owned human work in one of these rides the
// silent_routing lane.
const OPEN_STATUSES: ReadonlySet<string> = new Set([
  "DETECTED",
  "INFERRED",
  "DRAFT",
  "PROPOSED",
  "READY_TO_EXECUTE",
  "EXECUTING",
]);

// Statuses where an approval ask is still live ("a PROPOSED/pending action").
// Once work is EXECUTING/EXECUTED/VERIFIED the approval moment has passed.
const APPROVAL_PENDING_STATUSES: ReadonlySet<string> = new Set([
  "DETECTED",
  "INFERRED",
  "DRAFT",
  "PROPOSED",
  "NEEDS_APPROVAL",
  "READY_TO_EXECUTE",
]);

// capabilityState values (connector-capability.ts vocabulary) that mean
// "setup is required before Otzar can act" — the setup_required lane.
const SETUP_CAPABILITY_STATES: ReadonlySet<string> = new Set([
  "available_needs_user_auth",
  "available_needs_admin_auth",
  "not_connected",
  "connector_missing",
]);

// Human labels for the RequiredConnector vocabulary (connector-capability.ts).
// Used ONLY inside `reason` text; `required_tool` carries the raw token.
const TOOL_LABELS: Readonly<Record<string, string>> = {
  SLACK: "Slack",
  GOOGLE_WORKSPACE: "Google Workspace",
  MICROSOFT_365: "Microsoft 365",
  JIRA: "Jira",
  LINEAR: "Linear",
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  NOTION: "Notion",
  CONFLUENCE: "Confluence",
  CALENDAR: "the calendar",
  GMAIL: "Gmail",
  MCP_SERVER: "a connected tool",
};

// ── Small pure helpers ───────────────────────────────────────────────────────

function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// WHAT: read the persisted ExecutionPlan fields (camelCase, execution-planner.ts
//        shape) out of the opaque execution_plan record.
// INPUT: the entry's execution_plan (details.execution_plan projection) or undefined.
// OUTPUT: the typed-loose plan fields, all null when absent — never throws.
// WHY: the plan is stored as Json; a projection must tolerate any historical shape.
function readPlan(plan: Record<string, unknown> | undefined): {
  executionMode: string | null;
  policyStatus: string | null;
  capabilityState: string | null;
  requiredConnector: string | null;
  approvalRequired: boolean;
  blockerReason: string | null;
  nextBestAction: string | null;
  confidence: string | null;
} {
  const p = asObj(plan);
  return {
    executionMode: p !== null ? asStr(p["executionMode"]) : null,
    policyStatus: p !== null ? asStr(p["policyStatus"]) : null,
    capabilityState: p !== null ? asStr(p["capabilityState"]) : null,
    requiredConnector: p !== null ? asStr(p["requiredConnector"]) : null,
    approvalRequired: p !== null && p["approvalRequired"] === true,
    blockerReason: p !== null ? asStr(p["blockerReason"]) : null,
    nextBestAction: p !== null ? asStr(p["nextBestAction"]) : null,
    confidence: p !== null ? asStr(p["confidence"]) : null,
  };
}

// WHAT: turn a raw connector token into human words for `reason` text.
// INPUT: the raw requiredConnector token (may be null).
// OUTPUT: a human label ("Slack", "Google Workspace", "the required tool").
// WHY: reasons must read like a sentence, never like an enum.
function toolLabel(connector: string | null): string {
  if (connector === null) return "the required tool";
  return TOOL_LABELS[connector] ?? "the required tool";
}

// WHAT: strip backend jargon out of a stored human-ish sentence (e.g. a
//        blockerReason or next_action that interpolated a raw connector token).
// INPUT: any string destined for `reason`.
// OUTPUT: the same sentence with enum tokens humanized and underscores removed.
// WHY: reason is a customer-facing sentence — enum literals ("GOOGLE_WORKSPACE",
//      "MCP") and snake_case must never leak through, whatever was persisted.
function humanizeSentence(text: string): string {
  let out = text;
  for (const [token, label] of Object.entries(TOOL_LABELS)) {
    out = out.split(token).join(label);
  }
  out = out.split("MCP").join("tool");
  out = out.split("_").join(" ");
  return out;
}

// WHAT: map the plan's "high"|"medium"|"low" confidence to a number, falling
//        back to the row's persisted confidence_score.
// OUTPUT: 0.9 / 0.6 / 0.3, else confidence_score, else null.
// WHY: RoutingDecisionView.confidence is numeric; the persisted plan confidence
//      is categorical. The mapping is fixed + documented (deterministic).
function numericConfidence(
  planConfidence: string | null,
  confidenceScore: number | null | undefined,
): number | null {
  if (planConfidence === "high") return 0.9;
  if (planConfidence === "medium") return 0.6;
  if (planConfidence === "low") return 0.3;
  return typeof confidenceScore === "number" ? confidenceScore : null;
}

// WHAT: collect non-null evidence references — the conversation link, the
//        source thread message, and any ref-shaped string fields trivially
//        extractable from the persisted evidence Json array.
// OUTPUT: a de-duplicated string list (possibly empty; never null items).
// WHY: the UI's "why is this here" affordance needs pointers, not payloads —
//      quotes/transcripts stay in the evidence surface itself.
function collectEvidenceRefs(entry: RoutingProjectionInput): string[] {
  const refs: string[] = [];
  const push = (v: unknown): void => {
    const s = asStr(v);
    if (s !== null && !refs.includes(s)) refs.push(s);
  };
  push(entry.conversation_id);
  push(entry.source_message_id);
  if (Array.isArray(entry.evidence)) {
    for (const item of entry.evidence) {
      const o = asObj(item);
      if (o === null) continue;
      // Only ref-shaped keys — never quote/speaker payload text.
      for (const key of ["source_message_id", "message_id", "source_ref", "ref"]) {
        push(o[key]);
      }
    }
  }
  return refs;
}

// WHAT: is a non-empty owner display name present AND pronoun/non-name-shaped
//        (the P0D "Owner needs review" identity outcome)?
// WHY: P0D (commit 0e08d32) forbids showing a pronoun as an owner; a row whose
//      only "owner" is a pronoun needs identity review, whatever its status.
function ownerNameNeedsReview(entry: RoutingProjectionInput): boolean {
  const name = entry.owner_display_name;
  return typeof name === "string" && name.trim().length > 0 && isPronounOrNonName(name);
}

// WHAT: does the plan target an EXTERNAL tool write (vs internal/human work)?
// WHY: external writes carry the highest blast radius — they raise the risk
//      tier for approval/escalation/blocked lanes.
function isExternalToolWork(requiredConnector: string | null): boolean {
  return requiredConnector !== null && requiredConnector !== "NONE" && requiredConnector !== "INTERNAL";
}

// ── The projection ───────────────────────────────────────────────────────────

/**
 * WHAT: project one Work Ledger entry into its routing/autonomy decision view.
 *       PURE + deterministic — reads persisted fields only; no IO, no policy
 *       recomputation, no mutation.
 * INPUT: a WorkLedgerView (or any row-shaped object with the same persisted
 *        fields — see RoutingProjectionInput). Sparse rows are fine.
 * OUTPUT: RoutingDecisionView — lane + plain-language reason + risk +
 *         confidence + governance pointers.
 * WHY: My Work / the Work OS UI needs ONE calm answer per row: "what happens
 *      next and why". All deciders already ran (execution-planner, the
 *      execution bridge, P0D identity truth); this only surfaces their outputs.
 *
 * LANE PRECEDENCE (first match wins):
 *  a. identity_review     — status NEEDS_OWNER, or a pronoun/non-name owner
 *                           display (P0D semantics).
 *  b. blocked             — plan executionMode/policyStatus "blocked", or the
 *                           row status is BLOCKED (the execution bridge patches
 *                           status BLOCKED when a run is refused).
 *  c. setup_required      — plan mode connector_required/permission_required,
 *                           or a setup-class capabilityState.
 *  d. escalate            — status NEEDS_APPROVAL with a linked governed Action
 *                           (proposed_action_id). The bridge does NOT persist an
 *                           escalation id on the row; NEEDS_APPROVAL + the Action
 *                           link IS the persisted dual-control pairing.
 *  e. ask_approval        — plan approvalRequired / mode
 *                           otzar_can_execute_with_approval / policyStatus
 *                           requires_approval (or bare NEEDS_APPROVAL), while
 *                           the ask is still pending.
 *  f. execute_when_allowed— mode otzar_can_execute_when_policy_allows with
 *                           policyStatus allowed.
 *  g. draft_ready         — mode otzar_can_draft.
 *  h. notify_owner        — non-approval NEEDS_* review states + RUNTIME_MISSING.
 *  i. silent_routing      — resolved owner + open/in-progress status where the
 *                           work is human-owned (mode human_must_do, or no plan
 *                           at all — unplanned owned work defaults to human).
 *  j. silent_capture      — everything else (informational/captured/done rows).
 *
 * RISK (deterministic; no risk tier is persisted on ledger rows — the autonomy
 * model's ActionRisk is not stored — so it derives from the lane + plan):
 *  blocked with policyStatus "blocked" → high; other blocked → medium;
 *  escalate/ask_approval → high when an external tool write is involved, else
 *  medium; setup_required/identity_review → medium; all other lanes → low.
 */
export function projectRoutingDecision(entry: RoutingProjectionInput): RoutingDecisionView {
  const plan = readPlan(entry.execution_plan);
  const status = entry.status;
  const ownerId = entry.owner_entity_id ?? null;
  const externalTool = isExternalToolWork(plan.requiredConnector);
  const toolName = toolLabel(plan.requiredConnector);

  // Owner status is computed once, independent of lane.
  const ownerStatus: RoutingDecisionView["owner_status"] =
    status === "NEEDS_OWNER" || ownerNameNeedsReview(entry)
      ? "needs_review"
      : ownerId !== null
        ? "resolved"
        : "unowned";

  // ── Lane selection (first match wins; see the precedence table above) ──
  let lane: RoutingLane;
  let reason: string;
  let risk: RoutingDecisionView["risk"];

  if (status === "NEEDS_OWNER" || ownerNameNeedsReview(entry)) {
    // a. identity_review
    lane = "identity_review";
    reason = "The owner of this work isn't confirmed yet — a person needs to review and assign it before anything moves.";
    risk = "medium";
  } else if (
    plan.executionMode === "blocked" ||
    plan.policyStatus === "blocked" ||
    status === "BLOCKED"
  ) {
    // b. blocked
    lane = "blocked";
    reason =
      plan.blockerReason !== null
        ? humanizeSentence(plan.blockerReason)
        : plan.policyStatus === "blocked"
          ? "This is held by policy — it won't proceed without an explicit sign-off."
          : "This work is blocked right now — it needs attention before anything can proceed.";
    risk = plan.policyStatus === "blocked" ? "high" : "medium";
  } else if (
    plan.executionMode === "connector_required" ||
    plan.executionMode === "permission_required" ||
    (plan.capabilityState !== null && SETUP_CAPABILITY_STATES.has(plan.capabilityState))
  ) {
    // c. setup_required
    lane = "setup_required";
    reason =
      plan.blockerReason !== null
        ? humanizeSentence(plan.blockerReason)
        : `${toolName.charAt(0).toUpperCase()}${toolName.slice(1)} isn't set up yet — connect it so Otzar can help with this.`;
    risk = "medium";
  } else if (status === "NEEDS_APPROVAL" && typeof entry.proposed_action_id === "string") {
    // d. escalate — the persisted dual-control pairing (bridge: NEEDS_APPROVAL
    // + linked governed Action awaiting a DISTINCT approver).
    lane = "escalate";
    reason = "A second person has to approve this before it runs — it's queued for their sign-off.";
    risk = externalTool ? "high" : "medium";
  } else if (
    (plan.approvalRequired ||
      plan.executionMode === "otzar_can_execute_with_approval" ||
      plan.policyStatus === "requires_approval" ||
      status === "NEEDS_APPROVAL") &&
    APPROVAL_PENDING_STATUSES.has(status)
  ) {
    // e. ask_approval
    lane = "ask_approval";
    reason = externalTool
      ? `Needs your approval before Otzar posts to ${toolName} — outside writes always get a person's sign-off first.`
      : "Needs your approval before Otzar acts — nothing happens without a person signing off.";
    risk = externalTool ? "high" : "medium";
  } else if (
    plan.executionMode === "otzar_can_execute_when_policy_allows" &&
    plan.policyStatus === "allowed"
  ) {
    // f. execute_when_allowed
    lane = "execute_when_allowed";
    reason = "Otzar can handle this on its own — it stays inside what policy already allows.";
    risk = "low";
  } else if (plan.executionMode === "otzar_can_draft") {
    // g. draft_ready
    lane = "draft_ready";
    reason = "Otzar can prepare a draft for you to review — nothing goes out without you.";
    risk = "low";
  } else if (NOTIFY_OWNER_STATUSES.has(status)) {
    // h. notify_owner
    lane = "notify_owner";
    reason = "This is waiting on the owner's attention — a quick confirmation will unblock it.";
    risk = "low";
  } else if (
    ownerId !== null &&
    OPEN_STATUSES.has(status) &&
    (plan.executionMode === "human_must_do" || plan.executionMode === null)
  ) {
    // i. silent_routing — owned, open, human work.
    lane = "silent_routing";
    reason = "Tracked and routed to its owner — nothing is needed from you right now.";
    risk = "low";
  } else {
    // j. silent_capture — informational / captured / completed rows.
    lane = "silent_capture";
    reason = "Captured for the record — nothing needs to happen.";
    risk = "low";
  }

  return {
    lane,
    reason,
    risk,
    confidence: numericConfidence(plan.confidence, entry.confidence_score),
    policy_basis: entry.policy_reason_code ?? entry.authority_decision ?? null,
    owner_entity_id: ownerId,
    owner_status: ownerStatus,
    next_best_action: plan.nextBestAction ?? entry.next_action ?? null,
    required_tool: externalTool ? plan.requiredConnector : null,
    evidence_refs: collectEvidenceRefs(entry),
    audit_pointer: entry.audit_event_id ?? null,
  };
}
