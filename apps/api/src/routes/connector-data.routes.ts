// FILE: connector-data.routes.ts
// PURPOSE: Phase 1270 — HTTP surface for the read-only connector data
//          bridges:
//            - GET  /api/v1/zoom/recordings        (Zoom cloud recordings)
//            - POST /api/v1/calendar/freebusy      (Google free/busy)
//          Bearer + read scope; org resolved from the caller. Both are
//          READ-ONLY — they never create, send, or mutate provider data.
// CONNECTS TO: connector-data-read.service.ts (the egress + audit),
//          getOrgEntityId (caller → org), AuthService (bearer/read gate).

import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  listZoomRecordingsForOrg,
  getCalendarFreeBusyForOrg,
} from "../services/connector/connector-data-read.service.js";

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

// Map a service failure code to an honest HTTP status.
function statusForCode(code: string): number {
  switch (code) {
    case "NOT_CONNECTED":
      return 409; // connection not present / disabled
    case "TOKEN_REFRESH_FAILED":
      return 409; // needs reconnect
    case "SCOPE_REAUTH_REQUIRED":
      return 409; // token rejected for auth/scope — re-consent needed
    case "INVALID_REQUEST":
      return 422;
    default:
      return 502; // PROVIDER_ERROR — upstream provider failed
  }
}

export async function registerConnectorDataRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // ── Zoom cloud recordings (read-only) ──
  app.get<{
    Querystring: { from?: string; to?: string; page_size?: string };
  }>("/api/v1/zoom/recordings", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });

    const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
    if (orgEntityId === null) return;

    const q = request.query ?? {};
    const pageSize =
      typeof q.page_size === "string" ? Number.parseInt(q.page_size, 10) : NaN;
    const result = await listZoomRecordingsForOrg({
      actor_entity_id: session.entity_id,
      org_entity_id: orgEntityId,
      ...(typeof q.from === "string" ? { from: q.from } : {}),
      ...(typeof q.to === "string" ? { to: q.to } : {}),
      ...(Number.isFinite(pageSize) ? { page_size: pageSize } : {}),
    });
    if (result.ok === false)
      return reply.code(statusForCode(result.code)).send(result);
    return reply.code(200).send(result);
  });

  // ── Google Calendar free/busy (read-only) ──
  app.post<{
    Body: { time_min?: unknown; time_max?: unknown; calendar_id?: unknown };
  }>("/api/v1/calendar/freebusy", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });

    const body = request.body ?? {};
    if (typeof body.time_min !== "string" || typeof body.time_max !== "string") {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "time_min and time_max (RFC3339) are required",
      });
    }

    const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
    if (orgEntityId === null) return;

    const result = await getCalendarFreeBusyForOrg({
      actor_entity_id: session.entity_id,
      org_entity_id: orgEntityId,
      time_min: body.time_min,
      time_max: body.time_max,
      ...(typeof body.calendar_id === "string"
        ? { calendar_id: body.calendar_id }
        : {}),
    });
    if (result.ok === false)
      return reply.code(statusForCode(result.code)).send(result);
    return reply.code(200).send(result);
  });
}
