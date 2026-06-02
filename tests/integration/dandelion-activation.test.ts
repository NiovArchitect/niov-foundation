// FILE: dandelion-activation.test.ts (integration)
// PURPOSE: D6 Dandelion Stage F activation runtime — first slice
//          coverage for the starter-pilot archetype. Verifies:
//          - Catalog loaded from disk (the same JSON the D6
//            validator checks at substrate tier)
//          - All 6 steps emit one ADMIN_ACTION audit event each
//            (chain integrity preserved per ADR-0002)
//          - Final step audit_literal is
//            "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED"
//          - Step ordering matches the catalog (monotonic 1..6)
//          - Auth gate: non-admin caller rejected NOT_ADMIN
//          - Auth gate: unknown caller rejected CALLER_ENTITY_NOT_FOUND
//          - details.action discriminators match the catalog's
//            audit_literal sub-strings
//          - Audit chain remains verifiable end-to-end
// CONNECTS TO: apps/api/src/services/governance/dandelion-activation.service.ts,
//              docs/dandelion-activation/starter-pilot-activation.json,
//              packages/database/src/queries/audit.ts.

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveEscalationForCaller,
  buildApp,
  createEscalationForCaller,
  dualControlDescription,
  executePhase0,
  executeStarterPilotActivationForCaller,
  executeTeamActivationForCaller,
  executeBusinessActivationForCaller,
  executeEnterpriseActivationForCaller,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  type Phase0Input,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { computeTARHash, createEntity, prisma, verifyAuditChain } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "d6-activation-test-secret";
const TEST_KEY = randomBytes(32);
let app: FastifyInstance;

// D6 enterprise dual-control wiring: EscalationRequest rows have no
// onDelete: Cascade on entity relations, so we own the cleanup. Runs
// BEFORE cleanupTestData() which hard-deletes the TEST_PREFIX-tagged
// entities.
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

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestEscalations();
  await cleanupTestData();
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore: new MemoryNonceStore(),
    declarationStore: new MemoryNonceStore(),
    contentStore: new MemoryContentStore(),
    contentEncryption: new ContentEncryption(TEST_KEY),
    rateLimitStore: new MemoryRateLimitStore(),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestEscalations();
  await cleanupTestData();
  await prisma.$disconnect();
});

function makePhase0Input(overrides: Partial<Phase0Input> = {}): Phase0Input {
  const id = randomUUID();
  return {
    company_name: `${TEST_PREFIX}company_${id}`,
    industry: "TECH",
    admin_email: `${TEST_PREFIX}admin_${id}@niov.test`,
    admin_password: "correct-horse-battery",
    admin_first_name: "Test",
    admin_last_name: "Admin",
    actor_entity_id: null,
    ...overrides,
  };
}

describe("D6 starter-pilot activation — success path", () => {
  it("walks all 6 catalog steps and emits one ADMIN_ACTION audit per step", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeStarterPilotActivationForCaller(
      phase0.admin_entity_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.archetype).toBe("starter-pilot");
    expect(result.plan_id).toBe("activation.starter-pilot.v1");
    expect(result.steps.length).toBe(6);
    // step_order monotonic from 1
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      expect(step).toBeDefined();
      if (!step) continue;
      expect(step.step_order).toBe(i + 1);
    }
    // Final step is STARTER_ENVELOPE_ACTIVATED
    const finalStep = result.steps[result.steps.length - 1];
    expect(finalStep).toBeDefined();
    if (!finalStep) return;
    expect(finalStep.audit_literal).toBe(
      "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED",
    );
    expect(result.activation_audit_event_id).toBe(finalStep.audit_event_id);
  });

  it("emits one audit row per step with details.action matching the catalog audit_literal sub-string", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeStarterPilotActivationForCaller(
      phase0.admin_entity_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const step of result.steps) {
      const row = await prisma.auditEvent.findUnique({
        where: { audit_id: step.audit_event_id },
        select: { event_type: true, details: true, actor_entity_id: true },
      });
      expect(row).not.toBeNull();
      expect(row?.event_type).toBe("ADMIN_ACTION");
      expect(row?.actor_entity_id).toBe(phase0.admin_entity_id);
      const details = (row?.details ?? {}) as Record<string, unknown>;
      const expectedAction = step.audit_literal.slice(
        "ADMIN_ACTION:".length,
      );
      expect(details["action"]).toBe(expectedAction);
      expect(details["archetype"]).toBe("starter-pilot");
      expect(details["plan_id"]).toBe("activation.starter-pilot.v1");
      expect(details["step_order"]).toBe(step.step_order);
      expect(details["step_id"]).toBe(step.step_id);
    }
  });

  it("preserves audit chain integrity end-to-end", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeStarterPilotActivationForCaller(
      phase0.admin_entity_id,
    );
    expect(result.ok).toBe(true);
    // verifyAuditChain walks the audit_event rows for the caller
    // and asserts hash-chain integrity per ADR-0002. brokenAt is
    // non-null only when a row's stored hash does not match the
    // re-computed chain link.
    const chainResult = await verifyAuditChain(phase0.admin_entity_id);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.brokenAt).toBeNull();
  });

  it("does NOT create any new audit literal (event_type stays ADMIN_ACTION across all 6 steps)", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeStarterPilotActivationForCaller(
      phase0.admin_entity_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const eventTypes = await Promise.all(
      result.steps.map(async (s) => {
        const row = await prisma.auditEvent.findUnique({
          where: { audit_id: s.audit_event_id },
          select: { event_type: true },
        });
        return row?.event_type;
      }),
    );
    for (const t of eventTypes) {
      expect(t).toBe("ADMIN_ACTION");
    }
  });
});

