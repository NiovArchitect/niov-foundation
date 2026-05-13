// FILE: dual-control.middleware.ts
// PURPOSE: Fastify preHandler that enforces dual-control verification on a
//          privileged endpoint before the route handler runs. The factory
//          requireDualControl(endpoint) takes a PrivilegedEndpoint
//          descriptor (from the sub-phase D runtime registry,
//          apps/api/src/security/privileged-endpoints.ts) and returns an
//          async preHandler bound to that descriptor. Per request:
//            1. read request.auth.entity_id (populated by a prior auth
//               hook); 401 AUTH_REQUIRED if absent (hook-ordering guard);
//            2. write the DUAL_CONTROL_VERIFICATION_PRE Zone U1 audit
//               event (event_type "ADMIN_ACTION", outcome SUCCESS);
//            3. call findApprovedDualControlForCaller(callerEntityId,
//               descriptor) (service tier owns the DB read per RULE 9 --
//               the middleware never touches Prisma) and write the
//               DUAL_CONTROL_ESCALATION_LOOKUP event (outcome SUCCESS;
//               details carry the found escalation_id or null);
//            4. evaluate the pure function evaluateDualControlState; if
//               Approved: write DUAL_CONTROL_APPROVAL_VERIFIED +
//               DUAL_CONTROL_HANDLER_DELEGATED (both SUCCESS) and resolve
//               (Fastify proceeds to the handler);
//            5. if Denied (PermanentFailure): on ESCALATION_PENDING with
//               no escalation yet, create a PENDING EscalationRequest via
//               createEscalationForCaller (escalation_type
//               DUAL_CONTROL_REQUIRED, severity HIGH, description =
//               dualControlDescription(descriptor.type)); write the
//               DUAL_CONTROL_HANDLER_DENIED event (outcome DENIED,
//               denial_reason set); reply 403 with the escalation_id;
//            6. if the DB read or any audit write throws (TransientFailure
//               -- BEAM pattern 2): logger.error, best-effort
//               DUAL_CONTROL_TRANSIENT_FAILURE audit event (outcome
//               ERROR), reply 503 with a retry-after hint.
//
//          The middleware does READ-SIDE verification only: it confirms an
//          APPROVED dual-control EscalationRequest exists. Approver
//          semantics (source ≠ resolver / the §5.8 skeleton gate in
//          escalation.service.ts:transitionPendingForCaller) are enforced
//          upstream when the second approver calls
//          POST /api/v1/escalations/:id/approve.
//
//          SUBSTRATE-STATE LIMITATION (sub-phase E):
//          createEscalationForCaller is called with target_entity_id =
//          callerEntityId as a placeholder. The dual-control canonical
//          record (§3 step 6) specifies the auto-created PENDING
//          escalation's target should be "a designated approver or the
//          requesting org's admin set" -- but org-admin-set resolution is
//          forward-queued (Sub-box 2 Phase 2). Until then the auto-created
//          escalation targets the caller, who CAN self-approve (the
//          escalation.service.ts skeleton gate allows caller === target).
//          So at sub-phase E the dual-control gate is STRUCTURALLY present
//          (the preHandler binds, the Zone U1 audit sequence fires, the
//          EscalationRequest lifecycle works, sub-phases F + G bind it to
//          PATCH /platform/monetization/config and POST /platform/orgs)
//          but does not yet enforce a distinct second human. This is not a
//          regression -- the prior state had no gate at all. ADR-0026
//          (sub-phase H) and Sub-box 2 Phase 2 resolve the org-admin
//          target set.
//
//          THE 6 BEAM-COMPATIBILITY PATTERNS (per the canonical record §5;
//          chosen so a future Elixir/BEAM port per ADR-0028 is a port, not
//          a rewrite):
//          - Pattern 1 (message-passing semantics over shared state): each
//            verification is an independent request → outcome transform --
//            a verification context { callerEntityId, actionDescriptor }
//            in, a DualControlOutcome out. No shared mutable state between
//            concurrent invocations. Maps to Elixir GenServer.call/cast.
//          - Pattern 2 (supervisor-friendly failure modes): failures throw
//            into the preHandler try/catch and are modelled by the
//            DualControlFailure discriminated union -- TransientFailure
//            (DB unreachable / audit-write throws; a future supervisor
//            retries) vs PermanentFailure (no APPROVED escalation /
//            forbidden / expired; escalate to parent). Maps to Elixir
//            {:error, :transient} / {:error, :permanent}.
//          - Pattern 3 (state reconstructible from durable storage): no
//            in-memory EscalationRequest cache -- every verification reads
//            current Postgres state via findApprovedDualControlForCaller.
//            A future Elixir worker can be spawned/crashed/restarted with
//            state hydrated from storage at any moment.
//          - Pattern 4 (event-sourced audit semantics): the Zone U1 audit
//            events are immutable (ADR-0002 append-only chain + BEFORE
//            DELETE trigger); the verification writes them as a sequence,
//            each with independent causation context; partial sequences on
//            crash are acceptable substrate state. Maps to Elixir
//            event-sourced supervision.
//          - Pattern 5 (idempotent verification keys): the
//            EscalationRequest.escalation_id is the idempotency key --
//            replaying the same verification yields the same outcome. Maps
//            to Elixir idempotent message handling under at-least-once
//            delivery.
//          - Pattern 6 (pure transformation over imperative control): the
//            authorization logic is the pure function
//            evaluateDualControlState(callerEntityId, actionDescriptor,
//            foundEscalation) → DualControlOutcome; side effects (DB reads,
//            audit writes, reply) are explicit at the edges, not mixed
//            through the verification logic. Maps to Elixir's
//            pure-function-first idiom.
//
//          BINDING CONTRACT: when attached to a route, requireDualControl
//          MUST follow the auth-capability hook in the preHandler array --
//          it depends on request.auth.entity_id populated by the prior
//          hook. Example (sub-phases F + G):
//            preHandler: [
//              requireAdminCapability(authService, "can_admin_niov"),
//              requireDualControl(endpoint),
//            ]
//          (clearance before the dual-control check -- RULE 5: order is
//          authentication → clearance → permission → conditions.)
//
// CONNECTS TO:
//   - apps/api/src/security/privileged-endpoints.ts (PrivilegedEndpoint +
//     EscalationActionDescriptor types passed at factory time)
//   - apps/api/src/services/governance/escalation.service.ts
//     (findApprovedDualControlForCaller -- the read-side APPROVED check;
//     getOrCreatePendingDualControlForCaller -- the dedup'd auto-created
//     PENDING gate on the denied path)
//   - packages/database/src/queries/audit.ts (writeAuditEvent -- the
//     Zone U1 ADMIN_ACTION sequence)
//   - apps/api/src/middleware/admin.middleware.ts (the factory-pattern
//     precedent; the ordering predecessor in the preHandler array)
//   - apps/api/src/logger.ts (structured logger -- no console.* per
//     RULE 16)
//   - docs/architecture/dual-control-operations-canonical-record.md §3 +
//     §4 + §5 (verification flow, Zone U1 audit-event sequence + payload
//     shapes, the 6 BEAM-compatibility patterns)
//   - sub-phase F [SEC-DUAL-CONTROL-BINDING-CONFIG] + sub-phase G
//     [SEC-DUAL-CONTROL-BINDING-ORGS] (the route bindings that consume
//     this factory; full-chain integration-tier tests per ADR-0011)
//   - ADR-0026 (sub-phase H -- the dual-control middleware + privileged-
//     endpoint-registry + per-route-binding-discipline pattern; will cite
//     the canonical record); ADR-0028 (sub-phase J -- the Elixir/BEAM
//     coordination-layer forward-substrate; canonicalizes the 6 patterns)

