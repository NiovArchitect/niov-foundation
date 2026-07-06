// FILE: clarity-answer.service.ts
// PURPOSE: [CE-3] Ambient answer wiring — READ-ONLY. Answers an employee's
//          clarity question about ONE work item from canonical truth only:
//          the ledger row (title/status/parties/next action), Gap J source
//          lineage, the CE-1 clarifier ranking, the CE-2 clarification
//          lifecycle (including the clarifier's stored ANSWER text in
//          resolution_metadata), and the routing decision's human reason.
//          Deterministic intent classification — NO LLM, no vibes: when the
//          canonical truth is missing, the answer says so honestly and, when
//          a real CE-1 candidate exists, points at the governed
//          clarification path. Never mutates, never notifies, never
//          escalates — the suggested action is a SUGGESTION the human must
//          click through the existing governed rail.
// CONNECTS TO: clarity.service.ts (rankClarifiers), work-ledger.service.ts
//          (getLedgerEntry), routing-decision.ts (projectRoutingDecision),
//          work-os-ledger.routes.ts (GET :id/clarity-answer),
//          tests/integration/clarity-answer.test.ts.

import { prisma } from "@niov/database";
import { getLedgerEntry } from "./work-ledger.service.js";
import { rankClarifiers, type ClarityProjection } from "./clarity.service.js";
import { projectRoutingDecision } from "./routing-decision.js";
// [AIX-4] confidence-aware seeded-background retrieval (read-only; the
// ranking law lives there). Explanatory only — never an action input.
import { retrieveSeededBackgroundForLedgerEntry } from "./context-retrieval.service.js";
import {
  composeSupersededCorrection,
  computeTruthWeight,
  lineageFromDetails,
} from "../otzar/truth-weight.service.js";

export type ClarityAnswerConfidence = "high" | "medium" | "low";

export interface ClarityAnswer {
  answer: string;
  confidence: ClarityAnswerConfidence;
  used_sources: string[];
  suggested_next_action?: {
    type: "request_clarification";
    clarifier_entity_id: string;
    label: string;
  };
}

type Intent =
  | "WHY_HERE"
  | "WHERE_FROM"
  | "WHO_CLARIFIES"
  | "CLARIFICATION_STATUS"
  | "WHY_APPROVAL"
  | "NEXT_STEP"
  | "WHAT_BACKGROUND"
  | "UNKNOWN";

// Deterministic intent classification — order matters (most specific first).
export function classifyClarityQuestion(question: string): Intent {
  const q = question.toLowerCase();
  if (/clarif/.test(q) && /(happen|status|update|answer|respond|resolve|after)/.test(q)) {
    return "CLARIFICATION_STATUS";
  }
  if (/(who).*(clarif|knows|should i ask|can help|can explain)/.test(q)) {
    return "WHO_CLARIFIES";
  }
  if (/(why).*(approv|sign.?off|review)/.test(q)) return "WHY_APPROVAL";
  if (/(where|what source|who sent).*(come from|came from|from\??$|source)/.test(q) || /where.*from/.test(q)) {
    return "WHERE_FROM";
  }
  // [AIX-4] "what do we know / any background / is there context" —
  // the confidence-aware seeded-background retrieval intent.
  if (
    /what do we know/.test(q) ||
    /(any|what|is there).*(background|context)/.test(q)
  ) {
    return "WHAT_BACKGROUND";
  }
  if (/(why).*(here|assigned|me|mine|have this|this work)/.test(q)) return "WHY_HERE";
  // "who asked for / requested / owns this" are ownership questions —
  // answered by the WHY_HERE composition (owner + requester in human names).
  if (/(who).*(asked for|requested|owns?)\s+(this|it)/.test(q)) return "WHY_HERE";
  if (/(what).*(next|do now|should i do)|next step/.test(q)) return "NEXT_STEP";
  return "UNKNOWN";
}

// Human phrase per recorded source system — mirrors the CT label map's wired
// systems (server-prose precedent: routing-decision reasons).
function sourcePhrase(system: string): string {
  switch (system) {
    case "SLACK":
      return "a Slack message";
    case "ZOOM":
      return "a Zoom recording";
    case "TRANSCRIPT":
    case "COMMS":
      return "a Comms transcript";
    case "MEETING":
      return "a meeting";
    default:
      return "a recorded source";
  }
}

