// FILE: index.ts
// PURPOSE: The single entry point for the @niov/database package. Importers
//          should reach in here, not into deep file paths, so we can move
//          internals around later without breaking callers.
// CONNECTS TO: Every consumer of the database -- future Fastify routes,
//              the COSMP engine, tests, and admin tools.

export { prisma } from "./client.js";
export { withAudit, writeAudit } from "./audit.js";
export type { AuditEntry, PrismaTx } from "./audit.js";

export {
  createEntity,
  getEntityById,
  getEntityByEmail,
  updateEntityStatus,
  incrementFailedAuth,
  resetFailedAuth,
  listEntities,
  MIN_CLEARANCE,
  MAX_CLEARANCE,
} from "./queries/entity.js";

export type {
  CreateEntityInput,
  ListEntitiesFilters,
} from "./queries/entity.js";

export {
  createWallet,
  createWalletInTx,
  writeWalletCreateAudit,
  getWalletByEntityId,
  getWalletById,
  updateWalletSettings,
  incrementCapsuleCount,
  decrementCapsuleCount,
  defaultWalletTypeFor,
  defaultNiovAccessFor,
} from "./queries/wallet.js";

export type { WalletSettingsUpdate } from "./queries/wallet.js";

export {
  createCapsule,
  getCapsuleMetadata,
  getCapsuleWithContent,
  searchByTopicTags,
  updateRelevanceScore,
  updateStorageTier,
  incrementAccessCount,
  softDeleteCapsule,
  MIN_CAPSULE_CLEARANCE,
  MAX_CAPSULE_CLEARANCE,
} from "./queries/capsule.js";

export type {
  CreateCapsuleInput,
  CapsuleMetadata,
  SearchByTopicTagsInput,
} from "./queries/capsule.js";

export {
  createPermission,
  createPermissionBridge,
  checkPermission,
  revokePermission,
  revokeBridge,
  listPermissionsGranted,
  listPermissionsReceived,
  expireOldPermissions,
} from "./queries/permission.js";

export type { CreatePermissionInput } from "./queries/permission.js";

export {
  writeAuditEvent,
  queryAuditEvents,
  verifyAuditChain,
  getLatestEventHash,
  applyAuditEventTriggers,
  MAX_AUDIT_EVENTS_PAGE_SIZE,
  AUDIT_EVENT_TYPE_VALUES,
  isKnownAuditEventType,
  SYSTEM_PRINCIPALS,
  // Sub-phase 5b-ii [BEAM-COSMP-INTEROP-PERSISTENCE] per ADR-0033
  // §Decision 4: cross-language byte-equivalence primitives the
  // scripts/generate-canonical-fixtures.ts fixture generator imports
  // for the Elixir register's port at CosmpRouter.Audit.
  canonicalRecord,
  canonicalJson,
} from "./queries/audit.js";

export type {
  AuditEventType,
  WriteAuditEventInput,
  QueryAuditEventsFilters,
  QueryAuditEventsResult,
  VerifyAuditChainResult,
  SystemPrincipal,
} from "./queries/audit.js";

export {
  createTAR,
  createTARInTx,
  writeTARCreateAudit,
  getTARByEntityId,
  checkCapability,
  updateTARPermissions,
  invalidateEntitySessions,
  computeTARHash,
  defaultCeilingFor,
  MIN_TAR_CEILING,
  MAX_TAR_CEILING,
} from "./queries/tar.js";

export type {
  TARCapability,
  TARPermissionsUpdate,
  TARHashableFields,
} from "./queries/tar.js";

export {
  createSession,
  getSessionById,
  markSessionIdleExpired,
  terminateSession,
  touchSessionActivity,
  expireOldSessions,
} from "./queries/session.js";

export type { CreateSessionInput } from "./queries/session.js";

