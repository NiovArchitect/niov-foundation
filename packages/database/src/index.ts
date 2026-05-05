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
} from "./queries/audit.js";

export type {
  AuditEventType,
  WriteAuditEventInput,
  QueryAuditEventsFilters,
  QueryAuditEventsResult,
  VerifyAuditChainResult,
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
  terminateSession,
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
  Prisma,
} from "@prisma/client";
