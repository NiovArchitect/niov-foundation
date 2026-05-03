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
  MAX_AUDIT_EVENTS_PAGE_SIZE,
  prisma,
  writeAudit,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
  type Entity,
  type Prisma,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  analyzePhase2,
  executePhase3Invite,
  getPhase4Status,
  reorderPhase4,
  type PropagationEntry,
} from "../services/governance/dandelion.service.js";
import { createTwin } from "../services/governance/twin.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Default + max page size for list endpoints. Audit-table reads
//        cap separately at MAX_AUDIT_EVENTS_PAGE_SIZE (Section 1E).
// INPUT: Used as constants.
// OUTPUT: Numbers.
// WHY: One source of truth so a careless ?take=10000 cannot drag the
//      database down through these read endpoints.
const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// WHAT: Parse skip/take query params and clamp to safe ranges.
// INPUT: The request query bag and an optional override for the cap
//        (audit endpoints pass MAX_AUDIT_EVENTS_PAGE_SIZE).
// OUTPUT: { skip, take } with skip >= 0 and 1 <= take <= effective cap.
// WHY: Centralizes the "default 50, max 200, audit caps at 100"
//      convention across every paginated list route.
function parsePagination(
  query: { skip?: string; take?: string },
  options?: { maxTake?: number },
): { skip: number; take: number } {
  const cap = options?.maxTake ?? MAX_TAKE;
  const skipNum = Number.parseInt(query.skip ?? "0", 10);
  const takeNum = Number.parseInt(query.take ?? String(DEFAULT_TAKE), 10);
  const skip = Number.isFinite(skipNum) && skipNum >= 0 ? skipNum : 0;
  const take = Math.max(
    1,
    Math.min(cap, Number.isFinite(takeNum) ? takeNum : DEFAULT_TAKE),
  );
  return { skip, take };
}

