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
}
