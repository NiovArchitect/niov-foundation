// FILE: notification.service.ts
// PURPOSE: ADR-0057 Wave 11 internal-only notification substrate.
//          Creates governed in-app Otzar-native Notification rows
//          scoped to a single (org, recipient) tuple. NO external
//          delivery (no email / SMS / Slack / push); external
//          providers are future optional adapters per the Founder
//          direction recorded at
//          docs/research/2026-05-29-send-internal-notification-substrate-research.md.
// CONNECTS TO:
//   - packages/database (prisma; the NEW Notification model)
//   - apps/api/src/services/action/handlers.ts (the
//     SEND_INTERNAL_NOTIFICATION handler consumes this service)
//
// FOUNDER LOCKS (per Wave 11 Founder direction):
//   - Cross-org default DENY: recipient_entity_id MUST be a member
//     of org_entity_id per RULE 0. Recipients outside the source
//     org are denied without a future explicit Permission row.
//   - Recipient TAR must be ACTIVE (cannot notify disabled /
//     suspended entities).
//   - Body redaction is the caller's responsibility — the service
//     persists what it is given. The validator at handlers.ts
//     enforces length bounds; callers MUST NOT pass raw secrets.
//   - body_summary is bounded; body_redacted is optional Json.
//   - No external side effects; no provider delivery; no push /
//     email / SMS / Slack / webhook fan-out.

import { prisma } from "@niov/database";
import { Prisma } from "@prisma/client";

// WHAT: Inbound shape consumed by createInternalNotification.
// INPUT: Used as a parameter type.
// OUTPUT: None.
// WHY: Locks the surface so handler-tier consumers cannot omit a
//      required identifier or sneak an unsafe field through.
export interface CreateInternalNotificationInput {
  org_entity_id: string;
  recipient_entity_id: string;
  source_entity_id: string;
  notification_class: string;
  body_summary: string;
  body_redacted?: Record<string, unknown> | null;
  action_id?: string | null;
}

// WHAT: Safe projection of the created Notification — only the
//        fields a handler / future inbox route may surface
//        downstream. body_summary + body_redacted are explicitly
//        excluded from the projection so handler-tier
//        result_metadata cannot accidentally leak notification
//        content into the long-lived ActionResult row per Wave
//        11 §result_metadata Founder direction.
export interface CreatedNotificationProjection {
  notification_id: string;
  recipient_entity_id: string;
  notification_class: string;
  created_at: Date;
}

// WHAT: Discriminated-union result returned by
//        createInternalNotification.
export type CreateInternalNotificationResult =
  | { ok: true; notification: CreatedNotificationProjection }
  | {
      ok: false;
      code:
        | "RECIPIENT_NOT_FOUND"
        | "RECIPIENT_NOT_ACTIVE"
        | "CROSS_ORG_DENIED";
    };

// WHAT: The service surface — small + injectable so handlers
//        construct via DI at server boot (mirrors the WriteService
//        / NotificationProvider precedents).
export interface NotificationService {
  createInternalNotification(
    input: CreateInternalNotificationInput,
  ): Promise<CreateInternalNotificationResult>;
}

// WHAT: Construct the production NotificationService backed by
//        prisma.notification.create. Same wallet/membership
//        validation discipline as the other Foundation services.
// INPUT: None today; future versions may accept a clock / id
//        generator for deterministic tests.
// OUTPUT: A NotificationService.
// WHY: The handler's executor + dual-control + audit chain remain
//      authoritative; this service is the persistence + cross-org
//      gate.
export function makeNotificationService(): NotificationService {
  return {
    async createInternalNotification(
      input: CreateInternalNotificationInput,
    ): Promise<CreateInternalNotificationResult> {
      // RULE 0 enforcement: the recipient must be a member of the
      // source's org. EntityMembership.is_active === true; the
      // recipient is the membership.child_id. Cross-org callers
      // (recipient not in the source org's active membership set)
      // are denied even when the recipient entity itself exists.
      const membership = await prisma.entityMembership.findFirst({
        where: {
          parent_id: input.org_entity_id,
          child_id: input.recipient_entity_id,
          is_active: true,
        },
        select: { membership_id: true },
      });
      if (membership === null) {
        return { ok: false, code: "CROSS_ORG_DENIED" };
      }

      // Recipient entity existence + TAR ACTIVE check. The
      // membership above proves they were once a member; the TAR
      // tells us whether they're currently allowed to receive any
      // governed surface at all.
      const recipientTar = await prisma.tokenAttributeRepository.findUnique({
        where: { entity_id: input.recipient_entity_id },
        select: { status: true, can_login: true },
      });
      if (recipientTar === null) {
        return { ok: false, code: "RECIPIENT_NOT_FOUND" };
      }
      if (recipientTar.status !== "ACTIVE") {
        return { ok: false, code: "RECIPIENT_NOT_ACTIVE" };
      }

      // Prisma Json columns reject raw `null` in the data literal —
      // they want either an InputJsonValue OR a JsonNull sentinel.
      // Omit the field entirely when no body_redacted was supplied;
      // the column default is NULL.
      const body_redacted_input =
        input.body_redacted === undefined || input.body_redacted === null
          ? Prisma.JsonNull
          : (input.body_redacted as Prisma.InputJsonValue);
      const row = await prisma.notification.create({
        data: {
          org_entity_id: input.org_entity_id,
          recipient_entity_id: input.recipient_entity_id,
          source_entity_id: input.source_entity_id,
          action_id: input.action_id ?? null,
          notification_class: input.notification_class,
          body_summary: input.body_summary,
          body_redacted: body_redacted_input,
        },
        select: {
          notification_id: true,
          recipient_entity_id: true,
          notification_class: true,
          created_at: true,
        },
      });
      return {
        ok: true,
        notification: row,
      };
    },
  };
}
