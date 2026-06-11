// FILE: observe-intake.service.ts
// PURPOSE: Phase 1227 — the governed Observe pipeline: capture →
//          provider text extraction (ocr-provider.ts) → structured
//          extraction (the Phase 1213 comms-extract pipeline:
//          summary / decisions / commitments / risks / roster-aware
//          suggested follow-ups) → persisted ObserveCapture →
//          optional workspace attach (imports decisions +
//          commitments into the workspace ledger).
//
// GOVERNANCE POSTURE (RULE 0):
//   - Suggested follow-ups are NEVER auto-executed. Action rows land
//     only when the operator confirms through the existing Phase
//     1208 POST /api/v1/actions path. This service creates ZERO
//     Action rows and ZERO Notification rows.
//   - No memory capsules are created here — memory candidates reach
//     COSMP only through the existing approved capsule path.
//   - Everything is caller + org scoped; cross-org captures are
//     indistinguishable from missing ones (no existence oracle).
//   - Audit before response on every lifecycle transition (RULE 4).
//   - The stored `extraction` Json carries SAFE projections only —
//     summaries, closed-vocab labels, short excerpts. Raw document
//     bytes never enter this service.
//
// CONNECTS TO:
//   - apps/api/src/services/otzar/ocr-provider.ts (provider dispatch)
//   - apps/api/src/services/otzar/comms-extract.service.ts
//     (extractFromCapturedText — DEMO_SCRIPTED / LLM / LOCAL_FALLBACK)
//   - apps/api/src/routes/otzar-observe.routes.ts (HTTP surface)
//   - tests/unit/ocr-provider.test.ts + tests/integration/observe-intake.test.ts

import { prisma, writeAuditEvent } from "@niov/database";
import type {
  ObserveCapture,
  ObserveSourceType,
  OCRProviderType,
} from "@prisma/client";
import { getOrgEntityId } from "../governance/org.js";
import type { LLMProvider } from "../llm/llm.service.js";
import {
  extractFromCapturedText,
  type CommsExtractionMode,
  type CommsExtractionResult,
} from "./comms-extract.service.js";
import {
  extractTextWithProvider,
  listOCRProviderStatuses,
  type OCRProviderStatusRow,
} from "./ocr-provider.js";

// ─── closed vocab ────────────────────────────────────────────

export const OBSERVE_PROVIDERS: readonly OCRProviderType[] = [
  "DEMO_FIXTURE",
  "PLAIN_TEXT",
  "TESSERACT_LOCAL",
  "AWS_TEXTRACT",
  "GOOGLE_VISION",
] as const;

export const OBSERVE_SOURCE_TYPES: readonly ObserveSourceType[] = [
  "IMAGE",
  "PDF",
  "DOCUMENT",
  "SCREENSHOT",
  "PLAIN_TEXT_SOURCE",
  "DEMO",
] as const;

/** Bound the stored summary so the row never carries a full document. */
const SUMMARY_MAX_CHARS = 600;

type Failure = { ok: false; code: string; message?: string };

// ─── view shape ──────────────────────────────────────────────

export interface ObserveCaptureView {
  observe_capture_id: string;
  provider: OCRProviderType;
  source_type: ObserveSourceType;
  title: string | null;
  status: string;
  extracted_text_summary: string | null;
  extraction: CommsExtractionResult | null;
  workspace_id: string | null;
  created_at: string;
}

function toView(row: ObserveCapture): ObserveCaptureView {
  const extraction =
    row.extraction !== null &&
    typeof row.extraction === "object" &&
    !Array.isArray(row.extraction) &&
    Object.keys(row.extraction as object).length > 0
      ? (row.extraction as unknown as CommsExtractionResult)
      : null;
  return {
    observe_capture_id: row.observe_capture_id,
    provider: row.provider,
    source_type: row.source_type,
    title: row.title,
    status: row.status,
    extracted_text_summary: row.extracted_text_summary,
    extraction,
    workspace_id: row.workspace_id,
    created_at: row.created_at.toISOString(),
  };
}

// ─── providers (status) ──────────────────────────────────────

export async function listObserveProvidersForCaller(
  callerEntityId: string,
): Promise<{ ok: true; providers: OCRProviderStatusRow[] } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const providers = listOCRProviderStatuses();
  await writeAuditEvent({
    event_type: "OBSERVE_PROVIDER_STATUS_CHECKED",
    outcome: "SUCCESS",
    actor_entity_id: callerEntityId,
    details: {
      org_entity_id: orgEntityId,
      statuses: Object.fromEntries(
        providers.map((p) => [p.provider, p.status]),
      ),
    },
  });
  return { ok: true, providers };
}

// ─── extract (the core pipeline) ─────────────────────────────

