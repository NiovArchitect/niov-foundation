// FILE: handlers.ts
// PURPOSE: Per-ActionType executor handler registry for the ADR-0057
//          Action runtime. Returns a discriminated SUCCESS / FAILURE /
//          TIMEOUT shape consumed by the executor. As of the
//          [ADR-0057-RECORD-CAPSULE-HANDLER-EXECUTE-VERIFY-AUTH]
//          wave, RECORD_CAPSULE is a REAL handler wired to
//          WriteService.createCapsuleForActionRunner;
//          SEND_INTERNAL_NOTIFICATION and PROPOSE_PERMISSION_GRANT
//          remain stubs pending their own future capability waves.
// CONNECTS TO:
//   - apps/api/src/services/action/executor.ts (calls the registry's
//     execute method; the executor wraps the call with the
//     per-attempt timeout + retry budget per ADR-0057 §11)
//   - apps/api/src/services/action/lifecycle.service.ts
//     (RETRY_BUDGET + ATTEMPT_TIMEOUT_MS_DEFAULT)
//   - apps/api/src/services/action/action-payload-validators.ts
//     (the RECORD_CAPSULE handler re-runs the same validator the
//     create-time service used so the typed RecordCapsulePayload
//     shape is the single source of truth)
//   - apps/api/src/services/cosmp/write.service.ts
//     (createCapsuleForActionRunner — the system-path variant)
//   - apps/api/src/server.ts (constructs the registry with
//     WriteService injected; wires it into the executor)
//   - packages/database/prisma/schema.prisma (ActionType enum)
//   - ADR-0057 §11 (idempotency / retries / timeout / cancellation)
//
// DESIGN NOTE:
//   Pre-wave, handlers.ts was a pure module exporting
//   executeActionHandler(action) directly. The introduction of a
//   real handler that needs WriteService forced a transition to a
//   dependency-injected registry. The executor accepts the registry
//   via a module-level default that server.ts replaces at boot, so
//   existing call sites (and the test-marker contract) remain
//   unchanged at the executor boundary.

import type { Action, ActionType } from "@prisma/client";
import type { WriteService } from "../cosmp/write.service.js";
import { validateRecordCapsulePayload } from "./action-payload-validators.js";

// WHAT: The handler outcome discriminator. SUCCESS produces an
//        ActionResult row; FAILURE produces an ActionAttempt row with
//        outcome=FAILED + error_class; TIMEOUT is what the executor
//        synthesizes when the per-attempt timer fires, or what a
//        handler can self-report via the test marker.
export type ActionHandlerOutcome = "SUCCESS" | "FAILURE" | "TIMEOUT";

// WHAT: The discriminated handler-result the executor consumes.
//        SUCCESS carries result_summary + result_metadata that land
//        on ActionResult. FAILURE / TIMEOUT carry error_class +
//        error_summary that land on ActionAttempt. None of these
//        ever echo raw payload / raw envelope / stack traces — the
//        executor + lifecycle.service.ts re-assert the audit
//        allowlist on top of this contract.
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

// WHAT: Test-only marker keys inspected on Action.payload_redacted.
// INPUT: None.
// OUTPUT: Literal strings.
// WHY: Integration tests need to drive FAILURE / TIMEOUT paths
//      through the create route. Inspecting Action.payload_redacted
//      for these markers is the controlled side-channel. Production
//      callers never set these keys (the create-time validator for
//      RECORD_CAPSULE rejects unknown payload fields by NOT
//      validating them, but the marker-only stub paths never reach
//      the RECORD_CAPSULE validator because the integration tests
//      using markers target action_types whose validator is the
//      no-op stub).
export const TEST_MARKER_FORCE_FAILURE = "__test_force_failure__";
export const TEST_MARKER_FORCE_TIMEOUT = "__test_force_timeout__";

// WHAT: The Action fields a handler reads. Widened from the prior
//        wave's Pick (action_id, action_type, payload_redacted) to
//        include source_entity_id because the real RECORD_CAPSULE
//        handler attributes the capsule write to the source entity
//        via WriteService.createCapsuleForActionRunner.
export type HandlerActionInput = Pick<
  Action,
  "action_id" | "action_type" | "source_entity_id" | "payload_redacted"
>;

