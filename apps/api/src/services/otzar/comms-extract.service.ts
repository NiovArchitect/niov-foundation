// FILE: comms-extract.service.ts
// PURPOSE: Phase 1213 [OTZAR-AMBIENT-COMMS] -- given a "captured"
//          conversation text (from CT's demo-capture timer or future
//          live STT), return a structured organization of what
//          happened: summary, decisions, commitments, and suggested
//          governed-Action follow-ups whose recipients are resolved
//          against the viewer's org roster.
//
//          The suggested_actions surface is the bridge to the
//          existing Phase 1208/1209 governed pipeline: the CT
//          consumer renders each one with the existing
//          ProposedActionCard; the operator clicks Send; that hits
//          POST /api/v1/actions with action_type
//          SEND_INTERNAL_NOTIFICATION; the existing policy /
//          executor / audit / Notification path runs unchanged.
//
//          Phase 1213 does NOT add new Prisma models. Persistence
//          happens via the existing Action + Notification rows the
//          governed pipeline creates when the operator confirms a
//          follow-up. A future bounded slice can add CommsSession +
//          CommsEvent persistence for replay.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/identity-context.ts (org_roster for
//     recipient resolution)
//   - apps/api/src/services/otzar/proposed-action-extractor.ts
//     (recipient-resolution strategy reused)
//   - apps/api/src/services/llm/* (real Anthropic / OpenAI provider
//     used when LLM_PROVIDER is configured)
//
// EXTRACTION MODES:
//   - DEMO_SCRIPTED: returned when the captured text matches the
//     Phase 1213 canonical demo fixture (Founder-provided exact text
//     about the "Launch Follow-Up Meeting"). Returns the verbatim
//     expected output. This is the demo-safe path and the integration-
//     test fixture.
//   - LLM: returned when the captured text doesn't match the canonical
//     fixture AND the LLM provider is configured. The LLM is asked to
//     emit a strict JSON object; output is validated against a schema.
//     Failures fall through to LOCAL_FALLBACK.
//   - LOCAL_FALLBACK: returned when the LLM is unavailable or its
//     output failed schema validation. Returns an empty extraction
//     with an honest extractor-mode label so the CT UI can surface
//     "Otzar organized this using demo capture mode because live
//     meeting capture is not configured yet."
//
// PRIVACY INVARIANT:
//   - Captured text is treated as already-permitted content (the
//     operator started the capture).
//   - The output never carries TAR / wallet / clearance / permission
//     internals for any roster peer.
//   - Suggested-action recipients only carry display_name / email /
//     entity_id (closed-vocab; identical to ProposedAction shape).

import type { LLMProvider } from "../llm/llm.service.js";
import { buildIdentityContext } from "./identity-context.js";
import { isDemoModeAllowed } from "./demo-mode.js";
import type { ProposedActionTargetCandidate } from "./proposed-action-extractor.js";
import {
  classifyRecipient,
  provablyReferenced,
  type RecipientGovernance,
  type RosterEntry,
  type WorkConnectionType,
  type WorkDomain,
} from "./recipient-governance.js";
import {
  buildResponsibilityGraph,
  enrichResponsibilityGraphFromExtraction,
  buildLeadCoordinationCard,
  type ResponsibilityGraph,
  type ResponsibilityRole,
} from "./responsibility-graph.js";
import { computeAutonomyDecision, type AutonomyDecision } from "./autonomy.js";
import { computeDecisionRights, type DecisionDomain } from "./decision-rights.js";
import { buildDecisionInputFromTranscript } from "./decision-rights-extraction.js";
import {
  applyStructuredRightsToDecisionInput,
  loadStructuredRightsForRoster,
  type PartyDomainRights,
} from "./decision-rights-store.service.js";
import type { PriorRecipientDecisions } from "./work-graph-learning.js";

export type CommsExtractionMode =
  | "DEMO_SCRIPTED"
  | "LLM"
  | "LOCAL_FALLBACK";

