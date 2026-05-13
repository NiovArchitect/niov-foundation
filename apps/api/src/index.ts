// FILE: index.ts
// PURPOSE: Barrel export for @niov/api so external callers (mostly
//          tests) can pull the public surface from one path.
// CONNECTS TO: every other file under apps/api/src.

export { buildApp } from "./server.js";
export type { BuildAppConfig } from "./server.js";

// 12C.0 Item 8: shared structured logger for service-class +
// boot-time use. Tests can spy on logger.warn / logger.error to
// assert structured emissions in place of pre-12C.0 console.* spies.
export { logger } from "./logger.js";

export {
  MemoryNonceStore,
  RedisNonceStore,
  makeDefaultNonceStore,
} from "./redis.js";
export type { NonceStore } from "./redis.js";

export { AuthService, narrowOperations } from "./services/auth.service.js";
export type {
  AuthServiceConfig,
  LoginResult,
  LoginFailure,
  ValidateSuccess,
  ValidateFailure,
  SessionTokenPayload,
} from "./services/auth.service.js";

export { requireAuth } from "./middleware/auth.middleware.js";
export { registerAuthRoutes } from "./routes/auth.routes.js";

export {
  NegotiateService,
  scopeMin,
  DECLARATION_TTL_SECONDS,
} from "./services/cosmp/negotiate.service.js";
export type {
  NegotiateSuccess,
  NegotiateFailure,
  AccessDeclarationPayload,
} from "./services/cosmp/negotiate.service.js";

export {
  ReadService,
  computeMetadataFingerprint,
  truncateToTokens,
  SUMMARY_TOKEN_BUDGET,
} from "./services/cosmp/read.service.js";
export type {
  ReadMetadataSuccess,
  ReadContentSuccess,
  ReadFailure,
  SafeCapsuleMetadata,
} from "./services/cosmp/read.service.js";

export {
  WriteService,
  CHARS_PER_TOKEN,
} from "./services/cosmp/write.service.js";
export type {
  CapsuleCreateInput,
  CapsuleUpdateInput,
  WriteSuccess,
  WriteFailure,
} from "./services/cosmp/write.service.js";

export { ShareService } from "./services/cosmp/share.service.js";
export type {
  CapsuleGrant,
  ShareRequest,
  ShareSuccess,
  ShareFailure,
  RevokeSuccess,
  RevokeFailure,
} from "./services/cosmp/share.service.js";

// ───────────────────────────────────────────────────────────────
// gRPC client for the Elixir CosmpRouter routing layer (sub-phase
// 5b-i [BEAM-COSMP-INTEROP-GRPC]).
//
// PURPOSE: gRPC client surface for the 7 patent-canonical COSMP
//   operations per US 12,517,919 + ADR-0032 (BEAM gRPC Interop
//   Architecture). Routes through gRPC to CosmpRouter.Router
//   GenServer at apps/cosmp_router/.
//
// Q-V PARALLEL PATH: Additive to the in-process COSMP services
//   above (NegotiateService, ReadService, WriteService,
//   ShareService). Sub-phase 5b-i does NOT replace existing
//   services; migration deferred to sub-phase 6 or 11+ per Q-V
//   lock.
//
// CONNECTS TO: apps/cosmp_router/priv/protos/cosmp.proto +
//   apps/cosmp_router/lib/cosmp_router/grpc/server.ex.
// ───────────────────────────────────────────────────────────────

export {
  authenticate,
  negotiate,
  read,
  write,
  share,
  revoke,
  audit,
  resetClient,
} from "./services/cosmp-client.js";
export type {
  CapsuleProto,
  CosmpError,
  AuthenticateRpcRequest,
  AuthenticateRpcResponse,
  NegotiateRpcRequest,
  NegotiateRpcResponse,
  ReadRpcRequest,
  ReadRpcResponse,
  WriteRpcRequest,
  WriteRpcResponse,
  ShareRpcRequest,
  ShareRpcResponse,
  RevokeRpcRequest,
  RevokeRpcResponse,
  AuditRpcRequest,
  AuditRpcResponse,
} from "./services/cosmp-client.js";

export {
  COEService,
  TOKENS_PER_CAPSULE_ESTIMATE,
  RELEVANCE_FORGET_FLOOR,
} from "./services/coe/coe.service.js";
export type {
  ContextItem,
  AssembleContextSuccess,
  AssembleContextFailure,
  RecallItem,
  RecallSuccess,
  RecallFailure,
  RecordOutcomeSuccess,
  RecordOutcomeFailure,
} from "./services/coe/coe.service.js";

