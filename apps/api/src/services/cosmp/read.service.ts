// FILE: read.service.ts
// PURPOSE: Implement the COSMP READ operation as the spec describes
//          it -- two steps, each with their own validation, audit,
//          and side effects. Step 1 returns metadata + a fingerprint;
//          Step 2 takes the fingerprint, the declaration, and the
//          session token, re-validates everything, and returns
//          scope-filtered content.
// CONNECTS TO: AuthService, the access-declaration NonceStore (set
//              by 3A NEGOTIATE), the ContentStore (in-memory for
//              now), getCapsuleMetadata, getCapsuleWithContent,
//              incrementAccessCount, the audit-of-record table.

import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { CRYPTO_CONFIG } from "@niov/auth";
import {
  getCapsuleMetadata,
  getCapsuleWithContent,
  incrementAccessCount,
  prisma,
  writeAuditEvent,
  type AccessScope,
  type CapsuleMetadata,
} from "@niov/database";
import { logger } from "../../logger.js";
import type { ContentStore } from "../../content-store.js";
import type { NonceStore } from "../../redis.js";
import type { AuthService } from "../auth.service.js";
import type { AccessDeclarationPayload } from "./negotiate.service.js";

// WHAT: Maximum approximate token count returned to a SUMMARY
//        scope.
// INPUT: None.
// OUTPUT: A number.
// WHY: Spec says "max 500 tokens". One constant keeps the rule in
//      one place if we change it later.
export const SUMMARY_TOKEN_BUDGET = 500;

// WHAT: The success return shape of readMetadata.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Step 2 needs the metadata_fingerprint Step 1 emits. Returning
//      it alongside the safe metadata keeps the contract tight.
export interface ReadMetadataSuccess {
  ok: true;
  metadata: SafeCapsuleMetadata;
  metadata_fingerprint: string;
}

// WHAT: The success return shape of readContent.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Carries the scope-filtered content plus the granted_scope so
//      the caller knows which mode they got. accessor_entity_id is
//      surfaced so the route can hand it to the monetization
//      service without re-validating the session.
export interface ReadContentSuccess {
  ok: true;
  capsule_id: string;
  granted_scope: AccessScope;
  content: string;
  truncated: boolean;
  accessor_entity_id: string;
}

// WHAT: The discriminated failure shape both reads share.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: A discriminated union (ok: false) lets routes map specific
//      codes to HTTP status without throwing.
export interface ReadFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "ACCESS_DECLARATION_INVALID"
    | "ACCESS_DECLARATION_EXPIRED"
    | "ACCESS_DECLARATION_MISMATCH"
    | "CAPSULE_NOT_FOUND"
    | "CLEARANCE_INSUFFICIENT"
    | "METADATA_FINGERPRINT_MISMATCH"
    | "SCOPE_INSUFFICIENT_FOR_CONTENT"
    | "CONTENT_NOT_FOUND";
  message: string;
}

// WHAT: The subset of capsule fields readMetadata exposes -- never
//        storage_location, never the actual content.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Spec calls out exactly these fields. Naming the type means
//      we cannot drift between the type and the SQL select shape.
export interface SafeCapsuleMetadata {
  capsule_id: string;
  capsule_type: CapsuleMetadata["capsule_type"];
  topic_tags: string[];
  relevance_score: number;
  payload_summary: string;
  payload_size_tokens: number;
  last_updated_at: string;
  clearance_required: number;
}

