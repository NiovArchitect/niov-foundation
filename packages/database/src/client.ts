// FILE: client.ts
// PURPOSE: Hand out one shared Prisma client for the whole process so we
//          do not accidentally open dozens of database connections.
// CONNECTS TO: The Supabase Postgres database (via DATABASE_URL in .env),
//              every file under /queries that needs to read or write data,
//              and the audit helper which writes to AuditLog.

import { PrismaClient } from "@prisma/client";

// WHAT: A module-level holder so the Prisma client survives across hot reloads.
// INPUT: Nothing -- it is just a typed bag for the singleton.
// OUTPUT: An object that may or may not already have a Prisma client inside.
// WHY: Without this, dev mode would open a new database connection every
//      time a file changes, eventually exhausting Supabase's connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// WHAT: The one and only Prisma client every part of the app should use.
// INPUT: None.
// OUTPUT: A live PrismaClient connected to Supabase Postgres.
// WHY: A single shared client keeps connection counts low and gives us one
//      place to attach logging, hooks, or middleware in the future.
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
