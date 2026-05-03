// FILE: platform.routes.ts
// PURPOSE: HTTP surface for NIOV-Platform-level operations -- the
//          /platform/* namespace, today carrying just POST /orgs
//          (Dandelion Phase 0 createOrg). Every route here is
//          gated by can_admin_niov.
// CONNECTS TO: dandelion.service.ts (executePhase0),
//              admin.middleware.ts (capability gate),
//              auth.service.ts (session validation upstream).

import type { FastifyInstance } from "fastify";
import { hashPassword as _hashPassword } from "@niov/auth";
import {
  MAX_AUDIT_EVENTS_PAGE_SIZE,
  prisma,
  writeAuditEvent,
  type Prisma,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  executePhase0,
  type Phase0Input,
} from "../services/governance/dandelion.service.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Body shape for POST /platform/orgs.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Routes use it for Fastify body typing; tests mirror it.
interface CreateOrgBody {
  company_name?: unknown;
  industry?: unknown;
  admin_email?: unknown;
  admin_password?: unknown;
  admin_first_name?: unknown;
  admin_last_name?: unknown;
}

// WHAT: Validate + coerce a body field to non-empty string or null.
// INPUT: Any value.
// OUTPUT: The string when valid, null otherwise.
// WHY: Routes get JSON bodies; we always type-check before passing
//      to a service.
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// WHAT: Register the /platform/* routes.
// INPUT: Fastify instance and AuthService (for the admin capability
//        gate).
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One register-fn per file matches the existing pattern.
export async function registerPlatformRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.post<{ Body: CreateOrgBody }>(
    "/api/v1/platform/orgs",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const companyName = asNonEmptyString(body.company_name);
      const adminEmail = asNonEmptyString(body.admin_email);
      const adminPassword = asNonEmptyString(body.admin_password);
      if (companyName === null || adminEmail === null || adminPassword === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message:
            "company_name, admin_email, admin_password are required strings",
        });
      }
      const industry = asNonEmptyString(body.industry);
      const firstName = asNonEmptyString(body.admin_first_name);
      const lastName = asNonEmptyString(body.admin_last_name);

      const phase0Input: Phase0Input = {
        company_name: companyName,
        industry,
        admin_email: adminEmail,
        admin_password: adminPassword,
        admin_first_name: firstName,
        admin_last_name: lastName,
        actor_entity_id: request.auth?.entity_id ?? null,
      };

      try {
        const result = await executePhase0(phase0Input);
        return reply.code(201).send({ ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (
          message.includes("Unique constraint") ||
          message.includes("DEFAULT_HIVE_ALREADY_EXISTS")
        ) {
          return reply.code(409).send({
            ok: false,
            code: "ORG_CREATE_CONFLICT",
            message: "Conflict creating the org (duplicate or default-Hive race)",
          });
        }
        return reply.code(500).send({
          ok: false,
          code: "PHASE_0_FAILED",
          message,
        });
      }
    },
  );

  // ════════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════════

  // GET /platform/stats -- aggregate counts across all orgs.
  app.get(
    "/api/v1/platform/stats",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (_request, reply) => {
      const [
        totalEntities,
        totalCompanies,
        totalAITwins,
        totalCapsules,
      ] = await Promise.all([
        prisma.entity.groupBy({
          by: ["entity_type"],
          where: { deleted_at: null },
          _count: { entity_id: true },
        }),
        prisma.entity.count({
          where: { entity_type: "COMPANY", deleted_at: null },
        }),
        prisma.entity.count({
          where: { entity_type: "AI_AGENT", deleted_at: null },
        }),
        prisma.memoryCapsule.count({ where: { deleted_at: null } }),
      ]);
      const total_entities_by_type: Record<string, number> = {};
      for (const row of totalEntities) {
        total_entities_by_type[row.entity_type] = row._count.entity_id;
      }
      return reply.code(200).send({
        ok: true,
        total_entities_by_type,
        total_orgs: totalCompanies,
        total_active_twins: totalAITwins,
        total_capsules: totalCapsules,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // AUDIT
  // ════════════════════════════════════════════════════════════════

  // GET /platform/audit -- audit_events across all orgs.
  // Caps at MAX_AUDIT_EVENTS_PAGE_SIZE per Section 1E.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/platform/audit",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (request, reply) => {
      const skipNum = Number.parseInt(request.query.skip ?? "0", 10);
      const takeNum = Number.parseInt(request.query.take ?? "50", 10);
      const skip = Number.isFinite(skipNum) && skipNum >= 0 ? skipNum : 0;
      const take = Math.max(
        1,
        Math.min(
          MAX_AUDIT_EVENTS_PAGE_SIZE,
          Number.isFinite(takeNum) ? takeNum : 50,
        ),
      );
      const [items, total] = await Promise.all([
        prisma.auditEvent.findMany({
          skip,
          take,
          orderBy: { timestamp: "desc" },
        }),
        prisma.auditEvent.count(),
      ]);
      return reply.code(200).send({
        ok: true,
        items,
        total,
        has_more: skip + take < total,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // MONETIZATION CONFIG
  // ════════════════════════════════════════════════════════════════

  // PATCH /platform/monetization/config -- update the 70/30 split.
  // Validates niov_fee_share + holder_share === 1.0 (within
  // floating-point tolerance). Audit captures BOTH old + new shares
  // so a future audit reader can reconstruct the rate-change history.
  app.patch<{
    Body: { niov_fee_share?: unknown; holder_share?: unknown };
  }>(
    "/api/v1/platform/monetization/config",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const niov = body.niov_fee_share;
      const holder = body.holder_share;
      if (typeof niov !== "number" || typeof holder !== "number") {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "niov_fee_share and holder_share must be numbers",
        });
      }
      if (niov < 0 || niov > 1 || holder < 0 || holder > 1) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_SHARE_RANGE",
          message: "Shares must be in [0, 1]",
        });
      }
      if (Math.abs(niov + holder - 1.0) > 0.0001) {
        return reply.code(422).send({
          ok: false,
          code: "SHARES_DO_NOT_SUM_TO_ONE",
          message: `niov_fee_share + holder_share must equal 1.0 (got ${niov + holder})`,
        });
      }
      const existing = await prisma.monetizationConfig.findFirst();
      const oldShares = existing
        ? {
            niov_fee_share: existing.niov_fee_share,
            holder_share: existing.holder_share,
          }
        : { niov_fee_share: 0.3, holder_share: 0.7 };
      const data: Prisma.MonetizationConfigUpdateInput = {
        niov_fee_share: niov,
        holder_share: holder,
        updated_by: request.auth?.entity_id ?? null,
      };
      let updated;
      if (existing) {
        updated = await prisma.monetizationConfig.update({
          where: { config_id: existing.config_id },
          data,
        });
      } else {
        updated = await prisma.monetizationConfig.create({
          data: {
            niov_fee_share: niov,
            holder_share: holder,
            updated_by: request.auth?.entity_id ?? null,
          },
        });
      }
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: request.auth?.entity_id ?? null,
        details: {
          action: "MONETIZATION_CONFIG_UPDATE",
          old: oldShares,
          new: { niov_fee_share: niov, holder_share: holder },
        },
      });
      return reply.code(200).send({ ok: true, config: updated });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // ANOMALIES (stub; TODO Section 10 IncidentRecord table)
  // ════════════════════════════════════════════════════════════════

  app.get(
    "/api/v1/platform/anomalies",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (_request, reply) => {
      // TODO(Section 10): query IncidentRecord rows where status=OPEN.
      return reply.code(200).send({
        ok: true,
        items: [],
        total: 0,
        has_more: false,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // LOOPS (Section 10 -- reads FeedbackLoopHealth)
  // ════════════════════════════════════════════════════════════════

  app.get(
    "/api/v1/platform/loops",
    {
      preHandler: requireAdminCapability(authService, "can_admin_niov"),
    },
    async (_request, reply) => {
      const items = await prisma.feedbackLoopHealth.findMany({
        orderBy: { loop_id: "asc" },
      });
      return reply.code(200).send({
        ok: true,
        items,
        total: items.length,
        has_more: false,
      });
    },
  );
}
