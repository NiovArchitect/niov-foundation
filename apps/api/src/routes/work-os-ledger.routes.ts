// FILE: work-os-ledger.routes.ts
// PURPOSE: Phase 1279 — HTTP surface for the durable Work Ledger:
//            POST   /api/v1/work-os/ledger
//            GET    /api/v1/work-os/ledger
//            GET    /api/v1/work-os/ledger/:id
//            PATCH  /api/v1/work-os/ledger/:id
//            GET    /api/v1/work-os/my-work
//            GET    /api/v1/work-os/team-work
//            GET    /api/v1/work-os/blind-spots
//          Bearer-gated; tenant-scoped via the caller's org; manager
//          scope via TAR.can_admin_org. No cross-tenant reads.
// CONNECTS TO: work-os/work-ledger.service.ts, governance/org.ts.

import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import { prisma } from "@niov/database";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  createLedgerEntry,
  listLedgerEntries,
  getLedgerEntry,
  patchLedgerEntry,
  getMyWork,
  getTeamWork,
  getBlindSpots,
  getBlindSpotFeed,
  recordCoordinationOnLedger,
  type LedgerFilters,
} from "../services/work-os/work-ledger.service.js";
import { getWatcherFeed } from "../services/work-os/watcher.service.js";
import { getRecentCommsArtifacts } from "../services/work-os/comms-artifacts.service.js";
import { querySemanticRetrieval } from "../services/work-os/semantic-retrieval.service.js";
import { capturePerception } from "../services/perception/ambient-perception.service.js";
import type { AmbientSourceType } from "../services/intelligence/python-intelligence.js";
import {
  dispatchWorkOsEvent,
  eventTypeForLedger,
  type WorkOsEvent,
} from "../services/coordination/beam-fabric-client.js";
import {
  recordExecutionAttempt,
  listExecutionAttempts,
  getExecutionProofSummary,
  type AttemptFilters,
} from "../services/work-os/execution-verification.service.js";
import {
  deliverHumanInternalMessage,
  getDirectMessageThread,
  trackThreadSignalAsWork,
  getWaitingOnWith,
  getRelationshipWork,
} from "../services/collaboration/internal-message.service.js";
import { makeNotificationService } from "../services/notification/notification.service.js";
import { randomUUID } from "node:crypto";

// Internal-only notification service (no connector fan-out) for the
// human-authority direct internal-message path. Internal Otzar inbox only —
// no Slack/email/calendar/external delivery.
const internalOnlyNotificationService = makeNotificationService({});

function bearerFrom(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length === 0 ? null : token;
}

async function resolveOrgOrFail(
  entityId: string,
  reply: FastifyReply,
): Promise<string | null> {
  try {
    return await getOrgEntityId(entityId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "NOT_IN_ANY_ORG" || message === "ORG_HIERARCHY_TOO_DEEP") {
      await reply
        .code(404)
        .send({ ok: false, code: "NO_ORG_FOR_CALLER", message: "Caller is not in an organization" });
      return null;
    }
    throw err;
  }
}

async function isManager(entityId: string): Promise<boolean> {
  const tar = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
    select: { can_admin_org: true },
  });
  return tar?.can_admin_org === true;
}