// WHAT: Inspect Action.payload_redacted for a test-only marker.
// INPUT: An Action row (only payload_redacted is consulted).
// OUTPUT: The marker outcome to synthesize, or null if no marker.
// WHY: Pure, internal helper.
function detectTestMarker(
  action: HandlerActionInput,
): "FAILURE" | "TIMEOUT" | null {
  const payload = action.payload_redacted;
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  if (obj[TEST_MARKER_FORCE_FAILURE] === true) return "FAILURE";
  if (obj[TEST_MARKER_FORCE_TIMEOUT] === true) return "TIMEOUT";
  return null;
}

// WHAT: Map a WriteService failure code to a stable handler
//        error_class string. The handler's error_class is the
//        forensic key the audit row exposes (SAFE-allowlisted by
//        lifecycle.service.ts); using a stable enum-bound prefix
//        prevents WriteService's internal code evolutions from
//        leaking into the audit chain.
function writeFailureToErrorClass(code: string): string {
  return `WRITE_${code}`;
}

// WHAT: The single handler dispatch contract every per-ActionType
//        handler implementation must satisfy.
// INPUT: A HandlerActionInput.
// OUTPUT: A Promise<ActionHandlerResult>.
// WHY: Pure function shape so the registry stays simple. Handlers
//      that need dependencies receive them via closure at
//      registry-construction time (see makeActionHandlerRegistry).
export type ActionHandlerFn = (
  action: HandlerActionInput,
) => Promise<ActionHandlerResult>;

// WHAT: The dispatch registry the executor calls into.
// INPUT: Used as a return type.
// OUTPUT: None.
// WHY: One shape so the executor's call site stays one line
//      (`await registry.execute(action)`).
export interface ActionHandlerRegistry {
  execute(action: HandlerActionInput): Promise<ActionHandlerResult>;
}

// WHAT: The dependencies a registry needs to operate. Optional
//        because the default registry exposes stubs only (no
//        WriteService) when constructed outside server.ts (e.g. in
//        early tests).
export interface ActionHandlerRegistryDeps {
  writeService?: WriteService;
}

// WHAT: Build the canonical safe stub-success metadata. Used by the
//        two ActionTypes whose real handler has not yet landed.
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

// WHAT: The shared marker-aware stub handler. If the action's
//        payload carries a test marker, return the corresponding
//        FAILURE / TIMEOUT shape. Otherwise return the canonical
//        stub success.
function makeStubHandler(actionType: ActionType): ActionHandlerFn {
  return async (action) => {
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
    const built = stubSuccessMetadata(actionType);
    return {
      outcome: "SUCCESS",
      result_summary: built.result_summary,
      result_metadata: built.result_metadata,
    };
  };
}

// WHAT: The real RECORD_CAPSULE handler. Unpacks
//        Action.payload_redacted through the same validator
//        action.service.ts ran at create-time (single source of
//        truth), then calls WriteService.createCapsuleForActionRunner
//        with the typed input. Returns SAFE result_metadata
//        containing capsule_id + capsule_type only — never the raw
//        content / payload / embedding.
function makeRecordCapsuleHandler(
  writeService: WriteService,
): ActionHandlerFn {
  return async (action) => {
    // Test markers take precedence so integration tests can still
    // exercise FAILURE / TIMEOUT paths without dispatching a real
    // write. Production callers never include these keys.
    const marker = detectTestMarker(action);
    if (marker === "FAILURE") {
      return {
        outcome: "FAILURE",
        error_class: "STUB_FORCED_FAILURE",
        error_summary: "test-forced failure",
      };
    }
    if (marker === "TIMEOUT") {
      return {
        outcome: "TIMEOUT",
        error_class: "STUB_FORCED_TIMEOUT",
        error_summary: "test-forced timeout",
      };
    }
    // Re-run the canonical create-time validator so the typed
    // RecordCapsulePayload shape is the single source of truth. The
    // action.service.ts already validated at create-time; this
    // re-run is belt-and-suspenders against future drift and gives
    // us the typed normalized input without re-parsing.
    const validated = validateRecordCapsulePayload(action.payload_redacted);
    if (validated.ok === false) {
      return {
        outcome: "FAILURE",
        error_class: "PAYLOAD_INVALID_AT_EXECUTE",
        error_summary: `payload failed re-validation: ${validated.invalid_fields.join(",")}`,
      };
    }
    try {
      const result = await writeService.createCapsuleForActionRunner({
        actor_entity_id: action.source_entity_id,
        action_id: action.action_id,
        input: validated.normalized,
      });
      if (result.ok === true) {
        // SAFE result_metadata: capsule_id + capsule_type ONLY. No
        // content, no payload_summary, no payload_redacted, no
        // storage_location, no content_hash (the audit row carries
        // content_hash + payload_size_tokens; the action result is
        // the caller-visible surface and must stay payload-free).
        return {
          outcome: "SUCCESS",
          result_summary: `record_capsule_ok:${result.capsule_id.slice(0, 8)}`,
          result_metadata: {
            handler: "record_capsule",
            action_type: "RECORD_CAPSULE",
            capsule_id: result.capsule_id,
            capsule_type: validated.normalized.capsule_type,
          },
        };
      }
      // Map WriteFailure to handler FAILURE. Stable error_class
      // prefix + bounded error_summary; lifecycle.service.ts will
      // additionally clamp.
      const errorClass =
        result.code === "OPERATION_NOT_PERMITTED"
          ? "TAR_DEMOTED"
          : writeFailureToErrorClass(result.code);
      return {
        outcome: "FAILURE",
        error_class: errorClass,
        error_summary: result.message,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        outcome: "FAILURE",
        error_class: "WRITE_EXCEPTION",
        // error_summary is clamped at 200 chars by
        // lifecycle.service.ts; safe to pass through.
        error_summary: msg,
      };
    }
  };
}

