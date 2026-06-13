// FILE: authority-context.test.ts (unit)
// PURPOSE: Phase 1273 locks for the AUTHORITY substrate. Proves
//          instructions gain organizational weight:
//            1. the RBAC/ABAC matrix decides by hierarchy — manager vs
//               peer vs unresolved target produce different decisions
//            2. manager authority (Sadeil = org-admin) makes internal
//               scheduling ALLOW_WITH_CONFIRMATION, NOT a generic draft
//            3. a peer requires the target's confirmation
//            4. an unknown name (Alex) resolves to NOT_FOUND — never a
//               fabricated participant
//            5. Twin intercession is RUNTIME_MISSING (no fake answer);
//               external sends REQUIRE_APPROVAL
//          prisma + getOrgEntityId are mocked; the matrix is pure.
// CONNECTS TO: apps/api/src/services/work-os/authority-context.service.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, getOrgEntityIdMock } = vi.hoisted(() => ({
  prismaMock: {
    entityMembership: { findMany: vi.fn(), findFirst: vi.fn() },
    tokenAttributeRepository: { findUnique: vi.fn() },
    entityProfile: { findUnique: vi.fn() },
  },
  getOrgEntityIdMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});

vi.mock("../../apps/api/src/services/governance/org.js", () => ({
  getOrgEntityId: getOrgEntityIdMock,
}));

import {
  evaluateWorkOsAction,
  buildAuthorityContext,
  resolveTargetInOrg,
  type AuthorityContext,
} from "../../apps/api/src/services/work-os/authority-context.service.js";

const ORG = "org-niov";
const SADEIL = "ent-sadeil";

function ctx(over: Partial<AuthorityContext>): AuthorityContext {
  return {
    caller_entity_id: SADEIL,
    org_entity_id: ORG,
    caller_role_title: "ORG_ADMIN",
    caller_can_admin_org: true,
    caller_is_admin_membership: true,
    target_resolution: "RESOLVED_INTERNAL_ENTITY",
    target_entity_id: "ent-vishesh",
    target_display_name: "Vishesh Sharma",
    target_role_title: "AI UI ENGINEER",
    caller_is_manager_of_target: true,
    caller_can_view_target_calendar: true,
    caller_can_schedule_with_target: true,
    caller_can_assign_task_to_target: true,
    caller_can_request_confirmation_from_target: true,
    caller_can_use_target_twin: false,
    ...over,
  };
}

beforeEach(() => {
  prismaMock.entityMembership.findMany.mockReset();
  prismaMock.entityMembership.findFirst.mockReset();
  prismaMock.tokenAttributeRepository.findUnique.mockReset();
  prismaMock.entityProfile.findUnique.mockReset();
  prismaMock.entityProfile.findUnique.mockResolvedValue(null);
  getOrgEntityIdMock.mockReset();
});

describe("evaluateWorkOsAction — RBAC/ABAC matrix", () => {
  it("manager scheduling an internal meeting → ALLOW_WITH_CONFIRMATION (not a generic draft)", () => {
    const r = evaluateWorkOsAction("CREATE_INTERNAL_MEETING", ctx({}));
    expect(r.decision).toBe("ALLOW_WITH_CONFIRMATION");
    expect(r.reason_code).toBe("MANAGER_AUTHORITY");
  });

  it("peer scheduling an internal meeting → REQUIRES_TARGET_CONFIRMATION", () => {
    const r = evaluateWorkOsAction(
      "CREATE_INTERNAL_MEETING",
      ctx({ caller_is_manager_of_target: false, caller_can_admin_org: false }),
    );
    expect(r.decision).toBe("REQUIRES_TARGET_CONFIRMATION");
  });

  it("manager reading a direct report's free/busy → ALLOW; peer → REQUIRES_TARGET_CONFIRMATION", () => {
    expect(
      evaluateWorkOsAction("READ_CALENDAR_FREEBUSY_TARGET", ctx({})).decision,
    ).toBe("ALLOW");
    expect(
      evaluateWorkOsAction(
        "READ_CALENDAR_FREEBUSY_TARGET",
        ctx({ caller_is_manager_of_target: false }),
      ).decision,
    ).toBe("REQUIRES_TARGET_CONFIRMATION");
  });

  it("manager assigning a task → ALLOW_WITH_CONFIRMATION; peer → REQUIRES_TARGET_CONFIRMATION", () => {
    expect(evaluateWorkOsAction("ASSIGN_TASK", ctx({})).decision).toBe(
      "ALLOW_WITH_CONFIRMATION",
    );
    expect(
      evaluateWorkOsAction(
        "ASSIGN_TASK",
        ctx({ caller_is_manager_of_target: false }),
      ).decision,
    ).toBe("REQUIRES_TARGET_CONFIRMATION");
  });

  it("unresolved target blocks every target-bearing action with TARGET_NOT_FOUND", () => {
    const r = evaluateWorkOsAction(
      "CREATE_INTERNAL_MEETING",
      ctx({ target_resolution: "NOT_FOUND", target_entity_id: null }),
    );
    expect(r.decision).toBe("BLOCKED");
    expect(r.reason_code).toBe("TARGET_NOT_FOUND");
  });

  it("Twin intercession is RUNTIME_MISSING (no fake answer); free/busy-self ALLOW; external send REQUIRES_APPROVAL", () => {
    expect(evaluateWorkOsAction("ASK_TWIN", ctx({})).decision).toBe(
      "RUNTIME_MISSING",
    );
    expect(
      evaluateWorkOsAction("READ_CALENDAR_FREEBUSY_SELF", ctx({})).decision,
    ).toBe("ALLOW");
    expect(
      evaluateWorkOsAction("SEND_EXTERNAL_EMAIL", ctx({})).decision,
    ).toBe("REQUIRES_APPROVAL");
  });
});

