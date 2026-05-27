// FILE: otzar-routes.test.ts (integration)
// PURPOSE: HTTP-level coverage for POST /otzar/conversation/message
//          and POST /otzar/conversation/close. Exercises the routes
//          end-to-end through buildApp's full Fastify wiring with
//          a sequenced fixture-replay LLM provider injected via
//          BuildAppConfig.otzarLLM (so no real Anthropic API calls
//          fire and assertions can hold against recorded responses).
// CONNECTS TO: buildApp, OtzarService routes, AuthService for
//              login. ADR-0014 fixture-replay via
//              makeSequencedFixtureProvider — the shared app's LLM
//              dispenses a recorded response per call across both
//              describe blocks per Track A Gate 5 Decision 6 (Drift
//              G5b-G).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildApp,
  MemoryContentStore,
  MemoryKVCache,
  MemoryNonceStore,
  MemoryRateLimitStore,
} from "@niov/api";
import { ContentEncryption } from "@niov/auth";
import { createEntity, prisma } from "@niov/database";
import {
  cleanupTestData,
  ensureAuditTriggers,
  makeEntityInput,
  makeSequencedFixtureProvider,
} from "../helpers.js";
import otzarHappyPath from "../fixtures/llm/otzar-conversation-happy-path.json";
import otzarCloseWithTopics from "../fixtures/llm/otzar-conversation-close-with-topics.json";
import type { FastifyInstance } from "fastify";

const TEST_JWT_SECRET = "otzar-routes-test-secret-do-not-use-in-prod";
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
    otzarCache: new MemoryKVCache(),
    // Sequence: test 108 consumes call #1 (happy-path); test 173
    // consumes call #2 (conduct -> happy-path) and call #3 (close
    // -> close-with-topics, JSON-shaped topic extraction).
    otzarLLM: makeSequencedFixtureProvider([
      "otzar-conversation-happy-path",
      "otzar-conversation-happy-path",
      "otzar-conversation-close-with-topics",
    ]),
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestData();
  await prisma.$disconnect();
});

async function loginAndAttachTwin(): Promise<{
  ownerId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  // Twin
  const twinInput = makeEntityInput({ entity_type: "AI_AGENT" });
  const twin = await createEntity(twinInput);
  await prisma.entityMembership.create({
    data: {
      parent_id: owner.entity_id,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  await prisma.twinConfig.create({
    data: {
      twin_id: twin.entity_id,
      autonomy_level: "APPROVAL_REQUIRED",
      is_admin_twin: false,
      role_template: null,
    },
  });
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: input.email,
      password,
      requested_operations: ["read"],
    },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const body = login.json() as { token: string };
  return { ownerId: owner.entity_id, token: body.token, ip };
}

describe("POST /otzar/conversation/message", () => {
  it("happy path returns 200 + structured response", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hello otzar" },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      response: string;
      conversation_id: string;
      context_used: number;
      tokens_consumed: number;
      transparency?: {
        retrieval_source: string;
        retrieval_status: string;
        access_limited: boolean;
        context_items_used: number;
        verification_status: string;
      };
      context_provenance?: unknown[];
    };
    expect(body.ok).toBe(true);
    // Decision 1 Option C: exact-equality against recorded fixture
    // response.text. Re-recording the fixture re-aligns this
    // assertion automatically.
    expect(body.response).toBe(otzarHappyPath.response.text);
    expect(body.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof body.tokens_consumed).toBe("number");
    expect(typeof body.context_used).toBe("number");
    // ADR-0051 Wave 1: additive transparency contract traverses the route.
    expect(body.transparency).toBeDefined();
    expect(body.transparency!.retrieval_source).toBe("COE_ASSEMBLE_CONTEXT");
    expect(body.transparency!.context_items_used).toBe(body.context_used);
    expect(body.transparency!.verification_status).toBe("NOT_ACTIVE");
    expect(Array.isArray(body.context_provenance)).toBe(true);
    // No internals leak across the wire.
    expect(response.payload).not.toContain('"content":');
    expect(response.payload).not.toContain("capsules_denied_permission");
    expect(response.payload).not.toContain("bridge_id");
    expect(response.payload).not.toContain("capability_flags");
  });

  it("rejects token_budget > 50000 with BUDGET_TOO_LARGE 422", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hi", token_budget: 60_000 },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(422);
    expect((response.json() as { code: string }).code).toBe("BUDGET_TOO_LARGE");
  });

  it("returns 413 TOKEN_BUDGET_EXCEEDED with structured detail when identity floor exceeds budget", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hi", token_budget: 5 },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(413);
    const body = response.json() as {
      ok: boolean;
      code: string;
      detail: {
        identity_floor: number;
        budget: number;
        trimmed: { L8: number; L5: number; L7: number };
      };
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("TOKEN_BUDGET_EXCEEDED");
    expect(typeof body.detail.identity_floor).toBe("number");
    expect(body.detail.budget).toBe(5);
    expect(body.detail.trimmed).toMatchObject({ L8: 0, L5: 0 });
  });
});