/**
 * Honest extraction outcome — distinct from HTTP 200 capture acceptance.
 * Capture can succeed while extraction is degraded; callers must not assume
 * organizational work was created from a bare 200.
 */
export type CommsExtractionOutcome =
  | "EXTRACTION_COMPLETED_WITH_SIGNALS"
  | "EXTRACTION_COMPLETED_ZERO_SIGNALS"
  | "EXTRACTION_PROVIDER_UNAVAILABLE"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_FORCED_LOCAL_FALLBACK"
  | "EXTRACTION_DEMO_SCRIPTED";

/** Closed-vocab reason when extraction_mode is LOCAL_FALLBACK (never secret values). */
export type CommsExtractionFallbackReason =
  | "FORCE_MODE_LOCAL_FALLBACK"
  | "PROVIDER_NULL"
  | "PROVIDER_ERROR"
  | "PROVIDER_CIRCUIT_OPEN"
  | "PROVIDER_MALFORMED_RESPONSE"
  | "PROVIDER_EXCEPTION"
  | "DEMO_DISALLOWED_FALLTHROUGH";

export interface CommsSuggestedAction {
  /** Stable client-side identity so the CT consumer can dedupe.
   *  Derived deterministically from `(target_email || display_name) +
   *  body_summary` so the same captured conversation always emits the
   *  same local_ids. */
  local_id: string;
  action_type: "SEND_INTERNAL_NOTIFICATION";
  target: ProposedActionTargetCandidate;
  draft_text: string;
  reason: string;
  /** Captured snippet that triggered this suggestion. Kept short so
   *  the CT card can show "Otzar drafted this from: ..." without
   *  burying the user in transcript. */
  source_excerpt: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** How recipient resolution landed. RESOLVED + confidence HIGH is
   *  the "ready to Send" state. Downgraded to AMBIGUOUS/RESTRICTED when
   *  the recipient-governance gate cannot confirm the recipient. */
  resolution_status:
    | "RESOLVED"
    | "UNRESOLVED"
    | "AMBIGUOUS"
    | "RESTRICTED";
  /** [SECTION-12-WORKGRAPH] Deterministic recipient-safety verdict + proof
   *  path. The card is only "Send"-ready when
   *  recipient_governance.recipientSafety === "confirmed". This is computed by a
   *  gate that NEVER trusts the LLM's resolved recipient — it independently
   *  verifies a provable path from the transcript to the exact entity_id. */
  recipient_governance: RecipientGovernance;
  /** [SECTION-12-WORKGRAPH] Earned-autonomy verdict: whether this action WOULD be
   *  auto-eligible in a future trusted mode (and why), its risk, minimized
   *  context scope, approval reason, and the Sent/Waiting/Needs-review/Blocked
   *  ledger bucket. No auto-send is enabled — advisory only. */
  autonomy: AutonomyDecision;
}

/** Shape before the governance gate runs (no recipient_governance / autonomy).
 *  Exported so the governance wiring (governExtraction) is deterministically
 *  unit-testable without the DB or the LLM. */
export type PreGovSuggestedAction = Omit<
  CommsSuggestedAction,
  "recipient_governance" | "autonomy"
>;
export interface PreGovExtraction {
  summary: string;
  decisions: string[];
  commitments: string[];
  risks_or_blockers: string[];
  suggested_actions: PreGovSuggestedAction[];
  extraction_mode: CommsExtractionMode;
}

export interface CommsLeadCard {
  lead: string;
  body: string;
  tracks: Array<{ name: string; role: ResponsibilityRole; workItem: string | null }>;
}

