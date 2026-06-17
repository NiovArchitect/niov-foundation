// FILE: draft-tone.service.ts
// PURPOSE: Phase 1285-Y — advisory DRAFT_TONE evaluation for proposed messages
//          (internal notes, replies, follow-ups, Action Center proposed messages,
//          future ambient/voice suggested replies). Foundation computes a
//          deterministic base assessment (primary + fallback), OPTIONALLY asks
//          the advisory Python evaluator to refine it, and VALIDATES that the
//          suggested revision is safe (no em dash, no new recipient / email /
//          link, intent preserved) before offering it. The ORIGINAL draft is
//          always preserved and primary; nothing is sent or created; approval
//          gates are Foundation-authoritative (Python can raise, never lower).
//          No flow blocks on Python.
// CONNECTS TO: routes/work-os-ledger.routes.ts (the /work-os/draft-tone/evaluate
//          route); intelligence/python-draft-tone.service.ts (advisory client);
//          intelligence/python-intelligence.ts (envelope + validation);
//          tests/unit/draft-tone.test.ts.

import {
  evaluateDraftTonePython,
  type DraftChannel,
  type DraftToneRuntimeConfig,
} from "../intelligence/python-draft-tone.service.js";
import {
  buildDraftToneEnvelope,
  validateDraftToneEnvelope,
  type DraftToneCandidate,
  type PythonIntelligenceEnvelope,
} from "../intelligence/python-intelligence.js";

export interface DraftRecipientContext {
  display_name?: string; // display name only — never a raw entity UUID
  relationship?: string;
  internal: boolean;
}

// The governed draft assessment. original_draft is PRESERVED verbatim;
// suggested_revision is advisory and null when a Python rewrite was rejected.
export interface DraftToneAssessment {
  original_draft: string;
  channel: DraftChannel;
  quality_score: number;
  tone_label: string;
  risk_flags: string[];
  suggested_revision: string | null;
  reason: string;
  confidence: string;
  approval_required: boolean; // Foundation-authoritative
  preserves_intent: boolean;
  provenance: string; // "python:draft-tone" | "foundation:deterministic-tone"
}

export interface EvaluateDraftToneArgs {
  draft_text: string;
  channel?: DraftChannel;
  recipient_context?: DraftRecipientContext;
  intent?: string;
  constraints?: { approval_required?: boolean };
  draft_id?: string;
  runtime?: DraftToneRuntimeConfig;
  nowIso?: string;
}

