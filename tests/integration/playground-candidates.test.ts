// FILE: playground-candidates.test.ts (integration)
// PURPOSE: Section 5 Wave 5 Option A Agent Playground deterministic
//          candidate-generation coverage per ADR-0072. Exercises the
//          new `POST /api/v1/playground/scenarios/:id/candidates`
//          route; verifies bearer enforcement; verifies owner-first
//          + same-org SCENARIO_NOT_FOUND enumeration-safe gate
//          inherited verbatim from Wave 4 via the scenario service
//          delegation; verifies closed-vocab validation across the
//          4 ADR-0072 vocabularies (candidate_type / governance_
//          findings / action_runtime_transition_hint / confidence_
//          label); verifies deterministic candidate_key stability;
//          verifies bounded count caps per ADR-0072 §18; verifies
//          mandatory honest_note on every candidate; verifies
//          ADMIN_ACTION + details.action="PLAYGROUND_CANDIDATES_
//          GENERATED" audit emission with safe metadata only
//          (zero new audit literal); verifies no candidate text in
//          audit details; verifies §6 + §14 no-leak forbidden field
//          surface; verifies the scenario is never mutated and no
//          candidate rows / Action rows / ActionAttempt rows /
//          ConnectorBinding rows / MemoryCapsule rows /
//          OtzarConversation rows / Notification rows are created
//          by the read-only computed-on-read pipeline.
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-candidate.service.ts
//   - ADR-0072 Section 5 Wave 5 Candidate-Generation Contract

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

const TEST_JWT_SECRET = "playground-candidates-test-secret";
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
  const ip = `10.94.${Math.floor(Math.random() * 200) + 1}.${
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
    description: "Generic scenario for candidate tests.",
    goal_summary: "Generic goal.",
    ...overrides,
  });
  if (r.statusCode !== 201) {
    throw new Error(`create scenario failed: ${r.statusCode} ${r.raw}`);
  }
  return { scenario_id: r.body.scenario.scenario_id };
}

// WHAT: The no-leak guard list for the candidate response surface.
// INPUT: A raw response string.
// OUTPUT: An assertion failure if any forbidden token appears.
// WHY: Mirrors the Wave 4 FORBIDDEN_NO_LEAK_MARKERS list + adds
//      ADR-0072 §6 + §14 forbidden-input / forbidden-output
//      tokens (e.g., `candidate_pool` which is in the static
//      no-leak guard's FORBIDDEN_TOKENS so the candidate response
//      must never use that key).
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

function assertNoLeak(raw: string): void {
  const lower = raw.toLowerCase();
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(lower).not.toContain(marker.toLowerCase());
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
const GOVERNANCE_FINDINGS = [
  "POLICY_ALLOWED",
  "POLICY_REVIEW_REQUIRED",
  "APPROVAL_REQUIRED",
  "DUAL_CONTROL_REQUIRED",
  "CONNECTOR_UNAVAILABLE",
  "DATA_SCOPE_INSUFFICIENT",
  "COMPLIANCE_REVIEW_RECOMMENDED",
  "LEGAL_REVIEW_RECOMMENDED",
  "HUMAN_DECISION_REQUIRED",
  "ACTION_RUNTIME_REQUIRED",
  "DO_NOT_EXECUTE",
] as const;
const TRANSITION_HINTS = [
  "NO_ACTION",
  "MAY_PROPOSE_ACTION_LATER",
  "REQUIRES_APPROVAL_CHAIN",
  "REQUIRES_POLICY_REVIEW",
  "REQUIRES_CONNECTOR_CAPABILITY",
  "REQUIRES_HUMAN_DECISION",
  "BLOCKED",
] as const;
const CONFIDENCE_LABELS = ["LOW", "MEDIUM", "HIGH", "INSUFFICIENT_DATA"] as const;

describe("Section 5 Wave 5 Option A — auth enforcement", () => {
  it("401 without bearer", async () => {
    const r = await inject(
      "POST",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}/candidates`,
    );
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("404 enumeration-safe for unknown scenario id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${randomUUID()}/candidates`,
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
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });
});

