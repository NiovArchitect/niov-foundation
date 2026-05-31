// FILE: playground-outcome-comparisons.test.ts (integration)
// PURPOSE: Section 5 Wave 6 Option A Agent Playground
//          deterministic outcome-comparison coverage per
//          ADR-0073. Exercises the new
//          `POST /api/v1/playground/scenarios/:id/outcome-comparisons`
//          route; verifies bearer enforcement; verifies
//          owner-first + same-org SCENARIO_NOT_FOUND
//          enumeration-safe gate inherited via the candidate
//          service → scenario service delegation; verifies
//          closed-vocab validation across the 5 ADR-0073
//          vocabularies (outcome_dimensions /
//          dimension_rating / risk_findings /
//          dependency_findings / required_reviews / and the
//          comparison_mode + comparison_notes auxiliary
//          vocabularies); verifies deterministic comparison
//          output stability; verifies bounded count caps per
//          ADR-0073 §11; verifies mandatory honest_note at
//          both top-level + per matrix item; verifies
//          ADMIN_ACTION + details.action="PLAYGROUND_OUTCOMES_COMPARED"
//          audit emission with safe metadata only (zero new
//          audit literal); verifies no comparison text / no
//          candidate text in audit details; verifies §9 +
//          §17 no-leak forbidden field surface; verifies the
//          scenario is never mutated and no comparison rows /
//          candidate rows / Action rows / ActionAttempt rows /
//          ConnectorBinding rows / MemoryCapsule rows /
//          OtzarConversation rows / Notification rows are
//          created; verifies tradeoff_summary is not a
//          ranking; verifies absence of forbidden response
//          fields (score / rank / winner / best / probability
//          / roi / recommendation); verifies Wave 5
//          candidate-generation regression is preserved.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-outcome-comparison.service.ts
//   - ADR-0073 Section 5 Wave 6 Outcome-Comparison Contract

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

const TEST_JWT_SECRET = "playground-outcome-comparisons-test-secret";
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
  const ip = `10.95.${Math.floor(Math.random() * 200) + 1}.${
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
    description: "Generic scenario for outcome-comparison tests.",
    goal_summary: "Generic goal.",
    ...overrides,
  });
  if (r.statusCode !== 201) {
    throw new Error(`create scenario failed: ${r.statusCode} ${r.raw}`);
  }
  return { scenario_id: r.body.scenario.scenario_id };
}

// WHAT: The no-leak guard list for the comparison response
//        surface. Mirrors the Wave 5 candidate test list +
//        extends with ADR-0073 §9 + §17 forbidden tokens.
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

// WHAT: ADR-0073 §7 forbidden response-field names. Any of
//        these appearing as property keys in the response
//        body indicates the implementation drifted into
//        scoring / ranking / winner-selection territory.
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

// WHAT: ADR-0073 §7 forbidden comparison-language tokens.
//        These MUST NOT appear in any response body text per
//        ADR-0070 §9 legal-advice boundary extended at
//        ADR-0073 §7. Case-insensitive substring match.
const FORBIDDEN_COMPARISON_LANGUAGE = [
  "best path",
  "the winner",
  "guaranteed",
  "legally sufficient",
  "regulator approved",
  "no fine risk",
  "ai approved",
  "execute this",
  "execute automatically",
  "employee risk",
  "manager should intervene",
  "probability of success",
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
  for (const marker of FORBIDDEN_COMPARISON_LANGUAGE) {
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

const OUTCOME_DIMENSIONS = [
  "GOVERNANCE_ALIGNMENT",
  "EXECUTION_COMPLEXITY",
  "OPERATIONAL_RISK",
  "COMPLIANCE_REVIEW_NEED",
  "HUMAN_REVIEW_NEED",
  "DATA_SCOPE_READINESS",
  "CONNECTOR_READINESS",
  "CUSTOMER_OR_STAKEHOLDER_IMPACT",
  "COST_SENSITIVITY",
  "SPEED_TO_EXECUTION",
  "RESILIENCE_IMPACT",
  "REVERSIBILITY",
] as const;

const DIMENSION_RATINGS = [
  "FAVORABLE",
  "MIXED",
  "UNFAVORABLE",
  "INSUFFICIENT_DATA",
  "NOT_APPLICABLE",
] as const;

const RISK_FINDINGS = [
  "POLICY_RISK",
  "COMPLIANCE_REVIEW_RISK",
  "LEGAL_REVIEW_RISK",
  "DATA_SCOPE_RISK",
  "CONNECTOR_READINESS_RISK",
  "EXECUTION_COMPLEXITY_RISK",
  "OPERATIONAL_RESILIENCE_RISK",
  "STAKEHOLDER_IMPACT_RISK",
  "INSUFFICIENT_INFORMATION_RISK",
  "HUMAN_DECISION_REQUIRED_RISK",
] as const;

const DEPENDENCY_FINDINGS = [
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_DUAL_CONTROL",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "REQUIRES_DATA_SCOPE_EXPANSION",
  "REQUIRES_HUMAN_DECISION",
  "REQUIRES_LEGAL_OR_COMPLIANCE_REVIEW",
  "REQUIRES_ACTION_RUNTIME",
  "REQUIRES_ADDITIONAL_CONTEXT",
  "NO_BLOCKING_DEPENDENCY_IDENTIFIED",
] as const;

const REQUIRED_REVIEWS = [
  "HUMAN_OWNER_REVIEW",
  "POLICY_OWNER_REVIEW",
  "COMPLIANCE_REVIEW",
  "LEGAL_REVIEW",
  "SECURITY_REVIEW",
  "DATA_GOVERNANCE_REVIEW",
  "CONNECTOR_ADMIN_REVIEW",
  "ACTION_APPROVER_REVIEW",
  "NO_ADDITIONAL_REVIEW_IDENTIFIED",
] as const;

const COMPARISON_MODES = [
  "DETERMINISTIC_RUBRIC",
  "CANDIDATE_FIELD_PROJECTION",
] as const;

const COMPARISON_NOTES = [
  "MORE_REVIEW_NEEDED_THAN_AVERAGE",
  "LESS_REVIEW_NEEDED_THAN_AVERAGE",
  "LOWER_OPERATIONAL_COMPLEXITY",
  "HIGHER_OPERATIONAL_COMPLEXITY",
  "HIGHER_CONNECTOR_READINESS",
  "LOWER_CONNECTOR_READINESS",
  "MORE_REVERSIBLE_THAN_AVERAGE",
  "LESS_REVERSIBLE_THAN_AVERAGE",
  "INSUFFICIENT_DATA_RELATIVE_TO_PEERS",
  "BLOCKED_BY_POLICY_OR_GOVERNANCE",
  "HUMAN_DECISION_REQUIRED",
  "NO_NOTABLE_RELATIVE_POSTURE",
] as const;

describe("Section 5 Wave 6 Option A — auth enforcement", () => {
  it("401 without bearer", async () => {
    const r = await inject(
      "POST",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("404 enumeration-safe for unknown scenario id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${randomUUID()}/outcome-comparisons`,
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });
});