export interface CommsExtractionResult {
  summary: string;
  decisions: string[];
  commitments: string[];
  risks_or_blockers: string[];
  suggested_actions: CommsSuggestedAction[];
  extraction_mode: CommsExtractionMode;
  /**
   * Outcome distinct from capture acceptance. UI/harness must treat
   * EXTRACTION_PROVIDER_UNAVAILABLE / EXTRACTION_FAILED as degraded — not
   * as proof that organizational work was created.
   */
  extraction_outcome: CommsExtractionOutcome;
  /** Present when extraction_mode === LOCAL_FALLBACK; closed-vocab only. */
  fallback_reason: CommsExtractionFallbackReason | null;
  /** [SECTION-12-WORKGRAPH] Responsibility graph derived from the transcript —
   *  who leads / owns / supports / reviews / is optional. Drives card
   *  generation and the recipient-governance work-connection proof. */
  responsibility_graph: ResponsibilityGraph;
  /** Lead/coordinator card when a meeting lead is detected, else null. */
  lead_card: CommsLeadCard | null;
}

function classifyExtractionOutcome(
  mode: CommsExtractionMode,
  result: Pick<
    CommsExtractionResult,
    "decisions" | "commitments" | "suggested_actions" | "responsibility_graph"
  >,
  fallback: CommsExtractionFallbackReason | null,
): CommsExtractionOutcome {
  if (mode === "DEMO_SCRIPTED") return "EXTRACTION_DEMO_SCRIPTED";
  if (mode === "LOCAL_FALLBACK") {
    if (fallback === "FORCE_MODE_LOCAL_FALLBACK") {
      return "EXTRACTION_FORCED_LOCAL_FALLBACK";
    }
    if (
      fallback === "PROVIDER_NULL" ||
      fallback === "PROVIDER_CIRCUIT_OPEN" ||
      fallback === "PROVIDER_ERROR"
    ) {
      return "EXTRACTION_PROVIDER_UNAVAILABLE";
    }
    return "EXTRACTION_FAILED";
  }
  const signalCount =
    result.decisions.length +
    result.commitments.length +
    result.suggested_actions.length +
    result.responsibility_graph.nodes.length;
  return signalCount > 0
    ? "EXTRACTION_COMPLETED_WITH_SIGNALS"
    : "EXTRACTION_COMPLETED_ZERO_SIGNALS";
}

const CANONICAL_FIXTURE_KEY =
  "launch follow-up meeting"; // case-insensitive substring sentinel

/**
 * Detect whether the captured text matches the Phase 1213 Founder-
 * provided demo fixture. The check is intentionally tolerant: it
 * looks for the title phrase + three named participants ("David",
 * "Samiksha", "Annie") so a paraphrased re-recording still hits the
 * demo path.
 */
function isCanonicalDemoFixture(text: string): boolean {
  const lc = text.toLowerCase();
  if (!lc.includes(CANONICAL_FIXTURE_KEY)) return false;
  // The fixture must mention the three demo recipients so we don't
  // misroute paraphrased non-demo captures.
  const mentionsAllThree =
    lc.includes("david") && lc.includes("samiksha") && lc.includes("annie");
  return mentionsAllThree;
}

/**
 * Build the canonical DEMO_SCRIPTED extraction. Recipients are
 * resolved against the viewer's actual org roster (so if the demo
 * users haven't been seeded the suggestion lands with
 * resolution_status=UNRESOLVED rather than a fabricated entity_id).
 */
