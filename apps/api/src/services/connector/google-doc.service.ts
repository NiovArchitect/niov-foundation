// FILE: google-doc.service.ts
// PURPOSE: [GOOGLE-DOCS-WRITE] GATED Google Doc create. Prefer Drive multipart
//          create WITH body content so organizational documents are never empty
//          shells. Docs batchUpdate is a verified fallback with retries.
//          Functional success requires body_inserted when body was requested.
// CONNECTS TO: connector-oauth.service.ts, google-doc.routes.ts,
//          project-document.service.ts, work-ledger DOCUMENT rows.
//
// SAFETY: create only behind gate ladder; audit scrubbed (no body/tokens).

import { prisma, writeAuditEvent } from "@niov/database";
import {
  getProviderGrantedScopes,
  getProviderAccessTokenForOrg,
} from "./connector-oauth.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";

const DOC_WRITE_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
];

export type GoogleDocGateCode =
  | "NEEDS_TITLE"
  | "NEEDS_APPROVAL"
  | "NEEDS_CALLER_CONFIRMATION"
  | "POLICY_BLOCKED"
  | "GOOGLE_RECONNECT_REQUIRED"
  | "DOC_WRITE_SCOPE_MISSING"
  | "BODY_REQUIRED"
  | "BODY_INSERT_FAILED";

export interface GoogleDocCreateInput {
  title: string;
  body_text?: string;
  /** When true (default if body_text provided), fail if body is empty or insert fails. */
  require_body?: boolean;
  requires_approval?: boolean;
  approved?: boolean;
  caller_confirmed?: boolean;
  policy_blocked?: boolean;
  source_command?: string;
  owner_entity_id?: string;
  project_id?: string;
  conversation_id?: string;
  artifact_type?: string;
}

export function grantsDocWrite(
  scopes: ReadonlyArray<string> | null,
): boolean {
  if (scopes === null) return false;
  const set = new Set(scopes);
  return DOC_WRITE_SCOPES.some((s) => set.has(s));
}

export function firstUnmetDocGate(
  input: GoogleDocCreateInput,
  hasDocWrite: boolean,
  isConnected: boolean,
): GoogleDocGateCode | null {
  if (input.policy_blocked === true) return "POLICY_BLOCKED";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length === 0) return "NEEDS_TITLE";
  if (input.requires_approval === true && input.approved !== true) {
    return "NEEDS_APPROVAL";
  }
  if (input.caller_confirmed !== true) return "NEEDS_CALLER_CONFIRMATION";
  if (!isConnected) return "GOOGLE_RECONNECT_REQUIRED";
  if (!hasDocWrite) return "DOC_WRITE_SCOPE_MISSING";
  const requireBody =
    input.require_body === true ||
    (input.require_body !== false &&
      typeof input.body_text === "string" &&
      input.body_text.trim().length > 0);
  if (requireBody) {
    const body = typeof input.body_text === "string" ? input.body_text.trim() : "";
    if (body.length === 0) return "BODY_REQUIRED";
  }
  return null;
}

export type GoogleDocCreateResult =
  | {
      ok: true;
      status: "CREATED";
      document_id: string;
      title: string;
      web_view_link: string | null;
      body_inserted: boolean;
      body_char_count: number;
      project_id: string | null;
    }
  | { ok: false; code: GoogleDocGateCode | "PROVIDER_ERROR" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// WHAT: Create a Google Doc with optional body via Drive multipart upload.
// WHY: Single-shot create+content avoids empty shells when Docs API is laggy.
async function createViaDriveMultipart(args: {
  access_token: string;
  title: string;
  body_text?: string;
}): Promise<{
  document_id: string;
  title: string;
  web_view_link: string | null;
  http: number;
} | null> {
  const boundary = `otzar_${Date.now().toString(36)}`;
  const meta = JSON.stringify({
    name: args.title,
    mimeType: "application/vnd.google-apps.document",
  });
  const media =
    typeof args.body_text === "string" && args.body_text.length > 0
      ? args.body_text
      : " ";
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${media}\r\n` +
    `--${boundary}--`;

  let res: Response;
  try {
    res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as {
    id?: unknown;
    name?: unknown;
    webViewLink?: unknown;
  };
  if (typeof body.id !== "string" || body.id.length === 0) return null;
  return {
    document_id: body.id,
    title:
      typeof body.name === "string" && body.name.length > 0
        ? body.name
        : args.title,
    web_view_link:
      typeof body.webViewLink === "string" ? body.webViewLink : null,
    http: res.status,
  };
}

async function insertBodyWithRetry(args: {
  access_token: string;
  document_id: string;
  text: string;
}): Promise<boolean> {
  const payload = JSON.stringify({
    requests: [
      {
        insertText: {
          location: { index: 1 },
          text: args.text.endsWith("\n") ? args.text : `${args.text}\n`,
        },
      },
    ],
  });
  for (const delay of [0, 400, 1000, 2000]) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(args.document_id)}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.access_token}`,
            "Content-Type": "application/json",
          },
          body: payload,
        },
      );
      if (res.ok) return true;
    } catch {
      // retry
    }
  }
  return false;
}

