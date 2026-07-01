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
import {
  prisma,
  createConnectorBinding,
  listConnectorBindingsForOrg,
  writeAuditEvent,
} from "@niov/database";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  promoteCommitmentToAction,
  reconcileLedgerExecutionState,
} from "../services/work-os/execution-bridge.js";
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
import {
  getWatcherFeed,
  getWatcherFeedWithBeamAdvisory,
} from "../services/work-os/watcher.service.js";
import { getRecentCommsArtifacts } from "../services/work-os/comms-artifacts.service.js";
import { querySemanticRetrieval } from "../services/work-os/semantic-retrieval.service.js";
import {
  queryOrgWork,
  groundContextForAgent,
  type OrgQueryScope,
  type OrgQueryFilter,
  type OrgQuerySort,
} from "../services/work-os/org-query.service.js";
import {
  createGoal,
  linkWorkToGoal,
  unlinkWorkFromGoal,
  getGoalProgress,
  listGoals,
} from "../services/work-os/goal.service.js";
import { assessWorkRisk } from "../services/work-os/risk-scoring.service.js";
import { evaluateDraftTone } from "../services/work-os/draft-tone.service.js";
import type { DraftChannel } from "../services/intelligence/python-draft-tone.service.js";
import {
  evaluateOperationalHealth,
  type OperationalScope,
} from "../services/work-os/operational-analytics.service.js";

