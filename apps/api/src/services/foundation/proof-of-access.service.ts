// FILE: proof-of-access.service.ts
// PURPOSE: Phase 1289-A.1 — Foundation MEMORY CAPSULE PROOF-OF-ACCESS. A
//          read-only, portable proof object answering, for a Memory Capsule:
//          "what was this entity ALLOWED to know/do about it, under what
//          permission, and what is the cryptographic audit evidence?"
//
//          This is the COSMP/DMW evidence primitive of the Foundation arc:
//          DMW = governed container, Memory Capsule = atomic unit, COSMP =
//          access protocol, audit chain = tamper-evident evidence. The proof
//          composes EXISTING readers (getCapsuleMetadata + permission history
//          + queryAuditEvents + verifyAuditChain); it changes NO COSMP
//          behavior and grants NO access — it only attests to what already
//          happened and what is currently permitted.
//
//          It is also honest about the current substrate boundaries (RULE 13):
//          transitive re-sharing and cascade revocation are NOT supported —
//          the Permission model records no lineage and sovereignty rules
//          forbid a non-owner from granting (so there is no downstream chain
//          to cascade to). Memory portability/federation is forward-substrate.
//          The proof surfaces these as explicit `notes` rather than implying
//          capabilities that do not exist.
//
// CONNECTS TO:
//   - packages/database getCapsuleMetadata (SAFE capsule metadata; strips
//     storage_location), queryAuditEvents + verifyAuditChain (audit evidence),
//     prisma.permission (permission history incl. REVOKED/EXPIRED).
//   - apps/api/src/services/auth.service.ts (validateSession) — the gate.
//   - apps/api/src/routes/foundation.routes.ts — the HTTP surface.
//
// SAFETY (no-leak, per ADR-0057 §10 + tests/unit/no-leak-guard.test.ts):
// the proof NEVER carries raw capsule content, payload_summary/content,
// storage_location, content_hash, embedding/vectors, raw permission
// conditions JSON, bearer tokens, or another tenant's data. Capsule + audit
// IDs and hashes (already public chain links) are included as evidence.
// Enumeration-safe: a caller with no ownership and no permission row for the
// capsule gets CAPSULE_NOT_FOUND — identical to a non-existent capsule.

import {
  prisma,
  getCapsuleMetadata,
  queryAuditEvents,
  verifyAuditChain,
  type AccessScope,
  type DurationType,
  type PermissionStatus,
} from "@niov/database";
import type { AuthService } from "../auth.service.js";

// Event types that constitute capsule-access evidence. Kept as a closed
// list so the proof's evidence window is meaningful (not every audit row).
const CAPSULE_ACCESS_EVENT_TYPES = [
  "NEGOTIATE",
  "CAPSULE_METADATA_READ",
  "CAPSULE_CONTENT_READ",
  "CAPSULE_CREATED",
  "CAPSULE_UPDATED",
  "CAPSULE_DELETED",
  "CAPSULE_MUTATION_ADD",
  "CAPSULE_MUTATION_UPDATE",
  "CAPSULE_MUTATION_MERGE",
  "CAPSULE_MUTATION_NOOP",
  "PERMISSION_CREATED",
  "PERMISSION_REVOKED",
  "PERMISSION_EXPIRED",
] as const;

// Max evidence rows surfaced in one proof (most-recent first).
const PROOF_EVIDENCE_MAX = 50;

// A single SAFE audit-evidence row (chain links only — no details/ip/denial).
export interface ProofEvidenceEvent {
  audit_id: string;
  event_type: string;
  outcome: string;
  timestamp: string;
  event_hash: string;
  previous_event_hash: string | null;
  lawful_basis_id: string | null;
}

export interface ProofAccessState {
  is_owner: boolean;
  permission_status: PermissionStatus | "NONE";
  access_scope: AccessScope | null;
  duration_type: DurationType | null;
  valid_from: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  // Effective read authority right now: owner, or an ACTIVE unexpired grant.
  can_read_now: boolean;
  // Capsule governance flags (booleans only — never raw content).
  ai_access_blocked: boolean;
  requires_validation: boolean;
  clearance_required: number;
  jurisdiction: string | null;
  deleted_at: string | null;
}

export interface ProofEvidence {
  event_count: number;
  events: ProofEvidenceEvent[];
  truncated: boolean;
  chain_verified: boolean;
  chain_algorithm: "SHA-256";
  first_event_hash: string | null;
  last_event_hash: string | null;
}

// Honest substrate boundaries (RULE 13). These are NOT yet supported and the
// proof says so rather than implying otherwise.
export interface ProofNotes {
  transitive_sharing_supported: false;
  cascade_revocation_supported: false;
  memory_portability_supported: false;
  note: string;
}

export interface MemoryCapsuleAccessProof {
  subject_entity_id: string;
  capsule_id: string;
  wallet_id: string | null;
  capsule_owner_entity_id: string | null;
  permission_id: string | null;
  access: ProofAccessState;
  evidence: ProofEvidence;
  notes: ProofNotes;
  proof_required: true;
  provenance: {
    evaluator: "FOUNDATION_PROOF_OF_ACCESS";
    derived_from: string[];
    decided_by: "FOUNDATION";
  };
  evaluated_at: string;
}

export type ProofResult =
  | { ok: true; proof: MemoryCapsuleAccessProof }
  | { ok: false; code: string };

