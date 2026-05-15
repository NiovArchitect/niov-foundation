// FILE: queries/lawful-basis.ts
// PURPOSE: LawfulBasis query/service helpers — canonical hashing,
//          row creation, audit_id backfill linking, validity check.
//          Sub-phase 3 of the CAR Sub-box 3 mini-arc per ADR-0036.
// CONNECTS TO: lawful_bases table in schema.prisma; LawfulBasisType
//              enum; AuditEvent.audit_id (nullable FK by design;
//              backfilled after AuditEvent write to avoid circular
//              chain dependency per ADR-0036 Sub-decision 5);
//              packages/database/src/queries/audit.ts (sub-phase 4
//              audit-chain extension will include lawful_basis_id +
//              lawful_basis_chain_hash in canonicalRecord/1).
//
// Sub-phase 3 substantive scope (per Q1-Q10 LOCKED):
//   - Pipe-joined canonical content per Q1 LOCKED (mirrors ADR-0033
//     §4a canonical_record/1 pattern; sub-phase 4 Elixir mirror at
//     apps/cosmp_router/lib/cosmp_router/audit.ex byte-equivalent).
//   - SHA-256 via CRYPTO_CONFIG.HASH_ALGORITHM per Q2 LOCKED
//     (matches computeTARHash precedent at tar.ts:171 + ADR-0019
//     cryptographic-suite posture canonical).
//   - Hybrid binding per ADR-0036 Sub-decision 5: chain_hash NOT NULL
//     on LawfulBasis row + audit_id nullable + idempotent backfill
//     helper per Q7 LOCKED.
//
// Patent-implementation evidence (ADR-0020 Register-2; CAR §2.2
// Family 1): the chain_hash field is included in the AuditEvent
// canonical_record/1 (sub-phase 4 register) so that LawfulBasis
// content tampering invalidates AuditEvent.event_hash and breaks
// chain verification per ADR-0002 BEFORE DELETE trigger canonical.

import { createHash } from "node:crypto";
import { CRYPTO_CONFIG } from "@niov/auth";
import type { LawfulBasis, LawfulBasisType, Prisma } from "@prisma/client";
import { prisma } from "../client.js";

// WHAT: Hashable subset of LawfulBasis fields used as canonical
//        content input for chain_hash computation. Per Q1 LOCKED:
//        does NOT include audit_id (avoids circularity), chain_hash
//        (avoids self-reference), basis_id (UUID not load-bearing),
//        created_at / updated_at (DB-managed timestamps).
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: 5 fields canonical at substantive register per ADR-0036
//      Sub-decision 5; ordering pinned at canonicalLawfulBasisContent.
export interface LawfulBasisHashableFields {
  basis_type: LawfulBasisType;
  basis_reference: string;
  jurisdiction_invoked: string;
  valid_from: Date;
  valid_until: Date;
}

// WHAT: Input shape for createLawfulBasis. Mirrors hashable fields;
//        chain_hash is computed automatically and audit_id starts
//        null per ADR-0036 Sub-decision 5.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Caller should not supply chain_hash directly (computed) or
//      audit_id (backfilled after AuditEvent write).
export interface CreateLawfulBasisInput extends LawfulBasisHashableFields {}

// WHAT: Pipe-joined canonical string for SHA-256 hash input. Mirrors
//        ADR-0033 §4a canonical_record/1 pattern; field order is
//        load-bearing for byte-equivalence with sub-phase 4 Elixir
//        mirror.
// INPUT: A LawfulBasisHashableFields object.
// OUTPUT: A pipe-joined string with 5 fields in pinned order.
// WHY: Per Q1 LOCKED Option α canonical at substantive register.
//      Pipe-joined form chosen over canonicalJson for sub-phase 4
//      Elixir-mirror clarity (matches canonical_record/1 idiom).
//      Date.toISOString() emits millisecond ISO 8601 UTC per ADR-0033
//      D-5BII-EXEC-2 millisecond-precision canonical.
export function canonicalLawfulBasisContent(
  input: LawfulBasisHashableFields,
): string {
  return [
    input.basis_type,
    input.basis_reference,
    input.jurisdiction_invoked,
    input.valid_from.toISOString(),
    input.valid_until.toISOString(),
  ].join("|");
}

// WHAT: SHA-256 hex hash of the canonical LawfulBasis content.
// INPUT: A LawfulBasisHashableFields object.
// OUTPUT: A 64-character lowercase hex string.
// WHY: The cryptographic content-commitment per ADR-0036 Sub-decision
//      5 hybrid binding. Sub-phase 4 audit-chain extension includes
//      this hash in AuditEvent canonical_record/1 so that LawfulBasis
//      content tampering invalidates AuditEvent.event_hash.
//      Uses CRYPTO_CONFIG.HASH_ALGORITHM (SHA-256 per ADR-0019) to
//      route through the cryptographic-suite abstraction; matches
//      computeTARHash pattern at tar.ts:171.
export function computeLawfulBasisChainHash(
  input: LawfulBasisHashableFields,
): string {
  const canonical = canonicalLawfulBasisContent(input);
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM)
    .update(canonical)
    .digest("hex");
}

