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
import { SimilarityService } from "./services/cosmp/similarity.service.js";
import { makeNotificationService } from "./services/notification/notification.service.js";
import { makeConnectorFanOutHook } from "./services/connector/notification-fanout.service.js";
import { COEService } from "./services/coe/coe.service.js";
import { registerCoeRoutes } from "./routes/coe.routes.js";
import { WorkingSetService } from "./services/personalization/working-set.service.js";
import {
  createSessionContextResolver,
  prismaWalletContextLookup,
} from "./services/personalization/session-context-resolver.js";
import { registerWorkingSetRoutes } from "./routes/working-set.routes.js";
import { prisma } from "@niov/database";
import { HiveService } from "./services/hive/hive.service.js";
import { registerHiveRoutes } from "./routes/hive.routes.js";
import { registerHiveAdminRoutes } from "./routes/hive-admin.routes.js";
import { PlaygroundService } from "./services/playground/playground.service.js";
import { PlaygroundScenarioService } from "./services/playground/playground-scenario.service.js";
import { PlaygroundCandidateService } from "./services/playground/playground-candidate.service.js";
import { PlaygroundOutcomeComparisonService } from "./services/playground/playground-outcome-comparison.service.js";
import { PlaygroundBestPathRecommendationService } from "./services/playground/playground-best-path-recommendation.service.js";
import { PlaygroundGovernedTransitionService } from "./services/playground/playground-governed-transition.service.js";
import { PlaygroundSimulationService } from "./services/playground/playground-simulation.service.js";
import { ConversationContextSignalProjectionService } from "./services/playground/conversation-context-signals.js";
import { registerPlaygroundRoutes } from "./routes/playground.routes.js";
import { AnalyticsService } from "./services/analytics/analytics.service.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
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
import {
  startActionScheduler,
  type ActionSchedulerHandle,
} from "./services/action/scheduler.js";
import {
  makeActionHandlerRegistry,
  setDefaultActionHandlerRegistry,
} from "./services/action/handlers.js";
import { OtzarService } from "./services/otzar/otzar.service.js";
import { OtzarProposedPatternService } from "./services/otzar/proposed-pattern.service.js";
import { ObservationService } from "./services/otzar/observation.service.js";
import { makeDefaultKVCache } from "./services/otzar/cache.js";
import { getLLMProvider, MockLLMProvider } from "./services/llm/llm.service.js";
import {
  FixtureBasedEmbeddingProvider,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./services/embedding/embedding.service.js";
import { registerOtzarRoutes } from "./routes/otzar.routes.js";
import { registerOtzarProposedPatternRoutes } from "./routes/otzar-proposed-pattern.routes.js";
import { registerOtzarObservationRoutes } from "./routes/otzar-observation.routes.js";
import { registerOtzarAuthorityGrantsRoutes } from "./routes/otzar-authority-grants.routes.js";
import { registerOtzarCorrectionMemoryRoutes } from "./routes/otzar-correction-memory.routes.js";
import { registerOtzarCollaborationRoutes } from "./routes/otzar-collaboration.routes.js";
import { registerOtzarWorkProjectRoutes } from "./routes/otzar-work-project.routes.js";
import { registerOtzarCollaborationWorkspaceRoutes } from "./routes/otzar-collaboration-workspace.routes.js";
import { registerOtzarExternalCollaboratorRoutes } from "./routes/otzar-external-collaborator.routes.js";
import { registerOtzarMeetingCaptureRoutes } from "./routes/otzar-meeting-capture.routes.js";
import { registerOtzarVoiceCaptureRoutes } from "./routes/otzar-voice-capture.routes.js";
import { registerDMWRegistryRoutes } from "./routes/dmw-registry.routes.js";
import { registerCOSMPCapsuleManagementRoutes } from "./routes/cosmp-capsule-management.routes.js";
import { registerOnboardingRoutes } from "./routes/onboarding.routes.js";
import { registerComplianceSharingRoutes } from "./routes/compliance-sharing.routes.js";
import { registerOtzarMyDayRoutes } from "./routes/otzar-my-day.routes.js";
import { registerOtzarObserveRoutes } from "./routes/otzar-observe.routes.js";
import { registerOtzarCalendarContextRoutes } from "./routes/otzar-calendar-context.routes.js";
import { registerOtzarDandelionRoutes } from "./routes/otzar-dandelion.routes.js";
import { registerOtzarAiEmployeesRoutes } from "./routes/otzar-ai-employees.routes.js";
import { registerOtzarSettlementRoutes } from "./routes/otzar-settlement.routes.js";
import { registerOtzarVoiceTtsRoutes } from "./routes/otzar-voice-tts.routes.js";
import { registerOtzarBeamStatusRoutes } from "./routes/otzar-beam-status.routes.js";
import { registerConnectorAdapterStatusRoutes } from "./routes/connector-adapter-status.routes.js";
import { registerOrgCollaborationPolicyRoutes } from "./routes/org-collaboration-policy.routes.js";
import { registerOtzarVoiceReadyRoutes } from "./routes/otzar-voice-ready.routes.js";
import { registerConnectorRailsRoutes } from "./routes/connector-rails.routes.js";
import { registerConnectorDataRoutes } from "./routes/connector-data.routes.js";
import { registerCalendarEventRoutes } from "./routes/calendar-event.routes.js";
import { registerWorkOsAuthorityRoutes } from "./routes/work-os-authority.routes.js";
import { registerFoundationRoutes } from "./routes/foundation.routes.js";
import { FoundationAuthorityService } from "./services/foundation/authority.service.js";
import { FoundationProofService } from "./services/foundation/proof-of-access.service.js";
import { FoundationEconomicService } from "./services/foundation/economic-policy.service.js";
import { FoundationAmbientDeviceService } from "./services/foundation/ambient-device.service.js";
import { FoundationMarketplaceService } from "./services/foundation/marketplace.service.js";
import { FoundationObservabilityService } from "./services/foundation/observability.service.js";
import { registerSystemRuntimeRoutes } from "./routes/system-runtime.routes.js";
import { registerWorkOsLedgerRoutes } from "./routes/work-os-ledger.routes.js";
import { registerAdminLlmStatusRoutes } from "./routes/admin-llm-status.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCosmpRoutes } from "./routes/cosmp.routes.js";
import { registerVoiceRoutes } from "./routes/voice.routes.js";
import { registerPlatformRoutes } from "./routes/platform.routes.js";
import { registerOrgRoutes } from "./routes/org.routes.js";
import { registerEscalationRoutes } from "./routes/escalation.routes.js";
// ADR-0057 §9 Option E — POST /api/v1/actions create-time substrate.
// Bearer + "write"-gated; NO dual-control preHandler (evaluator decides).
import { registerActionsRoutes } from "./routes/actions.routes.js";
// W5 Action Promotion Runtime per ADR-0086 — the governed bridge from
// W4 Proposed Action substrate to Section 2 Action runtime.
import { registerProposedActionRoutes } from "./routes/proposed-action.routes.js";
import { registerNotificationRoutes } from "./routes/notification.routes.js";
import { registerAuditRoutes } from "./routes/audit.routes.js";
// Section 4 Wave 2 — admin connector binding routes (can_admin_org).
import { registerConnectorRoutes } from "./routes/connector.routes.js";
// Phase 1261 — Priority C OAuth connector activation routes.
import { registerConnectorOAuthRoutes } from "./routes/connector-oauth.routes.js";
// GOVSEC.5 break-glass / time-boxed audit (GAP-K1, ADR-0050) BG.2: the
// invoke + review route surface (can_admin_niov tier). The live recognition
// seam lives in dual-control.middleware.ts.
import { registerBreakGlassRoutes } from "./routes/break-glass.routes.js";
// CONSOLE.1 P0: read-only Foundation Console control-plane endpoints
// (`/api/v1/console/*`, can_admin_niov tier). Read-only aggregation only.
import { registerConsoleRoutes } from "./routes/console.routes.js";
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
  // GOVSEC.4 G4-B2-B: deterministic test injection for the swarm cluster counter
  // (per-operation cluster thresholds + cluster count N). Production uses the
  // gateway-middleware defaults; tests inject low thresholds + small N.
  swarmThresholdOverrides?: Partial<Record<string, number>>;
  swarmClusterCount?: number;
  // Section 11B test injection points -- production reads from env.
  otzarCache?: import("./services/otzar/cache.js").KVCache;
  otzarLLM?: import("./services/llm/llm.service.js").LLMProvider;
  // ADR-0043 G3.6 (Q-G3.6-ζ test-injection): allow tests to override
  // the embedding provider; mirrors otzarLLM pattern. Production
  // omits and falls through to NODE_ENV-aware default (Fixture in
  // test mode, OpenAI in production).
  embeddingProvider?: EmbeddingProvider;
}