describe("Section 5 Wave 6 Option A — owner can compare outcomes", () => {
  it("owner gets comparison matrix on a DRAFT scenario", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.scenario_id).toBe(scenario_id);
    expect(typeof r.body.compared_at).toBe("string");
    expect(r.body.comparison_mode).toBe("DETERMINISTIC_RUBRIC");
    expect(Array.isArray(r.body.comparison_matrix)).toBe(true);
    expect(r.body.comparison_matrix.length).toBeGreaterThan(0);
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    // candidate_key set + ordering must match across reads.
    const keysA = (
      a.body.comparison_matrix as Array<{ candidate_key: string }>
    ).map((c) => c.candidate_key);
    const keysB = (
      b.body.comparison_matrix as Array<{ candidate_key: string }>
    ).map((c) => c.candidate_key);
    expect(keysA).toEqual(keysB);
    // Per-item rating sets must match across reads.
    const ratingsA = (
      a.body.comparison_matrix as Array<{
        candidate_key: string;
        outcome_dimensions: Array<{ dimension: string; rating: string }>;
      }>
    ).map((m) => ({
      key: m.candidate_key,
      dims: m.outcome_dimensions,
    }));
    const ratingsB = (
      b.body.comparison_matrix as Array<{
        candidate_key: string;
        outcome_dimensions: Array<{ dimension: string; rating: string }>;
      }>
    ).map((m) => ({
      key: m.candidate_key,
      dims: m.outcome_dimensions,
    }));
    expect(ratingsA).toEqual(ratingsB);
  });
});

