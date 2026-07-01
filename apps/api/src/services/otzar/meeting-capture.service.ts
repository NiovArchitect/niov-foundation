// FILE: meeting-capture.service.ts
// PURPOSE: Phase 1222 — provider-agnostic MeetingCapture substrate.
//          Accepts captures from Google Meet / Zoom / Teams /
//          manual transcript upload / API ingest, with per-
//          participant consent enforcement. When a workspace is
//          named the capture is also linked + a CommsImport hand-
//          off becomes a single follow-on call.
//
// GOVERNANCE (RULE 0):
//   - Participant consent is per-participant. Captures with any
//     NOT_CONSENTED row land as BLOCKED_PARTICIPANT_CONSENT.
//   - Transcripts are bounded; raw transcript text never enters
//     audit details (RULE 4).
//   - External participants (not in org_roster) are recorded as
//     EXTERNAL_TRACKED — they do not auto-receive Otzar access.
//
// REAL-PROVIDER WIRING (Phase 1224+):
//   - Google Meet recordings post-meeting via Drive API; OAuth
//     binding via ConnectorScopeGrant + ConnectorBinding.
//   - Zoom Cloud Recording API; OAuth binding similar.
//   - Microsoft Teams via Graph API.
//   - Bot-mode live capture (in-meeting transcript) is a future
//     extension; the substrate accepts streamed transcript chunks
//     via API_INGEST today.

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import type {
  MeetingCaptureProvider,
  MeetingCaptureStatus,
  MeetingParticipantConsentState,
} from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";
import { importCommsOutputForWorkspaceForCaller } from "./collaboration-workspace.service.js";

const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const TRANSCRIPT_MAX = 50_000; // bounded; chunked ingest sums to this.
const NAME_MAX = 200;
const EMAIL_MAX = 320;

function bound(value: string, max: number): string {
  return value.slice(0, max);
}

