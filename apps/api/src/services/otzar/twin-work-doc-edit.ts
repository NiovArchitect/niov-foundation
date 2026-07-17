// FILE: twin-work-doc-edit.ts
// PURPOSE: [C.3b] Detect Drive document changes after Twin claim so humans
//          and Twins share one truth: "the doc moved since claim." Does not
//          invent who edited (Drive lastModifyingUser is optional later).
// CONNECTS TO: twin-work-claim.service details.twin_work, connector-oauth
//          Google Drive files.get, work-ledger projection.

import { prisma, writeAuditEvent } from "@niov/database";
import { getProviderAccessTokenForOrg } from "../connector/connector-oauth.service.js";
import { getLedgerEntry, type WorkLedgerView } from "../work-os/work-ledger.service.js";
import { makeNotificationService } from "../notification/notification.service.js";

const notificationService = makeNotificationService({});

/** Notification when a claimed doc is first seen modified after claim. */
export const TWIN_DOC_EDITED_CLASS = "TWIN_DOCUMENT_EDITED_AFTER_CLAIM";

export type TwinDocEditSignal = "NONE" | "MODIFIED_AFTER_CLAIM";

export interface TwinDocEditCompareInput {
  /** ISO claim time (floor if no baseline). */
  claimed_at: string | null;
  /** Last Drive modifiedTime observed as baseline (optional). */
  baseline_modified_at: string | null;
  /** Current Drive modifiedTime. */
  drive_modified_at: string;
  /** Already marked edited — stay sticky once true. */
  previously_detected?: boolean;
  /** Slack ms so create-time race does not false-positive (default 5s). */
  slack_ms?: number;
}

export interface TwinDocEditCompareResult {
  edit_detected: boolean;
  edit_signal: TwinDocEditSignal;
  /** Baseline to persist when first check establishes floor. */
  next_baseline_modified_at: string;
}

// WHAT: Pure compare of claim baseline vs Drive modifiedTime.
// WHY: Unit-testable without Google; honest "changed after claim" only.
export function compareTwinDocEdit(
  input: TwinDocEditCompareInput,
): TwinDocEditCompareResult {
  const slack = typeof input.slack_ms === "number" ? input.slack_ms : 5000;
  const driveMs = Date.parse(input.drive_modified_at);
  if (Number.isNaN(driveMs)) {
    return {
      edit_detected: input.previously_detected === true,
      edit_signal:
        input.previously_detected === true ? "MODIFIED_AFTER_CLAIM" : "NONE",
      next_baseline_modified_at:
        input.baseline_modified_at ?? input.claimed_at ?? input.drive_modified_at,
    };
  }

  if (input.previously_detected === true) {
    return {
      edit_detected: true,
      edit_signal: "MODIFIED_AFTER_CLAIM",
      next_baseline_modified_at:
        input.baseline_modified_at ?? input.drive_modified_at,
    };
  }

  const baselineRaw =
    input.baseline_modified_at ?? input.claimed_at ?? input.drive_modified_at;
  const baselineMs = Date.parse(baselineRaw);
  if (Number.isNaN(baselineMs)) {
    return {
      edit_detected: false,
      edit_signal: "NONE",
      next_baseline_modified_at: input.drive_modified_at,
    };
  }

  // First observation: establish baseline at current Drive time without
  // flagging (claim create ≈ first modifiedTime).
  if (input.baseline_modified_at == null && input.claimed_at != null) {
    const claimMs = Date.parse(input.claimed_at);
    if (!Number.isNaN(claimMs) && Math.abs(driveMs - claimMs) <= slack) {
      return {
        edit_detected: false,
        edit_signal: "NONE",
        next_baseline_modified_at: input.drive_modified_at,
      };
    }
  }

  const floor = input.baseline_modified_at != null ? baselineMs : baselineMs;
  const edited = driveMs > floor + slack;
  return {
    edit_detected: edited,
    edit_signal: edited ? "MODIFIED_AFTER_CLAIM" : "NONE",
    next_baseline_modified_at:
      input.baseline_modified_at ?? input.drive_modified_at,
  };
}

export type DetectTwinDocEditResult =
  | {
      ok: true;
      entry: WorkLedgerView;
      edit_detected: boolean;
      edit_signal: TwinDocEditSignal;
      drive_modified_at: string | null;
      notified: boolean;
    }
  | { ok: false; code: string };

async function fetchDriveModifiedTime(args: {
  org_entity_id: string;
  document_id: string;
}): Promise<
  | { ok: true; modified_time: string }
  | { ok: false; code: string }