import type { FastifyReply, FastifyRequest } from "fastify";
import { writeAuditEvent } from "@niov/database";
import type {
  EscalationActionDescriptor,
  PrivilegedEndpoint,
} from "../security/privileged-endpoints.js";
import {
  findApprovedDualControlForCaller,
  getOrCreatePendingDualControlForCaller,
} from "../services/governance/escalation.service.js";
import { logger } from "../logger.js";

/**
 * WHAT: Discriminated union of dual-control verification failure modes
 *       (BEAM-compatibility pattern 2 -- supervisor-friendly failure
 *       modes). TransientFailure is a future-supervisor-retryable
 *       condition (DB unreachable, audit write threw); PermanentFailure is
 *       escalate-to-parent (no APPROVED escalation, forbidden, expired).
 * INPUT: Used as a value type only.
 * OUTPUT: None -- this is a type, not a value.
 * WHY: Models the future Elixir port's {:error, :transient} /
 *      {:error, :permanent} split today. NOTE: PermanentFailure.reason
 *      includes "ESCALATION_FORBIDDEN" for type-level forward-compat with
 *      the canonical record §4 denial_reason enum, but this middleware
 *      does NOT currently produce it -- approver-semantics (which is where
 *      a forbidden outcome would arise) are enforced upstream at
 *      POST /api/v1/escalations/:id/approve, not here. This middleware's
 *      reachable PermanentFailure reasons are ESCALATION_PENDING and
 *      ESCALATION_EXPIRED.
 */
