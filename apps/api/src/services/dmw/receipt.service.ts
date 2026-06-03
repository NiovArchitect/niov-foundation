// FILE: receipt.service.ts
// PURPOSE: DMW Runtime DM1-B per ADR-0092 §4 Candidate A — closes
//          the Consent + Receipt pair. The Receipt is the
//          cryptographic proof-of-grant artifact a caller can
//          present later (e.g. to a regulator / auditor /
//          counterparty) so they can verify the consent's
//          governance lineage without trusting the receipt
//          presenter.
//
//          receipt_hash is a SHA-256 fingerprint over the
//          canonical record (consent_id + permission_id +
//          audit_event_id + timestamp_sealed). The audit_event_id
//          reference chains the Receipt into the existing
//          append-only audit substrate per ADR-0002 + RULE 4
//          so the Receipt itself does NOT need its own audit
//          literal — the audit chain that the CONSENT_GRANT_
//          RECORDED emission produced is the canonical event
//          record; the Receipt is a per-snapshot fingerprint of
//          that record.
//
//          NO new audit literal lands at this slice. NO additional
//          mutation of the ConsentGrant row. Receipt-presentation
//          API at user-facing tier is forward-substrate per
//          ADR-0092 §Consequences.
//
// CONNECTS TO:
//   - packages/database (prisma.receipt + prisma.consentGrant)
//   - @niov/auth (CRYPTO_CONFIG canonical hash algorithm)
//   - ADR-0092 §4 Candidate A Consent + Receipt pair
//   - ADR-0002 audit chain (Receipt references AuditEvent by id;
//     never mutates the audit chain)
//   - ADR-0019 cryptographic suite (SHA-256 via CRYPTO_CONFIG)

import { createHash } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import { prisma } from "@niov/database";

export type ReceiptSummary = {
  receipt_id: string;
  consent_id: string;
  permission_id: string | null;
  audit_event_id: string | null;
  timestamp_sealed: Date;
  receipt_hash: string;
};

export type IssueReceiptInput = {
  consent_id: string;
  audit_event_id?: string | null;
  permission_id?: string | null;
};

export type IssueReceiptResult =
  | { ok: true; receipt: ReceiptSummary }
  | {
      ok: false;
      code: "CONSENT_NOT_FOUND";
      httpStatus: 404;
    }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WHAT: Canonical record builder for the Receipt fingerprint.
// INPUT: The 4 canonical fields the receipt_hash covers.
// OUTPUT: A canonical concatenated string.
// WHY: Pipe-delimited concatenation is parser-unambiguous and
//      deterministic. SHA-256 hashes this exact byte sequence so
//      a regulator/auditor can reproduce the hash from the
//      audit chain without ambiguity. NEVER includes free-text;
//      every field is a UUID or ISO timestamp.
export function buildReceiptCanonicalRecord(args: {
  consent_id: string;
  permission_id: string | null;
  audit_event_id: string | null;
  timestamp_sealed: Date;
}): string {
  return [
    args.consent_id,
    args.permission_id ?? "",
    args.audit_event_id ?? "",
    args.timestamp_sealed.toISOString(),
  ].join("|");
}

// WHAT: Compute the receipt_hash per ADR-0019 cryptographic
//        suite + ADR-0033 canonical_record byte-equivalence
//        pattern.
// INPUT: The 4 canonical fields.
// OUTPUT: A hex-encoded SHA-256 digest.
// WHY: Pure function — testable independently of Prisma. The
//      digest is over `${HASH_ALGORITHM}` from CRYPTO_CONFIG so
//      a future PQC migration via ADR-0019 amendment swaps in
//      one place.
export function computeReceiptHash(args: {
  consent_id: string;
  permission_id: string | null;
  audit_event_id: string | null;
  timestamp_sealed: Date;
}): string {
  const canonical = buildReceiptCanonicalRecord(args);
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM)
    .update(canonical)
    .digest("hex");
}

function project(
  row: NonNullable<Awaited<ReturnType<typeof prisma.receipt.findUnique>>>,
): ReceiptSummary {
  return {
    receipt_id: row.receipt_id,
    consent_id: row.consent_id,
    permission_id: row.permission_id,
    audit_event_id: row.audit_event_id,
    timestamp_sealed: row.timestamp_sealed,
    receipt_hash: row.receipt_hash,
  };
}

