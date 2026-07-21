// FILE: work-item-planner.ts
// PURPOSE: [SECTION-12-WORKGRAPH] Turn a governed transcript extraction into
//          per-OWNER work items for the Work Ledger / Action Center — the bridge
//          the founder review found missing ("commitments were not turned into
//          per-user Action Center work"). It is DETERMINISTIC and governed by the
//          same proof-path discipline as recipient-governance: a work item is
//          assigned to a person ONLY when the responsibility graph places them as
//          an owner of that work AND their name resolves to exactly one roster
//          entity. Unproven owner → the item is created UNOWNED + NEEDS_OWNER for
//          admin/lead review (never silently assigned — the Shweta/Shiney leak
//          class applied to work). Support/advisor roles become support edges, not
//          owned tasks (Vishesh). A person with no committed work produces no item
//          (Samiksha is not over-tasked).
//
// WHY TYPESCRIPT: ownership attribution is a governance decision that gates the
//   organization's Work Ledger — it must be deterministic, auditable, and live in
//   the governance-authority runtime, reusing responsibility-graph + recipient
//   resolution. (ML ranking of priority/urgency is a future PYTHON_ENRICHED pass
//   over the created rows; it never decides ownership.)
//
// PURE: no IO, no LLM, no Date.now(). The caller supplies a strict roster resolver
//   (same strict matching recipient-governance uses — never substring/phonetic).
// CONNECTS TO: responsibility-graph.ts, recipient-governance.ts, comms-ingest.service.ts
//   (persists each plan via work-ledger createLedgerEntry), tests/unit/work-item-planner.test.ts.

import type { ResponsibilityGraph, ResponsibilityRole } from "./responsibility-graph.js";
import type { RecipientConfidence } from "./recipient-governance.js";

/** Strict roster resolution result for one transcript name token. */
export interface NameResolution {
  entityId: string | null;
  /** >1 roster match — ambiguous, must not auto-assign. */
  ambiguous: boolean;
  alternatives: string[];
}

/** A roster resolver: strict only (exact / first-name / whole-token), never fuzzy. */
export type ResolveName = (name: string) => NameResolution;

export type WorkLedgerType = "COMMITMENT" | "TASK" | "BLOCKER" | "FOLLOW_UP";
export type WorkItemStatus = "PROPOSED" | "NEEDS_OWNER";

export interface WorkItemSourceEvidence {
  quote: string;
  speaker: string | null;
  workItem: string | null;
  /** From transcript-quality.ts — only "trusted" segments reach here. */
  segmentQuality: string;
}

export interface WorkItemPlan {
  ledgerType: WorkLedgerType;
  ownerEntityId: string | null;
  ownerName: string;
  title: string;
  status: WorkItemStatus;
  needsReview: boolean;
  reviewReason: string | null;
  confidence: RecipientConfidence;
  proofPath: "responsibility_graph_owner" | "unproven_owner";
  sourceEvidence: WorkItemSourceEvidence;
}

/** A non-owning relationship (support/advisor/reviewer). NOT an owned task. */
export interface SupportEdge {
  name: string;
  entityId: string | null;
  relation: "support" | "advisor" | "reviewer" | "approver";
  workItem: string | null;
  evidence: string;
}

export interface WorkItemPlanResult {
  workItems: WorkItemPlan[];
  supportEdges: SupportEdge[];
  /** Items that could not be attributed to a proven owner (need lead/admin review). */
  needsReviewCount: number;
}

// Roles that OWN work (produce an owned work item).
const OWNER_ROLES: ReadonlySet<ResponsibilityRole> = new Set<ResponsibilityRole>(["owner"]);
// Roles that SUPPORT work (produce a support edge, never an owned task).
const SUPPORT_ROLE_MAP: Partial<Record<ResponsibilityRole, SupportEdge["relation"]>> = {
  support: "support",
  optional_advisor: "advisor",
  reviewer: "reviewer",
  approver: "approver",
};

// Pronouns + first/second-person references are NOT owner names. The
// responsibility graph's NAME regex requires a leading capital, but LLM-assisted
// paths can surface a pronoun ("he'll follow up") or a lowercase token as the
// "owner". Such a token must NEVER be displayed as an owner ("Follow-up owned by
// his") nor seeded as a person — the work item still exists, but UNOWNED +
// NEEDS_OWNER for a human to assign.
const PRONOUN_TOKENS: ReadonlySet<string> = new Set([
  "he", "she", "they", "him", "her", "them", "his", "hers", "their", "theirs",
  "it", "its", "we", "us", "our", "ours", "i", "me", "my", "mine", "you", "your", "yours",
  "someone", "somebody", "anyone", "everybody", "everyone", "himself", "herself", "themselves",
]);

