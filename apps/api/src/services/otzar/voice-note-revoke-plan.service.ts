// FILE: voice-note-revoke-plan.service.ts
// PURPOSE: [OTZAR-RETURN-11-FOUNDATION] a READ-ONLY, note-scoped revoke PLAN for
//          a voice_note_id. It answers, for the caller's own voice note: which
//          capsules exist, what wallet scope they sit in, their current status,
//          what authority a FUTURE revoke would need, and whether a future apply
//          is theoretically possible. It MUTATES NOTHING — no deleted_at write,
//          no revoke, no apply, no audit write — and it NEVER returns capsule
//          payload/content (no payload_summary / content_hash / storage_location).
//
// SECURITY (enumeration-safe): the group is visible ONLY to its creator. We
// query capsules by (voice_note_id AND created_by === caller). An unrelated or
// guessed voice_note_id returns zero rows -> NOT_FOUND, revealing no count, no
// ids, and no "exists for someone else" signal.
//
// DOCTRINE: capsules are intentional. RETURN-11 produces a plan; it does not
// apply it. apply_allowed / hard_delete_allowed / external_side_effects are
// always false; raw_audio_scope is always NONE; payload_returned is always
// false. A future supervised coordinator (BEAM) could key apply on this plan.

import { prisma } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";

export type VoiceNoteWalletScope = "caller" | "org" | "unknown";
export type VoiceNoteCapsuleStatus = "ACTIVE" | "REVOKED";
export type VoiceNoteCapsuleAuthority =
  | "CAN_REVOKE"
  | "REQUIRES_ORG_AUTHORITY"
  | "NOT_OWNER"
  | "UNKNOWN";
export type VoiceNoteCapsuleProposedAction =
  | "SOFT_REVOKE"
  | "NOOP_ALREADY_REVOKED"
  | "SKIP_UNAUTHORIZED";
export type VoiceNoteRevokePlanStatus =
  | "COMPLETE_CAN_APPLY"
  | "PARTIAL_REQUIRES_AUTHORITY"
  | "ALREADY_REVOKED"
  | "NOT_FOUND"
  | "UNSAFE_TO_APPLY";

export interface VoiceNoteRevokeCapsulePlan {
  capsule_id: string;
  wallet_scope: VoiceNoteWalletScope;
  current_status: VoiceNoteCapsuleStatus;
  authority_status: VoiceNoteCapsuleAuthority;
  proposed_action: VoiceNoteCapsuleProposedAction;
}

export interface VoiceNoteRevokePlan {
  ok: true;
  mode: "PLAN_ONLY";
  voice_note_id: string;
  event_type: "NOTE";
  capsule_count: number;
  capsules: VoiceNoteRevokeCapsulePlan[];
  plan_status: VoiceNoteRevokePlanStatus;
  apply_allowed: false;
  hard_delete_allowed: false;
  external_side_effects: false;
  raw_audio_scope: "NONE";
  payload_returned: false;
  crypto_erasure_ready: false;
  crypto_erasure_status: "NO_KEY_PATH_YET";
  audit_preview: { event_type: "VOICE_NOTE_REVOKE_PLANNED" };
  reason_codes: string[];
}

function planEnvelope(
  voiceNoteId: string,
  capsules: VoiceNoteRevokeCapsulePlan[],
  plan_status: VoiceNoteRevokePlanStatus,
  reason_codes: string[],
): VoiceNoteRevokePlan {
  return {
    ok: true,
    mode: "PLAN_ONLY",
    voice_note_id: voiceNoteId,
    event_type: "NOTE",
    capsule_count: capsules.length,
    capsules,
    plan_status,
    apply_allowed: false,
    hard_delete_allowed: false,
    external_side_effects: false,
    raw_audio_scope: "NONE",
    payload_returned: false,
    crypto_erasure_ready: false,
    crypto_erasure_status: "NO_KEY_PATH_YET",
    audit_preview: { event_type: "VOICE_NOTE_REVOKE_PLANNED" },
    reason_codes,
  };
}