describe("POST /otzar/conversation/close", () => {
  it("happy path returns 200 + capsule_id + topics", async () => {
    const ctx = await loginAndAttachTwin();
    const msg = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/message",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { message: "hello" },
      remoteAddress: ctx.ip,
    });
    expect(msg.statusCode).toBe(200);
    const conv = (msg.json() as { conversation_id: string }).conversation_id;

    const close = await app.inject({
      method: "POST",
      url: "/api/v1/otzar/conversation/close",
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        conversation_id: conv,
        capsule_ids_used: [],
        // Pass conversation_history per G5b-H resolution: forces
        // extractTopics to call the LLM (instead of early-returning
        // FALLBACK on empty history). The fixture-replay then
        // exercises the parser through the recorded topics
        // response.
        conversation_history: ["user: hello", "assistant: hi"],
      },
      remoteAddress: ctx.ip,
    });
    expect(close.statusCode).toBe(200);
    const body = close.json() as {
      ok: boolean;
      capsule_id: string;
      conversation_id: string;
      topics: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.conversation_id).toBe(conv);
    expect(Array.isArray(body.topics)).toBe(true);
    // Strengthened post-G5b-I: the close call now exercises the
    // parser path against the re-recorded fixture's
    // "topics: <list>" response. Topics array is non-empty (NOT
    // the fallback ["conversation_summary"]). Position 3 of
    // makeSequencedFixtureProvider's key sequence
    // ("otzar-conversation-close-with-topics") is now
    // runtime-consumed substrate.
    expect(body.topics.length).toBeGreaterThan(0);
    expect(body.topics).not.toEqual(["conversation_summary"]);
    // Sanity-check the close-fixture import loaded correctly.
    expect(otzarCloseWithTopics.fixtureKey).toBe(
      "otzar-conversation-close-with-topics",
    );
  });
});

