// FILE: hive-wave-4-governance-terms-evaluator.test.ts (integration)
// PURPOSE: Section 3 Wave 4 v1 Layer 1 governance_terms evaluator
//          contract coverage per ADR-0063 + Founder Wave 4
//          implementation authorization. Exercises every wired
//          v1 evaluable term (9 of 10; require_admin_approval_for_invites
//          DEFERRED) at every call site (createHive, inviteToHive,
//          getHiveIntelligence) + the MALFORMED governance_terms
//          path + the no-leak guarantees (governance_terms object
//          NEVER appears in API responses, error messages, or
//          audit details).
// CONNECTS TO:
//   - apps/api/src/services/hive/governance-terms-evaluator.ts
//   - apps/api/src/services/hive/hive.service.ts
//   - apps/api/src/routes/hive.routes.ts (statusForCode Wave 4)
//   - ADR-0063 Section 3 Wave 4 Layer 1 design

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  HiveService,
  MemoryContentStore,
  MemoryNonceStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";

const TEST_JWT_SECRET = "hive-wave-4-test-secret";
const TEST_KEY = randomBytes(32);

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

function makeServices() {
  const sessionStore = new MemoryNonceStore();
  const auth = new AuthService({
    jwtSecret: TEST_JWT_SECRET,
    nonceStore: sessionStore,
  });
  const hive = new HiveService(
    auth,
    new ContentEncryption(TEST_KEY),
    new MemoryContentStore(),
  );
  return { auth, hive };
}

async function makeOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function bindToOrg(orgId: string, childId: string): Promise<void> {
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: childId,
      role_title: "MEMBER",
      is_active: true,
    },
  });
}

async function grantCreateHives(entityId: string): Promise<void> {
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entityId },
    data: { can_create_hives: true },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entityId },
  });
  if (fresh === null) throw new Error("TAR vanished");
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
    where: { entity_id: entityId },
    data: { tar_hash: newHash },
  });
}

async function loginPerson(
  auth: AuthService,
  opts: { orgId?: string } = {},
): Promise<{ entity_id: string; token: string; orgId: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const orgId = opts.orgId ?? (await makeOrg());
  await bindToOrg(orgId, entity.entity_id);
  await grantCreateHives(entity.entity_id);
  const login = await auth.login(
    input.email!,
    password,
    ["read", "write", "share", "create_hives"],
    { ip_address: null },
  );
  if (!login.ok) throw new Error(`login failed: ${login.code}`);
  return { entity_id: entity.entity_id, token: login.token, orgId };
}

describe("Section 3 Wave 4 — allowed_hive_types at createHive", () => {
  it("blocks disallowed hive_type with GOVERNANCE_HIVE_TYPE_FORBIDDEN", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "PERSONAL_NETWORK",
      { allowed_hive_types: ["ENTERPRISE"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_HIVE_TYPE_FORBIDDEN");
    expect(r.message).toContain("allowed_hive_types");
    // No-leak: error message MUST NOT contain the full
    // governance_terms object (which contains the array
    // literal).
    expect(r.message).not.toContain('"ENTERPRISE"');
  });

  it("allows requested type when in allowlist", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_hive_types: ["ENTERPRISE"] },
    );
    expect(r.ok).toBe(true);
  });

  it("does NOT override Wave 2 HIVE_TYPE_V1_ALLOWLIST (Wave 2 runs first)", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    // Operator tries to allow CROSS_ORGANIZATION via governance —
    // Wave 2 INVALID_HIVE_TYPE_FOR_V1 still fires (allowlist not
    // even consulted because Wave 2 rejects upstream).
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "CROSS_ORGANIZATION" as any,
      { allowed_hive_types: ["CROSS_ORGANIZATION"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVALID_HIVE_TYPE_FOR_V1");
  });
});

describe("Section 3 Wave 4 — allowed_member_entity_types at inviteToHive", () => {
  it("blocks invitee with disallowed entity_type", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_member_entity_types: ["COMPANY"] }, // PERSON not allowed
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_INVITEE_TYPE_FORBIDDEN");
    expect(r.message).toContain("allowed_member_entity_types");
  });

  it("allows invitee when entity_type is in allowlist", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_member_entity_types: ["PERSON"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(true);
  });
});