function buildDemoExtraction(
  roster: ReadonlyArray<{
    entity_id: string;
    display_name: string;
    email: string | null;
  }>,
): PreGovExtraction {
  const findPeer = (
    firstName: string,
  ): { entity_id: string; display_name: string; email: string | null } | null => {
    const lc = firstName.toLowerCase();
    const exact = roster.find(
      (p) => p.display_name.toLowerCase() === lc,
    );
    if (exact !== undefined) return exact;
    const byPrefix = roster.find((p) =>
      p.display_name.toLowerCase().startsWith(`${lc} `),
    );
    return byPrefix ?? null;
  };

  const candidates: Array<{
    firstName: string;
    draft: string;
    source: string;
  }> = [
    {
      firstName: "David",
      draft:
        "Hey David — per today's launch follow-up, please review the UI flow by Friday. Let me know if you need anything to unblock you.",
      source: "Sadeil asked David to review the UI flow by Friday.",
    },
    {
      firstName: "Samiksha",
      draft:
        "Hi Samiksha — could you review the AI/NLP trial notes and summarize any concerns when you get a chance? Thanks!",
      source:
        "Samiksha agreed to review the AI/NLP trial notes and summarize any concerns.",
    },
    {
      firstName: "Annie",
      draft:
        "Hey Annie — can you complete the compliance review this week once the summary is ready? Let me know what works for you.",
      source:
        "Annie said she can complete a compliance review this week if the summary is ready.",
    },
  ];

  const suggested_actions: PreGovSuggestedAction[] = candidates.map((c) => {
    const peer = findPeer(c.firstName);
    if (peer === null) {
      return {
        local_id: `demo-${c.firstName.toLowerCase()}`,
        action_type: "SEND_INTERNAL_NOTIFICATION" as const,
        target: {
          display_name: c.firstName,
          email: null,
          entity_id: null,
        },
        draft_text: c.draft,
        reason: "Otzar drafted this from the captured conversation.",
        source_excerpt: c.source,
        confidence: "MEDIUM" as const,
        resolution_status: "UNRESOLVED" as const,
      };
    }
    return {
      local_id: `demo-${c.firstName.toLowerCase()}`,
      action_type: "SEND_INTERNAL_NOTIFICATION" as const,
      target: {
        display_name: peer.display_name,
        email: peer.email,
        entity_id: peer.entity_id,
      },
      draft_text: c.draft,
      reason: "Otzar drafted this from the captured conversation.",
      source_excerpt: c.source,
      confidence: "HIGH" as const,
      resolution_status: "RESOLVED" as const,
    };
  });

  return {
    summary:
      "Sadeil, David, Samiksha, and Annie aligned on the Otzar launch follow-up. The team agreed to keep internal note workflows inside Otzar notifications and to defer Slack/email sending until explicit connector approval is finished.",
    decisions: [
      "Keep internal note workflows inside Otzar notifications only for now.",
      "Do not enable Slack or email sending until explicit connector approval is finished.",
    ],
    commitments: [
      "David reviews the UI flow by Friday.",
      "Samiksha reviews the AI/NLP trial notes and summarizes any concerns.",
      "Annie completes the compliance review this week once the summary is ready.",
    ],
    risks_or_blockers: [],
    suggested_actions,
    extraction_mode: "DEMO_SCRIPTED",
  };
}

/**
 * Validate an LLM-emitted extraction against the canonical schema.
 * Returns null when the shape doesn't match; the caller falls back
 * to LOCAL_FALLBACK.
 */
function parseLLMExtraction(
  raw: string,
  roster: ReadonlyArray<{
    entity_id: string;
    display_name: string;
    email: string | null;
  }>,
): PreGovExtraction | null {
  let parsed: unknown;
  try {
    // Strip a leading ```json / ``` if the LLM wrapped its output.
    const jsonText = raw
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "");
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.summary !== "string") return null;
  const decisions = Array.isArray(o.decisions)
    ? (o.decisions as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const commitments = Array.isArray(o.commitments)
    ? (o.commitments as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];
  const risks = Array.isArray(o.risks_or_blockers)
    ? (o.risks_or_blockers as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];
  const sa = Array.isArray(o.suggested_actions)
    ? (o.suggested_actions as unknown[])
    : [];
  const suggested: PreGovSuggestedAction[] = [];
  for (let i = 0; i < sa.length; i++) {
    const r = sa[i];
    if (r === null || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.target_display_name !== "string") continue;
    if (typeof row.draft_text !== "string") continue;
    const display_name = row.target_display_name;
    const peerEmailLc = typeof row.target_email === "string"
      ? row.target_email.toLowerCase()
      : null;
    const peer =
      roster.find(
        (p) =>
          p.display_name.toLowerCase() === display_name.toLowerCase() ||
          (peerEmailLc !== null && p.email !== null &&
            p.email.toLowerCase() === peerEmailLc),
      ) ?? null;
    suggested.push({
      local_id: `llm-${i}-${display_name.toLowerCase().replace(/\s+/g, "-")}`,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      target: {
        display_name: peer?.display_name ?? display_name,
        email: peer?.email ?? null,
        entity_id: peer?.entity_id ?? null,
      },
      draft_text: row.draft_text,
      reason: "Otzar drafted this from the captured conversation.",
      source_excerpt:
        typeof row.source_excerpt === "string" ? row.source_excerpt : null,
      confidence:
        row.confidence === "HIGH" || row.confidence === "MEDIUM" || row.confidence === "LOW"
          ? row.confidence
          : "MEDIUM",
      resolution_status: peer !== null ? "RESOLVED" : "UNRESOLVED",
    });
  }
  return {
    summary: o.summary,
    decisions,
    commitments,
    risks_or_blockers: risks,
    suggested_actions: suggested,
    extraction_mode: "LLM",
  };
}

