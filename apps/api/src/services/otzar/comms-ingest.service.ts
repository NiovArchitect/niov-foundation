// FILE: comms-ingest.service.ts
// PURPOSE: [SECTION-12-WORKGRAPH] The governed transcript → owned-work bridge the
//          founder review found missing. ONE durable pass over a captured
//          conversation that: (1) quality-segments it so the noisy post-meeting
//          tail can never seed work; (2) persists the transcript as a durable
//          source-of-truth record on the existing MeetingCapture rail (consent +
//          bounded transcript + audit); (3) runs the existing governed extraction
//          on the TRUSTED text only; (4) turns commitments into per-OWNER Work
//          Ledger rows under proof (proven owner → PROPOSED + owned; unproven /
//          ambiguous → NEEDS_OWNER, unassigned, for review); (5) records the
//          conversation as a durable MEETING ledger entry so it shows in Recent
//          Conversations after reload. Reuses rails end-to-end — no new store.
//
// GOVERNANCE PRESERVED: extraction still runs through governExtraction (every
//   recipient proof-checked); no auto-send; ownership is proof-gated exactly like
//   recipient-governance (the Shweta/Shiney leak class for work items).
// RUNTIME (ADR-0069/0090): TS governance authority + DB persistence. Deterministic
//   ownership/quality decisions stay here; a future PYTHON_ENRICHED pass may refine
//   priority/quality over the created rows (never decide ownership).
// CONNECTS TO: transcript-quality.ts, work-item-planner.ts, comms-extract.ts,
//   recipient-governance.ts (resolveTokenToEntities), meeting-capture.service.ts,
//   work-os/work-ledger.service.ts (createLedgerEntry), otzar.service.ts (entry),
//   tests/integration/comms-ingest.test.ts.

import { getOrgEntityId } from "../governance/org.js";
import { buildIdentityContext } from "./identity-context.js";
import { extractFromCapturedText } from "./comms-extract.service.js";
import type { CommsExtractionMode, CommsExtractionResult } from "./comms-extract.service.js";
import { segmentTranscriptQuality } from "./transcript-quality.js";
import { planWorkItems } from "./work-item-planner.js";
import type { NameResolution, ResolveName, WorkItemPlan } from "./work-item-planner.js";
import { classifyExecutionType, connectorForExecutionType, planExecution } from "./execution-planner.js";
import type { ExecutionPlan } from "./execution-planner.js";
import { resolveConnectorCapability } from "./connector-capability.js";
import type { ConnectorCapabilityState } from "./connector-capability.js";
import { buildWorkGraphMemory } from "./work-graph-memory.js";
import type { DandelionSeed, WorkGraphWorkItem } from "./work-graph-memory.js";
import { resolveTokenToEntities } from "./recipient-governance.js";
import type { RosterEntry, RecipientConfidence } from "./recipient-governance.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { receiveMeetingCaptureForCaller } from "./meeting-capture.service.js";

type LLMProvider = Parameters<typeof extractFromCapturedText>[1];

export interface IngestTranscriptInput {
  callerEntityId: string;
  capturedText: string;
  title?: string;
  forceMode?: CommsExtractionMode;
  llmProvider: LLMProvider;
}

export interface IngestedWorkItem {
  ledger_entry_id: string | null;
  ledger_type: string;
  owner_entity_id: string | null;
  owner_name: string;
  title: string;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
  /** Phase 4/5 — the typed execution plan + connector capability for this item. */
  execution: {
    execution_type: ExecutionPlan["executionType"];
    execution_mode: ExecutionPlan["executionMode"];
    required_connector: ExecutionPlan["requiredConnector"];
    capability_state: ConnectorCapabilityState | null;
    approval_required: boolean;
    blocker_reason: string | null;
    next_best_action: ExecutionPlan["nextBestAction"];
  };
}

