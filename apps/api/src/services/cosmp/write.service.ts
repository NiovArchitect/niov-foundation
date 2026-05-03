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
  prisma,
  writeAuditEvent,
  type CapsuleType,
  type DecayType,
  type MemoryCapsule,
  type Prisma,
  type StorageTier,
} from "@niov/database";
import type { ContentStore } from "../../content-store.js";
import type { NonceStore } from "../../redis.js";
import type { AuthService } from "../auth.service.js";
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

  write_reason?: string;
}

// WHAT: Fields a caller can change on an existing capsule.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: Every field is optional; we apply only what is supplied.
//      Identity / wallet / created_by are intentionally absent
//      because they can never be modified by an update.
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

  write_reason?: string;
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
    | "WRITE_NOT_PERMITTED";
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
        "CAPSULE_CREATED",
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
        "CAPSULE_CREATED",
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
        "CAPSULE_CREATED",
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

    const capsuleId = randomUUID();
    const storageLocation = `niov://capsule/${capsuleId}`;
    const processed = processContentForStorage(input.content, this.encryption);

    // Storage upload BEFORE the database row so a failed upload
    // does not leave a dangling row pointing to nothing.
    await this.contentStore.write(storageLocation, processed.ciphertext);

    const decayType: DecayType = input.decay_type ?? "TIME_BASED";
    const storageTier: StorageTier =
      decayType === "FOUNDATIONAL" ? "HOT" : input.storage_tier ?? "WARM";

    const created = await prisma.memoryCapsule.create({
      data: {
        capsule_id: capsuleId,
        wallet_id: wallet.wallet_id,
        entity_id: session.entity_id,
        version: 1,
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

        // Attribution (set once, never overwritten on update).
        created_by: session.entity_id,
        created_session_id: session.session_id,
        write_reason: input.write_reason ?? null,
      },
    });

    await writeAuditEvent({
      event_type: "CAPSULE_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: session.entity_id,
      target_capsule_id: capsuleId,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        write_type: "OWNER",
        capsule_type: input.capsule_type,
        content_hash: processed.content_hash,
        payload_size_tokens: processed.payload_size_tokens,
        write_reason: input.write_reason ?? null,
      },
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

  // WHAT: Update an existing MemoryCapsule. Owner-write when the
  //        session entity owns the capsule; otherwise attributed and
  //        a write-permitting access declaration is required.
  // INPUT: Session token, the capsule_id to update, the update
  //        input, and (for attributed writes) the declaration token.
  // OUTPUT: WriteSuccess on success, WriteFailure otherwise.
  // WHY: Spec says version increments, content_hash updates,
  //      last_updated_at updates (Prisma's @updatedAt handles this),
  //      and attribution adds updated_by + previous_version while
  //      created_by stays untouched.
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
        "CAPSULE_UPDATED",
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
        "CAPSULE_UPDATED",
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

    const writeType: "OWNER" | "ATTRIBUTED" =
      existing.entity_id === session.entity_id ? "OWNER" : "ATTRIBUTED";

    if (writeType === "ATTRIBUTED") {
      if (declarationToken === null) {
        await this.auditDenial(
          "CAPSULE_UPDATED",
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
          "CAPSULE_UPDATED",
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
          "CAPSULE_UPDATED",
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
          "CAPSULE_UPDATED",
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

    // Build the update data. content / content_hash / payload_size
    // get re-derived together when content changes.
    const data: Prisma.MemoryCapsuleUpdateInput = {
      version: { increment: 1 },
      previous_version: existing.version,
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
      if (input.topic_tags.length === 0) {
        await this.auditDenial(
          "CAPSULE_UPDATED",
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

    let newContentHash = existing.content_hash;
    if (input.content !== undefined) {
      if (input.content.length === 0) {
        await this.auditDenial(
          "CAPSULE_UPDATED",
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
      const processed = processContentForStorage(input.content, this.encryption);
      await this.contentStore.write(existing.storage_location, processed.ciphertext);
      data.content_hash = processed.content_hash;
      data.payload_size_tokens = processed.payload_size_tokens;
      data.tokens = processed.tokens;
      data.tokens_tokenizer = processed.tokens_tokenizer;
      newContentHash = processed.content_hash;
    }

    const updated = await prisma.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data,
    });

    await writeAuditEvent({
      event_type: "CAPSULE_UPDATED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: existing.entity_id,
      target_capsule_id: capsuleId,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        write_type: writeType,
        previous_version: existing.version,
        new_version: updated.version,
        content_changed: input.content !== undefined,
        content_hash: newContentHash,
        write_reason: input.write_reason ?? null,
      },
    });

    return {
      ok: true,
      capsule_id: updated.capsule_id,
      version: updated.version,
      content_hash: updated.content_hash,
      storage_location: updated.storage_location,
      write_type: writeType,
    };
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
  private async auditDenial(
    eventType: "CAPSULE_CREATED" | "CAPSULE_UPDATED",
    capsuleId: string | null,
    actorEntityId: string | null,
    denialReason: string,
    ipAddress: string | null,
    extraDetails: Record<string, unknown> = {},
  ): Promise<void> {
    await writeAuditEvent({
      event_type: eventType,
      outcome: "DENIED",
      actor_entity_id: actorEntityId,
      target_capsule_id: capsuleId,
      ip_address: ipAddress,
      denial_reason: denialReason,
      details: extraDetails,
    });
  }
}

// Re-exported so route handlers can import the type without a
// deeper path.
export type { MemoryCapsule };