export type DualControlFailure =
  | {
      kind: "TransientFailure";
      reason: "DB_UNREACHABLE" | "AUDIT_WRITE_FAILED";
      cause?: unknown;
    }
  | {
      kind: "PermanentFailure";
      reason: "ESCALATION_PENDING" | "ESCALATION_FORBIDDEN" | "ESCALATION_EXPIRED";
      escalation_id?: string;
    };

/**
 * WHAT: The outcome of a dual-control verification -- Approved (delegate to
 *       the route handler) or Denied (carry the failure).
 * INPUT: Used as a value type only.
 * OUTPUT: None -- this is a type, not a value.
 * WHY: The return type of the pure evaluateDualControlState transform
 *      (BEAM-compatibility pattern 6) and the internal currency the
 *      preHandler branches on.
 */
export type DualControlOutcome =
  | { kind: "Approved"; escalation_id: string }
  | { kind: "Denied"; failure: DualControlFailure };

/**
 * WHAT: The minimal structural view of an EscalationRequest the
 *       dual-control evaluation needs -- the id, the status, and the
 *       expiry. A full Prisma EscalationRequest is structurally assignable
 *       to this; a hand-built fixture in tests is too.
 * INPUT: Used as a parameter type only.
 * OUTPUT: None -- this is a type, not a value.
 * WHY: Keeps evaluateDualControlState free of the Prisma model type so it
 *      is a pure, trivially-testable transform (BEAM-compatibility
 *      pattern 6).
 */
export type DualControlEscalationView = {
  escalation_id: string;
  status: string;
  expires_at: Date | null;
};

/**
 * WHAT: The pure transform at the heart of dual-control verification
 *       (BEAM-compatibility pattern 6) -- given the caller, the action
 *       descriptor, and the EscalationRequest the service lookup returned
 *       (or null), decide Approved vs Denied.
 * INPUT: callerEntityId (the request initiator -- carried for parity with
 *        the future Elixir signature; not branched on here because the
 *        service lookup already scoped by source_entity_id) +
 *        actionDescriptor (the privileged-endpoint descriptor -- likewise
 *        carried for parity; the service lookup already scoped by
 *        description) + foundEscalation (the result of
 *        findApprovedDualControlForCaller, or null).
 * OUTPUT: A DualControlOutcome -- Approved with the escalation_id, or
 *         Denied with a PermanentFailure. Never returns a TransientFailure
 *         (those arise only from thrown side effects, caught in the
 *         preHandler).
 * WHY: Side-effect-free and total over its inputs, so the authorization
 *      decision can be unit-tested in isolation and a future Elixir port
 *      maps it to a pure function. Resolution order: no escalation →
 *      ESCALATION_PENDING (one must be created and approved); an escalation
 *      past its expires_at → ESCALATION_EXPIRED; an escalation not in
 *      APPROVED status → ESCALATION_PENDING (defensive -- the service
 *      query already filters status APPROVED, but a directly-supplied view
 *      may not); otherwise → Approved.
 */
export function evaluateDualControlState(
  callerEntityId: string,
  actionDescriptor: EscalationActionDescriptor,
  foundEscalation: DualControlEscalationView | null,
): DualControlOutcome {
  // callerEntityId + actionDescriptor are intentionally not branched on
  // here -- the service-tier lookup (findApprovedDualControlForCaller)
  // already scoped by source_entity_id + description. They are part of the
  // signature so the future Elixir port has the full verification context
  // and so a stricter future policy (e.g. per-DMW-type sovereignty rules,
  // §5.8) can extend this transform without a signature change.
  void callerEntityId;
  void actionDescriptor;

  if (foundEscalation === null) {
    return {
      kind: "Denied",
      failure: { kind: "PermanentFailure", reason: "ESCALATION_PENDING" },
    };
  }
  if (
    foundEscalation.expires_at !== null &&
    foundEscalation.expires_at.getTime() < Date.now()
  ) {
    return {
      kind: "Denied",
      failure: {
        kind: "PermanentFailure",
        reason: "ESCALATION_EXPIRED",
        escalation_id: foundEscalation.escalation_id,
      },
    };
  }
  if (foundEscalation.status !== "APPROVED") {
    return {
      kind: "Denied",
      failure: {
        kind: "PermanentFailure",
        reason: "ESCALATION_PENDING",
        escalation_id: foundEscalation.escalation_id,
      },
    };
  }
  return { kind: "Approved", escalation_id: foundEscalation.escalation_id };
}

