// FILE: twin-work-claim.service.ts
// PURPOSE: [PROJECT-COHERENCE] AI Teammate work claim — after communication
//          clarity is extracted, the Twin claims document/task work so the
//          human is not double-working. Notifies human: working / needs
//          clarity / complete / collab requested. Does NOT silently execute
//          external connectors (Jira etc.) — those remain gated write rails.
// CONNECTS TO: resolvePrimaryTwin, work-ledger, notification.service,
//          project-transcript-extract next_actions.

import { prisma, writeAuditEvent } from "@niov/database";
import { resolvePrimaryTwin } from "./twin-resolution.js";
import {
  createLedgerEntry,
  getLedgerEntry,
  type WorkLedgerView,
} from "../work-os/work-ledger.service.js";
import { makeNotificationService } from "../notification/notification.service.js";
import type { StructuredFact } from "./project-document-body.js";

const notificationService = makeNotificationService({});

export const TWIN_WORK_CLASS = {
  WORKING: "TWIN_WORKING_ON_WORK",
  CLARITY: "TWIN_NEEDS_CLARITY",
  COMPLETE: "TWIN_WORK_COMPLETED",
  COLLAB: "TWIN_COLLAB_REQUESTED",
} as const;

async function notifyHuman(args: {
  org_entity_id: string;
  human_entity_id: string;
  twin_entity_id: string;
  notification_class: string;
  body_summary: string;
}): Promise<void> {
  try {
    await notificationService.createInternalNotification({
      org_entity_id: args.org_entity_id,
      recipient_entity_id: args.human_entity_id,
      source_entity_id: args.twin_entity_id,
      notification_class: args.notification_class,
      body_summary: args.body_summary,
      action_id: null,
    });
  } catch {
    // notify is best-effort after claim
  }
}

export type TwinWorkClaimResult =
  | {
      ok: true;
      entry: WorkLedgerView;
      twin_entity_id: string;
      notified: true;
    }
  | { ok: false; code: string };

// WHAT: Claim work for the human's primary Twin and notify the human.
// WHY: Prevent human + Twin doing the same task; ambient awareness without burden.
/** Accuracy posture for Twin-handled document/task work. */
export type TwinWorkAccuracyClass =
  | "STANDARD"
  | "REGULATED_HEALTH"
  | "REGULATED_FINANCE"
  | "INSURANCE";

export async function claimWorkForTwin(args: {
  org_entity_id: string;
  human_entity_id: string;
  title: string;
  summary?: string;
  project_id?: string;
  conversation_id?: string;
  document_id?: string;
  web_view_link?: string | null;
  next_action?: string;
  work_kind?: "DOCUMENT" | "TASK" | "CONNECTOR_UPDATE" | "OTHER";
  /** Clinical, insurance, or financial documentation requires higher care. */
  accuracy_class?: TwinWorkAccuracyClass;
}): Promise<TwinWorkClaimResult> {
  const title = args.title.trim();
  if (title.length === 0) return { ok: false, code: "INVALID_INPUT" };

  const resolved = await resolvePrimaryTwin(args.human_entity_id);
  if (resolved === null) return { ok: false, code: "TWIN_REQUIRED" };
  const twinId = resolved.twin.entity_id;
  const accuracy: TwinWorkAccuracyClass = args.accuracy_class ?? "STANDARD";
  const regulated = accuracy !== "STANDARD";

  const created = await createLedgerEntry({
    org_entity_id: args.org_entity_id,
    ledger_type: "TASK",
    source_type: "TRANSCRIPT",
    title,
    summary:
      args.summary ??
      (regulated
        ? `Accuracy-critical (${accuracy}): your AI Teammate is handling this carefully and will not invent facts.`
        : "Your AI Teammate is handling this so you do not need to duplicate the work."),
    status: "EXECUTING",
    priority: regulated ? "PROJECT_CRITICAL" : "ROUTINE",
    owner_entity_id: args.human_entity_id,
    requester_entity_id: twinId,
    ...(typeof args.project_id === "string" ? { project_id: args.project_id } : {}),
    ...(typeof args.conversation_id === "string"
      ? { conversation_id: args.conversation_id }
      : {}),
    next_action: args.next_action ?? (regulated
      ? "Twin executing with verification posture; human notified"
      : "Twin executing; human notified"),
    details: {
      twin_work: {
        twin_entity_id: twinId,
        human_entity_id: args.human_entity_id,
        state: "CLAIMED_WORKING",
        work_kind: args.work_kind ?? "TASK",
        accuracy_class: accuracy,
        requires_verification: regulated,
        no_invented_facts: true,
        claimed_at: new Date().toISOString(),
        document_id: args.document_id ?? null,
        web_view_link: args.web_view_link ?? null,
      },
    },
  });
  if (created.ok === false) return { ok: false, code: created.code };

  await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: twinId,
    target_entity_id: args.human_entity_id,
    details: {
      action: "TWIN_WORK_CLAIMED",
      ledger_entry_id: created.entry.ledger_entry_id,
      work_kind: args.work_kind ?? "TASK",
      has_project: typeof args.project_id === "string",
    },
  });

  await notifyHuman({
    org_entity_id: args.org_entity_id,
    human_entity_id: args.human_entity_id,
    twin_entity_id: twinId,
    notification_class: TWIN_WORK_CLASS.WORKING,
    body_summary: regulated
      ? `Your AI Teammate is carefully handling accuracy-critical work (${accuracy}): "${title.slice(0, 100)}" — no need to duplicate; it will ask only if verification needs you.`
      : `Your AI Teammate is working on: "${title.slice(0, 120)}" — no need to start this yourself unless you want to take over.`,
  });

  return {
    ok: true,
    entry: created.entry,
    twin_entity_id: twinId,
    notified: true,
  };
}