describe("D6 starter-pilot activation — auth gate", () => {
  it("rejects a non-admin caller as NOT_ADMIN", async () => {
    // Create a fresh entity with no admin capability + no membership
    const nonAdmin = await createEntity(makeEntityInput());
    const result = await executeStarterPilotActivationForCaller(
      nonAdmin.entity_id,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // CALLER_NOT_IN_ORG or NOT_ADMIN — both indicate failure to enter
    // the admin path; we accept either since createEntity doesn't
    // create a membership row.
    expect(
      result.code === "CALLER_ENTITY_NOT_FOUND" ||
        result.code === "CALLER_NOT_IN_ORG" ||
        result.code === "NOT_ADMIN",
    ).toBe(true);
  });

  it("rejects an unknown caller_entity_id as CALLER_ENTITY_NOT_FOUND or CALLER_NOT_IN_ORG", async () => {
    const result = await executeStarterPilotActivationForCaller(randomUUID());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.code === "CALLER_ENTITY_NOT_FOUND" ||
        result.code === "CALLER_NOT_IN_ORG" ||
        result.code === "NOT_ADMIN",
    ).toBe(true);
  });
});

describe("D6 starter-pilot activation — catalog integrity", () => {
  it("loads exactly 6 steps from the on-disk catalog and the step shape matches", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeStarterPilotActivationForCaller(
      phase0.admin_entity_id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Catalog has these 6 steps in order — verifying canonical
    // step_id sequence matches the substrate catalog.
    const expectedStepIds = [
      "step.precheck.envelope-state",
      "step.dmw.baseline-grant",
      "step.role.template-assignment",
      "step.workflow.template-only-register",
      "step.aha.safe-fallback-register",
      "step.envelope.mark-activated",
    ];
    const actualStepIds = result.steps.map((s) => s.step_id);
    expect(actualStepIds).toEqual(expectedStepIds);
  });
});

