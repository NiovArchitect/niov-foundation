// FILE: hive.service.ts
// PURPOSE: Implement the Hive Intelligence flows -- create a hive,
//          invite members, remove members, build the privacy-safe
//          aggregate of common topic_tags across members, and serve
//          that aggregate to active members. The aggregate NEVER
//          contains individual entity_ids.
// CONNECTS TO: AuthService (validates sessions), the hives /
//              hive_memberships / memory_capsules tables, the
//              ContentEncryption helper (encrypts aggregate
//              content before persistence), and the ContentStore
//              (durable storage for the encrypted aggregate body).

import { randomUUID } from "node:crypto";
import { sha256Hex, type ContentEncryption } from "@niov/auth";
import {
  prisma,
  writeAuditEvent,
  type AccessScope,
  type HiveType,
} from "@niov/database";
import type { ContentStore } from "../../content-store.js";
import type { AuthService } from "../auth.service.js";

// WHAT: Settings the hive creator (or invitee) supplies for one
//        membership row.
// INPUT: Used as a parameter type only.
// OUTPUT: None -- this is a type, not a value.
// WHY: Spec lists exactly these four configuration knobs per
//      membership. Defaults pick the most permissive sensible
//      values when omitted.
export interface MembershipSettings {
  capsule_types_contributed?: string[];
  contribution_scope?: AccessScope;
  capsule_types_accessible?: string[];
  access_scope?: AccessScope;
  expires_at?: Date | null;
}

// WHAT: createHive return shape on success.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Caller needs the hive_id immediately (to invite members).
export interface CreateHiveSuccess {
  ok: true;
  hive_id: string;
  membership_id: string;
}

// WHAT: inviteToHive return shape on success.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Caller wants to know the new membership_id and the running
//      member_count.
export interface InviteSuccess {
  ok: true;
  membership_id: string;
  member_count: number;
}

// WHAT: removeMember return shape on success.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Caller wants confirmation the member was flipped.
export interface RemoveMemberSuccess {
  ok: true;
  membership_id: string;
  member_count: number;
}

// WHAT: getHiveIntelligence return shape on success.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Returns the parsed aggregate (or null when no aggregate has
//      been built yet) plus a freshness timestamp.
export interface IntelligenceSuccess {
  ok: true;
  hive_id: string;
  intelligence: HiveAggregate | null;
}

// WHAT: buildHiveAggregate return shape on success.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Background job wants observability -- how many members,
//      how many tags survived the 3-member floor.
export interface AggregateBuildSuccess {
  ok: true;
  hive_id: string;
  aggregate_capsule_id: string;
  member_count: number;
  common_tags_count: number;
}

// WHAT: The plain-JSON shape of the aggregate that gets encrypted
//        and stored in the hive's aggregate capsule.
// INPUT: Used as a return + parameter type.
// OUTPUT: None -- this is a type.
// WHY: Centralizes the aggregate shape so producer (build) and
//      consumer (intelligence read) cannot drift.
export interface HiveAggregate {
  hive_id: string;
  member_count: number;
  common_topic_tags: string[];
  built_at: string; // ISO timestamp
}

// WHAT: The unified failure shape for Hive operations.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Discriminated union keeps route mapping simple.
export interface HiveFailure {
  ok: false;
  code:
    | "SESSION_INVALID"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_INVALIDATED"
    | "OPERATION_NOT_PERMITTED"
    | "INVALID_REQUEST"
    | "HIVE_NOT_FOUND"
    | "HIVE_DISSOLVED"
    | "NOT_HIVE_CREATOR"
    | "NOT_HIVE_MEMBER"
    | "INVITEE_NOT_FOUND"
    | "INVITEE_NO_WALLET"
    | "ALREADY_MEMBER"
    | "MEMBERSHIP_NOT_FOUND"
    | "AGGREGATE_NOT_BUILT";
  message: string;
}

