// FILE: otzar-dandelion.routes.ts
// PURPOSE: Phase 1237 — HTTP surface for Dandelion org-growth
//          intelligence and consent-gated voice-first onboarding.
//
//          - GET  /api/v1/otzar/dandelion/org-growth   (org admin)
//          - GET  /api/v1/otzar/dandelion/onboarding   (employee)
//          - POST /api/v1/otzar/dandelion/onboarding/memory-candidates
//            (employee; creates Action(PROPOSED, RECORD_CAPSULE) —
//            memory is saved only after the user approves it)

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import {
  getOnboardingIntrosForCaller,
  getOrgGrowthForCaller,
  proposeOnboardingMemoryForCaller,
  proposeTwinCalibrationForCaller,
} from "../services/otzar/dandelion-growth.service.js";
import {
  listOrgSeeds,
  approveSeed,
  rejectSeed,
  holdSeed,
  syncGrowthDiscoveriesToSeeds,
} from "../services/otzar/dandelion-seed.service.js";
import { getOrgEntityId } from "../services/governance/org.js";

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

interface MemoryBody {
  preferred_name?: unknown;
  pronunciation?: unknown;
  communication_preference?: unknown;
  quiet_preference?: unknown;
  remember_text?: unknown;
}

export async function registerOtzarDandelionRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.get("/api/v1/otzar/dandelion/org-growth", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getOrgGrowthForCaller(session.entity_id);
    if (result.ok === false) {
      const status =
        result.code === "ADMIN_REQUIRED"
          ? 403
          : result.code === "NO_ORG_FOR_CALLER"
            ? 404
            : 403;
      return reply.code(status).send({ ok: false, code: result.code });
    }
    return reply.code(200).send({ ok: true, growth: result.growth });
  });

  // ── Admin-governed Dandelion seed queue (Organization Seeding) ──────────────
  // Gated on the admin_org capability — non-admins get OPERATION_NOT_PERMITTED.
  // Tenant-isolated. Approve/reject/hold NEVER auto-apply or grant access.
  async function adminOrg(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ adminId: string; orgId: string } | null> {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      return null;
    }
    const session = await authService.validateSession(token, "admin_org");
    if (!session.valid) {
      reply.code(session.code === "OPERATION_NOT_PERMITTED" ? 403 : 401).send({ ok: false, code: session.code });
      return null;
    }
    try {
      const orgId = await getOrgEntityId(session.entity_id);
      return { adminId: session.entity_id, orgId };
    } catch {
      reply.code(404).send({ ok: false, code: "NO_ORG_FOR_CALLER" });
      return null;
    }
  }

  app.get("/api/v1/org/dandelion/seeds", async (request, reply) => {
    const ctx = await adminOrg(request, reply);
    if (ctx === null) return;
    const seeds = await listOrgSeeds(ctx.orgId);
    return reply.code(200).send({ ok: true, seeds });
  });

  // Phase A — Discover → Seed: land org-growth structure gaps into the
  // governed queue (idempotent). Never grants membership.
  app.post("/api/v1/org/dandelion/seeds/sync-from-growth", async (request, reply) => {
    const ctx = await adminOrg(request, reply);
    if (ctx === null) return;
    const growth = await getOrgGrowthForCaller(ctx.adminId);
    if (growth.ok === false) {
      return reply
        .code(growth.code === "ADMIN_REQUIRED" ? 403 : 404)
        .send({ ok: false, code: growth.code });
    }
    const synced = await syncGrowthDiscoveriesToSeeds({
      orgEntityId: ctx.orgId,
      adminEntityId: ctx.adminId,
      needs_first_project_people: growth.growth.needs_first_project_people,
    });
    const seeds = await listOrgSeeds(ctx.orgId);
    return reply.code(200).send({
      ok: true,
      created: synced.created,
      skipped_existing: synced.skipped_existing,
      growth_headline: growth.growth.headline,
      members_without_project_count:
        growth.growth.signals.members_without_project_count,
      seeds,
    });
  });

  for (const [verb, fn] of [
    ["approve", approveSeed],
    ["reject", rejectSeed],
    ["hold", holdSeed],
  ] as const) {
    app.post<{
      Params: { id: string };
      Body: {
        reason?: unknown;
        decision?: unknown;
        link_external_collaborator_id?: unknown;
        project_id?: unknown;
      };
    }>(
      `/api/v1/org/dandelion/seeds/:id/${verb}`,
      async (request, reply) => {
        const ctx = await adminOrg(request, reply);
        if (ctx === null) return;
        const b = request.body ?? {};
        const reason = isStr(b.reason) ? (b.reason as string) : undefined;
        // [T-3C] admin decision for external review seeds (approve only).
        const decision =
          verb === "approve" && (b.decision === "link_existing" || b.decision === "track_new")
            ? b.decision
            : undefined;
        const linkId =
          verb === "approve" && isStr(b.link_external_collaborator_id)
            ? (b.link_external_collaborator_id as string)
            : undefined;
        // [A.3] structure seed: explicit project assignment on approve.
        const projectId =
          verb === "approve" && isStr(b.project_id)
            ? (b.project_id as string)
            : undefined;
        const result = await fn({
          seedId: request.params.id,
          orgEntityId: ctx.orgId,
          adminEntityId: ctx.adminId,
          ...(reason !== undefined ? { reason } : {}),
          ...(decision !== undefined ? { decision } : {}),
          ...(linkId !== undefined ? { linkExternalCollaboratorId: linkId } : {}),
          ...(projectId !== undefined ? { project_id: projectId } : {}),
        });
        if (result.ok === false) {
          return reply.code(result.code === "NOT_FOUND" ? 404 : 422).send(result);
        }
        return reply.code(200).send(result);
      },
    );
  }

  app.get("/api/v1/otzar/dandelion/onboarding", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });
    const result = await getOnboardingIntrosForCaller(session.entity_id);
    if (result.ok === false)
      return reply.code(404).send({ ok: false, code: result.code });
    return reply.code(200).send({ ok: true, onboarding: result.onboarding });
  });

  // ── [CS-3] POST /otzar/twin/calibration — the employee calibrates their
  // OWN twin (self-scoped: the caller IS the subject; no target param
  // exists). Same consent gate as onboarding memory: nothing is saved
  // until the user approves the proposed action.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/otzar/twin/calibration",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const b = request.body ?? {};
      const result = await proposeTwinCalibrationForCaller({
        callerEntityId: session.entity_id,
        ...(isStr(b.summary_preference) ? { summary_preference: b.summary_preference } : {}),
        ...(isStr(b.tone_preference) ? { tone_preference: b.tone_preference } : {}),
        ...(isStr(b.reminder_preference) ? { reminder_preference: b.reminder_preference } : {}),
        ...(isStr(b.decision_support_preference)
          ? { decision_support_preference: b.decision_support_preference }
          : {}),
        ...(isStr(b.writing_style_text) ? { writing_style_text: b.writing_style_text } : {}),
        ...(isStr(b.current_focus_text) ? { current_focus_text: b.current_focus_text } : {}),
        ...(isStr(b.do_not_do_text) ? { do_not_do_text: b.do_not_do_text } : {}),
      });
      if (result.ok === false) {
        if ("httpStatus" in result) {
          return reply.code(result.httpStatus).send({ ok: false, code: result.code });
        }
        return reply.code(422).send({ ok: false, code: result.code, message: (result as { message?: string }).message });
      }
      return reply.code(201).send({ ok: true, action: result.view });
    },
  );

  app.post<{ Body: MemoryBody }>(
    "/api/v1/otzar/dandelion/onboarding/memory-candidates",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "write");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const body = request.body ?? {};
      const result = await proposeOnboardingMemoryForCaller({
        callerEntityId: session.entity_id,
        ...(isStr(body.preferred_name)
          ? { preferred_name: body.preferred_name }
          : {}),
        ...(isStr(body.pronunciation)
          ? { pronunciation: body.pronunciation }
          : {}),
        ...(isStr(body.communication_preference)
          ? { communication_preference: body.communication_preference }
          : {}),
        ...(isStr(body.quiet_preference)
          ? { quiet_preference: body.quiet_preference }
          : {}),
        ...(isStr(body.remember_text)
          ? { remember_text: body.remember_text }
          : {}),
      });
      if (result.ok === false) {
        if ("httpStatus" in result) {
          return reply.code(result.httpStatus).send({
            ok: false,
            code: result.code,
            ...(result.message === undefined
              ? {}
              : { message: result.message }),
          });
        }
        return reply.code(422).send({
          ok: false,
          code: result.code,
          ...(result.message === undefined ? {} : { message: result.message }),
        });
      }
      return reply.code(201).send({ ok: true, action: result.view });
    },
  );
}
