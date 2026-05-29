// FILE: write.service.ts
// PURPOSE: Implement the COSMP WRITE operation -- create new
//          MemoryCapsule rows and update existing ones, with the
//          owner-vs-attributed split, content encryption, content
//          hashing, attribution stamping, and audit-of-record rows.
// CONNECTS TO: AuthService (validates session), ContentEncryption
//              (encrypts payload), ContentStore (persists ciphertext),
//              the capsules and permissions tables, and the
//              audit_events / audit_logs tables.

import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { sha256Hex, type ContentEncryption } from "@niov/auth";
import {
  canonicalJson,
  getEntityById,
  prisma,
  writeAuditEvent,
  type CapsuleType,
  type DecayType,
  type MemoryCapsule,
  type Prisma,
  type StorageTier,
} from "@niov/database";
// Phase 3 Sub-arc 2 Gap 1 G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] per
// ADR-0042 G1.3 RULE 13 Substrate-State Correction §9a: MutationType is
// not currently re-exported from @niov/database (G1.2 added the Prisma
// enum but did not extend @niov/database/index.ts). Direct @prisma/client
// import preserves Q-G1.3-ν scope (no packages/database changes). Future
// cleanup commit may consolidate via @niov/database re-export.
import type { MutationType } from "@prisma/client";
import type { ContentStore } from "../../content-store.js";
import type { NonceStore } from "../../redis.js";
import type { AuthService } from "../auth.service.js";
import type { EmbeddingProvider, EmbeddingResult } from "../embedding/embedding.service.js";
import { assertJurisdictionalScope } from "./jurisdiction-enforcement.js";
import type { AccessDeclarationPayload } from "./negotiate.service.js";

// WHAT: How content size in tokens is approximated from raw chars.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Spec says "character count / 4 as approximation". Naming
//      the constant means a future swap to tiktoken-grade counting
//      lives in one place.
export const CHARS_PER_TOKEN = 4;

// WHAT: Required + optional fields a caller can supply when creating
//        a brand-new capsule.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: Distinguishes spec-required fields (capsule_type, topic_tags,
//      payload_summary, content) from things we default if omitted
//      (decay_type, storage_tier, etc).
export interface CapsuleCreateInput {
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  content: string;

  decay_type?: DecayType;
  decay_rate?: number;
  storage_tier?: StorageTier;
  clearance_required?: number;
  connected_capsule_ids?: string[];
  connected_entity_ids?: string[];
  monetization_enabled?: boolean;
  monetization_category?: string | null;
  expires_at?: Date | null;
  ai_access_blocked?: boolean;
  requires_validation?: boolean;

  write_reason?: string;
}

// WHAT: Fields a caller can change on an existing capsule.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: Every field is optional; we apply only what is supplied.
//      Identity / wallet / created_by are intentionally absent
//      because they can never be modified by an update.
//
// G1.3 per ADR-0042 §Sub-decision Q-η + Q-G1.3-η LOCK: optional
// expected_version enables opt-in optimistic-concurrency control.
// When supplied and != existing.version, the write fails with
// CAPSULE_VERSION_CONFLICT (HTTP 409). When null/omitted, the write
// proceeds with last-writer-wins semantics (backward-compat preserved).
export interface CapsuleUpdateInput {
  capsule_type?: CapsuleType;
  topic_tags?: string[];
  payload_summary?: string;
  content?: string;
  decay_type?: DecayType;
  decay_rate?: number;
  storage_tier?: StorageTier;
  clearance_required?: number;
  relevance_score?: number;
  connected_capsule_ids?: string[];
  connected_entity_ids?: string[];
  monetization_enabled?: boolean;
  monetization_category?: string | null;
  ai_access_blocked?: boolean;
  requires_validation?: boolean;

  write_reason?: string;

  expected_version?: number | null;
}

// WHAT: Success return shape from createCapsule / updateCapsule.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Routes need both the capsule_id and the version they just
//      produced; tests care about content_hash + storage_location
//      to verify encryption.
export interface WriteSuccess {
  ok: true;
  capsule_id: string;
  version: number;
  content_hash: string;
  storage_location: string;
  write_type: "OWNER" | "ATTRIBUTED";
}

// WHAT: Failure return shape, discriminated for routes.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Codes mirror the sub-failures the spec calls out so the
//      route layer can map them to HTTP status without throwing.
export interface WriteFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "CAPSULE_NOT_FOUND"
    | "CAPSULE_DATA_INVALID"
    | "ACCESS_DECLARATION_INVALID"
    | "ACCESS_DECLARATION_EXPIRED"
    | "ACCESS_DECLARATION_MISMATCH"
    | "WRITE_NOT_PERMITTED"
    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 + Q6 LOCKED Option α: WRITE updateCapsule
    // enforces actor↔existing capsule jurisdiction (capsule jurisdiction
    // is immutable per Sub-decision 4 but the actor's CAN drift).
    // createCapsule does NOT run assertJurisdictionalScope — it
    // establishes the jurisdiction anchor via cascade per Sub-decision 5.
    | "ACTOR_JURISDICTION_MISSING"
    | "TARGET_JURISDICTION_MISSING"
    | "CROSS_JURISDICTION_ACCESS_DENIED"
    | "JURISDICTION_NOT_AUTHORIZED"
    // G1.3 per ADR-0042 §Sub-decision Q-η + Q-G1.3-θ LOCK: optimistic
    // concurrency conflict. Returned when caller supplies
    // expected_version that does not match existing.version, OR when
    // a CAS conflict surfaces inside the transaction (concurrent
    // writer landed first). Maps to HTTP 409 Conflict at the route
    // layer per cosmp.routes.ts statusForCode.
    | "CAPSULE_VERSION_CONFLICT";
  message: string;
  errors?: string[];
}

// WHAT: Validate the required-field contract for a create call.
// INPUT: A CapsuleCreateInput.
// OUTPUT: An array of human-readable error strings, empty when valid.
// WHY: Spec wants us to list specific field errors to the caller,
//      so we collect them all in one pass instead of throwing on
//      the first one.
function validateCreateInput(input: CapsuleCreateInput): string[] {
  const errors: string[] = [];
  if (typeof input.capsule_type !== "string" || input.capsule_type.length === 0) {
    errors.push("capsule_type is required");
  }
  if (
    !Array.isArray(input.topic_tags) ||
    input.topic_tags.length < 1 ||
    !input.topic_tags.every((t) => typeof t === "string" && t.length > 0)
  ) {
    errors.push("topic_tags must be a non-empty array of non-empty strings");
  }
  if (
    typeof input.payload_summary !== "string" ||
    input.payload_summary.length === 0
  ) {
    errors.push("payload_summary is required");
  }
  if (typeof input.content !== "string" || input.content.length === 0) {
    errors.push("content is required");
  }
  return errors;
}

// WHAT: Real tokenizer count using @anthropic-ai/tokenizer.
// INPUT: Plaintext content.
// OUTPUT: An integer token count.
// WHY: Section 11A P3 prep -- replaces the chars/4 estimate with a
//      precise count Section 11B's conductSession truncation can
//      trust. Tokenizer choice (anthropic) matches the default
//      PREFERRED_LLM=anthropic; if the deployment switches to
//      openai later, tokens_tokenizer column on the row records
//      which tokenizer produced the count, and conductSession can
//      re-tokenize on read when the tokenizer no longer matches.
function countTokensAnthropic(content: string): number {
  // Lazy require so the tokenizer's WASM doesn't load at module
  // import time in tests that never write capsules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { countTokens } = require("@anthropic-ai/tokenizer") as {
    countTokens: (text: string) => number;
  };
  return countTokens(content);
}

// WHAT: Compute the content_hash + payload_size_tokens + tokens
//        (real tokenizer count) + the ciphertext we want to store.
// INPUT: The plaintext content and the encryption helper.
// OUTPUT: { ciphertext, content_hash, payload_size_tokens, tokens,
//          tokens_tokenizer }.
// WHY: Encryption + hashing + token count are always done together
//      on a write. Centralizing keeps the steps in one tested path.
//      Section 11A adds tokens + tokens_tokenizer alongside the
//      pre-existing payload_size_tokens (which 383 baseline tests
//      depend on; both columns coexist by design).
function processContentForStorage(
  content: string,
  encryption: ContentEncryption,
): {
  ciphertext: string;
  content_hash: string;
  payload_size_tokens: number;
  tokens: number;
  tokens_tokenizer: string;
} {
  const ciphertext = encryption.encrypt(content);
  return {
    ciphertext,
    content_hash: sha256Hex(ciphertext),
    payload_size_tokens: Math.ceil(content.length / CHARS_PER_TOKEN),
    tokens: countTokensAnthropic(content),
    tokens_tokenizer: "anthropic",
  };
}

