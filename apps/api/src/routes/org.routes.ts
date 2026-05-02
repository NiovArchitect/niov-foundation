// FILE: org.routes.ts
// PURPOSE: HTTP surface for /org/* admin operations -- bulk add
//          members, drive Dandelion Phase 2 (analyze) / Phase 3
//          (invite) / Phase 4 (status + reorder). Every route here
//          is gated by can_admin_org and resolves the caller's org
//          via getOrgEntityId so cross-tenant calls fail closed.
// CONNECTS TO: admin.middleware.ts (capability gate), AuthService
//              (session validation), dandelion.service.ts (phase
//              functions), org.ts (getOrgEntityId), prisma (direct
//              writes for member-add since that's a single-table op).

import { randomUUID } from "node:crypto";
import { hashPassword } from "@niov/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createTARInTx,
  createWalletInTx,
  prisma,
  writeAudit,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
  type Entity,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  analyzePhase2,
  executePhase3Invite,
  getPhase4Status,
  reorderPhase4,
  type PropagationEntry,
} from "../services/governance/dandelion.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: One row in the bulk-add body.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Spec caps bulk add at 500 rows. Each row is a thin
//      MemberInput shape.
interface MemberInput {
  email?: unknown;
  password?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  role_title?: unknown;
  hierarchy_level?: unknown;
  is_admin?: unknown;
}

const BULK_ADD_LIMIT = 500;

// WHAT: Validate + coerce a body field to non-empty string or null.
// INPUT: Any value.
// OUTPUT: The string when valid, null otherwise.
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// WHAT: Resolve the caller's org or write a 404 and return null.
// INPUT: The entity_id from req.auth.
// OUTPUT: The org's entity_id when resolvable, null when not (with
//         the reply already sent).
// WHY: Every /org/* route needs the same boilerplate. Centralizing
//      it gives consistent 404 behavior on orgless callers.
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

// WHAT: Inline body for adding one PERSON entity to an org.
// INPUT: The new member fields, the resolved org_entity_id, and the
//        actor_entity_id (the admin who triggered the add).
// OUTPUT: The newly created Entity row.
// WHY: One-shot data layer call; we never call createEntity
//      directly because we want to attach the EntityMembership row
//      in the same transaction as the entity + wallet + TAR + profile.
async function addOneMember(
  member: MemberInput,
  orgEntityId: string,
  actorEntityId: string,
): Promise<Entity> {
  const email = asNonEmptyString(member.email);
  const password = asNonEmptyString(member.password);
  const firstName = asNonEmptyString(member.first_name);
  const lastName = asNonEmptyString(member.last_name);
  const roleTitle = asNonEmptyString(member.role_title);
  const hierarchyLevel =
    typeof member.hierarchy_level === "number" &&
    Number.isInteger(member.hierarchy_level)
      ? member.hierarchy_level
      : 0;
  const isAdmin = member.is_admin === true;
  if (email === null || password === null) {
    throw new Error("INVALID_MEMBER_INPUT");
  }
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const entityId = randomUUID();
    const created = await tx.entity.create({
      data: {
        entity_id: entityId,
        entity_type: "PERSON",
        display_name:
          `${firstName ?? ""} ${lastName ?? ""}`.trim() || email,
        public_key: `pk_person_${entityId}`,
        email,
        password_hash: passwordHash,
        status: "ACTIVE",
        clearance_level: isAdmin ? 6 : 4,
      },
    });
    const wallet = await createWalletInTx(tx, {
      entity_id: entityId,
      wallet_type: "PERSONAL",
    });
    await writeWalletCreateAudit(tx, wallet, actorEntityId);
    const tar = await createTARInTx(tx, {
      entity_id: entityId,
      entity_type: "PERSON",
    });
    await writeTARCreateAudit(tx, tar, actorEntityId);
    await writeAudit(tx, {
      action: "ENTITY_CREATE",
      entity_id: entityId,
      actor_id: actorEntityId,
      meta: {
        entity_type: "PERSON",
        display_name: created.display_name,
        via: "org_members_add",
      },
    });
    await tx.entityProfile.create({
      data: {
        profile_id: randomUUID(),
        entity_id: entityId,
        first_name: firstName,
        last_name: lastName,
        job_title: roleTitle,
      },
    });
    await tx.entityMembership.create({
      data: {
        parent_id: orgEntityId,
        child_id: entityId,
        role_title: roleTitle,
        hierarchy_level: hierarchyLevel,
        is_admin: isAdmin,
        is_active: true,
      },
    });
    await writeAuditEvent(
      {
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: actorEntityId,
        target_entity_id: entityId,
        details: {
          action: "ORG_MEMBER_ADDED",
          org_entity_id: orgEntityId,
          email,
          role_title: roleTitle,
          hierarchy_level: hierarchyLevel,
          is_admin: isAdmin,
        },
      },
      tx,
    );
    return created;
  });
}