// Free-text work-domain classifier (heuristic over the transcript) used only as
// a soft role-match signal — there is no typed Department model yet.
// [BLOCK-3B] exported so ingest lineage stamping classifies the SAME way.
export function classifyWorkDomain(text: string): WorkDomain {
  const t = text.toLowerCase();
  if (/integration|deploy|backend|frontend|\bapi\b|auth|token|endpoint|engineer|\bcode\b|repo|openclaw|\bui\b/.test(t)) return "engineering";
  if (/campaign|\bbrand\b|marketing|social media|launch announcement/.test(t)) return "marketing";
  if (/contract|\blegal\b|compliance|\bnda\b/.test(t)) return "legal";
  if (/invoice|budget|finance|pricing/.test(t)) return "finance";
  if (/pipeline|\bdeal\b|prospect|quota/.test(t)) return "sales";
  if (/roadmap|spec|product requirement/.test(t)) return "product";
  return "general";
}

// [BLOCK-3B] exported so ingest lineage stamping maps the SAME way.
export function workDomainToDecisionDomain(d: WorkDomain): DecisionDomain {
  switch (d) {
    case "engineering": return "technical";
    case "product": return "product";
    case "legal": return "legal";
    case "finance": return "finance";
    case "sales": return "customer";
    case "marketing": return "strategic";
    case "operations": return "execution";
    case "general":
    case "unknown":
    default: return "execution";
  }
}

function mapResponsibilityToWorkConnection(role: ResponsibilityRole): WorkConnectionType {
  switch (role) {
    case "meeting_lead": return "meeting_lead";
    case "founder_context_authority": return "founder_context_authority";
    case "owner": return "transcript_assignee";
    case "support": return "support_role";
    case "reviewer": return "approval_owner";
    case "approver": return "approval_owner";
    case "optional_advisor": return "optional_advisor";
  }
}

function rosterRole(
  roster: ReadonlyArray<RosterEntry>,
  entityId: string | null,
): string | null {
  if (entityId === null) return null;
  return roster.find((p) => p.entity_id === entityId)?.title ?? null;
}

/**
 * [SECTION-12-WORKGRAPH] The deterministic recipient-governance gate. Runs AFTER
 * the LLM/demo extraction and NEVER trusts the LLM's resolved recipient: for
 * every suggested action it independently verifies a provable path (transcript
 * mention / responsibility-graph work connection) to the exact entity_id and
 * classifies recipient safety + autonomy eligibility. Unsafe recipients are
 * downgraded so the CT card cannot show a normal "Send". Also attaches the
 * transcript responsibility graph + lead coordination card.
 */
