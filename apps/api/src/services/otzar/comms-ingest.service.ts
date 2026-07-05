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
import { prisma } from "@niov/database";
import {
  derivePriorRecipientDecisions,
  resolvedDecisionFromFollowUpDetails,
} from "./work-graph-learning.js";
import type { ResolvedRecipientDecision } from "./work-graph-learning.js";
import type { DandelionSeed, WorkGraphWorkItem } from "./work-graph-memory.js";
import { resolveTokenToEntities } from "./recipient-governance.js";
import type { RosterEntry, RecipientConfidence } from "./recipient-governance.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { receiveMeetingCaptureForCaller, findCaptureByExternalId } from "./meeting-capture.service.js";
import {
  type WorkSourceEvent,
  sourceDedupeKey,
  sourceEvidenceDetails,
  normalizeSourceContent,
} from "./source-event.js";
import { randomUUID } from "node:crypto";
import { reconcileParticipants } from "./identity-reconciliation.service.js";
import { classifyExternalActor, type ExternalResolution } from "./external-collaborator-identity.service.js";

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
  // Transcript ingestion is ONE source through the shared path — a transcript is
  // just a source event. Behaviour is preserved exactly: a unique per-paste id
  // (never deduped) and a MANUAL_UPLOAD capture with no external id.
  return ingestSourceEvent(
    {
      sourceType: "TRANSCRIPT",
      sourceSystem: "TRANSCRIPT",
      sourceId: `transcript-${randomUUID()}`,
      actor: { name: "" },
      participants: [],
      timestamp: new Date().toISOString(),
      callerEntityId: input.callerEntityId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      content: input.capturedText,
    },
    { llmProvider: input.llmProvider, ...(input.forceMode !== undefined ? { forceMode: input.forceMode } : {}) },
  );
}

export interface IngestSourceEventDeps {
  llmProvider: LLMProvider;
  forceMode?: CommsExtractionMode;
  /** [CS-1] Seeded-context mode: this event is HISTORICAL context the org
   *  chose to seed — not live work. Every created row carries the seeded
   *  lineage label, work items land as VERIFIED context records (never
   *  open to-dos), and NO follow-up send cards or action nudges are
   *  minted (the stale-transcript rule). External names still flow
   *  through the observed→review rail — seeding never creates trust. */
  seededContext?: {
    provided_by: string;
    covering_period?: string | null;
  };
}

/**
 * Slice A — the SINGLE source-agnostic intake core. Every source (transcript,
 * meeting, Slack, Gmail, …) normalizes to a WorkSourceEvent and flows through the
 * SAME chain into the SAME canonical WorkLedger. No parallel path, no second
 * ledger. New behaviour (dedupe, non-transcript quality, source provenance) is
 * confined to non-transcript sources so the proven transcript path is unchanged.
 */
