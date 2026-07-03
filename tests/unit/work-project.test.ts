// FILE: work-project.test.ts (unit)
// PURPOSE: Phase 1 PR 1 — unit coverage for the WorkProject
//          substrate service. Mocked prisma + writeAuditEvent.
// CONNECTS TO:
//   - apps/api/src/services/otzar/work-project.service.ts

import { describe, expect, it, beforeEach, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    workProject: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    workProjectMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    entityMembership: {
      findFirst: vi.fn(),
    },
  },
  auditMock: vi.fn(),
}));

vi.mock("@niov/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    prisma: prismaMock,
    writeAuditEvent: auditMock,
  };
});

import {
  addWorkProjectMemberForCaller,
  archiveWorkProjectForCaller,
  createWorkProjectForCaller,
  isActiveProjectMember,
  listWorkProjectMembersForCaller,
  listWorkProjectsForCaller,
  projectWorkProjectSafeView,
} from "../../apps/api/src/services/otzar/work-project.service.js";

const CALLER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "33333333-3333-3333-3333-333333333333";
const PROJECT_ID = "44444444-4444-4444-4444-444444444444";

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    org_entity_id: ORG_ID,
    name: "Phoenix",
    state: "ACTIVE" as const,
    created_by_entity_id: CALLER_ID,
    archived_at: null,
    created_at: new Date("2026-06-03T12:00:00.000Z"),
    updated_at: new Date("2026-06-03T12:00:00.000Z"),
    ...overrides,
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    project_member_id: "55555555-5555-5555-5555-555555555555",
    project_id: PROJECT_ID,
    org_entity_id: ORG_ID,
    entity_id: CALLER_ID,
    role: "OWNER" as const,
    created_at: new Date("2026-06-03T12:00:00.000Z"),
    updated_at: new Date("2026-06-03T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.workProject.create.mockReset();
  prismaMock.workProject.findUnique.mockReset();
  prismaMock.workProject.findMany.mockReset();
  prismaMock.workProject.update.mockReset();
  prismaMock.workProjectMember.create.mockReset();
  prismaMock.workProjectMember.findUnique.mockReset();
  prismaMock.workProjectMember.findMany.mockReset();
  prismaMock.entityMembership.findFirst.mockReset();
  auditMock.mockReset();
  auditMock.mockResolvedValue({ audit_id: "audit-test-1" });
});

describe("projectWorkProjectSafeView", () => {
  it("marks ACTIVE projects as archivable; ARCHIVED not", () => {
    expect(projectWorkProjectSafeView(projectRow()).archivable).toBe(true);
    expect(
      projectWorkProjectSafeView(projectRow({ state: "ARCHIVED" })).archivable,
    ).toBe(false);
  });
});

describe("createWorkProjectForCaller", () => {
  it("creates project + OWNER membership + emits WORK_PROJECT_CREATED audit", async () => {
    prismaMock.workProject.create.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.create.mockResolvedValue(memberRow());
    const view = await createWorkProjectForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      name: "Phoenix",
    });
    expect(prismaMock.workProject.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.workProjectMember.create).toHaveBeenCalledTimes(1);
    const memberCall =
      prismaMock.workProjectMember.create.mock.calls[0]?.[0];
    expect(memberCall.data.role).toBe("OWNER");
    expect(memberCall.data.entity_id).toBe(CALLER_ID);
    const auditCall = auditMock.mock.calls[0]?.[0];
    expect(auditCall.details.action).toBe("WORK_PROJECT_CREATED");
    expect(view.project_id).toBe(PROJECT_ID);
    expect(view.archivable).toBe(true);
  });

  it("bounds project name to 200 chars", async () => {
    prismaMock.workProject.create.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.create.mockResolvedValue(memberRow());
    const oversize = "x".repeat(500);
    await createWorkProjectForCaller({
      callerEntityId: CALLER_ID,
      orgEntityId: ORG_ID,
      name: oversize,
    });
    const createCall = prismaMock.workProject.create.mock.calls[0]?.[0];
    expect(createCall.data.name.length).toBeLessThanOrEqual(200);
  });
});

describe("listWorkProjectsForCaller", () => {
  it("returns [] when caller has no memberships", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([]);
    const r = await listWorkProjectsForCaller({ callerEntityId: CALLER_ID });
    expect(r).toEqual([]);
  });

  it("self-scopes via membership.entity_id", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: PROJECT_ID },
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([projectRow()]);
    await listWorkProjectsForCaller({ callerEntityId: CALLER_ID });
    const memberCall =
      prismaMock.workProjectMember.findMany.mock.calls[0]?.[0];
    expect(memberCall.where.entity_id).toBe(CALLER_ID);
  });

  it("respects state filter", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: PROJECT_ID },
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([]);
    await listWorkProjectsForCaller({
      callerEntityId: CALLER_ID,
      state: "ARCHIVED",
    });
    const findManyCall = prismaMock.workProject.findMany.mock.calls[0]?.[0];
    expect(findManyCall.where.state).toBe("ARCHIVED");
  });

  it("caps take to 100", async () => {
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      { project_id: PROJECT_ID },
    ]);
    prismaMock.workProject.findMany.mockResolvedValue([]);
    await listWorkProjectsForCaller({
      callerEntityId: CALLER_ID,
      take: 9999,
    });
    const call = prismaMock.workProject.findMany.mock.calls[0]?.[0];
    expect(call.take).toBe(100);
  });
});

