// FILE: ledger-patch-auth.ts
// PURPOSE: Field-level authorization for Work Ledger PATCH.
//          Distinguishes owner / requester / target / manager /
//          non-party. Pure — unit-testable without Prisma.
// CONNECTS TO: work-ledger.service patchLedgerEntry.

export type LedgerPatchField =
  | "status"
  | "next_action"
  | "priority"
  | "project_id"
  | "proposed_action_id"
  | "audit_event_id";

export type LedgerActorRole =
  | "owner"
  | "requester"
  | "target_only"
  | "manager"
  | "non_party";

export interface LedgerPatchAuthInput {
  caller_entity_id: string;
  is_manager: boolean;
  owner_entity_id: string | null;
  requester_entity_id: string | null;
  target_entity_id: string | null;
  /** Fields present on this PATCH body (only those being changed). */
  fields: LedgerPatchField[];
  /** Proposed status when fields includes "status". */
  next_status?: string;
}

export type LedgerPatchAuthResult =
  | { ok: true; role: LedgerActorRole; allowed_fields: LedgerPatchField[] }
  | {
      ok: false;
      code: "FORBIDDEN" | "NOT_FOUND";
      message: string;
      role: LedgerActorRole;
      denied_fields: LedgerPatchField[];
    };

const DONE = new Set(["EXECUTED", "VERIFIED"]);

/**
 * WHAT: Resolve the caller's relationship to a ledger row.
 * INPUT: identity + owner/requester/target + manager flag.
 * OUTPUT: LedgerActorRole (manager wins over party roles for capability).
 * WHY: Field rules differ by relationship; managers need explicit scope.
 */
export function resolveLedgerActorRole(input: {
  caller_entity_id: string;
  is_manager: boolean;
  owner_entity_id: string | null;
  requester_entity_id: string | null;
  target_entity_id: string | null;
}): LedgerActorRole {
  const isOwner = input.owner_entity_id === input.caller_entity_id;
  const isRequester = input.requester_entity_id === input.caller_entity_id;
  const isTarget = input.target_entity_id === input.caller_entity_id;
  // Manager capability is additive for org ops, but owner/requester roles
  // still matter for field rules when not a manager.
  if (input.is_manager) return "manager";
  if (isOwner) return "owner";
  if (isRequester) return "requester";
  if (isTarget) return "target_only";
  return "non_party";
}

/**
 * WHAT: Decide whether a PATCH is allowed field-by-field.
 * INPUT: LedgerPatchAuthInput.
 * OUTPUT: allow with allowed fields, or deny with code.
 * WHY: Prevents unrelated coworker / target-only / contractor overreach
 *      while preserving owner progress, manager priority/reassign, requester
 *      cancel, and execution-bridge owner updates.
 *
 * Field matrix (non-manager):
 *  - owner: status*, next_action, priority, proposed_action_id, audit_event_id
 *  - requester: status CANCELLED only, next_action (clarify)
 *  - target_only: none
 *  - non_party: none (NOT_FOUND — no existence oracle)
 * Manager:
 *  - all fields including project_id
 *  - status COMPLETE allowed (operational repair)
 * Status COMPLETE (EXECUTED/VERIFIED):
 *  - owner or manager only (never requester / target_only)
 */
export function authorizeLedgerPatch(
  input: LedgerPatchAuthInput,
): LedgerPatchAuthResult {
  const role = resolveLedgerActorRole(input);
  const fields = [...new Set(input.fields)];
  if (fields.length === 0) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "empty patch",
      role,
      denied_fields: [],
    };
  }

  if (role === "non_party") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "ledger entry not found",
      role,
      denied_fields: fields,
    };
  }

  if (role === "target_only") {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "target-only participants cannot modify this work",
      role,
      denied_fields: fields,
    };
  }

  const allowed: LedgerPatchField[] = [];
  const denied: LedgerPatchField[] = [];

  for (const field of fields) {
    let fieldOk = false;
    switch (field) {
      case "project_id":
        fieldOk = role === "manager";
        break;
      case "priority":
        fieldOk = role === "owner" || role === "manager";
        break;
      case "next_action":
        fieldOk =
          role === "owner" || role === "manager" || role === "requester";
        break;
      case "proposed_action_id":
      case "audit_event_id":
        // Execution bridge (owner) + managers.
        fieldOk = role === "owner" || role === "manager";
        break;
      case "status": {
        const st = input.next_status ?? "";
        if (DONE.has(st)) {
          fieldOk = role === "owner" || role === "manager";
        } else if (st === "CANCELLED") {
          fieldOk =
            role === "owner" || role === "requester" || role === "manager";
        } else {
          // Progress / operational states: owner or manager only.
          // Requesters may not force DETECTED→PROPOSED on someone else's work.
          fieldOk = role === "owner" || role === "manager";
        }
        break;
      }
      default:
        fieldOk = false;
    }
    if (fieldOk) allowed.push(field);
    else denied.push(field);
  }

  if (denied.length > 0) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `not authorized to modify: ${denied.join(", ")}`,
      role,
      denied_fields: denied,
    };
  }

  return { ok: true, role, allowed_fields: allowed };
}