export async function createGoogleDoc(args: {
  actor_entity_id: string;
  org_entity_id: string;
  input: GoogleDocCreateInput;
}): Promise<GoogleDocCreateResult> {
  const scopes = await getProviderGrantedScopes({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  const isConnected = scopes !== null;
  const gate = firstUnmetDocGate(
    args.input,
    isConnected && grantsDocWrite(scopes),
    isConnected,
  );

  const bodyText =
    typeof args.input.body_text === "string" ? args.input.body_text.trim() : "";
  const hasBody = bodyText.length > 0;
  const requireBody =
    args.input.require_body === true ||
    (args.input.require_body !== false && hasBody);

  const audit = async (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<string> => {
    const event = await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: {
        reason,
        has_body: hasBody,
        require_body: requireBody,
        body_char_count: hasBody ? bodyText.length : 0,
        has_project_id: typeof args.input.project_id === "string",
        ...(extra ?? {}),
      },
    });
    return event.audit_id;
  };

  if (gate !== null) {
    await audit("DENIED", gate);
    return { ok: false, code: gate };
  }

  const title = args.input.title.trim();
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit("DENIED", "GOOGLE_RECONNECT_REQUIRED");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }

  let documentId = "";
  let createdTitle = title;
  let webViewLink: string | null = null;
  let bodyInserted = false;

  // Path A — Drive multipart (create + content in one request when body present)
  const multi = await createViaDriveMultipart({
    access_token: token.access_token,
    title,
    ...(hasBody ? { body_text: bodyText } : {}),
  });
  if (multi !== null) {
    documentId = multi.document_id;
    createdTitle = multi.title;
    webViewLink = multi.web_view_link;
    // Multipart with body is treated as inserted when we sent content.
    bodyInserted = hasBody;
  }

  // Path B — Docs API create (title only) then insert body with retry
  if (documentId.length === 0) {
    try {
      const docsRes = await fetch("https://docs.googleapis.com/v1/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
      if (docsRes.status === 401 || docsRes.status === 403) {
        await audit("DENIED", "DOC_WRITE_SCOPE_MISSING");
        return { ok: false, code: "DOC_WRITE_SCOPE_MISSING" };
      }
      if (!docsRes.ok) {
        await audit("DENIED", `http_${docsRes.status}`);
        return { ok: false, code: "PROVIDER_ERROR" };
      }
      const docsBody = (await docsRes.json().catch(() => ({}))) as {
        documentId?: unknown;
        title?: unknown;
      };
      documentId =
        typeof docsBody.documentId === "string" ? docsBody.documentId : "";
      if (typeof docsBody.title === "string" && docsBody.title.length > 0) {
        createdTitle = docsBody.title;
      }
    } catch {
      await audit("DENIED", "provider_fetch_failed");
      return { ok: false, code: "PROVIDER_ERROR" };
    }
  }

  if (documentId.length === 0) {
    await audit("DENIED", "no_document_id");
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  // If multipart did not run or body still needed, insert via Docs API.
  if (hasBody && !bodyInserted) {
    bodyInserted = await insertBodyWithRetry({
      access_token: token.access_token,
      document_id: documentId,
      text: bodyText,
    });
  }

  if (requireBody && !bodyInserted) {
    await audit("DENIED", "BODY_INSERT_FAILED", {
      document_id_present: true,
    });
    return { ok: false, code: "BODY_INSERT_FAILED" };
  }

  const auditEventId = await audit("SUCCESS", bodyInserted ? "created_with_body" : "created_shell", {
    body_inserted: bodyInserted,
  });
  if (webViewLink === null || webViewLink.length === 0) {
    webViewLink = `https://docs.google.com/document/d/${documentId}/edit`;
  }
  const ownerEntityId = args.input.owner_entity_id ?? args.actor_entity_id;
  const projectId =
    typeof args.input.project_id === "string" && args.input.project_id.length > 0
      ? args.input.project_id
      : null;

  try {
    await createLedgerEntry({
      org_entity_id: args.org_entity_id,
      ledger_type: "DOCUMENT",
      source_type: "CONNECTOR",
      title,
      summary: bodyInserted
        ? "Google Doc created with structured body after confirmation."
        : "Google Doc shell created after confirmation (no body).",
      status: "EXECUTED",
      priority: "ROUTINE",
      owner_entity_id: ownerEntityId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(typeof args.input.conversation_id === "string"
        ? { conversation_id: args.input.conversation_id }
        : {}),
      details: {
        source: "google_doc",
        document_id: documentId,
        provider: "google_docs",
        web_view_link: webViewLink,
        audit_event_id: auditEventId,
        body_inserted: bodyInserted,
        body_char_count: hasBody ? bodyText.length : 0,
        artifact_type: args.input.artifact_type ?? "document",
        project_id: projectId,
      },
    });
  } catch {
    // Ledger is enhancement only.
  }

  return {
    ok: true,
    status: "CREATED",
    document_id: documentId,
    title: createdTitle,
    web_view_link: webViewLink,
    body_inserted: bodyInserted,
    body_char_count: hasBody ? bodyText.length : 0,
    project_id: projectId,
  };
}

// ── [ACCEPTANCE] Material / formatting mutation for edit-propagation ─────
// Controlled Docs batchUpdate behind the same confirmation + scope gates as
// create. Prefer endOfSegmentLocation (body) over fragile end-index math —
// Drive-created docs + structural trailing newlines routinely broke index-1 /
// max-1 inserts and collapsed every failure into opaque APPEND_FAILED.

export type GoogleDocAppendFailureCode =
  | GoogleDocGateCode
  | "NEEDS_DOCUMENT_ID"
  | "PROVIDER_ERROR"
  | "APPEND_FAILED"
  | "DOC_ARTIFACT_NOT_FOUND"
  | "DOC_PROVIDER_ID_MISSING"
  | "DOC_SCOPE_INSUFFICIENT"
  | "DOC_WRITE_PERMISSION_DENIED"
  | "DOC_REVISION_CONFLICT"
  | "DOC_INVALID_INSERT_INDEX"
  | "DOC_PROVIDER_REQUEST_INVALID"
  | "DOC_PROVIDER_WRITE_FAILED"
  | "DOC_WRITE_SUCCEEDED_RECEIPT_FAILED"
  | "DOC_RECONCILIATION_REQUIRED"
  | "DOC_CHANGE_ALREADY_APPLIED";

export type GoogleDocChangeKind = "MATERIAL" | "FORMATTING_ONLY";

export type GoogleDocAppendResult =
  | {
      ok: true;
      document_id: string;
      appended: true;
      body_char_count: number;
      web_view_link: string | null;
      change_kind: GoogleDocChangeKind;
      materiality: "MATERIAL" | "FORMATTING_ONLY";
      already_applied: boolean;
      provider_http_status: number | null;
    }
  | { ok: false; code: GoogleDocAppendFailureCode; provider_http_status?: number };

export interface GoogleDocAppendInput {
  document_id: string;
  body_text: string;
  caller_confirmed?: boolean;
  policy_blocked?: boolean;
  /** MATERIAL (default) inserts semantic text; FORMATTING_ONLY applies style only. */
  change_kind?: GoogleDocChangeKind;
  /**
   * Stable idempotency key (org+doc+op+hash). When present, a second call with
   * the same key returns success without duplicating content if the marker is
   * already in the document.
   */
  idempotency_key?: string;
}

function classifyBatchUpdateFailure(http: number): GoogleDocAppendFailureCode {
  if (http === 401 || http === 403) return "DOC_WRITE_PERMISSION_DENIED";
  if (http === 404) return "DOC_ARTIFACT_NOT_FOUND";
  if (http === 400) return "DOC_PROVIDER_REQUEST_INVALID";
  if (http === 409 || http === 412) return "DOC_REVISION_CONFLICT";
  if (http >= 500) return "DOC_PROVIDER_WRITE_FAILED";
  if (http > 0) return "DOC_PROVIDER_WRITE_FAILED";
  return "APPEND_FAILED";
}

/** Stable, non-secret marker embedded for idempotent re-apply detection. */
export function changeMarkerLine(idempotencyKey: string): string {
  // Keep short + alphanumeric-ish for Docs search reliability.
  const safe = idempotencyKey.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
  return `«otzar-change:${safe}»`;
}

async function fetchDocPlainText(args: {
  access_token: string;
  document_id: string;
}): Promise<{ ok: true; text: string } | { ok: false; http: number }> {
  try {
    // Export via Drive files.export — works for Docs created by this app under
    // drive.file + documents scopes.
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.document_id)}/export?mimeType=text/plain`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${args.access_token}` },
      },
    );
    if (!res.ok) return { ok: false, http: res.status };
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false, http: 0 };
  }
}

