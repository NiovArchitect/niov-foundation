// FILE: voice-capture.service.ts
// PURPOSE: Phase 1223 — voice/STT capture orchestrator. Receives
//          an audio submission (live mic stream pre-transcribed
//          by the browser / uploaded file / demo fixture replay),
//          runs the chosen STT provider, persists segments +
//          aggregate transcript, and optionally hands off to
//          MeetingCapture (Phase 1222) so the existing comms-
//          extract → resolver → workspace import pipeline kicks
//          in automatically.
//
// PRIVACY (RULE 0):
//   - Audio bytes are NEVER stored in the DB row; storage_ref is
//     a synthetic pointer (demo:* / browser:* / upload:*).
//   - Transcripts are scoped to the capturer's wallet by default.
//   - Sharing into a workspace goes through the existing
//     MeetingCapture → CollaborationSharedContext flow.
//   - Audit details NEVER include the full_transcript text;
//     only segment_count + status (RULE 4).
//
// CONNECTS TO:
//   - stt-provider.ts (adapter interface + 4 concrete adapters)
//   - meeting-capture.service.ts (optional handoff to Phase 1222)
//   - apps/api/src/services/governance/org.ts (getOrgEntityId)

import { writeAuditEvent } from "@niov/database";
import { prisma } from "@niov/database";
import type {
  AudioCaptureMode,
  AudioCaptureStatus,
  STTProviderType as PrismaSTTProviderType,
  STTProviderStatus as PrismaSTTProviderStatus,
} from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";
import {
  getSTTProvider,
  listSTTProviderStatuses,
  type STTProvider,
  type STTProviderType,
  type STTSegment,
  type STTProviderStatusRow,
} from "./stt-provider.js";
import { receiveMeetingCaptureForCaller } from "../otzar/meeting-capture.service.js";

const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const TRANSCRIPT_TOTAL_MAX = 50_000;
const SEGMENT_TEXT_MAX = 2000;
const SPEAKER_MAX = 100;

function bound(value: string, max: number): string {
  return value.slice(0, max);
}

export interface AudioCaptureSafeView {
  audio_capture_id: string;
  provider: STTProviderType;
  provider_status_at_start: PrismaSTTProviderStatus;
  mode: AudioCaptureMode;
  status: AudioCaptureStatus;
  title: string | null;
  summary: string | null;
  duration_ms: number | null;
  meeting_capture_id: string | null;
  workspace_id: string | null;
  segment_count: number;
  // full_transcript is intentionally INCLUDED in the safe view for
  // the capturer to read back; sharing into a workspace happens
  // through the workspace import flow, NEVER by leaking this view
  // cross-wallet.
  full_transcript: string | null;
  failure_class: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegmentSafeView {
  transcript_segment_id: string;
  speaker_label: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  is_final: boolean;
}

function projectCapture(row: {
  audio_capture_id: string;
  provider: PrismaSTTProviderType;
  provider_status_at_start: PrismaSTTProviderStatus;
  mode: AudioCaptureMode;
  status: AudioCaptureStatus;
  title: string | null;
  summary: string | null;
  duration_ms: number | null;
  meeting_capture_id: string | null;
  workspace_id: string | null;
  full_transcript: string | null;
  failure_class: string | null;
  failure_message: string | null;
  created_at: Date;
  updated_at: Date;
}, segmentCount: number): AudioCaptureSafeView {
  return {
    audio_capture_id: row.audio_capture_id,
    provider: row.provider,
    provider_status_at_start: row.provider_status_at_start,
    mode: row.mode,
    status: row.status,
    title: row.title,
    summary: row.summary,
    duration_ms: row.duration_ms,
    meeting_capture_id: row.meeting_capture_id,
    workspace_id: row.workspace_id,
    segment_count: segmentCount,
    full_transcript: row.full_transcript,
    failure_class: row.failure_class,
    failure_message: row.failure_message,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// ─── service: list provider statuses ─────────────────────────

export function listSTTProvidersForCaller(): STTProviderStatusRow[] {
  return listSTTProviderStatuses();
}

// ─── service: receive audio capture + transcribe ─────────────

export interface ReceiveAudioInput {
  callerEntityId: string;
  provider?: STTProviderType;
  mode?: AudioCaptureMode;
  storageRef?: string;
  title?: string;
  preTranscribedSegments?: STTSegment[];
  meetingCaptureId?: string;
  workspaceId?: string;
  /** If true, automatically create a MeetingCapture from the
   * transcribed result and (optionally) attach to the workspace. */
  handoff_to_meeting_capture?: boolean;
  /** Participants to record on the MeetingCapture if handoff is
   * enabled. Each carries consent per Phase 1222 semantics. */
  participants?: Array<{
    display_name: string;
    email?: string;
    participant_entity_id?: string;
    consent_state?: "CONSENTED" | "NOT_CONSENTED" | "PENDING" | "EXTERNAL_TRACKED";
    consent_source?: string;
  }>;
}

export type ReceiveAudioResult =
  | {
      ok: true;
      httpStatus: 201;
      audio_capture: AudioCaptureSafeView;
      segments: TranscriptSegmentSafeView[];
      handoff_meeting_capture_id?: string;
    }
  | {
      ok: false;
      httpStatus: 400 | 403 | 404 | 422 | 503;
      code: string;
      message?: string;
    };

export async function receiveAudioCaptureForCaller(
  input: ReceiveAudioInput,
): Promise<ReceiveAudioResult> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, httpStatus: 404, code: "NO_ORG_FOR_CALLER" };
  }