describe("Section 5 Wave 5 Option A — owner can generate candidates", () => {
  it("owner gets candidates on a DRAFT scenario", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.scenario_id).toBe(scenario_id);
    expect(Array.isArray(r.body.candidates)).toBe(true);
    expect(r.body.candidates.length).toBeGreaterThan(0);
    expect(typeof r.body.generated_at).toBe("string");
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
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const after = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    expect(after!.updated_at.toISOString()).toBe(updatedAtBefore);
  });

  it("deterministic candidate_key is stable across identical reads", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const a = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const b = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const keysA = (a.body.candidates as Array<{ candidate_key: string }>).map(
      (c) => c.candidate_key,
    );
    const keysB = (b.body.candidates as Array<{ candidate_key: string }>).map(
      (c) => c.candidate_key,
    );
    expect(keysA).toEqual(keysB);
    for (const k of keysA) {
      expect(k).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

describe("Section 5 Wave 5 Option A — bounded count + body validation", () => {
  it("candidate count is bounded by ADR-0072 §18 cap (8)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      {
        candidate_types: [...CANDIDATE_TYPES],
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.candidates.length).toBeLessThanOrEqual(8);
  });

  it("max_candidates rejects zero", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { max_candidates: 0 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects negative", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { max_candidates: -3 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects non-integer", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { max_candidates: 2.5 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates rejects values above ADR-0072 cap (>8)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { max_candidates: 9 },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("max_candidates");
  });

  it("max_candidates=2 caps response to 2 candidates", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { max_candidates: 2 },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.candidates.length).toBe(2);
  });

  it("candidate_types filter validates closed vocabulary", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: ["NOT_A_REAL_TYPE"] },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("candidate_types");
  });

  it("candidate_types rejects non-array", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: "STATUS_QUO" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("candidate_types");
  });

  it("explicit candidate_types filter selects only the named types", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: ["STATUS_QUO", "COMPLIANCE_FIRST"] },
    );
    expect(r.statusCode).toBe(200);
    const types = (r.body.candidates as Array<{ candidate_type: string }>).map(
      (c) => c.candidate_type,
    );
    expect(types.sort()).toEqual(["COMPLIANCE_FIRST", "STATUS_QUO"]);
  });
});

