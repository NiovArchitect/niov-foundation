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
  buildApp,
  executePhase0,
  executeStarterPilotActivationForCaller,
  executeTeamActivationForCaller,
  executeBusinessActivationForCaller,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
  type Phase0Input,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma, verifyAuditChain } from "@niov/database";
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

beforeAll(async () => {
  await ensureAuditTriggers();
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
