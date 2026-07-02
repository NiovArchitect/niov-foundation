// FILE: comms-artifacts.service.ts
// PURPOSE: Phase 1285-T — the Comms cockpit "Recent conversation intelligence"
//          feed. A DURABLE PROJECTION over the Work Ledger (the system-of-record
//          for conversation-derived artifacts: follow-ups, decisions, blockers,
//          commitments, captured work, internal-note notifications). No new
//          table, no fake artifacts, no local-only cache. Self-scoped +
//          tenant-isolated, mirroring getMyWork's proven scope. Identity is a
//          canonical display label, never a raw UUID as the primary label.
// CONNECTS TO: apps/api/src/routes/work-os-ledger.routes.ts (the
//          /work-os/comms/recent-artifacts route); resolve-entities.ts
//          (canonical names); packages/database (prisma);
//          tests/unit/comms-artifacts.test.ts.

import { prisma, writeAuditEvent } from "@niov/database";
import type { WorkLedgerEntry } from "@prisma/client";
import { resolveEntityNames, type ResolvedName } from "../identity/resolve-entities.js";
import {
  meetingIntelligenceFromDetails,
  type MeetingIntelligenceProjection,
} from "./work-ledger.service.js";
import type { CommsSuggestedAction } from "../otzar/comms-extract.service.js";

export type CommsArtifactType =
  | "DIRECT_MESSAGE"
  | "THREAD_REPLY"
  | "WORK_CAPTURE"
  | "FOLLOW_UP"
  | "DECISION"
  | "BLOCKER"
  | "MEETING_CAPTURE"
  | "ACTION_PROPOSAL"
  | "NOTIFICATION";

export interface CommsArtifactEntity {
  entity_id: string | null;
  display_name: string;
  unresolved: boolean;
}

export interface RecentCommsArtifact {
  artifact_id: string;
  artifact_type: CommsArtifactType;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  scope: "personal";
  related_person: CommsArtifactEntity | null;
  source: {
    source_system: "work_ledger";
    source_message_id: string | null;
    ledger_entry_id: string;
  };
  destination: {
    kind: "work" | "thread" | "notification" | "none";
    route: string | null;
  };
  // Phase 1286-C — the SAFE advisory meeting-intelligence projection (Phase
  // 1285-V), present ONLY when the underlying ledger row carries it. Read-only;
  // never the raw transcript or chain-of-thought. Absent on non-meeting rows.
  meeting_intelligence?: MeetingIntelligenceProjection;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
// Done/dead statuses are not "recent intelligence to act on" — exclude.
const DONE_STATUSES = ["CANCELLED", "EXPIRED"];

// WHAT: map a Work Ledger entry's ledger_type to a Comms artifact type.
// WHY: the cockpit advertises follow-ups / decisions / blockers / commitments /
//      captured work; everything else durable collapses to WORK_CAPTURE. No
//      type is invented.
function artifactTypeFor(ledgerType: string): CommsArtifactType {
  switch (ledgerType) {
    case "FOLLOW_UP":
      return "FOLLOW_UP";
    case "DECISION":
      return "DECISION";
    case "BLOCKER":
      return "BLOCKER";
    case "NOTIFICATION":
      return "NOTIFICATION";
    default:
      return "WORK_CAPTURE"; // TASK / APPROVAL / COMMITMENT / MEETING / etc.
  }
}

function sourceMessageIdOf(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const v = (details as Record<string, unknown>).source_message_id;
  return typeof v === "string" && v.length > 0 ? v : null;
}

function canonical(
  names: Map<string, ResolvedName>,
  id: string | null,
): CommsArtifactEntity | null {
  if (id === null) return null;
  const r = names.get(id);
  if (r === undefined) return { entity_id: id, display_name: "Unknown entity", unresolved: true };
  return { entity_id: id, display_name: r.display_name, unresolved: r.unresolved };
}

// WHAT: recent conversation-derived artifacts for the caller.
// INPUT: org + caller (+ optional limit).
// OUTPUT: RecentCommsArtifact[] ordered by most-recent activity.
// WHY: powers the Comms cockpit recent list from durable records only. Scope
//      mirrors getMyWork (caller owns/requested/targeted; tenant-isolated).
export async function getRecentCommsArtifacts(args: {
  org_entity_id: string;
  caller_entity_id: string;
  limit?: number;
}): Promise<RecentCommsArtifact[]> {
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      OR: [
        { owner_entity_id: args.caller_entity_id },
        { target_entity_id: args.caller_entity_id },
        { requester_entity_id: args.caller_entity_id },
      ],
      NOT: { status: { in: DONE_STATUSES } },
    },
    orderBy: { updated_at: "desc" }, // most-recent activity first
    take: limit,
  });

  const names = await resolveEntityNames(
    rows.flatMap((r) => [r.owner_entity_id, r.requester_entity_id, r.target_entity_id]),
  );

  return rows.map((r: WorkLedgerEntry) => {
    // related_person = the counterpart relative to the caller (the other side
    // of the conversation/work), never the caller themselves.
    const counterpartId =
      r.requester_entity_id === args.caller_entity_id
        ? (r.owner_entity_id ?? r.target_entity_id)
        : (r.requester_entity_id ?? r.owner_entity_id ?? r.target_entity_id);
    const relatedId = counterpartId === args.caller_entity_id ? null : counterpartId;
    const sourceMessageId = sourceMessageIdOf(r.details);
    const meetingIntelligence = meetingIntelligenceFromDetails(r.details);
    return {
      artifact_id: r.ledger_entry_id,
      artifact_type: artifactTypeFor(r.ledger_type),
      title: r.title,
      summary: r.summary ?? r.next_action ?? null,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      status: r.status,
      scope: "personal" as const,
      related_person: canonical(names, relatedId),
      source: {
        source_system: "work_ledger" as const,
        source_message_id: sourceMessageId,
        ledger_entry_id: r.ledger_entry_id,
      },
      // Every artifact resolves to a real, navigable destination (the durable
      // Work surface). No dead links, no fabricated routes.
      destination: { kind: "work" as const, route: "/app/my-work" },
      // Present only when the row genuinely carries meeting intelligence; absent
      // (field omitted) otherwise — never faked.
      ...(meetingIntelligence !== undefined ? { meeting_intelligence: meetingIntelligence } : {}),
    };
  });
}

