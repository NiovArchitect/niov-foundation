// FILE: queries/audit.ts
// PURPOSE: The compliance-grade, tamper-evident audit-of-record API.
//          Future services (auth, sessions, hive, monetization) call
//          writeAuditEvent here. Existing 1A-1D code keeps using the
//          lower-level AuditLog table -- they record different kinds
//          of facts.
// CONNECTS TO: The audit_events table in schema.prisma, the Postgres
//              BEFORE UPDATE OR DELETE trigger that enforces append-only
//              behavior, and the SHA-256 hash chain that lets anyone
//              verify the chain has not been tampered with.

import { createHash, randomUUID } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import type { AuditEvent, AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "../client.js";

// WHAT: The canonical list of recognized event_type strings. The column
//        is plain text so future sections can extend, but this union
//        documents what the system knows today.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: TypeScript callers get autocomplete and a typo-catch; the DB
//      stays flexible for future event types we have not invented yet.
export type AuditEventType =
  | "ENTITY_REGISTERED"
  | "ENTITY_SUSPENDED"
  | "ENTITY_REACTIVATED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_CREATED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "CAPSULE_CREATED"
  | "CAPSULE_METADATA_READ"
  | "CAPSULE_CONTENT_READ"
  | "CAPSULE_UPDATED"
  | "CAPSULE_DELETED"
  // D-2D-D10-6: correction propagation chain audit event per RAA 12.8
  // §5.2. Fires when propagateCorrection (feedback.service.ts) snaps
  // the correction capsule + (if present) the corrected target capsule
  // relevance_score to RELEVANCE_MAX. Unlike FEEDBACK_LOOP_* below this
  // is a human-actor event (actor_entity_id = the entity submitting the
  // correction), not a SYSTEM-PRINCIPAL one.
  | "CORRECTION_PROPAGATED"
  | "PERMISSION_CREATED"
  | "PERMISSION_REVOKED"
  | "PERMISSION_EXPIRED"
  | "DATA_MONETIZED"
  | "HIVE_CREATED"
  | "HIVE_MEMBER_ADDED"
  | "HIVE_MEMBER_REMOVED"
  | "HIVE_INTELLIGENCE_READ"
  | "HIVE_AGGREGATE_BUILT"
  | "COMPLIANCE_CHECK_PASSED"
  | "COMPLIANCE_CHECK_FAILED"
  | "ANOMALY_DETECTED"
  | "ADMIN_ACTION"
  | "NEGOTIATE"
  // Section 11D: Otzar conversation lifecycle events. Emitted by
  // OtzarService.conductSession (on new-conversation creation
  // only; not on continuation) and OtzarService.closeConversation.
  // Hash-chained per Section 1E like every other audit event.
  | "CONVERSATION_STARTED"
  | "CONVERSATION_CLOSED"
  // 12C.0 Item 7: Foundation feedback-loop scheduler operational
  // events. Emitted by apps/api/src/services/feedback/scheduler.ts
  // wrapping each cron task in try/catch with timing. Both literals
  // are SYSTEM-PRINCIPAL events (system_principal:
  // SYSTEM_PRINCIPALS.SCHEDULER), not human ADMIN_ACTION events --
  // they sit alongside HIVE_AGGREGATE_BUILT in the operational
  // event class.
  | "FEEDBACK_LOOP_EXECUTED"
  | "FEEDBACK_LOOP_FAILED";

// WHAT: Runtime-iterable list of every recognized AuditEventType.
// INPUT: None.
// OUTPUT: A readonly array of AuditEventType literals.
// WHY: 12C.0 (Item 3) GET /org/audit ?event_type= filter validation
//      needs to reject unknown literals at the route layer (422
//      INVALID_REQUEST). TypeScript's type-only union is unavailable
//      at runtime; this constant is the compile-time-checked source
//      of truth so routes can `Set<AuditEventType>` membership-test
//      without duplicating the literal list. Add new event types to
//      BOTH this array AND the union above; the `satisfies` clause
//      catches drift at typecheck time.
export const AUDIT_EVENT_TYPE_VALUES = [
  "ENTITY_REGISTERED",
  "ENTITY_SUSPENDED",
  "ENTITY_REACTIVATED",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "SESSION_CREATED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "CAPSULE_CREATED",
  "CAPSULE_METADATA_READ",
  "CAPSULE_CONTENT_READ",
  "CAPSULE_UPDATED",
  "CAPSULE_DELETED",
  // D-2D-D10-6: correction propagation chain (RAA 12.8 §5.2)
  "CORRECTION_PROPAGATED",
  "PERMISSION_CREATED",
  "PERMISSION_REVOKED",
  "PERMISSION_EXPIRED",
  "DATA_MONETIZED",
  "HIVE_CREATED",
  "HIVE_MEMBER_ADDED",
  "HIVE_MEMBER_REMOVED",
  "HIVE_INTELLIGENCE_READ",
  "HIVE_AGGREGATE_BUILT",
  "COMPLIANCE_CHECK_PASSED",
  "COMPLIANCE_CHECK_FAILED",
  "ANOMALY_DETECTED",
  "ADMIN_ACTION",
  "NEGOTIATE",
  "CONVERSATION_STARTED",
  "CONVERSATION_CLOSED",
  // 12C.0 Item 7
  "FEEDBACK_LOOP_EXECUTED",
  "FEEDBACK_LOOP_FAILED",
] as const satisfies readonly AuditEventType[];

export function isKnownAuditEventType(
  value: unknown,
): value is AuditEventType {
  return (
    typeof value === "string" &&
    (AUDIT_EVENT_TYPE_VALUES as readonly string[]).includes(value)
  );
}

// WHAT: The shape callers hand to writeAuditEvent.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: All non-derived fields the spec lists. event_hash is computed
//      for the caller; previous_event_hash is looked up automatically.
export interface WriteAuditEventInput {
  event_type: AuditEventType | string;
  outcome: AuditOutcome;
  actor_entity_id?: string | null;
  target_entity_id?: string | null;
  target_capsule_id?: string | null;
  session_id?: string | null;
  denial_reason?: string | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  // 12C.0 Item 7: optional system principal for system-initiated
  // emissions (scheduler ticks, boot validators, compliance seeders,
  // feedback loops). Selects which dedicated chain the event joins
  // when actor_entity_id is null. When BOTH actor_entity_id and
  // system_principal are absent, chainKey selection falls back to
  // the legacy SYSTEM_CHAIN_KEY (DRIFT 12 backwards-compat anchor).
  system_principal?: SystemPrincipal | null;
}

// WHAT: Filters queryAuditEvents accepts.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Pagination is mandatory (max 100 per page), other filters are
//      optional so callers can ask broad or narrow questions.
export interface QueryAuditEventsFilters {
  actor_entity_id?: string;
  target_entity_id?: string;
  target_capsule_id?: string;
  event_type?: string;
  outcome?: AuditOutcome;
  start_time?: Date;
  end_time?: Date;
  page?: number;
  page_size?: number;
}

// WHAT: The shape of a queryAuditEvents response.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets callers know what page they got and how many total rows
//      match their filter, for pager UIs.
export interface QueryAuditEventsResult {
  events: AuditEvent[];
  page: number;
  page_size: number;
  total: number;
}

// WHAT: The shape of a verifyAuditChain response.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Lets callers display "chain valid" / "chain broken at row X"
//      with a single object.
export interface VerifyAuditChainResult {
  valid: boolean;
  totalEvents: number;
  brokenAt: string | null;
}

// WHAT: The maximum number of audit events one queryAuditEvents page
//        will ever return.
// INPUT: None.
// OUTPUT: The number 100.
// WHY: Spec says max 100 per page. Naming the constant means we can
//      change it later without grep.
export const MAX_AUDIT_EVENTS_PAGE_SIZE = 100;

// WHAT: Legacy sentinel used as chainKey when neither actor_entity_id
//        nor system_principal is provided.
// INPUT: None.
// OUTPUT: A literal string.
// WHY: pg_advisory_xact_lock needs a stable hash input. Pre-12C.0
//      every system-initiated emission collapsed onto this single
//      sentinel, joining one shared chain. 12C.0 Item 7 adds
//      SYSTEM_PRINCIPALS so subsystem-attributable emissions chain
//      separately, but this constant remains exported (DRIFT 12
//      backwards-compat anchor): existing audit rows written under
//      the legacy sentinel must remain verifiable, and existing
//      writeAuditEvent callers without system_principal must
//      continue working unchanged.
const SYSTEM_CHAIN_KEY = "__niov_system_chain__";

// WHAT: 12C.0 Item 7 enumerated system principals.
// INPUT: None.
// OUTPUT: A frozen object with sentinel chain-key strings keyed by
//         a small set of named subsystems.
// WHY: Pre-12C.0 every system-initiated audit event collapsed onto
//      one SYSTEM_CHAIN_KEY sentinel chain. FedRAMP / SOC 2 reviewers
//      prefer enumerated system identities so audit reconstruction
//      can attribute system actions to a specific subsystem.
//      Object.freeze is asserted by tests/unit/audit-system-principals.test.ts
//      so future engineers (or LLMs) cannot mutate the enum at
//      runtime without breaking a red test. New principals MUST be
//      added here AND have their chainKey value reviewed for
//      naming-collision (the "__niov_system_<subsystem>__" pattern
//      is the convention).
export const SYSTEM_PRINCIPALS = Object.freeze({
  SCHEDULER: "__niov_system_scheduler__",
  BOOT_VALIDATOR: "__niov_system_boot_validator__",
  COMPLIANCE_SEEDER: "__niov_system_compliance_seeder__",
  FEEDBACK_LOOP: "__niov_system_feedback_loop__",
  // Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033
  // §Decision 4d (D-5BII-EXEC-3): Elixir/BEAM register subsystem
  // attribution for system-initiated COSMP ops emitted from
  // CosmpRouter.Audit. Matched constant in
  // apps/cosmp_router/lib/cosmp_router/audit.ex @system_principals.
  COSMP_ROUTER: "__niov_system_cosmp_router__",
} as const);

export type SystemPrincipal =
  (typeof SYSTEM_PRINCIPALS)[keyof typeof SYSTEM_PRINCIPALS];

// WHAT: Convert any JS value into a deterministic JSON string with
//        sorted object keys.
// INPUT: Any JS value (object, array, primitive).
// OUTPUT: A canonical JSON string.
// WHY: The default JSON.stringify orders object keys by insertion,
//      which would change the hash even when the data is identical.
//      Sorting keys recursively gives us a stable canonical form.
// EXPORTED at sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per
// ADR-0033 §Decision 4b: scripts/generate-canonical-fixtures.ts +
// future cross-language audit-chain tooling import this for
// byte-equivalence verification with Elixir register's port at
// apps/cosmp_router/lib/cosmp_router/audit.ex canonical_json/1.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
}

