// FILE: background-answer.service.ts
// PURPOSE: [AIX-6] Org-scoped NAMED-SUBJECT background answers — "What do
//          we know about Project Phoenix?" asked with no selected item.
//          Deterministic end to end, zero-error by construction:
//          - the SUBJECT is extracted by tight patterns (deictic
//            subjects like "this customer" refuse — the item-scoped
//            AIX-5 rail owns those); no pattern → honest refusal, and
//            action phrasings never match at all
//          - LIVE WORK answers first (ranking law rank 1): rows the
//            caller is already allowed to see (party-scoped for
//            employees, org-wide for managers — mirrors My Work / Team
//            Work), matched with subject fidelity (EVERY significant
//            subject token in the title; a partial match would answer
//            about the wrong thing)
//          - SEEDED BACKGROUND follows (ranks 4–5) via the AIX-6
//            subject-mode derivation over the AIX-3 pool rules:
//            manager/admin-only (the pool is ownerless org-wide
//            context), AIX-2 suppression honored, capped, mapped
//            through the AIX-4 retrieval contract labels
//          - nothing matched → the honest sentence, never a guess.
//          READ-ONLY. Explanatory only: never a suggested action, never
//          a write, confidence capped at medium.
// CONNECTS TO: context-candidates.service.ts (subject-mode derivation),
//          context-retrieval.service.ts (contract + ranking law),
//          routes/work-os-ledger.routes.ts (GET
//          /work-os/context/background-answer), CT clarity-phrases
//          subject recognizer, tests/integration/background-answer
//          .test.ts.

import { prisma } from "@niov/database";
import {
  deriveSubjectBackgroundCandidates,
  significantTokens,
} from "./context-candidates.service.js";
import {
  compareTruthWeight,
  composeSupersededCorrection,
  computeTruthWeight,
  lineageFromDetails,
} from "../otzar/truth-weight.service.js";

// Tight subject extraction — mirrors the CT recognizer. The trailing
// capture is the subject; deictic subjects (this/it/that…) refuse here
// so the item-scoped rail keeps owning them.
const SUBJECT_PATTERNS: ReadonlyArray<RegExp> = [
  /^what do we know about (.+?)[?.!\s]*$/i,
  /^(?:any|is there(?: any)?) (?:background|context) (?:on|for|about) (.+?)[?.!\s]*$/i,
  /^what (?:background|context) do we have (?:on|for|about) (.+?)[?.!\s]*$/i,
  /^is there historical context for (.+?)[?.!\s]*$/i,
];

const DEICTIC_SUBJECT = /^(this|it|that)\b/i;
export const SUBJECT_MAX = 120;

/** Extract the named subject, or null when this is not a named-subject
 *  background question (unmatched shapes and deictic subjects refuse). */
export function extractBackgroundSubject(question: string): string | null {
  const q = question.trim();
  if (q.length === 0 || q.length > 300) return null;
  for (const re of SUBJECT_PATTERNS) {
    const m = re.exec(q);
    if (m !== null) {
      const subject = (m[1] ?? "").trim().slice(0, SUBJECT_MAX);
      if (subject.length === 0 || DEICTIC_SUBJECT.test(subject)) return null;
      return subject;
    }
  }
  return null;
}

export interface BackgroundAnswer {
  answer: string;
  confidence: "medium" | "low";
  used_sources: string[];
}

export type BackgroundAnswerResult =
  | { ok: true; answer: BackgroundAnswer }
  | { ok: false; code: "INVALID_REQUEST"; message: string };

