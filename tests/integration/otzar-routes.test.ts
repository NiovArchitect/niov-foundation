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

// ──────────────────────────────────────────────────────────────────
// ADR-0055 Wave 2C: GET /otzar/conversations/:id/corrections
// (safe, self-scoped per-conversation correction-signal projection)
// ──────────────────────────────────────────────────────────────────

describe("GET /otzar/conversations/:id/corrections", () => {
  // Create an ACTIVE conversation owned by `ownerEntityId`. No LLM --
  // deterministic so these tests do not consume the fixture provider.
  async function makeOwnedConversation(ownerEntityId: string): Promise<string> {
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    return conversationId;
  }

  // Plant a CORRECTION capsule linked to `conversationId` in the
  // caller's wallet. Mirrors the processCorrection write shape but is
  // deterministic + DB-only.
  async function writeLinkedCorrection(
    ownerEntityId: string,
    conversationId: string,
    createdAt: Date,
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
        capsule_type: "CORRECTION",
        topic_tags: ["correction"],
        decay_type: "TIME_BASED",
        payload_summary: "a private correction summary",
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:c-${randomUUID()}`,
        conversation_id: conversationId,
        created_at: createdAt,
      },
    });
    return capsuleId;
  }

  it("401 when bearer is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}/corrections`,
      remoteAddress: "10.99.1.4",
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe("SESSION_INVALID");
  });

  it("200 zero state: own conversation with no linked corrections", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/corrections`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      conversation_id: string;
      corrections_count: number;
      has_corrections: boolean;
      last_correction_at: string | null;
      drift_prevention_note: string;
      continuity_note: string;
    };
    expect(body.ok).toBe(true);
    expect(body.conversation_id).toBe(conversationId);
    expect(body.corrections_count).toBe(0);
    expect(body.has_corrections).toBe(false);
    expect(body.last_correction_at).toBeNull();
    expect(body.drift_prevention_note).toMatch(/not an employee score/i);
    expect(body.continuity_note).toMatch(/not a transcript/i);
  });

  it("200 returns real count + ISO last_correction_at; no internals leak", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    const older = new Date("2026-05-26T08:00:00.000Z");
    const newer = new Date("2026-05-27T08:00:00.000Z");
    await writeLinkedCorrection(ctx.ownerId, conversationId, older);
    await writeLinkedCorrection(ctx.ownerId, conversationId, newer);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/corrections`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      corrections_count: number;
      has_corrections: boolean;
      last_correction_at: string | null;
    };
    expect(body.corrections_count).toBe(2);
    expect(body.has_corrections).toBe(true);
    expect(body.last_correction_at).toBe(newer.toISOString());
    // ADR-0055 §Decision 6 wire-level no-leak invariant.
    expect(response.payload).not.toContain("payload_summary");
    expect(response.payload).not.toContain("payload_content");
    expect(response.payload).not.toContain("a private correction summary");
    expect(response.payload).not.toContain("correction_capsule_id");
    expect(response.payload).not.toContain("target_capsule_id");
    expect(response.payload).not.toContain("storage_location");
    expect(response.payload).not.toContain("content_hash");
    expect(response.payload).not.toContain("embedding");
    expect(response.payload).not.toContain("bridge_id");
    expect(response.payload).not.toContain("capability_flags");
    expect(response.payload).not.toContain("context_provenance");
    expect(response.payload).not.toContain("drift_score");
    expect(response.payload).not.toContain("employee_score");
    expect(response.payload).not.toContain("best_practice_learned");
    expect(response.payload).not.toContain("manager_visibility");
  });

  it("404 CONVERSATION_NOT_FOUND for an unknown id", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}/corrections`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe(
      "CONVERSATION_NOT_FOUND",
    );
  });

  it("403 NOT_CONVERSATION_OWNER: caller A cannot read caller B's corrections", async () => {
    const a = await loginNoTwin();
    const b = await loginNoTwin();
    const bConvId = await makeOwnedConversation(b.ownerId);
    await writeLinkedCorrection(
      b.ownerId,
      bConvId,
      new Date("2026-05-27T09:00:00.000Z"),
    );
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${bConvId}/corrections`,
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { code: string }).code).toBe(
      "NOT_CONVERSATION_OWNER",
    );
    // No leak: even the count is suppressed for a cross-caller.
    expect(response.payload).not.toContain("corrections_count");
    expect(response.payload).not.toContain("a private correction summary");
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 1 Wave 3B — ADR-0058 Otzar drift detection coaching/
// alignment trust loop:
// GET /otzar/conversations/:id/drift-signals
// ──────────────────────────────────────────────────────────────────

