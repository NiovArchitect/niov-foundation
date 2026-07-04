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
  if (/(why).*(here|assigned|me|mine|have this|this work)/.test(q)) return "WHY_HERE";
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
      return {
        ok: true,
        answer: {
          answer: `This came from ${sourcePhrase(lineage.source_system)}.${who}`,
          confidence: "high",
          used_sources: ["source_lineage"],
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
