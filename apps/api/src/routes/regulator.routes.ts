// FILE: regulator.routes.ts
// PURPOSE: HTTP surface for the /regulator/* namespace -- tenant-admin
//          governance routes that grant + revoke external REGULATOR
//          principal access under a documented LawfulBasis. Sub-phase
//          5 of the CAR Sub-box 3 mini-arc per ADR-0036 §Implementation
//          Detail.
//
//          Both routes are can_admin_niov-tier per Q8 LOCKED Option α
//          (Tension 3 Category (1) invariant) AND dual-control-gated
//          per Sub-decision 6 + ADR-0026 (per-route requireDualControl
//          factory). preHandler order: requireAdminCapability MUST run
//          first (BINDING CONTRACT in dual-control.middleware.ts:97-106).
//
//          Sub-phase 5 lands route-level governance/audit substrate ONLY.
//          It does NOT enforce regulator lawful-basis at COSMP READ /
//          SHARE / REVOKE -- that is sub-phase 6 enforcement substrate.
//          No tenant data, no capsule contents, no broad data access
//          surfaces here.
//
//          Audit-event-only revocation model per Q-D pre-flight answer +
//          Q1 LOCKED Option α: revoke resolves regulator_entity_id via
//          LawfulBasis.audit_id -> AuditEvent.target_entity_id chain;
//          no durable RegulatorAccessGrant table needed at sub-phase 5.
//
// CONNECTS TO:
//   - apps/api/src/middleware/admin.middleware.ts (requireAdminCapability
//     factory; can_admin_niov tier)
//   - apps/api/src/middleware/dual-control.middleware.ts (requireDualControl
//     factory; Zone U1 audit-event sequence + EscalationRequest gate per
//     ADR-0026)
//   - apps/api/src/security/privileged-endpoints.ts (REGULATOR_ACCESS_GRANT
//     + REGULATOR_ACCESS_REVOKE descriptors at sub-phase 5; consumed at
//     route-registration time)
//   - packages/database/src/queries/lawful-basis.ts (createLawfulBasisInTx
//     + linkLawfulBasisToAuditEventInTx + getLawfulBasisById +
//     isLawfulBasisActive sub-phase 3 helpers)
//   - packages/database/src/queries/regulator.ts (validateRegulatorAccess
//     + getRegulatorEntityById sub-phase 3 helpers; REGULATOR ≠ GOVERNMENT
//     correctness-hazard guard per CAR §2.1)
//   - packages/database/src/queries/audit.ts (writeAuditEvent +
//     REGULATOR_ACCESS_GRANTED / REVOKED event_type literals;
//     lawful_basis_id + lawful_basis_chain_hash carried as top-level
//     canonical_record/1 positions 13 + 14 per sub-phase 4)
//   - apps/api/src/server.ts (registerRegulatorRoutes wired into buildApp)
//   - tests/integration/regulator-routes.test.ts (full HTTP-level test
//     coverage including dual-control matrix + REGULATOR ≠ GOVERNMENT
//     guard + lawful-basis chain integrity)

import type { FastifyInstance } from "fastify";
import {
  createLawfulBasisInTx,
  getLawfulBasisById,
  getRegulatorEntityById,
  isLawfulBasisActive,
  linkLawfulBasisToAuditEventInTx,
  prisma,
  validateRegulatorAccess,
  writeAuditEvent,
  type LawfulBasisType,
} from "@niov/database";
import { requireAdminCapability } from "../middleware/admin.middleware.js";
import { requireDualControl } from "../middleware/dual-control.middleware.js";
import { PRIVILEGED_ENDPOINTS } from "../security/privileged-endpoints.js";
import type { AuthService } from "../services/auth.service.js";

// WHAT: Body shape for POST /regulator/access-grants. Field types are
//        unknown so the handler can run schema validation before passing
//        to typed services (mirrors platform.routes.ts pattern).
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Routes get untyped JSON bodies from clients; the handler asserts
//      shape + type before performing any DB write.
interface CreateAccessGrantBody {
  regulator_entity_id?: unknown;
  basis_type?: unknown;
  basis_reference?: unknown;
  jurisdiction_invoked?: unknown;
  authority_scope?: unknown;
  valid_from?: unknown;
  valid_until?: unknown;
}

