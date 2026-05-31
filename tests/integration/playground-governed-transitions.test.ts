// FILE: playground-governed-transitions.test.ts (integration)
// PURPOSE: Section 5 Wave 8 Option A Agent Playground
//          deterministic governed-transition coverage per
//          ADR-0075. Exercises the new
//          `POST /api/v1/playground/scenarios/:id/governed-transitions`
//          route. Verifies the FIRST Section 5 wave that
//          creates Section 2 Action rows: bearer enforcement;
//          owner-first + same-org SCENARIO_NOT_FOUND via
//          Wave 7 → Wave 6 → Wave 5 → Wave 4 delegation;
//          mandatory caller_confirmation: true; mandatory
//          idempotency_key; closed-vocab body validation;
//          conservative §4 mapping (SEND_INTERNAL_NOTIFICATION
//          only); STATUS_QUO + DO_NOT_PROCEED return
//          NO_ACTION_PROPOSED; blocked recommendations return
//          NO_ACTION_PROPOSED with closed-vocab reason; dual
//          audit emission (ADMIN_ACTION Playground handoff +
//          Section 2's existing ACTION_PROPOSED row);
//          §9 + §10 no-leak forbidden field surface; the
//          scenario is never mutated and no spurious Action
//          rows / Notification rows are created beyond the
//          single PROPOSED Action; Wave 7/6/5/4 regression
//          preserved.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-governed-transition.service.ts
//   - ADR-0075 Section 5 Wave 8 Governed-Transition Contract

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

const TEST_JWT_SECRET = "playground-governed-transitions-test-secret";
const TEST_KEY = randomBytes(32);

