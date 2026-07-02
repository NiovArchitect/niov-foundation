// FILE: escalation-target-resolver.test.ts (unit)
// PURPOSE: Cover the Phase E target resolver (resolveDualControlTarget) in
//          apps/api/src/services/governance/escalation.service.ts. The resolver
//          replaces the sub-phase E placeholder (target_entity_id = caller) with
//          a deterministic, auditable, fail-closed Class A -> B -> C -> D
//          selection per ADR-0026 Amendment 1. These are direct service-tier
//          unit tests against real containerized Postgres; route-level coverage
//          lives at the integration tier (dual-control-binding-* + the new
//          dual-control-phase-e test).
// CONNECTS TO: services/governance/escalation.service.ts (via "@niov/api"),
//              security/privileged-endpoints.ts (PrivilegedEndpoint typing for
//              authTier + actionDescriptor.metadata),
//              the entities + token_attribute_repositories + entity_memberships
//              tables, tests/helpers.ts (entity fixtures + cleanup).
//
// 4-FRAMING-REGISTER CROSS-REFERENCE (RULE 17):
//   - ADR-0026 Amendment 1 §2 invariants -- source preservation, target
//     independence, resolver null on creation, fail-closed, deterministic
//     selection, no cross-org leak.
//   - ADR-0026 Amendment 1 §3 target-resolution order -- Class A explicit
//     metadata -> Class B org-admin -> Class C platform-admin -> Class D
//     fail closed.
//   - ADR-0026 Amendment 1 §9 tests required -- this file covers items 1-6
//     at the unit tier; items 7-14 land at the integration tier.
//
// cleanupTestEscalations RATIONALE: same as tests/unit/escalation.test.ts --
// EscalationRequest's entity relations have no onDelete: Cascade. This file
// also clears escalation_requests defensively before cleanupTestData(),
// even though resolveDualControlTarget itself does not write to that table.

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { resolveDualControlTarget } from "@niov/api";
import {
  computeTARHash,
  createEntity,
  prisma,
} from "@niov/database";
import type { PrivilegedEndpoint } from "@niov/api";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

// WHAT: Delete every escalation_requests row referencing a test entity.
// INPUT: None.
// OUTPUT: A promise that resolves once the rows are gone.
// WHY: Defensive parity with tests/unit/escalation.test.ts cleanup discipline.
async function cleanupTestEscalations(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.escalationRequest.deleteMany({
    where: {
      OR: [
        { source_entity_id: { in: ids } },
        { target_entity_id: { in: ids } },
        { resolved_by_entity_id: { in: ids } },
      ],
    },
  });
}

// WHAT: Create a PERSON entity and flip its TAR capability bits to the
//        requested values; recomputes tar_hash so the entity is a valid
//        privileged actor.
// INPUT: A partial set of capability bits to enable on the TAR.
// OUTPUT: The newly-created entity's entity_id.
// WHY: The resolver candidate-set queries filter by tar.status = ACTIVE
//      and the relevant can_admin_* bit; tests need to mint entities at
//      either platform-admin (can_admin_niov) or org-admin (can_admin_org)
//      tier to exercise each resolver class.
async function makeEntityWithCapability(opts: {
  can_admin_niov?: boolean;
  can_admin_org?: boolean;
  status?: "ACTIVE" | "SUSPENDED" | "DELETED";
  deleted?: boolean;
}): Promise<string> {
  const entity = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
  if (opts.can_admin_niov === true || opts.can_admin_org === true) {
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: {
        can_admin_niov: opts.can_admin_niov === true,
        can_admin_org: opts.can_admin_org === true,
      },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: entity.entity_id },
    });
    if (fresh === null) throw new Error("TAR vanished mid-test");
    const newHash = computeTARHash({
      can_login: fresh.can_login,
      can_read_capsules: fresh.can_read_capsules,
      can_write_capsules: fresh.can_write_capsules,
      can_share_capsules: fresh.can_share_capsules,
      can_create_hives: fresh.can_create_hives,
      can_access_external_api: fresh.can_access_external_api,
      can_admin_niov: fresh.can_admin_niov,
      can_admin_org: fresh.can_admin_org,
      clearance_ceiling: fresh.clearance_ceiling,
      monetization_role: fresh.monetization_role,
      compliance_frameworks: fresh.compliance_frameworks,
      status: fresh.status,
    });
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: entity.entity_id },
      data: { tar_hash: newHash },
    });
  }
  if (opts.status !== undefined && opts.status !== "ACTIVE") {
    await prisma.entity.update({
      where: { entity_id: entity.entity_id },
      data: { status: opts.status },
    });
  }
  if (opts.deleted === true) {
    await prisma.entity.update({
      where: { entity_id: entity.entity_id },
      data: { deleted_at: new Date() },
    });
  }
  return entity.entity_id;
}

