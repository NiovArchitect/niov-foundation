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

import { prisma, writeAuditEvent } from "@niov/database";
import type { Prisma } from "@prisma/client";
import { receiveMeetingCaptureForCaller } from "./meeting-capture.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import { getOrgEntityId } from "../governance/org.js";
import { getGoogleCredentialIdentity } from "../connector/connector-oauth.service.js";
import type { SourceIntegrity, SourceIntegrityState } from "./source-integrity.js";
import {
  fetchGoogleDocTextForOrg,
  type GoogleDocExportResult,
  type GoogleDocExportFailure,
} from "../connector/connector-data-read.service.js";

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
  /** [GOOGLE-DOCS] Present ONLY for connector imports: the durable source
   *  lineage (system + file id + modified time + view link + content
   *  hash). Never set by the manual paste rail. */
  external_source?: {
    system: "GOOGLE_DRIVE";
    file_id: string;
    modified_time: string;
    web_view_link: string | null;
    content_sha256: string;
    // [SLICE3-PREREQ] Additive, optional account lineage: the exact Google
    // credential + pinned OIDC `sub` this source was imported through. Enables a
    // future changes-feed to bind a revalidation to the SAME Google account
    // (never cross-account). Absent on legacy rows and when identity is not yet
    // pinned — old rows stay readable; future registration re-verifies via
    // bounded reconciliation before enabling a real watch.
    integration_credential_id?: string;
    external_account_subject?: string;
  };
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
        ...(input.external_source !== undefined
          ? { external_source: input.external_source }
          : {}),
      },
      // [SOURCE-INTEGRITY] Additive source lifecycle — IMPORTED rows only (an
      // external_source means a Google snapshot; manual seeds carry NONE and
      // are ACTIVE by absence). On import success the snapshot is AVAILABLE and
      // import_hash PRESERVES the content hash so revalidation can compare
      // upstream drift without overwriting the snapshot. Lifecycle mapping:
      // CANCELLED = ledger status (not here); RETIRED = context_lifecycle (not
      // here); QUARANTINED = rejected import (no row at all); AVAILABLE /
      // SNAPSHOTTED / CHANGED_UPSTREAM / ACCESS_REVOKED / SOURCE_DELETED /
      // CORRUPT_OR_INVALID / UNREADABLE all live in source_integrity.state.
      ...(input.external_source !== undefined
        ? {
            source_integrity: {
              state: "AVAILABLE",
              import_hash: input.external_source.content_sha256,
              import_modified_time: input.external_source.modified_time,
              last_verified_at: new Date().toISOString(),
            } satisfies SourceIntegrity,
          }
        : {}),
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


// [GOOGLE-DOCS] Import ONE selected Google Doc as org reference context.
// WHAT: Dedupe-aware wrapper over seedDocumentContextForCaller: the same
//        file at the same content hash refuses ALREADY_IMPORTED; the same
//        file with NEW content imports as a fresh dated row (an updated
//        doc is a supersession candidate, not a duplicate).
// INPUT: caller + the SAFE export bundle from fetchGoogleDocTextForOrg
//        (+ the admin-chosen kind/currentness).
// OUTPUT: SeedDocumentResult or { ok:false, code:"ALREADY_IMPORTED" }.
// WHY: SELECTED-DOC DISCIPLINE — one explicit admin choice per import,
//      full lineage on the row (file id / modified time / view link /
//      content hash), never an auto-sync.
export async function importGoogleDocForCaller(
  callerEntityId: string,
  input: {
    file_id: string;
    name: string;
    text: string;
    modified_time: string;
    web_view_link: string | null;
    content_sha256: string;
    source_kind?: DocumentSourceKind;
    currentness?: DocumentCurrentness;
  },
): Promise<SeedDocumentResult | { ok: false; code: "ALREADY_IMPORTED"; message: string }> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "No organization found for the caller." };
  }
  const existing = await prisma.workLedgerEntry.findFirst({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "DOCUMENT_CONTEXT",
      // [GOOGLE-DOCS] CANCELLED rows are SETTLED HISTORY — a withdrawn
      // import must never block a fresh one (same doctrine the
      // supersession linker uses). Without this, importing → cancelling →
      // re-importing the same doc wrongly 409s forever.
      status: { not: "CANCELLED" },
      details: {
        path: ["document", "external_source", "file_id"],
        equals: input.file_id,
      },
    },
    orderBy: { created_at: "desc" },
    select: { details: true },
  });
  if (existing !== null) {
    const doc = (existing.details as {
      document?: { external_source?: { content_sha256?: string } };
    })?.document;
    if (doc?.external_source?.content_sha256 === input.content_sha256) {
      return {
        ok: false,
        code: "ALREADY_IMPORTED",
        message: "This Google Doc was already imported at this exact content. Nothing was duplicated.",
      };
    }
  }
  // [SLICE3-PREREQ] Stamp the pinned Google credential lineage (additive) so a
  // future changes-feed can bind a revalidation to the EXACT account that
  // imported the source. Absent identity (pre-pin) leaves the fields unset.
  const googleIdentity = await getGoogleCredentialIdentity({
    org_entity_id: orgEntityId,
  });
  const subject = googleIdentity?.external_account_subject ?? null;
  return seedDocumentContextForCaller(callerEntityId, {
    source_kind: input.source_kind ?? "OTHER",
    title: input.name.slice(0, DOCUMENT_TITLE_MAX),
    body: input.text.slice(0, DOCUMENT_BODY_MAX),
    currentness: input.currentness ?? "unknown",
    external_source: {
      system: "GOOGLE_DRIVE",
      file_id: input.file_id,
      modified_time: input.modified_time,
      web_view_link: input.web_view_link,
      content_sha256: input.content_sha256,
      ...(googleIdentity !== null
        ? { integration_credential_id: googleIdentity.credential_id }
        : {}),
      ...(subject !== null && subject.length > 0
        ? { external_account_subject: subject }
        : {}),
    },
  });
}

