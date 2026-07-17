// FILE: google-doc-share.service.ts
// PURPOSE: [PROJECT-COHERENCE] Gated Google Drive permissions.create for
//          app-created docs (drive.file). Never logs emails in audit.
// CONNECTS TO: connector-oauth, google-doc.routes

import { writeAuditEvent } from "@niov/database";
import {
  getProviderGrantedScopes,
  getProviderAccessTokenForOrg,
} from "./connector-oauth.service.js";
import { grantsDocWrite } from "./google-doc.service.js";

export type GoogleDocShareRole = "reader" | "commenter" | "writer";

export type GoogleDocShareResult =
  | { ok: true; permission_id: string; role: GoogleDocShareRole }
  | {
      ok: false;
      code:
        | "NEEDS_CALLER_CONFIRMATION"
        | "INVALID_INPUT"
        | "GOOGLE_RECONNECT_REQUIRED"
        | "DOC_WRITE_SCOPE_MISSING"
        | "PROVIDER_ERROR";
    };

export async function shareGoogleDoc(args: {
  actor_entity_id: string;
  org_entity_id: string;
  document_id: string;
  /** Collaborator email — never written to audit details. */
  email: string;
  role?: GoogleDocShareRole;
  caller_confirmed: boolean;
}): Promise<GoogleDocShareResult> {
  if (args.caller_confirmed !== true) {
    return { ok: false, code: "NEEDS_CALLER_CONFIRMATION" };
  }
  const documentId = args.document_id.trim();
  const email = args.email.trim().toLowerCase();
  const role: GoogleDocShareRole = args.role ?? "writer";
  if (documentId.length === 0 || !email.includes("@") || email.length < 5) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  if (!["reader", "commenter", "writer"].includes(role)) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const scopes = await getProviderGrantedScopes({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (scopes === null) {
    await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { reason: "GOOGLE_RECONNECT_REQUIRED", action: "share" },
    });
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }
  if (!grantsDocWrite(scopes)) {
    await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { reason: "DOC_WRITE_SCOPE_MISSING", action: "share" },
    });
    return { ok: false, code: "DOC_WRITE_SCOPE_MISSING" };
  }

  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) {
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}/permissions?sendNotificationEmail=false`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "user",
          role,
          emailAddress: email,
        }),
      },
    );
  } catch {
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (res.status === 401 || res.status === 403) {
    await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { reason: "DOC_WRITE_SCOPE_MISSING", action: "share" },
    });
    return { ok: false, code: "DOC_WRITE_SCOPE_MISSING" };
  }
  if (!res.ok) {
    await writeAuditEvent({
      event_type: "GOOGLE_DOC_CREATE",
      outcome: "DENIED",
      actor_entity_id: args.actor_entity_id,
      target_entity_id: args.org_entity_id,
      details: { reason: `http_${res.status}`, action: "share" },
    });
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: unknown };
  const permissionId = typeof body.id === "string" ? body.id : "ok";
  await writeAuditEvent({
    event_type: "GOOGLE_DOC_CREATE",
    outcome: "SUCCESS",
    actor_entity_id: args.actor_entity_id,
    target_entity_id: args.org_entity_id,
    details: {
      reason: "shared",
      action: "share",
      role,
      // SAFE: never email
      email_present: true,
      document_id_present: true,
    },
  });
  return { ok: true, permission_id: permissionId, role };
}
