// FILE: work-graph-evidence.ts
// PURPOSE: [SECTION-12-WORKGRAPH] The GENERIC, evidence-based Work Graph model.
//          The Work Graph is NOT transcript-based — it is evidence-based. A
//          transcript is just ONE sourceType. This module defines the generic
//          EvidenceEvent shape that every future connector (Slack / email /
//          calendar / Jira / GitHub / docs / corrections / Work Ledger / AI Twin
//          / voice) emits without redesign, the time-aware WorkGraphEdge (durable
//          identity vs temporary work-state), and the multi-source RECONCILIATION
//          that raises confidence when sources agree and lowers it + asks one
//          clarification + blocks autonomy when they conflict.
//
//          SCOPE (per founder guidance): design the model now; DO NOT build the
//          multi-app ingestion platform in one pass. Today only the transcript
//          connector emits events (transcriptGraphToEvidence). The model + the
//          reconciliation are source-agnostic, so adding a Slack/Jira/GitHub
//          connector later is a new producer, not a redesign.
//
//          NO-LEAK: every edge carries scope + sensitivity + allowedViewers /
//          allowedActors + policyStatus + expiry. Multi-source does not mean
//          free-for-all; an edge must never be used outside its allowed scope.
// CONNECTS TO: responsibility-graph.ts (transcript producer),
//              recipient-governance.ts (proof paths reference these sources),
//              work-graph-learning.ts (MemoryScope), tests/unit/work-graph-evidence.test.ts.

import type { ResponsibilityGraph, ResponsibilityRole } from "./responsibility-graph.js";
import type { MemoryScope } from "./work-graph-learning.js";
import type { RecipientSensitivity, PolicyStatus, RecipientConfidence } from "./recipient-governance.js";

// Every governed work surface Otzar may eventually ingest. Only "transcript"
// (and a few Otzar-internal sources) have producers today; the rest are
// reserved so a future connector is additive.
export type EvidenceSourceType =
  | "transcript"
  | "meeting"
  | "chat"
  | "email"
  | "doc"
  | "ticket"
  | "pr"
  | "commit"
  | "deployment"
  | "calendar"
  | "approval"
  | "admin_assignment"
  | "role_template"
  | "correction"
  | "work_ledger"
  | "ai_twin_interaction"
  | "voice_command"
  | "manual_input";

// The relation an evidence event asserts about a person and a work item.
export type WorkRelation =
  | "meeting_lead"
  | "founder_authority"
  | "integration_owner"
  | "project_owner"
  | "tool_owner"
  | "repo_owner"
  | "owner"
  | "support"
  | "reviewer"
  | "approver"
  | "optional_advisor"
  | "blocker_owner"
  | "role"
  | "team_member"
  | "manager"
  | "admin_authority";

export type EdgeDurability = "durable" | "temporary";

export type CorrectionState = "none" | "created" | "modified" | "confirmed" | "rejected";

// Identity relations are durable; work-state relations are temporary (a meeting
// lead / integration focal point / current approver expires as work shifts).
const DURABLE_RELATIONS: ReadonlySet<WorkRelation> = new Set<WorkRelation>([
  "role",
  "team_member",
  "manager",
  "admin_authority",
  "tool_owner",
  "repo_owner",
]);

export function relationDurability(relation: WorkRelation): EdgeDurability {
  return DURABLE_RELATIONS.has(relation) ? "durable" : "temporary";
}

/** A single, source-aware, evidence-backed signal. Every field the doctrine
 *  names is present so the shape generalizes across all connectors. Carries an
 *  evidence POINTER/excerpt — never a raw full-document dump. */
export interface EvidenceEvent {
  sourceType: EvidenceSourceType;
  /** Id within the source system (message id, ticket id, commit sha, ...). */
  sourceId: string;
  /** The system that produced it ("otzar-comms", "slack", "github", ...). */
  sourceSystem: string;
  /** A permissioned pointer back to the source (never the raw payload). */
  evidencePointer: string;
  /** A narrow excerpt where policy allows it; null otherwise. */
  evidenceExcerpt: string | null;
  /** When the underlying signal happened (ISO), if known. */
  sourceTimestamp: string | null;
  /** When Otzar extracted this event (ISO). */
  extractedAt: string;

  // What the event asserts.
  subjectEntityId: string | null;
  subjectName: string;
  relation: WorkRelation;
  workItem: string | null;

  confidence: RecipientConfidence;
  scope: MemoryScope;
  sensitivity: RecipientSensitivity;
  /** No-leak boundary: who may view / act on this edge (entity ids or role keys). */
  allowedViewers: string[];
  allowedActors: string[];
  policyStatus: PolicyStatus;

  /** Recency + lifecycle for time-aware truth. */
  recency: string | null;
  expiresAt: string | null;
  revalidateAfter: string | null;

  correctionState: CorrectionState;
  durability: EdgeDurability;
}

/** A reconciled edge: one (subject, relation, workItem) supported by N evidence
 *  events, with reconciled confidence and conflict/autonomy flags. */
export interface WorkGraphEdge {
  subjectEntityId: string | null;
  subjectName: string;
  relation: WorkRelation;
  workItem: string | null;
  evidence: EvidenceEvent[];
  sourceCount: number;
  confidence: RecipientConfidence;
  durability: EdgeDurability;
  /** True when a DIFFERENT subject also claims this (relation, workItem). */
  conflicting: boolean;
  /** When conflicting, Otzar must ask one focused clarification. */
  needsClarification: boolean;
  /** Conflicts (and single-source temporary edges) block autonomy. */
  autonomyBlocked: boolean;
}

