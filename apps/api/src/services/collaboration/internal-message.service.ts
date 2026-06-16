// FILE: internal-message.service.ts
// PURPOSE: Phase 1284 Wave 2 — human-authority direct internal messaging.
//          A HUMAN sending a LOW-risk internal Otzar-inbox note to an org
//          member, after confirming, delivers directly under the sender's
//          OWN authority. This is NOT an AI-Twin autonomous action and does
//          NOT go through the AI-Twin dual-control ladder (ADR-0057) — that
//          ladder still governs AI-initiated, external, sensitive, and
//          higher-risk actions. This is also NOT a Foundation bypass: it
//          delivers through the governed NotificationService
//          (createInternalNotification enforces RULE 0 cross-org DENY +
//          recipient-active + audit) and records durable Work Ledger proof.
// CONNECTS TO: collaboration/target-resolver.service.ts (resolve recipient),
//          notification/notification.service.ts (governed delivery),
//          work-os/work-ledger.service.ts (durable proof), work-os-ledger
//          routes (POST /work-os/internal-messages).
//
// GATING PRESERVED:
//   - Only a HUMAN (PERSON) sender uses this direct path. An AI_AGENT caller
//     is GATED here (must use the governed Action path).
//   - Internal Otzar inbox channel ONLY. No Slack/email/calendar/external.
//   - Recipient must resolve to an in-org member (tenant isolation).

import { prisma } from "@niov/database";
import {
  resolveCollaborationTarget,
  isUuid,
  type GovernedTarget,
} from "./target-resolver.service.js";
import { createLedgerEntry } from "../work-os/work-ledger.service.js";
import {
  resolveEntityNames,
  nameFrom,
  UNRESOLVED_ENTITY_LABEL,
} from "../identity/resolve-entities.js";
import type { NotificationService } from "../notification/notification.service.js";

const BODY_MAX = 2000;

export interface DeliverInternalMessageInput {
  orgEntityId: string;
  senderEntityId: string;
  /** A name ("David") or a UUID. Resolved through the general resolver. */
  recipientRef: string;
  message: string;
  notificationService: NotificationService;
}

export type InternalMessageResult =
  | {
      ok: true;
      status: "DELIVERED";
      notification_id: string;
      ledger_entry_id: string | null;
      recipient_entity_id: string;
      recipient_display_name: string;
      sender_display_name: string;
    }
  // The recipient could not be resolved to a single in-org member. The
  // governed target carries human-readable copy + candidates for the UI.
  | { ok: false; status: "NEEDS_RESOLUTION"; resolution: GovernedTarget }
  // Direct delivery is not allowed for this sender/channel — must go through
  // the governed (gated) path instead. Never a silent failure.
  | { ok: false; status: "GATED"; reason: string }
  | { ok: false; status: "BLOCKED"; reason: string };

