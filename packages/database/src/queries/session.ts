// FILE: session.ts
// PURPOSE: Read and write operations for the Session table. Section 1F
//          introduced the Session model and tar-hash invalidation; this
//          file finally adds the createSession / terminateSession
//          functions Section 2 needs for real auth.
// CONNECTS TO: The sessions table in schema.prisma, the audit helper,
//              and the auth service in /apps/api which orchestrates
//              login + JWT signing + Redis nonce.

import { randomUUID } from "node:crypto";
import type { Prisma, Session } from "@prisma/client";
import { writeAudit } from "../audit.js";
import { prisma } from "../client.js";

// WHAT: The shape of the data createSession expects.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: A session needs to know which entity it is for, what TAR hash
//      was current at issue time (for later invalidation checks),
//      what operations are allowed, and when it expires. issued_at
//      is optional -- callers that anchor JWT exp / DB expires_at /
//      Redis TTL to the same JS clock should pass the SAME Date
//      object here so all three expiry sources stay aligned.
//      When omitted, Postgres @default(now()) fires.
export interface CreateSessionInput {
  entity_id: string;
  tar_hash_at_creation: string;
  allowed_operations: string[];
  clearance_ceiling: number;
  expires_at: Date;
  issued_at?: Date;
  session_id?: string;
  // GOVSEC.3C-B1 / GAP-A1: per-session snapshot of the org's idle-timeout
  // window, captured at creation (mirrors clearance_ceiling/allowed_operations
  // snapshotting). null = idle enforcement disabled for this session. Read by
  // GOVSEC.3C-B2 enforcement from the already-fetched session row -- no
  // per-request org-settings lookup in validateSession.
  idle_timeout_minutes?: number | null;
}

// WHAT: Insert one Session row plus its audit entry, atomically.
// INPUT: A CreateSessionInput.
// OUTPUT: The newly created Session row.
// WHY: Login is the only flow that creates sessions today. We audit
//      every issuance so a security review can answer "who got a
//      token, when, and what could it do".
export async function createSession(
  input: CreateSessionInput,
): Promise<Session> {
  const session_id = input.session_id ?? randomUUID();

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        session_id,
        entity_id: input.entity_id,
        tar_hash_at_creation: input.tar_hash_at_creation,
        allowed_operations: input.allowed_operations,
        clearance_ceiling: input.clearance_ceiling,
        expires_at: input.expires_at,
        // Override @default(now()) only when caller anchors all three
        // expiry sources to a known JS-clock instant (login does).
        ...(input.issued_at !== undefined ? { issued_at: input.issued_at } : {}),
        // GOVSEC.3C-A / GAP-A1: seed activity tracking at creation so the
        // future idle-timeout enforcement (GOVSEC.3C-B) always has a baseline.
        last_activity_at: input.issued_at ?? new Date(),
        // GOVSEC.3C-B1 / GAP-A1: snapshot the org idle-timeout window onto the
        // session (null = idle disabled). Enforcement (3C-B2) reads this from
        // the already-fetched row -- no per-request org-settings lookup.
        idle_timeout_minutes: input.idle_timeout_minutes ?? null,
      },
    });

    await writeAudit(tx, {
      action: "SESSION_CREATE",
      entity_id: input.entity_id,
      actor_id: input.entity_id,
      meta: {
        session_id,
        allowed_operations: input.allowed_operations,
        clearance_ceiling: input.clearance_ceiling,
        expires_at: input.expires_at.toISOString(),
      },
    });

    return session;
  });
}

// WHAT: Look up a session by its primary key.
// INPUT: The session_id.
// OUTPUT: The Session row if found, otherwise null.
// WHY: validateSession needs to read the live row to confirm it has
//      not been TERMINATED or INVALIDATED since the JWT was issued.
//      Audit-free because reads happen on every authenticated request.
export async function getSessionById(
  sessionId: string,
): Promise<Session | null> {
  return prisma.session.findUnique({
    where: { session_id: sessionId },
  });
}

