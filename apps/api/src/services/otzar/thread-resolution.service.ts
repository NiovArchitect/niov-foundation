// FILE: apps/api/src/services/otzar/thread-resolution.service.ts
// PURPOSE: [OTZAR-CONTINUITY P5 Stage 1 wiring] Resolve ONE server-authoritative
//          conversation thread before continuity / references / model / tools.
//          Replaces actor+org *recency* as the normal path with explicit thread
//          resolution:
//            - a supplied thread id is validated for exact org/subject/Twin/lifecycle
//              (a foreign/deleted thread never attaches — a fresh own thread is minted);
//            - with NO id, an eligible active thread is restored ONLY when
//              unambiguous, otherwise a new thread is created.
//          "Unambiguous" restoration preserves the shipped ambient behavior: when the
//          caller's unresolved calendar obligations all live in ONE thread, that thread
//          is restored (so a bare "yes" still finds — and can disambiguate among — its
//          pending proposals); else a single recent ACTIVE thread; else mint.
// CONNECTS TO: @niov/database thread lifecycle service (createThread/getThread/
//          assertThreadScope), otzar.service.ts (conductSession), calendar-continuity
//          (its proposals are WorkLedgerEntry rows carrying the bound conversation_id).

import {
  prisma,
  createThread,
  getThread,
  assertThreadScope,
  ThreadScopeError,
} from "@niov/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROPOSAL_LEDGER_SOURCE = "otzar_calendar_proposal";
// Recency window for restoring an active thread when there is no pending obligation.
const RESTORE_ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface ResolveThreadArgs {
  conversation_id?: string | undefined;
  org_entity_id: string;
  subject_entity_id: string;
  twin_entity_id: string;
  timezone?: string | null;
  now_ms: number;
}

export interface ResolvedThread {
  conversation_id: string;
  /** How the id was obtained — for observability + tests. */
  origin: "supplied" | "restored_obligation" | "restored_active" | "created";
}

/** Distinct conversation_ids that the caller's unresolved calendar proposals are bound to. */
export async function pendingObligationThreads(
  orgId: string,
  subjectId: string,
): Promise<string[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgId,
      owner_entity_id: subjectId,
      ledger_type: "MEETING",
      status: "NEEDS_CALLER_CONFIRMATION",
      details: { path: ["source"], equals: PROPOSAL_LEDGER_SOURCE },
      conversation_id: { not: null },
    },
    select: { conversation_id: true },
    take: 50,
  });
  const distinct = new Set<string>();
  for (const r of rows) if (r.conversation_id) distinct.add(r.conversation_id);
  return [...distinct];
}

/** The caller's recent, eligible (ACTIVE, not deleted) threads, newest first. */
async function recentActiveThreads(
  orgId: string,
  subjectId: string,
  nowMs: number,
): Promise<string[]> {
  const since = new Date(nowMs - RESTORE_ACTIVE_WINDOW_MS);
  const rows = await prisma.otzarConversation.findMany({
    where: {
      org_entity_id: orgId,
      entity_id: subjectId,
      status: "ACTIVE",
      deleted_at: null,
      last_active_at: { gte: since },
    },
    orderBy: { last_active_at: "desc" },
    select: { conversation_id: true },
    take: 5,
  });
  return rows.map((r) => r.conversation_id);
}

/**
 * Resolve the authoritative thread. Requires a real org (caller ensures orgless
 * sessions skip turn persistence entirely).
 */
export async function resolveAuthoritativeThread(
  args: ResolveThreadArgs,
): Promise<ResolvedThread> {
  const scope = {
    org_entity_id: args.org_entity_id,
    subject_entity_id: args.subject_entity_id,
    twin_entity_id: args.twin_entity_id,
  };

  // A. Supplied thread id → validate exact scope; create if it does not yet exist;
  //    never attach to a foreign/deleted thread (mint a fresh own one instead).
  if (typeof args.conversation_id === "string" && UUID_RE.test(args.conversation_id)) {
    const existing = await getThread(args.conversation_id);
    if (existing === null) {
      const t = await createThread({
        conversation_id: args.conversation_id,
        org_entity_id: args.org_entity_id,
        subject_entity_id: args.subject_entity_id,
        twin_entity_id: args.twin_entity_id,
        timezone: args.timezone ?? null,
      });
      return { conversation_id: t.conversation_id, origin: "supplied" };
    }
    try {
      await assertThreadScope(args.conversation_id, scope);
      return { conversation_id: args.conversation_id, origin: "supplied" };
    } catch (e) {
      if (!(e instanceof ThreadScopeError)) throw e;
      // Foreign / deleted → do NOT expose it; mint a fresh own thread.
      const t = await createThread({
        org_entity_id: args.org_entity_id,
        subject_entity_id: args.subject_entity_id,
        twin_entity_id: args.twin_entity_id,
        timezone: args.timezone ?? null,
      });
      return { conversation_id: t.conversation_id, origin: "created" };
    }
  }

  // B. No id → restore ONLY when unambiguous.
  //    B1: all unresolved obligations in ONE thread → restore it (preserves the
  //        shipped "bare yes finds/disambiguates its pending proposals" behavior).
  const obligationThreads = await pendingObligationThreads(args.org_entity_id, args.subject_entity_id);
  if (obligationThreads.length === 1) {
    return { conversation_id: obligationThreads[0]!, origin: "restored_obligation" };
  }
  //    B2: exactly one recent ACTIVE thread → restore it.
  if (obligationThreads.length === 0) {
    const active = await recentActiveThreads(args.org_entity_id, args.subject_entity_id, args.now_ms);
    if (active.length === 1) {
      return { conversation_id: active[0]!, origin: "restored_active" };
    }
  }
  //    C. Otherwise create a new thread.
  const t = await createThread({
    org_entity_id: args.org_entity_id,
    subject_entity_id: args.subject_entity_id,
    twin_entity_id: args.twin_entity_id,
    timezone: args.timezone ?? null,
  });
  return { conversation_id: t.conversation_id, origin: "created" };
}
