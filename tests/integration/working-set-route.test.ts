// FILE: working-set-route.test.ts (integration)
// PURPOSE: arc 2 WSAPI — cover the consumer-safe working-set HTTP route
//          (POST /api/v1/personalization/working-set). Proves: consumer-view-
//          only response with no raw diagnostics; fail-closed (no payload, no
//          audit) on bad session; WORKING_SET_BUILT audit on success with safe
//          counts only; PERSONALIZATION_DEGRADED audit (reason histogram only)
//          when degraded; and a route-level synthetic-DMW regression (2
//          employees + 1 twin + 1 enterprise) confirming the single-wallet
//          spine holds at the HTTP boundary (no cross-wallet / no sensitive
//          enterprise content in any consumer response). The seeding stack
//          SHARES buildApp's stores (jwtSecret/nonce/content/encryption) so
//          capsule content + sessions interoperate across the boundary.
// CONNECTS TO: apps/api/src/routes/working-set.routes.ts via buildApp +
//              @niov/database (createEntity/createPermission/prisma) + ../helpers.js.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  AuthService,
  WriteService,
  FixtureBasedEmbeddingProvider,
  MemoryNonceStore,
  MemoryContentStore,
  type LoginResult,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import { cleanupTestData, ensureAuditTriggers, makeEntityInput } from "../helpers.js";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "wsapi-route-test-secret-not-for-prod";
const TEST_KEY = randomBytes(32);
const PASSWORD = "wsapi-correct-horse-battery";
const ROUTE = "/api/v1/personalization/working-set";

let app: FastifyInstance;
let seedAuth: AuthService;
let seedWrite: WriteService;

interface Seeded {
  entity_id: string;
  token: string;
  capsule_ids: string[];
}

async function seed(
  entityType: "PERSON" | "COMPANY" | "AI_AGENT",
  walletTypeOverride: "PERSONAL" | undefined,
  capsules: Array<{
    capsule_type: string;
    topic_tags: string[];
    payload_summary: string;
    content: string;
    clearance_required?: number;
    ai_access_blocked?: boolean;
  }>,
): Promise<Seeded> {
  const input = makeEntityInput({
    entity_type: entityType,
    password: PASSWORD,
    ...(walletTypeOverride !== undefined ? { wallet_type: walletTypeOverride } : {}),
  });
  const entity = await createEntity(input);
  const login = (await seedAuth.login(input.email!, PASSWORD, ["read", "write"], {
    ip_address: null,
  })) as LoginResult;
  if (!login.ok) throw new Error(`seed login failed: ${JSON.stringify(login)}`);
  const capsule_ids: string[] = [];
  for (const c of capsules) {
    const res = await seedWrite.createCapsule(login.token, {
      capsule_type: c.capsule_type as never,
      topic_tags: c.topic_tags,
      payload_summary: c.payload_summary,
      content: c.content,
      decay_type: "FOUNDATIONAL",
      ...(c.clearance_required !== undefined ? { clearance_required: c.clearance_required } : {}),
      ...(c.ai_access_blocked !== undefined ? { ai_access_blocked: c.ai_access_blocked } : {}),
    });
    if (!res.ok) throw new Error(`seed createCapsule failed: ${JSON.stringify(res)}`);
    capsule_ids.push(res.capsule_id);
  }
  return { entity_id: entity.entity_id, token: login.token, capsule_ids };
}

async function post(token: string | null, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: ROUTE,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    payload,
  });
}

async function auditCount(entityId: string, eventType: string): Promise<number> {
  return prisma.auditEvent.count({
    where: { actor_entity_id: entityId, event_type: eventType },
  });
}

const FORBIDDEN_TOKENS = [
  "audit_intent",
  "consumer_obligations",
  "advisory",
  "disposition",
  "tokens_consumed",
  "degraded",
  "\"permissions\"",
  "\"stats\"",
  "embedding",
  "vector",
  "distance",
  "cosine",
];

let emp1: Seeded;
let emp2: Seeded;
let ent: Seeded;
let twin: Seeded;