// WHAT: Log in a PERSON WITHOUT attaching a twin. Returns the token +
//        the owner's entity_id + the IP used (for the gateway hook).
// WHY: My Twin / Conversations tests need a twin-less and a
//      conversation-less caller; these GET routes never call the LLM,
//      so they do NOT consume the sequenced fixture provider.
async function loginNoTwin(opts?: {
  grantAdminOrg?: boolean;
}): Promise<{ ownerId: string; token: string; ip: string }> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const owner = await createEntity(input);
  if (opts?.grantAdminOrg === true) {
    // Grant can_admin_org BEFORE login so the session snapshots the
    // current (unchanged) tar_hash; the My Twin route is NOT
    // admin-gated, so this proves can_admin_org is allowed but not
    // required. (Mutating the TAR after login would invalidate the
    // session via tar_hash_mismatch.)
    await prisma.tokenAttributeRepository.update({
      where: { entity_id: owner.entity_id },
      data: { can_admin_org: true },
    });
  }
  const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: input.email, password, requested_operations: ["read"] },
    remoteAddress: ip,
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode}`);
  }
  const token = (login.json() as { token: string }).token;
  return { ownerId: owner.entity_id, token, ip };
}

// WHAT: Attach one AI_AGENT twin to an existing owner, optionally
//        pinning its child Entity.created_at for deterministic
//        oldest-active selection.
async function attachTwinTo(
  ownerEntityId: string,
  createdAt?: Date,
): Promise<string> {
  const twin = await createEntity(makeEntityInput({ entity_type: "AI_AGENT" }));
  await prisma.entityMembership.create({
    data: {
      parent_id: ownerEntityId,
      child_id: twin.entity_id,
      role_title: "Digital Twin",
      is_active: true,
    },
  });
  await prisma.twinConfig.create({
    data: {
      twin_id: twin.entity_id,
      autonomy_level: "APPROVAL_REQUIRED",
      is_admin_twin: false,
      role_template: null,
    },
  });
  if (createdAt !== undefined) {
    await prisma.entity.update({
      where: { entity_id: twin.entity_id },
      data: { created_at: createdAt },
    });
  }
  return twin.entity_id;
}

describe("GET /otzar/my-twin", () => {
  it("401 when bearer is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      remoteAddress: "10.99.1.1",
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("200 returns safe twin identity fields + single-twin metadata", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      twin: {
        twin_id: string;
        role_title: string | null;
        autonomy_mode: string;
        is_admin_twin: boolean;
        status: string;
        skills: unknown[];
        role_scope_profile?: {
          identity: { twin_id: string };
          role: { is_admin_twin: boolean };
          scope_summary: { scope_label: string };
          assistance_profile: { autonomy_mode: string };
          governance: {
            sensitive_actions_require: string;
            observation_mode: string;
          };
          continuity: { recent_conversation_count: number };
        };
      };
      has_multiple_twins: boolean;
      twin_count: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.twin.twin_id).toBe("string");
    expect(body.twin.role_title).toBe("Digital Twin");
    expect(body.twin.autonomy_mode).toBe("APPROVAL_REQUIRED");
    expect(body.twin.is_admin_twin).toBe(false);
    expect(body.twin.status).toBe("ACTIVE");
    expect(Array.isArray(body.twin.skills)).toBe(true);
    expect(body.has_multiple_twins).toBe(false);
    expect(body.twin_count).toBe(1);
    // ADR-0053 Wave 2A: role_scope_profile traverses the route.
    expect(body.twin.role_scope_profile).toBeDefined();
    expect(body.twin.role_scope_profile!.identity.twin_id).toBe(body.twin.twin_id);
    expect(typeof body.twin.role_scope_profile!.scope_summary.scope_label).toBe("string");
    expect(body.twin.role_scope_profile!.governance.sensitive_actions_require).toBe(
      "PERMISSION_POLICY_OR_APPROVAL",
    );
    expect(body.twin.role_scope_profile!.governance.observation_mode).toBe(
      "PERMISSIONED_WORK_CONTEXT_NOT_SURVEILLANCE",
    );
    expect(typeof body.twin.role_scope_profile!.continuity.recent_conversation_count).toBe("number");
    // No raw internals leak across the wire.
    expect(response.payload).not.toContain("clearance");
    expect(response.payload).not.toContain("capability_flags");
    expect(response.payload).not.toContain("bridge_id");
    expect(response.payload).not.toContain("can_share_forward");
    expect(response.payload).not.toContain("storage_location");
  });

  it("response excludes template_content, capability_flags, bridge IDs, capsule/vector internals", async () => {
    const ctx = await loginAndAttachTwin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const raw = response.payload;
    expect(raw).not.toContain("template_content");
    expect(raw).not.toContain("capability_flags");
    expect(raw).not.toContain("bridge_id");
    expect(raw).not.toContain("storage_location");
    expect(raw).not.toContain("embedding");
    expect(raw).not.toContain("content_hash");
  });

  it("404 TWIN_NOT_FOUND when caller has no twin", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe("TWIN_NOT_FOUND");
  });

  it("multiple twins: returns the deterministic oldest twin + has_multiple_twins", async () => {
    const ctx = await loginNoTwin();
    // newer twin first, then an explicitly older twin.
    await attachTwinTo(ctx.ownerId, new Date("2024-01-01T00:00:00.000Z"));
    const olderTwin = await attachTwinTo(
      ctx.ownerId,
      new Date("2000-01-01T00:00:00.000Z"),
    );
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      twin: { twin_id: string };
      has_multiple_twins: boolean;
      twin_count: number;
    };
    expect(body.twin.twin_id).toBe(olderTwin);
    expect(body.has_multiple_twins).toBe(true);
    expect(body.twin_count).toBe(2);
  });

  it("can_admin_org caller can read their own twin (admin allowed, not required)", async () => {
    const ctx = await loginNoTwin({ grantAdminOrg: true });
    await attachTwinTo(ctx.ownerId);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { ok: boolean }).ok).toBe(true);
  });

  it("self-isolation: caller A's response never carries caller B's twin", async () => {
    const a = await loginNoTwin();
    const b = await loginNoTwin();
    const aTwin = await attachTwinTo(a.ownerId);
    const bTwin = await attachTwinTo(b.ownerId);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/my-twin",
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { twin: { twin_id: string } };
    expect(body.twin.twin_id).toBe(aTwin);
    expect(response.payload).not.toContain(bTwin);
  });
});

describe("GET /otzar/conversations", () => {
  // Insert a metadata row directly (no LLM) so these tests do not
  // consume the shared sequenced fixture provider.
  async function makeConv(
    ownerEntityId: string,
    status: string,
    startedAt: Date,
  ): Promise<string> {
    const id = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: id,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status,
        started_at: startedAt,
        ...(status === "CLOSED" ? { closed_at: new Date() } : {}),
      },
    });
    return id;
  }

  it("401 when bearer is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations",
      remoteAddress: "10.99.1.2",
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("200 empty list for a caller with no conversations", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      items: unknown[];
      total: number;
      has_more: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.has_more).toBe(false);
  });

  it("lists only the caller's own conversations (self-isolation)", async () => {
    const a = await loginNoTwin();
    const b = await loginNoTwin();
    const aConv = await makeConv(a.ownerId, "ACTIVE", new Date());
    const bConv = await makeConv(b.ownerId, "ACTIVE", new Date());
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations",
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      total: number;
      items: { conversation_id: string }[];
    };
    expect(body.total).toBe(1);
    expect(body.items.map((i) => i.conversation_id)).toEqual([aConv]);
    expect(response.payload).not.toContain(bConv);
  });

  it("paginates with skip/take/has_more (newest first)", async () => {
    const ctx = await loginNoTwin();
    const c1 = await makeConv(
      ctx.ownerId,
      "ACTIVE",
      new Date("2024-01-01T00:00:00.000Z"),
    );
    const c2 = await makeConv(
      ctx.ownerId,
      "ACTIVE",
      new Date("2024-02-01T00:00:00.000Z"),
    );
    const c3 = await makeConv(
      ctx.ownerId,
      "ACTIVE",
      new Date("2024-03-01T00:00:00.000Z"),
    );
    const page1 = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?skip=0&take=2",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(page1.statusCode).toBe(200);
    const b1 = page1.json() as {
      items: { conversation_id: string }[];
      total: number;
      has_more: boolean;
    };
    expect(b1.total).toBe(3);
    expect(b1.items.map((i) => i.conversation_id)).toEqual([c3, c2]);
    expect(b1.has_more).toBe(true);
    const page2 = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?skip=2&take=2",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const b2 = page2.json() as {
      items: { conversation_id: string }[];
      has_more: boolean;
    };
    expect(b2.items.map((i) => i.conversation_id)).toEqual([c1]);
    expect(b2.has_more).toBe(false);
  });

  it("take above MAX_TAKE is clamped (no error)", async () => {
    const ctx = await loginNoTwin();
    await makeConv(ctx.ownerId, "ACTIVE", new Date());
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?take=99999",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { ok: boolean }).ok).toBe(true);
  });

  it("?status=ACTIVE returns active only; ?status=CLOSED returns closed only", async () => {
    const ctx = await loginNoTwin();
    await makeConv(ctx.ownerId, "ACTIVE", new Date());
    await makeConv(ctx.ownerId, "CLOSED", new Date());
    const active = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?status=ACTIVE",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const ab = active.json() as {
      total: number;
      items: { status: string }[];
    };
    expect(ab.total).toBe(1);
    expect(ab.items.every((i) => i.status === "ACTIVE")).toBe(true);
    const closed = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?status=CLOSED",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const cb = closed.json() as {
      total: number;
      items: { status: string }[];
    };
    expect(cb.total).toBe(1);
    expect(cb.items.every((i) => i.status === "CLOSED")).toBe(true);
  });

  it("invalid ?status returns 400 INVALID_STATUS", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations?status=BOGUS",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { code: string }).code).toBe("INVALID_STATUS");
  });

  it("response is metadata-only (no transcript/message/conversation_history/capsule fields)", async () => {
    const ctx = await loginNoTwin();
    await makeConv(ctx.ownerId, "ACTIVE", new Date());
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/otzar/conversations",
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const raw = response.payload;
    expect(raw).not.toContain("conversation_history");
    expect(raw).not.toContain("transcript");
    expect(raw).not.toContain("participants");
    expect(raw).not.toContain("payload_summary");
    expect(raw).not.toContain("storage_location");
    const body = response.json() as {
      items: Record<string, unknown>[];
    };
    expect(Object.keys(body.items[0]!).sort()).toEqual([
      "closed_at",
      "conversation_id",
      "message_count",
      "source_type",
      "started_at",
      "status",
      "twin_id",
    ]);
  });
});

describe("GET /otzar/conversations/:id", () => {
  // Build a CLOSED conversation linked to a CONVERSATION_LEARNING summary
  // capsule directly (no LLM) so these tests do not consume the sequenced
  // fixture provider.
  async function makeClosedWithSummary(
    ownerEntityId: string,
    summary: string,
    topics: string[],
  ): Promise<string> {
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const capsuleId = randomUUID();
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: capsuleId,
        wallet_id: wallet!.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CONVERSATION_LEARNING",
        topic_tags: topics,
        decay_type: "TIME_BASED",
        payload_summary: summary,
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:cl-${randomUUID()}`,
      },
    });
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 3,
        status: "CLOSED",
        closed_at: new Date(),
        summary_capsule_id: capsuleId,
      },
    });
    return conversationId;
  }

  it("401 when bearer is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}`,
      remoteAddress: "10.99.1.3",
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("200 SUMMARY_AVAILABLE returns metadata + summary + topics; no internals leak", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeClosedWithSummary(
      ctx.ownerId,
      "Conversation closed; topics: roadmap, hiring",
      ["roadmap", "hiring"],
    );
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      conversation: {
        conversation_id: string;
        status: string;
        summary: string | null;
        topics: string[];
        summary_available: boolean;
        detail_availability: string;
        transparency_available: boolean;
        continuity_note: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.conversation.conversation_id).toBe(conversationId);
    expect(body.conversation.detail_availability).toBe("SUMMARY_AVAILABLE");
    expect(body.conversation.summary).toBe(
      "Conversation closed; topics: roadmap, hiring",
    );
    expect(body.conversation.topics).toEqual(["roadmap", "hiring"]);
    expect(body.conversation.summary_available).toBe(true);
    expect(body.conversation.transparency_available).toBe(false);
    expect(body.conversation.continuity_note).toMatch(/not retained in Wave 2B/i);
    // No raw internals across the wire. ("transcript" intentionally appears
    // in continuity_note ("not a transcript") — not banned here.)
    expect(response.payload).not.toContain("storage_location");
    expect(response.payload).not.toContain("content_hash");
    expect(response.payload).not.toContain("context_provenance");
    expect(response.payload).not.toContain("bridge_id");
    expect(response.payload).not.toContain("capability_flags");
    expect(response.payload).not.toContain("embedding");
  });

  it("404 CONVERSATION_NOT_FOUND for an unknown id", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe(
      "CONVERSATION_NOT_FOUND",
    );
  });

  it("403 NOT_CONVERSATION_OWNER: caller A cannot read caller B's conversation", async () => {
    const a = await loginNoTwin();
    const b = await loginNoTwin();
    const conversationId = await makeClosedWithSummary(
      b.ownerId,
      "B's private close summary",
      ["confidential"],
    );
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}`,
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { code: string }).code).toBe(
      "NOT_CONVERSATION_OWNER",
    );
    expect(response.payload).not.toContain("B's private close summary");
  });
});
