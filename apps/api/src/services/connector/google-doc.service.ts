// FILE: google-doc.service.ts
// PURPOSE: [GOOGLE-DOCS-WRITE] GATED Google Doc create. Prefer Drive multipart
//          create WITH body content so organizational documents are never empty
//          shells. Docs batchUpdate is a verified fallback with retries.
//          Functional success requires body_inserted when body was requested.
// CONNECTS TO: connector-oauth.service.ts, google-doc.routes.ts,
//          project-document.service.ts, work-ledger DOCUMENT rows.
//
// SAFETY: create only behind gate ladder; audit scrubbed (no body/tokens).

import { writeAuditEvent } from "@niov/database";
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

// ── [ACCEPTANCE] Material append for edit-propagation proof ────────────────
// Controlled body append behind the same confirmation + scope gates as create.
// Used to prove: new Drive revision → twin-work detect-edits → notify.

export type GoogleDocAppendResult =
  | {
      ok: true;
      document_id: string;
      appended: true;
      body_char_count: number;
      web_view_link: string | null;
    }
  | { ok: false; code: GoogleDocGateCode | "NEEDS_DOCUMENT_ID" | "PROVIDER_ERROR" | "APPEND_FAILED" };

export interface GoogleDocAppendInput {
  document_id: string;
  body_text: string;
  caller_confirmed?: boolean;
  policy_blocked?: boolean;
}

async function fetchDocEndIndex(args: {
  access_token: string;
  document_id: string;
}): Promise<number | null> {
  try {
    const res = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(args.document_id)}?fields=body(content(endIndex))`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${args.access_token}` },
      },
    );
    if (!res.ok) return null;
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
    // Insert before the final newline of the document body.
    return Math.max(1, max - 1);
  } catch {
    return null;
  }
}

async function insertBodyAtIndex(args: {
  access_token: string;
  document_id: string;
  text: string;
  index: number;
}): Promise<boolean> {
  const payload = JSON.stringify({
    requests: [
      {
        insertText: {
          location: { index: args.index },
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

/**
 * Append text to an existing Google Doc (material change for detect-edits).
 * Hard-gated: caller_confirmed + doc-write scopes. Never logs body text.
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

  const audit = async (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
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
      },
    });
  };

  if (args.input.policy_blocked === true) {
    await audit("DENIED", "POLICY_BLOCKED");
    return { ok: false, code: "POLICY_BLOCKED" };
  }
  if (documentId.length === 0) {
    await audit("DENIED", "NEEDS_DOCUMENT_ID");
    return { ok: false, code: "NEEDS_DOCUMENT_ID" };
  }
  if (bodyText.length === 0) {
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
    await audit("DENIED", "DOC_WRITE_SCOPE_MISSING");
    return { ok: false, code: "DOC_WRITE_SCOPE_MISSING" };
  }

  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    await audit("DENIED", "GOOGLE_RECONNECT_REQUIRED");
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }

  return appendWithToken({
    access_token: token.access_token,
    document_id: documentId,
    body_text: bodyText,
    audit,
  });
}

async function appendWithToken(args: {
  access_token: string;
  document_id: string;
  body_text: string;
  audit: (outcome: "SUCCESS" | "DENIED", reason: string) => Promise<void>;
}): Promise<GoogleDocAppendResult> {
  const material = `\n\n## Material change (acceptance)\n${args.body_text}\n`;
  // Prefer end-of-body insert; fall back to index-1 insert (same path as create
  // body write) so Drive modifiedTime always advances for detect-edits proof.
  const endIndex = await fetchDocEndIndex({
    access_token: args.access_token,
    document_id: args.document_id,
  });
  let ok = false;
  if (endIndex !== null && endIndex > 1) {
    ok = await insertBodyAtIndex({
      access_token: args.access_token,
      document_id: args.document_id,
      text: material,
      index: endIndex,
    });
  }
  if (!ok) {
    ok = await insertBodyWithRetry({
      access_token: args.access_token,
      document_id: args.document_id,
      text: material,
    });
  }
  if (!ok) {
    await args.audit("DENIED", "APPEND_FAILED");
    return { ok: false, code: "APPEND_FAILED" };
  }

  await args.audit("SUCCESS", "appended");
  const web_view_link = `https://docs.google.com/document/d/${encodeURIComponent(args.document_id)}/edit`;
  return {
    ok: true,
    document_id: args.document_id,
    appended: true,
    body_char_count: material.length,
    web_view_link,
  };
}
