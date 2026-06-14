// FILE: internal-message.service.ts
// PURPOSE: Phase 1284 Wave 2 — human-authority direct internal messaging.
//          A HUMAN sending a LOW-risk internal Otzar-inbox note to an org
//          member, after confirming, delivers directly under the sender's
//          OWN authority. This is NOT an AI-Twin autonomous action and does
//          NOT go through the AI-Twin dual-control ladder (ADR-0057) — that
//          ladder still governs AI-initiated, external, sensitive, and
//          higher-risk actions. This is also NOT a Foundation bypass: it
//          delivers through the governed NotificationService
//          (createInternalNotification enforces RULE 0 cross-org DENY +
//          recipient-active + audit) and records durable Work Ledger proof.
// CONNECTS TO: collaboration/target-resolver.service.ts (resolve recipient),
//          notification/notification.service.ts (governed delivery),
//          work-os/work-ledger.service.ts (durable proof), work-os-ledger
//          routes (POST /work-os/internal-messages).
//
// GATING PRESERVED:
//   - Only a HUMAN (PERSON) sender uses this direct path. An AI_AGENT caller
//     is GATED here (must use the governed Action path).
//   - Internal Otzar inbox channel ONLY. No Slack/email/calendar/external.
//   - Recipient must resolve to an in-org member (tenant isolation).

import { prisma } from "@niov/database";
import {
  resolveCollaborationTarget,
  type GovernedTarget,
} from "./target-resolver.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import type { NotificationService } from "../notification/notification.service.js";

const BODY_MAX = 2000;

export interface DeliverInternalMessageInput {
  orgEntityId: string;
  senderEntityId: string;
  /** A name ("David") or a UUID. Resolved through the general resolver. */
  recipientRef: string;
  message: string;
  notificationService: NotificationService;
}

export type InternalMessageResult =
  | {
      ok: true;
      status: "DELIVERED";
      notification_id: string;
      ledger_entry_id: string | null;
      recipient_entity_id: string;
      recipient_display_name: string;
      sender_display_name: string;
    }
  // The recipient could not be resolved to a single in-org member. The
  // governed target carries human-readable copy + candidates for the UI.
  | { ok: false; status: "NEEDS_RESOLUTION"; resolution: GovernedTarget }
  // Direct delivery is not allowed for this sender/channel — must go through
  // the governed (gated) path instead. Never a silent failure.
  | { ok: false; status: "GATED"; reason: string }
  | { ok: false; status: "BLOCKED"; reason: string };

// WHAT: Deliver a human-authored internal note to an org member.
// OUTPUT: DELIVERED (with notification + ledger proof) / NEEDS_RESOLUTION /
//         GATED / BLOCKED — never a dead state, never throws to the route.
// WHY: Phase 1284 Wave 2 / Option 1 — Foundation recognizing the difference
//      between human-authorized internal communication and AI autonomy.
export async function deliverHumanInternalMessage(
  input: DeliverInternalMessageInput,
): Promise<InternalMessageResult> {
  const message = (input.message ?? "").trim();
  if (message.length === 0) {
    return { ok: false, status: "BLOCKED", reason: "Message body is empty." };
  }

  // Resolve the recipient through the ONE general governed resolver.
  const resolution = await resolveCollaborationTarget(input.orgEntityId, input.recipientRef);
  if (resolution.kind !== "RESOLVED" || resolution.target_entity_id === null) {
    return { ok: false, status: "NEEDS_RESOLUTION", resolution };
  }
  // Internal notes are person-to-person inbox messages. Team/project/
  // broadcast fan-out is a later wave.
  if (resolution.target_type !== "PERSON" && resolution.target_type !== "AI_TWIN") {
    return {
      ok: false,
      status: "GATED",
      reason: `Direct internal notes support a person recipient; ${resolution.target_type} routing is not enabled yet.`,
    };
  }

  // Human authority: only a PERSON sends directly. An AI_AGENT sender must
  // use the governed Action ladder (gating preserved).
  const sender = await prisma.entity.findUnique({
    where: { entity_id: input.senderEntityId },
    select: { entity_type: true, display_name: true },
  });
  if (sender === null) {
    return { ok: false, status: "BLOCKED", reason: "Sender not found." };
  }
  if (sender.entity_type !== "PERSON") {
    return {
      ok: false,
      status: "GATED",
      reason: "AI-initiated sends are gated and require the governed approval path.",
    };
  }

  // Deliver through the GOVERNED notification service (RULE 0 cross-org DENY
  // + recipient-active + audit happen inside).
  const delivery = await input.notificationService.createInternalNotification({
    org_entity_id: input.orgEntityId,
    recipient_entity_id: resolution.target_entity_id,
    source_entity_id: input.senderEntityId,
    notification_class: "DIRECT_MESSAGE",
    body_summary: message.slice(0, BODY_MAX),
  });
  if (delivery.ok === false) {
    return { ok: false, status: "BLOCKED", reason: humanizeDeliveryFailure(delivery.code) };
  }

  // Durable Work Ledger proof of the routed, delivered note.
  let ledgerId: string | null = null;
  const ledger = await createLedgerEntry({
    org_entity_id: input.orgEntityId,
    ledger_type: "NOTIFICATION",
    source_type: "CHAT",
    source_command: message.slice(0, BODY_MAX),
    title: `Internal note to ${resolution.display_name ?? "teammate"}`,
    summary: message.slice(0, 200),
    requester_entity_id: input.senderEntityId,
    owner_entity_id: input.senderEntityId,
    target_entity_id: resolution.target_entity_id,
    status: "EXECUTED",
    priority: "ROUTINE",
    notification_id: delivery.notification.notification_id,
    next_action: "Awaiting recipient response",
  });
  if (ledger.ok) ledgerId = ledger.entry.ledger_entry_id;

  return {
    ok: true,
    status: "DELIVERED",
    notification_id: delivery.notification.notification_id,
    ledger_entry_id: ledgerId,
    recipient_entity_id: resolution.target_entity_id,
    recipient_display_name: resolution.display_name ?? "teammate",
    sender_display_name: sender.display_name ?? "you",
  };
}

// WHAT: Map a notification-service failure code to safe, human-readable copy.
function humanizeDeliveryFailure(code: string): string {
  switch (code) {
    case "CROSS_ORG_DENIED":
      return "That recipient is outside your organization.";
    case "RECIPIENT_NOT_FOUND":
      return "That recipient could not be found.";
    case "RECIPIENT_NOT_ACTIVE":
      return "That recipient's account is not active.";
    case "RECIPIENT_NOT_PERSON":
      return "Internal notes can only be delivered to a person.";
    default:
      return "The note could not be delivered.";
  }
}
