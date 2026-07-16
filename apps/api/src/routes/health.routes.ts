// FILE: health.routes.ts
// PURPOSE: Public liveness endpoint for ops + load balancers.
//          Also exposes deploy fingerprint (git commit) so we can
//          detect stuck Render deploys that serve an old container.
// CONNECTS TO: prisma (pings the DB); Render env RENDER_GIT_COMMIT.

import type { FastifyInstance } from "fastify";
import { prisma } from "@niov/database";

/** Best-effort commit SHA injected by Render or Docker build args. */
function deployFingerprint(): {
  git_commit: string | null;
  service: string | null;
  region: string | null;
} {
  const git =
    process.env.RENDER_GIT_COMMIT ??
    process.env.GIT_COMMIT ??
    process.env.SOURCE_VERSION ??
    null;
  return {
    git_commit: typeof git === "string" && git.length > 0 ? git.slice(0, 40) : null,
    service:
      typeof process.env.RENDER_SERVICE_NAME === "string"
        ? process.env.RENDER_SERVICE_NAME
        : null,
    region:
      typeof process.env.RENDER_REGION === "string"
        ? process.env.RENDER_REGION
        : null,
  };
}

// WHAT: Register GET /api/v1/health.
// INPUT: A Fastify instance.
// OUTPUT: A promise that resolves once the route is registered.
// WHY: Public, never rate-limited. Pings the database via a
//      cheap raw SELECT 1 so monitoring can distinguish "process
//      up" from "database reachable". git_commit lets ops confirm
//      the running container matches origin/main after a deploy.
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
    const fp = deployFingerprint();
    return reply.code(200).send({
      ok: true,
      version: "0.0.1",
      timestamp: new Date().toISOString(),
      database,
      git_commit: fp.git_commit,
      render_service: fp.service,
      render_region: fp.region,
      // Feature probes — false means the container is older than these routes.
      features: {
        handoff_acknowledge: true,
        handoff_complete_ambient: true,
        relay_messaging: true,
      },
    });
  });
}
