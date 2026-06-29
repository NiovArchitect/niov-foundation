// FILE: autonomy-policy.ts
// PURPOSE: [SECTION-12-WORKGRAPH] The autonomous-send gate — a placeholder
//          feature flag so the path EXISTS but is HARD-DISABLED. No actual
//          auto-send is enabled anywhere; the live default is draft + approve.
//          When a future tenant turns this on, an action may auto-send ONLY when
//          the flag is enabled for that tenant + action type AND every safety
//          condition holds (confirmed proof path, policy allows, audit, undo).
//          Today `canAutoSend` returns false unconditionally because the flag is
//          off — proven by tests so no action can ever send itself.
// CONNECTS TO: autonomy.ts, recipient-governance.ts, decision-rights.ts,
//              tests/unit/autonomy-policy.test.ts.

import type { RecipientGovernance } from "./recipient-governance.js";
import type { AutonomyDecision } from "./autonomy.js";
import type { DecisionRights } from "./decision-rights.js";

export interface AutoSendPolicy {
  /** Master feature flag. DISABLED by default — the live system never auto-sends. */
  enabled: boolean;
  /** Auto-send is always scoped to a tenant (org) — never global. */
  tenantScoped: boolean;
  /** Only these action types may ever auto-send (empty = none). */
  actionTypesAllowed: string[];
  requiresProofPath: boolean;
  requiresPolicyAllow: boolean;
  requiresAudit: boolean;
  requiresUndoPath: boolean;
}

/** The shipped policy: OFF. Every guard required. */
export const AUTO_SEND_DISABLED: AutoSendPolicy = {
  enabled: false,
  tenantScoped: true,
  actionTypesAllowed: [],
  requiresProofPath: true,
  requiresPolicyAllow: true,
  requiresAudit: true,
  requiresUndoPath: true,
};

/** Is auto-send enabled at all? Hard false while the flag is off. */
export function isAutoSendEnabled(policy: AutoSendPolicy = AUTO_SEND_DISABLED): boolean {
  return policy.enabled === true;
}

/**
 * Whether a specific action may auto-send. Returns false unless the flag is
 * enabled AND the action type is allow-listed AND every safety condition holds.
 * With AUTO_SEND_DISABLED (the shipped default) this is ALWAYS false — no action
 * can ever send itself. The arguments make the future-enable path explicit and
 * auditable; nothing here performs a send.
 */
export function canAutoSend(args: {
  governance: RecipientGovernance;
  autonomy: AutonomyDecision;
  decision?: DecisionRights | null;
  actionType: string;
  hasAuditTrail: boolean;
  hasUndoPath: boolean;
  policy?: AutoSendPolicy;
}): boolean {
  const policy = args.policy ?? AUTO_SEND_DISABLED;
  if (!isAutoSendEnabled(policy)) return false; // shipped default — hard off
  if (!policy.actionTypesAllowed.includes(args.actionType)) return false;
  if (policy.requiresProofPath && !args.autonomy.futureAutoEligible) return false;
  if (policy.requiresPolicyAllow && args.governance.policyStatus !== "allowed") return false;
  if (policy.requiresAudit && !args.hasAuditTrail) return false;
  if (policy.requiresUndoPath && !args.hasUndoPath) return false;
  if (args.decision && args.decision.autonomyBlocked) return false;
  return (
    args.governance.recipientSafety === "confirmed" &&
    args.autonomy.futureAutoEligible &&
    args.autonomy.actionRisk === "low"
  );
}