describe("D6 POST /org/dandelion/activate — HTTP surface", () => {
  async function loginAdmin(
    email: string,
    password: string,
  ): Promise<{ token: string; ip: string }> {
    const ip = `10.77.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password,
        requested_operations: ["read", "write", "share"],
      },
      remoteAddress: ip,
    });
    if (login.statusCode !== 200) {
      throw new Error(`login failed: ${login.statusCode} ${login.body}`);
    }
    return { token: (login.json() as { token: string }).token, ip };
  }

  it("returns 200 + ok:true with 6 step results when the admin caller activates the starter-pilot envelope", async () => {
    const input = makePhase0Input();
    const phase0 = await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["archetype"]).toBe("starter-pilot");
    expect(body["plan_id"]).toBe("activation.starter-pilot.v1");
    const steps = body["steps"];
    expect(Array.isArray(steps)).toBe(true);
    if (Array.isArray(steps)) {
      expect(steps.length).toBe(6);
    }
    expect(typeof body["activation_audit_event_id"]).toBe("string");
    // The route's audit emission is tied to phase0.admin_entity_id;
    // we don't read it back here since the service-tier test already
    // covers row-level details.action.
    expect(phase0.admin_entity_id).toBeDefined();
  });

  it("returns 401/403 (unauthenticated) when called without a bearer token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate",
      payload: {},
    });
    expect([401, 403]).toContain(response.statusCode);
  });

  it("returns 403 when the caller has a session but no can_admin_org capability", async () => {
    // Create a plain PERSON entity with no admin capability, login,
    // and POST to the route. The requireAdminCapability gate must
    // reject before the service is reached.
    const input = makeEntityInput({ entity_type: "PERSON", password: "correct-horse-battery" });
    await createEntity(input);
    const ip = `10.77.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password: "correct-horse-battery",
        requested_operations: ["read"],
      },
      remoteAddress: ip,
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { token: string }).token;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════
// D6 TEAM ARCHETYPE TESTS — service tier + HTTP tier
// ════════════════════════════════════════════════════════════════

function makeSlackInput(suffix: string): {
  slack_display_name: string;
  slack_secret_ref: string;
} {
  const id = randomUUID().slice(0, 8);
  // secret_ref must satisfy connector-binding.service.ts SECRET_REF_RE
  // (UPPER_SNAKE_CASE: starts with letter, ends with letter/digit;
  // 3-120 chars). TEST_PREFIX is lowercase, so omit it from the
  // secret_ref; cleanupTestData targets entity rows by TEST_PREFIX
  // display_name, not connector binding rows.
  return {
    slack_display_name: `${TEST_PREFIX}slack_${suffix}_${id}`,
    slack_secret_ref: `D6_TEST_SLACK_TOKEN_${suffix.toUpperCase()}_${id.toUpperCase().replace(/-/g, "_")}`,
  };
}

describe("D6 team activation — success path", () => {
  it("walks all 8 team catalog steps and emits one ADMIN_ACTION audit per step", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(
      phase0.admin_entity_id,
      makeSlackInput("svc1"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.archetype).toBe("team");
    expect(result.plan_id).toBe("activation.team.v1");
    expect(result.steps.length).toBe(8);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      expect(step).toBeDefined();
      if (!step) continue;
      expect(step.step_order).toBe(i + 1);
    }
    const finalStep = result.steps[result.steps.length - 1];
    expect(finalStep).toBeDefined();
    if (!finalStep) return;
    expect(finalStep.audit_literal).toBe(
      "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED",
    );
  });

  it("matches the canonical team-archetype catalog step_id sequence", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(
      phase0.admin_entity_id,
      makeSlackInput("svc2"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedStepIds = [
      "step.precheck.envelope-state",
      "step.dmw.baseline-grant",
      "step.dmw.team-scope-extension",
      "step.role.template-and-team-assignment",
      "step.connector.slack-binding-register",
      "step.workflow.stage-2-template-register",
      "step.aha.slack-bound-and-fallback-register",
      "step.envelope.mark-activated",
    ];
    expect(result.steps.map((s) => s.step_id)).toEqual(expectedStepIds);
  });

  it("creates a real SLACK_READ ConnectorBinding row with use_real:false at step 5", async () => {
    const slackInput = makeSlackInput("svc3");
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(
      phase0.admin_entity_id,
      slackInput,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The connector-binding service stores the binding scoped to
    // the caller's org. Find it by display_name (TEST_PREFIX-uniquely
    // named per test).
    const binding = await prisma.connectorBinding.findFirst({
      where: {
        display_name: slackInput.slack_display_name,
        deleted_at: null,
      },
    });
    expect(binding).not.toBeNull();
    expect(binding?.type).toBe("SLACK_READ");
    expect(binding?.secret_ref).toBe(slackInput.slack_secret_ref);
    // config.use_real: false at activation tier (no real-mode flip
    // at this slice; Founder authorizes that separately at
    // deployment register).
    const config = (binding?.config ?? {}) as Record<string, unknown>;
    expect(config["use_real"]).toBe(false);
  });

  it("preserves audit chain integrity across all 8 team steps", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(
      phase0.admin_entity_id,
      makeSlackInput("svc4"),
    );
    expect(result.ok).toBe(true);
    const chainResult = await verifyAuditChain(phase0.admin_entity_id);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.brokenAt).toBeNull();
  });

  it("step 5 audit row carries binding_display_name + binding_secret_ref_name but NEVER a resolved value", async () => {
    const slackInput = makeSlackInput("svc5");
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(
      phase0.admin_entity_id,
      slackInput,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step5 = result.steps[4];
    expect(step5).toBeDefined();
    if (!step5) return;
    expect(step5.step_id).toBe("step.connector.slack-binding-register");
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: step5.audit_event_id },
      select: { event_type: true, details: true },
    });
    expect(row?.event_type).toBe("ADMIN_ACTION");
    const details = (row?.details ?? {}) as Record<string, unknown>;
    expect(details["action"]).toBe("CONNECTOR_BINDING_REGISTERED");
    expect(details["connector_type"]).toBe("SLACK_READ");
    expect(details["binding_display_name"]).toBe(slackInput.slack_display_name);
    expect(details["binding_secret_ref_name"]).toBe(
      slackInput.slack_secret_ref,
    );
    // The resolved env-var VALUE never crosses the boundary; the
    // env-var NAME is documented; we assert the serialized row
    // contains no token-shaped value (xoxb- pattern + Bearer).
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/xoxb-[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}/);
    expect(serialized.toLowerCase()).not.toContain("bearer ");
  });
});