// WHAT: True when a permission carries the explicit allow_write flag.
// INPUT: A Permission row's conditions JSON.
// OUTPUT: A boolean.
// WHY: Spec says "Verify permission includes write access". We
//      express that as a permission-level condition the granting
//      human sets at NEGOTIATE / createPermission time.
function permissionAllowsWrite(conditions: Prisma.JsonValue | null): boolean {
  if (conditions === null || typeof conditions !== "object") return false;
  if (Array.isArray(conditions)) return false;
  const obj = conditions as Record<string, unknown>;
  return obj.allow_write === true;
}

// ===========================================================================
// G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] mutation-discrimination substrate
// per ADR-0042 §Sub-decisions Q-α through Q-ρ + Q-G1.3-α through Q-G1.3-σ
// LOCKs at [CAPSULE-MUTATION-WRITE-SERVICE-QLOCK] +
// [CAPSULE-MUTATION-WRITE-SERVICE-QLOCK-PATCH]. Pure helpers + decision
// types live at module level so createCapsule + updateCapsule branches
// invoke them as side-effect-free coordination primitives.
// ===========================================================================

// WHAT: Discriminator output shape for capsule mutation classification.
// INPUT: Used as a return type from discriminateMutation only.
// OUTPUT: None -- this is a type.
// WHY: Carries the resolved MutationType plus the canonical-record
//      projection + hash so the caller can persist mutation_type +
//      emit audit details without recomputing. sideEffectsRequired
//      drives the create/update branch (NOOP skips all; MERGE skips
//      encryption + storage; UPDATE runs full pipeline). noopReason
//      preserves observability for the σ-A unreadable-existing path.
interface MutationDecision {
  mutationType: "ADD" | "UPDATE" | "MERGE" | "NOOP";
  canonicalCapsuleMutationRecord: string;
  canonicalCapsuleMutationRecordHash: string;
  contentChanged: boolean;
  canonicalRecordChanged: boolean;
  sideEffectsRequired: {
    encryption: boolean;
    storage: boolean;
    dbWrite: boolean;
    versionIncrement: boolean;
  };
  noopReason?: string;
}

// WHAT: Throwaway error for transaction unwinding on CAS conflict.
// INPUT: mutationType (MERGE | UPDATE) + expected + actual versions.
// OUTPUT: None -- this is a class.
// WHY: V5 Patch 1 LOCK Option (b) per ADR-0042 G1.3 Correction 10: a
//      DENIED audit row written inside the rolled-back transaction
//      would not persist. Throw this private error from inside the
//      transaction body to unwind the mutation; the outer catch
//      emits a STANDALONE DENIED audit row (no tx arg) post-rollback
//      to preserve audit-chain integrity per RULE 4 + ADR-0002.
class VersionConflictError extends Error {
  constructor(
    public readonly mutationType: "MERGE" | "UPDATE",
    public readonly expected: number,
    public readonly actual: number | null,
  ) {
    super("CAPSULE_VERSION_CONFLICT");
    this.name = "VersionConflictError";
  }
}

// WHAT: 15-field byte-equivalent canonical projection of mutation-
//        relevant MemoryCapsule fields.
// INPUT: A subset of MemoryCapsule fields (existing or merged proposed).
// OUTPUT: A stable JSON string suitable for sha256 hashing.
// WHY: Q-G1.3-κ LOCK + ADR-0042 §Sub-decision Q-ε split-discriminator.
//      Project mutation-relevant fields only. EXCLUDES: capsule_id,
//      wallet_id, entity_id, version, previous_version, mutation_type,
//      created_at, updated_at, created_by, updated_by, *_session_id,
//      last_accessed_at, access_count, jurisdiction (immutable per
//      ADR-0037 Sub-decision 4), volatile fields. Reuses the
//      canonicalJson primitive from @niov/database/audit.ts to share
//      alphabetic-key-sort discipline with the audit canonicalRecord
//      port (avoids duplicate canonical-serializer drift).
function canonicalCapsuleMutationRecord(fields: {
  capsule_type: CapsuleType;
  topic_tags: string[];
  payload_summary: string;
  content_hash: string;
  decay_type: DecayType;
  decay_rate: number;
  storage_tier: StorageTier;
  clearance_required: number;
  connected_capsule_ids: string[];
  connected_entity_ids: string[];
  monetization_enabled: boolean;
  monetization_category: string | null;
  expires_at: Date | null;
  ai_access_blocked: boolean;
  requires_validation: boolean;
}): string {
  return canonicalJson({
    capsule_type: fields.capsule_type,
    topic_tags: fields.topic_tags,
    payload_summary: fields.payload_summary,
    content_hash: fields.content_hash,
    decay_type: fields.decay_type,
    decay_rate: fields.decay_rate,
    storage_tier: fields.storage_tier,
    clearance_required: fields.clearance_required,
    connected_capsule_ids: fields.connected_capsule_ids,
    connected_entity_ids: fields.connected_entity_ids,
    monetization_enabled: fields.monetization_enabled,
    monetization_category: fields.monetization_category,
    expires_at: fields.expires_at === null ? null : fields.expires_at.toISOString(),
    ai_access_blocked: fields.ai_access_blocked,
    requires_validation: fields.requires_validation,
  });
}

// WHAT: SHA-256 of plaintext content for NOOP discrimination probe.
// INPUT: Plaintext content string.
// OUTPUT: 64-char hex digest.
// WHY: Q-G1.3-ζ LOCK + V2-CONTENT-NOOP-PATCH + V3 Correction 3: the
//      persisted MemoryCapsule.content_hash is sha256(ciphertext) per
//      processContentForStorage L213, and encryption is non-
//      deterministic per packages/auth/src/crypto.ts:35 randomBytes(12)
//      IV. Plaintext-to-plaintext hash comparison is the ONLY valid
//      NOOP discriminator. This probe hash is NEVER persisted to the
//      MemoryCapsule row (the column semantics remain ciphertext-
//      derived for at-rest verification per Founder boundary lock).
//      Used in audit details under `*_plaintext_probe_hash` suffix
//      to distinguish from `*_ciphertext_content_hash`.
function plaintextHash(plaintext: string): string {
  return sha256Hex(plaintext);
}

// WHAT: Pure decision function classifying a capsule write as
//        ADD / UPDATE / MERGE / NOOP per ADR-0042 split-discriminator.
// INPUT: proposedInput (create or update payload) + the two plaintext
//        hashes (or null when not applicable) + existingCapsule + the
//        optional expected_version + caller-computed canonicalRecord
//        change flag and projection record/hash pair.
// OUTPUT: MutationDecision with sideEffectsRequired flags.
// WHY: Q-G1.3-α LOCK + Q-G1.3-β output shape. ZERO DB reads, ZERO
//      encryption calls, ZERO storage I/O, ZERO audit emissions
//      inside this helper -- caller does all I/O. Purity makes the
//      helper trivially unit-testable in G1.5 without mocks.
function discriminateMutation(params: {
  proposedInput: CapsuleCreateInput | CapsuleUpdateInput;
  proposedPlaintextHash: string | null;
  existingPlaintextHash: string | null;
  existingCapsule: MemoryCapsule | null;
  expectedVersion: number | null;
  canonicalRecordChanged: boolean;
  proposedCanonicalRecord: string;
  proposedCanonicalRecordHash: string;
}): MutationDecision {
  const {
    proposedInput,
    proposedPlaintextHash,
    existingPlaintextHash,
    existingCapsule,
    canonicalRecordChanged,
    proposedCanonicalRecord,
    proposedCanonicalRecordHash,
  } = params;

  // ADD: no prior capsule at this capsule_id -> create path.
  if (existingCapsule === null) {
    return {
      mutationType: "ADD",
      canonicalCapsuleMutationRecord: proposedCanonicalRecord,
      canonicalCapsuleMutationRecordHash: proposedCanonicalRecordHash,
      contentChanged: proposedPlaintextHash !== null,
      canonicalRecordChanged: true,
      sideEffectsRequired: {
        encryption: true,
        storage: true,
        dbWrite: true,
        // ADD path sets version=1 at create-time; no monotonic increment.
        versionIncrement: false,
      },
    };
  }

  // Update-path branches. Determine contentChanged via plaintext-hash
  // comparison ONLY (per V5 Patch 1 + V3 Correction 3). If
  // input.content was undefined, content is unchanged by definition
  // (proposedPlaintextHash === null). If content supplied but existing
  // could not be read/decrypted, the caller will apply the Q-G1.3-σ
  // σ-A override AFTER this function returns; here we report
  // contentChanged based on the hashes we have.
  const contentSupplied =
    "content" in proposedInput && proposedInput.content !== undefined;
  let contentChanged: boolean;
  if (!contentSupplied) {
    contentChanged = false;
  } else if (
    proposedPlaintextHash !== null &&
    existingPlaintextHash !== null
  ) {
    contentChanged = proposedPlaintextHash !== existingPlaintextHash;
  } else {
    // Content supplied but existing plaintext unknown (read/decrypt
    // failed). Conservative-by-construction: treat as changed; the
    // call site applies the σ-A override to force UPDATE with the
    // observability reason in audit details.
    contentChanged = true;
  }

  // NOOP: prior exists, content unchanged, canonical record unchanged.
  // Expected_version pre-check fires at the call site BEFORE this
  // function is invoked; if we reach here with expected_version
  // mismatch, it is a logic bug -- defense-in-depth still allows NOOP
  // result to be safe (caller will perform the CAS check inside the
  // transaction regardless).
  if (!contentChanged && !canonicalRecordChanged) {
    return {
      mutationType: "NOOP",
      canonicalCapsuleMutationRecord: proposedCanonicalRecord,
      canonicalCapsuleMutationRecordHash: proposedCanonicalRecordHash,
      contentChanged: false,
      canonicalRecordChanged: false,
      sideEffectsRequired: {
        encryption: false,
        storage: false,
        dbWrite: false,
        versionIncrement: false,
      },
      noopReason: "content_and_canonical_record_match",
    };
  }

  // MERGE: prior exists, content unchanged, but canonical record
  // differs (partial-field mutation of mutation-relevant non-content
  // fields). Skip encryption + storage write; do DB write + version
  // increment.
  if (!contentChanged && canonicalRecordChanged) {
    return {
      mutationType: "MERGE",
      canonicalCapsuleMutationRecord: proposedCanonicalRecord,
      canonicalCapsuleMutationRecordHash: proposedCanonicalRecordHash,
      contentChanged: false,
      canonicalRecordChanged: true,
      sideEffectsRequired: {
        encryption: false,
        storage: false,
        dbWrite: true,
        versionIncrement: true,
      },
    };
  }

  // UPDATE: prior exists, content differs (or unknown→assumed-changed).
  // Run full pipeline: encryption + storage + DB + version increment.
  return {
    mutationType: "UPDATE",
    canonicalCapsuleMutationRecord: proposedCanonicalRecord,
    canonicalCapsuleMutationRecordHash: proposedCanonicalRecordHash,
    contentChanged: true,
    canonicalRecordChanged,
    sideEffectsRequired: {
      encryption: true,
      storage: true,
      dbWrite: true,
      versionIncrement: true,
    },
  };
}

