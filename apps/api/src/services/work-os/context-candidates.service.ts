// FILE: context-candidates.service.ts
// PURPOSE: [AIX-3] Deterministic candidate relevance — DERIVED ONLY, zero
//          writes. Given one work row a caller can already see, compute
//          which SEEDED background context (v1: seeded documents — the one
//          seeded surface humans never otherwise encounter, since
//          DOCUMENT_CONTEXT is excluded from every work view) MAY relate
//          to it, from deterministic signals only:
//            - title/name token overlap (≥2 significant shared tokens)
//            - internal participant full-name mention (owner/requester/
//              target display names, ≥2 words — never external names)
//            - covering-period year overlap (SUPPORTING only — never a
//              candidate by itself)
//          This is NOT retrieval, NOT assignment, NOT truth: every
//          candidate is "possible context — needs confirmation" and its
//          only path forward is the EXISTING AIX-2 validation affordance
//          on the seeded row. AIX-2 human signals feed back in: stale /
//          wrong_scope / contradicted context is SUPPRESSED (never
//          re-suggested); confirmed / needs_clarifier surfaces with its
//          validation label. Why derived, not persisted: the Dandelion
//          seed lane's APPROVE carries operational apply semantics
//          (resulting_action) — persisting relevance there would make
//          approval fake or truth-promoting (the setup-coach lesson).
//          Noise policy: one candidate per seeded source, ≥1 strong
//          signal required, hard cap of 3 per work row, most-signals
//          first. Permission: the pool is ownerless org-wide context —
//          a manager/admin read (same party model as getLedgerEntry) —
//          so non-managers get silence, not a leak.
// CONNECTS TO: work-ledger.service.ts (getLedgerEntry party check,
//          seededOriginFromDetails labels), context-relevance.service.ts
//          (AIX-2 — the one validation mechanism), routes/work-os-ledger
//          .routes.ts (GET /work-os/ledger/:id/context-candidates), the
//          AIX doctrine Part 7, tests/integration/context-candidates
//          .test.ts.

import { prisma } from "@niov/database";
import {
  getLedgerEntry,
  seededOriginFromDetails,
  type SeededOriginProjection,
} from "./work-ledger.service.js";

/** Customer-safe candidate projection. The ledger_entry_id rides along so
 *  the UI can route validation to the EXISTING AIX-2 endpoint — it is
 *  never rendered as copy. Raw internal states never appear. */
export interface ContextCandidateProjection {
  /** The seeded row this candidate points at (for the AIX-2 POST). */
  ledger_entry_id: string;
  /** The seeded source's own title — visible only to authorized callers. */
  title_label: string;
  /** e.g. "Seeded document context · Process / SOP" (AIX-1 labels). */
  origin_label: string;
  covering_period_label?: string;
  /** Always confirmation-first, e.g. "May relate to this work — needs confirmation." */
  status_label: string;
  /** One human sentence on WHY this was suggested. */
  reason_label: string;
  /** The deterministic signals, as short labels. */
  signal_labels: string[];
  /** Present when a human already validated the source (AIX-2 labels). */
  validation_state_label?: string;
  validation_guidance?: string;
}

export const CONTEXT_CANDIDATES_MAX = 3;

// Suppressed by human validation: never re-suggest what a human said is
// outdated, out of scope, or contradicted. (v1: wrong_scope suppresses
// globally — the validation record carries no scope, so conservative.)
const SUPPRESSED_STATES = new Set(["stale", "wrong_scope", "contradicted"]);

// [RETENTION] retired context is out of ACTIVE USE everywhere the AIX
// gate feeds (candidates, clarity retrieval, ambient + named-subject
// answers) — while the row, capture, audit, and lineage stay preserved.
export function isContextRetired(details: unknown): boolean {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return false;
  const lc = (details as Record<string, unknown>).context_lifecycle;
  if (typeof lc !== "object" || lc === null || Array.isArray(lc)) return false;
  return (lc as Record<string, unknown>).state === "retired";
}

const STOPWORDS = new Set([
  "this", "that", "with", "from", "have", "will", "your", "ours", "their",
  "about", "into", "over", "under", "when", "what", "which", "where",
  "context", "document", "process", "policy", "team", "work", "item",
  "notes", "note", "summary", "meeting", "update", "updates", "plan",
]);