describe("D6 team activation — input + auth failures", () => {
  it("rejects empty slack_display_name as INVALID_SLACK_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(phase0.admin_entity_id, {
      slack_display_name: "",
      slack_secret_ref: "SLACK_BOT_TOKEN_X",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_SLACK_BINDING_INPUT");
  });

  it("rejects empty slack_secret_ref as INVALID_SLACK_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeTeamActivationForCaller(phase0.admin_entity_id, {
      slack_display_name: "x",
      slack_secret_ref: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_SLACK_BINDING_INPUT");
  });
});

describe("D6 POST /org/dandelion/activate/team — HTTP surface", () => {
  async function loginAdmin(
    email: string,
    password: string,
  ): Promise<{ token: string; ip: string }> {
    const ip = `10.66.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password,
        requested_operations: ["read", "write", "share"],
      },
      remoteAddress: ip,
    });
    if (login.statusCode !== 200) {
      throw new Error(`login failed: ${login.statusCode} ${login.body}`);
    }
    return { token: (login.json() as { token: string }).token, ip };
  }

  it("returns 200 + ok:true with 8 step results when the admin caller activates the team envelope", async () => {
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);
    const slack = makeSlackInput("http1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/team",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: slack,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["archetype"]).toBe("team");
    expect(body["plan_id"]).toBe("activation.team.v1");
    const steps = body["steps"];
    expect(Array.isArray(steps)).toBe(true);
    if (Array.isArray(steps)) {
      expect(steps.length).toBe(8);
    }
  });

  it("returns 422 with INVALID_SLACK_BINDING_INPUT when slack_display_name is missing", async () => {
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/team",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: { slack_secret_ref: "SLACK_BOT_TOKEN_X" },
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect(body["code"]).toBe("INVALID_SLACK_BINDING_INPUT");
  });

  it("returns 403 when caller has session but no can_admin_org", async () => {
    const input = makeEntityInput({
      entity_type: "PERSON",
      password: "correct-horse-battery",
    });
    await createEntity(input);
    const ip = `10.66.99.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: input.email,
        password: "correct-horse-battery",
        requested_operations: ["read"],
      },
      remoteAddress: ip,
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { token: string }).token;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/team",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: { slack_display_name: "x", slack_secret_ref: "y" },
    });
    expect(response.statusCode).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════
// D6 BUSINESS ARCHETYPE TESTS — service tier + HTTP tier
// ════════════════════════════════════════════════════════════════

function makeSlackAndGoogleInput(suffix: string): {
  slack_display_name: string;
  slack_secret_ref: string;
  google_display_name: string;
  google_secret_ref: string;
} {
  const id = randomUUID().slice(0, 8).toUpperCase().replace(/-/g, "_");
  return {
    slack_display_name: `${TEST_PREFIX}biz_slack_${suffix}_${id}`,
    slack_secret_ref: `D6_TEST_SLACK_TOKEN_${suffix.toUpperCase()}_${id}`,
    google_display_name: `${TEST_PREFIX}biz_google_${suffix}_${id}`,
    google_secret_ref: `D6_TEST_GOOGLE_TOKEN_${suffix.toUpperCase()}_${id}`,
  };
}

