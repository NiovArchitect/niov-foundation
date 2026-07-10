// FILE: connector-data.routes.ts
// PURPOSE: Phase 1270 — HTTP surface for the read-only connector data
//          bridges:
//            - GET  /api/v1/zoom/recordings        (Zoom cloud recordings)
//            - POST /api/v1/calendar/freebusy      (Google free/busy)
//          Bearer + read scope; org resolved from the caller. Both are
//          READ-ONLY — they never create, send, or mutate provider data.
// CONNECTS TO: connector-data-read.service.ts (the egress + audit),
//          getOrgEntityId (caller → org), AuthService (bearer/read gate).

import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.service.js";
import type { OtzarService } from "../services/otzar/otzar.service.js";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import {
  slackMessageToSourceEvent,
  zoomRecordingToSourceEvent,
  googleMeetTranscriptToSourceEvent,
} from "../services/otzar/source-event.js";
import { fetchZoomTranscriptForOrg } from "../services/connector/zoom-transcript.js";
import {
  fetchSlackMessageForOrg,
  isValidSlackMessageTs,
  slackChannelIdAllowed,
} from "../services/connector/slack-message.js";
import { getOrgEntityId } from "../services/governance/org.js";
import {
  listZoomRecordingsForOrg,
  getCalendarFreeBusyForOrg,
  listGoogleDocsForOrg,
  fetchGoogleDocTextForOrg,
  listMeetConferenceRecordsForOrg,
  fetchMeetTranscriptForOrg,
} from "../services/connector/connector-data-read.service.js";
import {
  importGoogleDocForCaller,
  revalidateImportedDocForCaller,
  DOCUMENT_SOURCE_KINDS,
  DOCUMENT_CURRENTNESS,
  type DocumentSourceKind,
  type DocumentCurrentness,
} from "../services/otzar/document-context.service.js";
import { sourceHealthSweepForCaller } from "../services/otzar/source-health.service.js";
import { tickSourceRecheck } from "../services/otzar/source-recheck.service.js";

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

// Map a service failure code to an honest HTTP status.
function statusForCode(code: string): number {
  switch (code) {
    case "NOT_CONNECTED":
      return 409; // connection not present / disabled
    case "TOKEN_REFRESH_FAILED":
      return 409; // needs reconnect
    case "SCOPE_REAUTH_REQUIRED":
      return 409; // token rejected for auth/scope — re-consent needed
    case "INVALID_REQUEST":
      return 422;
    default:
      return 502; // PROVIDER_ERROR — upstream provider failed
  }
}

