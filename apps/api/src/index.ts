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

// ADR-0057 Wave 11 — internal-only notification substrate.
// Internal-only governed Otzar-native record; NO external delivery
// (no email / SMS / Slack / push); external providers are future
// optional adapters per the Founder direction recorded at
// docs/research/2026-05-29-send-internal-notification-substrate-research.md.
export { makeNotificationService } from "./services/notification/notification.service.js";
export type {
  CreateInternalNotificationInput,
  CreateInternalNotificationResult,
  CreatedNotificationProjection,
  NotificationService,
} from "./services/notification/notification.service.js";

export { ShareService } from "./services/cosmp/share.service.js";
export type {
  CapsuleGrant,
  ShareRequest,
  ShareSuccess,
  ShareFailure,
  RevokeSuccess,
  RevokeFailure,
} from "./services/cosmp/share.service.js";

// CAR Sub-box 2 sub-phase 3 [CAR-SUB-BOX-2-SERVICES] per ADR-0037
// + Q-RULE-13-INTERNAL-HELPER-TEST-IMPORT LOCKED Option α: narrow
// re-export of the assertJurisdictionalScope pure helper so unit
// tests can follow the established @niov/api workspace import
// convention. The helper is a pure-function discriminated outcome
// (no Prisma access, no I/O); higher COSMP services consume it
// via direct relative import inside apps/api/src.
export { assertJurisdictionalScope } from "./services/cosmp/jurisdiction-enforcement.js";
export type {
  AssertJurisdictionalScopeInput,
  JurisdictionScopeCode,
  JurisdictionScopeResult,
} from "./services/cosmp/jurisdiction-enforcement.js";

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

// ADR-0048 arc 2 (WSAPI): consumer-safe working-set HTTP route. Exposes
// WorkingSetService via projectConsumerView only; emits the AUDIT.2 literals
// (WORKING_SET_BUILT + PERSONALIZATION_DEGRADED) at the route layer.
export { registerWorkingSetRoutes } from "./routes/working-set.routes.js";

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
  GetMyTwinInput,
  MyTwinSkillView,
  MyTwinApproverView,
  MyTwinView,
  MyTwinSuccess,
  RoleScopeIdentity,
  RoleScopeRole,
  RoleScopeSummary,
  RoleScopeAssistanceProfile,
  RoleScopeGovernance,
  RoleScopeContinuity,
  MyTwinRoleScopeProfile,
  ConversationStatus,
  ListConversationsInput,
  ConversationListItem,
  ConversationListSuccess,
  GetConversationDetailInput,
  ConversationDetailSuccess,
  GetConversationCorrectionsInput,
  ConversationCorrectionsSuccess,
} from "./services/otzar/otzar.service.js";

export { projectConversationDetail } from "./services/otzar/conversation-detail.js";
export type {
  ConversationDetailView,
  ConversationDetailInput,
  ConversationDetailAvailability,
} from "./services/otzar/conversation-detail.js";

export {
  projectConversationCorrections,
  CORRECTION_DRIFT_PREVENTION_NOTE,
  CORRECTION_CONTINUITY_NOTE,
} from "./services/otzar/conversation-corrections.js";
export type {
  ConversationCorrectionsView,
  ConversationCorrectionsInput,
} from "./services/otzar/conversation-corrections.js";

export {
  truncateToTokenBudget,
  TokenBudgetExceededError,
} from "./services/otzar/truncation.js";
export type {
  LayerBundle,
  TokenBudgetExceededDetail,
  TruncateResult,
} from "./services/otzar/truncation.js";

export { projectOtzarTransparency } from "./services/otzar/transparency.js";
export type {
  ChatTransparency,
  ContextProvenanceItem,
  CoeTransparencyInput,
} from "./services/otzar/transparency.js";

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
  resolveDualControlTarget,
} from "./services/governance/escalation.service.js";
export type {
  CreateEscalationInput,
  DualControlTargetResolution,
} from "./services/governance/escalation.service.js";

