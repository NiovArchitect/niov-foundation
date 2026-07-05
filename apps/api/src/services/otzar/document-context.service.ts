// FILE: document-context.service.ts
// PURPOSE: [CS-5] The document-context adapter — Gap V lane 1's corpus
//          entry, with EXTRACTION OFF BY DESIGN (should_extract_work=false
//          is the v1 contract, not an option). A seeded document lands as
//          exactly two durable, org-owned, lineaged records through the
//          SAME canonical writers the spine uses — a MeetingCapture (the
//          durable source store) and ONE DOCUMENT_CONTEXT WorkLedger row
//          (VERIFIED, ownerless, terminal): reference context, never open
//          work. No work items, no follow-up cards, no Dandelion seeds, no
//          notifications, no personal-wallet writes, no external trust —
//          external mentions inside documents route to review only when a
//          future extract/review flow runs (documented limitation, not a
//          silent behavior). The stale-truth rule is structural: a
//          document is timestamped starting context (current | historical
//          | unknown), never automatically current truth.
// CONNECTS TO: otzar.service.ts (admin_org-gated seedDocumentContext),
//          routes/otzar.routes.ts (POST /otzar/context/seed-document),
//          meeting-capture.service.ts + work-ledger.service.ts (the
//          canonical writers), Gap V doctrine, tests/integration/
//          document-context.test.ts.

import { receiveMeetingCaptureForCaller } from "./meeting-capture.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { getOrgEntityId } from "../governance/org.js";

export const DOCUMENT_SOURCE_KINDS = [
  "PROJECT_BRIEF",
  "SOP",
  "DECISION_LOG",
  "MEETING_SUMMARY",
  "POLICY",
  "CUSTOMER_CONTEXT",
  "VENDOR_CONTEXT",
  "TEAM_CONTEXT",
  "OTHER",
] as const;
export type DocumentSourceKind = (typeof DOCUMENT_SOURCE_KINDS)[number];

export const DOCUMENT_CURRENTNESS = ["current", "historical", "unknown"] as const;
export type DocumentCurrentness = (typeof DOCUMENT_CURRENTNESS)[number];

export const DOCUMENT_BODY_MAX = 20_000;
export const DOCUMENT_TITLE_MAX = 120;

export interface DocumentContextSeedInput {
  source_kind: DocumentSourceKind;
  title: string;
  body: string;
  currentness: DocumentCurrentness;
  covering_period?: string | null;
}

export type SeedDocumentResult =
  | {
      ok: true;
      ledger_entry_id: string;
      meeting_capture_id: string;
      source_kind: DocumentSourceKind;
      currentness: DocumentCurrentness;
    }
  | { ok: false; code: "INVALID_REQUEST" | "NO_ORG_FOR_CALLER" | "CAPTURE_FAILED"; message: string };

/** Pure normalization/validation — the adapter contract's input gate. */
export function normalizeDocumentContextSeed(
  raw: Record<string, unknown>,
): DocumentContextSeedInput | { error: string } {
  const kind = typeof raw.source_kind === "string" ? raw.source_kind : "";
  if (!(DOCUMENT_SOURCE_KINDS as readonly string[]).includes(kind)) {
    return { error: "Choose what kind of context this is." };
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length === 0 || title.length > DOCUMENT_TITLE_MAX) {
    return { error: `A title is required (up to ${DOCUMENT_TITLE_MAX} characters).` };
  }
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (body.length === 0) return { error: "Paste the document text." };
  if (body.length > DOCUMENT_BODY_MAX) {
    return {
      error: `Keep one document under ${DOCUMENT_BODY_MAX.toLocaleString()} characters — seed longer material as separate pieces.`,
    };
  }
  const currentness = typeof raw.currentness === "string" ? raw.currentness : "";
  if (!(DOCUMENT_CURRENTNESS as readonly string[]).includes(currentness)) {
    return { error: "Say whether this is current, historical, or unsure." };
  }
  const period =
    typeof raw.covering_period === "string" && raw.covering_period.trim().length > 0
      ? raw.covering_period.trim().slice(0, 80)
      : null;
  return {
    source_kind: kind as DocumentSourceKind,
    title,
    body,
    currentness: currentness as DocumentCurrentness,
    ...(period !== null ? { covering_period: period } : {}),
  };
}

const KIND_LABEL: Record<DocumentSourceKind, string> = {
  PROJECT_BRIEF: "Project brief",
  SOP: "Process / SOP",
  DECISION_LOG: "Decision log",
  MEETING_SUMMARY: "Meeting summary",
  POLICY: "Policy",
  CUSTOMER_CONTEXT: "Customer context",
  VENDOR_CONTEXT: "Vendor context",
  TEAM_CONTEXT: "Team context",
  OTHER: "Reference document",
};

/** Seed ONE document as org-owned reference context. Admin gating happens
 *  in the OtzarService wrapper; provided_by is always the session caller. */
export async function seedDocumentContextForCaller(
  callerEntityId: string,
  input: DocumentContextSeedInput,
): Promise<SeedDocumentResult> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "No organization found for the caller." };
  }

  // 1) The durable source store — same writer the spine uses. MANUAL_UPLOAD,
  //    no external id (documents are deliberately never deduped in v1: two
  //    admins seeding the same policy is reviewable, not an error).
  const capture = await receiveMeetingCaptureForCaller({
    callerEntityId,
    provider: "MANUAL_UPLOAD",
    title: input.title,
    summary: `Seeded ${KIND_LABEL[input.source_kind]} — organization reference context.`,
    transcript: input.body,
    participants: [],
  });
  if (!capture.ok) {
    return { ok: false, code: "CAPTURE_FAILED", message: "The document couldn't be stored. Nothing was created." };
  }
  const meetingCaptureId = capture.meeting_capture.meeting_capture_id;

  // 2) ONE reference-context ledger row: VERIFIED (terminal — absent from
  //    every open-work queue), ownerless (context has no assignee), fully
  //    lineaged. Extraction deliberately does NOT run (v1 contract).
  const created = await createLedgerEntry({
    org_entity_id: orgEntityId,
    ledger_type: "DOCUMENT_CONTEXT",
    source_type: "DOCUMENT",
    title: input.title,
    summary: input.body.slice(0, 280),
    status: "VERIFIED",
    priority: "ROUTINE",
    extraction_source: "TYPESCRIPT_DETERMINISTIC",
    evidence: [{ quote: input.body.slice(0, 300) }],
    details: {
      source: "document_context_seed",
      meeting_capture_id: meetingCaptureId,
      seeded_context: {
        provided_by: callerEntityId,
        ...(input.covering_period != null ? { covering_period: input.covering_period } : {}),
        seeded_at: new Date().toISOString(),
      },
      document: {
        source_kind: input.source_kind,
        kind_label: KIND_LABEL[input.source_kind],
        currentness: input.currentness,
        extract_work: false, // the v1 contract, recorded on the row itself
      },
    },
  });
  if (!created.ok) {
    return { ok: false, code: "CAPTURE_FAILED", message: "The document couldn't be recorded. Check Data & Knowledge." };
  }
  return {
    ok: true,
    ledger_entry_id: created.entry.ledger_entry_id,
    meeting_capture_id: meetingCaptureId,
    source_kind: input.source_kind,
    currentness: input.currentness,
  };
}
