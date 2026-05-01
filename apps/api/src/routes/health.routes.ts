// FILE: health.routes.ts
// PURPOSE: Public liveness endpoint for ops + load balancers.
// CONNECTS TO: prisma (pings the DB).

import type { FastifyInstance } from "fastify";
import { prisma } from "@niov/database";

// WHAT: Register GET /api/v1/health.
// INPUT: A Fastify instance.
// OUTPUT: A promise that resolves once the route is registered.
// WHY: Public, never rate-limited. Pings the database via a
//      cheap raw SELECT 1 so monitoring can distinguish "process
//      up" from "database reachable".
export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/v1/health", async (_request, reply) => {
    let database = "unknown";
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "disconnected";
    }
    return reply.code(200).send({
      ok: true,
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      database,
    });
  });
}
