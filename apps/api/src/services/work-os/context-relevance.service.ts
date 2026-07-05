// FILE: context-relevance.service.ts
// PURPOSE: [AIX-2] The FIRST relevance write path — in-context human
//          validation of SEEDED background context ("Is this still
//          current?"). One narrow, deliberate mutation: an authorized
//          human lands details.context_relevance on a seeded ledger row.
//          Everything else is refused:
//            - non-seeded rows (live work is validated by workflows, not
//              by this affordance) → NOT_SEEDED_CONTEXT
//            - cross-tenant / non-party callers → NOT_FOUND
//              (enumeration-safe, same rail as getLedgerEntry)
//          Authorization is conservative by design: a manager/org admin,
//          or a person the row is already about (owner / target /
//          requester). Ownerless org-wide context (seeded documents) has
//          no party — only managers/admins can validate it. A random
//          employee can never mark org-wide seeded context confirmed.
//          The write is additive JSON only (no schema, no status change,
//          no follow-ups, no notifications, no Dandelion seeds, no
//          personal-wallet writes) and idempotent: repeating the same
//          validation by the same person is a no-op. This slice does NOT
//          enable retrieval — it records the human signal AIX-3/AIX-4
//          will consume under the live-work-wins ranking law.
// CONNECTS TO: work-ledger.service.ts (party model, seededOriginFromDetails
//          renders the resulting labels), routes/work-os-ledger.routes.ts
//          (POST /work-os/ledger/:id/context-validation), the AIX doctrine
//          (OTZAR_CONTEXT_RELEVANCE_INTELLIGENCE_AND_AIX_MODEL.md),
//          tests/integration/context-relevance.test.ts.

import { prisma } from "@niov/database";
import { getLedgerEntry, type WorkLedgerView } from "./work-ledger.service.js";

/** Internal relevance states a human validation can set. Never rendered
 *  raw — seededOriginFromDetails maps them to customer-safe labels. */
export const CONTEXT_RELEVANCE_STATES = [
  "confirmed",
  "stale",
  "wrong_scope",
  "contradicted",
  "needs_clarifier",
] as const;
export type ContextRelevanceState = (typeof CONTEXT_RELEVANCE_STATES)[number];

export const CONTEXT_VALIDATION_NOTE_MAX = 280;

export type ValidateContextRelevanceResult =
  | { ok: true; entry: WorkLedgerView; changed: boolean; state: ContextRelevanceState }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_SEEDED_CONTEXT" | "INVALID_REQUEST";
      message: string;
    };

/** Record a human relevance validation on ONE seeded ledger row. */
export async function validateSeededContextRelevance(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  state: string;
  note?: string;
}): Promise<ValidateContextRelevanceResult> {
  if (!CONTEXT_RELEVANCE_STATES.includes(args.state as ContextRelevanceState)) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Choose one of the validation options.",
    };
  }
  const state = args.state as ContextRelevanceState;

  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.ledger_entry_id },
  });
  // Enumeration-safe + tenant-safe: wrong tenant or non-party reads as
  // NOT_FOUND — identical behavior to getLedgerEntry.
  if (row === null || row.org_entity_id !== args.org_entity_id) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  if (
    !args.is_manager &&
    row.owner_entity_id !== args.caller_entity_id &&
    row.target_entity_id !== args.caller_entity_id &&
    row.requester_entity_id !== args.caller_entity_id
  ) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }

  // Seeded rows ONLY. Live work truth is validated by workflows and
  // corrections, never by this affordance.
  const details =
    typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const seeded = details.seeded_context;
  if (typeof seeded !== "object" || seeded === null || Array.isArray(seeded)) {
    return {
      ok: false,
      code: "NOT_SEEDED_CONTEXT",
      message: "Only seeded background context can be validated here.",
    };
  }

  const note =
    typeof args.note === "string" && args.note.trim().length > 0
      ? args.note.trim().slice(0, CONTEXT_VALIDATION_NOTE_MAX)
      : undefined;

  // Idempotent: the same person recording the same state again changes
  // nothing (no update, no fresh timestamp, no duplicate audit upstream).
  const existing =
    typeof details.context_relevance === "object" &&
    details.context_relevance !== null &&
    !Array.isArray(details.context_relevance)
      ? (details.context_relevance as Record<string, unknown>)
      : null;
  const unchanged =
    existing !== null &&
    existing.state === state &&
    existing.confirmed_by === args.caller_entity_id &&
    (existing.note ?? undefined) === note;
  if (!unchanged) {
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: row.ledger_entry_id },
      data: {
        // Additive JSON: every existing details key (seeded_context,
        // document, source lineage…) is preserved verbatim.
        details: {
          ...details,
          context_relevance: {
            state,
            confirmed_by: args.caller_entity_id,
            confirmed_at: new Date().toISOString(),
            ...(note !== undefined ? { note } : {}),
            source: "human_validation",
            applies_to: "seeded_context",
          },
        },
      },
    });
  }

  const view = await getLedgerEntry({
    ledger_entry_id: row.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  // Unreachable in practice (the same party check already passed above) —
  // collapse any re-read failure to the enumeration-safe refusal.
  if (view.ok === false) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  return { ok: true, entry: view.entry, changed: !unchanged, state };
}
