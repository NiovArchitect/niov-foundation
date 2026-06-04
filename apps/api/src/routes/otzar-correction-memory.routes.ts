// FILE: otzar-correction-memory.routes.ts
// PURPOSE: Phase EDX-5 PR 2 — HTTP surface for the TwinCorrectionMemory
//          substrate landed at EDX-5 PR 1 (#273). Self-scoped
//          employee routes (no admin gate) so an employee can
//          create, list, and revoke personal-preferences /
//          terminology / tone / sensitivity-boundary / ask-before-
//          acting corrections for their own work-style memory.
//
//          - POST /api/v1/otzar/my-twin/corrections
//          - GET  /api/v1/otzar/my-twin/corrections
//          - POST /api/v1/otzar/my-twin/corrections/:correction_id/revoke
//
//          Coexists with POST /api/v1/otzar/correction (ADR-0055 Wave
//          2C; the existing free-form CORRECTION MemoryCapsule
//          endpoint). The new routes are the structurally-richer
//          canonicalization; the existing route stays unchanged.
//
// PRIVACY INVARIANT:
//   - Response always projects through projectTwinCorrectionSafeView
//     (no source_message_id / source_conversation_id leakage).
//   - Cross-tenant guard at the service tier (caller-must-be-owner
//     on revoke; self-scoped list).
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/twin-correction-memory.service.ts
//   - apps/api/src/services/auth.service.ts
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import type { FastifyInstance } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  createTwinCorrectionMemoryForCaller,
  listTwinCorrectionsForCaller,
  revokeTwinCorrectionForCaller,
  type TwinCorrectionRetentionClass,
  type TwinCorrectionScopeType,
  type TwinCorrectionState,
  type TwinCorrectionType,
} from "../services/otzar/twin-correction-memory.service.js";
import type { TwinAuthoritySensitivityClass } from "@prisma/client";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

const VALID_CORRECTION_TYPES: ReadonlyArray<TwinCorrectionType> = [
  "MEANING_CLARIFICATION",
  "TERMINOLOGY_DEFINITION",
  "PREFERENCE",
  "TONE_PREFERENCE",
  "PROJECT_PREFERENCE",
  "CLIENT_CONTEXT",
  "TEAM_BEST_PRACTICE_CANDIDATE",
  "ORG_BEST_PRACTICE_CANDIDATE",
  "FAILED_PATTERN",
  "SUCCESSFUL_PATTERN",
  "SENSITIVITY_BOUNDARY",
  "APPROVAL_PREFERENCE",
  "DO_NOT_USE_CONTEXT",
  "ASK_BEFORE_ACTING",
];

const VALID_SCOPE_TYPES: ReadonlyArray<TwinCorrectionScopeType> = [
  "PERSONAL",
  "CONVERSATION",
  "PROJECT",
  "TEAM",
  "ROLE",
  "ORG",
];

const VALID_STATES: ReadonlyArray<TwinCorrectionState> = [
  "ACTIVE",
  "REVOKED",
  "SUPERSEDED",
  "EXPIRED",
  "PROMOTED_TO_TEAM_PATTERN",
  "PROMOTED_TO_ORG_PATTERN",
];

const VALID_SENSITIVITY_CLASSES: ReadonlyArray<TwinAuthoritySensitivityClass> = [
  "LOW",
  "MODERATE",
  "HIGH",
  "REGULATED",
  "CUSTOMER_SENSITIVE",
  "FINANCIAL",
  "LEGAL",
  "SECURITY",
  "PERSONAL_MEMORY",
  "CONNECTOR_WRITE",
];

const VALID_RETENTION_CLASSES: ReadonlyArray<TwinCorrectionRetentionClass> = [
  "EPHEMERAL",
  "STANDARD",
  "LONG_RETENTION",
  "PERMANENT_UNTIL_REVOKED",
];

export async function registerOtzarCorrectionMemoryRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /api/v1/otzar/my-twin/corrections
  app.post<{
    Body: {
      scope_type?: unknown;
      scope_id?: unknown;
      correction_type?: unknown;
      safe_summary?: unknown;
      sensitivity_class?: unknown;
      retention_class?: unknown;
      source_message_id?: unknown;
      source_conversation_id?: unknown;
      expires_at?: unknown;
    };
  }>("/api/v1/otzar/my-twin/corrections", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply
        .code(401)
        .send({ ok: false, code: session.code, message: "denied" });
    }
    const callerEntityId = session.entity_id;
    const body = request.body ?? {};

    if (
      typeof body.scope_type !== "string" ||
      !(VALID_SCOPE_TYPES as ReadonlyArray<string>).includes(body.scope_type)
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "scope_type is required (closed vocab)",
      });
    }
    if (
      typeof body.correction_type !== "string" ||
      !(VALID_CORRECTION_TYPES as ReadonlyArray<string>).includes(
        body.correction_type,
      )
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "correction_type is required (closed vocab)",
      });
    }
    if (
      typeof body.safe_summary !== "string" ||
      body.safe_summary.length === 0
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "safe_summary is required (non-empty string)",
      });
    }
    if (
      body.sensitivity_class !== undefined &&
      (typeof body.sensitivity_class !== "string" ||
        !(VALID_SENSITIVITY_CLASSES as ReadonlyArray<string>).includes(
          body.sensitivity_class,
        ))
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "sensitivity_class must be a closed-vocab value when provided",
      });
    }
    if (
      body.retention_class !== undefined &&
      (typeof body.retention_class !== "string" ||
        !(VALID_RETENTION_CLASSES as ReadonlyArray<string>).includes(
          body.retention_class,
        ))
    ) {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "retention_class must be a closed-vocab value when provided",
      });
    }
    let expiresAt: Date | undefined;
    if (typeof body.expires_at === "string" && body.expires_at.length > 0) {
      const parsed = new Date(body.expires_at);
      if (Number.isNaN(parsed.getTime())) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "expires_at must be a valid ISO-8601 timestamp when provided",
        });
      }
      if (parsed.getTime() <= Date.now()) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "expires_at must be in the future",
        });
      }
      expiresAt = parsed;
    }

    const { getOrgEntityId } = await import("../services/governance/org.js");
    let orgEntityId: string | null;
    try {
      orgEntityId = await getOrgEntityId(callerEntityId);
    } catch {
      orgEntityId = null;
    }
    if (orgEntityId === null) {
      return reply.code(403).send({
        ok: false,
        code: "ORG_NOT_RESOLVED",
        message: "Caller has no resolvable org context",
      });
    }

    const view = await createTwinCorrectionMemoryForCaller({
      callerEntityId,
      orgEntityId,
      scopeType: body.scope_type as TwinCorrectionScopeType,
      scopeId: typeof body.scope_id === "string" ? body.scope_id : null,
      correctionType: body.correction_type as TwinCorrectionType,
      safeSummary: body.safe_summary,
      sensitivityClass:
        typeof body.sensitivity_class === "string"
          ? (body.sensitivity_class as TwinAuthoritySensitivityClass)
          : undefined,
      retentionClass:
        typeof body.retention_class === "string"
          ? (body.retention_class as TwinCorrectionRetentionClass)
          : undefined,
      sourceMessageId:
        typeof body.source_message_id === "string"
          ? body.source_message_id
          : null,
      sourceConversationId:
        typeof body.source_conversation_id === "string"
          ? body.source_conversation_id
          : null,
      expiresAt: expiresAt ?? null,
    });

    return reply.code(201).send({ ok: true, correction: view });
  });

  // GET /api/v1/otzar/my-twin/corrections
  app.get<{
    Querystring: {
      state?: string;
      correction_type?: string;
      scope_type?: string;
      take?: string;
    };
  }>("/api/v1/otzar/my-twin/corrections", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      return reply.code(401).send({
        ok: false,
        code: "SESSION_INVALID",
        message: "Missing bearer token",
      });
    }
    const session = await authService.validateSession(token, "read");
    if (!session.valid) {
      return reply
        .code(401)
        .send({ ok: false, code: session.code, message: "denied" });
    }
    const callerEntityId = session.entity_id;

    let stateFilter: TwinCorrectionState | undefined;
    if (typeof request.query.state === "string") {
      if (
        !(VALID_STATES as ReadonlyArray<string>).includes(request.query.state)
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "state must be a closed-vocab value when provided",
        });
      }
      stateFilter = request.query.state as TwinCorrectionState;
    }
    let correctionTypeFilter: TwinCorrectionType | undefined;
    if (typeof request.query.correction_type === "string") {
      if (
        !(VALID_CORRECTION_TYPES as ReadonlyArray<string>).includes(
          request.query.correction_type,
        )
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "correction_type must be a closed-vocab value when provided",
        });
      }
      correctionTypeFilter = request.query.correction_type as TwinCorrectionType;
    }
    let scopeTypeFilter: TwinCorrectionScopeType | undefined;
    if (typeof request.query.scope_type === "string") {
      if (
        !(VALID_SCOPE_TYPES as ReadonlyArray<string>).includes(
          request.query.scope_type,
        )
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "scope_type must be a closed-vocab value when provided",
        });
      }
      scopeTypeFilter = request.query.scope_type as TwinCorrectionScopeType;
    }
    let takeNum: number | undefined;
    if (typeof request.query.take === "string") {
      const parsed = Number.parseInt(request.query.take, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        takeNum = parsed;
      }
    }
    const corrections = await listTwinCorrectionsForCaller({
      callerEntityId,
      state: stateFilter,
      correctionType: correctionTypeFilter,
      scopeType: scopeTypeFilter,
      take: takeNum,
    });
    return reply.code(200).send({ ok: true, corrections });
  });

  // POST /api/v1/otzar/my-twin/corrections/:correction_id/revoke
  app.post<{
    Params: { correction_id: string };
  }>(
    "/api/v1/otzar/my-twin/corrections/:correction_id/revoke",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null) {
        return reply.code(401).send({
          ok: false,
          code: "SESSION_INVALID",
          message: "Missing bearer token",
        });
      }
      const session = await authService.validateSession(token, "read");
      if (!session.valid) {
        return reply
          .code(401)
          .send({ ok: false, code: session.code, message: "denied" });
      }
      const result = await revokeTwinCorrectionForCaller({
        callerEntityId: session.entity_id,
        correctionId: request.params.correction_id,
      });
      if (!result.ok) {
        let httpCode = 400;
        switch (result.code) {
          case "CORRECTION_NOT_FOUND":
            httpCode = 404;
            break;
          case "NOT_OWNER":
            httpCode = 403;
            break;
          case "ALREADY_REVOKED":
          case "ALREADY_SUPERSEDED":
          case "ALREADY_EXPIRED":
          case "ALREADY_PROMOTED":
            httpCode = 409;
            break;
        }
        return reply.code(httpCode).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