// WHAT: Deliver a human-authored internal note to an org member.
// OUTPUT: DELIVERED (with notification + ledger proof) / NEEDS_RESOLUTION /
//         GATED / BLOCKED — never a dead state, never throws to the route.
// WHY: Phase 1284 Wave 2 / Option 1 — Foundation recognizing the difference
//      between human-authorized internal communication and AI autonomy.
export async function deliverHumanInternalMessage(
  input: DeliverInternalMessageInput,
): Promise<InternalMessageResult> {
  const message = (input.message ?? "").trim();
  if (message.length === 0) {
    return { ok: false, status: "BLOCKED", reason: "Message body is empty." };
  }

  // Resolve the recipient through the ONE general governed resolver.
  const resolution = await resolveCollaborationTarget(input.orgEntityId, input.recipientRef);
  if (resolution.kind !== "RESOLVED" || resolution.target_entity_id === null) {
    return { ok: false, status: "NEEDS_RESOLUTION", resolution };
  }
  // Internal notes are person-to-person inbox messages. Team/project/
  // broadcast fan-out is a later wave.
  if (resolution.target_type !== "PERSON" && resolution.target_type !== "AI_TWIN") {
    return {
      ok: false,
      status: "GATED",
      reason: `Direct internal notes support a person recipient; ${resolution.target_type} routing is not enabled yet.`,
    };
  }

  // Human authority: only a PERSON sends directly. An AI_AGENT sender must
  // use the governed Action ladder (gating preserved).
  const sender = await prisma.entity.findUnique({
    where: { entity_id: input.senderEntityId },
    select: { entity_type: true, display_name: true },
  });
  if (sender === null) {
    return { ok: false, status: "BLOCKED", reason: "Sender not found." };
  }
  if (sender.entity_type !== "PERSON") {
    return {
      ok: false,
      status: "GATED",
      reason: "AI-initiated sends are gated and require the governed approval path.",
    };
  }

  // Deliver through the GOVERNED notification service (RULE 0 cross-org DENY
  // + recipient-active + audit happen inside).
  const delivery = await input.notificationService.createInternalNotification({
    org_entity_id: input.orgEntityId,
    recipient_entity_id: resolution.target_entity_id,
    source_entity_id: input.senderEntityId,
    notification_class: "DIRECT_MESSAGE",
    body_summary: message.slice(0, BODY_MAX),
  });
  if (delivery.ok === false) {
    return { ok: false, status: "BLOCKED", reason: humanizeDeliveryFailure(delivery.code) };
  }

  // Durable Work Ledger proof of the routed, delivered note.
  let ledgerId: string | null = null;
  const ledger = await createLedgerEntry({
    org_entity_id: input.orgEntityId,
    ledger_type: "NOTIFICATION",
    source_type: "CHAT",
    source_command: message.slice(0, BODY_MAX),
    title: `Internal note to ${resolution.display_name ?? UNRESOLVED_ENTITY_LABEL}`,
    summary: message.slice(0, 200),
    requester_entity_id: input.senderEntityId,
    owner_entity_id: input.senderEntityId,
    target_entity_id: resolution.target_entity_id,
    status: "EXECUTED",
    priority: "ROUTINE",
    notification_id: delivery.notification.notification_id,
    next_action: "Awaiting recipient response",
    // Phase 1285 slice 3 — run the existing advisory extractor on the message
    // body so the thread/cockpit can surface a POSSIBLE work signal (task /
    // blocker / decision / commitment / follow-up). Advisory only: this
    // annotates the message-derived ledger row; it does NOT auto-create a
    // task. Foundation/user decides whether it becomes durable work.
    enable_python_enrichment: true,
    enrichment_text: message.slice(0, BODY_MAX),
  });
  if (ledger.ok) ledgerId = ledger.entry.ledger_entry_id;

  return {
    ok: true,
    status: "DELIVERED",
    notification_id: delivery.notification.notification_id,
    ledger_entry_id: ledgerId,
    recipient_entity_id: resolution.target_entity_id,
    recipient_display_name: resolution.display_name ?? UNRESOLVED_ENTITY_LABEL,
    sender_display_name: sender.display_name ?? "you",
  };
}

// WHAT: Map a notification-service failure code to safe, human-readable copy.
function humanizeDeliveryFailure(code: string): string {
  switch (code) {
    case "CROSS_ORG_DENIED":
      return "That recipient is outside your organization.";
    case "RECIPIENT_NOT_FOUND":
      return "That recipient could not be found.";
    case "RECIPIENT_NOT_ACTIVE":
      return "That recipient's account is not active.";
    case "RECIPIENT_NOT_PERSON":
      return "Internal notes can only be delivered to a person.";
    default:
      return "The note could not be delivered.";
  }
}

// ── Direct-message threads (Phase 1284 Wave 2) ───────────────────────────
// A persistent person-to-person thread is DERIVED from the durable
// WorkLedgerEntry NOTIFICATION rows already written for every internal
// message (no new model/migration). Both participants can read it because
// the ledger rows have requester=sender + target=recipient, and each
// participant is requester on the messages they sent and target on the ones
// they received. Tenant-scoped; only the two participants' rows are returned.