describe("Section 3 Wave 4 — allow_ai_agent_membership (advisory; Wave 2 wins)", () => {
  it("allow_ai_agent_membership: true does NOT override Wave 2 AI_AGENT exclusion", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allow_ai_agent_membership: true },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Spin up an AI_AGENT entity in the same org (no login;
    // membership row created directly so inviteToHive's
    // invitee lookup finds an AI_AGENT).
    const aiInput = makeEntityInput({
      entity_type: "AI_AGENT",
      password: "irrelevant",
    });
    const aiAgent = await createEntity(aiInput);
    await bindToOrg(founder.orgId, aiAgent.entity_id);
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      aiAgent.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Wave 2 exclusion still wins even though governance term
    // permits AI_AGENT.
    expect(r.code).toBe("AI_AGENT_NOT_ELIGIBLE_FOR_HIVE");
  });
});

describe("Section 3 Wave 4 — max_member_count at inviteToHive", () => {
  it("blocks invite that would push count over max", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { max_member_count: 2 }, // creator already = 1
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // 1st invite OK (count: 1 → 2)
    const a = await loginPerson(auth, { orgId: founder.orgId });
    const r1 = await hive.inviteToHive(founder.token, created.hive_id, a.entity_id);
    expect(r1.ok).toBe(true);
    // 2nd invite blocked (count: 2 → 3 exceeds max=2)
    const b = await loginPerson(auth, { orgId: founder.orgId });
    const r2 = await hive.inviteToHive(founder.token, created.hive_id, b.entity_id);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.code).toBe("GOVERNANCE_MAX_MEMBER_COUNT_EXCEEDED");
    expect(r2.message).toContain("max_member_count");
  });
});

describe("Section 3 Wave 4 — allowed_capsule_types_accessible", () => {
  it("blocks invite with disallowed capsule_types_accessible", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_capsule_types_accessible: ["PREFERENCE"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
      { capsule_types_accessible: ["PREFERENCE", "DOMAIN_KNOWLEDGE"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN");
    expect(r.message).toContain("allowed_capsule_types_accessible");
  });

  it("blocks createHive when creator settings violate accessible allowlist", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_capsule_types_accessible: ["PREFERENCE"] },
      { capsule_types_accessible: ["IDENTITY"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_CAPSULE_TYPE_ACCESSIBLE_FORBIDDEN");
  });
});

describe("Section 3 Wave 4 — allowed_capsule_types_contributed", () => {
  it("blocks invite with disallowed capsule_types_contributed", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_capsule_types_contributed: ["PREFERENCE"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
      { capsule_types_contributed: ["IDENTITY"] },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_CAPSULE_TYPE_CONTRIBUTED_FORBIDDEN");
    expect(r.message).toContain("allowed_capsule_types_contributed");
  });
});

describe("Section 3 Wave 4 — aggregate_min_member_count at getHiveIntelligence", () => {
  it("returns zero-state when member_count is below threshold", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { aggregate_min_member_count: 5 },
      { capsule_types_accessible: ["PREFERENCE"] }, // non-empty so Wave 2 zero-state doesn't fire
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = await hive.getHiveIntelligence(founder.token, created.hive_id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intelligence).toBeNull();
    // Verify the audit row carries the new zero_state_reason.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "HIVE_INTELLIGENCE_READ",
        actor_entity_id: founder.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as { zero_state_reason?: string };
    expect(details.zero_state_reason).toBe("BELOW_AGGREGATE_MIN_MEMBER_COUNT");
  });

  it("returns aggregate normally when member_count meets threshold", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { aggregate_min_member_count: 1 }, // creator alone satisfies
      { capsule_types_accessible: ["PREFERENCE"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = await hive.getHiveIntelligence(founder.token, created.hive_id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No aggregate built yet, so intelligence: null — but reason
    // is "aggregate_present: false" (Wave 2), NOT
    // "BELOW_AGGREGATE_MIN_MEMBER_COUNT".
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "HIVE_INTELLIGENCE_READ",
        actor_entity_id: founder.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as { zero_state_reason?: string };
    expect(details.zero_state_reason).toBeUndefined();
  });
});

describe("Section 3 Wave 4 — policy_source_ref metadata-only", () => {
  it("accepts policy_source_ref string without fetching external source", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      {
        policy_source_ref: "internal://policies/engineering-default-v1",
        allowed_hive_types: ["ENTERPRISE"],
      },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Verify the ref persisted into governance_terms; no
    // external fetch happened (the URL would have failed
    // network resolution if attempted).
    const row = await prisma.hive.findUnique({
      where: { hive_id: r.hive_id },
    });
    const terms = row?.governance_terms as { policy_source_ref?: string };
    expect(terms.policy_source_ref).toBe(
      "internal://policies/engineering-default-v1",
    );
  });
});

describe("Section 3 Wave 4 — GOVERNANCE_TERMS_MALFORMED", () => {
  it("rejects createHive with non-object governance_terms", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ["array", "not", "object"] as any,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_TERMS_MALFORMED");
    expect(r.message).toContain("governance_terms must be a JSON object");
  });

  it("rejects inviteToHive when stored governance_terms is malformed", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    // Bypass createHive's governance validation to plant a
    // malformed governance_terms onto an existing hive
    // (simulates operator-state corruption: someone wrote a
    // non-object value via a future admin path or direct DB
    // edit). Use raw Prisma to force the value past the
    // create-time evaluator.
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.hive.update({
      where: { hive_id: created.hive_id },
      data: { governance_terms: ["malformed"] as object },
    });
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("GOVERNANCE_TERMS_MALFORMED");
  });
});

