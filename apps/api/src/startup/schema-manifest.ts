// FILE: apps/api/src/startup/schema-manifest.ts
// PURPOSE: [OTZAR-CONTINUITY P6] The authoritative, EXPLICIT startup schema-
//          compatibility manifest. Generalizes the narrow IntegrationCredential
//          identity guard into one reviewed contract of every runtime-critical
//          table/column/constraint the deployed code depends on. Run BEFORE app
//          construction, schedulers, and listen — an incompatible database fails
//          the boot loudly instead of degrading at request time.
// SCOPE: read-only; current_schema()-scoped; verifies table existence, column
//        canonical Postgres type, MATERIAL nullability (only where the code relies
//        on NOT NULL), and correctness-critical UNIQUE constraints. It does NOT
//        assert performance-only indexes. It never writes, never creates, never
//        bypasses, and has no warn-only mode. It is hand-authored + reviewed, NOT
//        generated from Prisma.
// CONNECTS TO: apps/api/src/server.ts (startApiServer runs assertSchemaManifestCompatible
//        before build + listen), startup/integration-credential-schema-guard.ts
//        (its REQUIRED_IDENTITY_COLUMNS are folded in here as one manifest entry).

import { REQUIRED_IDENTITY_COLUMNS } from "./integration-credential-schema-guard.js";

export const STARTUP_SCHEMA_INCOMPATIBLE = "STARTUP_SCHEMA_INCOMPATIBLE";
export const STARTUP_SCHEMA_PROBE_UNAVAILABLE = "STARTUP_SCHEMA_PROBE_UNAVAILABLE";

export interface ColumnRequirement {
  name: string;
  /** Canonical `information_schema.columns.data_type` (e.g. "uuid", "text", "integer"). */
  dataType: string;
  /** Assert NOT NULL only when the code relies on it (material nullability). */
  notNull?: boolean;
}
export interface UniqueRequirement {
  /** Column set (order-insensitive) that must be covered by a UNIQUE index. */
  columns: string[];
}
export interface TableRequirement {
  table: string;
  columns: ColumnRequirement[];
  uniques?: UniqueRequirement[];
}