export type {
  Entity,
  AuditLog,
  AuditEvent,
  AuditOutcome,
  EntityStatus,
  EntityType,
  Wallet,
  WalletType,
  MemoryCapsule,
  CapsuleType,
  DecayType,
  StorageTier,
  Permission,
  AccessScope,
  DurationType,
  PermissionStatus,
  TokenAttributeRepository,
  MonetizationRole,
  TARStatus,
  Session,
  SessionStatus,
  Hive,
  HiveType,
  HiveStatus,
  HiveMembership,
  MembershipStatus,
  MonetizationEvent,
  MonetizationStatus,
  WalletBalance,
  ComplianceFramework,
  EntityComplianceProfile,
  ApiKey,
  // Section 9 governance tables (Schema Part A).
  EntityMembership,
  EntityProfile,
  OrgSettings,
  TwinConfig,
  SkillPackage,
  TwinSkill,
  MonetizationConfig,
  Workflow,
  OnboardingSession,
  DeviceToken,
  IntegrationCredential,
  // Section 9 domain-intelligence tables (Schema Part B).
  DomainVocabulary,
  ExternalEntity,
  IntelligencePattern,
  CompoundingMetrics,
  // Section 10 feedback-loop tables.
  FeedbackConfig,
  PermissionSuggestion,
  MonetizationSuggestion,
  FeedbackLoopHealth,
  // Section 11A tables.
  OtzarConversation,
  AgentTemplate,
  // Section 12.5 Sub-box 1 / D-2D-D10 tables.
  EscalationRequest,
  EscalationStatus,
  EscalationType,
  // CAR Sub-box 3 — REGULATOR + Lawful-Basis (ADR-0036) tables.
  LawfulBasis,
  LawfulBasisType,
  // GOVSEC.5 break-glass (ADR-0050) BG.1 substrate table.
  BreakGlassGrant,
  BreakGlassStatus,
  // Section 5 Wave 4 — Agent Playground persistent named scenarios
  // (ADR-0065 §7 Wave 4).
  PlaygroundScenario,
  Prisma,
} from "@prisma/client";

// CAR Sub-box 3 sub-phase 3 [SUB-BOX-3-SERVICES] per ADR-0036:
// LawfulBasis canonical hash + create + audit_id backfill + validity
// helpers. See packages/database/src/queries/lawful-basis.ts.
export {
  canonicalLawfulBasisContent,
  computeLawfulBasisChainHash,
  createLawfulBasis,
  createLawfulBasisInTx,
  linkLawfulBasisToAuditEventInTx,
  isLawfulBasisActive,
  getLawfulBasisById,
  // CAR Sub-box 3 sub-phase 6 [SUB-BOX-3-COSMP-ENFORCEMENT] per
  // ADR-0036 Sub-decision 5 + 6: 9-condition active-grant resolver
  // for REGULATOR-actor COSMP READ / SHARE / REVOKE enforcement.
  // 3 indexed point-lookups; substrate-coherent at high-concurrency
  // register substantively per Whole-COSMP scalability discipline.
  getActiveLawfulBasisForRegulator,
} from "./queries/lawful-basis.js";

export type {
  LawfulBasisHashableFields,
  CreateLawfulBasisInput,
  ActiveLawfulBasisResult,
} from "./queries/lawful-basis.js";

// CAR Sub-box 3 sub-phase 3 [SUB-BOX-3-SERVICES] per ADR-0036:
// REGULATOR principal validation + lookup. See packages/database/
// src/queries/regulator.ts. REGULATOR is DISTINCT from GOVERNMENT
// per ADR-0036 Sub-decision 1 (CAR §2.1 correctness-hazard guard).
export {
  validateRegulatorAccess,
  getRegulatorEntityById,
} from "./queries/regulator.js";

export type {
  EntityWithTar,
  RegulatorAccessRequest,
  RegulatorValidationResult,
} from "./queries/regulator.js";

// Section 4 Wave 2 — ConnectorBinding query helpers (per-org
// connector enablement substrate; NEVER stores raw secret material).
export {
  createConnectorBinding,
  getConnectorBindingForOrg,
  listConnectorBindingsForOrg,
  softDeleteConnectorBindingForOrg,
  updateConnectorBindingForOrg,
} from "./queries/connector-binding.js";

export type { CreateConnectorBindingInput } from "./queries/connector-binding.js";
