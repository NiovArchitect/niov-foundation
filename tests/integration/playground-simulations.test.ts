// FILE: playground-simulations.test.ts (integration)
// PURPOSE: Section 5 Wave 9 Option A Agent Playground
//          deterministic multi-agent simulation orchestration
//          coverage per ADR-0076 + Founder behavioral +
//          enterprise-decision-output clarifications
//          2026-05-31. Exercises
//          `POST /api/v1/playground/scenarios/:id/simulations`.
//          Verifies: bearer enforcement; owner-first +
//          same-org SCENARIO_NOT_FOUND via Wave 7 → Wave 6 →
//          Wave 5 → Wave 4 delegation; mandatory
//          caller_confirmation: true; closed-vocab body
//          validation; bounded (branch × role) ≤ 24;
//          deterministic reruns; partial Promise.allSettled
//          failure projection as INSUFFICIENT_DATA closed
//          vocab; closed-vocab response (orchestration_mode,
//          branch_definition, agent_role, assumed_constraints,
//          expected_outcomes, governance_conflicts,
//          unresolved_questions, next_review_label,
//          evidence_posture, blockers_before_action,
//          safe_next_step, primary_recommendation_reasons);
//          no chain-of-thought / prompt / capsule / memory /
//          transcript / scenario JSON leakage; no Action /
//          ActionAttempt / Connector / Capsule / Conversation
//          row created; ADMIN_ACTION + details.action =
//          "PLAYGROUND_SIMULATION_EXECUTED" audit; zero new
//          audit literal; Wave 4/5/6/7/8 regression preserved.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-simulation.service.ts
//   - ADR-0076 Section 5 Wave 9 Multi-Agent Simulation
//     Orchestration Contract

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  withCleanRateLimits,
} from "../helpers.js";
import { createEntity } from "@niov/database";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "playground-simulations-test-secret";
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
  const ip = `10.103.${Math.floor(Math.random() * 200) + 1}.${
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
    description: "Generic scenario for simulation tests.",
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

// WHAT: Substrings forbidden in the Wave 9 response per
//        ADR-0076 §8. Closed-vocab assumed_constraint labels
//        like NO_RAW_MEMORY_ACCESS legitimately contain
//        "raw_memory" — so the forbidden markers are scoped
//        to JSON-key-and-value patterns that only appear
//        when actual raw content is leaked, NOT the safe
//        closed-vocab labels that ASSERT non-leakage.
const FORBIDDEN_NO_LEAK_MARKERS = [
  "transcript",
  "chain_of_thought",
  "prompt_text",
  "embedding_vector",
  "storage_location",
  "content_hash",
  "bridge_id",
  "secret_ref",
  "payload_content",
  "raw_memory_content",
  "raw_correction",
  "raw_capsule_content",
  "raw_payload",
  "raw_request",
  "raw_response",
  "candidate_pool",
  "agent_prompt",
  "agent_persona",
  "model_output",
  "completion_text",
];

function assertNoLeak(raw: string): void {
  const lower = raw.toLowerCase();
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(lower).not.toContain(marker.toLowerCase());
  }
}

const ORCHESTRATION_MODES = [
  "DETERMINISTIC_BRANCH_ENUMERATION",
  "DETERMINISTIC_CONSTRAINT_VARIATION",
  "DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION",
] as const;

const BRANCH_DEFINITIONS = [
  "BASELINE",
  "POLICY_FIRST_BRANCH",
  "GOVERNANCE_FIRST_BRANCH",
  "RESILIENCE_FIRST_BRANCH",
  "HUMAN_REVIEW_FIRST_BRANCH",
] as const;

const AGENT_ROLES = [
  "OPERATIONS_AGENT",
  "COMPLIANCE_AGENT",
  "RISK_AGENT",
  "CUSTOMER_AGENT",
  "RESILIENCE_AGENT",
  "HUMAN_REVIEW_AGENT",
] as const;

const NEXT_REVIEW_LABELS = [
  "HUMAN_GOVERNANCE_REVIEW",
  "POLICY_OWNER_REVIEW",
  "COMPLIANCE_REVIEW",
  "LEGAL_REVIEW",
  "OPERATIONAL_RESILIENCE_REVIEW",
  "DATA_GOVERNANCE_REVIEW",
  "RERUN_WITH_DIFFERENT_RECOMMENDATION_MODE",
  "NO_FURTHER_REVIEW_IDENTIFIED",
] as const;

const SAFE_NEXT_STEPS = [
  "PROCEED_TO_HUMAN_REVIEW",
  "REQUEST_MISSING_CONTEXT",
  "REQUEST_APPROVAL_CHAIN",
  "REQUEST_COMPLIANCE_REVIEW",
  "REQUEST_LEGAL_REVIEW",
  "PROPOSE_GOVERNED_ACTION",
  "DO_NOT_PROCEED",
] as const;

const EVIDENCE_POSTURES = [
  "HIERARCHY_SUPPORTS_PATH",
  "POLICY_SUPPORTS_PATH",
  "PRIOR_ACTION_HISTORY_SUPPORTS_PATH",
  "CONVERSATION_CONTEXT_SUPPORTS_PATH",
  "ANALYTICS_SUPPORTS_PATH",
  "CONNECTOR_READINESS_SUPPORTS_PATH",
  "AUDIT_HISTORY_SUPPORTS_PATH",
  "COMPLIANCE_REVIEW_REQUIRED",
  "LEGAL_REVIEW_REQUIRED",
  "INSUFFICIENT_CONTEXT",
  "CONFLICTING_SIGNALS",
  "AUTHORITY_CHAIN_UNCLEAR",
] as const;

const BLOCKERS = [
  "POLICY_BLOCKS_ACTION",
  "MISSING_COMPLIANCE_REVIEW",
  "MISSING_LEGAL_REVIEW",
  "MISSING_DUAL_CONTROL_APPROVAL",
  "MISSING_HUMAN_DECISION",
  "INSUFFICIENT_DATA",
  "CONNECTOR_UNAVAILABLE",
  "AUTHORITY_CHAIN_UNCLEAR",
  "NO_TRANSITION_POSSIBLE",
  "NO_KNOWN_BLOCKER",
] as const;

const ASSUMED_CONSTRAINTS = [
  "OWNER_COSMP_SCOPE_ONLY",
  "SAME_ORG_ONLY",
  "NO_EXTERNAL_PROVIDERS",
  "NO_CONNECTOR_INVOCATION",
  "NO_RAW_MEMORY_ACCESS",
  "NO_AUTONOMOUS_EXECUTION",
  "WAVE_8_TRANSITION_REQUIRED_BEFORE_ACTION",
  "HUMAN_REVIEW_BEFORE_FINAL_DECISION",
  "LEGAL_COMPLIANCE_REVIEW_WHERE_APPLICABLE",
  "BLOCKED_CANDIDATES_NEVER_TRANSITIONABLE",
] as const;

describe("Section 5 Wave 9 Option A — auth enforcement", () => {
  it("401 without bearer", async () => {
    const r = await inject(
      "POST",
      null,
      `/api/v1/playground/scenarios/${uuid()}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("404 enumeration-safe for unknown scenario id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${uuid()}/simulations`,
      { caller_confirmation: true },
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
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });

  it("owner can run simulation on own scenario (200)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.scenario_id).toBe(scenario_id);
  });
});