export function governExtraction(
  pre: PreGovExtraction,
  capturedText: string,
  roster: ReadonlyArray<RosterEntry>,
  priors?: PriorRecipientDecisions,
  structuredRights?: ReadonlyArray<PartyDomainRights>,
): CommsExtractionResult {
  // Deterministic transcript graph first; then enrich from commitment AND
  // decision strings / RESOLVED follow-up targets so LLM paths still fan owned
  // work to My Work. Decisions often carry the ownership correction
  // ("R03P1 owns the pilot brief") that commitments paraphrase differently.
  let graph = buildResponsibilityGraph(capturedText);
  graph = enrichResponsibilityGraphFromExtraction(graph, {
    commitments: [...pre.commitments, ...pre.decisions],
    suggested_actions: pre.suggested_actions.map((a) => ({
      target: a.target,
      source_excerpt: a.source_excerpt,
      draft_text: a.draft_text,
      resolution_status: a.resolution_status,
    })),
  });
  const ref = provablyReferenced(capturedText, null, roster);
  const workDomain = classifyWorkDomain(`${pre.summary} ${capturedText}`);
  // [SECTION-12-WORKGRAPH] Decision-rights for the meeting, extracted from the
  // transcript (authority/expertise/dissent). Makes the per-action autonomy
  // verdict decision-aware: unresolved disagreement or authority<->expertise
  // conflict blocks autonomy; alignment raises confidence. Backend-internal —
  // does not change the suggested-action contract shape.
  // [BLOCK-3A] When the org carries STRUCTURED domain rights, they overlay
  // the transcript heuristics before the engine runs: the domain owner is
  // the authority; approvers seat when no owner; a recommend-only party is
  // demoted out of the authority seat. No rights rows → the heuristic
  // input is byte-identical (pure fallback).
  const decision = computeDecisionRights(
    applyStructuredRightsToDecisionInput(
      buildDecisionInputFromTranscript(capturedText, workDomainToDecisionDomain(workDomain)),
      structuredRights ?? [],
    ),
  );

  const suggested_actions: CommsSuggestedAction[] = pre.suggested_actions.map((a) => {
    const firstName = a.target.display_name.split(/\s+/)[0] ?? a.target.display_name;
    const node = graph.nodes.find(
      (n) => n.name.toLowerCase() === firstName.toLowerCase(),
    );
    // [LEARN-LOOP] Deterministic retarget from a prior org SELECT: when the
    // proposed name token genuinely collides on the roster (same ambiguity a
    // human already resolved) and the prior selection maps it to a DIFFERENT
    // active roster member, propose THAT person instead of re-guessing. The
    // classifier then treats it as an org-correction alias proof ("likely",
    // evidence correction_memory) — still human-reviewed, never send-ready by
    // correction alone. Stable entity ids only; conflicting prior selections
    // were already dropped at derivation.
    let target = a.target;
    const tokenLc = firstName.toLowerCase();
    const priorPick = priors?.selectionsByToken.get(tokenLc);
    const tokenCollides = [...ref.ambiguous.keys()].some((k) => k.toLowerCase() === tokenLc);
    if (priorPick !== undefined && priorPick !== target.entity_id && tokenCollides) {
      const pick = roster.find((r) => r.entity_id === priorPick);
      if (pick !== undefined) {
        target = {
          ...target,
          entity_id: pick.entity_id,
          display_name: pick.display_name,
          email: pick.email,
        };
      }
    }
    const governance: RecipientGovernance = classifyRecipient(
      {
        target: {
          entity_id: target.entity_id,
          display_name: target.display_name,
          email: target.email,
          role: rosterRole(roster, target.entity_id),
        },
        sourceExcerpt: a.source_excerpt,
        transcriptText: capturedText,
        roster,
        participantEntityIds: null, // raw-text capture carries no participant list
        ...(node !== undefined
          ? { workConnectionType: mapResponsibilityToWorkConnection(node.role) }
          : {}),
        workDomain,
        policyStatus: "unknown",
        sensitivity: "internal",
        // [LEARN-LOOP] Prior org corrections from caller-resolved follow-ups.
        // Policy boundaries stay untouched inside classifyRecipient.
        ...(priors !== undefined
          ? {
              priorSelections: priors.selectionsByToken,
              priorConfirmedEntityIds: priors.confirmedEntityIds,
            }
          : {}),
      },
      ref,
    );
    // Keep the legacy resolution_status in lock-step with the safety verdict.
    // Only DOWNGRADE a recipient the extractor thought was RESOLVED — an honestly
    // UNRESOLVED recipient (null entity / empty roster) stays UNRESOLVED, never
    // mislabeled AMBIGUOUS. This is what catches the RESOLVED-but-unsafe Shweta
    // case (-> RESTRICTED) without corrupting honest non-resolution.
    const resolution_status: CommsSuggestedAction["resolution_status"] =
      a.resolution_status === "RESOLVED" && governance.recipientSafety !== "confirmed"
        ? governance.recipientSafety === "ambiguous"
          ? "AMBIGUOUS"
          : "RESTRICTED"
        : a.resolution_status;
    // Earned-autonomy verdict from the governance proof path + the meeting's
    // decision-rights (no auto-send is enabled; advisory only).
    const autonomy = computeAutonomyDecision({ governance, decision });
    return { ...a, target, recipient_governance: governance, autonomy, resolution_status };
  });

  const base = {
    summary: pre.summary,
    decisions: pre.decisions,
    commitments: pre.commitments,
    risks_or_blockers: pre.risks_or_blockers,
    suggested_actions,
    extraction_mode: pre.extraction_mode,
    responsibility_graph: graph,
    lead_card: buildLeadCoordinationCard(graph),
  };
  // Outcome/fallback are filled by extractFromCapturedText (has provider
  // failure context). governExtraction alone defaults outcome from mode+signals.
  return {
    ...base,
    extraction_outcome: classifyExtractionOutcome(
      pre.extraction_mode,
      base,
      null,
    ),
    fallback_reason: null,
  };
}

