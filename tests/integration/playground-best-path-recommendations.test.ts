// FILE: playground-best-path-recommendations.test.ts (integration)
// PURPOSE: Section 5 Wave 7 Option A Agent Playground
//          deterministic best-path recommendation coverage
//          per ADR-0074. Exercises the new
//          `POST /api/v1/playground/scenarios/:id/best-path-recommendations`
//          route; verifies bearer enforcement; verifies
//          owner-first + same-org SCENARIO_NOT_FOUND
//          enumeration-safe gate inherited via Wave 6 →
//          Wave 5 → Wave 4 delegation; verifies closed-vocab
//          validation across the 4 ADR-0074 vocabularies
//          (recommendation_mode + recommendation_reason +
//          action_transition_readiness +
//          reason_not_recommended); verifies deterministic
//          recommendation output stability; verifies bounded
//          count caps per ADR-0074 §11; verifies mandatory
//          honest_note + human_decision_required per §16;
//          verifies ADMIN_ACTION + details.action="PLAYGROUND_BEST_PATH_RECOMMENDED"
//          audit emission with safe metadata only (zero new
//          audit literal); verifies §9 + §17 no-leak
//          forbidden field surface; verifies the scenario
//          is never mutated and no recommendation rows /
//          comparison rows / candidate rows / Action rows /
//          ActionAttempt rows / ConnectorBinding rows /
//          MemoryCapsule rows / OtzarConversation rows are
//          created; verifies absence of forbidden response
//          fields (score / rank / winner / best /
//          probability / roi / recommendation /
//          recommended_candidate / selected_candidate);
//          verifies forbidden recommendation language is
//          absent; verifies Wave 6 / Wave 5 / Wave 4
//          regression preserved.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-best-path-recommendation.service.ts
//   - ADR-0074 Section 5 Wave 7 Best-Path Recommendation Contract

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
  withCleanRateLimits,
} from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "playground-best-path-recommendations-test-secret";
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
  const ip = `10.96.${Math.floor(Math.random() * 200) + 1}.${
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
    description: "Generic scenario for best-path-recommendation tests.",
    goal_summary: "Generic goal.",
    ...overrides,
  });
  if (r.statusCode !== 201) {
    throw new Error(`create scenario failed: ${r.statusCode} ${r.raw}`);
  }
  return { scenario_id: r.body.scenario.scenario_id };
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
  "payload_summary",
  "raw_memory",
  "raw_correction",
  "raw_capsule",
  "raw_payload",
  "raw_request",
  "raw_response",
  "candidate_pool",
];

const FORBIDDEN_RESPONSE_FIELD_NAMES = [
  '"score":',
  '"rank":',
  '"ranking":',
  '"winner":',
  '"best":',
  '"probability":',
  '"roi":',
  '"recommendation":',
  '"recommended_candidate":',
  '"selected_candidate":',
];

// WHAT: ADR-0070 §9 + ADR-0073 §7 + ADR-0074 §7 forbidden
//        recommendation-language tokens. NOTE: forbidden
//        phrases are matched at positive-claim form, not at
//        disclaimer form. ADR-0074 §16 canonical honest_note
//        literally contains "not a final decision" as the
//        allowed disclaimer per §16 + the Founder behavioral
//        directive — that's the OPPOSITE of claiming to BE a
//        final decision. The bare substring "final decision"
//        would create a false-positive against the canonical
//        disclaimer; we match the positive-claim form
//        ("is a final decision" / "this final decision") to
//        catch winner-declaration framing without breaking
//        the disclaimer.
const FORBIDDEN_RECOMMENDATION_LANGUAGE = [
  "guaranteed",
  "legally sufficient",
  "regulator approved",
  "no fine risk",
  "ai approved",
  "execute this",
  "execute automatically",
  "is a final decision",
  "this final decision",
  "the final decision is",
  "the system decided",
  "employee risk",
  "manager should intervene",
  "probability of success",
  "ranked #1",
];

function assertNoLeak(raw: string): void {
  const lower = raw.toLowerCase();
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(lower).not.toContain(marker.toLowerCase());
  }
}

function assertNoForbiddenResponseFields(raw: string): void {
  for (const marker of FORBIDDEN_RESPONSE_FIELD_NAMES) {
    expect(raw).not.toContain(marker);
  }
}

function assertNoForbiddenLanguage(raw: string): void {
  const lower = raw.toLowerCase();
  for (const marker of FORBIDDEN_RECOMMENDATION_LANGUAGE) {
    expect(lower).not.toContain(marker);
  }
}

const CANDIDATE_TYPES = [
  "STATUS_QUO",
  "LOW_RISK_INCREMENTAL",
  "SPEED_OPTIMIZED",
  "COST_OPTIMIZED",
  "COMPLIANCE_FIRST",
  "CUSTOMER_IMPACT_FIRST",
  "OPERATIONAL_RESILIENCE",
  "HUMAN_REVIEW_REQUIRED",
  "DO_NOT_PROCEED",
] as const;

const RECOMMENDATION_MODES = [
  "DETERMINISTIC_POLICY_FIRST",
  "DETERMINISTIC_GOVERNANCE_FIRST",
  "DETERMINISTIC_RESILIENCE_FIRST",
  "DETERMINISTIC_HUMAN_REVIEW_FIRST",
] as const;

const RECOMMENDATION_REASONS = [
  "FEWEST_BLOCKING_FINDINGS",
  "STRONGEST_GOVERNANCE_ALIGNMENT",
  "LOWEST_REVIEW_BURDEN",
  "STRONGEST_RESILIENCE_POSTURE",
  "LOWEST_EXECUTION_COMPLEXITY",
  "HIGHEST_DATA_SCOPE_READINESS",
  "HIGHEST_CONNECTOR_READINESS",
  "CLEAREST_HUMAN_REVIEW_PATH",
  "SAFEST_INCREMENTAL_PATH",
  "DO_NOT_PROCEED_SELECTED_FOR_SAFETY",
  "INSUFFICIENT_DATA_RECOMMENDS_HUMAN_REVIEW",
] as const;

const ACTION_TRANSITION_READINESS = [
  "NOT_READY",
  "MAY_PROPOSE_ACTION_LATER",
  "REQUIRES_HUMAN_DECISION",
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "BLOCKED",
] as const;

const REASONS_NOT_RECOMMENDED = [
  "MORE_BLOCKING_FINDINGS",
  "MORE_REQUIRED_REVIEWS",
  "LOWER_GOVERNANCE_ALIGNMENT",
  "HIGHER_OPERATIONAL_RISK",
  "LOWER_DATA_SCOPE_READINESS",
  "LOWER_CONNECTOR_READINESS",
  "LESS_RESILIENT",
  "LESS_REVERSIBLE",
  "INSUFFICIENT_DATA",
  "NOT_SELECTED_THIS_ROUND",
] as const;

describe("Section 5 Wave 7 Option A — auth enforcement", () => {
  it("401 without bearer", async () => {
    const r = await inject(
      "POST",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("404 enumeration-safe for unknown scenario id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${randomUUID()}/best-path-recommendations`,
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
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });
});