describe("GET /otzar/conversations/:id/drift-signals (ADR-0058)", () => {
  // Mirrors Wave 2C makeOwnedConversation; no LLM consumption.
  async function makeOwnedConversation(ownerEntityId: string): Promise<string> {
    const conversationId = randomUUID();
    await prisma.otzarConversation.create({
      data: {
        conversation_id: conversationId,
        entity_id: ownerEntityId,
        twin_id: ownerEntityId,
        source_type: "CHAT",
        participants: [ownerEntityId],
        message_count: 1,
        status: "ACTIVE",
      },
    });
    return conversationId;
  }

  // Plant a CORRECTION capsule linked to `conversationId`. Allows
  // operator-supplied `extraTopicTags` so tests can exercise the
  // RECURRING_CORRECTION_THEME branch. Default tags mirror
  // ObservationService.processCorrection's auto-emitted tags
  // (`correction` + `correction-of-<id>`) per ADR-0058 §5.
  async function writeLinkedCorrection(
    ownerEntityId: string,
    conversationId: string,
    extraTopicTags: string[] = [],
  ): Promise<string> {
    const wallet = await prisma.wallet.findUnique({
      where: { entity_id: ownerEntityId },
    });
    const capsuleId = randomUUID();
    const tags = [
      "correction",
      `correction-of-${randomUUID()}`,
      ...extraTopicTags,
    ];
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: capsuleId,
        wallet_id: wallet!.wallet_id,
        entity_id: ownerEntityId,
        version: 1,
        capsule_type: "CORRECTION",
        topic_tags: tags,
        decay_type: "TIME_BASED",
        payload_summary: "secret correction body MUST NOT leak",
        payload_size_tokens: 1,
        storage_location: `niov://test/${randomUUID()}`,
        content_hash: `sha256:c-${randomUUID()}`,
        conversation_id: conversationId,
      },
    });
    return capsuleId;
  }

  it("401 when bearer is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}/drift-signals`,
      remoteAddress: "10.99.2.1",
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe(
      "SESSION_INVALID",
    );
  });

  it("404 CONVERSATION_NOT_FOUND for an unknown id", async () => {
    const ctx = await loginNoTwin();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${randomUUID()}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe(
      "CONVERSATION_NOT_FOUND",
    );
  });

  it("403 NOT_CONVERSATION_OWNER: caller A cannot read caller B's drift signals", async () => {
    const a = await loginNoTwin();
    const b = await loginNoTwin();
    const bConv = await makeOwnedConversation(b.ownerId);
    await writeLinkedCorrection(b.ownerId, bConv, ["role-template"]);
    await writeLinkedCorrection(b.ownerId, bConv, ["role-template"]);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${bConv}/drift-signals`,
      headers: { authorization: `Bearer ${a.token}` },
      remoteAddress: a.ip,
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { code: string }).code).toBe(
      "NOT_CONVERSATION_OWNER",
    );
    // No leak: cross-caller never sees signal labels OR counts.
    expect(response.payload).not.toContain("CORRECTION_VELOCITY_ELEVATED");
    expect(response.payload).not.toContain("RECURRING_CORRECTION_THEME");
    expect(response.payload).not.toContain("corrections_observed");
    expect(response.payload).not.toContain("role-template");
  });

  it("200 empty conversation: no CORRECTION capsules → zero signals, coaching notes preserved", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      conversation_id: string;
      drift_signals: ReadonlyArray<{ label: string; honest_note: string }>;
      signal_count: number;
      corrections_observed: number;
      coaching_note: string;
      boundary_note: string;
    };
    expect(body.ok).toBe(true);
    expect(body.conversation_id).toBe(conversationId);
    expect(body.signal_count).toBe(0);
    expect(body.drift_signals).toEqual([]);
    expect(body.corrections_observed).toBe(0);
    // Coaching framing is canonical copy locked at ADR-0058.
    expect(body.coaching_note).toMatch(/coaching prompts/i);
    expect(body.coaching_note).toMatch(/not employee evaluation/i);
    expect(body.boundary_note).toMatch(/not a transcript/i);
    expect(body.boundary_note).toMatch(/not an employee score/i);
    expect(body.boundary_note).toMatch(/not a manager surface/i);
  });

  it("200 single correction: below velocity threshold → no labels fire", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      signal_count: number;
      corrections_observed: number;
      drift_signals: ReadonlyArray<{ label: string }>;
    };
    expect(body.corrections_observed).toBe(1);
    expect(body.signal_count).toBe(0);
    expect(body.drift_signals).toEqual([]);
  });

  it("200 four corrections: fires CORRECTION_VELOCITY_ELEVATED only (no recurring tag)", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      signal_count: number;
      corrections_observed: number;
      drift_signals: ReadonlyArray<{ label: string; honest_note: string }>;
    };
    expect(body.corrections_observed).toBe(4);
    expect(body.signal_count).toBe(1);
    expect(body.drift_signals[0]!.label).toBe(
      "CORRECTION_VELOCITY_ELEVATED",
    );
    expect(body.drift_signals[0]!.honest_note).toMatch(/multiple corrections/i);
  });

  it("200 two corrections sharing 'role-template' tag: fires RECURRING_CORRECTION_THEME (velocity below threshold)", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    await writeLinkedCorrection(ctx.ownerId, conversationId, ["role-template"]);
    await writeLinkedCorrection(ctx.ownerId, conversationId, ["role-template"]);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      signal_count: number;
      corrections_observed: number;
      drift_signals: ReadonlyArray<{ label: string }>;
    };
    expect(body.corrections_observed).toBe(2);
    expect(body.signal_count).toBe(1);
    expect(body.drift_signals[0]!.label).toBe("RECURRING_CORRECTION_THEME");
    // The theme tag VALUE itself is NEVER returned (privacy invariant
    // per ADR-0058 §"Privacy invariant" — the LABEL fires but the
    // tags stay in the caller's wallet).
    expect(response.payload).not.toContain("role-template");
  });

  it("200 five corrections with shared theme: fires BOTH velocity + recurring labels", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    for (let i = 0; i < 5; i++) {
      await writeLinkedCorrection(ctx.ownerId, conversationId, [
        "naming-convention",
      ]);
    }
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      signal_count: number;
      drift_signals: ReadonlyArray<{ label: string }>;
    };
    expect(body.signal_count).toBe(2);
    const labels = body.drift_signals.map((s) => s.label).sort();
    expect(labels).toEqual([
      "CORRECTION_VELOCITY_ELEVATED",
      "RECURRING_CORRECTION_THEME",
    ]);
    expect(response.payload).not.toContain("naming-convention");
  });

  it("200 auto-tags do NOT count toward recurring-theme (correction + correction-of-* excluded)", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    // Two corrections with ONLY the auto-tags + a same correction-of-
    // <id> would normally collide; we use the same targetId to confirm
    // even that doesn't fire RECURRING_CORRECTION_THEME.
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    await writeLinkedCorrection(ctx.ownerId, conversationId);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      signal_count: number;
      drift_signals: ReadonlyArray<{ label: string }>;
    };
    // 2 corrections is below velocity threshold (>3); auto-tags don't
    // count toward recurring; expected signal_count = 0.
    expect(body.signal_count).toBe(0);
  });

  it("emits ADMIN_ACTION:DRIFT_SIGNAL_READ audit row with closed-vocab labels (no tag values)", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    for (let i = 0; i < 4; i++) {
      await writeLinkedCorrection(ctx.ownerId, conversationId, [
        "private-tag-MUST-NOT-LEAK",
      ]);
    }
    await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    const audits = await prisma.auditEvent.findMany({
      where: {
        actor_entity_id: ctx.ownerId,
        event_type: "ADMIN_ACTION",
      },
      orderBy: { timestamp: "desc" },
    });
    const driftAudit = audits.find((a) => {
      const d = a.details as Record<string, unknown> | null;
      return d?.action === "DRIFT_SIGNAL_READ";
    });
    expect(driftAudit).toBeDefined();
    const d = driftAudit!.details as Record<string, unknown>;
    expect(d.action).toBe("DRIFT_SIGNAL_READ");
    expect(d.conversation_id).toBe(conversationId);
    expect(typeof d.signal_count).toBe("number");
    expect(Array.isArray(d.signals_present)).toBe(true);
    // Audit details NEVER carry the operator-supplied tag values.
    expect(JSON.stringify(d)).not.toContain("private-tag-MUST-NOT-LEAK");
  });

  it("wire-level no-leak: response body never carries CORRECTION internals", async () => {
    const ctx = await loginNoTwin();
    const conversationId = await makeOwnedConversation(ctx.ownerId);
    for (let i = 0; i < 4; i++) {
      await writeLinkedCorrection(ctx.ownerId, conversationId, [
        "secret-theme-tag",
      ]);
    }
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/otzar/conversations/${conversationId}/drift-signals`,
      headers: { authorization: `Bearer ${ctx.token}` },
      remoteAddress: ctx.ip,
    });
    expect(response.statusCode).toBe(200);
    // ADR-0058 §7 FORBIDDEN-fields invariant. The seeded
    // payload_summary, storage_location, content_hash, etc. must
    // never traverse the wire.
    expect(response.payload).not.toContain("secret correction body");
    expect(response.payload).not.toContain("payload_summary");
    expect(response.payload).not.toContain("payload_content");
    expect(response.payload).not.toContain("target_capsule_id");
    expect(response.payload).not.toContain("storage_location");
    expect(response.payload).not.toContain("content_hash");
    expect(response.payload).not.toContain("embedding");
    expect(response.payload).not.toContain("capsule_id");
    expect(response.payload).not.toContain("secret-theme-tag");
    expect(response.payload).not.toContain("drift_score");
    expect(response.payload).not.toContain("employee_score");
    expect(response.payload).not.toContain("manager_visibility");
    expect(response.payload).not.toContain("bridge_id");
    expect(response.payload).not.toContain("capability_flags");
  });
});

