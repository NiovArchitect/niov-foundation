// FILE: invoke-connector-action.test.ts (integration)
// PURPOSE: Section 4 Wave 3 INVOKE_CONNECTOR ActionType + handler
//          coverage. Verifies the handler routed through the Action
//          runtime: 422 validation; resolves a ConnectorBinding
//          scoped to the action's org_entity_id; CONNECTOR_BINDING_
//          NOT_FOUND when binding lives in a different org;
//          CONNECTOR_BINDING_DISABLED when binding is disabled;
//          SUCCESS path returns SAFE result_metadata bearing
//          binding_id + connector_type + delivery_metadata; provider
//          AUTH / NETWORK / TIMEOUT / RATE_LIMIT / PROVIDER_ERROR /
//          VALIDATION / NOT_CONFIGURED all map to discriminated
//          CONNECTOR_<class> handler error_class (NO new audit
//          literal — the action runtime's 10 ACTION_* literals are
//          authoritative for invocation auditing). Tests inject the
//          FixtureBasedConnectorProvider directly via the registry
//          deps to keep CI deterministic.
// CONNECTS TO:
//   - apps/api/src/services/action/handlers.ts (makeInvokeConnectorHandler)
//   - apps/api/src/services/action/action-payload-validators.ts
//     (validateInvokeConnectorPayload)
//   - apps/api/src/services/connector/* (registry + fixture provider)
//   - packages/database/src/queries/connector-binding.ts

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  FixtureBasedConnectorProvider,
  makeActionHandlerRegistry,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  setDefaultActionHandlerRegistry,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import {
  computeTARHash,
  createConnectorBinding,
  createEntity,
  prisma,
  updateConnectorBindingForOrg,
} from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "invoke-connector-action-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();
const fixtureProvider = new FixtureBasedConnectorProvider();

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: store,
  });
  // Override the production registry so INVOKE_CONNECTOR routes
  // through the FixtureBased provider, exercising the forced-failure
  // fixture keys without any real outbound effect.
  setDefaultActionHandlerRegistry(
    makeActionHandlerRegistry({ connectorProvider: fixtureProvider }),
  );
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function makeOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  // The schema's OrgSettings.require_human_approval defaults to true
  // (HITL-safe default). Test orgs flip it to false + grant the
  // (INVOKE_CONNECTOR, LOW) ActionPolicy AUTO_APPROVE so LOW-risk
  // actions flow through AUTO_APPROVE without standing up
  // dual-control fixtures (the binding registration in Wave 2 already
  // gated by can_admin_org carries the dual-control discipline at
  // its tier).
  await prisma.orgSettings.upsert({
    where: { org_entity_id: org.entity_id },
    create: {
      org_entity_id: org.entity_id,
      require_human_approval: false,
      auto_approve_low_risk: true,
      audit_ai_actions: true,
    },
    update: {
      require_human_approval: false,
      auto_approve_low_risk: true,
    },
  });
  await autoApprovePolicy(org.entity_id, org.entity_id);
  return org.entity_id;
}

