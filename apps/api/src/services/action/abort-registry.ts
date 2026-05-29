// FILE: abort-registry.ts
// PURPOSE: Process-local registry of AbortControllers keyed by
//          Action.action_id. The executor registers a controller when
//          it begins dispatching a RUNNING action and releases it when
//          the handler returns. The cancel service, when granted
//          RUNNING-cancel via break-glass, fires the controller's
//          abort signal so the in-flight attempt can short-circuit
//          rather than running to its per-attempt timeout.
// CONNECTS TO:
//   - apps/api/src/services/action/executor.ts (registers + releases)
//   - apps/api/src/services/action/cancel.service.ts
//     (calls abortAction when a RUNNING-cancel is granted)
//   - apps/api/src/services/action/handlers.ts (handlers receive the
//     AbortSignal via the widened HandlerActionInput; handlers that
//     wrap long-running work can listen for `aborted` to short-circuit)
//   - ADR-0057 §11 (RUNNING → CANCELLED privileged) + ADR-0050 GOVSEC.5
//     break-glass (the gate at the route tier)
//
// SCOPE: Process-local. The current ADR-0057 §11 executor pattern is a
//        single in-process worker (DB-backed in-process executor; no
//        external broker). If the future Elixir/BEAM port per
//        ADR-0028 §Forward Queue / ADR-0030 lands distributed
//        workers, this registry must be replaced with a distributed
//        signal mechanism (Postgres LISTEN/NOTIFY, Phoenix.PubSub,
//        or similar). RULE 13: this is a process-local primitive by
//        design at the current phase.
//
// SAFETY: AbortController is built into Node 18+ (which the repo
//         targets per ADR-0015 Decision H Node 22.11.0 pin). No new
//         dependency. The registry is a plain Map — single-writer
//         per action_id by construction because the executor's
//         transition-early pattern guarantees one worker per action.

// WHAT: Process-local map from action_id to the AbortController the
//        executor created for the in-flight attempt.
// INPUT: None (module-level state).
// OUTPUT: None.
// WHY: Process-local because the current executor is in-process. Map
//      is a single instance per Node process so the cancel service
//      and the executor share it via module import.
const registry = new Map<string, AbortController>();

// WHAT: Register a new AbortController for the given action_id.
// INPUT: action_id (must be a uniquely-identified live RUNNING action).
// OUTPUT: The created AbortController.
// WHY: The executor calls this immediately before dispatching the
//      handler so a parallel cancel request can fire the signal.
//      Returns the controller so the caller can pass `.signal` into
//      the handler and listen for `.aborted`.
// SAFETY: If a controller is already registered for this action_id,
//         it is replaced (the old one is implicitly orphaned). Under
//         the executor's transition-early pattern this never happens
//         in practice — one worker per action — but defensive
//         replacement is safer than throwing.
export function registerActionAbort(action_id: string): AbortController {
  const controller = new AbortController();
  registry.set(action_id, controller);
  return controller;
}

// WHAT: Release (forget) the AbortController for the given action_id.
// INPUT: action_id.
// OUTPUT: None.
// WHY: The executor calls this in a finally-block after the handler
//      returns so the registry doesn't grow without bound. The
//      controller object itself is garbage-collected once both the
//      executor and any in-flight handler closure release their
//      references.
export function releaseActionAbort(action_id: string): void {
  registry.delete(action_id);
}

// WHAT: Fire the abort signal for the given action_id if a controller
//        is currently registered.
// INPUT: action_id + optional reason string.
// OUTPUT: true if a controller was found and aborted; false otherwise.
// WHY: The cancel service calls this when a RUNNING-cancel is granted
//      via break-glass. Returns boolean so the cancel service can log
//      whether the in-flight attempt was successfully signalled (for
//      audit / debugging visibility — NOT for the caller-facing
//      response which already returned 200 from the state-machine
//      transition).
export function abortAction(action_id: string, reason?: string): boolean {
  const controller = registry.get(action_id);
  if (controller === undefined) return false;
  // AbortController.abort() takes an optional reason in Node 18+.
  controller.abort(reason ?? "ACTION_CANCELLED_VIA_BREAK_GLASS");
  return true;
}

// WHAT: Test-only inspection helper. Returns the current size of the
//        registry. Not exported in production index barrel.
// INPUT: None.
// OUTPUT: The Map size.
// WHY: Lets the unit test assert register/release lifecycle without
//      reaching into the module-level Map directly.
export function _testRegistrySize(): number {
  return registry.size;
}