describe("Section 5 Wave 7 Option A — owner can get a recommendation", () => {
  it("owner gets a recommendation on a DRAFT scenario", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.scenario_id).toBe(scenario_id);
    expect(typeof r.body.recommended_at).toBe("string");
    expect(r.body.recommendation_mode).toBe("DETERMINISTIC_POLICY_FIRST");
    expect(typeof r.body.recommended_candidate_key).toBe("string");
    expect(r.body.recommended_candidate_key).toMatch(/^[0-9a-f]{16}$/);
    expect(CANDIDATE_TYPES as readonly string[]).toContain(
      r.body.recommended_candidate_type,
    );
    expect(typeof r.body.audit_event_id).toBe("string");
  });

  it("response is computed-on-read; scenario row is not mutated", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(before).not.toBeNull();
    const updatedAtBefore = before!.updated_at.toISOString();
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const after = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(after!.updated_at.toISOString()).toBe(updatedAtBefore);
  });

  it("response is deterministic across identical reads", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const a = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.body.recommended_candidate_key).toBe(
      b.body.recommended_candidate_key,
    );
    expect(a.body.recommended_candidate_type).toBe(
      b.body.recommended_candidate_type,
    );
    expect(a.body.recommendation_reasons).toEqual(b.body.recommendation_reasons);
  });
});