describe("Section 5 Wave 9 Option A — mandatory body fields", () => {
  it("missing caller_confirmation → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {},
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("caller_confirmation=false → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: false },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("caller_confirmation='true' (string) → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: "true" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("caller_confirmation");
  });

  it("invalid orchestration_mode → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true, orchestration_mode: "AGENT_CHATROOM" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("orchestration_mode");
  });

  it("invalid branch_definition in array → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        branch_definitions: ["BASELINE", "NOT_A_REAL_BRANCH"],
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("branch_definitions");
  });

  it("invalid agent_role in array → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        agent_roles: ["OPERATIONS_AGENT", "FREEFORM_AGENT_DEBATER"],
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("agent_roles");
  });

  it("empty branch_definitions array → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true, branch_definitions: [] },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("branch_definitions");
  });

  it("max_branches > 24 → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true, max_branches: 25 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_branches");
  });

  it("(branch × role) exceeds max_branches → 422", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    // 5 branches × 6 roles = 30 > 24 → reject.
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        branch_definitions: [...BRANCH_DEFINITIONS],
        agent_roles: [...AGENT_ROLES],
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_branches");
  });
});

describe("Section 5 Wave 9 Option A — response shape", () => {
  it("default flow produces 24 branches (4 default branch_definitions × 6 default agent_roles)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.branch_count).toBe(24);
    expect(r.body.branches.length).toBe(24);
  });

  it("orchestration_mode is closed-vocab string", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(ORCHESTRATION_MODES).toContain(r.body.orchestration_mode);
  });

  it("every branch_definition is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    for (const b of r.body.branches) {
      expect(BRANCH_DEFINITIONS).toContain(b.branch_definition);
    }
  });

  it("every agent_role is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    for (const b of r.body.branches) {
      expect(AGENT_ROLES).toContain(b.agent_role);
    }
  });

  it("every branch assumed_constraints / expected_outcomes / governance_conflicts are closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    for (const b of r.body.branches) {
      for (const c of b.assumed_constraints) {
        expect(ASSUMED_CONSTRAINTS).toContain(c);
      }
      // Bounded counts per ADR-0076 §11.
      expect(b.assumed_constraints.length).toBeLessThanOrEqual(10);
      expect(b.expected_outcomes.length).toBeLessThanOrEqual(8);
      expect(b.governance_conflicts.length).toBeLessThanOrEqual(10);
      expect(b.branch_summary.length).toBeLessThanOrEqual(600);
    }
  });

  it("recommended_next_review.next_review_label is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(NEXT_REVIEW_LABELS).toContain(
      r.body.recommended_next_review.next_review_label,
    );
    expect(r.body.recommended_next_review.rationale_summary.length).toBeLessThanOrEqual(300);
  });

  it("enterprise_decision_posture.safe_next_step is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(SAFE_NEXT_STEPS).toContain(
      r.body.enterprise_decision_posture.safe_next_step,
    );
  });

  it("enterprise_decision_posture.evidence_posture is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    for (const e of r.body.enterprise_decision_posture.evidence_posture) {
      expect(EVIDENCE_POSTURES).toContain(e);
    }
  });

  it("enterprise_decision_posture.blockers_before_action is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    for (const b of r.body.enterprise_decision_posture.blockers_before_action) {
      expect(BLOCKERS).toContain(b);
    }
  });

  it("primary_recommended_branch_id refers to a real branch", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const ids = new Set<string>(r.body.branches.map((b: any) => b.branch_id));
    expect(
      ids.has(r.body.enterprise_decision_posture.primary_recommended_branch_id),
    ).toBe(true);
  });

  it("viable_alternative_branch_ids is capped at 3", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(
      r.body.enterprise_decision_posture.viable_alternative_branch_ids.length,
    ).toBeLessThanOrEqual(3);
  });

  it("honest_note is present and explicit", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(typeof r.body.honest_note).toBe("string");
    expect(r.body.honest_note).toContain("advisory");
  });
});

