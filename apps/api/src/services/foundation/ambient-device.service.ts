// FILE: ambient-device.service.ts
// PURPOSE: Phase 1291-A — Foundation AMBIENT DEVICE PROTOCOL. Promotes the
//          Phase 1287-A glasses/lens device-capture adapter into a reusable,
//          governed Foundation contract for ambient inputs from glasses /
//          lenses / goggles / earbuds / ear pods / desktop / mobile —
//          including no-view and voice-confirmed interaction.
//
//          The core new value is a GOVERNED DISPOSITION decision: given an
//          ambient device packet (text only) + consent + visibility +
//          confirmation, decide what may happen to it —
//            TRANSIENT_ONLY        (not retained)
//            WORK_LEDGER_ONLY      (durable work artifact; the 1287-A default)
//            MEMORY_CAPSULE_PRIVATE(may become the user's own private capsule)
//            MEMORY_CAPSULE_ORG    (may become org memory — strictly gated)
//            REQUIRES_CONFIRMATION (needs a verifiable human confirmation first)
//            BLOCKED               (prohibited; nothing is retained)
//
//          A device packet becomes a Memory Capsule ONLY under explicit policy;
//          this layer renders that policy decision. It composes the 1288-B
//          authority envelope (device authority + memory_scope) and preserves
//          every 1287-A prohibition. It moves NO data into a capsule itself —
//          the disposition is the contract; capsule-write-under-policy is
//          forward-substrate. Authority is decided by Foundation from the
//          authenticated session — never from a device-claimed identity.
//
// CONNECTS TO:
//   - apps/api/src/services/perception/ambient-perception.service.ts (the
//     1287-A text-only / consent / raw-frame-rejection discipline this honors).
//   - apps/api/src/services/foundation/authority.service.ts
//     (computeAuthorityEnvelope — device authority + memory_scope.can_write).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - packages/database writeAuditEvent (AMBIENT_PACKET_EVALUATED proof).
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY (preserves 1287-A): TEXT ONLY — raw camera frames / visual / video /
// image / biometric keys are REJECTED; face/biometric recognition is never
// performed; location signals are not accepted; always-on capture is not
// honored without explicit user-initiated consent; a device-supplied identity
// is NEVER trusted for authority or scope and is never stored. Bystander-
// sensitive packets can NEVER become org memory. No-view / audio-confirmation
// commands NEVER auto-promote without a verifiable confirmation (no fake
// confirmation). Audit + responses carry SAFE metadata only.

import { prisma, writeAuditEvent, type Entity } from "@niov/database";
import type { AuthService } from "../auth.service.js";
import { computeAuthorityEnvelope } from "./authority.service.js";

// The device-originated text source types this protocol accepts. Mirrors the
// 1287-A DEVICE_SOURCE_TYPES (text packets only). Visual/biometric/location
// source types are intentionally absent and are BLOCKED below.
export const AMBIENT_DEVICE_SOURCE_TYPES = [
  "GLASSES_NOTE",
  "LENS_CONTEXT",
  "AMBIENT_DEVICE_PACKET",
] as const;
export type AmbientDeviceSourceType =
  (typeof AMBIENT_DEVICE_SOURCE_TYPES)[number];

// How the packet was produced. no_view_command + audio_confirmation are the
// hands-free / eyes-free modes that require verifiable confirmation.
export const AMBIENT_DEVICE_MODES = [
  "visual_note",
  "voice_note",
  "no_view_command",
  "audio_confirmation",
  "manual_capture",
] as const;
export type AmbientDeviceMode = (typeof AMBIENT_DEVICE_MODES)[number];

export const AMBIENT_MEMORY_DISPOSITIONS = [
  "TRANSIENT_ONLY",
  "WORK_LEDGER_ONLY",
  "MEMORY_CAPSULE_PRIVATE",
  "MEMORY_CAPSULE_ORG",
  "REQUIRES_CONFIRMATION",
  "BLOCKED",
] as const;
export type AmbientMemoryDisposition =
  (typeof AMBIENT_MEMORY_DISPOSITIONS)[number];