export async function voiceNoteRevokePlanForCaller(input: {
  callerEntityId: string;
  voiceNoteId: string;
}): Promise<VoiceNoteRevokePlan> {
  // Enumeration-safe: only the creator's own group is visible. SELECT is
  // restricted to non-sensitive lifecycle/ownership fields — NEVER payload.
  const rows = await prisma.memoryCapsule.findMany({
    where: { voice_note_id: input.voiceNoteId, created_by: input.callerEntityId },
    select: { capsule_id: true, wallet_id: true, entity_id: true, deleted_at: true },
  });

  if (rows.length === 0) {
    // No relationship to (or no existence of) this group: identical response —
    // no count, no ids, no oracle.
    return planEnvelope(input.voiceNoteId, [], "NOT_FOUND", ["NO_GROUP_FOR_CALLER"]);
  }

  // Resolve the caller's wallet + their org's wallet so each capsule's scope can
  // be classified. Org resolution is best-effort; if it fails, org-wallet
  // capsules fall to "unknown" (conservative).
  const callerWallet = await prisma.wallet.findUnique({
    where: { entity_id: input.callerEntityId },
    select: { wallet_id: true },
  });
  let orgWalletId: string | null = null;
  let orgEntityId: string | null = null;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
    if (orgEntityId !== null) {
      const orgWallet = await prisma.wallet.findUnique({
        where: { entity_id: orgEntityId },
        select: { wallet_id: true },
      });
      orgWalletId = orgWallet?.wallet_id ?? null;
    }
  } catch {
    orgWalletId = null;
  }

  const capsules: VoiceNoteRevokeCapsulePlan[] = rows.map((row) => {
    const wallet_scope: VoiceNoteWalletScope =
      callerWallet !== null && row.wallet_id === callerWallet.wallet_id
        ? "caller"
        : orgWalletId !== null && row.wallet_id === orgWalletId
          ? "org"
          : "unknown";
    const current_status: VoiceNoteCapsuleStatus =
      row.deleted_at !== null ? "REVOKED" : "ACTIVE";

    // The caller owns (and could later revoke) only capsules whose entity_id is
    // theirs (caller wallet). Org-wallet capsules need org authority; anything
    // unresolved is UNKNOWN (conservative).
    const authority_status: VoiceNoteCapsuleAuthority =
      row.entity_id === input.callerEntityId
        ? "CAN_REVOKE"
        : wallet_scope === "org"
          ? "REQUIRES_ORG_AUTHORITY"
          : "UNKNOWN";

    const proposed_action: VoiceNoteCapsuleProposedAction =
      current_status === "REVOKED"
        ? "NOOP_ALREADY_REVOKED"
        : authority_status === "CAN_REVOKE"
          ? "SOFT_REVOKE"
          : "SKIP_UNAUTHORIZED";

    return { capsule_id: row.capsule_id, wallet_scope, current_status, authority_status, proposed_action };
  });

  // plan_status precedence is computed over the ACTIVE subset only — already-
  // revoked capsules are NOOP, not blockers.
  const active = capsules.filter((c) => c.current_status === "ACTIVE");
  let plan_status: VoiceNoteRevokePlanStatus;
  const reason_codes: string[] = [];
  if (active.length === 0) {
    plan_status = "ALREADY_REVOKED";
    reason_codes.push("ALL_CAPSULES_ALREADY_REVOKED");
  } else if (active.some((c) => c.authority_status === "UNKNOWN")) {
    plan_status = "UNSAFE_TO_APPLY";
    reason_codes.push("WALLET_OR_AUTHORITY_UNDETERMINED");
  } else if (active.some((c) => c.authority_status === "REQUIRES_ORG_AUTHORITY")) {
    plan_status = "PARTIAL_REQUIRES_AUTHORITY";
    reason_codes.push("SOME_CAPSULES_REQUIRE_ORG_AUTHORITY");
  } else {
    plan_status = "COMPLETE_CAN_APPLY";
    reason_codes.push("ALL_ACTIVE_CAPSULES_CALLER_REVOCABLE");
  }
  // Apply is never enabled in RETURN-11, even when the plan is complete.
  reason_codes.push("APPLY_NOT_IMPLEMENTED_IN_THIS_BUILD");

  return planEnvelope(input.voiceNoteId, capsules, plan_status, reason_codes);
}