describe("Section 3 Wave 4 — no-leak invariants", () => {
  it("error messages never contain the full governance_terms object", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const SECRET_MARKER = "SECRET_POLICY_INTERNALS_DO_NOT_LEAK";
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      {
        allowed_member_entity_types: ["COMPANY"],
        // A secret-marker field that should NEVER appear in
        // any error message even though it lives in the
        // governance_terms JSON.
        internal_policy_note: SECRET_MARKER,
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const invitee = await loginPerson(auth, { orgId: founder.orgId });
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      invitee.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain(SECRET_MARKER);
  });

  it("HIVE_INTELLIGENCE_READ audit details never include the governance_terms object", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const SECRET_MARKER = "AUDIT_LEAK_DO_NOT_RECORD";
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      {
        aggregate_min_member_count: 5,
        internal_policy_note: SECRET_MARKER,
      },
      { capsule_types_accessible: ["PREFERENCE"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const r = await hive.getHiveIntelligence(founder.token, created.hive_id);
    expect(r.ok).toBe(true);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "HIVE_INTELLIGENCE_READ",
        actor_entity_id: founder.entity_id,
      },
      orderBy: { timestamp: "desc" },
    });
    // The audit details JSON serialized MUST NOT contain the
    // governance_terms internal marker.
    const serialized = JSON.stringify(audit?.details ?? {});
    expect(serialized).not.toContain(SECRET_MARKER);
  });
});

describe("Section 3 Wave 4 — Wave 2 + Wave 3 regression preservation", () => {
  it("dissolve_requires_admin term is a no-op (Wave 3 admin route already admin-gated)", async () => {
    const { auth, hive } = makeServices();
    const caller = await loginPerson(auth);
    const r = await hive.createHive(
      caller.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { dissolve_requires_admin: true },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The term persisted but enforces nothing at v1 because
    // there is no non-admin dissolve route.
    const row = await prisma.hive.findUnique({
      where: { hive_id: r.hive_id },
    });
    const terms = row?.governance_terms as { dissolve_requires_admin?: boolean };
    expect(terms.dissolve_requires_admin).toBe(true);
  });

  it("Wave 2 same-org check runs BEFORE governance evaluator (cross-org caller hits Wave 2 first)", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const created = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      { allowed_member_entity_types: ["PERSON"] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const stranger = await loginPerson(auth); // different org
    const r = await hive.inviteToHive(
      founder.token,
      created.hive_id,
      stranger.entity_id,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Wave 2 CROSS_ORG_INVITE_DENIED wins; governance
    // evaluator never sees this invitee.
    expect(r.code).toBe("CROSS_ORG_INVITE_DENIED");
  });

  it("Empty governance_terms object is a no-op (no policy = no enforcement)", async () => {
    const { auth, hive } = makeServices();
    const founder = await loginPerson(auth);
    const r = await hive.createHive(
      founder.token,
      `gov-${randomUUID()}`,
      "ENTERPRISE",
      {},
    );
    expect(r.ok).toBe(true);
  });
});