async function fetchDocEndIndex(args: {
  access_token: string;
  document_id: string;
}): Promise<{ ok: true; index: number } | { ok: false; http: number }> {
  try {
    const res = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(args.document_id)}?fields=body(content(endIndex))`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${args.access_token}` },
      },
    );
    if (!res.ok) return { ok: false, http: res.status };
    const body = (await res.json()) as {
      body?: { content?: Array<{ endIndex?: number }> };
    };
    const content = body.body?.content ?? [];
    let max = 1;
    for (const seg of content) {
      if (typeof seg.endIndex === "number" && seg.endIndex > max) {
        max = seg.endIndex;
      }
    }
    // Insert before the final structural newline of the document body.
    return { ok: true, index: Math.max(1, max - 1) };
  } catch {
    return { ok: false, http: 0 };
  }
}

type BatchUpdateAttempt = {
  ok: boolean;
  http: number;
};

async function batchUpdateDoc(args: {
  access_token: string;
  document_id: string;
  requests: unknown[];
}): Promise<BatchUpdateAttempt> {
  const payload = JSON.stringify({ requests: args.requests });
  let lastHttp = 0;
  for (const delay of [0, 400, 1000, 2000]) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(args.document_id)}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.access_token}`,
            "Content-Type": "application/json",
          },
          body: payload,
        },
      );
      lastHttp = res.status;
      if (res.ok) return { ok: true, http: res.status };
      // Retry only transient 5xx / 429.
      if (res.status !== 429 && res.status < 500) {
        return { ok: false, http: res.status };
      }
    } catch {
      lastHttp = 0;
    }
  }
  return { ok: false, http: lastHttp };
}

/**
 * Append / mutate an existing Google Doc.
 * Hard-gated: caller_confirmed + doc-write scopes. Never logs body text.
 *
 * MATERIAL: inserts semantic text at end of body (endOfSegmentLocation first).
 * FORMATTING_ONLY: bolds a small existing range without semantic content change.
 */
export async function appendGoogleDocBody(args: {
  actor_entity_id: string;
  org_entity_id: string;
  input: GoogleDocAppendInput;
}): Promise<GoogleDocAppendResult> {
  const documentId =
    typeof args.input.document_id === "string"
      ? args.input.document_id.trim()
      : "";
  const bodyText =
    typeof args.input.body_text === "string" ? args.input.body_text.trim() : "";
  const changeKind: GoogleDocChangeKind =
    args.input.change_kind === "FORMATTING_ONLY" ? "FORMATTING_ONLY" : "MATERIAL";
  const idem =
    typeof args.input.idempotency_key === "string" &&
    args.input.idempotency_key.trim().length > 0
      ? args.input.idempotency_key.trim()
      : null;

  const audit = async (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    await writeAuditEvent({
      event_type: "GOOGLE_DOC_APPEND",
      outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: {
        reason,
        document_id_present: documentId.length > 0,
        body_char_count: bodyText.length,
        change_kind: changeKind,
        has_idempotency_key: idem !== null,
        ...(extra ?? {}),
      },
    });
  };

  if (args.input.policy_blocked === true) {
    await audit("DENIED", "POLICY_BLOCKED");
    return { ok: false, code: "POLICY_BLOCKED" };
  }
  if (documentId.length === 0) {
    await audit("DENIED", "DOC_PROVIDER_ID_MISSING");
    return { ok: false, code: "DOC_PROVIDER_ID_MISSING" };
  }
  // Formatting-only may have empty body_text (style-only mutation).
  if (changeKind === "MATERIAL" && bodyText.length === 0) {
    await audit("DENIED", "BODY_REQUIRED");
    return { ok: false, code: "BODY_REQUIRED" };
  }
  if (args.input.caller_confirmed !== true) {
    await audit("DENIED", "NEEDS_CALLER_CONFIRMATION");
    return { ok: false, code: "NEEDS_CALLER_CONFIRMATION" };
  }

  const scopes = await getProviderGrantedScopes({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (scopes === null) {
    await audit("DENIED", "GOOGLE_RECONNECT_REQUIRED");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }
  if (!grantsDocWrite(scopes)) {
    await audit("DENIED", "DOC_SCOPE_INSUFFICIENT");
    return { ok: false, code: "DOC_SCOPE_INSUFFICIENT" };
  }

  // Tenant bind: only mutate docs this org created / ledgered as DOCUMENT.
  // Prevents cross-tenant append when a foreign org's Google token can reach
  // a shared Drive file. Same shape for missing vs foreign (no existence leak).
  const owned = await prisma.workLedgerEntry.findFirst({
    where: {
      org_entity_id: args.org_entity_id,
      ledger_type: "DOCUMENT",
      details: { path: ["document_id"], equals: documentId },
    },
    select: { ledger_entry_id: true, project_id: true, details: true },
  });
  if (owned === null) {
    await audit("DENIED", "DOC_ARTIFACT_NOT_FOUND", {
      reason: "no_org_document_ledger",
    });
    return { ok: false, code: "DOC_ARTIFACT_NOT_FOUND" };
  }

  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit("DENIED", "GOOGLE_RECONNECT_REQUIRED");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }

  // Idempotency: if marker already present, reconcile without rewriting.
  if (idem !== null && changeKind === "MATERIAL") {
    const marker = changeMarkerLine(idem);
    const plain = await fetchDocPlainText({
      access_token: token.access_token,
      document_id: documentId,
    });
    if (plain.ok && plain.text.includes(marker)) {
      await audit("SUCCESS", "DOC_CHANGE_ALREADY_APPLIED", {
        already_applied: true,
      });
      return {
        ok: true,
        document_id: documentId,
        appended: true,
        body_char_count: 0,
        web_view_link: `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`,
        change_kind: changeKind,
        materiality: changeKind,
        already_applied: true,
        provider_http_status: 200,
      };
    }
  }

  const result = await applyDocMutationWithToken({
    access_token: token.access_token,
    document_id: documentId,
    body_text: bodyText,
    change_kind: changeKind,
    idempotency_key: idem,
    audit,
  });

  // Selective organizational propagation (no private body text).
  if (result.ok) {
    await recordDocChangeOnLedger({
      org_entity_id: args.org_entity_id,
      actor_entity_id: args.actor_entity_id,
      document_ledger_id: owned.ledger_entry_id,
      project_id: owned.project_id,
      document_id: documentId,
      change_kind: changeKind,
      already_applied: result.already_applied,
      body_char_count: result.body_char_count,
      prior_details:
        typeof owned.details === "object" && owned.details !== null
          ? (owned.details as Record<string, unknown>)
          : {},
    });
  }

  return result;
}

/**
 * Record material vs formatting classification on the DOCUMENT ledger and,
 * for MATERIAL only, open one bounded work item. Never stores body text.
 */
async function recordDocChangeOnLedger(args: {
  org_entity_id: string;
  actor_entity_id: string;
  document_ledger_id: string;
  project_id: string | null;
  document_id: string;
  change_kind: GoogleDocChangeKind;
  already_applied: boolean;
  body_char_count: number;
  prior_details: Record<string, unknown>;
}): Promise<void> {
  if (args.already_applied) return;
  const now = new Date().toISOString();
  const revisionMeta =
    args.change_kind === "MATERIAL"
      ? {
          last_material_change_at: now,
          last_material_actor_entity_id: args.actor_entity_id,
          last_material_body_char_count: args.body_char_count,
          last_change_kind: "MATERIAL" as const,
        }
      : {
          last_formatting_change_at: now,
          last_formatting_actor_entity_id: args.actor_entity_id,
          last_change_kind: "FORMATTING_ONLY" as const,
        };

  try {
    await prisma.workLedgerEntry.update({
      where: { ledger_entry_id: args.document_ledger_id },
      data: {
        details: {
          ...args.prior_details,
          document_id: args.document_id,
          ...revisionMeta,
        } as object,
      },
    });
  } catch {
    // Ledger metadata is enhancement; mutation already succeeded at provider.
  }

  // MATERIAL only: one attributable work item (risk/dependency style). No
  // obligation for formatting-only (prevents organizational noise).
  if (args.change_kind !== "MATERIAL") return;
  try {
    await createLedgerEntry({
      org_entity_id: args.org_entity_id,
      ledger_type: "BLOCKER",
      source_type: "CONNECTOR",
      title: "Material document change requires operational reflection",
      summary:
        "A material Google Doc revision was applied. Confirm project risk/dependency impact before the linked milestone.",
      status: "DETECTED",
      priority: "PROJECT_CRITICAL",
      owner_entity_id: args.actor_entity_id,
      ...(args.project_id ? { project_id: args.project_id } : {}),
      details: {
        source: "google_doc_append",
        materiality: "MATERIAL",
        document_id: args.document_id,
        document_ledger_id: args.document_ledger_id,
        // No body text — only classification + linkage.
      },
      evidence: [
        {
          kind: "provider_document_revision",
          document_ledger_id: args.document_ledger_id,
          materiality: "MATERIAL",
          at: now,
        },
      ],
    });
  } catch {
    // Non-fatal: provider write is the primary success.
  }
}

async function applyDocMutationWithToken(args: {
  access_token: string;
  document_id: string;
  body_text: string;
  change_kind: GoogleDocChangeKind;
  idempotency_key: string | null;
  audit: (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
    extra?: Record<string, unknown>,
  ) => Promise<void>;
}): Promise<GoogleDocAppendResult> {
  const web_view_link = `https://docs.google.com/document/d/${encodeURIComponent(args.document_id)}/edit`;

  if (args.change_kind === "FORMATTING_ONLY") {
    // Bold the first few characters of body (index 1..min(end, 20)) — no semantic insert.
    const end = await fetchDocEndIndex({
      access_token: args.access_token,
      document_id: args.document_id,
    });
    let attempt: BatchUpdateAttempt | null = null;
    if (end.ok) {
      const endExclusive = Math.min(Math.max(end.index, 2), 24);
      attempt = await batchUpdateDoc({
        access_token: args.access_token,
        document_id: args.document_id,
        requests: [
          {
            updateTextStyle: {
              range: { startIndex: 1, endIndex: endExclusive },
              textStyle: { bold: true },
              fields: "bold",
            },
          },
        ],
      });
      if (attempt.ok) {
        await args.audit("SUCCESS", "formatting_only_applied", {
          provider_http_status: attempt.http,
          path: "docs_updateTextStyle",
        });
        return {
          ok: true,
          document_id: args.document_id,
          appended: true,
          body_char_count: 0,
          web_view_link,
          change_kind: "FORMATTING_ONLY",
          materiality: "FORMATTING_ONLY",
          already_applied: false,
          provider_http_status: attempt.http,
        };
      }
    }

    // Drive HTML rewrite fallback — same permission surface as create when
    // Docs API style mutations are 403. Bold first line without semantic change.
    const driveFmt = await formatViaDriveHtmlRewrite({
      access_token: args.access_token,
      document_id: args.document_id,
    });
    if (driveFmt.ok) {
      await args.audit("SUCCESS", "formatting_only_applied_drive_html", {
        provider_http_status: driveFmt.http,
        path: "drive_html_rewrite",
      });
      return {
        ok: true,
        document_id: args.document_id,
        appended: true,
        body_char_count: 0,
        web_view_link,
        change_kind: "FORMATTING_ONLY",
        materiality: "FORMATTING_ONLY",
        already_applied: false,
        provider_http_status: driveFmt.http,
      };
    }

    const docsHttp = attempt?.http ?? (end.ok ? 0 : end.http);
    const failHttp = driveFmt.http || docsHttp || 0;
    const code = classifyBatchUpdateFailure(failHttp);
    await args.audit("DENIED", code, {
      provider_http_status: failHttp,
      docs_http: docsHttp,
      drive_http: driveFmt.http,
      path: "formatting_all_failed",
    });
    return { ok: false, code, provider_http_status: failHttp };
  }

  // MATERIAL: insert semantic text at end of body.
  const marker =
    args.idempotency_key !== null
      ? changeMarkerLine(args.idempotency_key)
      : null;
  const material =
    marker !== null
      ? `\n\n## Material change\n${marker}\n${args.body_text}\n`
      : `\n\n## Material change\n${args.body_text}\n`;

  // 1) Preferred: Docs API endOfSegmentLocation (body) — no fragile index.
  let attempt = await batchUpdateDoc({
    access_token: args.access_token,
    document_id: args.document_id,
    requests: [
      {
        insertText: {
          endOfSegmentLocation: { segmentId: "" },
          text: material.endsWith("\n") ? material : `${material}\n`,
        },
      },
    ],
  });

  // 2) Fallback: computed end index (max endIndex - 1).
  if (!attempt.ok && attempt.http !== 403 && attempt.http !== 401) {
    const end = await fetchDocEndIndex({
      access_token: args.access_token,
      document_id: args.document_id,
    });
    if (end.ok && end.index >= 1) {
      attempt = await batchUpdateDoc({
        access_token: args.access_token,
        document_id: args.document_id,
        requests: [
          {
            insertText: {
              location: { index: end.index },
              text: material.endsWith("\n") ? material : `${material}\n`,
            },
          },
        ],
      });
      if (!attempt.ok && attempt.http === 400) {
        attempt = await batchUpdateDoc({
          access_token: args.access_token,
          document_id: args.document_id,
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: material.endsWith("\n") ? material : `${material}\n`,
              },
            },
          ],
        });
      }
    }
  }

  // 3) Drive export+rewrite fallback — create already works via Drive multipart
  // under drive.file when Docs API batchUpdate is 403 (Docs API disabled /
  // workspace policy). Same permission surface as successful create.
  if (!attempt.ok) {
    const drive = await appendViaDriveRewrite({
      access_token: args.access_token,
      document_id: args.document_id,
      append_text: material,
    });
    if (drive.ok) {
      await args.audit("SUCCESS", "material_appended_drive_rewrite", {
        provider_http_status: drive.http,
        body_char_count: material.length,
        path: "drive_export_rewrite",
      });
      return {
        ok: true,
        document_id: args.document_id,
        appended: true,
        body_char_count: material.length,
        web_view_link,
        change_kind: "MATERIAL",
        materiality: "MATERIAL",
        already_applied: false,
        provider_http_status: drive.http,
      };
    }
    // Prefer the more specific of Docs vs Drive failure codes.
    const code = classifyBatchUpdateFailure(
      drive.http || attempt.http || 0,
    );
    await args.audit("DENIED", code, {
      provider_http_status: drive.http || attempt.http,
      docs_http: attempt.http,
      drive_http: drive.http,
      path: "all_failed",
    });
    return {
      ok: false,
      code,
      provider_http_status: drive.http || attempt.http,
    };
  }

  await args.audit("SUCCESS", "material_appended", {
    provider_http_status: attempt.http,
    body_char_count: material.length,
  });
  return {
    ok: true,
    document_id: args.document_id,
    appended: true,
    body_char_count: material.length,
    web_view_link,
    change_kind: "MATERIAL",
    materiality: "MATERIAL",
    already_applied: false,
    provider_http_status: attempt.http,
  };
}