export interface MeetingCaptureSafeView {
  meeting_capture_id: string;
  provider: MeetingCaptureProvider;
  provider_meeting_id: string | null;
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  recorded_start: string | null;
  recorded_end: string | null;
  participant_count: number;
  status: MeetingCaptureStatus;
  workspace_id: string | null;
  source_conversation_id: string | null;
  summary: string | null;
  // transcript intentionally NOT in safe view — caller-owned access only.
  has_transcript: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParticipantConsentView {
  meeting_participant_consent_id: string;
  display_name: string;
  email: string | null;
  participant_entity_id: string | null;
  external_collaborator_id: string | null;
  consent_state: MeetingParticipantConsentState;
  consent_source: string | null;
  consent_recorded_at: string | null;
}

function projectCapture(row: {
  meeting_capture_id: string;
  provider: MeetingCaptureProvider;
  provider_meeting_id: string | null;
  title: string;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  recorded_start: Date | null;
  recorded_end: Date | null;
  participant_count: number;
  status: MeetingCaptureStatus;
  workspace_id: string | null;
  source_conversation_id: string | null;
  summary: string | null;
  transcript: string | null;
  created_at: Date;
  updated_at: Date;
}): MeetingCaptureSafeView {
  return {
    meeting_capture_id: row.meeting_capture_id,
    provider: row.provider,
    provider_meeting_id: row.provider_meeting_id,
    title: row.title,
    scheduled_start: row.scheduled_start?.toISOString() ?? null,
    scheduled_end: row.scheduled_end?.toISOString() ?? null,
    recorded_start: row.recorded_start?.toISOString() ?? null,
    recorded_end: row.recorded_end?.toISOString() ?? null,
    participant_count: row.participant_count,
    status: row.status,
    workspace_id: row.workspace_id,
    source_conversation_id: row.source_conversation_id,
    summary: row.summary,
    has_transcript: row.transcript !== null && row.transcript.length > 0,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// ─── service: receive meeting capture ─────────────────────────

export interface ReceiveCaptureInput {
  callerEntityId: string;
  provider?: MeetingCaptureProvider;
  providerMeetingId?: string;
  title: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  recordedStart?: string;
  recordedEnd?: string;
  summary?: string;
  transcript?: string;
  participants: Array<{
    display_name: string;
    email?: string;
    participant_entity_id?: string;
    external_collaborator_id?: string;
    consent_state?: MeetingParticipantConsentState;
    consent_source?: string;
  }>;
  workspaceId?: string;
}

export type ReceiveCaptureResult =
  | {
      ok: true;
      httpStatus: 201;
      meeting_capture: MeetingCaptureSafeView;
      participants: ParticipantConsentView[];
    }
  | {
      ok: false;
      httpStatus: 400 | 403 | 404 | 422;
      code: string;
      message?: string;
    };

export async function receiveMeetingCaptureForCaller(
  input: ReceiveCaptureInput,
): Promise<ReceiveCaptureResult> {
  if (input.title.trim().length === 0) {
    return { ok: false, httpStatus: 422, code: "TITLE_REQUIRED" };
  }
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, httpStatus: 404, code: "NO_ORG_FOR_CALLER" };
  }
  if (input.workspaceId !== undefined) {
    const ws = await prisma.collaborationWorkspace.findFirst({
      where: {
        workspace_id: input.workspaceId,
        org_entity_id: orgEntityId,
        deleted_at: null,
      },
    });
    if (ws === null) {
      return { ok: false, httpStatus: 404, code: "WORKSPACE_NOT_FOUND" };
    }
    const membership = await prisma.collaborationMembership.findFirst({
      where: {
        workspace_id: input.workspaceId,
        member_entity_id: input.callerEntityId,
        status: "ACTIVE",
        deleted_at: null,
      },
    });
    if (membership === null) {
      return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
    }
  }

  const provider = input.provider ?? "MANUAL_UPLOAD";
  const summary =
    input.summary === undefined || input.summary.trim().length === 0
      ? null
      : bound(input.summary.trim(), SUMMARY_MAX);
  const transcript =
    input.transcript === undefined || input.transcript.trim().length === 0
      ? null
      : bound(input.transcript.trim(), TRANSCRIPT_MAX);

  // Materialize the capture first; participants in a second pass
  // because the FK references the capture.
  const capture = await prisma.meetingCapture.create({
    data: {
      org_entity_id: orgEntityId,
      provider,
      provider_meeting_id: input.providerMeetingId ?? null,
      title: bound(input.title.trim(), TITLE_MAX),
      scheduled_start: input.scheduledStart
        ? new Date(input.scheduledStart)
        : null,
      scheduled_end: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
      recorded_start: input.recordedStart
        ? new Date(input.recordedStart)
        : null,
      recorded_end: input.recordedEnd ? new Date(input.recordedEnd) : null,
      participant_count: input.participants.length,
      status: "PENDING",
      workspace_id: input.workspaceId ?? null,
      summary,
      transcript,
      captured_by_entity_id: input.callerEntityId,
    },
  });

  const consentRows: ParticipantConsentView[] = [];
  let blocked = false;
  for (const p of input.participants) {
    if (p.display_name.trim().length === 0) continue;
    const row = await prisma.meetingParticipantConsent.create({
      data: {
        meeting_capture_id: capture.meeting_capture_id,
        org_entity_id: orgEntityId,
        participant_entity_id: p.participant_entity_id ?? null,
        external_collaborator_id: p.external_collaborator_id ?? null,
        display_name: bound(p.display_name.trim(), NAME_MAX),
        email:
          p.email === undefined || p.email.trim().length === 0
            ? null
            : bound(p.email.trim(), EMAIL_MAX),
        consent_state: p.consent_state ?? "PENDING",
        consent_source: p.consent_source ?? null,
        consent_recorded_at:
          p.consent_state === "CONSENTED" || p.consent_state === "NOT_CONSENTED"
            ? new Date()
            : null,
      },
    });
    consentRows.push({
      meeting_participant_consent_id: row.meeting_participant_consent_id,
      display_name: row.display_name,
      email: row.email,
      participant_entity_id: row.participant_entity_id,
      external_collaborator_id: row.external_collaborator_id,
      consent_state: row.consent_state,
      consent_source: row.consent_source,
      consent_recorded_at: row.consent_recorded_at?.toISOString() ?? null,
    });
    if (row.consent_state === "NOT_CONSENTED") blocked = true;
    await writeAuditEvent({
      event_type: "MEETING_CAPTURE_PARTICIPANT_CONSENT_RECORDED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      details: {
        meeting_capture_id: capture.meeting_capture_id,
        consent_state: row.consent_state,
      },
    });
  }

