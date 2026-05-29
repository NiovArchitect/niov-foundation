// FILE: org-action-policies.test.ts (integration)
// PURPOSE: HTTP-level coverage for the new GET + PUT
//          /api/v1/org/action-policies admin surface per ADR-0057 §7
//          (PrivilegedEndpoint Operation E ORG_ACTION_POLICY_UPDATE,
//          the FIRST LIVE entry to exercise Class B at the integration
//          tier) + §9 (route table) + §10 (audit emission +
//          forbidden-fields list). Mirrors the
//          tests/integration/dual-control-binding-orgs.test.ts pattern
//          for the dual-control approval seam; mirrors the
//          tests/integration/admin-routes.test.ts pattern for org-admin
//          capability-gate testing.
// CONNECTS TO: apps/api/src/routes/org.routes.ts (the LIVE routes under
//              test), apps/api/src/security/privileged-endpoints.ts
//              (Operation E entry + dualControlDescription),
//              packages/database (prisma.actionPolicy.* + writeAuditEvent
//              for assertion), apps/api/src/services/governance/
//              escalation.service.ts (createEscalationForCaller +
//              approveEscalationForCaller via @niov/api), tests/helpers.ts
//              (fixture seeding + cleanup).
//
// NO-LEAK BOUNDARY (RULE 0 + ADR-0057 §10):
//   - GET response is a flat list of safe-projected rows: policy_id,
//     org_entity_id, action_type, risk_tier, default_decision,
//     require_admin_capability, updated_by, created_at, updated_at
//     ONLY. No raw request body, no policy envelope, no secrets.
//   - PUT response echoes the upserted row in the same safe projection.
//   - Audit emission carries policy_id + action_type + risk_tier +
//     default_decision + route + method ONLY. NEVER the raw body, the
//     unknown_fields error envelope, secrets, capsule content,
//     embeddings, or candidate-pool data.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  createEscalationForCaller,
  dualControlDescription,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  computeTARHash,
  createEntity,
  prisma,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "org-action-policies-test-secret-do-not-use-in-prod";
const TEST_KEY = randomBytes(32);
const ACTION_TYPE = "ORG_ACTION_POLICY_UPDATE" as const;

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