// WHAT: Body shape for POST /regulator/access-revocations.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Same untyped-input discipline as the grant body.
interface CreateAccessRevocationBody {
  lawful_basis_id?: unknown;
  revocation_reason?: unknown;
}

// WHAT: Runtime allow-list of LawfulBasisType enum literals per ADR-0036
//        Sub-decision 3. Used to validate basis_type body field.
// INPUT: None.
// OUTPUT: A readonly tuple of the 6 enum literals.
// WHY: Prisma enums are not iterable at runtime; this literal tuple lets
//      the handler reject INVALID_BASIS_TYPE before any DB write.
const LAWFUL_BASIS_TYPES = [
  "SUBPOENA",
  "REGULATORY_AUTHORITY",
  "COURT_ORDER",
  "DPA_REQUEST",
  "MLAT_REQUEST",
  "CONSENT_OF_DATA_SUBJECT",
] as const satisfies readonly LawfulBasisType[];

// WHAT: Validate + coerce a body field to non-empty trimmed string or null.
// INPUT: Any value.
// OUTPUT: The string when valid, null otherwise.
// WHY: Matches platform.routes.ts asNonEmptyString pattern.
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// WHAT: Parse an ISO 8601 date string into a JS Date. Returns null if
//        the value is not a string OR the parse yields an invalid Date.
// INPUT: Any value.
// OUTPUT: A Date when valid, null otherwise.
// WHY: Time-window validation per locked sub-phase 5 design requires
//      both valid_from and valid_until as parsed Dates; centralizing
//      the parse keeps the validation chain readable.
function asISO8601Date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// WHAT: Validate a value is one of the 6 LawfulBasisType literals.
// INPUT: Any value.
// OUTPUT: The validated LawfulBasisType when valid, null otherwise.
// WHY: Prevents arbitrary basis_type strings from reaching the DB layer
//      (would surface as a Prisma enum-validation error; cleaner to fail
//      at the route boundary with INVALID_BASIS_TYPE).
function asLawfulBasisType(value: unknown): LawfulBasisType | null {
  if (typeof value !== "string") return null;
  if ((LAWFUL_BASIS_TYPES as readonly string[]).includes(value)) {
    return value as LawfulBasisType;
  }
  return null;
}

// WHAT: Map a validateRegulatorAccess rejection reason to the route's
//        public error code + HTTP status.
// INPUT: A RegulatorValidationResult rejection reason.
// OUTPUT: Tuple of (HTTP status, error code string).
// WHY: Per locked error taxonomy (§9 of pre-flight): all 5 rejection
//      reasons surface as 422 with the reason as the public code so
//      callers can branch on the specific failure.
function regulatorRejectionToResponse(
  reason:
    | "NOT_REGULATOR"
    | "ENTITY_NOT_ACTIVE"
    | "MISSING_CREDENTIALING"
    | "JURISDICTION_NOT_AUTHORIZED"
    | "SCOPE_NOT_AUTHORIZED",
): { status: 422; code: string } {
  return { status: 422, code: reason };
}