const KNOWN_SYSTEMS = new Set(["SLACK", "ZOOM", "TRANSCRIPT", "COMMS", "MEETING"]);

// WHAT: answer one clarity question about one ledger entry from truth.
// INPUT: org + caller (route-resolved) + entry id + the question text.
// OUTPUT: a structured ClarityAnswer, or the ledger gate's NOT_FOUND.
export async function answerClarityQuestion(args: {
  org_entity_id: string;
  caller_entity_id: string;
  is_manager: boolean;
  ledger_entry_id: string;
  question: string;
}): Promise<
  | { ok: true; answer: ClarityAnswer }
  | { ok: false; code: string; message: string }
> {
  const gated = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    is_manager: args.is_manager,
  });
  if (gated.ok === false) return gated;
  const entry = gated.entry;

  const ranked = await rankClarifiers({
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.caller_entity_id,
    ledger_entry_id: args.ledger_entry_id,
    is_manager: args.is_manager,
  });
  if (ranked.ok === false) return ranked;
  const clarity = ranked.clarity;

  // Party display names (never ids) for answer prose.
  const partyIds = [entry.owner_entity_id, entry.requester_entity_id, entry.target_entity_id]
    .filter((v): v is string => typeof v === "string");
  const parties = partyIds.length
    ? await prisma.entity.findMany({
        where: { entity_id: { in: partyIds } },
        select: { entity_id: true, display_name: true },
      })
    : [];
  const nameOf = (id: string | null | undefined): string | null => {
    if (typeof id !== "string") return null;
    if (id === args.caller_entity_id) return "you";
    return parties.find((p) => p.entity_id === id)?.display_name ?? null;
  };

  const intent = classifyClarityQuestion(args.question);
  const lineage = entry.source_lineage;
  // [AIX-1] a seeded row always answers with the background framing —
  // never presented as current truth.
  const seeded = entry.seeded_origin;
  const suggest = (): ClarityAnswer["suggested_next_action"] => {
    const first = clarity.candidates[0];
    if (first === undefined || clarity.pending_clarification !== undefined) return undefined;
    return {
      type: "request_clarification",
      clarifier_entity_id: first.entity_id,
      label: `Ask ${first.display_name} for clarification`,
    };
  };

  switch (intent) {
    case "WHERE_FROM": {
      if (lineage === undefined || !KNOWN_SYSTEMS.has(lineage.source_system)) {
        const s = suggest();
        return {
          ok: true,
          answer: {
            answer: "The source of this work was not recorded, so Otzar cannot say where it came from.",
            confidence: "low",
            used_sources: ["work_ledger"],
            ...(s !== undefined ? { suggested_next_action: s } : {}),
          },
        };
      }
      const who = lineage.source_actor !== null ? ` ${lineage.source_actor} shared it.` : "";
      // [AIX-1] seeded rows carry the background framing in the answer
      // itself — a seeded source is never presented as current truth.
      const seededNote =
        seeded !== undefined
          ? ` It was provided during setup as ${seeded.origin === "seeded_document" ? "seeded document context" : "seeded history"}${seeded.covering_period_label !== undefined ? ` (${seeded.covering_period_label.toLowerCase()})` : ""} — background context, not confirmed current truth.`
          : "";
      return {
        ok: true,
        answer: {
          answer: `This came from ${sourcePhrase(lineage.source_system)}.${who}${seededNote}`,
          confidence: seeded !== undefined ? "medium" : "high",
          used_sources: seeded !== undefined ? ["source_lineage", "seeded_background"] : ["source_lineage"],
        },
      };
    }

    case "WHY_HERE": {
      const bits: string[] = [];
      const sources: string[] = ["work_ledger"];
      if (lineage !== undefined && KNOWN_SYSTEMS.has(lineage.source_system)) {
        bits.push(`"${entry.title}" came from ${sourcePhrase(lineage.source_system)}.`);
        sources.push("source_lineage");
      } else {
        bits.push(`"${entry.title}" is tracked in your work.`);
      }
      const ownerName = nameOf(entry.owner_entity_id);
      const requesterName = nameOf(entry.requester_entity_id);
      if (ownerName === "you") bits.push("It's assigned to you because you own it.");
      else if (ownerName !== null) bits.push(`${ownerName} owns it.`);
      if (requesterName !== null && requesterName !== ownerName) {
        bits.push(requesterName === "you" ? "You asked for it." : `${requesterName} asked for it.`);
      }
      const confident = sources.includes("source_lineage") || ownerName !== null;
      const s = confident ? undefined : suggest();
      return {
        ok: true,
        answer: {
          answer: bits.join(" "),
          confidence: confident ? "high" : "low",
          used_sources: sources,
          ...(s !== undefined ? { suggested_next_action: s } : {}),
        },
      };
    }

    case "WHO_CLARIFIES": {
      if (clarity.candidates.length === 0) {
        return {
          ok: true,
          answer: {
            answer: "No clarifier is known yet — Otzar does not have enough source context to suggest one.",
            confidence: "low",
            used_sources: ["clarity_projection"],
          },
        };
      }
      const lines = clarity.candidates.map(
        (c) => `${c.display_name} can clarify — ${c.reason.charAt(0).toLowerCase()}${c.reason.slice(1)}`,
      );
      const s = suggest();
      return {
        ok: true,
        answer: {
          answer: lines.join(" "),
          confidence: "high",
          used_sources: ["clarity_projection"],
          ...(s !== undefined ? { suggested_next_action: s } : {}),
        },
      };
    }

    case "CLARIFICATION_STATUS": {
      const p = clarity.pending_clarification;
      if (p === undefined) {
        const s = suggest();
        return {
          ok: true,
          answer: {
            answer: "You haven't requested clarification on this work.",
            confidence: "high",
            used_sources: ["clarity_projection"],
            ...(s !== undefined ? { suggested_next_action: s } : {}),
          },
        };
      }
      if (p.status === "PENDING") {
        return {
          ok: true,
          answer: {
            answer: `A clarification was requested from ${p.clarifier_display_name} and is still waiting.`,
            confidence: "high",
            used_sources: ["clarity_projection"],
          },
        };
      }
      // Resolved — surface the clarifier's stored answer text when present.
      const esc = await prisma.escalationRequest.findUnique({
        where: { escalation_id: p.escalation_id },
        select: { resolution_metadata: true },
      });
      const meta =
        typeof esc?.resolution_metadata === "object" &&
        esc.resolution_metadata !== null &&
        !Array.isArray(esc.resolution_metadata)
          ? (esc.resolution_metadata as Record<string, unknown>)
          : {};
      const answerText = typeof meta.answer === "string" ? meta.answer : null;
      if (p.status === "APPROVED") {
        return {
          ok: true,
          answer: {
            answer:
              answerText !== null
                ? `${p.clarifier_display_name} clarified: "${answerText}"`
                : `${p.clarifier_display_name} clarified this — no written answer was attached.`,
            confidence: "high",
            used_sources: ["clarity_projection", "escalation_resolution"],
          },
        };
      }
      return {
        ok: true,
        answer: {
          answer:
            p.status === "REJECTED"
              ? `${p.clarifier_display_name} declined the clarification request.`
              : `The clarification request to ${p.clarifier_display_name} expired.`,
          confidence: "high",
          used_sources: ["clarity_projection", "escalation_resolution"],
        },
      };
    }

    case "WHAT_BACKGROUND": {
      // [AIX-4] the first surface where seeded context informs answers.
      // Composition order IS the ranking law: live work truth leads
      // (rank 1); retrieved seeded background follows (ranks 4–5) with
      // mandatory attribution + confidence + how-to-treat language.
      // Explanatory only: this intent never suggests or takes an action.
      if (seeded !== undefined) {
        // The row itself is seeded background — say exactly that.
        return {
          ok: true,
          answer: {
            answer: `This item is itself seeded background context (${seeded.origin_label.toLowerCase()}${seeded.covering_period_label !== undefined ? `, ${seeded.covering_period_label.toLowerCase()}` : ""}) — background until live work or the right person confirms it. You can confirm or correct it in View/Why.`,
            confidence: "medium",
            used_sources: ["seeded_background"],
          },
        };
      }
      const retrieved = await retrieveSeededBackgroundForLedgerEntry({
        org_entity_id: args.org_entity_id,
        caller_entity_id: args.caller_entity_id,
        is_manager: args.is_manager,
        ledger_entry_id: args.ledger_entry_id,
      });
      const results = retrieved.ok ? retrieved.results : [];
      // [BLOCK-3C] Truth-weight the row's OWN stamped lineage: if this row
      // was superseded, the answer LEADS with a brief calm correction and
      // the current source — never a source dump, never raw mechanics.
      // Honest flags (exceeds-authority / recommend-only / recollection)
      // follow as ONE quiet sentence. Permission first: the superseding
      // row's title is named only when the caller could see that row
      // through the same party-or-manager gate.
      let truthLead = "";
      let truthFlag = "";
      const rawRow = await prisma.workLedgerEntry.findUnique({
        where: { ledger_entry_id: args.ledger_entry_id },
        select: { details: true },
      });
      const rowLineage = lineageFromDetails(rawRow?.details ?? null);
      if (rowLineage !== null) {
        const weight = computeTruthWeight(rowLineage);
        if (rowLineage.superseded_by !== null) {
          const successor = await prisma.workLedgerEntry.findUnique({
            where: { ledger_entry_id: rowLineage.superseded_by },
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
          truthLead = callerMaySee
            ? `${composeSupersededCorrection({ staleTitle: entry.title, currentTitle: successor.title })} `
            : `You may be looking at an older plan — this was superseded by a newer approved decision. `;
        } else if (weight.flags.length > 0) {
          truthFlag = ` ${weight.flags[0]}`;
        }
      }
      // Rank 1 always leads — live work is the source of truth here.
      const ownerName = nameOf(entry.owner_entity_id);
      const liveLine = `${truthLead}Live work is the source of truth here: "${entry.title}"${ownerName !== null ? (ownerName === "you" ? ", owned by you" : `, owned by ${ownerName}`) : ""}.${truthFlag}`;
      if (results.length === 0) {
        return {
          ok: true,
          answer: {
            answer: `${liveLine} No seeded background context is linked to this work yet.`,
            confidence: "low",
            used_sources: ["work_ledger"],
          },
        };
      }
      const backgroundLines = results.map((r) => {
        const period = r.covering_period_label !== undefined ? ` (${r.covering_period_label.toLowerCase()})` : "";
        return `${r.source_label} — "${r.title_label}"${period}: ${r.how_to_treat} ${r.confidence_label}.`;
      });
      return {
        ok: true,
        answer: {
          answer: `${liveLine} ${backgroundLines.join(" ")}`,
          // Never high from seeded context: medium when something is
          // team-confirmed, low when everything is unvalidated background.
          confidence: results.some((r) => !r.requires_confirmation) ? "medium" : "low",
          used_sources: ["work_ledger", "seeded_background_retrieval"],
        },
      };
    }

    case "WHY_APPROVAL": {
      const routing = projectRoutingDecision(entry);
      const needsApproval =
        entry.status === "NEEDS_APPROVAL" ||
        entry.status === "NEEDS_AUTHORITY" ||
        routing.lane === "ask_approval";
      if (!needsApproval) {
        return {
          ok: true,
          answer: {
            answer: "This work doesn't currently need an approval.",
            confidence: "high",
            used_sources: ["work_ledger"],
          },
        };
      }
      return {
        ok: true,
        answer: {
          answer: routing.reason,
          confidence: "high",
          used_sources: ["work_ledger", "routing_decision"],
        },
      };
    }

    case "NEXT_STEP": {
      const p = clarity.pending_clarification;
      const next =
        entry.next_action ??
        projectRoutingDecision(entry).next_best_action ??
        (p?.status === "PENDING"
          ? `Wait for ${p.clarifier_display_name}'s clarification — it's still pending.`
          : null);
      if (next === null) {
        const s = suggest();
        return {
          ok: true,
          answer: {
            answer: "No next step is recorded for this work yet.",
            confidence: "low",
            used_sources: ["work_ledger"],
            ...(s !== undefined ? { suggested_next_action: s } : {}),
          },
        };
      }
      return {
        ok: true,
        answer: {
          answer: next,
          confidence: "high",
          used_sources: ["work_ledger"],
        },
      };
    }

    default: {
      const s = suggest();
      return {
        ok: true,
        answer: {
          answer:
            "Otzar can't answer that from work records yet. It can tell you where this came from, who can clarify it, what happened to a clarification, why it needs approval, and what to do next.",
          confidence: "low",
          used_sources: [],
          ...(s !== undefined ? { suggested_next_action: s } : {}),
        },
      };
    }
  }
}
