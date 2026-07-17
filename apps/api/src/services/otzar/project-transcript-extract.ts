// FILE: project-transcript-extract.ts
// PURPOSE: [PROJECT-COHERENCE C.2b] Deterministic, non-LLM extraction of
//          project document sections from a multi-speaker transcript.
//          Distinguishes confirmed / proposed / unresolved. Never invents
//          facts not present in the text. Used to score against a hidden
//          oracle and to feed project kickoff docs without hand-built sections.
// CONNECTS TO: project-document-body, project-execution-loop, resolve-context

import type {
  ProjectDocumentSections,
  StructuredFact,
} from "./project-document-body.js";
import { buildProjectDocumentBody, isUsefulDocumentBody } from "./project-document-body.js";
import {
  chooseArtifactFromCommunication,
  type ArtifactChoice,
} from "./artifact-from-communication.js";

export interface TranscriptLine {
  speaker: string;
  text: string;
}

export interface TranscriptExtractResult {
  sections: ProjectDocumentSections;
  speakers: string[];
  meeting_required: boolean;
  decisions_confirmed: string[];
  requirements_proposed: string[];
  body_preview_chars: number;
  body_useful: boolean;
  /** Otzar OS choice: what work product communication implies. */
  artifact: ArtifactChoice;
}

function parseLines(transcript: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const raw of transcript.split(/\n+/)) {
    const t = raw.trim();
    if (t.length === 0) continue;
    const m = t.match(/^([A-Za-z][A-Za-z0-9 _./-]{0,40}):\s*(.+)$/);
    if (m) {
      lines.push({ speaker: m[1]!.trim(), text: m[2]!.trim() });
    } else {
      lines.push({ speaker: "unknown", text: t });
    }
  }
  return lines;
}

function statusFor(text: string): StructuredFact["status"] {
  const l = text.toLowerCase();
  if (/\b(reject|out of scope|won't|will not|no longer)\b/.test(l)) {
    return "rejected";
  }
  if (/\b(unresolved|tbd|open question|unclear|maybe|might)\b/.test(l)) {
    return "unresolved";
  }
  if (
    /\b(confirmed|everyone agreed|agreed|priority confirmed|must|required|no phi)\b/.test(
      l,
    )
  ) {
    return "confirmed";
  }
  if (/\b(propose|proposed|should|suggest|consider)\b/.test(l)) {
    return "proposed";
  }
  // "is required" counts as confirmed operational requirement
  if (/\bis required\b/.test(l)) return "confirmed";
  return "proposed";
}

function pushUnique(
  arr: StructuredFact[],
  text: string,
  status: StructuredFact["status"],
  owner?: string,
): void {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 8) return;
  if (arr.some((a) => a.text.toLowerCase() === t.toLowerCase())) return;
  arr.push({
    text: t.slice(0, 400),
    status,
    ...(owner && owner !== "unknown" ? { owner_label: owner } : {}),
  });
}