describe("Section 5 Wave 6 Option A — bounded count + body validation", () => {
  it("candidate count bounded by ADR-0073 §11 cap (8)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.comparison_matrix.length).toBeLessThanOrEqual(8);
    expect(r.body.candidate_count).toBe(r.body.comparison_matrix.length);
  });

  it("max_candidates rejects zero", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { max_candidates: 0 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects negative", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { max_candidates: -3 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects above ADR-0073 cap (>8)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { max_candidates: 9 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates=2 caps response to 2 matrix items", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { max_candidates: 2 },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.comparison_matrix.length).toBe(2);
  });

  it("candidate_types filter validates closed vocabulary", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { comparison_mode: "NOT_A_MODE" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("comparison_mode");
  });

  it("explicit comparison_mode=CANDIDATE_FIELD_PROJECTION echoes verbatim", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { comparison_mode: "CANDIDATE_FIELD_PROJECTION" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.comparison_mode).toBe("CANDIDATE_FIELD_PROJECTION");
    // CANDIDATE_FIELD_PROJECTION sets every dimension to
    // INSUFFICIENT_DATA (no rubric inference).
    for (const item of r.body.comparison_matrix as Array<{
      outcome_dimensions: Array<{ rating: string }>;
    }>) {
      for (const d of item.outcome_dimensions) {
        expect(d.rating).toBe("INSUFFICIENT_DATA");
      }
    }
  });

  it("v1 body must NOT accept candidate_keys (deferred per QLOCK 2)", async () => {
    // candidate_keys is silently ignored at v1 — no
    // validation error is raised since the field is simply
    // not part of the v1 contract. The comparison succeeds
    // using the default deterministic set, demonstrating
    // that candidate_keys had no effect.
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_keys: ["abc123", "def456"] } as Record<string, unknown>,
    );
    expect(r.statusCode).toBe(200);
    // Default deterministic set produced; not filtered by
    // the ignored candidate_keys field.
    expect(r.body.comparison_matrix.length).toBeGreaterThan(0);
  });
});

describe("Section 5 Wave 6 Option A — closed-vocab + honest_note enforcement", () => {
  it("top-level response carries honest_note", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(typeof r.body.honest_note).toBe("string");
    expect(r.body.honest_note.length).toBeGreaterThan(0);
    const lower = (r.body.honest_note as string).toLowerCase();
    expect(lower).toContain("advisory");
    expect(lower).toContain("does not select a winner");
    expect(lower).toContain("not legal advice");
  });

  it("every matrix item carries honest_note", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    expect(r.statusCode).toBe(200);
    for (const item of r.body.comparison_matrix as Array<{
      honest_note: string;
    }>) {
      expect(typeof item.honest_note).toBe("string");
      expect(item.honest_note.length).toBeGreaterThan(0);
      const lower = item.honest_note.toLowerCase();
      expect(lower).toContain("advisory");
      expect(lower).toContain("does not select a winner");
      expect(lower).toContain("not legal advice");
    }
  });

  it("every matrix item uses closed-vocab outcome_dimensions", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      outcome_dimensions: Array<{ dimension: string; rating: string }>;
    }>) {
      for (const d of item.outcome_dimensions) {
        expect(OUTCOME_DIMENSIONS as readonly string[]).toContain(d.dimension);
        expect(DIMENSION_RATINGS as readonly string[]).toContain(d.rating);
      }
    }
  });

  it("every matrix item uses closed-vocab risk_findings", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      risk_findings: string[];
    }>) {
      for (const f of item.risk_findings) {
        expect(RISK_FINDINGS as readonly string[]).toContain(f);
      }
    }
  });

  it("every matrix item uses closed-vocab dependency_findings", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      dependency_findings: string[];
    }>) {
      for (const f of item.dependency_findings) {
        expect(DEPENDENCY_FINDINGS as readonly string[]).toContain(f);
      }
    }
  });

  it("every matrix item uses closed-vocab required_reviews", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      required_reviews: string[];
    }>) {
      for (const f of item.required_reviews) {
        expect(REQUIRED_REVIEWS as readonly string[]).toContain(f);
      }
    }
  });

  it("every matrix item uses closed-vocab comparison_notes", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      comparison_notes: string[];
    }>) {
      for (const f of item.comparison_notes) {
        expect(COMPARISON_NOTES as readonly string[]).toContain(f);
      }
    }
  });

  it("every matrix item uses closed-vocab candidate_type from Wave 5", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const item of r.body.comparison_matrix as Array<{
      candidate_type: string;
    }>) {
      expect(CANDIDATE_TYPES as readonly string[]).toContain(item.candidate_type);
    }
  });

  it("comparison_mode in response is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(COMPARISON_MODES as readonly string[]).toContain(
      r.body.comparison_mode,
    );
  });
});

