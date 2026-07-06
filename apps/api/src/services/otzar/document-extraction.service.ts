// FILE: document-extraction.service.ts
// PURPOSE: [DOC-EXTRACT] The governed successor to CS-5's
//          extract_work:false contract — a REVIEW-FIRST extraction
//          preview over ONE seeded document. Lane decision (Option C):
//          PREVIEW-ONLY, nothing persisted — the Dandelion lane's
//          APPROVE mints operational resulting_actions (wrong
//          semantics: approving a candidate must not "apply" anything),
//          and Review Center is the dual-control SEND lane (wrong
//          shape). Candidates therefore exist only in the response; a
//          human turns an approved candidate into work through the
//          EXISTING governed createLedgerEntry rail (PROPOSED status,
//          explicit ownership, extraction lineage in details) — one
//          work pipeline, no second review system, no dedupe tables,
//          deterministic re-derivation instead of persistence.
//          Extraction runs the EXISTING engine (extractFromCapturedText
//          — LLM with structured output or LOCAL_FALLBACK; the same
//          governed path the comms spine uses), read-only, on explicit
//          admin request only. Candidates are POSSIBILITIES, never
//          facts: "Possible action / Possible decision / Possible
//          blocker / Possible owner" — capped, deduped, each carrying
//          the source document lineage and an excerpt when one can be
//          anchored. Owner candidates are info-only (ownership is
//          confirmed by humans on real work, never created from a
//          document).
// CONNECTS TO: document-context.service.ts (CS-5 rows),
//          comms-extract.service.ts (the one extraction engine),
//          otzar.service.ts wrapper (admin_org gate), routes/otzar
//          .routes.ts (POST /otzar/context/extract-preview),
//          work-os createLedgerEntry (the approval rail, unchanged),
//          tests/integration/document-extraction.test.ts.

import { prisma } from "@niov/database";
import {
  extractFromCapturedText,
  type CommsExtractionResult,
} from "./comms-extract.service.js";
import type { LLMProvider } from "../llm/llm.service.js";
import { seededOriginFromDetails } from "../work-os/work-ledger.service.js";
import { significantTokens } from "../work-os/context-candidates.service.js";

export const EXTRACT_PREVIEW_MAX = 8;
// Per-kind cap so one noisy category can never starve the others —
// "42 tasks from one SOP" is exactly the failure mode this forbids.
export const EXTRACT_PREVIEW_MAX_PER_KIND = 3;

export interface DocumentWorkCandidate {
  /** "Possible action" | "Possible decision" | "Possible blocker" | "Possible owner" */
  kind_label: string;
  text: string;
  /** True for action/decision/blocker — a human may create governed work
   *  from it through the existing rail. Owner candidates are info-only. */
  can_create: boolean;
  /** The existing LEDGER_TYPES value the human-approved item would use. */
  suggested_ledger_type?: "TASK" | "DECISION" | "BLOCKER";
  /** The source line this candidate anchors to, when one is found. */
  excerpt?: string;
}

export type ExtractPreviewResult =
  | {
      ok: true;
      // Labels only — the caller already holds the document's id; no
      // UUID crosses back in the preview.
      source: {
        title_label: string;
        origin_label: string;
        currentness_label?: string;
        covering_period_label?: string;
      };
      candidates: DocumentWorkCandidate[];
      /** The review promise — repeated server-side so no client can drop it. */
      review_note: string;
    }
  | { ok: false; code: "NOT_FOUND" | "NOT_A_SEEDED_DOCUMENT" | "EXTRACTION_UNAVAILABLE"; message: string };