// WHAT: Twin needs a light clarity ask — not a blocker storm.
export async function twinRequestClarity(args: {
  org_entity_id: string;
  human_entity_id: string;
  ledger_entry_id: string;
  question: string;
}): Promise<TwinWorkClaimResult> {
  const q = args.question.trim();
  if (q.length < 4) return { ok: false, code: "INVALID_INPUT" };
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
    select: { details: true },
  });
  const details = {
    ...(typeof row?.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>)
      : {}),
  };
  const prevTwin =
    typeof details.twin_work === "object" && details.twin_work !== null
      ? (details.twin_work as Record<string, unknown>)
      : {};
  const twinWork: Record<string, unknown> = {
    ...prevTwin,
    state: "NEEDS_CLARITY",
    clarity_question: q.slice(0, 500),
    clarity_at: new Date().toISOString(),
  };
  details.twin_work = twinWork;
  const twinId =
    typeof twinWork.twin_entity_id === "string"
      ? twinWork.twin_entity_id
      : (await resolvePrimaryTwin(args.human_entity_id))?.twin.entity_id;
  if (!twinId) return { ok: false, code: "TWIN_REQUIRED" };

  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.ledger_entry_id },
    data: {
      status: "NEEDS_CALLER_CONFIRMATION",
      next_action: `Clarity: ${q.slice(0, 160)}`,
      details: details as object,
    },
  });

  await notifyHuman({
    org_entity_id: args.org_entity_id,
    human_entity_id: args.human_entity_id,
    twin_entity_id: twinId,
    notification_class: TWIN_WORK_CLASS.CLARITY,
    body_summary: `Quick check on "${existing.entry.title.slice(0, 80)}": ${q.slice(0, 200)}`,
  });

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
    twin_entity_id: twinId,
    notified: true,
  };
}

export async function twinMarkWorkComplete(args: {
  org_entity_id: string;
  human_entity_id: string;
  ledger_entry_id: string;
  completion_note?: string;
}): Promise<TwinWorkClaimResult> {
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
    select: { details: true },
  });
  const details = {
    ...(typeof row?.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>)
      : {}),
  };
  const prevTwin =
    typeof details.twin_work === "object" && details.twin_work !== null
      ? (details.twin_work as Record<string, unknown>)
      : {};
  const twinWork: Record<string, unknown> = {
    ...prevTwin,
    state: "COMPLETED",
    completed_at: new Date().toISOString(),
    completion_note: (args.completion_note ?? "").slice(0, 500),
  };
  details.twin_work = twinWork;
  const twinId =
    typeof twinWork.twin_entity_id === "string"
      ? twinWork.twin_entity_id
      : (await resolvePrimaryTwin(args.human_entity_id))?.twin.entity_id;
  if (!twinId) return { ok: false, code: "TWIN_REQUIRED" };

  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.ledger_entry_id },
    data: {
      status: "EXECUTED",
      next_action: "Done — review if needed",
      details: details as object,
    },
  });

  await notifyHuman({
    org_entity_id: args.org_entity_id,
    human_entity_id: args.human_entity_id,
    twin_entity_id: twinId,
    notification_class: TWIN_WORK_CLASS.COMPLETE,
    body_summary: `Your AI Teammate finished: "${existing.entry.title.slice(0, 120)}"${
      args.completion_note ? ` — ${args.completion_note.slice(0, 100)}` : ""
    }`,
  });

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
    twin_entity_id: twinId,
    notified: true,
  };
}

