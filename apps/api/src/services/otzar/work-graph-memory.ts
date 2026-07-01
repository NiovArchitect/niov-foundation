// FILE: work-graph-memory.ts
// PURPOSE: [SECTION-12-WORKGRAPH Phase 6] Turn a processed ingest into governed,
//          scoped Work-Graph / Organization-Memory EVENTS and admin-governed
//          DANDELION org-seeding SUGGESTIONS — without leaking or inventing facts.
//          Deterministic; consumes only the TRUSTED-segment work the planner
//          already produced (so the noisy tail can never seed memory or org
//          topology). Every event/seed carries source evidence, scope, sensitivity,
//          policy status, allowed viewers, confidence and timestamp.
//
// DANDELION (ADR-0082, work-evidence-driven; NOT redefined here): seeds are
//   admin-governed PROPOSALS sourced from real work evidence — never auto-invite,
//   never create users from noise, never grant access, always approval-gated where
//   it crosses a threshold. An UNPROVEN owner (needs-review) becomes a
//   resolve-identity / confirm-person seed, NEVER a trusted ownership edge. A
//   connector capability gap (Phase 4/5) becomes a connector-setup seed for the
//   right admin. Support roles become support edges, not owners.
//
// RUNTIME (ADR-0069/0090): TS — this is governance (what may enter the org source
//   of truth + what an admin is asked to approve), which must stay in the
//   Foundation authority tier. Future cross-source reconciliation / ranking is a
//   PYTHON_ENRICHED boundary over these events (not built).
// PURE: no IO, no Date.now() (caller stamps nowIso). Reuses MemoryScope.
// CONNECTS TO: work-graph-evidence.ts, work-graph-learning.ts (MemoryScope),
//   work-item-planner.ts, execution-planner.ts, comms-ingest.service.ts (persists),
//   tests/unit/work-graph-memory.test.ts.

import type { MemoryScope } from "./work-graph-learning.js";

export type WorkGraphEventType =
  | "conversation_processed"
  | "decision"
  | "commitment"
  | "owner_relationship"
  | "support_relationship"
  | "execution_plan_created"
  | "tool_capability_gap"
  | "blocker";

export type EventSensitivity = "low" | "internal" | "high";
export type EventPolicyStatus = "allowed" | "needs_review" | "blocked";

export interface GovernedWorkEvent {
  eventType: WorkGraphEventType;
  sourceConversationId: string;
  sourceType: "transcript";
  /** Proof pointer — a narrow evidence quote, never the raw full transcript. */
  sourceEvidence: string;
  subjectName: string | null;
  subjectEntityId: string | null;
  workItem: string | null;
  confidence: "high" | "medium" | "low";
  scope: MemoryScope;
  sensitivity: EventSensitivity;
  policyStatus: EventPolicyStatus;
  allowedViewers: string[]; // entity ids / role keys — never global
  timestamp: string;
}

export type DandelionSeedType =
  | "resolve_identity"
  | "confirm_or_activate_person"
  | "add_project_membership"
  | "grant_tool_access"
  | "connector_setup"
  | "confirm_support_role"
  | "add_work_owner_edge";

export interface DandelionSeed {
  seedType: DandelionSeedType;
  subjectName: string | null;
  subjectEntityId: string | null;
  recommendedAction: string; // human admin-facing text
  sourceConversationId: string;
  sourceEvidence: string;
  confidence: "high" | "medium" | "low";
  scope: MemoryScope;
  sensitivity: EventSensitivity;
  policyStatus: EventPolicyStatus;
  approvalRequired: boolean;
  riskIfIgnored: string;
  timestamp: string;
}

// Minimal projections of the ingest the builder needs (avoids importing the whole
// ingest result; keeps this module pure + independently testable).
export interface WorkGraphWorkItem {
  ownerName: string;
  ownerEntityId: string | null;
  title: string;
  needsReview: boolean;
  confidence: "high" | "medium" | "low";
  sourceEvidence: string;
  /** From Phase 4/5 — present for connector-backed work. */
  executionType: string;
  requiredConnector: string;
  capabilityState: string | null;
}
export interface WorkGraphSupportEdge {
  name: string;
  entityId: string | null;
  relation: string;
  workItem: string | null;
  evidence: string;
}
export interface BuildWorkGraphMemoryInput {
  sourceConversationId: string;
  nowIso: string;
  /** Org members + caller — the only entities seeds/events may reference. */
  allowedViewers: string[];
  decisions: string[];
  workItems: WorkGraphWorkItem[];
  supportEdges: WorkGraphSupportEdge[];
}

export interface WorkGraphMemoryResult {
  events: GovernedWorkEvent[];
  seeds: DandelionSeed[];
}

const SETUP_STATES = new Set(["not_connected", "connector_missing", "available_needs_user_auth", "available_needs_admin_auth"]);

function connectorLabel(c: string): string {
  return c === "GOOGLE_WORKSPACE" ? "Google Workspace" : c === "MICROSOFT_365" ? "Microsoft 365" : c.charAt(0) + c.slice(1).toLowerCase();
}

/**
 * Build governed Work-Graph/memory events + Dandelion seeds from a processed
 * ingest. Deterministic + governed. Only TRUSTED-segment work reaches here, so a
 * noisy tail produces nothing. Unproven owners never become trusted edges — they
 * become identity/activation seeds for admin review.
 */