// WHAT: Build the canonical input string that gets fed into SHA-256.
// INPUT: Every field that participates in the hash.
// OUTPUT: A delimited string suitable for hashing.
// WHY: Centralizing this here means the same logic runs at write time
//      and at verify time, so a single bug cannot make the chain
//      "valid" by mistake.
// EXPORTED at sub-phase 5b-ii per ADR-0033 §Decision 4a: same
// rationale as canonicalJson — fixture generator + byte-equivalence
// verification with Elixir port at CosmpRouter.Audit.canonical_record/1.
export function canonicalRecord(parts: {
  audit_id: string;
  event_type: string;
  actor_entity_id: string | null;
  target_entity_id: string | null;
  target_capsule_id: string | null;
  session_id: string | null;
  outcome: AuditOutcome;
  denial_reason: string | null;
  details: unknown;
  ip_address: string | null;
  timestamp: Date;
  previous_event_hash: string | null;
}): string {
  return [
    parts.audit_id,
    parts.event_type,
    parts.actor_entity_id ?? "",
    parts.target_entity_id ?? "",
    parts.target_capsule_id ?? "",
    parts.session_id ?? "",
    parts.outcome,
    parts.denial_reason ?? "",
    canonicalJson(parts.details),
    parts.ip_address ?? "",
    parts.timestamp.toISOString(),
    parts.previous_event_hash ?? "",
  ].join("|");
}

