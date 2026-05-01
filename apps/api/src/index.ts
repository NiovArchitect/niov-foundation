// FILE: index.ts
// PURPOSE: Barrel export for @niov/api so external callers (mostly
//          tests) can pull the public surface from one path.
// CONNECTS TO: every other file under apps/api/src.

export { buildApp } from "./server.js";
export type { BuildAppConfig } from "./server.js";

export {
  MemoryNonceStore,
  RedisNonceStore,
  makeDefaultNonceStore,
} from "./redis.js";
export type { NonceStore } from "./redis.js";

export { AuthService, narrowOperations, SESSION_TTL_MS } from "./services/auth.service.js";
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

export { MemoryContentStore } from "./content-store.js";
export type { ContentStore } from "./content-store.js";

export { registerCosmpRoutes } from "./routes/cosmp.routes.js";
