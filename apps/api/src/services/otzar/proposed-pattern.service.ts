// FILE: proposed-pattern.service.ts
// PURPOSE: Section 1 Wave 5 — Otzar Proposed-Pattern from
//          recurring drift per ADR-0066. SAFE persistence layer
//          for the OWNER's own review-gated proposed-pattern
//          lifecycle (PROPOSED → ACCEPTED | REJECTED | ARCHIVED).
//
//          Auto-write = AUTO-PROPOSE, NOT auto-commit. Owner-first
//          self-scope at every gate per RULE 0. The recurrence-
//          detection function reads the caller's OWN drift-signal
//          substrate (Wave 3B per-conversation + Wave 4A wallet-
//          level + Wave 4C cross-conversation rollup) and generates
//          PROPOSED rows above closed-vocab thresholds; the owner
//          reviews + accepts/rejects/archives.
//
//          NEVER manager visibility; NEVER psychological profiling;
//          NEVER autonomous behavior change; NEVER LLM-generated
//          proposal text (closed-vocab template only); NEVER raw
//          correction/transcript/capsule content in any field or
//          audit row.
//
//          The existing org-scoped IntelligencePattern model at
//          schema.prisma:1100-1114 is preserved unchanged per RULE
//          1 + ADR-0066 §"Why a new Prisma model". This service
//          only reads + writes `OtzarProposedPattern`.
// CONNECTS TO:
//   - apps/api/src/services/auth.service.ts (validateSession with
//     "read" scope per ADR-0066 §6)
//   - apps/api/src/services/otzar/drift-signal.service.ts (Wave 3B
//     per-conversation drift labels)
//   - apps/api/src/services/otzar/stale-context-signal.service.ts
//     (Wave 4A wallet-level stale-context label)
//   - apps/api/src/services/otzar/drift-rollup.service.ts (Wave 4C
//     cross-conversation rollup label)
//   - packages/database/src/queries/audit.ts (writeAuditEvent —
//     ADMIN_ACTION + details.action discriminator; NO new audit
//     literal)
//   - ADR-0066 §1-§11 (the design contract this service implements
//     verbatim)
//
// SUBSTRATE-HONEST DISCLOSURE (RULE 13):
//   ADR-0066 §5 specifies "≥ N consecutive days" recurrence
//   thresholds for the WALLET_STALE_CONTEXT and
//   CROSS_CONVERSATION_ROLLUP source types. The v1 implementation
//   uses a single-snapshot derived proxy ("≥ N days since the
//   wallet's most-stale capsule was last updated") because
//   persistent daily snapshots would require a new persistence
//   substrate (forward-substrate per ADR-0066 §9 "background
//   scheduler"). The recurrence-detection function is invoked on-
//   demand via POST /api/v1/otzar/my-twin/proposed-patterns/sweep
//   per ADR-0066 §5 trigger model. True consecutive-day tracking
//   lands at a future slice with separate Founder authorization.

import { prisma, writeAuditEvent } from "@niov/database";
import type { AuthService } from "../auth.service.js";

// ----------------------------------------------------------------
// Closed-vocab discriminator sets per ADR-0066 §4
// ----------------------------------------------------------------

// WHAT: source_signal_type closed-vocab (3 v1 values).
// INPUT: Used as a const + type guard predicate source.
// OUTPUT: Readonly tuple.
// WHY: ADR-0066 §4 source_signal_type set; additive growth
//      behind separate Founder authorization at each future slice.
export const OTZAR_PROPOSED_PATTERN_SOURCE_SIGNAL_TYPE_VALUES = [
  "PER_CONVERSATION_DRIFT",
  "WALLET_STALE_CONTEXT",
  "CROSS_CONVERSATION_ROLLUP",
] as const;
export type OtzarProposedPatternSourceSignalType =
  (typeof OTZAR_PROPOSED_PATTERN_SOURCE_SIGNAL_TYPE_VALUES)[number];