// WHAT: Create a parent org Entity (COMPANY) and add a child membership row
//        for each child entity_id so the resolver Class B query joins through
//        EntityMembership correctly.
// INPUT: An array of child entity_ids to attach to a new org.
// OUTPUT: The new org's entity_id.
// WHY: Class B (org-admin) requires the candidate to be an active child of
//      the same parent org as the caller; the test seeds the membership
//      shape directly.
async function makeOrgWithMembers(
  childIds: readonly string[],
): Promise<string> {
  const org = await createEntity(
    makeEntityInput({ entity_type: "COMPANY" }),
  );
  for (const childId of childIds) {
    await prisma.entityMembership.create({
      data: {
        parent_id: org.entity_id,
        child_id: childId,
        is_admin: true,
        is_active: true,
      },
    });
  }
  return org.entity_id;
}

// WHAT: Build a fake PrivilegedEndpoint with the requested authTier + optional
//        explicit-target metadata, mirroring the runtime registry shape.
// INPUT: { authTier, explicitTarget? }.
// OUTPUT: A PrivilegedEndpoint usable for resolveDualControlTarget.
// WHY: The resolver discriminates on actionDescriptor.metadata.target_entity_id
//      (Class A) and on endpoint.authTier (Class B vs Class C). Building the
//      descriptor inline keeps the test independent of the LIVE registry.
function fakeEndpoint(opts: {
  authTier: "can_admin_niov" | "can_admin_org";
  explicitTarget?: string;
}): PrivilegedEndpoint {
  return {
    method: "POST",
    route: "/api/v1/__test__",
    authTier: opts.authTier,
    actionDescriptor: {
      type: "PLATFORM_MONETIZATION_CONFIG_UPDATE",
      ...(opts.explicitTarget !== undefined
        ? { metadata: { target_entity_id: opts.explicitTarget } }
        : {}),
    },
  };
}

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterEach(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("resolveDualControlTarget Class C (platform-admin)", () => {
  it("picks the deterministic lowest-entity_id non-caller candidate from a multi-admin pool", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    const admin1 = await makeEntityWithCapability({ can_admin_niov: true });
    const admin2 = await makeEntityWithCapability({ can_admin_niov: true });
    const admin3 = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_niov" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).not.toBe(caller);
      expect(result.resolution_reason).toBe("platform-admin-pool");
      const expectedLowest = [admin1, admin2, admin3]
        .filter((id) => id !== caller)
        .sort()[0];
      expect(result.target_entity_id).toBe(expectedLowest);
    }
  });

  it("excludes the caller from the candidate set even when the caller IS can_admin_niov", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    const otherAdmin = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_niov" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(otherAdmin);
      expect(result.target_entity_id).not.toBe(caller);
    }
  });

  it("returns NO_ELIGIBLE_TARGET when the caller is the only can_admin_niov entity", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_niov" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NO_ELIGIBLE_TARGET");
    }
  });

  it("excludes soft-deleted (deleted_at not null) candidates", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    await makeEntityWithCapability({ can_admin_niov: true, deleted: true });
    const activeAdmin = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_niov" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(activeAdmin);
    }
  });

  it("excludes non-ACTIVE (suspended) candidates", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    await makeEntityWithCapability({
      can_admin_niov: true,
      status: "SUSPENDED",
    });
    const activeAdmin = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_niov" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(activeAdmin);
    }
  });
});

