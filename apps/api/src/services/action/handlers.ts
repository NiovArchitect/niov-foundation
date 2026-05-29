// FILE: handlers.ts
// PURPOSE: Stub per-ActionType executor handlers for the ADR-0057
//          lifecycle substrate slice. Returns a discriminated success /
//          failure / timeout shape consumed by the executor; never
//          performs real business work in this slice (no COSMP write, no
//          Permission grant, no notification delivery, no connector
//          execution, no MCP, no browser/native automation, no voice,
//          no edge UI).
// CONNECTS TO:
//   - apps/api/src/services/action/executor.ts (the only caller; the
//     executor wraps the handler with the attempt timeout + retry
//     budget per ADR-0057 §11)
//   - apps/api/src/services/action/lifecycle.service.ts (defines the
//     RETRY_BUDGET + ATTEMPT_TIMEOUT_MS_DEFAULT the executor consults)
//   - packages/database/prisma/schema.prisma (ActionType enum)
//   - ADR-0057 §11 (idempotency / retries / timeout / cancellation)
//
// FOUNDER LOCKS (per [ADR-0057-EXECUTOR-WORKER-SCHEDULER-EXECUTE-VERIFY-
//                AUTH-WITH-GAP-LOCKS]):
//   - LOCK-GAP-3 (ActionType handlers): STUB handlers for all 3 initial
//     ActionTypes. RECORD_CAPSULE / SEND_INTERNAL_NOTIFICATION /
//     PROPOSE_PERMISSION_GRANT all return success with safe stub
//     metadata. Forward-substrate for real per-ActionType handlers is
//     a separate QLOCK.
//   - Test-only failure/timeout markers: the executor needs an
//     end-to-end way to exercise the FAILED + TIMED_OUT branches.
//     Inspecting `Action.payload_redacted` for a controlled marker
//     (`__test_force_failure__` / `__test_force_timeout__`) lets the
//     integration tests drive the failure paths without inventing a
//     side-channel. The markers are never echoed in audit / result
//     metadata; the handler just translates them to the
//     corresponding outcome.

import type { Action, ActionType } from "@prisma/client";

// WHAT: The handler outcome discriminator. SUCCESS produces an
//        ActionResult row; FAILURE produces an ActionAttempt row with
//        outcome=FAILED and an error_class; TIMEOUT is what the executor
//        synthesizes when the per-attempt timer fires before the handler
//        resolves (handlers can also self-report TIMEOUT via the test
//        marker so integration tests don't need a real wall-clock wait).
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: One discriminated shape so the executor's retry / terminal logic
//      has a single switch instead of three argument shapes.
export type ActionHandlerOutcome = "SUCCESS" | "FAILURE" | "TIMEOUT";

// WHAT: The discriminated handler-result the executor consumes.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: result_summary + result_metadata land on ActionResult on SUCCESS;
//      error_class + error_summary land on ActionAttempt on FAILURE /
//      TIMEOUT. None of these fields ever echo raw payload, raw envelope,
//      or stack traces (the executor + lifecycle.service.ts re-assert
//      the audit allowlist on top of this contract).
export type ActionHandlerResult =
  | {
      outcome: "SUCCESS";
      result_summary: string;
      result_metadata: Record<string, unknown>;
    }
  | {
      outcome: "FAILURE";
      error_class: string;
      error_summary: string;
    }
  | {
      outcome: "TIMEOUT";
      error_class: string;
      error_summary: string;
    };

// WHAT: Test-only marker key inspected on `Action.payload_redacted`.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: Centralized so integration tests can drive failure / timeout
//      paths through the create route (which writes the payload through)
//      without smuggling state via env vars. Production callers never
//      include these keys because they originate in test fixtures only.
export const TEST_MARKER_FORCE_FAILURE = "__test_force_failure__";
export const TEST_MARKER_FORCE_TIMEOUT = "__test_force_timeout__";

// WHAT: The minimum Action fields the handler reads.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: The handler should never reach into the full Prisma Action shape
//      (forbidden fields like policy_envelope live there); this narrow
//      Pick locks the read surface at the type level.
type HandlerActionInput = Pick<
  Action,
  "action_id" | "action_type" | "payload_redacted"
>;

// WHAT: Inspect Action.payload_redacted for a test-only marker.
// INPUT: An Action row (only payload_redacted is consulted).
// OUTPUT: The marker outcome to synthesize, or null if no marker.
// WHY: Pure, internal helper. The marker is opt-in: integration tests
//      construct the create-input with the marker key set to true; real
//      production callers never set these keys so the handler proceeds
//      to the SUCCESS stub.
function detectTestMarker(action: HandlerActionInput): "FAILURE" | "TIMEOUT" | null {
  const payload = action.payload_redacted;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  if (obj[TEST_MARKER_FORCE_FAILURE] === true) return "FAILURE";
  if (obj[TEST_MARKER_FORCE_TIMEOUT] === true) return "TIMEOUT";
  return null;
}

