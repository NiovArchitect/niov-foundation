// FILE: wallet.ts
// PURPOSE: Read and write operations for the Wallet table -- the
//          Decentralized Memory Wallet (DMW) that every entity gets.
//          Every function audits its action so Rule 4 holds.
// CONNECTS TO: The Wallet and Entity tables in schema.prisma, the audit
//              helper in /audit.ts, the Prisma client in /client.ts, and
//              the createEntity flow which auto-creates a wallet inside
//              the same transaction.

import { randomUUID } from "node:crypto";
import type {
  EntityType,
  Prisma,
  Wallet,
  WalletType,
} from "@prisma/client";
import { withAudit, writeAudit } from "../audit.js";
import { prisma } from "../client.js";

// WHAT: The shape of optional settings updateWalletSettings can change.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: We only let callers update a small, known set of fields. Things
//      like total_capsule_count have their own dedicated functions to
//      keep accidental drift impossible.
export interface WalletSettingsUpdate {
  niov_can_access_contents?: boolean;
  monetization_enabled?: boolean;
}

// WHAT: Pick the right wallet type for an entity when the caller did not
//        pass one explicitly.
// INPUT: The EntityType being created (PERSON, COMPANY, AI_AGENT, etc).
// OUTPUT: A WalletType value that matches the entity's nature.
// WHY: createEntity auto-creates a wallet, but the caller does not always
//      tell us what kind. Mapping here keeps that decision in one place,
//      and Rule 0 (maximum human control by default) is why non-human
//      entities default to ENTERPRISE rather than PERSONAL.
export function defaultWalletTypeFor(entityType: EntityType): WalletType {
  switch (entityType) {
    case "PERSON":
      return "PERSONAL";
    case "DEVICE":
      return "DEVICE";
    case "COMPANY":
    case "AI_AGENT":
    case "APPLICATION":
    case "GOVERNMENT":
      return "ENTERPRISE";
  }
}

// WHAT: Decide whether NIOV can hold the actual contents of a wallet.
// INPUT: The WalletType.
// OUTPUT: A boolean -- true means NIOV may store the capsule payloads,
//         false means NIOV only sees metadata while content stays on the
//         wallet owner's own infrastructure.
// WHY: PERSONAL wallets opted in by an individual human get true. Every
//      other type defaults to false because Rule 0 says we default to
//      maximum human control on every edge case.
export function defaultNiovAccessFor(walletType: WalletType): boolean {
  return walletType === "PERSONAL";
}

// WHAT: Insert a Wallet row using an open transaction handle.
// INPUT: A transaction handle, the entity_id to attach the wallet to,
//        and the wallet_type.
// OUTPUT: The freshly created Wallet record.
// WHY: createEntity needs to create both the entity and its wallet in
//      one atomic transaction. Exposing this transaction-aware flavor
//      lets entity.ts call it without opening a second transaction.
export async function createWalletInTx(
  tx: Prisma.TransactionClient,
  params: { entity_id: string; wallet_type: WalletType; wallet_id?: string },
): Promise<Wallet> {
  const wallet_id = params.wallet_id ?? randomUUID();
  return tx.wallet.create({
    data: {
      wallet_id,
      entity_id: params.entity_id,
      wallet_type: params.wallet_type,
      niov_can_access_contents: defaultNiovAccessFor(params.wallet_type),
    },
  });
}

// WHAT: Create a new wallet for an existing entity, plus the audit row.
// INPUT: The entity_id the wallet is for, the WalletType, and an optional
//        actor_id for the audit row.
// OUTPUT: The created Wallet record.
// WHY: Most wallets are auto-created inside createEntity. This standalone
//      function is for admin tools and migrations that need to attach a
//      wallet to an entity that does not have one yet. The unique
//      constraint on entity_id makes "two wallets per entity" impossible.
export async function createWallet(
  entityId: string,
  walletType: WalletType,
  actorId: string | null = null,
): Promise<Wallet> {
  const newWalletId = randomUUID();

  return withAudit(
    {
      action: "WALLET_CREATE",
      entity_id: entityId,
      actor_id: actorId,
      meta: {
        wallet_id: newWalletId,
        wallet_type: walletType,
      },
    },
    async (tx) => {
      return createWalletInTx(tx, {
        entity_id: entityId,
        wallet_type: walletType,
        wallet_id: newWalletId,
      });
    },
  );
}

// WHAT: Look up the single wallet that belongs to one entity.
// INPUT: The entity_id and an optional actor_id for the audit row.
// OUTPUT: The Wallet record if found, otherwise null.
// WHY: Most wallet operations start from "I know who the entity is, give
//      me their wallet". Audited because wallet lookups reveal which
//      entities are storing intelligence in the system.
export async function getWalletByEntityId(
  entityId: string,
  actorId: string | null = null,
): Promise<Wallet | null> {
  return withAudit(
    {
      action: "WALLET_READ_BY_ENTITY_ID",
      entity_id: entityId,
      actor_id: actorId,
      meta: {},
    },
    async (tx) => {
      return tx.wallet.findUnique({
        where: { entity_id: entityId },
      });
    },
  );
}

