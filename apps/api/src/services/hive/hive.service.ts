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
import type { Hive, Prisma } from "@prisma/client";
import { sha256Hex, type ContentEncryption } from "@niov/auth";
import {
  prisma,
  writeAuditEvent,
  type AccessScope,
  type HiveType,
} from "@niov/database";
import type { ContentStore } from "../../content-store.js";
import type { AuthService } from "../auth.service.js";
import { getOrgEntityId } from "../governance/org.js";
import {
  evaluateGovernanceForAggregateRead,
  evaluateGovernanceForCreate,
  evaluateGovernanceForInvite,
} from "./governance-terms-evaluator.js";

// WHAT: ADR-0059 v1 hive_type allowlist. CROSS_ORGANIZATION +
//        DEVICE_NETWORK + GOVERNMENT enum values are reserved in
//        the schema for forward-substrate use but explicitly
//        rejected at the v1 service tier (cross-org Hives collide
//        with RULE 0 three-wallet sovereignty; DEVICE_NETWORK +
//        GOVERNMENT need their own design slices).
// INPUT: Used as a value namespace + lookup set.
// OUTPUT: None.
// WHY: Section 3 Wave 2 enforcement per Founder Sleep Directive
//      checkpoint #1. Frozen so a future addition is an explicit
//      Founder-authorized substrate change at this anchor.
export const HIVE_TYPE_V1_ALLOWLIST: ReadonlySet<HiveType> =
  Object.freeze(new Set<HiveType>(["ENTERPRISE", "PERSONAL_NETWORK"]));

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

// WHAT: Optional knobs for createHive that don't fit the legacy
//        positional signature. Accessed by name only.
// INPUT: Used as a parameter type for the named-options bag.
// OUTPUT: None -- this is a type.
// WHY: Section 9 introduces is_default_enterprise as a named-only
//      flag. Boolean positional args at index 7 would be unreadable
//      ("createHive(t, n, ty, {}, {}, {}, true)"); a named-options
//      bag stays self-documenting at the call site.
export interface CreateHiveOptions {
  org_entity_id?: string | null;
  is_default_enterprise?: boolean;
}