// WHAT: pattern_label closed-vocab (3 v1 values; paired with
//        source_signal_type per ADR-0066 §4).
// INPUT: Used as a const + type guard predicate source.
// OUTPUT: Readonly tuple.
// WHY: ADR-0066 §4 pattern_label set; additive growth behind
//      separate Founder authorization at each future slice.
export const OTZAR_PROPOSED_PATTERN_LABEL_VALUES = [
  "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
  "STALE_CONTEXT_REFRESH_RECOMMENDED",
  "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED",
] as const;
export type OtzarProposedPatternLabel =
  (typeof OTZAR_PROPOSED_PATTERN_LABEL_VALUES)[number];

// WHAT: confidence_label closed-vocab (3 v1 values).
// INPUT: Used as a const + type guard predicate source.
// OUTPUT: Readonly tuple.
// WHY: ADR-0066 §4 confidence_label set; String not Float per
//      §3 ("not numeric employee score").
export const OTZAR_PROPOSED_PATTERN_CONFIDENCE_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;
export type OtzarProposedPatternConfidence =
  (typeof OTZAR_PROPOSED_PATTERN_CONFIDENCE_VALUES)[number];

// WHAT: status closed-vocab lifecycle (4 v1 values).
// INPUT: Used as a const + type guard predicate source.
// OUTPUT: Readonly tuple.
// WHY: ADR-0066 §2 + §4 status lifecycle.
export const OTZAR_PROPOSED_PATTERN_STATUS_VALUES = [
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type OtzarProposedPatternStatus =
  (typeof OTZAR_PROPOSED_PATTERN_STATUS_VALUES)[number];

// ----------------------------------------------------------------
// Canonical safe_summary template selection (ADR-0066 §3 — never
// raw text; never LLM-generated; closed-vocab template only).
// ----------------------------------------------------------------

// WHAT: Map from (source_signal_type, pattern_label) to canonical
//        owner-facing safe_summary template.
// INPUT: Used as a lookup.
// OUTPUT: Const record.
// WHY: ADR-0066 §3 "`safe_summary` is a service-tier-templated
//      String — the value is selected from a closed canonical
//      template set keyed on (source_signal_type, pattern_label),
//      never constructed from raw correction text." All 3 v1
//      (source, label) pairs covered exhaustively at v1.
//      Copy framing: coaching for the owner's own benefit; never
//      surveillance / scoring / blame / punitive language.
const SAFE_SUMMARY_TEMPLATES: Readonly<
  Record<OtzarProposedPatternLabel, string>
> = {
  RECURRING_CORRECTION_RECOMMENDATION_REVIEW:
    "You have corrected your AI teammate on the same kinds of topics across multiple recent conversations. Reviewing this proposed pattern can help your teammate avoid repeating the same mistake. Accepting it will save the pattern for your own coaching review — it does not change how your teammate behaves yet, and it is never shared with managers or other employees.",
  STALE_CONTEXT_REFRESH_RECOMMENDED:
    "Some of your saved memory has fallen out of sync with its source content. Accepting this proposed pattern marks it as a candidate for refresh in your own coaching review — it does not delete, rewrite, or republish anything in your memory, and it is never shared with managers or other employees.",
  CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED:
    "Multiple recent conversations show overlapping drift signals. Accepting this proposed pattern marks it as a candidate for alignment work in your own coaching review — it does not change how your teammate behaves yet, and it is never shared with managers or other employees.",
};

// ----------------------------------------------------------------
// Recurrence-detection thresholds (ADR-0066 §5)
// ----------------------------------------------------------------

// Per-conversation drift recurrence — ≥ 3 distinct conversations
// in the last 14 days with ≥ 4 corrections (Wave 3B fires
// CORRECTION_VELOCITY_ELEVATED at velocity > 3).
const PER_CONVERSATION_WINDOW_DAYS = 14;
const PER_CONVERSATION_VELOCITY_THRESHOLD = 4; // mirrors Wave 3B > 3
const PER_CONVERSATION_RECURRENCE_MEDIUM = 3;
const PER_CONVERSATION_RECURRENCE_HIGH = 6;

// Wallet stale-context recurrence — single-snapshot proxy per
// substrate-honest disclosure: stale capsules whose most-recent
// updated_at is ≥ 7 days ago (MEDIUM) or ≥ 14 days ago (HIGH).
const STALE_CONTEXT_DAYS_MEDIUM = 7;
const STALE_CONTEXT_DAYS_HIGH = 14;

// ----------------------------------------------------------------
// Failure code surface (ADR-0066 §6 enumeration-safe + RULE 0)
// ----------------------------------------------------------------

export type OtzarProposedPatternFailureCode =
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_INVALIDATED"
  | "OPERATION_NOT_PERMITTED"
  | "PROPOSED_PATTERN_NOT_FOUND"
  | "INVALID_STATE_TRANSITION"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface OtzarProposedPatternFailure {
  ok: false;
  code: OtzarProposedPatternFailureCode;
  message: string;
  invalid_fields?: readonly string[];
}

// ----------------------------------------------------------------
// SAFE projection per ADR-0066 §3 + §8 (forbidden response fields
// list enforced by enumeration here)
// ----------------------------------------------------------------

export interface OtzarProposedPatternView {
  pattern_id: string;
  owner_entity_id: string;
  source_signal_type: OtzarProposedPatternSourceSignalType;
  pattern_label: OtzarProposedPatternLabel;
  safe_summary: string;
  confidence_label: OtzarProposedPatternConfidence;
  status: OtzarProposedPatternStatus;
  occurrence_count: number;
  first_signal_at: string;
  last_signal_at: string;
  proposed_at: string;
  reviewed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SweepSuccess {
  ok: true;
  created_count: number;
  deduped_count: number;
  created: readonly OtzarProposedPatternView[];
}

export interface ListSuccess {
  ok: true;
  patterns: readonly OtzarProposedPatternView[];
}

export interface GetSuccess {
  ok: true;
  pattern: OtzarProposedPatternView;
}

export interface TransitionSuccess {
  ok: true;
  pattern: OtzarProposedPatternView;
  audit_event_id: string;
}

// ----------------------------------------------------------------
// PATCH body shape (only `status` updatable per ADR-0066 §6)
// ----------------------------------------------------------------

export interface TransitionInput {
  status?: unknown;
  // Forbidden fields enumerated for explicit detection:
  pattern_id?: unknown;
  owner_entity_id?: unknown;
  source_signal_type?: unknown;
  pattern_label?: unknown;
  safe_summary?: unknown;
  confidence_label?: unknown;
  occurrence_count?: unknown;
  first_signal_at?: unknown;
  last_signal_at?: unknown;
  proposed_at?: unknown;
  reviewed_at?: unknown;
  archived_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

const FORBIDDEN_PATCH_FIELDS = [
  "pattern_id",
  "owner_entity_id",
  "source_signal_type",
  "pattern_label",
  "safe_summary",
  "confidence_label",
  "occurrence_count",
  "first_signal_at",
  "last_signal_at",
  "proposed_at",
  "reviewed_at",
  "archived_at",
  "created_at",
  "updated_at",
] as const;

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function isStatus(value: unknown): value is OtzarProposedPatternStatus {
  return (
    typeof value === "string" &&
    (OTZAR_PROPOSED_PATTERN_STATUS_VALUES as readonly string[]).includes(value)
  );
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

// Use the Prisma model row type indirectly via parameter inference;
// projecting from the Prisma row to the SAFE view.
type OtzarProposedPatternRow = {
  pattern_id: string;
  owner_entity_id: string;
  source_signal_type: string;
  pattern_label: string;
  safe_summary: string;
  confidence_label: string;
  status: string;
  occurrence_count: number;
  first_signal_at: Date;
  last_signal_at: Date;
  proposed_at: Date;
  reviewed_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function project(row: OtzarProposedPatternRow): OtzarProposedPatternView {
  return {
    pattern_id: row.pattern_id,
    owner_entity_id: row.owner_entity_id,
    source_signal_type:
      row.source_signal_type as OtzarProposedPatternSourceSignalType,
    pattern_label: row.pattern_label as OtzarProposedPatternLabel,
    safe_summary: row.safe_summary,
    confidence_label:
      row.confidence_label as OtzarProposedPatternConfidence,
    status: row.status as OtzarProposedPatternStatus,
    occurrence_count: row.occurrence_count,
    first_signal_at: row.first_signal_at.toISOString(),
    last_signal_at: row.last_signal_at.toISOString(),
    proposed_at: row.proposed_at.toISOString(),
    reviewed_at: row.reviewed_at === null ? null : row.reviewed_at.toISOString(),
    archived_at: row.archived_at === null ? null : row.archived_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// Allowed transitions per ADR-0066 §2 + §6:
//   PROPOSED → ACCEPTED | REJECTED | ARCHIVED
//   ACCEPTED → ARCHIVED
//   REJECTED → ARCHIVED
//   ARCHIVED is terminal.
function isAllowedTransition(
  from: OtzarProposedPatternStatus,
  to: OtzarProposedPatternStatus,
): boolean {
  if (from === "PROPOSED") {
    return to === "ACCEPTED" || to === "REJECTED" || to === "ARCHIVED";
  }
  if (from === "ACCEPTED" || from === "REJECTED") {
    return to === "ARCHIVED";
  }
  // ARCHIVED is terminal.
  return false;
}

// ----------------------------------------------------------------
// Recurrence-detection candidates (internal type)
// ----------------------------------------------------------------

interface RecurrenceCandidate {
  source_signal_type: OtzarProposedPatternSourceSignalType;
  pattern_label: OtzarProposedPatternLabel;
  confidence_label: OtzarProposedPatternConfidence;
  occurrence_count: number;
  first_signal_at: Date;
  last_signal_at: Date;
}

// ----------------------------------------------------------------
// Service
// ----------------------------------------------------------------

// WHAT: Otzar proposed-pattern service — owner-first review-gated
//        CRUD + on-demand recurrence sweep.
// INPUT: AuthService (for bearer + "read" session validation).
// OUTPUT: An instance with 4 async methods (sweep / list / get /
//         transition).
// WHY: Single class so the route layer + future Wave 6+ consumers
//      compose against a stable interface. All methods enforce
//      RULE 0 owner-first self-scope; cross-owner / unknown id
//      fold to PROPOSED_PATTERN_NOT_FOUND (enumeration-safe).
//      Recurrence sweep reads ONLY the caller's own drift
//      substrate (CORRECTION capsules in caller's wallet +
//      caller's wallet capsule freshness) and writes ONLY to
//      OtzarProposedPattern rows for that same caller. NEVER
//      reads or writes any other entity's data; NEVER touches the
//      existing org-scoped IntelligencePattern model.
export class OtzarProposedPatternService {
  constructor(private readonly authService: AuthService) {}

  // Shared auth gate.
  private async authenticate(
    sessionToken: string,
  ): Promise<
    | { ok: true; entity_id: string; session_id: string }
    | OtzarProposedPatternFailure
  > {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return {
        ok: false,
        code: session.code,
        message: "Proposed-pattern access denied",
      };
    }
    return {
      ok: true,
      entity_id: session.entity_id,
      session_id: session.session_id,
    };
  }

  // WHAT: Run the recurrence-detection sweep + create any new
  //        PROPOSED rows; deduplicate against existing PROPOSED |
  //        ACCEPTED non-archived rows per ADR-0066 §5.
  // INPUT: Session token + optional context.
  // OUTPUT: SweepSuccess (lists created + deduped counts) |
  //         OtzarProposedPatternFailure.
  // WHY: ADR-0066 §5 on-demand trigger model. Idempotent re-entry
  //      preserved by the dedup policy.
  async sweep(
    sessionToken: string,
    context: { ip_address?: string | null } = {},
  ): Promise<SweepSuccess | OtzarProposedPatternFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    const candidates = await this.detectRecurrenceCandidates(auth.entity_id);
    if (candidates.length === 0) {
      return { ok: true, created_count: 0, deduped_count: 0, created: [] };
    }

    // Dedup: do not create a new PROPOSED for a (owner, source, label)
    // that already has a non-archived PROPOSED | ACCEPTED row.
    const existingNonArchived = await prisma.otzarProposedPattern.findMany({
      where: {
        owner_entity_id: auth.entity_id,
        status: { in: ["PROPOSED", "ACCEPTED"] },
        archived_at: null,
      },
      select: { source_signal_type: true, pattern_label: true },
    });
    const existingKeys = new Set(
      existingNonArchived.map(
        (r) => `${r.source_signal_type}::${r.pattern_label}`,
      ),
    );

    const created: OtzarProposedPatternView[] = [];
    let dedupedCount = 0;

    for (const c of candidates) {
      const key = `${c.source_signal_type}::${c.pattern_label}`;
      if (existingKeys.has(key)) {
        dedupedCount++;
        continue;
      }

      const row = await prisma.otzarProposedPattern.create({
        data: {
          owner_entity_id: auth.entity_id,
          source_signal_type: c.source_signal_type,
          pattern_label: c.pattern_label,
          safe_summary: SAFE_SUMMARY_TEMPLATES[c.pattern_label],
          confidence_label: c.confidence_label,
          status: "PROPOSED",
          occurrence_count: c.occurrence_count,
          first_signal_at: c.first_signal_at,
          last_signal_at: c.last_signal_at,
        },
      });

      await writeAuditEvent({
        event_type: "ADMIN_ACTION",
        outcome: "SUCCESS",
        actor_entity_id: auth.entity_id,
        target_entity_id: auth.entity_id,
        ip_address: context.ip_address ?? null,
        details: {
          action: "OTZAR_PATTERN_PROPOSED",
          pattern_id: row.pattern_id,
          owner_entity_id: row.owner_entity_id,
          source_signal_type: row.source_signal_type,
          pattern_label: row.pattern_label,
          status: row.status,
          confidence_label: row.confidence_label,
        },
      });

      created.push(project(row));
      existingKeys.add(key);
    }

    return {
      ok: true,
      created_count: created.length,
      deduped_count: dedupedCount,
      created,
    };
  }

  // WHAT: List the caller's proposed patterns.
  // INPUT: Session token + optional { status, limit, include_archived }.
  // OUTPUT: ListSuccess | OtzarProposedPatternFailure.
  // WHY: Owner-first self-scope; default excludes ARCHIVED;
  //      ?status overrides default; ?include_archived=true opt-in.
  //      Ordered by proposed_at DESC. Read audit emission per
  //      ADR-0066 §7 (OTZAR_PATTERN_READ discriminator).
  async list(
    sessionToken: string,
    options: {
      status?: OtzarProposedPatternStatus;
      limit?: number;
      include_archived?: boolean;
    } = {},
    context: { ip_address?: string | null } = {},
  ): Promise<ListSuccess | OtzarProposedPatternFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    const limit = Math.min(
      Math.max(1, Math.floor(options.limit ?? DEFAULT_LIST_LIMIT)),
      MAX_LIST_LIMIT,
    );

    const where: {
      owner_entity_id: string;
      status?: OtzarProposedPatternStatus;
      archived_at?: null;
    } = { owner_entity_id: auth.entity_id };
    if (options.status !== undefined) {
      where.status = options.status;
    } else if (options.include_archived !== true) {
      where.archived_at = null;
    }

    const rows = await prisma.otzarProposedPattern.findMany({
      where,
      orderBy: { proposed_at: "desc" },
      take: limit,
    });

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "OTZAR_PATTERN_READ",
        owner_entity_id: auth.entity_id,
        read_kind: "LIST",
        returned_count: rows.length,
      },
    });

    return { ok: true, patterns: rows.map(project) };
  }

  // WHAT: Fetch one proposed pattern by id for the authenticated
  //        owner.
  // INPUT: Session token + pattern_id.
  // OUTPUT: GetSuccess | OtzarProposedPatternFailure.
  // WHY: Owner-first lookup; cross-owner / unknown id both fold
  //      to PROPOSED_PATTERN_NOT_FOUND (enumeration-safe).
  async get(
    sessionToken: string,
    patternId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<GetSuccess | OtzarProposedPatternFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    if (typeof patternId !== "string" || patternId.length === 0) {
      return {
        ok: false,
        code: "PROPOSED_PATTERN_NOT_FOUND",
        message: "Proposed pattern not found",
      };
    }

    const row = await prisma.otzarProposedPattern.findFirst({
      where: { pattern_id: patternId, owner_entity_id: auth.entity_id },
    });
    if (row === null) {
      return {
        ok: false,
        code: "PROPOSED_PATTERN_NOT_FOUND",
        message: "Proposed pattern not found",
      };
    }

    await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: "OTZAR_PATTERN_READ",
        pattern_id: row.pattern_id,
        owner_entity_id: row.owner_entity_id,
        source_signal_type: row.source_signal_type,
        pattern_label: row.pattern_label,
        status: row.status,
        confidence_label: row.confidence_label,
        read_kind: "DETAIL",
      },
    });

    return { ok: true, pattern: project(row) };
  }

  // WHAT: Owner state-transition (PATCH; only `status` updatable).
  // INPUT: Session token + pattern_id + body.
  // OUTPUT: TransitionSuccess | OtzarProposedPatternFailure.
  // WHY: ADR-0066 §2 + §6. Forbidden body fields → 422
  //      INVALID_REQUEST; invalid transitions → 422
  //      INVALID_STATE_TRANSITION; cross-owner / unknown id →
  //      404 PROPOSED_PATTERN_NOT_FOUND. Sets reviewed_at on
  //      ACCEPTED|REJECTED; sets archived_at on ARCHIVED. Audit
  //      via the §7 discriminator per terminal status.
  async transition(
    sessionToken: string,
    patternId: string,
    body: TransitionInput,
    context: { ip_address?: string | null } = {},
  ): Promise<TransitionSuccess | OtzarProposedPatternFailure> {
    const auth = await this.authenticate(sessionToken);
    if (auth.ok === false) return auth;

    // Forbidden-field detection (RULE 0 + ADR-0066 §6) — only
    // `status` may be supplied by the caller.
    const forbidden: string[] = [];
    for (const f of FORBIDDEN_PATCH_FIELDS) {
      if (
        f in body &&
        (body as Record<string, unknown>)[f] !== undefined
      ) {
        forbidden.push(f);
      }
    }
    if (forbidden.length > 0) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "Only `status` may be updated",
        invalid_fields: forbidden,
      };
    }

    if (body.status === undefined) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: "`status` is required",
        invalid_fields: ["status"],
      };
    }
    if (!isStatus(body.status)) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        message: `\`status\` must be one of ${OTZAR_PROPOSED_PATTERN_STATUS_VALUES.join(", ")}`,
        invalid_fields: ["status"],
      };
    }
    const targetStatus: OtzarProposedPatternStatus = body.status;

    const existing = await prisma.otzarProposedPattern.findFirst({
      where: { pattern_id: patternId, owner_entity_id: auth.entity_id },
    });
    if (existing === null) {
      return {
        ok: false,
        code: "PROPOSED_PATTERN_NOT_FOUND",
        message: "Proposed pattern not found",
      };
    }

    const currentStatus = existing.status as OtzarProposedPatternStatus;
    if (!isAllowedTransition(currentStatus, targetStatus)) {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot transition ${currentStatus} → ${targetStatus}`,
        invalid_fields: ["status"],
      };
    }

    const now = new Date();
    const data: {
      status: OtzarProposedPatternStatus;
      reviewed_at?: Date;
      archived_at?: Date;
    } = { status: targetStatus };
    if (targetStatus === "ACCEPTED" || targetStatus === "REJECTED") {
      data.reviewed_at = now;
    }
    if (targetStatus === "ARCHIVED") {
      data.archived_at = now;
    }

    const updated = await prisma.otzarProposedPattern.update({
      where: { pattern_id: existing.pattern_id },
      data,
    });

    let actionDiscriminator:
      | "OTZAR_PATTERN_ACCEPTED"
      | "OTZAR_PATTERN_REJECTED"
      | "OTZAR_PATTERN_ARCHIVED";
    if (targetStatus === "ACCEPTED") actionDiscriminator = "OTZAR_PATTERN_ACCEPTED";
    else if (targetStatus === "REJECTED")
      actionDiscriminator = "OTZAR_PATTERN_REJECTED";
    else actionDiscriminator = "OTZAR_PATTERN_ARCHIVED";

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: auth.entity_id,
      target_entity_id: auth.entity_id,
      ip_address: context.ip_address ?? null,
      details: {
        action: actionDiscriminator,
        pattern_id: updated.pattern_id,
        owner_entity_id: updated.owner_entity_id,
        source_signal_type: updated.source_signal_type,
        pattern_label: updated.pattern_label,
        status: updated.status,
        confidence_label: updated.confidence_label,
      },
    });

    return {
      ok: true,
      pattern: project(updated),
      audit_event_id: audit.audit_id,
    };
  }

  // ----------------------------------------------------------------
  // Recurrence-detection — private; reads ONLY caller's own drift
  // substrate (CORRECTION capsules in caller's wallet + caller's
  // wallet capsule freshness)
  // ----------------------------------------------------------------

  // WHAT: Detect all currently-met recurrence candidates for the
  //        caller. Returns 0..3 candidates (one per source
  //        signal type).
  // INPUT: callerEntityId.
  // OUTPUT: Array of RecurrenceCandidate.
  // WHY: ADR-0066 §5 criteria; v1 single-snapshot proxy per the
  //      service header substrate-honest disclosure.
  private async detectRecurrenceCandidates(
    callerEntityId: string,
  ): Promise<RecurrenceCandidate[]> {
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: callerEntityId },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      // No wallet yet → no drift signals exist → no candidates.
      return [];
    }

    const candidates: RecurrenceCandidate[] = [];

    // ----------------------------------------------------------------
    // PER_CONVERSATION_DRIFT — count distinct conversations in the
    // last 14 days where ≥ 4 CORRECTION capsules exist (mirrors
    // Wave 3B CORRECTION_VELOCITY_ELEVATED > 3 threshold).
    // ----------------------------------------------------------------
    const since = daysAgo(PER_CONVERSATION_WINDOW_DAYS);
    const correctionRows = await prisma.memoryCapsule.findMany({
      where: {
        wallet_id: wallet.wallet_id,
        capsule_type: "CORRECTION",
        deleted_at: null,
        conversation_id: { not: null },
        created_at: { gte: since },
      },
      select: { conversation_id: true, created_at: true },
    });
    if (correctionRows.length > 0) {
      const byConv = new Map<string, { count: number; first: Date; last: Date }>();
      for (const r of correctionRows) {
        if (r.conversation_id === null) continue;
        const cur = byConv.get(r.conversation_id);
        if (cur === undefined) {
          byConv.set(r.conversation_id, {
            count: 1,
            first: r.created_at,
            last: r.created_at,
          });
        } else {
          cur.count += 1;
          if (r.created_at < cur.first) cur.first = r.created_at;
          if (r.created_at > cur.last) cur.last = r.created_at;
        }
      }
      let elevatedConvCount = 0;
      let firstSignal: Date | null = null;
      let lastSignal: Date | null = null;
      for (const v of byConv.values()) {
        if (v.count >= PER_CONVERSATION_VELOCITY_THRESHOLD) {
          elevatedConvCount += 1;
          if (firstSignal === null || v.first < firstSignal) firstSignal = v.first;
          if (lastSignal === null || v.last > lastSignal) lastSignal = v.last;
        }
      }
      if (
        elevatedConvCount >= PER_CONVERSATION_RECURRENCE_MEDIUM &&
        firstSignal !== null &&
        lastSignal !== null
      ) {
        const confidence: OtzarProposedPatternConfidence =
          elevatedConvCount >= PER_CONVERSATION_RECURRENCE_HIGH
            ? "HIGH"
            : "MEDIUM";
        candidates.push({
          source_signal_type: "PER_CONVERSATION_DRIFT",
          pattern_label: "RECURRING_CORRECTION_RECOMMENDATION_REVIEW",
          confidence_label: confidence,
          occurrence_count: elevatedConvCount,
          first_signal_at: firstSignal,
          last_signal_at: lastSignal,
        });
      }
    }

    // ----------------------------------------------------------------
    // WALLET_STALE_CONTEXT — pull only the two hash columns +
    // embedding_generated_at (no raw content); count rows where
    // embedding_content_hash != content_hash and
    // embedding_generated_at is older than the threshold. Mirrors
    // Wave 4A STALE_CONTEXT_RISK signal substrate per
    // stale-context-signal.service.ts (which compares the two hash
    // columns in-process; this service adds the time-since-embedding
    // proxy to derive the v1 "≥ N days" recurrence threshold per
    // ADR-0066 §5 + the service header substrate-honest disclosure).
    // The `embedding_generated_at` column is the canonical
    // "when was the embedding last fresh" timestamp per ADR-0045
    // G5.3; a row where embedding_content_hash != content_hash AND
    // embedding_generated_at is N days old has had its embedding
    // out of sync with its content since at least the next content
    // edit, which happened between embedding_generated_at and now.
    // The proxy slightly underestimates true stale-days when the
    // content edit happened closer to now, which is the safer
    // direction (we'd rather under-propose than over-propose at v1).
    const staleRows = await prisma.memoryCapsule.findMany({
      where: {
        wallet_id: wallet.wallet_id,
        deleted_at: null,
        embedding_content_hash: { not: null },
      },
      select: {
        content_hash: true,
        embedding_content_hash: true,
        embedding_generated_at: true,
      },
    });
    let staleCount = 0;
    let staleFirstSignal: Date | null = null;
    let staleLastSignal: Date | null = null;
    const mediumCutoff = daysAgo(STALE_CONTEXT_DAYS_MEDIUM);
    let qualifyingForMedium = false;
    let qualifyingForHigh = false;
    const highCutoff = daysAgo(STALE_CONTEXT_DAYS_HIGH);
    for (const r of staleRows) {
      if (
        r.embedding_content_hash === null ||
        r.embedding_content_hash === r.content_hash ||
        r.embedding_generated_at === null
      ) {
        continue;
      }
      staleCount += 1;
      const stalenessAnchor = r.embedding_generated_at;
      if (stalenessAnchor <= mediumCutoff) qualifyingForMedium = true;
      if (stalenessAnchor <= highCutoff) qualifyingForHigh = true;
      if (staleFirstSignal === null || stalenessAnchor < staleFirstSignal) {
        staleFirstSignal = stalenessAnchor;
      }
      if (staleLastSignal === null || stalenessAnchor > staleLastSignal) {
        staleLastSignal = stalenessAnchor;
      }
    }
    if (
      qualifyingForMedium &&
      staleFirstSignal !== null &&
      staleLastSignal !== null
    ) {
      const confidence: OtzarProposedPatternConfidence = qualifyingForHigh
        ? "HIGH"
        : "MEDIUM";
      candidates.push({
        source_signal_type: "WALLET_STALE_CONTEXT",
        pattern_label: "STALE_CONTEXT_REFRESH_RECOMMENDED",
        confidence_label: confidence,
        occurrence_count: staleCount,
        first_signal_at: staleFirstSignal,
        last_signal_at: staleLastSignal,
      });
    }

    // ----------------------------------------------------------------
    // CROSS_CONVERSATION_ROLLUP — fires when BOTH the per-conversation
    // drift signal AND the wallet stale-context signal qualify
    // concurrently. Mirrors Wave 4C AT_RISK rollup substrate per
    // drift-rollup.service.ts.
    // ----------------------------------------------------------------
    const perConvFires = candidates.some(
      (c) => c.source_signal_type === "PER_CONVERSATION_DRIFT",
    );
    const staleFires = candidates.some(
      (c) => c.source_signal_type === "WALLET_STALE_CONTEXT",
    );
    if (perConvFires && staleFires) {
      // The rollup candidate inherits the wider time-range from both
      // contributing signals.
      let rollupFirst: Date | null = null;
      let rollupLast: Date | null = null;
      let rollupCount = 0;
      let bothHigh = true;
      for (const c of candidates) {
        if (
          c.source_signal_type !== "PER_CONVERSATION_DRIFT" &&
          c.source_signal_type !== "WALLET_STALE_CONTEXT"
        ) {
          continue;
        }
        rollupCount += c.occurrence_count;
        if (rollupFirst === null || c.first_signal_at < rollupFirst) {
          rollupFirst = c.first_signal_at;
        }
        if (rollupLast === null || c.last_signal_at > rollupLast) {
          rollupLast = c.last_signal_at;
        }
        if (c.confidence_label !== "HIGH") bothHigh = false;
      }
      if (rollupFirst !== null && rollupLast !== null) {
        candidates.push({
          source_signal_type: "CROSS_CONVERSATION_ROLLUP",
          pattern_label: "CROSS_CONVERSATION_ALIGNMENT_RECOMMENDED",
          confidence_label: bothHigh ? "HIGH" : "MEDIUM",
          occurrence_count: rollupCount,
          first_signal_at: rollupFirst,
          last_signal_at: rollupLast,
        });
      }
    }

    return candidates;
  }
}