beforeAll(async () => {
  await ensureAuditTriggers();
  await cleanupTestData();
  const sessionNonceStore = new MemoryNonceStore();
  const declarationStore = new MemoryNonceStore();
  const contentStore = new MemoryContentStore();
  const encryption = new ContentEncryption(TEST_KEY);
  app = await buildApp({
    jwtSecret: TEST_JWT_SECRET,
    sessionNonceStore,
    declarationStore,
    contentStore,
    contentEncryption: encryption,
  });
  // Seeding stack shares the SAME stores so capsule content + sessions
  // interoperate with the app's working-set route.
  seedAuth = new AuthService({ jwtSecret: TEST_JWT_SECRET, nonceStore: sessionNonceStore });
  seedWrite = new WriteService(
    seedAuth,
    declarationStore,
    contentStore,
    encryption,
    TEST_JWT_SECRET,
    new FixtureBasedEmbeddingProvider(),
  );

  emp1 = await seed("PERSON", undefined, [
    { capsule_type: "PREFERENCE", topic_tags: ["routine", "emp1"], payload_summary: "emp1 routine", content: "Emp1 starts at 09:00; deep work mornings." },
    { capsule_type: "BEHAVIORAL_PATTERN", topic_tags: ["work-style", "emp1"], payload_summary: "emp1 work style", content: "Emp1 prefers async, terse updates." },
  ]);
  emp2 = await seed("PERSON", undefined, [
    { capsule_type: "PREFERENCE", topic_tags: ["routine", "emp2"], payload_summary: "emp2 routine", content: "Emp2 EMP2-ONLY-MARKER personal note." },
  ]);
  ent = await seed("COMPANY", undefined, [
    { capsule_type: "DOMAIN_KNOWLEDGE", topic_tags: ["project", "goal"], payload_summary: "project goal", content: "Ship v2 governance API this quarter." },
    { capsule_type: "COMPLIANCE_RECORD", topic_tags: ["m&a"], payload_summary: "sensitive", content: "SENSITIVE-MA-MARKER acquiring Lattice for 42M.", clearance_required: 6, ai_access_blocked: true },
  ]);
  twin = await seed("AI_AGENT", "PERSONAL", [
    { capsule_type: "SESSION_LEARNING", topic_tags: ["twin", "ops"], payload_summary: "twin op note", content: "Twin operating note; nudge scheduling." },
  ]);
}, 300_000);

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("WSAPI route — consumer view + audit + fail-closed", () => {
  it("successful build returns a consumer view with no raw diagnostics", async () => {
    const res = await post(emp1.token, {
      request_text: "my routine and work style",
      token_budget: 2000,
      requested_context: ["entity_id", "timezone"],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body["view"]).toBe("consumer");
    const s = JSON.stringify(body);
    for (const forbidden of FORBIDDEN_TOKENS) expect(s).not.toContain(forbidden);
  });

  it("WORKING_SET_BUILT audit row is written on success with safe counts only", async () => {
    expect(await auditCount(emp1.entity_id, "WORKING_SET_BUILT")).toBeGreaterThan(0);
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: emp1.entity_id, event_type: "WORKING_SET_BUILT" },
    });
    const details = JSON.stringify(rows.map((r) => r.details));
    expect(details).toContain("domain");
    expect(details).toContain("capsules_loaded");
    for (const forbidden of ["embedding", "vector", "distance", "cosine", "request_text", "content"]) {
      expect(details).not.toContain(forbidden);
    }
  });

  it("fail-closed: missing/invalid bearer → 401, no payload, no audit", async () => {
    const before = await auditCount(emp1.entity_id, "WORKING_SET_BUILT");
    const missing = await post(null, { request_text: "x", token_budget: 100, requested_context: [] });
    expect(missing.statusCode).toBe(401);
    expect((missing.json() as { ok: boolean }).ok).toBe(false);
    const bad = await post("not-a-real-token", { request_text: "x", token_budget: 100, requested_context: [] });
    expect([401, 400]).toContain(bad.statusCode);
    expect((bad.json() as { ok: boolean }).ok).toBe(false);
    // No new WORKING_SET_BUILT rows attributable to these failed calls.
    const after = await auditCount(emp1.entity_id, "WORKING_SET_BUILT");
    expect(after).toBe(before);
  });

  it("PERSONALIZATION_DEGRADED audit fires (reason histogram only) when degraded", async () => {
    const res = await post(emp1.token, {
      request_text: "context",
      token_budget: 2000,
      // ungranted personal-only context → withheld; no profile timezone → fallback.
      requested_context: ["entity_id", "timezone", "location", "health"],
    });
    expect(res.statusCode).toBe(200);
    expect(await auditCount(emp1.entity_id, "PERSONALIZATION_DEGRADED")).toBeGreaterThan(0);
    const rows = await prisma.auditEvent.findMany({
      where: { actor_entity_id: emp1.entity_id, event_type: "PERSONALIZATION_DEGRADED" },
    });
    const details = JSON.stringify(rows.map((r) => r.details));
    expect(details).toContain("reason_histogram");
    for (const forbidden of ["embedding", "vector", "distance", "cosine", "content", "advisory"]) {
      expect(details).not.toContain(forbidden);
    }
  });
});

describe("WSAPI route — synthetic-DMW regression (single-wallet spine at the HTTP boundary)", () => {
  function capsuleIds(body: Record<string, unknown>): string[] {
    const caps = (body["capsules"] ?? []) as Array<{ capsule_id: string }>;
    return caps.map((c) => c.capsule_id);
  }

  it("an employee working set contains only that employee's own capsules (no cross-wallet, no enterprise, no sensitive)", async () => {
    const res = await post(emp1.token, {
      request_text: "routine work",
      token_budget: 4000,
      requested_context: ["entity_id"],
    });
    expect(res.statusCode).toBe(200);
    const ids = capsuleIds(res.json() as Record<string, unknown>);
    // No emp2 / enterprise / sensitive capsule ids.
    for (const foreign of [...emp2.capsule_ids, ...ent.capsule_ids]) {
      expect(ids).not.toContain(foreign);
    }
    const serialized = JSON.stringify(res.json());
    expect(serialized).not.toContain("EMP2-ONLY-MARKER");
    expect(serialized).not.toContain("SENSITIVE-MA-MARKER");
  });

  it("a twin working set contains no sensitive enterprise content", async () => {
    const res = await post(twin.token, {
      request_text: "twin ops",
      token_budget: 4000,
      requested_context: ["entity_id"],
    });
    expect(res.statusCode).toBe(200);
    const ids = capsuleIds(res.json() as Record<string, unknown>);
    for (const entId of ent.capsule_ids) expect(ids).not.toContain(entId);
    expect(JSON.stringify(res.json())).not.toContain("SENSITIVE-MA-MARKER");
  });

  it("the enterprise working set never contains employee personal content", async () => {
    const res = await post(ent.token, {
      request_text: "project",
      token_budget: 4000,
      requested_context: ["entity_id"],
    });
    expect(res.statusCode).toBe(200);
    const serialized = JSON.stringify(res.json());
    expect(serialized).not.toContain("EMP2-ONLY-MARKER");
    const ids = capsuleIds(res.json() as Record<string, unknown>);
    for (const personalId of [...emp1.capsule_ids, ...emp2.capsule_ids]) {
      expect(ids).not.toContain(personalId);
    }
  });
});