// WHAT: Build a standard paginated-list response shape.
// INPUT: The page items and the total row count.
// OUTPUT: { items, total, has_more }.
// WHY: Routes never re-derive has_more by hand; the helper guarantees
//      a consistent client contract.
function paginatedResponse<T>(
  items: T[],
  total: number,
  skip: number,
  take: number,
): { items: T[]; total: number; has_more: boolean } {
  return { items, total, has_more: skip + take < total };
}

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

  // ════════════════════════════════════════════════════════════════
  // ENTITIES
  // ════════════════════════════════════════════════════════════════

  // GET /org/entities -- list PERSON + AI_AGENT children of caller's
  // org (paginated, optional ?type filter).
  app.get<{
    Querystring: { skip?: string; take?: string; type?: string };
  }>(
    "/api/v1/org/entities",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const typeFilter = request.query.type;
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const childIds = memberships.map((m) => m.child_id);
      const where: Prisma.EntityWhereInput = {
        entity_id: { in: childIds },
        deleted_at: null,
      };
      if (typeFilter === "PERSON" || typeFilter === "AI_AGENT") {
        where.entity_type = typeFilter;
      }
      const [items, total] = await Promise.all([
        prisma.entity.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.entity.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // GET /org/entities/:id -- single entity detail; 404 if not in org.
  app.get<{ Params: { id: string } }>(
    "/api/v1/org/entities/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const membership = await prisma.entityMembership.findFirst({
        where: {
          parent_id: orgEntityId,
          child_id: request.params.id,
          is_active: true,
        },
      });
      if (membership === null) {
        return reply.code(404).send({
          ok: false,
          code: "ENTITY_NOT_IN_ORG",
          message: "Entity is not in your org",
        });
      }
      const [entity, profile] = await Promise.all([
        prisma.entity.findUnique({ where: { entity_id: request.params.id } }),
        prisma.entityProfile.findUnique({
          where: { entity_id: request.params.id },
        }),
      ]);
      if (entity === null) {
        return reply.code(404).send({
          ok: false,
          code: "ENTITY_NOT_FOUND",
          message: "Entity not found",
        });
      }
      return reply.code(200).send({ ok: true, entity, profile, membership });
    },
  );

  // PATCH /org/entities/:id -- update status + EntityProfile fields.
  app.patch<{
    Params: { id: string };
    Body: {
      status?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      job_title?: unknown;
      phone?: unknown;
      timezone?: unknown;
      bio?: unknown;
    };
  }>(
    "/api/v1/org/entities/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const membership = await prisma.entityMembership.findFirst({
        where: {
          parent_id: orgEntityId,
          child_id: request.params.id,
          is_active: true,
        },
      });
      if (membership === null) {
        return reply.code(404).send({
          ok: false,
          code: "ENTITY_NOT_IN_ORG",
          message: "Entity is not in your org",
        });
      }
      const body = request.body ?? {};
      const entityData: Prisma.EntityUpdateInput = {};
      if (body.status === "ACTIVE" || body.status === "SUSPENDED") {
        entityData.status = body.status;
        if (body.status === "SUSPENDED") entityData.suspended_at = new Date();
        if (body.status === "ACTIVE") entityData.suspended_at = null;
      }
      const profileData: Prisma.EntityProfileUpdateInput = {};
      const profileFields: (keyof typeof body)[] = [
        "first_name",
        "last_name",
        "job_title",
        "phone",
        "timezone",
        "bio",
      ];
      for (const f of profileFields) {
        const value = body[f];
        if (typeof value === "string") {
          (profileData as Record<string, unknown>)[f] = value;
        }
      }
      if (Object.keys(entityData).length === 0 && Object.keys(profileData).length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "No writable fields provided",
        });
      }
      if (Object.keys(entityData).length > 0) {
        await prisma.entity.update({
          where: { entity_id: request.params.id },
          data: entityData,
        });
      }
      if (Object.keys(profileData).length > 0) {
        await prisma.entityProfile.upsert({
          where: { entity_id: request.params.id },
          create: {
            ...(profileData as Prisma.EntityProfileUncheckedCreateInput),
            profile_id: randomUUID(),
            entity_id: request.params.id,
          },
          update: profileData,
        });
      }
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: request.params.id,
        details: {
          action: "ORG_ENTITY_UPDATE",
          fields_changed: [
            ...Object.keys(entityData),
            ...Object.keys(profileData),
          ],
        },
      });
      return reply.code(200).send({ ok: true });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // HIERARCHY / SETTINGS / REPORT
  // ════════════════════════════════════════════════════════════════

  // GET /org/hierarchy -- flat EntityMembership list for caller's org.
  app.get(
    "/api/v1/org/hierarchy",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        orderBy: { hierarchy_level: "desc" },
      });
      return reply.code(200).send({
        ok: true,
        org_entity_id: orgEntityId,
        memberships,
      });
    },
  );

  // GET /org/settings -- live row or spec defaults.
  app.get(
    "/api/v1/org/settings",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const row = await prisma.orgSettings.findUnique({
        where: { org_entity_id: orgEntityId },
      });
      const { ORG_SETTINGS_DEFAULTS } = await import(
        "../services/governance/org.js"
      );
      const settings = row ?? {
        org_entity_id: orgEntityId,
        ...ORG_SETTINGS_DEFAULTS,
        updated_at: null,
      };
      return reply.code(200).send({ ok: true, settings });
    },
  );

  // PATCH /org/settings -- writable allowlist defense in depth.
  // Anything outside the allowlist returns 422 with the unknown
  // field names enumerated, so a future schema column added without
  // updating this allowlist cannot accidentally become user-mutable.
  const ORG_SETTINGS_WRITABLE: ReadonlySet<string> = new Set([
    "session_timeout_minutes",
    "mfa_required",
    "ip_whitelist",
    "auto_approve_low_risk",
    "cross_dept_collab",
    "swarm_formation",
    "dept_data_isolation",
    "audit_ai_actions",
    "require_human_approval",
    "federated_learning",
    "track_external_entities",
    "industry",
  ]);
  app.patch<{ Body: Record<string, unknown> }>(
    "/api/v1/org/settings",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const incomingKeys = Object.keys(body);
      const unknown = incomingKeys.filter(
        (k) => !ORG_SETTINGS_WRITABLE.has(k),
      );
      if (unknown.length > 0) {
        return reply.code(422).send({
          ok: false,
          code: "UNKNOWN_FIELD",
          message: `Unknown / immutable settings fields: ${unknown.join(", ")}`,
          unknown_fields: unknown,
        });
      }
      const data: Prisma.OrgSettingsUncheckedUpdateInput = {};
      for (const k of incomingKeys) {
        (data as Record<string, unknown>)[k] = body[k];
      }
      const updated = await prisma.orgSettings.upsert({
        where: { org_entity_id: orgEntityId },
        create: {
          ...(data as unknown as Prisma.OrgSettingsUncheckedCreateInput),
          org_entity_id: orgEntityId,
        },
        update: data,
      });
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: orgEntityId,
        details: {
          action: "ORG_SETTINGS_UPDATE",
          fields_changed: incomingKeys,
        },
      });
      return reply.code(200).send({ ok: true, settings: updated });
    },
  );

  // GET /org/report -- summary counts.
  app.get(
    "/api/v1/org/report",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const childIds = memberships.map((m) => m.child_id);
      const entities = await prisma.entity.findMany({
        where: { entity_id: { in: childIds }, deleted_at: null },
        select: { entity_id: true, entity_type: true },
      });
      const entity_counts_by_type: Record<string, number> = {};
      for (const e of entities) {
        entity_counts_by_type[e.entity_type] =
          (entity_counts_by_type[e.entity_type] ?? 0) + 1;
      }
      const orgWallet = await prisma.wallet.findUnique({
        where: { entity_id: orgEntityId },
        select: { wallet_id: true },
      });
      const capsules = orgWallet
        ? await prisma.memoryCapsule.findMany({
            where: { wallet_id: orgWallet.wallet_id, deleted_at: null },
            select: { capsule_type: true },
          })
        : [];
      const capsule_counts_by_type: Record<string, number> = {};
      for (const c of capsules) {
        capsule_counts_by_type[c.capsule_type] =
          (capsule_counts_by_type[c.capsule_type] ?? 0) + 1;
      }
      const twinIds = entities
        .filter((e) => e.entity_type === "AI_AGENT")
        .map((e) => e.entity_id);
      const twinConfigs = await prisma.twinConfig.findMany({
        where: { twin_id: { in: twinIds } },
        select: { autonomy_level: true },
      });
      const twin_counts_by_autonomy_level: Record<string, number> = {};
      for (const t of twinConfigs) {
        twin_counts_by_autonomy_level[t.autonomy_level] =
          (twin_counts_by_autonomy_level[t.autonomy_level] ?? 0) + 1;
      }
      return reply.code(200).send({
        ok: true,
        org_entity_id: orgEntityId,
        entity_counts_by_type,
        capsule_counts_by_type,
        twin_counts_by_autonomy_level,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // CAPSULES / PERMISSIONS / HIVES / AUDIT
  // ════════════════════════════════════════════════════════════════

  // GET /org/capsules -- ORG WALLET ONLY (entity_id == COMPANY).
  // Member personal wallets stay out of this endpoint to honor the
  // patent's three-wallet portability claim and the privacy
  // boundary between org-level and personal intelligence.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/capsules",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const orgWallet = await prisma.wallet.findUnique({
        where: { entity_id: orgEntityId },
        select: { wallet_id: true },
      });
      if (orgWallet === null) {
        return reply.code(200).send({
          ok: true,
          ...paginatedResponse([], 0, skip, take),
        });
      }
      const where: Prisma.MemoryCapsuleWhereInput = {
        wallet_id: orgWallet.wallet_id,
        deleted_at: null,
      };
      const [items, total] = await Promise.all([
        prisma.memoryCapsule.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
          select: {
            capsule_id: true,
            capsule_type: true,
            topic_tags: true,
            relevance_score: true,
            payload_summary: true,
            payload_size_tokens: true,
            clearance_required: true,
            access_count: true,
            created_at: true,
            last_accessed_at: true,
          },
        }),
        prisma.memoryCapsule.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // GET /org/permissions -- Permission rows where grantor or grantee
  // is in caller's org.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/permissions",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const orgEntityIds = [orgEntityId, ...memberships.map((m) => m.child_id)];
      const where: Prisma.PermissionWhereInput = {
        OR: [
          { grantor_entity_id: { in: orgEntityIds } },
          { grantee_entity_id: { in: orgEntityIds } },
        ],
        status: "ACTIVE",
      };
      const [items, total] = await Promise.all([
        prisma.permission.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.permission.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // GET /org/hives -- Hive rows scoped to org.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/hives",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const where: Prisma.HiveWhereInput = { org_entity_id: orgEntityId };
      const [items, total] = await Promise.all([
        prisma.hive.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.hive.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // GET /org/audit -- audit_events filtered to caller's org.
  // Caps at MAX_AUDIT_EVENTS_PAGE_SIZE per Section 1E.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/audit",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query, {
        maxTake: MAX_AUDIT_EVENTS_PAGE_SIZE,
      });
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const orgScope = [orgEntityId, ...memberships.map((m) => m.child_id)];
      const where: Prisma.AuditEventWhereInput = {
        OR: [
          { actor_entity_id: { in: orgScope } },
          { target_entity_id: { in: orgScope } },
        ],
      };
      const [items, total] = await Promise.all([
        prisma.auditEvent.findMany({
          where,
          skip,
          take,
          orderBy: { timestamp: "desc" },
        }),
        prisma.auditEvent.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ════════════════════════════════════════════════════════════════

  // GET /org/analytics -- composed numbers from latest
  // CompoundingMetrics + counts. pending_approvals_count is a stub
  // returning 0 (TODO Section 14: EscalationRequest table).
  app.get(
    "/api/v1/org/analytics",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const latest = await prisma.compoundingMetrics.findFirst({
        where: { org_entity_id: orgEntityId },
        orderBy: { measured_at: "desc" },
      });
      // Defensive null-safety: Phase 0 always seeds a CompoundingMetrics
      // row, so latest === null shouldn't happen in practice. But this
      // is a public-facing analytics endpoint -- crashing on a missing
      // row would be poor hygiene. Fall back to zeros across the board
      // when no metrics row exists.
      const metrics = latest ?? {
        compound_score: 0,
        active_twins: 0,
        capsule_count: 0,
        decision_count: 0,
        pattern_count: 0,
        vocab_count: 0,
        external_count: 0,
        completion_rate: 0,
      };
      // TODO(Section 14): query EscalationRequest where status=PENDING
      // and target org matches; for now, this stays 0.
      const pending_approvals_count = 0;
      return reply.code(200).send({
        ok: true,
        org_entity_id: orgEntityId,
        compound_score: metrics.compound_score,
        pending_approvals_count,
        active_twins: metrics.active_twins,
        capsule_count: metrics.capsule_count,
        decision_count: metrics.decision_count,
        pattern_count: metrics.pattern_count,
        vocab_count: metrics.vocab_count,
        external_count: metrics.external_count,
        completion_rate: metrics.completion_rate,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // CONVERSATIONS (stub; TODO Section 11 OtzarConversation table)
  // ════════════════════════════════════════════════════════════════

  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/conversations",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      // TODO(Section 11): query OtzarConversation by org_entity_id.
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse([], 0, skip, take),
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // WORKFLOWS
  // ════════════════════════════════════════════════════════════════

  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/workflows",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const where: Prisma.WorkflowWhereInput = { org_entity_id: orgEntityId };
      const [items, total] = await Promise.all([
        prisma.workflow.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.workflow.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  app.post<{
    Body: {
      name?: unknown;
      trigger_type?: unknown;
      actions?: unknown;
      enabled?: unknown;
    };
  }>(
    "/api/v1/org/workflows",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const name = asNonEmptyString(body.name);
      const triggerType = asNonEmptyString(body.trigger_type);
      if (name === null || triggerType === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "name + trigger_type are required",
        });
      }
      const wf = await prisma.workflow.create({
        data: {
          org_entity_id: orgEntityId,
          name,
          trigger_type: triggerType,
          actions: (body.actions ?? []) as Prisma.InputJsonValue,
          enabled: body.enabled !== false,
          created_by: callerId,
        },
      });
      return reply.code(201).send({ ok: true, workflow: wf });
    },
  );

  app.patch<{
    Params: { id: string };
    Body: {
      name?: unknown;
      trigger_type?: unknown;
      actions?: unknown;
      enabled?: unknown;
    };
  }>(
    "/api/v1/org/workflows/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const wf = await prisma.workflow.findUnique({
        where: { workflow_id: request.params.id },
      });
      if (wf === null || wf.org_entity_id !== orgEntityId) {
        return reply.code(404).send({
          ok: false,
          code: "WORKFLOW_NOT_FOUND",
          message: "Workflow not in your org",
        });
      }
      const body = request.body ?? {};
      const data: Prisma.WorkflowUpdateInput = {};
      if (typeof body.name === "string") data.name = body.name;
      if (typeof body.trigger_type === "string")
        data.trigger_type = body.trigger_type;
      if (body.actions !== undefined)
        data.actions = body.actions as Prisma.InputJsonValue;
      if (typeof body.enabled === "boolean") data.enabled = body.enabled;
      const updated = await prisma.workflow.update({
        where: { workflow_id: request.params.id },
        data,
      });
      return reply.code(200).send({ ok: true, workflow: updated });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // AI TEAMMATES
  // ════════════════════════════════════════════════════════════════

  // POST /org/ai-teammates -- thin wrapper around createTwin.
  app.post<{
    Body: {
      owner_entity_id?: unknown;
      role_title?: unknown;
      is_admin_invite?: unknown;
    };
  }>(
    "/api/v1/org/ai-teammates",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const owner = asNonEmptyString(body.owner_entity_id) ?? callerId;
      const roleTitle = asNonEmptyString(body.role_title) ?? "Digital Twin";
      const isAdminInvite = body.is_admin_invite === true;
      // Verify owner is in the same org.
      const ownerMembership = await prisma.entityMembership.findFirst({
        where: {
          parent_id: orgEntityId,
          child_id: owner,
          is_active: true,
        },
      });
      if (ownerMembership === null && owner !== orgEntityId) {
        return reply.code(404).send({
          ok: false,
          code: "OWNER_NOT_IN_ORG",
          message: "Twin owner must be in your org",
        });
      }
      try {
        const result = await createTwin({
          owner_entity_id: owner,
          org_entity_id: orgEntityId,
          role_title: roleTitle,
          is_admin_invite: isAdminInvite,
          actor_entity_id: callerId,
        });
        return reply.code(201).send({ ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        if (message === "TWIN_ALREADY_EXISTS") {
          return reply.code(409).send({
            ok: false,
            code: "TWIN_ALREADY_EXISTS",
            message: "Twin already exists for this owner + role",
          });
        }
        if (message === "DEFAULT_HIVE_MISSING") {
          return reply.code(409).send({
            ok: false,
            code: "DEFAULT_HIVE_MISSING",
            message: "Org has no default Hive; complete Phase 0 first",
          });
        }
        return reply.code(500).send({
          ok: false,
          code: "TWIN_CREATE_FAILED",
          message,
        });
      }
    },
  );

  // GET /org/ai-teammates -- list AI_AGENT entities owned by org members.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/ai-teammates",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      // All entities under this org's membership tree.
      const orgMemberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const memberIds = orgMemberships.map((m) => m.child_id);
      // Twins are AI_AGENT children of those members.
      const twinMemberships = await prisma.entityMembership.findMany({
        where: { parent_id: { in: memberIds }, is_active: true },
        select: { child_id: true },
      });
      const twinIds = twinMemberships.map((tm) => tm.child_id);
      const where: Prisma.EntityWhereInput = {
        entity_id: { in: twinIds },
        entity_type: "AI_AGENT",
        deleted_at: null,
      };
      const [twins, total, configs] = await Promise.all([
        prisma.entity.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.entity.count({ where }),
        prisma.twinConfig.findMany({
          where: { twin_id: { in: twinIds } },
        }),
      ]);
      const configByTwin = new Map(configs.map((c) => [c.twin_id, c]));
      const items = twins.map((t) => ({
        entity_id: t.entity_id,
        display_name: t.display_name,
        status: t.status,
        created_at: t.created_at,
        config: configByTwin.get(t.entity_id) ?? null,
      }));
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  // PATCH /org/ai-teammates/:id -- mutable: autonomy_level,
  // swarm_enabled, role_template, approver_entity_id.
  // Immutable (422 IMMUTABLE_FIELD): entity_id, twin_id, created_at,
  // is_admin_twin.
  const TWIN_MUTABLE: ReadonlySet<string> = new Set([
    "autonomy_level",
    "swarm_enabled",
    "role_template",
    "approver_entity_id",
  ]);
  const TWIN_IMMUTABLE: ReadonlySet<string> = new Set([
    "entity_id",
    "twin_id",
    "created_at",
    "is_admin_twin",
  ]);
  const TWIN_AUTONOMY_VALUES: ReadonlySet<string> = new Set([
    "APPROVAL_REQUIRED",
    "EXECUTIVE_OVERRIDE",
    "OBSERVE_ONLY",
  ]);
  app.patch<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/org/ai-teammates/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      // Immutable-field guard runs FIRST so 422 wins over 404 for a
      // request that names an invalid twin AND tries to escalate.
      const blocked = Object.keys(body).filter((k) => TWIN_IMMUTABLE.has(k));
      if (blocked.length > 0) {
        return reply.code(422).send({
          ok: false,
          code: "IMMUTABLE_FIELD",
          message: `Cannot modify: ${blocked.join(", ")}`,
          immutable_fields: blocked,
        });
      }

      // Lookup twin + verify it belongs to the caller's org.
      const config = await prisma.twinConfig.findUnique({
        where: { twin_id: request.params.id },
      });
      if (config === null) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin not found",
        });
      }
      // Walk up: twin's owner must be in the caller's org.
      const ownerMembership = await prisma.entityMembership.findFirst({
        where: { child_id: request.params.id, is_active: true },
      });
      if (ownerMembership === null) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin has no owner",
        });
      }
      // Owner is in caller's org if owner is the org itself OR has an
      // EntityMembership where parent=org.
      const ownerInOrg = ownerMembership.parent_id === orgEntityId
        ? true
        : (await prisma.entityMembership.findFirst({
            where: {
              parent_id: orgEntityId,
              child_id: ownerMembership.parent_id,
              is_active: true,
            },
          })) !== null;
      if (!ownerInOrg) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_IN_ORG",
          message: "Twin not in your org",
        });
      }

      // Validate fields that we will write.
      const data: Prisma.TwinConfigUpdateInput = {};
      const oldValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const k of Object.keys(body)) {
        if (!TWIN_MUTABLE.has(k)) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_FIELD",
            message: `Field not writable: ${k}`,
          });
        }
        if (k === "autonomy_level") {
          if (typeof body[k] !== "string" || !TWIN_AUTONOMY_VALUES.has(body[k] as string)) {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_AUTONOMY_LEVEL",
              message: "autonomy_level must be APPROVAL_REQUIRED | EXECUTIVE_OVERRIDE | OBSERVE_ONLY",
            });
          }
          data.autonomy_level = body[k] as string;
          oldValues.autonomy_level = config.autonomy_level;
          newValues.autonomy_level = body[k];
        } else if (k === "swarm_enabled") {
          if (typeof body[k] !== "boolean") {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_FIELD",
              message: "swarm_enabled must be boolean",
            });
          }
          data.swarm_enabled = body[k] as boolean;
          oldValues.swarm_enabled = config.swarm_enabled;
          newValues.swarm_enabled = body[k];
        } else if (k === "role_template") {
          if (body[k] !== null && typeof body[k] !== "string") {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_FIELD",
              message: "role_template must be string or null",
            });
          }
          data.role_template = body[k] as string | null;
          oldValues.role_template = config.role_template;
          newValues.role_template = body[k];
        } else if (k === "approver_entity_id") {
          if (typeof body[k] !== "string") {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_APPROVER",
              message: "approver_entity_id must be a string",
            });
          }
          // Approver must be in the same org AND ACTIVE.
          const approverEntity = await prisma.entity.findUnique({
            where: { entity_id: body[k] as string },
          });
          if (approverEntity === null || approverEntity.status !== "ACTIVE") {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_APPROVER",
              message: "Approver entity not found or not ACTIVE",
            });
          }
          const approverMembership = await prisma.entityMembership.findFirst({
            where: {
              parent_id: orgEntityId,
              child_id: body[k] as string,
              is_active: true,
            },
          });
          const approverIsOrg = body[k] === orgEntityId;
          if (approverMembership === null && !approverIsOrg) {
            return reply.code(422).send({
              ok: false,
              code: "INVALID_APPROVER",
              message: "Approver must be in the same org as the twin",
            });
          }
          data.approver_entity_id = body[k] as string;
          oldValues.approver_entity_id = config.approver_entity_id;
          newValues.approver_entity_id = body[k];
        }
      }
      if (Object.keys(data).length === 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "No mutable fields supplied",
        });
      }
      const updated = await prisma.twinConfig.update({
        where: { twin_id: request.params.id },
        data,
      });
      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: request.params.id,
        details: {
          action: "AI_TEAMMATE_UPDATE",
          twin_id: request.params.id,
          fields_changed: Object.keys(data),
          old_values: oldValues,
          new_values: newValues,
        },
      });
      return reply.code(200).send({ ok: true, twin_config: updated });
    },
  );

  // GET /org/ai-teammates/:id/stats -- stub.
  app.get<{ Params: { id: string } }>(
    "/api/v1/org/ai-teammates/:id/stats",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      void request.params.id;
      // TODO(Section 14/16): real telemetry from observation pipeline.
      return reply.code(200).send({
        ok: true,
        twin_id: request.params.id,
        tasks_completed: 0,
        conversations: 0,
        capsules_written: 0,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // SKILLS
  // ════════════════════════════════════════════════════════════════

  // GET /org/skill-packages -- global list, no org scope.
  app.get(
    "/api/v1/org/skill-packages",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (_request, reply) => {
      const items = await prisma.skillPackage.findMany({
        orderBy: { created_at: "asc" },
      });
      return reply.code(200).send({ ok: true, items });
    },
  );

  // POST /org/ai-teammates/:id/skills -- assign one SkillPackage.
  app.post<{
    Params: { id: string };
    Body: { package_id?: unknown };
  }>(
    "/api/v1/org/ai-teammates/:id/skills",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const packageId = asNonEmptyString(request.body?.package_id);
      if (packageId === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "package_id is required",
        });
      }
      // Verify twin exists.
      const config = await prisma.twinConfig.findUnique({
        where: { twin_id: request.params.id },
      });
      if (config === null) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin not found",
        });
      }
      const pkg = await prisma.skillPackage.findUnique({
        where: { package_id: packageId },
      });
      if (pkg === null) {
        return reply.code(404).send({
          ok: false,
          code: "SKILL_PACKAGE_NOT_FOUND",
          message: "Skill package not found",
        });
      }
      const skill = await prisma.twinSkill.upsert({
        where: {
          twin_id_package_id: {
            twin_id: request.params.id,
            package_id: packageId,
          },
        },
        create: {
          twin_id: request.params.id,
          package_id: packageId,
        },
        update: {},
      });
      return reply.code(200).send({ ok: true, skill });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // VOCABULARY / EXTERNAL ENTITIES / INTELLIGENCE
  // ════════════════════════════════════════════════════════════════

  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/vocabulary",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const where: Prisma.DomainVocabularyWhereInput = {
        org_entity_id: orgEntityId,
      };
      const [items, total] = await Promise.all([
        prisma.domainVocabulary.findMany({
          where,
          skip,
          take,
          orderBy: { term: "asc" },
        }),
        prisma.domainVocabulary.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  app.post<{
    Body: {
      term?: unknown;
      term_type?: unknown;
      definition?: unknown;
      aliases?: unknown;
    };
  }>(
    "/api/v1/org/vocabulary",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const body = request.body ?? {};
      const term = asNonEmptyString(body.term);
      const termType = asNonEmptyString(body.term_type) ?? "ACRONYM";
      if (term === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "term is required",
        });
      }
      // Idempotent insert: skipDuplicates over (org_entity_id, term).
      await prisma.domainVocabulary.createMany({
        data: [
          {
            org_entity_id: orgEntityId,
            term,
            term_type: termType,
            definition: typeof body.definition === "string" ? body.definition : null,
            aliases: Array.isArray(body.aliases) ? (body.aliases as string[]) : [],
          },
        ],
        skipDuplicates: true,
      });
      const row = await prisma.domainVocabulary.findUnique({
        where: { org_entity_id_term: { org_entity_id: orgEntityId, term } },
      });
      return reply.code(201).send({ ok: true, vocabulary: row });
    },
  );

  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/external-entities",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const where: Prisma.ExternalEntityWhereInput = {
        org_entity_id: orgEntityId,
      };
      const [items, total] = await Promise.all([
        prisma.externalEntity.findMany({
          where,
          skip,
          take,
          orderBy: { mention_count: "desc" },
        }),
        prisma.externalEntity.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/intelligence/patterns",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const where: Prisma.IntelligencePatternWhereInput = {
        org_entity_id: orgEntityId,
        status: "ACTIVE",
      };
      const [items, total] = await Promise.all([
        prisma.intelligencePattern.findMany({
          where,
          skip,
          take,
          orderBy: { occurrence_count: "desc" },
        }),
        prisma.intelligencePattern.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );

  app.get(
    "/api/v1/org/intelligence/compound-score",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const latest = await prisma.compoundingMetrics.findFirst({
        where: { org_entity_id: orgEntityId },
        orderBy: { measured_at: "desc" },
      });
      return reply.code(200).send({
        ok: true,
        org_entity_id: orgEntityId,
        compound_score: latest?.compound_score ?? 0,
        measured_at: latest?.measured_at ?? null,
        metric: latest,
      });
    },
  );

  // ════════════════════════════════════════════════════════════════
  // SUGGESTIONS (Section 10 Loop 3)
  // ════════════════════════════════════════════════════════════════

  // GET /org/suggestions -- PermissionSuggestion rows where grantor
  // OR grantee is in caller's org. Cross-tenant filter: build the
  // org-scope id list (org + active children) and filter on either
  // side of the suggestion.
  app.get<{ Querystring: { skip?: string; take?: string } }>(
    "/api/v1/org/suggestions",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);
      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const orgScope = [orgEntityId, ...memberships.map((m) => m.child_id)];
      const where: Prisma.PermissionSuggestionWhereInput = {
        OR: [
          { grantor_id: { in: orgScope } },
          { grantee_id: { in: orgScope } },
        ],
      };
      const [items, total] = await Promise.all([
        prisma.permissionSuggestion.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
        }),
        prisma.permissionSuggestion.count({ where }),
      ]);
      return reply.code(200).send({
        ok: true,
        ...paginatedResponse(items, total, skip, take),
      });
    },
  );
}