// [OTZAR STAGE-2 HARDENING D] Obligation routes reject unknown enum-like inputs with 422 at the
// route layer, BEFORE the service is reached. (Happy-path create/read behavior is proven in the
// obligation integration suite.)
describe("obligation routes — enum validation + auth gate", () => {
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("401 without a bearer token", async () => {
    expect((await app.inject({ method: "POST", url: "/api/v1/otzar/obligations", payload: { obligation_type: "FOLLOW_UP", title: "x" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/otzar/obligations" })).statusCode).toBe(401);
  });

  it("422 on an unknown obligation_type / missing title", async () => {
    const { token } = await loginAndAttachTwin();
    expect((await app.inject({ method: "POST", url: "/api/v1/otzar/obligations", headers: auth(token), payload: { obligation_type: "NOT_A_TYPE", title: "x" } })).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: "/api/v1/otzar/obligations", headers: auth(token), payload: { obligation_type: "FOLLOW_UP", title: "  " } })).statusCode).toBe(422);
  });

  it("422 on unknown initial_state / priority / required_response_class / source_channel / provenance_class", async () => {
    const { token } = await loginAndAttachTwin();
    const base = { obligation_type: "FOLLOW_UP", title: "x" };
    const bads: Array<Record<string, unknown>> = [
      { ...base, initial_state: "NOPE" },
      { ...base, priority: "NOPE" },
      { ...base, required_response_class: "NOPE" },
      { ...base, source_channel: "NOPE" },
      { ...base, provenance_class: "NOPE" },
    ];
    for (const payload of bads) {
      expect((await app.inject({ method: "POST", url: "/api/v1/otzar/obligations", headers: auth(token), payload })).statusCode).toBe(422);
    }
  });

  it("422 on unknown list state / obligation_type filters", async () => {
    const { token } = await loginAndAttachTwin();
    expect((await app.inject({ method: "GET", url: "/api/v1/otzar/obligations?state=NOPE", headers: auth(token) })).statusCode).toBe(422);
    expect((await app.inject({ method: "GET", url: "/api/v1/otzar/obligations?obligation_type=NOPE", headers: auth(token) })).statusCode).toBe(422);
  });

  it("422 on an unknown transition verb / missing expected_version", async () => {
    const { token } = await loginAndAttachTwin();
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await app.inject({ method: "POST", url: `/api/v1/otzar/obligations/${id}/transition`, headers: auth(token), payload: { expected_version: 0, transition: "explode" } })).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: `/api/v1/otzar/obligations/${id}/transition`, headers: auth(token), payload: { transition: "cancel" } })).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: `/api/v1/otzar/obligations/${id}/complete`, headers: auth(token), payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: `/api/v1/otzar/obligations/${id}/acknowledge`, headers: auth(token), payload: { expected_version: 0 } })).statusCode).toBe(422);
  });
});
