// FILE: audit.ts
// PURPOSE: The single helper every data-touching function uses to satisfy
//          Rule 4 -- write the audit row inside the same database
//          transaction as the real action, so the action only succeeds if
//          the audit row also lands.
// CONNECTS TO: The Prisma client in /client.ts, every query function under
//              /queries, and the AuditLog table defined in schema.prisma.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./client.js";

// WHAT: A type alias for "either the main client or a transaction handle".
// INPUT: Used as a parameter type only.
// OUTPUT: A handle that supports the same query API as the main client.
// WHY: We want one helper that works whether the caller already has a
//      transaction open or not, so we accept either shape.
export type PrismaTx =
  | PrismaClient
  | Prisma.TransactionClient;

// WHAT: The shape of one audit row before it is written to the database.
// INPUT: Used as a parameter type when callers describe what just happened.
// OUTPUT: None -- this is a type, not a value.
// WHY: Forces every caller to think about who acted (actor_id), who was
//      affected (entity_id), what happened (action), and any extra context.
export interface AuditEntry {
  action: string;
  entity_id?: string | null;
  actor_id?: string | null;
  meta?: Record<string, unknown>;
}

// WHAT: Insert one row into the audit_logs table.
// INPUT: A transaction or client handle, plus the audit entry to record.
// OUTPUT: A promise that resolves once the row is in the database.
// WHY: Rule 4 -- no data action is allowed to return until its audit row
//      has been persisted. Calling this inside a transaction guarantees
//      that if the audit insert fails, the whole action is rolled back.
export async function writeAudit(
  tx: PrismaTx,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: entry.action,
      entity_id: entry.entity_id ?? null,
      actor_id: entry.actor_id ?? null,
      meta: (entry.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}

// WHAT: Run a database action and its audit log together as one transaction.
// INPUT: An audit entry describing what is about to happen, and a function
//        that takes a transaction handle and performs the real work.
// OUTPUT: Whatever value the inner function returned, after both writes
//         have been committed.
// WHY: This is the one place that enforces Rule 4 in code. If either the
//      action or the audit insert fails, Postgres rolls everything back,
//      so the caller can never observe a half-written state.
export async function withAudit<T>(
  entry: AuditEntry,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = defaultPrisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    const result = await work(tx);
    await writeAudit(tx, entry);
    return result;
  });
}