let app: FastifyInstance;
let SHARED_ORG_ID: string;
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
  // Wave 8 requires org membership because Section 2's
  // createActionForCaller invokes getOrgEntityId; ORG-less
  // callers receive 404 NO_ORG_FOR_CALLER. Shared org per
  // file (each PERSON in a separate org would also work; a
  // single shared org keeps the fixture cost minimal).
  SHARED_ORG_ID = await makeTestOrg();
  // Seed OrgSettings with auto_approve_low_risk=true +
  // require_human_approval=false so the policy evaluator
  // rung 1 (§4.1) + rung 6 (§4.6) yield AUTO_APPROVE for
  // SEND_INTERNAL_NOTIFICATION (LOW risk_tier). Default
  // OrgSettings has require_human_approval=true →
  // REQUIRE_DUAL_CONTROL → DUAL_CONTROL_NO_APPROVER_AVAILABLE
  // (no second admin in the solo-PERSON test org). This
  // configuration mirrors the production posture for low-risk
  // internal-notification Actions — internal-only delivery to
  // the owner is safe-by-construction.
  await prisma.orgSettings.upsert({
    where: { org_entity_id: SHARED_ORG_ID },
    create: {
      org_entity_id: SHARED_ORG_ID,
      auto_approve_low_risk: true,
      require_human_approval: false,
    },
    update: {
      auto_approve_low_risk: true,
      require_human_approval: false,
    },
  });
  // Also seed an explicit AUTO_APPROVE ActionPolicy row for
  // (SEND_INTERNAL_NOTIFICATION, LOW) so the policy
  // resolver short-circuits to AUTO_APPROVE.
  await prisma.actionPolicy.create({
    data: {
      org_entity_id: SHARED_ORG_ID,
      action_type: "SEND_INTERNAL_NOTIFICATION",
      risk_tier: "LOW",
      default_decision: "AUTO_APPROVE",
      updated_by: SHARED_ORG_ID,
    },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

withCleanRateLimits(store);

// WHAT: Create a COMPANY entity to act as the org parent
//        for test PERSONs.
// INPUT: None.
// OUTPUT: The org entity_id.
// WHY: Wave 8 transitions create Section 2 Action rows via
//      `createActionForCaller`, which requires the caller to
//      be in an organization (`getOrgEntityId` throws → 404
//      NO_ORG_FOR_CALLER otherwise). Mirrors the
//      org-action-policies.test.ts makeTestOrg pattern.
async function makeTestOrg(): Promise<string> {
  const org = await createEntity({
    entity_type: "COMPANY",
    display_name: `${TEST_PREFIX}org_${randomUUID()}`,
    email: `${TEST_PREFIX}org_${randomUUID()}@niov.test`,
    public_key: "test-public-key",
    clearance_level: 0,
  });
  return org.entity_id;
}

async function loginPerson(opts?: { orgId?: string | null }): Promise<{
  entityId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  // Wave 8 requires org membership for Section 2 Action
  // creation. Default to SHARED_ORG_ID so all Wave 8 tests
  // work; tests that need an ORG-less caller can pass
  // `orgId: null` explicitly. Mirrors the
  // org-action-policies.test.ts makeOrgAdmin EntityMembership
  // pattern (canonical EntityMembership shape per
  // schema.prisma:799 — parent_id + child_id + role_title +
  // is_active).
  const orgId =
    opts?.orgId === null
      ? null
      : (opts?.orgId ?? SHARED_ORG_ID);
  if (orgId !== null) {
    await prisma.entityMembership.create({
      data: {
        parent_id: orgId,
        child_id: entity.entity_id,
        role_title: "MEMBER",
        is_active: true,
      },
    });
  }
  const ip = `10.97.${Math.floor(Math.random() * 200) + 1}.${
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

async function inject(
  method: "POST" | "GET" | "PUT" | "DELETE",
  caller: { token: string; ip: string } | null,
  url: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method,
    url,
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
    ...(body !== undefined ? { payload: body } : {}),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

async function createScenario(
  caller: { token: string; ip: string },
  overrides: Record<string, unknown> = {},
): Promise<{ scenario_id: string }> {
  const r = await inject("POST", caller, "/api/v1/playground/scenarios", {
    title: `Scenario ${randomUUID()}`,
    description: "Generic scenario for governed-transition tests.",
    goal_summary: "Generic goal.",
    ...overrides,
  });
  if (r.statusCode !== 201) {
    throw new Error(`create scenario failed: ${r.statusCode} ${r.raw}`);
  }
  return { scenario_id: r.body.scenario.scenario_id };
}

function uuid(): string {
  return randomUUID();
}

const FORBIDDEN_NO_LEAK_MARKERS = [
  "transcript",
  "chain_of_thought",
  "prompt_text",
  "embedding",
  "embedding_vector",
  "vector",
  "storage_location",
  "content_hash",
  "bridge_id",
  "secret_ref",
  "payload_content",
  "raw_memory",
  "raw_correction",
  "raw_capsule",
  "raw_payload",
  "raw_request",
  "raw_response",
  "candidate_pool",
];

function assertNoLeak(raw: string): void {
  const lower = raw.toLowerCase();
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(lower).not.toContain(marker.toLowerCase());
  }
}

const TRANSITION_OUTCOMES = [
  "ACTION_PROPOSED",
  "NO_ACTION_PROPOSED",
] as const;

const REASONS_NOT_PROPOSED = [
  "STATUS_QUO_NOT_TRANSITIONABLE",
  "DO_NOT_PROCEED_BLOCKED",
  "BLOCKED_BY_POLICY_OR_GOVERNANCE",
  "BLOCKED_BY_ACTION_RUNTIME_TRANSITION_HINT",
] as const;

describe("Section 5 Wave 8 Option A — auth enforcement", () => {
  it("401 without bearer", async () => {
    const r = await inject(
      "POST",
      null,
      `/api/v1/playground/scenarios/${uuid()}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("404 enumeration-safe for unknown scenario id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${uuid()}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });

  it("404 enumeration-safe for cross-owner scenario", async () => {
    const owner = await loginPerson();
    const intruder = await loginPerson();
    const { scenario_id } = await createScenario(owner);
    const r = await inject(
      "POST",
      intruder,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });
});

describe("Section 5 Wave 8 Option A — mandatory body fields", () => {
  it("missing caller_confirmation → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("caller_confirmation=false (not literal true) → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: false, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("caller_confirmation='true' (string not boolean) → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: "true", idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("missing idempotency_key → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("idempotency_key");
  });

  it("empty idempotency_key → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: "" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("idempotency_key");
  });
});

describe("Section 5 Wave 8 Option A — ActionType mapping (v1 conservative)", () => {
  it("DEFAULT recommendation flow defaults to STATUS_QUO → NO_ACTION_PROPOSED (correct safe baseline)", async () => {
    // Wave 7's DETERMINISTIC_POLICY_FIRST priority ladder
    // surfaces STATUS_QUO as the safest default recommendation.
    // Per ADR-0075 §4, STATUS_QUO is non-transitionable
    // (NO_ACTION_PROPOSED with reason
    // STATUS_QUO_NOT_TRANSITIONABLE). This is the canonical
    // safe baseline — the default flow does NOT
    // automatically create Actions.
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    expect(r.body.reason_not_proposed).toBe(
      "STATUS_QUO_NOT_TRANSITIONABLE",
    );
  });

  it("LOW_RISK_INCREMENTAL filter creates ACTION_PROPOSED with SEND_INTERNAL_NOTIFICATION", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    expect(typeof r.body.action_id).toBe("string");
    expect(r.body.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
  });

  it("intended_action_type=SEND_INTERNAL_NOTIFICATION accepted with transitionable candidate", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
        intended_action_type: "SEND_INTERNAL_NOTIFICATION",
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
  });

  it("intended_action_type=RECORD_CAPSULE rejected at v1 → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        intended_action_type: "RECORD_CAPSULE",
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("intended_action_type");
  });

  it("intended_action_type=INVOKE_CONNECTOR rejected at v1 → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        intended_action_type: "INVOKE_CONNECTOR",
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("intended_action_type");
  });
});

