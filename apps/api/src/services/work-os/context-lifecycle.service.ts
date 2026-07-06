// FILE: context-lifecycle.service.ts
// PURPOSE: [RETENTION] The first governed lifecycle write — RETIRE seeded
//          context from active use (and safely restore it). This is
//          retention, not relevance curation, and it is NOT deletion:
//          retiring writes additive details.context_lifecycle JSON on a
//          SEEDED row only — the row, its durable capture, its audit
//          trail, its source lineage, and any human-reviewed work
//          extracted from it are all preserved untouched. What changes
//          is USE: retired context is suppressed at the AIX-3 gate (so
//          candidates, clarity retrieval, ambient answers, and
//          named-subject answers all stop consuming it) and the
//          extraction preview refuses it. Admin-gated (lifecycle is
//          boundary governance, not a party action), org-scoped,
//          idempotent, audited once per real change, reversible
//          (restore = state "active" through the same rail). Hard
//          delete, purge, legal hold, and retention windows are NOT
//          implemented — deliberately.
// CONNECTS TO: context-candidates.service.ts (isContextRetired — the one
//          suppression read), document-extraction.service.ts (refuses
//          retired sources), seededOriginFromDetails (the "Retired from
//          active context" label), routes/work-os-ledger.routes.ts
//          (POST /work-os/ledger/:id/context-lifecycle), CT /retention,
//          tests/integration/context-lifecycle.test.ts.

import { prisma } from "@niov/database";
import { getLedgerEntry, type WorkLedgerView } from "./work-ledger.service.js";

export const CONTEXT_LIFECYCLE_STATES = ["active", "retired"] as const;
export type ContextLifecycleState = (typeof CONTEXT_LIFECYCLE_STATES)[number];
export const LIFECYCLE_REASON_MAX = 280;

export type SetContextLifecycleResult =
  | { ok: true; entry: WorkLedgerView; changed: boolean; state: ContextLifecycleState }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_SEEDED_CONTEXT" | "INVALID_REQUEST";
      message: string;
    };

/** Retire seeded context from active use, or restore it. Admin authority
 *  is enforced by the route; this service enforces tenant + seeded-only
 *  + idempotency. Additive JSON — nothing is deleted, ever. */
export async function setSeededContextLifecycle(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  state: string;
  reason?: string;
}): Promise<SetContextLifecycleResult> {
  if (!CONTEXT_LIFECYCLE_STATES.includes(args.state as ContextLifecycleState)) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Lifecycle can be set to active or retired — nothing is ever deleted here.",
    };
  }
  const state = args.state as ContextLifecycleState;
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: args.ledger_entry_id },
  });
  if (row === null || row.org_entity_id !== args.org_entity_id) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  const details =
    typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const seeded = details.seeded_context;
  if (typeof seeded !== "object" || seeded === null || Array.isArray(seeded)) {
    return {
      ok: false,
      code: "NOT_SEEDED_CONTEXT",
      message: "Only seeded background context has a lifecycle here — live work follows work policy.",
    };
  }
  const reason =
    typeof args.reason === "string" && args.reason.trim().length > 0
      ? args.reason.trim().slice(0, LIFECYCLE_REASON_MAX)
      : undefined;

  const existing =
    typeof details.context_lifecycle === "object" &&
    details.context_lifecycle !== null &&
    !Array.isArray(details.context_lifecycle)
      ? (details.context_lifecycle as Record<string, unknown>)
      : null;
  const currentState = existing !== null && existing.state === "retired" ? "retired" : "active";
  const unchanged = currentState === state;
  if (!unchanged) {
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: row.ledger_entry_id },
      data: {
        // Additive JSON — seeded_context, document metadata,
        // context_relevance, and every other key survive verbatim.
        details: {
          ...details,
          context_lifecycle: {
            state,
            set_by: args.caller_entity_id,
            set_at: new Date().toISOString(),
            ...(reason !== undefined ? { reason } : {}),
            source: "admin_lifecycle",
          },
        },
      },
    });
  }
  const view = await getLedgerEntry({
    ledger_entry_id: row.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: true, // route-enforced: only managers/admins reach this
  });
  if (view.ok === false) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  return { ok: true, entry: view.entry, changed: !unchanged, state };
}