export interface IngestTranscriptResult {
  ok: true;
  conversation: {
    meeting_capture_id: string;
    title: string;
    participant_count: number;
    summary: string | null;
    status: string;
  };
  quality: {
    total: number;
    trusted: number;
    quarantined: number;
    noisy_tail_start_index: number | null;
  };
  decisions: string[];
  work_items: IngestedWorkItem[];
  support_edges: Array<{ name: string; relation: string; entity_id: string | null }>;
  counts: { owned: number; needs_review: number; support_edges: number };
  /** Phase 6 — governed Dandelion org-seeding suggestions (admin-reviewed) +
   *  the count of governed Work-Graph/memory events written for this conversation. */
  dandelion_seeds: DandelionSeed[];
  work_graph_event_count: number;
  /** The full governed extraction (summary, decisions, commitments,
   *  suggested_actions with recipient trust + responsibility graph) so the
   *  Comms UI keeps its existing trust-chip review surface unchanged. */
  extraction: CommsExtractionResult;
}

export interface IngestTranscriptFailure {
  ok: false;
  code: string;
  message: string;
}

function confidenceToScore(c: RecipientConfidence): number {
  return c === "high" ? 0.9 : c === "medium" ? 0.6 : 0.3;
}

// A friendly, human title for the captured conversation record.
function conversationTitle(explicit: string | undefined, summary: string): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const firstSentence = summary.split(/[.!?]\s/)[0]?.trim();
  if (firstSentence && firstSentence.length > 0) return firstSentence.slice(0, 120);
  return "Captured conversation";
}

/**
 * Ingest a captured transcript into durable, governed work. Deterministic where
 * it must be (quality + ownership); reuses governed extraction for the rest.
 */