function strParam(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export async function registerWorkOsLedgerRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const auth = async (
    request: { headers: { authorization?: string | string[] } },
    reply: FastifyReply,
    scope: "read" | "write",
  ): Promise<{ entity_id: string; org_entity_id: string; manager: boolean } | null> => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null) {
      await reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      return null;
    }
    const session = await authService.validateSession(token, scope);
    if (!session.valid) {
      await reply.code(401).send({ ok: false, code: session.code });
      return null;
    }
    const org = await resolveOrgOrFail(session.entity_id, reply);
    if (org === null) return null;
    return {
      entity_id: session.entity_id,
      org_entity_id: org,
      manager: await isManager(session.entity_id),
    };
  };

  // ── Create ──
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/work-os/ledger",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const b = request.body ?? {};
      const result = await createLedgerEntry({
        org_entity_id: ctx.org_entity_id,
        ledger_type: typeof b.ledger_type === "string" ? b.ledger_type : "",
        title: typeof b.title === "string" ? b.title : "",
        // Caller is the default requester/owner unless explicitly given.
        requester_entity_id:
          strParam(b.requester_entity_id) ?? ctx.entity_id,
        ...(strParam(b.owner_entity_id) ? { owner_entity_id: strParam(b.owner_entity_id) } : { owner_entity_id: ctx.entity_id }),
        ...(strParam(b.target_entity_id) ? { target_entity_id: strParam(b.target_entity_id) } : {}),
        ...(strParam(b.source_type) ? { source_type: strParam(b.source_type) } : {}),
        ...(strParam(b.source_command) ? { source_command: strParam(b.source_command) } : {}),
        ...(strParam(b.conversation_id) ? { conversation_id: strParam(b.conversation_id) } : {}),
        ...(strParam(b.work_plan_id) ? { work_plan_id: strParam(b.work_plan_id) } : {}),
        ...(strParam(b.project_id) ? { project_id: strParam(b.project_id) } : {}),
        ...(strParam(b.proposed_action_id) ? { proposed_action_id: strParam(b.proposed_action_id) } : {}),
        ...(strParam(b.audit_event_id) ? { audit_event_id: strParam(b.audit_event_id) } : {}),
        ...(strParam(b.notification_id) ? { notification_id: strParam(b.notification_id) } : {}),
        ...(strParam(b.summary) ? { summary: strParam(b.summary) } : {}),
        ...(strParam(b.priority) ? { priority: strParam(b.priority) } : {}),
        ...(strParam(b.status) ? { status: strParam(b.status) } : {}),
        ...(strParam(b.extraction_source) ? { extraction_source: strParam(b.extraction_source) } : {}),
        ...(strParam(b.next_action) ? { next_action: strParam(b.next_action) } : {}),
        ...(typeof b.confidence_score === "number" ? { confidence_score: b.confidence_score } : {}),
        ...(Array.isArray(b.evidence) ? { evidence: b.evidence } : {}),
        ...(b.details !== undefined && typeof b.details === "object" && b.details !== null
          ? { details: b.details as Record<string, unknown> }
          : {}),
        ...(strParam(b.due_at) ? { due_at: strParam(b.due_at) } : {}),
        // Phase 1282 — advisory Python enrichment opt-in. Deterministic
        // extraction stays primary; Python only annotates + may upgrade
        // extraction_source when it actually returns signals.
        ...(strParam(b.enrichment_text) ? { enrichment_text: strParam(b.enrichment_text) } : {}),
        ...(b.enable_python_enrichment === true ? { enable_python_enrichment: true } : {}),
      });
      if (result.ok === false)
        return reply.code(result.code === "INVALID_REQUEST" ? 422 : 404).send(result);

      // Phase 1281 — governed BEAM fanout AFTER a successful ledger
      // create. Best-effort: dispatch never blocks/fails the create; the
      // honest coordination result rides back in the response.
      const entry = result.entry;
      const event: WorkOsEvent = {
        event_id: randomUUID(),
        org_entity_id: entry.org_entity_id,
        ledger_entry_id: entry.ledger_entry_id,
        event_type: eventTypeForLedger(entry.ledger_type, entry.status),
        ledger_type: entry.ledger_type,
        status: entry.status,
        priority: entry.priority,
        source_type: entry.source_type,
        extraction_source: entry.extraction_source,
        ...(entry.work_plan_id !== null ? { work_plan_id: entry.work_plan_id } : {}),
        ...(entry.owner_entity_id !== null ? { owner_entity_id: entry.owner_entity_id } : {}),
        ...(entry.requester_entity_id !== null ? { requester_entity_id: entry.requester_entity_id } : {}),
        ...(entry.target_entity_id !== null ? { target_entity_id: entry.target_entity_id } : {}),
        ...(entry.next_action !== null ? { next_action: entry.next_action } : {}),
        ...(entry.due_at !== null ? { due_at: entry.due_at } : {}),
        audit_required: true,
        created_at: entry.created_at,
      };
      const coord = await dispatchWorkOsEvent(event);

      // Phase 1282 — record the BEAM fanout as execution evidence. VERIFIED
      // only on a proven BEAM accept; FAILED otherwise (honest — never a
      // fake green). Best-effort: never blocks the response.
      await recordExecutionAttempt({
        ledger_entry_id: entry.ledger_entry_id,
        org_entity_id: entry.org_entity_id,
        attempt_type: "BEAM_FANOUT",
        runtime: "BEAM",
        evidence_type: "PROVIDER_RESPONSE",
        status: coord.coordination_runtime === "BEAM_DISPATCHED" ? "VERIFIED" : "FAILED",
        detail: {
          coordination_runtime: coord.coordination_runtime,
          ...(coord.watcher !== undefined ? { watcher: coord.watcher } : {}),
          event_type: event.event_type,
        },
        ...(coord.coordination_runtime === "BEAM_DISPATCHED"
          ? {}
          : { error_code: coord.error_code ?? coord.coordination_runtime }),
      });

      // Phase 1283 PART E + F — persist the coordination summary onto the
      // ledger row's details and create internal watcher state (BEAM
      // watcher category). Best-effort: a persistence miss surfaces a safe
      // warning, never fakes the cache and never blocks the response.
      const persisted = await recordCoordinationOnLedger({
        org_entity_id: entry.org_entity_id,
        ledger_entry_id: entry.ledger_entry_id,
        coordination_runtime: coord.coordination_runtime,
        coordination_event_id: event.event_id,
        ...(coord.watcher !== undefined ? { coordination_watcher: coord.watcher } : {}),
        ...(coord.error_code !== undefined ? { coordination_error_code: coord.error_code } : {}),
      });

      return reply.code(201).send({
        ok: true,
        entry: {
          ...entry,
          coordination_runtime: coord.coordination_runtime,
          ...(coord.watcher !== undefined ? { coordination_watcher: coord.watcher } : {}),
        },
        ...(persisted.ok ? {} : { coordination_warning: persisted.warning }),
      });
    },
  );

  // ── List ──
  app.get<{ Querystring: Record<string, string> }>(
    "/api/v1/work-os/ledger",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const q = request.query ?? {};
      const filters: LedgerFilters = {};
      for (const k of ["ledger_type", "status", "owner", "target", "project_id", "goal_id", "work_plan_id", "source_type", "priority", "proposed_action_id"] as const) {
        const v = strParam(q[k]);
        if (v !== undefined) (filters as Record<string, string>)[k] = v;
      }
      const entries = await listLedgerEntries({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
        filters,
      });
      return reply.code(200).send({ ok: true, entries });
    },
  );

  // ── Get one ──
  app.get<{ Params: { id: string } }>(
    "/api/v1/work-os/ledger/:id",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const result = await getLedgerEntry({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      if (result.ok === false) return reply.code(404).send(result);
      return reply.code(200).send({ ok: true, entry: result.entry });
    },
  );

  // ── Patch ──
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/v1/work-os/ledger/:id",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const b = request.body ?? {};
      const result = await patchLedgerEntry({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
        patch: {
          ...(strParam(b.status) ? { status: strParam(b.status) } : {}),
          ...(strParam(b.next_action) ? { next_action: strParam(b.next_action) } : {}),
          ...(strParam(b.priority) ? { priority: strParam(b.priority) } : {}),
        },
      });
      if (result.ok === false)
        return reply
          .code(
            result.code === "INVALID_REQUEST"
              ? 422
              : result.code === "FORBIDDEN"
                ? 403
                : 404,
          )
          .send(result);
      return reply.code(200).send({ ok: true, entry: result.entry });
    },
  );

  // ── My Work ──
  app.get("/api/v1/work-os/my-work", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const items = await getMyWork({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
    });
    return reply.code(200).send({ ok: true, items });
  });

  // ── Team Work ──
  app.get("/api/v1/work-os/team-work", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const result = await getTeamWork({
      org_entity_id: ctx.org_entity_id,
      is_manager: ctx.manager,
    });
    if (result.ok === false) return reply.code(403).send(result);
    return reply.code(200).send({ ok: true, entries: result.entries });
  });

  // ── Human-authority direct internal message (Phase 1284 Wave 2) ──
  // A human sends a LOW-risk internal Otzar-inbox note to an org member.
  // Resolves the recipient via the general resolver; delivers directly under
  // the sender's own authority through the governed notification service.
  // Never sends external; AI-initiated callers are GATED.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/work-os/internal-messages",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const b = request.body ?? {};
      const recipientRef =
        strParam(b.recipient) ?? strParam(b.recipient_ref) ?? strParam(b.target) ?? "";
      const message = strParam(b.message) ?? strParam(b.body) ?? "";
      const result = await deliverHumanInternalMessage({
        orgEntityId: ctx.org_entity_id,
        senderEntityId: ctx.entity_id,
        recipientRef,
        message,
        notificationService: internalOnlyNotificationService,
      });
      if (result.ok) return reply.code(201).send(result);
      // Honest, human-readable failure states — never a dead end.
      const code =
        result.status === "NEEDS_RESOLUTION"
          ? 422
          : result.status === "GATED"
            ? 409
            : 422;
      return reply.code(code).send(result);
    },
  );

  // ── Direct-message thread with a teammate (Phase 1284 Wave 3) ──
  // Returns the persistent person-to-person thread (both directions) derived
  // from the durable internal-note ledger rows. Participant-scoped + tenant-
  // isolated by construction (only rows where the caller is requester/target).
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/work-os/threads/with/:entityId",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const result = await getDirectMessageThread(
        ctx.org_entity_id,
        ctx.entity_id,
        request.params.entityId,
      );
      if (result.ok === false) {
        return reply.code(result.code === "INVALID_TARGET_ID" ? 422 : 404).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // ── Track a thread signal as directional work (Phase 1285 Wave 4) ──
  app.post<{ Params: { messageId: string }; Body: Record<string, unknown> }>(
    "/api/v1/work-os/threads/messages/:messageId/track-signal",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const ledgerType = strParam((request.body ?? {}).ledger_type) ?? "";
      const result = await trackThreadSignalAsWork(
        ctx.org_entity_id,
        ctx.entity_id,
        request.params.messageId,
        ledgerType,
      );
      if (result.ok === false) {
        return reply.code(result.code === "NOT_FOUND" ? 404 : 422).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  // ── Waiting-on relationship with a teammate (Phase 1285 Wave 4) ──
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/work-os/waiting-on/with/:entityId",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const result = await getWaitingOnWith(ctx.org_entity_id, ctx.entity_id, request.params.entityId);
      if (result.ok === false) return reply.code(422).send(result);
      return reply.code(200).send(result);
    },
  );

  // ── Relationship work graph with a teammate (Phase 1285-M) ──
  // Durable answers to completed / blockers / decisions / both waiting-on
  // directions. Participant + tenant scoped by getRelationshipWork.
  app.get<{ Params: { entityId: string } }>(
    "/api/v1/work-os/relationship/with/:entityId",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const result = await getRelationshipWork(ctx.org_entity_id, ctx.entity_id, request.params.entityId);
      if (result.ok === false) return reply.code(422).send(result);
      return reply.code(200).send(result);
    },
  );

  // ── Execution attempts (Phase 1282) — tenant-scoped evidence list ──
  app.get<{ Querystring: Record<string, string> }>(
    "/api/v1/work-os/execution-attempts",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const q = request.query ?? {};
      const filters: AttemptFilters = {};
      const led = strParam(q.ledger_entry_id);
      const st = strParam(q.status);
      if (led !== undefined) filters.ledger_entry_id = led;
      if (st !== undefined) filters.status = st;
      const attempts = await listExecutionAttempts(ctx.org_entity_id, filters);
      return reply.code(200).send({ ok: true, attempts });
    },
  );

  // ── Execution attempts for one ledger entry ──
  app.get<{ Params: { id: string } }>(
    "/api/v1/work-os/ledger/:id/execution-attempts",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      // Tenant isolation: the entry read enforces org scope first; if the
      // caller cannot see the entry, they get no attempts.
      const entry = await getLedgerEntry({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      if (entry.ok === false) return reply.code(404).send(entry);
      const attempts = await listExecutionAttempts(ctx.org_entity_id, {
        ledger_entry_id: request.params.id,
      });
      return reply.code(200).send({ ok: true, attempts });
    },
  );

  // ── Execution proof summary for one ledger entry (Phase 1283) ──
  app.get<{ Params: { id: string } }>(
    "/api/v1/work-os/ledger/:id/execution-proof",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const entry = await getLedgerEntry({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      if (entry.ok === false) return reply.code(404).send(entry);
      const proof = await getExecutionProofSummary(ctx.org_entity_id, request.params.id);
      return reply.code(200).send({ ok: true, proof });
    },
  );

  // ── Blind spots ──
  app.get("/api/v1/work-os/blind-spots", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const items = await getBlindSpots({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
      is_manager: ctx.manager,
    });
    return reply.code(200).send({ ok: true, items });
  });

  // ── Typed risk feed (Phase 1285-N) — overdue / stale waiting-on / unresolved
  //    blocker / no-next-action, with severity + recommended action. ──
  app.get("/api/v1/work-os/blind-spots/feed", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const items = await getBlindSpotFeed({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
      is_manager: ctx.manager,
    });
    return reply.code(200).send({ ok: true, items });
  });

  // ── Governed watcher feed (Phase 1285-P) — the richer WatcherFinding
  //    contract over durable work state: typed risk + canonical participants +
  //    source proof + detection metadata + recommended next action. Foundation
  //    is the policy authority; BEAM (advisory) will later feed candidates into
  //    this same shape (re-validated + re-scoped here). Scope mirrors the blind-
  //    spots feed: employee sees own/owned/requested work; manager sees org. ──
  app.get("/api/v1/work-os/watchers/feed", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const findings = await getWatcherFeed({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
      is_manager: ctx.manager,
    });
    return reply.code(200).send({ ok: true, findings });
  });

  // ── Comms recent-artifacts feed (Phase 1285-T) — durable projection over the
  //    Work Ledger of conversation-derived artifacts (follow-ups / decisions /
  //    blockers / captured work / internal-note notifications), self-scoped +
  //    tenant-isolated. Powers the Comms cockpit "Recent conversation
  //    intelligence" list. next_cursor is null (single recent page; no fake
  //    pagination). ──
  app.get("/api/v1/work-os/comms/recent-artifacts", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const artifacts = await getRecentCommsArtifacts({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
    });
    return reply.code(200).send({ ok: true, artifacts, next_cursor: null });
  });

  // ── Ambient perception capture (Phase 1285-V) — capture a meeting transcript
  //    / conversation note / imported notes into a durable, governed record
  //    (deterministic Work Ledger MEETING entry) and kick off async advisory
  //    meeting intelligence. Deterministic capture NEVER blocks on Python. ──
  app.post<{ Body: { source_type?: string; text?: string } }>(
    "/api/v1/work-os/perception/capture",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const b = request.body ?? {};
      const result = await capturePerception({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        source_type: (typeof b.source_type === "string" ? b.source_type : "") as AmbientSourceType,
        text: typeof b.text === "string" ? b.text : "",
      });
      if (result.ok === false) {
        return reply.code(422).send({ ok: false, code: result.code, message: result.message });
      }
      return reply.code(200).send({ ok: true, entry: result.entry });
    },
  );

  // ── Semantic retrieval query (Phase 1285-W) — meaning-based retrieval over
  //    durable Work Ledger records (work / decisions / blockers / follow-ups /
  //    commitments / meeting captures / notifications / internal-note rows).
  //    Foundation assembles a SCOPED candidate set (self/owned/requested/
  //    targeted, tenant-isolated), computes a deterministic lexical ranking,
  //    and OPTIONALLY asks the advisory Python reranker to reorder ONLY those
  //    candidates. Foundation re-validates every reranked id against the
  //    allowed set; no result blocks on Python. read-scoped. ──
  app.post<{ Body: { query?: unknown; source_filter?: unknown; limit?: unknown } }>(
    "/api/v1/work-os/semantic-retrieval/query",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      const query = typeof b.query === "string" ? b.query : "";
      if (query.trim().length === 0) {
        return reply
          .code(422)
          .send({ ok: false, code: "INVALID_REQUEST", message: "query is required" });
      }
      const source_filter = Array.isArray(b.source_filter)
        ? b.source_filter.filter((s): s is string => typeof s === "string" && s.length > 0)
        : undefined;
      const limit =
        typeof b.limit === "number" && Number.isFinite(b.limit) ? b.limit : undefined;
      const { results, envelope } = await querySemanticRetrieval({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        query,
        ...(source_filter !== undefined && source_filter.length > 0 ? { source_filter } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      return reply.code(200).send({ ok: true, results, envelope });
    },
  );
}
