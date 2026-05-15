// FILE: server.ts
// PURPOSE: Build a configured Fastify instance for the NIOV API. The
//          factory pattern (buildApp) lets tests construct a fresh
//          app per suite without binding to a port.
// CONNECTS TO: All route registries (right now: auth) and the
//              AuthService that several of them depend on.

import Fastify, { type FastifyInstance } from "fastify";
import pino from "pino";
import { logger } from "./logger.js";
import {
  ContentEncryption,
  makeContentEncryption,
} from "@niov/auth";
import { AuthService } from "./services/auth.service.js";
import { NegotiateService } from "./services/cosmp/negotiate.service.js";
import { ReadService } from "./services/cosmp/read.service.js";
import { WriteService } from "./services/cosmp/write.service.js";
import { ShareService } from "./services/cosmp/share.service.js";
import { COEService } from "./services/coe/coe.service.js";
import { registerCoeRoutes } from "./routes/coe.routes.js";
import { HiveService } from "./services/hive/hive.service.js";
import { registerHiveRoutes } from "./routes/hive.routes.js";
import { MonetizationService } from "./services/monetization/monetization.service.js";
import { registerWalletRoutes } from "./routes/wallet.routes.js";
import {
  ComplianceService,
  seedComplianceFrameworks,
} from "./services/compliance/compliance.service.js";
import { registerComplianceRoutes } from "./routes/compliance.routes.js";
import {
  makeDefaultRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.js";
import {
  DEFAULT_LIMITS,
  makeGatewayHook,
  type RateLimitPolicy,
} from "./middleware/gateway.middleware.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerDeveloperRoutes } from "./routes/developer.routes.js";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  seedMonetizationConfig,
  seedSkillPackages,
  seedAgentTemplates,
  seedFeedbackLoopHealth,
  seedOtzarEntity,
} from "./services/governance/seeds.js";
import { validateBootEnvironment } from "./boot-validation.js";
import { FeedbackService } from "./services/feedback/feedback.service.js";
import {
  startScheduler,
  type SchedulerHandle,
} from "./services/feedback/scheduler.js";
import { OtzarService } from "./services/otzar/otzar.service.js";
import { ObservationService } from "./services/otzar/observation.service.js";
import { makeDefaultKVCache } from "./services/otzar/cache.js";
import { getLLMProvider, MockLLMProvider } from "./services/llm/llm.service.js";
import { registerOtzarRoutes } from "./routes/otzar.routes.js";
import { registerOtzarObservationRoutes } from "./routes/otzar-observation.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCosmpRoutes } from "./routes/cosmp.routes.js";
import { registerPlatformRoutes } from "./routes/platform.routes.js";
import { registerOrgRoutes } from "./routes/org.routes.js";
import { registerEscalationRoutes } from "./routes/escalation.routes.js";
import { registerAuthAdminRoutes } from "./routes/auth-admin.routes.js";
// CAR Sub-box 3 sub-phase 5 [SUB-BOX-3-ROUTES] per ADR-0036
// Sub-decisions 6 + 7: tenant admin governance routes for REGULATOR
// access grant + revoke (dual-control gated; can_admin_niov tier).
import { registerRegulatorRoutes } from "./routes/regulator.routes.js";
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
  contentEncryption?: ContentEncryption;
  rateLimitStore?: RateLimitStore;
  rateLimitOverrides?: Partial<Record<string, RateLimitPolicy>>;
  // Section 11B test injection points -- production reads from env.
  otzarCache?: import("./services/otzar/cache.js").KVCache;
  otzarLLM?: import("./services/llm/llm.service.js").LLMProvider;
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
  // Section 11A boot validation -- fail fast on missing required
  // env vars before constructing any service. Skip when the caller
  // passes an explicit jwtSecret (test-mode buildApp pattern).
  if (config.jwtSecret === undefined) {
    validateBootEnvironment();
  }
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

  const contentEncryption: ContentEncryption =
    config.contentEncryption ?? makeContentEncryption();

  const authService = new AuthService({
    jwtSecret,
    nonceStore: sessionNonceStore,
  });
  const complianceService = new ComplianceService(authService);
  const negotiateService = new NegotiateService(
    authService,
    declarationStore,
    jwtSecret,
    complianceService,
  );
  const writeService = new WriteService(
    authService,
    declarationStore,
    contentStore,
    contentEncryption,
    jwtSecret,
  );
  const shareService = new ShareService(authService);
  const hiveService = new HiveService(
    authService,
    contentEncryption,
    contentStore,
  );
  const monetizationService = new MonetizationService(authService);

  const rateLimitStore = config.rateLimitStore ?? makeDefaultRateLimitStore();

  // Section 10 feedback service is constructed BEFORE ReadService
  // and COEService so the optional Loop 1 / Loop 5 hooks can be
  // wired in. The hooks are no-ops in test mode (FeedbackService
  // constructed but the cron scheduler is skipped via
  // NODE_ENV=test below). Tests that don't need feedback wiring
  // simply construct services directly via @niov/api exports.
  const feedbackService = new FeedbackService(hiveService, rateLimitStore);
  const readService = new ReadService(
    authService,
    declarationStore,
    contentStore,
    jwtSecret,
    {
      onContentRead: async (input) => {
        await feedbackService.runLoop5Once(input);
      },
    },
  );
  const coeService = new COEService(
    authService,
    negotiateService,
    readService,
    contentEncryption,
    {
      onRecordOutcome: async (input) => {
        // Run Loop 1 once per outcome. We collapse the per-outcome
        // call into a single relevance pass for the candidate set
        // (the relevance bumps are per-capsule, not per-outcome).
        if (input.outcome_ids.length === 0) return;
        await feedbackService.runLoop1Once({
          outcome_id: input.outcome_ids[0]!,
          candidate_capsule_ids: input.candidate_capsule_ids,
          used_capsule_ids: input.used_capsule_ids,
        });
      },
    },
  );
  const rateLimits: Record<string, RateLimitPolicy> = {
    ...DEFAULT_LIMITS,
    ...(config.rateLimitOverrides ?? {}),
  };

  // Section 11B Otzar service. KVCache + LLM provider + COE +
  // Auth dependencies. In test mode (NODE_ENV=test), buildApp uses
  // a MockLLMProvider returning deterministic strings -- the real
  // Anthropic/OpenAI SDKs are never instantiated under CI.
  const otzarCache = config.otzarCache ?? makeDefaultKVCache();
  const otzarLLM =
    config.otzarLLM ??
    (process.env.NODE_ENV === "test"
      ? new MockLLMProvider([
          {
            ok: true,
            text: "topics: stub-topic-a, stub-topic-b",
            provider: "mock",
            model: "mock-1",
          },
        ])
      : getLLMProvider());
  const otzarService = new OtzarService(
    authService,
    coeService,
    otzarLLM,
    otzarCache,
  );

  // Section 11C observation pipeline. Reuses the same LLM provider
  // OtzarService uses (deterministic mock in NODE_ENV=test, real
  // provider otherwise).
  const observationService = new ObservationService(authService, otzarLLM);

  // 12C.0 Item 8: re-enable Fastify's pino logger with JSON output
  // and redact paths. NODE_ENV=test sets level to "silent" so the
  // vitest reporter stays clean; production / development use
  // LOG_LEVEL or default to "info". Redact paths per DRIFT 13
  // expanded list cover credentials (authorization header, cookie,
  // password, token), user PII (email), cryptographic material
  // (public_key), and Otzar conversation content (message --
  // potentially carries other data subjects' PII per the
  // hash+content split rationale in
  // docs/COMPLIANCE_ARCHITECTURE_REVIEW.md Tension 5).
  const app = Fastify({
    logger: {
      level:
        process.env.NODE_ENV === "test"
          ? "silent"
          : (process.env.LOG_LEVEL ?? "info"),
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.token",
          "req.body.email",
          "req.body.public_key",
          "req.body.message",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  // Helmet first -- security headers (HSTS + X-Frame-Options +
  // X-Content-Type-Options + Referrer-Policy + Cross-Origin-*) land on
  // every response including CORS preflight OPTIONS and rate-limited
  // 429s. CSP + COEP deferred to forward queue per ADR-0023 (frontend
  // integration substrate not yet canonical).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    global: true,
  });

  // CORS registered next, still before the gateway hook so preflight
  // OPTIONS responses are not subject to rate limiting and the CORS
  // plugin's own headers layer on top of helmet baseline.
  await app.register(cors, {
    origin: process.env.CONTROL_TOWER_URL ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  // Gateway hook -- IP whitelist + rate limits run before any
  // route handler.
  app.addHook(
    "onRequest",
    makeGatewayHook({
      store: rateLimitStore,
      limits: rateLimits,
      jwtSecret,
    }),
  );

  // Swagger / OpenAPI surface -- registered before routes so the
  // route definitions can attach schemas later if we add them.
  await app.register(swagger, {
    openapi: {
      info: {
        title: "NIOV Foundation API",
        description: "Internet of Value protocol platform",
        version: "0.0.1",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/v1/docs" });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app, authService);
  await registerCosmpRoutes(
    app,
    negotiateService,
    readService,
    writeService,
    shareService,
    monetizationService,
  );
  await registerCoeRoutes(app, coeService);
  await registerHiveRoutes(app, hiveService);
  await registerWalletRoutes(app, monetizationService, authService);
  await registerComplianceRoutes(app, complianceService);
  await registerDeveloperRoutes(app, authService);
  await registerPlatformRoutes(app, authService);
  await registerOrgRoutes(app, authService);
  await registerEscalationRoutes(app, authService);
  await registerAuthAdminRoutes(app, authService, jwtSecret);
  await registerRegulatorRoutes(app, authService);
  await registerOtzarRoutes(app, otzarService);
  await registerOtzarObservationRoutes(app, observationService, authService);

  // Idempotent seed on every boot so a fresh DB has the seven
  // spec frameworks ready before the first request lands.
  await seedComplianceFrameworks();

  // Section 9 governance seeds. All idempotent. Some are no-op
  // stubs whose data lives in later paste boxes -- see
  // services/governance/seeds.ts for per-stub TODO references.
  await seedMonetizationConfig();
  await seedSkillPackages();
  await seedAgentTemplates();

  // Section 10 -- seed the seven FeedbackLoopHealth rows so Loop 7
  // has a baseline to compare against on its first run.
  await seedFeedbackLoopHealth();

  // Section 11A -- seed the Otzar APPLICATION entity (no-op when
  // OTZAR_ENTITY_ID is set + entity exists; warn-and-create when
  // missing). Tests set OTZAR_ENTITY_ID via the helper to avoid
  // bootstrap warnings polluting CI output.
  await seedOtzarEntity();

  // Section 10 -- start the cron scheduler. NO-OP under
  // NODE_ENV=test (scheduler.ts short-circuits before registering
  // any cron tasks). Production calls scheduler.stop() during
  // graceful shutdown via main() below.
  const scheduler: SchedulerHandle = startScheduler(
    feedbackService,
    otzarService,
  );
  // Attach to the app so callers (production main, tests asserting
  // scheduler state) can reach it without a second buildApp return
  // value.
  (app as unknown as { scheduler: SchedulerHandle }).scheduler = scheduler;

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
  app.log.info({ port }, "NIOV API listening");

  // Graceful shutdown: stop the cron scheduler BEFORE Fastify
  // closes so an in-flight loop fire doesn't outlive the server.
  const scheduler = (app as unknown as { scheduler?: SchedulerHandle })
    .scheduler;
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "[server] received shutdown signal");
    try {
      scheduler?.stop();
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

if (process.argv[1]?.endsWith("server.ts")) {
  main().catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
}
