// FILE: otzar-observation.routes.ts
// PURPOSE: HTTP surface for the Section 11C observation pipeline.
//          POST /otzar/observe (bearer-validated, no admin gate;
//          user-facing employee route), POST /otzar/correction
//          (same gate), POST /otzar/domain/vocabulary (can_admin_org
//          gate, alias of POST /org/vocabulary).
// CONNECTS TO: ObservationService, AuthService (admin gate),
//              requireAdminCapability middleware.

import type { FastifyInstance } from "fastify";
import type { ObservationService } from "../services/otzar/observation.service.js";
import type { AuthService } from "../services/auth.service.js";
import { requireAdminCapability } from "../middleware/admin.middleware.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function statusForCode(code: string): number {
  switch (code) {
    case "SESSION_INVALID":
    case "SESSION_EXPIRED":
    case "SESSION_REVOKED":
    case "SESSION_INVALIDATED":
      return 401;
    case "OPERATION_NOT_PERMITTED":
    // ADR-0055 Wave 2C: processCorrection self-scope failure when an
    // optional conversation_id is provided but the caller does not own
    // the conversation. Mirrors ADR-0054 getConversationDetail mapping.
    case "NOT_CONVERSATION_OWNER":
      return 403;
    case "ORG_NOT_RESOLVED":
    case "CONVERSATION_NOT_FOUND":
      return 404;
    case "EXTRACTION_FAILED":
      return 502;
    default:
      return 400;
  }
}

export async function registerOtzarObservationRoutes(
  app: FastifyInstance,
  observationService: ObservationService,
  authService: AuthService,
): Promise<void> {
  // POST /otzar/observe -- main observation entry point.
  app.post<{
    Body: {
      content?: unknown;
      event_type?: unknown;
      org_entity_id?: unknown;
    };
  }>("/api/v1/otzar/observe", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (typeof body.content !== "string" || body.content.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "content is required (non-empty string)",
      });
    }
    if (typeof body.event_type !== "string" || body.event_type.length === 0) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "event_type is required (non-empty string)",
      });
    }
    const orgEntityId =
      typeof body.org_entity_id === "string" && body.org_entity_id.length > 0
        ? body.org_entity_id
        : undefined;
    const result = await observationService.observe({
      token,
      content: body.content,
      event_type: body.event_type,
      org_entity_id: orgEntityId,
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // POST /otzar/correction -- write CORRECTION to employee wallet.
  // ADR-0055 Wave 2C: body accepts an OPTIONAL conversation_id. Omitted
  // = backward-compatible (capsule persists with conversation_id null).
  // Provided = service validates self-scope before persisting; cross-
  // caller or unknown id maps to NOT_CONVERSATION_OWNER / CONVERSATION_
  // NOT_FOUND.
  app.post<{
    Body: {
      incorrect_description?: unknown;
      correct_behavior?: unknown;
      target_capsule_id?: unknown;
      conversation_id?: unknown;
    };
  }>("/api/v1/otzar/correction", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const body = request.body ?? {};
    if (
      typeof body.incorrect_description !== "string" ||
      body.incorrect_description.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "incorrect_description is required",
      });
    }
    if (
      typeof body.correct_behavior !== "string" ||
      body.correct_behavior.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "correct_behavior is required",
      });
    }
    const targetCapsuleId =
      typeof body.target_capsule_id === "string" &&
      body.target_capsule_id.length > 0
        ? body.target_capsule_id
        : undefined;
    const conversationId =
      typeof body.conversation_id === "string" &&
      body.conversation_id.length > 0
        ? body.conversation_id
        : undefined;
    const result = await observationService.processCorrection({
      token,
      incorrect_description: body.incorrect_description,
      correct_behavior: body.correct_behavior,
      target_capsule_id: targetCapsuleId,
      conversation_id: conversationId,
    });
    if (!result.ok) {
      return reply.code(statusForCode(result.code)).send(result);
    }
    return reply.code(200).send(result);
  });

  // POST /otzar/domain/vocabulary -- alias of POST /org/vocabulary.
  // ALIAS: same code path as POST /org/vocabulary; this URL exists
  // for client conventions that group Otzar admin actions under
  // /otzar/*. Both go through prisma.domainVocabulary.createMany
  // skipDuplicates, so adding via either route + then re-adding via
  // the other is a no-op. JSDoc-equivalent note.
  app.post<{
    Body: {
      term?: unknown;
      term_type?: unknown;
      definition?: unknown;
      aliases?: unknown;
      org_entity_id?: unknown;
    };
  }>(
    "/api/v1/otzar/domain/vocabulary",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const body = request.body ?? {};
      if (typeof body.term !== "string" || body.term.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "term is required",
        });
      }
      const termType =
        typeof body.term_type === "string" && body.term_type.length > 0
          ? body.term_type
          : "ACRONYM";
      const definition =
        typeof body.definition === "string" ? body.definition : undefined;
      const aliases = Array.isArray(body.aliases)
        ? body.aliases.filter((a): a is string => typeof a === "string")
        : undefined;
      const orgEntityId =
        typeof body.org_entity_id === "string" && body.org_entity_id.length > 0
          ? body.org_entity_id
          : undefined;
      const result = await observationService.addDomainTerm({
        token,
        term: body.term,
        term_type: termType,
        definition,
        aliases,
        org_entity_id: orgEntityId,
      });
      if (!result.ok) {
        return reply.code(statusForCode(result.code)).send(result);
      }
      return reply.code(201).send(result);
    },
  );
}
