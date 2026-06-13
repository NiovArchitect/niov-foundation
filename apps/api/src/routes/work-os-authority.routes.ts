// FILE: work-os-authority.routes.ts
// PURPOSE: Phase 1273 — HTTP surface for the authority substrate:
//            - POST /api/v1/work-os/authority-context
//          Resolves a target name in the caller's org, computes the
//          authority context (hierarchy/RBAC/ABAC), and — when an
//          action is supplied — returns the policy decision. The
//          frontend uses this to show authority status instead of a
//          generic draft, and to resolve/clarify unknown participants.
// CONNECTS TO: work-os/authority-context.service.ts, AuthService.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  buildAuthorityContext,
  evaluateWorkOsAction,
  resolveTargetInOrg,
  type WorkOsAction,
  type ActionPolicyResult,
} from "../services/work-os/authority-context.service.js";
import { getOrgEntityId } from "../services/governance/org.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const KNOWN_ACTIONS: ReadonlyArray<WorkOsAction> = [
  "READ_CONNECTOR_STATUS",
  "READ_ZOOM_RECORDINGS",
  "READ_CALENDAR_FREEBUSY_SELF",
  "READ_CALENDAR_FREEBUSY_TARGET",
  "PROPOSE_MEETING",
  "CREATE_INTERNAL_MEETING",
  "REQUEST_PARTICIPANT_CONFIRMATION",
  "CREATE_INTERNAL_TASK",
  "ASSIGN_TASK",
  "CREATE_FOLLOW_UP_NOTE",
  "SEND_INTERNAL_NOTIFICATION",
  "ASK_TWIN",
  "REQUEST_TWIN_INTERCESSION",
  "CREATE_COLLABORATION_REQUEST",
  "SEND_EXTERNAL_SLACK",
  "SEND_EXTERNAL_EMAIL",
  "CREATE_EXTERNAL_CALENDAR_INVITE",
];

export async function registerWorkOsAuthorityRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{
    Body: { target_name?: unknown; actions?: unknown };
  }>("/api/v1/work-os/authority-context", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });

    const body = request.body ?? {};
    const targetName =
      typeof body.target_name === "string" && body.target_name.trim().length > 0
        ? body.target_name.trim()
        : undefined;

    const ctx = await buildAuthorityContext({
      caller_entity_id: session.entity_id,
      ...(targetName !== undefined ? { target_name: targetName } : {}),
    });

    // Optional: evaluate one or more named actions against the context.
    const requested = Array.isArray(body.actions) ? body.actions : [];
    const policies: ActionPolicyResult[] = requested
      .filter(
        (a): a is WorkOsAction =>
          typeof a === "string" && KNOWN_ACTIONS.includes(a as WorkOsAction),
      )
      .map((a) => evaluateWorkOsAction(a, ctx));

    return reply.code(200).send({ ok: true, authority: ctx, policies });
  });

  // Lightweight target-resolution-only endpoint for fast UI clarification.
  app.post<{ Body: { target_name?: unknown } }>(
    "/api/v1/work-os/resolve-target",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });

      const name =
        typeof request.body?.target_name === "string"
          ? request.body.target_name
          : "";
      let orgId: string | null = null;
      try {
        orgId = await getOrgEntityId(session.entity_id);
      } catch {
        return reply
          .code(200)
          .send({ ok: true, resolution: { code: "NOT_FOUND", match: null, candidates: [] } });
      }
      const resolution = await resolveTargetInOrg(orgId, name);
      return reply.code(200).send({ ok: true, resolution });
    },
  );
}