// WHAT: The local-development origins the API accepts cross-origin by default.
// INPUT: None (compile-time constant).
// OUTPUT: A frozen list of exact dev origins.
// WHY: Vite dev (otzar-control-tower) defaults to :5173; TanStack/Cloudflare
//      dev (foundation-command) commonly uses :3000. Exact origins only --
//      never a wildcard -- so local dev works without weakening prod posture.
const LOCAL_DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // Tauri 2.x desktop shell (otzar-control-tower/src-tauri).
  // macOS uses `tauri://localhost` for the custom protocol;
  // the asset protocol can present `https://tauri.localhost`.
  // Adding both keeps the visual-desktop run working without
  // exposing real Tauri origins in production (production CORS
  // is driven by CONTROL_TOWER_URL / FOUNDATION_COMMAND_URL env
  // vars and never auto-includes these).
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
] as const;

// WHAT: Assemble the exact-origin CORS allowlist from env + local dev defaults.
// INPUT: None (reads CONTROL_TOWER_URL + FOUNDATION_COMMAND_URL from env at call).
// OUTPUT: A deduplicated array of exact origin strings (no wildcards, no regex).
// WHY: Two sibling frontends (otzar-control-tower + foundation-command) plus
//      local dev call the API cross-origin. CORS is browser-origin enforcement
//      only -- it is NEVER authorization (auth stays Bearer + can_admin_niov).
//      Empty env values are trimmed out; origins are de-duplicated; no `*` and
//      no suffix/regex match, so CORS can only ever narrow, never broaden.
function buildCorsAllowedOrigins(): string[] {
  const candidates = [
    process.env.CONTROL_TOWER_URL,
    process.env.FOUNDATION_COMMAND_URL,
    ...LOCAL_DEV_CORS_ORIGINS,
  ];
  const cleaned = candidates
    .map((origin) => (typeof origin === "string" ? origin.trim() : ""))
    .filter((origin) => origin.length > 0);
  return Array.from(new Set(cleaned));
}