export async function ingestSourceEvent(
  event: WorkSourceEvent,
  deps: IngestSourceEventDeps,
): Promise<IngestTranscriptResult | IngestTranscriptFailure> {
  if (typeof event.content !== "string" || event.content.trim().length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "source event content is required (non-empty string)" };
  }
  const isTranscript = event.sourceSystem === "TRANSCRIPT";

  let orgEntityId: string;
  try {
    orgEntityId = event.orgEntityId ?? (await getOrgEntityId(event.callerEntityId));
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "Caller has no organization." };
  }

  // Dedupe/idempotency — connector sources carry a stable external id; if this
  // event already produced a capture for the org, do not mint duplicate work.
  // Transcripts have a unique per-paste id and are never matched.
  const dedupeKey = sourceDedupeKey(event);
  if (!isTranscript) {
    const existing = await findCaptureByExternalId(orgEntityId, dedupeKey);
    if (existing !== null) {
      return { ok: false, code: "ALREADY_INGESTED", message: `This source event was already ingested (${dedupeKey}).` };
    }
  }

  // Roster for strict, proof-only owner resolution (same matcher recipient-governance uses).
  const identity = await buildIdentityContext(event.callerEntityId);
  const roster: RosterEntry[] = identity.org_roster.map((p) => ({
    entity_id: p.entity_id,
    display_name: p.display_name,
    email: p.email,
    title: p.title,
    shared_project_count: p.shared_project_count,
  }));
  // org_roster is the caller's PEERS (excludes the caller). Add the caller so a
  // capturer who is also named as an owner resolves to themselves.
  if (!roster.some((r) => r.entity_id === event.callerEntityId)) {
    roster.push({ entity_id: event.callerEntityId, display_name: identity.viewer.display_name, email: null });
  }
  const nameById = new Map(roster.map((r) => [r.entity_id, r.display_name]));

  // Slice C — CROSS-SOURCE IDENTITY RECONCILIATION. A source event carries its
  // actor + participants with per-source identifiers (email/handle). Resolve each
  // to a canonical org entity (email → username → name; deterministic, org-scoped,
  // ambiguous held) and add the resolved person's SOURCE-LOCAL name as a roster
  // alias, so the content owner-resolver unifies the SAME person across sources
  // (e.g. "Dave" + david@acme in a Slack message → the David the transcript named).
  // Transcript ingestion has no external identifiers, so this is a no-op there.
  if (!isTranscript) {
    const hints = [
      ...(event.actor.name || event.actor.email || event.actor.handle
        ? [{ name: event.actor.name, email: event.actor.email ?? null, handle: event.actor.handle ?? null }]
        : []),
      ...event.participants.map((p) => ({ name: p.name, email: p.email ?? null, handle: p.handle ?? null })),
    ];
    if (hints.length > 0) {
      const reconciled = await reconcileParticipants(orgEntityId, hints);
      for (const { hint, resolved } of reconciled) {
        const nm = (hint.name ?? "").trim();
        if (resolved.entity_id !== null && nm.length > 0) {
          // Only alias when the source-local name does NOT already resolve to this
          // entity (else we'd add a duplicate roster row and turn a clean match
          // into a false "ambiguous"). The alias is for names like "Dave" that the
          // display name doesn't cover but the email/handle reconciled.
          const alreadyResolves = resolveTokenToEntities(nm, roster).includes(resolved.entity_id);
          if (!alreadyResolves) {
            roster.push({ entity_id: resolved.entity_id, display_name: nm, email: hint.email ?? null });
            if (!nameById.has(resolved.entity_id)) nameById.set(resolved.entity_id, nm);
          }
        }
      }
    }
  }

  // [T-2.5] NAME the source actor's external state once, read-only, BEFORE
  // any rows are written — an unknown coworker and an external party are not
  // the same thing. The internal roster (including the aliases just
  // reconciled above) always wins; the classifier is consulted only for a
  // non-roster actor. The named state drives two behaviors below:
  //   governed_external              → the created work rows carry the safe
  //                                    T-1 external_context shape (calm work
  //                                    context — the admin already decided);
  //   observed_external_needs_review → the T-2A review seed (unchanged bar);
  //   possible_external_match/unknown → silence: no seed, no card certainty.
  const actorName = (event.actor.name ?? "").trim();
  let actorResolution: ExternalResolution | null = null;
  if (
    !isTranscript &&
    actorName.length > 0 &&
    resolveTokenToEntities(actorName, roster).length === 0
  ) {
    actorResolution = await classifyExternalActor({
      org_entity_id: orgEntityId,
      name: actorName,
      email: event.actor.email ?? null,
    });
  }
  const actorExternalContext =
    actorResolution !== null && actorResolution.state === "governed_external"
      ? {
          ...(actorResolution.party_type !== undefined
            ? { external_party_type: actorResolution.party_type }
            : {}),
          ...(actorResolution.external_org_label !== undefined
            ? { external_org_label: actorResolution.external_org_label }
            : {}),
          ...(actorResolution.label !== undefined
            ? { external_person_label: actorResolution.label }
            : {}),
          ...(actorResolution.relationship_label !== undefined
            ? { relationship_label: actorResolution.relationship_label }
            : {}),
        }
      : null;

  // Source-descriptor fields threaded into every ledger row so the canonical
  // record can always prove where work came from. For transcript these are
  // exactly the historical values (source:"transcript_ingest", no provenance).
  const srcType = event.sourceType;
  const srcLabel = isTranscript ? "transcript_ingest" : `${event.sourceSystem.toLowerCase()}_ingest`;
  const provenance: Record<string, unknown> = isTranscript ? {} : sourceEvidenceDetails(event);
  // [CS-1] seeded-context lineage — stamped into EVERY row this ingest
  // creates so projections can always say "seeded history, provided by X,
  // covering Y" instead of presenting old truth as current.
  const seeded = deps.seededContext ?? null;
  const seededDetails: Record<string, unknown> =
    seeded !== null
      ? {
          seeded_context: {
            provided_by: seeded.provided_by,
            ...(seeded.covering_period != null ? { covering_period: seeded.covering_period } : {}),
            seeded_at: new Date().toISOString(),
          },
        }
      : {};

  // 1) Quality gate — only trusted segments may seed work; noise is quarantined.
  //    Transcript uses the transcript segmenter; other sources use the generic
  //    content normaliser (same shape → identical downstream chain).
  const quality = isTranscript
    ? segmentTranscriptQuality(event.content)
    : (() => {
        const n = normalizeSourceContent(event.content);
        return { trustedText: n.trustedText, stats: n.stats, noisyTailStartIndex: n.stats.noisy_tail_start_index };
      })();

  // 2) Governed extraction on the TRUSTED text only (noise cannot create commitments).
  //    [LEARN-LOOP] Prior recipient decisions from THIS org's caller-resolved
  //    follow-ups (BUG C rows ARE the correction store) are derived
  //    deterministically and fed into recipient governance, so a question a
  //    human already answered (ambiguous select / out-of-scope vouch) is not
  //    asked identically again. Org-scoped by the WHERE clause — a correction
  //    can never cross tenants. Policy boundaries are enforced inside
  //    classifyRecipient regardless of any correction.
  const priorRows = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: orgEntityId, ledger_type: "FOLLOW_UP" },
    orderBy: { updated_at: "desc" },
    take: 200,
    select: { details: true },
  });
  const priors = derivePriorRecipientDecisions(
    priorRows
      .map((r: { details: unknown }) => resolvedDecisionFromFollowUpDetails(r.details))
      .filter((d: ResolvedRecipientDecision | null): d is ResolvedRecipientDecision => d !== null),
  );

  const extractionText = quality.stats.trusted > 0 ? quality.trustedText : event.content;
  const extraction = await extractFromCapturedText(
    {
      viewerEntityId: event.callerEntityId,
      captured_text: extractionText,
      priors,
      ...(deps.forceMode !== undefined ? { force_mode: deps.forceMode } : {}),
    },
    deps.llmProvider,
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
  const title = conversationTitle(event.title ?? undefined, extraction.summary);
  const capture = await receiveMeetingCaptureForCaller({
    callerEntityId: event.callerEntityId,
    // Transcript keeps the historical MANUAL_UPLOAD capture with NO external id
    // (never deduped). Connector sources use API_INGEST + the stable external id
    // (the dedupe anchor).
    provider: isTranscript ? "MANUAL_UPLOAD" : "API_INGEST",
    ...(isTranscript ? {} : { providerMeetingId: dedupeKey }),
    title,
    summary: extraction.summary,
    transcript: event.content,
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
        actorEntityId: w.ownerEntityId ?? event.callerEntityId,
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
      source_type: srcType,
      ...(w.ownerEntityId !== null ? { owner_entity_id: w.ownerEntityId } : {}),
      requester_entity_id: event.callerEntityId,
      title: w.title,
      ...(w.sourceEvidence.workItem ? { summary: w.sourceEvidence.workItem } : {}),
      // [CS-1] seeded history is CONTEXT, never an open to-do: rows land
      // terminal (VERIFIED) so no work queue treats them as actionable.
      status: seeded !== null ? "VERIFIED" : w.status,
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
        source: srcLabel,
        ...provenance,
        meeting_capture_id: meetingCaptureId,
        owner_name: w.ownerName,
        needs_review: w.needsReview,
        ...(w.reviewReason ? { review_reason: w.reviewReason } : {}),
        execution_plan: execPlan,
        // [T-2.5] governed external actor → calm work context via the T-1
        // validated read-through (labels only; context, not CRM).
        ...(actorExternalContext !== null ? { external_context: actorExternalContext } : {}),
        ...seededDetails,
      },
      // [CS-1] no action nudges on seeded context rows.
      ...(seeded !== null
        ? {}
        : w.needsReview
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

  // 5a-bis) [PROD-UX-BUGB] Persist each drafted follow-up as a durable
  //   FOLLOW_UP ledger row so the Comms send-cards survive navigation/refresh
  //   (they previously lived only in the CT's volatile extraction response).
  //   The Work Ledger is the single store for conversation-derived artifacts
  //   (data-flow contract rule 2) — no new table, no second follow-up system.
  //   The row is keyed to the conversation (conversation_id = capture) and
  //   owned by the caller (the drafter/sender); target_entity_id is the
  //   resolved recipient when one is provably known. The FULL suggested action
  //   (draft_text + recipient_governance + autonomy + resolution_status) is
  //   stored under details.follow_up, so the caller-scoped projection can
  //   rebuild the exact ProposedActionCard the user last saw. Status starts
  //   DRAFT (pending); Send transitions it to EXECUTED and Dismiss to CANCELLED
  //   via the existing PATCH /work-os/ledger/:id path. FOLLOW_UP rows are
  //   excluded from My Work / Team Work / Blind Spots (the COMMITMENT row
  //   already carries the obligation — this is the sender's private pending
  //   send, not double-counted work).
  // [CS-1] the stale-transcript rule: seeded history NEVER drafts
  // follow-ups — a commitment from months ago is context, not a send card.
  for (const a of seeded !== null ? [] : extraction.suggested_actions) {
    await createLedgerEntry({
      org_entity_id: orgEntityId,
      ledger_type: "FOLLOW_UP",
      source_type: srcType,
      conversation_id: meetingCaptureId,
      owner_entity_id: event.callerEntityId,
      requester_entity_id: event.callerEntityId,
      ...(a.target.entity_id !== null ? { target_entity_id: a.target.entity_id } : {}),
      title: `Follow-up to ${a.target.display_name}`,
      summary: a.draft_text,
      status: "DRAFT",
      priority: "ROUTINE",
      // A concrete next step so the drafted follow-up reads as actionable work
      // (in My Work) and is never mistaken for a stuck, no-next-action blind spot.
      next_action: "Review and send this follow-up.",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      ...(a.source_excerpt !== null ? { evidence: [{ quote: a.source_excerpt }] } : {}),
      details: {
        source: srcLabel,
        ...provenance,
        meeting_capture_id: meetingCaptureId,
        // The complete pre-governed send-card. The projection returns this
        // verbatim as a CommsSuggestedAction so the CT re-renders the same card.
        follow_up: a,
        // [T-2.5] every row derived from a governed-external conversation
        // carries the same calm context.
        ...(actorExternalContext !== null ? { external_context: actorExternalContext } : {}),
      },
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
    source_type: srcType,
    owner_entity_id: event.callerEntityId,
    title,
    summary: extraction.summary,
    status: "VERIFIED",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    details: {
      source: srcLabel,
      ...provenance,
      ...seededDetails,
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

  // 7) Persist each Dandelion seed as a governed, individually-actionable
  //    ORG_SEEDING ledger row (the admin seed queue). Org-scoped (no person
  //    owner/target/requester) so it never appears in employee My Work / Team
  //    Work. Approval-required seeds start SEED_NEEDS_REVIEW; the admin
  //    approve/reject/hold lifecycle never auto-applies (dandelion-seed.service).
  for (const seed of wgMemory.seeds) {
    await createLedgerEntry({
      org_entity_id: orgEntityId,
      ledger_type: "ORG_SEEDING",
      source_type: srcType,
      title: seed.recommendedAction,
      status: seed.approvalRequired ? "SEED_NEEDS_REVIEW" : "SEED_PROPOSED",
      priority: "ROUTINE",
      extraction_source: "TYPESCRIPT_DETERMINISTIC",
      evidence: [{ quote: seed.sourceEvidence }],
      details: {
        source: srcLabel,
        ...provenance,
        ...seededDetails,
        seed_type: seed.seedType,
        subject_name: seed.subjectName,
        subject_entity_id: seed.subjectEntityId,
        source_conversation_id: meetingCaptureId,
        meeting_capture_id: meetingCaptureId,
        confidence: seed.confidence,
        approval_required: seed.approvalRequired,
        policy_status: seed.policyStatus,
        scope: seed.scope,
        sensitivity: seed.sensitivity,
        risk_if_ignored: seed.riskIfIgnored,
        recommended_action: seed.recommendedAction,
      },
    });
  }

  // [T-2A] Observed-external review seed. Deterministic trigger, no
  // name-pattern guessing: the SOURCE ACTOR is not resolvable to any org
  // member AND this org's opt-in observed mention index (ExternalEntity)
  // already knows the name. The seed asks an admin to decide — approval
  // (dandelion-seed.service) tracks a GOVERNED ExternalCollaborator; a
  // mention never auto-promotes. Idempotent: one open seed per subject.
  // [T-2.5] The trigger is now the NAMED state from classifyExternalActor:
  //   - governed_external creates NO redundant seed (the admin already
  //     decided; those conversations became calm external_context above);
  //   - observed_external_needs_review keeps the exact T-2A seed
  //     (review_seed_id !== undefined means an open seed exists — reuse it);
  //   - possible_external_match / unknown create nothing.
  if (
    actorResolution !== null &&
    actorResolution.state === "observed_external_needs_review" &&
    actorResolution.review_seed_id === undefined
  ) {
    // relationship_guess parity with the pre-T-2.5 seed shape.
    const observed = await prisma.externalEntity.findFirst({
      where: {
        org_entity_id: orgEntityId,
        name: { equals: actorName, mode: "insensitive" },
      },
      select: { entity_type: true },
    });
    if (observed !== null) {
      await createLedgerEntry({
        org_entity_id: orgEntityId,
        ledger_type: "ORG_SEEDING",
        source_type: srcType,
        title: `Review external contact "${actorName}" — track as a governed external collaborator?`,
        status: "SEED_NEEDS_REVIEW",
        priority: "ROUTINE",
        extraction_source: "TYPESCRIPT_DETERMINISTIC",
        evidence: [{ quote: quality.trustedText.slice(0, 300) }],
        details: {
          source: srcLabel,
          ...provenance,
          ...seededDetails,
          seed_type: "review_external_party",
          subject_name: actorName,
          subject_entity_id: null,
          relationship_guess: observed.entity_type,
          source_conversation_id: meetingCaptureId,
          meeting_capture_id: meetingCaptureId,
          confidence: "low",
          approval_required: true,
          policy_status: "needs_review",
          scope: "org",
          sensitivity: "internal",
          risk_if_ignored:
            "External asks from this contact stay unlabeled and client context is lost.",
          recommended_action: `Review external contact "${actorName}" — track as a governed external collaborator?`,
        },
      });
    }
  }

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