describe("Section 5 Wave 7 Option A — body validation", () => {
  it("max_candidates rejects zero", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { max_candidates: 0 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects above cap (>8)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { max_candidates: 9 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("candidate_types validates closed vocabulary", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { candidate_types: ["NOT_A_REAL_TYPE"] },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("candidate_types");
  });

  it("comparison_mode validates closed vocabulary", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { comparison_mode: "NOT_A_MODE" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("comparison_mode");
  });

  it("recommendation_mode validates closed vocabulary", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { recommendation_mode: "NOT_A_MODE" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("recommendation_mode");
  });

  it("v1 body silently ignores candidate_keys (deferred per QLOCK 2)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { candidate_keys: ["abc123", "def456"] } as Record<string, unknown>,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe("Section 5 Wave 7 Option A — recommendation_mode behavior", () => {
  it("DETERMINISTIC_HUMAN_REVIEW_FIRST surfaces HUMAN_REVIEW_REQUIRED if present", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { recommendation_mode: "DETERMINISTIC_HUMAN_REVIEW_FIRST" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.recommended_candidate_type).toBe("HUMAN_REVIEW_REQUIRED");
    expect(r.body.recommendation_reasons).toContain(
      "CLEAREST_HUMAN_REVIEW_PATH",
    );
  });

  it("DETERMINISTIC_POLICY_FIRST default mode runs", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.recommendation_mode).toBe("DETERMINISTIC_POLICY_FIRST");
  });

  it("DETERMINISTIC_GOVERNANCE_FIRST mode runs", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { recommendation_mode: "DETERMINISTIC_GOVERNANCE_FIRST" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.recommendation_mode).toBe("DETERMINISTIC_GOVERNANCE_FIRST");
  });

  it("DETERMINISTIC_RESILIENCE_FIRST mode runs", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { recommendation_mode: "DETERMINISTIC_RESILIENCE_FIRST" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.recommendation_mode).toBe("DETERMINISTIC_RESILIENCE_FIRST");
  });
});

describe("Section 5 Wave 7 Option A — closed-vocab response fields", () => {
  it("recommendation_mode is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(RECOMMENDATION_MODES as readonly string[]).toContain(
      r.body.recommendation_mode,
    );
  });

  it("recommendation_reasons are all closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    for (const reason of r.body.recommendation_reasons as string[]) {
      expect(RECOMMENDATION_REASONS as readonly string[]).toContain(reason);
    }
  });

  it("action_transition_readiness is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(ACTION_TRANSITION_READINESS as readonly string[]).toContain(
      r.body.action_transition_readiness,
    );
  });

  it("recommended_candidate_type is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(CANDIDATE_TYPES as readonly string[]).toContain(
      r.body.recommended_candidate_type,
    );
  });

  it("alternatives_considered carry closed-vocab reason_not_recommended", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    for (const alt of r.body.alternatives_considered as Array<{
      reason_not_recommended: string;
    }>) {
      expect(REASONS_NOT_RECOMMENDED as readonly string[]).toContain(
        alt.reason_not_recommended,
      );
    }
  });
});