// WHAT: Compute the SHA-256 hex digest of a canonical record string.
// INPUT: The canonical string built by canonicalRecord.
// OUTPUT: A 64-character hex string.
// WHY: Hex is human-readable in the database and easy to compare.
function sha256Hex(canonical: string): string {
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(canonical).digest("hex");
}

// WHAT: Install the Postgres trigger that makes audit_events
//        append-only.
// INPUT: An optional Prisma client (defaults to the shared one).
// OUTPUT: A promise that resolves once the trigger is installed.
// WHY: Prisma cannot define triggers in schema.prisma, so we install
//      one here. The function is idempotent -- it drops any older
//      version of the trigger before recreating it -- so it can be
//      called from server boot or test setup safely.
export async function applyAuditEventTriggers(
  client: typeof prisma = prisma,
): Promise<void> {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only; UPDATE and DELETE are not permitted';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events",
  );
  await client.$executeRawUnsafe(`
    CREATE TRIGGER audit_events_no_update
      BEFORE UPDATE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
  `);
  await client.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events",
  );
  await client.$executeRawUnsafe(`
    CREATE TRIGGER audit_events_no_delete
      BEFORE DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
  `);
}

// WHAT: Inner work: acquire the per-chain advisory lock, look up the
//        previous event hash, compute the new hash, and insert one row.
// INPUT: A transaction client and a WriteAuditEventInput.
// OUTPUT: The newly created AuditEvent record.
// WHY: Pulled out so writeAuditEvent can be called either standalone
//      (opens its own transaction) OR inside a caller-provided
//      transaction (composable with Phase 0's atomic create-org flow).
//      The advisory lock is acquired in whichever transaction is live
//      so per-chain serialization works in both modes.
async function writeAuditEventInTx(
  tx: Prisma.TransactionClient,
  input: WriteAuditEventInput,
): Promise<AuditEvent> {
  // 12C.0 Item 7 chainKey selection priority:
  //   1. actor_entity_id (real authenticated entity) -- existing path
  //   2. system_principal (named subsystem -- new in 12C.0)
  //   3. legacy SYSTEM_CHAIN_KEY (DRIFT 12 backwards-compat: existing
  //      callers without either parameter still produce verifiable
  //      audit rows, and historical rows under the legacy sentinel
  //      remain in their own chain).
  const chainKey =
    input.actor_entity_id ?? input.system_principal ?? SYSTEM_CHAIN_KEY;
  // Serialize per-chain writes so two concurrent writers cannot link
  // to the same previous event. Held until the transaction commits.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    chainKey,
  );

  const previous = await tx.auditEvent.findFirst({
    where: input.actor_entity_id
      ? { actor_entity_id: input.actor_entity_id }
      : { actor_entity_id: null },
    orderBy: { timestamp: "desc" },
    select: { event_hash: true },
  });

  const audit_id = randomUUID();
  const timestamp = new Date();
  // 12C.0 Item 7: merge system_principal into details so subsystem
  // attribution is preserved in the row AND participates in the
  // canonical hash (canonicalJson(details) walks every key). Existing
  // emissions without system_principal write unchanged details
  // (DRIFT 12 backwards-compat: legacy rows have no system_principal
  // key; the canonical hash for those continues to compute identically).
  const details: Record<string, unknown> =
    input.system_principal !== undefined && input.system_principal !== null
      ? { ...(input.details ?? {}), system_principal: input.system_principal }
      : (input.details ?? {});
  const previous_event_hash = previous?.event_hash ?? null;

  const event_hash = sha256Hex(
    canonicalRecord({
      audit_id,
      event_type: input.event_type,
      actor_entity_id: input.actor_entity_id ?? null,
      target_entity_id: input.target_entity_id ?? null,
      target_capsule_id: input.target_capsule_id ?? null,
      session_id: input.session_id ?? null,
      outcome: input.outcome,
      denial_reason: input.denial_reason ?? null,
      details,
      ip_address: input.ip_address ?? null,
      timestamp,
      previous_event_hash,
    }),
  );

  return tx.auditEvent.create({
    data: {
      audit_id,
      event_type: input.event_type,
      actor_entity_id: input.actor_entity_id ?? null,
      target_entity_id: input.target_entity_id ?? null,
      target_capsule_id: input.target_capsule_id ?? null,
      session_id: input.session_id ?? null,
      outcome: input.outcome,
      denial_reason: input.denial_reason ?? null,
      details: details as Prisma.InputJsonValue,
      ip_address: input.ip_address ?? null,
      timestamp,
      previous_event_hash,
      event_hash,
    },
  });
}