function rank(c: RecipientConfidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}
function fromRank(n: number): RecipientConfidence {
  return n >= 3 ? "high" : n === 2 ? "medium" : "low";
}

function keyOf(e: { relation: WorkRelation; workItem: string | null }): string {
  return `${e.relation}::${(e.workItem ?? "").toLowerCase().trim()}`;
}
function subjectKey(e: EvidenceEvent): string {
  return e.subjectEntityId ?? e.subjectName.toLowerCase();
}

/**
 * Reconcile multi-source evidence into edges. AGREEMENT (same subject + relation
 * + workItem across >1 source) raises confidence. CONFLICT (same relation +
 * workItem, DIFFERENT subjects) lowers confidence, flags conflict +
 * needsClarification, and blocks autonomy on every claimant — Otzar must not
 * guess which owner is right. Source-agnostic: works for any mix of connectors.
 */
export function reconcileEvidence(events: ReadonlyArray<EvidenceEvent>): WorkGraphEdge[] {
  // Group by (subject, relation, workItem) -> the same claim from many sources.
  const groups = new Map<string, EvidenceEvent[]>();
  for (const e of events) {
    const k = `${subjectKey(e)}::${keyOf(e)}`;
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  // Count distinct subjects per (relation, workItem) to detect conflict.
  const subjectsPerClaim = new Map<string, Set<string>>();
  for (const e of events) {
    const ck = keyOf(e);
    const set = subjectsPerClaim.get(ck) ?? new Set<string>();
    set.add(subjectKey(e));
    subjectsPerClaim.set(ck, set);
  }

  const edges: WorkGraphEdge[] = [];
  for (const [, group] of groups) {
    const first = group[0]!;
    const ck = keyOf(first);
    const conflicting = (subjectsPerClaim.get(ck)?.size ?? 1) > 1;
    const sourceCount = new Set(group.map((g) => `${g.sourceType}:${g.sourceSystem}:${g.sourceId}`)).size;

    // Base confidence = max of the group; agreement across sources raises it.
    let conf = group.reduce((acc, g) => Math.max(acc, rank(g.confidence)), 1);
    if (sourceCount >= 2) conf = Math.min(3, conf + 1); // corroboration
    if (conflicting) conf = 1; // conflict floors confidence

    const durability = relationDurability(first.relation);
    // Autonomy is blocked on conflict, and on a single-source TEMPORARY edge
    // (a lone meeting assignment is not enough to act autonomously).
    const autonomyBlocked = conflicting || (durability === "temporary" && sourceCount < 2);

    edges.push({
      subjectEntityId: first.subjectEntityId,
      subjectName: first.subjectName,
      relation: first.relation,
      workItem: first.workItem,
      evidence: group,
      sourceCount,
      confidence: fromRank(conf),
      durability,
      conflicting,
      needsClarification: conflicting,
      autonomyBlocked,
    });
  }
  return edges;
}

// Map a transcript responsibility role to a generic work relation.
function roleToRelation(role: ResponsibilityRole): WorkRelation {
  switch (role) {
    case "meeting_lead": return "meeting_lead";
    case "founder_context_authority": return "founder_authority";
    case "owner": return "owner";
    case "support": return "support";
    case "reviewer": return "reviewer";
    case "approver": return "approver";
    case "optional_advisor": return "optional_advisor";
  }
}

/**
 * Convert a transcript responsibility graph into generic evidence events
 * (sourceType="transcript"). This is the ONE producer that exists today; it
 * proves the model is source-agnostic. extractedAt/sourceTimestamp are passed in
 * (the workflow/runtime stamps time — these services avoid Date.now()).
 */
export function transcriptGraphToEvidence(
  graph: ResponsibilityGraph,
  opts: {
    sourceId: string;
    extractedAt: string;
    sourceTimestamp?: string | null;
    /** Resolve a transcript name token to an entity_id where possible. */
    resolveName?: (name: string) => string | null;
    sensitivity?: RecipientSensitivity;
    /** Default viewers/actors for these edges (no-leak boundary). */
    allowedViewers?: string[];
    allowedActors?: string[];
  },
): EvidenceEvent[] {
  return graph.nodes.map((n) => {
    const relation = roleToRelation(n.role);
    return {
      sourceType: "transcript" as const,
      sourceId: opts.sourceId,
      sourceSystem: "otzar-comms",
      evidencePointer: `transcript:${opts.sourceId}`,
      evidenceExcerpt: n.evidence,
      sourceTimestamp: opts.sourceTimestamp ?? null,
      extractedAt: opts.extractedAt,
      subjectEntityId: opts.resolveName ? opts.resolveName(n.name) : null,
      subjectName: n.name,
      relation,
      workItem: n.workItem,
      confidence: n.confidence,
      scope: relationDurability(relation) === "durable" ? "org" : "project",
      sensitivity: opts.sensitivity ?? "internal",
      allowedViewers: opts.allowedViewers ?? [],
      allowedActors: opts.allowedActors ?? [],
      policyStatus: "unknown",
      recency: opts.sourceTimestamp ?? opts.extractedAt,
      expiresAt: null,
      revalidateAfter: null,
      correctionState: "none",
      durability: relationDurability(relation),
    };
  });
}