// break-glass.service.ts re-exports -- GOVSEC.5 break-glass (GAP-K1, ADR-0050)
// BG.1 substrate. External consumers (tests, sibling packages) reach these via
// "@niov/api"; the future BG.2 integration (dual-control.middleware.ts / an
// invoke+review route) will consume them via deep relative imports. BG.1 exports
// the substrate API only -- NO middleware/route wiring (no live bypass).
export {
  createBreakGlassGrant,
  validateBreakGlassGrant,
  markBreakGlassUsed,
  expireBreakGlassGrant,
  reviewBreakGlassGrant,
} from "./services/governance/break-glass.service.js";
export type { CreateBreakGlassInput } from "./services/governance/break-glass.service.js";

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

// ADR-0043 G3.4 (Q-G3.4-α + Q-G3.4-ι LOCKS): embedding provider
// substrate exports. Mirrors llm.service.ts re-export pattern.
export {
  FixtureBasedEmbeddingProvider,
  OpenAIEmbeddingProvider,
  computeFixtureVector,
  getEmbeddingProvider,
} from "./services/embedding/embedding.service.js";
export type {
  EmbeddingProvider,
  EmbeddingResult,
} from "./services/embedding/embedding.service.js";

// ADR-0043 G3.6 (Q-G3.6-α α-1): standalone similarity retrieval
// service. RULE 0 SQL-tier filters + HNSW iterative scan posture.
// Companion route POST /api/v1/cosmp/search registered in
// cosmp.routes.ts; production wiring at server.ts.
export { SimilarityService } from "./services/cosmp/similarity.service.js";
export type {
  SimilaritySearchInput,
  SimilarityMatch,
  SimilaritySuccess,
  SimilarityDegraded,
  SimilarityFailure,
} from "./services/cosmp/similarity.service.js";

// ADR-0048 PERS.2 (Q-PERS.2-ε): temporal personalization model.
export { TEMPORAL_POLICIES, getTemporalPolicy } from "./services/personalization/temporal-personalization.js";
export type {
  PermissionTier,
  TemporalClass,
  FreshnessBehavior,
  ConflictUpdatePosture,
  TemporalClassPolicy,
} from "./services/personalization/temporal-personalization.js";

// ADR-0048 PERS.2 (Q-PERS.2-γ): Foundation/COSMP permission-envelope
// resolver. Maps requested context into the 4 permission tiers;
// personal/enterprise discrimination; no cross-wallet / cross-context
// bridging by default. Audit-intent metadata only (no audit literals).
export { resolvePermissionEnvelope } from "./services/personalization/permission-envelope.service.js";
export type {
  ContextDomain,
  EnvelopeReason,
  ScopedGrant,
  EnterpriseEnvelopeDefaults,
  PermissionEnvelopeInput,
  ResolvedContextKey,
  PermissionEnvelope,
} from "./services/personalization/permission-envelope.service.js";

// ADR-0048 PERS.2 (Q-PERS.2-δ + ζ): Foundation/COSMP moment-context
// resolver. Injected now; permissioned-optional location/calendar/
// device/task; per-field TTL/freshness; graceful degradation; safe
// timezone fallback clearly marked. No external provider calls.
export {
  resolveMomentContext,
  SAFE_FALLBACK_TIMEZONE,
} from "./services/personalization/moment-context.service.js";
export type {
  TimezoneSource,
  ResolvedTimezone,
  MomentDegradedReason,
  MomentField,
  MomentCallerInputs,
  MomentSessionView,
  MomentContextInput,
  MomentContextEnvelope,
} from "./services/personalization/moment-context.service.js";