describe("Section 5 Wave 8 Option A — passthrough body validation", () => {
  it("invalid candidate_types → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["NOT_A_REAL_TYPE"],
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("candidate_types");
  });

  it("invalid max_candidates → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        max_candidates: 99,
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("invalid comparison_mode → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        comparison_mode: "NOT_A_MODE",
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("comparison_mode");
  });

  it("invalid recommendation_mode → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        recommendation_mode: "NOT_A_MODE",
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("recommendation_mode");
  });

  it("v1 silently ignores candidate_keys per QLOCK 2 inheritance", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_keys: ["abc", "def"],
      } as Record<string, unknown>,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe("Section 5 Wave 8 Option A — recommendation_mode-driven outcomes", () => {
  it("DETERMINISTIC_HUMAN_REVIEW_FIRST yields NO_ACTION_PROPOSED (HUMAN_REVIEW_REQUIRED carries POLICY_REVIEW_REQUIRED in governance → blocked_by_policy=true → §6 declines per ADR-0075 BLOCKED_BY_POLICY_OR_GOVERNANCE)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        recommendation_mode: "DETERMINISTIC_HUMAN_REVIEW_FIRST",
      },
    );
    // Wave 7 HUMAN_REVIEW_FIRST mode short-circuits to the
    // HUMAN_REVIEW_REQUIRED candidate. The Wave 5 template
    // for HUMAN_REVIEW_REQUIRED carries POLICY_REVIEW_REQUIRED
    // in its governance_findings, which sets
    // blocked_by_policy=true per Wave 5's buildCandidate.
    // Wave 8 §6 therefore declines with
    // BLOCKED_BY_POLICY_OR_GOVERNANCE (correct conservative
    // behavior — a candidate that itself requires policy
    // review should not be transitioned to a proposed Action
    // until the policy review is completed).
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    expect(r.body.recommended_candidate_type).toBe("HUMAN_REVIEW_REQUIRED");
    expect(r.body.reason_not_proposed).toBe(
      "BLOCKED_BY_POLICY_OR_GOVERNANCE",
    );
    expect(r.body.human_decision_required).toBe(true);
  });

  it("STATUS_QUO recommendation explicitly forced via candidate_types → NO_ACTION_PROPOSED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["STATUS_QUO"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    expect(r.body.reason_not_proposed).toBe("STATUS_QUO_NOT_TRANSITIONABLE");
  });

  it("DO_NOT_PROCEED recommendation via ARCHIVED scenario + filter → NO_ACTION_PROPOSED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    // Soft-archive the scenario; Wave 6 emits a DO_NOT_PROCEED candidate.
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}`,
    );
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["DO_NOT_PROCEED"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    expect(r.body.reason_not_proposed).toBe("DO_NOT_PROCEED_BLOCKED");
  });
});

describe("Section 5 Wave 8 Option A — closed-vocab response fields", () => {
  it("transition_outcome always closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(TRANSITION_OUTCOMES as readonly string[]).toContain(
      r.body.transition_outcome,
    );
  });

  it("NO_ACTION_PROPOSED reason_not_proposed always closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["STATUS_QUO"],
      },
    );
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    expect(REASONS_NOT_PROPOSED as readonly string[]).toContain(
      r.body.reason_not_proposed,
    );
  });
});

describe("Section 5 Wave 8 Option A — honest_note + human_decision_required", () => {
  it("response carries honest_note advising not executed + not legal advice", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(typeof r.body.honest_note).toBe("string");
    const lower = (r.body.honest_note as string).toLowerCase();
    expect(lower).toContain("advisory");
    expect(lower).toContain("never executed by wave 8");
    expect(lower).toContain("not legal advice");
  });

  it("human_decision_required is a boolean", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(typeof r.body.human_decision_required).toBe("boolean");
  });
});

describe("Section 5 Wave 8 Option A — Section 2 Action creation", () => {
  it("ACTION_PROPOSED creates an Action row owned by the caller", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    const action = await prisma.action.findUnique({
      where: { action_id: r.body.action_id },
    });
    expect(action).not.toBeNull();
    expect(action!.source_entity_id).toBe(caller.entityId);
    expect(action!.action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    // Section 2 status MUST be one of PROPOSED / APPROVED / REJECTED at Wave 8 response moment.
    expect(["PROPOSED", "APPROVED", "REJECTED"]).toContain(action!.status);
  });

  it("Action is NEVER in RUNNING / SUCCEEDED / FAILED at Wave 8 response moment", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    expect(r.body.action_status).not.toBe("RUNNING");
    expect(r.body.action_status).not.toBe("SUCCEEDED");
    expect(r.body.action_status).not.toBe("FAILED");
  });

  it("same-caller same idempotency_key returns same Action (200 idempotent)", async () => {
    // Section 2's idempotency contract: same caller + same
    // key → return the SAME Action view at 200 (idempotent
    // success; safe retry semantics). Cross-caller key
    // collision → 409 (security boundary; covered by the
    // next test).
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const key = uuid();
    const a = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: key,
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(a.statusCode).toBe(200);
    expect(a.body.transition_outcome).toBe("ACTION_PROPOSED");
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: key,
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(b.statusCode).toBe(200);
    expect(b.body.transition_outcome).toBe("ACTION_PROPOSED");
    // Same Action row returned (Section 2 idempotency).
    expect(b.body.action_id).toBe(a.body.action_id);
  });

  it("cross-caller idempotency_key collision → 409", async () => {
    const caller_a = await loginPerson();
    const caller_b = await loginPerson();
    const { scenario_id: scenario_a } = await createScenario(caller_a);
    const { scenario_id: scenario_b } = await createScenario(caller_b);
    const key = uuid();
    const a = await inject(
      "POST",
      caller_a,
      `/api/v1/playground/scenarios/${scenario_a}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: key,
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(a.statusCode).toBe(200);
    expect(a.body.transition_outcome).toBe("ACTION_PROPOSED");
    // caller_b tries to use the SAME key → 409
    // IDEMPOTENCY_KEY_COLLISION (Section 2 security
    // boundary; surfaced by Wave 8 verbatim per ADR-0075 §8).
    const b = await inject(
      "POST",
      caller_b,
      `/api/v1/playground/scenarios/${scenario_b}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: key,
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(b.statusCode).toBe(409);
    expect(b.body.code).toBe("IDEMPOTENCY_KEY_COLLISION");
  });
});

describe("Section 5 Wave 8 Option A — dual audit emission", () => {
  it("ACTION_PROPOSED emits Playground handoff audit + Section 2 ACTION audit", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.auditEvent.count();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    const after = await prisma.auditEvent.count();
    // Conservative assertion: at least 2 NEW audit rows
    // landed (Wave 8 Playground handoff + Section 2 ACTION
    // row). Wave 5/6/7 also emit their own rows transitively.
    expect(after - before).toBeGreaterThanOrEqual(2);
  });

  it("Wave 8 PROPOSED audit details contain safe metadata only", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    const handoffAudit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.playground_audit_event_id },
    });
    expect(handoffAudit).not.toBeNull();
    expect(handoffAudit!.event_type).toBe("ADMIN_ACTION");
    const details = handoffAudit!.details as Record<string, unknown>;
    expect(details.action).toBe("PLAYGROUND_GOVERNED_TRANSITION_PROPOSED");
    expect(typeof details.scenario_id).toBe("string");
    expect(typeof details.recommended_candidate_key).toBe("string");
    expect(typeof details.recommended_candidate_type).toBe("string");
    expect(typeof details.recommendation_mode).toBe("string");
    expect(details.intended_action_type).toBe("SEND_INTERNAL_NOTIFICATION");
    expect(details.caller_confirmation_received).toBe(true);
  });

  it("NO_ACTION_PROPOSED emits Playground handoff DECLINED audit only (no Section 2 row)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["STATUS_QUO"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    const handoffAudit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.playground_audit_event_id },
    });
    expect(handoffAudit).not.toBeNull();
    const details = handoffAudit!.details as Record<string, unknown>;
    expect(details.action).toBe("PLAYGROUND_GOVERNED_TRANSITION_DECLINED");
    expect(details.reason_not_proposed).toBe("STATUS_QUO_NOT_TRANSITIONABLE");
    // No Section 2 Action row was created.
    expect(r.body.action_id).toBeUndefined();
  });

  it("audit details do NOT contain raw recommendation/comparison/candidate text or scenario raw fields", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-TRANSITION-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
      goal_summary: `GOAL-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    const handoffAudit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.playground_audit_event_id },
    });
    const serialized = JSON.stringify(handoffAudit!.details);
    expect(serialized).not.toContain(uniqueTitle);
    expect(serialized).not.toContain("recommendation_summary");
    expect(serialized).not.toContain("comparison_summary");
    expect(serialized).not.toContain("candidate_title");
  });

  it("zero new audit literal (event_type stays ADMIN_ACTION for Playground handoff)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    const literalRows = await prisma.auditEvent.findMany({
      where: {
        event_type: "PLAYGROUND_GOVERNED_TRANSITION_PROPOSED" as any,
      },
      take: 1,
    });
    expect(literalRows.length).toBe(0);
  });
});