// WHAT: Issue a Receipt for an existing ConsentGrant.
// INPUT: consent_id (required) + optional audit_event_id +
//        optional permission_id.
// OUTPUT: IssueReceiptResult discriminated union.
// WHY: ADR-0092 §4 Candidate A Receipt issuance primitive. The
//      Receipt references the CONSENT_GRANT_RECORDED audit
//      event by id so future audit-chain verifiers can match
//      the receipt_hash against the chain. Returns 404
//      CONSENT_NOT_FOUND if the consent_id doesn't resolve;
//      returns 422 INVALID_FIELD if any field fails the
//      canonical shape check. No audit emission — the Receipt
//      is a pure derivative; the upstream CONSENT_GRANT_RECORDED
//      audit event is the canonical lifecycle record.
export async function issueReceiptForConsent(
  input: IssueReceiptInput,
): Promise<IssueReceiptResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.consent_id)) invalid.push("consent_id");
  if (
    input.audit_event_id !== undefined &&
    input.audit_event_id !== null &&
    !UUID_RE.test(input.audit_event_id)
  ) {
    invalid.push("audit_event_id");
  }
  if (
    input.permission_id !== undefined &&
    input.permission_id !== null &&
    !UUID_RE.test(input.permission_id)
  ) {
    invalid.push("permission_id");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: invalid,
    };
  }
  const consent = await prisma.consentGrant.findUnique({
    where: { consent_id: input.consent_id },
  });
  if (consent === null) {
    return { ok: false, code: "CONSENT_NOT_FOUND", httpStatus: 404 };
  }
  const timestamp_sealed = new Date();
  const permission_id =
    input.permission_id !== undefined && input.permission_id !== null
      ? input.permission_id
      : consent.permission_id;
  const audit_event_id =
    input.audit_event_id !== undefined && input.audit_event_id !== null
      ? input.audit_event_id
      : null;
  const receipt_hash = computeReceiptHash({
    consent_id: input.consent_id,
    permission_id,
    audit_event_id,
    timestamp_sealed,
  });
  const row = await prisma.receipt.create({
    data: {
      consent_id: input.consent_id,
      permission_id,
      audit_event_id,
      timestamp_sealed,
      receipt_hash,
    },
  });
  return { ok: true, receipt: project(row) };
}

// WHAT: Look up a Receipt by its receipt_id.
// INPUT: receipt_id (UUID).
// OUTPUT: ReceiptSummary or null.
// WHY: Pure read; no audit emission. Future consumer-tier
//      consumers MUST scope-verify same-org per ADR-0049
//      GOVSEC.7 at their boundary by chaining through
//      consent_id → grantor_entity_id → org_entity_id; this
//      helper is a primitive.
export async function getReceiptById(
  receipt_id: string,
): Promise<ReceiptSummary | null> {
  if (!UUID_RE.test(receipt_id)) return null;
  const row = await prisma.receipt.findUnique({ where: { receipt_id } });
  return row === null ? null : project(row);
}

// WHAT: Verify that a Receipt's stored receipt_hash matches the
//        canonical hash of its other fields. Pure read; no Prisma
//        write. Useful for regulator/auditor verification flows.
// INPUT: A ReceiptSummary (typically loaded via getReceiptById).
// OUTPUT: true if the stored hash matches the recomputed hash;
//         false otherwise.
// WHY: Tamper-evidence at the receipt tier. If a hostile actor
//      mutated the receipt row directly (bypassing the service),
//      the stored hash and the recomputed hash will diverge. The
//      audit chain at ADR-0002 catches most tampering at the
//      AuditEvent tier; this verification gives the Receipt its
//      own tamper-evidence layer.
export function verifyReceiptHash(receipt: ReceiptSummary): boolean {
  const expected = computeReceiptHash({
    consent_id: receipt.consent_id,
    permission_id: receipt.permission_id,
    audit_event_id: receipt.audit_event_id,
    timestamp_sealed: receipt.timestamp_sealed,
  });
  return expected === receipt.receipt_hash;
}
