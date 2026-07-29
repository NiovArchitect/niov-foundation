// FILE: approval-quarantine.ts
// PURPOSE: Slice 6 — durable classification of malformed approvals so they
//          never appear as active "Needs me" decisions. Pure; list service
//          filters PROPOSED actions that fail the gate.
// CONNECTS TO: action/list.service.ts, CT actionExecutability.

import type { SafeActionView } from "./views.js";

export type ApprovalQuarantineClass =
  | "ok"
  | "repairable"
  | "invalid"
  | "expired"
  | "historical";

export interface ApprovalQuarantineResult {
  class: ApprovalQuarantineClass;
  /** When false, must not appear in active Needs me. */
  active_reviewable: boolean;
  reason: string;
}

const TERMINAL = new Set([
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "EXECUTED",
  "FAILED",
]);

/**
 * WHAT: Classify whether a SafeActionView is reviewable.
 * INPUT: projected SafeActionView (labels already resolved).
 * OUTPUT: quarantine class + active_reviewable.
 * WHY: Zero blind approvals at server list tier, not only UI.
 */
export function classifyApprovalForNeedsMe(
  a: SafeActionView,
): ApprovalQuarantineResult {
  if (TERMINAL.has(a.status)) {
    return {
      class: "historical",
      active_reviewable: false,
      reason: "Terminal or historical action",
    };
  }
  if (a.status !== "PROPOSED") {
    return {
      class: "ok",
      active_reviewable: false,
      reason: "Not awaiting approval",
    };
  }
  if (a.escalation_id == null || a.escalation_id.length === 0) {
    return {
      class: "repairable",
      active_reviewable: false,
      reason: "Missing dual-control escalation pairing",
    };
  }
  const target =
    typeof a.target_label === "string" && a.target_label.trim().length > 0
      ? a.target_label.trim()
      : null;
  if (target === null) {
    return {
      class: "invalid",
      active_reviewable: false,
      reason: "Recipient unavailable — cannot approve without a person",
    };
  }
  // Missing requester is incomplete context for a consequential approval.
  const requester =
    typeof a.requester_label === "string" && a.requester_label.trim().length > 0
      ? a.requester_label.trim()
      : null;
  if (requester === null) {
    return {
      class: "repairable",
      active_reviewable: false,
      reason: "Requester unavailable — incomplete approval context",
    };
  }
  // action_type is the human-facing preview of what would execute.
  if (
    typeof a.action_type !== "string" ||
    a.action_type.trim().length === 0 ||
    a.action_type === "UNKNOWN"
  ) {
    return {
      class: "invalid",
      active_reviewable: false,
      reason: "Missing action preview — cannot approve blindly",
    };
  }
  return {
    class: "ok",
    active_reviewable: true,
    reason: "Awaiting human judgment",
  };
}

/**
 * WHAT: Filter list items for active Needs me (reviewable only).
 * INPUT: SafeActionView[].
 * OUTPUT: { reviewable, quarantined }.
 */
export function partitionApprovalsForNeedsMe(items: readonly SafeActionView[]): {
  reviewable: SafeActionView[];
  quarantined: Array<SafeActionView & { quarantine: ApprovalQuarantineResult }>;
} {
  const reviewable: SafeActionView[] = [];
  const quarantined: Array<
    SafeActionView & { quarantine: ApprovalQuarantineResult }
  > = [];
  for (const a of items) {
    const q = classifyApprovalForNeedsMe(a);
    if (q.active_reviewable) {
      reviewable.push(a);
    } else if (a.status === "PROPOSED") {
      quarantined.push({ ...a, quarantine: q });
    }
  }
  return { reviewable, quarantined };
}