// WHAT: The action-descriptor literals for the Zone U1 ADMIN_ACTION
//        sequence this middleware writes -- the five canonical actions
//        per the dual-control canonical record §4, plus the
//        DUAL_CONTROL_TRANSIENT_FAILURE supervisor-failure-mode marker
//        (outside the normal sequence; BEAM pattern 2).
// INPUT: Used internally as constants.
// OUTPUT: None.
// WHY: One place to spell these so the preHandler, the tests, and any
//        future audit-query consumer agree on the strings.
const AUDIT_ACTION = {
  VERIFICATION_PRE: "DUAL_CONTROL_VERIFICATION_PRE",
  ESCALATION_LOOKUP: "DUAL_CONTROL_ESCALATION_LOOKUP",
  APPROVAL_VERIFIED: "DUAL_CONTROL_APPROVAL_VERIFIED",
  HANDLER_DELEGATED: "DUAL_CONTROL_HANDLER_DELEGATED",
  HANDLER_DENIED: "DUAL_CONTROL_HANDLER_DENIED",
  TRANSIENT_FAILURE: "DUAL_CONTROL_TRANSIENT_FAILURE",
} as const;

/**
 * WHAT: Factory that builds a dual-control Fastify preHandler bound to one
 *       PrivilegedEndpoint descriptor.
 * INPUT: endpoint (the registry entry -- passed at binding-site time, the
 *        same way requireAdminCapability takes its capability; no Fastify
 *        v5 request.routeOptions.url dependency at runtime, and method-
 *        substitution coverage already lives at the sub-phase D registry
 *        tier).
 * OUTPUT: An async Fastify preHandler (request, reply) → Promise<void>
 *         that performs the Zone U1 verification sequence; resolves
 *         without sending a reply on the Approved path (Fastify proceeds
 *         to the handler) and sends 401/403/503 otherwise.
 * WHY: Mirrors the requireAdminCapability factory pattern
 *      (admin.middleware.ts) for substrate coherence; the descriptor is
 *      the binding-time input, the request is the call-time input
 *      (BEAM-compatibility pattern 1 -- message-passing semantics).
 */