// WHAT: Build the per-ActionType handler dispatch map for the
//        registry. RECORD_CAPSULE wires to the real handler when
//        writeService is provided; otherwise falls back to the
//        stub. Other ActionTypes stay stubs.
function buildHandlerMap(
  deps: ActionHandlerRegistryDeps,
): Record<ActionType, ActionHandlerFn> {
  const recordCapsuleHandler: ActionHandlerFn =
    deps.writeService !== undefined
      ? makeRecordCapsuleHandler(deps.writeService)
      : makeStubHandler("RECORD_CAPSULE");
  return {
    RECORD_CAPSULE: recordCapsuleHandler,
    SEND_INTERNAL_NOTIFICATION: makeStubHandler("SEND_INTERNAL_NOTIFICATION"),
    PROPOSE_PERMISSION_GRANT: makeStubHandler("PROPOSE_PERMISSION_GRANT"),
  };
}

// WHAT: Construct an ActionHandlerRegistry with the supplied
//        dependencies. Called from server.ts at boot to inject
//        WriteService, and from tests that want the stub-only
//        registry.
export function makeActionHandlerRegistry(
  deps: ActionHandlerRegistryDeps = {},
): ActionHandlerRegistry {
  const map = buildHandlerMap(deps);
  return {
    async execute(action) {
      const handler = map[action.action_type];
      if (handler === undefined) {
        return {
          outcome: "FAILURE",
          error_class: "UNKNOWN_ACTION_TYPE",
          error_summary: `no handler registered for action_type=${String(action.action_type)}`,
        };
      }
      return handler(action);
    },
  };
}

// WHAT: Module-level default registry. The executor uses this when
//        no override is supplied. server.ts replaces it at boot via
//        setDefaultActionHandlerRegistry so the real RECORD_CAPSULE
//        handler is wired in production; tests can replace it via
//        the executor's options or by calling
//        setDefaultActionHandlerRegistry directly.
let defaultRegistry: ActionHandlerRegistry = makeActionHandlerRegistry({});

// WHAT: Replace the module-level default registry. Called from
//        server.ts at boot after WriteService is constructed; can
//        also be called from tests that need the real
//        RECORD_CAPSULE handler under buildApp.
export function setDefaultActionHandlerRegistry(
  registry: ActionHandlerRegistry,
): void {
  defaultRegistry = registry;
}

// WHAT: The legacy executeActionHandler surface preserved for
//        backwards compatibility with the prior wave's executor
//        call. Internally dispatches through the module-level
//        default registry.
// INPUT: A HandlerActionInput.
// OUTPUT: A Promise<ActionHandlerResult>.
// WHY: The executor.ts call site uses executeActionHandler(action);
//      preserving that surface keeps the executor edit narrow.
export async function executeActionHandler(
  action: HandlerActionInput,
): Promise<ActionHandlerResult> {
  return defaultRegistry.execute(action);
}
