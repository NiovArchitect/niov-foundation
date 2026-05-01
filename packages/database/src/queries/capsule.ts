// FILE: capsule.ts
// PURPOSE: Read and write operations for the MemoryCapsule table.
//          Every function audits its action so Rule 4 holds, and the
//          FOUNDATIONAL decay_type rule (must live in HOT storage) is
//          enforced both at create time and at tier-update time.
// CONNECTS TO: The MemoryCapsule, Wallet, Entity, and AuditLog tables;
//              the audit helper in /audit.ts; the shared Prisma client
//              in /client.ts. Higher layers (COE, Hive Intelligence)
//              call these functions instead of touching the DB directly.

import { randomUUID } from "node:crypto";
import type {
  CapsuleType,
  DecayType,
  MemoryCapsule,
  Prisma,
  StorageTier,
} from "@prisma/client";
import { withAudit, writeAudit } from "../audit.js";
import { prisma } from "../client.js";

// WHAT: Lowest valid clearance level for capsules (public information).
// INPUT: None.
// OUTPUT: The number 0.
// WHY: Same constant rule as Entity. Putting it next to its validator
//      keeps the rule and its check in one place.
export const MIN_CAPSULE_CLEARANCE = 0;

// WHAT: Highest valid clearance level for capsules (top secret).
// INPUT: None.
// OUTPUT: The number 6.
// WHY: Mirrors Entity's MAX_CLEARANCE. Capsules cannot be more
//      restrictive than the maximum entity-level clearance ladder.
export const MAX_CAPSULE_CLEARANCE = 6;