export function requireDualControl(endpoint: PrivilegedEndpoint) {
  const actionDescriptor: EscalationActionDescriptor = endpoint.actionDescriptor;

  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const callerEntityId = request.auth?.entity_id;
    if (callerEntityId === undefined) {
      // Hook-ordering guard: requireDualControl must follow an auth hook
      // that populates request.auth (see the BINDING CONTRACT in the file
      // header). Without it there is no caller to verify against.
      await reply.code(401).send({ ok: false, error: "AUTH_REQUIRED" });
      return;
    }

    try {
      // EVENT 1 -- DUAL_CONTROL_VERIFICATION_PRE: the preHandler intercepted
      // the request. (Pattern 4: event-sourced; independent causation.)
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        details: {
          action: AUDIT_ACTION.VERIFICATION_PRE,
          action_descriptor_type: actionDescriptor.type,
          route: endpoint.route,
          method: endpoint.method,
        },
      });

      // Pattern 3: read current state from durable storage; no in-memory
      // cache. RULE 9: the DB read lives in the service tier, not here.
      const found = await findApprovedDualControlForCaller(
        callerEntityId,
        actionDescriptor,
      );

      // EVENT 2 -- DUAL_CONTROL_ESCALATION_LOOKUP: the lookup completed. The
      // outcome of the lookup *step* is SUCCESS regardless of whether a row
      // was found; whether an APPROVED row exists is in details.
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerEntityId,
        details: {
          action: AUDIT_ACTION.ESCALATION_LOOKUP,
          action_descriptor_type: actionDescriptor.type,
          escalation_id: found?.escalation_id ?? null,
          escalation_found: found !== null,
          escalation_status: found?.status ?? "NONE",
        },
      });

      // Pattern 6: the authorization decision is the pure transform.
      const outcome = evaluateDualControlState(
        callerEntityId,
        actionDescriptor,
        found,
      );

      if (outcome.kind === "Approved") {
        // EVENT 3 -- DUAL_CONTROL_APPROVAL_VERIFIED.
        await writeAuditEvent({
          event_type: "ADMIN_ACTION",
          outcome: "SUCCESS",
          actor_entity_id: callerEntityId,
          details: {
            action: AUDIT_ACTION.APPROVAL_VERIFIED,
            action_descriptor_type: actionDescriptor.type,
            escalation_id: outcome.escalation_id,
          },
        });
        // EVENT 4 -- DUAL_CONTROL_HANDLER_DELEGATED.
        await writeAuditEvent({
          event_type: "ADMIN_ACTION",
          outcome: "SUCCESS",
          actor_entity_id: callerEntityId,
          details: {
            action: AUDIT_ACTION.HANDLER_DELEGATED,
            action_descriptor_type: actionDescriptor.type,
            escalation_id: outcome.escalation_id,
          },
        });
        // Resolve without sending a reply -- Fastify proceeds to the next
        // hook / the route handler. The handler executes the privileged
        // operation.
        return;
      }

      // Denied. The pure transform only yields PermanentFailure here;
      // TransientFailure arises solely from thrown side effects (the catch
      // block below). Narrow defensively anyway.
      const failure = outcome.failure;
      if (failure.kind === "TransientFailure") {
        await reply
          .code(503)
          .header("retry-after", "5")
          .send({ ok: false, error: "DUAL_CONTROL_VERIFICATION_UNAVAILABLE" });
        return;
      }

      // PermanentFailure. On ESCALATION_PENDING with no escalation yet,
      // get-or-create the PENDING dual-control EscalationRequest so a
      // second approver has something to APPROVE. The service helper
      // dedups on (source, DUAL_CONTROL_REQUIRED, PENDING, description) so
      // a caller retrying the endpoint does not flood the approver queue.
      // (See the SUBSTRATE-STATE LIMITATION block in the file header re:
      // target_entity_id.)
      let escalationId = failure.escalation_id;
      if (failure.reason === "ESCALATION_PENDING" && escalationId === undefined) {
        const pending = await getOrCreatePendingDualControlForCaller(
          callerEntityId,
          actionDescriptor,
        );
        escalationId = pending.escalation_id;
      }

      // EVENT 3 (denied path) -- DUAL_CONTROL_HANDLER_DENIED. outcome DENIED;
      // denial_reason set (RULE 4: audit before the response).
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "DENIED",
        actor_entity_id: callerEntityId,
        denial_reason: failure.reason,
        details: {
          action: AUDIT_ACTION.HANDLER_DENIED,
          action_descriptor_type: actionDescriptor.type,
          escalation_id: escalationId ?? null,
          denial_reason: failure.reason,
          route: endpoint.route,
          method: endpoint.method,
        },
      });

      await reply.code(403).send({
        ok: false,
        error: failure.reason,
        escalation_id: escalationId ?? null,
        message:
          "Dual-control verification required: a second approver must " +
          "APPROVE the EscalationRequest before this operation can proceed. " +
          "Re-issue the request after approval.",
      });
    } catch (err) {
      // TransientFailure (BEAM pattern 2): the DB read or an audit write
      // threw. A future Elixir supervisor would retry; here we return 503
      // and let the caller retry. logger.error is the reliable trace; the
      // audit event is best-effort (it hits the same DB that just threw).
      logger.error(
        {
          err,
          callerEntityId,
          action_descriptor_type: actionDescriptor.type,
          route: endpoint.route,
          method: endpoint.method,
        },
        "dual-control verification failed (transient)",
      );
      try {
        await writeAuditEvent({
          event_type: "ADMIN_ACTION",
          outcome: "ERROR",
          actor_entity_id: callerEntityId,
          details: {
            action: AUDIT_ACTION.TRANSIENT_FAILURE,
            action_descriptor_type: actionDescriptor.type,
            route: endpoint.route,
            method: endpoint.method,
          },
        });
      } catch (auditErr) {
        logger.error(
          { auditErr, callerEntityId, action_descriptor_type: actionDescriptor.type },
          "dual-control transient-failure audit write also failed",
        );
      }
      await reply
        .code(503)
        .header("retry-after", "5")
        .send({ ok: false, error: "DUAL_CONTROL_VERIFICATION_UNAVAILABLE" });
    }
  };
}