export async function ingestTranscript(
  input: IngestTranscriptInput,
): Promise<IngestTranscriptResult | IngestTranscriptFailure> {
  if (typeof input.capturedText !== "string" || input.capturedText.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "capturedText is required (non-empty string)" };
  }

  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "Caller has no organization." };
  }

  // Roster for strict, proof-only owner resolution (same matcher recipient-governance uses).
  const identity = await buildIdentityContext(input.callerEntityId);
  const roster: RosterEntry[] = identity.org_roster.map((p) => ({
    entity_id: p.entity_id,
    display_name: p.display_name,
    email: p.email,
    title: p.title,
    shared_project_count: p.shared_project_count,
  }));
  // org_roster is the caller's PEERS (excludes the caller). Add the caller so a
  // meeting capturer who is also named as an owner ("David owns X" when David
  // captured the meeting) resolves to themselves rather than being held as an
  // unknown owner.
  if (!roster.some((r) => r.entity_id === input.callerEntityId)) {
    roster.push({ entity_id: input.callerEntityId, display_name: identity.viewer.display_name, email: null });
  }
  const nameById = new Map(roster.map((r) => [r.entity_id, r.display_name]));

  // 1) Quality gate — only trusted segments may seed work; the noisy tail is quarantined.
  const quality = segmentTranscriptQuality(input.capturedText);

  // 2) Governed extraction on the TRUSTED text only (noisy tail cannot create commitments).
  const extractionText = quality.stats.trusted > 0 ? quality.trustedText : input.capturedText;
  const extraction = await extractFromCapturedText(
    {
      viewerEntityId: input.callerEntityId,
      captured_text: extractionText,
      ...(input.forceMode !== undefined ? { force_mode: input.forceMode } : {}),
    },
    input.llmProvider,
  );

  // 3) Plan per-owner work items under proof (proven owner only; else NEEDS_OWNER).
  const resolve: ResolveName = (name): NameResolution => {
    const ids = resolveTokenToEntities(name, roster);
    if (ids.length === 1) return { entityId: ids[0]!, ambiguous: false, alternatives: [] };
    if (ids.length > 1) {
      return { entityId: null, ambiguous: true, alternatives: ids.map((id) => nameById.get(id) ?? id) };
    }
    return { entityId: null, ambiguous: false, alternatives: [] };
  };
  const plan = planWorkItems(extraction.responsibility_graph, resolve, "COMMITMENT");

  // 4) Persist the transcript as a durable source-of-truth record (MeetingCapture rail).
  //    Slice-1 consent default: org-internal participants (resolved on the roster)
  //    are recorded CONSENTED for this internal work capture; unresolved names are
  //    EXTERNAL_TRACKED (never auto-granted access). A richer per-participant
  //    consent UI is a later slice.
  const participantNames = new Set<string>();
  for (const n of extraction.responsibility_graph.nodes) participantNames.add(n.name);
  if (extraction.responsibility_graph.lead) participantNames.add(extraction.responsibility_graph.lead.name);
  const participants = [...participantNames].map((name) => {
    const ids = resolveTokenToEntities(name, roster);
    if (ids.length === 1) {
      return { display_name: name, participant_entity_id: ids[0]!, consent_state: "CONSENTED" as const, consent_source: "internal_work_capture" };
    }
    return { display_name: name, consent_state: "EXTERNAL_TRACKED" as const };
  });
  const title = conversationTitle(input.title, extraction.summary);
  const capture = await receiveMeetingCaptureForCaller({
    callerEntityId: input.callerEntityId,
    provider: "MANUAL_UPLOAD",
    title,
    summary: extraction.summary,
    transcript: input.capturedText,
    participants,
  });
  if (!capture.ok) {
    return { ok: false, code: capture.code, message: capture.message ?? "Could not persist the captured conversation." };
  }
  const meetingCaptureId = capture.meeting_capture.meeting_capture_id;

  // 5a) One owned Work Ledger row per planned work item (proven → owned; else NEEDS_OWNER).
  const workItems: IngestedWorkItem[] = [];
  const wgItems: WorkGraphWorkItem[] = [];
  for (const w of plan.workItems) {
    // Phase 4/5 — classify the work, resolve the connector capability (only for
    // connector-backed types), and build the typed execution plan. A missing/
    // unauthorized tool becomes a visible connector_required/permission_required
    // blocker on the item (never silently dropped). An unproven owner means we
    // lack the context to act, so capability is left unresolved.
    // Classify once from title + evidence so the connector resolution and the
    // execution plan agree (the title alone can be terse).
    const execType = classifyExecutionType(`${w.title} ${w.sourceEvidence.quote}`);
    const { connector, operation } = connectorForExecutionType(execType);
    let capabilityState: ConnectorCapabilityState | null = null;
    if (operation !== null && connector !== "NONE" && connector !== "INTERNAL" && !w.needsReview) {
      const cap = await resolveConnectorCapability({
        orgEntityId,
        actorEntityId: w.ownerEntityId ?? input.callerEntityId,
        requiredConnector: connector,
        operation,
      });
      capabilityState = cap.state;
    }
    const execPlan = planExecution({
      title: w.title,
      evidenceQuote: w.sourceEvidence.quote,
      capabilityState,
      confidence: w.confidence,
      forceType: execType,
    });

    const created = await createLedgerEntry({
      org_entity_id: orgEntityId,
      ledger_type: w.ledgerType,
      source_type: "TRANSCRIPT",
      ...(w.ownerEntityId !== null ? { owner_entity_id: w.ownerEntityId } : {}),
      requester_entity_id: input.callerEntityId,
      title: w.title,
      ...(w.sourceEvidence.workItem ? { summary: w.sourceEvidence.workItem } : {}),
      status: w.status,
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      confidence_score: confidenceToScore(w.confidence),
      evidence: [
        {
          quote: w.sourceEvidence.quote,
          speaker: w.sourceEvidence.speaker,
          segment_quality: w.sourceEvidence.segmentQuality,
          proof_path: w.proofPath,
        },
      ],
      details: {
        source: "transcript_ingest",
        meeting_capture_id: meetingCaptureId,
        owner_name: w.ownerName,
        needs_review: w.needsReview,
        ...(w.reviewReason ? { review_reason: w.reviewReason } : {}),
        execution_plan: execPlan,
      },
      ...(w.needsReview
        ? { next_action: "Confirm the owner before assigning this work." }
        : execPlan.blockerReason !== null
          ? { next_action: execPlan.blockerReason }
          : {}),
    });
    workItems.push({
      ledger_entry_id: created.ok ? created.entry.ledger_entry_id : null,
      ledger_type: w.ledgerType,
      owner_entity_id: w.ownerEntityId,
      owner_name: w.ownerName,
      title: w.title,
      status: w.status,
      needs_review: w.needsReview,
      review_reason: w.reviewReason,
      execution: {
        execution_type: execPlan.executionType,
        execution_mode: execPlan.executionMode,
        required_connector: execPlan.requiredConnector,
        capability_state: execPlan.capabilityState,
        approval_required: execPlan.approvalRequired,
        blocker_reason: execPlan.blockerReason,
        next_best_action: execPlan.nextBestAction,
      },
    });
    wgItems.push({
      ownerName: w.ownerName,
      ownerEntityId: w.ownerEntityId,
      title: w.title,
      needsReview: w.needsReview,
      confidence: w.confidence,
      sourceEvidence: w.sourceEvidence.quote,
      executionType: execPlan.executionType,
      requiredConnector: execPlan.requiredConnector,
      capabilityState: execPlan.capabilityState,
    });
  }

  // 6) Phase 6 — governed Work-Graph / Organization-Memory events + Dandelion
  //    org-seeding suggestions from the TRUSTED work only (the noisy tail seeds
  //    nothing). Scoped to org members (no global memory); approval-gated seeds;
  //    unproven owners become identity/activation seeds, never trusted edges.
  const wgMemory = buildWorkGraphMemory({
    sourceConversationId: meetingCaptureId,
    nowIso: new Date().toISOString(),
    allowedViewers: roster.map((r) => r.entity_id),
    decisions: extraction.decisions,
    workItems: wgItems,
    supportEdges: plan.supportEdges.map((e) => ({ name: e.name, entityId: e.entityId, relation: e.relation, workItem: e.workItem, evidence: e.evidence })),
  });

  // 5b) The conversation itself as a durable MEETING ledger row (Recent Conversations).
  await createLedgerEntry({
    org_entity_id: orgEntityId,
    ledger_type: "MEETING",
    source_type: "TRANSCRIPT",
    owner_entity_id: input.callerEntityId,
    title,
    summary: extraction.summary,
    status: "VERIFIED",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    details: {
      source: "transcript_ingest",
      meeting_capture_id: meetingCaptureId,
      participant_count: capture.meeting_capture.participant_count,
      quality: {
        total: quality.stats.total,
        trusted: quality.stats.trusted,
        quarantined: quality.stats.quarantined,
        noisy_tail_start_index: quality.noisyTailStartIndex,
      },
      decisions: extraction.decisions,
      owned_work_items: workItems.filter((w) => !w.needs_review).length,
      needs_review_items: workItems.filter((w) => w.needs_review).length,
      // Phase 6 — governed work-graph events + Dandelion seeds persisted on the
      // durable conversation record (scoped, audited, queryable). Per-seed admin
      // approve/reject lifecycle (OtzarProposedPattern) is the defined next boundary.
      work_graph_events: wgMemory.events,
      dandelion_seeds: wgMemory.seeds,
    },
  });

  return {
    ok: true,
    conversation: {
      meeting_capture_id: meetingCaptureId,
      title,
      participant_count: capture.meeting_capture.participant_count,
      summary: capture.meeting_capture.summary,
      status: capture.meeting_capture.status,
    },
    quality: {
      total: quality.stats.total,
      trusted: quality.stats.trusted,
      quarantined: quality.stats.quarantined,
      noisy_tail_start_index: quality.noisyTailStartIndex,
    },
    decisions: extraction.decisions,
    work_items: workItems,
    support_edges: plan.supportEdges.map((e) => ({ name: e.name, relation: e.relation, entity_id: e.entityId })),
    counts: {
      owned: workItems.filter((w) => !w.needs_review).length,
      needs_review: plan.needsReviewCount,
      support_edges: plan.supportEdges.length,
    },
    dandelion_seeds: wgMemory.seeds,
    work_graph_event_count: wgMemory.events.length,
    extraction,
  };
}