// WHAT: Convert any JS value into a deterministic JSON string with
//        sorted object keys.
// INPUT: Any JS value.
// OUTPUT: A canonical JSON string.
// WHY: Same trick as audit_events / TAR -- gives us a stable hash
//      input regardless of property insertion order. Used to
//      compute the metadata_fingerprint.
function canonicalJson(value: unknown): string {
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

// WHAT: Compute the metadata_fingerprint over the safe metadata fields.
// INPUT: A SafeCapsuleMetadata.
// OUTPUT: A 64-character hex SHA-256 string.
// WHY: Step 2 verifies the fingerprint against a freshly computed
//      one to catch any field that changed between calls (e.g.,
//      the capsule was swapped or relevance_score was updated).
//      topic_tags is sorted before hashing so order does not cause
//      false mismatches.
export function computeMetadataFingerprint(
  metadata: SafeCapsuleMetadata,
): string {
  const canonical = canonicalJson({
    capsule_id: metadata.capsule_id,
    capsule_type: metadata.capsule_type,
    topic_tags: [...metadata.topic_tags].sort(),
    relevance_score: metadata.relevance_score,
    payload_summary: metadata.payload_summary,
    payload_size_tokens: metadata.payload_size_tokens,
    last_updated_at: metadata.last_updated_at,
    clearance_required: metadata.clearance_required,
  });
  return createHash(CRYPTO_CONFIG.HASH_ALGORITHM).update(canonical).digest("hex");
}

// WHAT: Truncate a string to at most maxTokens whitespace-separated
//        tokens.
// INPUT: The text and the token budget.
// OUTPUT: { text, truncated } where truncated is true when content
//         was actually shortened.
// WHY: SUMMARY scope returns the first 500 tokens of the content.
//      tiktoken-grade accuracy is overkill for the MVP; whitespace
//      tokens are a reasonable approximation.
export function truncateToTokens(
  text: string,
  maxTokens: number,
): { text: string; truncated: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxTokens) return { text, truncated: false };
  return { text: words.slice(0, maxTokens).join(" "), truncated: true };
}

// WHAT: Convert a CapsuleMetadata into the SafeCapsuleMetadata shape
//        Step 1 returns.
// INPUT: A CapsuleMetadata row.
// OUTPUT: SafeCapsuleMetadata with last_updated_at as an ISO string.
// WHY: Centralizing the conversion means readMetadata and the
//      Step-2 fingerprint check produce identical shapes, so their
//      hashes compare correctly.
function toSafeMetadata(meta: CapsuleMetadata): SafeCapsuleMetadata {
  return {
    capsule_id: meta.capsule_id,
    capsule_type: meta.capsule_type,
    topic_tags: meta.topic_tags,
    relevance_score: meta.relevance_score,
    payload_summary: meta.payload_summary,
    payload_size_tokens: meta.payload_size_tokens,
    last_updated_at: meta.last_updated_at.toISOString(),
    clearance_required: meta.clearance_required,
  };
}

// WHAT: The class that orchestrates the two-step READ flow.
// INPUT: AuthService, the declaration NonceStore, the ContentStore,
//        and the JWT secret.
// OUTPUT: A class with readMetadata and readContent methods.
// WHY: Constructor injection keeps tests cleanly composable -- they
//      can swap in a MemoryContentStore preloaded with synthetic
//      content and a MemoryNonceStore for declarations.
//
// SECTION 10 HOOK: An optional ReadFeedbackHook is fired after a
// successful readContent. Section 10 wires Loop 5 (anomaly detection)
// here. Default = undefined → no-op for tests + offline use.
export interface ReadFeedbackHook {
  onContentRead(input: {
    actor_entity_id: string;
    capsule_id: string;
  }): Promise<void>;
}

export class ReadService {
  constructor(
    private readonly authService: AuthService,
    private readonly declarationStore: NonceStore,
    private readonly contentStore: ContentStore,
    private readonly jwtSecret: string,
    private readonly feedbackHook?: ReadFeedbackHook,
  ) {}