const DRAFT_CHANNELS: ReadonlyArray<DraftChannel> = [
  "internal_message",
  "email",
  "meeting_follow_up",
  "action_proposal",
  "voice_draft",
  "unknown",
];
import {
  capturePerception,
  captureDevicePerception,
  type DeviceContextInput,
  type VisibilityInput,
} from "../services/perception/ambient-perception.service.js";
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
  app.get<{ Querystring: Record<string, string> }>(
    "/api/v1/work-os/watchers/feed",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      // Phase 1287-B — ?include_beam=true opts into the long-lived BEAM watcher
      // actor's advisory annotations. Default is deterministic-only (unchanged):
      // Blind Spots + risk scoring keep using the deterministic feed with no BEAM
      // latency. No user flow blocks on BEAM (honest beam.status on fallback).
      if (strParam((request.query ?? {}).include_beam) === "true") {
        const { findings, beam } = await getWatcherFeedWithBeamAdvisory({
          org_entity_id: ctx.org_entity_id,
          caller_entity_id: ctx.entity_id,
          is_manager: ctx.manager,
        });
        return reply.code(200).send({ ok: true, findings, beam });
      }
      const findings = await getWatcherFeed({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      return reply.code(200).send({ ok: true, findings });
    },
  );

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

  // ── Glasses / lens device-capture adapter (Phase 1287-A) — the governed
  //    intake contract for future device-originated TEXT ambient packets. NOT
  //    always-on capture, NOT a camera/hardware path. Raw frames / images /
  //    visual / biometric are rejected; consent (user-initiated + visible) is
  //    required; bystander-sensitive packets store privately or are blocked;
  //    device-provided identity is ignored (the authed session is the only
  //    authority). Deterministic capture NEVER blocks on Python. auth write. ──
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/work-os/perception/device-capture",
    async (request, reply) => {
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const b = request.body ?? {};
      // Raw camera frames / images are NEVER accepted — surface them to the
      // service so it can reject honestly.
      const FORBIDDEN_MEDIA_KEYS = [
        "image", "image_data", "image_base64", "frame", "frames", "raw_frame", "video", "photo", "media",
      ];
      const rawMediaKeys = FORBIDDEN_MEDIA_KEYS.filter((k) => k in b);

      const obj = (v: unknown): Record<string, unknown> =>
        typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
      const consentRaw = obj(b.consent);
      const deviceRaw = obj(b.device_context);
      const visRaw = obj(b.visibility);
      const hintRaw = obj(b.context_hint);

      const DEVICE_TYPES = ["glasses", "lens", "earbuds", "desktop", "mobile", "unknown"] as const;
      const CAPTURE_MODES = ["manual", "voice_confirmed", "user_tapped", "scheduled", "unknown"] as const;
      const SCOPES = ["private", "thread", "org", "unknown"] as const;
      const deviceType = (DEVICE_TYPES as readonly string[]).includes(deviceRaw.device_type as string)
        ? (deviceRaw.device_type as DeviceContextInput["device_type"])
        : "unknown";
      const captureMode = (CAPTURE_MODES as readonly string[]).includes(deviceRaw.capture_mode as string)
        ? (deviceRaw.capture_mode as DeviceContextInput["capture_mode"])
        : "unknown";
      const scope = (SCOPES as readonly string[]).includes(visRaw.scope as string)
        ? (visRaw.scope as VisibilityInput["scope"])
        : "unknown";

      const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

      const result = await captureDevicePerception({
        org_entity_id: ctx.org_entity_id, // session is the only authority
        caller_entity_id: ctx.entity_id,
        source_type: (typeof b.source_type === "string" ? b.source_type : "") as AmbientSourceType,
        text: typeof b.text === "string" ? b.text : "",
        raw_media_keys: rawMediaKeys,
        consent: {
          user_initiated: consentRaw.user_initiated === true,
          capture_visible_to_user: consentRaw.capture_visible_to_user === true,
          bystander_sensitive: consentRaw.bystander_sensitive === true,
          ...(typeof consentRaw.recording_disclosed === "boolean"
            ? { recording_disclosed: consentRaw.recording_disclosed }
            : {}),
        },
        device_context: { device_type: deviceType, capture_mode: captureMode },
        visibility: { scope },
        ...(str(b.observed_at) !== undefined ? { observed_at: str(b.observed_at) } : {}),
        context_hint: {
          ...(str(hintRaw.meeting_title) !== undefined ? { meeting_title: str(hintRaw.meeting_title) } : {}),
          ...(str(hintRaw.related_person_name) !== undefined ? { related_person_name: str(hintRaw.related_person_name) } : {}),
          ...(str(hintRaw.related_project) !== undefined ? { related_project: str(hintRaw.related_project) } : {}),
          ...(str(hintRaw.location_label) !== undefined ? { location_label: str(hintRaw.location_label) } : {}),
        },
      });
      if (result.ok === false) {
        return reply.code(422).send({ ok: false, code: result.code, message: result.message });
      }
      return reply.code(200).send({ ok: true, entry: result.entry, disposition: result.disposition });
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

  // POST /api/v1/work-os/org-query -- Slice B. The UNIFIED, governed org query
  // over the one canonical WorkLedger. One flexible surface (extend, not
  // duplicate): scope self|project|team|org|admin; optional query (lexical),
  // project_id, filter all|blockers|connector_gaps|seeds, sort relevance|recent.
  // Scope is enforced in-service: self=own rows, project=active membership,
  // team/org/admin=manager. Admin seeds only in admin scope. No cross-tenant leak;
  // rows are post-quarantine; only scoped summary + evidence are returned.
  app.post<{
    Body: { scope?: unknown; query?: unknown; project_id?: unknown; filter?: unknown; sort?: unknown; limit?: unknown };
  }>("/api/v1/work-os/org-query", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const b = request.body ?? {};
    const scopeIn = typeof b.scope === "string" ? b.scope : "self";
    const validScopes: OrgQueryScope[] = ["self", "project", "team", "org", "admin"];
    if (!validScopes.includes(scopeIn as OrgQueryScope)) {
      return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "invalid scope" });
    }
    const filter: OrgQueryFilter | undefined =
      b.filter === "blockers" || b.filter === "connector_gaps" || b.filter === "seeds" || b.filter === "all"
        ? b.filter
        : undefined;
    const sort: OrgQuerySort | undefined = b.sort === "recent" || b.sort === "relevance" ? b.sort : undefined;
    const result = await queryOrgWork({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
      is_manager: ctx.manager,
      scope: scopeIn as OrgQueryScope,
      ...(typeof b.query === "string" && b.query.trim().length > 0 ? { query: b.query } : {}),
      ...(typeof b.project_id === "string" && b.project_id.length > 0 ? { project_id: b.project_id } : {}),
      ...(filter !== undefined ? { filter } : {}),
      ...(sort !== undefined ? { sort } : {}),
      ...(typeof b.limit === "number" && Number.isFinite(b.limit) ? { limit: b.limit } : {}),
    });
    if (!result.ok) {
      const status = result.code === "SCOPE_NOT_PERMITTED" ? 403 : result.code === "NOT_PROJECT_MEMBER" ? 403 : 422;
      return reply.code(status).send(result);
    }
    return reply.code(200).send(result);
  });

  // POST /api/v1/work-os/org-query/ground -- Slice B. What Otzar calls BEFORE it
  // answers or acts: governed, evidence-bearing context for (caller, org, query),
  // with an explicit sufficient=false + reason when there isn't enough — so the
  // agent grounds on real data or declines, never hallucinates.
  app.post<{ Body: { query?: unknown; intent?: unknown } }>(
    "/api/v1/work-os/org-query/ground",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      if (typeof b.query !== "string" || b.query.trim().length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "query is required" });
      }
      const grounded = await groundContextForAgent({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
        query: b.query,
        ...(typeof b.intent === "string" ? { intent: b.intent } : {}),
      });
      return reply.code(200).send(grounded);
    },
  );

  // ── Slice D — the GOAL LAYER. Objectives users/orgs steer by. A goal is a
  //    GOAL-typed WorkLedger row; work links via goal_id; progress rolls up from
  //    the linked work. Same "read"-tier gate; scope/authority enforced in-service.
  // POST /api/v1/work-os/goals — create a personal or org objective.
  app.post<{ Body: { title?: unknown; description?: unknown; scope?: unknown; owner_entity_id?: unknown; target?: unknown; due_at?: unknown } }>(
    "/api/v1/work-os/goals",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      if (typeof b.title !== "string" || b.title.trim().length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "title is required" });
      }
      const result = await createGoal({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
        title: b.title,
        ...(typeof b.description === "string" ? { description: b.description } : {}),
        ...(b.scope === "org" || b.scope === "personal" ? { scope: b.scope } : {}),
        ...(typeof b.owner_entity_id === "string" ? { owner_entity_id: b.owner_entity_id } : {}),
        ...(typeof b.target === "string" ? { target: b.target } : {}),
        ...(typeof b.due_at === "string" ? { due_at: b.due_at } : {}),
      });
      if (!result.ok) return reply.code(result.code === "NOT_PERMITTED" ? 403 : 422).send(result);
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/work-os/goals?scope=self|org — list goals in scope.
  app.get<{ Querystring: { scope?: string } }>("/api/v1/work-os/goals", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const scope = request.query.scope === "org" ? "org" : "self";
    const result = await listGoals({ org_entity_id: ctx.org_entity_id, caller_entity_id: ctx.entity_id, is_manager: ctx.manager, scope });
    if (!result.ok) return reply.code(result.code === "NOT_PERMITTED" ? 403 : 422).send(result);
    return reply.code(200).send(result);
  });

  // GET /api/v1/work-os/goals/:id/progress — deterministic rollup of linked work.
  app.get<{ Params: { id: string } }>("/api/v1/work-os/goals/:id/progress", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const result = await getGoalProgress({ org_entity_id: ctx.org_entity_id, caller_entity_id: ctx.entity_id, is_manager: ctx.manager, goal_id: request.params.id });
    if (!result.ok) return reply.code(result.code === "GOAL_NOT_FOUND" ? 404 : result.code === "NOT_PERMITTED" ? 403 : 422).send(result);
    return reply.code(200).send(result);
  });

  // POST /api/v1/work-os/goals/:id/link — link a work item to this goal.
  app.post<{ Params: { id: string }; Body: { ledger_entry_id?: unknown } }>(
    "/api/v1/work-os/goals/:id/link",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      if (typeof b.ledger_entry_id !== "string" || b.ledger_entry_id.length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "ledger_entry_id is required" });
      }
      const result = await linkWorkToGoal({ org_entity_id: ctx.org_entity_id, caller_entity_id: ctx.entity_id, is_manager: ctx.manager, ledger_entry_id: b.ledger_entry_id, goal_id: request.params.id });
      if (!result.ok) {
        const status = result.code === "GOAL_NOT_FOUND" || result.code === "WORK_NOT_FOUND" ? 404 : result.code === "NOT_PERMITTED" ? 403 : 422;
        return reply.code(status).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST /api/v1/work-os/goals/:id/unlink — unlink a work item.
  app.post<{ Params: { id: string }; Body: { ledger_entry_id?: unknown } }>(
    "/api/v1/work-os/goals/:id/unlink",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      if (typeof b.ledger_entry_id !== "string" || b.ledger_entry_id.length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "ledger_entry_id is required" });
      }
      const result = await unlinkWorkFromGoal({ org_entity_id: ctx.org_entity_id, caller_entity_id: ctx.entity_id, is_manager: ctx.manager, ledger_entry_id: b.ledger_entry_id });
      if (!result.ok) return reply.code(result.code === "WORK_NOT_FOUND" ? 404 : result.code === "NOT_PERMITTED" ? 403 : 422).send(result);
      return reply.code(200).send(result);
    },
  );

  // ── Risk assessment (Phase 1285-X) — advisory RISK_SCORING over the
  //    deterministic watcher findings (overdue / blocked / waiting-on /
  //    no-next-action). Foundation assembles the scoped findings (employee sees
  //    own/owned/requested; manager sees org), enriches each with an advisory
  //    risk_assessment, and re-validates every score against the allowed set.
  //    The deterministic findings stay primary; nothing is created or notified;
  //    no result blocks on Python. read-scoped. ──
  app.get("/api/v1/work-os/risk/assessment", async (request, reply) => {
    const ctx = await auth(request, reply, "read");
    if (ctx === null) return;
    const { findings, envelope } = await assessWorkRisk({
      org_entity_id: ctx.org_entity_id,
      caller_entity_id: ctx.entity_id,
      is_manager: ctx.manager,
    });
    return reply.code(200).send({ ok: true, findings, envelope });
  });

  // ── Draft tone evaluation (Phase 1285-Y) — advisory DRAFT_TONE over a
  //    PROPOSED message (internal note / reply / follow-up / action-proposal /
  //    future ambient/voice draft). Foundation computes a deterministic
  //    assessment, optionally refines it via Python, and validates the suggested
  //    revision is safe (no em dash, no new recipient/link, intent preserved).
  //    The original draft is preserved + primary; nothing is sent or created;
  //    approval gates are Foundation-authoritative. Evaluative read; no
  //    persistence. read-scoped. ──
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/work-os/draft-tone/evaluate",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const b = request.body ?? {};
      const draftText = typeof b.draft_text === "string" ? b.draft_text : "";
      if (draftText.trim().length === 0) {
        return reply
          .code(422)
          .send({ ok: false, code: "INVALID_REQUEST", message: "draft_text is required" });
      }
      const channel =
        typeof b.channel === "string" && (DRAFT_CHANNELS as readonly string[]).includes(b.channel)
          ? (b.channel as DraftChannel)
          : "unknown";
      // recipient_context: accept display_name (never trust a raw id as a label)
      // + internal flag only. No recipient is resolved or added here.
      let recipientContext: { display_name?: string; relationship?: string; internal: boolean } | undefined;
      const rc = b.recipient_context;
      if (typeof rc === "object" && rc !== null) {
        const r = rc as Record<string, unknown>;
        recipientContext = {
          internal: r.internal === true,
          ...(typeof r.display_name === "string" ? { display_name: r.display_name } : {}),
          ...(typeof r.relationship === "string" ? { relationship: r.relationship } : {}),
        };
      }
      const constraints =
        typeof b.constraints === "object" && b.constraints !== null &&
        typeof (b.constraints as Record<string, unknown>).approval_required === "boolean"
          ? { approval_required: (b.constraints as Record<string, unknown>).approval_required as boolean }
          : undefined;
      const { assessment, envelope } = await evaluateDraftTone({
        draft_text: draftText,
        channel,
        ...(recipientContext !== undefined ? { recipient_context: recipientContext } : {}),
        ...(typeof b.intent === "string" ? { intent: b.intent } : {}),
        ...(constraints !== undefined ? { constraints } : {}),
        ...(typeof b.draft_id === "string" ? { draft_id: b.draft_id } : {}),
      });
      return reply.code(200).send({ ok: true, assessment, envelope });
    },
  );

  // ── Operational health (Phase 1285-Z) — advisory OPERATIONAL_ANALYTICS over a
  //    Foundation-scoped execution-health snapshot (Work Ledger + watcher + risk
  //    + execution attempts). Deterministic health_score + status + counts are
  //    PRIMARY; Python enriches the narrative when validated. scope=personal
  //    (default) is caller-scoped; team/org require manager and otherwise fall
  //    back to personal. Nothing is created/sent. read-scoped. ──
  app.get<{ Querystring: Record<string, string> }>(
    "/api/v1/work-os/operational-health",
    async (request, reply) => {
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const requested = strParam((request.query ?? {}).scope);
      // team/org require manager; otherwise the safe default is personal.
      const scope: OperationalScope =
        (requested === "team" || requested === "org") && ctx.manager
          ? (requested as OperationalScope)
          : "personal";
      const { health, envelope } = await evaluateOperationalHealth({
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
        scope,
      });
      return reply.code(200).send({ ok: true, health, envelope });
    },
  );

  // ────────────────────────────────────────────────────────────────
  // Slice F — governed connector/MCP write-back (flag-gated).
  // OTZAR_WORK_WRITEBACK must equal "on"; otherwise these endpoints are
  // inert (404 feature_disabled) so a flag-off deploy is byte-identical
  // in behavior to the pre-Slice-F surface. No auto-send: /execute only
  // CREATES a governed Action (approval-gated); execution happens via the
  // existing approved-Action lifecycle.
  // ────────────────────────────────────────────────────────────────
  const writebackEnabled = (): boolean => process.env["OTZAR_WORK_WRITEBACK"] === "on";

  // Promote a caller-owned commitment to a governed INVOKE_CONNECTOR Action.
  app.post<{ Params: { id: string } }>(
    "/api/v1/work-os/ledger/:id/execute",
    async (request, reply) => {
      if (!writebackEnabled()) {
        return reply.code(404).send({ ok: false, code: "FEATURE_DISABLED" });
      }
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      const result = await promoteCommitmentToAction({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      // outcome !== action_created is still a governed, honest result
      // (blocked_setup_required / not_executable / unsupported_connector),
      // returned 200 with ok:false so the caller can render the reason.
      return reply.code(200).send(result);
    },
  );

  // Reconcile a commitment's execution state from its linked Action.
  app.post<{ Params: { id: string } }>(
    "/api/v1/work-os/ledger/:id/reconcile-execution",
    async (request, reply) => {
      if (!writebackEnabled()) {
        return reply.code(404).send({ ok: false, code: "FEATURE_DISABLED" });
      }
      const ctx = await auth(request, reply, "read");
      if (ctx === null) return;
      const result = await reconcileLedgerExecutionState({
        ledger_entry_id: request.params.id,
        org_entity_id: ctx.org_entity_id,
        caller_entity_id: ctx.entity_id,
        is_manager: ctx.manager,
      });
      return reply.code(200).send(result);
    },
  );

  // Admin-only setup path: register (idempotently) the org's SLACK_WRITE
  // ConnectorBinding. secret_ref is the env-var NAME (SLACK_BOT_TOKEN) —
  // never the token value; the value is only ever read from process.env
  // inside the provider. Not auto-created during execution: a binding is
  // only ever created here, by an admin, audited.
  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/work-os/connector-bindings/slack-write",
    async (request, reply) => {
      if (!writebackEnabled()) {
        return reply.code(404).send({ ok: false, code: "FEATURE_DISABLED" });
      }
      const ctx = await auth(request, reply, "write");
      if (ctx === null) return;
      if (!ctx.manager) {
        return reply.code(403).send({ ok: false, code: "ADMIN_REQUIRED" });
      }
      const b = request.body ?? {};
      const defaultChannel = strParam(b.default_channel);
      if (defaultChannel === undefined) {
        return reply.code(422).send({ ok: false, code: "MISSING_DEFAULT_CHANNEL", message: "default_channel is required (the Slack channel id, e.g. from SLACK_TEST_CHANNEL_ID)" });
      }
      // secret_ref defaults to the canonical env-var NAME; a caller may
      // override the name but NEVER supplies a token value here.
      const secretRef = strParam(b.secret_ref) ?? "SLACK_BOT_TOKEN";
      // Idempotent: if an enabled SLACK_WRITE binding already exists for
      // this org, return it rather than creating a duplicate.
      const existing = (await listConnectorBindingsForOrg(ctx.org_entity_id, { enabled: true }))
        .find((x) => String(x.type) === "SLACK_WRITE");
      if (existing !== undefined) {
        return reply.code(200).send({
          ok: true,
          created: false,
          binding_id: existing.binding_id,
          type: "SLACK_WRITE",
        });
      }
      const binding = await createConnectorBinding({
        org_entity_id: ctx.org_entity_id,
        type: "SLACK_WRITE",
        display_name: "Slack (governed write-back)",
        // config.use_real gates the real Slack API in the provider (the
        // SLACK_USE_REAL env master switch must also be "1").
        config: { default_channel: defaultChannel, use_real: true },
        secret_ref: secretRef,
        created_by_entity_id: ctx.entity_id,
      });
      const audit = await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: ctx.entity_id,
        target_entity_id: ctx.org_entity_id,
        details: {
          action: "connector_binding_created",
          connector_type: "SLACK_WRITE",
          binding_id: binding.binding_id,
          secret_ref: secretRef,
        },
      });
      return reply.code(201).send({
        ok: true,
        created: true,
        binding_id: binding.binding_id,
        type: "SLACK_WRITE",
        audit_event_id: typeof audit === "object" && audit !== null && "audit_id" in audit ? (audit as { audit_id: string }).audit_id : undefined,
      });
    },
  );
}
