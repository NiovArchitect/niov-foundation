// FILE: consent-grant.service.ts
// PURPOSE: DMW Runtime DM1-A per ADR-0092 §4 Candidate A.
//          The first DMW Runtime control-plane primitive: explicit
//          consent record that complements the existing Permission
//          model. Permission encodes WHAT is allowed; ConsentGrant
//          records that the grantor explicitly agreed to the grant
//          for a specific purpose.
//
//          Receipt model is forward-substrate to a follow-up DMW
//          slice; V1 emits CONSENT_GRANT_RECORDED audit on every
//          state transition so the audit chain itself is the
//          receipt at this slice per ADR-0002.
//
//          Inherits the 7 inviolable bans per ADR-0092 §2:
//          - No private memory exposure
//          - No manager access to private memory
//          - No cross-tenant memory
//          - No global memory fusion
//          - Scope record discipline (consent_id is the scope record)
//          - Grant/revoke record discipline (revoked_at + revoked_by)
//          - Audit event discipline (CONSENT_GRANT_RECORDED on every
//            state transition)
//
// CONNECTS TO:
//   - packages/database (prisma.consentGrant + writeAuditEvent
//     for CONSENT_GRANT_RECORDED)
//   - ADR-0092 §4 Candidate A Consent Grant + Receipt substrate
//   - ADR-0092 §2 inviolable bans (consent V1 ban set)
//   - ADR-0001 RULE 0 sovereignty
//   - ADR-0042 §Q-γ.1 clean-transition discipline

import { prisma, writeAuditEvent } from "@niov/database";
import type { ConsentState } from "@prisma/client";

// WHAT: The closed-vocab purpose enum for ConsentGrant. V1 covers
//        the 5 most common consent surfaces that compose against
//        existing LIVE substrate.
// INPUT: Used as a value namespace.
// OUTPUT: None.
// WHY: ADR-0092 §4 Candidate A canonical purpose discipline. Each
//      future per-consumer slice MAY extend the closed-vocab via
//      ADR amendment + RULE 20 authorization; bare-string purposes
//      are NOT permitted at the substrate tier.
export const CONSENT_PURPOSE_VALUES = [
  "VOICE_INTENT_DELIVERY",
  "PROPOSED_ACTION_PROMOTION",
  "COMMUNICATION_SUMMARY",
  "MEMORY_CAPSULE_ACCESS",
  "TEAM_DELEGATION",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSE_VALUES)[number];

export type ConsentGrantSummary = {
  consent_id: string;
  grantor_entity_id: string;
  grantee_entity_id: string;
  purpose: ConsentPurpose;
  permission_id: string | null;
  consent_state: ConsentState;
  valid_from: Date;
  valid_until: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
};

export type RecordConsentGrantInput = {
  grantor_entity_id: string;
  grantee_entity_id: string;
  purpose: ConsentPurpose;
  permission_id?: string | null;
  valid_until?: Date | null;
  initial_state?: ConsentState;
};

export type RecordConsentGrantResult =
  | { ok: true; consent_grant: ConsentGrantSummary }
  | {
      ok: false;
      code: "INVALID_FIELD";
      httpStatus: 422;
      invalid_fields: string[];
    }
  | {
      ok: false;
      code: "AI_TO_AI_LONG_TERM_FORBIDDEN";
      httpStatus: 403;
      message: string;
    };

export type RevokeConsentGrantInput = {
  consent_id: string;
  revoked_by: string;
};