// Phase 1285 slice 3 — a POSSIBLE work signal advisorily detected on the
// message body. Never auto-promoted to a task; the UI surfaces it as a
// "possible" item the user can confirm into the Work Ledger.
export interface ThreadMessageSignal {
  signal_type: string; // TASK | DELEGATION | BLOCKER | DECISION | COMMITMENT | FOLLOW_UP | APPROVAL_NEEDED
  confidence: string; // HIGH | MEDIUM | LOW
  evidence_phrase: string;
  // Phase 1285-C — true when this message has ALREADY been tracked into the
  // Work Ledger (a derived directional entry exists for it). Lets the chip
  // render an "Already tracked" terminal state across reloads instead of
  // re-offering "Add to Work Ledger" (and the backend track call is idempotent).
  tracked?: boolean;
}

export interface ThreadMessageView {
  message_id: string;
  sender_entity_id: string;
  sender_display_name: string;
  sender_role_title: string | null;
  body: string;
  created_at: string;
  from_me: boolean;
  // Present only when an advisory work signal was detected on this message.
  signal?: ThreadMessageSignal;
}

// Map the advisory extractor's raw vocab to the Phase 1285 signal taxonomy.
// Only work-ish signals map; casual/none are left out (no clutter).
const RAW_TO_TAXONOMY: Record<string, string> = {
  TASK: "TASK_REQUEST",
  DELEGATION: "TASK_REQUEST",
  BLOCKER: "BLOCKER",
  DECISION: "DECISION",
  COMMITMENT: "COMMITMENT",
  FOLLOW_UP: "FOLLOW_UP",
  APPROVAL_NEEDED: "APPROVAL_LIKE",
};

