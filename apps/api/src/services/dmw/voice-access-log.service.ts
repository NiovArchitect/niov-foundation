// FILE: voice-access-log.service.ts
// PURPOSE: DMW Runtime DM2-B per ADR-0092 §4 Candidate B
//          (Scoped Voice Memory Gate) — closes the
//          ConversationMemoryScope + VoiceAccessLog pair
//          end-to-end. Tracking-only at V1; enforcement
//          deferred per ADR-0092 §Consequences.
//
//          Per-(conversation_id, entity_id, voice_provider)
//          metrics counter that aggregates voice session
//          activity for later analytics + future entitlement
//          enforcement. Atomic upsert + increment via Prisma's
//          increment operator (same pattern as UsageMeter from
//          B6-α PR #233).
//
//          NO new audit literal — per ADR-0092 §4 Candidate B
//          doctrine "voice-specific access rides existing VF.2
//          6 voice literals." The existing VOICE_INTENT_RECEIVED
//          / CONFIRMED / REJECTED / EXPIRED / REDACTED /
//          DELIVERED chain already captures every voice access
//          event at the audit register; this service is the
//          metrics aggregator only.
//
// CONNECTS TO:
//   - packages/database (prisma.voiceAccessLog)
//   - apps/api/src/services/voice/voice-provider.service.ts
//     (VoiceProviderType validation)
//   - ADR-0092 §4 Candidate B Scoped Voice Memory Gate
//   - ADR-0085 §VF.2 6 voice audit literals

import { prisma } from "@niov/database";
import { VOICE_PROVIDER_TYPES } from "../voice/voice-provider.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VOICE_PROVIDER_TYPE_SET: ReadonlySet<string> = new Set(
  VOICE_PROVIDER_TYPES,
);

export type VoiceAccessLogSummary = {
  conversation_id: string;
  entity_id: string;
  voice_provider: string;
  duration_seconds: bigint;
  capsule_access_count: bigint;
  signals_projected_count: bigint;
  last_recorded_at: Date;
};

export type RecordVoiceAccessInput = {
  conversation_id: string;
  entity_id: string;
  voice_provider: string;
  duration_seconds_delta?: number;
  capsule_access_count_delta?: number;
  signals_projected_count_delta?: number;
};

export type RecordVoiceAccessResult =
  | { ok: true; log: VoiceAccessLogSummary }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    };

function project(
  row: NonNullable<Awaited<ReturnType<typeof prisma.voiceAccessLog.findUnique>>>,
): VoiceAccessLogSummary {
  return {
    conversation_id: row.conversation_id,
    entity_id: row.entity_id,
    voice_provider: row.voice_provider,
    duration_seconds: row.duration_seconds,
    capsule_access_count: row.capsule_access_count,
    signals_projected_count: row.signals_projected_count,
    last_recorded_at: row.last_recorded_at,
  };
}

// WHAT: Record a delta against the per-(conversation, entity,
//        provider) voice-access counter.
// INPUT: conversation_id + entity_id + voice_provider + 3 optional
//        non-negative integer deltas.
// OUTPUT: RecordVoiceAccessResult.
// WHY: Tracking-only at V1. Atomic upsert + increment via Prisma's
//      increment operator preserves accuracy under concurrent
//      writes. At least one delta MUST be > 0 (recording USAGE,
//      not a no-op probe).
export async function recordVoiceAccessForConversation(
  input: RecordVoiceAccessInput,
): Promise<RecordVoiceAccessResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.conversation_id)) invalid.push("conversation_id");
  if (!UUID_RE.test(input.entity_id)) invalid.push("entity_id");
  if (!VOICE_PROVIDER_TYPE_SET.has(input.voice_provider)) {
    invalid.push("voice_provider");
  }
  const durationDelta = input.duration_seconds_delta ?? 0;
  const capsuleDelta = input.capsule_access_count_delta ?? 0;
  const signalsDelta = input.signals_projected_count_delta ?? 0;
  if (
    !Number.isInteger(durationDelta) ||
    durationDelta < 0 ||
    !Number.isInteger(capsuleDelta) ||
    capsuleDelta < 0 ||
    !Number.isInteger(signalsDelta) ||
    signalsDelta < 0
  ) {
    invalid.push("delta");
  }
  if (durationDelta === 0 && capsuleDelta === 0 && signalsDelta === 0) {
    // Reject no-op probes — recording USAGE not a touch.
    invalid.push("delta");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: Array.from(new Set(invalid)),
    };
  }
  const durationBig = BigInt(durationDelta);
  const capsuleBig = BigInt(capsuleDelta);
  const signalsBig = BigInt(signalsDelta);
  const row = await prisma.voiceAccessLog.upsert({
    where: {
      conversation_id_entity_id_voice_provider: {
        conversation_id: input.conversation_id,
        entity_id: input.entity_id,
        voice_provider: input.voice_provider,
      },
    },
    update: {
      duration_seconds: { increment: durationBig },
      capsule_access_count: { increment: capsuleBig },
      signals_projected_count: { increment: signalsBig },
      last_recorded_at: new Date(),
    },
    create: {
      conversation_id: input.conversation_id,
      entity_id: input.entity_id,
      voice_provider: input.voice_provider,
      duration_seconds: durationBig,
      capsule_access_count: capsuleBig,
      signals_projected_count: signalsBig,
    },
  });
  return { ok: true, log: project(row) };
}

// WHAT: Read every VoiceAccessLog row for a conversation across
//        all entities + providers.
// INPUT: conversation_id (UUID).
// OUTPUT: A SAFE projection array ordered by entity_id then
//         voice_provider.
// WHY: Pure read; no audit emission. Consumer-tier callers
//      MUST scope-verify same-org per ADR-0049 GOVSEC.7 at
//      their own boundary.
export async function getConversationVoiceAccessHistory(
  conversation_id: string,
): Promise<ReadonlyArray<VoiceAccessLogSummary>> {
  if (!UUID_RE.test(conversation_id)) return [];
  const rows = await prisma.voiceAccessLog.findMany({
    where: { conversation_id },
    orderBy: [{ entity_id: "asc" }, { voice_provider: "asc" }],
  });
  return rows.map(project);
}
