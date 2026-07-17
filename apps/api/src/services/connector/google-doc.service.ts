// FILE: google-doc.service.ts
// PURPOSE: [GOOGLE-DOCS-WRITE] GATED Google Doc create lifecycle — mirror of
//          calendar-event.service.ts. Product path:
//            intent → caller confirmation (+ optional approval) → create
//            ONLY when every gate passes, then real Docs API documents.create
//            (+ optional body insert via batchUpdate). Never auto-creates.
// CONNECTS TO: connector-oauth.service.ts (granted scopes + access token),
//          google-doc.routes.ts, packages/database audit (GOOGLE_DOC_CREATE),
//          work-ledger DOCUMENT row (best-effort).
//
// SAFETY (RULE 0 / RULE 4): create happens ONLY behind a passed gate ladder;
// audit details are scrubbed (no titles, body, tokens, emails).

import { writeAuditEvent } from "@niov/database";
import {
  getProviderGrantedScopes,
  getProviderAccessTokenForOrg,
} from "./connector-oauth.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";

// Scopes that permit creating Google Docs. Prefer documents (Docs API)
// and/or drive.file (app-created files). Broad `drive` is accepted as a
// superset only — it is NOT requested by default.
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
  | "DOC_WRITE_SCOPE_MISSING";

export interface GoogleDocCreateInput {
  title: string;
  /** Optional initial body text (plain). Inserted after create when present. */
  body_text?: string;
  requires_approval?: boolean;
  approved?: boolean;
  caller_confirmed?: boolean;
  policy_blocked?: boolean;
  source_command?: string;
  owner_entity_id?: string;
}

export function grantsDocWrite(
  scopes: ReadonlyArray<string> | null,
): boolean {
  if (scopes === null) return false;
  const set = new Set(scopes);
  return DOC_WRITE_SCOPES.some((s) => set.has(s));
}

// WHAT: Pure gate ladder for doc create — human gates before capability.
// WHY: Same discipline as calendar: never call the provider until intent is
//      confirmed and the token actually grants write.
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
  return null;
}

export type GoogleDocCreateResult =
  | {
      ok: true;
      status: "CREATED";
      document_id: string;
      title: string;
      web_view_link: string | null;
    }
  | { ok: false; code: GoogleDocGateCode | "PROVIDER_ERROR" };

// WHAT: Attempt to create a Google Doc — HARD gate enforcement.
// INPUT: create input + caller/org identity.
// OUTPUT: { ok:false; code } for any unmet gate; { ok:true } only when the
//         Docs API returned a document id (optionally with body inserted).
// WHY: Single chokepoint — no auto-create, no fabricated CREATED.
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

  const hasBody =
    typeof args.input.body_text === "string" &&
    args.input.body_text.trim().length > 0;

  const audit = async (
    outcome: "SUCCESS" | "DENIED",
    reason: string,
  ): Promise<string> => {
    const event = await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome,
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: {
        reason,
        has_body: hasBody,
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

  // Prefer Drive files.create (native Google Doc mime). This works with
  // drive.file when the Google Cloud project has Drive API enabled —
  // the usual path after Workspace OAuth. Docs API documents.create is
  // a fallback (needs the Docs API product enabled on the GCP project).
  const authHeaders = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
  };

  let documentId = "";
  let createdTitle = title;
  let webViewLink: string | null = null;
  let lastHttp = 0;

  // Path A — Drive API
  try {
    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: title,
          mimeType: "application/vnd.google-apps.document",
        }),
      },
    );
    lastHttp = driveRes.status;
    if (driveRes.status === 401 || driveRes.status === 403) {
      // fall through to Docs API before deciding scope-missing
    } else if (driveRes.ok) {
      const driveBody = (await driveRes.json().catch(() => ({}))) as {
        id?: unknown;
        name?: unknown;
        webViewLink?: unknown;
      };
      if (typeof driveBody.id === "string" && driveBody.id.length > 0) {
        documentId = driveBody.id;
        if (typeof driveBody.name === "string" && driveBody.name.length > 0) {
          createdTitle = driveBody.name;
        }
        if (typeof driveBody.webViewLink === "string") {
          webViewLink = driveBody.webViewLink;
        }
      }
    }
  } catch {
    // try Docs API next
  }

  // Path B — Docs API (fallback)
  if (documentId.length === 0) {
    try {
      const docsRes = await fetch("https://docs.googleapis.com/v1/documents", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ title }),
      });
      lastHttp = docsRes.status;
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
      if (
        typeof docsBody.title === "string" &&
        docsBody.title.length > 0
      ) {
        createdTitle = docsBody.title;
      }
    } catch {
      await audit("DENIED", "provider_fetch_failed");
      return { ok: false, code: "PROVIDER_ERROR" };
    }
  }

  if (documentId.length === 0) {
    // Both paths failed without a clear 401/403 on Docs.
    if (lastHttp === 401 || lastHttp === 403) {
      await audit("DENIED", "DOC_WRITE_SCOPE_MISSING");
      return { ok: false, code: "DOC_WRITE_SCOPE_MISSING" };
    }
    await audit("DENIED", lastHttp > 0 ? `http_${lastHttp}` : "no_document_id");
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  // Optional body insert — best-effort after the doc exists. Failure to
  // insert text does NOT unwind the create (doc is real + linkable).
  if (hasBody) {
    const text = args.input.body_text!.trim().slice(0, 50_000);
    try {
      const insertRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: text.endsWith("\n") ? text : `${text}\n`,
                },
              },
            ],
          }),
        },
      );
      // Soft-fail body insert: 401/403/5xx leave an empty but real doc.
      void insertRes;
    } catch {
      // Doc create already succeeded.
    }
  }

  const auditEventId = await audit("SUCCESS", "created");
  if (webViewLink === null || webViewLink.length === 0) {
    webViewLink = `https://docs.google.com/document/d/${documentId}/edit`;
  }
  const ownerEntityId = args.input.owner_entity_id ?? args.actor_entity_id;

  // Best-effort WorkLedger DOCUMENT row — enhancement only.
  try {
    await createLedgerEntry({
      org_entity_id: args.org_entity_id,
      ledger_type: "DOCUMENT",
      source_type: "CONNECTOR",
      title,
      summary: "Google Doc created after confirmation.",
      status: "EXECUTED",
      priority: "ROUTINE",
      owner_entity_id: ownerEntityId,
      details: {
        source: "google_doc",
        document_id: documentId,
        provider: "google_docs",
        web_view_link: webViewLink,
        audit_event_id: auditEventId,
        has_body: hasBody,
      },
    });
  } catch {
    // Ledger failure never unwinds a real provider create.
  }

  return {
    ok: true,
    status: "CREATED",
    document_id: documentId,
    title: createdTitle,
    web_view_link: webViewLink,
  };
}