/** True when `name` is a pronoun / indirect reference / non-name token that must
 *  not be shown as an owner or seeded as a person. A real person-name token starts
 *  with an uppercase letter and is not a pronoun. Exported for tests. */
export function isPronounOrNonName(name: string): boolean {
  const t = name.trim();
  if (t.length === 0) return true;
  if (PRONOUN_TOKENS.has(t.toLowerCase())) return true; // catches "His"/"THEY" too
  // First token must look like a person/handle: classic names (David) OR
  // alphanumeric roster handles (R03P1). Digits are allowed; pure punctuation is not.
  if (!/^[A-Za-z][A-Za-z0-9'.-]*$/.test(t.split(/\s+/)[0] ?? "")) return true;
  if (!/^[A-Z]/.test(t)) return true; // a name starts capitalized
  return false;
}

function titleFromWork(name: string, workItem: string | null): string {
  if (workItem && workItem.trim().length > 0) {
    const w = workItem.trim();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  // No concrete work phrase AND no real owner name → a neutral, honest title
  // (never "Follow-up owned by his").
  if (isPronounOrNonName(name)) return "Follow-up — owner needs confirmation";
  return `Follow-up owned by ${name}`;
}

/**
 * Plan per-owner work items from a responsibility graph. Deterministic + governed.
 *
 * INVARIANTS:
 *  - Owner is assigned ONLY when role=owner AND the name resolves to exactly one
 *    roster entity. Otherwise the item is created UNOWNED + NEEDS_OWNER (review).
 *  - Support/advisor/reviewer/approver roles never become owned tasks.
 *  - A person mentioned only as support/context with no owner role yields no owned
 *    item (no over-tasking).
 *  - The meeting lead is NOT auto-given an IC task here (lead coordination is a
 *    separate card); only explicit ownership produces work.
 */
export function planWorkItems(
  graph: ResponsibilityGraph,
  resolve: ResolveName,
  ledgerType: WorkLedgerType = "COMMITMENT",
): WorkItemPlanResult {
  const workItems: WorkItemPlan[] = [];
  const supportEdges: SupportEdge[] = [];

  for (const node of graph.nodes) {
    const supportRel = SUPPORT_ROLE_MAP[node.role];
    if (supportRel) {
      const r = resolve(node.name);
      supportEdges.push({
        name: node.name,
        entityId: r.ambiguous ? null : r.entityId,
        relation: supportRel,
        workItem: node.workItem,
        evidence: node.evidence,
      });
      continue;
    }

    if (!OWNER_ROLES.has(node.role)) continue; // lead/founder_authority → not an owned task here

    const r = resolve(node.name);
    // A pronoun / non-name token can never be a PROVEN owner, even if a lax
    // resolver returned an id — force it to NEEDS_OWNER for human assignment.
    const nameIsDisplayable = !isPronounOrNonName(node.name);
    const proven = nameIsDisplayable && r.entityId !== null && !r.ambiguous;
    const evidence: WorkItemSourceEvidence = {
      quote: node.evidence,
      speaker: node.name,
      workItem: node.workItem,
      segmentQuality: "trusted",
    };

    if (proven) {
      workItems.push({
        ledgerType,
        ownerEntityId: r.entityId,
        ownerName: node.name,
        title: titleFromWork(node.name, node.workItem),
        status: "PROPOSED",
        needsReview: false,
        reviewReason: null,
        confidence: node.confidence,
        proofPath: "responsibility_graph_owner",
        sourceEvidence: evidence,
      });
    } else {
      workItems.push({
        ledgerType,
        ownerEntityId: null,
        // Never carry a pronoun/non-name forward as an "owner name" (it would
        // otherwise seed a phantom person). Empty = no named owner to seed.
        ownerName: nameIsDisplayable ? node.name : "",
        title: titleFromWork(node.name, node.workItem),
        status: "NEEDS_OWNER",
        needsReview: true,
        reviewReason: !nameIsDisplayable
          ? `The owner was referenced only indirectly (e.g. a pronoun) — no named person to assign. Confirm who owns this.`
          : r.ambiguous
            ? `"${node.name}" matches more than one person (${r.alternatives.join(", ")}) — confirm the owner before assigning.`
            : `"${node.name}" is not a confirmed member of this org roster — confirm or activate before assigning work.`,
        confidence: "low",
        proofPath: "unproven_owner",
        sourceEvidence: evidence,
      });
    }
  }

  return {
    workItems,
    supportEdges,
    needsReviewCount: workItems.filter((w) => w.needsReview).length,
  };
}
