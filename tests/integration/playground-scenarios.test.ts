// FILE: playground-scenarios.test.ts (integration)
// PURPOSE: Section 5 Wave 4 Agent Playground persistent named
//          scenarios contract coverage per ADR-0065 §7 Wave 4.
//          Exercises all 5 CRUD routes; verifies bearer enforcement;
//          verifies owner-first self-scope (cross-owner reads /
//          updates / archives fold to enumeration-safe 404);
//          verifies forbidden-field rejection on PUT; verifies
//          soft-archive semantics + idempotency; verifies SAFE
//          projection (no raw transcripts / prompts / chain-of-
//          thought / memory / capsule / correction content / vectors
//          / storage_location / content_hash / bridge_id / secret_ref
//          leak); verifies no Action / ActionAttempt / Notification /
//          OtzarConversation / MemoryCapsule / ConnectorBinding row
//          is created; verifies audit emission via ADMIN_ACTION +
//          details.action discriminator with safe details only
//          (no raw Json payloads / title / description / goal_summary
//          text in the audit row).
// CONNECTS TO:
//   - apps/api/src/routes/playground.routes.ts
//   - apps/api/src/services/playground/playground-scenario.service.ts
//   - ADR-0065 §7 Wave 4 contract

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

const TEST_JWT_SECRET = "playground-scenarios-test-secret";
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
  const ip = `10.93.${Math.floor(Math.random() * 200) + 1}.${
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

async function createOne(
  caller: { token: string; ip: string },
  overrides: Record<string, unknown> = {},
): Promise<{ scenario_id: string; raw: any }> {
  const r = await inject(
    "POST",
    caller,
    "/api/v1/playground/scenarios",
    {
      title: `Scenario ${randomUUID()}`,
      ...overrides,
    },
  );
  expect(r.statusCode).toBe(201);
  expect(r.body.ok).toBe(true);
  return { scenario_id: r.body.scenario.scenario_id, raw: r.body.scenario };
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
];

function assertNoLeak(raw: string): void {
  for (const marker of FORBIDDEN_NO_LEAK_MARKERS) {
    expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

describe("Section 5 Wave 4 — auth enforcement", () => {
  it("401 without bearer on POST /scenarios", async () => {
    const r = await inject("POST", null, "/api/v1/playground/scenarios", {
      title: "x",
    });
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });
  it("401 without bearer on GET /scenarios", async () => {
    const r = await inject("GET", null, "/api/v1/playground/scenarios");
    expect(r.statusCode).toBe(401);
  });
  it("401 without bearer on GET /scenarios/:id", async () => {
    const r = await inject(
      "GET",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}`,
    );
    expect(r.statusCode).toBe(401);
  });
  it("401 without bearer on PUT /scenarios/:id", async () => {
    const r = await inject(
      "PUT",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}`,
      { title: "x" },
    );
    expect(r.statusCode).toBe(401);
  });
  it("401 without bearer on DELETE /scenarios/:id", async () => {
    const r = await inject(
      "DELETE",
      null,
      `/api/v1/playground/scenarios/${randomUUID()}`,
    );
    expect(r.statusCode).toBe(401);
  });
});

describe("Section 5 Wave 4 — create", () => {
  it("creates a scenario with sensible defaults", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "First scenario" },
    );
    expect(r.statusCode).toBe(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.scenario.title).toBe("First scenario");
    expect(r.body.scenario.status).toBe("DRAFT");
    expect(r.body.scenario.scenario_type).toBe("MANUAL");
    expect(r.body.scenario.owner_entity_id).toBe(caller.entityId);
    expect(r.body.scenario.input_refs).toEqual({});
    expect(r.body.scenario.constraints).toEqual({});
    expect(r.body.scenario.expected_outputs).toEqual({});
    expect(r.body.scenario.governance_findings).toEqual({});
    expect(r.body.scenario.archived_at).toBeNull();
    expect(typeof r.body.audit_event_id).toBe("string");
  });

  it("422 INVALID_REQUEST when title is missing", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      {},
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("title");
  });

  it("422 INVALID_REQUEST when status not in closed vocab", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "x", status: "EXECUTED" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("status");
  });

  it("422 INVALID_REQUEST when scenario_type not in closed vocab", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "x", scenario_type: "AUTONOMOUS_EXEC" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("scenario_type");
  });

  it("422 INVALID_REQUEST when a Json field is not an object", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "x", input_refs: ["array-not-object"] },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("input_refs");
  });

  it("accepts FIXTURE and FUTURE_GENERATED scenario_type", async () => {
    const caller = await loginPerson();
    const a = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "fixture-test", scenario_type: "FIXTURE" },
    );
    expect(a.statusCode).toBe(201);
    expect(a.body.scenario.scenario_type).toBe("FIXTURE");
    const b = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "future-test", scenario_type: "FUTURE_GENERATED" },
    );
    expect(b.statusCode).toBe(201);
    expect(b.body.scenario.scenario_type).toBe("FUTURE_GENERATED");
  });

  it("trims title whitespace", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      { title: "  padded  " },
    );
    expect(r.statusCode).toBe(201);
    expect(r.body.scenario.title).toBe("padded");
  });
});

describe("Section 5 Wave 4 — list (owner-scoped)", () => {
  it("returns only the caller's scenarios", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    await createOne(callerA, { title: "A1" });
    await createOne(callerA, { title: "A2" });
    await createOne(callerB, { title: "B1" });

    const r = await inject("GET", callerA, "/api/v1/playground/scenarios");
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    const titles = r.body.scenarios.map((s: any) => s.title);
    expect(titles).toContain("A1");
    expect(titles).toContain("A2");
    expect(titles).not.toContain("B1");
    for (const s of r.body.scenarios) {
      expect(s.owner_entity_id).toBe(callerA.entityId);
    }
  });

  it("excludes ARCHIVED by default; includes when include_archived=true", async () => {
    const caller = await loginPerson();
    const live = await createOne(caller, { title: "alive" });
    const toArchive = await createOne(caller, { title: "to-archive" });
    const arc = await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${toArchive.scenario_id}`,
    );
    expect(arc.statusCode).toBe(200);

    const def = await inject("GET", caller, "/api/v1/playground/scenarios");
    expect(def.statusCode).toBe(200);
    const defIds = def.body.scenarios.map((s: any) => s.scenario_id);
    expect(defIds).toContain(live.scenario_id);
    expect(defIds).not.toContain(toArchive.scenario_id);

    const withArchived = await inject(
      "GET",
      caller,
      "/api/v1/playground/scenarios?include_archived=true",
    );
    expect(withArchived.statusCode).toBe(200);
    const withIds = withArchived.body.scenarios.map(
      (s: any) => s.scenario_id,
    );
    expect(withIds).toContain(live.scenario_id);
    expect(withIds).toContain(toArchive.scenario_id);
  });

  it("filters by status=ARCHIVED", async () => {
    const caller = await loginPerson();
    const draft = await createOne(caller, { title: "draft-d" });
    const arch = await createOne(caller, { title: "arch-a" });
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${arch.scenario_id}`,
    );

    const r = await inject(
      "GET",
      caller,
      "/api/v1/playground/scenarios?status=ARCHIVED",
    );
    expect(r.statusCode).toBe(200);
    const ids = r.body.scenarios.map((s: any) => s.scenario_id);
    expect(ids).toContain(arch.scenario_id);
    expect(ids).not.toContain(draft.scenario_id);
  });

  it("422 on invalid status query value", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "GET",
      caller,
      "/api/v1/playground/scenarios?status=EXECUTED",
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
  });
});

describe("Section 5 Wave 4 — detail (owner only)", () => {
  it("returns the scenario for the owner", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "detail-1" });
    const r = await inject(
      "GET",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.scenario.scenario_id).toBe(created.scenario_id);
    expect(r.body.scenario.title).toBe("detail-1");
  });

  it("404 SCENARIO_NOT_FOUND for cross-owner read (enumeration-safe)", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    const created = await createOne(callerA, { title: "owned-by-A" });
    const r = await inject(
      "GET",
      callerB,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });

  it("404 SCENARIO_NOT_FOUND for unknown id", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "GET",
      caller,
      `/api/v1/playground/scenarios/${randomUUID()}`,
    );
    expect(r.statusCode).toBe(404);
    expect(r.body.code).toBe("SCENARIO_NOT_FOUND");
  });
});

describe("Section 5 Wave 4 — update (owner only)", () => {
  it("updates title + description + status for owner", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "v1" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { title: "v2", description: "now described", status: "READY" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.scenario.title).toBe("v2");
    expect(r.body.scenario.description).toBe("now described");
    expect(r.body.scenario.status).toBe("READY");
    expect(typeof r.body.audit_event_id).toBe("string");
  });

  it("404 SCENARIO_NOT_FOUND on cross-owner update", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    const created = await createOne(callerA, { title: "owned-by-A" });
    const r = await inject(
      "PUT",
      callerB,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { title: "hijack" },
    );
    expect(r.statusCode).toBe(404);
  });

  it("422 INVALID_REQUEST on forbidden owner_entity_id field", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "forbidden-test" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { owner_entity_id: randomUUID() },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("INVALID_REQUEST");
    expect(r.body.invalid_fields).toContain("owner_entity_id");
  });

  it("422 INVALID_REQUEST on forbidden org_entity_id field", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "forbidden-org" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { org_entity_id: randomUUID() },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("org_entity_id");
  });

  it("422 INVALID_REQUEST on forbidden scenario_id / created_at / archived_at fields", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "forbidden-various" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      {
        scenario_id: randomUUID(),
        created_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
      },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toEqual(
      expect.arrayContaining(["scenario_id", "created_at", "archived_at"]),
    );
  });

  it("422 INVALID_REQUEST when update status not in closed vocab", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "status-vocab" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { status: "EXECUTED" },
    );
    expect(r.statusCode).toBe(422);
    expect(r.body.invalid_fields).toContain("status");
  });

  it("updates Json metadata fields verbatim", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "json-update" });
    const r = await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      {
        input_refs: { sources: ["safe-label-1"] },
        constraints: { max_steps: 5 },
        expected_outputs: { kind: "advisory" },
        governance_findings: { policy_label: "ALLOW_WITH_APPROVAL" },
      },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.scenario.input_refs).toEqual({ sources: ["safe-label-1"] });
    expect(r.body.scenario.constraints).toEqual({ max_steps: 5 });
    expect(r.body.scenario.expected_outputs).toEqual({ kind: "advisory" });
    expect(r.body.scenario.governance_findings).toEqual({
      policy_label: "ALLOW_WITH_APPROVAL",
    });
  });
});

describe("Section 5 Wave 4 — archive (soft-delete)", () => {
  it("archives owner scenario; status=ARCHIVED + archived_at set", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "archive-1" });
    const r = await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.scenario.status).toBe("ARCHIVED");
    expect(r.body.scenario.archived_at).not.toBeNull();
    expect(r.body.already_archived).toBe(false);
    expect(typeof r.body.audit_event_id).toBe("string");
  });

  it("does NOT hard-delete the row (RULE 10)", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "rule10" });
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    const persisted = await prisma.playgroundScenario.findUnique({
      where: { scenario_id: created.scenario_id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe("ARCHIVED");
    expect(persisted!.archived_at).not.toBeNull();
  });

  it("idempotent on already-archived (returns already_archived=true, no audit row)", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "idem" });
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    const before = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
    });
    const r2 = await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r2.statusCode).toBe(200);
    expect(r2.body.already_archived).toBe(true);
    expect(r2.body.audit_event_id).toBeNull();
    const after = await prisma.auditEvent.count({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
    });
    expect(after).toBe(before);
  });

  it("404 SCENARIO_NOT_FOUND on cross-owner archive", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    const created = await createOne(callerA, { title: "owned-by-A" });
    const r = await inject(
      "DELETE",
      callerB,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r.statusCode).toBe(404);
  });
});

describe("Section 5 Wave 4 — no-leak + no-side-effect invariants", () => {
  it("create response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    const r = await inject(
      "POST",
      caller,
      "/api/v1/playground/scenarios",
      {
        title: "leak-test",
        description: "safe description with no secrets",
        input_refs: { source_capsule_label: "safe-label" },
      },
    );
    expect(r.statusCode).toBe(201);
    assertNoLeak(r.raw);
  });

  it("list response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    await createOne(caller, { title: "leak-list" });
    const r = await inject("GET", caller, "/api/v1/playground/scenarios");
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("detail response contains no forbidden no-leak markers", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "leak-detail" });
    const r = await inject(
      "GET",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    expect(r.statusCode).toBe(200);
    assertNoLeak(r.raw);
  });

  it("creates ZERO Action / ActionAttempt / Notification / OtzarConversation / MemoryCapsule / ConnectorBinding rows", async () => {
    const caller = await loginPerson();
    const before = {
      actions: await prisma.action.count(),
      attempts: await prisma.actionAttempt.count(),
      notifications: await prisma.notification.count(),
      convos: await prisma.otzarConversation.count(),
      capsules: await prisma.memoryCapsule.count(),
      bindings: await prisma.connectorBinding.count(),
    };

    const created = await createOne(caller, { title: "side-effect" });
    await inject(
      "GET",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { title: "side-effect-2" },
    );
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    await inject("GET", caller, "/api/v1/playground/scenarios");

    const after = {
      actions: await prisma.action.count(),
      attempts: await prisma.actionAttempt.count(),
      notifications: await prisma.notification.count(),
      convos: await prisma.otzarConversation.count(),
      capsules: await prisma.memoryCapsule.count(),
      bindings: await prisma.connectorBinding.count(),
    };
    expect(after.actions).toBe(before.actions);
    expect(after.attempts).toBe(before.attempts);
    expect(after.notifications).toBe(before.notifications);
    expect(after.convos).toBe(before.convos);
    expect(after.capsules).toBe(before.capsules);
    expect(after.bindings).toBe(before.bindings);
  });
});

describe("Section 5 Wave 4 — audit emission (no new literal; safe details only)", () => {
  it("emits ADMIN_ACTION + PLAYGROUND_SCENARIO_CREATED on POST", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "audit-create" });
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details["action"]).toBe("PLAYGROUND_SCENARIO_CREATED");
    expect(details["scenario_id"]).toBe(created.scenario_id);
    expect(details["owner_entity_id"]).toBe(caller.entityId);
    expect(details["status"]).toBe("DRAFT");
    // Verify NO raw payloads / title / description in the audit row.
    expect(details).not.toHaveProperty("title");
    expect(details).not.toHaveProperty("description");
    expect(details).not.toHaveProperty("goal_summary");
    expect(details).not.toHaveProperty("input_refs");
    expect(details).not.toHaveProperty("constraints");
    expect(details).not.toHaveProperty("expected_outputs");
    expect(details).not.toHaveProperty("governance_findings");
  });

  it("emits ADMIN_ACTION + PLAYGROUND_SCENARIO_UPDATED on PUT with safe details", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "audit-update" });
    await inject(
      "PUT",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
      { title: "audit-update-2", description: "secret-content-here" },
    );
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details["action"]).toBe("PLAYGROUND_SCENARIO_UPDATED");
    expect(details["scenario_id"]).toBe(created.scenario_id);
    // Verify the description text is NOT in the audit row.
    const serialized = JSON.stringify(audit!.details);
    expect(serialized).not.toContain("secret-content-here");
    expect(serialized).not.toContain("audit-update-2");
  });

  it("emits ADMIN_ACTION + PLAYGROUND_SCENARIO_ARCHIVED on DELETE", async () => {
    const caller = await loginPerson();
    const created = await createOne(caller, { title: "audit-archive" });
    await inject(
      "DELETE",
      caller,
      `/api/v1/playground/scenarios/${created.scenario_id}`,
    );
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    expect(audit).not.toBeNull();
    const details = audit!.details as Record<string, unknown>;
    expect(details["action"]).toBe("PLAYGROUND_SCENARIO_ARCHIVED");
    expect(details["scenario_id"]).toBe(created.scenario_id);
    expect(details["status"]).toBe("ARCHIVED");
  });

  it("does NOT emit any new audit literal (event_type stays ADMIN_ACTION)", async () => {
    const caller = await loginPerson();
    await createOne(caller, { title: "literal-check" });
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: caller.entityId },
      select: { event_type: true },
    });
    for (const row of rows) {
      expect(row.event_type).not.toMatch(/PLAYGROUND/);
      expect(row.event_type).not.toMatch(/SCENARIO/);
    }
  });
});

// Verify TEST_PREFIX is referenced (cleanup discipline) — silences
// "unused import" hint without compromising the cleanup helpers.
void TEST_PREFIX;