// WHAT: Tags whose count must hit this threshold to make the
//        aggregate.
// INPUT: Used as a constant.
// OUTPUT: A number.
// WHY: Spec says "common topic_tags appearing in 3+ members'
//      capsules". Naming the constant means we change it later
//      in one place.
export const HIVE_AGGREGATE_TAG_FLOOR = 3;

// WHAT: The class that orchestrates Hive Intelligence flows.
// INPUT: AuthService, ContentEncryption (encrypts aggregate
//        content), ContentStore (persists encrypted blob).
// OUTPUT: A class with five methods: createHive, inviteToHive,
//         removeMember, getHiveIntelligence, buildHiveAggregate.
// WHY: Constructor injection keeps tests cleanly composable.
export class HiveService {
  constructor(
    private readonly authService: AuthService,
    private readonly encryption: ContentEncryption,
    private readonly contentStore: ContentStore,
  ) {}

  // WHAT: Create a new hive and add the creator as the first
  //        member (with FULL contribution + access).
  // INPUT: Session token, hive name, hive type, governance terms,
  //        optional creator membership settings.
  // OUTPUT: { hive_id, membership_id } on success.
  // WHY: Spec step 1: hive + creator membership in one atomic
  //      flow + audit HIVE_CREATED.
  async createHive(
    sessionToken: string,
    name: string,
    type: HiveType,
    terms: Record<string, unknown> = {},
    settings: MembershipSettings = {},
    context: { ip_address?: string | null } = {},
  ): Promise<CreateHiveSuccess | HiveFailure> {
    if (typeof name !== "string" || name.length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "hive_name is required" };
    }
    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Hive create denied" };
    }

    const hive_id = randomUUID();
    const membership_id = randomUUID();

    await prisma.$transaction([
      prisma.hive.create({
        data: {
          hive_id,
          hive_name: name,
          created_by: session.entity_id,
          hive_type: type,
          governance_terms: terms as object,
          member_count: 1,
        },
      }),
      prisma.hiveMembership.create({
        data: {
          membership_id,
          hive_id,
          entity_id: session.entity_id,
          capsule_types_contributed:
            settings.capsule_types_contributed ?? [],
          contribution_scope: settings.contribution_scope ?? "FULL",
          capsule_types_accessible: settings.capsule_types_accessible ?? [],
          access_scope: settings.access_scope ?? "FULL",
          expires_at: settings.expires_at ?? null,
        },
      }),
    ]);

    await writeAuditEvent({
      event_type: "HIVE_CREATED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        hive_id,
        hive_name: name,
        hive_type: type,
      },
    });

    return { ok: true, hive_id, membership_id };
  }

  // WHAT: Add another member to an existing hive.
  // INPUT: Session token, hive_id, invitee entity_id, settings.
  // OUTPUT: { membership_id, member_count } on success.
  // WHY: Spec step 2: only the hive creator can invite (MVP);
  //      validate governance, create membership, audit
  //      HIVE_MEMBER_ADDED.
  async inviteToHive(
    sessionToken: string,
    hiveId: string,
    inviteeId: string,
    settings: MembershipSettings = {},
    context: { ip_address?: string | null } = {},
  ): Promise<InviteSuccess | HiveFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Invite denied" };
    }

    const hive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found",
      };
    }
    if (hive.status !== "ACTIVE") {
      return {
        ok: false,
        code: "HIVE_DISSOLVED",
        message: "Hive is dissolved",
      };
    }
    if (hive.created_by !== session.entity_id) {
      return {
        ok: false,
        code: "NOT_HIVE_CREATOR",
        message: "Only the hive creator can invite members",
      };
    }

    const invitee = await prisma.entity.findUnique({
      where: { entity_id: inviteeId },
    });
    if (invitee === null) {
      return {
        ok: false,
        code: "INVITEE_NOT_FOUND",
        message: "Invitee entity not found",
      };
    }

    const existing = await prisma.hiveMembership.findUnique({
      where: { hive_id_entity_id: { hive_id: hiveId, entity_id: inviteeId } },
    });
    if (existing !== null && existing.status === "ACTIVE") {
      return {
        ok: false,
        code: "ALREADY_MEMBER",
        message: "Entity is already an active member",
      };
    }

    // Governance-terms validation hook -- permissive for MVP. The
    // hive's governance_terms JSON is recorded; future work can
    // enforce it against settings here.

    const membershipId = existing?.membership_id ?? randomUUID();
    const operations: import("@prisma/client").Prisma.PrismaPromise<unknown>[] = [];
    if (existing !== null) {
      // Re-activate a previously-removed membership.
      operations.push(
        prisma.hiveMembership.update({
          where: { membership_id: existing.membership_id },
          data: {
            status: "ACTIVE",
            capsule_types_contributed:
              settings.capsule_types_contributed ?? [],
            contribution_scope: settings.contribution_scope ?? "FULL",
            capsule_types_accessible:
              settings.capsule_types_accessible ?? [],
            access_scope: settings.access_scope ?? "FULL",
            expires_at: settings.expires_at ?? null,
            joined_at: new Date(),
          },
        }),
      );
    } else {
      operations.push(
        prisma.hiveMembership.create({
          data: {
            membership_id: membershipId,
            hive_id: hiveId,
            entity_id: inviteeId,
            capsule_types_contributed:
              settings.capsule_types_contributed ?? [],
            contribution_scope: settings.contribution_scope ?? "FULL",
            capsule_types_accessible:
              settings.capsule_types_accessible ?? [],
            access_scope: settings.access_scope ?? "FULL",
            expires_at: settings.expires_at ?? null,
          },
        }),
      );
    }
    operations.push(
      prisma.hive.update({
        where: { hive_id: hiveId },
        data: { member_count: { increment: 1 } },
      }),
    );
    await prisma.$transaction(operations);

    const updatedHive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
      select: { member_count: true },
    });

    await writeAuditEvent({
      event_type: "HIVE_MEMBER_ADDED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: inviteeId,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        hive_id: hiveId,
        membership_id: membershipId,
      },
    });

    return {
      ok: true,
      membership_id: membershipId,
      member_count: updatedHive?.member_count ?? 0,
    };
  }

  // WHAT: Mark a member's hive_membership row REMOVED.
  // INPUT: Session token, hive_id, the entity_id to remove.
  // OUTPUT: { membership_id, member_count } on success.
  // WHY: Spec step 3: revoke cross-hive permissions and flip
  //      status. Since membership IS the gate for
  //      getHiveIntelligence, a single status flip immediately
  //      cuts the member off.
  async removeMember(
    sessionToken: string,
    hiveId: string,
    memberEntityId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<RemoveMemberSuccess | HiveFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "share",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Remove denied" };
    }

    const hive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found",
      };
    }
    if (hive.created_by !== session.entity_id) {
      return {
        ok: false,
        code: "NOT_HIVE_CREATOR",
        message: "Only the hive creator can remove members",
      };
    }

    const membership = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveId, entity_id: memberEntityId },
      },
    });
    if (membership === null || membership.status !== "ACTIVE") {
      return {
        ok: false,
        code: "MEMBERSHIP_NOT_FOUND",
        message: "No active membership for that entity",
      };
    }

    await prisma.$transaction([
      prisma.hiveMembership.update({
        where: { membership_id: membership.membership_id },
        data: { status: "REMOVED" },
      }),
      prisma.hive.update({
        where: { hive_id: hiveId },
        data: { member_count: { decrement: 1 } },
      }),
    ]);

    const updatedHive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
      select: { member_count: true },
    });

    await writeAuditEvent({
      event_type: "HIVE_MEMBER_REMOVED",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_entity_id: memberEntityId,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: {
        hive_id: hiveId,
        membership_id: membership.membership_id,
      },
    });

    return {
      ok: true,
      membership_id: membership.membership_id,
      member_count: updatedHive?.member_count ?? 0,
    };
  }

  // WHAT: Read the hive's aggregate intelligence.
  // INPUT: Session token, hive_id.
  // OUTPUT: { intelligence } on success (null when no aggregate
  //         has been built yet).
  // WHY: Spec step 4: verify ACTIVE membership, decrypt the
  //      aggregate body, return parsed JSON. Membership IS the
  //      permission -- no per-capsule grant needed.
  async getHiveIntelligence(
    sessionToken: string,
    hiveId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<IntelligenceSuccess | HiveFailure> {
    const session = await this.authService.validateSession(
      sessionToken,
      "read",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Intelligence denied" };
    }

    const hive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found",
      };
    }
    if (hive.status !== "ACTIVE") {
      return {
        ok: false,
        code: "HIVE_DISSOLVED",
        message: "Hive is dissolved",
      };
    }

    const membership = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveId, entity_id: session.entity_id },
      },
    });
    if (membership === null || membership.status !== "ACTIVE") {
      return {
        ok: false,
        code: "NOT_HIVE_MEMBER",
        message: "Not an active member of this hive",
      };
    }

    if (hive.aggregate_capsule_id === null) {
      // No aggregate has been built yet. Return null intelligence
      // rather than failing -- the caller can decide whether to
      // schedule a build.
      await writeAuditEvent({
        event_type: "HIVE_INTELLIGENCE_READ",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        ip_address: context.ip_address ?? null,
        details: { hive_id: hiveId, aggregate_present: false },
      });
      return { ok: true, hive_id: hiveId, intelligence: null };
    }

    const capsule = await prisma.memoryCapsule.findUnique({
      where: { capsule_id: hive.aggregate_capsule_id },
    });
    if (capsule === null) {
      return {
        ok: false,
        code: "AGGREGATE_NOT_BUILT",
        message: "Aggregate capsule missing",
      };
    }

    const ciphertext = await this.contentStore.read(capsule.storage_location);
    if (ciphertext === null) {
      return {
        ok: false,
        code: "AGGREGATE_NOT_BUILT",
        message: "Aggregate content missing",
      };
    }
    const plaintext = this.encryption.decrypt(ciphertext);
    const intelligence = JSON.parse(plaintext) as HiveAggregate;

    await writeAuditEvent({
      event_type: "HIVE_INTELLIGENCE_READ",
      outcome: "SUCCESS",
      actor_entity_id: session.entity_id,
      target_capsule_id: capsule.capsule_id,
      session_id: session.session_id,
      ip_address: context.ip_address ?? null,
      details: { hive_id: hiveId, aggregate_present: true },
    });

    return { ok: true, hive_id: hiveId, intelligence };
  }

  // WHAT: Recompute the hive's aggregate from member capsule
  //        metadata. Background-job-friendly entry point.
  // INPUT: hive_id.
  // OUTPUT: { aggregate_capsule_id, common_tags_count, member_count }.
  // WHY: Spec step 5: load metadata from contributed capsules
  //      across all ACTIVE members, count tags appearing in 3+
  //      members, build a JSON aggregate, encrypt it, store it
  //      in a single MemoryCapsule (created on first build, updated
  //      thereafter). Critically, NO entity_ids end up in the
  //      aggregate body.
  async buildHiveAggregate(
    hiveId: string,
  ): Promise<AggregateBuildSuccess | HiveFailure> {
    const hive = await prisma.hive.findUnique({
      where: { hive_id: hiveId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found",
      };
    }

    const memberships = await prisma.hiveMembership.findMany({
      where: { hive_id: hiveId, status: "ACTIVE" },
    });

    // For each tag, count how many DISTINCT members have a capsule
    // bearing that tag. Counting per-member-once-per-tag means a
    // single member with the same tag in 100 capsules contributes 1.
    const tagMemberCounts = new Map<string, number>();
    for (const m of memberships) {
      const wallet = await prisma.wallet.findUnique({
        where: { entity_id: m.entity_id },
        select: { wallet_id: true },
      });
      if (wallet === null) continue;

      const capsuleFilter: import("@prisma/client").Prisma.MemoryCapsuleWhereInput = {
        wallet_id: wallet.wallet_id,
        deleted_at: null,
      };
      if (m.capsule_types_contributed.length > 0) {
        capsuleFilter.capsule_type = {
          in: m.capsule_types_contributed as import("@prisma/client").CapsuleType[],
        };
      }

      const memberCapsules = await prisma.memoryCapsule.findMany({
        where: capsuleFilter,
        select: { topic_tags: true },
      });

      const memberTags = new Set<string>();
      for (const c of memberCapsules) {
        for (const t of c.topic_tags) memberTags.add(t.toLowerCase());
      }
      for (const t of memberTags) {
        tagMemberCounts.set(t, (tagMemberCounts.get(t) ?? 0) + 1);
      }
    }

    // Tags that crossed the 3-member floor, sorted by frequency
    // desc for stable aggregate ordering.
    const commonTags = Array.from(tagMemberCounts.entries())
      .filter(([, count]) => count >= HIVE_AGGREGATE_TAG_FLOOR)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    const aggregate: HiveAggregate = {
      hive_id: hiveId,
      member_count: memberships.length,
      common_topic_tags: commonTags,
      built_at: new Date().toISOString(),
    };
    const plaintext = JSON.stringify(aggregate);
    const ciphertext = this.encryption.encrypt(plaintext);
    const newHash = sha256Hex(ciphertext);
    const tokenSize = Math.ceil(plaintext.length / 4);

    let aggregateCapsuleId = hive.aggregate_capsule_id;
    if (aggregateCapsuleId === null) {
      // Create a fresh aggregate capsule under hive.created_by's
      // wallet. The hive creator is the de-facto owner; members
      // read via membership, not via Permission.
      const ownerWallet = await prisma.wallet.findUnique({
        where: { entity_id: hive.created_by },
        select: { wallet_id: true },
      });
      if (ownerWallet === null) {
        return {
          ok: false,
          code: "INVITEE_NO_WALLET",
          message: "Hive creator has no wallet -- cannot anchor aggregate",
        };
      }
      const newCapsuleId = randomUUID();
      const storageLocation = `niov://hive/${hiveId}/aggregate/${newCapsuleId}`;
      await this.contentStore.write(storageLocation, ciphertext);
      await prisma.memoryCapsule.create({
        data: {
          capsule_id: newCapsuleId,
          wallet_id: ownerWallet.wallet_id,
          entity_id: hive.created_by,
          version: 1,
          capsule_type: "DOMAIN_KNOWLEDGE",
          topic_tags: ["hive-aggregate", `hive-${hiveId}`],
          decay_type: "TIME_BASED",
          payload_summary: `Collective intelligence for hive ${hive.hive_name}`,
          payload_size_tokens: tokenSize,
          storage_location: storageLocation,
          content_hash: newHash,
          created_by: hive.created_by,
        },
      });
      await prisma.hive.update({
        where: { hive_id: hiveId },
        data: { aggregate_capsule_id: newCapsuleId },
      });
      aggregateCapsuleId = newCapsuleId;
    } else {
      const existing = await prisma.memoryCapsule.findUnique({
        where: { capsule_id: aggregateCapsuleId },
      });
      if (existing !== null) {
        await this.contentStore.write(existing.storage_location, ciphertext);
        await prisma.memoryCapsule.update({
          where: { capsule_id: aggregateCapsuleId },
          data: {
            version: { increment: 1 },
            content_hash: newHash,
            payload_size_tokens: tokenSize,
            previous_version: existing.version,
          },
        });
      }
    }

    await writeAuditEvent({
      event_type: "HIVE_AGGREGATE_BUILT",
      outcome: "SUCCESS",
      target_capsule_id: aggregateCapsuleId,
      details: {
        hive_id: hiveId,
        members_processed: memberships.length,
        common_tags_count: commonTags.length,
      },
    });

    return {
      ok: true,
      hive_id: hiveId,
      aggregate_capsule_id: aggregateCapsuleId,
      member_count: memberships.length,
      common_tags_count: commonTags.length,
    };
  }
}
