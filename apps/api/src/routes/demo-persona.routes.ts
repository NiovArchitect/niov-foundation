// FILE: demo-persona.routes.ts
// PURPOSE: Public demo persona list + passwordless short session launch
//          for the isolated Y Combinator Labs tenant only.
// CONNECTS TO: yc-demo-personas, AuthService.issueInternalSession.

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  demoLauncherEnabled,
  publicPersonaCards,
  resolveDemoPersonaEntity,
  ycDemoOrgEntityId,
} from "../services/demo/yc-demo-personas.js";

/**
 * WHAT: Register demo persona launcher routes.
 * INPUT: Fastify app + AuthService.
 * OUTPUT: void.
 * WHY: YC review needs role switch without frontend passwords.
 */
export async function registerDemoPersonaRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // GET — list personas (no secrets). Disabled when flag off.
  app.get("/api/v1/demo/yc-labs/personas", async (_request, reply) => {
    if (!demoLauncherEnabled()) {
      return reply.code(404).send({
        ok: false,
        code: "DEMO_LAUNCHER_DISABLED",
        message: "Demo persona launcher is not enabled",
      });
    }
    return reply.code(200).send({
      ok: true,
      org_label: "Y Combinator Labs",
      fictional_notice:
        "Fictional Y Combinator Labs demo · HelioGrid is a fictional startup used to demonstrate Otzar’s application-review workflow.",
      welcome_title: "Welcome, Y Combinator",
      welcome_subtitle:
        "Explore how Otzar changes with responsibility and authority.",
      org_entity_id: ycDemoOrgEntityId(),
      personas: publicPersonaCards(),
    });
  });

  // POST — mint short-lived session for one persona (no password in body).
  app.post<{ Body: { persona_key?: string } }>(
    "/api/v1/demo/yc-labs/persona-session",
    async (request, reply) => {
      if (!demoLauncherEnabled()) {
        return reply.code(404).send({
          ok: false,
          code: "DEMO_LAUNCHER_DISABLED",
          message: "Demo persona launcher is not enabled",
        });
      }
      const key =
        typeof request.body?.persona_key === "string"
          ? request.body.persona_key.trim()
          : "";
      if (key.length === 0) {
        return reply.code(400).send({
          ok: false,
          code: "BAD_REQUEST",
          message: "persona_key is required",
        });
      }
      const resolved = await resolveDemoPersonaEntity(key);
      if (resolved === null) {
        return reply.code(404).send({
          ok: false,
          code: "PERSONA_NOT_FOUND",
          message: "Persona is not provisioned on the demo tenant",
        });
      }
      const ops = resolved.persona.is_admin
        ? ["read", "write", "share", "admin_org"]
        : ["read", "write", "share"];
      const result = await authService.issueInternalSession(
        resolved.entity_id,
        ops,
        {
          ip_address: request.ip,
          user_agent: request.headers["user-agent"] ?? null,
          reason: `yc_demo_persona:${key}`,
          ttl_minutes: 120,
        },
      );
      if (result.ok === false) {
        return reply.code(401).send(result);
      }
      return reply.code(200).send({
        ok: true,
        token: result.token,
        session_id: result.session_id,
        entity_id: result.entity_id,
        expires_at: result.expires_at.toISOString(),
        allowed_operations: result.allowed_operations,
        persona: {
          key: resolved.persona.key,
          display_name: resolved.persona.display_name,
          role_title: resolved.persona.role_title,
        },
        banner:
          `Fictional Y Combinator Labs demo · Viewing as ${resolved.persona.role_title}`,
      });
    },
  );
}