  const providerName: STTProviderType = input.provider ?? "DEMO_FIXTURE";
  const mode: AudioCaptureMode = input.mode ?? "DEMO_AUDIO_SAMPLE";
  const sttProvider: STTProvider = getSTTProvider(providerName);
  const initialStatus = sttProvider.status();

  // Materialize the audio capture row before transcribing so the
  // audit row + failure path always has something to attach to.
  const captureRow = await prisma.audioCapture.create({
    data: {
      org_entity_id: orgEntityId,
      captured_by_entity_id: input.callerEntityId,
      provider: providerName,
      provider_status_at_start: initialStatus,
      mode,
      storage_ref:
        input.storageRef !== undefined ? bound(input.storageRef, 500) : null,
      meeting_capture_id: input.meetingCaptureId ?? null,
      workspace_id: input.workspaceId ?? null,
      title:
        input.title !== undefined ? bound(input.title.trim(), TITLE_MAX) : null,
      status: "TRANSCRIBING",
    },
  });

  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_RECEIVED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      audio_capture_id: captureRow.audio_capture_id,
      provider: providerName,
      mode,
      provider_status_at_start: initialStatus,
      ...(input.workspaceId !== undefined
        ? { workspace_id: input.workspaceId }
        : {}),
      ...(input.meetingCaptureId !== undefined
        ? { meeting_capture_id: input.meetingCaptureId }
        : {}),
    },
  });

  const result = await sttProvider.transcribe({
    storage_ref: input.storageRef ?? null,
    mode,
    ...(input.preTranscribedSegments !== undefined
      ? { pre_transcribed_segments: input.preTranscribedSegments }
      : {}),
  });

  // Failure path — mark FAILED + emit audit + return failure code.
  if ("ok" in result) {
    const failure = result;
    await prisma.audioCapture.update({
      where: { audio_capture_id: captureRow.audio_capture_id },
      data: {
        status: "FAILED",
        failure_class: failure.failure_class,
        failure_message: bound(failure.message, 2000),
      },
    });
    await writeAuditEvent({
      event_type: "AUDIO_CAPTURE_FAILED",
      outcome: "ERROR",
      actor_entity_id: input.callerEntityId,
      details: {
        audio_capture_id: captureRow.audio_capture_id,
        provider: providerName,
        failure_class: failure.failure_class,
      },
    });
    const httpStatus: 422 | 503 =
      failure.failure_class === "INVALID_INPUT" ? 422 : 503;
    return {
      ok: false,
      httpStatus,
      code: failure.failure_class,
      message: failure.message,
    };
  }

  // Success path — persist segments + finalize the capture row.
  const segments = result.segments.slice(0, 500); // hard cap
  let totalLen = 0;
  const persistedSegments: TranscriptSegmentSafeView[] = [];
  for (const seg of segments) {
    const text = bound(seg.text, SEGMENT_TEXT_MAX);
    if (totalLen + text.length > TRANSCRIPT_TOTAL_MAX) break;
    totalLen += text.length;
    const row = await prisma.transcriptSegment.create({
      data: {
        audio_capture_id: captureRow.audio_capture_id,
        org_entity_id: orgEntityId,
        speaker_label:
          seg.speaker_label !== null
            ? bound(seg.speaker_label, SPEAKER_MAX)
            : null,
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        text,
        confidence: seg.confidence,
        is_final: seg.is_final,
      },
    });
    persistedSegments.push({
      transcript_segment_id: row.transcript_segment_id,
      speaker_label: row.speaker_label,
      start_ms: row.start_ms,
      end_ms: row.end_ms,
      text: row.text,
      confidence: row.confidence,
      is_final: row.is_final,
    });
  }
  const fullTranscript = bound(result.full_transcript, TRANSCRIPT_TOTAL_MAX);
  const updated = await prisma.audioCapture.update({
    where: { audio_capture_id: captureRow.audio_capture_id },
    data: {
      status: "TRANSCRIBED",
      full_transcript: fullTranscript,
      duration_ms: result.duration_ms,
    },
  });
  await writeAuditEvent({
    event_type: "AUDIO_CAPTURE_TRANSCRIBED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      audio_capture_id: captureRow.audio_capture_id,
      provider: providerName,
      segment_count: persistedSegments.length,
      duration_ms: result.duration_ms,
    },
  });

  // Optional handoff to Phase 1222 MeetingCapture pipeline so the
  // existing extract/resolve/import flow kicks in. We pass the
  // full transcript as the MeetingCapture.transcript field; the
  // CT-side comms-extract surface can then run against it.
  let handoffMeetingCaptureId: string | undefined;
  if (
    input.handoff_to_meeting_capture === true &&
    persistedSegments.length > 0
  ) {
    const mcResult = await receiveMeetingCaptureForCaller({
      callerEntityId: input.callerEntityId,
      provider: "API_INGEST",
      title:
        input.title !== undefined && input.title.trim().length > 0
          ? input.title
          : `Voice capture ${new Date().toISOString().slice(0, 19)}`,
      transcript: fullTranscript,
      ...(input.workspaceId !== undefined
        ? { workspaceId: input.workspaceId }
        : {}),
      participants:
        input.participants?.map((p) => ({
          display_name: p.display_name,
          ...(p.email !== undefined ? { email: p.email } : {}),
          ...(p.participant_entity_id !== undefined
            ? { participant_entity_id: p.participant_entity_id }
            : {}),
          ...(p.consent_state !== undefined
            ? { consent_state: p.consent_state }
            : {}),
          ...(p.consent_source !== undefined
            ? { consent_source: p.consent_source }
            : {}),
        })) ?? [],
    });
    if (mcResult.ok === true) {
      handoffMeetingCaptureId = mcResult.meeting_capture.meeting_capture_id;
      await prisma.audioCapture.update({
        where: { audio_capture_id: captureRow.audio_capture_id },
        data: {
          meeting_capture_id: handoffMeetingCaptureId,
          status: "ATTACHED_TO_MEETING_CAPTURE",
        },
      });
      await writeAuditEvent({
        event_type: "AUDIO_CAPTURE_ATTACHED",
        outcome: "SUCCESS",
        actor_entity_id: input.callerEntityId,
        details: {
          audio_capture_id: captureRow.audio_capture_id,
          meeting_capture_id: handoffMeetingCaptureId,
        },
      });
    }
  }

  // Re-read the capture row so the safe view reflects any handoff
  // state transition that happened after the initial update.
  const finalRow = await prisma.audioCapture.findUniqueOrThrow({
    where: { audio_capture_id: captureRow.audio_capture_id },
  });

  return {
    ok: true,
    httpStatus: 201,
    audio_capture: projectCapture(finalRow, persistedSegments.length),
    segments: persistedSegments,
    ...(handoffMeetingCaptureId !== undefined
      ? { handoff_meeting_capture_id: handoffMeetingCaptureId }
      : {}),
  };
}