// ── [SOURCE-INTEGRITY] Manual, admin-gated, snapshot-preserving revalidation ──

/** The upstream fetch is injectable so integration tests can drive the
 *  404 / 403 / changed / corrupt branches WITHOUT corrupting or deleting real
 *  Google docs. Defaults to the real export path in production. */
export type FetchDocText = (args: {
  actor_entity_id: string;
  org_entity_id: string;
  file_id: string;
}) => Promise<GoogleDocExportResult | GoogleDocExportFailure>;

export interface RevalidateOptions {
  fetchDocText?: FetchDocText;
  // [INBOUND-RECHECK] Audit-noise control for the SCHEDULED per-org recheck.
  // Default "always" preserves the manual per-doc + admin-sweep behavior (every
  // probe records its outcome, incl. SOURCE_VERIFIED). "on_transition" records an
  // audit ONLY when the integrity state actually CHANGES (prior !== new), so a
  // daily cron over unchanged sources emits no SOURCE_VERIFIED spam and a
  // persistently-CHANGED source is not re-audited every run — only meaningful
  // state changes are recorded. The row's last-checked metadata still updates.
  auditMode?: "always" | "on_transition";
}

export type RevalidateResult =
  // `transitioned` is true when the integrity state changed vs the prior stored
  // state (AVAILABLE→CHANGED, CHANGED→DELETED escalation, or CHANGED→AVAILABLE
  // recovery) — the scheduled sweep gates notifications on this so a persistently
  // demoted source is not re-notified every run.
  | { ok: true; ledger_entry_id: string; state: SourceIntegrityState; changed: boolean; transitioned: boolean }
  | {
      ok: false;
      code:
        | "NO_ORG_FOR_CALLER"
        | "NOT_FOUND"
        | "NOT_A_SOURCE_DOC"
        | "REVALIDATION_UNAVAILABLE";
      message: string;
    };

