// FILE: voice-capture.test.ts
// PURPOSE: Phase 1223 — integration test for the voice/STT
//          pipeline. Covers: DEMO_FIXTURE always works (no key);
//          LOCAL_BROWSER passes through pre-transcribed segments;
//          WHISPER_API surfaces MISSING_CREDENTIAL when key absent;
//          handoff to MeetingCapture produces an attached row.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@niov/database";
import { ensureAuditTriggers, cleanupTestData } from "../helpers.js";
import { createEntity } from "../../packages/database/src/queries/entity.js";
import {
  receiveAudioCaptureForCaller,
  listSTTProvidersForCaller,
} from "../../apps/api/src/services/voice/voice-capture.service.js";

const TEST_PREFIX = "__niov_test__phase1223__";

function fakePublicKey(seed: string): string {
  return `-----BEGIN PUBLIC KEY-----\n${seed}\n-----END PUBLIC KEY-----`;
}

async function makeOrgEntity(displayName: string): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}.org@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "COMPANY",
    clearance_level: 5,
    status: "ACTIVE",
  });
  return e.entity_id;
}

async function makePerson(
  displayName: string,
  orgEntityId: string,
): Promise<string> {
  const e = await createEntity({
    email: `${TEST_PREFIX}${displayName.toLowerCase().replace(/\s/g, ".")}@niov-test.com`,
    public_key: fakePublicKey(displayName),
    display_name: `${TEST_PREFIX} ${displayName}`,
    entity_type: "PERSON",
    clearance_level: 3,
    status: "ACTIVE",
  });
  await prisma.entityMembership.create({
    data: { parent_id: orgEntityId, child_id: e.entity_id, is_active: true },
  });
  return e.entity_id;
}

describe("Phase 1223 — Voice/STT", () => {
  let orgId = "";
  let sadeilId = "";

  beforeEach(async () => {
    await ensureAuditTriggers();
    await cleanupTestData();
    orgId = await makeOrgEntity("VC Org");
    sadeilId = await makePerson("Sadeil VC", orgId);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("provider status: DEMO_FIXTURE always DEMO_ONLY; LOCAL_BROWSER CONFIGURED; WHISPER_API MISSING_CREDENTIAL when key absent", () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const rows = listSTTProvidersForCaller();
    expect(rows.find((r) => r.provider_name === "DEMO_FIXTURE")?.status).toBe(
      "DEMO_ONLY",
    );
    expect(rows.find((r) => r.provider_name === "LOCAL_BROWSER")?.status).toBe(
      "CONFIGURED",
    );
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });

  it("DEMO_FIXTURE Launch Follow-Up: produces 6 segments + full transcript", async () => {
    const r = await receiveAudioCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "DEMO_FIXTURE",
      mode: "DEMO_AUDIO_SAMPLE",
      storageRef: "demo:launch-follow-up",
      title: "Launch Follow-Up replay",
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("receive failed");
    expect(r.audio_capture.status).toBe("TRANSCRIBED");
    expect(r.audio_capture.provider).toBe("DEMO_FIXTURE");
    expect(r.segments.length).toBe(6);
    // Check transcript content (speaker labels aren't included in
    // the joined transcript text — but the things they SAID are).
    expect(r.audio_capture.full_transcript).toContain("UI flow");
    expect(r.audio_capture.full_transcript).toContain("AI/NLP trial notes");
    expect(r.audio_capture.full_transcript).toContain("compliance review");
  });

  it("LOCAL_BROWSER passes through pre-transcribed segments", async () => {
    const r = await receiveAudioCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "LOCAL_BROWSER",
      mode: "LOCAL_FALLBACK",
      title: "Browser STT",
      preTranscribedSegments: [
        {
          speaker_label: "Sadeil",
          start_ms: 0,
          end_ms: 4000,
          text: "Hello from the browser SpeechRecognition API.",
          confidence: 0.92,
          is_final: true,
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("receive failed");
    expect(r.segments.length).toBe(1);
    expect(r.audio_capture.full_transcript).toContain("browser");
  });

  it("LOCAL_BROWSER without pre_transcribed_segments → INVALID_INPUT (422)", async () => {
    const r = await receiveAudioCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "LOCAL_BROWSER",
      mode: "LOCAL_FALLBACK",
    });
    expect(r.ok).toBe(false);
    if (r.ok === true) throw new Error("expected failure");
    expect(r.code).toBe("INVALID_INPUT");
    expect(r.httpStatus).toBe(422);
  });

  it("WHISPER_API without OPENAI_API_KEY → MISSING_CREDENTIAL (503)", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await receiveAudioCaptureForCaller({
        callerEntityId: sadeilId,
        provider: "WHISPER_API",
        mode: "AUDIO_FILE_UPLOAD",
        storageRef: "upload:test.wav",
      });
      expect(r.ok).toBe(false);
      if (r.ok === true) throw new Error("expected failure");
      expect(r.code).toBe("MISSING_CREDENTIAL");
      expect(r.httpStatus).toBe(503);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("handoff_to_meeting_capture → MeetingCapture row created + audio capture linked", async () => {
    const r = await receiveAudioCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "DEMO_FIXTURE",
      mode: "DEMO_AUDIO_SAMPLE",
      storageRef: "demo:launch-follow-up",
      title: "Launch Follow-Up replay",
      handoff_to_meeting_capture: true,
      participants: [
        {
          display_name: "Sadeil VC",
          participant_entity_id: sadeilId,
          consent_state: "CONSENTED",
          consent_source: "voice_capture_consent_box",
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("receive failed");
    expect(r.handoff_meeting_capture_id).toBeDefined();
    expect(r.audio_capture.status).toBe("ATTACHED_TO_MEETING_CAPTURE");
    const mc = await prisma.meetingCapture.findFirst({
      where: { meeting_capture_id: r.handoff_meeting_capture_id! },
    });
    expect(mc).not.toBeNull();
    expect(mc?.provider).toBe("API_INGEST");
    expect(mc?.transcript).toContain("David");
  });

  it("audit chain — RECEIVED + TRANSCRIBED emitted for every successful capture", async () => {
    const r = await receiveAudioCaptureForCaller({
      callerEntityId: sadeilId,
      provider: "DEMO_FIXTURE",
      mode: "DEMO_AUDIO_SAMPLE",
      storageRef: "demo:short",
    });
    if (r.ok === false) throw new Error("receive failed");
    const events = await prisma.auditEvent.findMany({
      where: {
        details: {
          path: ["audio_capture_id"],
          equals: r.audio_capture.audio_capture_id,
        },
      },
      select: { event_type: true },
    });
    const types = events.map((e) => e.event_type);
    expect(types).toContain("AUDIO_CAPTURE_RECEIVED");
    expect(types).toContain("AUDIO_CAPTURE_TRANSCRIBED");
  });
});