describe("addWorkProjectMemberForCaller", () => {
  it("PROJECT_NOT_FOUND when missing", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(null);
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toEqual({ ok: false, code: "PROJECT_NOT_FOUND" });
  });

  it("PROJECT_ARCHIVED when project archived", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(
      projectRow({ state: "ARCHIVED" }),
    );
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toEqual({ ok: false, code: "PROJECT_ARCHIVED" });
  });

  it("NOT_PROJECT_OWNER when caller is not OWNER", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.findUnique.mockResolvedValue(
      memberRow({ role: "MEMBER" }),
    );
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_PROJECT_OWNER" });
  });

  it("CROSS_ORG_DENIED when candidate is in another org", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    prismaMock.entityMembership.findFirst.mockResolvedValue(null); // not in org
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toEqual({ ok: false, code: "CROSS_ORG_DENIED" });
  });

  it("ALREADY_MEMBER when entity is already in the project", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.findUnique
      .mockResolvedValueOnce(memberRow()) // caller OWNER
      .mockResolvedValueOnce(memberRow({ entity_id: OTHER_ID, role: "MEMBER" })); // candidate already
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: OTHER_ID,
    });
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toEqual({ ok: false, code: "ALREADY_MEMBER", membership_id: expect.any(String) });
  });

  it("happy path adds MEMBER + emits WORK_PROJECT_MEMBER_ADDED audit", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.findUnique
      .mockResolvedValueOnce(memberRow()) // caller OWNER
      .mockResolvedValueOnce(null); // candidate not yet a member
    prismaMock.entityMembership.findFirst.mockResolvedValue({
      child_id: OTHER_ID,
    });
    prismaMock.workProjectMember.create.mockResolvedValue(
      memberRow({ entity_id: OTHER_ID, role: "MEMBER" }),
    );
    const r = await addWorkProjectMemberForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.member.role).toBe("MEMBER");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "WORK_PROJECT_MEMBER_ADDED",
    );
  });
});

describe("listWorkProjectMembersForCaller", () => {
  it("NOT_PROJECT_MEMBER when caller is not a member", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue({
      project_id: PROJECT_ID,
    });
    prismaMock.workProjectMember.findUnique.mockResolvedValue(null);
    const r = await listWorkProjectMembersForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
    });
    expect(r).toEqual({ ok: false, code: "NOT_PROJECT_MEMBER" });
  });

  it("returns members when caller is a member", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue({
      project_id: PROJECT_ID,
    });
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    prismaMock.workProjectMember.findMany.mockResolvedValue([
      memberRow(),
      memberRow({ entity_id: OTHER_ID, role: "MEMBER" }),
    ]);
    const r = await listWorkProjectMembersForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.members.length).toBe(2);
  });
});

describe("archiveWorkProjectForCaller", () => {
  it("ARCHIVES + emits WORK_PROJECT_ARCHIVED audit for OWNER", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(projectRow());
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    prismaMock.workProject.update.mockResolvedValue(
      projectRow({ state: "ARCHIVED", archived_at: new Date() }),
    );
    const r = await archiveWorkProjectForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.state).toBe("ARCHIVED");
    expect(auditMock.mock.calls[0]?.[0].details.action).toBe(
      "WORK_PROJECT_ARCHIVED",
    );
  });

  it("ALREADY_ARCHIVED idempotency", async () => {
    prismaMock.workProject.findUnique.mockResolvedValue(
      projectRow({ state: "ARCHIVED" }),
    );
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    const r = await archiveWorkProjectForCaller({
      callerEntityId: CALLER_ID,
      projectId: PROJECT_ID,
    });
    expect(r).toEqual({ ok: false, code: "ALREADY_ARCHIVED" });
  });
});

describe("isActiveProjectMember", () => {
  it("returns true when entity is a member of an ACTIVE project", async () => {
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    prismaMock.workProject.findUnique.mockResolvedValue({ state: "ACTIVE" });
    const r = await isActiveProjectMember({
      projectId: PROJECT_ID,
      entityId: CALLER_ID,
    });
    expect(r).toBe(true);
  });

  it("returns false when entity is not a member", async () => {
    prismaMock.workProjectMember.findUnique.mockResolvedValue(null);
    const r = await isActiveProjectMember({
      projectId: PROJECT_ID,
      entityId: OTHER_ID,
    });
    expect(r).toBe(false);
  });

  it("returns false when entity is a member but project is ARCHIVED", async () => {
    prismaMock.workProjectMember.findUnique.mockResolvedValue(memberRow());
    prismaMock.workProject.findUnique.mockResolvedValue({ state: "ARCHIVED" });
    const r = await isActiveProjectMember({
      projectId: PROJECT_ID,
      entityId: CALLER_ID,
    });
    expect(r).toBe(false);
  });
});