export function buildWorkGraphMemory(input: BuildWorkGraphMemoryInput): WorkGraphMemoryResult {
  const events: GovernedWorkEvent[] = [];
  const seeds: DandelionSeed[] = [];
  const base = {
    sourceConversationId: input.sourceConversationId,
    sourceType: "transcript" as const,
    allowedViewers: input.allowedViewers,
    timestamp: input.nowIso,
  };

  // 1) The conversation itself was processed (one provenance event).
  events.push({
    ...base,
    eventType: "conversation_processed",
    sourceEvidence: `Processed conversation with ${input.workItems.length} work item(s), ${input.decisions.length} decision(s).`,
    subjectName: null,
    subjectEntityId: null,
    workItem: null,
    confidence: "high",
    scope: "org",
    sensitivity: "internal",
    policyStatus: "allowed",
  });

  // 2) Decisions (org-scoped facts).
  for (const d of input.decisions) {
    events.push({ ...base, eventType: "decision", sourceEvidence: d, subjectName: null, subjectEntityId: null, workItem: d, confidence: "high", scope: "org", sensitivity: "internal", policyStatus: "allowed" });
  }

  // 3) Per work item: commitment + ownership/identity + capability-gap events + seeds.
  // Cluster identity-activation seeds by person: one "confirm or activate" seed per
  // named person, NOT one per mention (a transcript naming "David" in 5 commitments
  // must produce ONE person seed, not 5). Cross-transcript clustering happens at the
  // Organization Seeding list layer (grouped queues); this keeps a single ingest clean.
  const seenPersonSeedKeys = new Set<string>();
  for (const w of input.workItems) {
    if (w.needsReview || w.ownerEntityId === null) {
      const personKey = w.ownerName.trim().toLowerCase();
      // No named person (owner referenced only by pronoun/indirect) → the NEEDS_OWNER
      // work item is the review surface; do NOT seed a phantom person.
      if (personKey.length === 0) continue;
      if (seenPersonSeedKeys.has(personKey)) continue; // already seeded this person
      seenPersonSeedKeys.add(personKey);
      // UNPROVEN owner — NOT a trusted edge. Seed an admin identity/activation review.
      seeds.push({
        ...base,
        seedType: "confirm_or_activate_person",
        subjectName: w.ownerName,
        subjectEntityId: null,
        recommendedAction: `Confirm or activate "${w.ownerName}" before assigning this work (not a verified org member).`,
        sourceEvidence: w.sourceEvidence,
        confidence: "low",
        scope: "org",
        sensitivity: "internal",
        policyStatus: "needs_review",
        approvalRequired: true,
        riskIfIgnored: "Work could be routed to the wrong or unverified person.",
      });
      continue; // no trusted commitment/ownership event for an unproven owner
    }

    // Proven owner → commitment + ownership edge (project-scoped work signal).
    events.push({ ...base, eventType: "commitment", sourceEvidence: w.sourceEvidence, subjectName: w.ownerName, subjectEntityId: w.ownerEntityId, workItem: w.title, confidence: w.confidence, scope: "project", sensitivity: "internal", policyStatus: "allowed" });
    events.push({ ...base, eventType: "owner_relationship", sourceEvidence: w.sourceEvidence, subjectName: w.ownerName, subjectEntityId: w.ownerEntityId, workItem: w.title, confidence: w.confidence, scope: "project", sensitivity: "internal", policyStatus: "allowed" });
    events.push({ ...base, eventType: "execution_plan_created", sourceEvidence: w.sourceEvidence, subjectName: w.ownerName, subjectEntityId: w.ownerEntityId, workItem: w.title, confidence: w.confidence, scope: "project", sensitivity: "internal", policyStatus: "allowed" });

    // Connector capability gap → tool-gap event + connector-setup Dandelion seed.
    if (w.capabilityState !== null && SETUP_STATES.has(w.capabilityState)) {
      const conn = connectorLabel(w.requiredConnector);
      events.push({ ...base, eventType: "tool_capability_gap", sourceEvidence: w.sourceEvidence, subjectName: w.ownerName, subjectEntityId: w.ownerEntityId, workItem: w.title, confidence: "high", scope: "org", sensitivity: "internal", policyStatus: "needs_review" });
      const adminGrant = w.capabilityState === "available_needs_admin_auth" || w.capabilityState === "connector_missing" || w.capabilityState === "not_connected";
      seeds.push({
        ...base,
        seedType: w.requiredConnector === "GITHUB" && w.executionType === "repo_access" ? "grant_tool_access" : "connector_setup",
        subjectName: w.ownerName,
        subjectEntityId: w.ownerEntityId,
        recommendedAction: `${conn} is needed for "${w.title}" but isn't ready — ${adminGrant ? "an admin should connect/authorize it" : "the owner should connect their account"}.`,
        sourceEvidence: w.sourceEvidence,
        confidence: "high",
        scope: "org",
        sensitivity: "internal",
        policyStatus: "needs_review",
        approvalRequired: adminGrant,
        riskIfIgnored: "The committed work is blocked until the tool is connected.",
      });
    }
  }

  // 4) Support edges (support/advisor relationships — never owners).
  for (const s of input.supportEdges) {
    events.push({ ...base, eventType: "support_relationship", sourceEvidence: s.evidence, subjectName: s.name, subjectEntityId: s.entityId, workItem: s.workItem, confidence: "medium", scope: "project", sensitivity: "internal", policyStatus: "allowed" });
    if (s.entityId !== null) {
      seeds.push({
        ...base,
        seedType: "confirm_support_role",
        subjectName: s.name,
        subjectEntityId: s.entityId,
        recommendedAction: `Confirm ${s.name} as ${s.relation} (support/advisor, not owner) on this work.`,
        sourceEvidence: s.evidence,
        confidence: "medium",
        scope: "project",
        sensitivity: "internal",
        policyStatus: "allowed",
        approvalRequired: false,
        riskIfIgnored: "Support relationships stay implicit and routing accuracy drifts.",
      });
    }
  }

  return { events, seeds };
}