// WHAT: Throw if a numeric score is not in the closed range 0.0 to 1.0.
// INPUT: The candidate value plus the human-readable field name.
// OUTPUT: Returns silently if valid, throws an Error if not.
// WHY: relevance_score and feedback_loop_score are normalized scores.
//      Bad values would corrupt the COE's ranking math, so we reject
//      them at the gate.
function assertScoreRange(value: number, fieldName: string): void {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${fieldName} must be a number between 0.0 and 1.0 (got ${value})`);
  }
}

// WHAT: Throw if a clearance level is outside 0..6.
// INPUT: The candidate clearance level.
// OUTPUT: Returns silently if valid, throws if not.
// WHY: Same defensive check Entity uses. Rule 0 -- default to maximum
//      human control on every edge case.
function assertCapsuleClearance(level: number): void {
  if (
    !Number.isInteger(level) ||
    level < MIN_CAPSULE_CLEARANCE ||
    level > MAX_CAPSULE_CLEARANCE
  ) {
    throw new Error(
      `clearance_required must be an integer between ${MIN_CAPSULE_CLEARANCE} and ${MAX_CAPSULE_CLEARANCE} (got ${level})`,
    );
  }
}

// WHAT: The shape of the data createCapsule expects.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Required fields name what the caller MUST supply; optional
//      fields name what we will default if omitted.
export interface CreateCapsuleInput {
  wallet_id: string;
  entity_id: string;
  capsule_type: CapsuleType;
  topic_tags: string[];
  decay_type: DecayType;
  payload_summary: string;
  payload_size_tokens: number;
  storage_location: string;
  content_hash: string;

  version?: number;
  relevance_score?: number;
  decay_rate?: number;
  feedback_loop_score?: number;
  storage_tier?: StorageTier;
  clearance_required?: number;
  access_count?: number;
  connected_capsule_ids?: string[];
  connected_entity_ids?: string[];
  monetization_enabled?: boolean;
  monetization_category?: string | null;
  expires_at?: Date | null;
  ai_access_blocked?: boolean;

  actor_id?: string | null;
}

// WHAT: A capsule record with the storage_location field stripped out.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: getCapsuleMetadata callers should be able to make relevance
//      decisions without ever seeing where the encrypted payload lives.
export type CapsuleMetadata = Omit<MemoryCapsule, "storage_location">;

// WHAT: The shape of the topic-tag search filters.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type.
// WHY: Forces callers to think about the wallet they are searching in
//      and the relevance floor they want.
export interface SearchByTopicTagsInput {
  walletId: string;
  tags: string[];
  minRelevanceScore?: number;
  actorId?: string | null;
}

// WHAT: Insert a brand-new MemoryCapsule and write the matching audit row.
// INPUT: A CreateCapsuleInput describing every field the caller wants on
//        the new capsule.
// OUTPUT: The freshly created MemoryCapsule record.
// WHY: This is the front door for putting any intelligence into a wallet.
//      We force HOT storage on FOUNDATIONAL capsules here so the special
//      rule cannot be sidestepped at create time. Wrapped in withAudit
//      so creation cannot succeed without its audit row.
export async function createCapsule(
  input: CreateCapsuleInput,
): Promise<MemoryCapsule> {
  const relevance = input.relevance_score ?? 1.0;
  const feedback = input.feedback_loop_score ?? 0.0;
  const clearance = input.clearance_required ?? 0;

  assertScoreRange(relevance, "relevance_score");
  assertScoreRange(feedback, "feedback_loop_score");
  assertCapsuleClearance(clearance);

  // FOUNDATIONAL decay capsules MUST live in HOT storage. We override
  // any caller-supplied tier rather than throw because the spec says
  // FOUNDATIONAL is "ALWAYS in HOT" -- the right behavior is to honor
  // that rule silently rather than reject the create.
  const storageTier: StorageTier =
    input.decay_type === "FOUNDATIONAL"
      ? "HOT"
      : (input.storage_tier ?? "WARM");

  const newCapsuleId = randomUUID();

  return withAudit(
    {
      action: "CAPSULE_CREATE",
      entity_id: input.entity_id,
      actor_id: input.actor_id ?? null,
      meta: {
        capsule_id: newCapsuleId,
        wallet_id: input.wallet_id,
        capsule_type: input.capsule_type,
        decay_type: input.decay_type,
        storage_tier: storageTier,
      },
    },
    async (tx) => {
      return tx.memoryCapsule.create({
        data: {
          capsule_id: newCapsuleId,
          wallet_id: input.wallet_id,
          entity_id: input.entity_id,
          version: input.version ?? 1,
          capsule_type: input.capsule_type,
          topic_tags: input.topic_tags,
          relevance_score: relevance,
          decay_type: input.decay_type,
          decay_rate: input.decay_rate ?? 0.01,
          feedback_loop_score: feedback,
          payload_summary: input.payload_summary,
          payload_size_tokens: input.payload_size_tokens,
          storage_location: input.storage_location,
          storage_tier: storageTier,
          clearance_required: clearance,
          access_count: input.access_count ?? 0,
          content_hash: input.content_hash,
          connected_capsule_ids: input.connected_capsule_ids ?? [],
          connected_entity_ids: input.connected_entity_ids ?? [],
          monetization_enabled: input.monetization_enabled ?? false,
          monetization_category: input.monetization_category ?? null,
          expires_at: input.expires_at ?? null,
          ai_access_blocked: input.ai_access_blocked ?? false,
        },
      });
    },
  );
}

// WHAT: Fetch a capsule's metadata WITHOUT exposing its storage_location.
// INPUT: The capsule_id and an optional actor_id for the audit row.
// OUTPUT: A CapsuleMetadata (no storage_location) if found and not
//         soft-deleted, otherwise null.
// WHY: Most relevance / scoring decisions only need metadata. Hiding
//      storage_location at the SQL layer means a leaked metadata read
//      cannot reveal where the encrypted content actually lives.
export async function getCapsuleMetadata(
  capsuleId: string,
  actorId: string | null = null,
): Promise<CapsuleMetadata | null> {
  return prisma.$transaction(async (tx) => {
    const capsule = await tx.memoryCapsule.findFirst({
      where: { capsule_id: capsuleId, deleted_at: null },
      select: {
        capsule_id: true,
        wallet_id: true,
        entity_id: true,
        version: true,
        capsule_type: true,
        topic_tags: true,
        relevance_score: true,
        decay_type: true,
        decay_rate: true,
        feedback_loop_score: true,
        payload_summary: true,
        payload_size_tokens: true,
        storage_tier: true,
        clearance_required: true,
        access_count: true,
        content_hash: true,
        ai_access_blocked: true,
        connected_capsule_ids: true,
        connected_entity_ids: true,
        monetization_enabled: true,
        monetization_category: true,
        created_at: true,
        last_accessed_at: true,
        last_updated_at: true,
        expires_at: true,
        deleted_at: true,
      },
    });

    await writeAudit(tx, {
      action: "CAPSULE_READ_METADATA",
      entity_id: capsule?.entity_id ?? null,
      actor_id: actorId,
      meta: { capsule_id: capsuleId, found: capsule !== null },
    });

    return capsule;
  });
}

// WHAT: Fetch a capsule's full row including storage_location.
// INPUT: The capsule_id and an optional actor_id for the audit row.
// OUTPUT: The full MemoryCapsule record if found and not soft-deleted,
//         otherwise null.
// WHY: Some flows (decryption, tamper checks) need the storage_location
//      to fetch the actual encrypted payload from Supabase Storage.
//      The actual byte-fetch from Storage happens in a later section.
export async function getCapsuleWithContent(
  capsuleId: string,
  actorId: string | null = null,
): Promise<MemoryCapsule | null> {
  return prisma.$transaction(async (tx) => {
    const capsule = await tx.memoryCapsule.findFirst({
      where: { capsule_id: capsuleId, deleted_at: null },
    });

    await writeAudit(tx, {
      action: "CAPSULE_READ_WITH_CONTENT",
      entity_id: capsule?.entity_id ?? null,
      actor_id: actorId,
      meta: { capsule_id: capsuleId, found: capsule !== null },
    });

    return capsule;
  });
}

// WHAT: Find capsules in a wallet whose topic_tags overlap with the
//        caller's tags AND whose relevance_score is at or above the
//        floor.
// INPUT: A SearchByTopicTagsInput with the wallet, the tag list, an
//        optional minimum relevance score, and an optional actor_id.
// OUTPUT: An array of MemoryCapsule records (empty if no match).
// WHY: Topic tags are how the COE narrows large wallets to candidate
//      capsules quickly. Soft-deleted capsules are excluded so the
//      ranker never sees gone-but-still-stored rows.
export async function searchByTopicTags(
  input: SearchByTopicTagsInput,
): Promise<MemoryCapsule[]> {
  const minScore = input.minRelevanceScore ?? 0;
  assertScoreRange(minScore, "minRelevanceScore");

  return prisma.$transaction(async (tx) => {
    // Resolve the wallet's entity_id so the audit row stays attached
    // to the right entity even though the caller passed a wallet_id.
    const wallet = await tx.wallet.findUnique({
      where: { wallet_id: input.walletId },
      select: { entity_id: true },
    });

    const capsules = await tx.memoryCapsule.findMany({
      where: {
        wallet_id: input.walletId,
        topic_tags: { hasSome: input.tags },
        relevance_score: { gte: minScore },
        deleted_at: null,
      },
      orderBy: { relevance_score: "desc" },
    });

    await writeAudit(tx, {
      action: "CAPSULE_SEARCH_BY_TAGS",
      entity_id: wallet?.entity_id ?? null,
      actor_id: input.actorId ?? null,
      meta: {
        wallet_id: input.walletId,
        tags: input.tags,
        min_relevance: minScore,
        result_count: capsules.length,
      },
    });

    return capsules;
  });
}

// WHAT: Set a capsule's relevance_score to a new 0.0 - 1.0 value.
// INPUT: The capsule_id, the new score, and an optional actor_id.
// OUTPUT: The updated MemoryCapsule record.
// WHY: Feedback loops and the decay job need to push scores up and
//      down. Validated and audited.
export async function updateRelevanceScore(
  capsuleId: string,
  newScore: number,
  actorId: string | null = null,
): Promise<MemoryCapsule> {
  assertScoreRange(newScore, "relevance_score");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { relevance_score: newScore },
    });

    await writeAudit(tx, {
      action: "CAPSULE_RELEVANCE_UPDATE",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { capsule_id: capsuleId, new_score: newScore },
    });

    return updated;
  });
}

// WHAT: Move a capsule between HOT, WARM, and COLD storage tiers.
// INPUT: The capsule_id, the new tier, and an optional actor_id.
// OUTPUT: The updated MemoryCapsule record.
// WHY: The tier governs retrieval speed and cost. We refuse to demote
//      a FOUNDATIONAL decay capsule out of HOT because the special
//      rule says FOUNDATIONAL capsules are ALWAYS in HOT storage.
export async function updateStorageTier(
  capsuleId: string,
  tier: StorageTier,
  actorId: string | null = null,
): Promise<MemoryCapsule> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.memoryCapsule.findUnique({
      where: { capsule_id: capsuleId },
      select: { decay_type: true, entity_id: true },
    });
    if (current === null) {
      throw new Error(`Capsule ${capsuleId} not found`);
    }
    if (current.decay_type === "FOUNDATIONAL" && tier !== "HOT") {
      throw new Error(
        `Capsule ${capsuleId} has decay_type=FOUNDATIONAL and must stay in HOT storage`,
      );
    }

    const updated = await tx.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { storage_tier: tier },
    });

    await writeAudit(tx, {
      action: "CAPSULE_TIER_UPDATE",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { capsule_id: capsuleId, new_tier: tier },
    });

    return updated;
  });
}

// WHAT: Add 1 to a capsule's access_count and stamp last_accessed_at.
// INPUT: The capsule_id and an optional actor_id.
// OUTPUT: The updated MemoryCapsule record.
// WHY: The decay job and feedback loops use access_count to keep
//      ACCESS_BASED capsules relevant while they are being used.
export async function incrementAccessCount(
  capsuleId: string,
  actorId: string | null = null,
): Promise<MemoryCapsule> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: {
        access_count: { increment: 1 },
        last_accessed_at: new Date(),
      },
    });

    await writeAudit(tx, {
      action: "CAPSULE_ACCESS_INCREMENT",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { capsule_id: capsuleId },
    });

    return updated;
  });
}

// WHAT: Mark a capsule as deleted by stamping deleted_at, leaving the
//        row in place.
// INPUT: The capsule_id and an optional actor_id.
// OUTPUT: The updated MemoryCapsule record (now with deleted_at set).
// WHY: Rule 10 -- nothing is ever hard deleted. Soft delete keeps the
//      audit trail intact while removing the capsule from default
//      reads and search results.
export async function softDeleteCapsule(
  capsuleId: string,
  actorId: string | null = null,
): Promise<MemoryCapsule> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.memoryCapsule.update({
      where: { capsule_id: capsuleId },
      data: { deleted_at: new Date() },
    });

    await writeAudit(tx, {
      action: "CAPSULE_SOFT_DELETE",
      entity_id: updated.entity_id,
      actor_id: actorId,
      meta: { capsule_id: capsuleId },
    });

    return updated;
  });
}

export { prisma } from "../client.js";
