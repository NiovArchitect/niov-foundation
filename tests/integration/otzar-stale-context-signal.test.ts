// FILE: otzar-stale-context-signal.test.ts (integration)
// PURPOSE: Section 1 Wave 4A — Otzar stale-context drift signal
//          contract coverage per ADR-0058 §9 + ADR-0045 G5.1.
//          Verifies bearer auth; self-scoped wallet derivation
//          (cross-caller wallet stale capsules NEVER counted);
//          closed-vocab signal labels (FRESH_CONTEXT /
//          STALE_CONTEXT_RISK / INSUFFICIENT_DATA); soft-deleted
//          exclusion; capsules-without-embedding excluded from
//          evaluable count; ADMIN_ACTION + DRIFT_SIGNAL_READ +
//          source_signal=STALE_CONTEXT_WALLET audit reuse (no
//          new audit literal); SAFE projection (no raw capsule
//          content / hash values / capsule IDs / per-capsule
//          attribution).

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

const TEST_JWT_SECRET = "otzar-stale-context-test-secret";
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
  // Ensure a wallet exists; createEntity does not automatically
  // create one. Look it up first; create if missing.
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
  const ip = `10.101.${Math.floor(Math.random() * 200) + 1}.${
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

async function makeCapsule(opts: {
  walletId: string;
  entityId: string;
  embeddingState: "FRESH" | "STALE" | "NEVER_EMBEDDED" | "SOFT_DELETED";
}): Promise<string> {
  const contentHash = `${TEST_PREFIX}hash-${randomUUID()}`;
  let embeddingHash: string | null;
  switch (opts.embeddingState) {
    case "FRESH":
      embeddingHash = contentHash;
      break;
    case "STALE":
      embeddingHash = `${TEST_PREFIX}stale-${randomUUID()}`;
      break;
    case "NEVER_EMBEDDED":
      embeddingHash = null;
      break;
    case "SOFT_DELETED":
      embeddingHash = contentHash; // doesn't matter; row is excluded
      break;
  }
  const capsule = await prisma.memoryCapsule.create({
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
      ...(embeddingHash !== null
        ? {
            embedding_content_hash: embeddingHash,
            embedding_generated_at: new Date(),
          }
        : {}),
      ...(opts.embeddingState === "SOFT_DELETED"
        ? { deleted_at: new Date() }
        : {}),
    },
  });
  return capsule.capsule_id;
}

async function get(
  caller: { token: string; ip: string } | null,
): Promise<{ statusCode: number; body: any; raw: string }> {
  const r = await app.inject({
    method: "GET",
    url: "/api/v1/otzar/stale-context-signal",
    headers:
      caller === null ? {} : { authorization: `Bearer ${caller.token}` },
    ...(caller === null ? {} : { remoteAddress: caller.ip }),
  });
  return { statusCode: r.statusCode, body: r.json() as any, raw: r.body };
}

describe("Section 1 Wave 4A — stale-context auth + self-scope", () => {
  it("401 SESSION_INVALID without bearer", async () => {
    const r = await get(null);
    expect(r.statusCode).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });

  it("self-scoped: caller A's stale capsules NEVER affect caller B's signal", async () => {
    const callerA = await loginPerson();
    const callerB = await loginPerson();
    // Caller A: 3 stale capsules.
    await makeCapsule({
      walletId: callerA.walletId,
      entityId: callerA.entityId,
      embeddingState: "STALE",
    });
    await makeCapsule({
      walletId: callerA.walletId,
      entityId: callerA.entityId,
      embeddingState: "STALE",
    });
    await makeCapsule({
      walletId: callerA.walletId,
      entityId: callerA.entityId,
      embeddingState: "STALE",
    });
    // Caller B: 1 fresh capsule.
    await makeCapsule({
      walletId: callerB.walletId,
      entityId: callerB.entityId,
      embeddingState: "FRESH",
    });
    const rA = await get(callerA);
    expect(rA.body.signal.label).toBe("STALE_CONTEXT_RISK");
    expect(rA.body.capsules_evaluated).toBe(3);
    expect(rA.body.stale_capsule_count).toBe(3);
    const rB = await get(callerB);
    expect(rB.body.signal.label).toBe("FRESH_CONTEXT");
    expect(rB.body.capsules_evaluated).toBe(1);
    expect(rB.body.stale_capsule_count).toBe(0);
  });
});

describe("Section 1 Wave 4A — closed-vocab signal labels", () => {
  it("INSUFFICIENT_DATA when wallet has zero evaluable capsules", async () => {
    const caller = await loginPerson();
    const r = await get(caller);
    expect(r.body.signal.label).toBe("INSUFFICIENT_DATA");
    expect(r.body.capsules_evaluated).toBe(0);
    expect(r.body.stale_capsule_count).toBe(0);
    expect(r.body.signal.honest_note).toContain("zero capsules");
  });

  it("INSUFFICIENT_DATA when all capsules are NEVER_EMBEDDED", async () => {
    const caller = await loginPerson();
    // Capsules without embeddings should NOT count as evaluable
    // per ADR-0045 G5.1 — "never embedded" is a different scenario
    // from "embedding lag".
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "NEVER_EMBEDDED",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "NEVER_EMBEDDED",
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("INSUFFICIENT_DATA");
    expect(r.body.capsules_evaluated).toBe(0);
  });

  it("FRESH_CONTEXT when ≥1 evaluable + 0 stale", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("FRESH_CONTEXT");
    expect(r.body.capsules_evaluated).toBe(2);
    expect(r.body.stale_capsule_count).toBe(0);
  });

  it("STALE_CONTEXT_RISK fires when ≥1 stale among fresh", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "STALE",
    });
    const r = await get(caller);
    expect(r.body.signal.label).toBe("STALE_CONTEXT_RISK");
    expect(r.body.capsules_evaluated).toBe(3);
    expect(r.body.stale_capsule_count).toBe(1);
  });

  it("excludes SOFT_DELETED capsules from both counts", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "SOFT_DELETED",
    });
    const r = await get(caller);
    expect(r.body.capsules_evaluated).toBe(1);
    expect(r.body.stale_capsule_count).toBe(0);
    expect(r.body.signal.label).toBe("FRESH_CONTEXT");
  });

  it("excludes NEVER_EMBEDDED from evaluable but counts FRESH+STALE accurately", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "STALE",
    });
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "NEVER_EMBEDDED",
    });
    const r = await get(caller);
    expect(r.body.capsules_evaluated).toBe(2);
    expect(r.body.stale_capsule_count).toBe(1);
    expect(r.body.signal.label).toBe("STALE_CONTEXT_RISK");
  });
});

describe("Section 1 Wave 4A — SAFE projection no-leak", () => {
  it("response NEVER includes capsule_id / content_hash / embedding_content_hash / storage_location / payload", async () => {
    const caller = await loginPerson();
    const SECRET_MARKER = "WAVE_4A_STALE_LEAK_MARKER";
    // Plant the marker as the content_hash via direct
    // construction — we want to confirm response doesn't echo
    // any hash value.
    const capsule = await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: caller.walletId,
        entity_id: caller.entityId,
        capsule_type: "PREFERENCE",
        version: 1,
        content_hash: SECRET_MARKER,
        storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
        payload_summary: SECRET_MARKER,
        payload_size_tokens: 10,
        relevance_score: 1.0,
        decay_type: "PERMANENT",
        topic_tags: [SECRET_MARKER],
        clearance_required: 0,
        ai_access_blocked: false,
        requires_validation: false,
        embedding_content_hash: `${TEST_PREFIX}stale-${randomUUID()}`,
        embedding_generated_at: new Date(),
      },
    });
    const r = await get(caller);
    expect(r.statusCode).toBe(200);
    expect(r.body.signal.label).toBe("STALE_CONTEXT_RISK");
    expect(r.raw).not.toContain(SECRET_MARKER);
    expect(r.raw).not.toContain(capsule.capsule_id);
    expect(r.raw).not.toContain("content_hash");
    expect(r.raw).not.toContain("embedding_content_hash");
    expect(r.raw).not.toContain("storage_location");
    expect(r.raw).not.toContain("payload_summary");
    expect(r.raw).not.toContain("payload_content");
    expect(r.raw).not.toContain("topic_tags");
    expect(r.raw).not.toContain("wallet_id");
  });

  it("response coaching_note + boundary_note explicitly disclaim surveillance framing", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "FRESH",
    });
    const r = await get(caller);
    expect(r.body.coaching_note).toContain("not an employee evaluation");
    expect(r.body.coaching_note).toContain("not visible to a manager");
    expect(r.body.boundary_note).toContain("not a transcript");
    expect(r.body.boundary_note).toContain("not an employee score");
    expect(r.body.boundary_note).toContain("not a manager surface");
  });
});

describe("Section 1 Wave 4A — audit reuse + no new literal", () => {
  it("emits ADMIN_ACTION with action=DRIFT_SIGNAL_READ + source_signal=STALE_CONTEXT_WALLET", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "STALE",
    });
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
      capsules_evaluated?: number;
      stale_capsule_count?: number;
    };
    expect(details.action).toBe("DRIFT_SIGNAL_READ");
    expect(details.source_signal).toBe("STALE_CONTEXT_WALLET");
    expect(details.label).toBe("STALE_CONTEXT_RISK");
    expect(details.capsules_evaluated).toBe(1);
    expect(details.stale_capsule_count).toBe(1);
  });

  it("audit details NEVER include capsule_id / content_hash / payload", async () => {
    const caller = await loginPerson();
    const SECRET = "WAVE_4A_AUDIT_LEAK_MARKER";
    await prisma.memoryCapsule.create({
      data: {
        capsule_id: randomUUID(),
        wallet_id: caller.walletId,
        entity_id: caller.entityId,
        capsule_type: "PREFERENCE",
        version: 1,
        content_hash: SECRET,
        storage_location: `${TEST_PREFIX}loc-${randomUUID()}`,
        payload_summary: SECRET,
        payload_size_tokens: 10,
        relevance_score: 1.0,
        decay_type: "PERMANENT",
        topic_tags: [SECRET],
        clearance_required: 0,
        ai_access_blocked: false,
        requires_validation: false,
        embedding_content_hash: `${TEST_PREFIX}stale-${randomUUID()}`,
        embedding_generated_at: new Date(),
      },
    });
    await get(caller);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        event_type: "ADMIN_ACTION",
        actor_entity_id: caller.entityId,
      },
      orderBy: { timestamp: "desc" },
    });
    const serialized = JSON.stringify(audit?.details ?? {});
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("content_hash");
    expect(serialized).not.toContain("storage_location");
  });

  it("zero rows with event_type containing 'STALE' or 'CONTEXT_DRIFT' across full request lifecycle", async () => {
    const caller = await loginPerson();
    await makeCapsule({
      walletId: caller.walletId,
      entityId: caller.entityId,
      embeddingState: "STALE",
    });
    await get(caller);
    const rows = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { event_type: { contains: "STALE" } },
          { event_type: { contains: "CONTEXT_DRIFT" } },
        ],
      },
      select: { event_type: true },
    });
    expect(rows).toHaveLength(0);
  });
});
