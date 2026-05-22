// FILE: break-glass.service.ts
// PURPOSE: GOVSEC.5 break-glass / time-boxed audit (GAP-K1, ADR-0050) BG.1
//          substrate service. Create / validate / consume / expire / review
//          time-boxed EMERGENCY GRANTS over the 4 dual-control
//          PRIVILEGED_ENDPOINTS actions, for when the normal two-person
//          dual-control cannot complete. BG.1 is SUBSTRATE-ONLY: nothing here
//          is wired into dual-control.middleware.ts or any route, so NO live
//          emergency bypass exists yet (that is BG.2). Every state mutation
//          writes its BREAK_GLASS_* audit event inside the same transaction
//          (ADR-0002 + RULE 4). Mandatory valid_until (no perpetual grant);
//          the initiator may NEVER review their own grant (two-person review).
// CONNECTS TO: @niov/database (prisma BreakGlassGrant model + writeAuditEvent
//              hash-chain), apps/api/src/security/privileged-endpoints.ts
//              (PRIVILEGED_ENDPOINTS — the 4-action scope, single source of
//              truth). Future (BG.2): dual-control.middleware.ts will call
//              validateBreakGlassGrant + markBreakGlassUsed at the
//              Denied seam; an invoke/review route will call create/review.
//
// ERROR CONTRACT (domain-string throws per the escalation.service.ts pattern;
// future route handlers map to HTTP codes):
//   - BREAK_GLASS_JUSTIFICATION_REQUIRED — empty/blank justification
//   - BREAK_GLASS_VALID_UNTIL_REQUIRED   — missing/invalid valid_until
//   - BREAK_GLASS_VALID_UNTIL_IN_PAST    — valid_until <= now (no perpetual)
//   - BREAK_GLASS_ACTION_NOT_PRIVILEGED  — action_type outside the 4 scope
//   - BREAK_GLASS_NOT_FOUND              — grant_id does not exist
//   - BREAK_GLASS_INVALID_TRANSITION     — status is not in the allowed set
//   - BREAK_GLASS_SELF_REVIEW_FORBIDDEN  — reviewer === source (two-person)
//
// LIFECYCLE (single-use): ACTIVE --markUsed--> USED ; ACTIVE --expire--> EXPIRED ;
// (USED|EXPIRED|ACTIVE) --review (reviewer != source)--> REVIEWED (terminal).
// validateBreakGlassGrant returns only ACTIVE, in-window, matching grants.

import { prisma, writeAuditEvent } from "@niov/database";
import type { BreakGlassGrant } from "@niov/database";
import { PRIVILEGED_ENDPOINTS } from "../../security/privileged-endpoints.js";

// WHAT: The 4 privileged action-descriptor types break-glass may scope to.
// INPUT: Used as a constant.
// OUTPUT: None.
// WHY: Derived from the dual-control PRIVILEGED_ENDPOINTS registry (single
//      source of truth) so the break-glass scope cannot drift from the
//      dual-control surface. GOVSEC.5 / ADR-0050 limit BG.1 scope to these 4.
const PRIVILEGED_ACTION_TYPES: ReadonlySet<string> = new Set(
  PRIVILEGED_ENDPOINTS.map((e) => e.actionDescriptor.type),
);

// WHAT: The named-fields shape createBreakGlassGrant accepts.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: source_entity_id is NOT in this shape — it is the caller/invoker. The
//      grant is scoped to one privileged action_type, carries an explicit
//      justification, and has a mandatory valid_until.
export interface CreateBreakGlassInput {
  action_type: string;
  justification: string;
  valid_until: Date;
}

// WHAT: Create an ACTIVE time-boxed break-glass grant for the caller.
// INPUT: sourceEntityId (the invoking actor) + a CreateBreakGlassInput.
// OUTPUT: The created BreakGlassGrant (status = ACTIVE).
// WHY: GOVSEC.5 GAP-K1 / ADR-0050 BG.1. Validates justification + mandatory
//      future valid_until + privileged-action scope, then creates the grant and
//      writes BREAK_GLASS_INVOKED in the same tx (ADR-0002 + RULE 4). This is a
//      substrate write only — it does NOT grant any live access (no middleware).
export async function createBreakGlassGrant(
  sourceEntityId: string,
  input: CreateBreakGlassInput,
): Promise<BreakGlassGrant> {
  if (
    typeof input.justification !== "string" ||
    input.justification.trim().length === 0
  ) {
    throw new Error("BREAK_GLASS_JUSTIFICATION_REQUIRED");
  }
  if (
    !(input.valid_until instanceof Date) ||
    Number.isNaN(input.valid_until.getTime())
  ) {
    throw new Error("BREAK_GLASS_VALID_UNTIL_REQUIRED");
  }
  if (input.valid_until.getTime() <= Date.now()) {
    throw new Error("BREAK_GLASS_VALID_UNTIL_IN_PAST");
  }
  if (!PRIVILEGED_ACTION_TYPES.has(input.action_type)) {
    throw new Error("BREAK_GLASS_ACTION_NOT_PRIVILEGED");
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.breakGlassGrant.create({
      data: {
        source_entity_id: sourceEntityId,
        action_type: input.action_type,
        justification: input.justification,
        status: "ACTIVE",
        valid_until: input.valid_until,
      },
    });
    await writeAuditEvent(
      {
        event_type: "BREAK_GLASS_INVOKED",
        outcome: "SUCCESS",
        actor_entity_id: sourceEntityId,
        details: {
          grant_id: created.grant_id,
          action_type: created.action_type,
          valid_from: created.valid_from.toISOString(),
          valid_until: created.valid_until.toISOString(),
        },
      },
      tx,
    );
    return created;
  });
}