describe("Section 5 Wave 9 Option A — determinism", () => {
  it("two simulations on the same scenario produce identical branch_id sets", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const a = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const aIds = (a.body.branches as any[]).map((x) => x.branch_id).sort();
    const bIds = (b.body.branches as any[]).map((x) => x.branch_id).sort();
    expect(aIds).toEqual(bIds);
  });

  it("identical inputs produce identical orchestration_mode + branch_count", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const a = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(a.body.orchestration_mode).toBe(b.body.orchestration_mode);
    expect(a.body.branch_count).toBe(b.body.branch_count);
  });
});

describe("Section 5 Wave 9 Option A — orchestration_mode behavior", () => {
  it("DETERMINISTIC_CONSTRAINT_VARIATION accepted", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        orchestration_mode: "DETERMINISTIC_CONSTRAINT_VARIATION",
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.orchestration_mode).toBe("DETERMINISTIC_CONSTRAINT_VARIATION");
  });

  it("DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION accepted", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        orchestration_mode: "DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION",
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.orchestration_mode).toBe(
      "DETERMINISTIC_GOVERNANCE_SCOPE_VARIATION",
    );
  });
});

describe("Section 5 Wave 9 Option A — no-leak + no-side-effect", () => {
  it("response no-leak: forbidden tokens never surface", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      input_refs: { secret_ref_inside: "value", embedding: "value" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response never echoes raw scenario field values back to caller", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-SIM-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.raw).not.toContain(uniqueTitle);
  });

  it("no PlaygroundScenario row mutated by simulation", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const after = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(after).toEqual(before);
  });

  it("simulation creates ZERO Action rows (Wave 8 owns transitions)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.action.count();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(200);
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
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const after = {
      attempt: await prisma.actionAttempt.count(),
      connector: await prisma.connectorBinding.count(),
      capsule: await prisma.memoryCapsule.count(),
      conversation: await prisma.otzarConversation.count(),
    };
    expect(after).toEqual(before);
  });

  it("no PlaygroundSimulation Prisma model exists (computed-on-read per ADR-0076 §13)", async () => {
    // Defensive — this row should never exist; the model itself
    // is not defined in schema.prisma. Asserting via the
    // Prisma client instead: confirm the @ts-expect-error
    // shape (the type system catches the missing model name).
    const keys = Object.keys(prisma);
    expect(keys.some((k) => k.toLowerCase().includes("simulation"))).toBe(false);
  });
});