  // Status reconciliation: PROCESSED if all CONSENTED or
  // EXTERNAL_TRACKED; BLOCKED_PARTICIPANT_CONSENT if any
  // NOT_CONSENTED; PENDING otherwise.
  let finalStatus: MeetingCaptureStatus = "PENDING";
  if (blocked) {
    finalStatus = "BLOCKED_PARTICIPANT_CONSENT";
  } else if (
    consentRows.length > 0 &&
    consentRows.every(
      (c) =>
        c.consent_state === "CONSENTED" ||
        c.consent_state === "EXTERNAL_TRACKED",
    )
  ) {
    finalStatus = "PROCESSED";
  }
  const updated = await prisma.meetingCapture.update({
    where: { meeting_capture_id: capture.meeting_capture_id },
    data: { status: finalStatus },
  });

  await writeAuditEvent({
    event_type: "MEETING_CAPTURE_RECEIVED",
    outcome: blocked ? "DENIED" : "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      meeting_capture_id: capture.meeting_capture_id,
      provider,
      participant_count: consentRows.length,
      status: finalStatus,
      ...(input.workspaceId !== undefined
        ? { workspace_id: input.workspaceId }
        : {}),
    },
  });

  if (blocked) {
    await writeAuditEvent({
      event_type: "MEETING_CAPTURE_BLOCKED_CONSENT",
      outcome: "DENIED",
      actor_entity_id: input.callerEntityId,
      details: { meeting_capture_id: capture.meeting_capture_id },
    });
  } else if (finalStatus === "PROCESSED") {
    await writeAuditEvent({
      event_type: "MEETING_CAPTURE_PROCESSED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      details: { meeting_capture_id: capture.meeting_capture_id },
    });
  }

  return {
    ok: true,
    httpStatus: 201,
    meeting_capture: projectCapture(updated),
    participants: consentRows,
  };
}

// ─── service: attach a processed capture to a workspace ─────

export interface AttachCaptureInput {
  meetingCaptureId: string;
  workspaceId: string;
  callerEntityId: string;
  decisions?: ReadonlyArray<string>;
  commitments?: ReadonlyArray<{ text: string; source_excerpt: string }>;
}

export type AttachCaptureResult =
  | { ok: true; httpStatus: 200; meeting_capture: MeetingCaptureSafeView }
  | {
      ok: false;
      httpStatus: 403 | 404 | 409 | 422;
      code: string;
      message?: string;
    };

/**
 * Slice A — dedupe/idempotency anchor for source-agnostic intake. A connector
 * source event carries a stable external id (stored as `provider_meeting_id`);
 * if a capture already exists for (org, external id) we can skip re-ingesting so
 * the SAME source event never mints duplicate work. NOTE: `provider_meeting_id`
 * has no DB unique constraint, so this is a sequential (check-then-insert) guard
 * — it dedupes re-POSTs but does not harden against concurrent duplicates.
 * Transcript captures never set `provider_meeting_id`, so they are never matched.
 */
export async function findCaptureByExternalId(
  orgEntityId: string,
  externalId: string,
): Promise<{ meeting_capture_id: string } | null> {
  if (externalId.trim().length === 0) return null;
  const row = await prisma.meetingCapture.findFirst({
    where: { org_entity_id: orgEntityId, provider_meeting_id: externalId },
    select: { meeting_capture_id: true },
    orderBy: { created_at: "desc" },
  });
  return row ? { meeting_capture_id: row.meeting_capture_id } : null;
}

