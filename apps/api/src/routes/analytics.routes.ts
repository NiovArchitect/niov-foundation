// FILE: analytics.routes.ts
// PURPOSE: Section 6 Enterprise Analytics admin routes per
//          ADR-0061 §1.g. Each route is can_admin_org-gated +
//          same-org scoped via getOrgEntityId; service tier
//          enforces k=5 minimum-population threshold + SAFE
//          projection.
// CONNECTS TO:
//   - apps/api/src/services/analytics/analytics.service.ts
//   - apps/api/src/middleware/admin.middleware.ts
//     (requireAdminCapability)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)
//   - ADR-0061 Section 6 Enterprise Analytics v1 SAFE Projection
//     Pattern

import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";
import type {
  AnalyticsFailure,
  AnalyticsService,
} from "../services/analytics/analytics.service.js";

// WHAT: Resolve the caller's org_entity_id or send a 404 and
//        return null. Mirrors connector.routes.ts +
//        hive-admin.routes.ts canonical resolveOrgOrFail
//        helper.
// INPUT: entityId + reply.
// OUTPUT: Promise<string | null>.
// WHY: Cross-tenant fail-closed: an admin without an org gets a
//      404 NO_ORG_FOR_CALLER before any aggregate query runs.
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

// WHAT: Map an AnalyticsFailure to an HTTP status.
// INPUT: AnalyticsFailure.
// OUTPUT: number.
// WHY: Centralizes the route-tier status mapping so every
//      analytics aggregate route surfaces the same code →
//      status table.
function statusFor(failure: AnalyticsFailure): number {
  switch (failure.code) {
    case "INVALID_REQUEST":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}

// WHAT: Parse a single optional integer field from a Fastify
//        querystring object.
// INPUT: The raw query value + the field name.
// OUTPUT: number | undefined | "INVALID".
// WHY: Fastify querystrings arrive as strings; an
//      undefined value means "use the service default";
//      a non-numeric string is an INVALID_REQUEST that the
//      route surfaces as 422.
function parseOptionalIntQuery(
  raw: unknown,
): number | undefined | "INVALID" {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return "INVALID";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return "INVALID";
  return parsed;
}

// WHAT: Register the Section 6 v1 analytics admin routes.
// INPUT: Fastify instance + AuthService + AnalyticsService.
// OUTPUT: A promise that resolves once registration completes.
// WHY: Mirrors registerHiveAdminRoutes + registerConnectorRoutes
//      pattern verbatim. All routes preHandler-gated by
//      requireAdminCapability("can_admin_org"); local
//      resolveOrgOrFail enforces orgless callers fail-closed
//      with 404 NO_ORG_FOR_CALLER.
export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  authService: AuthService,
  analytics: AnalyticsService,
): Promise<void> {
  // POST /api/v1/analytics/correction-velocity
  // Body: { window_days?: number = 7 } (clamped 1..30 at service tier)
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/correction-velocity",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      // Body window_days is optional; we accept either a number
      // OR a numeric string OR undefined. Non-numeric strings
      // collapse to INVALID at the service tier.
      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getCorrectionVelocityForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/action-runtime-success-rate
  // Body: { window_days?: number = 7 } (clamped 1..30 at service tier)
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/action-runtime-success-rate",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getActionRuntimeSuccessRateForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/compliance-posture
  // Body: { window_days?: number = 7 } (clamped 1..30 at service tier)
  // Org-level compliance posture metadata aggregate per ADR-0061
  // §8 forward queue. Reads org's EntityComplianceProfile +
  // ComplianceFramework + recent COMPLIANCE_CHECK_PASSED/FAILED
  // audit counts; emits safe label HEALTHY|WATCH|DEGRADED|
  // NOT_CONFIGURED|INSUFFICIENT_POPULATION. NOT legal advice;
  // NOT certification; NOT employee compliance scoring. Same
  // can_admin_org + same-org + k=5 + ANALYTICS_READ (no new
  // audit literal) contract as the other 5 aggregates.
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/compliance-posture",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getCompliancePostureForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/action-runtime-by-action-type
  // Body: { window_days?: number = 7 } (clamped 1..30 at service tier)
  // Per-ActionType action-runtime health aggregate per ADR-0061
  // §8 forward-queue ("Wave 3+ additional aggregates as operator
  // demand surfaces"). Same k=5 + ANALYTICS_READ audit + SAFE
  // projection contract as Wave 3 org-wide success-rate; per-row
  // ACTION_RUNTIME_MIN_VOLUME redaction at the ActionType tier.
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/action-runtime-by-action-type",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getActionRuntimeByActionTypeForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/connector-activity
  // Body: { window_days?: number = 7 } (clamped 1..30 at service tier)
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/connector-activity",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getConnectorActivityForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/hive-participation
  // Body: {} (no window — participation is current-state)
  app.post(
    "/api/v1/analytics/hive-participation",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await analytics.getHiveParticipationForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );

  // POST /api/v1/analytics/approval-backlog per ADR-0087 §4.
  // The FIRST Hive Intelligence Runtime signal: same-org
  // EscalationRequest pending-rate over the window. Bearer +
  // can_admin_org-gated. Body: { window_days?: number = 7 }
  // (clamped 1..30 at the service tier).
  app.post<{ Body: { window_days?: unknown } }>(
    "/api/v1/analytics/approval-backlog",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const rawWindow = request.body?.window_days;
      let windowDays: number | undefined;
      if (rawWindow === undefined) {
        windowDays = undefined;
      } else if (typeof rawWindow === "number") {
        windowDays = rawWindow;
      } else if (typeof rawWindow === "string") {
        const parsed = parseOptionalIntQuery(rawWindow);
        if (parsed === "INVALID") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "window_days must be an integer",
            invalid_fields: ["window_days"],
          });
        }
        windowDays = parsed;
      } else {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "window_days must be a number",
          invalid_fields: ["window_days"],
        });
      }

      const result = await analytics.getApprovalBacklogForOrg({
        org_entity_id: orgEntityId,
        actor_entity_id: callerId,
        ...(windowDays !== undefined ? { window_days: windowDays } : {}),
        ip_address: request.ip ?? null,
      });
      if (result.ok === true) {
        return reply.code(200).send(result);
      }
      return reply.code(statusFor(result)).send({
        ok: false,
        code: result.code,
        message: result.message,
        ...(result.invalid_fields !== undefined
          ? { invalid_fields: result.invalid_fields }
          : {}),
      });
    },
  );
}