export type ConfirmationMode = "NONE" | "TAP" | "VOICE" | "GESTURE";

export interface AmbientConsent {
  user_initiated: boolean;
  capture_visible_to_user: boolean;
  bystander_sensitive: boolean;
  recording_disclosed?: boolean;
}

export interface AmbientConfirmation {
  user_confirmed: boolean;
  confirmation_mode: ConfirmationMode;
  // Optional self-reported confidence (advisory only; never trusted for auth).
  confidence?: number | null;
}

export interface AmbientVisibility {
  scope: "private" | "thread" | "org" | "unknown";
}

export interface AmbientPacketInput {
  source_type: string;
  mode: string;
  text: string;
  consent: AmbientConsent;
  visibility?: AmbientVisibility;
  confirmation?: AmbientConfirmation;
  // Untrusted device hints — advisory only, never stored, never authority.
  device_type?: string;
  device_id?: string;
  // Any raw frame / image / video keys — their PRESENCE alone blocks the packet.
  raw_media_keys?: ReadonlyArray<string>;
}

export interface AmbientPacketDecision {
  disposition: AmbientMemoryDisposition;
  reason_code: string;
  blocked_reasons: string[];
  requires_confirmation: boolean;
  allowed_into_org_memory: boolean;
  // Device-claimed identity is never trusted for authority/scope.
  device_identity_trusted: false;
  honest_note: string;
}

export interface AmbientDeviceEnvelopeInputs {
  entity_type: Entity["entity_type"];
  can_write_capsules: boolean;
}