// ADR-0048 PERS.3 (Q-PERS.3-α/β): Foundation/COSMP working-set
// orchestrator. Composes the PERS.2 permission-envelope + moment-context
// resolvers with the governed COE assembleContext path (wrapped via the
// ContextAssembler seam); domain READ from the established wallet_type
// (Q-PERS.3-δ); fail-closed with no personalization leakage; degraded
// metadata + audit-intent only (no new audit literals). Service-level
// only — no route at PERS.3.
export { WorkingSetService } from "./services/personalization/working-set.service.js";
export type {
  SessionContextResolver,
  SessionContextSuccess,
  SessionContextFailure,
  ContextAssembler,
  WorkingSetInput,
  WorkingSetSuccess,
  WorkingSetFailure,
  WorkingSetFailureCode,
  WorkingSetPermissionSummary,
  WorkingSetStats,
} from "./services/personalization/working-set.service.js";

// ADR-0048 PERS.4 (Q-PERS.4): Foundation-tier degraded/uncertainty truth
// contract. Canonical DegradedReason taxonomy + UseDisposition + frozen
// DISCLOSURE_POLICY use-policy table + CONSUMER_OBLIGATIONS + pure
// normalization (buildDegradedContract / mapEnvelopeReason / mapMomentReason
// / disclosurePolicyFor / classifyFailClosed). Carried by the working-set
// response so consumers cannot misuse withheld/fallback/uncertain/blocked
// context. No audit literals; no route.
export {
  DISCLOSURE_POLICY,
  CONSUMER_OBLIGATIONS,
  disclosurePolicyFor,
  classifyFailClosed,
  mapEnvelopeReason,
  mapMomentReason,
  buildDegradedContract,
} from "./services/personalization/degraded-mode-contract.js";
export type {
  DegradedReason,
  UseDisposition,
  DisclosurePolicy,
  DegradedSource,
  DegradedContractEntry,
  FailClosedCategory,
  BuildDegradedContractInput,
} from "./services/personalization/degraded-mode-contract.js";

// ADR-0048 PERS.5a (Q-PERS.5-δ): production SessionContextResolver — the
// authoritative session→{entity_id, wallet_id, wallet_type, entity_type,
// timezone} resolver the WorkingSetService consumes. Pure coordination over
// an injected session validator + WalletContextLookup; prisma-backed lookup
// factory is the storage seam (integration-exercised at PERS.5b). No route.
export {
  createSessionContextResolver,
  prismaWalletContextLookup,
} from "./services/personalization/session-context-resolver.js";
export type {
  SessionValidator,
  WalletContextLookup,
} from "./services/personalization/session-context-resolver.js";

// ADR-0048 PERS.5a (Q-PERS.5-γ): Foundation-owned working-set projections.
// projectAdminView = full machine truth; projectConsumerView = graceful
// subset that strips raw Foundation diagnostics and exposes only coarse
// uncertainty flags (apps compose UX on top). Pure; no I/O.
export {
  projectAdminView,
  projectConsumerView,
} from "./services/personalization/working-set-views.js";
export type {
  AdminWorkingSetView,
  ConsumerWorkingSetView,
} from "./services/personalization/working-set-views.js";

// ADR-0057 §3 + §4 Action policy evaluator — pure deterministic
// discriminated-union evaluator implementing the autonomy ladder.
// No DB reads, no DB writes, no audit emissions, no routes. The forward
// consumer is action.service.ts at create-time (per ADR-0057 §16 step 4)
// and the future scheduler/executor (steps 5-7), neither of which
// exists yet. Action runtime remains NOT live after this export.
export {
  evaluateActionPolicy,
  REASON_CODES,
} from "./services/action/policy-evaluator.js";
export type {
  PolicyEnvelope,
  EvaluateActionPolicyInput,
  ActionDecisionResult,
} from "./services/action/policy-evaluator.js";