describe("resolveDualControlTarget Class B (org-admin)", () => {
  it("never returns a cross-org candidate (caller in org A, only candidate is org-B admin)", async () => {
    const callerOrgAdmin = await makeEntityWithCapability({
      can_admin_org: true,
    });
    const crossOrgAdmin = await makeEntityWithCapability({
      can_admin_org: true,
    });
    await makeOrgWithMembers([callerOrgAdmin]);
    await makeOrgWithMembers([crossOrgAdmin]);

    const result = await resolveDualControlTarget(
      callerOrgAdmin,
      fakeEndpoint({ authTier: "can_admin_org" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NO_ELIGIBLE_TARGET");
    }
  });

  it("returns the lowest-entity_id non-caller org-admin from the SAME org", async () => {
    const callerOrgAdmin = await makeEntityWithCapability({
      can_admin_org: true,
    });
    const peerOrgAdmin1 = await makeEntityWithCapability({
      can_admin_org: true,
    });
    const peerOrgAdmin2 = await makeEntityWithCapability({
      can_admin_org: true,
    });
    await makeOrgWithMembers([callerOrgAdmin, peerOrgAdmin1, peerOrgAdmin2]);

    const result = await resolveDualControlTarget(
      callerOrgAdmin,
      fakeEndpoint({ authTier: "can_admin_org" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolution_reason).toBe("org-admin-pool");
      expect(result.target_entity_id).not.toBe(callerOrgAdmin);
      const expectedLowest = [peerOrgAdmin1, peerOrgAdmin2].sort()[0];
      expect(result.target_entity_id).toBe(expectedLowest);
    }
  });

  it("does NOT cross-leak even when a cross-org admin has can_admin_niov (Class B is org-scoped by construction)", async () => {
    const callerOrgAdmin = await makeEntityWithCapability({
      can_admin_org: true,
    });
    const peerOrgAdmin = await makeEntityWithCapability({
      can_admin_org: true,
    });
    const crossOrgNiov = await makeEntityWithCapability({
      can_admin_niov: true,
      can_admin_org: true,
    });
    await makeOrgWithMembers([callerOrgAdmin, peerOrgAdmin]);
    await makeOrgWithMembers([crossOrgNiov]);

    const result = await resolveDualControlTarget(
      callerOrgAdmin,
      fakeEndpoint({ authTier: "can_admin_org" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(peerOrgAdmin);
      expect(result.target_entity_id).not.toBe(crossOrgNiov);
    }
  });

  it("returns NO_ELIGIBLE_TARGET when caller has no active org membership", async () => {
    const isolated = await makeEntityWithCapability({ can_admin_org: true });

    const result = await resolveDualControlTarget(
      isolated,
      fakeEndpoint({ authTier: "can_admin_org" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("NO_ELIGIBLE_TARGET");
    }
  });

  // [PROD-UX-BUGD regression] Once org-hierarchy manager edges exist
  // (person→person EntityMembership with hierarchy_level above the org
  // edge's), the old resolution — "the caller's membership with the highest
  // hierarchy_level is the org" — resolved the caller's MANAGER as "the org".
  // No admin is a child of a person, so every dual-control action for anyone
  // with a manager failed NO_ELIGIBLE_TARGET (live: sends REJECTED instead of
  // queueing for approval). The org must be the COMPANY entity, always.
  it("resolves the ORG admin even when the caller has a manager edge with a higher hierarchy_level", async () => {
    const caller = await makeEntityWithCapability({});
    const manager = await makeEntityWithCapability({});
    const orgAdmin = await makeEntityWithCapability({ can_admin_org: true });
    const orgId = await makeOrgWithMembers([caller, manager, orgAdmin]);
    // The org edges above default hierarchy_level; the manager edge sits
    // DEEPER in the hierarchy (higher level) — the exact live shape after
    // hierarchy authoring.
    await prisma.entityMembership.updateMany({
      where: { parent_id: orgId, child_id: caller },
      data: { hierarchy_level: 1 },
    });
    await prisma.entityMembership.create({
      data: {
        parent_id: manager,
        child_id: caller,
        is_active: true,
        hierarchy_level: 3,
      },
    });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({ authTier: "can_admin_org" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(orgAdmin);
      expect(result.resolution_reason).toBe("org-admin-pool");
    }
  });
});

describe("resolveDualControlTarget Class A (explicit metadata)", () => {
  it("returns the explicit metadata target ahead of Class B/C when present", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    const explicitApprover = await makeEntityWithCapability({
      can_admin_niov: true,
    });
    // A second platform admin -- would be picked by Class C if Class A
    // did not short-circuit. Used here to prove explicit-metadata wins.
    await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({
        authTier: "can_admin_niov",
        explicitTarget: explicitApprover,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target_entity_id).toBe(explicitApprover);
      expect(result.resolution_reason).toBe("explicit-metadata");
    }
  });

  it("returns INVALID_CANDIDATE when the explicit target equals the caller", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({
        authTier: "can_admin_niov",
        explicitTarget: caller,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_CANDIDATE");
    }
  });

  it("returns INVALID_CANDIDATE when the explicit target is soft-deleted", async () => {
    const caller = await makeEntityWithCapability({ can_admin_niov: true });
    const deletedApprover = await makeEntityWithCapability({
      can_admin_niov: true,
      deleted: true,
    });

    const result = await resolveDualControlTarget(
      caller,
      fakeEndpoint({
        authTier: "can_admin_niov",
        explicitTarget: deletedApprover,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_CANDIDATE");
    }
  });
});