// WHAT: Find a valid, unexpired, ACTIVE break-glass grant for (source, action).
// INPUT: sourceEntityId + actionType.
// OUTPUT: The matching BreakGlassGrant, or null when none qualifies.
// WHY: The read-side check the BG.2 dual-control integration will consume. In
//      BG.1 it is NOT called by middleware — no live bypass. Only ACTIVE grants
//      within their valid_from..valid_until window for the exact action_type
//      and source qualify.
export async function validateBreakGlassGrant(
  sourceEntityId: string,
  actionType: string,
): Promise<BreakGlassGrant | null> {
  const now = new Date();
  return prisma.breakGlassGrant.findFirst({
    where: {
      source_entity_id: sourceEntityId,
      action_type: actionType,
      status: "ACTIVE",
      valid_from: { lte: now },
      valid_until: { gt: now },
    },
    orderBy: { created_at: "desc" },
  });
}

// WHAT: Consume an ACTIVE grant (single-use): ACTIVE -> USED.
// INPUT: grantId.
// OUTPUT: The updated BreakGlassGrant (status = USED).
// WHY: Records that the grant was used for a privileged action + writes
//      BREAK_GLASS_USED in the same tx. Single-use: only an ACTIVE grant may be
//      consumed. BG.1 substrate only — the caller is a test/service, NOT the
//      middleware (BG.2 wires the live consumption).
export async function markBreakGlassUsed(
  grantId: string,
): Promise<BreakGlassGrant> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.breakGlassGrant.findUnique({
      where: { grant_id: grantId },
    });
    if (existing === null) {
      throw new Error("BREAK_GLASS_NOT_FOUND");
    }
    if (existing.status !== "ACTIVE") {
      throw new Error("BREAK_GLASS_INVALID_TRANSITION");
    }
    await writeAuditEvent(
      {
        event_type: "BREAK_GLASS_USED",
        outcome: "SUCCESS",
        actor_entity_id: existing.source_entity_id,
        details: { grant_id: grantId, action_type: existing.action_type },
      },
      tx,
    );
    return tx.breakGlassGrant.update({
      where: { grant_id: grantId },
      data: { status: "USED", used_at: new Date() },
    });
  });
}

// WHAT: Expire an ACTIVE grant: ACTIVE -> EXPIRED.
// INPUT: grantId.
// OUTPUT: The updated BreakGlassGrant (status = EXPIRED).
// WHY: Closes a grant whose time-box elapsed (or is being force-expired) +
//      writes BREAK_GLASS_EXPIRED in the same tx. Only an ACTIVE grant expires.
export async function expireBreakGlassGrant(
  grantId: string,
): Promise<BreakGlassGrant> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.breakGlassGrant.findUnique({
      where: { grant_id: grantId },
    });
    if (existing === null) {
      throw new Error("BREAK_GLASS_NOT_FOUND");
    }
    if (existing.status !== "ACTIVE") {
      throw new Error("BREAK_GLASS_INVALID_TRANSITION");
    }
    await writeAuditEvent(
      {
        event_type: "BREAK_GLASS_EXPIRED",
        outcome: "SUCCESS",
        actor_entity_id: existing.source_entity_id,
        details: { grant_id: grantId, action_type: existing.action_type },
      },
      tx,
    );
    return tx.breakGlassGrant.update({
      where: { grant_id: grantId },
      data: { status: "EXPIRED", expired_at: new Date() },
    });
  });
}

// WHAT: Record the mandatory post-hoc two-person review of a grant.
// INPUT: grantId + reviewerEntityId (must be DISTINCT from the source/invoker).
// OUTPUT: The updated BreakGlassGrant (status = REVIEWED).
// WHY: GOVSEC.5 / ADR-0050 require a mandatory two-person audit/review. The
//      reviewer must NOT be the initiator (self-review forbidden) — this
//      preserves the two-person integrity that break-glass would otherwise
//      bypass, and mirrors the GAP-C1 self-approval prohibition. Writes
//      BREAK_GLASS_REVIEWED in the same tx. REVIEWED is terminal (idempotency
//      guard rejects re-review).
export async function reviewBreakGlassGrant(
  grantId: string,
  reviewerEntityId: string,
): Promise<BreakGlassGrant> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.breakGlassGrant.findUnique({
      where: { grant_id: grantId },
    });
    if (existing === null) {
      throw new Error("BREAK_GLASS_NOT_FOUND");
    }
    if (reviewerEntityId === existing.source_entity_id) {
      throw new Error("BREAK_GLASS_SELF_REVIEW_FORBIDDEN");
    }
    if (existing.status === "REVIEWED") {
      throw new Error("BREAK_GLASS_INVALID_TRANSITION");
    }
    await writeAuditEvent(
      {
        event_type: "BREAK_GLASS_REVIEWED",
        outcome: "SUCCESS",
        actor_entity_id: reviewerEntityId,
        target_entity_id: existing.source_entity_id,
        details: {
          grant_id: grantId,
          action_type: existing.action_type,
          prior_status: existing.status,
        },
      },
      tx,
    );
    return tx.breakGlassGrant.update({
      where: { grant_id: grantId },
      data: {
        status: "REVIEWED",
        reviewed_at: new Date(),
        reviewed_by_entity_id: reviewerEntityId,
      },
    });
  });
}