const DET_PROVENANCE = "foundation:deterministic-tone";
const PY_PROVENANCE = "python:draft-tone";
const EM_DASH_RE = /\s*[—–]\s*/g; // em dash + en dash, with surrounding space
const HARSH = ["unacceptable", "ridiculous", "failed", "must ", "immediately", "asap"];
const BLAME = ["you failed", "your fault", "you didn't", "you did not", "you never", "you should have"];
const VAGUE = ["stuff", "things", "whatever", "some point", "etc"];
const WARM = ["thanks", "thank you", "please", "appreciate", "grateful"];
const SOFTEN: Array<[RegExp, string]> = [
  [/\byou failed to\b/gi, "we still need to"],
  [/\byou did ?n[o']t\b/gi, "we still need to"],
  [/\byou never\b/gi, "we have not yet"],
  [/\byour fault\b/gi, "something to fix together"],
  [/\byou need to\b/gi, "could you"],
  [/\byou must\b/gi, "please"],
  [/\bASAP\b/g, "as soon as you can"],
  [/\basap\b/gi, "as soon as you can"],
];

function stripEmDashes(text: string): string {
  return text.replace(EM_DASH_RE, ", ");
}

function deterministicRevision(original: string): string {
  let out = original;
  for (const [re, repl] of SOFTEN) out = out.replace(re, repl);
  out = stripEmDashes(out).replace(/[ \t]+/g, " ").trim();
  out = stripEmDashes(out); // belt-and-suspenders
  if (out.length > 0 && !".!?".includes(out[out.length - 1]!)) out = `${out}.`;
  return out;
}

// WHAT: the deterministic draft assessment — BOTH the safe primary and the
//        fallback when Python is down. Mirrors the Python heuristic.
function deterministicAssessment(
  args: { draft_text: string; channel: DraftChannel; recipient_context?: DraftRecipientContext; approvalRequired: boolean },
): Omit<DraftToneAssessment, "original_draft" | "channel"> {
  const original = args.draft_text;
  const lc = original.toLowerCase();
  const words = original.trim().split(/\s+/).filter(Boolean);
  const flags: string[] = [];
  const hasEmDash = /[—–]/.test(original);
  const harsh = HARSH.some((m) => lc.includes(m));
  const blame = BLAME.some((m) => lc.includes(m));
  const vague = words.length < 6 || VAGUE.some((m) => lc.includes(m));
  const tooMany = words.length > 120;
  if (hasEmDash) flags.push("EM_DASH");
  if (harsh) flags.push("HARSH_TONE");
  if (blame) flags.push("BLAME_LANGUAGE");
  if (vague) flags.push("MISSING_CONTEXT");
  if (tooMany) flags.push("TOO_MANY_WORDS");
  const external = args.channel === "email" || (args.recipient_context !== undefined && args.recipient_context.internal === false);
  if (external) flags.push("EXTERNAL_SEND_REQUIRES_APPROVAL");
  if (args.recipient_context === undefined && (args.channel === "internal_message" || args.channel === "email")) {
    flags.push("AMBIGUOUS_RECIPIENT");
  }

  let label: string;
  if (blame || harsh) label = "TOO_HARSH";
  else if (tooMany) label = "TOO_LONG";
  else if (vague) label = "TOO_VAGUE";
  else if (flags.includes("AMBIGUOUS_RECIPIENT")) label = "NEEDS_CONTEXT";
  else if (WARM.some((w) => lc.includes(w))) label = "WARM";
  else if (words.length <= 40) label = "EXECUTIVE_READY";
  else label = "CLEAR";

  let score = 100;
  if (harsh) score -= 25;
  if (blame) score -= 20;
  if (tooMany) score -= 15;
  if (vague) score -= 15;
  if (hasEmDash) score -= 5;
  score = Math.max(10, Math.min(100, score));

  const reasonParts: string[] = [];
  if (harsh) reasonParts.push("harsh tone");
  if (blame) reasonParts.push("blame language");
  if (vague) reasonParts.push("missing context");
  if (tooMany) reasonParts.push("too long");
  if (hasEmDash) reasonParts.push("em dash present");
  if (external) reasonParts.push("external send needs approval");
  const reason = reasonParts.length > 0
    ? `${reasonParts.join(", ")}; suggested a cleaner revision.`
    : "Reads clearly; minor cleanup only.";

  return {
    quality_score: score,
    tone_label: label,
    risk_flags: flags.slice(0, 12),
    suggested_revision: deterministicRevision(original),
    reason,
    confidence: harsh || blame || tooMany ? "HIGH" : "MEDIUM",
    approval_required: args.approvalRequired,
    preserves_intent: true,
    provenance: DET_PROVENANCE,
  };
}

// WHAT: the governed draft-tone evaluation entrypoint.
// INPUT: the proposed draft + channel/recipient/intent/constraints (+ runtime).
// OUTPUT: { assessment, envelope }. The original draft is preserved; the
//          suggested revision is advisory; approval_required is authoritative.
// WHY: the route consumes this. Deterministic assessment ALWAYS exists; Python
//      only refines it when its suggested revision passes Foundation validation.
//      Nothing is sent or created; no flow blocks on Python.
export async function evaluateDraftTone(
  args: EvaluateDraftToneArgs,
): Promise<{ assessment: DraftToneAssessment; envelope: PythonIntelligenceEnvelope }> {
  const channel: DraftChannel = args.channel ?? "unknown";
  const nowIso = args.nowIso ?? new Date().toISOString();
  // Foundation-authoritative approval gate: external channel / external recipient
  // / explicit caller constraint. Python can never lower this.
  const approvalRequired =
    channel === "email" ||
    (args.recipient_context !== undefined && args.recipient_context.internal === false) ||
    args.constraints?.approval_required === true;

  const det = deterministicAssessment({
    draft_text: args.draft_text,
    channel,
    ...(args.recipient_context !== undefined ? { recipient_context: args.recipient_context } : {}),
    approvalRequired,
  });

  const started = Date.now();
  const result = await evaluateDraftTonePython(
    {
      draft_text: args.draft_text,
      channel,
      ...(args.draft_id !== undefined ? { draft_id: args.draft_id } : {}),
      ...(args.recipient_context !== undefined ? { recipient_context: args.recipient_context } : {}),
      ...(args.intent !== undefined ? { intent: args.intent } : {}),
      constraints: {
        no_em_dash: true,
        preserve_intent: true,
        ...(args.constraints?.approval_required !== undefined ? { approval_required: args.constraints.approval_required } : {}),
      },
    },
    args.runtime ?? {},
  );
  const latency = Date.now() - started;
  const envelope = validateDraftToneEnvelope(
    buildDraftToneEnvelope(result, latency, nowIso),
    { originalDraft: args.draft_text, approvalRequired },
  );

  if (envelope.authority === "FOUNDATION_VALIDATED") {
    const c = envelope.candidates[0] as DraftToneCandidate;
    const assessment: DraftToneAssessment = {
      original_draft: args.draft_text, // PRESERVED verbatim
      channel,
      quality_score: c.quality_score,
      tone_label: c.tone_label,
      risk_flags: c.risk_flags,
      suggested_revision: c.suggested_revision,
      reason: c.reason,
      confidence: c.confidence,
      approval_required: c.approval_required, // already raised in validation
      preserves_intent: c.preserves_intent,
      provenance: PY_PROVENANCE,
    };
    return { assessment, envelope };
  }

  // Python down / drift / unsafe rewrite → deterministic assessment surfaces.
  const assessment: DraftToneAssessment = {
    original_draft: args.draft_text, // PRESERVED verbatim
    channel,
    ...det,
  };
  return { assessment, envelope };
}

// Exposed for unit tests (the pure deterministic pieces).
export const __internals = { deterministicAssessment, deterministicRevision, stripEmDashes };