// WHAT: Hard-clean escalation_requests + action_policies rows that
//        reference test entities. Mirrors the cleanupTestEscalations
//        pattern from tests/unit/escalation-target-resolver.test.ts —
//        ActionPolicy + EscalationRequest entity relations have no
//        onDelete: Cascade (per the LawfulBasis / BreakGlassGrant
//        governance-record precedent), so cleanup must run before
//        cleanupTestData() to avoid orphan-row violations.
// INPUT: None.
// OUTPUT: Promise<void>.
// WHY: Defensive parity with the existing dual-control-binding tests.
async function cleanupTestActionPolicies(): Promise<void> {
  const testEntities = await prisma.entity.findMany({
    where: { display_name: { startsWith: TEST_PREFIX } },
    select: { entity_id: true },
  });
  const ids = testEntities.map((e) => e.entity_id);
  if (ids.length === 0) return;
  await prisma.actionPolicy.deleteMany({
    where: {
      OR: [{ org_entity_id: { in: ids } }, { updated_by: { in: ids } }],
    },
  });
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

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestActionPolicies();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestActionPolicies();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

// WHAT: Create + login a PERSON entity inside the given org with the
//        given admin flag combination. Mirrors the
//        admin-routes.test.ts makeAdminAndLogin pattern (TAR flip +
//        hash recompute + login).
// INPUT: { orgId? — the org_entity_id to attach the entity under; the
//        TAR cap flags; optional remoteAddress }.
// OUTPUT: { entityId, token, ip, email }.
// WHY: Most tests in this file need a logged-in admin inside an org.
//      The org_entity_id linkage is established at child membership
//      time so resolveOrgOrFail at the route can find it.
async function makeOrgAdmin(opts: {
  orgId: string;
  can_admin_org?: boolean;
  remoteAddress?: string;
}): Promise<{ entityId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  // Link the entity to the org as a child member so resolveOrgOrFail
  // at the route handler resolves the caller's org via getOrgEntityId.
  // Canonical EntityMembership shape per schema.prisma:799 — parent_id
  // + child_id + role_title + is_active.
  await prisma.entityMembership.create({
    data: {
      parent_id: opts.orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  // Flip TAR admin flags + recompute hash so requireAdminCapability
  // sees the right shape after login.
  await prisma.tokenAttributeRepository.update({
    where: { entity_id: entity.entity_id },
    data: { can_admin_org: opts.can_admin_org === true },
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
  const ip =
    opts.remoteAddress ??
    `10.88.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read", "write"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json() as { token: string };
  return {
    entityId: entity.entity_id,
    token: body.token,
    ip,
  };
}

// WHAT: Create a parent COMPANY entity that the admin entities below
//        will be linked under via EntityMembership.
// INPUT: None.
// OUTPUT: The created org entity_id.
// WHY: Org-scope tests need a real org row + membership so
//      resolveOrgOrFail at the route can succeed.
async function makeTestOrg(): Promise<string> {
  // Canonical CreateEntityInput shape per packages/database/src/queries/entity.ts:46 —
  // no password_hash field (system entities omit `password` entirely); email
  // optional but not null.
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

// WHAT: Pre-seed a PENDING dual-control escalation for the caller +
//        a DISTINCT second admin approver, then approve it. Mirrors the
//        grantApproval helper at tests/integration/dual-control-
//        binding-orgs.test.ts:202.
// INPUT: callerEntityId + orgId (the second admin is linked to the
//        same org so the Class B target resolver could find them).
// OUTPUT: The escalation_id of the approved row.
// WHY: PUT /api/v1/org/action-policies is dual-control-gated; the
//      happy-path test needs an APPROVED escalation already on disk
//      so the dual-control middleware lets the handler run.
async function grantPolicyUpdateApproval(
  callerEntityId: string,
  orgId: string,
): Promise<string> {
  const distinctApprover = await createEntity(
    makeEntityInput({ entity_type: "PERSON" }),
  );
  // The approver also needs to be in the same org so the structural
  // Class-B candidate resolver could discover them (we don't need
  // can_admin_org flipped because we manually-craft the escalation
  // via createEscalationForCaller).
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: distinctApprover.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  const created = await createEscalationForCaller(callerEntityId, {
    target_entity_id: distinctApprover.entity_id,
    escalation_type: "DUAL_CONTROL_REQUIRED",
    severity: "HIGH",
    description: dualControlDescription(ACTION_TYPE),
    expires_at: null,
  });
  await approveEscalationForCaller(
    distinctApprover.entity_id,
    created.escalation_id,
  );
  return created.escalation_id;
}

// ---------------------------------------------------------------------------
// GET /api/v1/org/action-policies
// ---------------------------------------------------------------------------

describe("GET /api/v1/org/action-policies — read-only org-scoped list (no dual-control)", () => {
  it("returns 403 ADMIN_CAPABILITY_REQUIRED when caller does NOT have can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_org");
  });

  it("returns an empty list when the caller's org has no ActionPolicy rows yet", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: true; policies: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.policies)).toBe(true);
    expect(body.policies).toHaveLength(0);
  });

  it("returns only the caller's-org rows (cross-org leak guard at the query tier)", async () => {
    // Seed two distinct orgs with one ActionPolicy each. The caller
    // is in org A; the GET must NOT return org B's row.
    const orgA = await makeTestOrg();
    const orgB = await makeTestOrg();
    const callerA = await makeOrgAdmin({ orgId: orgA, can_admin_org: true });
    await prisma.actionPolicy.create({
      data: {
        org_entity_id: orgA,
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        require_admin_capability: null,
        updated_by: callerA.entityId,
      },
    });
    await prisma.actionPolicy.create({
      data: {
        org_entity_id: orgB,
        action_type: "PROPOSE_PERMISSION_GRANT",
        risk_tier: "HIGH",
        default_decision: "REQUIRE_DUAL_CONTROL",
        require_admin_capability: null,
        updated_by: callerA.entityId,
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${callerA.token}` },
      remoteAddress: callerA.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: true;
      policies: Array<{ org_entity_id: string; action_type: string }>;
    };
    expect(body.policies).toHaveLength(1);
    expect(body.policies[0]?.org_entity_id).toBe(orgA);
    expect(body.policies[0]?.action_type).toBe("RECORD_CAPSULE");
    // Defense-in-depth: NO row references orgB.
    expect(body.policies.every((p) => p.org_entity_id !== orgB)).toBe(true);
  });

  it("response projection excludes forbidden internals (no raw body, no secrets, no policy envelope)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await prisma.actionPolicy.create({
      data: {
        org_entity_id: orgId,
        action_type: "RECORD_CAPSULE",
        risk_tier: "MEDIUM",
        default_decision: "REQUIRE_DUAL_CONTROL",
        require_admin_capability: "can_admin_org",
        updated_by: caller.entityId,
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      remoteAddress: caller.ip,
    });
    const raw = response.body;
    // RULE 0 + ADR-0057 §10 no-leak boundary: the response must not
    // include any forbidden-token property keys.
    for (const forbidden of [
      "payload_summary",
      "payload_content",
      "target_capsule_id",
      "storage_location",
      "content_hash",
      "embedding",
      "vector",
      "candidate_pool",
      "raw_payload",
      "raw_request",
      "raw_response",
      "raw_error",
    ]) {
      expect(raw.includes(`"${forbidden}"`)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/org/action-policies — dual-control gated; body validation
// ---------------------------------------------------------------------------

describe("PUT /api/v1/org/action-policies — capability + body validation", () => {
  it("returns 403 ADMIN_CAPABILITY_REQUIRED when caller does NOT have can_admin_org", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: false });
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: string; required: string };
    expect(body.error).toBe("ADMIN_CAPABILITY_REQUIRED");
    expect(body.required).toBe("can_admin_org");
  });

  it("returns 422 UNKNOWN_FIELD when body carries a field outside the writable allowlist", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        unknown_field: "bad",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as {
      ok: false;
      code: string;
      unknown_fields: string[];
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNKNOWN_FIELD");
    expect(body.unknown_fields).toContain("unknown_field");
  });

  it("returns 422 INVALID_FIELD when action_type is not a recognized enum value", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "MADE_UP_TYPE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as {
      ok: false;
      code: string;
      invalid_fields: string[];
    };
    expect(body.code).toBe("INVALID_FIELD");
    expect(body.invalid_fields).toContain("action_type");
  });

  it("returns 422 INVALID_FIELD when risk_tier is not LOW/MEDIUM/HIGH/CRITICAL", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "TRIVIAL",
        default_decision: "AUTO_APPROVE",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { invalid_fields: string[] };
    expect(body.invalid_fields).toContain("risk_tier");
  });

  it("returns 422 INVALID_FIELD when default_decision is not in the ActionDecision enum", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "MAYBE",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { invalid_fields: string[] };
    expect(body.invalid_fields).toContain("default_decision");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/org/action-policies — happy path (dual-control + upsert
// + ACTION_POLICY_UPDATE emission)
// ---------------------------------------------------------------------------

describe("PUT /api/v1/org/action-policies — happy path with APPROVED escalation", () => {
  it("upserts a new ActionPolicy row, emits ACTION_POLICY_UPDATE, returns safe-projected row", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        require_admin_capability: null,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: true;
      policy: {
        policy_id: string;
        org_entity_id: string;
        action_type: string;
        risk_tier: string;
        default_decision: string;
        require_admin_capability: string | null;
        updated_by: string;
        created_at: string;
        updated_at: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.policy.org_entity_id).toBe(orgId);
    expect(body.policy.action_type).toBe("RECORD_CAPSULE");
    expect(body.policy.risk_tier).toBe("LOW");
    expect(body.policy.default_decision).toBe("AUTO_APPROVE");
    expect(body.policy.require_admin_capability).toBeNull();
    expect(body.policy.updated_by).toBe(caller.entityId);
    expect(typeof body.policy.policy_id).toBe("string");

    // DB-tier assertion: the row exists.
    const row = await prisma.actionPolicy.findUnique({
      where: { policy_id: body.policy.policy_id },
    });
    expect(row).not.toBeNull();
    expect(row?.org_entity_id).toBe(orgId);

    // Audit-tier assertion: ACTION_POLICY_UPDATE was emitted with
    // SAFE allowlisted details only.
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_POLICY_UPDATE",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const latest = audits[0]!;
    expect(latest.outcome).toBe("SUCCESS");
    expect(latest.actor_entity_id).toBe(caller.entityId);
    expect(latest.target_entity_id).toBe(orgId);
    const details = latest.details as Record<string, unknown>;
    expect(details.policy_id).toBe(body.policy.policy_id);
    expect(details.action_type).toBe("RECORD_CAPSULE");
    expect(details.risk_tier).toBe("LOW");
    expect(details.default_decision).toBe("AUTO_APPROVE");
    expect(details.route).toBe("/api/v1/org/action-policies");
    expect(details.method).toBe("PUT");
    // Defense-in-depth no-leak: audit details JSON must not include
    // any forbidden-token property keys.
    const detailsRaw = JSON.stringify(details);
    for (const forbidden of [
      "payload_summary",
      "payload_content",
      "raw_payload",
      "raw_request",
      "raw_response",
      "raw_error",
      "embedding",
      "vector",
      "candidate_pool",
    ]) {
      expect(detailsRaw.includes(`"${forbidden}"`)).toBe(false);
    }
  });

  it("updates an existing ActionPolicy row in place (UNIQUE org+action_type+risk_tier upsert)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    // First PUT creates.
    const first = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
      },
      remoteAddress: caller.ip,
    });
    expect(first.statusCode).toBe(200);
    const firstPolicyId = (
      first.json() as { policy: { policy_id: string } }
    ).policy.policy_id;
    // Second PUT for the SAME (org, action_type, risk_tier) tuple
    // requires a fresh approval per dual-control single-use semantics.
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const second = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "REQUIRE_DUAL_CONTROL",
      },
      remoteAddress: caller.ip,
    });
    expect(second.statusCode).toBe(200);
    const secondPolicy = (
      second.json() as {
        policy: { policy_id: string; default_decision: string };
      }
    ).policy;
    // Same row (same policy_id; upsert in place).
    expect(secondPolicy.policy_id).toBe(firstPolicyId);
    expect(secondPolicy.default_decision).toBe("REQUIRE_DUAL_CONTROL");
    // DB confirms only ONE row for the (org, action_type, risk_tier) tuple.
    const rows = await prisma.actionPolicy.findMany({
      where: {
        org_entity_id: orgId,
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.default_decision).toBe("REQUIRE_DUAL_CONTROL");
  });
});

