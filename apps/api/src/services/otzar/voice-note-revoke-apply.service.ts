// FILE: voice-note-revoke-apply.service.ts
// PURPOSE: [OTZAR-RETURN-12-FOUNDATION] the FIRST MUTATING step of the voice-note
//          undo chain. It is a SUPERVISED, note-scoped revoke APPLY coordinator
//          for a single voice_note_id. It soft-revokes (sets deleted_at) ONLY the
//          caller-OWNED, currently-ACTIVE capsules grouped under that note, reusing
//          the audited per-capsule revoke primitive. It NEVER hard-deletes, NEVER
//          deletes rows, NEVER touches anything outside the grouped capsules, and
//          NEVER returns capsule payload (no payload_summary / content_hash /
//          storage_location / raw_body).
//
// SCOPE DISCIPLINE (RETURN-12):
//   - note_capture only. event_type is always "NOTE".
//   - Org-wallet capsules are SKIPPED (REQUIRES_ORG_AUTHORITY). RETURN-12 does NOT
//     carry an org-authority apply path; a partial apply is reported HONESTLY as
//     PARTIAL_APPLIED — never as a complete undo.
//   - Unknown-scope active capsules are SKIPPED (UNKNOWN_AUTHORITY), conservative.
//
// SECURITY (enumeration-safe): the group is visible ONLY to its creator. We query
// capsules by (voice_note_id AND created_by === caller). An unrelated or guessed
// voice_note_id returns zero rows -> NOT_FOUND, leaking no count, ids, or
// existence-for-someone-else signal. Mirrors the RETURN-11 plan service exactly.
//
// IDEMPOTENCE: re-applying after a successful apply finds no ACTIVE caller-owned
// capsules and returns ALREADY_REVOKED with no further mutation and no summary
// audit. Each real soft-revoke still audits once as CAPSULE_DELETED (the per-
// capsule primitive); a single VOICE_NOTE_REVOKE_APPLIED summary is emitted ONLY
// when this call actually revoked >= 1 capsule.

import { prisma, writeAuditEvent } from "@niov/database";
import { getOrgEntityId } from "../governance/org.js";
import { isDMWActive } from "../dmw/dmw-registry.service.js";
import { revokeCapsuleForCaller } from "../cosmp/capsule-management.service.js";

export type VoiceNoteRevokeApplyWalletScope = "caller" | "org" | "unknown";

export type VoiceNoteRevokeApplyStatus =
  | "APPLIED"
  | "PARTIAL_APPLIED"
  | "ALREADY_REVOKED"
  | "NOT_FOUND"
  | "UNSAFE_TO_APPLY"
  | "REFUSED";

export type VoiceNoteRevokeApplySkipReason =
  | "REQUIRES_ORG_AUTHORITY"
  | "UNKNOWN_AUTHORITY";

export interface VoiceNoteRevokeApplySkippedCapsule {
  capsule_id: string;
  wallet_scope: VoiceNoteRevokeApplyWalletScope;
  reason: VoiceNoteRevokeApplySkipReason;
}

export interface VoiceNoteRevokeApplyResult {
  ok: true;
  mode: "APPLY";
  voice_note_id: string;
  event_type: "NOTE";
  apply_status: VoiceNoteRevokeApplyStatus;
  capsule_count: number;
  revoked_capsule_ids: string[];
  already_revoked_capsule_ids: string[];
  skipped_capsules: VoiceNoteRevokeApplySkippedCapsule[];
  audit_id?: string;
  external_side_effects: false;
  hard_delete_performed: false;
  payload_returned: false;
  raw_audio_scope: "NONE";
  message: string;
  reason_codes: string[];
}

function applyEnvelope(args: {
  voiceNoteId: string;
  apply_status: VoiceNoteRevokeApplyStatus;
  capsule_count: number;
  revoked_capsule_ids?: string[];
  already_revoked_capsule_ids?: string[];
  skipped_capsules?: VoiceNoteRevokeApplySkippedCapsule[];
  audit_id?: string;
  message: string;
  reason_codes: string[];
}): VoiceNoteRevokeApplyResult {
  const base: VoiceNoteRevokeApplyResult = {
    ok: true,
    mode: "APPLY",
    voice_note_id: args.voiceNoteId,
    event_type: "NOTE",
    apply_status: args.apply_status,
    capsule_count: args.capsule_count,
    revoked_capsule_ids: args.revoked_capsule_ids ?? [],
    already_revoked_capsule_ids: args.already_revoked_capsule_ids ?? [],
    skipped_capsules: args.skipped_capsules ?? [],
    external_side_effects: false,
    hard_delete_performed: false,
    payload_returned: false,
    raw_audio_scope: "NONE",
    message: args.message,
    reason_codes: args.reason_codes,
  };
  // exactOptionalPropertyTypes: only attach audit_id when defined.
  return args.audit_id === undefined ? base : { ...base, audit_id: args.audit_id };
}