// WHAT: Re-check ONE imported Google-Doc DOCUMENT_CONTEXT row against upstream
//        and record the outcome on details.source_integrity — SNAPSHOT-
//        PRESERVING (the stored body, external_source.content_sha256, and
//        import_hash are NEVER overwritten; a divergence is recorded as
//        upstream_hash on the SAME row).
// INPUT: caller + the row id (+ an injectable fetch for tests).
// OUTPUT: { ok, state, changed } or an honest failure.
// WHY: SOURCE INTEGRITY — a trusted snapshot can silently rot when its upstream
//      changes, loses access, is deleted, or turns corrupt. This is the manual,
//      admin-gated probe that DEMOTES a rotted snapshot out of active retrieval
//      (via source_integrity.state, NOT ledger status) while preserving the row
//      for lineage. Transient/infra fetch errors NEVER demote a good snapshot.
export async function revalidateImportedDocForCaller(
  callerEntityId: string,
  ledgerEntryId: string,
  opts?: RevalidateOptions,
): Promise<RevalidateResult> {
  let orgEntityId: string;
  try {
    orgEntityId = await getOrgEntityId(callerEntityId);
  } catch {
    return { ok: false, code: "NO_ORG_FOR_CALLER", message: "No organization found for the caller." };
  }
  const row = await prisma.workLedgerEntry.findUnique({
    where: { ledger_entry_id: ledgerEntryId },
  });
  if (row === null || row.org_entity_id !== orgEntityId || row.ledger_type !== "DOCUMENT_CONTEXT") {
    return { ok: false, code: "NOT_FOUND", message: "Document not found in your organization." };
  }
  const details =
    typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {};
  const document =
    typeof details.document === "object" && details.document !== null && !Array.isArray(details.document)
      ? (details.document as Record<string, unknown>)
      : {};
  const external =
    typeof document.external_source === "object" &&
    document.external_source !== null &&
    !Array.isArray(document.external_source)
      ? (document.external_source as { file_id?: unknown; content_sha256?: unknown; modified_time?: unknown })
      : null;
  if (external === null || typeof external.file_id !== "string") {
    return {
      ok: false,
      code: "NOT_A_SOURCE_DOC",
      message: "Only connector-imported documents can be revalidated against their source.",
    };
  }
  const fileId = external.file_id;

  // The PRESERVED snapshot hash: prefer the recorded source_integrity.import_hash
  // (the import-time snapshot) and fall back to external_source.content_sha256
  // for rows imported before source_integrity existed. This value is NEVER
  // overwritten by a revalidation, so drift is detectable forever.
  const priorIntegrity =
    typeof details.source_integrity === "object" &&
    details.source_integrity !== null &&
    !Array.isArray(details.source_integrity)
      ? (details.source_integrity as Record<string, unknown>)
      : null;
  const importHash =
    priorIntegrity !== null && typeof priorIntegrity.import_hash === "string"
      ? priorIntegrity.import_hash
      : typeof external.content_sha256 === "string"
        ? external.content_sha256
        : "";
  const importModifiedTime =
    priorIntegrity !== null && typeof priorIntegrity.import_modified_time === "string"
      ? priorIntegrity.import_modified_time
      : typeof external.modified_time === "string"
        ? external.modified_time
        : "";

  const fetchDocText = opts?.fetchDocText ?? fetchGoogleDocTextForOrg;
  const fetched = await fetchDocText({
    actor_entity_id: callerEntityId,
    org_entity_id: orgEntityId,
    file_id: fileId,
  });

  const now = new Date().toISOString();
  const base: SourceIntegrity = {
    state: "AVAILABLE",
    import_hash: importHash,
    import_modified_time: importModifiedTime,
    last_verified_at: now,
  };

  let next: SourceIntegrity;
  let auditType:
    | "SOURCE_VERIFIED"
    | "SOURCE_CHANGED_UPSTREAM"
    | "SOURCE_ACCESS_REVOKED"
    | "SOURCE_DELETED"
    | "IMPORT_QUARANTINED";

  if (fetched.ok === true) {
    if (fetched.content_sha256 === importHash) {
      next = { ...base, state: "AVAILABLE" };
      auditType = "SOURCE_VERIFIED";
    } else {
      // Divergence — DEMOTE, but PRESERVE import_hash + snapshot + external_source.
      next = {
        ...base,
        state: "CHANGED_UPSTREAM",
        upstream_hash: fetched.content_sha256,
        upstream_checked_at: now,
      };
      auditType = "SOURCE_CHANGED_UPSTREAM";
    }
  } else if (fetched.code === "NOT_FOUND") {
    next = { ...base, state: "SOURCE_DELETED" };
    auditType = "SOURCE_DELETED";
  } else if (fetched.code === "SCOPE_REAUTH_REQUIRED") {
    next = { ...base, state: "ACCESS_REVOKED" };
    auditType = "SOURCE_ACCESS_REVOKED";
  } else if (fetched.code === "SOURCE_EMPTY" || fetched.code === "SOURCE_UNREADABLE") {
    next = { ...base, state: "CORRUPT_OR_INVALID", last_state_reason: fetched.code };
    auditType = "IMPORT_QUARANTINED";
  } else {
    // Transient / infrastructure error (NOT_CONNECTED / TOKEN_REFRESH_FAILED /
    // PROVIDER_ERROR / DOC_TOO_LARGE / INVALID_REQUEST): a network blip must
    // NEVER silently demote a good snapshot — leave state untouched, answer
    // honestly, and let the admin retry.
    return {
      ok: false,
      code: "REVALIDATION_UNAVAILABLE",
      message: "Could not reach the source to revalidate. The document was left unchanged — try again.",
    };
  }

  // [INBOUND-RECHECK] The integrity state stored BEFORE this probe (defaults to
  // AVAILABLE for rows imported before source_integrity existed). A transition is
  // any change vs this prior — used to gate audit + notification noise on the
  // scheduled sweep, while the manual routes (auditMode "always") are unchanged.
  const priorState: SourceIntegrityState =
    priorIntegrity !== null && typeof priorIntegrity.state === "string"
      ? (priorIntegrity.state as SourceIntegrityState)
      : "AVAILABLE";
  const transitioned = next.state !== priorState;

  // Persist by MERGING into details — never clobber document or seeded_context.
  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: row.ledger_entry_id },
    // Additive merge — document + seeded_context + every other key survive
    // verbatim; only source_integrity is (re)written.
    data: {
      details: { ...details, source_integrity: next } as unknown as Prisma.InputJsonObject,
    },
  });
  // Audit every meaningful outcome. On a scheduled recheck (auditMode
  // "on_transition") record ONLY when the state actually changed — so unchanged
  // rechecks emit no SOURCE_VERIFIED spam and a persistently-demoted source is
  // not re-audited every run. The manual routes default to "always".
  if (opts?.auditMode !== "on_transition" || transitioned) {
    await writeAuditEvent({
      event_type: auditType,
      outcome: auditType === "SOURCE_VERIFIED" ? "SUCCESS" : "DENIED",
      actor_entity_id: callerEntityId,
      target_entity_id: orgEntityId,
      details: { provider: "google", file_id: fileId, state: next.state },
    });
  }
  return {
    ok: true,
    ledger_entry_id: row.ledger_entry_id,
    state: next.state,
    changed: next.state !== "AVAILABLE",
    transitioned,
  };
}