// WHAT: derive the POSSIBLE work signal for a message from its ledger row's
//        details.python_enrichment (advisory) + a deterministic QUESTION
//        fallback. Returns undefined for casual/STATUS/NONE (no clutter).
// WHY: conservative — only surfaces a "possible" signal; never auto-promotes.
function signalForMessage(details: unknown, body: string): ThreadMessageSignal | undefined {
  let pythonEnriched = false;
  if (typeof details === "object" && details !== null) {
    const pe = (details as Record<string, unknown>).python_enrichment;
    if (typeof pe === "object" && pe !== null) {
      const o = pe as Record<string, unknown>;
      if (o.status === "PYTHON_ENRICHED") {
        pythonEnriched = true;
        const primary = typeof o.primary_signal === "string" ? o.primary_signal : null;
        const taxonomy = primary !== null ? RAW_TO_TAXONOMY[primary] : undefined;
        if (taxonomy !== undefined) {
          const signals = Array.isArray(o.signals) ? o.signals : [];
          const match = signals.find(
            (s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).signal_type === primary,
          ) as Record<string, unknown> | undefined;
          return {
            signal_type: taxonomy,
            confidence: typeof match?.confidence === "string" ? match.confidence : "LOW",
            evidence_phrase: typeof match?.evidence_phrase === "string" ? match.evidence_phrase : "",
          };
        }
      }
    }
  }
  const b = body.trim();
  // Deterministic QUESTION fallback — real, not faked (body asks something).
  if (/\?\s*$/.test(b)) {
    return { signal_type: "QUESTION", confidence: "LOW", evidence_phrase: "?" };
  }
  // When Python WAS available and surfaced no work signal, respect that
  // judgment — do NOT apply heuristics (avoids noise on casual messages
  // Python already classified as STATUS/NONE).
  if (pythonEnriched) return undefined;
  // Phase 1285-C deterministic fallback — when the advisory Python extractor
  // is unavailable, a conservative LOW-confidence heuristic still surfaces a
  // POSSIBLE signal so the chip → track → waiting-on loop works without it.
  // Most specific first. Never auto-promotes; the user confirms it.
  const low = b.toLowerCase();
  if (/\b(blocked|blocker|stuck on|can'?t proceed|cannot proceed|waiting on|held up)\b/.test(low)) {
    return { signal_type: "BLOCKER", confidence: "LOW", evidence_phrase: "blocked" };
  }
  if (/\b(need(?:s)? a decision|we (?:should|need to) decide|which (?:option|approach|way)|sign[- ]?off|approve or reject)\b/.test(low)) {
    return { signal_type: "DECISION", confidence: "LOW", evidence_phrase: "decision" };
  }
  if (/\b(approve|approval|authori[sz]e|your sign[- ]?off)\b/.test(low)) {
    return { signal_type: "APPROVAL_LIKE", confidence: "LOW", evidence_phrase: "approval" };
  }
  if (
    /\b(please|can you|could you|would you|can i get|could i get|i need|send me|share|review|check|prepare|update|fix|finish|complete|by (?:eod|cob|end of day|today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/.test(
      low,
    )
  ) {
    return { signal_type: "TASK_REQUEST", confidence: "LOW", evidence_phrase: "request" };
  }
  return undefined;
}

export interface DirectThreadView {
  ok: true;
  thread_key: string;
  participants: Array<{ entity_id: string; display_name: string; role_title: string | null }>;
  messages: ThreadMessageView[];
  latest_message_at: string | null;
}

export type DirectThreadResult =
  | DirectThreadView
  | { ok: false; code: "INVALID_TARGET_ID" | "NOT_FOUND" };

// ── Waiting-On Relationships v1 (Phase 1285 slice 4) ─────────────────────
// Confirming a thread signal creates a DIRECTIONAL Work Ledger entry derived
// from the source message row (which already carries requester=sender +
// target=recipient). Direction is set on the BACKEND because the frontend
// does not hold the caller's entity_id. The resulting entry surfaces as
// "waiting on <owner>" for the requester and a pending ask for the owner.

const TRACKABLE_LEDGER_TYPES = new Set([
  "TASK", "FOLLOW_UP", "APPROVAL", "BLOCKER", "DECISION",
]);
// Active (not-done) statuses for waiting-on derivation.
const WAITING_ACTIVE_NOT_IN = ["CANCELLED", "EXPIRED", "VERIFIED", "EXECUTED"];

export type TrackSignalResult =
  | { ok: true; ledger_entry_id: string }
  | { ok: false; code: "INVALID_REQUEST" | "NOT_FOUND" };

// WHAT: Promote a confirmed thread signal into a directional Work Ledger entry,
//        linked to the source message. Caller must be a participant of the
//        source message (tenant + participant scoped).
export async function trackThreadSignalAsWork(
  orgEntityId: string,
  callerEntityId: string,
  sourceMessageId: string,
  ledgerType: string,
): Promise<TrackSignalResult> {
  if (!TRACKABLE_LEDGER_TYPES.has(ledgerType)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (!isUuid(sourceMessageId)) return { ok: false, code: "INVALID_REQUEST" };
  const src = await prisma.workLedgerEntry.findFirst({
    where: { ledger_entry_id: sourceMessageId, org_entity_id: orgEntityId, ledger_type: "NOTIFICATION" },
    select: {
      requester_entity_id: true,
      target_entity_id: true,
      source_command: true,
      conversation_id: true,
    },
  });
  if (src === null) return { ok: false, code: "NOT_FOUND" };
  const sender = src.requester_entity_id;
  const recipient = src.target_entity_id;
  // Participant gate (RULE 0): only the two people on the message can track it.
  if (callerEntityId !== sender && callerEntityId !== recipient) {
    return { ok: false, code: "NOT_FOUND" };
  }
  if (sender === null || recipient === null) return { ok: false, code: "INVALID_REQUEST" };

  // Idempotency (Phase 1285-C): if this source message was already tracked as
  // this ledger type, return the existing entry. Clicking "Add to Work Ledger"
  // twice (or from both participants' chips) never creates a duplicate.
  const existing = await prisma.workLedgerEntry.findFirst({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: ledgerType,
      details: { path: ["source_message_id"], equals: sourceMessageId },
    },
    select: { ledger_entry_id: true },
  });
  if (existing !== null) return { ok: true, ledger_entry_id: existing.ledger_entry_id };

  // Direction: a request/follow-up/approval is OWNED by the recipient (the
  // doer) and REQUESTED by the sender. A blocker/decision is owned by whoever
  // raised it (the sender).
  const ownedByRecipient = ledgerType === "TASK" || ledgerType === "FOLLOW_UP" || ledgerType === "APPROVAL";
  const owner = ownedByRecipient ? recipient : sender;
  const body = (src.source_command ?? "").slice(0, 2000);

  const created = await createLedgerEntry({
    org_entity_id: orgEntityId,
    ledger_type: ledgerType,
    source_type: "CHAT",
    source_command: body,
    title: body.slice(0, 60),
    summary: body.slice(0, 200),
    requester_entity_id: sender,
    owner_entity_id: owner,
    target_entity_id: recipient,
    status: "PROPOSED",
    priority: "ROUTINE",
    ...(src.conversation_id !== null ? { conversation_id: src.conversation_id } : {}),
    // Direction (requester/owner) is derived from the SOURCE message, never
    // from the actor. tracked_by records who confirmed the signal (may be
    // either participant) for audit — it must not flip requester/owner.
    details: {
      derived_from: "thread_signal",
      source_message_id: sourceMessageId,
      tracked_by: callerEntityId,
    },
  });
  if (created.ok === false) return { ok: false, code: "INVALID_REQUEST" };
  return { ok: true, ledger_entry_id: created.entry.ledger_entry_id };
}

export interface WaitingOnItem {
  ledger_entry_id: string;
  ledger_type: string;
  title: string;
  status: string;
  requester_entity_id: string | null;
  owner_entity_id: string | null;
  due_at: string | null;
  source_message_id: string | null;
}

export interface WaitingOnView {
  ok: true;
  // Work the caller is waiting on FROM the other party (caller requested, other owns).
  waiting_on_them: WaitingOnItem[];
  // Work the other party is waiting on FROM the caller (other requested, caller owns).
  pending_from_them: WaitingOnItem[];
}

// WHAT: Derive the waiting-on relationship between the caller and another
//        org member from durable Work Ledger entries (never faked).
export async function getWaitingOnWith(
  orgEntityId: string,
  callerEntityId: string,
  otherRef: string,
): Promise<WaitingOnView | { ok: false; code: "INVALID_TARGET_ID" }> {
  let otherId: string | null = isUuid(otherRef) ? otherRef : null;
  if (otherId === null) {
    const r = await resolveCollaborationTarget(orgEntityId, otherRef);
    if (r.kind === "RESOLVED" && r.target_entity_id !== null) otherId = r.target_entity_id;
  }
  if (otherId === null) return { ok: false, code: "INVALID_TARGET_ID" };

  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: { in: [...TRACKABLE_LEDGER_TYPES] },
      status: { notIn: WAITING_ACTIVE_NOT_IN },
      OR: [
        { requester_entity_id: callerEntityId, owner_entity_id: otherId },
        { requester_entity_id: otherId, owner_entity_id: callerEntityId },
      ],
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: {
      ledger_entry_id: true, ledger_type: true, title: true, status: true,
      requester_entity_id: true, owner_entity_id: true, due_at: true, details: true,
    },
  });
  const project = (r: (typeof rows)[number]): WaitingOnItem => ({
    ledger_entry_id: r.ledger_entry_id,
    ledger_type: r.ledger_type,
    title: r.title,
    status: r.status,
    requester_entity_id: r.requester_entity_id,
    owner_entity_id: r.owner_entity_id,
    due_at: r.due_at !== null ? r.due_at.toISOString() : null,
    source_message_id:
      typeof r.details === "object" && r.details !== null
        ? ((r.details as Record<string, unknown>).source_message_id as string | undefined) ?? null
        : null,
  });
  return {
    ok: true,
    waiting_on_them: rows
      .filter((r) => r.requester_entity_id === callerEntityId && r.owner_entity_id === otherId)
      .map(project),
    pending_from_them: rows
      .filter((r) => r.requester_entity_id === otherId && r.owner_entity_id === callerEntityId)
      .map(project),
  };
}

// ── Relationship work graph (Phase 1285-M) ───────────────────────────────────
// Durable answers to "what did David complete / what blockers involve David /
// what decisions did David and I make / what does David owe me / what is David
// waiting on me for" — all from the Work Ledger, pair-scoped + tenant-isolated.

const RELATIONSHIP_DONE_IN = ["EXECUTED", "VERIFIED"];

export interface RelationshipItem {
  ledger_entry_id: string;
  ledger_type: string;
  title: string;
  status: string;
  requester_entity_id: string | null;
  owner_entity_id: string | null;
  requester_display_name: string;
  owner_display_name: string;
  due_at: string | null;
  updated_at: string;
  source_message_id: string | null;
}

export interface RelationshipWorkView {
  ok: true;
  other_display_name: string;
  // caller requested, other owns, active.
  waiting_on_them: RelationshipItem[];
  // other requested, caller owns, active.
  pending_from_them: RelationshipItem[];
  // done items (EXECUTED/VERIFIED), either direction.
  completed: RelationshipItem[];
  // BLOCKER entries, either direction, active.
  blockers: RelationshipItem[];
  // DECISION entries, either direction.
  decisions: RelationshipItem[];
}

// WHAT: the full directional work graph between the caller and one other org
//        member, from durable Work Ledger entries. Participant + tenant scoped;
//        identity via the single resolver (never a raw UUID).
export async function getRelationshipWork(
  orgEntityId: string,
  callerEntityId: string,
  otherRef: string,
): Promise<RelationshipWorkView | { ok: false; code: "INVALID_TARGET_ID" }> {
  let otherId: string | null = isUuid(otherRef) ? otherRef : null;
  if (otherId === null) {
    const r = await resolveCollaborationTarget(orgEntityId, otherRef);
    if (r.kind === "RESOLVED" && r.target_entity_id !== null) otherId = r.target_entity_id;
  }
  if (otherId === null) return { ok: false, code: "INVALID_TARGET_ID" };

  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: { in: [...TRACKABLE_LEDGER_TYPES] },
      // BOTH parties must be involved (via requester / owner / target). This
      // captures TASK/FOLLOW_UP (requester↔owner) AND BLOCKER/DECISION (owned by
      // the raiser, with the other party as target).
      AND: [
        {
          OR: [
            { requester_entity_id: callerEntityId },
            { owner_entity_id: callerEntityId },
            { target_entity_id: callerEntityId },
          ],
        },
        {
          OR: [
            { requester_entity_id: otherId },
            { owner_entity_id: otherId },
            { target_entity_id: otherId },
          ],
        },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 200,
    select: {
      ledger_entry_id: true, ledger_type: true, title: true, status: true,
      requester_entity_id: true, owner_entity_id: true, due_at: true, updated_at: true, details: true,
    },
  });
  const names = await resolveEntityNames([callerEntityId, otherId]);
  const project = (r: (typeof rows)[number]): RelationshipItem => ({
    ledger_entry_id: r.ledger_entry_id,
    ledger_type: r.ledger_type,
    title: r.title,
    status: r.status,
    requester_entity_id: r.requester_entity_id,
    owner_entity_id: r.owner_entity_id,
    requester_display_name: nameFrom(names, r.requester_entity_id),
    owner_display_name: nameFrom(names, r.owner_entity_id),
    due_at: r.due_at !== null ? r.due_at.toISOString() : null,
    updated_at: r.updated_at.toISOString(),
    source_message_id:
      typeof r.details === "object" && r.details !== null
        ? ((r.details as Record<string, unknown>).source_message_id as string | undefined) ?? null
        : null,
  });
  const isActive = (s: string): boolean => !WAITING_ACTIVE_NOT_IN.includes(s);
  const items = rows.map(project);
  return {
    ok: true,
    other_display_name: nameFrom(names, otherId),
    waiting_on_them: items.filter(
      (r) => isActive(r.status) && r.requester_entity_id === callerEntityId && r.owner_entity_id === otherId,
    ),
    pending_from_them: items.filter(
      (r) => isActive(r.status) && r.requester_entity_id === otherId && r.owner_entity_id === callerEntityId,
    ),
    completed: items.filter((r) => RELATIONSHIP_DONE_IN.includes(r.status)),
    blockers: items.filter((r) => r.ledger_type === "BLOCKER" && isActive(r.status)),
    decisions: items.filter((r) => r.ledger_type === "DECISION"),
  };
}