export async function voiceNoteRevokeApplyForCaller(input: {
  callerEntityId: string;
  voiceNoteId: string;
  reason?: string;
}): Promise<VoiceNoteRevokeApplyResult> {
  // GATE 1 — DMW. A caller whose Data Management Wallet is not active mutates
  // NOTHING. Return REFUSED before any read of the group or any write. (The
  // per-capsule primitive also re-checks DMW, so this is defence in depth.)
  if (!(await isDMWActive(input.callerEntityId))) {
    return applyEnvelope({
      voiceNoteId: input.voiceNoteId,
      apply_status: "REFUSED",
      capsule_count: 0,
      message: "Undo refused: your data wallet is not active.",
      reason_codes: ["DMW_NOT_ACTIVE"],
    });
  }

  // Enumeration-safe group read. Non-sensitive lifecycle/ownership fields only —
  // NEVER payload. Identical visibility contract to the RETURN-11 plan service.
  const rows = await prisma.memoryCapsule.findMany({
    where: { voice_note_id: input.voiceNoteId, created_by: input.callerEntityId },
    select: { capsule_id: true, wallet_id: true, entity_id: true, deleted_at: true },
  });

  if (rows.length === 0) {
    return applyEnvelope({
      voiceNoteId: input.voiceNoteId,
      apply_status: "NOT_FOUND",
      capsule_count: 0,
      message: "No voice note group is visible to you for that id.",
      reason_codes: ["NO_GROUP_FOR_CALLER"],
    });
  }

  // Resolve the caller's wallet (used to confirm ownership scope) and, best-
  // effort, the org wallet (used to label org-scope skips). If the caller's own
  // wallet cannot be resolved we cannot safely classify ownership -> refuse to
  // mutate and report UNSAFE_TO_APPLY (no write performed).
  const callerWallet = await prisma.wallet.findUnique({
    where: { entity_id: input.callerEntityId },
    select: { wallet_id: true },
  });
  if (callerWallet === null) {
    return applyEnvelope({
      voiceNoteId: input.voiceNoteId,
      apply_status: "UNSAFE_TO_APPLY",
      capsule_count: rows.length,
      message: "Cannot resolve your wallet; no changes were made.",
      reason_codes: ["CALLER_WALLET_UNRESOLVED"],
    });
  }

  let orgWalletId: string | null = null;
  try {
    const orgEntityId = await getOrgEntityId(input.callerEntityId);
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

  // CLASSIFY. The caller can soft-revoke only capsules they own (entity_id ===
  // caller). Active capsules in the org wallet are skipped (org authority not
  // carried in RETURN-12); active capsules of unresolved scope are skipped
  // conservatively. Already-revoked capsules are no-ops.
  const alreadyRevokedIds: string[] = [];
  const ownedActiveIds: string[] = [];
  const skipped: VoiceNoteRevokeApplySkippedCapsule[] = [];

  for (const row of rows) {
    if (row.deleted_at !== null) {
      alreadyRevokedIds.push(row.capsule_id);
      continue;
    }
    if (row.entity_id === input.callerEntityId) {
      ownedActiveIds.push(row.capsule_id);
      continue;
    }
    const wallet_scope: VoiceNoteRevokeApplyWalletScope =
      orgWalletId !== null && row.wallet_id === orgWalletId ? "org" : "unknown";
    skipped.push({
      capsule_id: row.capsule_id,
      wallet_scope,
      reason:
        wallet_scope === "org" ? "REQUIRES_ORG_AUTHORITY" : "UNKNOWN_AUTHORITY",
    });
  }

  // PLAN/APPLY COHERENCE (RETURN-11 oracle). If ANY active capsule classifies as
  // unknown authority, the group is UNSAFE_TO_APPLY: refuse-all and mutate
  // NOTHING — exactly as the read-only plan returns UNSAFE_TO_APPLY for the same
  // group. The user's spec lists "unknown" as a refuse condition verbatim, and
  // the server is the security boundary (a direct API call bypasses the Part-C
  // UI gate). The caller-owned revokes would be safe in isolation, but contract
  // coherence wins: plan says UNSAFE => apply must not mutate.
  if (skipped.some((s) => s.reason === "UNKNOWN_AUTHORITY")) {
    return applyEnvelope({
      voiceNoteId: input.voiceNoteId,
      apply_status: "UNSAFE_TO_APPLY",
      capsule_count: rows.length,
      already_revoked_capsule_ids: alreadyRevokedIds,
      skipped_capsules: skipped,
      message:
        "Cannot safely apply: some capsules have undetermined authority; no changes were made.",
      reason_codes: ["WALLET_OR_AUTHORITY_UNDETERMINED"],
    });
  }

  // APPLY. Reuse the audited per-capsule soft-revoke primitive so each revoke
  // emits its own CAPSULE_DELETED audit and obeys the identical DMW/owner/
  // already-revoked guards. Build result arrays from ACTUAL outcomes, never from
  // the pre-loop intent — a concurrent revoke (ALREADY_REVOKED) reclassifies to
  // already-revoked; any unexpected refusal is conservatively skipped, never
  // reported as revoked.
  const revokedIds: string[] = [];
  for (const capsuleId of ownedActiveIds) {
    const result = await revokeCapsuleForCaller({
      callerEntityId: input.callerEntityId,
      capsuleId,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    if (result.ok) {
      revokedIds.push(capsuleId);
    } else if (result.code === "ALREADY_REVOKED") {
      alreadyRevokedIds.push(capsuleId);
    } else {
      // DMW_REVOKED / NOT_OWNER / CAPSULE_NOT_FOUND: should not occur after the
      // gates above; treat as a conservative skip rather than a false success.
      skipped.push({
        capsule_id: capsuleId,
        wallet_scope: "unknown",
        reason: "UNKNOWN_AUTHORITY",
      });
    }
  }

  // STATUS. Honest precedence: any skip => PARTIAL_APPLIED (never claim a complete
  // undo when org/unknown capsules remain). Otherwise, real revokes => APPLIED;
  // nothing to do but prior revokes exist => ALREADY_REVOKED.
  let apply_status: VoiceNoteRevokeApplyStatus;
  const reason_codes: string[] = [];
  let message: string;
  if (skipped.length > 0) {
    apply_status = "PARTIAL_APPLIED";
    if (revokedIds.length > 0) reason_codes.push("SOME_CAPSULES_REVOKED");
    reason_codes.push("SOME_CAPSULES_REQUIRE_OTHER_AUTHORITY");
    message =
      `Revoked ${revokedIds.length} of your capsule(s); ` +
      `${skipped.length} could not be revoked by you and were left untouched.`;
  } else if (revokedIds.length > 0) {
    apply_status = "APPLIED";
    reason_codes.push("ALL_CALLER_REVOCABLE_CAPSULES_REVOKED");
    message = `Revoked ${revokedIds.length} capsule(s) for this voice note.`;
  } else {
    apply_status = "ALREADY_REVOKED";
    reason_codes.push("NOTHING_ACTIVE_TO_REVOKE");
    message = "Nothing to undo: these capsules were already revoked.";
  }

  // SUMMARY AUDIT — emitted ONLY when this call actually revoked >= 1 capsule.
  // SAFE details only (counts + status); NEVER capsule payload. A no-op /
  // already-revoked re-apply writes no summary audit.
  let audit_id: string | undefined;
  if (revokedIds.length > 0) {
    const event = await writeAuditEvent({
      event_type: "VOICE_NOTE_REVOKE_APPLIED",
      outcome: "SUCCESS",
      actor_entity_id: input.callerEntityId,
      target_entity_id: input.callerEntityId,
      details: {
        voice_note_id: input.voiceNoteId,
        revoked_count: revokedIds.length,
        skipped_count: skipped.length,
        already_revoked_count: alreadyRevokedIds.length,
        apply_status,
      },
    });
    audit_id = event.audit_id;
  }

  return applyEnvelope({
    voiceNoteId: input.voiceNoteId,
    apply_status,
    capsule_count: rows.length,
    revoked_capsule_ids: revokedIds,
    already_revoked_capsule_ids: alreadyRevokedIds,
    skipped_capsules: skipped,
    ...(audit_id === undefined ? {} : { audit_id }),
    message,
    reason_codes,
  });
}
