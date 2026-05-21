// FILE: working-set.routes.ts
// PURPOSE: HTTP surface for the Foundation/COSMP working-set orchestrator
//          (ADR-0048 §Hybrid API Strategy; arc 2 WSAPI). Exposes
//          WorkingSetService.buildPersonalizedWorkingSet through ONE
//          consumer-safe endpoint that returns projectConsumerView only —
//          no admin/diagnostic view, no raw retrieval internals. Emits the
//          AUDIT.2 personalization audit literals at the ROUTE layer
//          (WORKING_SET_BUILT on every success; PERSONALIZATION_DEGRADED
//          only when the working set carries degraded entries), keeping
//          WorkingSetService pure (it never writes audit).
// CONNECTS TO: WorkingSetService + projectConsumerView (personalization
//              substrate), AuthService (audit actor context),
//              writeAuditEvent (@niov/database; the AUDIT.1 literals).

import type { FastifyInstance } from "fastify";
import { writeAuditEvent } from "@niov/database";
import type { AuthService } from "../services/auth.service.js";
import type { WorkingSetService } from "../services/personalization/working-set.service.js";
import { projectConsumerView } from "../services/personalization/working-set-views.js";
import { clientContextFrom } from "../middleware/request-context.js";

// WHAT: Pull a Bearer token out of an Authorization header.
// INPUT: The raw header value.
// OUTPUT: The token, or null when the header is missing / shaped wrong.
// WHY: One auth-token shape check per file (mirrors coe.routes.ts).
function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

// WHAT: Map a service-level failure code to an HTTP status.
// INPUT: The code string.
// OUTPUT: An HTTP status number.
// WHY: One mapping for the route (mirrors coe.routes.ts).
function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
      return 403;
    case "INVALID_REQUEST":
      return 422;
    default:
      return 400;
  }
}

// WHAT: Register the consumer-safe working-set route.
// INPUT: Fastify instance + the WorkingSetService + AuthService.
// OUTPUT: A promise resolving once the route is registered.
// WHY: arc 2 WSAPI — the Foundation exposes the governed working set to
//      apps/agents through a single consumer endpoint. The route validates
//      the session for the audit actor context (AUDIT.2 emission), keeping
//      WorkingSetService pure.
export async function registerWorkingSetRoutes(
  app: FastifyInstance,
  workingSetService: WorkingSetService,
  authService: AuthService,
): Promise<void> {
  app.post<{
    Body: {
      request_text?: string;
      token_budget?: number;
      requested_context?: string[];
      grants?: Record<string, { wallet_id: string; domain: "personal" | "enterprise"; granted: boolean }>;
      enterprise_defaults?: { dept_data_isolation: boolean; audit_ai_actions: boolean };
      caller_inputs?: {
        timezone?: string | null;
        location?: unknown;
        calendar?: unknown;
        device?: unknown;
        active_app?: unknown;
        current_task?: unknown;
      };
    };
  }>("/api/v1/personalization/working-set", async (request, reply) => {
    const sessionToken = bearerFrom(request.headers.authorization);
    if (sessionToken === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }

    // Validate the session at the route layer ONLY to obtain the audit
    // actor context (entity_id + session_id) for the AUDIT.2 emission. The
    // WorkingSetService re-resolves the session authoritatively; this is the
    // accepted minor double-validate that keeps WorkingSetService pure.
    const session = await authService.validateSession(sessionToken, "read", clientContextFrom(request));
    if (!session.valid) {
      // Fail-closed: no personalization audit literal, no payload.
      return reply
        .code(statusForCode(session.code))
        .send({ ok: false, code: session.code, message: "Working set denied" });
    }

    const body = request.body ?? {};
    const result = await workingSetService.buildPersonalizedWorkingSet(sessionToken, {
      request_text: typeof body.request_text === "string" ? body.request_text : "",
      token_budget: typeof body.token_budget === "number" ? body.token_budget : 0,
      requested_context: Array.isArray(body.requested_context) ? body.requested_context : [],
      grants: body.grants,
      enterprise_defaults: body.enterprise_defaults,
      caller_inputs: body.caller_inputs,
      // now is server-set (omitted → the service uses server-side time);
      // a client-supplied now is never trusted.
      ip_address: request.ip ?? null,
    });

    if (!result.ok) {
      // Fail-closed: no personalization audit literal, no personalization payload.
      return reply
        .code(statusForCode(result.code))
        .send({ ok: false, code: result.code, message: result.message });
    }

    // AUDIT.2 — RULE 4: emit the orchestration-tier audit BEFORE responding.
    // Safe counts + domain only (no content, no raw query, no retrieval internals).
    await writeAuditEvent({
      event_type: "WORKING_SET_BUILT",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      ip_address: request.ip ?? null,
      details: {
        domain: result.domain,
        capsules_loaded: result.stats.capsules_loaded,
        tokens_consumed: result.stats.tokens_consumed,
        capsules_skipped_low_relevance: result.stats.capsules_skipped_low_relevance,
        capsules_skipped_budget: result.stats.capsules_skipped_budget,
        capsules_denied_permission: result.stats.capsules_denied_permission,
        context_keys_requested: result.stats.context_keys_requested,
        context_keys_available: result.stats.context_keys_available,
        moment_fields_available: result.stats.moment_fields_available,
        degraded_count: result.degraded.length,
      },
    });

    if (result.degraded.length > 0) {
      // Reason-class histogram only (leak-free enum names + counts); never
      // per-entry keys/values or advisory text.
      const reason_histogram: Record<string, number> = {};
      for (const entry of result.degraded) {
        reason_histogram[entry.reason] = (reason_histogram[entry.reason] ?? 0) + 1;
      }
      await writeAuditEvent({
        event_type: "PERSONALIZATION_DEGRADED",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        ip_address: request.ip ?? null,
        details: {
          domain: result.domain,
          degraded_count: result.degraded.length,
          reason_histogram,
        },
      });
    }

    // Consumer-safe projection ONLY — never projectAdminView, never the raw
    // WorkingSetSuccess (no degraded reasons/dispositions/advisories/stats/
    // audit_intent/consumer_obligations/permission/moment internals).
    return reply.code(200).send(projectConsumerView(result));
  });
}
