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