export async function registerConnectorDataRoutes(
  app: FastifyInstance,
  authService: AuthService,
  otzarService: OtzarService,
): Promise<void> {
  // ── Zoom cloud recordings (read-only) ──
  app.get<{
    Querystring: { from?: string; to?: string; page_size?: string };
  }>("/api/v1/zoom/recordings", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });

    const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
    if (orgEntityId === null) return;

    const q = request.query ?? {};
    const pageSize =
      typeof q.page_size === "string" ? Number.parseInt(q.page_size, 10) : NaN;
    const result = await listZoomRecordingsForOrg({
      actor_entity_id: session.entity_id,
      org_entity_id: orgEntityId,
      ...(typeof q.from === "string" ? { from: q.from } : {}),
      ...(typeof q.to === "string" ? { to: q.to } : {}),
      ...(Number.isFinite(pageSize) ? { page_size: pageSize } : {}),
    });
    if (result.ok === false)
      return reply.code(statusForCode(result.code)).send(result);
    return reply.code(200).send(result);
  });


  // ── [CX-SLICE-3] Governed meeting ingestion (admin-triggered) ──
  // POST /api/v1/zoom/recordings/ingest — the safe first slice of meeting
  // ingestion: an ADMIN picks a recording; the transcript is fetched
  // server-side (org OAuth token; download URLs never exposed), parsed, and
  // fed to the EXISTING comms-ingest pipeline (owners, seeds, evidence,
  // audit — no second pipeline). The admin trigger IS the consent record
  // (audited as CONNECTOR_DATA_READ + the ingest's own audit trail).
  app.post<{ Body: { meeting_id?: unknown } }>(
    "/api/v1/zoom/recordings/ingest",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const bearer = bearerFrom(request.headers.authorization);
      if (bearer === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const meetingId =
        typeof request.body?.meeting_id === "string" && request.body.meeting_id.length > 0
          ? request.body.meeting_id
          : null;
      if (meetingId === null) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "meeting_id is required" });
      }
      const orgEntityId = await resolveOrgOrFail(request.auth!.entity_id, reply);
      if (orgEntityId === null) return;
      const fetched = await fetchZoomTranscriptForOrg({
        actor_entity_id: request.auth!.entity_id,
        org_entity_id: orgEntityId,
        meeting_id: meetingId,
      });
      if (fetched.ok === false) {
        const status =
          fetched.code === "NOT_FOUND" || fetched.code === "NO_TRANSCRIPT" ? 404
          : fetched.code === "NOT_CONFIGURED" ? 409
          : fetched.code === "TRANSCRIPT_TOO_LARGE" ? 422
          : 502;
        return reply.code(status).send({ ok: false, code: fetched.code });
      }
      // [GAP-I ZOOM] Canonical provenance: this is a CONNECTOR source, not a
      // pasted transcript. The spine's dedupe (org + "ZOOM:<meeting_id>")
      // makes re-ingesting the same recording idempotent, and every ledger
      // row carries source_system/source_id lineage.
      const zoomEvent = zoomRecordingToSourceEvent({
        meetingId,
        topic: fetched.topic,
        transcript: fetched.transcript,
        callerEntityId: request.auth!.entity_id,
        callerName: "Zoom recording import",
        orgEntityId,
        nowIso: new Date().toISOString(),
      });
      const result = await otzarService.ingestSourceEvent({
        token: bearer,
        source: {
          sourceType: zoomEvent.sourceType,
          sourceSystem: zoomEvent.sourceSystem,
          sourceId: zoomEvent.sourceId,
          sourceUrl: null,
          actor: { name: zoomEvent.actor.name },
          timestamp: zoomEvent.timestamp,
          title: zoomEvent.title,
          content: zoomEvent.content,
        },
      });
      if (!result.ok) {
        if (result.code === "ALREADY_INGESTED") {
          // Honest idempotency: the same recording was ingested before —
          // no duplicate work was created.
          return reply.code(409).send(result);
        }
        return reply.code(502).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // ── [SLACK-INGEST-1] Governed Slack message ingestion (admin-triggered) ──
  // POST /api/v1/slack/messages/ingest — the flagship ambient-source safe
  // first slice: an ADMIN picks one message from a PUBLIC channel; it is
  // fetched server-side via the org's sealed Slack OAuth envelope (tokens
  // never exposed) and fed to the EXISTING spine via the canonical adapter
  // (slackMessageToSourceEvent → ingestSourceEvent — no second pipeline).
  // Dedupe identity: org (spine capture lookup) + SLACK:<team>:<channel>:
  // [<thread_ts>:]<ts>. DMs / group DMs / private channels are refused
  // before any content is read. The admin trigger IS the consent record
  // (CONNECTOR_DATA_READ audit + the ingest's own audit trail).
  app.post<{ Body: { channel_id?: unknown; message_ts?: unknown } }>(
    "/api/v1/slack/messages/ingest",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const bearer = bearerFrom(request.headers.authorization);
      if (bearer === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const channelId =
        typeof request.body?.channel_id === "string" && request.body.channel_id.length > 0
          ? request.body.channel_id
          : null;
      const messageTs =
        typeof request.body?.message_ts === "string" && isValidSlackMessageTs(request.body.message_ts)
          ? request.body.message_ts
          : null;
      if (channelId === null || messageTs === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "channel_id and message_ts (Slack ts format) are required",
        });
      }
      // Policy fence BEFORE any provider call: DMs and group DMs are parked
      // in this slice (the definitive public-only check runs server-side in
      // fetchSlackMessageForOrg via conversations.info).
      if (!slackChannelIdAllowed(channelId)) {
        return reply.code(422).send({
          ok: false,
          code: "CHANNEL_NOT_ALLOWED",
          message: "Only public channels are supported. Direct messages are not ingested.",
        });
      }
      const orgEntityId = await resolveOrgOrFail(request.auth!.entity_id, reply);
      if (orgEntityId === null) return;
      const fetched = await fetchSlackMessageForOrg({
        actor_entity_id: request.auth!.entity_id,
        org_entity_id: orgEntityId,
        channel_id: channelId,
        message_ts: messageTs,
      });
      if (fetched.ok === false) {
        const status =
          fetched.code === "NOT_FOUND" ? 404
          : fetched.code === "NOT_CONFIGURED" || fetched.code === "AUTH"
            || fetched.code === "SCOPE_REAUTH_REQUIRED" || fetched.code === "NOT_IN_CHANNEL" ? 409
          : fetched.code === "CHANNEL_NOT_ALLOWED" || fetched.code === "MESSAGE_TOO_LARGE" ? 422
          : 502;
        return reply.code(status).send({ ok: false, code: fetched.code });
      }
      // Canonical provenance: a CONNECTOR source with the real Slack author
      // as actor (handle→entity resolution is the spine's NEEDS_OWNER path)
      // and the workspace-scoped dedupe key so the same message can never
      // double-ingest within the org while two orgs' workspaces never collide.
      const slackEvent = slackMessageToSourceEvent(
        {
          ts: fetched.message.ts,
          text: fetched.message.text,
          user: fetched.message.author_handle,
          user_name: fetched.message.author_name,
          channel_id: channelId,
          channel_name: fetched.channel_name,
          team_id: fetched.team_id,
          thread_ts: fetched.message.thread_ts,
        },
        request.auth!.entity_id,
      );
      const result = await otzarService.ingestSourceEvent({
        token: bearer,
        source: {
          sourceType: slackEvent.sourceType,
          sourceSystem: slackEvent.sourceSystem,
          sourceId: slackEvent.sourceId,
          sourceUrl: null,
          actor: {
            name: slackEvent.actor.name,
            ...(slackEvent.actor.handle ? { handle: slackEvent.actor.handle } : {}),
          },
          timestamp: slackEvent.timestamp,
          title: slackEvent.title ?? null,
          content: slackEvent.content,
          connectorIdentity: slackEvent.connectorIdentity ?? null,
          dedupeKey: slackEvent.dedupeKey ?? null,
        },
      });
      if (!result.ok) {
        if (result.code === "ALREADY_INGESTED") {
          // Honest idempotency: the same Slack message was ingested before —
          // no duplicate work was created.
          return reply.code(409).send(result);
        }
        return reply.code(502).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // ── Google Calendar free/busy (read-only) ──
  app.post<{
    Body: { time_min?: unknown; time_max?: unknown; calendar_id?: unknown };
  }>("/api/v1/calendar/freebusy", async (request, reply) => {
    const token = bearerFrom(request.headers.authorization);
    if (token === null)
      return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
    const session = await authService.validateSession(token, "read");
    if (!session.valid)
      return reply.code(401).send({ ok: false, code: session.code });

    const body = request.body ?? {};
    if (typeof body.time_min !== "string" || typeof body.time_max !== "string") {
      return reply.code(422).send({
        ok: false,
        code: "INVALID_REQUEST",
        message: "time_min and time_max (RFC3339) are required",
      });
    }

    const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
    if (orgEntityId === null) return;

    const result = await getCalendarFreeBusyForOrg({
      actor_entity_id: session.entity_id,
      org_entity_id: orgEntityId,
      time_min: body.time_min,
      time_max: body.time_max,
      ...(typeof body.calendar_id === "string"
        ? { calendar_id: body.calendar_id }
        : {}),
    });
    if (result.ok === false)
      return reply.code(statusForCode(result.code)).send(result);
    return reply.code(200).send(result);
  });

  // ── [GOOGLE-DOCS] Selected-doc discovery + import (read-only Drive) ──
  // GET /api/v1/drive/docs — SAFE metadata list so an admin can pick ONE
  // document. Never content, never export URLs, never an auto-sync.
  app.get<{ Querystring: { page_size?: string; name_query?: string } }>(
    "/api/v1/drive/docs",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;
      const q = request.query ?? {};
      const pageSize =
        typeof q.page_size === "string" ? Number.parseInt(q.page_size, 10) : NaN;
      const result = await listGoogleDocsForOrg({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        ...(Number.isFinite(pageSize) ? { page_size: pageSize } : {}),
        ...(typeof q.name_query === "string" ? { name_query: q.name_query } : {}),
      });
      if (result.ok === false)
        return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /api/v1/drive/docs/ingest — an ADMIN picks ONE Google Doc; the
  // text is exported server-side (org OAuth envelope; nothing tokenized
  // reaches the client) and lands on the DOCUMENT_CONTEXT reference rail
  // with full lineage (file id / modified time / view link / content
  // hash). Same-content re-import refuses ALREADY_IMPORTED; changed
  // content imports as a fresh dated row (supersession candidate). The
  // admin trigger IS the consent record. No work extraction runs — the
  // v1 document contract is preserved.
  app.post<{
    Body: {
      file_id?: unknown;
      source_kind?: unknown;
      currentness?: unknown;
    };
  }>(
    "/api/v1/drive/docs/ingest",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const fileId =
        typeof request.body?.file_id === "string" && request.body.file_id.length > 0
          ? request.body.file_id
          : null;
      if (fileId === null) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "file_id is required" });
      }
      const kindRaw = request.body?.source_kind;
      const kind =
        typeof kindRaw === "string" &&
        (DOCUMENT_SOURCE_KINDS as readonly string[]).includes(kindRaw)
          ? (kindRaw as DocumentSourceKind)
          : undefined;
      const curRaw = request.body?.currentness;
      const currentness =
        typeof curRaw === "string" &&
        (DOCUMENT_CURRENTNESS as readonly string[]).includes(curRaw)
          ? (curRaw as DocumentCurrentness)
          : undefined;
      const orgEntityId = await resolveOrgOrFail(request.auth!.entity_id, reply);
      if (orgEntityId === null) return;
      const fetched = await fetchGoogleDocTextForOrg({
        actor_entity_id: request.auth!.entity_id,
        org_entity_id: orgEntityId,
        file_id: fileId,
      });
      if (fetched.ok === false) {
        const status =
          fetched.code === "NOT_FOUND" ? 404
          : fetched.code === "DOC_TOO_LARGE" ? 422
          : fetched.code === "INVALID_REQUEST" ? 422
          // [SOURCE-INTEGRITY] quarantined content — honest 422, no row created.
          : fetched.code === "SOURCE_EMPTY" || fetched.code === "SOURCE_UNREADABLE" ? 422
          : statusForCode(fetched.code);
        return reply.code(status).send({ ok: false, code: fetched.code });
      }
      const result = await importGoogleDocForCaller(request.auth!.entity_id, {
        file_id: fetched.file_id,
        name: fetched.name,
        text: fetched.text,
        modified_time: fetched.modified_time,
        web_view_link: fetched.web_view_link,
        content_sha256: fetched.content_sha256,
        ...(kind !== undefined ? { source_kind: kind } : {}),
        ...(currentness !== undefined ? { currentness } : {}),
      });
      if (result.ok === false) {
        const status = result.code === "ALREADY_IMPORTED" ? 409 : 422;
        return reply.code(status).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST /api/v1/drive/docs/:ledger_entry_id/revalidate — an ADMIN
  // re-checks ONE imported Google-Doc DOCUMENT_CONTEXT row against its upstream.
  // SNAPSHOT-PRESERVING: the stored body + import hash are never overwritten; a
  // changed/revoked/deleted/corrupt upstream DEMOTES the row out of active
  // retrieval via details.source_integrity.state (never via ledger status). The
  // admin trigger IS the consent record. Same admin gate as the import route.
  app.post<{ Params: { ledger_entry_id: string } }>(
    "/api/v1/drive/docs/:ledger_entry_id/revalidate",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const ledgerEntryId = request.params.ledger_entry_id;
      if (typeof ledgerEntryId !== "string" || ledgerEntryId.length === 0) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "ledger_entry_id is required" });
      }
      const result = await revalidateImportedDocForCaller(request.auth!.entity_id, ledgerEntryId);
      if (result.ok === false) {
        const status =
          result.code === "NO_ORG_FOR_CALLER" ? 404
          : result.code === "NOT_FOUND" ? 404
          : result.code === "NOT_A_SOURCE_DOC" ? 422
          : 502; // REVALIDATION_UNAVAILABLE — upstream could not be reached
        return reply.code(status).send(result);
      }
      return reply.code(200).send(result);
    },
  );

  // POST /api/v1/drive/docs/health-sweep — an ADMIN triggers ONE bounded
  // re-verification pass over the org's most-recent ALREADY-IMPORTED Google-Doc
  // rows (cap 50). Each row is re-checked with the SAME snapshot-preserving
  // probe as the single-doc revalidate route; a demoted source (changed /
  // revoked / deleted / corrupt) emits ONE calm SOURCE_HEALTH_CHANGED
  // notification to the triggering admin. NEVER lists or syncs Drive — it only
  // re-probes rows already imported. Same admin gate as the revalidate route.
  app.post(
    "/api/v1/drive/docs/health-sweep",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const result = await sourceHealthSweepForCaller(request.auth!.entity_id);
      if (result.ok === false) {
        // NO_ORG_FOR_CALLER — the caller is not in an organization.
        return reply.code(404).send(result);
      }
      return reply.code(200).send({ ok: true, ...result.summary });
    },
  );

  // ── [INBOUND-RECHECK · Slice 1] POST /drive/docs/recheck-run — ops "run now"
  // trigger for the scheduled per-org source recheck, scoped to the caller's OWN
  // org (the admin acts as the actor for their own org only — it can NEVER target
  // another org). Runs the SAME tick the daily cron runs (transition-gated audit
  // + notification), so unchanged sources are quiet (no SOURCE_VERIFIED audit).
  // Admin-gated; lets an operator verify config/behavior without waiting a day.
  app.post(
    "/api/v1/drive/docs/recheck-run",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const callerId = request.auth!.entity_id;
      let orgEntityId: string;
      try {
        orgEntityId = await getOrgEntityId(callerId);
      } catch {
        return reply.code(404).send({
          ok: false,
          code: "NO_ORG_FOR_CALLER",
          message: "No organization found for the caller.",
        });
      }
      const result = await tickSourceRecheck([
        { orgEntityId, actorEntityId: callerId },
      ]);
      return reply.code(200).send({ ok: true, ...result });
    },
  );

  // ── [GOOGLE-MEET] Post-meeting records + transcript import ──
  // GET /api/v1/meet/conference-records — post-meeting selection surface.
  // The Meet API is post-meeting and permission-dependent; this never is
  // (or claims to be) real-time.
  app.get<{ Querystring: { page_size?: string } }>(
    "/api/v1/meet/conference-records",
    async (request, reply) => {
      const token = bearerFrom(request.headers.authorization);
      if (token === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const session = await authService.validateSession(token, "read");
      if (!session.valid)
        return reply.code(401).send({ ok: false, code: session.code });
      const orgEntityId = await resolveOrgOrFail(session.entity_id, reply);
      if (orgEntityId === null) return;
      const q = request.query ?? {};
      const pageSize =
        typeof q.page_size === "string" ? Number.parseInt(q.page_size, 10) : NaN;
      const result = await listMeetConferenceRecordsForOrg({
        actor_entity_id: session.entity_id,
        org_entity_id: orgEntityId,
        ...(Number.isFinite(pageSize) ? { page_size: pageSize } : {}),
      });
      if (result.ok === false)
        return reply.code(statusForCode(result.code)).send(result);
      return reply.code(200).send(result);
    },
  );

  // POST /api/v1/meet/transcripts/ingest — an ADMIN picks ONE conference
  // record; the Meet-API transcript entries are fetched server-side,
  // flattened to speaker-attributed lines, and fed to the EXISTING comms
  // spine via the canonical adapter (sourceId GOOGLE_MEET:<record_id> —
  // idempotent, and lineage-distinct from a Docs transcript file or a
  // manual paste). NO_TRANSCRIPT is an honest answer, never fabricated.
  app.post<{ Body: { record_id?: unknown } }>(
    "/api/v1/meet/transcripts/ingest",
    { preHandler: requireAdminCapability(authService, "can_admin_org") },
    async (request, reply) => {
      const bearer = bearerFrom(request.headers.authorization);
      if (bearer === null)
        return reply.code(401).send({ ok: false, code: "SESSION_INVALID" });
      const recordId =
        typeof request.body?.record_id === "string" && request.body.record_id.length > 0
          ? request.body.record_id
          : null;
      if (recordId === null) {
        return reply.code(422).send({ ok: false, code: "INVALID_REQUEST", message: "record_id is required" });
      }
      const orgEntityId = await resolveOrgOrFail(request.auth!.entity_id, reply);
      if (orgEntityId === null) return;
      const fetched = await fetchMeetTranscriptForOrg({
        actor_entity_id: request.auth!.entity_id,
        org_entity_id: orgEntityId,
        record_id: recordId,
      });
      if (fetched.ok === false) {
        const status =
          fetched.code === "NOT_FOUND" || fetched.code === "NO_TRANSCRIPT" ? 404
          : fetched.code === "TRANSCRIPT_TOO_LARGE" ? 422
          : fetched.code === "INVALID_REQUEST" ? 422
          : statusForCode(fetched.code);
        return reply.code(status).send({ ok: false, code: fetched.code });
      }
      const meetEvent = googleMeetTranscriptToSourceEvent({
        recordId,
        meetingLabel:
          fetched.start_time.length > 0
            ? `meeting of ${fetched.start_time.slice(0, 10)}`
            : recordId,
        transcript: fetched.transcript,
        callerEntityId: request.auth!.entity_id,
        callerName: "Google Meet transcript import",
        orgEntityId,
        startTimeIso: fetched.start_time,
        nowIso: new Date().toISOString(),
      });
      const result = await otzarService.ingestSourceEvent({
        token: bearer,
        source: {
          sourceType: meetEvent.sourceType,
          sourceSystem: meetEvent.sourceSystem,
          sourceId: meetEvent.sourceId,
          sourceUrl: null,
          actor: { name: meetEvent.actor.name },
          timestamp: meetEvent.timestamp,
          title: meetEvent.title,
          content: meetEvent.content,
        },
      });
      if (!result.ok) {
        if (result.code === "ALREADY_INGESTED") {
          return reply.code(409).send(result);
        }
        return reply.code(502).send(result);
      }
      return reply.code(200).send(result);
    },
  );
}