// WHAT: Build the canonical safe stub-success metadata. The metadata
//        intentionally omits any payload-derived field.
// INPUT: action_type (string echoed back as a typed enum-bound label).
// OUTPUT: A small frozen-ish object suitable for ActionResult.result_metadata.
// WHY: One builder so every ActionType handler produces the same shape;
//      future per-type handlers can extend the shape additively.
function stubSuccessMetadata(actionType: ActionType): {
  result_summary: string;
  result_metadata: Record<string, unknown>;
} {
  return {
    result_summary: `stub_${String(actionType).toLowerCase()}_ok`,
    result_metadata: {
      handler: "stub",
      action_type: String(actionType),
      status: "completed_stub",
    },
  };
}

// WHAT: The 3 stub handlers per ActionType. All return SUCCESS by
//        default; integration tests drive FAILURE / TIMEOUT through
//        payload markers.
// INPUT: A HandlerActionInput.
// OUTPUT: A Promise<ActionHandlerResult>.
// WHY: Per-type dispatch lives in the registry so adding the real
//      handler later (a separate QLOCK) is a single-line swap.
const HANDLERS: Record<
  ActionType,
  (action: HandlerActionInput) => Promise<ActionHandlerResult>
> = {
  RECORD_CAPSULE: async (action) => {
    const marker = detectTestMarker(action);
    if (marker === "FAILURE") {
      return {
        outcome: "FAILURE",
        error_class: "STUB_FORCED_FAILURE",
        error_summary: "stub handler forced failure for test",
      };
    }
    if (marker === "TIMEOUT") {
      return {
        outcome: "TIMEOUT",
        error_class: "STUB_FORCED_TIMEOUT",
        error_summary: "stub handler forced timeout for test",
      };
    }
    const built = stubSuccessMetadata("RECORD_CAPSULE");
    return {
      outcome: "SUCCESS",
      result_summary: built.result_summary,
      result_metadata: built.result_metadata,
    };
  },
  SEND_INTERNAL_NOTIFICATION: async (action) => {
    const marker = detectTestMarker(action);
    if (marker === "FAILURE") {
      return {
        outcome: "FAILURE",
        error_class: "STUB_FORCED_FAILURE",
        error_summary: "stub handler forced failure for test",
      };
    }
    if (marker === "TIMEOUT") {
      return {
        outcome: "TIMEOUT",
        error_class: "STUB_FORCED_TIMEOUT",
        error_summary: "stub handler forced timeout for test",
      };
    }
    const built = stubSuccessMetadata("SEND_INTERNAL_NOTIFICATION");
    return {
      outcome: "SUCCESS",
      result_summary: built.result_summary,
      result_metadata: built.result_metadata,
    };
  },
  PROPOSE_PERMISSION_GRANT: async (action) => {
    const marker = detectTestMarker(action);
    if (marker === "FAILURE") {
      return {
        outcome: "FAILURE",
        error_class: "STUB_FORCED_FAILURE",
        error_summary: "stub handler forced failure for test",
      };
    }
    if (marker === "TIMEOUT") {
      return {
        outcome: "TIMEOUT",
        error_class: "STUB_FORCED_TIMEOUT",
        error_summary: "stub handler forced timeout for test",
      };
    }
    const built = stubSuccessMetadata("PROPOSE_PERMISSION_GRANT");
    return {
      outcome: "SUCCESS",
      result_summary: built.result_summary,
      result_metadata: built.result_metadata,
    };
  },
};

// WHAT: Dispatch a single attempt on the per-ActionType handler.
// INPUT: An Action row (only the SAFE subset the handler reads).
// OUTPUT: A Promise<ActionHandlerResult>.
// WHY: The executor passes the Action row through; this function is
//      the only place that knows which stub to call. If a future
//      QLOCK adds a new ActionType, both the schema enum AND this map
//      must be extended in the same slice (ADR-0021 deliberate-blocker
//      pattern).
export async function executeActionHandler(
  action: HandlerActionInput,
): Promise<ActionHandlerResult> {
  const handler = HANDLERS[action.action_type];
  if (handler === undefined) {
    return {
      outcome: "FAILURE",
      error_class: "UNKNOWN_ACTION_TYPE",
      error_summary: `no handler registered for action_type=${String(action.action_type)}`,
    };
  }
  return handler(action);
}
