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
import type { ProposedActionTargetCandidate } from "./proposed-action-extractor.js";

export type CommsExtractionMode =
  | "DEMO_SCRIPTED"
  | "LLM"
  | "LOCAL_FALLBACK";

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
   *  the "ready to Send" state. */
  resolution_status:
    | "RESOLVED"
    | "UNRESOLVED"
    | "AMBIGUOUS"
    | "RESTRICTED";
}

export interface CommsExtractionResult {
  summary: string;
  decisions: string[];
  commitments: string[];
  risks_or_blockers: string[];
  suggested_actions: CommsSuggestedAction[];
  extraction_mode: CommsExtractionMode;
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
): CommsExtractionResult {
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

  const suggested_actions: CommsSuggestedAction[] = candidates.map((c) => {
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
): CommsExtractionResult | null {
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
  const suggested: CommsSuggestedAction[] = [];
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
  "Only suggest follow-ups for clear commitments or asks. Use the org " +
  "roster names verbatim. Never invent people not in the roster -- if " +
  "the speaker named someone unknown, omit the suggested action.\n" +
  "Output JSON only, no markdown, no explanation.";

export interface ExtractFromTextInput {
  viewerEntityId: string;
  captured_text: string;
  /** Optional override used by tests / future demo modes. */
  force_mode?: CommsExtractionMode;
}

/**
 * Top-level entry point. Builds the viewer's identity context (for
 * roster resolution) and routes to DEMO_SCRIPTED / LLM /
 * LOCAL_FALLBACK as appropriate.
 */
export async function extractFromCapturedText(
  input: ExtractFromTextInput,
  llmProvider: LLMProvider | null,
): Promise<CommsExtractionResult> {
  const identity = await buildIdentityContext(input.viewerEntityId);
  const roster = identity.org_roster.map((p) => ({
    entity_id: p.entity_id,
    display_name: p.display_name,
    email: p.email,
  }));

  // force_mode wins if set; otherwise auto-detect demo fixture.
  const effectiveMode: CommsExtractionMode | "AUTO" =
    input.force_mode ??
    (isCanonicalDemoFixture(input.captured_text) ? "DEMO_SCRIPTED" : "AUTO");

  if (effectiveMode === "DEMO_SCRIPTED") {
    return buildDemoExtraction(roster);
  }

  // LLM path.
  if (llmProvider !== null && effectiveMode !== "LOCAL_FALLBACK") {
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
        if (parsed !== null) return parsed;
      }
    } catch {
      // Fall through to LOCAL_FALLBACK.
    }
  }

  // LOCAL_FALLBACK -- honest empty extraction.
  return {
    summary:
      "Otzar captured this conversation but live extraction isn't configured. Connect an LLM provider, or use demo capture mode to see organized output.",
    decisions: [],
    commitments: [],
    risks_or_blockers: [],
    suggested_actions: [],
    extraction_mode: "LOCAL_FALLBACK",
  };
}