describe("resolveTargetInOrg + buildAuthorityContext (live-data derived)", () => {
  const roster = [
    {
      role_title: "AI UI ENGINEER",
      child: { entity_id: "ent-vishesh", display_name: "Vishesh Sharma", entity_type: "PERSON" },
    },
    {
      role_title: "AI/NLP ENGINEER",
      child: { entity_id: "ent-samiksha", display_name: "Samiksha Sharma", entity_type: "PERSON" },
    },
    {
      role_title: "TECH LEAD",
      child: { entity_id: "ent-david", display_name: "David Odie", entity_type: "PERSON" },
    },
  ];

  it("resolves Vishesh to one internal entity", async () => {
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);
    const r = await resolveTargetInOrg(ORG, "Vishesh");
    expect(r.code).toBe("RESOLVED_INTERNAL_ENTITY");
    expect(r.match?.entity_id).toBe("ent-vishesh");
  });

  it("returns NOT_FOUND for an unknown Alex — never invents a person", async () => {
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);
    const r = await resolveTargetInOrg(ORG, "Alex");
    expect(r.code).toBe("NOT_FOUND");
    expect(r.match).toBeNull();
  });

  it("Sadeil (can_admin_org) is manager of Vishesh; scheduling is manager-authorized", async () => {
    getOrgEntityIdMock.mockResolvedValue(ORG);
    prismaMock.tokenAttributeRepository.findUnique.mockResolvedValue({
      can_admin_org: true,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      role_title: "ORG_ADMIN",
      is_admin: true,
    });
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);

    const context = await buildAuthorityContext({
      caller_entity_id: SADEIL,
      target_name: "Vishesh",
    });
    expect(context.target_resolution).toBe("RESOLVED_INTERNAL_ENTITY");
    expect(context.caller_is_manager_of_target).toBe(true);
    expect(context.caller_can_view_target_calendar).toBe(true);
    expect(evaluateWorkOsAction("CREATE_INTERNAL_MEETING", context).decision).toBe(
      "ALLOW_WITH_CONFIRMATION",
    );
  });

  it("an employee caller (no admin) is NOT a manager of a peer", async () => {
    getOrgEntityIdMock.mockResolvedValue(ORG);
    prismaMock.tokenAttributeRepository.findUnique.mockResolvedValue({
      can_admin_org: false,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      role_title: "AI/NLP ENGINEER",
      is_admin: false,
    });
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);

    const context = await buildAuthorityContext({
      caller_entity_id: "ent-samiksha",
      target_name: "Vishesh",
    });
    expect(context.caller_is_manager_of_target).toBe(false);
    expect(evaluateWorkOsAction("CREATE_INTERNAL_MEETING", context).decision).toBe(
      "REQUIRES_TARGET_CONFIRMATION",
    );
  });

  it("reads real EntityProfile timezones (nullable) + a labeled org default", async () => {
    getOrgEntityIdMock.mockResolvedValue(ORG);
    prismaMock.tokenAttributeRepository.findUnique.mockResolvedValue({
      can_admin_org: true,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      role_title: "ORG_ADMIN",
      is_admin: true,
    });
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);
    // Caller has a configured zone; target has none → null (never faked).
    prismaMock.entityProfile.findUnique
      .mockResolvedValueOnce({ timezone: "America/Los_Angeles" }) // caller
      .mockResolvedValueOnce({ timezone: null }); // target

    const context = await buildAuthorityContext({
      caller_entity_id: SADEIL,
      target_name: "Vishesh",
    });
    expect(context.caller_timezone).toBe("America/Los_Angeles");
    expect(context.target_timezone).toBeNull();
    expect(context.org_default_timezone).toBe("America/Los_Angeles");
  });

  it("unknown target yields NOT_FOUND in the built context", async () => {
    getOrgEntityIdMock.mockResolvedValue(ORG);
    prismaMock.tokenAttributeRepository.findUnique.mockResolvedValue({
      can_admin_org: true,
    });
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      role_title: "ORG_ADMIN",
      is_admin: true,
    });
    prismaMock.entityMembership.findMany.mockResolvedValue(roster);

    const context = await buildAuthorityContext({
      caller_entity_id: SADEIL,
      target_name: "Alex",
    });
    expect(context.target_resolution).toBe("NOT_FOUND");
    expect(context.caller_is_manager_of_target).toBe(false);
  });
});