// WHAT: Throttled, audit-free update of an ACTIVE session's last_activity_at.
// INPUT: session_id, optional { thresholdMs (default 60s), now }.
// OUTPUT: true if the row was updated, false if the throttle window had not
//         elapsed (or the session is not ACTIVE).
// WHY: GOVSEC.3C-A / GAP-A1 -- record session activity so GOVSEC.3C-B can later
//      enforce an idle timeout. The update is a single atomic updateMany whose
//      WHERE clause itself encodes the throttle (last_activity_at is null OR
//      older than the threshold), avoiding a read-then-write race and capping
//      hot-path writes to at most one per threshold window per session. No
//      audit, no Redis, no status change -- this is metadata tracking only.
export async function touchSessionActivity(
  sessionId: string,
  options: { thresholdMs?: number; now?: Date } = {},
): Promise<boolean> {
  const thresholdMs = options.thresholdMs ?? 60_000;
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - thresholdMs);
  const result = await prisma.session.updateMany({
    where: {
      session_id: sessionId,
      status: "ACTIVE",
      OR: [{ last_activity_at: null }, { last_activity_at: { lt: staleBefore } }],
    },
    data: { last_activity_at: now },
  });
  return result.count > 0;
}

// WHAT: Atomically transition an ACTIVE session to EXPIRED on an idle-timeout
//        breach the caller has already detected.
// INPUT: The session_id.
// OUTPUT: true if THIS call won the ACTIVE -> EXPIRED transition (count === 1);
//         false if the session was not ACTIVE (already EXPIRED / TERMINATED /
//         INVALIDATED, or a concurrent caller won the transition first).
// WHY: GOVSEC.3C-B2 / GAP-A1 -- runtime idle-timeout enforcement. validateSession
//      computes the idle breach from the already-fetched session row (the
//      idle_timeout_minutes snapshot from GOVSEC.3C-B1 + last_activity_at from
//      GOVSEC.3C-A) and calls this to flip the row. The single atomic updateMany
//      guarded by status = "ACTIVE" guarantees exactly one caller observes
//      count === 1 under concurrency, so the lifecycle audit event is emitted
//      once and only once. Audit-free and Redis-free by design: the caller owns
//      the SESSION_EXPIRED idle_timeout audit emission (on the actor's chain) and
//      the best-effort nonce delete; the DB EXPIRED status is the authoritative
//      gate. No timestamp is written -- status = "EXPIRED" is the transition.
export async function markSessionIdleExpired(
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      session_id: sessionId,
      status: "ACTIVE",
    },
    data: { status: "EXPIRED" },
  });
  return result.count > 0;
}

// WHAT: Mark a session as TERMINATED (the user logged out).
// INPUT: The session_id and the entity_id of the actor.
// OUTPUT: The updated Session row.
// WHY: Logout must mark the session ended so subsequent JWT
//      validations see status=TERMINATED and reject. We audit so the
//      logout event is traceable.
export async function terminateSession(
  sessionId: string,
  actorId: string,
): Promise<Session> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.session.update({
      where: { session_id: sessionId },
      data: {
        status: "TERMINATED",
        terminated_at: new Date(),
      },
    });

    await writeAudit(tx, {
      action: "SESSION_TERMINATE",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { session_id: sessionId },
    });

    return updated;
  });
}

// WHAT: Sweep through ACTIVE sessions whose expires_at has passed and
//        mark them EXPIRED.
// INPUT: An optional clock for deterministic tests.
// OUTPUT: The count of sessions that were just expired.
// WHY: Background cleanup for sessions whose owners never logged out.
//      Keeps the sessions table representative of "actually-active"
//      sessions for monitoring and capacity planning.
export async function expireOldSessions(
  now: Date = new Date(),
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const targets = await tx.session.findMany({
      where: {
        status: "ACTIVE",
        expires_at: { not: null, lte: now },
      },
      select: { session_id: true },
    });

    if (targets.length === 0) {
      await writeAudit(tx, {
        action: "SESSION_EXPIRY_SWEEP",
        meta: { count: 0, swept_at: now.toISOString() },
      });
      return 0;
    }

    const ids = targets.map((t) => t.session_id);
    const result = await tx.session.updateMany({
      where: { session_id: { in: ids } },
      data: { status: "EXPIRED" },
    });

    await writeAudit(tx, {
      action: "SESSION_EXPIRY_SWEEP",
      meta: {
        count: result.count,
        swept_at: now.toISOString(),
        session_ids: ids,
      },
    });

    return result.count;
  });
}

export { prisma } from "../client.js";