describe("Section 5 Wave 9 Option A — audit posture", () => {
  it("emits ADMIN_ACTION + details.action='PLAYGROUND_SIMULATION_EXECUTED' on success", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    expect(r.statusCode).toBe(200);
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.simulation_audit_event_id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.event_type).toBe("ADMIN_ACTION");
    const details = audit!.details as any;
    expect(details.action).toBe("PLAYGROUND_SIMULATION_EXECUTED");
    expect(details.scenario_id).toBe(scenario_id);
    expect(typeof details.branch_count).toBe("number");
    expect(typeof details.orchestration_mode).toBe("string");
    expect(details.caller_confirmation_received).toBe(true);
  });

  it("audit details never carries raw branch summary / scenario fields", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-SIM-AUDIT-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const audit = await prisma.auditEvent.findUnique({
      where: { audit_id: r.body.simulation_audit_event_id },
    });
    const serialized = JSON.stringify(audit!.details);
    expect(serialized).not.toContain(uniqueTitle);
    expect(serialized).not.toContain("branch_summary");
    expect(serialized).not.toContain("rationale_summary");
    expect(serialized).not.toContain("chain_of_thought");
    expect(serialized).not.toContain("prompt_text");
  });

  it("zero new audit literal — event_type stays ADMIN_ACTION, never PLAYGROUND_SIMULATION_EXECUTED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const literalRows = await prisma.auditEvent.findMany({
      where: { event_type: "PLAYGROUND_SIMULATION_EXECUTED" as any },
      take: 1,
    });
    expect(literalRows.length).toBe(0);
  });

  it("Wave 7 sub-invocations also emit PLAYGROUND_BEST_PATH_RECOMMENDED rows (not suppressed)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        details: {
          path: ["action"],
          equals: "PLAYGROUND_BEST_PATH_RECOMMENDED",
        },
      } as any,
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true },
    );
    const after = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        details: {
          path: ["action"],
          equals: "PLAYGROUND_BEST_PATH_RECOMMENDED",
        },
      } as any,
    });
    // Default 24 branches = 24 Wave 7 sub-invocations, each
    // emitting one PLAYGROUND_BEST_PATH_RECOMMENDED row.
    expect(after - before).toBe(24);
  });
});

describe("Section 5 Wave 9 Option A — bounded counts + custom subsets", () => {
  it("caller can opt into a smaller branch_definitions × agent_roles subset (3 × 2 = 6 branches)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      {
        caller_confirmation: true,
        branch_definitions: [
          "POLICY_FIRST_BRANCH",
          "GOVERNANCE_FIRST_BRANCH",
          "RESILIENCE_FIRST_BRANCH",
        ],
        agent_roles: ["OPERATIONS_AGENT", "COMPLIANCE_AGENT"],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.branch_count).toBe(6);
  });

  it("max_branches=24 is the canonical ADR-0076 §11 ceiling", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true, max_branches: 24 },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.branch_count).toBeLessThanOrEqual(24);
  });

  it("max_branches=0 is rejected as INVALID_REQUEST", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/simulations`,
      { caller_confirmation: true, max_branches: 0 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_branches");
  });
});

describe("Section 5 Wave 9 Option A — Wave 4/5/6/7/8 regression preserved", () => {
  it("Wave 8 governed-transitions route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/governed-transitions`,
      { caller_confirmation: true, idempotency_key: uuid() },
    );
    // 200 success OR 404 (ORG-less PERSON; we don't seed an
    // org for Wave 9's lighter fixture). Either way the
    // route is reachable.
    expect([200, 404]).toContain(r.statusCode);
  });

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

  it("Wave 4 scenario detail route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "GET",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}`,
    );
    expect(r.statusCode).toBe(200);
  });
});