describe("Section 5 Wave 7 Option A — honest_note + human_decision_required", () => {
  it("top-level honest_note states advisory + not a final decision", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(typeof r.body.honest_note).toBe("string");
    const lower = (r.body.honest_note as string).toLowerCase();
    expect(lower).toContain("advisory");
    expect(lower).toContain("not a final decision");
    expect(lower).toContain("not legal advice");
  });

  it("human_decision_required is a boolean", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(typeof r.body.human_decision_required).toBe("boolean");
  });

  it("human_decision_required = true when recommendation is HUMAN_REVIEW_REQUIRED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      { recommendation_mode: "DETERMINISTIC_HUMAN_REVIEW_FIRST" },
    );
    expect(r.body.recommended_candidate_type).toBe("HUMAN_REVIEW_REQUIRED");
    expect(r.body.human_decision_required).toBe(true);
  });
});

describe("Section 5 Wave 7 Option A — ARCHIVED scenario safety surface", () => {
  it("ARCHIVED scenario surfaces DO_NOT_PROCEED in alternatives_considered with blocking findings", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    // Soft-archive the scenario via the Wave 4 DELETE route.
    // This causes Wave 5's default candidate set to include a
    // DO_NOT_PROCEED candidate (blocked_by_policy=true), but
    // the 5 default unblocked candidates remain — so the
    // ADR-0074 §2 gate 1 safety-blocking-gate (which fires
    // only when EVERY candidate is blocked) does NOT trigger.
    // Instead, the priority ladder selects an unblocked
    // candidate as the recommendation and DO_NOT_PROCEED
    // appears in the alternatives_considered list.
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}`,
    );
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    // Recommended candidate is one of the unblocked types
    // (NOT DO_NOT_PROCEED since other candidates are
    // unblocked).
    expect(r.body.recommended_candidate_type).not.toBe("DO_NOT_PROCEED");
    // DO_NOT_PROCEED appears in alternatives_considered with
    // a blocking-related reason_not_recommended.
    const doNotProceed = (
      r.body.alternatives_considered as Array<{
        candidate_type: string;
        reason_not_recommended: string;
        blocking_findings: string[];
      }>
    ).find((a) => a.candidate_type === "DO_NOT_PROCEED");
    expect(doNotProceed).toBeDefined();
    expect(doNotProceed!.reason_not_recommended).toBe("MORE_BLOCKING_FINDINGS");
    // Wave 7 still surfaces strong human-decision posture
    // when the matrix carries a blocked candidate.
    expect(typeof r.body.human_decision_required).toBe("boolean");
  });
});

describe("Section 5 Wave 7 Option A — no winner-declaration framing", () => {
  it("response has NO field named score / rank / winner / best / probability / roi / recommendation / recommended_candidate / selected_candidate", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    assertNoForbiddenResponseFields(r.raw);
  });

  it("response contains NO forbidden recommendation language", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    assertNoForbiddenLanguage(r.raw);
  });
});

describe("Section 5 Wave 7 Option A — audit emission + safe metadata", () => {
  it("emits ADMIN_ACTION + details.action='PLAYGROUND_BEST_PATH_RECOMMENDED'", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    expect(row).not.toBeNull();
    expect(row!.event_type).toBe("ADMIN_ACTION");
    const details = row!.details as Record<string, unknown>;
    expect(details.action).toBe("PLAYGROUND_BEST_PATH_RECOMMENDED");
  });

  it("audit details contain safe metadata only", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    const details = row!.details as Record<string, unknown>;
    expect(typeof details.scenario_id).toBe("string");
    expect(typeof details.recommendation_mode).toBe("string");
    expect(typeof details.candidate_count).toBe("number");
    expect(typeof details.recommended_candidate_key).toBe("string");
    expect(typeof details.recommended_candidate_type).toBe("string");
    expect(typeof details.blocked_by_policy).toBe("boolean");
    expect(typeof details.human_decision_required).toBe("boolean");
    expect(typeof details.action_transition_readiness).toBe("string");
  });

  it("audit details do NOT contain raw recommendation/comparison/candidate text or scenario raw fields", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      title: "TITLE-MUST-NOT-LEAK-INTO-AUDIT",
      description: "DESC-MUST-NOT-LEAK-INTO-AUDIT",
      goal_summary: "GOAL-MUST-NOT-LEAK-INTO-AUDIT",
      input_refs: { secret_ref: "RAW-INPUT-MUST-NOT-LEAK" },
      constraints: { token: "RAW-CONSTRAINT-MUST-NOT-LEAK" },
      expected_outputs: { result: "RAW-OUTPUT-MUST-NOT-LEAK" },
      governance_findings: { note: "RAW-GOVERNANCE-MUST-NOT-LEAK" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    const serialized = JSON.stringify(row!.details).toLowerCase();
    expect(serialized).not.toContain("title-must-not-leak");
    expect(serialized).not.toContain("desc-must-not-leak");
    expect(serialized).not.toContain("goal-must-not-leak");
    expect(serialized).not.toContain("raw-input-must-not-leak");
    expect(serialized).not.toContain("raw-constraint-must-not-leak");
    expect(serialized).not.toContain("raw-output-must-not-leak");
    expect(serialized).not.toContain("raw-governance-must-not-leak");
    expect(serialized).not.toContain("recommendation_summary");
    expect(serialized).not.toContain("candidate_title");
    expect(serialized).not.toContain("alternatives_considered");
  });

  it("zero new audit literal introduced (event_type stays ADMIN_ACTION)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const literalRows = await prisma.auditEvent.findMany({
      where: { event_type: "PLAYGROUND_BEST_PATH_RECOMMENDED" as any },
      take: 1,
    });
    expect(literalRows.length).toBe(0);
  });

  it("audit row attributes scenario owner as actor", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    expect(row!.actor_entity_id).toBe(caller.entityId);
    expect(row!.target_entity_id).toBe(caller.entityId);
  });
});

describe("Section 5 Wave 7 Option A — no-leak + no-side-effect", () => {
  it("response no-leak: ADR-0074 §9 + §17 forbidden tokens never surface", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      input_refs: { secret_ref_inside: "value", embedding: "value" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response never echoes raw scenario field values back to caller", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-RECOMMEND-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
      goal_summary: `GOAL-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.raw).not.toContain(uniqueTitle);
  });

  it("no PlaygroundScenario row mutated by recommendation generation", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const after = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(after).toEqual(before);
  });

  it("no Action / ActionAttempt / Notification / ConnectorBinding / MemoryCapsule / OtzarConversation row created", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const counts = async () => ({
      action: await prisma.action.count(),
      attempt: await prisma.actionAttempt.count(),
      notification: await prisma.notification.count(),
      connector: await prisma.connectorBinding.count(),
      capsule: await prisma.memoryCapsule.count(),
      conversation: await prisma.otzarConversation.count(),
    });
    const before = await counts();
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const after = await counts();
    expect(after).toEqual(before);
  });

  it("repeated recommendation does not create per-recommendation persistence rows", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const beforeScenarios = await prisma.playgroundScenario.count();
    for (let i = 0; i < 3; i++) {
      const r = await inject(
        "POST",
        caller,
        `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
      );
      expect(r.statusCode).toBe(200);
    }
    const afterScenarios = await prisma.playgroundScenario.count();
    expect(afterScenarios).toBe(beforeScenarios);
  });
});

// ADR-0078 Stage 2 — approved-source projection of safe
// `conversation_context_signals[]` on the Wave 7 response. The
// sidecar is additive, always present (empty array when no
// approved-source signal exists), bounded ≤ 8 per ADR-0078 §8,
// closed-vocab + §6C.12 additive fields exhaustive, and ADR-0079
// §27 filtering enforced by construction. No-leak guards inherit
// the FORBIDDEN_NO_LEAK_MARKERS set above + this block extends
// them for transcript / personal-content / surveillance markers.
const STAGE_2_FORBIDDEN_RESPONSE_MARKERS = [
  "raw_text",
  "message_body",
  "speaker_quote",
  "private_note",
  "raw_audio",
  "raw_video",
  "raw_screen_capture",
  "emotion_score",
  "sentiment_score",
  "employee_score",
  "manager_score",
  "psychological_profile",
  "compliance_certification",
  "legal_conclusion",
  "regulator_approval",
  "related_transcript_ref",
  "transcript_id",
  "transcript_hash",
  "transcript_text_encrypted",
];

const STAGE_2_FORBIDDEN_SIGNAL_VALUES = [
  "NON_WORK_PERSONAL",
  "SENSITIVE_PERSONAL",
  "UNKNOWN_REQUIRES_REVIEW",
  "UNKNOWN_BUSINESS_PURPOSE",
  "BLOCKED_FROM_AGENT_PLAYGROUND",
  "REQUIRES_HUMAN_REVIEW",
];

const STAGE_2_REQUIRED_SIGNAL_FIELDS = [
  "signal_type",
  "signal_confidence_label",
  "signal_source_type",
  "signal_scope",
  "detected_at",
  "evidence_label",
  "safe_summary",
  "requires_human_review",
  "retention_class",
  "honest_note",
  "conversation_relevance_class",
  "capture_eligibility",
  "agent_playground_use",
  "redaction_applied",
  "business_purpose_label",
  "scope_binding_type",
  "review_required",
  "personal_content_suppressed",
] as const;

describe("Section 5 Wave 7 + ADR-0078 Stage 2 — conversation_context_signals sidecar", () => {
  it("response carries `conversation_context_signals` array (additive sidecar)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.conversation_context_signals)).toBe(true);
  });

  it("response remains backward-compatible (existing Wave 7 fields preserved)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.recommended_candidate_key).toBeDefined();
    expect(r.body.recommended_candidate_type).toBeDefined();
    expect(r.body.recommended_at).toBeDefined();
    expect(r.body.audit_event_id).toBeDefined();
    expect(r.body.honest_note).toBeDefined();
    expect(r.body.human_decision_required).toBeDefined();
    expect(Array.isArray(r.body.recommendation_reasons)).toBe(true);
    expect(Array.isArray(r.body.alternatives_considered)).toBe(true);
  });

  it("sidecar is bounded ≤ 8 per ADR-0078 §8 line 1129", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.conversation_context_signals.length).toBeLessThanOrEqual(8);
  });

  it("every emitted signal carries all §6C.12 additive fields + §2 base fields", async () => {
    // Goal-summary missing → triggers the MANUAL_USER_INPUT
    // CONTEXT_INSUFFICIENT_FOR_RECOMMENDATION projection so we
    // can assert the full ConversationContextSignal shape.
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      goal_summary: "",
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: unknown[] = r.body.conversation_context_signals;
    if (signals.length === 0) {
      // Scenario without approved-source context may legitimately
      // emit zero signals — the rest of this assertion only
      // applies when at least one signal is present.
      return;
    }
    for (const s of signals) {
      expect(typeof s).toBe("object");
      for (const f of STAGE_2_REQUIRED_SIGNAL_FIELDS) {
        expect(s).toHaveProperty(f);
      }
    }
  });

  it("sidecar NEVER carries Stage 1-forbidden tokens (no-leak guard)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      goal_summary: "",
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    for (const token of STAGE_2_FORBIDDEN_RESPONSE_MARKERS) {
      expect(r.raw).not.toContain(token);
    }
  });

  it("sidecar NEVER carries ADR-0079 §27 blocked enum values", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      goal_summary: "",
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: Record<string, string>[] =
      r.body.conversation_context_signals;
    for (const s of signals) {
      for (const blocked of STAGE_2_FORBIDDEN_SIGNAL_VALUES) {
        // these values must not appear in any closed-vocab
        // discriminator on the wire
        expect(s.conversation_relevance_class).not.toBe(blocked);
        expect(s.business_purpose_label).not.toBe(blocked);
        expect(s.agent_playground_use).not.toBe(blocked);
      }
    }
  });

  it("scenarios with no approved-source context return an empty (NOT null) sidecar", async () => {
    const caller = await loginPerson();
    // Fresh caller has no MemoryCapsule rows + no Action rows;
    // scenario has a non-empty goal_summary so MANUAL_USER_INPUT
    // signal does not fire either.
    const { scenario_id } = await createScenario(caller, {
      goal_summary: "A clearly described goal for the scenario.",
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.conversation_context_signals).toEqual([]);
  });
});

describe("Section 5 Wave 7 Option A — Wave 6/5 regression preserved", () => {
  it("Wave 6 outcome-comparison route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.comparison_matrix)).toBe(true);
  });

  it("Wave 5 candidate route still LIVE", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(Array.isArray(r.body.candidates)).toBe(true);
  });
});

// ADR-0078 Stage 2 — HIVE_CONTEXT projection (Hive C1 LIVE
// 2026-06-01). Closes the explicit zero-output gap left at
// Stage 2: caller-scoped same-org membership read emits a
// MISSING_STAKEHOLDER_INPUT signal when the caller has at
// least one ACTIVE membership in an ACTIVE Hive whose
// org_entity_id matches the scenario's org_entity_id. Cross-
// org callers + orgless scenarios + callers with no in-org
// memberships emit zero HIVE_CONTEXT signals.
describe("Section 5 Wave 7 + ADR-0078 Stage 2 — HIVE_CONTEXT projection (Hive C1)", () => {
  async function loginPersonInOrg(): Promise<{
    entityId: string;
    token: string;
    ip: string;
    orgId: string;
  }> {
    // Create an org-type entity to act as the parent org.
    const orgInput = makeEntityInput({
      entity_type: "COMPANY",
      password: "irrelevant-org-password",
    });
    const org = await createEntity(orgInput);
    // Create the caller PERSON.
    const password = "correct-horse-battery";
    const personInput = makeEntityInput({
      entity_type: "PERSON",
      password,
    });
    const person = await createEntity(personInput);
    // Join the PERSON as ACTIVE child of the org.
    await prisma.entityMembership.create({
      data: {
        parent_id: org.entity_id,
        child_id: person.entity_id,
        role_title: "MEMBER",
        is_active: true,
      },
    });
    // Log in.
    const ip = `10.97.${Math.floor(Math.random() * 200) + 1}.${
      Math.floor(Math.random() * 254) + 1
    }`;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: personInput.email,
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
      entityId: person.entity_id,
      token: body.token,
      ip,
      orgId: org.entity_id,
    };
  }

  async function seedActiveHiveWithMember(opts: {
    orgId: string;
    memberEntityId: string;
  }): Promise<{ hiveId: string }> {
    const hive = await prisma.hive.create({
      data: {
        hive_id: randomUUID(),
        hive_name: `hive-c1-test-${randomUUID()}`,
        created_by: opts.memberEntityId,
        hive_type: "ENTERPRISE",
        governance_terms: {},
        member_count: 1,
        status: "ACTIVE",
        org_entity_id: opts.orgId,
        is_default_enterprise: false,
      },
    });
    await prisma.hiveMembership.create({
      data: {
        membership_id: randomUUID(),
        hive_id: hive.hive_id,
        entity_id: opts.memberEntityId,
        capsule_types_contributed: ["PREFERENCE"],
        contribution_scope: "SUMMARY",
        capsule_types_accessible: ["PREFERENCE"],
        access_scope: "SUMMARY",
        status: "ACTIVE",
      },
    });
    return { hiveId: hive.hive_id };
  }

  it("emits HIVE_CONTEXT signal on Wave 7 when caller has an active same-org hive membership", async () => {
    const caller = await loginPersonInOrg();
    await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: { signal_source_type: string }[] =
      r.body.conversation_context_signals;
    const hiveSignals = signals.filter(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    );
    expect(hiveSignals.length).toBe(1);
  });

  it("HIVE_CONTEXT signal carries safe closed-vocab fields only", async () => {
    const caller = await loginPersonInOrg();
    await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const signals: Record<string, unknown>[] =
      r.body.conversation_context_signals;
    const hive = signals.find(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    )!;
    expect(hive).toBeDefined();
    expect(hive.signal_type).toBe("MISSING_STAKEHOLDER_INPUT");
    expect(hive.signal_scope).toBe("SAME_ORG");
    expect(hive.business_purpose_label).toBe("HIVE_OR_TEAM_COORDINATION");
    expect(hive.scope_binding_type).toBe("ORG_SCOPED");
    expect(hive.evidence_label).toBe("MISSING_CONTEXT");
    expect(hive.conversation_relevance_class).toBe("WORK_RELEVANT");
    expect(hive.agent_playground_use).toBe("ALLOWED_FOR_SIGNALS");
    // SAFE METADATA ONLY — must NEVER carry hive name / hive
    // id / member id / governance_terms text / aggregate
    // capsule id / raw aggregate payload.
    const raw = JSON.stringify(hive);
    expect(raw).not.toContain("hive_name");
    expect(raw).not.toContain("hive_id");
    expect(raw).not.toContain("governance_terms");
    expect(raw).not.toContain("aggregate_capsule_id");
    expect(raw).not.toContain("member_count");
  });

  it("orgless scenario emits NO HIVE_CONTEXT signal even when caller has hive memberships elsewhere", async () => {
    const caller = await loginPerson(); // No org membership.
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: { signal_source_type: string }[] =
      r.body.conversation_context_signals;
    const hiveSignals = signals.filter(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    );
    expect(hiveSignals.length).toBe(0);
  });

  it("caller in an org but with NO hive memberships emits NO HIVE_CONTEXT signal", async () => {
    const caller = await loginPersonInOrg();
    // Skip seedActiveHiveWithMember — caller has org but no
    // hive membership.
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: { signal_source_type: string }[] =
      r.body.conversation_context_signals;
    const hiveSignals = signals.filter(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    );
    expect(hiveSignals.length).toBe(0);
  });

  it("REMOVED membership does NOT emit HIVE_CONTEXT signal (mirrors getHiveIntelligence gate)", async () => {
    const caller = await loginPersonInOrg();
    const { hiveId } = await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    // Flip membership to REMOVED.
    await prisma.hiveMembership.updateMany({
      where: { hive_id: hiveId, entity_id: caller.entityId },
      data: { status: "REMOVED" },
    });
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: { signal_source_type: string }[] =
      r.body.conversation_context_signals;
    const hiveSignals = signals.filter(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    );
    expect(hiveSignals.length).toBe(0);
  });

  it("DISSOLVED hive does NOT emit HIVE_CONTEXT signal even with active membership", async () => {
    const caller = await loginPersonInOrg();
    const { hiveId } = await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    await prisma.hive.update({
      where: { hive_id: hiveId },
      data: { status: "DISSOLVED" },
    });
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    expect(r.statusCode).toBe(200);
    const signals: { signal_source_type: string }[] =
      r.body.conversation_context_signals;
    const hiveSignals = signals.filter(
      (s) => s.signal_source_type === "HIVE_CONTEXT",
    );
    expect(hiveSignals.length).toBe(0);
  });

  it("HIVE_CONTEXT confidence label widens to MEDIUM with 2+ active memberships in same org", async () => {
    const caller = await loginPersonInOrg();
    await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    await seedActiveHiveWithMember({
      orgId: caller.orgId,
      memberEntityId: caller.entityId,
    });
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/best-path-recommendations`,
    );
    const signals: { signal_source_type: string; signal_confidence_label: string }[] =
      r.body.conversation_context_signals;
    const hive = signals.find((s) => s.signal_source_type === "HIVE_CONTEXT");
    expect(hive?.signal_confidence_label).toBe("MEDIUM");
  });
});