/** Answer one named-subject background question from governed truth. */
export async function answerNamedSubjectBackground(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  question: string;
}): Promise<BackgroundAnswerResult> {
  const subject = extractBackgroundSubject(args.question);
  if (subject === null) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message:
        "Ask about a named project or topic — for example, \"What do we know about Project Phoenix?\"",
    };
  }
  const subjectTokens = [...significantTokens(subject)];
  if (subjectTokens.length === 0) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: `Otzar needs a more specific name than "${subject}" to look anything up.`,
    };
  }

  // Rank 1 — LIVE WORK the caller can already see. Party-scoped for
  // employees, org-wide for managers (the My Work / Team Work model);
  // the work-view exclusions apply (context/goal/seed rows are not work).
  const liveRows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      ledger_type: { notIn: ["ORG_SEEDING", "GOAL", "DOCUMENT_CONTEXT"] },
      NOT: { status: { in: ["CANCELLED", "EXPIRED"] } },
      ...(args.is_manager
        ? {}
        : {
            OR: [
              { owner_entity_id: args.caller_entity_id },
              { target_entity_id: args.caller_entity_id },
              { requester_entity_id: args.caller_entity_id },
            ],
          }),
    },
    orderBy: [{ created_at: "desc" }, { ledger_entry_id: "desc" }],
    take: 200,
    select: {
      ledger_entry_id: true,
      title: true,
      owner_entity_id: true,
      details: true,
      created_at: true,
    },
  });
  // Subject fidelity: EVERY significant subject token must be in the title.
  const subjectMatched = liveRows.filter((r) => {
    const t = significantTokens(r.title);
    return subjectTokens.every((tok) => t.has(tok));
  });
  // [BLOCK-3C on AIX-6] Truth-weight the matches through their stamped
  // lineage: superseded rows are NOT presented as live truth — they are
  // replaced by ONE calm correction naming the current source (only when
  // the caller could see that row through the same visibility model);
  // the rest order by weight class (an authorized decision beats a newer
  // proposal — recency breaks ties only within a class); rows carrying
  // honest flags (exceeds-authority / recommend-only / recollection)
  // keep ONE quiet flag on their line. Rows with no lineage stamp weigh
  // neutrally, exactly as before.
  const weighed = subjectMatched.map((r) => {
    const lineage = lineageFromDetails(r.details);
    const weight = lineage !== null ? computeTruthWeight(lineage) : null;
    return { row: r, lineage, weight };
  });
  const supersededMatches = weighed.filter((w) => w.weight?.weight_class === "superseded");
  let supersededCorrection: string | null = null;
  const successorId = supersededMatches
    .map((w) => w.lineage?.superseded_by ?? null)
    .find((id): id is string => id !== null);
  if (successorId !== undefined) {
    const successor = await prisma.workLedgerEntry.findUnique({
      where: { ledger_entry_id: successorId },
      select: {
        title: true,
        org_entity_id: true,
        owner_entity_id: true,
        requester_entity_id: true,
        target_entity_id: true,
      },
    });
    const callerMaySee =
      successor !== null &&
      successor.org_entity_id === args.org_entity_id &&
      (args.is_manager ||
        successor.owner_entity_id === args.caller_entity_id ||
        successor.requester_entity_id === args.caller_entity_id ||
        successor.target_entity_id === args.caller_entity_id);
    supersededCorrection = callerMaySee
      ? composeSupersededCorrection({
          staleTitle: supersededMatches[0]!.row.title,
          currentTitle: successor.title,
        })
      : "One older plan matching this was superseded by a newer approved decision.";
  } else if (supersededMatches.length > 0) {
    supersededCorrection = "One older plan matching this was superseded by a newer approved decision.";
  }
  const liveMatches = weighed
    .filter((w) => w.weight?.weight_class !== "superseded")
    .sort((a, b) => {
      if (a.weight === null && b.weight === null) return 0;
      if (a.weight === null) return 1;
      if (b.weight === null) return -1;
      return compareTruthWeight(
        { weight: a.weight, source_date: a.lineage?.source_date ?? a.row.created_at.toISOString() },
        { weight: b.weight, source_date: b.lineage?.source_date ?? b.row.created_at.toISOString() },
      );
    })
    .slice(0, 3)
    .map((w) => ({
      ledger_entry_id: w.row.ledger_entry_id,
      title: w.row.title,
      owner_entity_id: w.row.owner_entity_id,
      flag: w.weight !== null && w.weight.flags.length > 0 ? w.weight.flags[0]! : null,
    }));
  const ownerIds = liveMatches
    .map((r) => r.owner_entity_id)
    .filter((v): v is string => typeof v === "string");
  const owners = ownerIds.length
    ? await prisma.entity.findMany({
        where: { entity_id: { in: ownerIds } },
        select: { entity_id: true, display_name: true },
      })
    : [];
  const ownerName = (id: string | null): string | null => {
    if (id === null) return null;
    if (id === args.caller_entity_id) return "you";
    return owners.find((o) => o.entity_id === id)?.display_name ?? null;
  };

  // Ranks 4–5 — seeded background via the subject-mode derivation over
  // the AIX-3 pool rules: manager/admin-only, suppression-aware, capped.
  const seededCandidates = args.is_manager
    ? deriveSubjectBackgroundCandidates(
        subject,
        await prisma.workLedgerEntry.findMany({
          // [SOURCE-INTEGRITY] ALLOWLIST to VERIFIED (withdrawn/terminal rows
          // never answer). deriveSubjectBackgroundCandidates applies the
          // source_integrity demotion JS post-filter over this pool.
          where: { org_entity_id: args.org_entity_id, ledger_type: "DOCUMENT_CONTEXT", status: "VERIFIED" },
          orderBy: { created_at: "desc" },
          take: 200,
          select: { ledger_entry_id: true, title: true, summary: true, details: true },
        }),
      )
    : [];
  // Ranking inside the background section: confirmed (rank 4) first.
  const seededSorted = [...seededCandidates].sort((a, b) => {
    const ra = a.validation_state_label === "Confirmed current" ? 4 : 5;
    const rb = b.validation_state_label === "Confirmed current" ? 4 : 5;
    return ra - rb;
  });

  if (liveMatches.length === 0 && seededSorted.length === 0 && supersededCorrection === null) {
    return {
      ok: true,
      answer: {
        answer: `Otzar doesn't have live work or seeded background matching "${subject}" yet — nothing was guessed.`,
        confidence: "low",
        used_sources: ["work_ledger"],
      },
    };
  }

  const parts: string[] = [];
  const sources: string[] = ["work_ledger"];
  // The calm correction LEADS when an older matching plan was superseded.
  if (supersededCorrection !== null) parts.push(supersededCorrection);
  if (liveMatches.length > 0) {
    const lines = liveMatches.map((r) => {
      const o = ownerName(r.owner_entity_id);
      return `"${r.title}"${o !== null ? (o === "you" ? ", owned by you" : `, owned by ${o}`) : ""}${r.flag !== null ? ` — ${r.flag}` : ""}`;
    });
    parts.push(`Live work is the source of truth here — it mentions ${subject}: ${lines.join("; ")}.`);
  } else if (supersededCorrection === null) {
    parts.push(`No live work mentions ${subject} — only seeded background below, which needs confirmation.`);
  }
  if (seededSorted.length > 0) {
    sources.push("seeded_background_retrieval");
    for (const c of seededSorted) {
      const confirmed = c.validation_state_label === "Confirmed current";
      const period =
        c.covering_period_label !== undefined ? ` (${c.covering_period_label.toLowerCase()})` : "";
      parts.push(
        confirmed
          ? `Confirmed seeded context — "${c.title_label}"${period}: confirmed as current by your team — live work still wins if they conflict. Medium confidence.`
          : c.validation_state_label === "Waiting on the right person"
            ? `Seeded background — "${c.title_label}"${period}: Otzar needs the right person to confirm this before it can be treated as current. Needs confirmation.`
            : `Possible background context — "${c.title_label}"${period}: not confirmed — use as background only, never for action. Background only.`,
      );
    }
  }
  return {
    ok: true,
    answer: {
      answer: parts.join(" "),
      // Never high: this is a match summary, not a verified fact. Medium
      // only when live work or team-confirmed context anchors it.
      confidence:
        liveMatches.length > 0 ||
        seededSorted.some((c) => c.validation_state_label === "Confirmed current")
          ? "medium"
          : "low",
      used_sources: sources,
    },
  };
}