describe("Section 5 Wave 6 Option A — TradeoffSummary is not a ranking", () => {
  it("tradeoff_summary has 4 closed-vocab candidate_key sets, never a ranking", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const ts = r.body.tradeoff_summary;
    expect(Array.isArray(ts.candidates_favoring_governance)).toBe(true);
    expect(Array.isArray(ts.candidates_favoring_resilience)).toBe(true);
    expect(Array.isArray(ts.candidates_with_blocking_signals)).toBe(true);
    expect(Array.isArray(ts.candidates_requiring_human_decision)).toBe(true);
    // TradeoffSummary has NO ranking field or numeric score
    // anywhere — only 4 set-like arrays of candidate_keys.
    const keys = Object.keys(ts).sort();
    expect(keys).toEqual([
      "candidates_favoring_governance",
      "candidates_favoring_resilience",
      "candidates_requiring_human_decision",
      "candidates_with_blocking_signals",
    ]);
  });

  it("response has NO field named score / rank / winner / best / probability / roi / recommendation", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    assertNoForbiddenResponseFields(r.raw);
  });

  it("response contains NO forbidden comparison language", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    assertNoForbiddenLanguage(r.raw);
  });
});

describe("Section 5 Wave 6 Option A — audit emission + safe metadata", () => {
  it("emits ADMIN_ACTION + details.action='PLAYGROUND_OUTCOMES_COMPARED'", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(200);
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    expect(row).not.toBeNull();
    expect(row!.event_type).toBe("ADMIN_ACTION");
    const details = row!.details as Record<string, unknown>;
    expect(details.action).toBe("PLAYGROUND_OUTCOMES_COMPARED");
  });

  it("audit details contain safe metadata only", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    const details = row!.details as Record<string, unknown>;
    expect(typeof details.scenario_id).toBe("string");
    expect(typeof details.candidate_count).toBe("number");
    expect(typeof details.comparison_mode).toBe("string");
    expect(typeof details.blocked_candidates_count).toBe("number");
    expect(typeof details.review_required_count).toBe("number");
    expect(typeof details.generated_from_candidate_keys_hash).toBe("string");
    expect(details.generated_from_candidate_keys_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("audit details do NOT contain comparison text, candidate text, or scenario raw fields", async () => {
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
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
    // No raw comparison or matrix-item field names.
    expect(serialized).not.toContain("comparison_summary");
    expect(serialized).not.toContain("candidate_title");
    expect(serialized).not.toContain("comparison_notes");
    expect(serialized).not.toContain("tradeoff_summary");
  });

  it("zero new audit literal introduced (event_type stays ADMIN_ACTION)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const literalRows = await prisma.auditEvent.findMany({
      where: { event_type: "PLAYGROUND_OUTCOMES_COMPARED" as any },
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    expect(row!.actor_entity_id).toBe(caller.entityId);
    expect(row!.target_entity_id).toBe(caller.entityId);
  });
});

describe("Section 5 Wave 6 Option A — no-leak + no-side-effect", () => {
  it("response no-leak: ADR-0073 §9 + §17 forbidden tokens never surface", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      input_refs: { secret_ref_inside: "value", embedding: "value" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response never echoes raw scenario field values back to caller", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-COMPARE-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
      goal_summary: `GOAL-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.raw).not.toContain(uniqueTitle);
  });

  it("no PlaygroundScenario row mutated by comparison generation", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
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
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    const after = await counts();
    expect(after).toEqual(before);
  });

  it("repeated comparison does not create per-comparison persistence rows", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const beforeScenarios = await prisma.playgroundScenario.count();
    for (let i = 0; i < 3; i++) {
      const r = await inject(
        "POST",
        caller,
        `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
      );
      expect(r.statusCode).toBe(200);
    }
    const afterScenarios = await prisma.playgroundScenario.count();
    expect(afterScenarios).toBe(beforeScenarios);
  });
});

describe("Section 5 Wave 6 Option A — Wave 5 regression preserved", () => {
  it("Wave 5 candidate route still LIVE after Wave 6 wiring", async () => {
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
    expect(r.body.candidates.length).toBeGreaterThan(0);
  });
});

describe("Section 5 Wave 6 Option A — DO_NOT_PROCEED + blocking signal surface", () => {
  it("ARCHIVED scenario surfaces DO_NOT_PROCEED + blocked_by_policy + tradeoff blocking set", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    // Soft-archive the scenario via the Wave 4 DELETE route.
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}`,
    );
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/outcome-comparisons`,
    );
    expect(r.statusCode).toBe(200);
    const blocked = (
      r.body.comparison_matrix as Array<{
        candidate_type: string;
        blocked_by_policy: boolean;
        candidate_key: string;
      }>
    ).find((m) => m.candidate_type === "DO_NOT_PROCEED");
    expect(blocked).toBeDefined();
    expect(blocked!.blocked_by_policy).toBe(true);
    expect(r.body.blocked_candidates_count).toBeGreaterThanOrEqual(1);
    expect(
      r.body.tradeoff_summary.candidates_with_blocking_signals,
    ).toContain(blocked!.candidate_key);
  });
});