// ADR-0057 §3 + §9 + §10 Option E Action create-time service: pure
// helpers (validateCreateActionBody / deriveRiskTier /
// computePolicyEnvelopeHash) consumable from the unit-tier without a
// database, plus the full createActionForCaller service consumed by
// the route handler at routes/actions.routes.ts. Runtime Section 2
// reaches create-time only; no executor / worker / scheduler.
export {
  computePolicyEnvelopeHash,
  createActionForCaller,
  deriveRiskTier,
  validateCreateActionBody,
} from "./services/action/action.service.js";
export type {
  CreateActionInput,
  CreateActionResult,
} from "./services/action/action.service.js";
export { projectActionView } from "./services/action/views.js";
export type { SafeActionView } from "./services/action/views.js";

// ADR-0057 §6 cancel service — non-RUNNING caller-initiated
// cancellation (PROPOSED / APPROVED / SCHEDULED -> CANCELLED) with
// ACTION_CANCELLED emission, plus RUNNING -> CANCELLED via GOVSEC.5
// break-glass grant (ADR-0050; [ADR-0057-RUNNING-CANCEL-BREAK-GLASS]
// Wave 2). The caller must hold an ACTIVE break-glass grant with
// action_type = BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL within its
// window; on success the grant is marked USED + ACTION_CANCELLED
// audit carries grant_id back-reference + the executor's
// abort-registry signal is fired so any in-flight attempt
// short-circuits.
export {
  BREAK_GLASS_ACTION_TYPE_RUNNING_CANCEL,
  cancelActionForCaller,
  validateCancelActionBody,
} from "./services/action/cancel.service.js";
export type {
  CancelActionInput,
  CancelActionResult,
} from "./services/action/cancel.service.js";

// [ADR-0057-RUNNING-CANCEL-BREAK-GLASS] Wave 2 abort-registry.
// Process-local AbortController registry the executor uses to allow
// the cancel service to short-circuit an in-flight attempt. The
// _testRegistrySize helper is exported only for unit-test
// assertions.
export {
  abortAction,
  registerActionAbort,
  releaseActionAbort,
  _testRegistrySize as _testAbortRegistrySize,
} from "./services/action/abort-registry.js";

// ADR-0057 §9 GET viewer service — safe Action detail view with
// ActionAttempt count + last ActionResult.result_summary. Self-scope
// OR can_admin_org-over-same-org authorization.
export { getActionForCaller } from "./services/action/get.service.js";
export type {
  GetActionResult,
  SafeActionDetailView,
} from "./services/action/get.service.js";

// ADR-0057 §9 ActionAttempt detail service — drilldown read surface
// for an individual ActionAttempt + its latest ActionResult.
// Same authorization spine as the GET viewer.
export { getActionAttemptForCaller } from "./services/action/attempt.service.js";
export type {
  GetActionAttemptResult,
  SafeActionAttemptView,
} from "./services/action/attempt.service.js";

// ADR-0057 Wave 10 ActionAttempt list service — paginated read
// surface for all attempts under one parent Action. Same
// authorization spine as the detail service. Standard pagination
// + optional outcome filter.
export {
  DEFAULT_ATTEMPTS_PAGE_SIZE,
  MAX_ATTEMPTS_PAGE_SIZE,
  listActionAttemptsForCaller,
  validateListAttemptsQuery,
} from "./services/action/attempt-list.service.js";
export type {
  ListActionAttemptsResult,
  ListActionAttemptsView,
  ListAttemptsQuery,
  NormalizedListAttemptsFilters,
} from "./services/action/attempt-list.service.js";

// ADR-0057 §9 list service — self-scope by default; ?org_scope=true
// requires can_admin_org. Standard pagination + optional filters.
export {
  DEFAULT_ACTIONS_PAGE_SIZE,
  MAX_ACTIONS_PAGE_SIZE,
  listActionsForCaller,
  validateListActionsQuery,
} from "./services/action/list.service.js";
export type {
  ListActionsQuery,
  ListActionsResult,
  ListActionsView,
  NormalizedListFilters,
} from "./services/action/list.service.js";

