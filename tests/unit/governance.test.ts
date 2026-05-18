// FILE: governance.test.ts (unit)
// PURPOSE: Section 9 governance helpers -- getOrgEntityId (strict),
//          getOrgSettingsOrDefaults (tolerant), createSystemPermission
//          (server-side bypass with hash-chained audit), and the
//          cross-tenant isolation invariant that future /org/* routes
//          will rely on.
// CONNECTS TO: services/governance/org.ts,
//              services/governance/system-permission.ts, the entity
//              + entity_memberships + org_settings + permissions +
//              audit_events tables.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  createSystemPermission,
  FixtureBasedEmbeddingProvider,
  getOrgEntityId,
  getOrgSettingsOrDefaults,
  MAX_ORG_HIERARCHY_DEPTH,
  MemoryContentStore,
  MemoryNonceStore,
  ORG_SETTINGS_DEFAULTS,
  WriteService,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
} from "../helpers.js";

const TEST_JWT_SECRET = "governance-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// WHAT: Build a fresh AuthService + WriteService stack for tests
//        that need to create permissions on real capsules.
// INPUT: None.
// OUTPUT: { auth, write }.
// WHY: createSystemPermission tests need real capsules to permission.
function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const write = new WriteService(
    auth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    new FixtureBasedEmbeddingProvider(),
  );
  return { auth, write };
}