// WHAT: Insert one row into audit_events, computing the chain hash and
//        linking it to the previous event in the actor's chain.
// INPUT: A WriteAuditEventInput, plus an optional transaction client
//        for callers that want this write to happen inside their own
//        outer transaction (Phase 0, Phase 3, etc.).
// OUTPUT: The newly created AuditEvent record.
// WHY: This is the only legal way to put data into audit_events. We
//      hold an advisory lock on the chain so two concurrent writers
//      cannot link to the same previous event. When tx is omitted we
//      open our own transaction (existing behavior, Section 1E
//      baseline tests rely on this). When tx is provided we run the
//      lock + lookup + insert inside it -- the outer transaction's
//      commit/rollback determines whether the audit row persists,
//      which is exactly what hash-chain integrity requires when
//      composing with a multi-step atomic flow.
export async function writeAuditEvent(
  input: WriteAuditEventInput,
  tx?: Prisma.TransactionClient,
): Promise<AuditEvent> {
  if (tx !== undefined) {
    return writeAuditEventInTx(tx, input);
  }
  return prisma.$transaction((innerTx) => writeAuditEventInTx(innerTx, input));
}

// WHAT: Read a paginated, filtered slice of audit_events.
// INPUT: A QueryAuditEventsFilters object (any subset of the fields).
// OUTPUT: A QueryAuditEventsResult with events plus paging metadata.
// WHY: Compliance reviewers and admin dashboards need to browse the
//      audit-of-record. Hard-capping page_size at 100 makes it harder
//      for a careless query to drag the database down.
export async function queryAuditEvents(
  filters: QueryAuditEventsFilters = {},
): Promise<QueryAuditEventsResult> {
  const requestedSize = filters.page_size ?? 50;
  const page_size = Math.max(
    1,
    Math.min(MAX_AUDIT_EVENTS_PAGE_SIZE, requestedSize),
  );
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.AuditEventWhereInput = {};
  if (filters.actor_entity_id) where.actor_entity_id = filters.actor_entity_id;
  if (filters.target_entity_id)
    where.target_entity_id = filters.target_entity_id;
  if (filters.target_capsule_id)
    where.target_capsule_id = filters.target_capsule_id;
  if (filters.event_type) where.event_type = filters.event_type;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.start_time || filters.end_time) {
    where.timestamp = {};
    if (filters.start_time) where.timestamp.gte = filters.start_time;
    if (filters.end_time) where.timestamp.lte = filters.end_time;
  }

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * page_size,
      take: page_size,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, page, page_size, total };
}