// WHAT: Deterministic thread key for a direct person-to-person thread.
function directThreadKey(orgEntityId: string, a: string, b: string): string {
  const pair = [a, b].sort().join("+");
  return `${orgEntityId}:DIRECT_PERSON:${pair}`;
}

// WHAT: Load the caller's direct-message thread with another org member.
// OUTPUT: the full ordered exchange (both directions), or a clean failure.
// WHY: messages between the same two people thread together instead of
//      becoming scattered one-off notifications (Phase 1284 Wave 2).
export async function getDirectMessageThread(
  orgEntityId: string,
  callerEntityId: string,
  otherRef: string,
): Promise<DirectThreadResult> {
  // Resolve the other participant (accepts a UUID or a name).
  let otherId: string | null = null;
  if (isUuid(otherRef)) {
    otherId = otherRef;
  } else {
    const r = await resolveCollaborationTarget(orgEntityId, otherRef);
    if (r.kind === "RESOLVED" && r.target_entity_id !== null) otherId = r.target_entity_id;
  }
  if (otherId === null) return { ok: false, code: "INVALID_TARGET_ID" };

  // Both directions of the pair, internal-note ledger rows only, tenant-scoped.
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: "NOTIFICATION",
      OR: [
        { requester_entity_id: callerEntityId, target_entity_id: otherId },
        { requester_entity_id: otherId, target_entity_id: callerEntityId },
      ],
    },
    orderBy: { created_at: "asc" },
    take: 200,
    select: {
      ledger_entry_id: true,
      requester_entity_id: true,
      source_command: true,
      summary: true,
      created_at: true,
      details: true,
    },
  });
  if (rows.length === 0) return { ok: false, code: "NOT_FOUND" };

  // Display names for the two participants — via the SINGLE shared resolver
  // (Phase 1285-K), so the thread renders the same canonical "Unknown entity"
  // label as every other surface; role_title stays a membership lookup.
  const ids = [callerEntityId, otherId];
  const [names, memberships] = await Promise.all([
    resolveEntityNames(ids),
    prisma.entityMembership.findMany({
      where: { parent_id: orgEntityId, child_id: { in: ids }, is_active: true },
      select: { child_id: true, role_title: true },
    }),
  ]);
  const roleOf = new Map(memberships.map((m) => [m.child_id, m.role_title]));

  // Phase 1285-C — which of these messages have ALREADY been tracked into the
  // Work Ledger (a derived directional entry links back via source_message_id).
  // Lets each message's chip render an "Already tracked" terminal state.
  const trackedSet = new Set<string>();
  const derived = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: orgEntityId,
      ledger_type: { in: [...TRACKABLE_LEDGER_TYPES] },
      details: { path: ["derived_from"], equals: "thread_signal" },
    },
    select: { details: true },
  });
  for (const d of derived) {
    const smid =
      typeof d.details === "object" && d.details !== null
        ? (d.details as Record<string, unknown>).source_message_id
        : undefined;
    if (typeof smid === "string") trackedSet.add(smid);
  }

  const messages: ThreadMessageView[] = rows.map((r) => {
    const sender = r.requester_entity_id ?? "";
    const body = r.source_command ?? r.summary ?? "";
    const signal = signalForMessage(r.details, body);
    const trackedSignal =
      signal !== undefined && trackedSet.has(r.ledger_entry_id)
        ? { ...signal, tracked: true }
        : signal;
    return {
      message_id: r.ledger_entry_id,
      sender_entity_id: sender,
      sender_display_name: nameFrom(names, sender),
      sender_role_title: roleOf.get(sender) ?? null,
      body,
      created_at: r.created_at.toISOString(),
      from_me: sender === callerEntityId,
      ...(trackedSignal !== undefined ? { signal: trackedSignal } : {}),
    };
  });

  return {
    ok: true,
    thread_key: directThreadKey(orgEntityId, callerEntityId, otherId),
    participants: ids.map((id) => ({
      entity_id: id,
      display_name: nameFrom(names, id),
      role_title: roleOf.get(id) ?? null,
    })),
    messages,
    latest_message_at: messages.length > 0 ? messages[messages.length - 1]!.created_at : null,
  };
}
