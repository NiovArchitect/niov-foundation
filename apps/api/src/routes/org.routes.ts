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
  isKnownAuditEventType,
  MAX_AUDIT_EVENTS_PAGE_SIZE,
  prisma,
  writeAudit,
  writeAuditEvent,
  writeTARCreateAudit,
  writeWalletCreateAudit,
  type AuditEventType,
  type Entity,
  type Prisma,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { requireDualControl } from "../middleware/dual-control.middleware.js";
import { PRIVILEGED_ENDPOINTS } from "../security/privileged-endpoints.js";
import {
  analyzePhase2,
  executePhase3Invite,
  getPhase4Status,
  reorderPhase4,
  type PropagationEntry,
} from "../services/governance/dandelion.service.js";
import {
  executeStarterPilotActivationForCaller,
  executeTeamActivationForCaller,
  executeBusinessActivationForCaller,
  executeEnterpriseActivationForCaller,
} from "../services/governance/dandelion-activation.service.js";
import { createTwin } from "../services/governance/twin.service.js";
import { getOrgEntityId } from "../services/governance/org.js";
import { countEscalationsPending } from "../services/governance/escalation.service.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Default + max page size for list endpoints. Audit-table reads
//        cap separately at MAX_AUDIT_EVENTS_PAGE_SIZE (Section 1E).
// INPUT: Used as constants.
// OUTPUT: Numbers.
// WHY: One source of truth so a careless ?take=10000 cannot drag the
//      database down through these read endpoints.
const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// WHAT: UUID v4 format validator for query params.
// INPUT: Used as a constant; consumed by 12C.0 Item 3 + Item 4
//        filter validation paths.
// OUTPUT: A RegExp.
// WHY: Validate at the route layer so Prisma never surfaces a
//      cryptic P2023 (invalid argument value) on malformed UUID
//      input. Reject with 422 INVALID_REQUEST upstream so callers
//      get a clear actionable error.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// WHAT: Type-narrowing validator for the ADR-0057 Wave 7 ActionPolicy
//        override fields (retry_budget + attempt_timeout_ms_override).
// INPUT: A body value parsed off the inbound JSON envelope.
// OUTPUT: true when the value is a finite positive integer OR
//          explicit null; false otherwise.
// WHY: The resolver helpers fall back to the service-tier constants
//      on null OR non-positive values; this validator rejects
//      non-positive integers up-front so operators get a clear
//      422 INVALID_FIELD instead of the silent fallback. Number-typed
//      booleans, floats, NaN, Infinity, and strings all fail.
function isOptionalPositiveIntOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value)) return false;
  if (!Number.isInteger(value)) return false;
  return value > 0;
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
// 12B.0: addOneMember now returns the audit_id of the
// ORG_MEMBER_ADDED summary ADMIN_ACTION row alongside the entity,
// so the POST /org/members and /org/members/bulk routes can surface
// audit_event_id on their responses for audit-aware UI clickability.
interface AddOneMemberResult {
  entity: Entity;
  audit_event_id: string;
}

async function addOneMember(
  member: MemberInput,
  orgEntityId: string,
  actorEntityId: string,
): Promise<AddOneMemberResult> {
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
    const memberAudit = await writeAuditEvent(
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
    return { entity: created, audit_event_id: memberAudit.audit_id };
  });
}