export function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

function yearsIn(text: string): Set<string> {
  return new Set(text.match(/\b20\d{2}\b/g) ?? []);
}

export interface CandidateTarget {
  title: string;
  created_at: Date;
  /** Internal participant display names (owner/requester/target). */
  participant_names: string[];
}

export interface SeededPoolRow {
  ledger_entry_id: string;
  title: string;
  summary: string | null;
  details: unknown;
}

/** Pure deterministic derivation — no I/O, fully testable. */
export function deriveContextRelevanceCandidates(
  target: CandidateTarget,
  pool: SeededPoolRow[],
): ContextCandidateProjection[] {
  const targetTokens = significantTokens(target.title);
  const targetYear = String(target.created_at.getUTCFullYear());
  // Whole-name matching for INTERNAL participants only; single-word names
  // are skipped (no first-name noise, no name-only external merges).
  const fullNames = target.participant_names
    .map((n) => n.trim())
    .filter((n) => n.split(/\s+/).length >= 2);

  const scored: Array<{ candidate: ContextCandidateProjection; strong: number; total: number }> = [];
  for (const row of pool) {
    if (isContextRetired(row.details)) continue; // [RETENTION] retired = out of active use
    const seeded: SeededOriginProjection | undefined = seededOriginFromDetails(row.details);
    if (seeded === undefined) continue; // not seeded context — never suggested
    // Human suppression (AIX-2 feedback loop) — read from raw details so
    // suppression works even though labels are what cross the wire.
    const d =
      typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : {};
    const cr =
      typeof d.context_relevance === "object" && d.context_relevance !== null && !Array.isArray(d.context_relevance)
        ? (d.context_relevance as Record<string, unknown>)
        : null;
    if (cr !== null && typeof cr.state === "string" && SUPPRESSED_STATES.has(cr.state)) continue;

    const seedText = `${row.title} ${row.summary ?? ""}`;
    const seedTokens = significantTokens(seedText);
    const sharedTokens = [...targetTokens].filter((t) => seedTokens.has(t));
    const seedTextLower = seedText.toLowerCase();
    const namedParticipants = fullNames.filter((n) => seedTextLower.includes(n.toLowerCase()));

    const signals: string[] = [];
    let strong = 0;
    if (sharedTokens.length >= 2) {
      signals.push("The names in both items match");
      strong += 1;
    }
    if (namedParticipants.length > 0) {
      signals.push(`It names ${namedParticipants[0]!}, who is on this work`);
      strong += 1;
    }
    // Supporting only — a year overlap alone is never a candidate.
    const periodYears =
      typeof (d.seeded_context as Record<string, unknown> | undefined)?.covering_period === "string"
        ? yearsIn((d.seeded_context as Record<string, unknown>).covering_period as string)
        : new Set<string>();
    if (periodYears.has(targetYear)) {
      signals.push("It covers the same time period");
    }
    if (strong === 0) continue;

    scored.push({
      strong,
      total: signals.length,
      candidate: {
        ledger_entry_id: row.ledger_entry_id,
        title_label: row.title,
        origin_label: seeded.origin_label,
        ...(seeded.covering_period_label !== undefined
          ? { covering_period_label: seeded.covering_period_label }
          : {}),
        status_label:
          seeded.validation_state_label !== undefined
            ? seeded.validation_state_label
            : "May relate to this work — needs confirmation",
        reason_label: `Possible context: ${signals
          .map((s) => s.charAt(0).toLowerCase() + s.slice(1))
          .join("; ")}. Background until confirmed.`,
        signal_labels: signals,
        ...(seeded.validation_state_label !== undefined
          ? { validation_state_label: seeded.validation_state_label }
          : {}),
        ...(seeded.validation_guidance !== undefined
          ? { validation_guidance: seeded.validation_guidance }
          : {}),
      },
    });
  }
  return scored
    .sort((a, b) => b.strong - a.strong || b.total - a.total)
    .slice(0, CONTEXT_CANDIDATES_MAX)
    .map((s) => s.candidate);
}