export async function extractObserveCaptureForCaller(
  input: {
    callerEntityId: string;
    provider: OCRProviderType;
    sourceType: ObserveSourceType;
    title?: string;
    plainText?: string;
    forceMode?: CommsExtractionMode;
  },
  llmProvider: LLMProvider | null,
): Promise<{ ok: true; capture: ObserveCaptureView } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }

  const extracted = extractTextWithProvider(input.provider, {
    ...(input.plainText !== undefined ? { plain_text: input.plainText } : {}),
  });
  if (extracted.ok === false) {
    // Honest provider failure: audited, no row, no partial state.
    await writeAuditEvent({
      event_type: "OBSERVE_CAPTURE_FAILED",
      outcome: "DENIED",
      actor_entity_id: input.callerEntityId,
      details: {
        org_entity_id: orgEntityId,
        provider: input.provider,
        source_type: input.sourceType,
        failure_class: extracted.code,
      },
    });
    return { ok: false, code: extracted.code, message: extracted.message };
  }

  const row = await prisma.observeCapture.create({
    data: {
      org_entity_id: orgEntityId,
      captured_by_entity_id: input.callerEntityId,
      provider: input.provider,
      source_type: input.sourceType,
      title: input.title ?? null,
    },
  });
  await writeAuditEvent({
    event_type: "OBSERVE_CAPTURE_RECEIVED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      observe_capture_id: row.observe_capture_id,
      org_entity_id: orgEntityId,
      provider: input.provider,
      source_type: input.sourceType,
    },
  });

  // Structured extraction through the proven Phase 1213 pipeline —
  // roster-aware, DEMO_SCRIPTED / LLM / LOCAL_FALLBACK, suggested
  // follow-ups are draft proposals only.
  const extraction = await extractFromCapturedText(
    {
      viewerEntityId: input.callerEntityId,
      captured_text: extracted.text,
      ...(input.forceMode !== undefined
        ? { force_mode: input.forceMode }
        : {}),
    },
    llmProvider,
  );

  const updated = await prisma.observeCapture.update({
    where: { observe_capture_id: row.observe_capture_id },
    data: {
      status: "EXTRACTED",
      extracted_text_summary: extraction.summary.slice(0, SUMMARY_MAX_CHARS),
      extraction: extraction as unknown as object,
    },
  });
  await writeAuditEvent({
    event_type: "OBSERVE_CAPTURE_EXTRACTED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      observe_capture_id: row.observe_capture_id,
      org_entity_id: orgEntityId,
      provider: input.provider,
      extraction_mode: extraction.extraction_mode,
      decisions_count: extraction.decisions.length,
      commitments_count: extraction.commitments.length,
      suggested_actions_count: extraction.suggested_actions.length,
    },
  });

  return { ok: true, capture: toView(updated) };
}

// ─── list ────────────────────────────────────────────────────

export async function listObserveCapturesForCaller(
  callerEntityId: string,
): Promise<{ ok: true; captures: ObserveCaptureView[] } | Failure> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const rows = await prisma.observeCapture.findMany({
    where: {
      org_entity_id: orgEntityId,
      captured_by_entity_id: callerEntityId,
      deleted_at: null,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  return { ok: true, captures: rows.map(toView) };
}

// ─── attach to workspace ─────────────────────────────────────

export async function attachObserveCaptureToWorkspaceForCaller(input: {
  callerEntityId: string;
  observeCaptureId: string;
  workspaceId: string;
}): Promise<
  | {
      ok: true;
      capture: ObserveCaptureView;
      imported_decisions: number;
      imported_commitments: number;
    }
  | Failure
> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(input.callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER" };
  }
  const row = await prisma.observeCapture.findUnique({
    where: { observe_capture_id: input.observeCaptureId },
  });
  // Cross-org and cross-caller probes get the same 404 (no
  // existence oracle).
  if (
    row === null ||
    row.org_entity_id !== orgEntityId ||
    row.captured_by_entity_id !== input.callerEntityId ||
    row.deleted_at !== null
  ) {
    return { ok: false, code: "OBSERVE_CAPTURE_NOT_FOUND" };
  }
  if (row.status !== "EXTRACTED") {
    return { ok: false, code: "OBSERVE_CAPTURE_NOT_EXTRACTED" };
  }
  const workspace = await prisma.collaborationWorkspace.findUnique({
    where: { workspace_id: input.workspaceId },
  });
  if (
    workspace === null ||
    workspace.org_entity_id !== orgEntityId ||
    workspace.deleted_at !== null
  ) {
    return { ok: false, code: "WORKSPACE_NOT_FOUND" };
  }

  const extraction = row.extraction as unknown as CommsExtractionResult | null;
  const decisions = extraction?.decisions ?? [];
  const commitments = extraction?.commitments ?? [];

  // Import the extracted ledger entries into the workspace.
  // Decisions carry text only; commitments land UNRESOLVED with the
  // caller as the default internal owner display until the existing
  // workspace resolver / confirm flow reassigns them.
  for (const text of decisions) {
    await prisma.collaborationDecision.create({
      data: {
        workspace_id: workspace.workspace_id,
        org_entity_id: orgEntityId,
        text,
        source_excerpt: row.title ?? "Observed document",
        added_by_entity_id: input.callerEntityId,
      },
    });
  }
  for (const text of commitments) {
    await prisma.collaborationCommitment.create({
      data: {
        workspace_id: workspace.workspace_id,
        org_entity_id: orgEntityId,
        owner_display_name: "Unassigned",
        text,
        source_excerpt: row.title ?? "Observed document",
        assignment_reason:
          "Imported from an observed document; owner not yet confirmed.",
        confidence: "LOW",
        resolution_status: "UNRESOLVED",
        added_by_entity_id: input.callerEntityId,
      },
    });
  }

  const updated = await prisma.observeCapture.update({
    where: { observe_capture_id: row.observe_capture_id },
    data: { workspace_id: workspace.workspace_id, status: "ATTACHED" },
  });
  await writeAuditEvent({
    event_type: "OBSERVE_CAPTURE_ATTACHED",
    outcome: "SUCCESS",
    actor_entity_id: input.callerEntityId,
    details: {
      observe_capture_id: row.observe_capture_id,
      org_entity_id: orgEntityId,
      workspace_id: workspace.workspace_id,
      imported_decisions: decisions.length,
      imported_commitments: commitments.length,
    },
  });

  return {
    ok: true,
    capture: toView(updated),
    imported_decisions: decisions.length,
    imported_commitments: commitments.length,
  };
}
