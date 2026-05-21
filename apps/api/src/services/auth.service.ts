// FILE: auth.service.ts
// PURPOSE: The login / logout / validateSession flow. This service is
//          the door every authenticated request walks through. It
//          orchestrates entity lookup, password verification, lockout
//          on repeated failures, TAR loading, JWT signing, session
//          row creation, Redis nonce storage, and audit-of-record
//          writes -- in the strict order the spec demands.
// CONNECTS TO: @niov/auth (password hashing), @niov/database (entity,
//              tar, session queries plus audit_events), and the
//              NonceStore interface in /redis.ts.

import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { CRYPTO_CONFIG, verifyPassword } from "@niov/auth";
import {
  createSession,
  getEntityByEmail,
  getSessionById,
  getTARByEntityId,
  incrementFailedAuth,
  markSessionIdleExpired,
  resetFailedAuth,
  terminateSession,
  touchSessionActivity,
  updateEntityStatus,
  writeAuditEvent,
  type Entity,
  type TARCapability,
  type TokenAttributeRepository,
} from "@niov/database";
import type { NonceStore } from "../redis.js";
import { getOrgSettingsOrDefaults } from "./governance/org.js";

// WHAT: The per-account lockout threshold.
// INPUT: None.
// OUTPUT: A count.
// WHY: The 5th failed login flips the entity to SUSPENDED per spec.
export const FAILED_AUTH_LOCKOUT = 5;

// WHAT: The map from caller-facing operation strings to TAR capability
//        boolean fields.
// INPUT: Used as a lookup table.
// OUTPUT: Maps operation -> capability flag.
// WHY: Sessions take operation names (read, write, share...). The
//      TAR carries booleans. One lookup table connects them so
//      operation narrowing has a single source of truth.
const OPERATION_TO_CAPABILITY: Record<string, TARCapability> = {
  read: "can_read_capsules",
  write: "can_write_capsules",
  share: "can_share_capsules",
  create_hives: "can_create_hives",
  external_api: "can_access_external_api",
  admin_niov: "can_admin_niov",
  admin_org: "can_admin_org",
};

// WHAT: The contract a configured AuthService is built against.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: Lets tests inject a MemoryNonceStore + a known JWT secret
//      without reaching into module-level state.
export interface AuthServiceConfig {
  jwtSecret: string;
  nonceStore: NonceStore;
}

// WHAT: The successful return shape of login().
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Callers (routes, tests) want both the raw token to send back
//      to the client AND the structured fields they may want to log.
export interface LoginResult {
  ok: true;
  token: string;
  session_id: string;
  entity_id: string;
  expires_at: Date;
  allowed_operations: string[];
  clearance_ceiling: number;
}

// WHAT: The failure return shape of login().
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: A discriminated union (ok: false) makes it easy for the route
//      to map specific failure codes to HTTP status without throwing.
export interface LoginFailure {
  ok: false;
  code: "INVALID_CREDENTIALS" | "SUSPENDED";
  message: string;
}

// WHAT: The successful return shape of validateSession().
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Middleware needs entity_id + clearance + ops to decide what
//      the caller can do downstream.
export interface ValidateSuccess {
  valid: true;
  entity_id: string;
  session_id: string;
  clearance_ceiling: number;
  allowed_operations: string[];
}

// WHAT: The failure return shape of validateSession().
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Codes match the seven failure points in the spec, so middleware
//      can return precise error responses.
export interface ValidateFailure {
  valid: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED";
}

// WHAT: Optional request context for validateSession (GAP-G1 / GOVSEC.2A).
// INPUT: Used as an optional parameter only.
// OUTPUT: None -- this is a type.
// WHY: Lets a caller supply the request IP for the session-lifecycle denial
//      audit without breaking existing callers (the parameter is optional and
//      ip_address defaults to null when absent).
export interface ValidateSessionContext {
  ip_address?: string | null;
}

// WHAT: The shape of the JWT payload we sign.
// INPUT: Used as a parameter / return type for jwt.sign / jwt.verify.
// OUTPUT: None -- this is a type.
// WHY: Centralizing the payload shape means we cannot accidentally
//      put different fields in than we expect to read out.
export interface SessionTokenPayload {
  session_id: string;
  entity_id: string;
  allowed_operations: string[];
  clearance_ceiling: number;
  tar_hash: string;
  expires_at: number; // ms epoch
  issued_at: number; // ms epoch
}