// WHAT: Register the /org/* routes.
// INPUT: Fastify instance and AuthService (for the admin gate).
// OUTPUT: A promise resolving once registration completes.
export async function registerOrgRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // D6 enterprise activation per ADR-0080 §23 Amendment 7 + ADR-0026
  // dual-control middleware pattern. Resolve the
  // ORG_DANDELION_ENTERPRISE_ACTIVATION descriptor from the runtime
  // PRIVILEGED_ENDPOINTS registry at route-registration time so the
  // requireDualControl preHandler bound below has a stable reference.
  // The throw-guard fails fast at server boot if the registry drifts.
  const enterpriseActivationEndpoint = PRIVILEGED_ENDPOINTS.find(
    (e) =>
      e.actionDescriptor.type === "ORG_DANDELION_ENTERPRISE_ACTIVATION",
  );
  if (!enterpriseActivationEndpoint) {
    throw new Error(
      "PRIVILEGED_ENDPOINTS registry missing required entry for ORG_DANDELION_ENTERPRISE_ACTIVATION",
    );
  }

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
        const result = await addOneMember(
          request.body ?? {},
          orgEntityId,
          callerId,
        );
        // 12B.0: audit_event_id surfaces the audit_id of the
        // ADMIN_ACTION (action=ORG_MEMBER_ADDED) row written
        // inside addOneMember's transaction. Audit-aware UI keys
        // off this for the success-toast clickable link.
        return reply.code(201).send({
          ok: true,
          entity_id: result.entity.entity_id,
          email: result.entity.email,
          display_name: result.entity.display_name,
          audit_event_id: result.audit_event_id,
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
      // 12B.0: each created row carries its own audit_event_id so
      // bulk responses are individually clickable from audit-aware UI.
      const created: Array<{
        entity_id: string;
        email: string | null;
        audit_event_id: string;
      }> = [];
      const failures: Array<{ index: number; error: string }> = [];
      for (let i = 0; i < members.length; i++) {
        try {
          const r = await addOneMember(members[i]!, orgEntityId, callerId);
          created.push({
            entity_id: r.entity.entity_id,
            email: r.entity.email,
            audit_event_id: r.audit_event_id,
          });
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
      // 12C.0 (Item 2): capture the returned auditEvent and surface
      // audit_event_id in the response. Closes the last
      // pending-foundation-extension sentinel in otzar-control-tower
      // (12B.2 Members job_title edit + Suspend/Reactivate). Mirrors
      // the 12B.0 contract on the 7 other audit-aware write endpoints.
      const auditEvent = await writeAuditEvent({
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
      return reply
        .code(200)
        .send({ ok: true, audit_event_id: auditEvent.audit_id });
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

  // ADR-0057 §7 + §9 ORG_ACTION_POLICY_UPDATE admin surface.
  //
  // GET /api/v1/org/action-policies -- read-only org-scoped list of
  // ActionPolicy rows (the per-(org_entity_id, action_type, risk_tier)
  // policy snapshot the future action.service.ts policy evaluator
  // consumes). Bearer + can_admin_org; no dual-control binding (read-
  // only listings bypass the middleware per ADR-0057 §9). Response
  // shape projects safe fields ONLY -- no policy_envelope content,
  // no secrets, no raw inputs.
  //
  // PUT /api/v1/org/action-policies -- upsert one ActionPolicy row
  // for the (org_entity_id, action_type, risk_tier) UNIQUE tuple per
  // ADR-0057 §2. Bearer + can_admin_org + dual-control via the LIVE
  // PRIVILEGED_ENDPOINTS Operation E binding at privileged-endpoints.ts
  // -- a same-org second admin must have an APPROVED EscalationRequest
  // for the (org_entity_id, ORG_ACTION_POLICY_UPDATE) pair before the
  // route handler runs. Emits ACTION_POLICY_UPDATE per ADR-0057 §10
  // with SAFE allowlisted details only.
  const ACTION_POLICY_PUT_WRITABLE: ReadonlySet<string> = new Set([
    "action_type",
    "risk_tier",
    "default_decision",
    "require_admin_capability",
    // ADR-0057 Wave 7: operator-tunable overrides landed at PR #47.
    // The resolver helpers in lifecycle.service.ts fall back to the
    // service-tier constants on null or non-positive values; the
    // validator below rejects non-positive integers up-front so
    // operators get clear feedback instead of silent constant
    // fallback.
    "retry_budget",
    "attempt_timeout_ms_override",
  ]);

  // GET /org/action-policies -- org-scoped read-only list. The DRIFT-9
  // cross-org leak guard is the where: { org_entity_id: orgEntityId }
  // filter resolved from the caller's session, NEVER from the request.
  app.get(
    "/api/v1/org/action-policies",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const rows = await prisma.actionPolicy.findMany({
        where: { org_entity_id: orgEntityId },
        orderBy: [{ action_type: "asc" }, { risk_tier: "asc" }],
        select: {
          policy_id: true,
          org_entity_id: true,
          action_type: true,
          risk_tier: true,
          default_decision: true,
          require_admin_capability: true,
          retry_budget: true,
          attempt_timeout_ms_override: true,
          updated_by: true,
          created_at: true,
          updated_at: true,
        },
      });
      return reply.code(200).send({ ok: true, policies: rows });
    },
  );

  // PUT /org/action-policies -- upsert one row. Body validation:
  //  - allowlisted fields ONLY (422 UNKNOWN_FIELD per the org-settings
  //    precedent at L760-767);
  //  - action_type / risk_tier / default_decision enum-validated
  //    against the runtime Prisma value sets (422 INVALID_FIELD);
  //  - require_admin_capability is OPTIONAL and limited to the two
  //    canonical capability names ("can_admin_org" | "can_admin_niov")
  //    or null (per ADR-0057 §2).
  // Audit emission (ACTION_POLICY_UPDATE) carries SAFE allowlisted
  // details ONLY per ADR-0057 §10 (NEVER raw body / raw error text /
  // policy envelope JSON / secrets / capsule content / embeddings).
  app.put<{ Body: Record<string, unknown> }>(
    "/api/v1/org/action-policies",
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
        (k) => !ACTION_POLICY_PUT_WRITABLE.has(k),
      );
      if (unknown.length > 0) {
        return reply.code(422).send({
          ok: false,
          code: "UNKNOWN_FIELD",
          message: `Unknown / immutable action-policy fields: ${unknown.join(", ")}`,
          unknown_fields: unknown,
        });
      }
      const action_type = body.action_type;
      const risk_tier = body.risk_tier;
      const default_decision = body.default_decision;
      const require_admin_capability =
        body.require_admin_capability === undefined
          ? null
          : body.require_admin_capability;
      // ADR-0057 Wave 7: undefined → not-touched-on-update (preserves
      // existing value); explicit null → clears the override and the
      // resolver falls back to the service-tier constant.
      const retry_budget_provided = "retry_budget" in body;
      const retry_budget = retry_budget_provided
        ? body.retry_budget
        : undefined;
      const attempt_timeout_ms_override_provided =
        "attempt_timeout_ms_override" in body;
      const attempt_timeout_ms_override = attempt_timeout_ms_override_provided
        ? body.attempt_timeout_ms_override
        : undefined;
      // Enum validation against the canonical Prisma enum value sets
      // declared at packages/database/prisma/schema.prisma per PR #18.
      const VALID_ACTION_TYPES = new Set([
        "RECORD_CAPSULE",
        "PROPOSE_PERMISSION_GRANT",
        "SEND_INTERNAL_NOTIFICATION",
        "INVOKE_CONNECTOR",
      ]);
      const VALID_RISK_TIERS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
      const VALID_DECISIONS = new Set([
        "AUTO_APPROVE",
        "REQUIRE_DUAL_CONTROL",
        "REQUIRE_BREAK_GLASS",
        "FORBIDDEN",
      ]);
      const VALID_ADMIN_CAPS: ReadonlySet<unknown> = new Set([
        "can_admin_org",
        "can_admin_niov",
        null,
      ]);
      const invalid: string[] = [];
      if (typeof action_type !== "string" || !VALID_ACTION_TYPES.has(action_type)) {
        invalid.push("action_type");
      }
      if (typeof risk_tier !== "string" || !VALID_RISK_TIERS.has(risk_tier)) {
        invalid.push("risk_tier");
      }
      if (typeof default_decision !== "string" || !VALID_DECISIONS.has(default_decision)) {
        invalid.push("default_decision");
      }
      if (!VALID_ADMIN_CAPS.has(require_admin_capability)) {
        invalid.push("require_admin_capability");
      }
      // ADR-0057 Wave 7: retry_budget + attempt_timeout_ms_override
      // must be a positive Int OR explicit null. Non-positive integers
      // are operator-misconfiguration; reject up-front so the operator
      // gets a clear 422 instead of the resolver's silent
      // constant-fallback.
      if (retry_budget_provided && !isOptionalPositiveIntOrNull(retry_budget)) {
        invalid.push("retry_budget");
      }
      if (
        attempt_timeout_ms_override_provided &&
        !isOptionalPositiveIntOrNull(attempt_timeout_ms_override)
      ) {
        invalid.push("attempt_timeout_ms_override");
      }
      if (invalid.length > 0) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_FIELD",
          message: `Invalid action-policy fields: ${invalid.join(", ")}`,
          invalid_fields: invalid,
        });
      }
      // Narrow the validated override values to the Prisma column
      // type. The validator guarantees null OR positive integer.
      const retry_budget_value =
        retry_budget === undefined ? undefined : (retry_budget as number | null);
      const attempt_timeout_ms_override_value =
        attempt_timeout_ms_override === undefined
          ? undefined
          : (attempt_timeout_ms_override as number | null);
      // Upsert per ADR-0057 §2 UNIQUE (org_entity_id, action_type,
      // risk_tier). Type-narrowed casts via Prisma enum types are
      // safe here because the value sets above gate every input.
      // ADR-0057 Wave 7: retry_budget + attempt_timeout_ms_override
      // included only when the operator provided them (undefined →
      // not-touched-on-update; existing column value preserved).
      const upserted = await prisma.actionPolicy.upsert({
        where: {
          org_entity_id_action_type_risk_tier: {
            org_entity_id: orgEntityId,
            action_type: action_type as Prisma.ActionPolicyCreateInput["action_type"],
            risk_tier: risk_tier as Prisma.ActionPolicyCreateInput["risk_tier"],
          },
        },
        create: {
          org_entity_id: orgEntityId,
          action_type: action_type as Prisma.ActionPolicyCreateInput["action_type"],
          risk_tier: risk_tier as Prisma.ActionPolicyCreateInput["risk_tier"],
          default_decision: default_decision as Prisma.ActionPolicyCreateInput["default_decision"],
          require_admin_capability: require_admin_capability as string | null,
          ...(retry_budget_value !== undefined
            ? { retry_budget: retry_budget_value }
            : {}),
          ...(attempt_timeout_ms_override_value !== undefined
            ? { attempt_timeout_ms_override: attempt_timeout_ms_override_value }
            : {}),
          updated_by: callerId,
        },
        update: {
          default_decision: default_decision as Prisma.ActionPolicyCreateInput["default_decision"],
          require_admin_capability: require_admin_capability as string | null,
          ...(retry_budget_value !== undefined
            ? { retry_budget: retry_budget_value }
            : {}),
          ...(attempt_timeout_ms_override_value !== undefined
            ? { attempt_timeout_ms_override: attempt_timeout_ms_override_value }
            : {}),
          updated_by: callerId,
        },
        select: {
          policy_id: true,
          org_entity_id: true,
          action_type: true,
          risk_tier: true,
          default_decision: true,
          require_admin_capability: true,
          retry_budget: true,
          attempt_timeout_ms_override: true,
          updated_by: true,
          created_at: true,
          updated_at: true,
        },
      });
      // Audit emission per ADR-0057 §10. SAFE allowlisted details only.
      // ADR-0057 Wave 7: retry_budget_set + attempt_timeout_ms_override_set
      // are boolean indicators (NOT the numeric values) so the audit row
      // records that an override was touched without leaking the
      // operator-specific tuning numbers into a long-lived audit trail.
      // The current value remains queryable via the GET list route.
      await writeAuditEvent({
        event_type: "ACTION_POLICY_UPDATE",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: orgEntityId,
        details: {
          policy_id: upserted.policy_id,
          action_type: upserted.action_type,
          risk_tier: upserted.risk_tier,
          default_decision: upserted.default_decision,
          retry_budget_set: retry_budget_provided,
          attempt_timeout_ms_override_set: attempt_timeout_ms_override_provided,
          route: "/api/v1/org/action-policies",
          method: "PUT",
        },
      });
      return reply.code(200).send({ ok: true, policy: upserted });
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
  // GET /org/permissions -- ACTIVE Permission rows scoped to org.
  // 12C.0 (Item 4) added optional ?bridge_id= filter that AND-narrows
  // within the existing OR-of-grantor-or-grantee org-scope. Lifts
  // the 12B.4 BridgeDetailDrawer client-side filter pattern (Drift 5
  // in 12B.4 pre-flight) to server-side. Cross-org leak prevention
  // is enforced by the outer org-scope fence (filter narrows, never
  // widens — same architectural invariant as Item 3 audit filters).
  app.get<{
    Querystring: {
      skip?: string;
      take?: string;
      bridge_id?: string;
    };
  }>(
    "/api/v1/org/permissions",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      const { skip, take } = parsePagination(request.query);

      // Validate UUID at the route layer so Prisma doesn't surface
      // P2023 on malformed input.
      let bridgeIdFilter: string | undefined;
      if (typeof request.query.bridge_id === "string") {
        if (!UUID_REGEX.test(request.query.bridge_id)) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "bridge_id must be a valid UUID",
          });
        }
        bridgeIdFilter = request.query.bridge_id;
      }

      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const orgEntityIds = [orgEntityId, ...memberships.map((m) => m.child_id)];
      // The org-scope OR + status=ACTIVE form the outer fence;
      // bridge_id filter (when set) AND-composes via the top-level
      // AND array, narrowing the result without escaping the fence.
      const filterClauses: Prisma.PermissionWhereInput[] = [
        {
          OR: [
            { grantor_entity_id: { in: orgEntityIds } },
            { grantee_entity_id: { in: orgEntityIds } },
          ],
          status: "ACTIVE",
        },
      ];
      if (bridgeIdFilter !== undefined) {
        filterClauses.push({ bridge_id: bridgeIdFilter });
      }
      const where: Prisma.PermissionWhereInput = { AND: filterClauses };
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

  // GET /api/v1/org/hives — superseded by hive-admin.routes.ts
  // (Wave 3 / ADR-0062). The prior implementation here returned
  // raw prisma.hive.findMany rows including governance_terms +
  // aggregate_capsule_id (both forbidden fields per ADR-0062
  // Sub-decision 2 SAFE projection). It also used pagination
  // (skip/take) instead of the Section 4 connector flat-list
  // pattern that ADR-0062 explicitly adopted. Substrate-honest
  // RULE 13 finding surfaced at Wave 3 implementation: the prior
  // route was untested + leaky. Removed in favor of the
  // SAFE-projection route registered in hive-admin.routes.ts at
  // server.ts:registerHiveAdminRoutes. BREAKING wire-shape change
  // (pagination response shape → flat list; raw row → SAFE projection
  // excluding governance_terms + aggregate_capsule_id).

  // GET /org/audit -- audit_events filtered to caller's org.
  // Caps at MAX_AUDIT_EVENTS_PAGE_SIZE per Section 1E.
  // GET /org/audit -- AuditEvent rows scoped to caller's org.
  // 12C.0 (Item 3) added 3 optional filters: ?event_type=,
  // ?actor_entity_id=, ?target_entity_id=. Filters AND-narrow within
  // the existing OR-of-actor-or-target org-scope; they NEVER widen
  // it (cross-org leak prevention is the architectural anchor —
  // see admin-routes.test.ts cross-org leak test for the invariant).
  // Lifts the 12B.2/12B.3/12B.4 frontend client-side filter pattern
  // to server-side per Compliance Architecture Review Bucket A.
  app.get<{
    Querystring: {
      skip?: string;
      take?: string;
      event_type?: string;
      actor_entity_id?: string;
      target_entity_id?: string;
    };
  }>(
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

      // Validate event_type against the canonical
      // AUDIT_EVENT_TYPE_VALUES enum. Unknown literals reject with
      // 422 INVALID_REQUEST so callers cannot probe with arbitrary
      // strings (also keeps the typed AuditEvent.event_type column
      // honest at the route layer).
      let eventTypeFilter: AuditEventType | undefined;
      if (typeof request.query.event_type === "string") {
        if (!isKnownAuditEventType(request.query.event_type)) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "event_type must be a known AuditEventType",
          });
        }
        eventTypeFilter = request.query.event_type;
      }
      // Validate UUIDs at the route layer so Prisma doesn't surface
      // a cryptic P2023 (invalid argument value) on malformed input.
      let actorEntityIdFilter: string | undefined;
      if (typeof request.query.actor_entity_id === "string") {
        if (!UUID_REGEX.test(request.query.actor_entity_id)) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "actor_entity_id must be a valid UUID",
          });
        }
        actorEntityIdFilter = request.query.actor_entity_id;
      }
      let targetEntityIdFilter: string | undefined;
      if (typeof request.query.target_entity_id === "string") {
        if (!UUID_REGEX.test(request.query.target_entity_id)) {
          return reply.code(422).send({
            ok: false,
            code: "INVALID_REQUEST",
            message: "target_entity_id must be a valid UUID",
          });
        }
        targetEntityIdFilter = request.query.target_entity_id;
      }

      const memberships = await prisma.entityMembership.findMany({
        where: { parent_id: orgEntityId, is_active: true },
        select: { child_id: true },
      });
      const orgScope = [orgEntityId, ...memberships.map((m) => m.child_id)];
      // The org-scope OR is the outer fence. Optional filters AND-
      // compose with it via the top-level `AND` array — every
      // additional filter NARROWS the result. Filters cannot widen
      // (Prisma `where` semantics) and never escape the org fence.
      const filterClauses: Prisma.AuditEventWhereInput[] = [
        {
          OR: [
            { actor_entity_id: { in: orgScope } },
            { target_entity_id: { in: orgScope } },
          ],
        },
      ];
      if (eventTypeFilter !== undefined) {
        filterClauses.push({ event_type: eventTypeFilter });
      }
      if (actorEntityIdFilter !== undefined) {
        filterClauses.push({ actor_entity_id: actorEntityIdFilter });
      }
      if (targetEntityIdFilter !== undefined) {
        filterClauses.push({ target_entity_id: targetEntityIdFilter });
      }
      const where: Prisma.AuditEventWhereInput = { AND: filterClauses };
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
  // CompoundingMetrics + counts. pending_approvals_count counts
  // PENDING EscalationRequest rows targeted at this org (D-2D-D10-2).
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
      // Pending escalations targeted at this org. countEscalationsPending
      // is an unguarded plain helper -- the route's
      // requireAdminCapability(authService, "can_admin_org") preHandler
      // + resolveOrgOrFail(callerId) above have already discharged the
      // authorization gate for orgEntityId, so the service does not
      // re-gate. See escalation.service.ts countEscalationsPending JSDoc
      // for the route-tier-auth-gate framing (D-2D-D10-2).
      const pending_approvals_count = await countEscalationsPending(orgEntityId);
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

  // GET /org/ai-teammates/:id -- single AI Teammate detail for the
  // Control Tower drawer. This is a read-only companion to PATCH
  // /org/ai-teammates/:id; it verifies org ownership with the same
  // owner-membership walk as PATCH, then returns the entity, config,
  // owner id, and assigned SkillPackages in one schema-honest payload.
  app.get<{ Params: { id: string } }>(
    "/api/v1/org/ai-teammates/:id",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;

      const [entity, config] = await Promise.all([
        prisma.entity.findUnique({
          where: { entity_id: request.params.id },
        }),
        prisma.twinConfig.findUnique({
          where: { twin_id: request.params.id },
        }),
      ]);
      if (
        entity === null ||
        entity.entity_type !== "AI_AGENT" ||
        entity.deleted_at !== null ||
        config === null
      ) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin not found",
        });
      }

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

      const skills = await prisma.twinSkill.findMany({
        where: { twin_id: request.params.id },
        include: { package: true },
        orderBy: { assigned_at: "asc" },
      });

      return reply.code(200).send({
        ok: true,
        entity,
        twin_config: config,
        owner_entity_id: ownerMembership.parent_id,
        skills,
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
      // 12B.0: capture the audit_id so the success response surfaces
      // audit_event_id for audit-aware UI clickability.
      const updateAudit = await writeAuditEvent({
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
      return reply.code(200).send({
        ok: true,
        twin_config: updated,
        audit_event_id: updateAudit.audit_id,
      });
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
      // 12B-FOUNDATION (skills audit): emit ADMIN_ACTION audit row
      // and surface audit_event_id so the audit-aware UI's Stage-4
      // toast can render a clickable link from the skill assignment
      // to the audit log entry. Mirrors the 12B.0 contract on the
      // 6 other write endpoints. Failure paths (TWIN_NOT_FOUND,
      // SKILL_PACKAGE_NOT_FOUND, INVALID_REQUEST) intentionally omit
      // audit_event_id.
      //
      // Q1(b) -- twin_owner_entity_id baked into details so forensic
      // analysis 18 months from now doesn't need an EntityMembership
      // join. Lookup is cheap on the hot path; the self-contained
      // audit row is the compounding decision. If the membership
      // row is absent (data integrity edge case), surface null
      // rather than throw -- the audit row still writes.
      const ownerMembership = await prisma.entityMembership.findFirst({
        where: { child_id: request.params.id, is_active: true },
        select: { parent_id: true },
      });
      const auditEvent = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: request.params.id,
        details: {
          action: "TWIN_SKILLS_ASSIGNED",
          twin_id: request.params.id,
          twin_owner_entity_id: ownerMembership?.parent_id ?? null,
          skill_package_id: packageId,
          package_name: pkg.name,
        },
      });
      return reply.code(200).send({
        ok: true,
        skill,
        audit_event_id: auditEvent.audit_id,
      });
    },
  );

  // 12C.0 (Item 1): DELETE /org/ai-teammates/:id/skills/:packageId --
  // remove a previously-assigned SkillPackage from a twin. Closes
  // the 12B.3 Q5 deferral (RemoveSkillButton stub-omitted, queued
  // for Foundation extension batch). Mirrors POST /skills auth +
  // org-membership scope + audit emission shape; uses the
  // ADMIN_ACTION + details.action: "TWIN_SKILL_REMOVED" pattern
  // (singular -- DELETE removes one package per call) for symmetry
  // with the existing TWIN_SKILLS_ASSIGNED (plural -- POST).
  app.delete<{
    Params: { id: string; packageId: string };
  }>(
    "/api/v1/org/ai-teammates/:id/skills/:packageId",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const orgEntityId = await resolveOrgOrFail(callerId, reply);
      if (orgEntityId === null) return;
      // Verify the twin is in caller's org via a 2-hop EntityMembership
      // walk: twin's parent (the owner) must itself be a child of the
      // org. Twins are grandchildren of the org -- their direct parent
      // is the OWNER (a PERSON who is a first-level org child). Admin-
      // owned twins set parent=org directly; standard twins set
      // parent=owner. Both shapes resolve via this 2-hop check.
      const ownerMembership = await prisma.entityMembership.findFirst({
        where: { child_id: request.params.id, is_active: true },
        select: { parent_id: true },
      });
      if (ownerMembership === null) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin not found in this org",
        });
      }
      // Admin-owned twin: parent IS org. Standard twin: parent is
      // owner (employee), and owner must be in org.
      const ownerInOrg =
        ownerMembership.parent_id === orgEntityId ||
        (await prisma.entityMembership.findFirst({
          where: {
            parent_id: orgEntityId,
            child_id: ownerMembership.parent_id,
            is_active: true,
          },
          select: { membership_id: true },
        })) !== null;
      if (!ownerInOrg) {
        return reply.code(404).send({
          ok: false,
          code: "TWIN_NOT_FOUND",
          message: "Twin not found in this org",
        });
      }
      // Verify the SkillPackage exists (so the failure mode is
      // explicit -- distinguishes "package_id is malformed" from
      // "assignment doesn't exist").
      const pkg = await prisma.skillPackage.findUnique({
        where: { package_id: request.params.packageId },
      });
      if (pkg === null) {
        return reply.code(404).send({
          ok: false,
          code: "SKILL_PACKAGE_NOT_FOUND",
          message: "Skill package not found",
        });
      }
      // Verify the assignment exists; 404 if not. We use deleteMany
      // + count check rather than findUnique-then-delete so the
      // "didn't exist" path returns a clean 404 without a thrown
      // P2025 from prisma.twinSkill.delete.
      const result = await prisma.twinSkill.deleteMany({
        where: {
          twin_id: request.params.id,
          package_id: request.params.packageId,
        },
      });
      if (result.count === 0) {
        return reply.code(404).send({
          ok: false,
          code: "SKILL_NOT_ASSIGNED",
          message: "Skill package is not assigned to this twin",
        });
      }
      // 12B.0 contract: emit ADMIN_ACTION audit row and surface
      // audit_event_id. Mirrors the POST /skills emission shape
      // (twin_owner_entity_id baked in for forensic self-containment
      // per Q1(b)). On the DELETE path the owner is necessarily
      // ownerMembership.parent_id which we already loaded above.
      const auditEvent = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: callerId,
        target_entity_id: request.params.id,
        details: {
          action: "TWIN_SKILL_REMOVED",
          twin_id: request.params.id,
          twin_owner_entity_id: ownerMembership.parent_id,
          skill_package_id: request.params.packageId,
          package_name: pkg.name,
        },
      });
      return reply.code(200).send({
        ok: true,
        audit_event_id: auditEvent.audit_id,
      });
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

  // ════════════════════════════════════════════════════════════════
  // D6 DANDELION ACTIVATION (Stage F implementation — starter-pilot +
  // team)
  // ════════════════════════════════════════════════════════════════
  // POST /org/dandelion/activate — runs the starter-pilot
  // ActivationPlan catalog (6 steps) for the caller's org. Emits one
  // ADMIN_ACTION audit event per catalog step. Returns the
  // discriminated ActivationResult shape with the audit chain
  // lineage.
  app.post(
    "/api/v1/org/dandelion/activate",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const result = await executeStarterPilotActivationForCaller(callerId);
      if (result.ok) {
        return reply.code(200).send(result);
      }
      const status =
        result.code === "ARCHETYPE_UNKNOWN"
          ? 422
          : result.code === "NOT_ADMIN" ||
              result.code === "CALLER_ENTITY_NOT_FOUND" ||
              result.code === "CALLER_NOT_IN_ORG"
            ? 403
            : 500;
      return reply.code(status).send(result);
    },
  );

  // POST /org/dandelion/activate/team — runs the team-archetype
  // ActivationPlan catalog (8 steps; team-activation.json). Step 5
  // (step.connector.slack-binding-register) registers a SLACK_READ
  // ConnectorBinding via the existing C2 OPERATING substrate; the
  // admin supplies slack_display_name + slack_secret_ref env-var-
  // NAME in the request body (the resolved env-var VALUE NEVER
  // crosses the API boundary; admins must NEVER paste a raw bot
  // token in the secret_ref field).
  //
  // INVALID_SLACK_BINDING_INPUT → 422 (missing display_name or
  // secret_ref). CONNECTOR_BINDING_FAILED → 422 (the underlying
  // connector-binding service rejected the binding shape; the
  // downstream code is propagated in the message).
  app.post<{
    Body: {
      slack_display_name?: unknown;
      slack_secret_ref?: unknown;
      slack_workspace_id?: unknown;
    };
  }>(
    "/api/v1/org/dandelion/activate/team",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const slackDisplayName =
        typeof body.slack_display_name === "string"
          ? body.slack_display_name
          : "";
      const slackSecretRef =
        typeof body.slack_secret_ref === "string"
          ? body.slack_secret_ref
          : "";
      const slackWorkspaceId =
        typeof body.slack_workspace_id === "string"
          ? body.slack_workspace_id
          : undefined;
      const result = await executeTeamActivationForCaller(callerId, {
        slack_display_name: slackDisplayName,
        slack_secret_ref: slackSecretRef,
        slack_workspace_id: slackWorkspaceId,
      });
      if (result.ok) {
        return reply.code(200).send(result);
      }
      const status =
        result.code === "ARCHETYPE_UNKNOWN" ||
        result.code === "INVALID_SLACK_BINDING_INPUT" ||
        result.code === "CONNECTOR_BINDING_FAILED"
          ? 422
          : result.code === "NOT_ADMIN" ||
              result.code === "CALLER_ENTITY_NOT_FOUND" ||
              result.code === "CALLER_NOT_IN_ORG"
            ? 403
            : 500;
      return reply.code(status).send(result);
    },
  );

  // POST /org/dandelion/activate/business — runs the business-
  // archetype ActivationPlan catalog (11 steps; business-activation.
  // json). Steps 6 + 7 register real SLACK_READ + GOOGLE_WORKSPACE_
  // READ ConnectorBindings via the existing C2 + C3 substrates; both
  // bindings persist with secret_ref env-var-NAME ONLY. Step 5
  // (delegated-profile-register) + step 9 (advanced-audit-tier-
  // enable) emit audit-only at this slice (underlying tables are
  // forward-substrate).
  //
  // Partial-failure semantics: if step 6 (Slack) succeeds but step 7
  // (Google) fails, the Slack binding row remains LIVE; the failure
  // message names which connector failed. Operator can soft-delete
  // the orphaned binding via the existing /api/v1/org/connectors/:id
  // admin route. A future slice may add automatic rollback.
  app.post<{
    Body: {
      slack_display_name?: unknown;
      slack_secret_ref?: unknown;
      slack_workspace_id?: unknown;
      google_display_name?: unknown;
      google_secret_ref?: unknown;
      google_workspace_domain?: unknown;
    };
  }>(
    "/api/v1/org/dandelion/activate/business",
    {
      preHandler: requireAdminCapability(authService, "can_admin_org"),
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const slackDisplayName =
        typeof body.slack_display_name === "string"
          ? body.slack_display_name
          : "";
      const slackSecretRef =
        typeof body.slack_secret_ref === "string" ? body.slack_secret_ref : "";
      const slackWorkspaceId =
        typeof body.slack_workspace_id === "string"
          ? body.slack_workspace_id
          : undefined;
      const googleDisplayName =
        typeof body.google_display_name === "string"
          ? body.google_display_name
          : "";
      const googleSecretRef =
        typeof body.google_secret_ref === "string"
          ? body.google_secret_ref
          : "";
      const googleWorkspaceDomain =
        typeof body.google_workspace_domain === "string"
          ? body.google_workspace_domain
          : undefined;
      const result = await executeBusinessActivationForCaller(callerId, {
        slack_display_name: slackDisplayName,
        slack_secret_ref: slackSecretRef,
        slack_workspace_id: slackWorkspaceId,
        google_display_name: googleDisplayName,
        google_secret_ref: googleSecretRef,
        google_workspace_domain: googleWorkspaceDomain,
      });
      if (result.ok) {
        return reply.code(200).send(result);
      }
      const status =
        result.code === "ARCHETYPE_UNKNOWN" ||
        result.code === "INVALID_SLACK_BINDING_INPUT" ||
        result.code === "INVALID_GOOGLE_BINDING_INPUT" ||
        result.code === "CONNECTOR_BINDING_FAILED"
          ? 422
          : result.code === "NOT_ADMIN" ||
              result.code === "CALLER_ENTITY_NOT_FOUND" ||
              result.code === "CALLER_NOT_IN_ORG"
            ? 403
            : 500;
      return reply.code(status).send(result);
    },
  );

  // POST /org/dandelion/activate/enterprise — runs the enterprise-
  // archetype ActivationPlan catalog (14 steps; enterprise-activation
  // .json). Steps 8 + 9 register real SLACK_READ +
  // GOOGLE_WORKSPACE_READ ConnectorBindings via the existing C2 + C3
  // substrates. Steps 5 (delegated authority), 6 (break-glass
  // registry enable), 7 (LawfulBasis attestation surface enable),
  // and 12 (board observer scope) emit audit-only at this slice
  // (underlying tables forward-substrate).
  //
  // DUAL-CONTROL enforcement (this slice): the route is now LIVE in
  // PRIVILEGED_ENDPOINTS as ORG_DANDELION_ENTERPRISE_ACTIVATION per
  // ADR-0026 dual-control middleware pattern. requireDualControl
  // intercepts requests lacking an APPROVED EscalationRequest
  // (escalation_type DUAL_CONTROL_REQUIRED; target_action
  // ORG_DANDELION_ENTERPRISE_ACTIVATION) and returns 403 + creates a
  // PENDING one. The DUAL-CONTROL audit literals at steps 10 + 11
  // continue to truthfully record the catalog's design-intent; the
  // route-tier approval-flow enforcement is now LIVE.
  //
  // preHandler ORDER MATTERS — requireAdminCapability MUST run first
  // (it populates request.auth.entity_id, which requireDualControl
  // reads per the BINDING CONTRACT in dual-control.middleware.ts).
  //
  // The starter-pilot / team / business archetypes intentionally
  // remain single-actor (their catalogs do not carry *_DUAL_CONTROL
  // audit literals; their routes are NOT in PRIVILEGED_ENDPOINTS).
  //
  // Completes the D6 4-archetype series at runtime + closes the
  // truthfully-recorded design-intent into actual enforcement.
  app.post<{
    Body: {
      slack_display_name?: unknown;
      slack_secret_ref?: unknown;
      slack_workspace_id?: unknown;
      google_display_name?: unknown;
      google_secret_ref?: unknown;
      google_workspace_domain?: unknown;
    };
  }>(
    "/api/v1/org/dandelion/activate/enterprise",
    {
      preHandler: [
        requireAdminCapability(authService, "can_admin_org"),
        requireDualControl(enterpriseActivationEndpoint),
      ],
    },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      const body = request.body ?? {};
      const slackDisplayName =
        typeof body.slack_display_name === "string"
          ? body.slack_display_name
          : "";
      const slackSecretRef =
        typeof body.slack_secret_ref === "string" ? body.slack_secret_ref : "";
      const slackWorkspaceId =
        typeof body.slack_workspace_id === "string"
          ? body.slack_workspace_id
          : undefined;
      const googleDisplayName =
        typeof body.google_display_name === "string"
          ? body.google_display_name
          : "";
      const googleSecretRef =
        typeof body.google_secret_ref === "string"
          ? body.google_secret_ref
          : "";
      const googleWorkspaceDomain =
        typeof body.google_workspace_domain === "string"
          ? body.google_workspace_domain
          : undefined;
      const result = await executeEnterpriseActivationForCaller(callerId, {
        slack_display_name: slackDisplayName,
        slack_secret_ref: slackSecretRef,
        slack_workspace_id: slackWorkspaceId,
        google_display_name: googleDisplayName,
        google_secret_ref: googleSecretRef,
        google_workspace_domain: googleWorkspaceDomain,
      });
      if (result.ok) {
        return reply.code(200).send(result);
      }
      const status =
        result.code === "ARCHETYPE_UNKNOWN" ||
        result.code === "INVALID_SLACK_BINDING_INPUT" ||
        result.code === "INVALID_GOOGLE_BINDING_INPUT" ||
        result.code === "CONNECTOR_BINDING_FAILED"
          ? 422
          : result.code === "NOT_ADMIN" ||
              result.code === "CALLER_ENTITY_NOT_FOUND" ||
              result.code === "CALLER_NOT_IN_ORG"
            ? 403
            : 500;
      return reply.code(status).send(result);
    },
  );
}