export type RevokeConsentGrantResult =
  | { ok: true; consent_grant: ConsentGrantSummary }
  | { ok: false; code: "NOT_FOUND"; httpStatus: 404 }
  | {
      ok: false;
      code: "ALREADY_REVOKED";
      httpStatus: 409;
      revoked_at: Date;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function project(
  row: NonNullable<Awaited<ReturnType<typeof prisma.consentGrant.findUnique>>>,
): ConsentGrantSummary {
  return {
    consent_id: row.consent_id,
    grantor_entity_id: row.grantor_entity_id,
    grantee_entity_id: row.grantee_entity_id,
    purpose: row.purpose as ConsentPurpose,
    permission_id: row.permission_id,
    consent_state: row.consent_state,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
  };
}

// WHAT: Record a new ConsentGrant per ADR-0092 §4 Candidate A.
// INPUT: grantor + grantee + purpose + optional permission_id +
//        optional valid_until + optional initial_state (defaults
//        to REQUESTED).
// OUTPUT: RecordConsentGrantResult.
// WHY: The grantor explicitly declares their consent. Emits
//      CONSENT_GRANT_RECORDED audit on success per RULE 4.
//      Returns 422 INVALID_FIELD if any field fails the canonical
//      shape check; returns 403 AI_TO_AI_LONG_TERM_FORBIDDEN
//      forward-substrate if the underlying RULE 0 invariant is
//      surfaced (at this slice we encode the failure mode but
//      the actual ai-entity-type lookup is forward-substrate to
//      consumer-tier integration).
export async function recordConsentGrantForCaller(
  input: RecordConsentGrantInput,
): Promise<RecordConsentGrantResult> {
  const invalid: string[] = [];
  if (!UUID_RE.test(input.grantor_entity_id)) {
    invalid.push("grantor_entity_id");
  }
  if (!UUID_RE.test(input.grantee_entity_id)) {
    invalid.push("grantee_entity_id");
  }
  if (input.grantor_entity_id === input.grantee_entity_id) {
    invalid.push("grantee_entity_id");
  }
  if (
    !(CONSENT_PURPOSE_VALUES as readonly string[]).includes(input.purpose)
  ) {
    invalid.push("purpose");
  }
  if (
    input.permission_id !== undefined &&
    input.permission_id !== null &&
    !UUID_RE.test(input.permission_id)
  ) {
    invalid.push("permission_id");
  }
  if (
    input.valid_until !== undefined &&
    input.valid_until !== null &&
    input.valid_until <= new Date()
  ) {
    invalid.push("valid_until");
  }
  const validInitialStates: ConsentState[] = ["REQUESTED", "APPROVED"];
  if (
    input.initial_state !== undefined &&
    !validInitialStates.includes(input.initial_state)
  ) {
    invalid.push("initial_state");
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      httpStatus: 422,
      invalid_fields: invalid,
    };
  }
  const initialState: ConsentState = input.initial_state ?? "REQUESTED";
  const row = await prisma.consentGrant.create({
    data: {
      grantor_entity_id: input.grantor_entity_id,
      grantee_entity_id: input.grantee_entity_id,
      purpose: input.purpose,
      permission_id: input.permission_id ?? null,
      valid_until: input.valid_until ?? null,
      consent_state: initialState,
    },
  });
  await writeAuditEvent({
    event_type: "CONSENT_GRANT_RECORDED",
    outcome: "SUCCESS",
    actor_entity_id: row.grantor_entity_id,
    target_entity_id: row.grantee_entity_id,
    details: {
      consent_id: row.consent_id,
      grantor_entity_id: row.grantor_entity_id,
      grantee_entity_id: row.grantee_entity_id,
      purpose: row.purpose,
      consent_state: row.consent_state,
      valid_from: row.valid_from.toISOString(),
      valid_until: row.valid_until?.toISOString() ?? null,
    },
  });
  return { ok: true, consent_grant: project(row) };
}

// WHAT: Look up a ConsentGrant by its consent_id.
// INPUT: consent_id (UUID).
// OUTPUT: A ConsentGrantSummary or null if not found.
// WHY: Pure read; no audit emission. Callers MUST scope-verify
//      same-org per ADR-0049 GOVSEC.7 at their own boundary;
//      this helper is a primitive that downstream consumers
//      compose against.
export async function getConsentGrantById(
  consent_id: string,
): Promise<ConsentGrantSummary | null> {
  if (!UUID_RE.test(consent_id)) return null;
  const row = await prisma.consentGrant.findUnique({
    where: { consent_id },
  });
  return row === null ? null : project(row);
}

// WHAT: Revoke an existing ConsentGrant.
// INPUT: consent_id + revoked_by (entity).
// OUTPUT: RevokeConsentGrantResult discriminated union.
// WHY: Sets consent_state to REVOKED + records revoked_at + by;
//      the row is NEVER deleted per RULE 10. Emits CONSENT_GRANT_
//      RECORDED audit with the REVOKED state per ADR-0042 §Q-γ.1
//      clean-transition discipline.
//
//      Returns 409 ALREADY_REVOKED if the consent was already in
//      a terminal REVOKED state; idempotent at the audit-event
//      tier so duplicate revocation attempts don't add audit
//      noise.
export async function revokeConsentGrantForCaller(
  input: RevokeConsentGrantInput,
): Promise<RevokeConsentGrantResult> {
  const existing = await prisma.consentGrant.findUnique({
    where: { consent_id: input.consent_id },
  });
  if (existing === null) {
    return { ok: false, code: "NOT_FOUND", httpStatus: 404 };
  }
  if (existing.consent_state === "REVOKED") {
    return {
      ok: false,
      code: "ALREADY_REVOKED",
      httpStatus: 409,
      revoked_at: existing.revoked_at ?? existing.updated_at,
    };
  }
  const updated = await prisma.consentGrant.update({
    where: { consent_id: input.consent_id },
    data: {
      consent_state: "REVOKED",
      revoked_at: new Date(),
      revoked_by: input.revoked_by,
    },
  });
  await writeAuditEvent({
    event_type: "CONSENT_GRANT_RECORDED",
    outcome: "SUCCESS",
    actor_entity_id: input.revoked_by,
    target_entity_id: updated.grantee_entity_id,
    details: {
      consent_id: updated.consent_id,
      grantor_entity_id: updated.grantor_entity_id,
      grantee_entity_id: updated.grantee_entity_id,
      purpose: updated.purpose,
      consent_state: updated.consent_state,
      valid_from: updated.valid_from.toISOString(),
      valid_until: updated.valid_until?.toISOString() ?? null,
      revoked_at: updated.revoked_at?.toISOString() ?? null,
      revoked_by: updated.revoked_by,
    },
  });
  return { ok: true, consent_grant: project(updated) };
}