// WHAT: Take the operations the caller asked for, drop any that the
//        TAR does not allow, and ensure can_login is true.
// INPUT: The TAR, the caller-requested operations, and a flag for
//        whether to enforce can_login.
// OUTPUT: An object with the narrowed operation list and whether
//         login itself is permitted.
// WHY: Per spec, "Session permissions are NEVER broader than what
//      TAR allows". One pure helper makes that property easy to test.
export function narrowOperations(
  tar: TokenAttributeRepository,
  requested: string[],
): { allowed: string[]; canLogin: boolean } {
  const allowed: string[] = [];
  for (const op of requested) {
    const capability = OPERATION_TO_CAPABILITY[op];
    if (capability === undefined) continue;
    if (tar[capability] === true) allowed.push(op);
  }
  return { allowed, canLogin: tar.can_login === true };
}

// WHAT: The pieces a route or test needs to drive auth flows.
// INPUT: Used as a class type.
// OUTPUT: An object with login, logout, validateSession methods.
// WHY: A class lets us inject the JWT secret and the NonceStore at
//      construction time so tests can swap implementations cleanly.
export class AuthService {
  constructor(private readonly config: AuthServiceConfig) {}

  // WHAT: Run the seven-step login flow defined in Section 2A.
  // INPUT: The user's email, plaintext password, and the operations
  //        they want this session to authorize.
  // OUTPUT: A LoginResult on success, LoginFailure on any rejection.
  // WHY: Implements the spec verbatim, including identical-looking
  //      "Invalid credentials" responses for "no such user" and
  //      "wrong password" -- no information leak.
  async login(
    email: string,
    password: string,
    requestedOperations: string[],
    context: { ip_address?: string | null } = {},
  ): Promise<LoginResult | LoginFailure> {
    // STEP 1 -- find entity by email
    const entity = await getEntityByEmail(email);
    if (entity === null) {
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        denial_reason: "ENTITY_NOT_FOUND",
        ip_address: context.ip_address ?? null,
        details: { email_attempted: email },
      });
      return invalidCredentials();
    }

    // STEP 2 -- check entity status
    if (entity.status === "DELETED") {
      // Treat the same as not found per spec -- generic error.
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        actor_entity_id: entity.entity_id,
        denial_reason: "DELETED",
        ip_address: context.ip_address ?? null,
      });
      return invalidCredentials();
    }
    if (entity.status === "SUSPENDED") {
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        actor_entity_id: entity.entity_id,
        denial_reason: "SUSPENDED",
        ip_address: context.ip_address ?? null,
      });
      return suspendedFailure();
    }

    // STEP 3 -- verify password
    const storedHash = entity.password_hash;
    const passwordOk =
      typeof storedHash === "string" && storedHash.length > 0
        ? await verifyPassword(password, storedHash)
        : false;
    if (!passwordOk) {
      const incremented = await incrementFailedAuth(entity.entity_id);
      if (incremented.failed_auth_attempts >= FAILED_AUTH_LOCKOUT) {
        await updateEntityStatus(entity.entity_id, "SUSPENDED");
        await writeAuditEvent({
          event_type: "ENTITY_SUSPENDED",
          outcome: "SUCCESS",
          actor_entity_id: null,
          target_entity_id: entity.entity_id,
          details: {
            reason: "5 failed attempts",
            failed_auth_attempts: incremented.failed_auth_attempts,
          },
        });
      }
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        actor_entity_id: entity.entity_id,
        denial_reason: "WRONG_CREDENTIALS",
        ip_address: context.ip_address ?? null,
      });
      return invalidCredentials();
    }

    // Password accepted -- reset the failed-auth counter.
    await resetFailedAuth(entity.entity_id);

    // STEP 4 -- load TAR, narrow operations
    const tar = await getTARByEntityId(entity.entity_id);
    if (tar === null || tar.status !== "ACTIVE") {
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        actor_entity_id: entity.entity_id,
        denial_reason: tar === null ? "NO_TAR" : `TAR_${tar.status}`,
        ip_address: context.ip_address ?? null,
      });
      return invalidCredentials();
    }
    const { allowed, canLogin } = narrowOperations(tar, requestedOperations);
    if (!canLogin) {
      await writeAuditEvent({
        event_type: "LOGIN_FAILED",
        outcome: "DENIED",
        actor_entity_id: entity.entity_id,
        denial_reason: "CAN_LOGIN_DISABLED",
        ip_address: context.ip_address ?? null,
      });
      return invalidCredentials();
    }

    // STEP 5 -- create session, sign JWT, store nonce.
    // Session TTL is read from OrgSettings.session_timeout_minutes
    // via the tolerant helper -- orgless or pre-Dandelion entities
    // get the spec default (480 minutes) automatically.
    const orgSettings = await getOrgSettingsOrDefaults(entity.entity_id);
    const sessionTtlMs = orgSettings.session_timeout_minutes * 60 * 1000;
    const sessionTtlSeconds = Math.floor(sessionTtlMs / 1000);

    const session_id = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

    await createSession({
      session_id,
      entity_id: entity.entity_id,
      tar_hash_at_creation: tar.tar_hash,
      allowed_operations: allowed,
      clearance_ceiling: tar.clearance_ceiling,
      issued_at: issuedAt,
      expires_at: expiresAt,
      // GOVSEC.3C-B1 / GAP-A1: snapshot the org idle-timeout window onto the
      // session at login (null = idle disabled). Enforcement (3C-B2) reads it
      // from the session row -- no per-request org-settings lookup.
      idle_timeout_minutes: orgSettings.idle_timeout_minutes,
    });

    const payload: SessionTokenPayload = {
      session_id,
      entity_id: entity.entity_id,
      allowed_operations: allowed,
      clearance_ceiling: tar.clearance_ceiling,
      tar_hash: tar.tar_hash,
      expires_at: expiresAt.getTime(),
      issued_at: issuedAt.getTime(),
    };
    // 12C.0 Item 5: pin algorithm explicitly to CRYPTO_CONFIG.JWT_ALGORITHM
    // (HS256). Matches the prior implicit jsonwebtoken default; pinning
    // prevents silent drift if the library ever changes its default.
    // Existing JWTs remain verifiable. See packages/auth/src/crypto-config.ts
    // for the FIPS posture rationale.
    const signOptions: SignOptions = {
      expiresIn: sessionTtlSeconds,
      algorithm: CRYPTO_CONFIG.JWT_ALGORITHM,
    };
    const token = jwt.sign(payload, this.config.jwtSecret, signOptions);

    await this.config.nonceStore.set(session_id, sessionTtlSeconds);

    // STEP 6 -- audit the success BEFORE the token leaves the function
    await writeAuditEvent({
      event_type: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      actor_entity_id: entity.entity_id,
      session_id,
      ip_address: context.ip_address ?? null,
      details: {
        allowed_operations: allowed,
        clearance_ceiling: tar.clearance_ceiling,
      },
    });

    // STEP 7 -- return the token
    return {
      ok: true,
      token,
      session_id,
      entity_id: entity.entity_id,
      expires_at: expiresAt,
      allowed_operations: allowed,
      clearance_ceiling: tar.clearance_ceiling,
    };
  }

  // WHAT: Mark a session ended and clear its Redis nonce.
  // INPUT: The session_id and the entity_id of the actor.
  // OUTPUT: { ok: true } on success.
  // WHY: Logout flips the DB row to TERMINATED so future
  //      validateSession calls reject, AND removes the Redis nonce
  //      so even an unexpired JWT cannot reach a downstream service.
  async logout(
    sessionId: string,
    entityId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<{ ok: true }> {
    await terminateSession(sessionId, entityId);
    await this.config.nonceStore.delete(sessionId);

    await writeAuditEvent({
      event_type: "LOGOUT",
      outcome: "SUCCESS",
      actor_entity_id: entityId,
      session_id: sessionId,
      ip_address: context.ip_address ?? null,
    });

    return { ok: true };
  }

  // WHAT: Verify a JWT and confirm its session is still good for the
  //        operation the caller wants to perform.
  // INPUT: The signed JWT and the operation the request requires.
  // OUTPUT: ValidateSuccess if every check passes, ValidateFailure
  //         with a precise code if any check fails.
  // WHY: The seven-step order matches the spec exactly. Cheap checks
  //      go first (signature, expiry) so we do not pay for DB or
  //      Redis lookups on obviously-bad tokens.
  async validateSession(
    token: string,
    requiredOp: string,
    context?: ValidateSessionContext,
  ): Promise<ValidateSuccess | ValidateFailure> {
    // 1. Verify JWT signature
    let payload: SessionTokenPayload;
    try {
      payload = jwt.verify(
        token,
        this.config.jwtSecret,
      ) as SessionTokenPayload;
    } catch {
      // Malformed / bad-signature token: not a session-lifecycle transition
      // and no decoded payload to attribute -- emit no lifecycle audit event.
      return { valid: false, code: "SESSION_INVALID" };
    }

    // 2. Check expires_at
    if (Date.now() >= payload.expires_at) {
      await this.emitSessionDenial(payload, "SESSION_EXPIRED", "jwt_expired", null, context);
      return { valid: false, code: "SESSION_EXPIRED" };
    }

    // 3. Check session in DB -- TERMINATED rejects
    const sessionRow = await getSessionById(payload.session_id);
    if (sessionRow === null) {
      await this.emitSessionDenial(payload, "SESSION_REVOKED", "row_absent", null, context);
      return { valid: false, code: "SESSION_REVOKED" };
    }
    if (sessionRow.status === "TERMINATED") {
      await this.emitSessionDenial(payload, "SESSION_REVOKED", "terminated", null, context);
      return { valid: false, code: "SESSION_REVOKED" };
    }
    if (sessionRow.status === "INVALIDATED") {
      await this.emitSessionDenial(payload, "SESSION_REVOKED", "invalidated", "session_invalidated", context);
      return { valid: false, code: "SESSION_INVALIDATED" };
    }
    if (sessionRow.status === "EXPIRED") {
      await this.emitSessionDenial(payload, "SESSION_EXPIRED", "row_expired", null, context);
      return { valid: false, code: "SESSION_EXPIRED" };
    }

    // GOVSEC.3C-B2 / GAP-A1: idle-timeout enforcement. The session is ACTIVE
    // here (it passed the status checks above). Enforce using ONLY the
    // already-fetched session row -- idle_timeout_minutes (the snapshot from
    // GOVSEC.3C-B1) and last_activity_at (GOVSEC.3C-A) -- so validateSession
    // performs zero extra org-settings reads on the hot path. A null snapshot
    // means idle enforcement is disabled for this session. The baseline
    // COALESCEs to issued_at for pre-3C-A sessions whose last_activity_at is
    // null. Placed before the TAR / operation / nonce checks so an idle-expired
    // session is rejected without that downstream work, and before the
    // success-path touch so an idle-expired session is never touched.
    if (sessionRow.idle_timeout_minutes !== null) {
      const idleBaseline = sessionRow.last_activity_at ?? sessionRow.issued_at;
      const idleWindowMs = sessionRow.idle_timeout_minutes * 60_000;
      if (Date.now() - idleBaseline.getTime() > idleWindowMs) {
        // Atomic ACTIVE -> EXPIRED. Exactly one concurrent caller wins
        // (count === 1); only the winner emits the lifecycle audit event, so
        // there is no duplicate idle_timeout emission under concurrency.
        const transitioned = await markSessionIdleExpired(payload.session_id);
        if (transitioned) {
          // Best-effort nonce delete: the DB EXPIRED status is authoritative,
          // so a failed nonce delete must not change the outcome. The audit
          // emission below is NOT best-effort -- it is awaited / fail-closed
          // per RULE 4.
          try {
            await this.config.nonceStore.delete(payload.session_id);
          } catch {
            // best-effort: DB EXPIRED already gates this and every future use
          }
          await this.emitSessionDenial(payload, "SESSION_EXPIRED", "idle_timeout", null, context);
        }
        return { valid: false, code: "SESSION_EXPIRED" };
      }
    }

    // 4 + 5. Compare current TAR hash to the one in the token
    const currentTar = await getTARByEntityId(payload.entity_id);
    if (currentTar === null || currentTar.tar_hash !== payload.tar_hash) {
      await this.emitSessionDenial(payload, "SESSION_REVOKED", "tar_hash_mismatch", "tar_hash_mismatch", context);
      return { valid: false, code: "SESSION_INVALIDATED" };
    }

    // 6. Required operation must be in the session's allowed_operations.
    // An operation-scope denial is an authorization decision, not a session-
    // lifecycle transition -- emit no lifecycle audit event here.
    if (!payload.allowed_operations.includes(requiredOp)) {
      return { valid: false, code: "OPERATION_NOT_PERMITTED" };
    }

    // 7. Nonce must still exist in Redis
    const nonceLive = await this.config.nonceStore.has(payload.session_id);
    if (!nonceLive) {
      await this.emitSessionDenial(payload, "SESSION_EXPIRED", "nonce_absent", null, context);
      return { valid: false, code: "SESSION_EXPIRED" };
    }

    // GOVSEC.3C-A / GAP-A1: record session activity (throttled, audit-free) on
    // the success path only. This is best-effort metadata tracking, not a
    // security gate: the session has already validated, so a failed tracking
    // write must NOT fail an otherwise-valid request (availability), and cannot
    // make an invalid session valid. If it lags, the session merely appears
    // slightly more idle to the future GOVSEC.3C-B enforcement -- a conservative,
    // safe direction. No idle enforcement is performed here.
    try {
      await touchSessionActivity(payload.session_id);
    } catch {
      // best-effort: validation already succeeded; activity tracking is non-critical
    }

    return {
      valid: true,
      entity_id: payload.entity_id,
      session_id: payload.session_id,
      clearance_ceiling: payload.clearance_ceiling,
      allowed_operations: payload.allowed_operations,
    };
  }

  // WHAT: Emit a modern hash-chained session-lifecycle denial audit event.
  // INPUT: The decoded session payload, the lifecycle event_type, a safe
  //        reason class, an optional subreason class, and optional context.
  // OUTPUT: A promise that resolves once the audit_events row is written.
  // WHY: GAP-G1 (GOVSEC.2A) -- record SESSION_EXPIRED / SESSION_REVOKED on the
  //      actor's own audit chain at validateSession failure detection. Only safe
  //      class metadata is recorded (reason / subreason enums); never the token,
  //      nonce, TAR hash, or any raw content. Per RULE 4 the write is awaited and
  //      not swallowed: a failed audit fails closed -- the caller never receives a
  //      valid session. Emitting on the actor's per-user chain (not SCHEDULER)
  //      avoids shared-chain advisory-lock contention (GAP-O1).
  private async emitSessionDenial(
    payload: SessionTokenPayload,
    eventType: "SESSION_EXPIRED" | "SESSION_REVOKED",
    reason: string,
    subreason: string | null,
    context: ValidateSessionContext | undefined,
  ): Promise<void> {
    await writeAuditEvent({
      event_type: eventType,
      outcome: "DENIED",
      actor_entity_id: payload.entity_id,
      session_id: payload.session_id,
      ip_address: context?.ip_address ?? null,
      details: subreason === null ? { reason } : { reason, subreason },
    });
  }
}

// WHAT: Build the generic-error login failure shape.
// INPUT: None.
// OUTPUT: A LoginFailure with code INVALID_CREDENTIALS.
// WHY: Spec says wrong password and entity-not-found return identical
//      messages to the caller. Centralizing the constant keeps the
//      two paths unable to drift.
function invalidCredentials(): LoginFailure {
  return { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid credentials" };
}

// WHAT: Build the SUSPENDED login failure shape.
// INPUT: None.
// OUTPUT: A LoginFailure with code SUSPENDED.
// WHY: Spec wants "Account suspended. Contact support." -- a different
//      message than the generic one. Same centralization argument.
function suspendedFailure(): LoginFailure {
  return {
    ok: false,
    code: "SUSPENDED",
    message: "Account suspended. Contact support.",
  };
}

// Re-exported so tests using a known-clearance entity do not have to
// import the type from the deepest path.
export { Entity };