describe("Section 5 Wave 5 Option A — default candidate set composition", () => {
  it("default set includes STATUS_QUO", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const types = (r.body.candidates as Array<{ candidate_type: string }>).map(
      (c) => c.candidate_type,
    );
    expect(types).toContain("STATUS_QUO");
  });

  it("default set includes LOW_RISK_INCREMENTAL", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const types = (r.body.candidates as Array<{ candidate_type: string }>).map(
      (c) => c.candidate_type,
    );
    expect(types).toContain("LOW_RISK_INCREMENTAL");
  });

  it("default set surfaces compliance review via COMPLIANCE_FIRST + HUMAN_REVIEW_REQUIRED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const types = (r.body.candidates as Array<{ candidate_type: string }>).map(
      (c) => c.candidate_type,
    );
    expect(types).toContain("COMPLIANCE_FIRST");
    expect(types).toContain("HUMAN_REVIEW_REQUIRED");
  });

  it("DO_NOT_PROCEED appears when scenario.status === ARCHIVED", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    // Soft-archive via the Wave 4 DELETE route to flip status.
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}`,
    );
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
    const types = (r.body.candidates as Array<{ candidate_type: string }>).map(
      (c) => c.candidate_type,
    );
    expect(types).toContain("DO_NOT_PROCEED");
    const blocked = (
      r.body.candidates as Array<{
        candidate_type: string;
        blocked_by_policy: boolean;
      }>
    ).find((c) => c.candidate_type === "DO_NOT_PROCEED");
    expect(blocked?.blocked_by_policy).toBe(true);
  });
});

describe("Section 5 Wave 5 Option A — closed-vocab + honest_note enforcement", () => {
  it("every candidate carries a non-empty honest_note", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    expect(r.statusCode).toBe(200);
    for (const c of r.body.candidates as Array<{ honest_note: string }>) {
      expect(typeof c.honest_note).toBe("string");
      expect(c.honest_note.length).toBeGreaterThan(0);
      // honest_note must mention advisory + not-executed + not-
      // legal-advice + human review per ADR-0072 §11.
      const lower = c.honest_note.toLowerCase();
      expect(lower).toContain("advisory");
      expect(lower).toContain("not been executed");
      expect(lower).toContain("not legal advice");
      expect(lower).toContain("review");
    }
  });

  it("every candidate uses closed-vocab candidate_type", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const c of r.body.candidates as Array<{ candidate_type: string }>) {
      expect(CANDIDATE_TYPES as readonly string[]).toContain(c.candidate_type);
    }
  });

  it("every governance_findings entry is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const c of r.body.candidates as Array<{
      governance_findings: string[];
    }>) {
      for (const g of c.governance_findings) {
        expect(GOVERNANCE_FINDINGS as readonly string[]).toContain(g);
      }
    }
  });

  it("every action_runtime_transition_hint is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const c of r.body.candidates as Array<{
      action_runtime_transition_hint: string;
    }>) {
      expect(TRANSITION_HINTS as readonly string[]).toContain(
        c.action_runtime_transition_hint,
      );
    }
  });

  it("every confidence_label is closed-vocab", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      { candidate_types: [...CANDIDATE_TYPES] },
    );
    for (const c of r.body.candidates as Array<{ confidence_label: string }>) {
      expect(CONFIDENCE_LABELS as readonly string[]).toContain(
        c.confidence_label,
      );
    }
  });
});

describe("Section 5 Wave 5 Option A — audit emission + safe metadata", () => {
  it("emits ADMIN_ACTION + details.action='PLAYGROUND_CANDIDATES_GENERATED'", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    expect(row).not.toBeNull();
    expect(row!.event_type).toBe("ADMIN_ACTION");
    const details = row!.details as Record<string, unknown>;
    expect(details.action).toBe("PLAYGROUND_CANDIDATES_GENERATED");
  });

  it("audit details contain safe metadata only", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const auditId = r.body.audit_event_id as string;
    const row = await prisma.auditEvent.findUnique({
      where: { audit_id: auditId },
    });
    const details = row!.details as Record<string, unknown>;
    expect(typeof details.scenario_id).toBe("string");
    expect(typeof details.candidate_count).toBe("number");
    expect(details.generation_mode).toBe("DETERMINISTIC");
    expect(Array.isArray(details.source_summary)).toBe(true);
    expect(typeof details.policy_review_required).toBe("boolean");
    expect(typeof details.blocked_count).toBe("number");
  });

  it("audit details do NOT contain candidate text or scenario raw fields", async () => {
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
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
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
    expect(serialized).not.toContain("candidate_title");
    expect(serialized).not.toContain("candidate_summary");
    expect(serialized).not.toContain("assumptions");
    expect(serialized).not.toContain("known_risks");
  });

  it("zero new audit literal introduced (event_type stays ADMIN_ACTION)", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    // Search audit table for any literal that mentions the new
    // discriminator string at the event_type column — there must
    // be none (the value lives only inside the JSON details).
    const literalRows = await prisma.auditEvent.findMany({
      where: { event_type: "PLAYGROUND_CANDIDATES_GENERATED" as any },
      take: 1,
    });
    expect(literalRows.length).toBe(0);
  });
});

describe("Section 5 Wave 5 Option A — no-leak + no-side-effect", () => {
  it("response no-leak: ADR-0072 §6 + §14 forbidden tokens never surface", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller, {
      input_refs: { secret_ref_inside: "value", embedding: "value" },
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("response never echoes raw scenario field values back to caller", async () => {
    const caller = await loginPerson();
    const uniqueTitle = `UNIQUE-MARKER-${randomUUID()}`;
    const { scenario_id } = await createScenario(caller, {
      title: uniqueTitle,
      description: `DESC-${uniqueTitle}`,
      goal_summary: `GOAL-${uniqueTitle}`,
    });
    const r = await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    // The raw scenario text MUST NOT echo back through the
    // template-driven candidate output — templates are closed-
    // vocab + blind to scenario-specific text per ADR-0072 §14.
    expect(r.raw).not.toContain(uniqueTitle);
  });

  it("no PlaygroundScenario row mutated by candidate generation", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const before = await prisma.playgroundScenario.findUnique({
      where: { scenario_id },
    });
    await inject(
      "POST",
      caller,
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
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
      `/api/v1/playground/scenarios/${scenario_id}/candidates`,
    );
    const after = await counts();
    expect(after).toEqual(before);
  });

  it("repeated generation does not create per-candidate persistence rows", async () => {
    const caller = await loginPerson();
    const { scenario_id } = await createScenario(caller);
    const beforeScenarios = await prisma.playgroundScenario.count();
    for (let i = 0; i < 3; i++) {
      const r = await inject(
        "POST",
        caller,
        `/api/v1/playground/scenarios/${scenario_id}/candidates`,
      );
      expect(r.statusCode).toBe(200);
    }
    const afterScenarios = await prisma.playgroundScenario.count();
    expect(afterScenarios).toBe(beforeScenarios);
  });
});