describe("Section 5 Wave 8 Option A — no-leak + no-side-effect", () => {
  it("response no-leak: ADR-0075 §10 forbidden tokens never surface", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      input_refs: { secret_ref_inside: "value", embedding: "value" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response never echoes raw scenario field values back to caller", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-TRANS-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    expect(r.raw).not.toContain(uniqueTitle);
  });

  it("no PlaygroundScenario row mutated by transition", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    const after = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(after).toEqual(before);
  });

  it("ACTION_PROPOSED transition creates exactly one Action row (no spurious creation)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.action.count();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["LOW_RISK_INCREMENTAL"],
      },
    );
    expect(r.body.transition_outcome).toBe("ACTION_PROPOSED");
    const after = await prisma.action.count();
    expect(after - before).toBe(1);
  });

  it("NO_ACTION_PROPOSED transition creates ZERO Action rows", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.action.count();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      {
        caller_confirmation: true,
        idempotency_key: uuid(),
        candidate_types: ["STATUS_QUO"],
      },
    );
    expect(r.body.transition_outcome).toBe("NO_ACTION_PROPOSED");
    const after = await prisma.action.count();
    expect(after - before).toBe(0);
  });

  it("no ActionAttempt / ConnectorBinding / MemoryCapsule / OtzarConversation rows created", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = {
      attempt: await prisma.actionAttempt.count(),
      connector: await prisma.connectorBinding.count(),
      capsule: await prisma.memoryCapsule.count(),
      conversation: await prisma.otzarConversation.count(),
    };
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    const after = {
      attempt: await prisma.actionAttempt.count(),
      connector: await prisma.connectorBinding.count(),
      capsule: await prisma.memoryCapsule.count(),
      conversation: await prisma.otzarConversation.count(),
    };
    expect(after).toEqual(before);
  });
});

describe("Section 5 Wave 8 Option A — Wave 7/6/5/4 regression preserved", () => {
  it("Wave 7 best-path-recommendations route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
  });

  it("Wave 6 outcome-comparisons route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(200);
  });

  it("Wave 5 candidates route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
  });
});