// WHAT: Decide the governed disposition for an ambient device packet. Pure +
//        deterministic. Preserves every 1287-A prohibition + RULE 0.
// INPUT: the packet + the caller's relevant authority (entity_type +
//        memory_scope.can_write_capsules from the authority envelope).
// OUTPUT: an AmbientPacketDecision.
// WHY: The reusable governance core — what may happen to a device packet,
//      decided by Foundation, never by the device.
export function evaluateAmbientPacket(
  input: AmbientPacketInput,
  authority: AmbientDeviceEnvelopeInputs,
): AmbientPacketDecision {
  const blocked: string[] = [];
  const block = (reason_code: string): AmbientPacketDecision => ({
    disposition: "BLOCKED",
    reason_code,
    blocked_reasons: blocked.length > 0 ? blocked : [reason_code],
    requires_confirmation: false,
    allowed_into_org_memory: false,
    device_identity_trusted: false,
    honest_note:
      "This ambient packet is blocked. Nothing is retained, no capsule is " +
      "created, and no raw media is processed.",
  });

  // 1. Raw frames / visual / image / video / biometric keys → blocked outright.
  if (input.raw_media_keys !== undefined && input.raw_media_keys.length > 0) {
    return block("raw-frame-forbidden");
  }
  // 2. Source must be a device TEXT source. Visual/biometric/location sources
  //    are not accepted (no face/biometric recognition, no location capture).
  if (
    !(AMBIENT_DEVICE_SOURCE_TYPES as readonly string[]).includes(
      input.source_type,
    )
  ) {
    return block("source-not-supported");
  }
  // 3. Mode must be recognized.
  if (!(AMBIENT_DEVICE_MODES as readonly string[]).includes(input.mode)) {
    return block("mode-not-supported");
  }
  // 4. Text required (text-only protocol).
  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    return block("text-required");
  }
  // 5. Consent: must be user-initiated AND visible to the user (no always-on
  //    silent capture).
  if (
    input.consent.user_initiated !== true ||
    input.consent.capture_visible_to_user !== true
  ) {
    return block("consent-required");
  }

  const mode = input.mode as AmbientDeviceMode;
  const visibility = input.visibility?.scope ?? "unknown";
  const confirmed =
    input.confirmation?.user_confirmed === true &&
    input.confirmation.confirmation_mode !== "NONE";

  // 6. No-view / audio-confirmation commands NEVER auto-promote without a
  //    verifiable confirmation. A recorded "voice_confirmed" flag is not
  //    enough — there must be an explicit confirmation with a real mode.
  const isHandsFree =
    mode === "no_view_command" || mode === "audio_confirmation";
  if (isHandsFree && !confirmed) {
    return {
      disposition: "REQUIRES_CONFIRMATION",
      reason_code: "no-view-command-requires-verifiable-confirmation",
      blocked_reasons: [],
      requires_confirmation: true,
      allowed_into_org_memory: false,
      device_identity_trusted: false,
      honest_note:
        "This hands-free command needs an explicit, verifiable confirmation " +
        "before anything is acted on or retained. It is not auto-executed.",
    };
  }

  // 7. Bystander-sensitive packets can NEVER become org memory; the most they
  //    can do is a private capsule, and only if confirmed.
  if (input.consent.bystander_sensitive === true) {
    if (confirmed) {
      return {
        disposition: "MEMORY_CAPSULE_PRIVATE",
        reason_code: "bystander-sensitive-downgraded-to-private",
        blocked_reasons: [],
        requires_confirmation: false,
        allowed_into_org_memory: false,
        device_identity_trusted: false,
        honest_note:
          "Bystander-sensitive capture is confined to your own private " +
          "memory and never enters org memory.",
      };
    }
    return {
      disposition: "REQUIRES_CONFIRMATION",
      reason_code: "bystander-sensitive-requires-confirmation",
      blocked_reasons: [],
      requires_confirmation: true,
      allowed_into_org_memory: false,
      device_identity_trusted: false,
      honest_note:
        "Bystander-sensitive capture needs your explicit confirmation and " +
        "can only ever become private memory, never org memory.",
    };
  }

  // 8. Org memory is strictly gated: visibility=org + confirmed + the caller's
  //    authority allows capsule writes. Otherwise downgrade safely.
  if (visibility === "org") {
    if (confirmed && authority.can_write_capsules) {
      return {
        disposition: "MEMORY_CAPSULE_ORG",
        reason_code: "org-visibility-confirmed-write-authorized",
        blocked_reasons: [],
        requires_confirmation: false,
        allowed_into_org_memory: true,
        device_identity_trusted: false,
        honest_note:
          "This packet is eligible to become org memory under explicit " +
          "policy (visibility=org, confirmed, write-authorized).",
      };
    }
    // Wants org but not confirmed or not write-authorized → needs confirmation.
    return {
      disposition: "REQUIRES_CONFIRMATION",
      reason_code: confirmed
        ? "org-memory-write-not-authorized"
        : "org-memory-requires-confirmation",
      blocked_reasons: [],
      requires_confirmation: true,
      allowed_into_org_memory: false,
      device_identity_trusted: false,
      honest_note:
        "Org memory requires an explicit confirmation and write authority " +
        "before this packet can be retained as org memory.",
    };
  }

  // 9. Private visibility + confirmed → may become a private capsule.
  if (visibility === "private" && confirmed) {
    return {
      disposition: "MEMORY_CAPSULE_PRIVATE",
      reason_code: "private-visibility-confirmed",
      blocked_reasons: [],
      requires_confirmation: false,
      allowed_into_org_memory: false,
      device_identity_trusted: false,
      honest_note:
        "This packet is eligible to become your own private memory under " +
        "explicit policy.",
    };
  }

  // 10. Default safe disposition: a durable work-ledger artifact (the 1287-A
  //     behavior) — not a capsule, not transient, not org memory.
  return {
    disposition: "WORK_LEDGER_ONLY",
    reason_code: "default-work-ledger-only",
    blocked_reasons: [],
    requires_confirmation: false,
    allowed_into_org_memory: false,
    device_identity_trusted: false,
    honest_note:
      "This packet is retained only as a durable work artifact, not as " +
      "memory. Promotion to memory requires explicit visibility + confirmation.",
  };
}