// WHAT: Walk an entity's audit chain and confirm every link still
//        matches.
// INPUT: The entity_id whose chain to verify.
// OUTPUT: A VerifyAuditChainResult.
// WHY: Tamper detection. A break tells the operator either a row was
//      modified or the trigger was disabled and someone deleted /
//      reordered events. brokenAt names the first row whose stored
//      event_hash does not match a freshly recomputed hash, OR whose
//      previous_event_hash does not match the prior row's stored hash.
export async function verifyAuditChain(
  entityId: string,
): Promise<VerifyAuditChainResult> {
  const events = await prisma.auditEvent.findMany({
    where: { actor_entity_id: entityId },
    orderBy: { timestamp: "asc" },
  });

  let priorHash: string | null = null;
  for (const e of events) {
    if (e.previous_event_hash !== priorHash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAt: e.audit_id,
      };
    }
    const recomputed = sha256Hex(
      canonicalRecord({
        audit_id: e.audit_id,
        event_type: e.event_type,
        actor_entity_id: e.actor_entity_id,
        target_entity_id: e.target_entity_id,
        target_capsule_id: e.target_capsule_id,
        session_id: e.session_id,
        outcome: e.outcome,
        denial_reason: e.denial_reason,
        details: e.details,
        ip_address: e.ip_address,
        timestamp: e.timestamp,
        previous_event_hash: e.previous_event_hash,
      }),
    );
    if (recomputed !== e.event_hash) {
      return {
        valid: false,
        totalEvents: events.length,
        brokenAt: e.audit_id,
      };
    }
    priorHash = e.event_hash;
  }

  return { valid: true, totalEvents: events.length, brokenAt: null };
}

// WHAT: Return the most recent event_hash for an entity's chain.
// INPUT: The entity_id.
// OUTPUT: A 64-character hex string, or null if the chain is empty.
// WHY: External callers that batch-write events sometimes want to
//      preview the chain head without doing a write of their own.
export async function getLatestEventHash(
  entityId: string,
): Promise<string | null> {
  const latest = await prisma.auditEvent.findFirst({
    where: { actor_entity_id: entityId },
    orderBy: { timestamp: "desc" },
    select: { event_hash: true },
  });
  return latest?.event_hash ?? null;
}

export { prisma } from "../client.js";