// WHAT: Decide whether a request Origin is permitted by the allowlist.
// INPUT: The request Origin header (string | undefined) + the exact-origin allowlist.
// OUTPUT: true if allowed (or absent), false otherwise.
// WHY: Requests with no Origin (curl, server-to-server, health checks) must not
//      be blocked by browser-oriented CORS logic, so an absent Origin is allowed.
//      A present Origin is allowed only on exact membership -- the disallowed
//      Origin is never reflected back into Access-Control-Allow-Origin.
function isAllowedCorsOrigin(
  origin: string | undefined,
  allowlist: readonly string[],
): boolean {
  if (origin === undefined) return true;
  return allowlist.includes(origin);
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
  // Phase 1288-B — Foundation generalized Entity & Authority Envelope.
  const foundationAuthorityService = new FoundationAuthorityService(authService);
  // Phase 1289-A — Foundation Memory Capsule proof-of-access.
  const foundationProofService = new FoundationProofService(authService);
  // Phase 1290-A — Foundation economic substrate (mock-only).
  const foundationEconomicService = new FoundationEconomicService(authService);
  // Phase 1291-A — Foundation ambient device protocol.
  const foundationAmbientDeviceService = new FoundationAmbientDeviceService(
    authService,
  );
  // Phase 1292-A — Foundation marketplace substrate.
  const foundationMarketplaceService = new FoundationMarketplaceService(
    authService,
  );
  // Phase 1293-A — Foundation observability + metering enforcement.
  const foundationObservabilityService = new FoundationObservabilityService(
    authService,
  );
  const negotiateService = new NegotiateService(
    authService,
    declarationStore,
    jwtSecret,
    complianceService,
  );
  // ADR-0043 G3.6 (Q-G3.6-ζ test-injection): single embedding
  // provider instance shared by WriteService + SimilarityService.
  // Test mode falls through to FixtureBasedEmbeddingProvider for
  // deterministic CI behavior (no real OpenAI calls); production
  // uses OpenAIEmbeddingProvider per Q-G3.4-β.
  const embeddingProvider: EmbeddingProvider =
    config.embeddingProvider ??
    (process.env.NODE_ENV === "test"
      ? new FixtureBasedEmbeddingProvider()
      : getEmbeddingProvider());
  const writeService = new WriteService(
    authService,
    declarationStore,
    contentStore,
    contentEncryption,
    jwtSecret,
    embeddingProvider,
  );
  const similarityService = new SimilarityService(
    authService,
    embeddingProvider,
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
  // Section 1 Wave 5 ADR-0066 + Wave 6A + Wave 6B — Otzar
  // proposed-pattern from recurring drift. Owner-first self-scoped
  // CRUD over the OtzarProposedPattern model. Constructed BEFORE
  // COEService so it can be passed as the optional 6th arg per
  // Wave 6B priming-hook sidecar (ADR-0067 §4 + §5). Also passed
  // as the optional 5th arg to OtzarService per Wave 6A symbiotic
  // advisory surface (ADR-0066 §3 consumer).
  const otzarProposedPatternService = new OtzarProposedPatternService(
    authService,
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
    // Section 1 Wave 6B (ADR-0067) — accepted-pattern priming hook
    // dependency. When wired, assembleContext returns
    // alignment_patterns sidecar (Wave 6A AcceptedPatternAdvisoryView
    // projection). NO capsule pipeline mutation. NO score-boost
    // (ADR-0022 frozen anchor). NO new audit literal. Owner-scope
    // enforced by-construction via session.entity_id.
    otzarProposedPatternService,
  );
  // arc 2 WSAPI: the Foundation-owned working-set orchestrator, wired with
  // the production SessionContextResolver (authoritative session→wallet
  // resolution) and the COE assembleContext path as its ContextAssembler.
  const workingSetService = new WorkingSetService(
    createSessionContextResolver(authService, prismaWalletContextLookup(prisma)),
    coeService,
  );

  // Section 5 Wave 2 ADR-0060 — Agent Playground v1 sandbox-only
  // operator inspector surface. No live consumers wire into this
  // service; it's read by the three /api/v1/playground/* routes
  // only. The internal FixtureBasedConnectorProvider is instantiated
  // by the service constructor — production providers are
  // unreachable from this path by construction per ADR-0060
  // Sub-decision §3 + Founder Wave 2 hard-wire constraint.
  const playgroundService = new PlaygroundService(authService, coeService);

  // Section 5 Wave 4 ADR-0065 §7 — Agent Playground persistent
  // named scenarios. Owner-first self-scoped CRUD; SAFE projection;
  // ADMIN_ACTION + details.action discriminator audit on persistence
  // boundaries (CREATED / UPDATED / ARCHIVED); no new audit literal.
  // No execution / LLM / multi-agent / external provider / Action
  // creation — Wave 4 is the persistence substrate that future
  // Wave 5+ (candidate generation, outcome comparison, best-path
  // recommender, governed transition) will compose against.
  const playgroundScenarioService = new PlaygroundScenarioService(authService);

  // Section 5 Wave 5 Option A ADR-0072 — Agent Playground
  // deterministic / template-first candidate generation. Computed-
  // on-read; no persistence; no LLM; no Python; no BEAM; no
  // connector invocation; no Action creation; no external provider
  // call. Owner-first + same-org SCENARIO_NOT_FOUND gate is
  // delegated to PlaygroundScenarioService.getScenario via the
  // constructor below so the canonical Wave 4 enumeration-safe 404
  // path is reused verbatim. ADMIN_ACTION + details.action=
  // "PLAYGROUND_CANDIDATES_GENERATED" audit with safe metadata
  // only (no candidate text, no raw scenario JSON).
  const playgroundCandidateService = new PlaygroundCandidateService(
    playgroundScenarioService,
  );

  // Section 5 Wave 6 Option A ADR-0073 — Agent Playground
  // deterministic / template-first outcome-comparison.
  // Computed-on-read; internally invokes
  // PlaygroundCandidateService.generateCandidates per
  // ADR-0073 §10 (NEVER accepts caller-supplied candidate
  // payloads). NO persistence; NO LLM; NO Python; NO BEAM;
  // NO numeric scoring; NO winner selection; NO best-path
  // recommendation; NO Action creation; NO connector
  // invocation; NO external provider call. Owner-first +
  // same-org SCENARIO_NOT_FOUND gate inherited via the Wave
  // 5 candidate-service delegation; the scenario service is
  // also passed so the Wave 6 audit row can carry canonical
  // owner attribution. ADMIN_ACTION + details.action =
  // "PLAYGROUND_OUTCOMES_COMPARED" audit with safe metadata
  // only (no comparison text, no candidate text, no
  // scenario JSON, no scores).
  const playgroundOutcomeComparisonService =
    new PlaygroundOutcomeComparisonService(
      playgroundCandidateService,
      playgroundScenarioService,
    );

  // Section 5 Wave 7 Option A ADR-0074 — Agent Playground
  // deterministic / template-first best-path recommendation.
  // Computed-on-read; internally invokes
  // PlaygroundOutcomeComparisonService.compareOutcomes per
  // ADR-0074 §10 (NEVER accepts caller-supplied comparison
  // or candidate payloads). NO persistence; NO LLM; NO
  // Python; NO BEAM; NO numeric scoring; NO winner-
  // declaration framing; NO Action creation (Wave 8
  // forward-substrate); NO connector invocation. Owner-
  // first + same-org SCENARIO_NOT_FOUND gate inherited via
  // Wave 6 → Wave 5 → Wave 4 delegation; the scenario
  // service is also passed so the Wave 7 audit row carries
  // canonical owner attribution. ADMIN_ACTION +
  // details.action = "PLAYGROUND_BEST_PATH_RECOMMENDED"
  // audit with safe metadata only.
  // ADR-0078 Stage 2 — approved-source projection service for
  // safe `conversation_context_signals[]` sidecars on Wave 7 +
  // Wave 9 responses. Pure projection over already-LIVE safe
  // sources (CORRECTION_SIGNAL per ADR-0055/0058; ACTION_HISTORY
  // per ADR-0057; MANUAL_USER_INPUT per ADR-0065; HIVE_CONTEXT
  // preserved at enum register, zero-output at Stage 2). NO raw
  // transcript ingest; NO Layer 1; NO Layer 4 drilldown; NO new
  // audit literal; NO schema migration; NO Action creation /
  // mutation; NO connector invocation. ADR-0079 §27 Agent
  // Playground use policy enforced by construction.
  const conversationContextSignalProjectionService =
    new ConversationContextSignalProjectionService();

  const playgroundBestPathRecommendationService =
    new PlaygroundBestPathRecommendationService(
      playgroundOutcomeComparisonService,
      playgroundScenarioService,
      conversationContextSignalProjectionService,
    );

  // Section 5 Wave 8 Option A ADR-0075 — Agent Playground
  // deterministic / template-first governed transition.
  // Wave 8 is the FIRST Section 5 wave that creates Section
  // 2 Action rows — via existing createActionForCaller in
  // PROPOSED status per ADR-0057. Wave 8 NEVER executes;
  // Section 2 retains all execution authority via the
  // policy evaluator + dual-control machinery. NO new
  // Prisma model; NO schema migration; NO new audit literal
  // (Wave 8 emits ADMIN_ACTION Playground handoff +
  // Section 2 emits its own ACTION_PROPOSED/APPROVED/
  // REJECTED row). Mandatory caller_confirmation: true +
  // idempotency_key per ADR-0075 §12 + §13. CONSERVATIVE v1
  // mapping: ONLY SEND_INTERNAL_NOTIFICATION ActionType;
  // STATUS_QUO + DO_NOT_PROCEED non-transitionable. NO LLM
  // / Python / BEAM / connector invocation / external
  // provider call / multi-agent runtime / personal-life
  // automation / trust-level delegation at this slice.
  const playgroundGovernedTransitionService =
    new PlaygroundGovernedTransitionService(
      playgroundBestPathRecommendationService,
      playgroundScenarioService,
    );

  // Section 5 Wave 9 Option A ADR-0076 — Agent Playground
  // deterministic multi-agent simulation orchestration.
  // Enumerates (branch_definition × agent_role) combinations
  // (capped at 24 per ADR-0076 §11) and invokes Wave 7
  // recommendBestPath via Promise.allSettled, then projects
  // each Wave 7 result through a closed-vocab agent_role
  // lens. NO Action creation (Wave 8 owns transitions; Wave 9
  // NEVER bypasses Wave 8); NO connector invocation; NO
  // external provider call; NO LLM; NO Python; NO BEAM
  // (ADR-0076 §12 8-question check locks v1 at TypeScript
  // §2.1; Option C BEAM is forward-substrate); NO new Prisma
  // model; NO schema migration; NO new audit literal (Wave 9
  // emits ADMIN_ACTION + details.action =
  // "PLAYGROUND_SIMULATION_EXECUTED" with safe metadata only).
  // Mandatory caller_confirmation: true per ADR-0076 §2.
  // Founder behavioral clarification 2026-05-31 confirmed
  // Wave 9 semantics as deterministic role-perspective
  // simulation before action — NEVER autonomous agent debate.
  const playgroundSimulationService = new PlaygroundSimulationService(
    playgroundBestPathRecommendationService,
    playgroundScenarioService,
    conversationContextSignalProjectionService,
  );

  // Section 6 Wave 2 ADR-0061 — Enterprise Analytics SAFE
  // projection service. No constructor dependencies at v1
  // (the service reads existing Prisma tables directly and
  // emits audit via the shared writeAuditEvent helper).
  const analyticsService = new AnalyticsService();
  // Spread DEFAULT_LIMITS then layer in any overrides whose value is
  // actually defined. `config.rateLimitOverrides` is typed as
  // `Partial<Record<string, RateLimitPolicy>>` so spreading it directly
  // would let an explicit `undefined` entry sneak through and break
  // the `Record<string, RateLimitPolicy>` contract — filter those out.
  const rateLimits: Record<string, RateLimitPolicy> = { ...DEFAULT_LIMITS };
  const overrides = config.rateLimitOverrides ?? {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) rateLimits[key] = value;
  }

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
  // Section 1 Wave 6A — getMyTwin surfaces the caller's OWN
  // ACCEPTED proposed patterns as symbiotic alignment guidance via
  // the 5th OtzarService constructor arg. Wave 6B also wires the
  // same service into COEService above (6th arg) for the
  // assembleContext sidecar.
  const otzarService = new OtzarService(
    authService,
    coeService,
    otzarLLM,
    otzarCache,
    otzarProposedPatternService,
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
  // plugin's own headers layer on top of helmet baseline. The origin is
  // an EXACT-ORIGIN allowlist (CONTROL_TOWER_URL + FOUNDATION_COMMAND_URL +
  // local dev) -- not a wildcard. The origin callback reflects only an
  // allow-listed Origin; a disallowed Origin is never reflected. CORS is
  // browser-origin enforcement only and never replaces the Bearer +
  // can_admin_niov authorization that every Console route enforces.
  const corsAllowedOrigins = buildCorsAllowedOrigins();
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedCorsOrigin(origin ?? undefined, corsAllowedOrigins));
    },
    credentials: true,
    // PUT is required for the notification read/dismiss routes
    // (PUT /api/v1/notifications/:id/read + /dismiss). Without it the
    // browser/Tauri webview CORS preflight omits PUT from
    // Access-Control-Allow-Methods and silently blocks the request, which the
    // client surfaces as a NETWORK_ERROR ("Couldn't update just now") — see
    // Phase 1285-Q. Keep this list a superset of every HTTP verb the API
    // actually serves cross-origin.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  // Gateway hook -- IP whitelist + rate limits run before any
  // route handler.
  app.addHook(
    "onRequest",
    makeGatewayHook({
      store: rateLimitStore,
      limits: rateLimits,
      jwtSecret,
      swarmThresholds: config.swarmThresholdOverrides,
      swarmClusterCount: config.swarmClusterCount,
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
  await registerVoiceRoutes(app, authService);
  await registerCosmpRoutes(
    app,
    negotiateService,
    readService,
    writeService,
    shareService,
    monetizationService,
    similarityService,
  );
  await registerCoeRoutes(app, coeService);
  await registerWorkingSetRoutes(app, workingSetService, authService);
  await registerHiveRoutes(app, hiveService);
  await registerHiveAdminRoutes(app, authService, hiveService);
  await registerPlaygroundRoutes(
    app,
    playgroundService,
    playgroundScenarioService,
    playgroundCandidateService,
    playgroundOutcomeComparisonService,
    playgroundBestPathRecommendationService,
    playgroundGovernedTransitionService,
    playgroundSimulationService,
  );
  await registerAnalyticsRoutes(app, authService, analyticsService);
  await registerWalletRoutes(app, monetizationService, authService);
  await registerComplianceRoutes(app, complianceService);
  await registerFoundationRoutes(
    app,
    foundationAuthorityService,
    foundationProofService,
    foundationEconomicService,
    foundationAmbientDeviceService,
    foundationMarketplaceService,
    foundationObservabilityService,
  );
  await registerDeveloperRoutes(app, authService);
  await registerPlatformRoutes(app, authService);
  await registerOrgRoutes(app, authService);
  await registerEscalationRoutes(app, authService);
  await registerActionsRoutes(app, authService);
  await registerProposedActionRoutes(app, authService);
  await registerNotificationRoutes(app, authService);
  await registerAuditRoutes(app, authService);
  await registerConnectorRoutes(app, authService);
  await registerConnectorOAuthRoutes(app, authService);
  await registerBreakGlassRoutes(app, authService);
  await registerConsoleRoutes(app, authService);
  await registerAuthAdminRoutes(app, authService, jwtSecret);
  await registerRegulatorRoutes(app, authService);
  await registerOtzarRoutes(app, otzarService);
  await registerOtzarProposedPatternRoutes(app, otzarProposedPatternService);
  await registerOtzarObservationRoutes(app, observationService, authService);
  await registerOtzarAuthorityGrantsRoutes(app, authService);
  await registerOtzarCorrectionMemoryRoutes(app, authService);
  await registerOtzarCollaborationRoutes(app, authService);
  await registerOtzarWorkProjectRoutes(app, authService);
  await registerOtzarCollaborationWorkspaceRoutes(app, authService);
  await registerOtzarExternalCollaboratorRoutes(app, authService);
  await registerOtzarMeetingCaptureRoutes(app, authService);
  await registerOtzarVoiceCaptureRoutes(app, authService);
  await registerDMWRegistryRoutes(app, authService);
  await registerCOSMPCapsuleManagementRoutes(app, authService);
  await registerOnboardingRoutes(app, authService);
  await registerComplianceSharingRoutes(app, authService);
  await registerOtzarMyDayRoutes(app, authService);
  await registerOtzarObserveRoutes(app, authService, otzarLLM);
  await registerOtzarCalendarContextRoutes(app, authService);
  await registerOtzarDandelionRoutes(app, authService);
  await registerOtzarAiEmployeesRoutes(app, authService);
  await registerOtzarSettlementRoutes(app, authService);
  await registerOtzarVoiceTtsRoutes(app, authService);
  await registerOtzarBeamStatusRoutes(app, authService);
  await registerConnectorAdapterStatusRoutes(app, authService);
  await registerOrgCollaborationPolicyRoutes(app, authService);
  await registerOtzarVoiceReadyRoutes(app, otzarService);
  await registerConnectorRailsRoutes(app, authService);
  await registerConnectorDataRoutes(app, authService);
  await registerCalendarEventRoutes(app, authService);
  await registerWorkOsAuthorityRoutes(app, authService);
  await registerSystemRuntimeRoutes(app, authService);
  await registerWorkOsLedgerRoutes(app, authService);
  await registerAdminLlmStatusRoutes(app, authService);

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

  // [ADR-0057-RECORD-CAPSULE-HANDLER] install the per-ActionType
  // handler registry with WriteService injected. The registry replaces
  // the module-level default at handlers.ts so the executor routes
  // each ActionType to its real handler (RECORD_CAPSULE via
  // WriteService; PROPOSE_PERMISSION_GRANT via createPermission;
  // SEND_INTERNAL_NOTIFICATION via NotificationService per Wave 11
  // Founder-direction-locked internal-only delivery — no external
  // providers).
  // Section 4 Wave 5 — wire the connector fan-out hook into the
  // NotificationService at boot. The hook looks up matching
  // ConnectorBindings (opt-in via config.notification_classes) and
  // invokes their providers. Production uses
  // getConnectorProviderAsync (FixtureBased for non-OUTBOUND_WEBHOOK
  // types until each future provider lands behind its own QLOCK).
  const notificationService = makeNotificationService({
    connectorFanOut: makeConnectorFanOutHook(),
  });
  setDefaultActionHandlerRegistry(
    makeActionHandlerRegistry({ writeService, notificationService }),
  );

  // ADR-0057 §1 + §11 -- start the Action lifecycle scheduler
  // (admission + executor + expiry sweep). NO-OP under NODE_ENV=test;
  // tests call tickActionScheduler / tickActionExecutor / tickActionExpirySweep
  // directly so cron timers cannot fire mid-test.
  const actionScheduler: ActionSchedulerHandle = startActionScheduler();
  (
    app as unknown as { actionScheduler: ActionSchedulerHandle }
  ).actionScheduler = actionScheduler;

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
  const actionScheduler = (
    app as unknown as { actionScheduler?: ActionSchedulerHandle }
  ).actionScheduler;
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "[server] received shutdown signal");
    try {
      scheduler?.stop();
      actionScheduler?.stop();
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
