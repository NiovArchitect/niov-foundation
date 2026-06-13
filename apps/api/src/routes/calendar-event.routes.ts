// FILE: calendar-event.routes.ts
// PURPOSE: Phase 1272 — HTTP surface for the GATED calendar event
//          lifecycle:
//            - POST /api/v1/calendar/events/propose  (status preview)
//            - POST /api/v1/calendar/events/create   (HARD gate; never
//              auto-creates — today every path ends in a blocker)
//          Bearer-gated; org resolved from the caller. No event is ever
//          created here, no invite sent.
// CONNECTS TO: calendar-event.service.ts (gate ladder + audit),
//          getOrgEntityId (caller → org), AuthService.

import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  proposeCalendarEvent,
  createCalendarEvent,
  type CalendarEventProposalInput,
  type ProposedParticipant,
  type SelectedTime,
} from "../services/connector/calendar-event.service.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply.code(404).send({
        ok: false,
        code: "NO_ORG_FOR_CALLER",
        message: "Caller is not in an organization",
      });
      return null;
    }
    throw err;
  }
}

// Map a gate code to an honest HTTP status.
function statusForGate(code: string): number {
  switch (code) {
    case "POLICY_BLOCKED":
      return 403;
    case "CALENDAR_PROVIDER_UNAVAILABLE":
      return 501; // gates passed, create runtime not implemented yet
    default:
      return 409; // a precondition gate is unmet (selected time / scope / …)
  }
}

// Coerce an untrusted body into the proposal input (defensive; never
// trusts client-asserted confirmation/approval beyond booleans).
function parseProposal(body: Record<string, unknown>): CalendarEventProposalInput {
  const participantsRaw = Array.isArray(body.participants)
    ? (body.participants as unknown[])
    : [];
  const participants: ProposedParticipant[] = participantsRaw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return {
      label: typeof o.label === "string" ? o.label : "",
      resolved: o.resolved === true,
    };
  });
  let selected_time: SelectedTime | null = null;
  const st = body.selected_time as Record<string, unknown> | undefined;
  if (
    st !== undefined &&
    st !== null &&
    typeof st.start === "string" &&
    typeof st.end === "string"
  ) {
    selected_time = { start: st.start, end: st.end };
  }
  return {
    title: typeof body.title === "string" ? body.title : "(untitled)",
    participants,
    selected_time,
    ...(typeof body.duration_minutes === "number"
      ? { duration_minutes: body.duration_minutes }
      : {}),
    ...(typeof body.source_command === "string"
      ? { source_command: body.source_command }
      : {}),
    ...(typeof body.prerequisite === "string"
      ? { prerequisite: body.prerequisite }
      : {}),
    participant_confirmations_satisfied:
      body.participant_confirmations_satisfied === true,
    requires_approval: body.requires_approval === true,
    approved: body.approved === true,
    caller_confirmed: body.caller_confirmed === true,
    policy_blocked: body.policy_blocked === true,
  };
}

export async function registerCalendarEventRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // ── Propose (status preview; no side effects) ──
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/calendar/events/propose",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });

      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;

      const view = await proposeCalendarEvent({
        org_entity_id: orgEntityId,
        input: parseProposal(request.body ?? {}),
      });
      return reply.code(200).send({ ok: true, proposal: view });
    },
  );

  // ── Create (HARD gate enforcement; never auto-creates) ──
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/calendar/events/create",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });

      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;

      const result = await createCalendarEvent({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        input: parseProposal(request.body ?? {}),
      });
      if (result.ok === false)
        return reply
          .code(statusForGate(result.code))
          .send({ ok: false, code: result.code });
      return reply.code(200).send({ ok: true, status: result.status });
    },
  );
}