export {
  combinedScore,
  extractKeywords,
  recencyScore,
  tagOverlapScore,
} from "./services/coe/keywords.js";

export { registerCoeRoutes } from "./routes/coe.routes.js";

export {
  HiveService,
  HIVE_AGGREGATE_TAG_FLOOR,
} from "./services/hive/hive.service.js";
export type {
  MembershipSettings,
  CreateHiveSuccess,
  InviteSuccess,
  RemoveMemberSuccess,
  IntelligenceSuccess,
  AggregateBuildSuccess,
  HiveAggregate,
  HiveFailure,
} from "./services/hive/hive.service.js";

export { registerHiveRoutes } from "./routes/hive.routes.js";

export {
  MonetizationService,
  PRICING_TABLE,
  HOLDER_SHARE,
  NIOV_FEE_SHARE,
  HOLDER_SHARE_FLOOR,
  HOLDER_SHARE_CEILING,
  NIOV_FEE_FLOOR,
  NIOV_FEE_CEILING,
  MAX_RETRIES,
  MAX_HISTORY_PAGE_SIZE,
} from "./services/monetization/monetization.service.js";
export type {
  TriggerResult,
  BalanceResult,
  HistoryResult,
  ToggleResult,
  WalletFailure,
} from "./services/monetization/monetization.service.js";

export { registerWalletRoutes } from "./routes/wallet.routes.js";

export {
  ComplianceService,
  seedComplianceFrameworks,
  SEED_FRAMEWORKS,
} from "./services/compliance/compliance.service.js";
export type {
  ComplianceCheckInput,
  ComplianceCheckResult,
  ComplianceReport,
} from "./services/compliance/compliance.service.js";

export { registerComplianceRoutes } from "./routes/compliance.routes.js";

export {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  makeDefaultRateLimitStore,
} from "./rate-limit.js";
export type { RateLimitStore, RateLimitHit } from "./rate-limit.js";

export {
  DEFAULT_LIMITS,
  detectOperation,
  makeGatewayHook,
} from "./middleware/gateway.middleware.js";
export type { RateLimitPolicy } from "./middleware/gateway.middleware.js";

export { registerHealthRoutes } from "./routes/health.routes.js";
export { registerDeveloperRoutes } from "./routes/developer.routes.js";

// Section 9 governance helpers + seeds.
export {
  getOrgEntityId,
  getOrgSettingsOrDefaults,
  ORG_SETTINGS_DEFAULTS,
  MAX_ORG_HIERARCHY_DEPTH,
} from "./services/governance/org.js";
export type { MergedOrgSettings } from "./services/governance/org.js";

export { createSystemPermission } from "./services/governance/system-permission.js";
export type {
  CreateSystemPermissionInput,
  CreateSystemPermissionResult,
} from "./services/governance/system-permission.js";

export {
  seedMonetizationConfig,
  seedSkillPackages,
  seedAgentTemplates,
  seedIndustryDomainTemplates,
  seedFeedbackLoopHealth,
  seedOtzarEntity,
} from "./services/governance/seeds.js";
export type { SeedOtzarEntityResult } from "./services/governance/seeds.js";

export { validateBootEnvironment } from "./boot-validation.js";

export {
  AnthropicProvider,
  CircuitBreaker,
  FixtureBasedLLMProvider,
  MockLLMProvider,
  OpenAIProvider,
  computeLLMInputHash,
  getLLMProvider,
  withCircuitBreaker,
} from "./services/llm/llm.service.js";
export type {
  CircuitState,
  FixtureFile,
  LLMProvider,
  LLMResult,
} from "./services/llm/llm.service.js";

export {
  FeedbackService,
  FEEDBACK_LOOPS,
  LOOP_EXPECTED_INTERVAL_MINUTES,
  DEMAND_LOW_MAX,
  DEMAND_MEDIUM_MAX,
  propagateCorrection,
} from "./services/feedback/feedback.service.js";
export type {
  Loop1Result,
  Loop2Result,
  Loop3Result,
  Loop4Result,
  Loop5Result,
  Loop6Result,
  Loop7Result,
} from "./services/feedback/feedback.service.js";

export {
  startScheduler,
} from "./services/feedback/scheduler.js";
export type { SchedulerHandle } from "./services/feedback/scheduler.js";

export type { COEFeedbackHook } from "./services/coe/coe.service.js";
export type { ReadFeedbackHook } from "./services/cosmp/read.service.js";