// ── [PROD-UX-BUGB] Pending follow-up drafts (the resumable Comms send-cards) ──
// Statuses that mean a follow-up is no longer pending action.
const FOLLOWUP_DONE_STATUSES = ["EXECUTED", "VERIFIED", "CANCELLED", "EXPIRED"];

export interface PendingFollowUp {
  /** The durable ledger row backing this card (also the PATCH target on send/dismiss). */
  ledger_entry_id: string;
  /** The source conversation (MeetingCapture) this draft was derived from. */
  meeting_capture_id: string | null;
  /** The ledger title (e.g. "Follow-up to Shiney") — a human label, never a UUID. */
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  /** The pre-governed send-card, stored verbatim at ingest so the CT re-renders
   *  the SAME ProposedActionCard (draft_text + recipient_governance + autonomy). */
  action: CommsSuggestedAction;
}

// WHAT: read the caller's own drafted follow-ups back as durable send-cards.
// WHY: the Comms follow-up cards previously lived only in the CT's volatile
//      ingest response, so they vanished on navigation (BUG B). This projects
//      the FOLLOW_UP ledger rows written at ingest — the single store — so the
//      cards survive navigation/refresh. Scoped to the caller (they own +
//      requested the row) and tenant-isolated. Never fabricates a card: a row
//      missing its details.follow_up payload is skipped, not invented.
export async function getPendingFollowUps(args: {
  org_entity_id: string;
  caller_entity_id: string;
  limit?: number;
}): Promise<PendingFollowUp[]> {
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const rows = await prisma.workLedgerEntry.findMany({
    where: {
      org_entity_id: args.org_entity_id,
      ledger_type: "FOLLOW_UP",
      owner_entity_id: args.caller_entity_id,
      NOT: { status: { in: FOLLOWUP_DONE_STATUSES } },
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });
  const out: PendingFollowUp[] = [];
  for (const r of rows) {
    const action = followUpActionFromDetails(r.details);
    if (action === null) continue; // never fabricate a card from a payload-less row
    out.push({
      ledger_entry_id: r.ledger_entry_id,
      meeting_capture_id: r.conversation_id,
      title: r.title,
      status: r.status,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      action,
    });
  }
  return out;
}

function followUpActionFromDetails(details: unknown): CommsSuggestedAction | null {
  if (typeof details !== "object" || details === null) return null;
  const v = (details as Record<string, unknown>).follow_up;
  if (typeof v !== "object" || v === null) return null;
  // Minimal shape guard: the stored card must at least carry a draft + a target.
  const c = v as Partial<CommsSuggestedAction>;
  if (typeof c.draft_text !== "string" || typeof c.local_id !== "string") return null;
  return v as CommsSuggestedAction;
}

// ── [PROD-UX-BUGC] Outside-context recipient review completion ───────────────
// The caller completes a blocked recipient review on their own durable
// FOLLOW_UP row: CONFIRM a knowledge-gap verdict (out_of_scope / likely — Otzar
// couldn't prove the connection, the human can vouch), or SELECT the correct
// person when the name was ambiguous. Policy boundaries are NOT overridable:
// unauthorized and cross_team_needs_approval reject with honest copy — a sender
// can never self-approve past an authorization gate. The decision mutates
// details.follow_up.recipient_governance on the SAME WorkLedger row (single
// store, so it survives navigation/refresh) and is audited. The proof source
// becomes "caller_confirmed" — a human vouching, never disguised as an
// Otzar-verified path. NOTE: the advisory `autonomy` verdict is left as
// computed at ingest (its decision-rights inputs are not stored); the Send
// gate keys off recipient_governance, which IS updated.
// Correction-memory (learn-loop): classifyRecipient accepts aliases/
// excludeEntityIds but the comms-ingest path does not load corrections yet, so
// no correction row is written here — TODO(learn-loop): when corrections are
// wired into ingest, a confirm/select should also persist an
// OrgRecipientCorrection so future extractions improve.

export type ResolveRecipientFailureCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "MISSING_PAYLOAD"
  | "ALREADY_CONFIRMED"
  | "POLICY_DENIES"
  | "APPROVAL_REQUIRED";

export type ResolveRecipientResult =
  | { ok: true; follow_up: PendingFollowUp; audit_event_id: string }
  | { ok: false; code: ResolveRecipientFailureCode; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveFollowUpRecipient(args: {
  org_entity_id: string;
  caller_entity_id: string;
  ledger_entry_id: string;
  decision: "confirm" | "select";
  recipient_entity_id?: string;
}): Promise<ResolveRecipientResult> {
  // 1) The row: caller-owned, org-scoped, FOLLOW_UP, still pending.
  const row = await prisma.workLedgerEntry.findFirst({
    where: {
      ledger_entry_id: args.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      ledger_type: "FOLLOW_UP",
    },
  });
  if (row === null) {
    return { ok: false, code: "NOT_FOUND", message: "That follow-up doesn't exist." };
  }
  if (row.owner_entity_id !== args.caller_entity_id) {
    return { ok: false, code: "FORBIDDEN", message: "Only the person who owns this follow-up can review its recipient." };
  }
  if (FOLLOWUP_DONE_STATUSES.includes(row.status)) {
    return { ok: false, code: "INVALID_REQUEST", message: "This follow-up was already sent or dismissed." };
  }
  const action = followUpActionFromDetails(row.details);
  if (action === null) {
    return { ok: false, code: "MISSING_PAYLOAD", message: "This follow-up doesn't carry a reviewable draft." };
  }

  // 2) The governance verdict decides what the caller may complete.
  const safety = action.recipient_governance.recipientSafety;
  if (safety === "confirmed") {
    return { ok: false, code: "ALREADY_CONFIRMED", message: "This recipient is already confirmed." };
  }
  if (safety === "unauthorized") {
    // An authorization boundary — the sender can never vouch past policy.
    return { ok: false, code: "POLICY_DENIES", message: "Your organization's policy doesn't permit sending this to that person. This isn't something you can override — ask an admin if you believe the policy is wrong." };
  }
  if (safety === "cross_team_needs_approval") {
    // An approval boundary — completion belongs to an approver, not the sender.
    return { ok: false, code: "APPROVAL_REQUIRED", message: "This route needs an approver's sign-off before it can send. If your organization hasn't configured an approver yet, ask an admin to set one up." };
  }

  let updatedTarget = action.target;
  let auditTargetId: string | null = action.target.entity_id;

  if (args.decision === "confirm") {
    // Confirm = the caller vouches for the ALREADY-resolved person on a
    // knowledge-gap verdict (out_of_scope / likely). An ambiguous name can't be
    // "confirmed" — the ambiguity must be resolved by choosing a person.
    if (safety === "ambiguous") {
      return { ok: false, code: "INVALID_REQUEST", message: "More than one person matches this name — choose the right recipient instead of confirming." };
    }
    if (action.target.entity_id === null) {
      return { ok: false, code: "INVALID_REQUEST", message: "There's no specific person on this draft yet — choose a recipient first." };
    }
  } else {
    // Select = resolve an ambiguous name to a specific org member.
    if (safety !== "ambiguous") {
      return { ok: false, code: "INVALID_REQUEST", message: "This recipient isn't ambiguous — confirm them instead of choosing." };
    }
    const rid = args.recipient_entity_id;
    if (rid === undefined || !UUID_RE.test(rid)) {
      return { ok: false, code: "INVALID_REQUEST", message: "Choose which person this follow-up is for." };
    }
    // The selected person must be a real, active member of THIS org.
    const membership = await prisma.entityMembership.findFirst({
      where: { parent_id: args.org_entity_id, child_id: rid, is_active: true },
    });
    if (membership === null) {
      return { ok: false, code: "INVALID_REQUEST", message: "That person isn't an active member of your organization." };
    }
    const person = await prisma.entity.findFirst({
      where: { entity_id: rid, entity_type: "PERSON" },
      select: { entity_id: true, display_name: true, email: true },
    });
    if (person === null) {
      return { ok: false, code: "INVALID_REQUEST", message: "That person isn't an active member of your organization." };
    }
    updatedTarget = {
      ...action.target,
      entity_id: person.entity_id,
      display_name: person.display_name,
      email: person.email,
    };
    auditTargetId = person.entity_id;
  }

  // 3) The durable decision: caller_confirmed proof source on the SAME row.
  //    alternativeCandidates are kept for provenance (what the options were).
  const updatedAction: CommsSuggestedAction = {
    ...action,
    target: updatedTarget,
    resolution_status: "RESOLVED",
    recipient_governance: {
      ...action.recipient_governance,
      ...(args.decision === "select"
        ? {
            entity_id: updatedTarget.entity_id,
            display_name: updatedTarget.display_name,
            email: updatedTarget.email,
          }
        : {}),
      recipientSafety: "confirmed",
      // A human vouching earns a human review path, never auto-eligibility.
      autonomyEligibility: "draft_only",
      evidence: {
        ...action.recipient_governance.evidence,
        source: "caller_confirmed",
      },
    },
  };

  // 4) Audit FIRST (the proof of the decision), then persist with the pointer.
  const audit = await writeAuditEvent({
    event_type: "ADMIN_ACTION",
    outcome: "SUCCESS",
    actor_entity_id: args.caller_entity_id,
    ...(auditTargetId !== null ? { target_entity_id: auditTargetId } : {}),
    details: {
      action: "FOLLOW_UP_RECIPIENT_RESOLVED",
      decision: args.decision,
      ledger_entry_id: row.ledger_entry_id,
      org_entity_id: args.org_entity_id,
      previous_safety: safety,
      recipient_display_name: updatedTarget.display_name,
    },
  });

  const details = { ...(row.details as Record<string, unknown>), follow_up: updatedAction };
  const updated = await prisma.workLedgerEntry.update({
    where: { ledger_entry_id: row.ledger_entry_id },
    data: {
      details: details as object,
      audit_event_id: audit.audit_id,
      ...(args.decision === "select" && updatedTarget.entity_id !== null
        ? { target_entity_id: updatedTarget.entity_id }
        : {}),
    },
  });

  return {
    ok: true,
    audit_event_id: audit.audit_id,
    follow_up: {
      ledger_entry_id: updated.ledger_entry_id,
      meeting_capture_id: updated.conversation_id,
      title: updated.title,
      status: updated.status,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
      action: updatedAction,
    },
  };
}
