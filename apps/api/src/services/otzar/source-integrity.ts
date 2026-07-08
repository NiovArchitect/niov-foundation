// FILE: source-integrity.ts
// PURPOSE: [SOURCE-INTEGRITY] The trust-critical source-lifecycle model for
//          imported DOCUMENT_CONTEXT rows — a PURE LEAF module (no app-service
//          imports, no I/O) so the connector → otzar import direction stays
//          acyclic. Three concerns live here, all reused 3+ times:
//            1. The lifecycle STATE model (details.source_integrity.state) and
//               which states are DEMOTED (excluded from active retrieval).
//            2. A pure predicate the 3 retrieval pools call to drop a demoted
//               row (candidates, background-answer, boundaries).
//            3. The pure import-text validator (empty / binary-or-unreadable)
//               run BEFORE any trusted row is created — no partial trusted row.
//
//          LIFECYCLE MAPPING (where each terminal fact is recorded):
//            - CANCELLED  = ledger `status` (NOT stored here) — withdrawn row.
//            - RETIRED    = details.context_lifecycle (context-lifecycle.ts) —
//                           admin retired from active use; row preserved.
//            - QUARANTINED = a REJECTED import — NO row is created at all
//                           (the validator refuses before the write).
//            - AVAILABLE / SNAPSHOTTED / CHANGED_UPSTREAM / ACCESS_REVOKED /
//              SOURCE_DELETED / CORRUPT_OR_INVALID / UNREADABLE live HERE in
//              details.source_integrity.state on the imported row.
//          SNAPSHOTTED is a RESERVED active state (no path writes it today).
// CONNECTS TO: document-context.service.ts (import success + revalidation
//          writer), connector-data-read.service.ts (validator at the export
//          seam), and the 3 retrieval pools (context-candidates.service.ts,
//          background-answer.service.ts, context-boundaries.service.ts).

export const SOURCE_INTEGRITY_STATES = [
  "AVAILABLE",
  "SNAPSHOTTED",
  "CHANGED_UPSTREAM",
  "ACCESS_REVOKED",
  "SOURCE_DELETED",
  "CORRUPT_OR_INVALID",
  "UNREADABLE",
] as const;
export type SourceIntegrityState = (typeof SOURCE_INTEGRITY_STATES)[number];

// The additive JSON stamped on an IMPORTED DOCUMENT_CONTEXT row (never on a
// manual seed — a manual seed carries no source_integrity, and an absent
// source_integrity is ACTIVE by definition). import_hash PRESERVES the
// snapshot hash (== external_source.content_sha256) and MUST NOT be
// overwritten by revalidation; upstream_hash carries the NEW upstream hash
// only when state === CHANGED_UPSTREAM.
export interface SourceIntegrity {
  state: SourceIntegrityState;
  import_hash: string;
  import_modified_time: string;
  last_verified_at: string;
  upstream_hash?: string;
  upstream_checked_at?: string;
  last_state_reason?: string;
}

// States that DEMOTE a row out of ACTIVE retrieval. A row with NO
// source_integrity, or state AVAILABLE / SNAPSHOTTED, stays active. This is a
// closed demoted-set (NOT an active-allowlist) because the demoted states are
// exactly the terminal integrity failures; a future ACTIVE state must be
// added to SOURCE_INTEGRITY_STATES deliberately, and is active-by-default.
const DEMOTED_SOURCE_INTEGRITY_STATES: ReadonlySet<string> = new Set([
  "CHANGED_UPSTREAM",
  "ACCESS_REVOKED",
  "SOURCE_DELETED",
  "CORRUPT_OR_INVALID",
  "UNREADABLE",
]);

// WHAT: True when a row's details.source_integrity.state is a DEMOTED state.
// WHY: The 3 retrieval pools call this to exclude a snapshot whose upstream
//      changed/vanished/lost-access/became-corrupt — WITHOUT touching ledger
//      status (revalidation demotes via source_integrity, never via status).
//      Absent source_integrity → false (manual seeds + pre-existing rows are
//      active). This is a JS post-filter because Prisma JSON filtering can not
//      express a nested NOT-IN-set without leaking future states.
export function isSourceIntegrityDemoted(details: unknown): boolean {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return false;
  }
  const si = (details as Record<string, unknown>).source_integrity;
  if (typeof si !== "object" || si === null || Array.isArray(si)) return false;
  const state = (si as Record<string, unknown>).state;
  return typeof state === "string" && DEMOTED_SOURCE_INTEGRITY_STATES.has(state);
}

// ── Import-text validator (no partial trusted row) ───────────────────────

export type ImportTextValidation =
  | { ok: true }
  | { ok: false; code: "SOURCE_EMPTY" | "SOURCE_UNREADABLE" };

// Fraction of control chars (excluding \t \n \r) above which text is treated
// as binary/unreadable rather than a document someone would trust.
const UNREADABLE_CONTROL_RATIO = 0.1;

// WHAT: Pure gate on exported text run BEFORE any trusted row is created.
// INPUT: The raw exported document text.
// OUTPUT: ok, or an honest reject code (SOURCE_EMPTY | SOURCE_UNREADABLE).
// WHY: A trusted DOCUMENT_CONTEXT snapshot must be real text. Empty /
//      whitespace-only text is not a source of truth; a null byte or a high
//      density of non-printable control chars means the export is binary or
//      corrupt, never a document. The caller (fetch seam) refuses with this
//      code, quarantines via audit, and creates NO row. Deterministic + pure.
export function validateImportedText(text: string): ImportTextValidation {
  if (text.trim().length === 0) return { ok: false, code: "SOURCE_EMPTY" };
  // A null byte is an unambiguous binary/corrupt signal on its own.
  if (text.includes("\u0000")) return { ok: false, code: "SOURCE_UNREADABLE" };
  let control = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // C0 control chars except tab (9), line feed (10), carriage return (13),
    // plus DEL (127). Printable text keeps these near zero.
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
      control++;
    }
  }
  if (control / text.length > UNREADABLE_CONTROL_RATIO) {
    return { ok: false, code: "SOURCE_UNREADABLE" };
  }
  return { ok: true };
}