// WHAT: Register the /org/* routes.
// INPUT: Fastify instance and AuthService (for the admin gate).
// OUTPUT: A promise resolving once registration completes.
export async function registerOrgRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // POST /org/members -- single-member add.
  app.post<{ Body: MemberInput }>(
    "/api/v1/org/members",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request: FastifyRequest<{ Body: MemberInput }>, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      try {
        const member = await addOneMember(
          request.body ?? {},
          orgEntityId,
          callerId,
        );
        return reply.code(201).send({
          ok: true,
          entity_id: member.entity_id,
          email: member.email,
          display_name: member.display_name,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (message === "INVALID_MEMBER_INPUT") {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "email + password are required",
          });
        }
        if (message.includes("Unique constraint")) {
          return reply.code(409).send({
            ok: false,
            code: "EMAIL_ALREADY_EXISTS",
            message: "An entity with that email already exists",
          });
        }
        return reply.code(500).send({
          ok: false,
          code: "MEMBER_ADD_FAILED",
          message,
        });
      }
    },
  );

  // POST /org/members/bulk -- batch add.
  app.post<{ Body: { members?: MemberInput[] } }>(
    "/api/v1/org/members/bulk",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const members = request.body?.members;
      if (!Array.isArray(members) || members.length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "members must be a non-empty array",
        });
      }
      if (members.length > BULK_ADD_LIMIT) {
        return reply.code(422).send({
          ok: false,
          code: "TOO_MANY_MEMBERS",
          message: `bulk add cap is ${BULK_ADD_LIMIT}`,
        });
      }
      const created: Array<{ entity_id: string; email: string | null }> = [];
      const failures: Array<{ index: number; error: string }> = [];
      for (let i = 0; i < members.length; i++) {
        try {
          const m = await addOneMember(members[i]!, orgEntityId, callerId);
          created.push({ entity_id: m.entity_id, email: m.email });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown";
          failures.push({ index: i, error: message });
        }
      }
      return reply.code(207).send({
        ok: true,
        created_count: created.length,
        failure_count: failures.length,
        created,
        failures,
      });
    },
  );

  // POST /org/onboarding/start -- Phase 2 analyze.
  app.post(
    "/api/v1/org/onboarding/start",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const result = await analyzePhase2(orgEntityId);
      return reply.code(200).send({ ok: true, ...result });
    },
  );

  // POST /org/onboarding/invite -- Phase 3 atomic invite.
  app.post<{ Body: { entity_id?: unknown } }>(
    "/api/v1/org/onboarding/invite",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const targetId = asNonEmptyString(request.body?.entity_id);
      if (targetId === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "entity_id is required",
        });
      }
      try {
        const result = await executePhase3Invite(
          orgEntityId,
          targetId,
          callerId,
        );
        return reply.code(200).send({ ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (message === "PENDING_MEMBER_NOT_FOUND") {
          // Cross-tenant guard: 404 reveals nothing about whether
          // the entity exists in some other org.
          return reply.code(404).send({
            ok: false,
            code: "PENDING_MEMBER_NOT_FOUND",
            message: "No such pending member in your org",
          });
        }
        if (message === "TWIN_ALREADY_EXISTS") {
          return reply.code(409).send({
            ok: false,
            code: "TWIN_ALREADY_EXISTS",
            message: "Member already has a twin",
          });
        }
        return reply.code(500).send({
          ok: false,
          code: "PHASE_3_FAILED",
          message,
        });
      }
    },
  );

  // POST /org/onboarding/reorder.
  app.post<{ Body: { propagation_order?: unknown } }>(
    "/api/v1/org/onboarding/reorder",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const order = request.body?.propagation_order;
      if (!Array.isArray(order)) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "propagation_order must be an array",
        });
      }
      const status = await reorderPhase4(
        orgEntityId,
        order as PropagationEntry[],
      );
      return reply.code(200).send({ ok: true, ...status });
    },
  );

  // GET /org/onboarding/status.
  app.get(
    "/api/v1/org/onboarding/status",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const status = await getPhase4Status(orgEntityId);
      return reply.code(200).send({ ok: true, ...status });
    },
  );
}