  // WHAT: Step 1 of READ -- return safe capsule metadata + a
  //        fingerprint. No content, no storage_location.
  // INPUT: Session token, capsule_id, the declaration token from
  //        NEGOTIATE, plus optional context for the audit row.
  // OUTPUT: ReadMetadataSuccess on success, ReadFailure otherwise.
  // WHY: Step 1 is cheap and fast -- callers can decide based on
  //      metadata whether to proceed to Step 2's expensive content
  //      fetch.
  async readMetadata(
    sessionToken: string,
    capsuleId: string,
    declarationToken: string,
    context: { ip_address?: string | null } = {},
  ): Promise<ReadMetadataSuccess | ReadFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      await this.auditDenial(
        "CAPSULE_METADATA_READ",
        capsuleId,
        null,
        session.code,
        context.ip_address ?? null,
      );
      return { ok: false, code: session.code, message: "Read denied" };
    }

    const declarationCheck = await this.validateDeclaration(
      declarationToken,
      capsuleId,
      session.entity_id,
    );
    if (!declarationCheck.ok) {
      await this.auditDenial(
        "CAPSULE_METADATA_READ",
        capsuleId,
        session.entity_id,
        declarationCheck.code,
        context.ip_address ?? null,
      );
      return declarationCheck;
    }

    const metadata = await getCapsuleMetadata(capsuleId);
    if (metadata === null) {
      await this.auditDenial(
        "CAPSULE_METADATA_READ",
        capsuleId,
        session.entity_id,
        "CAPSULE_NOT_FOUND",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CAPSULE_NOT_FOUND",
        message: "Read denied",
      };
    }

    const safe = toSafeMetadata(metadata);
    const fingerprint = computeMetadataFingerprint(safe);

    // STEP 1 audit -- BEFORE we return the metadata to the caller.
    await writeAuditEvent({
      event_type: "CAPSULE_METADATA_READ",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_capsule_id: capsuleId,
      target_entity_id: metadata.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        declaration_id: declarationCheck.declaration.declaration_id,
        granted_scope: declarationCheck.declaration.granted_scope,
        metadata_fingerprint: fingerprint,
      },
    });

    // Touch last_accessed_at via raw SQL. We deliberately bypass
    // Prisma's update() because @updatedAt would also bump
    // last_updated_at, which is part of the metadata fingerprint --
    // bumping it here would make Step 2 see a different fingerprint
    // even though the *real* metadata has not changed.
    await prisma.$executeRaw`
      UPDATE memory_capsules
      SET last_accessed_at = NOW()
      WHERE capsule_id = ${capsuleId}::uuid
    `;

    return {
      ok: true,
      metadata: safe,
      metadata_fingerprint: fingerprint,
    };
  }

  // WHAT: Step 2 of READ -- return scope-filtered content.
  // INPUT: Session token, capsule_id, the declaration token, the
  //        fingerprint Step 1 returned, plus optional context.
  // OUTPUT: ReadContentSuccess on success, ReadFailure otherwise.
  // WHY: Spec mandates re-validation of session + declaration +
  //      fingerprint and a fresh clearance check, so Step 2 cannot
  //      assume any property held in Step 1 still holds.
  async readContent(
    sessionToken: string,
    capsuleId: string,
    declarationToken: string,
    metadataFingerprint: string,
    context: { ip_address?: string | null } = {},
  ): Promise<ReadContentSuccess | ReadFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        null,
        session.code,
        context.ip_address ?? null,
      );
      return { ok: false, code: session.code, message: "Read denied" };
    }

    const declarationCheck = await this.validateDeclaration(
      declarationToken,
      capsuleId,
      session.entity_id,
    );
    if (!declarationCheck.ok) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        declarationCheck.code,
        context.ip_address ?? null,
      );
      return declarationCheck;
    }

    // Step 2 spec: declaration that only granted METADATA_ONLY must
    // not satisfy a content read.
    if (declarationCheck.declaration.granted_scope === "METADATA_ONLY") {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        "SCOPE_INSUFFICIENT_FOR_CONTENT",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "SCOPE_INSUFFICIENT_FOR_CONTENT",
        message:
          "This access declaration only grants metadata access; a new NEGOTIATE is required for content",
      };
    }

    const fullCapsule = await getCapsuleWithContent(capsuleId);
    if (fullCapsule === null) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        "CAPSULE_NOT_FOUND",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CAPSULE_NOT_FOUND",
        message: "Read denied",
      };
    }

    // Re-compute the fingerprint from the CURRENT capsule metadata.
    // If anything changed since Step 1 -- different capsule swapped
    // in, or relevance_score / payload_summary updated -- the
    // fingerprints will not match.
    const currentSafe = toSafeMetadata(fullCapsule);
    const currentFingerprint = computeMetadataFingerprint(currentSafe);
    if (currentFingerprint !== metadataFingerprint) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        "METADATA_FINGERPRINT_MISMATCH",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "METADATA_FINGERPRINT_MISMATCH",
        message: "Capsule metadata changed between steps; restart the read",
      };
    }

    // RE-CHECK clearance with the live session + live capsule.
    if (session.clearance_ceiling < fullCapsule.clearance_required) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        "CLEARANCE_INSUFFICIENT",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CLEARANCE_INSUFFICIENT",
        message: "Read denied",
      };
    }

    // Fetch the (mock for now) decrypted payload from storage.
    const rawContent = await this.contentStore.read(fullCapsule.storage_location);
    if (rawContent === null) {
      await this.auditDenial(
        "CAPSULE_CONTENT_READ",
        capsuleId,
        session.entity_id,
        "CONTENT_NOT_FOUND",
        context.ip_address ?? null,
      );
      return {
        ok: false,
        code: "CONTENT_NOT_FOUND",
        message: "Read denied",
      };
    }

    // Apply the granted_scope filter.
    const granted = declarationCheck.declaration.granted_scope;
    let body = rawContent;
    let truncated = false;
    if (granted === "SUMMARY") {
      const t = truncateToTokens(rawContent, SUMMARY_TOKEN_BUDGET);
      body = t.text;
      truncated = t.truncated;
    }

    // Audit BEFORE the response leaves the function.
    await writeAuditEvent({
      event_type: "CAPSULE_CONTENT_READ",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_capsule_id: capsuleId,
      target_entity_id: fullCapsule.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        declaration_id: declarationCheck.declaration.declaration_id,
        granted_scope: granted,
        truncated,
        content_length_chars: body.length,
      },
    });

    // Single-use: consume the declaration so a second readContent
    // for the same NEGOTIATE will fail.
    await this.declarationStore.delete(
      declarationCheck.declaration.declaration_id,
    );

    // Section 10 Loop 5 hook: anomaly detection on the
    // (actor, capsule) pair. Fire-and-await; on hook failure log
    // but do NOT fail the read (security telemetry is advisory).
    if (this.feedbackHook !== undefined) {
      try {
        await this.feedbackHook.onContentRead({
          actor_entity_id: session.entity_id,
          capsule_id: capsuleId,
        });
      } catch (err) {
        logger.error({ err }, "[read] Loop 5 hook failed");
      }
    }

    return {
      ok: true,
      capsule_id: capsuleId,
      granted_scope: granted,
      content: body,
      truncated,
      accessor_entity_id: session.entity_id,
    };
  }

  // WHAT: Verify a declaration JWT and confirm it is still in the
  //        declaration store, that it is for the right capsule, and
  //        that it was issued for the right session entity.
  // INPUT: The declaration token, the capsule_id from the request,
  //        and the entity_id from the validated session.
  // OUTPUT: { ok: true, declaration } on success, ReadFailure
  //         otherwise.
  // WHY: Used by both Step 1 and Step 2 to keep the validation
  //      semantics identical between calls.
  private async validateDeclaration(
    declarationToken: string,
    requestedCapsuleId: string,
    sessionEntityId: string,
  ): Promise<
    | { ok: true; declaration: AccessDeclarationPayload }
    | (ReadFailure & { ok: false })
  > {
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

    const stillLive = await this.declarationStore.has(payload.declaration_id);
    if (!stillLive) {
      return {
        ok: false,
        code: "ACCESS_DECLARATION_EXPIRED",
        message: "Access declaration no longer valid",
      };
    }

    return { ok: true, declaration: payload };
  }

  // WHAT: Write a denial audit row for either Step 1 or Step 2.
  // INPUT: The event_type ("CAPSULE_METADATA_READ" or
  //        "CAPSULE_CONTENT_READ"), capsule_id, the actor entity_id
  //        if known, the denial reason, and the client IP.
  // OUTPUT: A promise that resolves once the audit row is written.
  // WHY: Centralizing the denial-audit shape keeps Step 1 and Step
  //      2 producing comparable rows for compliance review.
  private async auditDenial(
    eventType: "CAPSULE_METADATA_READ" | "CAPSULE_CONTENT_READ",
    capsuleId: string,
    actorEntityId: string | null,
    denialReason: string,
    ipAddress: string | null,
  ): Promise<void> {
    await writeAuditEvent({
      event_type: eventType,
      outcome: "DENIED",
      actor_entity_id: actorEntityId,
      target_capsule_id: capsuleId,
      ip_address: ipAddress,
      denial_reason: denialReason,
    });
  }

  // WHAT: Asynchronously bump the capsule's access_count after the
  //        response has been sent.
  // INPUT: The capsule_id and an optional actor_id.
  // OUTPUT: A promise; callers usually do not await it.
  // WHY: Spec says "AFTER response (async): increment access_count".
  //      Exposed as a method so the route can call it via
  //      setImmediate after returning the response body.
  async postResponseIncrement(
    capsuleId: string,
    actorId: string | null,
  ): Promise<void> {
    try {
      await incrementAccessCount(capsuleId, actorId);
    } catch {
      // Swallow -- a failure to increment must not surface to the
      // caller. The audit-of-record row already proves the read
      // happened; access_count is an optimization for downstream
      // ranking.
    }
  }
}