export async function attachCaptureToWorkspaceForCaller(
  input: AttachCaptureInput,
): Promise<AttachCaptureResult> {
  const capture = await prisma.meetingCapture.findFirst({
    where: {
      meeting_capture_id: input.meetingCaptureId,
      deleted_at: null,
    },
  });
  if (capture === null) {
    return { ok: false, httpStatus: 404, code: "MEETING_CAPTURE_NOT_FOUND" };
  }
  if (capture.status === "BLOCKED_PARTICIPANT_CONSENT") {
    return {
      ok: false,
      httpStatus: 422,
      code: "BLOCKED_PARTICIPANT_CONSENT",
      message:
        "This meeting cannot be attached — one or more participants did not consent.",
    };
  }
  const membership = await prisma.collaborationMembership.findFirst({
    where: {
      workspace_id: input.workspaceId,
      member_entity_id: input.callerEntityId,
      status: "ACTIVE",
      deleted_at: null,
    },
  });
  if (membership === null) {
    return { ok: false, httpStatus: 403, code: "NOT_WORKSPACE_MEMBER" };
  }
  if (capture.workspace_id !== null && capture.workspace_id !== input.workspaceId) {
    return { ok: false, httpStatus: 409, code: "ALREADY_ATTACHED_ELSEWHERE" };
  }
  const updated = await prisma.meetingCapture.update({
    where: { meeting_capture_id: capture.meeting_capture_id },
    data: {
      workspace_id: input.workspaceId,
      status: "ATTACHED_TO_WORKSPACE",
    },
  });
  await writeAuditEvent({
    event_type: "MEETING_CAPTURE_ATTACHED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      meeting_capture_id: capture.meeting_capture_id,
      workspace_id: input.workspaceId,
    },
  });
  // Optional: forward decisions + commitments into the workspace
  // via the existing importCommsOutput pipeline.
  if (
    input.decisions !== undefined &&
    input.decisions.length > 0 &&
    input.commitments !== undefined &&
    input.commitments.length > 0
  ) {
    await importCommsOutputForWorkspaceForCaller({
      workspaceId: input.workspaceId,
      callerEntityId: input.callerEntityId,
      ...(capture.summary !== null ? { summary: capture.summary } : {}),
      decisions: input.decisions,
      commitments: input.commitments.map((c) => ({
        text: c.text,
        source_excerpt: c.source_excerpt,
      })),
    });
  }
  return { ok: true, httpStatus: 200, meeting_capture: projectCapture(updated) };
}

// ─── service: list captures the caller can see ──────────────

export async function listMeetingCapturesForCaller(
  callerEntityId: string,
  workspaceId?: string,
): Promise<MeetingCaptureSafeView[]> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return [];
  }
  const rows = await prisma.meetingCapture.findMany({
    where: {
      org_entity_id: orgEntityId,
      deleted_at: null,
      ...(workspaceId !== undefined ? { workspace_id: workspaceId } : {}),
    },
    orderBy: { created_at: "desc" },
  });
  // Filter to captures the caller is allowed to see:
  //   - captures they originated, OR
  //   - captures linked to a workspace where they are a member.
  const visible: typeof rows = [];
  for (const r of rows) {
    if (r.captured_by_entity_id === callerEntityId) {
      visible.push(r);
      continue;
    }
    if (r.workspace_id !== null) {
      const m = await prisma.collaborationMembership.findFirst({
        where: {
          workspace_id: r.workspace_id,
          member_entity_id: callerEntityId,
          status: "ACTIVE",
          deleted_at: null,
        },
        select: { membership_id: true },
      });
      if (m !== null) visible.push(r);
    }
  }
  return visible.map(projectCapture);
}

// ─── service: capture detail ────────────────────────────────

export type GetCaptureDetailResult =
  | {
      ok: true;
      httpStatus: 200;
      meeting_capture: MeetingCaptureSafeView;
      participants: ParticipantConsentView[];
    }
  | { ok: false; httpStatus: 403 | 404; code: string };

// Shared caller-scoped access gate for a meeting capture: the caller must have
// captured it OR be an ACTIVE member of the linked workspace. Everyone else (a
// non-participant, a cross-org caller) gets NOT_FOUND / NOT_ALLOWED and never sees
// any capture content. Used by both the detail read and the transcript read so the
// permission logic lives in exactly one place.
type LoadCaptureGate =
  | { ok: true; capture: NonNullable<Awaited<ReturnType<typeof prisma.meetingCapture.findFirst>>> }
  | { ok: false; httpStatus: 403 | 404; code: string };

async function loadCaptureForCaller(
  meetingCaptureId: string,
  callerEntityId: string,
): Promise<LoadCaptureGate> {
  const capture = await prisma.meetingCapture.findFirst({
    where: { meeting_capture_id: meetingCaptureId, deleted_at: null },
  });
  if (capture === null) {
    return { ok: false, httpStatus: 404, code: "MEETING_CAPTURE_NOT_FOUND" };
  }
  let allowed = capture.captured_by_entity_id === callerEntityId;
  if (!allowed && capture.workspace_id !== null) {
    const m = await prisma.collaborationMembership.findFirst({
      where: {
        workspace_id: capture.workspace_id,
        member_entity_id: callerEntityId,
        status: "ACTIVE",
        deleted_at: null,
      },
      select: { membership_id: true },
    });
    if (m !== null) allowed = true;
  }
  if (!allowed) {
    return { ok: false, httpStatus: 403, code: "NOT_ALLOWED" };
  }
  return { ok: true, capture };
}