async function makeMember(orgId: string): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  await prisma.entityMembership.create({
    data: {
      parent_id: orgId,
      child_id: entity.entity_id,
      role_title: "MEMBER",
      is_active: true,
    },
  });
  // EXECUTIVE_OVERRIDE so LOW-risk actions like INVOKE_CONNECTOR
  // flow through AUTO_APPROVE; the default APPROVAL_REQUIRED would
  // push every action to dual-control and starve the test of an
  // approver target.
  await prisma.twinConfig.upsert({
    where: { twin_id: entity.entity_id },
    create: {
      twin_id: entity.entity_id,
      autonomy_level: "EXECUTIVE_OVERRIDE",
    },
    update: { autonomy_level: "EXECUTIVE_OVERRIDE" },
  });
  const fresh = await prisma.tokenAttributeRepository.findUnique({
    where: { entity_id: entity.entity_id },
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
    where: { entity_id: entity.entity_id },
    data: { tar_hash: newHash },
  });
  const ip = `10.85.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
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
  return { entityId: entity.entity_id, token: body.token, ip };
}

// WHAT: Seed an AUTO_APPROVE ActionPolicy for (org, INVOKE_CONNECTOR,
//        LOW) so the policy evaluator's EXECUTIVE_OVERRIDE +
//        org_auto_approve_low_risk path lands at AUTO_APPROVE rather
//        than REQUIRE_DUAL_CONTROL. Without this, the test would need
//        a dual-control approver fixture and a separate flow to
//        exercise the handler.
async function autoApprovePolicy(orgId: string, by: string): Promise<void> {
  await prisma.actionPolicy.upsert({
    where: {
      org_entity_id_action_type_risk_tier: {
        org_entity_id: orgId,
        action_type: "INVOKE_CONNECTOR",
        risk_tier: "LOW",
      },
    },
    create: {
      org_entity_id: orgId,
      action_type: "INVOKE_CONNECTOR",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: by,
    },
    update: {
      default_decision: "AUTO_APPROVE",
      require_admin_capability: null,
      updated_by: by,
    },
  });
}

async function makeBinding(orgId: string, actorId: string): Promise<string> {
  const row = await createConnectorBinding({
    org_entity_id: orgId,
    type: "OUTBOUND_WEBHOOK",
    display_name: `Test webhook ${randomUUID()}`,
    config: { url: "https://example.test/hook" },
    secret_ref: "TEST_WEBHOOK_HMAC_SECRET",
    created_by_entity_id: actorId,
  });
  return row.binding_id;
}

async function createInvokeConnectorAction(
  caller: { token: string; ip: string },
  body: {
    binding_id?: string;
    invocation_payload?: Record<string, unknown>;
  },
): Promise<{ statusCode: number; body: unknown }> {
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/actions",
    headers: { authorization: `Bearer ${caller.token}` },
    remoteAddress: caller.ip,
    payload: {
      action_type: "INVOKE_CONNECTOR",
      idempotency_key: `iv-${randomUUID()}`,
      payload_summary: "test invoke",
      payload_redacted: body,
    },
  });
  return { statusCode: r.statusCode, body: r.json() };
}

async function pollUntilTerminal(actionId: string): Promise<{
  status: string;
  result_summary: string | null;
  result_metadata: unknown;
  last_attempt_error_class: string | null;
}> {
  // The action scheduler/executor is NO-OP under NODE_ENV=test;
  // tests must call the ticks directly. Import within the helper so
  // the dependency is dynamic + tree-shake-safe.
  const { tickActionScheduler, tickActionExecutor } = await import("@niov/api");
  // Drive admission + execution loops until the action terminalizes.
  for (let i = 0; i < 10; i++) {
    await tickActionScheduler({});
    await tickActionExecutor({});
    const row = await prisma.action.findUnique({
      where: { action_id: actionId },
    });
    if (row === null) continue;
    if (
      row.status === "SUCCEEDED" ||
      row.status === "FAILED" ||
      row.status === "EXPIRED"
    ) {
      const lastAttempts = await prisma.actionAttempt.findMany({
        where: { action_id: actionId },
        orderBy: { attempt_number: "desc" },
        take: 1,
      });
      const lastAttempt = lastAttempts[0];
      // ActionResult is keyed by attempt_id, not action_id.
      const result =
        lastAttempt === undefined
          ? null
          : await prisma.actionResult.findFirst({
              where: { attempt_id: lastAttempt.attempt_id },
            });
      return {
        status: row.status,
        result_summary: result?.result_summary ?? null,
        result_metadata: result?.result_metadata ?? null,
        last_attempt_error_class: lastAttempt?.error_class ?? null,
      };
    }
  }
  throw new Error(`action ${actionId} did not terminalize in time`);
}

describe("INVOKE_CONNECTOR create-time payload validation", () => {
  it("422 when binding_id is missing", async () => {
    const orgId = await makeOrg();
    const caller = await makeMember(orgId);
    const r = await createInvokeConnectorAction(caller, {
      invocation_payload: { hello: "world" },
    });
    expect(r.statusCode).toBe(422);
  });

  it("422 when binding_id is not a UUID", async () => {
    const orgId = await makeOrg();
    const caller = await makeMember(orgId);
    const r = await createInvokeConnectorAction(caller, {
      binding_id: "not-a-uuid",
    });
    expect(r.statusCode).toBe(422);
  });

  it("422 when invocation_payload is an array (not a plain object)", async () => {
    const orgId = await makeOrg();
    const caller = await makeMember(orgId);
    const r = await createInvokeConnectorAction(caller, {
      binding_id: randomUUID(),
      invocation_payload: [1, 2, 3] as unknown as Record<string, unknown>,
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("INVOKE_CONNECTOR runtime resolution + dispatch", () => {
  it("SUCCESS: resolves binding + invokes FixtureBased provider + SAFE result_metadata", async () => {
    const orgId = await makeOrg();
    const caller = await makeMember(orgId);
    const bindingId = await makeBinding(orgId, caller.entityId);
    const created = await createInvokeConnectorAction(caller, {
      binding_id: bindingId,
      invocation_payload: { message: "test" },
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action.action_id;
    const terminal = await pollUntilTerminal(actionId);
    expect(terminal.status).toBe("SUCCEEDED");
    expect(terminal.result_summary).toContain("connector_invoked:OUTBOUND_WEBHOOK");
    const meta = terminal.result_metadata as Record<string, unknown>;
    expect(meta.handler).toBe("invoke_connector");
    expect(meta.action_type).toBe("INVOKE_CONNECTOR");
    expect(meta.binding_id).toBe(bindingId);
    expect(meta.connector_type).toBe("OUTBOUND_WEBHOOK");
    expect(meta.delivery_metadata).toBeDefined();
  });

  it("FAILURE CONNECTOR_BINDING_NOT_FOUND when binding lives in a different org", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const callerA = await makeMember(orgA);
    const callerB = await makeMember(orgB);
    const bindingB = await makeBinding(orgB, callerB.entityId);
    // callerA tries to invoke orgB's binding.
    const created = await createInvokeConnectorAction(callerA, {
      binding_id: bindingB,
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action.action_id;
    const terminal = await pollUntilTerminal(actionId);
    expect(terminal.status).toBe("FAILED");
    expect(terminal.last_attempt_error_class).toBe(
      "CONNECTOR_BINDING_NOT_FOUND",
    );
  });

  it("FAILURE CONNECTOR_BINDING_DISABLED when binding is disabled", async () => {
    const orgId = await makeOrg();
    const caller = await makeMember(orgId);
    const bindingId = await makeBinding(orgId, caller.entityId);
    await updateConnectorBindingForOrg(bindingId, orgId, { enabled: false });
    const created = await createInvokeConnectorAction(caller, {
      binding_id: bindingId,
    });
    expect(created.statusCode).toBe(200);
    const actionId = (created.body as { action: { action_id: string } }).action.action_id;
    const terminal = await pollUntilTerminal(actionId);
    expect(terminal.status).toBe("FAILED");
    expect(terminal.last_attempt_error_class).toBe(
      "CONNECTOR_BINDING_DISABLED",
    );
  });
});

describe("INVOKE_CONNECTOR provider failure mapping (FixtureBased forced classes)", () => {
  const forced: ReadonlyArray<{ fixture: string; expected: string }> = [
    { fixture: "force-auth-failure", expected: "CONNECTOR_AUTH" },
    { fixture: "force-network-failure", expected: "CONNECTOR_NETWORK" },
    { fixture: "force-timeout", expected: "CONNECTOR_TIMEOUT" },
    { fixture: "force-rate-limit", expected: "CONNECTOR_RATE_LIMIT" },
    { fixture: "force-provider-error", expected: "CONNECTOR_PROVIDER_ERROR" },
    { fixture: "force-validation-failure", expected: "CONNECTOR_VALIDATION" },
    { fixture: "force-not-configured", expected: "CONNECTOR_NOT_CONFIGURED" },
    { fixture: "force-disabled", expected: "CONNECTOR_DISABLED" },
  ];

  for (const tc of forced) {
    it(`fixture "${tc.fixture}" → handler error_class "${tc.expected}"`, async () => {
      const orgId = await makeOrg();
      const caller = await makeMember(orgId);
      const bindingId = await makeBinding(orgId, caller.entityId);
      const created = await createInvokeConnectorAction(caller, {
        binding_id: bindingId,
        invocation_payload: { fixture_key: tc.fixture },
      });
      expect(created.statusCode).toBe(200);
      const actionId = (created.body as { action: { action_id: string } }).action.action_id;
      const terminal = await pollUntilTerminal(actionId);
      expect(terminal.status).toBe("FAILED");
      expect(terminal.last_attempt_error_class).toBe(tc.expected);
    });
  }
});

describe("INVOKE_CONNECTOR no-leak: ActionResult never carries secrets or raw payload", () => {
  it("SAFE result_metadata excludes secret_ref + invocation_payload + raw responses", async () => {
    process.env.FAKE_INVOKE_LEAK_TEST = "resolved-MUST-NEVER-LEAK-aaa";
    try {
      const orgId = await makeOrg();
      const caller = await makeMember(orgId);
      const bindingRow = await createConnectorBinding({
        org_entity_id: orgId,
        type: "OUTBOUND_WEBHOOK",
        display_name: `LeakCheck ${randomUUID()}`,
        config: { url: "https://example.test/hook" },
        secret_ref: "FAKE_INVOKE_LEAK_TEST",
        created_by_entity_id: caller.entityId,
      });
      const created = await createInvokeConnectorAction(caller, {
        binding_id: bindingRow.binding_id,
        invocation_payload: {
          highly_sensitive_token: "tok_NEVER_LEAK_invoke_99",
        },
      });
      expect(created.statusCode).toBe(200);
      const actionId = (created.body as { action: { action_id: string } }).action.action_id;
      const terminal = await pollUntilTerminal(actionId);
      expect(terminal.status).toBe("SUCCEEDED");
      const serialized = JSON.stringify(terminal.result_metadata);
      expect(serialized).not.toContain("resolved-MUST-NEVER-LEAK-aaa");
      expect(serialized).not.toContain("FAKE_INVOKE_LEAK_TEST");
      expect(serialized).not.toContain("tok_NEVER_LEAK_invoke_99");
    } finally {
      delete process.env.FAKE_INVOKE_LEAK_TEST;
    }
  });
});