export {
  OtzarService,
} from "./services/otzar/otzar.service.js";
export type {
  ConductSessionInput,
  ConductSessionSuccess,
  CloseConversationInput,
  CloseConversationSuccess,
  OtzarFailure,
} from "./services/otzar/otzar.service.js";

export {
  truncateToTokenBudget,
  TokenBudgetExceededError,
} from "./services/otzar/truncation.js";
export type {
  LayerBundle,
  TokenBudgetExceededDetail,
  TruncateResult,
} from "./services/otzar/truncation.js";

export {
  MemoryKVCache,
  RedisKVCache,
  makeDefaultKVCache,
} from "./services/otzar/cache.js";
export type { KVCache } from "./services/otzar/cache.js";

export {
  getPriming,
  formatPrimingContext,
  PRIMING_TTL_SECONDS,
} from "./services/otzar/priming.js";
export type { PrimingResult } from "./services/otzar/priming.js";

export { registerOtzarRoutes } from "./routes/otzar.routes.js";

export {
  ObservationService,
} from "./services/otzar/observation.service.js";
export type {
  ObserveInput,
  ObserveSuccess,
  ObserveSkipped,
  ObserveFailure,
  CorrectionInput,
  CorrectionSuccess,
  AddDomainTermInput,
  AddDomainTermSuccess,
} from "./services/otzar/observation.service.js";

export { registerOtzarObservationRoutes } from "./routes/otzar-observation.routes.js";

export {
  createTwin,
  findNextApprover,
} from "./services/governance/twin.service.js";
export type {
  CreateTwinInput,
  CreateTwinResult,
} from "./services/governance/twin.service.js";

export {
  executePhase0,
  analyzePhase2,
  executePhase3Invite,
  getPhase4Status,
  reorderPhase4,
} from "./services/governance/dandelion.service.js";
export type {
  Phase0Input,
  Phase0Result,
  Phase2Result,
  Phase3Result,
  Phase4Status,
  PropagationEntry,
} from "./services/governance/dandelion.service.js";

// escalation.service.ts re-exports -- D-2D-D10-2 substrate (CRUD +
// PENDING -> APPROVED/REJECTED/EXPIRED state machine over the
// EscalationRequest model). External consumers (tests, sibling
// packages) reach these via "@niov/api"; intra-apps/api/src callers
// (priming.ts, org.routes.ts) use deep relative imports.
export {
  createEscalationForCaller,
  createGateEscalationForCaller,
  getEscalationForCaller,
  listEscalationsPendingForCaller,
  countEscalationsPending,
  approveEscalationForCaller,
  rejectEscalationForCaller,
  expireEscalation,
  findApprovedDualControlForCaller,
  getOrCreatePendingDualControlForCaller,
} from "./services/governance/escalation.service.js";
export type { CreateEscalationInput } from "./services/governance/escalation.service.js";

export { requireAdminCapability } from "./middleware/admin.middleware.js";
export type { AdminCapability } from "./middleware/admin.middleware.js";

// Sub-box 2 Phase 1 sub-phase D [SEC-PRIVILEGED-REGISTRY]: the LIVE
// privileged-endpoint runtime registry the requireDualControl preHandler
// (sub-phase E) consumes. External consumers (the test tier, sibling
// packages) reach these via "@niov/api"; the middleware uses a deep
// relative import within apps/api/src.
export {
  PRIVILEGED_ENDPOINTS,
  isPrivilegedEndpoint,
  dualControlDescription,
} from "./security/privileged-endpoints.js";
export type {
  PrivilegedEndpoint,
  EscalationActionDescriptor,
} from "./security/privileged-endpoints.js";

// Sub-box 2 Phase 1 sub-phase E [SEC-DUAL-CONTROL-MIDDLEWARE]: the
// dual-control Fastify preHandler + its pure verification transform +
// failure/outcome types. Route bindings land at sub-phases F + G; the
// test tier + sibling packages reach these via "@niov/api".
export {
  requireDualControl,
  evaluateDualControlState,
} from "./middleware/dual-control.middleware.js";
export type {
  DualControlFailure,
  DualControlOutcome,
  DualControlEscalationView,
} from "./middleware/dual-control.middleware.js";

export { registerPlatformRoutes } from "./routes/platform.routes.js";
export { registerOrgRoutes } from "./routes/org.routes.js";
export { registerEscalationRoutes } from "./routes/escalation.routes.js";
export { registerAuthAdminRoutes } from "./routes/auth-admin.routes.js";

export { MemoryContentStore } from "./content-store.js";
export type { ContentStore } from "./content-store.js";

export { registerCosmpRoutes } from "./routes/cosmp.routes.js";