// WHAT: Create a LawfulBasis row inside a caller-supplied transaction
//        client. chain_hash is computed; audit_id starts null and is
//        backfilled by linkLawfulBasisToAuditEventInTx after the
//        AuditEvent for this access is written (sub-phase 4 register).
// INPUT: A Prisma transaction client + CreateLawfulBasisInput.
// OUTPUT: The created LawfulBasis row (audit_id null).
// WHY: Sub-phase 4 audit-chain extension wires this inside a
//      composed transaction with writeAuditEventInTx; sub-phase 3
//      exposes the building block.
export async function createLawfulBasisInTx(
  tx: Prisma.TransactionClient,
  input: CreateLawfulBasisInput,
): Promise<LawfulBasis> {
  const chain_hash = computeLawfulBasisChainHash(input);
  return tx.lawfulBasis.create({
    data: {
      basis_type: input.basis_type,
      basis_reference: input.basis_reference,
      jurisdiction_invoked: input.jurisdiction_invoked,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
      chain_hash,
      // audit_id intentionally omitted; nullable by schema; backfilled
      // post-AuditEvent-write per ADR-0036 Sub-decision 5.
    },
  });
}

// WHAT: Standalone wrapper for createLawfulBasisInTx that opens its
//        own transaction. Useful for tests and standalone callers.
// INPUT: CreateLawfulBasisInput.
// OUTPUT: The created LawfulBasis row.
// WHY: Production callers (sub-phase 4) compose with AuditEvent
//      creation in one transaction via createLawfulBasisInTx; this
//      standalone wrapper is for sub-phase 3 unit tests + future
//      callers that don't need composition.
export async function createLawfulBasis(
  input: CreateLawfulBasisInput,
): Promise<LawfulBasis> {
  return prisma.$transaction((tx) => createLawfulBasisInTx(tx, input));
}

// WHAT: Backfill the audit_id FK on a LawfulBasis row. Idempotent
//        only while audit_id is null per Q7 LOCKED Option α; throws
//        on attempt to overwrite a different audit_id (preserves
//        audit-chain integrity).
// INPUT: A Prisma transaction client + basis_id + audit_id.
// OUTPUT: The updated LawfulBasis row.
// WHY: ADR-0036 Sub-decision 5 hybrid binding; LawfulBasis is created
//      with audit_id null (avoids circular chain dependency); the
//      audit_id is backfilled after the AuditEvent referencing this
//      LawfulBasis is written (sub-phase 4 composed transaction).
//      Idempotency on identical audit_id allows safe retry; rejection
//      of overwrite preserves the immutable LawfulBasis ↔ AuditEvent
//      binding canonical at substantive register.
export async function linkLawfulBasisToAuditEventInTx(
  tx: Prisma.TransactionClient,
  basis_id: string,
  audit_id: string,
): Promise<LawfulBasis> {
  const existing = await tx.lawfulBasis.findUnique({ where: { basis_id } });
  if (!existing) {
    throw new Error(`LawfulBasis not found: ${basis_id}`);
  }

  if (existing.audit_id === null) {
    return tx.lawfulBasis.update({
      where: { basis_id },
      data: { audit_id },
    });
  }

  if (existing.audit_id === audit_id) {
    // Idempotent no-op: same audit_id already linked.
    return existing;
  }

  throw new Error(
    `LawfulBasis ${basis_id} already linked to audit_id ${existing.audit_id}; ` +
      `refusing to overwrite with ${audit_id} (audit-chain integrity).`,
  );
}

// WHAT: Check whether a LawfulBasis row is currently active.
// INPUT: A LawfulBasis row + an optional `now` Date (defaults to
//        new Date()).
// OUTPUT: true if valid_from <= now < valid_until; false otherwise.
// WHY: ADR-0036 Sub-decision 3 + CAR §2.2 time-boundedness invariant:
//      lawful-basis windows are always time-bounded; expired-basis
//      detection canonical at sub-phase 6 COSMP enforcement register.
//      This pure helper is reusable at any tier (service, route,
//      enforcement).
export function isLawfulBasisActive(basis: LawfulBasis, now?: Date): boolean {
  const t = now ?? new Date();
  return basis.valid_from <= t && t < basis.valid_until;
}

// WHAT: Fetch a LawfulBasis row by basis_id.
// INPUT: basis_id string (UUID).
// OUTPUT: The LawfulBasis row or null if not found.
// WHY: Standard CRUD lookup; used by verification flows + tests.
export async function getLawfulBasisById(
  basis_id: string,
): Promise<LawfulBasis | null> {
  return prisma.lawfulBasis.findUnique({ where: { basis_id } });
}
