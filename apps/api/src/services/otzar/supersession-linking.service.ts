// FILE: supersession-linking.service.ts
// PURPOSE: [BLOCK-3C] DETERMINISTIC supersession linking — fill the 3B
//          supersedes/superseded_by pointers ONLY when the relationship
//          is explicit and safely matched:
//            explicit superseding language on the NEW statement
//            + same decision domain
//            + ≥2 shared significant title/quote tokens (the AIX-3
//              signal precedent)
//            + EXACTLY ONE older stamped candidate in the org.
//          Anything ambiguous (zero or multiple candidates, no explicit
//          language) links NOTHING — pointers stay null and the older
//          row's currentness stays untouched. Unresolved beats guessed.
//          Fail-open: linking can never block or fail an ingest.
// CONNECTS TO: communication-lineage.service.ts (the stamp being
//          linked), comms-ingest.service.ts (call site, after row
//          creation), truth-weight.service.ts (superseded rows lose),
//          tests/integration/truth-weight-retrieval.test.ts.

import { prisma } from "@niov/database";
import type { CommunicationLineage } from "./communication-lineage.service.js";

/** Explicit supersession language ONLY — the same conservative markers
 *  the act classifier uses, plus "moving/moved X to Y" replacement
 *  phrasing when paired with a superseding/decision act. */
export function hasExplicitSupersessionLanguage(text: string): boolean {
  return /\bsupersede[sd]?\b|\bno longer\b|\breplac(es|ing|ed)\b|\binstead of the (old|previous|original|earlier)\b/i.test(
    text,
  );
}

const STOPWORDS = new Set([
  "the","a","an","to","of","for","and","or","in","on","at","by","with","is","are","was","were",
  "this","that","it","we","you","they","will","would","should","can","could","do","does","did",
  "work","item","task","new","old","plan","update","updated","follow","up",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export interface SupersessionLinkResult {
  linked: boolean;
  superseded_ledger_entry_id?: string;
  /** Honest reason when nothing linked (for tests/telemetry, never UI). */
  reason?: "no_explicit_language" | "no_candidates" | "ambiguous_candidates" | "error";
}

/**
 * Try to link ONE newly-created, lineage-stamped row to the single older
 * row it explicitly supersedes. On the unique match:
 *   - new row:  details.communication_lineage.supersedes = old id
 *   - old row:  details.communication_lineage.superseded_by = new id,
 *               currentness = "superseded"
 * Both updates are additive JSON merges — no other field is touched.
 */
export async function linkSupersessionDeterministically(args: {
  orgEntityId: string;
  newLedgerEntryId: string;
  newTitle: string;
  quote: string;
  lineage: CommunicationLineage;
}): Promise<SupersessionLinkResult> {
  try {
    const actQualifies =
      args.lineage.communication_act === "superseding_decision" ||
      args.lineage.communication_act === "decision" ||
      args.lineage.communication_act === "correction";
    if (!actQualifies || !hasExplicitSupersessionLanguage(args.quote)) {
      return { linked: false, reason: "no_explicit_language" };
    }

    // Participant/speaker NAME tokens are excluded from matching — two
    // rows sharing only an owner's name are not about the same thing.
    const nameTokens = significantTokens(
      [args.lineage.speaker ?? "", ...args.lineage.participants].join(" "),
    );
    const contentTokens = (text: string): Set<string> => {
      const t = significantTokens(text);
      for (const n of nameTokens) t.delete(n);
      return t;
    };
    const newTokens = contentTokens(`${args.newTitle} ${args.quote}`);
    // Older stamped statement rows in the SAME org, different capture.
    // [REDWOOD-LIVE] CANCELLED / EXPIRED rows are SETTLED HISTORY — a
    // withdrawn or lapsed plan can never contend as "the one older plan"
    // a new decision replaces, exactly like already-superseded rows below.
    // This is also what makes the smoke-org live probe repeat-safe: its
    // cleanup rail cancels probe rows, so residue never turns a future
    // run's unique match into ambiguous_candidates.
    const candidates = await prisma.workLedgerEntry.findMany({
      where: {
        org_entity_id: args.orgEntityId,
        ledger_entry_id: { not: args.newLedgerEntryId },
        ledger_type: { in: ["COMMITMENT", "MEETING"] },
        status: { notIn: ["CANCELLED", "EXPIRED"] },
      },
      orderBy: { created_at: "desc" },
      take: 200,
      select: { ledger_entry_id: true, title: true, details: true, evidence: true, conversation_id: true },
    });

    const quoteOf = (evidence: unknown): string => {
      if (!Array.isArray(evidence)) return "";
      const first = evidence[0] as { quote?: unknown } | undefined;
      return typeof first?.quote === "string" ? first.quote : "";
    };
    const matches = candidates.filter((c) => {
      const det = c.details as { communication_lineage?: Partial<CommunicationLineage> } | null;
      const l = det?.communication_lineage;
      if (l === undefined || l === null) return false;
      // Same conversation can't supersede itself; already-superseded rows
      // are settled history.
      if (l.source_artifact_id === args.lineage.source_artifact_id) return false;
      if (l.superseded_by) return false;
      if (l.decision_domain !== args.lineage.decision_domain) return false;
      // Titles alone can be generic ("Follow-up owned by X") — the
      // statement QUOTE carries the real content, so both sides match on
      // title + quote with name tokens removed.
      return sharedTokenCount(newTokens, contentTokens(`${c.title} ${quoteOf(c.evidence)}`)) >= 2;
    });

    if (matches.length === 0) return { linked: false, reason: "no_candidates" };
    if (matches.length > 1) return { linked: false, reason: "ambiguous_candidates" };

    const target = matches[0]!;
    const targetDetails = (target.details ?? {}) as Record<string, unknown>;
    const targetLineage = (targetDetails.communication_lineage ?? {}) as Record<string, unknown>;
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: target.ledger_entry_id },
      data: {
        details: {
          ...targetDetails,
          communication_lineage: {
            ...targetLineage,
            superseded_by: args.newLedgerEntryId,
            currentness: "superseded",
          },
        },
      },
    });
    const newRow = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: args.newLedgerEntryId },
      select: { details: true },
    });
    const newDetails = (newRow?.details ?? {}) as Record<string, unknown>;
    const newLineage = (newDetails.communication_lineage ?? {}) as Record<string, unknown>;
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: args.newLedgerEntryId },
      data: {
        details: {
          ...newDetails,
          communication_lineage: { ...newLineage, supersedes: target.ledger_entry_id },
        },
      },
    });
    return { linked: true, superseded_ledger_entry_id: target.ledger_entry_id };
  } catch {
    return { linked: false, reason: "error" };
  }
}
