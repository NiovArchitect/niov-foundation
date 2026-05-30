// FILE: otzar-drift-rollup.test.ts (integration)
// PURPOSE: Section 1 Wave 4C — Otzar cross-conversation drift
//          rollup contract coverage per ADR-0058 §9 + Founder
//          Wave 4C direction.

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

const TEST_JWT_SECRET = "otzar-drift-rollup-test-secret";
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
  walletId: string;
  token: string;
  ip: string;
}> {
  const password = "correct-horse-battery";
  const input = makeEntityInput({ entity_type: "PERSON", password });
  const entity = await createEntity(input);
  let wallet = await prisma.wallet.findUnique({
    where: { entity_id: entity.entity_id },
  });
  if (wallet === null) {
    wallet = await prisma.wallet.create({
      data: {
        wallet_id: randomUUID(),
        entity_id: entity.entity_id,
        wallet_type: "PERSONAL",
        niov_can_access_contents: false,
      },
    });
  }
  const ip = `10.102.${Math.floor(Math.random() * 200) + 1}.${
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
  return {
    entityId: entity.entity_id,
    walletId: wallet.wallet_id,
    token: body.token,
    ip,
  };
}

async function makeConversation(opts: { entityId: string }): Promise<string> {
  const conv = await prisma.otzarConversation.create({
    data: {
      conversation_id: randomUUID(),
      entity_id: opts.entityId,
      twin_id: opts.entityId,
      source_type: "CHAT",
    },
  });
  return conv.conversation_id;
}

async function makeCorrection(opts: {
  walletId: string;
  entityId: string;
  conversationId: string;
}): Promise<void> {
  await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: opts.walletId,
      entity_id: opts.entityId,
      capsule_type: "CORRECTION",
      version: 1,
      content_hash: `${TEST_PREFIX}hash-${randomUUID()}`,
      storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
      payload_summary: `${TEST_PREFIX}summary`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
      conversation_id: opts.conversationId,
    },
  });
}

async function makeStaleCapsule(opts: {
  walletId: string;
  entityId: string;
}): Promise<void> {
  const contentHash = `${TEST_PREFIX}hash-${randomUUID()}`;
  await prisma.memoryCapsule.create({
    data: {
      capsule_id: randomUUID(),
      wallet_id: opts.walletId,
      entity_id: opts.entityId,
      capsule_type: "PREFERENCE",
      version: 1,
      content_hash: contentHash,
      storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
      payload_summary: `${TEST_PREFIX}summary`,
      payload_size_tokens: 10,
      relevance_score: 1.0,
      decay_type: "PERMANENT",
      topic_tags: [],
      clearance_required: 0,
      ai_access_blocked: false,
      requires_validation: false,
      embedding_content_hash: `${TEST_PREFIX}stale-${randomUUID()}`,
      embedding_generated_at: new Date(),
    },
  });
}

async function get(
  caller: { token: string; ip: string } | null,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: "/api/v1/otzar/drift-rollup",
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

describe("Section 1 Wave 4C — auth + self-scope", () => {
  it("401 without bearer", async () => {
    const r = await get(null);
    expect(r.statusCode).toBe(401);
  });

  it("self-scoped: caller A's conversations NEVER affect caller B's rollup", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    // Caller A: 1 conversation with 5 corrections (elevated)
    const convA = await makeConversation({ entityId: callerA.entityId });
    for (let i = 0; i < 5; i++) {
      await makeCorrection({
        walletId: callerA.walletId,
        entityId: callerA.entityId,
        conversationId: convA,
      });
    }
    // Caller B: no conversations
    const rB = await get(callerB);
    expect(rB.body.conversations_evaluated).toBe(0);
    expect(rB.body.conversations_with_elevated_velocity).toBe(0);
    expect(rB.body.signal.label).toBe("INSUFFICIENT_DATA");
  });
});

describe("Section 1 Wave 4C — closed-vocab posture labels", () => {
  it("INSUFFICIENT_DATA when zero conversations + zero evaluable capsules", async () => {
    const caller = await loginPerson();
    const r = await get(caller);
    expect(r.body.signal.label).toBe("INSUFFICIENT_DATA");
    expect(r.body.conversations_evaluated).toBe(0);
    expect(r.body.capsules_evaluated).toBe(0);
  });

  it("NORMAL when conversations exist but none elevated + no stale", async () => {
    const caller = await loginPerson();
    const conv = await makeConversation({ entityId: caller.entityId });
    // 2 corrections = below velocity threshold (>3)
    await makeCorrection({
      walletId: caller.walletId,
      entityId: caller.entityId,
      conversationId: conv,
    });
    await makeCorrection({
      walletId: caller.walletId,
      entityId: caller.entityId,
      conversationId: conv,
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("NORMAL");
    expect(r.body.conversations_evaluated).toBe(1);
    expect(r.body.conversations_with_elevated_velocity).toBe(0);
  });

  it("AT_RISK when ≥1 conversation has elevated velocity", async () => {
    const caller = await loginPerson();
    const conv = await makeConversation({ entityId: caller.entityId });
    // 4 corrections fires CORRECTION_VELOCITY_ELEVATED (threshold=3; >3)
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: conv,
      });
    }
    const r = await get(caller);
    expect(r.body.signal.label).toBe("AT_RISK");
    expect(r.body.conversations_evaluated).toBe(1);
    expect(r.body.conversations_with_elevated_velocity).toBe(1);
  });

  it("AT_RISK when ≥1 stale capsule (no conversation needed)", async () => {
    const caller = await loginPerson();
    await makeStaleCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("AT_RISK");
    expect(r.body.capsules_evaluated).toBe(1);
    expect(r.body.stale_capsule_count).toBe(1);
  });

  it("AT_RISK when both elevated velocity + stale capsule", async () => {
    const caller = await loginPerson();
    const conv = await makeConversation({ entityId: caller.entityId });
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: conv,
      });
    }
    await makeStaleCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("AT_RISK");
    expect(r.body.conversations_with_elevated_velocity).toBe(1);
    expect(r.body.stale_capsule_count).toBe(1);
  });

  it("counts multiple conversations + reports each elevated independently", async () => {
    const caller = await loginPerson();
    const convA = await makeConversation({ entityId: caller.entityId });
    const convB = await makeConversation({ entityId: caller.entityId });
    const convC = await makeConversation({ entityId: caller.entityId });
    // A elevated, B normal, C elevated
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: convA,
      });
    }
    await makeCorrection({
      walletId: caller.walletId,
      entityId: caller.entityId,
      conversationId: convB,
    });
    for (let i = 0; i < 5; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: convC,
      });
    }
    const r = await get(caller);
    expect(r.body.conversations_evaluated).toBe(3);
    expect(r.body.conversations_with_elevated_velocity).toBe(2);
    expect(r.body.signal.label).toBe("AT_RISK");
  });
});

describe("Section 1 Wave 4C — SAFE projection no-leak", () => {
  it("response NEVER includes conversation_id / capsule_id / hash values / payload", async () => {
    const caller = await loginPerson();
    const conv = await makeConversation({ entityId: caller.entityId });
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: conv,
      });
    }
    const r = await get(caller);
    expect(r.statusCode).toBe(200);
    expect(r.raw).not.toContain(conv);
    expect(r.raw).not.toContain("conversation_id");
    expect(r.raw).not.toContain("capsule_id");
    expect(r.raw).not.toContain("content_hash");
    expect(r.raw).not.toContain("embedding_content_hash");
    expect(r.raw).not.toContain("storage_location");
    expect(r.raw).not.toContain("payload_summary");
    expect(r.raw).not.toContain("payload_content");
    expect(r.raw).not.toContain("topic_tags");
    expect(r.raw).not.toContain("wallet_id");
  });

  it("coaching + boundary notes explicitly disclaim surveillance framing", async () => {
    const caller = await loginPerson();
    const r = await get(caller);
    expect(r.body.coaching_note).toContain("not an employee evaluation");
    expect(r.body.coaching_note).toContain("not visible to a manager");
    expect(r.body.boundary_note).toContain("not a transcript");
    expect(r.body.boundary_note).toContain("not an employee score");
    expect(r.body.boundary_note).toContain("not a cross-employee comparison");
  });
});

describe("Section 1 Wave 4C — audit reuse + no new literal", () => {
  it("emits ADMIN_ACTION + DRIFT_SIGNAL_READ + source_signal=CROSS_CONVERSATION_ROLLUP", async () => {
    const caller = await loginPerson();
    const conv = await makeConversation({ entityId: caller.entityId });
    for (let i = 0; i < 4; i++) {
      await makeCorrection({
        walletId: caller.walletId,
        entityId: caller.entityId,
        conversationId: conv,
      });
    }
    await get(caller);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const details = audit?.details as {
      action?: string;
      source_signal?: string;
      label?: string;
      conversations_evaluated?: number;
      conversations_with_elevated_velocity?: number;
    };
    expect(details.action).toBe("DRIFT_SIGNAL_READ");
    expect(details.source_signal).toBe("CROSS_CONVERSATION_ROLLUP");
    expect(details.label).toBe("AT_RISK");
    expect(details.conversations_evaluated).toBe(1);
    expect(details.conversations_with_elevated_velocity).toBe(1);
  });

  it("zero rows with event_type containing 'ROLLUP' or 'CROSS_CONV'", async () => {
    const caller = await loginPerson();
    await get(caller);
    const rows = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { event_type: { contains: "ROLLUP" } },
          { event_type: { contains: "CROSS_CONV" } },
        ],
      },
      select: { event_type: true },
    });
    expect(rows).toHaveLength(0);
  });
});