const LLM_EXTRACTION_SYSTEM_PROMPT =
  "You are Otzar, a governed AI Twin. Organize the captured conversation " +
  "into a structured JSON object with EXACT shape:\n" +
  '{ "summary": string,\n' +
  '  "decisions": string[],\n' +
  '  "commitments": string[],\n' +
  '  "risks_or_blockers": string[],\n' +
  '  "suggested_actions": [\n' +
  '    { "target_display_name": string,\n' +
  '      "target_email": string | null,\n' +
  '      "draft_text": string,\n' +
  '      "source_excerpt": string | null,\n' +
  '      "confidence": "HIGH" | "MEDIUM" | "LOW" } ] }\n' +
  "Only suggest follow-ups for clear commitments or asks. RECIPIENT SAFETY: " +
  "resolve a name ONLY when the transcript name clearly matches a roster entry " +
  "by exact name or first name. NEVER phonetically guess or substitute a " +
  "similar-sounding but DIFFERENT roster name for a name that is not clearly " +
  "present. If the " +
  "transcript names someone who is NOT clearly in the roster, OMIT the " +
  "suggested action -- never pick the nearest-sounding roster member. If two " +
  "roster members could match the same name, OMIT and let the human " +
  "disambiguate.\n" +
  "Output JSON only, no markdown, no explanation.";

export interface ExtractFromTextInput {
  viewerEntityId: string;
  captured_text: string;
  /** Optional override used by tests / future demo modes. */
  force_mode?: CommsExtractionMode;
  /** [LEARN-LOOP] Prior org recipient decisions (derived from resolved
   *  FOLLOW_UP rows by the ingest layer) fed into recipient governance. */
  priors?: PriorRecipientDecisions;
}

/**
 * Top-level entry point. Builds the viewer's identity context (for
 * roster resolution) and routes to DEMO_SCRIPTED / LLM /
 * LOCAL_FALLBACK as appropriate.
 *
 * LOCAL_FALLBACK is never a silent success: the result always carries
 * extraction_outcome + fallback_reason so capture ≠ organizational work.
 */