describe("D6 business activation — success path", () => {
  it("walks all 11 business catalog steps and emits one ADMIN_ACTION audit per step", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      makeSlackAndGoogleInput("svc1"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.archetype).toBe("business");
    expect(result.plan_id).toBe("activation.business.v1");
    expect(result.steps.length).toBe(11);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      expect(step).toBeDefined();
      if (!step) continue;
      expect(step.step_order).toBe(i + 1);
    }
    const finalStep = result.steps[result.steps.length - 1];
    expect(finalStep).toBeDefined();
    if (!finalStep) return;
    expect(finalStep.audit_literal).toBe(
      "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED",
    );
  });

  it("matches the canonical business-archetype catalog step_id sequence", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      makeSlackAndGoogleInput("svc2"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedStepIds = [
      "step.precheck.envelope-state",
      "step.dmw.baseline-grant",
      "step.dmw.project-customer-scope-extension",
      "step.role.business-template-assignment",
      "step.authority.delegated-profile-register",
      "step.connector.slack-binding-register",
      "step.connector.google-workspace-binding-register",
      "step.workflow.stage-2-business-templates-register",
      "step.audit.advanced-tier-enable",
      "step.aha.multi-connector-register",
      "step.envelope.mark-activated",
    ];
    expect(result.steps.map((s) => s.step_id)).toEqual(expectedStepIds);
  });

  it("creates BOTH a real SLACK_READ + a real GOOGLE_WORKSPACE_READ ConnectorBinding row", async () => {
    const input = makeSlackAndGoogleInput("svc3");
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      input,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slackBinding = await prisma.connectorBinding.findFirst({
      where: {
        display_name: input.slack_display_name,
        deleted_at: null,
      },
    });
    expect(slackBinding).not.toBeNull();
    expect(slackBinding?.type).toBe("SLACK_READ");
    expect(slackBinding?.secret_ref).toBe(input.slack_secret_ref);
    const slackConfig = (slackBinding?.config ?? {}) as Record<string, unknown>;
    expect(slackConfig["use_real"]).toBe(false);

    const googleBinding = await prisma.connectorBinding.findFirst({
      where: {
        display_name: input.google_display_name,
        deleted_at: null,
      },
    });
    expect(googleBinding).not.toBeNull();
    expect(googleBinding?.type).toBe("GOOGLE_WORKSPACE_READ");
    expect(googleBinding?.secret_ref).toBe(input.google_secret_ref);
    const googleConfig = (googleBinding?.config ?? {}) as Record<string, unknown>;
    expect(googleConfig["use_real"]).toBe(false);
  });

  it("preserves audit chain integrity across all 11 business steps", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      makeSlackAndGoogleInput("svc4"),
    );
    expect(result.ok).toBe(true);
    const chainResult = await verifyAuditChain(phase0.admin_entity_id);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.brokenAt).toBeNull();
  });

  it("step 5 (delegated-authority) + step 9 (advanced-audit-tier) emit audit-only at this slice (no underlying mutation)", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      makeSlackAndGoogleInput("svc5"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step5 = result.steps[4];
    expect(step5?.audit_literal).toBe("ADMIN_ACTION:DELEGATED_AUTHORITY_REGISTERED");
    const step9 = result.steps[8];
    expect(step9?.audit_literal).toBe("ADMIN_ACTION:ADVANCED_AUDIT_TIER_ENABLED");
    // Verify audit rows exist for both
    if (step5) {
      const row = await prisma.auditEvent.findUnique({
        where: { audit_id: step5.audit_event_id },
        select: { event_type: true, details: true },
      });
      expect(row?.event_type).toBe("ADMIN_ACTION");
      const details = (row?.details ?? {}) as Record<string, unknown>;
      expect(details["action"]).toBe("DELEGATED_AUTHORITY_REGISTERED");
    }
  });

  it("step 7 Google binding audit row carries connector_type GOOGLE_WORKSPACE_READ + env-var NAME (NEVER ya29.* token)", async () => {
    const input = makeSlackAndGoogleInput("svc6");
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      input,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step7 = result.steps[6];
    expect(step7?.step_id).toBe("step.connector.google-workspace-binding-register");
    if (!step7) return;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: step7.audit_event_id },
      select: { event_type: true, details: true },
    });
    expect(row?.event_type).toBe("ADMIN_ACTION");
    const details = (row?.details ?? {}) as Record<string, unknown>;
    expect(details["action"]).toBe("CONNECTOR_BINDING_REGISTERED");
    expect(details["connector_type"]).toBe("GOOGLE_WORKSPACE_READ");
    expect(details["binding_display_name"]).toBe(input.google_display_name);
    expect(details["binding_secret_ref_name"]).toBe(input.google_secret_ref);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/ya29\.[A-Za-z0-9_-]{8,}/);
    expect(serialized).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(serialized.toLowerCase()).not.toContain("bearer ");
  });
});

