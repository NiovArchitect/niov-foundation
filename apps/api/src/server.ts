// FILE: server.ts
// PURPOSE: Build a configured Fastify instance for the NIOV API. The
//          factory pattern (buildApp) lets tests construct a fresh
//          app per suite without binding to a port.
// CONNECTS TO: All route registries (right now: auth) and the
//              AuthService that several of them depend on.

import Fastify, { type FastifyInstance } from "fastify";
import { AuthService } from "./services/auth.service.js";
import { NegotiateService } from "./services/cosmp/negotiate.service.js";
import { ReadService } from "./services/cosmp/read.service.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCosmpRoutes } from "./routes/cosmp.routes.js";
import { makeDefaultNonceStore, type NonceStore } from "./redis.js";
import { MemoryContentStore, type ContentStore } from "./content-store.js";

// WHAT: The pieces buildApp needs to wire up.
// INPUT: Used as a parameter type only.
// OUTPUT: None.
// WHY: Tests inject their own NonceStore + JWT secret; production
//      reads them from env. One shape covers both. The two
//      NonceStore slots are independent so tests can drive the
//      session and declaration stores separately.
export interface BuildAppConfig {
  jwtSecret?: string;
  sessionNonceStore?: NonceStore;
  declarationStore?: NonceStore;
  contentStore?: ContentStore;
}

// WHAT: Construct a fully wired Fastify instance ready for inject()
//        or listen().
// INPUT: An optional BuildAppConfig. Defaults read from env.
// OUTPUT: A Fastify instance with all routes registered.
// WHY: Splitting "build" from "listen" is what makes integration
//      tests possible (we never bind a port; we use app.inject).
export async function buildApp(
  config: BuildAppConfig = {},
): Promise<FastifyInstance> {
  const jwtSecret =
    config.jwtSecret ??
    process.env.JWT_SECRET ??
    (() => {
      throw new Error(
        "JWT_SECRET must be configured (set the env var or pass jwtSecret)",
      );
    })();

  const sessionNonceStore =
    config.sessionNonceStore ?? makeDefaultNonceStore("niov:session:nonce:");
  const declarationStore =
    config.declarationStore ??
    makeDefaultNonceStore("niov:cosmp:declaration:");

  const contentStore: ContentStore =
    config.contentStore ?? new MemoryContentStore();

  const authService = new AuthService({
    jwtSecret,
    nonceStore: sessionNonceStore,
  });
  const negotiateService = new NegotiateService(
    authService,
    declarationStore,
    jwtSecret,
  );
  const readService = new ReadService(
    authService,
    declarationStore,
    contentStore,
    jwtSecret,
  );

  const app = Fastify({ logger: false });
  await registerAuthRoutes(app, authService);
  await registerCosmpRoutes(app, negotiateService, readService);

  return app;
}

// WHAT: Boot the server when this file is run directly.
// INPUT: None.
// OUTPUT: A long-lived Fastify process listening on PORT.
// WHY: Production entry point. Tests never call this -- they call
//      buildApp() and use inject() instead.
async function main(): Promise<void> {
  const app = await buildApp();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  await app.listen({ port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`NIOV API listening on :${port}`);
}

if (process.argv[1]?.endsWith("server.ts")) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start server", err);
    process.exit(1);
  });
}