export async function extractFromCapturedText(
  input: ExtractFromTextInput,
  llmProvider: LLMProvider | null,
): Promise<CommsExtractionResult> {
  const identity = await buildIdentityContext(input.viewerEntityId);
  const roster: RosterEntry[] = identity.org_roster.map((p) => ({
    entity_id: p.entity_id,
    display_name: p.display_name,
    email: p.email,
    title: p.title,
    shared_project_count: p.shared_project_count,
  }));
  // [BLOCK-3A] Structured domain rights for the HUMAN roster (empty when
  // none are set — the heuristic path then runs unchanged).
  const structuredRights = await loadStructuredRightsForRoster(identity.org.org_id, roster);

  // [OTZAR-V1-LIVE-1A-FOUNDATION] Demo intake is canned, not real extraction.
  // It must never silently run in staging/production: a canonical-fixture text
  // would otherwise auto-return scripted output and mask whether the real LLM
  // path works. force_mode wins if set; otherwise auto-detect the demo fixture —
  // but ONLY when demo mode is allowed here. When it is not allowed, both the
  // auto-detected AND the explicitly-forced demo paths fall through to the real
  // LLM / LOCAL_FALLBACK path (the route layer additionally rejects an explicit
  // demo request with 422 for a clear caller error).
  const demoAllowed = isDemoModeAllowed();
  const effectiveMode: CommsExtractionMode | "AUTO" =
    input.force_mode ??
    (demoAllowed && isCanonicalDemoFixture(input.captured_text)
      ? "DEMO_SCRIPTED"
      : "AUTO");

  if (effectiveMode === "DEMO_SCRIPTED" && demoAllowed) {
    return governExtraction(buildDemoExtraction(roster), input.captured_text, roster, input.priors, structuredRights);
  }

  let fallbackReason: CommsExtractionFallbackReason | null = null;

  if (input.force_mode === "LOCAL_FALLBACK") {
    fallbackReason = "FORCE_MODE_LOCAL_FALLBACK";
  } else if (llmProvider === null) {
    fallbackReason = "PROVIDER_NULL";
  } else if (effectiveMode !== "LOCAL_FALLBACK") {
    // LLM path — only fall through with an explicit reason.
    try {
      const result = await llmProvider.generateResponse({
        system: LLM_EXTRACTION_SYSTEM_PROMPT,
        user:
          `Roster (display_name -> email):\n${roster
            .map((p) => `${p.display_name} -> ${p.email ?? "(no email)"}`)
            .join("\n")}\n\nCaptured conversation:\n${input.captured_text}`,
      });
      if (result.ok) {
        const parsed = parseLLMExtraction(result.text, roster);
        if (parsed !== null) {
          return governExtraction(parsed, input.captured_text, roster, input.priors, structuredRights);
        }
        fallbackReason = "PROVIDER_MALFORMED_RESPONSE";
      } else {
        const msg = ("fallback_message" in result ? result.fallback_message : "") ?? "";
        fallbackReason = /circuit/i.test(msg)
          ? "PROVIDER_CIRCUIT_OPEN"
          : "PROVIDER_ERROR";
      }
    } catch {
      fallbackReason = "PROVIDER_EXCEPTION";
    }
  } else if (input.force_mode === "DEMO_SCRIPTED" && !demoAllowed) {
    fallbackReason = "DEMO_DISALLOWED_FALLTHROUGH";
  }

  // LOCAL_FALLBACK -- honest empty extraction (still governed for shape parity).
  // Capture is preserved by the ingest layer; this result must not be treated
  // as organizational intelligence.
  const degraded = governExtraction(
    {
      summary:
        "Otzar captured this conversation but live extraction isn't configured. Connect an LLM provider, or use demo capture mode to see organized output.",
      decisions: [],
      commitments: [],
      risks_or_blockers: [],
      suggested_actions: [],
      extraction_mode: "LOCAL_FALLBACK",
    },
    input.captured_text,
    roster,
    undefined,
    structuredRights,
  );
  const reason = fallbackReason ?? "PROVIDER_NULL";
  return {
    ...degraded,
    fallback_reason: reason,
    extraction_outcome: classifyExtractionOutcome(
      "LOCAL_FALLBACK",
      degraded,
      reason,
    ),
  };
}