export async function getMeetingCaptureDetailForCaller(
  meetingCaptureId: string,
  callerEntityId: string,
): Promise<GetCaptureDetailResult> {
  const gate = await loadCaptureForCaller(meetingCaptureId, callerEntityId);
  if (gate.ok === false) return gate;
  const capture = gate.capture;
  const consents = await prisma.meetingParticipantConsent.findMany({
    where: { meeting_capture_id: capture.meeting_capture_id, deleted_at: null },
    orderBy: { created_at: "asc" },
  });
  return {
    ok: true,
    httpStatus: 200,
    meeting_capture: projectCapture(capture),
    participants: consents.map((c) => ({
      meeting_participant_consent_id: c.meeting_participant_consent_id,
      display_name: c.display_name,
      email: c.email,
      participant_entity_id: c.participant_entity_id,
      external_collaborator_id: c.external_collaborator_id,
      consent_state: c.consent_state,
      consent_source: c.consent_source,
      consent_recorded_at: c.consent_recorded_at?.toISOString() ?? null,
    })),
  };
}

// ─── service: read the original transcript / source (caller-scoped) ──────────
export type GetCaptureTranscriptResult =
  | {
      ok: true;
      httpStatus: 200;
      meeting_capture_id: string;
      title: string;
      transcript: string | null;
      has_transcript: boolean;
    }
  | { ok: false; httpStatus: 403 | 404; code: string };

// PROD-UX-P0C: reopen a saved conversation's ORIGINAL transcript/source text. The
// transcript is stored bounded on the capture and deliberately kept out of the safe
// list/detail projections — this is the ONLY surface that returns it, and only to a
// caller who passes the same access gate (captured-by OR active workspace member).
// A non-participant / cross-org caller gets NOT_FOUND / NOT_ALLOWED, never the text.
export async function getMeetingCaptureTranscriptForCaller(
  meetingCaptureId: string,
  callerEntityId: string,
): Promise<GetCaptureTranscriptResult> {
  const gate = await loadCaptureForCaller(meetingCaptureId, callerEntityId);
  if (gate.ok === false) return gate;
  const capture = gate.capture;
  const transcript =
    typeof capture.transcript === "string" && capture.transcript.length > 0
      ? capture.transcript
      : null;
  return {
    ok: true,
    httpStatus: 200,
    meeting_capture_id: capture.meeting_capture_id,
    title: capture.title,
    transcript,
    has_transcript: transcript !== null,
  };
}

// ─── service: update participant consent state ──────────────

export type UpdateConsentResult =
  | { ok: true; httpStatus: 200; participant: ParticipantConsentView }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function updateParticipantConsentForCaller(input: {
  meetingParticipantConsentId: string;
  callerEntityId: string;
  consentState: MeetingParticipantConsentState;
  consentSource?: string;
}): Promise<UpdateConsentResult> {
  const row = await prisma.meetingParticipantConsent.findFirst({
    where: {
      meeting_participant_consent_id: input.meetingParticipantConsentId,
      deleted_at: null,
    },
    include: { meeting_capture: true },
  });
  if (row === null) {
    return { ok: false, httpStatus: 404, code: "PARTICIPANT_NOT_FOUND" };
  }
  // Permission: caller must be either the original capturer or the
  // participant themselves.
  if (
    row.meeting_capture.captured_by_entity_id !== input.callerEntityId &&
    row.participant_entity_id !== input.callerEntityId
  ) {
    return { ok: false, httpStatus: 403, code: "NOT_ALLOWED" };
  }
  const updated = await prisma.meetingParticipantConsent.update({
    where: {
      meeting_participant_consent_id: input.meetingParticipantConsentId,
    },
    data: {
      consent_state: input.consentState,
      consent_source: input.consentSource ?? row.consent_source,
      consent_recorded_at: new Date(),
    },
  });
  await writeAuditEvent({
    event_type: "MEETING_CAPTURE_PARTICIPANT_CONSENT_RECORDED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      meeting_capture_id: row.meeting_capture_id,
      consent_state: input.consentState,
    },
  });
  return {
    ok: true,
    httpStatus: 200,
    participant: {
      meeting_participant_consent_id: updated.meeting_participant_consent_id,
      display_name: updated.display_name,
      email: updated.email,
      participant_entity_id: updated.participant_entity_id,
      external_collaborator_id: updated.external_collaborator_id,
      consent_state: updated.consent_state,
      consent_source: updated.consent_source,
      consent_recorded_at: updated.consent_recorded_at?.toISOString() ?? null,
    },
  };
}
