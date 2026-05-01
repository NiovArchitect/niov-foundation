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
  getWalletByEntityId,
  getWalletById,
  updateWalletSettings,
  incrementCapsuleCount,
  decrementCapsuleCount,
  defaultWalletTypeFor,
  defaultNiovAccessFor,
} from "./queries/wallet.js";

export type { WalletSettingsUpdate } from "./queries/wallet.js";

export type {
  Entity,
  AuditLog,
  EntityStatus,
  EntityType,
  Wallet,
  WalletType,
  Prisma,
} from "@prisma/client";