export class FoundationProofService {
  constructor(private readonly authService: AuthService) {}

  // WHAT: Build the caller's own proof-of-access for one Memory Capsule.
  // INPUT: session token + capsule_id.
  // OUTPUT: { ok:true, proof } or { ok:false, code }.
  // WHY: GET /api/v1/foundation/capsules/:capsule_id/access-proof — proof of
  //      what THIS entity was allowed to know/do about the capsule, with
  //      tamper-evident audit evidence. Enumeration-safe: no ownership and no
  //      permission row → CAPSULE_NOT_FOUND (indistinguishable from missing).
  async getCapsuleAccessProofForCaller(
    sessionToken: string,
    capsuleId: string,
  ): Promise<ProofResult> {
    const validation = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!validation.valid) {
      return { ok: false, code: validation.code };
    }
    const subjectEntityId = validation.entity_id;

    const capsule = await getCapsuleMetadata(capsuleId);
    if (capsule === null) {
      return { ok: false, code: "CAPSULE_NOT_FOUND" };
    }

    const isOwner = capsule.entity_id === subjectEntityId;

    // Full permission history (incl. REVOKED/EXPIRED) for (capsule, subject),
    // most-recent first — so the proof can surface a revoked grant honestly.
    const permissions = await prisma.permission.findMany({
      where: { capsule_id: capsuleId, grantee_entity_id: subjectEntityId },
      orderBy: { created_at: "desc" },
    });

    // Enumeration-safe gate: a caller with no basis to know this capsule
    // exists gets the same answer as for a non-existent capsule.
    if (!isOwner && permissions.length === 0) {
      return { ok: false, code: "CAPSULE_NOT_FOUND" };
    }

    const latest = permissions[0] ?? null;
    const now = new Date();
    const latestActiveUnexpired =
      latest !== null &&
      latest.status === "ACTIVE" &&
      (latest.expires_at === null || latest.expires_at > now);

    const access: ProofAccessState = {
      is_owner: isOwner,
      permission_status: latest?.status ?? "NONE",
      access_scope: latest?.access_scope ?? null,
      duration_type: latest?.duration_type ?? null,
      valid_from: latest?.valid_from?.toISOString() ?? null,
      expires_at: latest?.expires_at?.toISOString() ?? null,
      revoked_at: latest?.revoked_at?.toISOString() ?? null,
      can_read_now: isOwner || latestActiveUnexpired,
      ai_access_blocked: capsule.ai_access_blocked,
      requires_validation: capsule.requires_validation,
      clearance_required: capsule.clearance_required,
      jurisdiction: capsule.jurisdiction,
      deleted_at: capsule.deleted_at?.toISOString() ?? null,
    };

    // Audit evidence: subject's actions against this capsule, safe-projected.
    const audit = await queryAuditEvents({
      target_capsule_id: capsuleId,
      actor_entity_id: subjectEntityId,
      page: 1,
      page_size: PROOF_EVIDENCE_MAX,
    });
    const accessTypes = new Set<string>(CAPSULE_ACCESS_EVENT_TYPES);
    const evidenceEvents: ProofEvidenceEvent[] = audit.events
      .filter((e) => accessTypes.has(e.event_type))
      .map((e) => ({
        audit_id: e.audit_id,
        event_type: e.event_type,
        outcome: e.outcome,
        timestamp: e.timestamp.toISOString(),
        event_hash: e.event_hash,
        previous_event_hash: e.previous_event_hash,
        lawful_basis_id: e.lawful_basis_id ?? null,
      }));

    const chain = await verifyAuditChain(subjectEntityId);

    const evidence: ProofEvidence = {
      event_count: evidenceEvents.length,
      events: evidenceEvents,
      truncated: audit.total > audit.events.length,
      chain_verified: chain.valid,
      chain_algorithm: "SHA-256",
      first_event_hash: chain.firstEventHash,
      last_event_hash: chain.lastEventHash,
    };

    const notes: ProofNotes = {
      transitive_sharing_supported: false,
      cascade_revocation_supported: false,
      memory_portability_supported: false,
      note:
        "Transitive re-sharing and cascade revocation are not supported at " +
        "this phase: capsule sovereignty allows only the owner to grant, and " +
        "the permission model records no grant lineage, so there is no " +
        "downstream chain to cascade. Revoking a grant invalidates the " +
        "grantee's sessions directly. Memory portability/federation is " +
        "forward-substrate.",
    };

    const proof: MemoryCapsuleAccessProof = {
      subject_entity_id: subjectEntityId,
      capsule_id: capsule.capsule_id,
      wallet_id: capsule.wallet_id,
      capsule_owner_entity_id: capsule.entity_id,
      permission_id: latest?.permission_id ?? null,
      access,
      evidence,
      notes,
      proof_required: true,
      provenance: {
        evaluator: "FOUNDATION_PROOF_OF_ACCESS",
        derived_from: [
          "MemoryCapsule SAFE metadata (getCapsuleMetadata)",
          "Permission history (status incl. REVOKED/EXPIRED)",
          "AuditEvent chain (queryAuditEvents + verifyAuditChain; SHA-256)",
        ],
        decided_by: "FOUNDATION",
      },
      evaluated_at: now.toISOString(),
    };

    return { ok: true, proof };
  }
}