// WHAT: Register the /regulator/* routes (grant + revoke).
// INPUT: Fastify instance + AuthService (for the can_admin_niov gate).
// OUTPUT: A promise that resolves once routes are registered.
// WHY: One register-fn per file matches the existing pattern
//      (platform.routes.ts, escalation.routes.ts, etc.).
export async function registerRegulatorRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  // Sub-phase 5 [SUB-BOX-3-ROUTES]: resolve the REGULATOR_ACCESS_GRANT
  // (Operation C) + REGULATOR_ACCESS_REVOKE (Operation D) privileged-
  // endpoint descriptors at route-registration time. Throw-guards fail
  // fast at server boot if the registry ever drifts -- the entries are
  // provably present (PRIVILEGED_ENDPOINTS is `as const`), so these are
  // substrate-integrity assertions, not runtime branches the request
  // path ever takes (mirrors platform.routes.ts:78-93 pattern).
  const grantEndpoint = PRIVILEGED_ENDPOINTS.find(
    (e) => e.actionDescriptor.type === "REGULATOR_ACCESS_GRANT",
  );
  if (!grantEndpoint) {
    throw new Error(
      "PRIVILEGED_ENDPOINTS registry missing required entry for REGULATOR_ACCESS_GRANT",
    );
  }
  const revokeEndpoint = PRIVILEGED_ENDPOINTS.find(
    (e) => e.actionDescriptor.type === "REGULATOR_ACCESS_REVOKE",
  );
  if (!revokeEndpoint) {
    throw new Error(
      "PRIVILEGED_ENDPOINTS registry missing required entry for REGULATOR_ACCESS_REVOKE",
    );
  }

  // ════════════════════════════════════════════════════════════════
  // GRANT -- POST /api/v1/regulator/access-grants
  // ════════════════════════════════════════════════════════════════
  // Tenant admin grants an external REGULATOR principal time-bounded
  // access under a documented LawfulBasis. Atomic transaction:
  //   1. createLawfulBasisInTx (audit_id null, chain_hash computed)
  //   2. writeAuditEvent REGULATOR_ACCESS_GRANTED with lawful_basis_id
  //      + lawful_basis_chain_hash at top-level (canonical positions
  //      13 + 14 per sub-phase 4)
  //   3. linkLawfulBasisToAuditEventInTx (backfill audit_id)
  // Failure at any step rolls back the entire transaction; chain
  // integrity preserved per RULE 4.
  app.post<{ Body: CreateAccessGrantBody }>(
    "/api/v1/regulator/access-grants",
    {
      preHandler: [
        requireAdminCapability(authService, "can_admin_niov"),
        requireDualControl(grantEndpoint),
      ],
    },
    async (request, reply) => {
      const body = request.body ?? {};

      // 1. Schema validation
      const regulatorEntityId = asNonEmptyString(body.regulator_entity_id);
      const basisType = asLawfulBasisType(body.basis_type);
      const basisReference = asNonEmptyString(body.basis_reference);
      const jurisdictionInvoked = asNonEmptyString(body.jurisdiction_invoked);
      const authorityScope = asNonEmptyString(body.authority_scope);
      const validFrom = asISO8601Date(body.valid_from);
      const validUntil = asISO8601Date(body.valid_until);

      if (
        regulatorEntityId === null ||
        basisReference === null ||
        jurisdictionInvoked === null ||
        authorityScope === null ||
        validFrom === null ||
        validUntil === null
      ) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message:
            "regulator_entity_id, basis_type, basis_reference, jurisdiction_invoked, authority_scope, valid_from, valid_until are required (basis_reference / *_invoked / *_scope as non-empty strings; valid_* as ISO 8601 date strings)",
        });
      }
      if (basisType === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_BASIS_TYPE",
          message: `basis_type must be one of: ${LAWFUL_BASIS_TYPES.join(", ")}`,
        });
      }

      // 2. Time-window validation per Sub-decision 3 time-boundedness
      //    invariant: valid_until > valid_from AND valid_until > now.
      if (validUntil.getTime() <= validFrom.getTime()) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_TIME_WINDOW",
          message: "valid_until must be strictly greater than valid_from",
        });
      }
      if (validUntil.getTime() <= Date.now()) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_TIME_WINDOW",
          message: "valid_until must be in the future (no perpetual access)",
        });
      }

      // 3. Fetch REGULATOR entity + TAR. Returns null if not found OR
      //    if entity_type !== "REGULATOR" (REGULATOR-only short-circuit
      //    per sub-phase 3 substrate; CAR §2.1 correctness-hazard guard).
      const regulator = await getRegulatorEntityById(regulatorEntityId);
      if (regulator === null) {
        return reply.code(404).send({
          ok: false,
          code: "REGULATOR_NOT_FOUND",
          message:
            "Regulator entity not found OR entity_type is not REGULATOR",
        });
      }

      // 4. validateRegulatorAccess (5 sequential guards per ADR-0036
      //    Sub-decisions 1 + 2 + 7).
      const validation = validateRegulatorAccess(regulator, {
        jurisdiction_invoked: jurisdictionInvoked,
        authority_scope: authorityScope,
      });
      if (!validation.ok) {
        const mapped = regulatorRejectionToResponse(validation.reason);
        return reply.code(mapped.status).send({
          ok: false,
          code: mapped.code,
          message: `Regulator validation rejected: ${validation.reason}`,
        });
      }

      // 5. Atomic transaction: createLawfulBasisInTx + writeAuditEvent
      //    + linkLawfulBasisToAuditEventInTx. Any failure rolls back the
      //    entire transaction; chain integrity preserved per RULE 4.
      try {
        const result = await prisma.$transaction(async (tx) => {
          const basis = await createLawfulBasisInTx(tx, {
            basis_type: basisType,
            basis_reference: basisReference,
            jurisdiction_invoked: jurisdictionInvoked,
            valid_from: validFrom,
            valid_until: validUntil,
          });

          // Compose the AuditEvent in the same transaction. lawful_basis_id
          // + lawful_basis_chain_hash flow into canonical_record/1
          // positions 13 + 14 (sub-phase 4 substrate). actor = tenant
          // admin (request.auth.entity_id); target = regulator entity
          // per Q4 LOCKED Option α actor model.
          const auditEvent = await writeAuditEvent(
            {
              event_type: "REGULATOR_ACCESS_GRANTED",
              outcome: "SUCCESS",
              actor_entity_id: request.auth?.entity_id ?? null,
              target_entity_id: regulatorEntityId,
              lawful_basis_id: basis.basis_id,
              lawful_basis_chain_hash: basis.chain_hash,
              details: {
                basis_type: basisType,
                jurisdiction_invoked: jurisdictionInvoked,
                authority_scope: authorityScope,
                valid_from: validFrom.toISOString(),
                valid_until: validUntil.toISOString(),
              },
            },
            tx,
          );

          // Backfill audit_id on the LawfulBasis row to close the
          // bidirectional binding (basis -> audit_id; audit -> basis_id +
          // basis_chain_hash). Idempotent at sub-phase 3 substrate.
          await linkLawfulBasisToAuditEventInTx(
            tx,
            basis.basis_id,
            auditEvent.audit_id,
          );

          return { basis, auditEvent };
        });

        // 6. Safe response per Q-NEW pre-flight: return only basis_id +
        //    audit_id + event_hash + valid_until + status (no raw
        //    credentials, no PII beyond modeled IDs, no tenant data).
        return reply.code(201).send({
          ok: true,
          basis_id: result.basis.basis_id,
          audit_id: result.auditEvent.audit_id,
          event_hash: result.auditEvent.event_hash,
          valid_until: result.basis.valid_until.toISOString(),
          status: "GRANTED" as const,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        return reply.code(500).send({
          ok: false,
          code: "GRANT_FAILED",
          message,
        });
      }
    },
  );

  // ════════════════════════════════════════════════════════════════
  // REVOKE -- POST /api/v1/regulator/access-revocations
  // ════════════════════════════════════════════════════════════════
  // Tenant admin revokes a previously-granted LawfulBasis BEFORE its
  // valid_until. Audit-event-only model per Q-D + Q1 LOCKED Option α:
  // emit REGULATOR_ACCESS_REVOKED with lawful_basis_id + the original
  // chain_hash; resolve regulator_entity_id via the LawfulBasis.audit_id
  // -> AuditEvent.target_entity_id chain (the bidirectional binding from
  // grant flow). Already-revoked rejected with 422 ALREADY_REVOKED;
  // expired rejected with 422 BASIS_EXPIRED.
  app.post<{ Body: CreateAccessRevocationBody }>(
    "/api/v1/regulator/access-revocations",
    {
      preHandler: [
        requireAdminCapability(authService, "can_admin_niov"),
        requireDualControl(revokeEndpoint),
      ],
    },
    async (request, reply) => {
      const body = request.body ?? {};

      // 1. Schema validation
      const lawfulBasisId = asNonEmptyString(body.lawful_basis_id);
      const revocationReason = asNonEmptyString(body.revocation_reason);
      if (lawfulBasisId === null) {
        return reply.code(422).send({
          ok: false,
          code: "INVALID_REQUEST",
          message: "lawful_basis_id is required (UUID string)",
        });
      }

      // 2. Fetch the LawfulBasis row
      const basis = await getLawfulBasisById(lawfulBasisId);
      if (basis === null) {
        return reply.code(404).send({
          ok: false,
          code: "LAWFUL_BASIS_NOT_FOUND",
          message: "LawfulBasis not found",
        });
      }

      // 3. Reject expired basis per Q2 LOCKED Option α (revoking an
      //    already-expired basis is semantically meaningless at this
      //    route substrate; expiration handling is forward-queued).
      if (!isLawfulBasisActive(basis)) {
        return reply.code(422).send({
          ok: false,
          code: "BASIS_EXPIRED",
          message:
            "LawfulBasis is past its valid_until (or before its valid_from); cannot revoke an inactive basis",
        });
      }

      // 4. Reject already-revoked basis per Q1 LOCKED Option α
      //    (audit-event-only revocation density protection: prevent
      //    duplicate REGULATOR_ACCESS_REVOKED events for the same basis).
      const priorRevoke = await prisma.auditEvent.findFirst({
        where: {
          event_type: "REGULATOR_ACCESS_REVOKED",
          lawful_basis_id: lawfulBasisId,
        },
        select: { audit_id: true },
      });
      if (priorRevoke !== null) {
        return reply.code(422).send({
          ok: false,
          code: "ALREADY_REVOKED",
          message: `LawfulBasis ${lawfulBasisId} already has a REGULATOR_ACCESS_REVOKED audit event (audit_id=${priorRevoke.audit_id})`,
        });
      }

      // 5. Resolve regulator_entity_id via the LawfulBasis.audit_id ->
      //    AuditEvent.target_entity_id chain (the bidirectional binding
      //    closed at grant flow per Q4 LOCKED Option α actor model).
      //    If audit_id is null OR the linked AuditEvent is missing the
      //    target_entity_id is treated as null (the substrate invariant
      //    holds; this is defensive only).
      let targetEntityId: string | null = null;
      if (basis.audit_id !== null) {
        const grantEvent = await prisma.auditEvent.findUnique({
          where: { audit_id: basis.audit_id },
          select: { target_entity_id: true },
        });
        targetEntityId = grantEvent?.target_entity_id ?? null;
      }

      // 6. Write REGULATOR_ACCESS_REVOKED audit event. lawful_basis_id +
      //    lawful_basis_chain_hash carried at canonical positions 13 + 14
      //    so revocation tampering invalidates event_hash per Sub-decision 5.
      try {
        const revokeEvent = await writeAuditEvent({
          event_type: "REGULATOR_ACCESS_REVOKED",
          outcome: "SUCCESS",
          actor_entity_id: request.auth?.entity_id ?? null,
          target_entity_id: targetEntityId,
          lawful_basis_id: basis.basis_id,
          lawful_basis_chain_hash: basis.chain_hash,
          details: {
            basis_type: basis.basis_type,
            jurisdiction_invoked: basis.jurisdiction_invoked,
            valid_from: basis.valid_from.toISOString(),
            valid_until: basis.valid_until.toISOString(),
            // Optional revocation_reason carried in details only when the
            // caller supplied it. Bounded by asNonEmptyString contract;
            // operator guidance at route header: do NOT include data-
            // subject names, capsule contents, or other PII.
            ...(revocationReason !== null
              ? { revocation_reason: revocationReason }
              : {}),
          },
        });

        return reply.code(201).send({
          ok: true,
          lawful_basis_id: basis.basis_id,
          audit_id: revokeEvent.audit_id,
          event_hash: revokeEvent.event_hash,
          revoked_at: revokeEvent.timestamp.toISOString(),
          status: "REVOKED" as const,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        return reply.code(500).send({
          ok: false,
          code: "REVOKE_FAILED",
          message,
        });
      }
    },
  );
}
