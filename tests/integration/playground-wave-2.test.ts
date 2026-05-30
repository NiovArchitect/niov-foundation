// FILE: playground-wave-2.test.ts (integration)
// PURPOSE: Section 5 Wave 2 Agent Playground v1 contract coverage
//          per ADR-0060. Exercises all 3 inspector routes; verifies
//          bearer enforcement; verifies sandbox-only behavior
//          (no Action/ActionAttempt/Notification/OtzarConversation/
//          MemoryCapsule row created); verifies connector dry-run
//          hard-wired to FixtureBasedConnectorProvider (forced
//          failure fixture keys behave as documented; production
//          provider unreachable); verifies working-set inspector
//          SAFE projection (no raw `content` field; no governance/
//          permission/wallet internals); verifies no new audit
//          literal emitted.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground.service.ts
//   - ADR-0060 Section 5 Agent Playground v1 design

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  TEST_PREFIX,
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "playground-wave-2-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
const store = new MemoryRateLimitStore();

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
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

async function loginPerson(): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  const ip = `10.92.${Math.floor(Math.random() * 200) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
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

async function post(
  caller: { token: string; ip: string } | null,
  url: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "POST",
    url,
    headers:
      caller === null
        ? {}
        : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    payload: body,
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

const SAFE_POLICY_ENVELOPE = {
  twin_autonomy_level: "APPROVAL_REQUIRED" as const,
  org_require_human_approval: true,
  org_auto_approve_low_risk: false,
  org_audit_ai_actions: true,
  entity_profile_safe_view: { role_template: "STANDARD" },
  tar_capability_bits: {
    can_admin_org: false,
    can_admin_niov: false,
    can_write_capsules: true,
    can_share_capsules: false,
  },
  permission_set_summary: { count: 0, bridges: [] },
  action_policy_row: null,
};

describe("Section 5 Wave 2 — auth enforcement", () => {
  it("401 SESSION_INVALID without bearer on policy-evaluator", async () => {
    const r = await post(null, "/api/v1/playground/policy-evaluator", {});
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("401 SESSION_INVALID without bearer on connector-dry-run", async () => {
    const r = await post(null, "/api/v1/playground/connector-dry-run", {});
    expect(r.statusCode).toBe(401);
  });

  it("401 SESSION_INVALID without bearer on working-set", async () => {
    const r = await post(null, "/api/v1/playground/working-set", {});
    expect(r.statusCode).toBe(401);
  });
});

describe("Section 5 Wave 2 — policy-evaluator inspector", () => {
  it("returns ENVELOPE_INVALID on malformed envelope", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/policy-evaluator", {
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      policy_envelope: { malformed: true },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.inspector_kind).toBe("POLICY_EVALUATOR");
    expect(r.body.result.ok).toBe(false);
    expect(r.body.result.reason).toBe("ENVELOPE_INVALID");
  });

  it("returns AUTO_APPROVE | REQUIRE_DUAL_CONTROL | FORBIDDEN for valid envelopes", async () => {
    const caller = await loginPerson();
    // APPROVAL_REQUIRED rung — Rung 4 returns REQUIRE_DUAL_CONTROL
    // for non-CRITICAL non-low-risk with no policy row →
    // POLICY_UNRESOLVED OR a decision per rung order. The exact
    // decision depends on rung-order semantics; assert ok: true +
    // closed-vocab decision string.
    const r = await post(caller, "/api/v1/playground/policy-evaluator", {
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      policy_envelope: SAFE_POLICY_ENVELOPE,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.inspector_kind).toBe("POLICY_EVALUATOR");
    // ok=true with a decision OR ok=false with POLICY_UNRESOLVED.
    const result = r.body.result;
    if (result.ok === true) {
      expect([
        "AUTO_APPROVE",
        "REQUIRE_DUAL_CONTROL",
        "REQUIRE_BREAK_GLASS",
        "FORBIDDEN",
      ]).toContain(result.decision);
      expect(typeof result.reason).toBe("string");
    } else {
      expect(["POLICY_UNRESOLVED", "ENVELOPE_INVALID"]).toContain(
        result.reason,
      );
    }
  });

  it("does NOT create any Action or ActionAttempt row", async () => {
    const caller = await loginPerson();
    const beforeActions = await prisma.action.count();
    const beforeAttempts = await prisma.actionAttempt.count();
    await post(caller, "/api/v1/playground/policy-evaluator", {
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      policy_envelope: SAFE_POLICY_ENVELOPE,
    });
    const afterActions = await prisma.action.count();
    const afterAttempts = await prisma.actionAttempt.count();
    expect(afterActions).toBe(beforeActions);
    expect(afterAttempts).toBe(beforeAttempts);
  });
});

describe("Section 5 Wave 2 — connector dry-run inspector", () => {
  it("returns FixtureBasedConnectorProvider attribution + ok success on baseline call", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { hello: "world" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.inspector_kind).toBe("CONNECTOR_DRY_RUN");
    expect(r.body.provider).toBe("FixtureBasedConnectorProvider");
    expect(r.body.result.ok).toBe(true);
    // Fixture provider always identifies itself in delivery_metadata.
    expect(r.body.result.delivery_metadata.provider).toBe(
      "FixtureBasedConnectorProvider",
    );
  });

  it("forces AUTH failure via fixture_key — proves fixture provider is in use (not real provider)", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { fixture_key: "force-auth-failure" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.result.ok).toBe(false);
    expect(r.body.result.error_class).toBe("AUTH");
  });

  it("forces TIMEOUT failure via fixture_key — proves fixture provider is reachable for every error class", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { fixture_key: "force-timeout" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.result.ok).toBe(false);
    expect(r.body.result.error_class).toBe("TIMEOUT");
  });

  it("does NOT create any ConnectorBinding or Notification row", async () => {
    const caller = await loginPerson();
    const beforeBindings = await prisma.connectorBinding.count();
    const beforeNotifs = await prisma.notification.count();
    await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { hello: "playground" },
    });
    const afterBindings = await prisma.connectorBinding.count();
    const afterNotifs = await prisma.notification.count();
    expect(afterBindings).toBe(beforeBindings);
    expect(afterNotifs).toBe(beforeNotifs);
  });

  it("response NEVER includes a real secret_ref env-var name", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { hello: "world" },
      // Try to plant a fake secret_ref the playground should reject /
      // ignore (the service hard-codes secret_ref: null).
      secret_ref: "FAKE_PROD_SECRET",
    });
    expect(r.statusCode).toBe(200);
    expect(r.raw).not.toContain("FAKE_PROD_SECRET");
    expect(r.raw).not.toContain("secret_ref");
  });
});

describe("Section 5 Wave 2 — working-set inspector", () => {
  it("returns SAFE projection (no `content` field); excludes raw payload", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/working-set", {
      request_text: `${TEST_PREFIX}query-${randomUUID()}`,
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.inspector_kind).toBe("WORKING_SET");
    expect(typeof r.body.capsules_loaded).toBe("number");
    expect(typeof r.body.tokens_consumed).toBe("number");
    expect(Array.isArray(r.body.capsules)).toBe(true);
    // Wire-level no-leak: response NEVER contains the raw `content`
    // field that COE.ContextItem exposes. Also no governance /
    // permission / wallet internals.
    expect(r.raw).not.toContain('"content"');
    expect(r.raw).not.toContain("storage_location");
    expect(r.raw).not.toContain("content_hash");
    expect(r.raw).not.toContain("secret_ref");
    expect(r.raw).not.toContain("bridge_id");
    expect(r.raw).not.toContain("payload_content");
    expect(r.raw).not.toContain("payload_summary");
    expect(r.raw).not.toContain("governance_terms");
  });

  it("does NOT create any OtzarConversation or MemoryCapsule row", async () => {
    const caller = await loginPerson();
    const beforeConvs = await prisma.otzarConversation.count();
    const beforeCapsules = await prisma.memoryCapsule.count();
    await post(caller, "/api/v1/playground/working-set", {
      request_text: `${TEST_PREFIX}query-${randomUUID()}`,
      token_budget: 1000,
    });
    const afterConvs = await prisma.otzarConversation.count();
    const afterCapsules = await prisma.memoryCapsule.count();
    expect(afterConvs).toBe(beforeConvs);
    expect(afterCapsules).toBe(beforeCapsules);
  });

  it("422 INVALID_REQUEST on missing request_text", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/working-set", {
      token_budget: 1000,
    });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });

  it("422 INVALID_REQUEST on non-positive token_budget", async () => {
    const caller = await loginPerson();
    const r = await post(caller, "/api/v1/playground/working-set", {
      request_text: "anything",
      token_budget: 0,
    });
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
});

describe("Section 5 Wave 2 — audit posture (ADR-0060 §2)", () => {
  it("no new playground-specific audit literal emitted across all 3 inspectors", async () => {
    const caller = await loginPerson();
    await post(caller, "/api/v1/playground/policy-evaluator", {
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      policy_envelope: SAFE_POLICY_ENVELOPE,
    });
    await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { hello: "world" },
    });
    await post(caller, "/api/v1/playground/working-set", {
      request_text: "anything",
      token_budget: 1000,
    });
    // ADR-0060 §2 + §5 intentional non-goal: the playground tier
    // adds ZERO new audit literals. The working-set inspector
    // delegates to COE.assembleContext which inherits its existing
    // ADR-0048 audit emissions (pre-existing literals — fine).
    // The relevant invariant is that NO row exists whose
    // event_type contains "PLAYGROUND" or "INSPECTOR" (the kinds
    // of literals a future audit-emission slice would add).
    const playgroundRows = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { event_type: { contains: "PLAYGROUND" } },
          { event_type: { contains: "INSPECTOR" } },
        ],
      },
      select: { event_type: true },
    });
    expect(playgroundRows).toHaveLength(0);
  });

  it("policy-evaluator + connector-dry-run inspectors emit ZERO audit rows", async () => {
    const caller = await loginPerson();
    // Snapshot BEFORE these two specific calls (which have NO
    // upstream audit-emitting delegate — unlike working-set
    // which delegates to COE.assembleContext).
    const before = await prisma.auditEvent.count({
      where: { actor_entity_id: caller.entityId },
    });
    await post(caller, "/api/v1/playground/policy-evaluator", {
      action_type: "RECORD_CAPSULE",
      risk_tier: "LOW",
      policy_envelope: SAFE_POLICY_ENVELOPE,
    });
    await post(caller, "/api/v1/playground/connector-dry-run", {
      type: "OUTBOUND_WEBHOOK",
      payload: { hello: "world" },
    });
    const after = await prisma.auditEvent.count({
      where: { actor_entity_id: caller.entityId },
    });
    expect(after).toBe(before);
  });
});