// ── [AIX-6] Subject-mode derivation ─────────────────────────────────────────
// For NAMED-SUBJECT questions ("What do we know about Project Phoenix?")
// there is no target row — the subject phrase itself is the query. The
// fidelity rule is stricter than row-mode: EVERY significant subject token
// must appear in the seeded text (subset match). A partial match would be
// an answer about the wrong thing — the zero-error rule forbids it. Same
// pool, same suppression, same labels, same cap as row-mode; one matcher
// family, no second retrieval system.
export function deriveSubjectBackgroundCandidates(
  subject: string,
  pool: SeededPoolRow[],
): ContextCandidateProjection[] {
  const subjectTokens = [...significantTokens(subject)];
  if (subjectTokens.length === 0) return [];
  const matched: ContextCandidateProjection[] = [];
  for (const row of pool) {
    if (isContextRetired(row.details)) continue; // [RETENTION] retired = out of active use
    const seeded = seededOriginFromDetails(row.details);
    if (seeded === undefined) continue;
    const d =
      typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : {};
    const cr =
      typeof d.context_relevance === "object" && d.context_relevance !== null && !Array.isArray(d.context_relevance)
        ? (d.context_relevance as Record<string, unknown>)
        : null;
    if (cr !== null && typeof cr.state === "string" && SUPPRESSED_STATES.has(cr.state)) continue;
    const seedTokens = significantTokens(`${row.title} ${row.summary ?? ""}`);
    if (!subjectTokens.every((t) => seedTokens.has(t))) continue;
    matched.push({
      ledger_entry_id: row.ledger_entry_id,
      title_label: row.title,
      origin_label: seeded.origin_label,
      ...(seeded.covering_period_label !== undefined
        ? { covering_period_label: seeded.covering_period_label }
        : {}),
      status_label:
        seeded.validation_state_label !== undefined
          ? seeded.validation_state_label
          : "May relate to this work — needs confirmation",
      reason_label: `Possible context: it mentions ${subject.trim()}. Background until confirmed.`,
      signal_labels: [`It mentions ${subject.trim()}`],
      ...(seeded.validation_state_label !== undefined
        ? { validation_state_label: seeded.validation_state_label }
        : {}),
      ...(seeded.validation_guidance !== undefined
        ? { validation_guidance: seeded.validation_guidance }
        : {}),
    });
    if (matched.length >= CONTEXT_CANDIDATES_MAX) break;
  }
  return matched;
}

export type ContextCandidatesResult =
  | { ok: true; candidates: ContextCandidateProjection[] }
  | { ok: false; code: "NOT_FOUND"; message: string };

/** Read-only: derive candidates for ONE work row the caller can see. */
export async function getContextCandidatesForLedgerEntry(args: {
  ledger_entry_id: string;
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
}): Promise<ContextCandidatesResult> {
  const target = await getLedgerEntry(args);
  if (target.ok === false) {
    return { ok: false, code: "NOT_FOUND", message: "ledger entry not found" };
  }
  // Context is never suggested FOR context — seeded rows validate
  // themselves through AIX-2 directly.
  if (target.entry.seeded_origin !== undefined) return { ok: true, candidates: [] };
  // Permission: the v1 pool is ownerless org-wide seeded documents — a
  // manager/admin read under the existing party model. Non-managers get
  // silence (empty), never a leak of titles they could not open.
  if (!args.is_manager) return { ok: true, candidates: [] };

  const pool = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: args.org_entity_id, ledger_type: "DOCUMENT_CONTEXT" },
    orderBy: { created_at: "desc" },
    take: 200,
    select: { ledger_entry_id: true, title: true, summary: true, details: true },
  });

  const participantIds = [
    target.entry.owner_entity_id,
    target.entry.requester_entity_id,
    target.entry.target_entity_id,
  ].filter((v): v is string => typeof v === "string");
  const participants =
    participantIds.length > 0
      ? await prisma.entity.findMany({
          where: { entity_id: { in: participantIds } },
          select: { display_name: true },
        })
      : [];

  const candidates = deriveContextRelevanceCandidates(
    {
      title: target.entry.title,
      created_at: new Date(target.entry.created_at),
      participant_names: participants
        .map((p) => p.display_name ?? "")
        .filter((n) => n.length > 0),
    },
    pool,
  );
  return { ok: true, candidates };
}