/**
 * Drive-native material append: export plain text, concatenate, rewrite via
 * media upload. Used when Docs API batchUpdate is denied (common when
 * create used Drive multipart and Docs API is restricted).
 * Never logs content.
 */
async function appendViaDriveRewrite(args: {
  access_token: string;
  document_id: string;
  append_text: string;
}): Promise<{ ok: true; http: number } | { ok: false; http: number }> {
  const exported = await fetchDocPlainText({
    access_token: args.access_token,
    document_id: args.document_id,
  });
  if (!exported.ok) return { ok: false, http: exported.http };

  const next = `${exported.text.trimEnd()}\n${args.append_text.endsWith("\n") ? args.append_text : `${args.append_text}\n`}`;

  return driveMultipartRewrite({
    access_token: args.access_token,
    document_id: args.document_id,
    content_type: "text/plain; charset=UTF-8",
    body: next,
  });
}

/**
 * Formatting-only via Drive: export plain text, bold the first non-empty line
 * via HTML, rewrite. No semantic content change (same plain-text extract).
 * Never logs content.
 */
async function formatViaDriveHtmlRewrite(args: {
  access_token: string;
  document_id: string;
}): Promise<{ ok: true; http: number } | { ok: false; http: number }> {
  const exported = await fetchDocPlainText({
    access_token: args.access_token,
    document_id: args.document_id,
  });
  if (!exported.ok) return { ok: false, http: exported.http };

  const lines = exported.text.split("\n");
  let bolded = false;
  const htmlLines: string[] = [];
  for (const line of lines) {
    if (!bolded && line.trim().length > 0) {
      // Escape minimal HTML specials; bold only the first content line.
      const esc = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      htmlLines.push(`<p><b>${esc}</b></p>`);
      bolded = true;
    } else {
      const esc = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      htmlLines.push(esc.length === 0 ? "<p><br></p>" : `<p>${esc}</p>`);
    }
  }
  if (!bolded) {
    // Empty doc — nothing to format.
    return { ok: false, http: 400 };
  }
  const html = `<html><body>${htmlLines.join("")}</body></html>`;

  return driveMultipartRewrite({
    access_token: args.access_token,
    document_id: args.document_id,
    content_type: "text/html; charset=UTF-8",
    body: html,
  });
}

/** Shared Drive multipart PATCH rewrite (create-equivalent permission surface). */
async function driveMultipartRewrite(args: {
  access_token: string;
  document_id: string;
  content_type: string;
  body: string;
}): Promise<{ ok: true; http: number } | { ok: false; http: number }> {
  const boundary = `otzar_ap_${Date.now().toString(36)}`;
  const meta = JSON.stringify({
    mimeType: "application/vnd.google-apps.document",
  });
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${args.content_type}\r\n\r\n` +
    `${args.body}\r\n` +
    `--${boundary}--`;

  try {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(args.document_id)}?uploadType=multipart`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${args.access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    );
    if (!res.ok) return { ok: false, http: res.status };
    return { ok: true, http: res.status };
  } catch {
    return { ok: false, http: 0 };
  }
}

/** Pure helper for tests — maps HTTP status → typed append failure. */
export function mapProviderHttpToAppendCode(
  http: number,
): GoogleDocAppendFailureCode {
  return classifyBatchUpdateFailure(http);
}