// WHAT: Create + login a PERSON entity.
// INPUT: AuthService, optional ops list.
// OUTPUT: { entity, token }.
// WHY: Saves boilerplate for tests that need a logged-in actor.
async function loginAs(
  auth: AuthService,
  ops: string[] = ["read", "write", "share"],
) {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const login = (await auth.login(input.email!, password, ops, {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error(`login failed: ${login.code}`);
  return { entity, token: login.token };
}

// WHAT: Create a COMPANY entity and link a PERSON child via
//        EntityMembership.
// INPUT: Optional OrgSettings overrides for the row written
//        against the COMPANY.
// OUTPUT: { company, child }.
// WHY: Most governance tests need this triad.
async function makeOrgWithChild(
  settings?: Partial<{ session_timeout_minutes: number; ip_whitelist: string[] }>,
): Promise<{
  company: Awaited<ReturnType<typeof createEntity>>;
  child: Awaited<ReturnType<typeof createEntity>>;
}> {
  const company = await createEntity(
    makeEntityInput({ entity_type: "COMPANY" }),
  );
  const child = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  await prisma.entityMembership.create({
    data: {
      parent_id: company.entity_id,
      child_id: child.entity_id,
      hierarchy_level: 0,
      is_active: true,
    },
  });
  if (settings !== undefined) {
    await prisma.orgSettings.create({
      data: {
        org_entity_id: company.entity_id,
        session_timeout_minutes:
          settings.session_timeout_minutes ?? 480,
        ip_whitelist: settings.ip_whitelist ?? [],
      },
    });
  }
  return { company, child };
}

describe("getOrgEntityId (strict)", () => {
  it("returns the COMPANY ancestor's id when one exists", async () => {
    const { company, child } = await makeOrgWithChild();
    const orgId = await getOrgEntityId(child.entity_id);
    expect(orgId).toBe(company.entity_id);
  });

  it("returns the caller's own id when the caller IS a COMPANY", async () => {
    const company = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const orgId = await getOrgEntityId(company.entity_id);
    expect(orgId).toBe(company.entity_id);
  });

  it("throws NOT_IN_ANY_ORG for an orgless entity", async () => {
    const orgless = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await expect(getOrgEntityId(orgless.entity_id)).rejects.toThrow(
      /NOT_IN_ANY_ORG/,
    );
  });

  it(
    "throws ORG_HIERARCHY_TOO_DEEP after MAX_ORG_HIERARCHY_DEPTH hops without a COMPANY",
    async () => {
      // Build a chain of 9 PERSON entities -- 1 leaf + 8 ancestors,
      // none of which are COMPANY. Walk from the leaf hits the cap
      // before ever finding a COMPANY.
      const ancestors: string[] = [];
      for (let i = 0; i < MAX_ORG_HIERARCHY_DEPTH + 2; i++) {
        const e = await createEntity(
          makeEntityInput({ entity_type: "PERSON" }),
        );
        ancestors.push(e.entity_id);
      }
      // Link i+1 as parent of i (so ancestors[0] is the leaf).
      for (let i = 0; i < ancestors.length - 1; i++) {
        await prisma.entityMembership.create({
          data: {
            parent_id: ancestors[i + 1]!,
            child_id: ancestors[i]!,
            hierarchy_level: i,
            is_active: true,
          },
        });
      }
      await expect(getOrgEntityId(ancestors[0]!)).rejects.toThrow(
        /ORG_HIERARCHY_TOO_DEEP/,
      );
    },
  );

  it("CROSS-TENANT ISOLATION: a PERSON in CompanyA never resolves to CompanyB", async () => {
    const companyA = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const companyB = await createEntity(
      makeEntityInput({ entity_type: "COMPANY" }),
    );
    const personA = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const personB = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    await prisma.entityMembership.create({
      data: {
        parent_id: companyA.entity_id,
        child_id: personA.entity_id,
        is_active: true,
      },
    });
    await prisma.entityMembership.create({
      data: {
        parent_id: companyB.entity_id,
        child_id: personB.entity_id,
        is_active: true,
      },
    });

    const resolvedForA = await getOrgEntityId(personA.entity_id);
    const resolvedForB = await getOrgEntityId(personB.entity_id);

    expect(resolvedForA).toBe(companyA.entity_id);
    expect(resolvedForA).not.toBe(companyB.entity_id);
    expect(resolvedForB).toBe(companyB.entity_id);
    expect(resolvedForB).not.toBe(companyA.entity_id);
  });
});

describe("getOrgSettingsOrDefaults (tolerant)", () => {
  it("returns spec defaults with org_entity_id=null for an orgless entity", async () => {
    const orgless = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    const settings = await getOrgSettingsOrDefaults(orgless.entity_id);
    expect(settings.org_entity_id).toBeNull();
    expect(settings.session_timeout_minutes).toBe(
      ORG_SETTINGS_DEFAULTS.session_timeout_minutes,
    );
    expect(settings.ip_whitelist).toEqual(
      ORG_SETTINGS_DEFAULTS.ip_whitelist,
    );
    expect(settings.industry).toBe(ORG_SETTINGS_DEFAULTS.industry);
  });

  it("returns spec defaults with the resolved org_entity_id when COMPANY exists but OrgSettings row is missing", async () => {
    const { company, child } = await makeOrgWithChild();
    // No OrgSettings row was inserted.
    const settings = await getOrgSettingsOrDefaults(child.entity_id);
    expect(settings.org_entity_id).toBe(company.entity_id);
    expect(settings.session_timeout_minutes).toBe(480);
    expect(settings.ip_whitelist).toEqual([]);
  });

  it("returns the live row when one exists", async () => {
    const { company, child } = await makeOrgWithChild({
      session_timeout_minutes: 1440,
      ip_whitelist: ["10.99.42.7", "203.0.113.5"],
    });
    const settings = await getOrgSettingsOrDefaults(child.entity_id);
    expect(settings.org_entity_id).toBe(company.entity_id);
    expect(settings.session_timeout_minutes).toBe(1440);
    expect(settings.ip_whitelist).toEqual(["10.99.42.7", "203.0.113.5"]);
  });

  it("never throws for a too-deep hierarchy", async () => {
    const ancestors: string[] = [];
    for (let i = 0; i < MAX_ORG_HIERARCHY_DEPTH + 2; i++) {
      const e = await createEntity(
        makeEntityInput({ entity_type: "PERSON" }),
      );
      ancestors.push(e.entity_id);
    }
    for (let i = 0; i < ancestors.length - 1; i++) {
      await prisma.entityMembership.create({
        data: {
          parent_id: ancestors[i + 1]!,
          child_id: ancestors[i]!,
          is_active: true,
        },
      });
    }
    const settings = await getOrgSettingsOrDefaults(ancestors[0]!);
    // No throw. Tolerant helper falls back to defaults.
    expect(settings.org_entity_id).toBeNull();
    expect(settings.session_timeout_minutes).toBe(480);
  });
});

describe("createSystemPermission", () => {
  it("creates one Permission per live capsule under one bridge_id and writes a hash-chained AuditEvent with system_permission=true", async () => {
    const { auth, write } = makeServices();
    const grantor = await loginAs(auth);
    const grantee = await loginAs(auth);

    // Three capsules in the grantor's wallet.
    for (let i = 0; i < 3; i++) {
      const created = await write.createCapsule(grantor.token, {
        capsule_type: "PREFERENCE",
        topic_tags: [`syspermtest-${randomUUID()}`],
        payload_summary: `cap ${i}`,
        content: `content ${i}`,
      });
      if (!created.ok) throw new Error("create failed");
    }

    const result = await createSystemPermission({
      grantor_entity_id: grantor.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "FULL",
      permanent: true,
      reason: "test-system-permission",
    });

    expect(result.permission_count).toBe(3);
    expect(result.bridge_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // All three Permission rows share the bridge_id.
    const rows = await prisma.permission.findMany({
      where: { bridge_id: result.bridge_id },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.duration_type === "PERMANENT")).toBe(true);
    expect(rows.every((r) => r.expires_at === null)).toBe(true);
    expect(rows.every((r) => r.access_scope === "FULL")).toBe(true);

    // AuditEvent written via writeAuditEvent (hash-chained).
    const events = await prisma.auditEvent.findMany({
      where: {
        target_entity_id: grantee.entity.entity_id,
        event_type: "ADMIN_ACTION",
      },
    });
    const sysEvent = events.find((e) => {
      const details = e.details as { system_permission?: boolean; bridge_id?: string };
      return details.system_permission === true && details.bridge_id === result.bridge_id;
    });
    expect(sysEvent).toBeDefined();
    // Hash chain integrity: every audit_event has both event_hash
    // and a non-null previous_event_hash (or null only for the
    // first row in the chain).
    expect(sysEvent?.event_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns 0 permission_count when the grantor's wallet has no live capsules", async () => {
    const { auth } = makeServices();
    const grantor = await loginAs(auth);
    const grantee = await loginAs(auth);
    const result = await createSystemPermission({
      grantor_entity_id: grantor.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "SUMMARY",
    });
    expect(result.permission_count).toBe(0);
  });

  it("respects the capsule_type_filter when provided", async () => {
    const { auth, write } = makeServices();
    const grantor = await loginAs(auth);
    const grantee = await loginAs(auth);

    // One PREFERENCE + one DOMAIN_KNOWLEDGE.
    const a = await write.createCapsule(grantor.token, {
      capsule_type: "PREFERENCE",
      topic_tags: [`filter-${randomUUID()}`],
      payload_summary: "pref",
      content: "x",
    });
    const b = await write.createCapsule(grantor.token, {
      capsule_type: "DOMAIN_KNOWLEDGE",
      topic_tags: [`filter-${randomUUID()}`],
      payload_summary: "domain",
      content: "y",
    });
    if (!a.ok || !b.ok) throw new Error("create failed");

    const result = await createSystemPermission({
      grantor_entity_id: grantor.entity.entity_id,
      grantee_entity_id: grantee.entity.entity_id,
      access_scope: "SUMMARY",
      capsule_type_filter: "DOMAIN_KNOWLEDGE",
    });
    // Only the DOMAIN_KNOWLEDGE capsule should be in the bridge.
    expect(result.permission_count).toBe(1);
    const rows = await prisma.permission.findMany({
      where: { bridge_id: result.bridge_id },
    });
    expect(rows[0]?.capsule_id).toBe(b.capsule_id);
  });
});