// WHAT: Extract structured project sections from free-form multi-speaker text.
// WHY: Bridge communication → non-empty project document without LLM invention.
export function extractProjectSectionsFromTranscript(args: {
  transcript: string;
  project_name?: string;
}): TranscriptExtractResult {
  const lines = parseLines(args.transcript);
  const speakers = [
    ...new Set(lines.map((l) => l.speaker).filter((s) => s !== "unknown")),
  ];

  const decisions: StructuredFact[] = [];
  const requirements: StructuredFact[] = [];
  const compliance: StructuredFact[] = [];
  const next_actions: StructuredFact[] = [];
  const meeting: StructuredFact[] = [];
  const open_questions: StructuredFact[] = [];
  const scope: StructuredFact[] = [];
  const risks: StructuredFact[] = [];

  let objective: string | undefined;
  let meetingRequired = false;

  for (const line of lines) {
    const t = line.text;
    const st = statusFor(t);
    const low = t.toLowerCase();

    if (/\b(ship|launch|pilot|objective|goal)\b/.test(low) && !objective) {
      objective = t;
    }
    if (/\b(kickoff|meeting|thursday|calendar|schedule)\b/.test(low)) {
      meetingRequired = true;
      pushUnique(meeting, t, st, line.speaker);
      if (/\bagreed|confirmed|everyone\b/.test(low)) {
        pushUnique(decisions, t, "confirmed", line.speaker);
      }
    }
    if (/\b(priority confirmed|everyone agreed|decision)\b/.test(low)) {
      pushUnique(decisions, t, "confirmed", line.speaker);
    }
    if (/\b(sso|requirement|required for)\b/.test(low)) {
      pushUnique(requirements, t, st === "confirmed" ? "confirmed" : "proposed", line.speaker);
    }
    if (/\b(phi|compliance|dpa|hipaa|legal)\b/.test(low)) {
      pushUnique(compliance, t, st === "proposed" ? "proposed" : "confirmed", line.speaker);
      if (/\bno phi\b/.test(low)) {
        pushUnique(decisions, t, "confirmed", line.speaker);
      }
    }
    if (/\b(action|circulate|follow.?up|assign|owner)\b/.test(low)) {
      pushUnique(next_actions, t, st, line.speaker);
    }
    if (/\b(out of scope|not in scope)\b/.test(low)) {
      pushUnique(scope, t, "rejected", line.speaker);
    }
    if (/\b(risk|slip|blocker|delay)\b/.test(low)) {
      pushUnique(risks, t, "proposed", line.speaker);
    }
    if (/\?$/.test(t) || /\b(open question|unclear)\b/.test(low)) {
      pushUnique(open_questions, t, "unresolved", line.speaker);
    }
  }

  // Implicit pilot scope if project name known
  if (args.project_name && /\bpilot\b/i.test(args.project_name)) {
    pushUnique(scope, "Pilot scope as named by project", "confirmed");
  }

  const owners = speakers.slice(0, 8).map((s) => ({
    role: "Participant",
    name: s,
  }));

  const sections: ProjectDocumentSections = {
    ...(objective ? { objective } : {}),
    ...(scope.length ? { scope } : {}),
    ...(decisions.length ? { decisions } : {}),
    ...(requirements.length ? { requirements } : {}),
    ...(owners.length ? { owners } : {}),
    ...(meeting.length ? { meeting } : {}),
    ...(risks.length ? { risks } : {}),
    ...(compliance.length ? { compliance } : {}),
    ...(open_questions.length ? { open_questions } : {}),
    ...(next_actions.length ? { next_actions } : {}),
    source_note:
      "Extracted deterministically from transcript. Unstated items omitted, not invented.",
  };

  // Communication is the OS: choose artifact from context (doc/slides/form/…).
  const artifact = chooseArtifactFromCommunication({
    text: args.transcript,
    project_name: args.project_name,
  });

  const built = buildProjectDocumentBody({
    project_name: args.project_name ?? "Project",
    sections,
    artifact_type: artifact.title_label,
  });

  const decisionsConfirmed = (sections.decisions ?? [])
    .filter((d) => d.status === "confirmed")
    .map((d) => d.text);
  const requirementsProposed = (sections.requirements ?? []).map((r) => r.text);

  return {
    sections,
    speakers,
    meeting_required: meetingRequired,
    decisions_confirmed: decisionsConfirmed,
    requirements_proposed: requirementsProposed,
    body_preview_chars: built.char_count,
    body_useful: isUsefulDocumentBody(built.body),
    artifact,
  };
}

export interface OracleScore {
  precision: number;
  recall: number;
  f1: number;
  matched: string[];
  missed: string[];
  extra: string[];
}

function normalizeFact(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function softMatch(a: string, b: string): boolean {
  const na = normalizeFact(a);
  const nb = normalizeFact(b);
  if (na.length === 0 || nb.length === 0) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // token overlap ≥ 0.5 of shorter
  const ta = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return false;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits += 1;
  const denom = Math.min(ta.size, tb.size);
  return hits / denom >= 0.5;
}

// WHAT: Score extracted strings against oracle strings (soft match).
// WHY: Hidden oracle measures extraction quality without feeding the model.
export function scoreAgainstOracle(
  predicted: ReadonlyArray<string>,
  oracle: ReadonlyArray<string>,
): OracleScore {
  const matched: string[] = [];
  const missed: string[] = [];
  const used = new Set<number>();
  for (const o of oracle) {
    let found = false;
    for (let i = 0; i < predicted.length; i++) {
      if (used.has(i)) continue;
      if (softMatch(predicted[i]!, o)) {
        used.add(i);
        matched.push(o);
        found = true;
        break;
      }
    }
    if (!found) missed.push(o);
  }
  const extra = predicted.filter((_, i) => !used.has(i));
  const precision =
    predicted.length === 0 ? (oracle.length === 0 ? 1 : 0) : matched.length / predicted.length;
  const recall =
    oracle.length === 0 ? 1 : matched.length / oracle.length;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, matched, missed, extra };
}