// WHAT: Look up a wallet by its own primary key.
// INPUT: The wallet_id and an optional actor_id for the audit row.
// OUTPUT: The Wallet record if found, otherwise null.
// WHY: Some flows (Memory Capsule writes, monetization) carry the
//      wallet_id around and need a direct lookup. We perform the
//      lookup and the audit insert in one transaction so the audit
//      row can carry the wallet's entity_id (resolved from the
//      lookup result), keeping every audit row tied to its entity.
export async function getWalletById(
  walletId: string,
  actorId: string | null = null,
): Promise<Wallet | null> {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { wallet_id: walletId },
    });
    await writeAudit(tx, {
      action: "WALLET_READ_BY_ID",
      entity_id: wallet?.entity_id ?? null,
      actor_id: actorId,
      meta: { wallet_id: walletId, found: wallet !== null },
    });
    return wallet;
  });
}

// WHAT: Update one or more configurable wallet settings.
// INPUT: The wallet_id, an object of fields to change, and an optional
//        actor_id for the audit row.
// OUTPUT: The updated Wallet record.
// WHY: Settings like monetization_enabled and niov_can_access_contents
//      can change after creation. Counts and timestamps are NOT settings
//      and have their own functions so we never mutate them by accident.
//      Update and audit happen in one transaction so the audit row can
//      carry the wallet's entity_id, captured from the update result.
export async function updateWalletSettings(
  walletId: string,
  settings: WalletSettingsUpdate,
  actorId: string | null = null,
): Promise<Wallet> {
  const data: Prisma.WalletUpdateInput = {};
  if (settings.niov_can_access_contents !== undefined) {
    data.niov_can_access_contents = settings.niov_can_access_contents;
  }
  if (settings.monetization_enabled !== undefined) {
    data.monetization_enabled = settings.monetization_enabled;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { wallet_id: walletId },
      data,
    });
    await writeAudit(tx, {
      action: "WALLET_SETTINGS_UPDATE",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: {
        wallet_id: walletId,
        ...settings,
      },
    });
    return updated;
  });
}

// WHAT: Add 1 to a wallet's total_capsule_count.
// INPUT: The wallet_id and an optional actor_id for the audit row.
// OUTPUT: The updated Wallet record.
// WHY: Every time a Memory Capsule is added to a wallet we bump this
//      counter so the dashboard can show capsule counts without a slow
//      count(*) query. Audited so we can reconstruct ownership history.
//      The audit row carries entity_id, captured from the update result.
export async function incrementCapsuleCount(
  walletId: string,
  actorId: string | null = null,
): Promise<Wallet> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { wallet_id: walletId },
      data: { total_capsule_count: { increment: 1 } },
    });
    await writeAudit(tx, {
      action: "WALLET_CAPSULE_COUNT_INCREMENT",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { wallet_id: walletId },
    });
    return updated;
  });
}

// WHAT: Subtract 1 from a wallet's total_capsule_count, but never below 0.
// INPUT: The wallet_id and an optional actor_id for the audit row.
// OUTPUT: The updated Wallet record.
// WHY: When a capsule is soft-deleted from a wallet we drop the counter.
//      We refuse to go negative because a negative count would be a sign
//      that something else is broken upstream -- better to throw loudly
//      than silently lie about how much a wallet holds. The audit row
//      carries entity_id, captured from the wallet inside the same
//      transaction.
export async function decrementCapsuleCount(
  walletId: string,
  actorId: string | null = null,
): Promise<Wallet> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.wallet.findUnique({
      where: { wallet_id: walletId },
    });
    if (current === null) {
      throw new Error(`Wallet ${walletId} not found`);
    }
    if (current.total_capsule_count <= 0) {
      throw new Error(
        `Wallet ${walletId} capsule count is already 0; refusing to go negative`,
      );
    }
    const updated = await tx.wallet.update({
      where: { wallet_id: walletId },
      data: { total_capsule_count: { decrement: 1 } },
    });
    await writeAudit(tx, {
      action: "WALLET_CAPSULE_COUNT_DECREMENT",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { wallet_id: walletId },
    });
    return updated;
  });
}

// WHAT: Write a WALLET_CREATE audit row inside an existing transaction.
// INPUT: A transaction handle plus the wallet record and actor info.
// OUTPUT: A promise that resolves once the row is written.
// WHY: createEntity creates both the entity and the wallet in one atomic
//      transaction and needs to emit a WALLET_CREATE audit row alongside
//      the ENTITY_CREATE one. Exposing this helper keeps that detail
//      out of entity.ts.
export async function writeWalletCreateAudit(
  tx: Prisma.TransactionClient,
  wallet: Wallet,
  actorId: string | null,
): Promise<void> {
  await writeAudit(tx, {
    action: "WALLET_CREATE",
    entity_id: wallet.entity_id,
    actor_id: actorId,
    meta: {
      wallet_id: wallet.wallet_id,
      wallet_type: wallet.wallet_type,
    },
  });
}

export { prisma } from "../client.js";