export async function twinRequestCollaboration(args: {
  org_entity_id: string;
  human_entity_id: string;
  ledger_entry_id: string;
  safe_summary: string;
}): Promise<TwinWorkClaimResult> {
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
    select: { details: true },
  });
  const details = {
    ...(typeof row?.details === "object" && row.details !== null
      ? (row.details as Record<string, unknown>)
      : {}),
  };
  const prevTwin =
    typeof details.twin_work === "object" && details.twin_work !== null
      ? (details.twin_work as Record<string, unknown>)
      : {};
  const twinId = prevTwin.twin_entity_id;
  const twin =
    typeof twinId === "string"
      ? twinId
      : (await resolvePrimaryTwin(args.human_entity_id))?.twin.entity_id;
  if (!twin) return { ok: false, code: "TWIN_REQUIRED" };

  details.twin_work = {
    ...prevTwin,
    state: "COLLAB_REQUESTED",
    collab_summary: args.safe_summary.slice(0, 400),
    collab_at: new Date().toISOString(),
  };
  await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: args.ledger_entry_id },
    data: {
      status: "NEEDS_PARTICIPANT_CONFIRMATION",
      next_action: "Collaboration requested — human review",
      details: details as object,
    },
  });

  await notifyHuman({
    org_entity_id: args.org_entity_id,
    human_entity_id: args.human_entity_id,
    twin_entity_id: twin,
    notification_class: TWIN_WORK_CLASS.COLLAB,
    body_summary: `Your AI Teammate needs collaboration on: "${existing.entry.title.slice(0, 80)}" — ${args.safe_summary.slice(0, 160)}`,
  });

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
    twin_entity_id: twin,
    notified: true,
  };
}

// WHAT: After extract, open Twin-claimed work items for next_actions + document.
export async function openTwinWorkFromExtract(args: {
  org_entity_id: string;
  human_entity_id: string;
  project_id?: string;
  document_id?: string;
  web_view_link?: string | null;
  next_actions: StructuredFact[];
  document_title?: string;
  accuracy_class?: TwinWorkAccuracyClass;
}): Promise<{ ok: true; claims: TwinWorkClaimResult[] } | { ok: false; code: string }> {
  const claims: TwinWorkClaimResult[] = [];
  const accuracy = args.accuracy_class ?? "STANDARD";

  if (args.document_id) {
    claims.push(
      await claimWorkForTwin({
        org_entity_id: args.org_entity_id,
        human_entity_id: args.human_entity_id,
        title:
          args.document_title ??
          "Prepare and maintain project document from communications",
        summary:
          "Document work claimed by your AI Teammate after extracting clarity from communications.",
        project_id: args.project_id,
        document_id: args.document_id,
        web_view_link: args.web_view_link,
        work_kind: "DOCUMENT",
        accuracy_class: accuracy,
        next_action: "Twin drafting/maintaining doc; human notified",
      }),
    );
  } else if (args.document_title) {
    // Communication chose an artifact without a live provider rail yet
    // (e.g. slides). Twin still claims so human is not double-working.
    claims.push(
      await claimWorkForTwin({
        org_entity_id: args.org_entity_id,
        human_entity_id: args.human_entity_id,
        title: args.document_title.slice(0, 200),
        summary:
          "Work product chosen from communication context. Provider materialization pending; your AI Teammate owns preparation.",
        project_id: args.project_id,
        work_kind: "DOCUMENT",
        accuracy_class: accuracy,
        next_action: "Twin preparing; provider rail may follow",
      }),
    );
  }

  for (const a of args.next_actions.slice(0, 8)) {
    claims.push(
      await claimWorkForTwin({
        org_entity_id: args.org_entity_id,
        human_entity_id: args.human_entity_id,
        title: a.text.slice(0, 200),
        summary: `Extracted action (${a.status}). Twin claimed to avoid duplicate human effort.`,
        project_id: args.project_id,
        work_kind: "TASK",
        accuracy_class: accuracy,
        next_action: a.owner_label
          ? `Coordinate with ${a.owner_label}`
          : "Twin executing",
      }),
    );
  }

  return { ok: true, claims };
}
