// FILE: context-boundaries.service.ts
// PURPOSE: [CTX-BOUNDARY] The admin CONTEXT BOUNDARY projection — the
//          read-only truth behind "what company context has Otzar been
//          given, and how is it governed?". A boundary view, NOT a
//          relevance-management view: it returns grouped counts and a
//          few recent seeded-document labels so the admin can see the
//          boundary — it never asks anyone to classify, tag, retire, or
//          curate anything (Otzar manages relevance; employees and
//          workflows validate nuance). Counts are deterministic ledger
//          queries; recent documents are AIX-1 labels only (title, kind,
//          currentness, coverage, seeded date) — never bodies, never raw
//          ids, never enums. Groups with no safe existing projection
//          (personal calibration capsules, external context) carry copy
//          only on the CT surface — deliberately uncounted rather than
//          approximately counted. READ-ONLY; manager/admin-gated (the
//          same authority that can see ownerless org-wide context).
// CONNECTS TO: routes/work-os-ledger.routes.ts (GET
//          /work-os/context/boundaries), seededOriginFromDetails
//          (labels), CS-1/CS-5 write-time metadata, DOC-EXTRACT lineage
//          (source: document_extraction_review), CT
//          /setup/context-boundaries, tests/integration/
//          context-boundaries.test.ts.

import { prisma } from "@niov/database";
import { seededOriginFromDetails } from "./work-ledger.service.js";
import { isContextRetired } from "./context-candidates.service.js";

export interface ContextBoundariesProjection {
  /** CS-1 seeded history rows (seeded lineage on non-document rows). */
  seeded_history_count: number;
  /** CS-5 seeded document context rows. */
  seeded_document_count: number;
  /** DOC-EXTRACT human-approved rows (extraction lineage + human review). */
  extracted_reviewed_count: number;
  /** [RETENTION] seeded context retired from active use (still preserved). */
  retired_context_count: number;
  /** AIX-1 labels only for the 3 most recent seeded documents. */
  recent_documents: Array<{
    title_label: string;
    origin_label: string;
    currentness_label?: string;
    covering_period_label?: string;
    /** Date only (YYYY-MM-DD) — enough for a boundary view. */
    seeded_on: string;
  }>;
}

/** Compute the org's context boundary counts + recent document labels. */
export async function getContextBoundaries(
  orgEntityId: string,
): Promise<ContextBoundariesProjection> {
  const [seededHistoryCount, seededDocumentCount, extractedReviewedCount, retiredCount, recentDocs] =
    await Promise.all([
      // Seeded lineage exists (provided_by is always a string when the
      // CS-1/CS-5 writers ran) on a non-document row = seeded history.
      prisma.workLedgerEntry.count({
        where: {
          org_entity_id: orgEntityId,
          ledger_type: { not: "DOCUMENT_CONTEXT" },
          details: { path: ["seeded_context", "provided_by"], string_starts_with: "" },
        },
      }),
      prisma.workLedgerEntry.count({
        where: { org_entity_id: orgEntityId, ledger_type: "DOCUMENT_CONTEXT" },
      }),
      prisma.workLedgerEntry.count({
        where: {
          org_entity_id: orgEntityId,
          details: { path: ["source"], equals: "document_extraction_review" },
        },
      }),
      // [RETENTION] retired-from-active-use seeded context (preserved rows).
      prisma.workLedgerEntry.count({
        where: {
          org_entity_id: orgEntityId,
          details: { path: ["context_lifecycle", "state"], equals: "retired" },
        },
      }),
      prisma.workLedgerEntry.findMany({
        where: { org_entity_id: orgEntityId, ledger_type: "DOCUMENT_CONTEXT" },
        orderBy: { created_at: "desc" },
        take: 3,
        select: { title: true, details: true, created_at: true },
      }),
    ]);
  return {
    seeded_history_count: seededHistoryCount,
    seeded_document_count: seededDocumentCount,
    extracted_reviewed_count: extractedReviewedCount,
    retired_context_count: retiredCount,
    recent_documents: recentDocs.map((row) => {
      const seeded = seededOriginFromDetails(row.details);
      return {
        title_label: row.title,
        origin_label: seeded?.origin_label ?? "Seeded document context",
        ...(seeded?.currentness_label !== undefined
          ? { currentness_label: seeded.currentness_label }
          : {}),
        ...(seeded?.covering_period_label !== undefined
          ? { covering_period_label: seeded.covering_period_label }
          : {}),
        seeded_on: row.created_at.toISOString().slice(0, 10),
      };
    }),
  };
}

// [RETENTION] The admin lifecycle list — the id-bearing companion to the
// label-only boundary projection (the id exists ONLY so the admin's
// retire/restore POST can target the row; it is never rendered as copy).
export interface SeededDocumentLifecycleRow {
  ledger_entry_id: string;
  title_label: string;
  origin_label: string;
  currentness_label?: string;
  covering_period_label?: string;
  seeded_on: string;
  /** "Active" | "Retired from active context" */
  lifecycle_state_label: string;
}

/** List recent seeded documents with lifecycle state — admin-gated at
 *  the route; read-only. */
export async function listSeededDocumentLifecycle(
  orgEntityId: string,
): Promise<SeededDocumentLifecycleRow[]> {
  const rows = await prisma.workLedgerEntry.findMany({
    where: { org_entity_id: orgEntityId, ledger_type: "DOCUMENT_CONTEXT" },
    orderBy: { created_at: "desc" },
    take: 20,
    select: { ledger_entry_id: true, title: true, details: true, created_at: true },
  });
  return rows.map((row) => {
    const seeded = seededOriginFromDetails(row.details);
    return {
      ledger_entry_id: row.ledger_entry_id,
      title_label: row.title,
      origin_label: seeded?.origin_label ?? "Seeded document context",
      ...(seeded?.currentness_label !== undefined
        ? { currentness_label: seeded.currentness_label }
        : {}),
      ...(seeded?.covering_period_label !== undefined
        ? { covering_period_label: seeded.covering_period_label }
        : {}),
      seeded_on: row.created_at.toISOString().slice(0, 10),
      lifecycle_state_label: isContextRetired(row.details)
        ? "Retired from active context"
        : "Active",
    };
  });
}