// ADR-0057 §1 lifecycle state machine — pure transition guards.
// No DB, no I/O, no audit. Used by lifecycle.service.ts +
// scheduler.ts + executor.ts to gate every status update.
export {
  ACTION_INVALID_TRANSITION,
  ActionInvalidTransitionError,
  assertActionTransition,
  canTransitionAction,
  isTerminalActionStatus,
} from "./services/action/state-machine.js";

// ADR-0057 §11 per-ActionType handler registry. As of the
// [ADR-0057-RECORD-CAPSULE-HANDLER] wave, RECORD_CAPSULE is a REAL
// handler wired to WriteService.createCapsuleForActionRunner;
// SEND_INTERNAL_NOTIFICATION and PROPOSE_PERMISSION_GRANT remain
// stubs. The default registry (stub-only) is installed at module
// load; server.ts replaces it at boot via
// setDefaultActionHandlerRegistry to inject WriteService.
export {
  TEST_MARKER_FORCE_FAILURE,
  TEST_MARKER_FORCE_TIMEOUT,
  executeActionHandler,
  makeActionHandlerRegistry,
  setDefaultActionHandlerRegistry,
} from "./services/action/handlers.js";
export type {
  ActionHandlerFn,
  ActionHandlerOutcome,
  ActionHandlerRegistry,
  ActionHandlerRegistryDeps,
  ActionHandlerResult,
  HandlerActionInput,
} from "./services/action/handlers.js";

// ADR-0057 per-ActionType create-time payload validators. Runs at
// validateCreateActionBody after the route-shape check. Rejects
// malformed payloads with 422 INVALID_FIELD at create-time so no
// malformed Action enters the executor queue.
export {
  RECORD_CAPSULE_MAX_CONTENT_BYTES,
  validatePayloadForActionType,
  validateProposePermissionGrantPayload,
  validateRecordCapsulePayload,
  validateStubPayload,
} from "./services/action/action-payload-validators.js";
export type {
  ActionPayloadValidationResult,
  ProposePermissionGrantPayload,
  RecordCapsulePayload,
} from "./services/action/action-payload-validators.js";

// ADR-0057 §10 + §11 lifecycle helpers — transition + audit
// composables shared by scheduler.ts + executor.ts. Service-tier
// RETRY_BUDGET + ATTEMPT_TIMEOUT_MS_DEFAULT per LOCK-GAP-1 +
// LOCK-GAP-2.
export {
  ATTEMPT_TIMEOUT_MS_DEFAULT,
  LIFECYCLE_FIELD_MAX_CHARS,
  RETRY_BUDGET,
  clampLifecycleField,
  createActionAttempt,
  createActionResult,
  emitLifecycleAudit,
  terminalizeActionAttempt,
  transitionActionStatus,
} from "./services/action/lifecycle.service.js";
export type {
  ActionLifecycleAuditEventType,
  CreatedActionAttempt,
  LifecycleAuditDetails,
} from "./services/action/lifecycle.service.js";

// ADR-0057 §1 + §11 worker tick — claims SCHEDULED via SELECT
// FOR UPDATE SKIP LOCKED, dispatches stub handlers, terminalizes
// per retry budget.
export {
  EXECUTOR_DEFAULT_BATCH,
  EXECUTOR_TIMEOUT_ERROR_CLASS,
  tickActionExecutor,
} from "./services/action/executor.js";
export type {
  TickActionExecutorOptions,
  TickActionExecutorResult,
} from "./services/action/executor.js";

// ADR-0057 §1 + §11 scheduler — admission tick + expiry sweep +
// cron lifecycle (NO-OP under NODE_ENV=test). The cron task drives
// tickActionExecutor on a schedule; tests call the ticks directly.
export {
  SCHEDULER_DEFAULT_BATCH,
  startActionScheduler,
  stopActionScheduler,
  tickActionExpirySweep,
  tickActionScheduler,
} from "./services/action/scheduler.js";
export type {
  ActionSchedulerHandle,
  TickActionExpirySweepResult,
  TickActionSchedulerResult,
  TickSchedulerOptions,
} from "./services/action/scheduler.js";