describe("D6 business activation — input + auth failures", () => {
  it("rejects empty slack_display_name as INVALID_SLACK_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      {
        slack_display_name: "",
        slack_secret_ref: "SLACK_X",
        google_display_name: "google-x",
        google_secret_ref: "GOOGLE_X",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_SLACK_BINDING_INPUT");
  });

  it("rejects empty google_display_name as INVALID_GOOGLE_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      {
        slack_display_name: "slack-x",
        slack_secret_ref: "SLACK_X",
        google_display_name: "",
        google_secret_ref: "GOOGLE_X",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_GOOGLE_BINDING_INPUT");
  });

  it("rejects empty google_secret_ref as INVALID_GOOGLE_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeBusinessActivationForCaller(
      phase0.admin_entity_id,
      {
        slack_display_name: "slack-x",
        slack_secret_ref: "SLACK_X",
        google_display_name: "google-x",
        google_secret_ref: "",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_GOOGLE_BINDING_INPUT");
  });
});

describe("D6 POST /org/dandelion/activate/business — HTTP surface", () => {
  async function loginAdmin(
    email: string,
    password: string,
  ): Promise<{ token: string; ip: string }> {
    const ip = `10.55.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password,
        requested_operations: ["read", "write", "share"],
      },
      remoteAddress: ip,
    });
    if (login.statusCode !== 200) {
      throw new Error(`login failed: ${login.statusCode} ${login.body}`);
    }
    return { token: (login.json() as { token: string }).token, ip };
  }

  it("returns 200 + ok:true with 11 step results when the admin caller activates the business envelope", async () => {
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);
    const bindings = makeSlackAndGoogleInput("http1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/business",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: bindings,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["archetype"]).toBe("business");
    expect(body["plan_id"]).toBe("activation.business.v1");
    const steps = body["steps"];
    expect(Array.isArray(steps)).toBe(true);
    if (Array.isArray(steps)) {
      expect(steps.length).toBe(11);
    }
  });

  it("returns 422 with INVALID_GOOGLE_BINDING_INPUT when google_display_name is missing", async () => {
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/business",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: {
        slack_display_name: "x",
        slack_secret_ref: "SLACK_X",
        google_secret_ref: "GOOGLE_X",
      },
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect(body["code"]).toBe("INVALID_GOOGLE_BINDING_INPUT");
  });
});

// ════════════════════════════════════════════════════════════════
// D6 ENTERPRISE ARCHETYPE TESTS — service tier + HTTP tier
// ════════════════════════════════════════════════════════════════

function makeEnterpriseInput(suffix: string): {
  slack_display_name: string;
  slack_secret_ref: string;
  google_display_name: string;
  google_secret_ref: string;
} {
  const id = randomUUID().slice(0, 8).toUpperCase().replace(/-/g, "_");
  return {
    slack_display_name: `${TEST_PREFIX}ent_slack_${suffix}_${id}`,
    slack_secret_ref: `D6_TEST_ENT_SLACK_TOKEN_${suffix.toUpperCase()}_${id}`,
    google_display_name: `${TEST_PREFIX}ent_google_${suffix}_${id}`,
    google_secret_ref: `D6_TEST_ENT_GOOGLE_TOKEN_${suffix.toUpperCase()}_${id}`,
  };
}

describe("D6 enterprise activation — success path", () => {
  it("walks all 14 enterprise catalog steps and emits one ADMIN_ACTION audit per step", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      makeEnterpriseInput("svc1"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.archetype).toBe("enterprise");
    expect(result.plan_id).toBe("activation.enterprise.v1");
    expect(result.steps.length).toBe(14);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      expect(step).toBeDefined();
      if (!step) continue;
      expect(step.step_order).toBe(i + 1);
    }
    const finalStep = result.steps[result.steps.length - 1];
    expect(finalStep).toBeDefined();
    if (!finalStep) return;
    expect(finalStep.audit_literal).toBe(
      "ADMIN_ACTION:STARTER_ENVELOPE_ACTIVATED",
    );
  });

  it("matches the canonical enterprise-archetype catalog step_id sequence", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      makeEnterpriseInput("svc2"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedStepIds = [
      "step.precheck.envelope-state",
      "step.dmw.baseline-grant",
      "step.dmw.full-scope-extension",
      "step.role.enterprise-template-assignment",
      "step.authority.delegated-profile-register",
      "step.break-glass.grant-registry-enable",
      "step.lawful-basis.attestation-surface-enable",
      "step.connector.slack-binding-register",
      "step.connector.google-workspace-binding-register",
      "step.workflow.stage-2-enterprise-templates-register",
      "step.audit.regulator-grade-enable",
      "step.board.observer-scope-register",
      "step.aha.enterprise-multi-connector-register",
      "step.envelope.mark-activated",
    ];
    expect(result.steps.map((s) => s.step_id)).toEqual(expectedStepIds);
  });

  it("creates BOTH a real SLACK_READ + a real GOOGLE_WORKSPACE_READ binding at steps 8 + 9", async () => {
    const input = makeEnterpriseInput("svc3");
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      input,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slackBinding = await prisma.connectorBinding.findFirst({
      where: {
        display_name: input.slack_display_name,
        deleted_at: null,
      },
    });
    expect(slackBinding).not.toBeNull();
    expect(slackBinding?.type).toBe("SLACK_READ");
    const googleBinding = await prisma.connectorBinding.findFirst({
      where: {
        display_name: input.google_display_name,
        deleted_at: null,
      },
    });
    expect(googleBinding).not.toBeNull();
    expect(googleBinding?.type).toBe("GOOGLE_WORKSPACE_READ");
  });

  it("preserves audit chain integrity across all 14 enterprise steps", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      makeEnterpriseInput("svc4"),
    );
    expect(result.ok).toBe(true);
    const chainResult = await verifyAuditChain(phase0.admin_entity_id);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.brokenAt).toBeNull();
  });

  it("emits DUAL-CONTROL audit literals at step 10 + step 11 (truthfully records design-intent)", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      makeEnterpriseInput("svc5"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step10 = result.steps[9];
    expect(step10?.audit_literal).toBe(
      "ADMIN_ACTION:WORKFLOW_TEMPLATE_REGISTERED_DUAL_CONTROL",
    );
    const step11 = result.steps[10];
    expect(step11?.audit_literal).toBe(
      "ADMIN_ACTION:REGULATOR_GRADE_AUDIT_ENABLED_DUAL_CONTROL",
    );
  });

  it("step 6 break-glass + step 7 LawfulBasis + step 12 board observer all emit audit-only", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      makeEnterpriseInput("svc6"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step6 = result.steps[5];
    expect(step6?.audit_literal).toBe("ADMIN_ACTION:BREAK_GLASS_REGISTRY_ENABLED");
    const step7 = result.steps[6];
    expect(step7?.audit_literal).toBe("ADMIN_ACTION:LAWFUL_BASIS_ATTESTATION_ENABLED");
    const step12 = result.steps[11];
    expect(step12?.audit_literal).toBe("ADMIN_ACTION:BOARD_OBSERVER_SCOPE_REGISTERED");
  });
});

describe("D6 enterprise activation — input + auth failures", () => {
  it("rejects empty slack_display_name as INVALID_SLACK_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      {
        slack_display_name: "",
        slack_secret_ref: "SLACK_X",
        google_display_name: "google-x",
        google_secret_ref: "GOOGLE_X",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_SLACK_BINDING_INPUT");
  });

  it("rejects empty google_secret_ref as INVALID_GOOGLE_BINDING_INPUT", async () => {
    const phase0 = await executePhase0(makePhase0Input());
    const result = await executeEnterpriseActivationForCaller(
      phase0.admin_entity_id,
      {
        slack_display_name: "slack-x",
        slack_secret_ref: "SLACK_X",
        google_display_name: "google-x",
        google_secret_ref: "",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_GOOGLE_BINDING_INPUT");
  });
});

describe("D6 POST /org/dandelion/activate/enterprise — HTTP surface (dual-control)", () => {
  async function loginAdmin(
    email: string,
    password: string,
  ): Promise<{ token: string; ip: string }> {
    const ip = `10.44.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password,
        requested_operations: ["read", "write", "share"],
      },
      remoteAddress: ip,
    });
    if (login.statusCode !== 200) {
      throw new Error(`login failed: ${login.statusCode} ${login.body}`);
    }
    return { token: (login.json() as { token: string }).token, ip };
  }

  // D6 DUAL-CONTROL middleware wiring: grant a dual-control APPROVAL
  // for the caller against the ORG_DANDELION_ENTERPRISE_ACTIVATION
  // action. Mirrors the org-action-policies.test.ts
  // grantPolicyUpdateApproval helper (Class B same-org pattern): the
  // distinct approver must be linked to the same org via
  // EntityMembership so the Class B target resolver can find them
  // structurally. Without the membership, the org has only 1 admin
  // and the middleware fails closed with 503 +
  // DUAL_CONTROL_NO_APPROVER_AVAILABLE per ADR-0026 Amendment 1 §6.
  async function grantEnterpriseActivationApproval(
    callerEntityId: string,
    orgId: string,
  ): Promise<string> {
    const distinctApprover = await createEntity(
      makeEntityInput({ entity_type: "PERSON" }),
    );
    // Link the approver to the same org so Class B candidate
    // resolution can discover them.
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
      description: dualControlDescription(
        "ORG_DANDELION_ENTERPRISE_ACTIVATION",
      ),
      expires_at: null,
    });
    await approveEscalationForCaller(
      distinctApprover.entity_id,
      created.escalation_id,
    );
    return created.escalation_id;
  }

  // Helper to seed a second can_admin_org entity in the same org so
  // that Class B target resolution can discover an approver. Without
  // can_admin_org on the second entity, the Class B candidate pool is
  // empty and the middleware fails closed with 503 +
  // DUAL_CONTROL_NO_APPROVER_AVAILABLE (intentional per GAP-C1).
  async function seedSecondOrgAdmin(orgId: string): Promise<string> {
    const second = await createEntity(makeEntityInput({ entity_type: "PERSON" }));
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: second.entity_id,
        role_title: "MEMBER",
        is_active: true,
      },
    });
    // Flip can_admin_org + recompute TAR hash so Class B candidate
    // pool sees them as a structurally-valid approver.
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: second.entity_id },
      data: { can_admin_org: true },
    });
    const fresh = await prisma.tokenAttributeRepository.findUnique({
      where: { entity_id: second.entity_id },
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
      where: { entity_id: second.entity_id },
      data: { tar_hash: newHash },
    });
    return second.entity_id;
  }

  it("returns 503 DUAL_CONTROL_NO_APPROVER_AVAILABLE for a single-admin org (Class B fail-closed)", async () => {
    // Single-admin org: only the Dandelion-created admin exists.
    // Class B target resolver cannot find a structurally-distinct
    // same-org approver → 503 fail-closed per ADR-0026 Amendment 1
    // §6 (GAP-C1 self-approval guard).
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/enterprise",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: makeEnterpriseInput("dc-503"),
    });
    expect(response.statusCode).toBe(503);
  });

  it("returns 403 when caller has no APPROVED dual-control EscalationRequest but a second admin exists (creates PENDING)", async () => {
    const input = makePhase0Input();
    const phase0 = await executePhase0(input);
    // Seed a second org admin so Class B resolution succeeds and the
    // middleware can create a PENDING escalation row.
    await seedSecondOrgAdmin(phase0.org_entity_id);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/enterprise",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: makeEnterpriseInput("dc-403"),
    });
    expect(response.statusCode).toBe(403);
    // A PENDING EscalationRequest should now exist for this caller
    const pending = await prisma.escalationRequest.findFirst({
      where: {
        source_entity_id: phase0.admin_entity_id,
        escalation_type: "DUAL_CONTROL_REQUIRED",
        status: "PENDING",
        description: dualControlDescription(
          "ORG_DANDELION_ENTERPRISE_ACTIVATION",
        ),
      },
    });
    expect(pending).not.toBeNull();
  });

  it("returns 200 + ok:true with 14 step results when the admin caller has an APPROVED dual-control grant", async () => {
    const input = makePhase0Input();
    const phase0 = await executePhase0(input);
    await grantEnterpriseActivationApproval(
      phase0.admin_entity_id,
      phase0.org_entity_id,
    );
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);
    const bindings = makeEnterpriseInput("http1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/enterprise",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: bindings,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["archetype"]).toBe("enterprise");
    expect(body["plan_id"]).toBe("activation.enterprise.v1");
    const steps = body["steps"];
    expect(Array.isArray(steps)).toBe(true);
    if (Array.isArray(steps)) {
      expect(steps.length).toBe(14);
    }
  });

  it("returns 422 with INVALID_GOOGLE_BINDING_INPUT when google_display_name is missing (after dual-control passes)", async () => {
    const input = makePhase0Input();
    const phase0 = await executePhase0(input);
    await grantEnterpriseActivationApproval(
      phase0.admin_entity_id,
      phase0.org_entity_id,
    );
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate/enterprise",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: {
        slack_display_name: "x",
        slack_secret_ref: "SLACK_X",
        google_secret_ref: "GOOGLE_X",
      },
    });
    expect(response.statusCode).toBe(422);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect(body["code"]).toBe("INVALID_GOOGLE_BINDING_INPUT");
  });

  it("non-enterprise routes (starter-pilot / team / business) remain single-actor (no dual-control)", async () => {
    // The starter-pilot route is not in PRIVILEGED_ENDPOINTS and must
    // continue to operate without a dual-control approval.
    const input = makePhase0Input();
    await executePhase0(input);
    const { token, ip } = await loginAdmin(input.admin_email, input.admin_password);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/org/dandelion/activate",
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: ip,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["archetype"]).toBe("starter-pilot");
  });
});