> {
  const token = await getProviderAccessTokenForOrg({
    provider: "GOOGLE_WORKSPACE",
    org_entity_id: args.org_entity_id,
  });
  if (token.ok === false) return { ok: false, code: token.code };

  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.document_id)}?fields=id,modifiedTime`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
    );
  } catch {
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  if (res.status === 404) return { ok: false, code: "NOT_FOUND" };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, code: "GOOGLE_RECONNECT_REQUIRED" };
  }
  if (!res.ok) return { ok: false, code: "PROVIDER_ERROR" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  const modified =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { modifiedTime?: unknown }).modifiedTime === "string"
      ? (body as { modifiedTime: string }).modifiedTime
      : null;
  if (modified === null || modified.length === 0) {
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  return { ok: true, modified_time: modified };
}

// WHAT: Check one Twin-claimed document row for Drive edits after claim.
// WHY: Close the loop — claimed work must notice when the artifact moves.
export async function detectTwinWorkDocumentEdits(args: {
  org_entity_id: string;
  human_entity_id: string;
  ledger_entry_id: string;
  /** When true, do not notify even on first detection. */
  quiet?: boolean;
}): Promise<DetectTwinDocEditResult> {
  const existing = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.human_entity_id,
    is_manager: true,
  });
  if (existing.ok === false) return { ok: false, code: existing.code };

  const row = await prisma.workLedgerEntry.findFirst({
    where: {
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
    },
    select: { details: true, title: true },
  });
  if (row === null) return { ok: false, code: "NOT_FOUND" };

  const details = {
    ...(typeof row.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>)
      : {}),
  };
  const prevTwin =
    typeof details.twin_work === "object" && details.twin_work !== null
      ? (details.twin_work as Record<string, unknown>)
      : null;
  if (prevTwin === null) return { ok: false, code: "NO_TWIN_CLAIM" };

  const documentId =
    typeof prevTwin.document_id === "string" ? prevTwin.document_id : null;
  if (documentId === null || documentId.length === 0) {
    return { ok: false, code: "NO_DOCUMENT" };
  }

  const drive = await fetchDriveModifiedTime({
    org_entity_id: args.org_entity_id,
    document_id: documentId,
  });
  if (drive.ok === false) return { ok: false, code: drive.code };

  const previously =
    prevTwin.edit_detected === true ||
    prevTwin.edit_signal === "MODIFIED_AFTER_CLAIM";
  const compared = compareTwinDocEdit({
    claimed_at:
      typeof prevTwin.claimed_at === "string" ? prevTwin.claimed_at : null,
    baseline_modified_at:
      typeof prevTwin.baseline_modified_at === "string"
        ? prevTwin.baseline_modified_at
        : null,
    drive_modified_at: drive.modified_time,
    previously_detected: previously,
  });

  const firstDetection = compared.edit_detected && !previously;
  const twinWork: Record<string, unknown> = {
    ...prevTwin,
    baseline_modified_at: compared.next_baseline_modified_at,
    last_drive_modified_at: drive.modified_time,
    edit_detected: compared.edit_detected,
    edit_signal: compared.edit_signal,
    edit_checked_at: new Date().toISOString(),
  };
  details.twin_work = twinWork;

  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.ledger_entry_id },
    data: { details: details as object },
  });

  let notified = false;
  if (firstDetection && args.quiet !== true) {
    const twinId =
      typeof prevTwin.twin_entity_id === "string"
        ? prevTwin.twin_entity_id
        : args.human_entity_id;
    try {
      await notificationService.createInternalNotification({
        org_entity_id: args.org_entity_id,
        recipient_entity_id: args.human_entity_id,
        source_entity_id: twinId,
        notification_class: TWIN_DOC_EDITED_CLASS,
        body_summary: `Document updated since your AI Teammate claimed it: "${String(row.title).slice(0, 100)}" — review so you share one truth.`,
        action_id: null,
      });
      notified = true;
    } catch {
      notified = false;
    }
    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: twinId,
      target_entity_id: args.human_entity_id,
      details: {
        action: "TWIN_DOC_EDIT_DETECTED",
        ledger_entry_id: args.ledger_entry_id,
        edit_signal: compared.edit_signal,
      },
    });
  }

  const again = await getLedgerEntry({
    ledger_entry_id: args.ledger_entry_id,
    org_entity_id: args.org_entity_id,
    caller_entity_id: args.human_entity_id,
    is_manager: true,
  });
  if (again.ok === false) return { ok: false, code: again.code };

  return {
    ok: true,
    entry: again.entry,
    edit_detected: compared.edit_detected,
    edit_signal: compared.edit_signal,
    drive_modified_at: drive.modified_time,
    notified,
  };
}

// WHAT: Check up to N claimed document rows for the caller.
export async function detectTwinWorkDocumentEditsBatch(args: {
  org_entity_id: string;
  human_entity_id: string;
  ledger_entry_ids: string[];
}): Promise<{
  ok: true;
  results: Array<
    | {
        ledger_entry_id: string;
        ok: true;
        edit_detected: boolean;
        edit_signal: TwinDocEditSignal;
      }
    | { ledger_entry_id: string; ok: false; code: string }
  >;
}> {
  const ids = args.ledger_entry_ids.slice(0, 10);
  const results: Array<
    | {
        ledger_entry_id: string;
        ok: true;
        edit_detected: boolean;
        edit_signal: TwinDocEditSignal;
      }
    | { ledger_entry_id: string; ok: false; code: string }
  > = [];
  for (const id of ids) {
    const r = await detectTwinWorkDocumentEdits({
      org_entity_id: args.org_entity_id,
      human_entity_id: args.human_entity_id,
      ledger_entry_id: id,
      quiet: false,
    });
    if (r.ok) {
      results.push({
        ledger_entry_id: id,
        ok: true,
        edit_detected: r.edit_detected,
        edit_signal: r.edit_signal,
      });
    } else {
      results.push({ ledger_entry_id: id, ok: false, code: r.code });
    }
  }
  return { ok: true, results };
}