// The reviewed manifest. Ordered; issues are reported in this order for
// deterministic operator output.
export const SCHEMA_MANIFEST: TableRequirement[] = [
  {
    // Incident-critical (FND 371542f): the six Google account-identity columns.
    table: "integration_credentials",
    columns: REQUIRED_IDENTITY_COLUMNS.map((name) => ({
      name,
      dataType:
        name === "external_account_email_verified"
          ? "boolean"
          : name.endsWith("_at")
            ? "timestamp without time zone"
            : "text",
    })),
  },
  {
    // Incident-critical: the voice-note capsule link.
    table: "memory_capsules",
    columns: [{ name: "voice_note_id", dataType: "uuid" }],
  },
  {
    // OTZAR-CONTINUITY P5 Stage 1 — thread lifecycle + atomic sequence allocator.
    table: "otzar_conversations",
    columns: [
      { name: "org_entity_id", dataType: "uuid" },
      { name: "status", dataType: "text", notNull: true },
      { name: "last_active_at", dataType: "timestamp without time zone" },
      { name: "deleted_at", dataType: "timestamp without time zone" },
      { name: "turn_seq", dataType: "integer", notNull: true },
    ],
  },
  {
    // OTZAR-CONTINUITY P5 Stage 1 — durable turn transcript.
    table: "otzar_conversation_turns",
    columns: [
      { name: "conversation_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "subject_entity_id", dataType: "uuid", notNull: true },
      { name: "author_entity_id", dataType: "uuid", notNull: true },
      { name: "role", dataType: "text", notNull: true },
      { name: "content", dataType: "text", notNull: true },
      { name: "content_hash", dataType: "text", notNull: true },
      { name: "sequence", dataType: "integer", notNull: true },
    ],
    uniques: [
      { columns: ["conversation_id", "sequence"] },
      { columns: ["conversation_id", "request_id"] },
    ],
  },
  {
    // OTZAR-CONTINUITY P5 Stage 1 §2 — durable logical-request processing state.
    table: "otzar_conversation_requests",
    columns: [
      { name: "request_record_id", dataType: "uuid", notNull: true },
      { name: "conversation_id", dataType: "uuid", notNull: true },
      { name: "user_turn_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "subject_entity_id", dataType: "uuid", notNull: true },
      { name: "twin_entity_id", dataType: "uuid", notNull: true },
      { name: "content_hash", dataType: "text", notNull: true },
      { name: "state", dataType: "text", notNull: true },
      { name: "processing_version", dataType: "integer", notNull: true },
      { name: "attempt_count", dataType: "integer", notNull: true },
    ],
    uniques: [
      { columns: ["user_turn_id"] },
      { columns: ["canonical_assistant_turn_id"] },
      { columns: ["conversation_id", "client_request_id"] },
    ],
  },
  {
    // OTZAR STAGE-2 §5 — durable organizational obligations. Only runtime-critical columns are
    // asserted; notNull only where the query/service layer relies on it. The correctness-
    // critical UNIQUE is the create-or-get idempotency key (org_entity_id, origin_key).
    table: "obligations",
    columns: [
      { name: "obligation_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "subject_entity_id", dataType: "uuid", notNull: true },
      { name: "creator_entity_id", dataType: "uuid", notNull: true },
      { name: "responsible_entity_id", dataType: "uuid", notNull: true },
      { name: "obligation_type", dataType: "text", notNull: true },
      { name: "title", dataType: "text", notNull: true },
      { name: "details", dataType: "jsonb", notNull: true },
      { name: "priority", dataType: "text", notNull: true },
      { name: "source_channel", dataType: "text", notNull: true },
      { name: "provenance_class", dataType: "text", notNull: true },
      { name: "state", dataType: "text", notNull: true },
      { name: "version", dataType: "integer", notNull: true },
      { name: "visibility_scope", dataType: "text", notNull: true },
      { name: "retention_class", dataType: "text", notNull: true },
      { name: "origin_key", dataType: "text" },
      { name: "action_ref", dataType: "uuid" },
      { name: "completion_turn_id", dataType: "uuid" },
      { name: "completion_action_ref", dataType: "uuid" },
      { name: "acknowledged_turn_id", dataType: "uuid" },
      { name: "created_at", dataType: "timestamp without time zone", notNull: true },
      { name: "updated_at", dataType: "timestamp without time zone", notNull: true },
      { name: "completed_at", dataType: "timestamp without time zone" },
    ],
    uniques: [{ columns: ["org_entity_id", "origin_key"] }],
  },
  {
    // OTZAR STAGE-2 §L — governed responsibility handoffs.
    table: "handoffs",
    columns: [
      { name: "handoff_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "creator_entity_id", dataType: "uuid", notNull: true },
      { name: "outgoing_responsible_entity_id", dataType: "uuid", notNull: true },
      { name: "incoming_responsible_entity_id", dataType: "uuid" },
      { name: "workspace_id", dataType: "uuid" },
      { name: "title", dataType: "text", notNull: true },
      { name: "details", dataType: "jsonb", notNull: true },
      { name: "priority", dataType: "text", notNull: true },
      { name: "state", dataType: "text", notNull: true },
      { name: "version", dataType: "integer", notNull: true },
      { name: "visibility_scope", dataType: "text", notNull: true },
      { name: "retention_class", dataType: "text", notNull: true },
      { name: "origin_key", dataType: "text" },
      { name: "acknowledged_by_entity_id", dataType: "uuid" },
      { name: "acknowledged_turn_id", dataType: "uuid" },
      { name: "created_at", dataType: "timestamp without time zone", notNull: true },
      { name: "updated_at", dataType: "timestamp without time zone", notNull: true },
      { name: "completed_at", dataType: "timestamp without time zone" },
    ],
    uniques: [{ columns: ["org_entity_id", "origin_key"] }],
  },
  {
    // OTZAR STAGE-2 §L — handoff↔obligation link + per-obligation disposition.
    table: "handoff_obligations",
    columns: [
      { name: "handoff_obligation_id", dataType: "uuid", notNull: true },
      { name: "handoff_id", dataType: "uuid", notNull: true },
      { name: "obligation_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "disposition", dataType: "text", notNull: true },
      { name: "created_at", dataType: "timestamp without time zone", notNull: true },
    ],
    uniques: [{ columns: ["handoff_id", "obligation_id"] }],
  },
  {
    // OTZAR STAGE-2 TRUTH-EVIDENCE — point-in-time evidence snapshots.
    table: "truth_evidence_snapshots",
    columns: [
      { name: "snapshot_id", dataType: "uuid", notNull: true },
      { name: "org_entity_id", dataType: "uuid", notNull: true },
      { name: "decision_point", dataType: "text", notNull: true },
      { name: "source_record_type", dataType: "text", notNull: true },
      { name: "source_record_id", dataType: "uuid", notNull: true },
      { name: "source_version", dataType: "integer" },
      { name: "source_hash", dataType: "text" },
      { name: "resolver_version", dataType: "text", notNull: true },
      { name: "evidence_fingerprint", dataType: "text", notNull: true },
      { name: "metadata", dataType: "jsonb", notNull: true },
      { name: "conflict_indicator", dataType: "boolean", notNull: true },
      { name: "superseded_at_capture", dataType: "boolean", notNull: true },
      { name: "origin_key", dataType: "text" },
      { name: "obligation_id", dataType: "uuid" },
      { name: "handoff_id", dataType: "uuid" },
      { name: "captured_at", dataType: "timestamp without time zone", notNull: true },
      { name: "created_at", dataType: "timestamp without time zone", notNull: true },
    ],
    uniques: [{ columns: ["org_entity_id", "origin_key"] }],
  },
];

// Minimal read-only probe seam (prisma satisfies this).
export interface SchemaProbe {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export type SchemaIssue =
  | { table: string; kind: "table_missing" }
  | { table: string; kind: "column_missing"; column: string }
  | { table: string; kind: "column_type"; column: string; expected: string; actual: string }
  | { table: string; kind: "column_nullable"; column: string }
  | { table: string; kind: "unique_missing"; columns: string[] };

export type ManifestCheckResult =
  | { status: "compatible" }
  | { status: "incompatible"; issues: SchemaIssue[] };

export class StartupSchemaIncompatibleError extends Error {
  readonly code = STARTUP_SCHEMA_INCOMPATIBLE;
  readonly issues: readonly SchemaIssue[];
  constructor(issues: readonly SchemaIssue[]) {
    super(
      `[startup] ${STARTUP_SCHEMA_INCOMPATIBLE}: the database is behind this Foundation ` +
        `SHA. Apply the approved additive schema before deploying. Issues: ` +
        issues.map(describeIssue).join("; ") +
        ".",
    );
    this.name = "StartupSchemaIncompatibleError";
    this.issues = issues;
  }
}

export class StartupSchemaProbeUnavailableError extends Error {
  readonly code = STARTUP_SCHEMA_PROBE_UNAVAILABLE;
  constructor() {
    super(
      "[startup] could not verify schema compatibility — the database was unreachable " +
        "or a catalog query failed.",
    );
    this.name = "StartupSchemaProbeUnavailableError";
  }
}

// Sanitized (no row/user data, no connection string, no driver text).
function describeIssue(i: SchemaIssue): string {
  switch (i.kind) {
    case "table_missing":
      return `table ${i.table} missing`;
    case "column_missing":
      return `${i.table}.${i.column} missing`;
    case "column_type":
      return `${i.table}.${i.column} type ${i.actual} (expected ${i.expected})`;
    case "column_nullable":
      return `${i.table}.${i.column} is nullable (must be NOT NULL)`;
    case "unique_missing":
      return `${i.table} missing UNIQUE(${i.columns.join(", ")})`;
  }
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

async function probeColumns(db: SchemaProbe, table: string): Promise<ColumnRow[]> {
  return db.$queryRawUnsafe<ColumnRow[]>(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
      "WHERE table_schema = current_schema() AND table_name = $1",
    table,
  );
}

// Ordered column sets of every UNIQUE index on the table, scoped to current_schema().
async function probeUniqueColumnSets(db: SchemaProbe, table: string): Promise<Set<string>[]> {
  const rows = await db.$queryRawUnsafe<Array<{ cols: string[] }>>(
    `SELECT array_agg(a.attname) AS cols
       FROM pg_index x
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(x.indkey)
      WHERE n.nspname = current_schema() AND t.relname = $1 AND x.indisunique
      GROUP BY x.indexrelid`,
    table,
  );
  return rows.map((r) => new Set(r.cols));
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export async function checkSchemaManifest(db: SchemaProbe): Promise<ManifestCheckResult> {
  const issues: SchemaIssue[] = [];
  for (const req of SCHEMA_MANIFEST) {
    const cols = await probeColumns(db, req.table);
    if (!Array.isArray(cols) || cols.length === 0) {
      issues.push({ table: req.table, kind: "table_missing" });
      continue; // no point checking columns of an absent table
    }
    const byName = new Map(cols.map((c) => [c.column_name, c]));
    for (const col of req.columns) {
      const actual = byName.get(col.name);
      if (actual === undefined) {
        issues.push({ table: req.table, kind: "column_missing", column: col.name });
        continue;
      }
      if (actual.data_type !== col.dataType) {
        issues.push({
          table: req.table, kind: "column_type", column: col.name,
          expected: col.dataType, actual: actual.data_type,
        });
      }
      if (col.notNull === true && actual.is_nullable !== "NO") {
        issues.push({ table: req.table, kind: "column_nullable", column: col.name });
      }
    }
    if (req.uniques && req.uniques.length > 0) {
      const present = await probeUniqueColumnSets(db, req.table);
      for (const u of req.uniques) {
        const want = new Set(u.columns);
        if (!present.some((p) => setEquals(p, want))) {
          issues.push({ table: req.table, kind: "unique_missing", columns: u.columns });
        }
      }
    }
  }
  return issues.length === 0 ? { status: "compatible" } : { status: "incompatible", issues };
}

/**
 * Fail-closed startup assertion. Resolves if compatible; throws
 * StartupSchemaIncompatibleError for a definitively behind schema, or
 * StartupSchemaProbeUnavailableError when the probe itself could not run (DB
 * unreachable) — distinct so a DB outage is never misreported as a schema gap.
 */
export async function assertSchemaManifestCompatible(db: SchemaProbe): Promise<void> {
  let result: ManifestCheckResult;
  try {
    result = await checkSchemaManifest(db);
  } catch {
    throw new StartupSchemaProbeUnavailableError();
  }
  if (result.status === "compatible") return;
  throw new StartupSchemaIncompatibleError(result.issues);
}