// Anchor a candidate to the source line sharing the most significant
// tokens — an honest pointer, never a fabricated quote. Omitted when no
// line shares at least two tokens.
function anchorExcerpt(candidateText: string, docText: string): string | undefined {
  const wanted = significantTokens(candidateText);
  if (wanted.size === 0) return undefined;
  let best: { line: string; score: number } | null = null;
  for (const rawLine of docText.split(/\n+/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const tokens = significantTokens(line);
    let score = 0;
    for (const t of wanted) if (tokens.has(t)) score += 1;
    if (score >= 2 && (best === null || score > best.score)) {
      best = { line, score };
    }
  }
  return best !== null ? best.line.slice(0, 240) : undefined;
}

function mapCandidates(result: CommsExtractionResult, docText: string): DocumentWorkCandidate[] {
  const out: DocumentWorkCandidate[] = [];
  const seen = new Set<string>();
  const perKind = new Map<string, number>();
  const push = (c: DocumentWorkCandidate): void => {
    const key = `${c.kind_label}::${c.text.trim().toLowerCase()}`;
    const kindCount = perKind.get(c.kind_label) ?? 0;
    if (
      c.text.trim().length === 0 ||
      seen.has(key) ||
      out.length >= EXTRACT_PREVIEW_MAX ||
      kindCount >= EXTRACT_PREVIEW_MAX_PER_KIND
    )
      return;
    seen.add(key);
    perKind.set(c.kind_label, kindCount + 1);
    out.push(c);
  };
  for (const text of result.commitments) {
    const excerpt = anchorExcerpt(text, docText);
    push({
      kind_label: "Possible action",
      text,
      can_create: true,
      suggested_ledger_type: "TASK",
      ...(excerpt !== undefined ? { excerpt } : {}),
    });
  }
  for (const text of result.decisions) {
    const excerpt = anchorExcerpt(text, docText);
    push({
      kind_label: "Possible decision",
      text,
      can_create: true,
      suggested_ledger_type: "DECISION",
      ...(excerpt !== undefined ? { excerpt } : {}),
    });
  }
  for (const text of result.risks_or_blockers) {
    const excerpt = anchorExcerpt(text, docText);
    push({
      kind_label: "Possible blocker",
      text,
      can_create: true,
      suggested_ledger_type: "BLOCKER",
      ...(excerpt !== undefined ? { excerpt } : {}),
    });
  }
  // Ownership is never created from a document — info-only, confirmed by
  // humans on real work.
  for (const node of result.responsibility_graph.nodes) {
    if (node.role !== "owner" && node.role !== "meeting_lead") continue;
    push({
      kind_label: "Possible owner",
      text: `${node.name} may be involved in owning part of this — confirm with them before assigning anything.`,
      can_create: false,
    });
  }
  return out;
}

/** Run the review-first extraction preview over ONE seeded document.
 *  READ-ONLY: no rows, no candidates, no audit, nothing persisted. */
export async function extractDocumentWorkPreview(
  callerEntityId: string,
  orgEntityId: string,
  ledgerEntryId: string,
  llmProvider: LLMProvider,
): Promise<ExtractPreviewResult> {
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: ledgerEntryId },
  });
  if (row === null || row.org_entity_id !== orgEntityId) {
    return { ok: false, code: "NOT_FOUND", message: "document not found" };
  }
  if (row.ledger_type !== "DOCUMENT_CONTEXT") {
    return {
      ok: false,
      code: "NOT_A_SEEDED_DOCUMENT",
      message: "Only seeded document context can be scanned for possible work.",
    };
  }
  const details =
    typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const captureId = typeof details.meeting_capture_id === "string" ? details.meeting_capture_id : null;
  const capture =
    captureId !== null
      ? await prisma.meetingCapture.findUnique({ where: { meeting_capture_id: captureId } })
      : null;
  const docText =
    typeof capture?.transcript === "string" && capture.transcript.trim().length > 0
      ? capture.transcript
      : null;
  if (docText === null) {
    return {
      ok: false,
      code: "EXTRACTION_UNAVAILABLE",
      message: "The stored document text couldn't be loaded. Nothing was scanned.",
    };
  }

  const extraction = await extractFromCapturedText(
    { viewerEntityId: callerEntityId, captured_text: docText },
    llmProvider,
  );
  const seeded = seededOriginFromDetails(row.details);
  return {
    ok: true,
    source: {
      title_label: row.title,
      origin_label: seeded?.origin_label ?? "Seeded document context",
      ...(seeded?.currentness_label !== undefined
        ? { currentness_label: seeded.currentness_label }
        : {}),
      ...(seeded?.covering_period_label !== undefined
        ? { covering_period_label: seeded.covering_period_label }
        : {}),
    },
    candidates: mapCandidates(extraction, docText),
    review_note:
      "These are possible items from seeded background context. Review before using — nothing becomes a task, follow-up, or assignment unless a human approves it.",
  };
}