describe("PUT /api/v1/org/action-policies — ADR-0057 Wave 7 retry_budget + attempt_timeout_ms_override admin write-path", () => {
  it("accepts retry_budget + attempt_timeout_ms_override positive integers + persists on the row + projects on the response", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 2,
        attempt_timeout_ms_override: 12_345,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: true;
      policy: {
        policy_id: string;
        retry_budget: number | null;
        attempt_timeout_ms_override: number | null;
      };
    };
    expect(body.policy.retry_budget).toBe(2);
    expect(body.policy.attempt_timeout_ms_override).toBe(12_345);
    const row = await prisma.actionPolicy.findUnique({
      where: { policy_id: body.policy.policy_id },
    });
    expect(row?.retry_budget).toBe(2);
    expect(row?.attempt_timeout_ms_override).toBe(12_345);
  });

  it("explicit null on retry_budget + attempt_timeout_ms_override clears the override + the resolver will fall back to the constant", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    // Seed an existing override.
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const seed = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 5,
        attempt_timeout_ms_override: 9_999,
      },
      remoteAddress: caller.ip,
    });
    expect(seed.statusCode).toBe(200);
    // Now clear both overrides.
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const cleared = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: null,
        attempt_timeout_ms_override: null,
      },
      remoteAddress: caller.ip,
    });
    expect(cleared.statusCode).toBe(200);
    const clearedBody = cleared.json() as {
      policy: {
        policy_id: string;
        retry_budget: number | null;
        attempt_timeout_ms_override: number | null;
      };
    };
    expect(clearedBody.policy.retry_budget).toBeNull();
    expect(clearedBody.policy.attempt_timeout_ms_override).toBeNull();
  });

  it("omitting retry_budget + attempt_timeout_ms_override on update preserves the existing column values", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    // Seed an existing override.
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const seed = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 7,
        attempt_timeout_ms_override: 4_242,
      },
      remoteAddress: caller.ip,
    });
    expect(seed.statusCode).toBe(200);
    // Update only the default_decision; omit the overrides.
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const partial = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "REQUIRE_DUAL_CONTROL",
      },
      remoteAddress: caller.ip,
    });
    expect(partial.statusCode).toBe(200);
    const partialBody = partial.json() as {
      policy: {
        retry_budget: number | null;
        attempt_timeout_ms_override: number | null;
        default_decision: string;
      };
    };
    // Overrides preserved.
    expect(partialBody.policy.retry_budget).toBe(7);
    expect(partialBody.policy.attempt_timeout_ms_override).toBe(4_242);
    expect(partialBody.policy.default_decision).toBe("REQUIRE_DUAL_CONTROL");
  });

  it("rejects retry_budget = 0 with 422 INVALID_FIELD (non-positive guard)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 0,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as {
      code: string;
      invalid_fields: string[];
    };
    expect(body.code).toBe("INVALID_FIELD");
    expect(body.invalid_fields).toContain("retry_budget");
  });

  it("rejects attempt_timeout_ms_override = -1 with 422 INVALID_FIELD (non-positive guard)", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        attempt_timeout_ms_override: -1,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as {
      code: string;
      invalid_fields: string[];
    };
    expect(body.code).toBe("INVALID_FIELD");
    expect(body.invalid_fields).toContain("attempt_timeout_ms_override");
  });

  it("rejects non-integer (float) retry_budget with 422 INVALID_FIELD", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 1.5,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { invalid_fields: string[] };
    expect(body.invalid_fields).toContain("retry_budget");
  });

  it("rejects string retry_budget with 422 INVALID_FIELD", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: "3",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { invalid_fields: string[] };
    expect(body.invalid_fields).toContain("retry_budget");
  });

  it("emits ACTION_POLICY_UPDATE with retry_budget_set + attempt_timeout_ms_override_set boolean flags + NEVER leaks the numeric override values into audit details", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "PROPOSE_PERMISSION_GRANT",
        risk_tier: "MEDIUM",
        default_decision: "REQUIRE_DUAL_CONTROL",
        retry_budget: 4,
        attempt_timeout_ms_override: 8_888,
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_POLICY_UPDATE",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const latest = audits[0]!;
    const details = latest.details as Record<string, unknown>;
    expect(details.retry_budget_set).toBe(true);
    expect(details.attempt_timeout_ms_override_set).toBe(true);
    // CRITICAL no-leak: the numeric tuning values must NOT appear
    // anywhere in the audit details JSON.
    const detailsRaw = JSON.stringify(details);
    expect(detailsRaw.includes('"retry_budget":')).toBe(false);
    expect(detailsRaw.includes('"attempt_timeout_ms_override":')).toBe(false);
    expect(detailsRaw.includes("8888")).toBe(false);
    expect(detailsRaw.includes("4242")).toBe(false);
  });

  it("emits ACTION_POLICY_UPDATE with retry_budget_set=false + attempt_timeout_ms_override_set=false when neither override is touched", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "SEND_INTERNAL_NOTIFICATION",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
      },
      remoteAddress: caller.ip,
    });
    expect(response.statusCode).toBe(200);
    const audits = await prisma.auditEvent.findMany({
      where: {
        event_type: "ACTION_POLICY_UPDATE",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const latest = audits[0]!;
    const details = latest.details as Record<string, unknown>;
    expect(details.retry_budget_set).toBe(false);
    expect(details.attempt_timeout_ms_override_set).toBe(false);
  });
});

describe("GET /api/v1/org/action-policies — ADR-0057 Wave 7 projection includes the override columns", () => {
  it("response projects retry_budget + attempt_timeout_ms_override for every row", async () => {
    const orgId = await makeTestOrg();
    const caller = await makeOrgAdmin({ orgId, can_admin_org: true });
    await grantPolicyUpdateApproval(caller.entityId, orgId);
    await app.inject({
      method: "PUT",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      payload: {
        action_type: "RECORD_CAPSULE",
        risk_tier: "LOW",
        default_decision: "AUTO_APPROVE",
        retry_budget: 3,
        attempt_timeout_ms_override: 11_111,
      },
      remoteAddress: caller.ip,
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/org/action-policies",
      headers: { authorization: `Bearer ${caller.token}` },
      remoteAddress: caller.ip,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      ok: true;
      policies: Array<{
        action_type: string;
        retry_budget: number | null;
        attempt_timeout_ms_override: number | null;
      }>;
    };
    const seeded = body.policies.find((p) => p.action_type === "RECORD_CAPSULE");
    expect(seeded).toBeDefined();
    expect(seeded?.retry_budget).toBe(3);
    expect(seeded?.attempt_timeout_ms_override).toBe(11_111);
  });
});