// The governed ambient device packet result returned to a caller.
export interface AmbientDevicePacketResult {
  packet_id: string;
  source_type: AmbientDeviceSourceType;
  mode: AmbientDeviceMode;
  actor_entity_id: string;
  actor_entity_type: Entity["entity_type"];
  decision: AmbientPacketDecision;
  // SAFE echo of consent/visibility/confirmation (no text, no device_id).
  consent: AmbientConsent;
  visibility_scope: string;
  confirmation_mode: ConfirmationMode;
  user_confirmed: boolean;
  provenance: {
    evaluator: "FOUNDATION_AMBIENT_DEVICE_PROTOCOL";
    decided_by: "FOUNDATION";
    device_identity_trusted: false;
  };
  evaluated_at: string;
}

export type AmbientPacketResult =
  | { ok: true; packet: AmbientDevicePacketResult }
  | { ok: false; code: string };

export class FoundationAmbientDeviceService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Evaluate an ambient device packet for the authenticated caller.
  // INPUT: session token + the packet.
  // OUTPUT: { ok:true, packet } or { ok:false, code }.
  // WHY: POST /api/v1/foundation/devices/ambient-packets. Computes the
  //      caller's device authority (never the device-claimed identity), renders
  //      the governed disposition, and emits proof. Retains nothing into a
  //      capsule itself — the disposition is the policy contract.
  async evaluateAmbientPacketForCaller(
    sessionToken: string,
    input: AmbientPacketInput,
  ): Promise<AmbientPacketResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }

    // Authority comes from the authenticated session entity — NEVER from the
    // packet's device_id (which is advisory, untrusted, and not stored).
    const entity = await prisma.entity.findFirst({
      where: { entity_id: validation.entity_id, deleted_at: null },
    });
    if (entity === null) {
      return { ok: false, code: "ENTITY_NOT_FOUND" };
    }
    const [tar, wallet] = await Promise.all([
      prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: validation.entity_id },
      }),
      prisma.wallet.findUnique({ where: { entity_id: validation.entity_id } }),
    ]);
    const envelope = computeAuthorityEnvelope({ entity, tar, wallet });

    const decision = evaluateAmbientPacket(input, {
      entity_type: entity.entity_type,
      can_write_capsules: envelope.memory_scope.can_write_capsules,
    });

    const now = new Date();
    const packet: AmbientDevicePacketResult = {
      packet_id: validation.session_id + ":" + now.getTime().toString(36),
      source_type: input.source_type as AmbientDeviceSourceType,
      mode: input.mode as AmbientDeviceMode,
      actor_entity_id: validation.entity_id,
      actor_entity_type: entity.entity_type,
      decision,
      consent: {
        user_initiated: input.consent.user_initiated === true,
        capture_visible_to_user: input.consent.capture_visible_to_user === true,
        bystander_sensitive: input.consent.bystander_sensitive === true,
        recording_disclosed: input.consent.recording_disclosed === true,
      },
      visibility_scope: input.visibility?.scope ?? "unknown",
      confirmation_mode: input.confirmation?.confirmation_mode ?? "NONE",
      user_confirmed: input.confirmation?.user_confirmed === true,
      provenance: {
        evaluator: "FOUNDATION_AMBIENT_DEVICE_PROTOCOL",
        decided_by: "FOUNDATION",
        device_identity_trusted: false,
      },
      evaluated_at: now.toISOString(),
    };

    // Proof (RULE 4). SAFE metadata only — never the packet text or device_id.
    await writeAuditEvent({
      event_type: "AMBIENT_PACKET_EVALUATED",
      outcome: decision.disposition === "BLOCKED" ? "DENIED" : "SUCCESS",
      actor_entity_id: validation.entity_id,
      session_id: validation.session_id,
      denial_reason:
        decision.disposition === "BLOCKED" ? decision.reason_code : null,
      details: {
        action: "AMBIENT_PACKET_EVALUATED",
        source_type: input.source_type,
        mode: input.mode,
        disposition: decision.disposition,
        reason_code: decision.reason_code,
        requires_confirmation: decision.requires_confirmation,
        allowed_into_org_memory: decision.allowed_into_org_memory,
        bystander_sensitive: input.consent.bystander_sensitive === true,
        visibility_scope: input.visibility?.scope ?? "unknown",
        device_identity_trusted: false,
      },
    });

    return { ok: true, packet };
  }
}
