// FILE: clarification-request.service.ts
// PURPOSE: [CE-2] Governed clarification request — the durable object.
//          Turns a CE-1 suggestion into a tracked, expiring, audited
//          EscalationRequest of the dormant AI-uncertainty type
//          HUMAN_REVIEW_REQUIRED, targeted at the CHOSEN clarifier (lateral
//          by design — manager only reaches the candidate list on authority
//          questions, enforced upstream by rankClarifiers). Clarification is
//          NOT approval: it routes a question to the best human source of
//          truth; the existing Review Center rails carry it (no new routing
//          primitive), the existing source≠resolver gate holds, and a
//          DIRECT_MESSAGE pointer tells the clarifier it is waiting.
// GUARANTEES:
//   - the clarifier MUST be a current rankClarifiers candidate for the row
//     (no arbitrary targeting, no self-clarifier, no cross-org target —
//     candidates are org-roster-derived and the row gate is tenant+party);
//   - duplicate-safe: an existing PENDING clarification for the same
//     (asker, row) returns idempotently — retries never flood the queue;
//   - linkage lives in resolution_metadata ({kind, ledger_entry_id}) which
//     the resolution path MERGES over, so the asker's Why can show
//     requested → clarified/declined across the whole lifecycle;
//   - audit comes from createEscalationForCaller's in-tx ESCALATION_CREATED
//     event (RULE 4); the pointer notification is best-effort and never
//     fails the request.
// CONNECTS TO: clarity.service.ts (rankClarifiers — gate + candidates),
//          governance/escalation.service.ts (createEscalationForCaller),
//          collaboration/internal-message.service.ts (pointer),
//          work-os-ledger.routes.ts (POST /work-os/ledger/:id/clarify).

import { prisma } from "@niov/database";
import { createEscalationForCaller } from "../governance/escalation.service.js";
import { rankClarifiers } from "./clarity.service.js";
import {
  deliverHumanInternalMessage,
  type InternalMessageResult,
} from "../collaboration/internal-message.service.js";
import type { NotificationService } from "../notification/notification.service.js";

const CLARIFICATION_EXPIRY_DAYS = 7;

export type RequestClarificationResult =
  | {
      ok: true;
      escalation_id: string;
      status: string;
      clarifier_entity_id: string;
      already_requested: boolean;
      pointer_delivered: boolean;
    }
  | { ok: false; code: string; message: string };

export async function requestClarificationForCaller(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  ledger_entry_id: string;
  clarifier_entity_id: string;
  notificationService: NotificationService;
}): Promise<RequestClarificationResult> {
  // 1. Row gate + the honest candidate set (tenant + party scope inside).
  const ranked = await rankClarifiers({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    ledger_entry_id: args.ledger_entry_id,
    is_manager: args.is_manager,
  });
  if (ranked.ok === false) return ranked;

  // 2. The chosen clarifier must BE a current candidate — the affordance is
  //    honest by construction (org-roster-derived, never the caller, never
  //    cross-org, manager only on authority questions).
  const candidate = ranked.clarity.candidates.find(
    (c) => c.entity_id === args.clarifier_entity_id,
  );
  if (candidate === undefined) {
    return {
      ok: false,
      code: "NOT_A_CANDIDATE",
      message: "That person is not a suggested clarifier for this work.",
    };
  }

  // 3. Duplicate-safe: one PENDING clarification per (asker, row).
  const existing = await prisma.escalationRequest.findFirst({
    where: {
      source_entity_id: args.caller_entity_id,
      escalation_type: "HUMAN_REVIEW_REQUIRED",
      status: "PENDING",
      resolution_metadata: {
        path: ["ledger_entry_id"],
        equals: args.ledger_entry_id,
      },
    },
    select: { escalation_id: true, status: true, target_entity_id: true },
  });
  if (existing !== null) {
    return {
      ok: true,
      escalation_id: existing.escalation_id,
      status: existing.status,
      clarifier_entity_id: existing.target_entity_id,
      already_requested: true,
      pointer_delivered: false,
    };
  }

  // 4. Load the row title for human copy (gate already passed above).
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.ledger_entry_id },
    select: { title: true },
  });
  const title = row?.title ?? "a work item";

  // 5. The durable, audited request — the dormant AI-uncertainty type,
  //    lateral target, 7-day expiry. Linkage in resolution_metadata
  //    survives resolution (the transition merges, never replaces).
  const expires = new Date();
  expires.setDate(expires.getDate() + CLARIFICATION_EXPIRY_DAYS);
  const escalation = await createEscalationForCaller(args.caller_entity_id, {
    target_entity_id: args.clarifier_entity_id,
    escalation_type: "HUMAN_REVIEW_REQUIRED",
    severity: "LOW",
    description: `Clarification requested — ${title}`,
    expires_at: expires,
    resolution_metadata: {
      kind: "clarification",
      ledger_entry_id: args.ledger_entry_id,
      clarifier_role: candidate.role,
    },
  });

  // 6. Best-effort pointer to the clarifier's inbox (existing rail; a
  //    delivery failure never fails the governed request itself).
  let pointerDelivered = false;
  try {
    const pointer: InternalMessageResult = await deliverHumanInternalMessage({
      orgEntityId: args.org_entity_id,
      senderEntityId: args.caller_entity_id,
      recipientRef: args.clarifier_entity_id,
      message: `Clarification requested on "${title}" — it's waiting in your Review Center.`,
      notificationService: args.notificationService,
    });
    pointerDelivered = pointer.ok === true;
  } catch {
    pointerDelivered = false;
  }

  return {
    ok: true,
    escalation_id: escalation.escalation_id,
    status: escalation.status,
    clarifier_entity_id: args.clarifier_entity_id,
    already_requested: false,
    pointer_delivered: pointerDelivered,
  };
}