// WHAT: The unified failure shape for Hive operations.
// INPUT: Used as a return type only.
// OUTPUT: None -- this is a type.
// WHY: Discriminated union keeps route mapping simple.
//
// SECTION 3 WAVE 2 NEW CODES (per ADR-0059 + Founder Sleep
// Directive enforcement checkpoints):
//   - INVALID_HIVE_TYPE_FOR_V1: hive_type not in HIVE_TYPE_V1_ALLOWLIST.
//   - ORG_ENTITY_ID_REQUIRED: v1 hives MUST resolve a non-null
//     org_entity_id (per-§1 same-org scope mandate).
//   - CROSS_ORG_INVITE_DENIED: invitee is not a member of the
//     Hive's org per EntityMembership; RULE 0 enforcement.
//   - AI_AGENT_NOT_ELIGIBLE_FOR_HIVE: invitee.entity_type ===
//     "AI_AGENT"; ADR-0046 + RULE 0 AI permission-ceiling
//     enforcement on the public inviteToHive surface.
//
// SECTION 3 WAVE 4 NEW CODES (per ADR-0063 + Founder Wave 4
// implementation authorization; 6 of the ADR's 7 codes — the
// 7th INVITE_REQUIRES_ADMIN_APPROVAL is DEFERRED until an
// admin invite path exists per Founder direction):
//   - GOVERNANCE_HIVE_TYPE_FORBIDDEN: requested hive_type not
//     in governance_terms.allowed_hive_types.
//   - GOVERNANCE_INVITEE_TYPE_FORBIDDEN: invitee.entity_type
//     not in governance_terms.allowed_member_entity_types
//     (or allow_ai_agent_membership=false rejects AI_AGENT
//     where reachable — defense in depth atop Wave 2).
//   - GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED: invite would push
//     member_count past governance_terms.max_member_count.
//   - GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN: membership
//     settings.capsule_types_accessible includes type(s) not in
//     governance_terms.allowed_capsule_types_accessible.
//   - GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN: same for
//     capsule_types_contributed.
//   - GOVERNANCE_TERMS_MALFORMED: governance_terms is not a
//     JSON object (operator-state corruption).
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
    | "AGGREGATE_NOT_BUILT"
    | "DEFAULT_HIVE_ALREADY_EXISTS"
    | "INVALID_HIVE_TYPE_FOR_V1"
    | "ORG_ENTITY_ID_REQUIRED"
    | "CROSS_ORG_INVITE_DENIED"
    | "AI_AGENT_NOT_ELIGIBLE_FOR_HIVE"
    | "GOVERNANCE_HIVE_TYPE_FORBIDDEN"
    | "GOVERNANCE_INVITEE_TYPE_FORBIDDEN"
    | "GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED"
    | "GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN"
    | "GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN"
    | "GOVERNANCE_TERMS_MALFORMED";
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
    options: CreateHiveOptions = {},
  ): Promise<CreateHiveSuccess | HiveFailure> {
    if (typeof name !== "string" || name.length === 0) {
      return { ok: false, code: "INVALID_REQUEST", message: "hive_name is required" };
    }

    // Section 3 Wave 2 ADR-0059 §3.b — TAR `can_create_hives`
    // gate enforcement. validateSession with "create_hives"
    // operation narrows to callers whose TAR carries
    // can_create_hives = true; absent capability collapses to
    // OPERATION_NOT_PERMITTED (existing failure code). This
    // closes the prior un-gated POST /api/v1/hive substrate gap
    // documented as a RULE 13 finding at ADR-0059 §Context.
    const session = await this.authService.validateSession(
      sessionToken,
      "create_hives",
    );
    if (!session.valid) {
      return { ok: false, code: session.code, message: "Hive create denied" };
    }

    // Section 3 Wave 2 ADR-0059 §1 — v1 hive_type allowlist
    // enforcement. ENTERPRISE + PERSONAL_NETWORK only at v1;
    // CROSS_ORGANIZATION + DEVICE_NETWORK + GOVERNMENT are
    // reserved in the schema enum but rejected at service tier
    // per Founder Sleep Directive checkpoint #1.
    if (!HIVE_TYPE_V1_ALLOWLIST.has(type)) {
      return {
        ok: false,
        code: "INVALID_HIVE_TYPE_FOR_V1",
        message:
          "v1 Hives MUST be ENTERPRISE or PERSONAL_NETWORK; CROSS_ORGANIZATION + DEVICE_NETWORK + GOVERNMENT are forward-substrate per ADR-0059",
      };
    }

    // Section 3 Wave 2 ADR-0059 §1 — non-null org_entity_id
    // mandatory at v1 (RULE 0 same-org sovereignty). Resolution
    // policy:
    //   - options.org_entity_id === undefined → derive from the
    //     caller's EntityMembership via getOrgEntityId (substrate-
    //     derivable per "create requires/derives safe
    //     org_entity_id per existing substrate pattern" — Founder
    //     Sleep Directive Wave 2 implementation scope).
    //   - options.org_entity_id === null → explicit rejection
    //     (caller asked for cross-org / orgless; v1 forbids).
    //   - options.org_entity_id === string → trust caller (used by
    //     dandelion.service.ts Phase 0 default-enterprise hive
    //     creation; the org_entity_id is the new org's own id).
    let orgEntityId: string;
    if (options.org_entity_id === null) {
      return {
        ok: false,
        code: "ORG_ENTITY_ID_REQUIRED",
        message:
          "v1 Hives MUST have a non-null org_entity_id; orgless/cross-org Hives are forward-substrate per ADR-0059 §1",
      };
    }
    if (options.org_entity_id === undefined) {
      try {
        orgEntityId = await getOrgEntityId(session.entity_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        if (msg === "NOT_IN_ANY_ORG" || msg === "ORG_HIERARCHY_TOO_DEEP") {
          return {
            ok: false,
            code: "ORG_ENTITY_ID_REQUIRED",
            message:
              "Caller has no resolvable org; v1 Hives MUST be same-org scoped",
          };
        }
        throw err;
      }
    } else {
      orgEntityId = options.org_entity_id;
    }

    // Application-level uniqueness check for the per-org default-
    // enterprise Hive (Prisma cannot express partial unique indexes).
    // Inside Phase 0's atomic transaction this same check runs again
    // against the open tx; here we run it standalone for any future
    // API caller that creates a default Hive directly.
    const isDefaultEnterprise = options.is_default_enterprise === true;
    if (isDefaultEnterprise) {
      const existingDefault = await prisma.hive.findFirst({
        where: {
          org_entity_id: orgEntityId,
          is_default_enterprise: true,
          status: "ACTIVE",
        },
        select: { hive_id: true },
      });
      if (existingDefault !== null) {
        return {
          ok: false,
          code: "DEFAULT_HIVE_ALREADY_EXISTS",
          message: "This org already has a default-enterprise Hive",
        };
      }
    }

    // Section 3 Wave 4 ADR-0063 Sub-decision 4 — Layer 1
    // governance_terms evaluator at createHive. Validates the
    // seed terms object's internal consistency AND the
    // requested hive_type against allowed_hive_types AND the
    // creator's capsule_types_* against the allowlists. Wave 2
    // HIVE_TYPE_V1_ALLOWLIST has already run above; this is
    // tenant-policy enforcement layered on top.
    const createGov = evaluateGovernanceForCreate(terms, {
      requested_hive_type: type,
      creator_capsule_types_accessible:
        settings.capsule_types_accessible ?? [],
      creator_capsule_types_contributed:
        settings.capsule_types_contributed ?? [],
    });
    if (createGov.ok === false) {
      return {
        ok: false,
        code: createGov.code,
        message: createGov.message,
      };
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
          // Section 3 Wave 2 — non-null org_entity_id per ADR-0059
          // §1; resolved above to a real org id (never null at v1).
          org_entity_id: orgEntityId,
          is_default_enterprise: isDefaultEnterprise,
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
        // Section 3 Wave 2 — org_entity_id now always non-null at
        // v1 per ADR-0059 §1.
        org_entity_id: orgEntityId,
        is_default_enterprise: isDefaultEnterprise,
      },
    });

    return { ok: true, hive_id, membership_id };
  }

  // WHAT: Look up the unique default-enterprise Hive for one org.
  // INPUT: The org's entity_id and an optional transaction client.
  // OUTPUT: The Hive row when found, otherwise null.
  // WHY: createTwin's standard branch needs to know which Hive to
  //      auto-join the new twin into. Standalone callers pass no tx;
  //      Dandelion Phase 3's atomic invite passes the tx so the read
  //      sees rows pending in the same outer transaction (Phase 0
  //      having created the Hive moments earlier).
  async findDefaultEnterpriseHive(
    orgEntityId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Hive | null> {
    const db = tx ?? prisma;
    return db.hive.findFirst({
      where: {
        org_entity_id: orgEntityId,
        is_default_enterprise: true,
        status: "ACTIVE",
      },
    });
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

    // Section 3 Wave 2 ADR-0059 §3.c — AI_AGENT exclusion on the
    // public inviteToHive surface. Per ADR-0046 entity-type-
    // discriminated routing + RULE 0 lower-default-permission
    // ceilings for AI: AI_AGENT entities MUST NOT be admitted to
    // a Hive via the public inviteToHive path. AI twins access
    // hive intelligence via their owner's permission-bridge
    // architecture, NOT via direct membership. The internal
    // createTwin standard-branch auto-join at
    // apps/api/src/services/governance/twin.service.ts (which
    // bypasses HiveService entirely and uses tx.hiveMembership.create
    // directly) is a legacy substrate carve-out — Wave 2 enforces
    // the policy at the public surface; future slice may revisit
    // the createTwin path under separate Founder authorization
    // (per ADR-0059 §3.c forward-substrate disposition).
    if (invitee.entity_type === "AI_AGENT") {
      return {
        ok: false,
        code: "AI_AGENT_NOT_ELIGIBLE_FOR_HIVE",
        message:
          "AI_AGENT entities are not eligible for direct Hive membership at v1 per ADR-0046 + ADR-0059 §3.c",
      };
    }

    // Section 3 Wave 2 ADR-0059 §3.b — same-org membership check.
    // The Hive's org_entity_id is the v1 sovereignty boundary;
    // invitees MUST be members of that same org via
    // EntityMembership (parent_id = Hive.org_entity_id; child_id
    // = invitee; is_active = true). Cross-org invitations are
    // rejected with CROSS_ORG_INVITE_DENIED + no extra
    // information leakage (mirrors the Wave 11 cross-org
    // notification pattern at notification.service.ts:99-109).
    if (hive.org_entity_id === null) {
      // Legacy hives with no org_entity_id (pre-Wave-2) cannot
      // be invited to under v1 same-org semantics; admin tooling
      // would need to set an org first (forward-substrate).
      return {
        ok: false,
        code: "ORG_ENTITY_ID_REQUIRED",
        message:
          "Hive predates Wave 2 v1 same-org enforcement; cannot invite until an org_entity_id is set",
      };
    }
    const orgMembership = await prisma.entityMembership.findFirst({
      where: {
        parent_id: hive.org_entity_id,
        child_id: inviteeId,
        is_active: true,
      },
      select: { membership_id: true },
    });
    if (orgMembership === null) {
      return {
        ok: false,
        code: "CROSS_ORG_INVITE_DENIED",
        message:
          "Invitee is not an active member of the Hive's org; v1 forbids cross-org Hive membership per RULE 0 + ADR-0059 §3.b",
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

    // Section 3 Wave 4 ADR-0063 Sub-decision 4 — Layer 1
    // governance_terms evaluator at inviteToHive. Wave 2
    // AI_AGENT exclusion + same-org check have already run
    // above; this is tenant-policy enforcement layered on top.
    // member_count passed here is the running count BEFORE the
    // invitee row is added (the +1 happens inside the evaluator).
    // For re-activation of a previously-REMOVED membership, the
    // count is unchanged (the row already exists with REMOVED
    // status; bringing it back to ACTIVE makes member_count
    // jump by 1 vs hive.member_count). For a brand-new row,
    // same arithmetic applies. The evaluator treats both the
    // same.
    const inviteGov = evaluateGovernanceForInvite(hive.governance_terms, {
      invitee_entity_type: invitee.entity_type,
      current_member_count: hive.member_count,
      invitee_capsule_types_accessible:
        settings.capsule_types_accessible ?? [],
      invitee_capsule_types_contributed:
        settings.capsule_types_contributed ?? [],
    });
    if (inviteGov.ok === false) {
      return {
        ok: false,
        code: inviteGov.code,
        message: inviteGov.message,
      };
    }

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

    // Section 3 Wave 2 ADR-0059 §3.d + Founder Sleep Directive
    // checkpoint #5 — capsule_types_accessible read-time
    // enforcement. If the caller's HiveMembership lists ZERO
    // accessible capsule types, return a SAFE zero-state
    // projection (intelligence: null) rather than the
    // unfiltered aggregate. This is a tightening of the prior
    // permissive behavior; existing memberships with the
    // empty-default capsule_types_accessible now receive the
    // zero-state response.
    //
    // The audit row is still emitted for forensic continuity;
    // operators can monitor zero-state reads to identify
    // memberships needing access-type configuration.
    if (membership.capsule_types_accessible.length === 0) {
      await writeAuditEvent({
        event_type: "HIVE_INTELLIGENCE_READ",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        ip_address: context.ip_address ?? null,
        details: {
          hive_id: hiveId,
          aggregate_present: false,
          zero_state_reason: "EMPTY_CAPSULE_TYPES_ACCESSIBLE",
        },
      });
      return { ok: true, hive_id: hiveId, intelligence: null };
    }

    // Section 3 Wave 4 ADR-0063 Sub-decision 4 + Sub-decision 5
    // — Layer 1 governance_terms evaluator at getHiveIntelligence
    // for aggregate_min_member_count. When the hive's active
    // member_count is below the policy-required minimum, return
    // a SAFE zero-state projection (mirrors the Wave 2
    // empty-capsule_types_accessible behavior) with a new
    // zero_state_reason marker. Reuses the existing
    // HIVE_INTELLIGENCE_READ audit literal per ADR-0063
    // Sub-decision 6 (no new audit literals).
    //
    // MALFORMED governance_terms is a hard failure
    // (operator-state corruption); fall through to HiveFailure
    // surface mapped to 422 at the route tier per ADR-0063
    // Sub-decision 5.
    const aggGate = evaluateGovernanceForAggregateRead(
      hive.governance_terms,
      { current_member_count: hive.member_count },
    );
    if (aggGate.ok === false) {
      return {
        ok: false,
        code: aggGate.code,
        message: aggGate.message,
      };
    }
    if (aggGate.below_threshold === true) {
      await writeAuditEvent({
        event_type: "HIVE_INTELLIGENCE_READ",
        outcome: "SUCCESS",
        actor_entity_id: session.entity_id,
        session_id: session.session_id,
        ip_address: context.ip_address ?? null,
        details: {
          hive_id: hiveId,
          aggregate_present: false,
          zero_state_reason: "BELOW_AGGREGATE_MIN_MEMBER_COUNT",
        },
      });
      return { ok: true, hive_id: hiveId, intelligence: null };
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
  //
  // PORTABILITY (Section 10 patch): When is_default_enterprise=true,
  // the aggregate capsule is owned by the org wallet (org_entity_id)
  // rather than hive.created_by. This is required so admin
  // offboarding does not transfer the org knowledge summary into the
  // departing admin's portable personal wallet. See Section 15 P4
  // patch + patent claim US 12,517,919. All other Hives keep the
  // original behavior (aggregate owned by hive.created_by).
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

    // PORTABILITY: When is_default_enterprise=true, the aggregate
    // capsule is owned by the org wallet (hive.org_entity_id) rather
    // than hive.created_by. This is required so admin offboarding does
    // not transfer org knowledge summary into the departing admin's
    // portable personal wallet. See Section 15 P4 patch + patent claim
    // US 12,517,919.
    //
    // For all other Hives the aggregate stays anchored to
    // hive.created_by (the original Section 5 behavior, preserved by
    // 272 baseline tests).
    const aggregateOwnerEntityId =
      hive.is_default_enterprise && hive.org_entity_id !== null
        ? hive.org_entity_id
        : hive.created_by;

    let aggregateCapsuleId = hive.aggregate_capsule_id;
    if (aggregateCapsuleId === null) {
      // Create a fresh aggregate capsule under the resolved owner's
      // wallet. Members read via membership, not via Permission.
      const ownerWallet = await prisma.wallet.findUnique({
        where: { entity_id: aggregateOwnerEntityId },
        select: { wallet_id: true },
      });
      if (ownerWallet === null) {
        return {
          ok: false,
          code: "INVITEE_NO_WALLET",
          message: "Hive aggregate owner has no wallet -- cannot anchor aggregate",
        };
      }
      const newCapsuleId = randomUUID();
      const storageLocation = `niov://hive/${hiveId}/aggregate/${newCapsuleId}`;
      await this.contentStore.write(storageLocation, ciphertext);
      await prisma.memoryCapsule.create({
        data: {
          capsule_id: newCapsuleId,
          wallet_id: ownerWallet.wallet_id,
          entity_id: aggregateOwnerEntityId,
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

  // ----------------------------------------------------------------
  // Section 3 Wave 3 — Admin route surface (ADR-0062)
  //
  // These 4 admin methods are reached via /api/v1/org/hives/* routes
  // in hive-admin.routes.ts under the requireAdminCapability(
  // authService, "can_admin_org") preHandler. The route is the
  // authentication boundary; these methods assume the caller's
  // org_entity_id has already been resolved via getOrgEntityId at
  // the route tier and is passed in explicitly. Cross-org access
  // collapses to enumeration-safe 404 HIVE_NOT_FOUND /
  // MEMBERSHIP_NOT_FOUND mirroring the Section 4 connector pattern.
  // ----------------------------------------------------------------

  // WHAT: List all hives in an org with optional status filter.
  // INPUT: org_entity_id (already resolved by route tier), optional
  //         { status: HiveStatus } filter.
  // OUTPUT: { ok: true; hives: HiveListItemView[] } |
  //         { ok: false; code: "INVALID_FIELD"; ... }.
  // WHY: Wave 3 admin governance surface per ADR-0062 Sub-decision 1
  //      route #1; mirrors connector listConnectorBindingsForOrgService
  //      pattern verbatim.
  async listHivesForOrg(
    orgEntityId: string,
    filter: { status?: "ACTIVE" | "DISSOLVED" } = {},
  ): Promise<
    | { ok: true; hives: HiveListItemView[] }
    | { ok: false; code: "INVALID_FIELD"; invalid_fields: string[]; message: string }
  > {
    if (
      filter.status !== undefined &&
      filter.status !== "ACTIVE" &&
      filter.status !== "DISSOLVED"
    ) {
      return {
        ok: false,
        code: "INVALID_FIELD",
        invalid_fields: ["status"],
        message: "status must be ACTIVE or DISSOLVED",
      };
    }

    const rows = await prisma.hive.findMany({
      where: {
        org_entity_id: orgEntityId,
        ...(filter.status !== undefined ? { status: filter.status } : {}),
      },
      orderBy: { created_at: "desc" },
    });

    return { ok: true, hives: rows.map(projectHiveListItem) };
  }

  // WHAT: Fetch one hive's admin detail + safe member roster.
  // INPUT: org_entity_id, hive_id.
  // OUTPUT: { ok: true; hive; members } | HiveAdminFailure.
  // WHY: Wave 3 admin governance surface per ADR-0062 Sub-decision 1
  //      route #2; enumeration-safe 404 for cross-org id mirrors
  //      connector pattern.
  async getHiveAdminDetail(
    orgEntityId: string,
    hiveId: string,
  ): Promise<HiveAdminDetailSuccess | HiveAdminFailure> {
    const hive = await prisma.hive.findFirst({
      where: { hive_id: hiveId, org_entity_id: orgEntityId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found in caller's org",
      };
    }

    const memberRows = await prisma.hiveMembership.findMany({
      where: { hive_id: hiveId },
      orderBy: { joined_at: "asc" },
    });

    const entityIds = memberRows.map((m) => m.entity_id);
    const entities =
      entityIds.length === 0
        ? []
        : await prisma.entity.findMany({
            where: { entity_id: { in: entityIds } },
            select: { entity_id: true, entity_type: true, display_name: true },
          });
    const entityById = new Map(entities.map((e) => [e.entity_id, e]));

    const members = memberRows.map((m) =>
      projectHiveMembershipAdmin(m, entityById.get(m.entity_id) ?? null),
    );

    return {
      ok: true,
      hive: projectHiveAdminDetail(hive),
      members,
    };
  }

  // WHAT: Soft-archive a hive (status: ACTIVE → DISSOLVED).
  // INPUT: org_entity_id, hive_id, actor_entity_id.
  // OUTPUT: { ok: true; status; already_dissolved; audit_event_id }
  //         | HiveAdminFailure.
  // WHY: Wave 3 admin governance surface per ADR-0062 Sub-decision 1
  //      route #3 + Sub-decision 3 idempotency; RULE 10 soft-delete;
  //      emits ADMIN_ACTION + details.action = "HIVE_DISSOLVED" per
  //      Sub-decision 5 (no new audit literal).
  async dissolveHive(
    orgEntityId: string,
    hiveId: string,
    actorEntityId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<DissolveHiveSuccess | HiveAdminFailure> {
    const hive = await prisma.hive.findFirst({
      where: { hive_id: hiveId, org_entity_id: orgEntityId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found in caller's org",
      };
    }

    // ADR-0062 Sub-decision 3 — idempotent on already-dissolved.
    // Return success WITHOUT a new audit row (idempotent paths
    // emit no audit; chain reflects state transitions only).
    if (hive.status === "DISSOLVED") {
      return {
        ok: true,
        status: "DISSOLVED",
        already_dissolved: true,
        audit_event_id: null,
      };
    }

    await prisma.hive.update({
      where: { hive_id: hiveId },
      data: { status: "DISSOLVED" },
    });

    const audit = await writeAuditEvent({
      event_type: "ADMIN_ACTION",
      outcome: "SUCCESS",
      actor_entity_id: actorEntityId,
      target_entity_id: orgEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "HIVE_DISSOLVED",
        hive_id: hiveId,
        org_entity_id: orgEntityId,
        member_count_at_dissolve: hive.member_count,
      },
    });

    return {
      ok: true,
      status: "DISSOLVED",
      already_dissolved: false,
      audit_event_id: audit.audit_id,
    };
  }

  // WHAT: Admin force-remove a member from a hive.
  // INPUT: org_entity_id, hive_id, member_entity_id, actor_entity_id.
  // OUTPUT: { ok: true; membership_id; member_count; audit_event_id }
  //         | HiveAdminFailure.
  // WHY: Wave 3 admin governance surface per ADR-0062 Sub-decision 1
  //      route #4; AI_AGENT permitted at admin tier (Sub-decision 4)
  //      because this is a cleanup operation not an invite path.
  //      Emits the existing HIVE_MEMBER_REMOVED literal + details.action
  //      = "HIVE_MEMBER_FORCE_REMOVED" + actor_role = "ORG_ADMIN"
  //      discriminator (Sub-decision 5; no new audit literal).
  async forceRemoveMember(
    orgEntityId: string,
    hiveId: string,
    memberEntityId: string,
    actorEntityId: string,
    context: { ip_address?: string | null } = {},
  ): Promise<ForceRemoveMemberSuccess | HiveAdminFailure> {
    const hive = await prisma.hive.findFirst({
      where: { hive_id: hiveId, org_entity_id: orgEntityId },
    });
    if (hive === null) {
      return {
        ok: false,
        code: "HIVE_NOT_FOUND",
        message: "Hive not found in caller's org",
      };
    }

    const membership = await prisma.hiveMembership.findUnique({
      where: {
        hive_id_entity_id: { hive_id: hiveId, entity_id: memberEntityId },
      },
    });
    if (membership === null || membership.status !== "ACTIVE") {
      // ADR-0062 Sub-decision 3 — enumeration-safe 404 covers both
      // unknown and already-REMOVED cases. No new audit row.
      return {
        ok: false,
        code: "MEMBERSHIP_NOT_FOUND",
        message: "No active membership for that entity in this hive",
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

    const audit = await writeAuditEvent({
      event_type: "HIVE_MEMBER_REMOVED",
      outcome: "SUCCESS",
      actor_entity_id: actorEntityId,
      target_entity_id: memberEntityId,
      ip_address: context.ip_address ?? null,
      details: {
        action: "HIVE_MEMBER_FORCE_REMOVED",
        actor_role: "ORG_ADMIN",
        hive_id: hiveId,
        membership_id: membership.membership_id,
        target_entity_id: memberEntityId,
      },
    });

    return {
      ok: true,
      membership_id: membership.membership_id,
      member_count: updatedHive?.member_count ?? 0,
      audit_event_id: audit.audit_id,
    };
  }
}

// ----------------------------------------------------------------
// Section 3 Wave 3 — Admin view projections + return types
// (ADR-0062 Sub-decision 2)
// ----------------------------------------------------------------

// WHAT: SAFE projection of a Hive row for the admin list endpoint.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ADR-0062 Sub-decision 2 — excludes governance_terms (Wave 4
//      forward-substrate) + aggregate_capsule_id (internal pointer).
export interface HiveListItemView {
  hive_id: string;
  hive_name: string;
  hive_type: HiveType;
  status: "ACTIVE" | "DISSOLVED";
  is_default_enterprise: boolean;
  member_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// WHAT: SAFE projection of a Hive row for the admin detail endpoint.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Same as HiveListItemView plus org_entity_id (admin tier only;
//      same-org confirmed by route gate).
export interface HiveAdminDetailView extends HiveListItemView {
  org_entity_id: string | null;
}

// WHAT: SAFE projection of a HiveMembership row for the admin roster.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ADR-0062 Sub-decision 2 — capsule_types_* exposed as COUNTS
//      only (member-private values stay private); excludes all raw
//      content / payload / wallet internals / permission internals /
//      bridge IDs / secret refs / embeddings / storage locations.
export interface HiveMembershipAdminView {
  membership_id: string;
  entity_id: string;
  entity_type: string | null;
  display_name: string | null;
  status: "ACTIVE" | "REMOVED";
  access_scope: AccessScope;
  contribution_scope: AccessScope;
  joined_at: string;
  expires_at: string | null;
  capsule_types_accessible_count: number;
  capsule_types_contributed_count: number;
}

// WHAT: Admin detail success shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Hive metadata + safe member roster in one round-trip.
export interface HiveAdminDetailSuccess {
  ok: true;
  hive: HiveAdminDetailView;
  members: HiveMembershipAdminView[];
}

// WHAT: Dissolve success shape (carries idempotency flag).
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ADR-0062 Sub-decision 3 — already_dissolved distinguishes
//      "this call dissolved" (audit_event_id set) from "was already
//      dissolved" (audit_event_id null).
export interface DissolveHiveSuccess {
  ok: true;
  status: "DISSOLVED";
  already_dissolved: boolean;
  audit_event_id: string | null;
}

// WHAT: Force-remove success shape.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: Mirrors creator-removeMember shape + audit_event_id (admin
//      paths surface the audit id per Section 4 connector precedent).
export interface ForceRemoveMemberSuccess {
  ok: true;
  membership_id: string;
  member_count: number;
  audit_event_id: string;
}

// WHAT: Unified failure shape for the Wave 3 admin surface.
// INPUT: Used as a return type only.
// OUTPUT: None.
// WHY: ADR-0062 Sub-decision 6 — discriminated union keeps the
//      route-tier statusFor mapping simple.
export interface HiveAdminFailure {
  ok: false;
  code:
    | "HIVE_NOT_FOUND"
    | "MEMBERSHIP_NOT_FOUND"
    | "INVALID_FIELD"
    | "INTERNAL_ERROR";
  message: string;
  invalid_fields?: string[];
}

// WHAT: Project a Hive row to the SAFE list view.
// INPUT: A Prisma Hive row.
// OUTPUT: HiveListItemView (forbidden fields stripped).
// WHY: Single-source projection; the test surface asserts the
//      response JSON does NOT contain governance_terms or
//      aggregate_capsule_id (Sub-decision 2 + Sub-decision 8).
function projectHiveListItem(hive: Hive): HiveListItemView {
  return {
    hive_id: hive.hive_id,
    hive_name: hive.hive_name,
    hive_type: hive.hive_type,
    status: hive.status,
    is_default_enterprise: hive.is_default_enterprise,
    member_count: hive.member_count,
    created_by: hive.created_by,
    created_at: hive.created_at.toISOString(),
    updated_at: hive.updated_at.toISOString(),
  };
}

// WHAT: Project a Hive row to the SAFE admin detail view.
// INPUT: A Prisma Hive row.
// OUTPUT: HiveAdminDetailView (adds org_entity_id; still no
//         governance_terms / aggregate_capsule_id).
// WHY: Admin tier sees the same-org tag explicitly (route gate
//      already enforced same-org by the time we project).
function projectHiveAdminDetail(hive: Hive): HiveAdminDetailView {
  return {
    ...projectHiveListItem(hive),
    org_entity_id: hive.org_entity_id,
  };
}

// WHAT: Project a HiveMembership row + Entity to the SAFE admin
//        roster view.
// INPUT: A Prisma HiveMembership row + optional Entity row (entity
//         may be null if the entity record was scrubbed).
// OUTPUT: HiveMembershipAdminView (capsule_types as counts; no raw
//         arrays).
// WHY: ADR-0062 Sub-decision 2 — admin needs *that* a member
//      contributes/consumes (governance signal) without exposing
//      *what* (member-private signal).
function projectHiveMembershipAdmin(
  m: {
    membership_id: string;
    entity_id: string;
    status: "ACTIVE" | "REMOVED";
    access_scope: AccessScope;
    contribution_scope: AccessScope;
    joined_at: Date;
    expires_at: Date | null;
    capsule_types_accessible: string[];
    capsule_types_contributed: string[];
  },
  entity: { entity_type: string; display_name: string | null } | null,
): HiveMembershipAdminView {
  return {
    membership_id: m.membership_id,
    entity_id: m.entity_id,
    entity_type: entity?.entity_type ?? null,
    display_name: entity?.display_name ?? null,
    status: m.status,
    access_scope: m.access_scope,
    contribution_scope: m.contribution_scope,
    joined_at: m.joined_at.toISOString(),
    expires_at: m.expires_at === null ? null : m.expires_at.toISOString(),
    capsule_types_accessible_count: m.capsule_types_accessible.length,
    capsule_types_contributed_count: m.capsule_types_contributed.length,
  };
}
