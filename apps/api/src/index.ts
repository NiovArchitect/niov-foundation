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

export { MemoryContentStore } from "./content-store.js";
export type { ContentStore } from "./content-store.js";

export { registerCosmpRoutes } from "./routes/cosmp.routes.js";