// WHAT: The class that orchestrates COSMP WRITE.
// INPUT: AuthService, declaration NonceStore, ContentStore,
//        ContentEncryption, JWT secret.
// OUTPUT: A class with createCapsule and updateCapsule methods.
// WHY: Constructor injection keeps tests cleanly composable -- they
//      can swap in MemoryContentStore + a known encryption key
//      without touching env vars.
export class WriteService {
  constructor(
    private readonly authService: AuthService,
    private readonly declarationStore: NonceStore,
    private readonly contentStore: ContentStore,
    private readonly encryption: ContentEncryption,
    private readonly jwtSecret: string,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  // WHAT: Create a brand-new MemoryCapsule owned by the session's
  //        entity (owner-write only for MVP).
  // INPUT: Session token, the create input.
  // OUTPUT: WriteSuccess on success, WriteFailure otherwise.
  // WHY: Spec attributes ownership to whoever owns the wallet. For
  //      MVP attributed creates are out of scope (declarations are
  //      keyed on existing capsule_ids). PATCH carries the
  //      attributed flow.
  async createCapsule(
    sessionToken: string,
    input: CapsuleCreateInput,
    context: { ip_address?: string | null } = {},
  ): Promise<WriteSuccess | WriteFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!session.valid) {
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        session.entity_id ?? null,
        session.code,
        context.ip_address ?? null,
      );
      return { ok: false, code: session.code, message: "Write denied" };
    }

    const errors = validateCreateInput(input);
    if (errors.length > 0) {
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        session.entity_id,
        "CAPSULE_DATA_INVALID",
        context.ip_address ?? null,
        { errors },
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Capsule data is invalid",
        errors,
      };
    }

    // Look up the wallet for the session's entity. Owner write
    // means the capsule lands in the caller's own wallet.
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: session.entity_id },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      // Defensive: every entity should have a wallet (Section 1B).
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        session.entity_id,
        "WALLET_MISSING",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Owner wallet not found",
        errors: ["wallet_missing"],
      };
    }

    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 5 (cascade) + Q2 LOCKED Option α (inline
    // cascade in WriteService — do NOT refactor to @niov/database
    // createCapsule helper; preserves WriteService audit/control
    // semantics). Owner-write means the capsule jurisdiction inherits
    // from the requester Entity's jurisdiction at create-time. ONE
    // bounded indexed PK lookup; no scans; capsule jurisdiction is
    // then immutable per Sub-decision 4 (updateCapsule cannot change
    // it; CapsuleUpdateInput has no jurisdiction field).
    const requesterForCascade = await getEntityById(session.entity_id);
    const cascadedJurisdiction = requesterForCascade?.jurisdiction ?? null;

    const capsuleId = randomUUID();
    const storageLocation = `niov://capsule/${capsuleId}`;
    const processed = processContentForStorage(input.content, this.encryption);

    // Storage upload BEFORE the database row so a failed upload
    // does not leave a dangling row pointing to nothing.
    await this.contentStore.write(storageLocation, processed.ciphertext);

    // G3.5 [CAPSULE-EMBEDDING-WRITE-INTEGRATION] per ADR-0043
    // §Sub-decision 11 (Q-G3-κ) + Q-G3.5-α LOCK: generate the
    // semantic embedding BEFORE the transaction so a provider
    // outage degrades gracefully (capsule write still succeeds;
    // embedding column remains NULL; G3.7 lazy backfill catches
    // missing embeddings). RULE 0 + Q-G3-ζ + Q-G3.5-η: vectors
    // are server-side substrate only; audit details record
    // generation outcome metadata but NEVER the vector itself.
    const embeddingResult: EmbeddingResult = await this.embeddingProvider
      .generateEmbedding(
        { text: input.content },
        { fixtureKey: capsuleId },
      )
      .catch((err): EmbeddingResult => ({
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: err instanceof Error ? err.message : String(err),
      }));

    const decayType: DecayType = input.decay_type ?? "TIME_BASED";
    const storageTier: StorageTier =
      decayType === "FOUNDATIONAL" ? "HOT" : input.storage_tier ?? "WARM";

    // G1.3 per Q-G1.3-λ + V4 Patch 1 + V5 Patch 1: wrap DB create +
    // audit emission in prisma.$transaction for atomic mutation+audit
    // per RULE 4. contentStore.write at L336 (above) STAYS OUTSIDE the
    // transaction because Supabase Storage (and any future object
    // storage backend per ADR-0018) is NOT rollback-able by Prisma
    // transaction abort -- the pre-existing storage→DB orphan risk
    // (D-STORAGE-DB-ATOMICITY-BOUNDARY per ADR-0042 G1.3 Correction 4)
    // is preserved, NOT introduced by G1.3. Outbox pattern remains
    // forward-substrate.
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.memoryCapsule.create({
        data: {
          capsule_id: capsuleId,
          wallet_id: wallet.wallet_id,
          entity_id: session.entity_id,
          version: 1,
          // G1.3 per ADR-0042 §Sub-decision Q-β + Q-G1.3-γ LOCK:
          // createCapsule always produces ADD (new capsule_id; no
          // duplicate-create dedupe in G1.3 per Q-G1.3-γ).
          mutation_type: "ADD",
          capsule_type: input.capsule_type,
          topic_tags: input.topic_tags,
          decay_type: decayType,
          decay_rate: input.decay_rate ?? 0.01,
          payload_summary: input.payload_summary,
          payload_size_tokens: processed.payload_size_tokens,
          tokens: processed.tokens,
          tokens_tokenizer: processed.tokens_tokenizer,
          storage_location: storageLocation,
          storage_tier: storageTier,
          clearance_required: input.clearance_required ?? 0,
          content_hash: processed.content_hash,
          connected_capsule_ids: input.connected_capsule_ids ?? [],
          connected_entity_ids: input.connected_entity_ids ?? [],
          monetization_enabled: input.monetization_enabled ?? false,
          monetization_category: input.monetization_category ?? null,
          expires_at: input.expires_at ?? null,
          ai_access_blocked: input.ai_access_blocked ?? false,
          requires_validation: input.requires_validation ?? false,
          // CAR Sub-box 2 sub-phase 4 jurisdiction cascade per Q2
          // LOCKED Option α — inherits from requester Entity at
          // create-time; immutable thereafter per Sub-decision 4.
          jurisdiction: cascadedJurisdiction,

          // Attribution (set once, never overwritten on update).
          created_by: session.entity_id,
          created_session_id: session.session_id,
          write_reason: input.write_reason ?? null,

          // ADR-0045 G5.3 Q-G5.3-α α-1 + γ-1 + δ-3 + ε-1: embedding
          // lag detection metadata. Set ONLY when embeddingResult.ok
          // (γ-1 success-only); paired with content_hash for stale
          // detection. ADD failure leaves both NULL (ε-1) — graceful
          // degradation per Q-G3.5-α inheritance. No new audit literal
          // (Q-G5.3-ι ι-1). No filtering / ranking / lifecycle
          // (Q-G5.3-β β-1 + scope canonical at ADR-0045 §G5.3).
          ...(embeddingResult.ok
            ? {
                embedding_content_hash: processed.content_hash,
                embedding_generated_at: new Date(),
              }
            : {}),
        },
      });

      // G3.5 per ADR-0043 §Sub-decision 11 + Q-G3.5-γ LOCK: persist
      // the embedding via inline raw SQL inside the transaction.
      // Prisma generated client cannot project the pgvector column
      // (Unsupported("vector(1536)") per ADR-0043 §G3.3 + Q-G3-β);
      // $executeRawUnsafe with positional $1/$2 bindings + explicit
      // ::vector(1536) cast is the canonical path. Degrade path
      // (embeddingResult.ok === false) skips this write — the row's
      // embedding column stays NULL per Q-G3.5-α.
      if (embeddingResult.ok) {
        const vectorLiteral = `[${embeddingResult.vector.join(",")}]`;
        await tx.$executeRawUnsafe(
          `UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid`,
          vectorLiteral,
          capsuleId,
        );
      }

      // G1.3 per ADR-0042 §Sub-decision Q-γ Disposition Q-γ.1 LOCKED
      // clean transition: createCapsule SUCCESS emits the discriminated
      // CAPSULE_MUTATION_ADD literal. The legacy CAPSULE_CREATED literal
      // remains recognized by isKnownAuditEventType for historical-row
      // queryability per RULE 10; new emissions use discriminated only.
      await writeAuditEvent({
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        target_entity_id: session.entity_id,
        target_capsule_id: capsuleId,
        session_id: session.session_id,
        ip_address: context.ip_address ?? null,
        // CAR Sub-box 2 sub-phase 4 per ADR-0037 Sub-decision 5
        // AuditEvent jurisdiction cascade: capsule-scoped success event
        // carries created.jurisdiction at row-metadata register.
        jurisdiction: row.jurisdiction,
        details: {
          // G1.3 per Q-G1.3-ο audit-details minimalism LOCK: include
          // mutation_type field only; existing details (write_type,
          // capsule_type, content_hash, payload_size_tokens,
          // write_reason) preserved verbatim. NO diff summary, NO
          // canonical record body, NO content-similarity, NO
          // monetization/Federation/cohort metadata in G1.3.
          mutation_type: "ADD",
          write_type: "OWNER",
          capsule_type: input.capsule_type,
          content_hash: processed.content_hash,
          payload_size_tokens: processed.payload_size_tokens,
          write_reason: input.write_reason ?? null,
          // G3.5 per ADR-0043 + Q-G3.5-η LOCK: outcome metadata only
          // (provider success/failure summary). No raw vector or
          // derived per-dimension content in audit details per
          // Q-G3-ζ + RULE 0 inversion-attack disposition (RS-5).
          ...(embeddingResult.ok
            ? {
                embedding_generated: true,
                embedding_model: embeddingResult.model,
                embedding_dimensions: embeddingResult.dimensions,
                embedding_tokens_used: embeddingResult.tokens_used,
              }
            : {
                embedding_generated: false,
                embedding_failure_class: embeddingResult.error_class,
                embedding_failure_message: embeddingResult.message,
              }),
        },
      }, tx);

      return row;
    });

    return {
      ok: true,
      capsule_id: created.capsule_id,
      version: created.version,
      content_hash: created.content_hash,
      storage_location: created.storage_location,
      write_type: "OWNER",
    };
  }

  // WHAT: System-path variant of createCapsule consumed by the
  //        ADR-0057 Action runtime RECORD_CAPSULE handler. Mirrors
  //        createCapsule step-wise but bypasses session-token
  //        validation — the gate is that the Action has already
  //        passed the policy evaluator + dual-control (if required)
  //        before reaching the executor. The actor_entity_id is the
  //        Action.source_entity_id; audit attribution carries the
  //        back-reference action_id so any misuse is forensically
  //        visible. Mirrors the precedent at
  //        apps/api/src/services/governance/system-permission.ts
  //        (createSystemPermission) for narrow server-side flows
  //        that need to write on an entity's behalf without a live
  //        session.
  // INPUT: { actor_entity_id, action_id, input, context? }.
  // OUTPUT: WriteSuccess on success, WriteFailure otherwise.
  // WHY: The executor handler has no session token; rather than
  //      mint a synthetic session (security hazard) or persist the
  //      original caller's token (credential-storage anti-pattern),
  //      we expose a narrow system-path that the handler can call.
  //      The method intentionally lives on WriteService (not the
  //      action service) so the COSMP write pipeline — encryption,
  //      embedding, storage upload, jurisdiction cascade, audit
  //      emission, transaction boundaries — stays in one place.
  // GATING: This method is callable only from the action executor's
  //         handler registry. There is no route that exposes it;
  //         adding one would require a separate Founder-authorized
  //         QLOCK + ADR amendment.
  // AUDIT: Emits CAPSULE_MUTATION_ADD with actor_entity_id =
  //        actor_entity_id, target_entity_id = actor_entity_id
  //        (owner-write), and details.action_id back-reference for
  //        forensic traceability.
  async createCapsuleForActionRunner(args: {
    actor_entity_id: string;
    action_id: string;
    input: CapsuleCreateInput;
    context?: { ip_address?: string | null };
  }): Promise<WriteSuccess | WriteFailure> {
    const actor_entity_id = args.actor_entity_id;
    const action_id = args.action_id;
    const input = args.input;
    const ip_address = args.context?.ip_address ?? null;

    // Defensive re-validation at execute-time. The create-time
    // validator already ran at action.service.ts but a long delay
    // between create and execute could theoretically allow a future
    // refactor to introduce drift; re-validating here keeps the
    // contract self-contained.
    const errors = validateCreateInput(input);
    if (errors.length > 0) {
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        actor_entity_id,
        "CAPSULE_DATA_INVALID",
        ip_address,
        { errors, action_id },
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Capsule data is invalid",
        errors,
      };
    }

    // Defensive TAR re-check: can_write_capsules must still be true
    // and the actor's TAR must still be ACTIVE at execute-time. The
    // policy evaluator gated this at create-time, but a TAR demote
    // between create and execute would otherwise allow the write
    // through. RULE 0 + RULE 5 (auth -> clearance -> permission ->
    // conditions): re-verify before mutation.
    const tar = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: actor_entity_id },
      select: { can_write_capsules: true, status: true },
    });
    if (tar === null || tar.status !== "ACTIVE" || tar.can_write_capsules !== true) {
      // RULE 13: the WriteFailure.code union does not include
      // "TAR_DEMOTED"; using OPERATION_NOT_PERMITTED (the
      // semantically-closest existing code) lets the union stay
      // closed. The action handler maps this to error_class =
      // "TAR_DEMOTED" so the audit + result error_class still
      // carries the specific reason. The auditDenial reason field
      // ("TAR_DEMOTED") is a string-typed denial_reason and is
      // independent of the WriteFailure code union.
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        actor_entity_id,
        "TAR_DEMOTED",
        ip_address,
        { action_id },
      );
      return {
        ok: false,
        code: "OPERATION_NOT_PERMITTED",
        message: "Actor TAR does not permit capsule writes at execute time",
      };
    }

    // Owner-write: capsule lands in the actor's own wallet. Defensive
    // wallet lookup mirrors createCapsule (every entity should have a
    // wallet per Section 1B).
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: actor_entity_id },
      select: { wallet_id: true },
    });
    if (wallet === null) {
      await this.auditDenial(
        "CAPSULE_MUTATION_ADD",
        null,
        actor_entity_id,
        "WALLET_MISSING",
        ip_address,
        { action_id },
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Owner wallet not found",
        errors: ["wallet_missing"],
      };
    }

    // Jurisdiction cascade per ADR-0037 Sub-decision 5 (inherits
    // from actor Entity at create-time; immutable thereafter).
    const requesterForCascade = await getEntityById(actor_entity_id);
    const cascadedJurisdiction = requesterForCascade?.jurisdiction ?? null;

    const capsuleId = randomUUID();
    const storageLocation = `niov://capsule/${capsuleId}`;
    const processed = processContentForStorage(input.content, this.encryption);

    // Storage upload BEFORE the database row so a failed upload does
    // not leave a dangling row pointing to nothing (preserves the
    // pre-existing D-STORAGE-DB-ATOMICITY-BOUNDARY discipline; outbox
    // pattern remains forward-substrate).
    await this.contentStore.write(storageLocation, processed.ciphertext);

    // Embedding generation outside the transaction so a provider
    // outage degrades gracefully (capsule write still succeeds;
    // embedding column remains NULL).
    const embeddingResult: EmbeddingResult = await this.embeddingProvider
      .generateEmbedding(
        { text: input.content },
        { fixtureKey: capsuleId },
      )
      .catch((err): EmbeddingResult => ({
        ok: false,
        error_class: "PROVIDER_ERROR",
        message: err instanceof Error ? err.message : String(err),
      }));

    const decayType: DecayType = input.decay_type ?? "TIME_BASED";
    const storageTier: StorageTier =
      decayType === "FOUNDATIONAL" ? "HOT" : input.storage_tier ?? "WARM";

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.memoryCapsule.create({
        data: {
          capsule_id: capsuleId,
          wallet_id: wallet.wallet_id,
          entity_id: actor_entity_id,
          version: 1,
          mutation_type: "ADD",
          capsule_type: input.capsule_type,
          topic_tags: input.topic_tags,
          decay_type: decayType,
          decay_rate: input.decay_rate ?? 0.01,
          payload_summary: input.payload_summary,
          payload_size_tokens: processed.payload_size_tokens,
          tokens: processed.tokens,
          tokens_tokenizer: processed.tokens_tokenizer,
          storage_location: storageLocation,
          storage_tier: storageTier,
          clearance_required: input.clearance_required ?? 0,
          content_hash: processed.content_hash,
          connected_capsule_ids: input.connected_capsule_ids ?? [],
          connected_entity_ids: input.connected_entity_ids ?? [],
          monetization_enabled: input.monetization_enabled ?? false,
          monetization_category: input.monetization_category ?? null,
          expires_at: input.expires_at ?? null,
          ai_access_blocked: input.ai_access_blocked ?? false,
          requires_validation: input.requires_validation ?? false,
          jurisdiction: cascadedJurisdiction,

          created_by: actor_entity_id,
          // System-path has no session_id (no live session); audit
          // attribution rides actor_entity_id + action_id back-ref.
          created_session_id: null,
          write_reason: input.write_reason ?? null,

          ...(embeddingResult.ok
            ? {
                embedding_content_hash: processed.content_hash,
                embedding_generated_at: new Date(),
              }
            : {}),
        },
      });

      if (embeddingResult.ok) {
        const vectorLiteral = `[${embeddingResult.vector.join(",")}]`;
        await tx.$executeRawUnsafe(
          `UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid`,
          vectorLiteral,
          capsuleId,
        );
      }

      await writeAuditEvent({
        event_type: "CAPSULE_MUTATION_ADD",
        outcome: "SUCCESS",
        actor_entity_id: actor_entity_id,
        target_entity_id: actor_entity_id,
        target_capsule_id: capsuleId,
        // No session_id at system-path; the action_id in details is
        // the forensic back-reference.
        session_id: null,
        ip_address,
        jurisdiction: row.jurisdiction,
        details: {
          mutation_type: "ADD",
          write_type: "OWNER",
          capsule_type: input.capsule_type,
          content_hash: processed.content_hash,
          payload_size_tokens: processed.payload_size_tokens,
          write_reason: input.write_reason ?? null,
          // ADR-0057 back-reference: every system-path write carries
          // the originating action_id so the audit chain ties the
          // CAPSULE_MUTATION_ADD row to the ACTION_* chain.
          action_id,
          ...(embeddingResult.ok
            ? {
                embedding_generated: true,
                embedding_model: embeddingResult.model,
                embedding_dimensions: embeddingResult.dimensions,
                embedding_tokens_used: embeddingResult.tokens_used,
              }
            : {
                embedding_generated: false,
                embedding_failure_class: embeddingResult.error_class,
                embedding_failure_message: embeddingResult.message,
              }),
        },
      }, tx);

      return row;
    });

    return {
      ok: true,
      capsule_id: created.capsule_id,
      version: created.version,
      content_hash: created.content_hash,
      storage_location: created.storage_location,
      write_type: "OWNER",
    };
  }

  // WHAT: Update an existing MemoryCapsule with G1.3 mutation
  //        discrimination (ADD / UPDATE / MERGE / NOOP) per ADR-0042.
  //        Owner-write when the session entity owns the capsule;
  //        otherwise attributed and a write-permitting access
  //        declaration is required.
  // INPUT: Session token, the capsule_id to update, the update
  //        input (with optional expected_version for opt-in OCC),
  //        and (for attributed writes) the declaration token.
  // OUTPUT: WriteSuccess on success, WriteFailure otherwise.
  // WHY: G1.3 discriminates UPDATE / MERGE / NOOP via the split-
  //      discriminator at discriminateMutation (content_hash +
  //      canonical_record + version/expected_version per
  //      ADR-0042 §Sub-decision Q-ε). NOOP emits audit + zero side
  //      effects. MERGE updates DB without re-encryption. UPDATE
  //      runs full pipeline. CAS conflicts throw VersionConflictError
  //      to unwind the transaction; standalone DENIED audit emitted
  //      post-rollback per V5 Patch 1 LOCK Option (b).
  async updateCapsule(
    sessionToken: string,
    capsuleId: string,
    input: CapsuleUpdateInput,
    declarationToken: string | null,
    context: { ip_address?: string | null } = {},
  ): Promise<WriteSuccess | WriteFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "write",
    );
    if (!session.valid) {
      await this.auditDenial(
        "CAPSULE_MUTATION_UPDATE",
        capsuleId,
        null,
        session.code,
        context.ip_address ?? null,
      );
      return { ok: false, code: session.code, message: "Write denied" };
    }

    const existing = await prisma.memoryCapsule.findFirst({
      where: { capsule_id: capsuleId, deleted_at: null },
    });
    if (existing === null) {
      await this.auditDenial(
        "CAPSULE_MUTATION_UPDATE",
        capsuleId,
        session.entity_id,
        "CAPSULE_NOT_FOUND",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CAPSULE_NOT_FOUND",
        message: "Capsule not found",
      };
    }

    // CAR Sub-box 2 sub-phase 4 [CAR-SUB-BOX-2-COSMP-ENFORCEMENT] per
    // ADR-0037 Sub-decision 7 + Q6 LOCKED Option α: WRITE updateCapsule
    // enforces actor↔existing capsule jurisdiction. The capsule
    // jurisdiction is the immutable anchor (Sub-decision 4); the
    // actor's CAN drift, so an EU-DE-relocated US-FEDERAL data steward
    // cannot mutate a US-FEDERAL capsule from the new jurisdiction
    // without a sanctioned cross-region transfer workflow
    // (forward-queued). Pure-function helper; ONE bounded indexed PK
    // lookup for the requester (existing pattern; substrate-coherent
    // with Sub-phase 6 §18 Whole-COSMP scalability discipline).
    const requesterForUpdate = await getEntityById(session.entity_id);
    if (requesterForUpdate !== null) {
      const updateJurisdiction = assertJurisdictionalScope({
        actor: {
          entity_id: requesterForUpdate.entity_id,
          jurisdiction: requesterForUpdate.jurisdiction,
        },
        target: {
          capsule: {
            capsule_id: existing.capsule_id,
            jurisdiction: existing.jurisdiction,
          },
        },
        action: "WRITE",
      });
      if (!updateJurisdiction.ok) {
        await this.auditDenial(
          "CAPSULE_MUTATION_UPDATE",
          capsuleId,
          session.entity_id,
          updateJurisdiction.code,
          context.ip_address ?? null,
          {
            actor_jurisdiction: updateJurisdiction.actor_jurisdiction,
            target_jurisdiction: updateJurisdiction.target_jurisdiction,
            jurisdiction: existing.jurisdiction,
          },
        );
        return {
          ok: false,
          code: updateJurisdiction.code,
          message: "updateCapsule denied at jurisdiction-scope enforcement",
        };
      }
    }

    const writeType: "OWNER" | "ATTRIBUTED" =
      existing.entity_id === session.entity_id ? "OWNER" : "ATTRIBUTED";

    if (writeType === "ATTRIBUTED") {
      if (declarationToken === null) {
        await this.auditDenial(
          "CAPSULE_MUTATION_UPDATE",
          capsuleId,
          session.entity_id,
          "ACCESS_DECLARATION_INVALID",
          context.ip_address ?? null,
          { reason: "declaration_required_for_attributed_write" },
        );
        return {
          ok: false,
          code: "ACCESS_DECLARATION_INVALID",
          message: "Attributed writes require an access declaration",
        };
      }
      const declarationCheck = this.checkDeclarationToken(
        declarationToken,
        capsuleId,
        session.entity_id,
      );
      if (!declarationCheck.ok) {
        await this.auditDenial(
          "CAPSULE_MUTATION_UPDATE",
          capsuleId,
          session.entity_id,
          declarationCheck.code,
          context.ip_address ?? null,
        );
        return declarationCheck;
      }
      const stillLive = await this.declarationStore.has(
        declarationCheck.declaration.declaration_id,
      );
      if (!stillLive) {
        await this.auditDenial(
          "CAPSULE_MUTATION_UPDATE",
          capsuleId,
          session.entity_id,
          "ACCESS_DECLARATION_EXPIRED",
          context.ip_address ?? null,
        );
        return {
          ok: false,
          code: "ACCESS_DECLARATION_EXPIRED",
          message: "Access declaration no longer valid",
        };
      }

      // Permission must explicitly allow write.
      const permission = await prisma.permission.findFirst({
        where: {
          capsule_id: capsuleId,
          grantee_entity_id: session.entity_id,
          status: "ACTIVE",
        },
        orderBy: { created_at: "desc" },
      });
      if (permission === null || !permissionAllowsWrite(permission.conditions)) {
        await this.auditDenial(
          "CAPSULE_MUTATION_UPDATE",
          capsuleId,
          session.entity_id,
          "WRITE_NOT_PERMITTED",
          context.ip_address ?? null,
        );
        return {
          ok: false,
          code: "WRITE_NOT_PERMITTED",
          message: "This permission does not include write access",
        };
      }
    }

    // ========================================================================
    // G1.3 [CAPSULE-MUTATION-WRITE-SERVICE] discrimination phase begins here.
    // Permission gates (session / existing / jurisdiction / ATTRIBUTED
    // declaration / permissionAllowsWrite) all passed above. Per Q-G1.3-ν
    // ORDER LOCK, discrimination NEVER runs before permission gates.
    // ========================================================================

    // G1.3 per ADR-0042 §Sub-decision Q-η + Q-G1.3-η + Q-G1.3-θ LOCKs:
    // optional expected_version pre-check. Fast-fail outside the
    // transaction for the common-case (caller's snapshot is stale).
    // The authoritative CAS fires inside the transaction below as
    // defense-in-depth against TOCTOU drift between this check and
    // the transactional updateMany.
    if (
      input.expected_version != null &&
      input.expected_version !== existing.version
    ) {
      await this.auditDenial(
        "CAPSULE_MUTATION_UPDATE",
        capsuleId,
        session.entity_id,
        "CAPSULE_VERSION_CONFLICT",
        context.ip_address ?? null,
        {
          mutation_type: "UPDATE",
          expected_version: input.expected_version,
          actual_version: existing.version,
        },
      );
      return {
        ok: false,
        code: "CAPSULE_VERSION_CONFLICT",
        message: `Capsule version conflict — expected v${input.expected_version}, actual v${existing.version}`,
      };
    }

    // Input shape validation (pre-discrimination, pre-transaction):
    // structural rejects fire DENIED with discriminated literal but
    // do NOT consult the mutation discriminator (input is malformed).
    if (input.topic_tags !== undefined && input.topic_tags.length === 0) {
      await this.auditDenial(
        "CAPSULE_MUTATION_UPDATE",
        capsuleId,
        session.entity_id,
        "CAPSULE_DATA_INVALID",
        context.ip_address ?? null,
        { errors: ["topic_tags must be non-empty when supplied"] },
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Capsule data is invalid",
        errors: ["topic_tags must be non-empty when supplied"],
      };
    }
    if (input.content !== undefined && input.content.length === 0) {
      await this.auditDenial(
        "CAPSULE_MUTATION_UPDATE",
        capsuleId,
        session.entity_id,
        "CAPSULE_DATA_INVALID",
        context.ip_address ?? null,
        { errors: ["content must be a non-empty string when supplied"] },
      );
      return {
        ok: false,
        code: "CAPSULE_DATA_INVALID",
        message: "Capsule data is invalid",
        errors: ["content must be a non-empty string when supplied"],
      };
    }

    // G1.3 per Q-G1.3-ζ + V2-CONTENT-NOOP-PATCH + V3 Correction 3 +
    // Q-G1.3-σ LOCK at σ-A (conservative-changed): read existing
    // ciphertext + decrypt to derive existingPlaintextHash for valid
    // plaintext-to-plaintext NOOP discrimination. Persisted
    // MemoryCapsule.content_hash is sha256(ciphertext) and encryption
    // is non-deterministic (packages/auth/src/crypto.ts:35 randomBytes
    // per IV), so the persisted hash CANNOT be compared to a plaintext
    // probe hash. The decrypted plaintext is held in a local variable
    // only; never logged; never returned; never persisted; discarded
    // after plaintextHash() computation per RULE 0 + Q-G1.3-ο.
    let existingPlaintextHash: string | null = null;
    let proposedPlaintextHash: string | null = null;
    let contentReadable = true;
    if (input.content !== undefined) {
      proposedPlaintextHash = plaintextHash(input.content);
      try {
        const existingCiphertext = await this.contentStore.read(
          existing.storage_location,
        );
        if (existingCiphertext === null) {
          contentReadable = false;
        } else {
          const existingPlaintext = this.encryption.decrypt(existingCiphertext);
          existingPlaintextHash = plaintextHash(existingPlaintext);
        }
      } catch {
        // Auth-tag mismatch / key rotation / corruption. Q-G1.3-σ σ-A
        // LOCK: do NOT fail the user write; force UPDATE path with
        // observability reason in audit details (below).
        contentReadable = false;
      }
    }

    // Compute canonical record projection for split-discriminator
    // per ADR-0042 §Sub-decision Q-ε + Q-G1.3-κ.
    const existingCanonicalRecord = canonicalCapsuleMutationRecord({
      capsule_type: existing.capsule_type,
      topic_tags: existing.topic_tags,
      payload_summary: existing.payload_summary,
      content_hash: existing.content_hash,
      decay_type: existing.decay_type,
      decay_rate: existing.decay_rate,
      storage_tier: existing.storage_tier,
      clearance_required: existing.clearance_required,
      connected_capsule_ids: existing.connected_capsule_ids,
      connected_entity_ids: existing.connected_entity_ids,
      monetization_enabled: existing.monetization_enabled,
      monetization_category: existing.monetization_category,
      expires_at: existing.expires_at,
      ai_access_blocked: existing.ai_access_blocked,
      requires_validation: existing.requires_validation,
    });
    const existingCanonicalRecordHash = sha256Hex(existingCanonicalRecord);

    // Proposed canonical record uses existing.content_hash (do NOT
    // recompute new ciphertext hash here; encryption side effect is
    // deferred to UPDATE branch only). Content equivalence is
    // resolved separately via plaintext-hash comparison in
    // discriminateMutation. canonical_record drift therefore reflects
    // NON-CONTENT mutation-relevant fields (MERGE signal) while
    // content drift is captured by plaintext-hash comparison.
    const proposedCanonicalRecord = canonicalCapsuleMutationRecord({
      capsule_type: input.capsule_type ?? existing.capsule_type,
      topic_tags: input.topic_tags ?? existing.topic_tags,
      payload_summary: input.payload_summary ?? existing.payload_summary,
      content_hash: existing.content_hash,
      decay_type: input.decay_type ?? existing.decay_type,
      decay_rate: input.decay_rate ?? existing.decay_rate,
      storage_tier: input.storage_tier ?? existing.storage_tier,
      clearance_required:
        input.clearance_required ?? existing.clearance_required,
      connected_capsule_ids:
        input.connected_capsule_ids ?? existing.connected_capsule_ids,
      connected_entity_ids:
        input.connected_entity_ids ?? existing.connected_entity_ids,
      monetization_enabled:
        input.monetization_enabled ?? existing.monetization_enabled,
      monetization_category:
        input.monetization_category !== undefined
          ? input.monetization_category
          : existing.monetization_category,
      // CapsuleUpdateInput has no expires_at field (immutable post-
      // create per existing substrate); project existing value.
      expires_at: existing.expires_at,
      ai_access_blocked:
        input.ai_access_blocked ?? existing.ai_access_blocked,
      requires_validation:
        input.requires_validation ?? existing.requires_validation,
    });
    const proposedCanonicalRecordHash = sha256Hex(proposedCanonicalRecord);
    const canonicalRecordChanged =
      proposedCanonicalRecordHash !== existingCanonicalRecordHash;

    // Invoke pure discriminator. Returns MutationDecision with
    // sideEffectsRequired flags driving the branch below.
    const decision = discriminateMutation({
      proposedInput: input,
      proposedPlaintextHash,
      existingPlaintextHash,
      existingCapsule: existing,
      expectedVersion: input.expected_version ?? null,
      canonicalRecordChanged,
      proposedCanonicalRecord,
      proposedCanonicalRecordHash,
    });

    // Q-G1.3-σ σ-A LOCK: existing-content-unreadable override. Force
    // UPDATE path with observability reason in audit details. NEVER
    // fail the user write on a read/decrypt failure.
    if (input.content !== undefined && !contentReadable) {
      decision.mutationType = "UPDATE";
      decision.contentChanged = true;
      decision.noopReason = "existing_content_unreadable";
      decision.sideEffectsRequired = {
        encryption: true,
        storage: true,
        dbWrite: true,
        versionIncrement: true,
      };
    }

    // G1.3 per Q-G1.3-λ + Q-G1.3-ρ: storage write happens OUTSIDE the
    // Prisma transaction for the UPDATE branch (object storage is not
    // rollback-able by Prisma; pre-existing
    // D-STORAGE-DB-ATOMICITY-BOUNDARY per ADR-0042 G1.3 Correction 4).
    // Computed here so the new content_hash is available for both the
    // tx.memoryCapsule.update data payload AND the audit details.
    let processed:
      | {
          ciphertext: string;
          content_hash: string;
          payload_size_tokens: number;
          tokens: number;
          tokens_tokenizer: string;
        }
      | null = null;
    // G3.5 per ADR-0043 §Sub-decision 11 + Q-G3.5-α/β LOCKS:
    // embeddingResult is generated ONLY for the UPDATE branch
    // (Q-G3-ι matrix: ADD generate / UPDATE regenerate /
    // MERGE preserve / NOOP preserve). MERGE skips the provider
    // because content_hash is unchanged (Q-G3.5-β); NOOP skips
    // all side effects. Provider failure degrades gracefully
    // per Q-G3.5-α (capsule write still succeeds; embedding
    // column preserves prior value).
    let embeddingResult: EmbeddingResult | null = null;
    if (decision.mutationType === "UPDATE") {
      processed = processContentForStorage(input.content!, this.encryption);
      await this.contentStore.write(
        existing.storage_location,
        processed.ciphertext,
      );
      embeddingResult = await this.embeddingProvider
        .generateEmbedding(
          { text: input.content! },
          { fixtureKey: capsuleId },
        )
        .catch((err): EmbeddingResult => ({
          ok: false,
          error_class: "PROVIDER_ERROR",
          message: err instanceof Error ? err.message : String(err),
        }));
    }

    // G1.3 per Q-G1.3-λ + V4 Patch 1 + V5 Patch 1: DB mutation +
    // audit emission INSIDE prisma.$transaction for atomic mutation +
    // audit per RULE 4. CAS conflicts throw VersionConflictError to
    // unwind the transaction; the outer catch emits a STANDALONE
    // DENIED audit row post-rollback (writeAuditEvent without tx arg)
    // to preserve audit-chain integrity per RULE 4 + ADR-0002 +
    // ADR-0042 G1.3 Correction 10.
    try {
      const updated = await prisma.$transaction(async (tx) => {
        // ============== NOOP branch ==============
        if (decision.mutationType === "NOOP") {
          await writeAuditEvent(
            {
              event_type: "CAPSULE_MUTATION_NOOP",
              outcome: "SUCCESS",
              actor_entity_id: session.entity_id,
              target_entity_id: existing.entity_id,
              target_capsule_id: capsuleId,
              session_id: session.session_id,
              ip_address: context.ip_address ?? null,
              jurisdiction: existing.jurisdiction,
              details: {
                // Q-G1.3-ο audit-details minimalism: hashes only;
                // distinguish ciphertext_content_hash vs
                // plaintext_probe_hash via suffix per V3 Correction 3e.
                mutation_type: "NOOP",
                reason:
                  decision.noopReason ?? "content_and_canonical_record_match",
                existing_ciphertext_content_hash: existing.content_hash,
                proposed_plaintext_probe_hash: proposedPlaintextHash,
                existing_plaintext_probe_hash: existingPlaintextHash,
                existing_canonical_record_hash: existingCanonicalRecordHash,
                proposed_canonical_record_hash:
                  decision.canonicalCapsuleMutationRecordHash,
                expected_version: input.expected_version ?? null,
                write_reason: input.write_reason ?? null,
              },
            },
            tx,
          );
          // NOOP returns existing row unchanged. Zero DB writes; zero
          // version increment; zero storage writes; zero encryption.
          return existing;
        }

        // ============== MERGE + UPDATE shared data builder ==============
        const data: Prisma.MemoryCapsuleUpdateInput = {
          version: { increment: 1 },
          previous_version: existing.version,
          mutation_type: decision.mutationType as MutationType,
          updated_by: session.entity_id,
          updated_session_id: session.session_id,
        };
        if (input.write_reason !== undefined) {
          data.write_reason = input.write_reason;
        }
        if (input.capsule_type !== undefined) {
          data.capsule_type = input.capsule_type;
        }
        if (input.topic_tags !== undefined) {
          data.topic_tags = input.topic_tags;
        }
        if (input.payload_summary !== undefined) {
          data.payload_summary = input.payload_summary;
        }
        if (input.decay_type !== undefined) data.decay_type = input.decay_type;
        if (input.decay_rate !== undefined) data.decay_rate = input.decay_rate;
        if (input.storage_tier !== undefined)
          data.storage_tier = input.storage_tier;
        if (input.clearance_required !== undefined)
          data.clearance_required = input.clearance_required;
        if (input.relevance_score !== undefined)
          data.relevance_score = input.relevance_score;
        if (input.connected_capsule_ids !== undefined)
          data.connected_capsule_ids = input.connected_capsule_ids;
        if (input.connected_entity_ids !== undefined)
          data.connected_entity_ids = input.connected_entity_ids;
        if (input.monetization_enabled !== undefined)
          data.monetization_enabled = input.monetization_enabled;
        if (input.monetization_category !== undefined)
          data.monetization_category = input.monetization_category;
        if (input.ai_access_blocked !== undefined)
          data.ai_access_blocked = input.ai_access_blocked;
        if (input.requires_validation !== undefined)
          data.requires_validation = input.requires_validation;
        if (decision.mutationType === "UPDATE" && processed !== null) {
          data.content_hash = processed.content_hash;
          data.payload_size_tokens = processed.payload_size_tokens;
          data.tokens = processed.tokens;
          data.tokens_tokenizer = processed.tokens_tokenizer;
          // ADR-0045 G5.3 Q-G5.3-α α-1 + γ-1 + δ-3 + θ-1: UPDATE
          // success regenerates embedding lag metadata to NEW
          // content_hash + NEW timestamp. UPDATE failure
          // (!embeddingResult.ok) does NOT add these to data, so
          // Prisma update leaves OLD embedding_content_hash + OLD
          // embedding_generated_at intact alongside OLD embedding
          // vector — stale-embedding state detectable via NEW
          // content_hash != OLD embedding_content_hash. Substrate-
          // honest preservation of Q-G3.5-α degrade-policy.
          if (embeddingResult !== null && embeddingResult.ok) {
            data.embedding_content_hash = processed.content_hash;
            data.embedding_generated_at = new Date();
          }
        }

        // CAS path when expected_version supplied; standard update
        // otherwise (last-writer-wins backward-compat).
        let updatedRow: MemoryCapsule | null;
        if (input.expected_version != null) {
          const result = await tx.memoryCapsule.updateMany({
            where: {
              capsule_id: capsuleId,
              version: input.expected_version,
              deleted_at: null,
            },
            data,
          });
          if (result.count === 0) {
            // Concurrent writer landed between the pre-transaction
            // fast-fail and this CAS. Read actual version inside the
            // transaction (will be discarded with the rollback; safe
            // read) and throw to unwind.
            const reread = await tx.memoryCapsule.findFirst({
              where: { capsule_id: capsuleId, deleted_at: null },
              select: { version: true },
            });
            throw new VersionConflictError(
              decision.mutationType as "MERGE" | "UPDATE",
              input.expected_version,
              reread?.version ?? null,
            );
          }
          // Re-fetch the post-update row to return to caller.
          updatedRow = await tx.memoryCapsule.findFirst({
            where: { capsule_id: capsuleId },
          });
          if (updatedRow === null) {
            throw new Error("Post-update row fetch returned null");
          }
        } else {
          updatedRow = await tx.memoryCapsule.update({
            where: { capsule_id: capsuleId },
            data,
          });
        }

        // G3.5 per ADR-0043 + Q-G3.5-γ LOCK: persist embedding via
        // inline raw SQL inside the transaction for the UPDATE
        // branch. MERGE/NOOP do NOT reach this block in
        // embedding-mutating form (MERGE has embeddingResult === null
        // and skips per Q-G3.5-β; NOOP returns before this point).
        // Degrade path (embeddingResult.ok === false) skips the SQL —
        // the row's existing embedding column is preserved per
        // Q-G3.5-α.
        if (
          decision.mutationType === "UPDATE" &&
          embeddingResult !== null &&
          embeddingResult.ok
        ) {
          const vectorLiteral = `[${embeddingResult.vector.join(",")}]`;
          await tx.$executeRawUnsafe(
            `UPDATE memory_capsules SET embedding = $1::vector(1536) WHERE capsule_id = $2::uuid`,
            vectorLiteral,
            capsuleId,
          );
        }

        // SUCCESS audit emission inside transaction. Atomic with the
        // DB mutation above; rollback discards both if any subsequent
        // op throws.
        await writeAuditEvent(
          {
            event_type:
              decision.mutationType === "MERGE"
                ? "CAPSULE_MUTATION_MERGE"
                : "CAPSULE_MUTATION_UPDATE",
            outcome: "SUCCESS",
            actor_entity_id: session.entity_id,
            target_entity_id: existing.entity_id,
            target_capsule_id: capsuleId,
            session_id: session.session_id,
            ip_address: context.ip_address ?? null,
            // CAR Sub-box 2 sub-phase 4 per ADR-0037 Sub-decision 5:
            // capsule jurisdiction immutable; post-update jurisdiction
            // equals existing.jurisdiction.
            jurisdiction: existing.jurisdiction,
            details: {
              // G3.5 per ADR-0043 + Q-G3.5-η LOCK: outcome metadata.
              // MERGE records skip reason; UPDATE records success or
              // degrade-failure metadata. No raw vector or derived
              // per-dimension content in audit details per Q-G3-ζ +
              // RULE 0. Spread is FIRST in details so the Gate 7
              // (V3 STRICT) MERGE-anchor section scoped to the
              // canonical decision.mutationType === "MERGE"
              // expression in the event_type ternary above contains
              // embedding_skip_reason BEFORE the content_hash
              // UPDATE-discriminated field which acts as the next
              // boundary marker.
              ...(decision.mutationType === "MERGE"
                ? {
                    embedding_generated: false,
                    embedding_skip_reason:
                      "merge_metadata_only_content_unchanged",
                  }
                : embeddingResult !== null && embeddingResult.ok
                  ? {
                      embedding_generated: true,
                      embedding_model: embeddingResult.model,
                      embedding_dimensions: embeddingResult.dimensions,
                      embedding_tokens_used: embeddingResult.tokens_used,
                    }
                  : embeddingResult !== null
                    ? {
                        embedding_generated: false,
                        embedding_failure_class: embeddingResult.error_class,
                        embedding_failure_message: embeddingResult.message,
                      }
                    : {}),
              mutation_type: decision.mutationType,
              write_type: writeType,
              previous_version: existing.version,
              new_version: updatedRow.version,
              content_changed: decision.contentChanged,
              content_hash:
                decision.mutationType === "UPDATE" && processed !== null
                  ? processed.content_hash
                  : existing.content_hash,
              write_reason: input.write_reason ?? null,
              ...(decision.noopReason === "existing_content_unreadable"
                ? { reason: "existing_content_unreadable" }
                : {}),
            },
          },
          tx,
        );

        return updatedRow;
      });

      return {
        ok: true,
        capsule_id: updated.capsule_id,
        version: updated.version,
        content_hash: updated.content_hash,
        storage_location: updated.storage_location,
        write_type: writeType,
      };
    } catch (err) {
      if (err instanceof VersionConflictError) {
        // V5 Patch 1 LOCK Option (b) per ADR-0042 G1.3 Correction 10:
        // standalone DENIED audit emission AFTER rollback. The audit
        // row from inside the transaction was discarded with the
        // rollback; this standalone writeAuditEvent (no tx arg) opens
        // its own transaction internally per audit.ts:541-549 and
        // persists the DENIED row independently. Audit-chain
        // integrity per RULE 4 + ADR-0002.
        const conflictEventType:
          | "CAPSULE_MUTATION_MERGE"
          | "CAPSULE_MUTATION_UPDATE" =
          err.mutationType === "MERGE"
            ? "CAPSULE_MUTATION_MERGE"
            : "CAPSULE_MUTATION_UPDATE";
        try {
          await writeAuditEvent({
            event_type: conflictEventType,
            outcome: "DENIED",
            actor_entity_id: session.entity_id,
            target_entity_id: existing.entity_id,
            target_capsule_id: capsuleId,
            session_id: session.session_id,
            ip_address: context.ip_address ?? null,
            jurisdiction: existing.jurisdiction,
            denial_reason: "CAPSULE_VERSION_CONFLICT",
            details: {
              mutation_type: err.mutationType,
              expected_version: err.expected,
              actual_version: err.actual,
            },
          });
        } catch (auditErr) {
          // ABORT trigger 27 per V5 Patch 1: writeAuditEvent failure
          // on the CAS-conflict path means audit infrastructure is
          // unhealthy. Re-throw so the caller receives 5xx rather
          // than silently swallowing an audit-chain gap.
          throw auditErr;
        }
        return {
          ok: false,
          code: "CAPSULE_VERSION_CONFLICT" as const,
          message: `Capsule version conflict — expected v${err.expected}, actual v${err.actual ?? "unknown"}`,
        };
      }
      throw err;
    }
  }

  // WHAT: Verify a declaration JWT and confirm it is for the right
  //        capsule + entity. (The store-presence check is done
  //        separately by the caller because it is async.)
  // INPUT: The declaration token, the capsule_id from the request,
  //        and the entity_id from the validated session.
  // OUTPUT: { ok: true, declaration } on success, WriteFailure otherwise.
  // WHY: Same shape as ReadService's check. Pulling it out keeps
  //      the audit / token / mismatch error codes consistent
  //      between READ and WRITE.
  private checkDeclarationToken(
    declarationToken: string,
    requestedCapsuleId: string,
    sessionEntityId: string,
  ):
    | { ok: true; declaration: AccessDeclarationPayload }
    | (WriteFailure & { ok: false }) {
    let payload: AccessDeclarationPayload;
    try {
      payload = jwt.verify(
        declarationToken,
        this.jwtSecret,
      ) as AccessDeclarationPayload;
    } catch {
      return {
        ok: false,
        code: "ACCESS_DECLARATION_INVALID",
        message: "Access declaration invalid",
      };
    }
    if (Date.now() >= payload.valid_until) {
      return {
        ok: false,
        code: "ACCESS_DECLARATION_EXPIRED",
        message: "Access declaration expired",
      };
    }
    if (payload.capsule_id !== requestedCapsuleId) {
      return {
        ok: false,
        code: "ACCESS_DECLARATION_MISMATCH",
        message: "Access declaration is for a different capsule",
      };
    }
    if (payload.requesting_entity_id !== sessionEntityId) {
      return {
        ok: false,
        code: "ACCESS_DECLARATION_MISMATCH",
        message: "Access declaration is for a different entity",
      };
    }
    return { ok: true, declaration: payload };
  }

  // WHAT: Write a denial audit row for either create or update.
  // INPUT: The event_type, capsule_id, actor_entity_id (when known),
  //        denial_reason, IP, and optional extra detail JSON.
  // OUTPUT: A promise that resolves once the audit row is written.
  // WHY: One helper means create / update produce comparable rows
  //      regardless of which validation step rejected them.
  // G1.3 per ADR-0042 G1.3 RULE 13 Substrate-State Correction §1 +
  // §Sub-decision Q-γ Disposition Q-γ.1 + Q-G1.3-α + Q-G1.3-ι LOCKs:
  // widened to the 4 discriminated CAPSULE_MUTATION_* literals.
  // createCapsule denials emit "CAPSULE_MUTATION_ADD"; updateCapsule
  // denials emit "CAPSULE_MUTATION_UPDATE" by default (discrimination
  // cannot safely run for many denial cases; the literal that WOULD
  // have been emitted on success per Q-G1.3-ι). The CAPSULE_VERSION_
  // CONFLICT denial path emits "CAPSULE_MUTATION_UPDATE" or
  // "CAPSULE_MUTATION_MERGE" per the throwing branch's mutationType.
  private async auditDenial(
    eventType:
      | "CAPSULE_MUTATION_ADD"
      | "CAPSULE_MUTATION_UPDATE"
      | "CAPSULE_MUTATION_MERGE"
      | "CAPSULE_MUTATION_NOOP",
    capsuleId: string | null,
    actorEntityId: string | null,
    denialReason: string,
    ipAddress: string | null,
    extraDetails: Record<string, unknown> = {},
  ): Promise<void> {
    // CAR Sub-box 2 sub-phase 4 per ADR-0037 Sub-decision 5: when the
    // caller surfaces a jurisdiction key inside extraDetails, hoist it
    // to the row-metadata column so jurisdiction-denied rows are
    // queryable via the @@index([jurisdiction]) anchor. Non-jurisdiction
    // denials omit the key; the row column stays null
    // (backward-compat preserved).
    const jurisdictionFromExtras =
      typeof extraDetails.jurisdiction === "string" ||
      extraDetails.jurisdiction === null
        ? (extraDetails.jurisdiction as string | null)
        : null;
    await writeAuditEvent({
      event_type: eventType,
      outcome: "DENIED",
      actor_entity_id: actorEntityId,
      target_capsule_id: capsuleId,
      ip_address: ipAddress,
      denial_reason: denialReason,
      jurisdiction: jurisdictionFromExtras,
      details: extraDetails,
    });
  }
}

// Re-exported so route handlers can import the type without a
// deeper path.
export type { MemoryCapsule };