// ─── service: list captures ───────────────────────────────────

export async function listAudioCapturesForCaller(
  callerEntityId: string,
): Promise<AudioCaptureSafeView[]> {
  const rows = await prisma.audioCapture.findMany({
    where: {
      captured_by_entity_id: callerEntityId,
      deleted_at: null,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const result: AudioCaptureSafeView[] = [];
  for (const r of rows) {
    const segmentCount = await prisma.transcriptSegment.count({
      where: { audio_capture_id: r.audio_capture_id, deleted_at: null },
    });
    result.push(projectCapture(r, segmentCount));
  }
  return result;
}

// ─── service: capture detail ─────────────────────────────────

export type GetAudioCaptureDetailResult =
  | {
      ok: true;
      httpStatus: 200;
      audio_capture: AudioCaptureSafeView;
      segments: TranscriptSegmentSafeView[];
    }
  | { ok: false; httpStatus: 403 | 404; code: string };

export async function getAudioCaptureDetailForCaller(
  audioCaptureId: string,
  callerEntityId: string,
): Promise<GetAudioCaptureDetailResult> {
  const row = await prisma.audioCapture.findFirst({
    where: { audio_capture_id: audioCaptureId, deleted_at: null },
  });
  if (row === null) {
    return { ok: false, httpStatus: 404, code: "AUDIO_CAPTURE_NOT_FOUND" };
  }
  if (row.captured_by_entity_id !== callerEntityId) {
    return { ok: false, httpStatus: 403, code: "NOT_ALLOWED" };
  }
  const segs = await prisma.transcriptSegment.findMany({
    where: { audio_capture_id: row.audio_capture_id, deleted_at: null },
    orderBy: { start_ms: "asc" },
  });
  const segCount = segs.length;
  return {
    ok: true,
    httpStatus: 200,
    audio_capture: projectCapture(row, segCount),
    segments: segs.map((s) => ({
      transcript_segment_id: s.transcript_segment_id,
      speaker_label: s.speaker_label,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      text: s.text,
      confidence: s.confidence,
      is_final: s.is_final,
    })),
  };
}
